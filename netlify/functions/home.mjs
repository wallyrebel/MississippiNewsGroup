// netlify/functions/home.mjs
// Serves the front page with the latest stories already in the HTML, so search
// engines and readers get real headlines without waiting on JavaScript.
//
// The function is routed to "/" by `config.path` below (not by a redirect rule:
// Netlify keys the cache on every query string for redirect-routed functions,
// which made each Facebook link with its own fbclid a cache miss).
//
// It takes index.html as a template and fills the <!--ssr:name--> … <!--/ssr:name-->
// slots. If anything goes wrong it serves the untouched template, and app.js loads
// the stories in the browser — the page never depends on this function succeeding.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderFront, fullDate, clockTime, esc } from "../../render.js";

export const config = { path: "/" };

const FEED_PATH = "/.netlify/functions/rss?limit=100";
const ADS_PATH = "/.netlify/functions/ads";
const TIMEOUT_MS = 3500;
const SLOT_MARKER = "<!--ssr:top-->";

let template = null; // cached for the life of a warm function instance

function fill(html, name, content) {
  const slot = new RegExp(`<!--ssr:${name}-->[\\s\\S]*?<!--/ssr:${name}-->`);
  return html.replace(slot, () => content);
}

// JSON inside a <script> tag must not be able to close the tag.
function jsonForScript(value) {
  const escapedLt = String.fromCharCode(92) + "u003c"; // a backslash-u escape for "less than"
  return JSON.stringify(value)
    .split("<").join(escapedLt)
    .replace(new RegExp("[" + String.fromCharCode(0x2028, 0x2029) + "]", "g"), "");
}

function readTemplateFromDisk() {
  const candidates = [path.resolve("index.html")];
  try {
    candidates.unshift(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../index.html"));
  } catch {
    /* import.meta.url is not a file URL in some bundles; the cwd candidate covers it */
  }
  for (const file of candidates) {
    try {
      const html = fs.readFileSync(file, "utf-8");
      if (html.includes(SLOT_MARKER)) return html;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

// index.html ships with the function (netlify.toml included_files); if it can't
// be found on disk, fetch the static copy from the site instead.
async function getTemplate(origin) {
  if (template) return template;
  let html = readTemplateFromDisk();
  if (!html) {
    const res = await fetch(origin + "/index.html", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`template fetch returned ${res.status}`);
    html = await res.text();
    if (!html.includes(SLOT_MARKER)) throw new Error("template has no slots");
  }
  template = html;
  return template;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

function respond(html, cdnCache) {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Browsers always revalidate; Netlify's CDN holds the rendered page so
      // most visits never run this function at all.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": cdnCache,
      // Only a (non-existent) "preview" parameter varies the cache, so tracking
      // parameters such as fbclid and utm_… all share one cached page.
      "Netlify-Vary": "query=preview",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

export default async (req) => {
  const origin = new URL(req.url).origin;

  let html;
  try {
    html = await getTemplate(origin);
  } catch (e) {
    console.error("home: could not load template —", e.message);
    return new Response(null, { status: 302, headers: { Location: "/index.html", "Cache-Control": "no-store" } });
  }

  try {
    const [feed, adsResult] = await Promise.allSettled([getJson(origin + FEED_PATH), getJson(origin + ADS_PATH)]);
    if (feed.status !== "fulfilled") throw feed.reason;
    const items = feed.value.items;
    if (!Array.isArray(items) || !items.length) throw new Error("feed was empty");

    // Ads are optional: a failure here must not cost the page its stories.
    const ads = { inline: [], sidebar: [], banner: [], ...(adsResult.status === "fulfilled" ? adsResult.value : {}) };

    const now = new Date();
    const front = renderFront(items, ads, now);

    html = fill(html, "today", esc(fullDate(now)));
    html = fill(html, "updated", esc(`Updated ${clockTime(now)} Central`));
    html = fill(html, "top", front.top);
    html = fill(html, "banner", front.banner);
    html = fill(html, "cards", front.cards);
    html = fill(html, "list", front.list);
    html = fill(html, "sidebar", front.sidebar);
    html = fill(
      html,
      "data",
      `<script id="initial-data" type="application/json">${jsonForScript({
        generatedAt: now.getTime(),
        items,
        ads,
      })}</script>`
    );

    return respond(html, "public, durable, s-maxage=300, stale-while-revalidate=1800");
  } catch (e) {
    console.error("home: serving template without stories —", e.message);
    // Short cache so a blip in the feeds doesn't stick around.
    return respond(html, "public, s-maxage=30");
  }
};
