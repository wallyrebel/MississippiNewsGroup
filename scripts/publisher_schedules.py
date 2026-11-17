"""Check that GitHub is actually starting the network's automatic publishers."""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Maximum expected silence includes normal GitHub queue delays. RCTV has a
# twelve-hour overnight gap, and game day runs twice in the same morning.
PUBLISHERS = (
    ("alcorn", "rss_to_wp.yml", 3),
    ("DeltaAuto", "rss_to_wp.yml", 1.5),
    ("desotocountynews", "rss_to_wp.yml", 1.5),
    ("Wordpress", "rss-automation.yml", 3),
    ("Oxford", "publish_news.yml", 1.5),
    ("prentiss", "rss_to_wp.yml", 7),
    ("MississippiSports", "rss_to_wp.yml", 3),
    ("tippah", "rss_to_wp.yml", 1.5),
    ("tippahsports", "rss_to_wp.yml", 3),
    ("tippahsports", "gameday_article.yml", 28),
    ("tupelo", "rss_to_wp.yml", 1.5),
    ("union", "rss_to_wp.yml", 1.5),
    ("rctv19", "rss-automation.yml", 16),
)


def assess(state, runs, max_hours, now):
    if state != "active":
        return state
    if not runs:
        return "no scheduled runs"
    age = now - datetime.fromisoformat(runs[0]["created_at"].replace("Z", "+00:00"))
    if age.total_seconds() > max_hours * 3600:
        return "overdue"
    for run in runs:
        if run["status"] == "completed":
            if run["conclusion"] != "success":
                return "last completed run " + str(run["conclusion"])
            completed = datetime.fromisoformat(run.get("updated_at", run["created_at"]).replace("Z", "+00:00"))
            if (now - completed).total_seconds() > 2 * max_hours * 3600:
                return "no recent completed run"
            return "healthy"
    return "no recent completed run"


def inspect(entry):
    repo, filename, hours = entry
    base = f"https://api.github.com/repos/wallyrebel/{repo}/actions/workflows/{filename}"
    record = {"repo": repo, "workflow": filename, "max_hours": hours}
    try:
        with requests.Session() as session:
            session.headers["Accept"] = "application/vnd.github+json"
            if os.environ.get("GITHUB_TOKEN"):
                session.headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
            session.mount("https://", HTTPAdapter(max_retries=Retry(total=2, backoff_factor=0.5,
                          status_forcelist=(500, 502, 503, 504), respect_retry_after_header=False)))
            metadata = session.get(base, timeout=(5, 15))
            metadata.raise_for_status()
            record["workflow_state"] = metadata.json()["state"]
            # GitHub schedules run on the default branch, including DeSoto's master.
            response = session.get(base + "/runs", params={"event": "schedule", "per_page": 10},
                                   timeout=(5, 15))
            response.raise_for_status()
            runs = response.json()["workflow_runs"]
        record["result"] = assess(record["workflow_state"], runs, hours, datetime.now(timezone.utc))
        for key, run in (("latest_scheduled", next(iter(runs), None)),
                         ("latest_completed", next((r for r in runs if r["status"] == "completed"), None))):
            if run:
                record[key] = {k: run[k] for k in ("created_at", "status", "conclusion", "html_url")}
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        record.update(result="unverified", error=type(exc).__name__)
    return record


def main():
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(inspect, PUBLISHERS))
    Path("publisher-schedules.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    lines = ["## Scheduled publisher health", "", "| Publisher | Latest scheduled start (UTC) | Status |",
             "|---|---|---|"]
    for row in results:
        run = row.get("latest_scheduled", {})
        stamp = f"[{run['created_at']}]({run['html_url']})" if run else "—"
        lines.append(f"| {row['repo']} / {row['workflow']} | {stamp} | {row['result']} |")
    summary = "\n".join(lines)
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as out:
            print(summary, file=out)
    return int(any(r["result"] != "healthy" for r in results))


if __name__ == "__main__":
    raise SystemExit(main())
