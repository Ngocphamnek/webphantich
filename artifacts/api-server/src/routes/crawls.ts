import { Router } from "express";
import { db, crawlsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import puppeteer from "puppeteer";
import {
  StartCrawlBody,
  GetCrawlParams,
  DeleteCrawlParams,
} from "@workspace/api-zod";

const router = Router();

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ─── Browser crawl (JS-capable, clicks expand buttons, takes screenshot) ─────
async function fetchPageWithBrowser(url: string): Promise<{
  html: string;
  usedBrowser: boolean;
  screenshotBase64: string | null;
}> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

    const expandSelectors = [
      "[aria-expanded='false']",
      "button[class*='expand']",
      "button[class*='more']",
      "button[class*='detail']",
      "button[class*='show']",
      "[class*='accordion'] button",
      "[class*='collapse'] button",
      "details:not([open]) summary",
      "button[class*='toggle']",
      ".read-more",
      ".show-more",
      ".load-more",
    ];

    for (const selector of expandSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const el of elements.slice(0, 10)) {
          await el.click().catch(() => {});
        }
      } catch { /* skip */ }
    }

    await new Promise((r) => setTimeout(r, 1500));

    const html = await page.content();

    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: false,
    });
    const screenshotBase64 = Buffer.from(screenshotBuffer).toString("base64");

    return { html, usedBrowser: true, screenshotBase64 };
  } finally {
    await browser?.close();
  }
}

// ─── Remote browser click + screenshot ───────────────────────────────────────
async function browserRemoteClick(url: string, xPercent: number, yPercent: number): Promise<{
  screenshot: string;
  finalUrl: string;
}> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });

    const x = Math.round((xPercent / 100) * 1280);
    const y = Math.round((yPercent / 100) * 800);

    await Promise.all([
      page.mouse.click(x, y),
      page.waitForNavigation({ timeout: 4000, waitUntil: "networkidle2" }).catch(() => {}),
    ]);
    await new Promise((r) => setTimeout(r, 1000));

    const finalUrl = page.url();
    const buf = await page.screenshot({ type: "jpeg", quality: 78, fullPage: false });
    return { screenshot: Buffer.from(buf).toString("base64"), finalUrl };
  } finally {
    await browser.close();
  }
}

// ─── Live screenshot only (no click) ─────────────────────────────────────────
async function browserLiveScreenshot(url: string): Promise<{ screenshot: string; finalUrl: string }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });
    const finalUrl = page.url();
    const buf = await page.screenshot({ type: "jpeg", quality: 80, fullPage: false });
    return { screenshot: Buffer.from(buf).toString("base64"), finalUrl };
  } finally {
    await browser.close();
  }
}

// ─── Fallback: plain HTTP fetch ───────────────────────────────────────────────
async function fetchPageHttp(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return response.text();
}

// ─── Meta tag extraction ──────────────────────────────────────────────────────
function extractMetaTags(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const meta: Record<string, string> = {};
  $("meta").each((_, el) => {
    const name =
      $(el).attr("name") || $(el).attr("property") || $(el).attr("http-equiv");
    const content = $(el).attr("content");
    if (name && content) meta[name] = content;
  });
  const canonical = $("link[rel='canonical']").attr("href");
  if (canonical) meta["canonical"] = canonical;
  return meta;
}

