// ============================================================
// Mississippi News Group — front page behaviour
// The page arrives with stories already rendered by the server
// (netlify/functions/home.js). This script adds filtering,
// search, live timestamps and background refresh. If the page
// was served without stories, it fetches and renders them itself.
// ============================================================

import { SITES } from "./sites.js";
import {
  esc, kindOf, areaOf, areaLabel, renderFront, renderCards, renderList, renderAd,
  relativeStamp, clockTime, fullDate, cardCountFor,
} from "./render.js";

const FEED_URL = "/.netlify/functions/rss?limit=100";
const ADS_URL = "/.netlify/functions/ads";
const REFRESH_MS = 5 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const els = {
  front: $("front"), top: $("top"), banner: $("bannerAd"), grid: $("grid"), list: $("list"),
  moreWrap: $("moreWrap"), moreTitle: $("moreTitle"), status: $("status"),
  feedTitle: $("feedTitle"), feedSub: $("feedSub"), search: $("search"),
  sidebar: $("sidebar"), updated: $("updated"), today: $("today"), newPill: $("newStories"),
  filters: $("filters"),
};

const state = {
  items: [],
  ads: { inline: [], sidebar: [], banner: [] },
  kind: "all",
  area: "all",
  q: "",
  loadedAt: 0,
  pending: null, // fresher items waiting behind the "New stories" pill
};

// ------ Filters ------
const isFiltered = () => state.kind !== "all" || state.area !== "all" || state.q !== "";

function filteredItems() {
  const q = state.q.toLowerCase();
  return state.items.filter((it) => {
    if (state.kind !== "all" && kindOf(it) !== state.kind) return false;
    if (state.area !== "all" && areaOf(it) !== state.area) return false;
    if (q && !`${it.title} ${it.excerpt || ""} ${it.site}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function describeFilter() {
  const place = state.area === "all" ? "Mississippi" : areaLabel(state.area);
  const what = state.kind === "sports" ? "sports" : state.kind === "news" ? "news" : "headlines";
  if (state.area === "statewide") return `Statewide ${what}`;
  return `${place} ${what}`;
}

function areaSiteLinks() {
  if (state.area === "all") return "";
  return SITES.filter((s) => s.area === state.area && (state.kind === "all" || s.kind === state.kind))
    .map((s) => `<a href="${esc(s.home)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`)
    .join(" · ");
}

// Say why the list is empty and offer the one step that widens it.
function emptyMessage(links) {
  if (state.q) {
    return `No headlines match “${esc(state.q)}”. <button class="link-btn" type="button" data-clear="q">Clear search</button>`;
  }
  if (state.area !== "all" && state.kind !== "all") {
    const place = state.area === "statewide" ? "statewide" : `from ${esc(areaLabel(state.area))}`;
    return `No recent ${state.kind} headlines ${place}. <button class="link-btn" type="button" data-clear="kind">Show everything ${place}</button>`;
  }
  return links
    ? `No recent headlines here right now. For full coverage visit ${links}`
    : "No recent headlines here right now.";
}

// ------ Rendering ------
function render() {
  const now = new Date();
  els.status.textContent = "";

  if (!isFiltered()) {
    const html = renderFront(state.items, state.ads, now);
    els.front.hidden = false;
    els.top.innerHTML = html.top;
    els.grid.innerHTML = html.cards;
    els.list.innerHTML = html.list;
    els.moreWrap.hidden = !html.counts.list;
    els.feedTitle.textContent = "Latest headlines";
    els.feedSub.textContent = "The newest stories from every newsroom in the network.";
    els.moreTitle.textContent = "More Mississippi headlines";
  } else {
    const items = filteredItems();
    els.front.hidden = true;
    const cardCount = cardCountFor(state.ads);
    els.grid.innerHTML = renderCards(items.slice(0, cardCount), state.ads);
    els.list.innerHTML = renderList(items.slice(cardCount), { now });
    els.moreWrap.hidden = items.length <= cardCount;
    els.feedTitle.textContent = state.q ? `Results for “${state.q}”` : describeFilter();
    const label = describeFilter();
    els.moreTitle.textContent = `More ${label.startsWith("Statewide") ? label.toLowerCase() : label}`;

    const count = `${items.length} recent ${items.length === 1 ? "story" : "stories"}`;
    const links = areaSiteLinks();
    els.feedSub.innerHTML = links ? `${count} · Full coverage: ${links}` : esc(count);

    if (!items.length) els.status.innerHTML = emptyMessage(links);
  }
  refreshTimes();
}

function renderAds() {
  const banner = (state.ads.banner || [])[0];
  els.banner.innerHTML = banner ? renderAd(banner, "ad ad--banner") : "";
  els.sidebar.innerHTML = (state.ads.sidebar || []).map((ad) => renderAd(ad, "ad ad--rail")).join("");
}

// Server-rendered times are absolute; make them relative and keep them fresh.
function refreshTimes() {
  const now = new Date();
  document.querySelectorAll("time[data-rel]").forEach((t) => {
    const rel = relativeStamp(t.dateTime, now);
    if (rel) t.textContent = rel;
  });
  if (state.loadedAt) els.updated.textContent = `Updated ${clockTime(state.loadedAt)} Central`;
  if (els.today) els.today.textContent = fullDate(now);
}

function setPressed(group, attr, value) {
  document.querySelectorAll(`[${attr}]`).forEach((b) => {
    if (b.closest(group)) b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value));
  });
}

function syncControls() {
  setPressed(".seg", "data-kind", state.kind);
  setPressed(".chips", "data-area", state.area);
  if (els.search.value !== state.q) els.search.value = state.q;
  const active = document.querySelector('.chips [aria-pressed="true"]');
  active?.scrollIntoView({ block: "nearest", inline: "center" });
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.area !== "all") p.set("community", state.area);
  if (state.kind !== "all") p.set("show", state.kind);
  if (state.q) p.set("q", state.q);
  const qs = p.toString();
  history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  const area = p.get("community");
  const kind = p.get("show");
  if (area && document.querySelector(`.chips [data-area="${CSS.escape(area)}"]`)) state.area = area;
  if (kind === "news" || kind === "sports") state.kind = kind;
  state.q = (p.get("q") || "").trim().slice(0, 80);
}

