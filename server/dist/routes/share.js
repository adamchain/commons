// Dynamic social-share cards for plans and communities.
//
// Social crawlers (Facebook, iMessage, X, LinkedIn, WhatsApp, Slack, …) don't
// run JS, so the client SPA's static <meta> tags are all they'd otherwise see —
// every shared plan or community link would preview as the generic Commons card.
// This module gives each plan and live community its own preview:
//
//   • GET /plans/:id/og-image.png  — a 1200×630 card rendered from the real
//     event (cover photo, title, date, place, host) with a LIVE
//     "N going · M interested" badge. satori (layout → SVG) + resvg (→ PNG),
//     no headless browser.
//   • injectPlanMeta(html, …)      — rewrites the SPA's OG/Twitter/<title> tags
//     with plan-specific values so the crawler reads them. Real users still get
//     the same HTML and the SPA boots normally on top.
//
// The og:image URL carries a ?c=<going>&i=<interested> cache-buster, so when the
// RSVP count moves the URL changes and Facebook et al. re-fetch a fresh card
// instead of serving a stale one.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { coverPoolSync } from "../lib/coverCatalog.js";
import { store } from "../store.js";
import { communityCategoryLine } from "../types/shared.js";
export const shareRouter = Router();
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
let fontCache = null;
function font(rel) {
    return readFileSync(fileURLToPath(new URL(`../../assets/fonts/${rel}`, import.meta.url)));
}
function loadFonts() {
    if (!fontCache) {
        fontCache = [
            { name: "Montserrat", data: font("Montserrat-ExtraBold.ttf"), weight: 800, style: "normal" },
            { name: "Inter", data: font("Inter-Regular.ttf"), weight: 400, style: "normal" },
            { name: "Inter", data: font("Inter-SemiBold.ttf"), weight: 600, style: "normal" },
        ];
    }
    return fontCache;
}
// ---- Live counts -----------------------------------------------------------
function countsFor(planId) {
    const parts = store.listParticipationsForPlan(planId);
    return {
        going: parts.filter((p) => p.state === "going").length,
        interested: parts.filter((p) => p.state === "interested").length,
    };
}
// ---- Cover image -----------------------------------------------------------
// Deterministic fallback matches the client's pickCoverImage so a plan without
// its own flyer shows the same stand-in art it does in the feed.
const FALLBACK_COVERS = [
    "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=70",
    "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=70",
];
function hashPick(pool, key) {
    let h = 0;
    for (let i = 0; i < key.length; i++)
        h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return pool[h % pool.length];
}
/** Resolve a cover source for the plan (flyer → link-preview → curated). Ideas without a photo stay empty. */
export function coverUrlFor(plan) {
    if (plan.flyerDataUrl)
        return plan.flyerDataUrl;
    if (plan.flyerLinkPreview?.image)
        return plan.flyerLinkPreview.image;
    if (plan.planKind === "looking_for" && !plan.lockedAt)
        return "";
    const curated = coverPoolSync();
    const pool = curated.length ? curated : FALLBACK_COVERS;
    return hashPick(pool, plan.id);
}
/** Fetch a remote cover and inline it as a data URI. Returns null on failure. */
async function fetchImageDataUri(src) {
    if (!src)
        return null;
    if (src.startsWith("data:"))
        return src;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const r = await fetch(src, { signal: controller.signal }).finally(() => clearTimeout(timer));
        if (!r.ok)
            return null;
        const type = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0];
        if (!type.startsWith("image/"))
            return null;
        const buf = Buffer.from(await r.arrayBuffer());
        // 8MB ceiling — huge covers just fall back to the gradient.
        if (buf.byteLength > 8_000_000)
            return null;
        return `data:${type};base64,${buf.toString("base64")}`;
    }
    catch {
        return null;
    }
}
/** Fetch a remote/curated cover and inline it as a data URI. Returns null on failure. */
async function coverDataUri(plan) {
    return fetchImageDataUri(coverUrlFor(plan));
}
// ---- Text helpers ----------------------------------------------------------
function titleCase(raw) {
    return raw.trim().replace(/\s+/g, " ");
}
function formatDate(iso, plan) {
    if (plan?.isThisWeek)
        return "This week";
    if (plan?.isFlexibleDate || iso.startsWith("2099-12-31"))
        return "Anytime";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function formatTime(time, isFlexible) {
    if (isFlexible || !time || time === "Flexible")
        return "Flexible time";
    const [hStr, mStr = "00"] = time.split(":");
    const h = Number(hStr);
    if (Number.isNaN(h))
        return time;
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${mStr.padStart(2, "0")} ${ampm}`;
}
function countBadge(going, interested) {
    if (going === 0 && interested === 0)
        return "Be the first to join";
    const parts = [];
    if (going > 0)
        parts.push(`${going} going`);
    if (interested > 0)
        parts.push(`${interested} interested`);
    return parts.join("  ·  ");
}
// Satori has no emoji glyphs in Inter/Montserrat — missing graphemes render as
// the literal "NO GLYPH" placeholder (rotated) in the corner badge. Fetch the
// matching Twemoji PNG so the share card always shows a real icon.
const emojiImgCache = new Map();
const TRANSPARENT_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";
function twemojiCode(emoji) {
    return Array.from(emoji.trim() || "✨")
        .map((ch) => ch.codePointAt(0))
        .filter((cp) => cp !== 0xfe0f)
        .map((cp) => cp.toString(16))
        .join("-");
}
async function emojiDataUri(emoji) {
    const key = emoji.trim() || "✨";
    if (emojiImgCache.has(key))
        return emojiImgCache.get(key) ?? null;
    const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${twemojiCode(key)}.png`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const r = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
        if (!r.ok) {
            emojiImgCache.set(key, null);
            return null;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.byteLength < 32 || buf.byteLength > 200_000) {
            emojiImgCache.set(key, null);
            return null;
        }
        const uri = `data:image/png;base64,${buf.toString("base64")}`;
        emojiImgCache.set(key, uri);
        return uri;
    }
    catch {
        emojiImgCache.set(key, null);
        return null;
    }
}
/** Commons wordmark (black type + red thread on a transparent background). */
function wordmarkDataUri() {
    const buf = readFileSync(fileURLToPath(new URL("../../assets/wordmark.png", import.meta.url)));
    return `data:image/png;base64,${buf.toString("base64")}`;
}
let wordmarkUri = null;
function wordmarkSrc() {
    if (!wordmarkUri)
        wordmarkUri = wordmarkDataUri();
    return wordmarkUri;
}
function h(type, style, children) {
    return { type, props: children === undefined ? { style } : { style, children } };
}
function text(value, style) {
    return { type: "div", props: { style: { display: "flex", ...style }, children: value } };
}
const RED = "#C13B3B";
const INK = "#1A1A2E";
// Natural aspect of assets/wordmark.png (362×114).
const WORDMARK_WIDTH = 168;
const WORDMARK_HEIGHT = 53;
function wordmark() {
    return {
        type: "img",
        props: {
            src: wordmarkSrc(),
            width: WORDMARK_WIDTH,
            height: WORDMARK_HEIGHT,
            style: { width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT, objectFit: "contain" },
        },
    };
}
function statPill(label) {
    return h("div", {
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-start",
        background: "rgba(253,250,247,0.94)",
        borderRadius: 999,
        padding: "8px 16px 8px 12px",
        marginBottom: 18,
        boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
    }, [
        h("div", {
            display: "flex",
            width: 10,
            height: 10,
            borderRadius: 999,
            background: RED,
            marginRight: 10,
        }),
        text(label, {
            color: INK,
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: 22,
        }),
    ]);
}
function goingPill(going, interested) {
    return statPill(countBadge(going, interested));
}
function buildTree(plan, cover, counts) {
    const host = store.findUserById(plan.creatorId);
    const hostName = host?.firstName ?? "A host";
    const dateLine = [formatDate(plan.date, plan), formatTime(plan.time, plan.isFlexibleTime)].filter(Boolean).join("  ·  ");
    const place = plan.isFlexibleLocation ? "Flexible location" : plan.location?.name || "";
    const layers = [];
    // Background: cover photo, warm idea gradient, or brand gradient if none loaded.
    if (cover) {
        layers.push({
            type: "img",
            props: {
                src: cover,
                width: OG_WIDTH,
                height: OG_HEIGHT,
                style: { position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: OG_HEIGHT, objectFit: "cover" },
            },
        });
    }
    else {
        const idea = plan.planKind === "looking_for" && !plan.lockedAt;
        layers.push(h("div", {
            position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: OG_HEIGHT,
            background: idea
                ? "linear-gradient(145deg, #f7ead4 0%, #f3dcc8 46%, #efd0d0 100%)"
                : "linear-gradient(135deg, #1A1A2E 0%, #C13B3B 100%)",
        }));
    }
    // Legibility scrim.
    layers.push(h("div", {
        position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: OG_HEIGHT,
        background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.78) 100%)",
    }));
    // Top: wordmark with no plate, so the cover shows through.
    layers.push(h("div", {
        position: "absolute", top: 40, left: 48, right: 48, display: "flex",
        alignItems: "center",
    }, [wordmark()]));
    // Bottom content block.
    const bottom = [
        goingPill(counts.going, counts.interested),
        text(titleCase(plan.title), {
            color: "#fff", fontFamily: "Montserrat", fontWeight: 800, fontSize: 64,
            lineHeight: 1.08, letterSpacing: -1.2, maxHeight: 210, overflow: "hidden",
            textShadow: "0 3px 18px rgba(0,0,0,0.45)",
        }),
        text([dateLine, place].filter(Boolean).join("  ·  "), {
            color: "rgba(255,255,255,0.9)", fontFamily: "Inter", fontWeight: 600, fontSize: 28,
            marginTop: 16, textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }),
        text(`Hosted by ${hostName}`, {
            color: "rgba(255,255,255,0.72)", fontFamily: "Inter", fontWeight: 400, fontSize: 24, marginTop: 8,
        }),
    ];
    layers.push(h("div", {
        position: "absolute", left: 56, right: 56, bottom: 52,
        display: "flex", flexDirection: "column",
    }, bottom));
    return h("div", { width: OG_WIDTH, height: OG_HEIGHT, display: "flex", position: "relative", background: "#111" }, layers);
}
// In-memory render cache keyed by plan + counts so repeated crawler hits (and
// the client preview) don't re-render. Small bounded LRU-ish map.
const imageCache = new Map();
// Include a light content fingerprint so a title/date/cover edit busts the cache
// too — not just an RSVP count change.
function cacheKey(plan, going, interested) {
    const fp = [
        plan.title,
        plan.date,
        plan.time,
        plan.location?.name,
        plan.flyerDataUrl ? `f${plan.flyerDataUrl.length}` : plan.flyerLinkPreview?.image ?? "",
        plan.planKind ?? "",
        plan.lockedAt ?? "",
        plan.hostEmoji ?? "",
        plan.cancelledAt ?? "",
    ].join("|");
    return `ogv4:${plan.id}:${going}:${interested}:${fp}`;
}
async function renderPlanCard(plan) {
    const counts = countsFor(plan.id);
    const key = cacheKey(plan, counts.going, counts.interested);
    const hit = imageCache.get(key);
    if (hit)
        return hit;
    const cover = await coverDataUri(plan);
    const svg = await satori(buildTree(plan, cover, counts), {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: loadFonts(),
        // Any leftover emoji in the title/place must render as an image, never
        // satori's "NO GLYPH" placeholder.
        loadAdditionalAsset: async (code, segment) => {
            if (code !== "emoji")
                return "";
            return (await emojiDataUri(segment)) ?? TRANSPARENT_PNG;
        },
    });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng();
    if (imageCache.size > 200)
        imageCache.clear();
    imageCache.set(key, png);
    return png;
}
/** Site and invite-link preview. Landscape card, wordmark with no plate behind it. */
function buildAppCard() {
    return {
        type: "div",
        props: {
            style: {
                width: OG_WIDTH,
                height: OG_HEIGHT,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "#F0E9DF",
            },
            children: [
                {
                    type: "img",
                    props: {
                        src: wordmarkSrc(),
                        width: 420,
                        height: 132,
                        style: { width: 420, height: 132, objectFit: "contain", background: "transparent" },
                    },
                },
                text("Real plans. Real people. Happening now.", {
                    marginTop: 36,
                    color: INK,
                    fontFamily: "Montserrat",
                    fontWeight: 800,
                    fontSize: 40,
                    letterSpacing: -0.5,
                }),
            ],
        },
    };
}
let appCardPng = null;
export async function renderAppOgPng() {
    if (appCardPng)
        return appCardPng;
    const svg = await satori(buildAppCard(), {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: loadFonts(),
    });
    appCardPng = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng();
    return appCardPng;
}
shareRouter.get("/og-image.png", async (_req, res) => {
    try {
        const png = await renderAppOgPng();
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.send(png);
    }
    catch (err) {
        console.error("[og-image app]", err);
        res.status(500).send("Could not render image");
    }
});
shareRouter.get("/plans/:id/og-image.png", async (req, res) => {
    const plan = store.findPlanById(req.params.id);
    if (!plan) {
        res.status(404).send("Not found");
        return;
    }
    try {
        const png = await renderPlanCard(plan);
        res.setHeader("Content-Type", "image/png");
        // Short cache: crawlers re-fetch periodically, and the ?c/&i query in the
        // og:image URL already forces a new fetch the moment the count changes.
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
        res.send(png);
    }
    catch (err) {
        console.error("[og-image]", err);
        res.status(500).send("Failed to render");
    }
});
// ---- Community cards -------------------------------------------------------
// Same 1200×630 layout as a plan card: cover, wordmark, live member count,
// name, category, and place. Only approved, visible communities get a card.
const CATEGORY_COVERS = {
    coffee: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1200&q=70",
    food: "https://images.unsplash.com/photo-1574966739987-65e38db0f7ce?auto=format&fit=crop&w=1200&q=70",
    drinks: "https://images.unsplash.com/photo-1568644396922-5c3bfae12521?auto=format&fit=crop&w=1200&q=70",
    workouts: "https://images.unsplash.com/photo-1603455778956-d71832eafa4e?auto=format&fit=crop&w=1200&q=70",
    wellness: "https://images.unsplash.com/photo-1603455778956-d71832eafa4e?auto=format&fit=crop&w=1200&q=70",
    walks: "https://images.unsplash.com/photo-1615373111465-965023eb989c?auto=format&fit=crop&w=1200&q=70",
    creative: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=70",
    events: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=70",
    music: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=70",
    books: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=70",
    night_out: "https://images.unsplash.com/photo-1568644396922-5c3bfae12521?auto=format&fit=crop&w=1200&q=70",
    games: "https://images.unsplash.com/photo-1518998053901-5348d3961a04?auto=format&fit=crop&w=1200&q=70",
    cowork: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1200&q=70",
    moms: "https://images.unsplash.com/photo-1615373111465-965023eb989c?auto=format&fit=crop&w=1200&q=70",
    new_to_philly: "https://images.unsplash.com/photo-1615373111465-965023eb989c?auto=format&fit=crop&w=1200&q=70",
    sober: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1200&q=70",
};
function isShareableCommunity(community) {
    return community.creationStatus === "approved" && !community.hiddenAt;
}
function communityCoverSource(community) {
    if (community.coverImage)
        return community.coverImage;
    return CATEGORY_COVERS[community.category] ?? CATEGORY_COVERS.events;
}
function memberBadge(memberCount) {
    const n = Math.max(0, memberCount);
    if (n <= 1)
        return "1 member";
    return `${n} members`;
}
function buildCommunityTree(community, cover) {
    const organizer = store.findUserById(community.organizerId);
    const organizerName = organizer?.firstName ?? "an organizer";
    const place = community.city?.trim() || "Philadelphia";
    const meta = [communityCategoryLine(community), place].filter(Boolean).join("  ·  ");
    const layers = [];
    if (cover) {
        layers.push({
            type: "img",
            props: {
                src: cover,
                width: OG_WIDTH,
                height: OG_HEIGHT,
                style: { position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: OG_HEIGHT, objectFit: "cover" },
            },
        });
    }
    else {
        layers.push(h("div", {
            position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: OG_HEIGHT,
            background: "linear-gradient(135deg, #1A1A2E 0%, #C13B3B 100%)",
        }));
    }
    layers.push(h("div", {
        position: "absolute", top: 0, left: 0, width: OG_WIDTH, height: OG_HEIGHT,
        background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.78) 100%)",
    }));
    layers.push(h("div", {
        position: "absolute", top: 40, left: 48, right: 48, display: "flex",
        alignItems: "center",
    }, [wordmark()]));
    layers.push(h("div", {
        position: "absolute", left: 56, right: 56, bottom: 52,
        display: "flex", flexDirection: "column",
    }, [
        statPill(memberBadge(community.memberCount)),
        text(titleCase(community.name), {
            color: "#fff", fontFamily: "Montserrat", fontWeight: 800, fontSize: 64,
            lineHeight: 1.08, letterSpacing: -1.2, maxHeight: 210, overflow: "hidden",
            textShadow: "0 3px 18px rgba(0,0,0,0.45)",
        }),
        text(meta, {
            color: "rgba(255,255,255,0.9)", fontFamily: "Inter", fontWeight: 600, fontSize: 28,
            marginTop: 16, textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }),
        text(`Organized by ${organizerName}`, {
            color: "rgba(255,255,255,0.72)", fontFamily: "Inter", fontWeight: 400, fontSize: 24, marginTop: 8,
        }),
    ]));
    return h("div", { width: OG_WIDTH, height: OG_HEIGHT, display: "flex", position: "relative", background: "#111" }, layers);
}
function communityCacheKey(community) {
    const fp = [
        community.name,
        community.category,
        (community.categories ?? []).join(","),
        community.city ?? "",
        community.coverImage ? `c${community.coverImage.length}` : "",
        community.organizerId,
        community.creationStatus,
        community.hiddenAt ?? "",
    ].join("|");
    return `ogc2:${community.id}:${community.memberCount}:${fp}`;
}
async function renderCommunityCard(community) {
    const key = communityCacheKey(community);
    const hit = imageCache.get(key);
    if (hit)
        return hit;
    const cover = await fetchImageDataUri(communityCoverSource(community));
    const svg = await satori(buildCommunityTree(community, cover), {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: loadFonts(),
        loadAdditionalAsset: async (code, segment) => {
            if (code !== "emoji")
                return "";
            return (await emojiDataUri(segment)) ?? TRANSPARENT_PNG;
        },
    });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng();
    if (imageCache.size > 200)
        imageCache.clear();
    imageCache.set(key, png);
    return png;
}
shareRouter.get("/communities/:id/og-image.png", async (req, res) => {
    const community = store.findCommunityById(req.params.id);
    if (!community || !isShareableCommunity(community)) {
        res.status(404).send("Not found");
        return;
    }
    try {
        const png = await renderCommunityCard(community);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
        res.send(png);
    }
    catch (err) {
        console.error("[og-image community]", err);
        res.status(500).send("Failed to render");
    }
});
// ---- HTML meta injection ---------------------------------------------------
function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
/**
 * Rewrite the SPA index.html's social tags for a specific plan. Strips the
 * existing og / twitter / title / description tags and injects plan-specific
 * ones just before the closing head tag. `origin` is the absolute public base.
 */
