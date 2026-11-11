// netlify/functions/home.js
// Serves the front page with the latest stories already in the HTML, so search
// engines and readers get real headlines without waiting on JavaScript.
//
// netlify.toml rewrites "/" to this function. It takes index.html as a template
// and fills the <!--ssr:name--> … <!--/ssr:name--> slots. If anything goes wrong
// it serves the untouched template, and app.js loads the stories in the browser
// exactly as it did before — the page never depends on this function succeeding.

const fs = require("fs");
const path = require("path");
const { getGroupedAds } = require("./ads.js");

const TEMPLATE_PATH = path.join(__dirname, "../../index.html");
const FEED_PATH = "/.netlify/functions/rss?limit=100";
const FEED_TIMEOUT_MS = 3500;

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

function originOf(event) {
  try {
    if (event.rawUrl) return new URL(event.rawUrl).origin;
  } catch {
    /* fall through */
  }
  if (process.env.URL) return process.env.URL;
  const host = event.headers && (event.headers.host || event.headers.Host);
  return host ? `https://${host}` : "https://mississippinewsgroup.com";
}

function respond(html, cdnCache) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Browsers always revalidate; Netlify's CDN holds the rendered page so
      // most visits never run this function at all.
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": cdnCache,
      // The page does not change with query strings (fbclid, utm_…), so don't
      // let them split the cache.
      "Netlify-Vary": "query=preview",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: html,
  };
}

exports.handler = async (event) => {
  try {
    if (!template) template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  } catch (e) {
    console.error("home: could not read template", e);
    return { statusCode: 302, headers: { Location: "/index.html", "Cache-Control": "no-store" }, body: "" };
  }

  try {
    const res = await fetch(originOf(event) + FEED_PATH, { signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`feed returned ${res.status}`);
    const { items } = await res.json();
    if (!Array.isArray(items) || !items.length) throw new Error("feed was empty");

    let ads = { inline: [], sidebar: [], banner: [] };
    try {
      ads = getGroupedAds();
    } catch (e) {
      console.error("home: could not read ads", e);
    }

    const { renderFront, fullDate, clockTime, esc } = require("../../render.js");
    const now = new Date();
    const front = renderFront(items, ads, now);

    let html = template;
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
    return respond(template, "public, s-maxage=30");
  }
};
