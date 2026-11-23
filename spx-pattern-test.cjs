"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");

function load(file, ctx) {
  vm.runInContext(fs.readFileSync(file,"utf8"),ctx,{filename:file,timeout:120000});
}
function makeContext(){
  const ctx=vm.createContext({window:{},console,Math,Date,Intl,Number,Map,Set,
    Object,Array,JSON,String,Boolean,parseInt,parseFloat,Infinity});
  ["spx-ohlc-data.js","spx-history-data.js","spx-vix-data.js",
    "spx-breadth-data.js","spx-turning-points.js"].forEach(file=>load(file,ctx));
  return ctx;
}
const baseline=makeContext();
load("spx-pattern-engine.js",baseline);
const original=baseline.window.SPX_PATTERN_ENGINE;
assert.equal(original.symbol,"SPX");
assert.equal(baseline.window.SPX_TURNING.points.length,175);
assert.equal(baseline.window.SPX_TURNING.counts.RH,3);
assert.equal(baseline.window.SPX_TURNING.counts.RL,3);
assert.equal(original.evaluations.length,4);
assert(original.monthlyCount>1800);
assert(original.evaluations.every(item=>item.tested>=300));
assert(original.latestForecast.every(p=>p>=0&&p<=1));
assert(original.forecastRows.every(row=>row.fittedThrough<row.date));
const historicalDates=new Map(original.forecastRows.map(row=>[row.date,row]));
const truncated=makeContext();
const intact=truncated.window.SPX_HISTORY;
truncated.window.SPX_HISTORY={
  ...intact,monthly:intact.monthly.filter(row=>row[0]<="2016-12-01"),
  lastCompleteMonth:"2016-12-01",latestMonthPartial:false,asOf:"2016-12-31"
};
load("spx-pattern-engine.js",truncated);
const earlier=truncated.window.SPX_PATTERN_ENGINE.forecastRows;
assert(earlier.length>=200);
for(const row of earlier){
  const old=historicalDates.get(row.date);
  assert(old,"Missing original forecast for "+row.date);
  for(let i=0;i<4;i++) assert(Math.abs(old.probabilities[i]-row.probabilities[i])<1e-9,
    "Future leakage changed forecast "+row.date+" type "+i);
}
const ctx=makeContext();
ctx.document={getElementById:()=>null};
load("spx-pattern-engine.js",ctx);
load("spx-pattern-context.js",ctx);
assert(ctx.window.SPX_MARKET_CONTEXT.vix.eligibleMonths>300);
assert(ctx.window.SPX_MARKET_CONTEXT.breadth!==null);
console.log("SPX multi-feature and VIX/breadth checks passed");
console.log("Historical:",original.monthlyCount,"months; OOS:",original.evaluations[0].tested,
  "monthly observations; future-leakage comparison:",earlier.length,"monthly predictions");