function applyFilters({ scroll = true } = {}) {
  syncControls();
  syncUrl();
  render();
  // Keep the reader at the top of the results instead of wherever the old list left them.
  if (scroll && els.filters.getBoundingClientRect().top <= 0) {
    $("latest").scrollIntoView({ block: "start" });
  }
}

// ------ Data ------
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function loadLatest({ silent = false } = {}) {
  if (!silent) els.status.textContent = "Loading the latest stories…";
  try {
    const data = await fetchJson(FEED_URL);
    const items = data.items || [];
    if (!items.length) throw new Error("Empty feed");
    const isNew = !state.items.length || items[0].link !== state.items[0].link;
    state.loadedAt = Date.now();

    if (silent && isNew && window.scrollY > 600) {
      // Don't yank the page out from under someone mid-read.
      state.pending = items;
      els.newPill.hidden = false;
    } else if (isNew) {
      state.items = items;
      render();
    } else {
      refreshTimes();
    }
  } catch (e) {
    console.error(e);
    if (!state.items.length) {
      els.top.innerHTML = "";
      els.grid.innerHTML = "";
      els.status.innerHTML =
        'We couldn’t load the latest stories just now. <button class="link-btn" type="button" data-retry>Try again</button>';
    }
  }
}

async function loadAds() {
  try {
    state.ads = await fetchJson(ADS_URL);
    renderAds();
    if (state.items.length) render();
  } catch (e) {
    console.warn("Could not load ads:", e);
  }
}

function boot() {
  readUrl();
  const seed = $("initial-data");
  let seeded = false;
  if (seed) {
    try {
      const data = JSON.parse(seed.textContent);
      state.items = data.items || [];
      state.ads = data.ads || state.ads;
      state.loadedAt = data.generatedAt || Date.now();
      seeded = state.items.length > 0;
    } catch (e) {
      console.warn("Bad initial data", e);
    }
  }

  if (seeded) {
    // Stories are already on the page; only re-render if a filter came in on the URL.
    if (isFiltered()) applyFilters({ scroll: false });
    else refreshTimes();
    // The pre-rendered page can be a few minutes old, so check for newer stories.
    if (Date.now() - state.loadedAt > REFRESH_MS) loadLatest({ silent: true });
  } else {
    syncControls();
    loadAds();
    loadLatest();
  }
}

