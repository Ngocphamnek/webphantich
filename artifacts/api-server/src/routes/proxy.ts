import { Router } from "express";

const router = Router();

// GET /proxy?url=https://...
// Fetches target URL, strips X-Frame-Options & CSP so it can be embedded in iframe
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

    // For non-HTML resources (CSS, JS, images, fonts) — proxy as-is
    if (!contentType.includes("text/html")) {
      res.setHeader("content-type", contentType);
      res.setHeader("cache-control", "public, max-age=60");
      const buf = await upstream.arrayBuffer();
      res.send(Buffer.from(buf));
      return;
    }

    let html = await upstream.text();

    // Inject <base> tag so relative URLs resolve correctly against the origin
    const baseTag = `<base href="${parsedUrl.origin}${parsedUrl.pathname}">`;
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${baseTag}`);
    } else {
      html = baseTag + html;
    }

    // Rewrite absolute-path links (/foo) → proxied (/api/proxy?url=origin/foo)
    const origin = parsedUrl.origin;
    html = html
      // src="/..." and href="/..." → proxy through our endpoint
      .replace(/(src|href)=["']\/((?!\/)[^"']*?)["']/g, (_, attr, path) => {
        return `${attr}="/api/proxy?url=${encodeURIComponent(origin + "/" + path)}"`;
      })
      // action="/..." on forms
      .replace(/action=["']\/((?!\/)[^"']*?)["']/g, (_, path) => {
        return `action="${origin}/${path}"`;
      });

    // Strip sandbox-busting scripts (minimal — keeps page functional)
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    // Critically: do NOT set X-Frame-Options or CSP — that's the whole point
    res.send(html);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).send(`
      <html><body style="font-family:monospace;background:#0a0a0f;color:#ff4444;padding:2rem;">
        <h2>⚠ Proxy Error</h2>
        <p>${msg}</p>
        <p style="color:#888">Trang này có thể chặn kết nối bên ngoài.</p>
      </body></html>
    `);
  }
});

export default router;
