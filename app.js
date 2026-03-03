// ============================================================
// Mississippi News Group Hub — App Script (Redesigned)
// ============================================================

// ------ Mobile menu ------
const menuBtn = document.querySelector(".menu-btn");
const mobileMenu = document.getElementById("mobileMenu");
const menuOverlay = document.getElementById("menuOverlay");
const menuClose = document.getElementById("menuClose");

function setMenu(open) {
  if (!mobileMenu || !menuOverlay || !menuBtn) return;
  mobileMenu.hidden = !open;
  menuOverlay.hidden = !open;
  menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  document.documentElement.style.overflow = open ? "hidden" : "";
}

menuBtn?.addEventListener("click", () => setMenu(true));
menuClose?.addEventListener("click", () => setMenu(false));
menuOverlay?.addEventListener("click", () => setMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});
mobileMenu?.addEventListener("click", (e) => {
  const t = e.target;
  if (t && t.tagName === "A") setMenu(false);
});

// ------ Imports ------
import { SITES } from "./sites.js";

// ------ DOM refs ------
const els = {
  grid: document.getElementById("grid"),
  status: document.getElementById("status"),
  count: document.getElementById("count"),
  search: document.getElementById("search"),
  filter: document.getElementById("siteFilter"),
  refresh: document.getElementById("refresh"),
  sitesGrid: document.getElementById("sitesGrid"),
  quicklinks: document.getElementById("quicklinks"),
  sidebar: document.getElementById("sidebar"),
  bannerAd: document.getElementById("bannerAd"),
};

// ------ Ad state ------
let adsData = { inline: [], sidebar: [], banner: [] };
const AD_INTERVAL = 6;

// ------ Helpers ------
function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}

// ------ Render site pills, dropdown, site cards ------
function renderSites() {
  // Dropdown options
  for (const s of SITES) {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = s.name;
    els.filter.appendChild(opt);
  }

  // Site cards
  els.sitesGrid.innerHTML = SITES.map(
    (s) => `
    <a class="site" href="${s.home}" target="_blank" rel="noopener">
      <div class="site-name">${escapeHtml(s.name)}</div>
      <div class="site-url">${escapeHtml(s.home.replace("https://", ""))}</div>
    </a>
  `
  ).join("");

  // Quick links (top 6 + View all)
  const top = SITES.slice(0, 6);
  els.quicklinks.innerHTML =
    top
      .map(
        (s) => `
    <a class="qpill" href="${s.home}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a>
  `
      )
      .join("") +
    `<a class="qpill" href="#sites">View all sites →</a>`;
}

// ------ Filtering ------
let allItems = [];

function getFiltered() {
  const q = (els.search.value || "").trim().toLowerCase();
  const site = els.filter.value;
  return allItems.filter((it) => {
    if (site !== "all" && it.site !== site) return false;
    if (!q) return true;
    return (it.title || "").toLowerCase().includes(q);
  });
}

// ------ Ad card renderer ------
function renderAdCard(ad, className = "ad-card") {
  return `
    <div class="${className}">
      <a href="${escapeHtml(ad.link)}" target="_blank" rel="noopener sponsored">
        <img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.alt || ad.title)}" loading="lazy" />
      </a>
    </div>
  `;
}

// ------ Render articles ------
function renderItems(items) {
  if (!items.length) {
    els.grid.innerHTML = "";
    els.status.textContent = "No stories found (try Refresh).";
    els.count.textContent = "0";
    return;
  }
  els.status.textContent = "";
  els.count.textContent = String(items.length);

  let inlineAdIndex = 0;
  const inlineAds = adsData.inline || [];

  const html = items
    .map((it, idx) => {
      const img = it.image
        ? `<img class="thumb" src="${it.image}" alt="" loading="lazy" />`
        : `<div class="thumb" aria-hidden="true"></div>`;

      const excerpt = it.excerpt
        ? `<div class="excerpt">${escapeHtml(it.excerpt)}</div>`
        : "";

      // Local article badge style
      const badgeClass = it.isLocal
        ? 'badge" style="background:rgba(245,158,11,.10);border-color:rgba(245,158,11,.25);color:#92400e;'
        : 'badge';

      // Staggered entrance delay
      const delay = Math.min(idx * 60, 600);

      let card = `
      <article class="card" style="--delay:${delay}ms">
        <a href="${it.link}" target="_blank" rel="noopener" style="text-decoration:none;display:flex;flex-direction:column;flex:1">
          ${img}
          <div class="card-body">
            <div class="kicker">
              <span class="${badgeClass}">${escapeHtml(it.site)}</span>
              <span class="time">${escapeHtml(fmtDate(it.date))}</span>
            </div>
            <div class="title">${escapeHtml(it.title || "")}</div>
            ${excerpt}
          </div>
        </a>
      </article>
    `;

      // Insert inline ad every AD_INTERVAL articles
      if ((idx + 1) % AD_INTERVAL === 0 && inlineAds.length > 0) {
        const ad = inlineAds[inlineAdIndex % inlineAds.length];
        card += renderAdCard(ad, "ad-card");
        inlineAdIndex++;
      }

      return card;
    })
    .join("");

  els.grid.innerHTML = html;
}

// ------ Render ads ------
function renderAds() {
  // Banner ad
  if (els.bannerAd && adsData.banner && adsData.banner.length > 0) {
    const ad = adsData.banner[0];
    els.bannerAd.innerHTML = `
      <div class="ad-banner">
        <a href="${escapeHtml(ad.link)}" target="_blank" rel="noopener sponsored">
          <img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.alt || ad.title)}" />
        </a>
      </div>
    `;
  }

  // Sidebar ads
  if (els.sidebar && adsData.sidebar && adsData.sidebar.length > 0) {
    els.sidebar.innerHTML = adsData.sidebar
      .map(
        (ad) => `
      <div class="sidebar-ad">
        <a href="${escapeHtml(ad.link)}" target="_blank" rel="noopener sponsored">
          <img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.alt || ad.title)}" loading="lazy" />
        </a>
      </div>
    `
      )
      .join("");
  }
}

// ------ Fetch ads ------
async function loadAds() {
  try {
    const res = await fetch("/.netlify/functions/ads", { cache: "no-store" });
    if (res.ok) {
      adsData = await res.json();
      renderAds();
    }
  } catch (e) {
    console.warn("Could not load ads:", e);
  }
}

// ------ Fetch RSS ------
async function loadLatest() {
  els.status.textContent = "Loading the latest stories…";
  try {
    const res = await fetch("/.netlify/functions/rss?limit=36", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("RSS fetch failed");
    const data = await res.json();
    allItems = (data.items || []).slice(0, 36);
    renderItems(getFiltered());
  } catch (e) {
    els.status.textContent =
      "Could not load RSS feeds right now. Try again in a moment.";
    console.error(e);
  }
}

// ------ Wire up event listeners ------
function wireUp() {
  els.search?.addEventListener("input", () => renderItems(getFiltered()));
  els.filter?.addEventListener("change", () => renderItems(getFiltered()));
  els.refresh?.addEventListener("click", () => loadLatest());
}

// ------ Initialise ------
renderSites();
wireUp();
loadAds();
loadLatest();
