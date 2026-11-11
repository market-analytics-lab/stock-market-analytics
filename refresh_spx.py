"""Refresh genuine SPX OHLC and the 1871+ monthly chart without inventing bars.

Runs after the U.S. cash-session close (3:30 p.m. America/Chicago).
The Yahoo ^GSPC chart endpoint is attempted first because the public archival
mirror may publish its post-close update later in the evening.

There are no credentials or proprietary data requirements. If a source is
unavailable, previously verified observations remain intact.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from build_ohlc import daily_rows as archive_daily_rows
from build_ohlc import validate_prices


DIRECTORY = Path(__file__).resolve().parent
NEW_YORK = ZoneInfo("America/New_York")
DATA_START = "2026-10-01"  # From here onward monthly levels use mean daily closes.
USER_AGENT = "Mozilla/5.0 (compatible; SPX-Market-Analytics/1.0)"


def read_ohlc(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"window\.SPX_OHLC\s*=\s*(\{.*\})\s*;", text, re.DOTALL)
    if not match:
        raise ValueError(f"SPX OHLC assignment missing from {path}")
    data = json.loads(match.group(1))
    if data.get("symbol") != "SPX":
        raise ValueError("Refusing a non-SPX OHLC source")
    return data


def read_monthly(path: Path) -> list[list]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"monthly:\s*(\[\[.*\]\])\s*\n\}\);", text, re.DOTALL)
    if not match:
        raise ValueError(f"Historical monthly S&P data missing from {path}")
    monthly = json.loads(match.group(1))
    if not monthly or monthly[0][0] != "1871-01-01":
        raise ValueError("Historical S&P Composite must start in January 1871")
    if any(monthly[i][0] >= monthly[i + 1][0] for i in range(len(monthly) - 1)):
        raise ValueError("Historical monthly dates are out of order")
    return monthly


def yahoo_bars(interval: str, period: str) -> list[list]:
    params = urllib.parse.urlencode({
        "range": period,
        "interval": interval,
        "includePrePost": "false",
        "events": "history",
    })
    last_error = None
    for attempt, host in enumerate(("query1.finance.yahoo.com", "query2.finance.yahoo.com")):
        url = f"https://{host}/v8/finance/chart/%5EGSPC?{params}"
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/json",
                "Referer": "https://finance.yahoo.com/",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=22) as response:
                result = json.load(response)["chart"]["result"][0]
            if result["meta"]["symbol"] != "^GSPC":
                raise ValueError("Yahoo did not return the S&P 500 index")
            quote = result["indicators"]["quote"][0]
            found = {}
            for i, timestamp in enumerate(result.get("timestamp", [])):
                values = validate_prices([quote[key][i] for key in ("open", "high", "low", "close")])
                if values is None:
                    continue
                date_key = datetime.fromtimestamp(timestamp, NEW_YORK).strftime("%Y-%m-%d")
                key = date_key if interval == "1d" else int(timestamp)
                found[key] = [key, *values]
            time.sleep(1.0)  # Avoid hammering the shared chart-data endpoint.
            return [found[key] for key in sorted(found)]
        except (OSError, ValueError, KeyError, IndexError, TypeError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(2)
    raise RuntimeError(f"Yahoo {interval}/{period} unavailable: {last_error}")


def merge_by_key(old: list[list], new: list[list]) -> list[list]:
    combined = {row[0]: row for row in old}
    combined.update({row[0]: row for row in new})
    return [combined[key] for key in sorted(combined)]


def recent_sessions(rows: list[list], count: int) -> list[list]:
    if not rows:
        return []
    sessions = [datetime.fromtimestamp(row[0], NEW_YORK).date().isoformat() for row in rows]
    kept = set(sorted(set(sessions))[-count:])
    return [row for row, session in zip(rows, sessions) if session in kept]


def prepare_ohlc(existing: dict, fresh: dict[str, list[list]]) -> dict:
    incoming_daily = fresh["daily"]
    if incoming_daily and len(incoming_daily) < 100:
        raise ValueError("Rejected incomplete daily S&P 500 download")
    daily = merge_by_key(existing["daily"], incoming_daily)[-4000:]
    if len(daily) < 400:
        raise ValueError("Too few authentic daily SPX observations")
    names = {"oneMinute": (3, "1m"), "fiveMinute": (12, "5m"), "oneHour": (45, "60m")}
    result = {
        "symbol": "SPX",
        "indexName": "S&P 500 Index",
        "source": "Yahoo Finance ^GSPC chart API; archived Yahoo fallback",
        "asOf": daily[-1][0],
        "daily": daily,
    }
    for target, (sessions, source_name) in names.items():
        old = existing.get(target, [])
        result[target] = recent_sessions(merge_by_key(old, fresh[source_name]), sessions)
    return result


def prepare_monthly(existing_monthly: list[list], daily: list[list], as_of: str) -> dict:
    prefix = [row for row in existing_monthly if row[0] < DATA_START]
    months = defaultdict(list)
    for day, _open, _high, _low, close in daily:
        if day >= DATA_START and day <= as_of:
            months[day[:7] + "-01"].append(close)
    monthly = prefix + [
        [month, round(sum(closes) / len(closes), 2)]
        for month, closes in sorted(months.items())
    ]
    if not monthly or monthly[0][0] != "1871-01-01":
        raise ValueError("Cannot regenerate historical series")
    latest_month = as_of[:7] + "-01"
    complete = [month for month, _ in monthly if month < latest_month]
    return {
        "symbol": "SPX",
        "start": "1871-01-01",
        "lastCompleteMonth": complete[-1] if complete else "1871-01-01",
        "latestMonthPartial": monthly[-1][0] == latest_month,
        "asOf": as_of,
        "monthly": monthly,
    }


def render_ohlc(data: dict) -> str:
    return (
        "/* Genuine S&P 500 index OHLC, refreshed after the cash-session close. */\n"
        "window.SPX_OHLC = "
        + json.dumps(data, separators=(",", ":"))
        + ";\n"
    )


def render_monthly(data: dict) -> str:
    keys = ("symbol", "start", "lastCompleteMonth", "latestMonthPartial", "asOf", "monthly")
    lines = [
        '"use strict";',
        "/* Reconstructed monthly S&P Composite from Jan 1871; newer monthly",
        " * values are means of actual ^GSPC daily closes, not OHLC candles.",
        " * Jan 1871–Sep 2026: Robert Shiller / datasets/s-and-p-500.",
        " */",
        "window.SPX_HISTORY = Object.freeze({",
    ]
    for key in keys:
        encoded = json.dumps(data[key], separators=(",", ":"))
        lines.append(f"  {key}: {encoded}{',' if key != keys[-1] else ''}")
    return "\n".join(lines + ["});", ""])


def versioned_index(html: str, as_of: str) -> str:
    # New URL per trading day bypasses browser/CDN caches of static JS datasets.
    updated = html
    for filename in ("spx-ohlc-data.js", "spx-history-data.js"):
        pattern = rf'(src="./{re.escape(filename)})(?:\?[^"]*)?(")'
        updated, count = re.subn(
            pattern, lambda match: f"{match.group(1)}?asof={as_of}{match.group(2)}",
            updated, count=1,
        )
        if count != 1:
            raise ValueError(f"Missing script element in index.html: {filename}")
    return updated


def main() -> int:
    ohlc_path = DIRECTORY / "spx-ohlc-data.js"
    monthly_path = DIRECTORY / "spx-history-data.js"
    index_path = DIRECTORY / "index.html"
    previous = read_ohlc(ohlc_path)
    history = read_monthly(monthly_path)
    fresh: dict[str, list[list]] = {"daily": [], "1m": [], "5m": [], "60m": []}

    for name, interval, period in (
        ("daily", "1d", "2y"),
        ("1m", "1m", "5d"),
        ("5m", "5m", "1mo"),
        ("60m", "60m", "3mo"),
    ):
        try:
            fresh[name] = yahoo_bars(interval, period)
            print(f"Yahoo {name}: {len(fresh[name])} valid bars")
        except RuntimeError as exc:
            print(f"Warning: {exc}", file=sys.stderr)

    if not fresh["daily"]:
        try:
            fresh["daily"] = archive_daily_rows()
            print(f"Archived Yahoo daily fallback: {len(fresh['daily'])} bars")
        except (OSError, RuntimeError, ValueError, KeyError) as exc:
            print(f"Warning: historical archive unavailable: {exc}", file=sys.stderr)

    if not fresh["daily"]:
        # Never overwrite good chart data with empty or fabricated candles.
        print("No fresh daily SPX source; retaining the previous chart.")
        return 0

    updated = prepare_ohlc(previous, fresh)
    if updated["asOf"] < previous["asOf"]:
        raise ValueError("Refusing to replace existing SPX chart with older prices")
    if updated["asOf"] == previous["asOf"]:
        print(f"SPX daily data unchanged ({updated['asOf']}); nothing to publish")
        return 0

    new_history = prepare_monthly(history, updated["daily"], updated["asOf"])
    # Validate both datasets before writing either artifact.
    ohlc_content = render_ohlc(updated)
    monthly_content = render_monthly(new_history)
    json.loads(re.search(r"window\.SPX_OHLC = (\{.*\});", ohlc_content).group(1))
    if new_history["monthly"][-1][0] != updated["asOf"][:7] + "-01":
        raise ValueError("Monthly history is not aligned with the newest SPX day")
    index_content = versioned_index(index_path.read_text(encoding="utf-8"), updated["asOf"])
    ohlc_path.write_text(ohlc_content, encoding="utf-8")
    monthly_path.write_text(monthly_content, encoding="utf-8")
    index_path.write_text(index_content, encoding="utf-8")
    print(f"Refreshed SPX through {updated['asOf']} with {len(updated['daily'])} daily bars "
          f"and {len(new_history['monthly'])} monthly levels since January 1871")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
