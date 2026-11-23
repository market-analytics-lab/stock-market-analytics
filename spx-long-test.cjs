"use strict";
/* Guard real historical SPX OHLC and chart chronology against truncation. */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const ctx=vm.createContext({window:{}});
for(const file of ["spx-long-ohlc.js","spx-ohlc-data.js"]){
  vm.runInContext(fs.readFileSync(file,"utf8"),ctx,{filename:file,timeout:30000});
}
const l=ctx.window.SPX_LONG_OHLC,r=ctx.window.SPX_OHLC;
assert.equal(l.symbol,"SPX");
assert(l.firstDate<="1957-03-04","Need real post-launch S&P500 daily history");
assert(l.daily.length>17000,"Expected more than 17,000 real historic daily index records");
assert.equal(l.asOf,r.asOf);
assert.equal(l.daily[0][0],l.firstDate);
assert.equal(l.daily.at(-1)[0],l.asOf);
assert(l.source.includes("Yahoo"));
const found=new Set();
let flat=0;
for(let i=0;i<l.daily.length;i++){
  const row=l.daily[i],time=row[0];
  assert(!found.has(time),"Duplicated date "+time);
  found.add(time);
  const [open,high,low,close]=row.slice(1);
  assert([open,high,low,close].every(n=>Number.isFinite(n)&&n>0));
  assert(high>=Math.max(open,close)-.011,"Invalid archived high "+time);
  assert(low<=Math.min(open,close)+.011,"Invalid archived low "+time);
  if(high-low<=.011)flat++;
  if(i){
    assert(l.daily[i-1][0]<time,"Historical dates not sorted");
    const delta=(Date.parse(time)-Date.parse(l.daily[i-1][0]))/86400000;
    assert(delta<=14,"Missing historical bridge "+l.daily[i-1][0]+" to "+time);
  }
}
assert.equal(flat,l.flatOHLCCount);
for(const date of ["1957-03-04","1962-01-02","1987-10-19",
  "2000-03-24","2008-10-10","2020-03-23","2023-10-27","2026-11-20"]){
  assert(found.has(date),"Missing landmark history "+date);
}
console.log("Deep historical SPX test passed:",l.daily.length,
  "dates from",l.firstDate,"to",l.asOf,
  "| flat/non-informative older candles:",flat);
