"use strict";
/* Offline reproducibility and chronological isolation tests for candle miner. */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
function boot(tamper=null){
  const ctx=vm.createContext({window:{},console,Math,Date,Intl,Number,Map,Set,Object,Array,
    JSON,String,Boolean,parseInt,parseFloat,Infinity});
  for(const file of ["spx-ohlc-data.js","spx-turning-points.js"])
    vm.runInContext(fs.readFileSync(file,"utf8"),ctx,{filename:file,timeout:30000});
  if(tamper)tamper(ctx.window);
  vm.runInContext(fs.readFileSync("spx-candle-miner.js","utf8"),ctx,
    {filename:"spx-candle-miner.js",timeout:120000});
  return ctx.window.SPX_CANDLE_PATTERNS;
}
const first=boot();
assert.equal(first.symbol,"SPX");
assert(first.candidatesGenerated>3000,"Expected broad pattern combination search");
assert.equal(first.selectedEvents.reduce((a,e)=>a+e.dates.length,0),13);
assert(first.trainCount>200&&first.testCount>100);
assert(first.dateEnd>first.splitDate);
assert(first.analysis.JL.leaders.length>0,"Expected at least one valid candidate");
assert(first.analysis.JH.leaders.length>0,"Expected at least one JH candidate");
const second=boot();
for(const code of first.labels){
  assert.equal(first.analysis[code].leaders[0].id,second.analysis[code].leaders[0].id);
  assert.deepEqual(JSON.parse(JSON.stringify(first.baseRates[code])),
    JSON.parse(JSON.stringify(second.baseRates[code])));
  for(const l of first.analysis[code].leaders) {
    assert(l.train.fired>=5);
    assert(l.train.hits<=l.train.fired);
    assert(l.test.hits<=l.test.fired);
    const signalDates=first.signals(l.id);
    assert(signalDates.every(d=>typeof d==="string"&&d<=first.dateEnd));
  }
}
// Deliberately perturb held-out OHLC only: train-ranked patterns cannot change.
const altered=boot(window=>{
  const data=window.SPX_OHLC.daily;
  const split=Math.floor(data.length*.7);
  for(let i=split+3;i<data.length;i++){
    const row=data[i];const shift=(i%5+1)*.005;
    for(let col=1;col<=4;col++)row[col]=+(row[col]*(1+shift)).toFixed(2);
  }
});
for(const code of first.labels){
  assert.equal(first.analysis[code].leaders[0].id,altered.analysis[code].leaders[0].id,
    "Future prices influenced selected pattern for "+code);
  assert.equal(first.analysis[code].leaders[0].score,altered.analysis[code].leaders[0].score,
    "Future prices influenced training score for "+code);
}
// Simple test on initial/last chart dataset to guard against fabricated OHLC.
assert(first.daily.every(b=>b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)));
console.log("SPX candle study passed:",first.candidatesGenerated,"candidates across",
  first.barCount,"authentic bars; split",first.splitDate);
for(const code of first.labels){
  const x=first.analysis[code].leaders[0];
  console.log(code,JSON.stringify({train:x.train,test:x.test,pattern:x.name,
    eventCounts:first.baseRates[code]}));
}
