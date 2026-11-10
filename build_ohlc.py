"""Build a static, honestly sourced SPX candlestick dataset.

Source: public Yahoo ^GSPC OHLC archive maintained at
https://github.com/Alexduanran/spx-0dte-archive .
No opening prices or intraday candles are synthesized.
"""

import csv
import io
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = "https://raw.githubusercontent.com/Alexduanran/spx-0dte-archive/main/"
NY = ZoneInfo("America/New_York")


def fetch(path):
    req = urllib.request.Request(ROOT + path, headers={"User-Agent": "Market-Analytics-SPX-Chart/1.0"})
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read().decode("utf-8")


def validate_prices(values):
    try:
        prices = [round(float(value), 2) for value in values]
        if all(p > 0 for p in prices) and prices[2] <= min(prices[0], prices[3]) and prices[1] >= max(prices[0], prices[3]):
            return prices
    except (ValueError, TypeError):
        pass
    return None


def daily_rows():
    doc = json.loads(fetch("daily/_raw_spx.json"))["chart"]["result"][0]
    if doc["meta"]["symbol"] != "^GSPC":
        raise ValueError("Unexpected symbol; refusing to show non-SPX prices")
    quote = doc["indicators"]["quote"][0]
    rows = []
    for i, stamp in enumerate(doc["timestamp"]):
        prices = validate_prices([quote[k][i] for k in ("open", "high", "low", "close")])
        if prices:
            day = datetime.fromtimestamp(stamp, NY).strftime("%Y-%m-%d")
            rows.append([day, *prices])
    return rows


def intraday_file(spec):
    period, day = spec
    raw = fetch(f"spx-{period}/{day}.csv")
    rows = []
    for item in csv.DictReader(io.StringIO(raw)):
        prices = validate_prices([item[k] for k in ("open", "high", "low", "close")])
        if not prices:
            continue
        timestamp = int(datetime.strptime(day + " " + item["time"], "%Y-%m-%d %H:%M").replace(tzinfo=NY).timestamp())
        rows.append([timestamp, *prices])
    return period, day, rows


def main():
    daily = daily_rows()
    if len(daily) < 400:
        raise RuntimeError(f"Expected at least 400 daily OHLC points; got {len(daily)}")
    manifest = list(csv.DictReader(io.StringIO(fetch("index.csv"))))
    dates = sorted({item["date"] for item in manifest if item["date"] <= daily[-1][0]})
    tasks = (
        [("1m", day) for day in dates[-3:]]
        + [("5m", day) for day in dates[-12:]]
        + [("1h", day) for day in dates[-45:]]
    )
    series = {"1m": [], "5m": [], "1h": []}
    failures = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(intraday_file, spec): spec for spec in tasks}
        for future in as_completed(futures):
            try:
                period, day, rows = future.result()
                series[period].extend(rows)
            except Exception as exc:
                failures.append((futures[future], str(exc)))
    for period in series:
        series[period].sort(key=lambda row: row[0])
    if len(series["1m"]) < 300 or len(series["5m"]) < 500 or len(series["1h"]) < 100:
        raise RuntimeError(f"Insufficient intraday coverage: { {key: len(val) for key, val in series.items()} } / failures: {failures[:3]}")
    data = {
        "symbol": "SPX",
        "indexName": "S&P 500 Index",
        "source": "Yahoo Finance ^GSPC via Alexduanran/spx-0dte-archive",
        "asOf": daily[-1][0],
        "daily": daily,
        "oneMinute": series["1m"],
        "fiveMinute": series["5m"],
        "oneHour": series["1h"],
    }
    output = Path(__file__).with_name("spx-ohlc-data.js")
    output.write_text("/* Actual S&P 500 OHLC index data; historical snapshot, not live. */\nwindow.SPX_OHLC = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("as of", data["asOf"], "counts", {"daily": len(daily), **{k: len(v) for k, v in series.items()}}, "bytes", output.stat().st_size)
    if failures:
        print("Skipped unavailable files:", failures[:6])


if __name__ == "__main__":
    main()
