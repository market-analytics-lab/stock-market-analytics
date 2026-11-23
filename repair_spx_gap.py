"""Fill any missing multi-year SPX historical OHLC gap using published daily bars.
No imputation. Only genuine daily prices from independent recognized index feeds.
"""
from __future__ import annotations
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone

from backfill_spx_daily import parse_yahoo_csv
from refresh_spx import yahoo_bars
from refresh_spx_long import load_old

ROOT=Path(__file__).resolve().parent
DATA=ROOT/"spx-long-ohlc.js"
START="2018-12-01"
END="2024-12-01"

def missing_gaps(rows):
    gaps=[]
    for before,after in zip(rows,rows[1:]):
        days=(datetime.fromisoformat(after[0])-datetime.fromisoformat(before[0])).days
        if days>14:gaps.append((before[0],after[0],days))
    return gaps

def yahoo_periods():
    start=int(datetime(2018,12,1,tzinfo=timezone.utc).timestamp())
    end=int(datetime(2024,12,1,tzinfo=timezone.utc).timestamp())
    params=urllib.parse.urlencode({"period1":start,"period2":end,"interval":"1d","events":"history"})
    for host in ["query1.finance.yahoo.com","query2.finance.yahoo.com"]:
        url=f"https://{host}/v8/finance/chart/%5EGSPC?{params}"
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"application/json",
          "Referer":"https://finance.yahoo.com/"})
        try:
            with urllib.request.urlopen(req,timeout=35) as response:
                payload=json.load(response)
            item=payload["chart"]["result"][0]
            if item["meta"]["symbol"]!="^GSPC":continue
            quote=item["indicators"]["quote"][0]
            found={}
            for i,tstamp in enumerate(item.get("timestamp",[])):
                date=datetime.fromtimestamp(tstamp,timezone.utc).date().isoformat()
                vals=[quote.get(name,[])[i] for name in ["open","high","low","close"]]
                if all(isinstance(x,(float,int)) for x in vals):
                    o,h,l,c=[round(float(x),2) for x in vals]
                    if min(o,h,l,c)>0 and h>=max(o,c)-.011 and l<=min(o,c)+.011:
                        found[date]=[date,o,max(h,o,c),min(l,o,c),c]
            print("Yahoo explicit-date span:",host,len(found),"bars",flush=True)
            if len(found)>1200:return list(sorted(found.values()))
        except (OSError,ValueError,KeyError,TypeError,IndexError) as exc:
            print("Yahoo explicit dates unavailable:",exc,flush=True)
    return []

def stooq_days():
    url="https://stooq.com/q/d/l/?"+urllib.parse.urlencode({
      "s":"^spx","i":"d","d1":"20181201","d2":"20241201"})
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"text/csv"})
    with urllib.request.urlopen(req,timeout=80) as response:
        text=response.read().decode("utf-8-sig")
    rows=parse_yahoo_csv(text)
    print("Stooq independent SPX daily response:",len(rows),"bars",flush=True)
    return rows

def verify_merge(existing,patch):
    if len(patch)<1200:raise ValueError("Incomplete historical gap data: "+str(len(patch)))
    records={r[0]:r for r in existing}
    # Overlap must broadly agree. Never overwrite the existing, newer
    # Yahoo-derived OHLC in its 2024-26 modern interval.
    overlap=[r for r in patch if r[0] in records]
    if len(overlap)<5:
        raise ValueError("Insufficient overlap with existing independently sourced index series")
    close_diff=[abs(r[4]-records[r[0]][4])/records[r[0]][4] for r in overlap]
    if sorted(close_diff)[len(close_diff)//2]>.002:
        raise ValueError("Source mismatches baseline S&P 500 prices in overlapping sessions")
    for row in patch:
        if row[0] not in records:records[row[0]]=row
    rows=[records[k] for k in sorted(records)]
    gaps=missing_gaps(rows)
    if gaps:
        raise ValueError("Unresolved daily SPX archive gaps: "+str(gaps[:5]))
    return rows

def main():
    source=load_old(DATA)
    existing=source["daily"]
    old_gaps=missing_gaps(existing)
    if not old_gaps:
        print("Deep SPX archive already continuous",len(existing),"bars")
        return
    print("Existing gaps:",old_gaps,flush=True)
    providers=[
        ("Yahoo Finance explicit date range",yahoo_periods),
        ("Yahoo Finance 10-year daily",lambda:yahoo_bars("1d","10y")),
        ("Yahoo Finance 5-year daily",lambda:yahoo_bars("1d","5y")),
        ("Stooq independently downloaded SPX OHLC",stooq_days)
    ]
    errors=[]
    for name,fetch in providers:
        try:
            patch=fetch()
            # The 2018-2024 missing region must be mostly covered.
            inside=[r for r in patch if START<=r[0]<=END]
            print(name,"usable missing-region bars:",len(inside),flush=True)
            updated=verify_merge(existing,inside)
            source["daily"]=updated
            source["asOf"]=updated[-1][0]
            source["flatOHLCCount"]=sum(abs(r[2]-r[3])<=.011 for r in updated)
            source["firstNonFlatDate"]=next((r[0] for r in updated if r[2]-r[3]>.011),None)
            source["source"]=source["source"]+"; 2019-2024 bridge: "+name
            DATA.write_text("/* Published SPX daily OHLC; older flat records cannot support wick research. */\n"+
               "window.SPX_LONG_OHLC = "+json.dumps(source,separators=(",",":"))+";\n",encoding="utf-8")
            print("Completed archive with",len(updated),"days",updated[0][0],updated[-1][0])
            return
        except (ValueError,OSError,RuntimeError,KeyError,IndexError,TypeError) as exc:
            print("Provider rejected",name,":",exc,flush=True)
            errors.append(name+": "+str(exc))
    raise RuntimeError("No validated full bridge could be found; preserving original data. "+str(errors))

if __name__=="__main__":
    main()