// ─── Tech stack detection ─────────────────────────────────────────────────────
function detectTechStack(html: string, url: string): string[] {
  const tech: string[] = [];

  const patterns: [string, RegExp][] = [
    ["React", /react(?:\.min)?\.js|react-dom|__react|_reactFiber/i],
    ["Vue.js", /vue(?:\.min)?\.js|vue\.global|__vue/i],
    ["Angular", /angular(?:\.min)?\.js|ng-version/i],
    ["Next.js", /__next|next\/static|_next\/static/i],
    ["Nuxt.js", /nuxt|__nuxt/i],
    ["Svelte", /svelte|__svelte/i],
    ["jQuery", /jquery(?:\.min)?\.js|jquery-\d/i],
    ["Bootstrap", /bootstrap(?:\.min)?\.(?:js|css)/i],
    ["Tailwind CSS", /tailwind(?:css)?(?:\.min)?\.css|tailwindcss/i],
    ["WordPress", /wp-content|wp-includes/i],
    ["Shopify", /shopify|myshopify\.com/i],
    ["Telegram Web App", /telegram-web-app|tgwebapp|tgWebApp/i],
    ["Vite", /@vite\/client|vite\/dist/i],
    ["Webpack", /__webpack_require__|webpackChunk/i],
    ["TypeScript", /\.ts\b.*type="module"|typescript/i],
    ["GraphQL", /graphql|__typename/i],
    ["Firebase", /firebase|firebaseapp\.com/i],
    ["Stripe", /js\.stripe\.com/i],
    ["Google Analytics", /google-analytics\.com\/analytics|gtag\/js/i],
    ["Google Tag Manager", /googletagmanager\.com\/gtm/i],
    ["Font Awesome", /font-awesome|fontawesome/i],
    ["Axios", /axios(?:\.min)?\.js/i],
    ["PHP", /\.php\b|\?php/i],
    ["Python/Django", /django|csrfmiddlewaretoken/i],
    ["Python/Flask", /flask|werkzeug/i],
    ["Ruby on Rails", /rails|csrf-token.*rails/i],
    ["Laravel", /laravel|_token.*csrf/i],
    ["ASP.NET", /asp\.net|__VIEWSTATE/i],
    ["Java/Spring", /springframework|jsessionid/i],
    ["Go", /go\.sum|gorilla/i],
    ["Rust", /wasm-bindgen|actix/i],
  ];

  for (const [name, pattern] of patterns) {
    if (pattern.test(html) || pattern.test(url)) tech.push(name);
  }

  const generator = html.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i
  );
  if (generator?.[1]) tech.push(generator[1].trim());

  return [...new Set(tech)];
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────
function parseHtml(html: string, baseUrl: string) {
  const $ = cheerio.load(html);
  const title = $("title").text().trim() || $("h1").first().text().trim() || "";

  const $text = cheerio.load(html);
  $text("script, style, noscript, nav, footer, header, aside, [hidden]").remove();
  const pageText = $text("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);

  const links: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim().slice(0, 100);
    if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
      try {
        links.push({ href: new URL(href, baseUrl).href, text });
      } catch { /* skip */ }
    }
  });

  const images: string[] = [];
  $("img[src], img[data-src]").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (src) {
      try {
        images.push(new URL(src, baseUrl).href);
      } catch { /* skip */ }
    }
  });

  const styleContent: string[] = [];
  $("style").each((_, el) => { styleContent.push($(el).html() || ""); });
  $("[style]").each((_, el) => { styleContent.push($(el).attr("style") || ""); });
  const cssSnippet = styleContent.join("\n").slice(0, 3000);

  return {
    title,
    pageText,
    links: links.slice(0, 50),
    images: images.slice(0, 30),
    cssSnippet,
  };
}

// ─── Gemini helper ────────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<string> {
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 8192 },
  });
  return response.text ?? "";
}

// ─── AI analysis (Vietnamese) ─────────────────────────────────────────────────
async function analyzeWithAI(
  url: string,
  title: string,
  pageText: string,
  metaTags: Record<string, string>,
  techStack: string[],
  links: { href: string; text: string }[],
  images: string[],
  usedBrowser: boolean
): Promise<string> {
  const metaSnippet = Object.entries(metaTags)
    .slice(0, 20)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  const prompt = `Bạn là một chuyên gia phân tích tình báo web cấp cao. Bạn vừa xâm nhập và quét toàn bộ trang web mục tiêu. Hãy viết một báo cáo tình báo chi tiết và toàn diện **hoàn toàn bằng tiếng Việt**.

## MỤC TIÊU
URL: ${url}
Tiêu đề: ${title}
Công nghệ phát hiện: ${techStack.length ? techStack.join(", ") : "Không xác định"}
Phương thức crawl: ${usedBrowser ? "Trình duyệt headless (JavaScript đã thực thi, các nút đã được bấm)" : "HTTP thông thường"}

## DỮ LIỆU META
${metaSnippet || "(không có)"}

## NỘI DUNG TRANG
${pageText.slice(0, 6000)}

## LIÊN KẾT TÌM THẤY (${links.length})
${links.slice(0, 20).map((l) => `  - ${l.text || "(không có chữ)"}: ${l.href}`).join("\n")}

## HÌNH ẢNH TÌM THẤY
${images.slice(0, 10).join("\n  ") || "(không có)"}

---

Viết báo cáo đầy đủ với các mục sau (dùng tiếng Việt):

### 🎯 Tóm tắt nhiệm vụ
Tổng quan ngắn gọn về trang web và mục đích của nó.

### 🔍 Phân tích nội dung chuyên sâu
Phân tích chi tiết toàn bộ nội dung văn bản tìm thấy. Thông tin gì được trình bày? Giọng điệu và mục đích là gì?

### 🧩 Hồ sơ kỹ thuật
Phân tích công nghệ, kiến trúc và cách trang được xây dựng. Các chi tiết kỹ thuật đáng chú ý.

### 🔗 Phân tích liên kết
Các liên kết dẫn đến đâu? Có mẫu nào đặc biệt không? Điểm đến đáng chú ý?

### 🖼️ Tài sản hình ảnh
Phân tích hình ảnh và media tìm thấy.

### 🎭 Hồ sơ SEO & Mạng xã hội
Phân tích meta tags — tối ưu SEO, Open Graph, Twitter Card, v.v.

### ⚠️ Quan sát đặc biệt
Bất kỳ điều gì bất thường, đáng ngờ, thú vị hoặc cần lưu ý về trang này.

### 📊 Đánh giá tổng thể
Kết luận cuối cùng: mục đích, đối tượng, mức độ tin cậy và ấn tượng tổng thể.

Hãy cụ thể, phân tích kỹ lưỡng và toàn diện. Dùng định dạng markdown.`;

  try {
    return await callGemini(prompt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
      return "[Phân tích AI không khả dụng — Gemini đã hết hạn mức. Vui lòng thử lại sau. Dữ liệu trang đã được lưu thành công.]";
    }
    return `[Phân tích AI thất bại: ${msg}]`;
  }
}

