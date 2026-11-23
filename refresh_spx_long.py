"""Merge newly published genuine daily ^GSPC bars into historical OHLC browser.

Does not overwrite old history, infer missing sessions, or synthesize OHLC.
Runs after the regular 3:30 PM CT SPX refresh.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

from refresh_spx import read_ohlc
ROOT=Path(__file__).resolve().parent

def load_old(path:Path)->dict:
    match=re.search(r"window\.SPX_LONG_OHLC\s*=\s*(\{.*\})\s*;",path.read_text(encoding="utf-8"),re.DOTALL)
    if not match:raise ValueError("Invalid long-history dataset assignment")
    payload=json.loads(match.group(1))
    if payload.get("symbol")!="SPX":raise ValueError("Expected SPX index history")
    return payload

def merge_into(old:dict,recent:dict)->dict:
    original=old.get("daily",[])
    verified=recent.get("daily",[])
    if not verified or recent.get("symbol")!="SPX":
        raise ValueError("No verified recent ^GSPC daily data")
    records={row[0]:row for row in original}
    records.update({row[0]:row for row in verified})
    daily=[records[day] for day in sorted(records)]
    if daily[0][0] != original[0][0]:
        raise ValueError("Unexpected shift in first archived SPX day")
    if daily[-1][0]<old["asOf"]:
        raise ValueError("Refusing to regress deep archive snapshot")
    updated=dict(old)
    updated["daily"]=daily
    updated["asOf"]=daily[-1][0]
    updated["flatOHLCCount"]=sum(1 for row in daily if abs(row[2]-row[3])<=.011)
    updated["firstNonFlatDate"]=next((row[0] for row in daily if row[2]-row[3]>.011),None)
    return updated

def main():
    archive=ROOT/"spx-long-ohlc.js"
    if not archive.exists():return
    old=load_old(archive)
    new=merge_into(old,read_ohlc(ROOT/"spx-ohlc-data.js"))
    if new["asOf"]==old["asOf"]:return
    archive.write_text(
        "/* Genuine historic ^GSPC data from Yahoo; older OHLC may be close-only placeholders. */\n"+
        "window.SPX_LONG_OHLC = "+json.dumps(new,separators=(",",":"))+";\n",
        encoding="utf-8")
    html_path=ROOT/"index.html"
    html=html_path.read_text(encoding="utf-8")
    updated,n=re.subn(r'(src="\./spx-long-ohlc\.js)(?:\?[^"]*)?(")',
      lambda m:m.group(1)+"?asof="+new["asOf"]+m.group(2),html,count=1)
    if n!=1:raise ValueError("Missing historical dataset script tag")
    html_path.write_text(updated,encoding="utf-8")
    print("Deep SPX browser updated:",len(new["daily"]),new["firstDate"],new["asOf"])

if __name__=="__main__":main()
