// ============================================================
// Mississippi News Group — shared rendering
// Pure functions that turn feed items into HTML. Used by the
// browser (app.js) and by the server function that pre-renders
// the front page, so both produce identical markup.
// No DOM, no Node APIs: safe to run anywhere.
// ============================================================

import { SITES, AREAS } from "./sites.js";

const TZ = "America/Chicago"; // Mississippi is all Central Time
const SITE_BY_NAME = new Map(SITES.map((s) => [s.name, s]));

export const TOP_COUNT = 5; // lead story + 4 secondary
export const CARD_COUNT = 12; // image cards before the compact list
export const LIST_INITIAL = 16; // compact rows shown before "Show more"
const AD_INTERVAL = 6;

// ------ Text + URL safety ------
export function esc(str = "") {
  return String(str).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}

// Only allow http(s) and site-relative URLs into href/src.
export function safeUrl(url = "") {
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return "";
}

// CMS uploads can have spaces in their file names; encode them without
// double-encoding paths that are already escaped.
function encodeSrc(src) {
  try {
    return encodeURI(decodeURI(src));
  } catch {
    return encodeURI(src);
  }
}

// ------ Site lookups ------
export function siteOf(item) {
  return SITE_BY_NAME.get(item.site) || null;
}
export function kindOf(item) {
  return siteOf(item)?.kind || "news";
}
export function areaOf(item) {
  return siteOf(item)?.area || "statewide";
}
export function areaLabel(id) {
  return AREAS.find((a) => a.id === id)?.label || "";
}

// ------ Dates (always shown in Central Time) ------
const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const fmtShortDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });
const fmtLongDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
const fmtFullDate = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric",
});
const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayKey(value) {
  const d = toDate(value);
  return d ? fmtKey.format(d) : "";
}

export function fullDate(now = new Date()) {
  return fmtFullDate.format(now);
}

export function clockTime(value) {
  const d = toDate(value);
  return d ? fmtTime.format(d) : "";
}

// "Nov 10, 5:37 PM" — never goes stale, so it is what the server renders.
export function absoluteStamp(value) {
  const d = toDate(value);
  return d ? `${fmtShortDay.format(d)}, ${fmtTime.format(d)}` : "";
}

// "12 min ago" / "3 hr ago" / "Yesterday" / "Nov 8" — the browser upgrades to this.
export function relativeStamp(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return "";
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 12) return `${Math.round(mins / 60)} hr ago`;
  const today = dayKey(now);
  if (dayKey(d) === today) return fmtTime.format(d);
  if (dayKey(d) === dayKey(new Date(now.getTime() - 86400000))) return "Yesterday";
  return fmtShortDay.format(d);
}

export function dayLabel(key, now = new Date()) {
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86400000))) return "Yesterday";
  const d = toDate(`${key}T12:00:00Z`);
  return d ? fmtLongDay.format(d) : "Earlier";
}

function timeTag(iso) {
  const d = toDate(iso);
  if (!d) return "";
  return `<time datetime="${esc(d.toISOString())}" data-rel>${esc(absoluteStamp(d))}</time>`;
}

// ------ Pieces ------
function kicker(item) {
  const kind = kindOf(item);
  return `<p class="kicker kicker--${kind}">${esc(item.site)}</p>`;
}

function media(item, { cls = "", eager = false, width = 640, height = 360 } = {}) {
  const src = safeUrl(item.image);
  if (!src) return `<div class="media media--empty ${cls}" aria-hidden="true"></div>`;
  const loading = eager ? `fetchpriority="high"` : `loading="lazy"`;
  return `<div class="media ${cls}"><img src="${esc(src)}" alt="" width="${width}" height="${height}" decoding="async" ${loading} /></div>`;
}

function linkAttrs(item) {
  const href = safeUrl(item.link) || "#";
  // Stories live on the network sites, so open them in a new tab.
  return item.isLocal
    ? `href="${esc(href)}"`
    : `href="${esc(href)}" target="_blank" rel="noopener"`;
}

// ------ Top stories ------
// Lead = newest story with a photo; the next four come from different sites
// so one busy newsroom can't fill the whole top of the page.
export function pickTop(items, count = TOP_COUNT) {
  if (!items.length) return [];
  const lead = items.find((it) => it.image) || items[0];
  const picked = [lead];
  const seen = new Set([lead.site]);
  for (const it of items) {
    if (picked.length >= count) break;
    if (seen.has(it.site)) continue;
    picked.push(it);
    seen.add(it.site);
  }
  for (const it of items) {
    if (picked.length >= count) break;
    if (!picked.includes(it)) picked.push(it);
  }
  return picked;
}