// ─── Clone generation ─────────────────────────────────────────────────────────
async function generateClone(
  url: string,
  title: string,
  html: string,
  cssSnippet: string
): Promise<string> {
  const prompt = `Bạn là một frontend developer và chuyên gia reverse-engineer UI hàng đầu thế giới. Nhiệm vụ của bạn là phân tích HTML nguồn của trang web sau và tạo ra một bản sao HTML tĩnh, hoàn chỉnh, tái hiện giao diện của trang.

URL MỤC TIÊU: ${url}
TIÊU ĐỀ: ${title}

HTML NGUỒN:
\`\`\`html
${html.slice(0, 8000)}
\`\`\`

CSS TÌM THẤY:
\`\`\`css
${cssSnippet}
\`\`\`

Tạo một file HTML hoàn chỉnh, tự chứa (self-contained) tái hiện giao diện trang này một cách trung thực nhất có thể. Yêu cầu:
- File HTML duy nhất với toàn bộ CSS trong thẻ <style>
- Dùng cùng bảng màu, font chữ và cấu trúc layout đã phát hiện
- Thêm banner nhỏ ở đầu: "🤖 AI Clone — Tạo bởi AI Web Scout"
- KHÔNG bao gồm JavaScript (chỉ HTML/CSS tĩnh)
- CHỈ trả về code HTML thô, không giải thích, không markdown — bắt đầu bằng <!DOCTYPE html>`;

  try {
    const result = await callGemini(prompt);
    return result
      .replace(/^```html\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<html><body style="font-family:monospace;padding:2rem;background:#111;color:#0ff"><p>Tạo clone thất bại: ${msg}</p></body></html>`;
  }
}

// ─── Interaction script injected into clone HTML ──────────────────────────────
function buildInteractionScript(crawlId: number): string {
  return `<script>
(function() {
  var CRAWL_ID = ${crawlId};

  function capturePageState() {
    var parts = [];
    var modals = document.querySelectorAll('[class*="modal"],[class*="dialog"],[class*="popup"],[role="dialog"],[role="alertdialog"]');
    modals.forEach(function(m) {
      var t = (m.innerText || '').trim().slice(0, 200);
      if (t) parts.push('[Popup]: ' + t);
    });
    var alerts = document.querySelectorAll('[class*="alert"],[class*="toast"],[class*="notification"],[class*="snack"],[class*="error"],[class*="success"]');
    alerts.forEach(function(a) {
      var t = (a.innerText || '').trim().slice(0, 200);
      if (t) parts.push('[Thông báo]: ' + t);
    });
    if (parts.length === 0) {
      parts.push(document.body.innerText.trim().slice(0, 400));
    }
    return parts.join('\\n').slice(0, 600);
  }

  function postToParent(msg) {
    try { window.parent.postMessage(msg, '*'); } catch(e) {}
  }

  document.addEventListener('click', function(e) {
    var target = e.target;
    e.preventDefault();
    e.stopPropagation();

    var tag = (target.tagName || 'unknown').toLowerCase();
    var text = (target.innerText || target.alt || target.placeholder || target.value || '').trim().slice(0, 200);
    var href = target.href || (target.closest && target.closest('a') ? target.closest('a').href : '') || '';
    var src = target.src || '';
    var eventId = Date.now() + '-' + Math.random().toString(36).slice(2, 6);

    postToParent({ type: 'scout_action', eventId: eventId, action: 'click', elementTag: tag, elementText: text, elementHref: href || null, elementSrc: src || null });

    setTimeout(function() {
      var pageStateAfter = capturePageState();
      fetch('/api/crawls/' + CRAWL_ID + '/interact', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ elementTag: tag, elementText: text, elementHref: href || undefined, elementSrc: src || undefined, pageStateAfter: pageStateAfter })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) { postToParent({ type: 'scout_response', eventId: eventId, response: data.response || '' }); })
      .catch(function(err) { postToParent({ type: 'scout_response', eventId: eventId, response: '[Lỗi: ' + err.message + ']' }); });
    }, 700);
  }, true);

  var typeTimer;
  document.addEventListener('input', function(e) {
    clearTimeout(typeTimer);
    typeTimer = setTimeout(function() {
      var target = e.target;
      var tag = (target.tagName || 'input').toLowerCase();
      var label = target.placeholder || target.name || target.id || 'ô nhập';
      var val = (target.value || '').slice(0, 100);
      postToParent({ type: 'scout_action', eventId: Date.now() + '-type', action: 'type', elementTag: tag, elementText: 'Nhập "' + val + '" vào: ' + label, elementHref: null, elementSrc: null });
    }, 800);
  }, true);

  var scrollTimer;
  document.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      var maxScroll = document.body.scrollHeight - window.innerHeight;
      var pct = maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 0;
      postToParent({ type: 'scout_action', eventId: Date.now() + '-scroll', action: 'scroll', elementTag: 'page', elementText: 'Cuộn xuống ' + pct + '%', elementHref: null, elementSrc: null });
    }, 600);
  }, true);

  postToParent({ type: 'scout_ready' });
})();
</script>`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function serializeCrawl(crawl: typeof crawlsTable.$inferSelect) {
  const { screenshot, ...rest } = crawl;
  return { ...rest, hasScreenshot: screenshot !== null && screenshot !== undefined && screenshot.length > 0 };
}

// GET /crawls
router.get("/", async (req, res) => {
  try {
    const crawls = await db
      .select()
      .from(crawlsTable)
      .orderBy(desc(crawlsTable.createdAt))
      .limit(100);
    res.json(crawls.map(serializeCrawl));
  } catch (err) {
    req.log.error({ err }, "Failed to list crawls");
    res.status(500).json({ error: "Failed to list crawls" });
  }
});

// GET /crawls/stats
router.get("/stats", async (req, res) => {
  try {
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(crawlsTable);
    const domains = await db
      .select({ url: crawlsTable.url })
      .from(crawlsTable)
      .orderBy(desc(crawlsTable.createdAt))
      .limit(200);
    const domainSet = new Set(
      domains.map((d) => { try { return new URL(d.url).hostname; } catch { return d.url; } })
    );
    const avgResult = await db
      .select({ avg: sql<number>`coalesce(avg(links_found), 0)` })
      .from(crawlsTable)
      .where(eq(crawlsTable.status, "success"));
    res.json({
      totalCrawls: Number(total?.count ?? 0),
      uniqueDomains: domainSet.size,
      averageLinks: Math.round(Number(avgResult[0]?.avg ?? 0)),
      recentDomains: Array.from(domainSet).slice(0, 5),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// POST /crawls
router.post("/", async (req, res) => {
  const parsed = StartCrawlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { url } = parsed.data;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Only HTTP/HTTPS");
  } catch {
    res.status(400).json({ error: "URL không hợp lệ. Vui lòng thêm http:// hoặc https://" });
    return;
  }

  const [crawl] = await db.insert(crawlsTable).values({ url, status: "pending" }).returning();

  try {
    let html: string;
    let usedBrowser = false;
    let screenshotBase64: string | null = null;
    try {
      const result = await fetchPageWithBrowser(url);
      html = result.html;
      usedBrowser = result.usedBrowser;
      screenshotBase64 = result.screenshotBase64;
    } catch {
      html = await fetchPageHttp(url);
    }

    const { title, pageText, links, images, cssSnippet } = parseHtml(html, url);
    const metaTags = extractMetaTags(html);
    const techStack = detectTechStack(html, url);

    const [aiSummary, clonedHtml] = await Promise.all([
      analyzeWithAI(url, title, pageText, metaTags, techStack, links, images, usedBrowser),
      generateClone(url, title, html, cssSnippet),
    ]);

    const [updated] = await db
      .update(crawlsTable)
      .set({
        title,
        status: "success",
        pageText: pageText.slice(0, 10000),
        aiSummary,
        linksFound: links.length,
        imagesFound: images.length,
        links: JSON.stringify(links),
        images: JSON.stringify(images),
        metaTags: JSON.stringify(metaTags),
        techStack: JSON.stringify(techStack),
        clonedHtml,
        screenshot: screenshotBase64,
      })
      .where(eq(crawlsTable.id, crawl.id))
      .returning();

    res.status(201).json(serializeCrawl(updated));
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err, url }, "Crawl failed");
    const [updated] = await db
      .update(crawlsTable)
      .set({ status: "error", errorMessage })
      .where(eq(crawlsTable.id, crawl.id))
      .returning();
    res.status(201).json(serializeCrawl(updated));
  }
});

// POST /api/crawls/:id/live-screenshot
router.post("/:id/live-screenshot", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [crawlRecord] = await db.select().from(crawlsTable).where(eq(crawlsTable.id, id));
  if (!crawlRecord) { res.status(404).json({ error: "Not found" }); return; }
  const targetUrl = (req.body?.currentUrl && String(req.body.currentUrl).startsWith("http"))
    ? String(req.body.currentUrl) : crawlRecord.url;
  try {
    const { screenshot, finalUrl } = await browserLiveScreenshot(targetUrl);
    res.json({ screenshot, currentUrl: finalUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Live screenshot failed");
    res.status(500).json({ error: `Lỗi Puppeteer: ${msg}` });
  }
});

// POST /api/crawls/:id/remote-click
router.post("/:id/remote-click", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { xPercent, yPercent, currentUrl } = req.body as {
    xPercent: number;
    yPercent: number;
    currentUrl?: string;
  };

  const [crawlRecord] = await db.select().from(crawlsTable).where(eq(crawlsTable.id, id));
  if (!crawlRecord) { res.status(404).json({ error: "Not found" }); return; }

  const targetUrl = (currentUrl && currentUrl.startsWith("http")) ? currentUrl : crawlRecord.url;

  try {
    const { screenshot, finalUrl } = await browserRemoteClick(targetUrl, xPercent, yPercent);

    const aiPromise = gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: screenshot } },
          { text: `Người dùng vừa bấm vào trang web tại vị trí ${Math.round(xPercent)}% ngang, ${Math.round(yPercent)}% dọc. URL hiện tại: ${finalUrl}. Mô tả ngắn gọn (1-2 câu tiếng Việt): trang đang hiển thị gì và có gì thay đổi sau cú bấm đó?` },
        ],
      }],
      config: { maxOutputTokens: 256 },
    }).then(r => r.text ?? "").catch(() => "");

    const aiComment = await aiPromise;
    res.json({ screenshot, currentUrl: finalUrl, aiComment });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Remote click failed");
    res.status(500).json({ error: `Lỗi Puppeteer: ${msg}` });
  }
});

