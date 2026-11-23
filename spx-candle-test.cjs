"use strict";
/*
 * Validate 175 user-labeled SPX dates, six categories, isolated holdout,
 * offline model determinism and immunity to altered post-2018 prices.
 */
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const ctx=vm.createContext({window:{}});
for(const p of ["spx-long-ohlc.js","spx-turning-points.js","spx-candle-report.js","spx-candle-miner.js"])
  vm.runInContext(fs.readFileSync(p,"utf8"),ctx,{filename:p,timeout:45000});
const labels=ctx.window.SPX_TURNING;
const report=ctx.window.SPX_CANDLE_REPORT;
const model=ctx.window.SPX_CANDLE_PATTERNS;
const history=ctx.window.SPX_LONG_OHLC;
assert.equal(labels.points.length,175);
assert.equal(new Set(labels.points.map(p=>p.date)).size,175,
  "Each observed SPX trading date must have exactly one canonical high/low category");
assert.deepEqual(JSON.parse(JSON.stringify(labels.codes)),["dH","dL","JH","JL","RH","RL"]);
assert.deepEqual(JSON.parse(JSON.stringify(labels.counts)),{dH:63,dL:63,JH:22,JL:21,RH:3,RL:3});
assert(labels.points.every((p,i)=>i===0||labels.points[i-1].date<=p.date));
const dates=new Set(history.daily.map(row=>row[0]));
assert(labels.points.every(p=>dates.has(p.date)),"Every historic user label must correspond to a real SPX daily session");
assert.equal(report.dateStart,"1962-01-02");
assert.equal(report.historicalBackcast.start,"1962-01-02");
assert.equal(report.historicalBackcast.end,"1996-12-31");
assert.equal(report.historicalBackcast.noNewTrainingLabels,true);
assert.equal(report.historicalBackcast.sourceRulesFrom,"1997–2018 labeled-data discovery");
assert(report.historicalBackcast.candidates.length>20);
assert(report.historicalBackcast.candidates.length<1200,"Historical suggestions should be deduplicated for readability");
const historicalMarkerDates=new Set();
const historyRows=new Map(history.daily.map(row=>[row[0],row]));
for(const p of report.historicalBackcast.candidates){
  assert(p.date>="1962-01-02"&&p.date<"1997-01-01");
  assert(!historicalMarkerDates.has(p.date),"Duplicate historical model marker");
  historicalMarkerDates.add(p.date);
  assert(["dH","dL","JH","JL","RH","RL"].includes(p.code));
  assert(p.votes>=report.historicalBackcast.minimumAgreeingRules[p.code]);
  assert(p.votes<=p.outOf);
  assert(historyRows.has(p.date),"Model suggested date without authentic SPX data");
}

assert.equal(report.splitDate,"2019-01-01");
assert(report.candidatesGenerated>30000);
assert(report.trainCount>5000&&report.testCount>1500);
assert.equal(report.barCount,model.daily.length);
assert.equal(model.stale,false,"Research report needs refreshing after new labels or candles");
for(const code of ["dH","dL","JH","JL"]) {
  const group=report.analysis[code];
  assert(group.leaders.length>=1,code+" needs researched candidates");
  assert(group.baseline.trainLabels>10&&group.baseline.testLabels>0);
  for(const rule of group.leaders) {
    assert(rule.train.fired>=20&&rule.train.hits<=rule.train.fired);
    assert(rule.train.eventsCovered<=group.baseline.trainLabels);
    assert(rule.test.eventsCovered<=group.baseline.testLabels);
    assert(Number.isFinite(rule.score));
    assert(model.signals(rule.id).every(time=>dates.has(time)));
  }
}
for(const code of ["RH","RL"]){
  const group=report.analysis[code];
  assert.equal(group.baseline.trainLabels,2,"Two earlier bear cycles should be in training");
  assert.equal(group.baseline.testLabels,1,"2022 bear cycle stays held out");
  assert.equal(group.status,"very-small-sample",
    "Bear-market class must disclose insufficient calibration sample");
  assert(group.leaders.length>=1,"Case study should find descriptive RH/RL features");
  for(const rule of group.leaders){
    assert.equal(rule.train.eventsCovered,2,"Both earlier bear cycles must be represented");
    assert(rule.test.eventsCovered<=1);
    assert(model.signals(rule.id).every(time=>dates.has(time)));
  }
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"spx-candle-regression-"));
try {
  const originalOutput=path.join(temp,"reproduced.js");
  const run=(file,out)=>{
    execFileSync(process.execPath,["generate_spx_candle_report.cjs"],{
      env:{...process.env,SPX_CANDLE_REPORT_OUTPUT:out,
        ...(file?{SPX_LONG_OHLC_INPUT:file}:{})},
      timeout:150000,
      stdio:"pipe",
    });
    const code=fs.readFileSync(out,"utf8");
    const result=code.match(/window\.SPX_CANDLE_REPORT\s*=\s*(\{.*\});/s);
    assert(result);
    return JSON.parse(result[1]);
  };
  const regenerated=run(null,originalOutput);
  assert.equal(fs.readFileSync(originalOutput,"utf8"),fs.readFileSync("spx-candle-report.js","utf8"),
    "Model report is stale or nonreproducible");
  const changed=JSON.parse(JSON.stringify(history));
  for(const row of changed.daily) if(row[0]>="2019-01-07") {
    const factor=1+((Number(row[0].slice(-2))%5)+1)*0.003;
    for(let i=1;i<=4;i++)row[i]=+(row[i]*factor).toFixed(2);
  }
  const tampered=path.join(temp,"altered-history.js");
  fs.writeFileSync(tampered,"window.SPX_LONG_OHLC = "+JSON.stringify(changed)+";\n");
  const altered=run(tampered,path.join(temp,"modified.js"));
  assert.deepEqual(altered.historicalBackcast,regenerated.historicalBackcast,
    "Changing future 2019+ OHLC must not alter fixed-rule historical backcasts");

  for(const code of ["dH","dL","JH","JL"]) {
    const before=regenerated.analysis[code].leaders;
    const after=altered.analysis[code].leaders;
    assert.equal(before.length,after.length);
    for(let i=0;i<before.length;i++){
      assert.equal(before[i].id,after[i].id,
        "Future OHLC altered selected training rule "+code+" rank "+i);
      assert.equal(before[i].score,after[i].score,
        "Future OHLC altered training score "+code+" rank "+i);
      assert.deepEqual(before[i].train,after[i].train,
        "Future OHLC altered training outcome "+code+" rank "+i);
    }
  }
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
console.log("SPX candlestick research + pre-1997 backcast passed:",
  report.candidatesGenerated,"rules; 159 labeled turning points; training",
  report.trainCount,"sessions, holdout",report.testCount,
  "; RH/RL flagged as tiny samples; no future-data leakage.");