// ------ Events ------
document.addEventListener("click", (e) => {
  const kindBtn = e.target.closest(".seg [data-kind]");
  if (kindBtn) {
    state.kind = kindBtn.dataset.kind;
    return applyFilters();
  }
  const areaBtn = e.target.closest(".chips [data-area]");
  if (areaBtn) {
    state.area = areaBtn.dataset.area;
    return applyFilters();
  }
  if (e.target.closest("[data-show-more]")) {
    els.list.querySelectorAll("[data-extra]").forEach((el) => (el.hidden = false));
    e.target.closest("[data-show-more]").remove();
    return;
  }
  if (e.target.closest("[data-retry]")) return loadLatest();
  const clear = e.target.closest("[data-clear]");
  if (clear) {
    if (clear.dataset.clear === "q") state.q = "";
    else state.kind = "all";
    return applyFilters({ scroll: false });
  }

  const reason = e.target.closest("[data-reason]");
  if (reason) {
    const select = $("reason");
    if (select) select.value = reason.dataset.reason;
  }
});

let searchTimer;
els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.q = els.search.value.trim();
    applyFilters({ scroll: false });
  }, 150);
});

els.newPill.addEventListener("click", () => {
  if (state.pending) state.items = state.pending;
  state.pending = null;
  els.newPill.hidden = true;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Photos are hot-linked from the network sites; if one fails, fall back to the placeholder.
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const box = img.closest(".media");
    if (box) {
      box.classList.add("media--empty");
      img.remove();
    } else {
      img.closest(".ad")?.remove();
    }
  },
  true
);

// Refresh when a reader comes back to a tab that has been sitting a while.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - state.loadedAt > REFRESH_MS) {
    loadLatest({ silent: true });
  }
});
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - state.loadedAt > REFRESH_MS) loadLatest({ silent: true });
  else refreshTimes();
}, 60 * 1000);

// ------ Mobile menu ------
const menuBtn = document.querySelector(".menu-btn");
const mobileMenu = $("mobileMenu");

function setMenu(open) {
  if (!menuBtn || !mobileMenu) return;
  mobileMenu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
}
menuBtn?.addEventListener("click", () => setMenu(mobileMenu.hidden));
mobileMenu?.addEventListener("click", (e) => {
  if (e.target.closest("a")) setMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});

// ------ Now Hiring ------
const hiringModal = $("hiringModal");
const hiringContent = $("hiringContent");

const paragraphs = (text = "") =>
  text.split("\n").filter((p) => p.trim()).map((p) => `<p>${esc(p)}</p>`).join("");
const bullets = (title, list) =>
  list?.length
    ? `<h4 class="job-section">${esc(title)}</h4><ul class="job-list">${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
    : "";

function renderHiring(positions) {
  hiringContent.innerHTML = positions
    .map(
      (pos) => `
    <article class="job">
      <h3 class="job-title">${esc(pos.title)}</h3>
      <p class="job-meta">
        <span class="job-tag">${esc(pos.location || "")}</span>
        ${pos.type ? `<span class="job-tag">${esc(pos.type)}</span>` : ""}
      </p>
      ${paragraphs(pos.description)}
      ${paragraphs(pos.about)}
      ${bullets("What you'll do", pos.responsibilities)}
      ${bullets("What we're looking for", pos.qualifications)}
      ${bullets("Requirements", pos.requirements)}
      ${bullets("What we offer", pos.benefits)}
      ${
        pos.applyEmail
          ? `<div class="job-apply">
               <h4 class="job-section">How to apply</h4>
               <a class="btn btn-navy" href="mailto:${esc(pos.applyEmail)}">Email ${esc(pos.applyEmail)}</a>
               ${pos.applyNote ? `<p class="job-note">${esc(pos.applyNote)}</p>` : ""}
             </div>`
          : ""
      }
    </article>`
    )
    .join("");
}

function openHiring() {
  setMenu(false);
  if (hiringModal && !hiringModal.open) hiringModal.showModal();
}

async function loadHiring() {
  if (!hiringModal) return;
  try {
    const data = await fetchJson("/content/hiring.json");
    if (!data.enabled || !data.positions?.length) return;

    renderHiring(data.positions);
    const teaser = $("hiringTeaser");
    if (teaser) {
      teaser.textContent =
        data.positions.length === 1
          ? data.positions[0].title
          : `${data.positions.length} open positions at Mississippi News Group.`;
    }
    document.querySelectorAll("[data-hiring-link]").forEach((link) => {
      link.hidden = false;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        openHiring();
      });
    });
    $("hiringClose")?.addEventListener("click", () => hiringModal.close());
    // Click on the backdrop closes the dialog.
    hiringModal.addEventListener("click", (e) => {
      if (e.target === hiringModal) hiringModal.close();
    });
    if (location.hash === "#hiring") openHiring();
  } catch (e) {
    console.warn("Could not load hiring data:", e);
  }
}

// ------ Go ------
const year = $("year");
if (year) year.textContent = String(new Date().getFullYear());
boot();
loadHiring();
