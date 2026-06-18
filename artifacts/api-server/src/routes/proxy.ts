import { Router } from "express";

const router = Router();

// Script injected into every proxied HTML page to capture user interactions
const TRACKER_SCRIPT = `
<script>
(function() {
  function genId() { return Date.now() + '-' + Math.random().toString(36).slice(2,6); }

  function getElInfo(el) {
    var tag = (el.tagName || 'unknown').toLowerCase();
    var text = '';
    if (el.value !== undefined && el.value !== null && el.value !== '') {
      text = el.value;
    } else {
      text = (el.innerText || el.textContent || el.alt || el.title || '').trim();
    }
    if (text.length > 120) text = text.slice(0, 120) + '…';
    var href = el.href || (el.closest && el.closest('a') ? el.closest('a').href : null) || null;
    var src  = el.src || el.currentSrc || null;
    var placeholder = el.placeholder || null;
    return { tag: tag, text: text || placeholder || tag, href: href, src: src };
  }

  // --- CLICK ---
  document.addEventListener('click', function(e) {
    var el = e.target;
    var info = getElInfo(el);
    window.parent.postMessage({
      type: 'scout_action',
      action: 'click',
      elementTag: info.tag,
      elementText: info.text,
      elementHref: info.href,
      elementSrc: info.src,
      pageUrl: window.location.href,
      pageTitle: document.title,
      eventId: genId()
    }, '*');
  }, true);

  // --- TYPING (debounced 800ms) ---
  var inputTimer = null;
  document.addEventListener('input', function(e) {
    clearTimeout(inputTimer);
    var el = e.target;
    inputTimer = setTimeout(function() {
      window.parent.postMessage({
        type: 'scout_action',
        action: 'type',
        elementTag: (el.tagName||'input').toLowerCase(),
        elementText: el.value || el.textContent || '',
        elementHref: null,
        elementSrc: null,
        pageUrl: window.location.href,
        pageTitle: document.title,
        eventId: genId()
      }, '*');
    }, 800);
  }, true);

  // --- SCROLL (debounced 600ms) ---
  var scrollTimer = null;
  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      var pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight || 1)) * 100);
      window.parent.postMessage({
        type: 'scout_action',
        action: 'scroll',
        elementTag: 'window',
        elementText: 'Cuộn ' + pct + '% trang (' + Math.round(window.scrollY) + 'px)',
        elementHref: null,
        elementSrc: null,
        pageUrl: window.location.href,
        pageTitle: document.title,
        eventId: genId()
      }, '*');
    }, 600);
  }, true);

  // Signal ready
  window.parent.postMessage({ type: 'scout_ready', pageTitle: document.title, pageUrl: window.location.href }, '*');
})();
</script>`;

// GET /proxy?url=https://...&crawlId=N
router.get("/proxy", async (req, res) => {
  const target = req.query.url as string;
  if (!target) { res.status(400).send("Missing ?url= parameter"); return; }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(target);
  } catch {
    res.status(400).send("Invalid URL"); return;
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    const contentType = upstream.headers.get("content-type") || "text/html";

    // Non-HTML assets — proxy as-is
    if (!contentType.includes("text/html")) {
      res.setHeader("content-type", contentType);
      res.setHeader("cache-control", "public, max-age=60");
      const buf = await upstream.arrayBuffer();
      res.send(Buffer.from(buf));
      return;
    }

    let html = await upstream.text();

    // Inject <base> so relative URLs resolve to origin
    const baseTag = `<base href="${parsedUrl.origin}${parsedUrl.pathname}">`;
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${baseTag}`);
    } else {
      html = baseTag + html;
    }

    // Inject tracker before </body>
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `${TRACKER_SCRIPT}\n</body>`);
    } else {
      html = html + TRACKER_SCRIPT;
    }

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.send(html);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).send(`
      <html><body style="font-family:monospace;background:#0a0a0f;color:#ff4444;padding:2rem;">
        <h2>⚠ Proxy Error</h2><p>${msg}</p>
        <p style="color:#888">Trang này có thể chặn kết nối bên ngoài.</p>
      </body></html>
    `);
  }
});

export default router;
