"""One-time deep-history backfill of actual published Yahoo ^GSPC daily OHLC.

1957 onward is the modern S&P 500 era; earlier index history is reconstructed.
Zero-range/flat OHLC observations can be close-only vendor placeholders:
preserve them for level browsing but flag explicitly, and NEVER use their
wicks for candlestick mining. No synthetic opens, highs or lows are created.

The existing 3:30 PM CT daily refresh continues updating the small recent
SPX dataset; refresh_spx_long.py merges its genuine newer observations into
the deep history archive.
"""
from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from pathlib import Path

from refresh_spx import yahoo_bars, read_ohlc

ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "spx-long-ohlc.js"
INDEX = ROOT / "index.html"
START = "1957-03-04"
SECONDARY = "https://raw.githubusercontent.com/vijinho/sp500/master/csv/sp500.csv"

def parse_yahoo_csv(text: str) -> list[list]:
    reader = csv.DictReader(io.StringIO(text))
    found = {}
    for row in reader:
        lowkeys = {k.lower().strip(): v for k, v in row.items() if k}
        date = (lowkeys.get("date") or "")[:10]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",date):
            continue
        try:
            open_, high, low, close = (round(float(lowkeys[k]),2)
                 for k in ("open","high","low","close"))
            if min(open_,high,low,close)>0 and high>=max(open_,close) and low<=min(open_,close):
                found[date]=[date,open_,high,low,close]
        except (ValueError,KeyError,TypeError):
            pass
    return [found[key] for key in sorted(found)]

def csv_fallback() -> list[list]:
    request=urllib.request.Request(SECONDARY,headers={"User-Agent":"Mozilla/5.0 SPX historical research"})
    with urllib.request.urlopen(request,timeout=80) as response:
        return parse_yahoo_csv(response.read().decode("utf-8-sig"))

def merge_history(history: list[list], recent: list[list]) -> list[list]:
    combined={row[0]:row for row in history if row[0]>=START}
    combined.update({row[0]:row for row in recent if row[0]>=START})
    ordered=[combined[date] for date in sorted(combined)]
    if not ordered or ordered[0][0]>"1960-01-01":
        raise ValueError("Source did not provide authentic index observations from the 1950s")
    if len(ordered)<14000:
        raise ValueError(f"Only {len(ordered)} genuine daily SPX observations; expected >=14,000")
    if any(row[2]<max(row[1],row[4])-.011 or row[3]>min(row[1],row[4])+.011 for row in ordered):
        raise ValueError("Invalid OHLC record in historical source")
    # No duplicated dates; historical gaps are not fabricated.
    return ordered

def metadata(rows: list[list], source: str) -> dict:
    flat=[row for row in rows if abs(row[2]-row[3])<=.011]
    nonflat=[row for row in rows if row not in flat]
    return {
       "symbol":"SPX","firstDate":rows[0][0],"asOf":rows[-1][0],
       "source":source,
       "note":"Modern S&P 500 begins March 4 1957. Some older vendor O/H/L/C are identical and do not support wick research.",
       "flatOHLCCount":len(flat),
       "firstNonFlatDate":nonflat[0][0] if nonflat else None,
       "daily":rows
    }

def main():
    existing=read_ohlc(ROOT/"spx-ohlc-data.js")
    try:
        fetched=yahoo_bars("1d","max")
        source="Yahoo Finance ^GSPC original daily chart data (long-range request)"
        print("Yahoo max returned",len(fetched),"daily bars")
        if len([row for row in fetched if row[0]>=START]) < 14000:
            raise ValueError("Yahoo max returned incomplete long history")
    except (OSError,RuntimeError,ValueError,KeyError,IndexError) as exc:
        print("Yahoo max unavailable, trying archived Yahoo CSV:",exc)
        fetched=csv_fallback()
        source="Yahoo ^GSPC archive (vijinho/sp500), merged with current genuine daily ^GSPC"
    rows=merge_history(fetched,existing["daily"])
    dataset=metadata(rows,source)
    content='/* Published SPX/Yahoo historical daily OHLC; flat OHLC bars may lack real intraday ranges. */\nwindow.SPX_LONG_OHLC = '+json.dumps(dataset,separators=(",",":"))+';\n'
    ARCHIVE.write_text(content,encoding="utf-8")
    html=INDEX.read_text(encoding="utf-8")
    pattern=r'(src="\./spx-long-ohlc\.js)(?:\?[^"]*)?(")'
    new,n=re.subn(pattern,lambda m:m.group(1)+"?asof="+rows[-1][0]+"-backfill"+m.group(2),html,count=1)
    if n!=1:raise ValueError("Long-history asset element is not in index.html")
    INDEX.write_text(new,encoding="utf-8")
    print("SPX historical candles",len(rows),rows[0][0],"through",rows[-1][0],
          "; flat OHLC",dataset["flatOHLCCount"],"; first nonflat",dataset["firstNonFlatDate"])

if __name__=="__main__":main()
