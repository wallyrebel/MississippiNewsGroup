// netlify/functions/rss.js
// Server-side RSS fetcher to avoid browser CORS issues.
// Returns a merged, newest-first list of items with best-effort featured images.
// Also includes local articles from content/articles/ folder.

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const Parser = require("rss-parser");
const fetch = require("node-fetch");

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "creator"]
    ],
  },
});

const SITES = [
  { "name": "Alcorn County News", "home": "https://alcornnewsms.com", "feed": "https://alcornnewsms.com/feed/" },
  { "name": "Alcorn County Sports", "home": "https://alcornsportsms.com", "feed": "https://alcornsportsms.com/feed/" },
  { "name": "Benton County Sports", "home": "https://bentonsportsms.com", "feed": "https://bentonsportsms.com/feed/" },
  { "name": "Mississippi Delta Report", "home": "https://mississippideltareport.com", "feed": "https://mississippideltareport.com/feed/" },
  { "name": "DeSoto County News", "home": "https://desotocountynews.com", "feed": "https://desotocountynews.com/feed/" },
  { "name": "Lee County Sports", "home": "https://leesportsms.com", "feed": "https://leesportsms.com/feed/" },
  { "name": "Mississippi News", "home": "https://msnewsgroup.com", "feed": "https://msnewsgroup.com/feed/" },
  { "name": "Oxford News", "home": "https://oxfordmsnews.com", "feed": "https://oxfordmsnews.com/feed/" },
  { "name": "Pontotoc News", "home": "https://pontotocnews.com", "feed": "https://pontotocnews.com/feed/" },
  { "name": "Prentiss County News", "home": "https://prentissnews.com", "feed": "https://prentissnews.com/feed/" },
  { "name": "Prentiss County Sports", "home": "https://prentisssportsms.com", "feed": "https://prentisssportsms.com/feed/" },
  { "name": "Mississippi Sports", "home": "https://sportsmississippi.com", "feed": "https://sportsmississippi.com/feed/" },
  { "name": "Tippah County News", "home": "https://tippahnews.com", "feed": "https://tippahnews.com/feed/" },
  { "name": "Tippah County Sports", "home": "https://tippahsports.com", "feed": "https://tippahsports.com/feed/" },
  { "name": "Tupelo News", "home": "https://newstupelo.com", "feed": "https://newstupelo.com/feed/" },
  { "name": "Union County News", "home": "https://unionnewsms.com", "feed": "https://unionnewsms.com/feed/" },
  { "name": "Union County Sports", "home": "https://unionsportsms.com", "feed": "https://unionsportsms.com/feed/" }
];

function pickImage(item) {
  // Try media:content / media:thumbnail (common in WP with featured images)
  const mc = item.mediaContent;
  if (mc) {
    if (Array.isArray(mc)) {
      const url = mc[0]?.$?.url || mc[0]?.url;
      if (url) return url;
    } else {
      const url = mc?.$?.url || mc?.url;
      if (url) return url;
    }
  }
  const mt = item.mediaThumbnail;
  if (mt) {
    if (Array.isArray(mt)) {
      const url = mt[0]?.$?.url || mt[0]?.url;
      if (url) return url;
    } else {
      const url = mt?.$?.url || mt?.url;
      if (url) return url;
    }
  }

  // Try enclosure
  if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith("image/")) {
    return item.enclosure.url;
  }

  // Try first <img> in content:encoded or content
  const html = item.contentEncoded || item["content:encoded"] || item.content || "";
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (m && m[1]) return m[1];

  return "";
}

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFrom(item) {
  const src = item.contentSnippet || stripHtml(item.contentEncoded || item.content || "");
  if (!src) return "";
  return src.length > 140 ? src.slice(0, 140).trim() + "…" : src;
}

async function fetchFeed(site, perSiteLimit) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 9000);

  try {
    // rss-parser can take a URL, but we fetch ourselves to ensure redirects/timeouts behave.
    const resp = await fetch(site.feed, { signal: controller.signal, headers: { "User-Agent": "MNGHubRSS/1.0 (+Netlify Function)" } });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const feed = await parser.parseString(xml);

    const items = (feed.items || []).slice(0, perSiteLimit).map(it => ({
      site: site.name,
      siteHome: site.home,
      title: it.title || "",
      link: it.link || "",
      date: it.isoDate || it.pubDate || "",
      image: pickImage(it),
      excerpt: excerptFrom(it),
      isLocal: false
    })).filter(x => x.title && x.link);

    return items;
  } catch (e) {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// Read local articles from content/articles/ folder
const ARTICLES_DIR = path.join(__dirname, "../../content/articles");

function getLocalArticles() {
  const articles = [];

  // Check if articles directory exists
  if (!fs.existsSync(ARTICLES_DIR)) {
    return articles;
  }

  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith(".md"));

  for (const file of files) {
    try {
      const filePath = path.join(ARTICLES_DIR, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const { data, content: body } = matter(content);

      // Only include articles with a date in the past or now
      const pubDate = new Date(data.date);
      if (pubDate > new Date()) continue; // Skip future articles

      // Generate excerpt from body if not provided
      let excerpt = data.excerpt || "";
      if (!excerpt && body) {
        const stripped = stripHtml(body);
        excerpt = stripped.length > 140 ? stripped.slice(0, 140).trim() + "…" : stripped;
      }

      articles.push({
        site: data.site || "Mississippi News Group",
        siteHome: "https://mississippinewsgroup.com",
        title: data.title || "",
        link: `/articles/${file.replace(".md", "")}`, // Link to local article page
        date: data.date ? new Date(data.date).toISOString() : "",
        image: data.image || "",
        excerpt: excerpt,
        isLocal: true
      });
    } catch (e) {
      console.error(`Error reading article file ${file}:`, e.message);
    }
  }

  return articles;
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qs.limit || "36", 10) || 36, 100);
  const perSite = Math.max(3, Math.ceil(limit / SITES.length) + 2);

  // Fetch RSS feeds and local articles in parallel
  const [rssResults, localArticles] = await Promise.all([
    Promise.allSettled(SITES.map(s => fetchFeed(s, perSite))),
    Promise.resolve(getLocalArticles())
  ]);

  let items = [];
  for (const r of rssResults) {
    if (r.status === "fulfilled") items = items.concat(r.value);
  }

  // Add local articles
  items = items.concat(localArticles);

  // Sort newest first; fall back to 0 date
  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  items = items.slice(0, limit);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300" // 5 minutes
    },
    body: JSON.stringify({ items })
  };
};