export function injectPlanMeta(html, plan, origin) {
    const counts = countsFor(plan.id);
    const title = titleCase(plan.title);
    const dateLine = [formatDate(plan.date, plan), formatTime(plan.time, plan.isFlexibleTime)].filter(Boolean).join(" · ");
    const place = plan.isFlexibleLocation ? "Flexible location" : plan.location?.name || "";
    const badge = countBadge(counts.going, counts.interested);
    const descParts = [dateLine, place, badge].filter(Boolean);
    const description = `${descParts.join(" · ")} — join on Commons.`;
    const pageUrl = `${origin}/plans/${plan.id}`;
    // Cache-buster: URL changes with the live count so crawlers refresh the card.
    const imageUrl = `${origin}/plans/${plan.id}/og-image.png?c=${counts.going}&i=${counts.interested}`;
    const tags = `
    <title>${esc(title)} · Commons</title>
    <meta name="description" content="${esc(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Commons" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(pageUrl)}" />
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta property="og:image:secure_url" content="${esc(imageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${OG_WIDTH}" />
    <meta property="og:image:height" content="${OG_HEIGHT}" />
    <meta property="og:image:alt" content="${esc(title)} on Commons" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />
    <meta name="twitter:image:alt" content="${esc(title)} on Commons" />
  `;
    // Remove the static social/title tags the SPA ships so we don't double up.
    const stripped = html
        .replace(/<title>[\s\S]*?<\/title>/i, "")
        .replace(/<meta[^>]+(?:name|property)=["'](?:og:[^"']*|twitter:[^"']*|description)["'][^>]*>\s*/gi, "")
        .replace(/<link[^>]+rel=["']canonical["'][^>]*>\s*/i, `<link rel="canonical" href="${esc(pageUrl)}" />`);
    return stripped.replace(/<\/head>/i, `${tags}\n  </head>`);
}
/** True for `/plans/:id` exactly (not /edit, /chat, /new). */
export function planIdFromDetailPath(pathname) {
    const m = /^\/plans\/([^/]+)\/?$/.exec(pathname);
    if (!m)
        return null;
    const id = decodeURIComponent(m[1]);
    if (id === "new")
        return null;
    return id;
}
/**
 * Rewrite the SPA index.html's social tags for a live community. Pending,
 * rejected, and hidden communities keep the generic Commons card.
 */
export function injectCommunityMeta(html, community, origin) {
    if (!isShareableCommunity(community))
        return html;
    const title = titleCase(community.name);
    const place = community.city?.trim() || "Philadelphia";
    const badge = memberBadge(community.memberCount);
    const category = communityCategoryLine(community);
    const description = `${[category, place, badge].filter(Boolean).join(" · ")} — join on Commons.`;
    const pageUrl = `${origin}/communities/${community.id}`;
    const imageUrl = `${origin}/communities/${community.id}/og-image.png?m=${community.memberCount}`;
    const tags = `
    <title>${esc(title)} · Commons</title>
    <meta name="description" content="${esc(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Commons" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(pageUrl)}" />
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta property="og:image:secure_url" content="${esc(imageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${OG_WIDTH}" />
    <meta property="og:image:height" content="${OG_HEIGHT}" />
    <meta property="og:image:alt" content="${esc(title)} on Commons" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />
    <meta name="twitter:image:alt" content="${esc(title)} on Commons" />
  `;
    const stripped = html
        .replace(/<title>[\s\S]*?<\/title>/i, "")
        .replace(/<meta[^>]+(?:name|property)=["'](?:og:[^"']*|twitter:[^"']*|description)["'][^>]*>\s*/gi, "")
        .replace(/<link[^>]+rel=["']canonical["'][^>]*>\s*/i, `<link rel="canonical" href="${esc(pageUrl)}" />`);
    return stripped.replace(/<\/head>/i, `${tags}\n  </head>`);
}
/** True for `/communities/:id` exactly (not /new, /dashboard, /chat). */
export function communityIdFromDetailPath(pathname) {
    const m = /^\/communities\/([^/]+)\/?$/.exec(pathname);
    if (!m)
        return null;
    const id = decodeURIComponent(m[1]);
    if (id === "new")
        return null;
    return id;
}
