"""Check a completed Chicago news day against each site's public archive."""
import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

CENTRAL = ZoneInfo("America/Chicago")
ROOT = Path(__file__).resolve().parents[1]
HEADERS = {"User-Agent": "MississippiNewsGroup/1.0 (public coverage check)"}


def get(url, **kwargs):
    response = requests.get(url, headers=HEADERS, timeout=(7, 22), **kwargs)
    response.raise_for_status()
    return response


def wordpress(home, day):
    # WordPress's REST date filter can use site-local time. Widen the query,
    # then assign each post to its Chicago calendar day using its UTC stamp.
    params = {"after": f"{day-timedelta(days=1)}T00:00:00",
              "before": f"{day+timedelta(days=2)}T00:00:00", "per_page": 100,
              "orderby": "id", "order": "asc", "_fields": "id,date_gmt,title,content,link"}
    posts = {}
    for page in range(1, 51):
        res = get(home + "/wp-json/wp/v2/posts", params={**params, "page": page})
        for item in res.json():
            stamp = datetime.fromisoformat(item["date_gmt"]).replace(tzinfo=timezone.utc)
            if stamp.astimezone(CENTRAL).date() == day:
                posts[item["id"]] = (item["title"]["rendered"], item["link"], item["content"]["rendered"])
        if page >= int(res.headers["X-WP-TotalPages"]):
            return list(posts.values()), True
    raise ValueError("Archive pagination exceeded its limit")


def rctv(home, day):
    feed = ElementTree.fromstring(get(home + "/feed.xml").content)
    rows, dates = [], []
    for item in feed.findall("./channel/item"):
        # Eleventy encodes the printed editorial date as midnight UTC.
        published = parsedate_to_datetime(item.findtext("pubDate")).date()
        dates.append(published)
        if published != day:
            continue
        url = item.findtext("link")
        if urlsplit(url).netloc != urlsplit(home).netloc:
            raise ValueError("Unexpected RCTV article host")
        page = BeautifulSoup(get(url).content, "html.parser")
        body = page.select_one("article .post-content")
        if not body:
            raise ValueError("RCTV article body unavailable")
        rows.append((item.findtext("title"), url, str(body)))
    return rows, bool(dates and min(dates) < day)


def review_posts(rows):
    articles, titles = [], set()
    for title, url, body in rows:
        title = BeautifulSoup(title, "html.parser").get_text(" ", strip=True)
        soup = BeautifulSoup(body, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = soup.get_text(" ", strip=True)
        normalized = " ".join(re.findall(r"\w+", title.casefold()))
        flags = []
        if "as an amazon associate" in text.casefold() or "earn from qualifying purchases" in text.casefold():
            flags.append("affiliate shopping")
        if not text or not normalized:
            flags.append("empty title or body")
        if normalized in titles:
            flags.append("repeated headline")
        if not flags:
            titles.add(normalized)
        articles.append({"title": title, "link": url, "words": len(text.split()), "exclusions": flags})
    return articles


def inspect(site, day):
    item = {"site": site["name"], "home": site["home"]}
    try:
        reader = rctv if site["home"] == "https://rctv19.com" else wordpress
        rows, complete = reader(site["home"], day)
        articles = review_posts(rows)
        count = sum(not a["exclusions"] for a in articles)
        state = "met" if count >= 2 else "below two" if complete else "incomplete feed"
        return {**item, "public_posts": len(rows), "distinct_noncommercial": count, "state": state,
                "complete": complete, "articles": articles}
    except (requests.RequestException, ValueError, KeyError, TypeError, ElementTree.ParseError) as exc:
        return {**item, "state": "unverified", "error": type(exc).__name__}


def main():
    yesterday = datetime.now(CENTRAL).date() - timedelta(days=1)
    parser = argparse.ArgumentParser()
    parser.add_argument("--day", type=date.fromisoformat, default=yesterday)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if args.day > yesterday:
        parser.error("Select a completed Chicago calendar day")
    catalog = (ROOT / "sites.js").read_text(encoding="utf-8").split("const SITES =", 1)[1].lstrip()
    sites, _ = json.JSONDecoder().raw_decode(catalog)
    sites.append({"name": "RCTV19", "home": "https://rctv19.com"})
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(lambda site: inspect(site, args.day), sites))
    report = {"chicago_day": args.day.isoformat(), "sites": results}
    if args.report:
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = [f"## Public article output for {args.day}", "",
             "Two distinct noncommercial posts is the minimum. All additional posts are counted. "
             "The artifact lists headlines and links for editorial review. Public totals include every producer.",
             "", "| Site | Public posts | Distinct noncommercial | Result |", "|---|---:|---:|---|"]
    for result in results:
        minimum = "≥" if result.get("complete") is False else ""
        lines.append(f"| {result['site']} | {minimum}{result.get('public_posts', '—')} | "
                     f"{minimum}{result.get('distinct_noncommercial', '—')} | {result['state']} |")
    above_two = sum(r.get("distinct_noncommercial", 0) > 2 for r in results)
    majority = above_two > len(results) // 2
    lines += ["", f"{above_two} of {len(results)} sites have three or more distinct noncommercial posts. "
              f"Network majority goal: {'met' if majority else 'unconfirmed or below target'}."]
    summary = "\n".join(lines)
    print(summary)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            print(summary, file=out)
    return int(not majority or any(r["state"] != "met" for r in results))


if __name__ == "__main__":
    raise SystemExit(main())