// GET /crawls/:id/screenshot
router.get("/:id/screenshot", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).end(); return; }
  const [crawlRecord] = await db.select().from(crawlsTable).where(eq(crawlsTable.id, id));
  if (!crawlRecord?.screenshot) { res.status(404).end(); return; }
  const buf = Buffer.from(crawlRecord.screenshot, "base64");
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(buf);
});

// POST /crawls/:id/click
router.post("/:id/click", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { xPercent, yPercent } = req.body as { xPercent: number; yPercent: number };

  const [crawlRecord] = await db.select().from(crawlsTable).where(eq(crawlsTable.id, id));
  if (!crawlRecord?.screenshot) {
    res.status(404).json({ response: "Không có ảnh chụp màn hình cho trang này." });
    return;
  }

  const prompt = `Bạn là AI phân tích giao diện web. Người dùng đang xem ảnh chụp màn hình của trang web và đã bấm vào một vị trí cụ thể.

URL trang web: ${crawlRecord.url}
Tiêu đề: ${crawlRecord.title || "Không có"}
Công nghệ: ${crawlRecord.techStack ? JSON.parse(crawlRecord.techStack).join(", ") : "Không rõ"}

Vị trí bấm: ${Math.round(xPercent)}% từ trái, ${Math.round(yPercent)}% từ trên

Dựa vào ảnh chụp màn hình và vị trí bấm, hãy cho biết:
1. Người dùng đã bấm vào phần tử/khu vực nào?
2. Phần tử đó là gì (nút, liên kết, hình ảnh, tiêu đề, v.v.)?
3. Chức năng của nó là gì? Điều gì sẽ xảy ra khi bấm vào?
4. Bất kỳ thông tin hữu ích nào khác về khu vực đó?

Trả lời ngắn gọn, rõ ràng bằng tiếng Việt (3-5 câu).`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: crawlRecord.screenshot } },
          { text: prompt },
        ],
      }],
      config: { maxOutputTokens: 1024 },
    });
    res.json({ response: response.text ?? "Không có phản hồi." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ response: `[Lỗi AI vision: ${msg}]` });
  }
});

