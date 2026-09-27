import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const linkPreviewRouter = Router();

const MAX_REDIRECTS = 3;

// Reject loopback, link-local, and private addresses — both as a hostname
// string and after DNS resolution. Redirects are checked the same way.
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
  if (h.endsWith(".local") || h === "metadata.google.internal") return true;
  return false;
}

function isPrivateIpv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIp(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
    const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateIp(mapped[1]);
    return false;
  }
  if (/^\d+$/.test(ip)) {
    const n = Number(ip);
    if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return true;
    return isPrivateIpv4((n >>> 24) & 255, (n >>> 16) & 255);
  }
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return isPrivateIpv4(parts[0] ?? 0, parts[1] ?? 0);
}

async function isPublicHttpUrl(target: URL): Promise<boolean> {
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || isPrivateHost(host) || isPrivateIp(host)) return false;
  if (isIP(host) || /^\d+$/.test(host)) return !isPrivateIp(host);
  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every((record) => !isPrivateIp(record.address));
  } catch {
    return false;
  }
}

async function fetchPublic(start: URL, signal: AbortSignal): Promise<Response> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await isPublicHttpUrl(current))) {
      throw new Error("blocked");
    }
    const response = await fetch(current.toString(), {
      signal,
      redirect: "manual",
      headers: {
        "User-Agent": "Commons-LinkPreview/1.0 (+https://commons.app)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("redirect");
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new Error("redirect");
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
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (isPrivateHost(host) || isPrivateIp(host)) return undefined;
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
  if (!(await isPublicHttpUrl(parsed))) {
    res.status(400).json({ error: "URL not allowed" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetchPublic(parsed, controller.signal);
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
  } catch (err) {
    if (err instanceof Error && (err.message === "blocked" || err.message === "redirect")) {
      res.status(400).json({ error: "URL not allowed" });
      return;
    }
    res.status(502).json({ error: "Couldn't fetch URL" });
  } finally {
    clearTimeout(timer);
  }
});
