"""Refresh independently sourced VIX and S&P 500 breadth context.

The Cboe VIX history is official; the breadth series is from a third-party
current-constituent S&P 500 universe and has selection/survivorship bias.
Never fabricate values; on download failure preserve previous verified data.
"""
from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VIX_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"
BREADTH_URL = "https://raw.githubusercontent.com/DeanFinancials/deanfi-data/main/advance-decline/ad_line_historical.json"
USER_AGENT = "Mozilla/5.0 SPX-Market-Analytics/1.0"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.read().decode("utf-8-sig")


def read_existing(path: Path, variable: str):
    if not path.exists():
        return {}
    m = re.search(r"window\." + re.escape(variable) + r"\s*=\s*(\{.*?\})\s*;\s*$",
                  path.read_text(encoding="utf-8"), re.DOTALL)
    return json.loads(m.group(1)) if m else {}


def render(variable: str, data: dict, comment: str) -> str:
    return "/* " + comment + " */\nwindow." + variable + " = " + json.dumps(
        data, ensure_ascii=False, separators=(",", ":")) + ";\n"


def iso_date(text: str) -> str:
    text = text.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError("Invalid Cboe date format: " + text)


def prepare_vix(text: str) -> dict:
    rows = text.splitlines()
    header = next((i for i, row in enumerate(rows)
                   if row.strip().upper().startswith("DATE,")), None)
    if header is None:
        raise ValueError("Cboe VIX CSV header missing")
    reader = csv.DictReader(io.StringIO("\n".join(rows[header:])))
    found = {}
    for row in reader:
        try:
            date = iso_date(row["DATE"])
            value = round(float(row["CLOSE"]), 4)
            if 1 <= value <= 200:
                found[date] = value
        except (KeyError, ValueError, TypeError):
            continue
    daily = sorted(found.items())
    if len(daily) < 7500 or daily[0][0] > "1990-01-03":
        raise ValueError("Incomplete official VIX history")
    # Use last trading day's Cboe CLOSE for each month. The live partial
    # month is excluded from monthly predictive context until complete.
    final = {}
    for date, value in daily:
        final[date[:7] + "-01"] = value
    latest = daily[-1][0]
    partial_month = latest[:7] + "-01"
    today_month = datetime.now(timezone.utc).strftime("%Y-%m-01")
    if partial_month >= today_month:
        del final[partial_month]
    monthly = [[month, value] for month, value in sorted(final.items())]
    return {
        "symbol": "VIX", "source": "Cboe official VIX_History.csv",
        "asOfMonth": monthly[-1][0],
        "asOfDaily": latest,
        "latestDaily": list(daily[-1]),
        "monthly": monthly
    }


def prepare_breadth(text: str, latest_spx_day: str) -> dict:
    payload = json.loads(text)
    meta = payload["metadata"]
    if meta.get("universe") != "S&P 500":
        raise ValueError("Expected S&P 500 universe in breadth feed")
    observations = {}
    for row in payload["data"]:
        date = str(row["date"])
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) or date > latest_spx_day:
            continue
        up, down, ad = int(row["advances"]), int(row["declines"]), float(row["ad_line"])
        if 0 <= up <= 800 and 0 <= down <= 800 and up + down > 0:
            observations[date] = [date, up, down, round(ad, 2)]
    daily = [observations[key] for key in sorted(observations)]
    if len(daily) < 100:
        raise ValueError("Not enough non-missing historical breadth observations")
    return {
        "source": "DeanFinancials current-constituent S&P 500 advance-decline archive",
        "asOf": daily[-1][0],
        "generatedAt": meta.get("generated_at"),
        "nConstituents": int(meta.get("total_stocks", 0)),
        "disclaimer": "Current constituent universe: can introduce survivorship/selection bias",
        "daily": daily,
    }


def asset_buster(html: str, filename: str, data_date: str) -> str:
    pattern = r'(src="\./' + re.escape(filename) + r')(?:\?[^"]*)?(")'
    updated, count = re.subn(pattern,
        lambda m: m.group(1) + "?asof=" + data_date + m.group(2),
        html, count=1)
    if count != 1:
        raise ValueError("Missing asset tag " + filename)
    return updated


def run():
    index_path = ROOT / "index.html"
    html = index_path.read_text(encoding="utf-8")
    spx_text = (ROOT / "spx-ohlc-data.js").read_text(encoding="utf-8")
    spx_match = re.search(r'"asOf":"(\d{4}-\d{2}-\d{2})"', spx_text)
    if spx_match is None:
        raise ValueError("SPX dataset asOf missing")
    spx_date = spx_match.group(1)

    sources = [
        ("VIX", ROOT / "spx-vix-data.js", VIX_URL, "SPX_VIX"),
        ("breadth", ROOT / "spx-breadth-data.js", BREADTH_URL, "SPX_BREADTH"),
    ]
    updates = []
    for label, path, url, variable in sources:
        try:
            fresh_text = fetch(url)
            data = prepare_vix(fresh_text) if label == "VIX" else prepare_breadth(fresh_text, spx_date)
            old = read_existing(path, variable)
            date_key = "asOfDaily" if label == "VIX" else "asOf"
            previous_key = "asOfDaily" if label == "VIX" else "asOf"
            if data[date_key] < old.get(previous_key, ""):
                raise ValueError("Refusing older " + label + " data")
            buster_date = data[date_key]
            new_html = asset_buster(html, path.name, buster_date)
            output = render(variable, data, label + " sourced market context; no invented observations")
            updates.append((path, output))
            html = new_html
            print(label, "context:", data[date_key])
        except (OSError, KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
            print("Retaining prior", label, "data because refresh failed:", exc)
    for path, body in updates:
        if not path.exists() or path.read_text(encoding="utf-8") != body:
            path.write_text(body, encoding="utf-8")
    if html != index_path.read_text(encoding="utf-8"):
        index_path.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    run()