// GET /crawls/:id/clone
router.get("/:id/clone", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).send("Invalid ID"); return; }
  const [crawlRecord] = await db.select().from(crawlsTable).where(eq(crawlsTable.id, id));
  if (!crawlRecord?.clonedHtml) {
    res.status(404).send("<html><body style='font-family:monospace;background:#0a0a0a;color:#00e5ff;padding:2rem'><h2>❌ Clone chưa được tạo</h2></body></html>");
    return;
  }
  const script = buildInteractionScript(id);
  const html = crawlRecord.clonedHtml.includes("</body>")
    ? crawlRecord.clonedHtml.replace("</body>", `${script}</body>`)
    : crawlRecord.clonedHtml + script;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.send(html);
});

// POST /crawls/:id/interact
router.post("/:id/interact", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { elementTag, elementText, elementHref, elementSrc, pageStateAfter } = req.body as {
    elementTag: string;
    elementText: string;
    elementHref?: string;
    elementSrc?: string;
    pageStateAfter?: string;
  };

  const [crawlRecord] = await db.select().from(crawlsTable).where(eq(crawlsTable.id, id));

  const context = crawlRecord
    ? `Trang web: ${crawlRecord.url}\nTiêu đề: ${crawlRecord.title || "Không có"}\nCông nghệ: ${crawlRecord.techStack ? JSON.parse(crawlRecord.techStack).join(", ") : "Không rõ"}`
    : `ID crawl: ${id}`;

  const prompt = `Bạn là AI quan sát phiên duyệt web. Người dùng đang tương tác với giao diện của một trang web.

${context}

Hành động người dùng vừa thực hiện:
- Phần tử: <${elementTag}>
- Nội dung: "${elementText || "(trống)"}"
${elementHref ? `- Liên kết: ${elementHref}` : ""}
${elementSrc ? `- Ảnh/nguồn: ${elementSrc}` : ""}
${pageStateAfter ? `\nTrang web hiển thị sau hành động:\n"${pageStateAfter}"` : ""}

Hãy mô tả ngắn gọn (2-3 câu, tiếng Việt):
1. Người dùng vừa làm gì?
2. Trang web đã phản ứng/hiển thị gì?
Trả lời trực tiếp như một người quan sát thực tế, không dùng từ "phần tử" hay thuật ngữ kỹ thuật.`;

  try {
    const response = await callGemini(prompt);
    res.json({ response });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ response: `[AI không thể phân tích: ${msg}]` });
  }
});

// GET /crawls/:id
router.get("/:id", async (req, res) => {
  const parsed = GetCrawlParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [crawlRecord] = await db.select().from(crawlsTable).where(eq(crawlsTable.id, parsed.data.id));
  if (!crawlRecord) { res.status(404).json({ error: "Crawl not found" }); return; }
  res.json(serializeCrawl(crawlRecord));
});

// DELETE /crawls/:id
router.delete("/:id", async (req, res) => {
  const parsed = DeleteCrawlParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(crawlsTable).where(eq(crawlsTable.id, parsed.data.id));
  res.status(204).end();
});

export default router;
