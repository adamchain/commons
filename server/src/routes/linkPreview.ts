import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const linkPreviewRouter = Router();

// Light SSRF guard: reject loopback / link-local / private-range hostnames so
// the unfurl endpoint can't be turned into a probe of internal services.
// Doesn't resolve DNS — that's a deeper defense we don't need yet.
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  if (/^fc[0-9a-f]{2}:/.test(h) || /^fd[0-9a-f]{2}:/.test(h)) return true;
  if (/^fe80:/.test(h)) return true;
  return false;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

function pick(html: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

function resolveImage(image: string | undefined, base: URL): string | undefined {
  if (!image) return undefined;
  try {
    const u = new URL(image, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

linkPreviewRouter.post("/", requireAuth, async (req, res) => {
  const rawUrl = String(req.body?.url ?? "").trim();
  if (!rawUrl) {
    res.status(400).json({ error: "URL required" });
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ error: "Only http(s) URLs supported" });
    return;
  }
  if (isPrivateHost(parsed.hostname)) {
    res.status(400).json({ error: "URL not allowed" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Commons-LinkPreview/1.0 (+https://commons.app)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: "Couldn't fetch URL" });
      return;
    }
    const ctype = (r.headers.get("content-type") ?? "").toLowerCase();
    if (!ctype.includes("html") && !ctype.includes("text/")) {
      res.status(400).json({ error: "URL doesn't return HTML" });
      return;
    }
    // 1MB cap protects against unfurling huge pages.
    const html = (await r.text()).slice(0, 1_000_000);
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    const head = headMatch ? headMatch[0] : html;

    const title = pick(head, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]);
    const description = pick(head, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const imageRaw = pick(head, [
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ]);
    const siteName = pick(head, [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    ]);

    res.json({
      url: parsed.toString(),
      title: title?.slice(0, 200),
      description: description?.slice(0, 400),
      image: resolveImage(imageRaw, parsed),
      siteName: siteName?.slice(0, 100) ?? parsed.hostname.replace(/^www\./, ""),
    });
  } catch {
    res.status(502).json({ error: "Couldn't fetch URL" });
  } finally {
    clearTimeout(timer);
  }
});