export function renderTop(top) {
  if (!top.length) return "";
  const [lead, ...rest] = top;
  const leadHtml = `
    <article class="lead">
      <a class="lead-link" ${linkAttrs(lead)}>
        ${media(lead, { cls: "lead-media", eager: true, width: 960, height: 540 })}
        <div class="lead-body">
          ${kicker(lead)}
          <h2 class="lead-title">${esc(lead.title)}</h2>
          ${lead.excerpt ? `<p class="lead-excerpt">${esc(lead.excerpt)}</p>` : ""}
          <p class="meta">${timeTag(lead.date)}</p>
        </div>
      </a>
    </article>`;
  const restHtml = rest
    .map(
      (it) => `
      <li class="brief">
        <a class="brief-link" ${linkAttrs(it)}>
          <div class="brief-body">
            ${kicker(it)}
            <h3 class="brief-title">${esc(it.title)}</h3>
            <p class="meta">${timeTag(it.date)}</p>
          </div>
          ${media(it, { cls: "brief-media", width: 240, height: 180 })}
        </a>
      </li>`
    )
    .join("");
  return `${leadHtml}
    <div class="briefs">
      <h2 class="briefs-title">More top stories</h2>
      <ul class="briefs-list">${restHtml}</ul>
    </div>`;
}

// ------ Cards ------
export function renderCard(item) {
  return `
    <article class="card">
      <a class="card-link" ${linkAttrs(item)}>
        ${media(item, { cls: "card-media" })}
        <div class="card-body">
          ${kicker(item)}
          <h3 class="card-title">${esc(item.title)}</h3>
          ${item.excerpt ? `<p class="card-excerpt">${esc(item.excerpt)}</p>` : ""}
          <p class="meta">${timeTag(item.date)}</p>
        </div>
      </a>
    </article>`;
}

export function renderAd(ad, cls = "ad") {
  const href = safeUrl(ad.link);
  const src = safeUrl(ad.image);
  if (!src) return "";
  const img = `<img src="${esc(encodeSrc(src))}" alt="${esc(ad.alt || ad.title || "Advertisement")}" loading="lazy" decoding="async" />`;
  return `
    <aside class="${cls}" aria-label="Advertisement">
      <span class="ad-label">Advertisement</span>
      ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener sponsored">${img}</a>` : img}
    </aside>`;
}

export function renderCards(items, ads = {}) {
  const inline = ads.inline || [];
  let adIndex = 0;
  return items
    .map((it, idx) => {
      let html = renderCard(it);
      if ((idx + 1) % AD_INTERVAL === 0 && inline.length) {
        html += renderAd(inline[adIndex % inline.length], "ad ad--inline");
        adIndex++;
      }
      return html;
    })
    .join("");
}

// ------ Compact list, grouped by day ------
export function renderList(items, { now = new Date(), initial = LIST_INITIAL } = {}) {
  if (!items.length) return "";
  const groups = [];
  items.forEach((it, idx) => {
    const key = dayKey(it.date) || "earlier";
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, rows: [] };
      groups.push(group);
    }
    group.rows.push({ it, idx });
  });

  const body = groups
    .map((group) => {
      const allHidden = group.rows[0].idx >= initial;
      const rows = group.rows
        .map(({ it, idx }) => {
          const d = toDate(it.date);
          const when = d
            ? `<time class="row-time" datetime="${esc(d.toISOString())}">${esc(clockTime(d))}</time>`
            : `<span class="row-time"></span>`;
          return `
          <li class="row"${idx >= initial ? " data-extra hidden" : ""}>
            ${when}
            <a class="row-link" ${linkAttrs(it)}>
              <span class="row-title">${esc(it.title)}</span>
              <span class="row-site row-site--${kindOf(it)}">${esc(it.site)}</span>
            </a>
          </li>`;
        })
        .join("");
      return `
        <section class="day"${allHidden ? " data-extra hidden" : ""}>
          <h3 class="day-label">${esc(group.key === "earlier" ? "Earlier" : dayLabel(group.key, now))}</h3>
          <ul class="rows">${rows}</ul>
        </section>`;
    })
    .join("");

  const extra = items.length - initial;
  const more =
    extra > 0
      ? `<button class="btn btn-outline more-btn" type="button" data-show-more>Show ${extra} more headline${extra === 1 ? "" : "s"}</button>`
      : "";
  return body + more;
}

// An inline ad takes one cell of the card grid, so show one fewer story card
// when there is one — that keeps the last row of the grid full.
export function cardCountFor(ads = {}) {
  return (ads.inline || []).length ? CARD_COUNT - 1 : CARD_COUNT;
}

// ------ Whole front page (unfiltered view) ------
export function renderFront(items, ads = {}, now = new Date()) {
  const top = pickTop(items);
  const rest = items.filter((it) => !top.includes(it));
  const cardCount = cardCountFor(ads);
  const cards = rest.slice(0, cardCount);
  const list = rest.slice(cardCount);
  const banner = (ads.banner || [])[0];
  return {
    top: renderTop(top),
    cards: renderCards(cards, ads),
    list: renderList(list, { now }),
    banner: banner ? renderAd(banner, "ad ad--banner") : "",
    sidebar: (ads.sidebar || []).map((ad) => renderAd(ad, "ad ad--rail")).join(""),
    counts: { total: items.length, cards: cards.length, list: list.length },
  };
}
