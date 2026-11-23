"use strict";
/*
 * Reproducibility, chronological isolation and no-lookahead test for the
 * self-discovered 28-family SPX candle-pattern expansion.
 */
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const os=require("node:os"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const scope=vm.createContext({window:{}});
for(const file of ["spx-long-ohlc.js","spx-turning-points.js","spx-candle-advanced-data.js"]){
  vm.runInContext(fs.readFileSync(file,"utf8"),scope,{filename:file,timeout:40000});
}
const study=scope.window.SPX_ADVANCED_CANDLES;
const archive=scope.window.SPX_LONG_OHLC;
const labels=scope.window.SPX_TURNING;
assert.equal(study.asOf,archive.asOf);
assert(study.featureCount>=1000);
assert(study.combinationCount>100000);
assert(study.distinctFamilies.length>=20);
assert(study.samples.train>4000&&study.samples.validation>900&&study.samples.holdout>1800);
const realDates=new Set(archive.daily.map(r=>r[0]));
assert(study.pastSuggestions.every(x=>x.date<"1997-01-01"&&realDates.has(x.date)));
assert(study.recentSuggestions.every(x=>x.date>="2025-01-01"&&realDates.has(x.date)));
for(const category of ["dH","dL","JH","JL"]){
  const row=study.studies[category];
  assert(row.leaders.length>=6);
  assert(row.counts.train.labels>3);
  assert(row.counts.validation.labels>0);
  assert(row.counts.holdout.labels>0);
  for(const leader of row.leaders){
    assert(leader.training.hits<=leader.training.fired);
    assert(leader.validation.hits<=leader.validation.fired);
    assert(leader.holdout.hits<=leader.holdout.fired);
    assert(leader.training.distinctTurns<=row.counts.train.labels);
    assert(leader.holdout.distinctTurns<=row.counts.holdout.labels);
  }
}
const lastLabel=labels.points.filter(p=>p.code==="JL").at(-1)?.date;
assert.equal(study.latestJL.lastConfirmedJL,lastLabel);
assert(study.latestJL.lastModelJLTrigger===null ||
  realDates.has(study.latestJL.lastModelJLTrigger));
assert(study.latestJL.currentJLRuleMatches>=0);
assert(study.latestJL.currentJLRuleMatches<=7);
assert(study.latestJL.calendarWatch.earliest<study.latestJL.calendarWatch.latest);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"spx-advanced-"));
try{
  const rerun=(input,output)=>{
    execFileSync(process.execPath,["spx-candle-advanced.cjs"],{
      env:{...process.env,SPX_ADVANCED_REPORT_OUTPUT:output,
        ...(input?{SPX_LONG_OHLC_INPUT:input}:{})},
      timeout:180000,stdio:"pipe"
    });
    const m=fs.readFileSync(output,"utf8").match(/window\.SPX_ADVANCED_CANDLES\s*=\s*(\{.*\});/s);
    if(!m)throw Error("Model generator output missing");
    return JSON.parse(m[1]);
  };
  const baseline=rerun(null,path.join(temp,"fresh.js"));
  assert.equal(fs.readFileSync("spx-candle-advanced-data.js","utf8"),
    fs.readFileSync(path.join(temp,"fresh.js"),"utf8"),
    "Committed research model is stale or not deterministic.");
  const changed=JSON.parse(JSON.stringify(archive));
  for(const x of changed.daily)if(x[0]>="2019-01-08" && x[0]<"2026-11-20"){
    const multiplier=1+((Number(x[0].slice(-2))%6)+1)*.004;
    for(let k=1;k<=4;k++)x[k]=+(x[k]*multiplier).toFixed(2);
  }
  const tampered=path.join(temp,"holdout-changed.js");
  fs.writeFileSync(tampered,"window.SPX_LONG_OHLC = "+JSON.stringify(changed)+";\n");
  const post=rerun(tampered,path.join(temp,"altered.js"));
  for(const kind of ["dH","dL","JH","JL"]){
    const before=baseline.studies[kind].leaders;
    const after=post.studies[kind].leaders;
    assert.deepEqual(before.map(p=>p.id),after.map(p=>p.id),
      "Future 2019+ prices changed training+validation pattern selection for "+kind);
    assert.deepEqual(before.map(p=>p.training),after.map(p=>p.training));
    assert.deepEqual(before.map(p=>p.validation),after.map(p=>p.validation));
  }
  assert.deepEqual(baseline.pastSuggestions,post.pastSuggestions,
    "2019+ future-price edits changed 1962–96 backward model suggestions");
}finally{fs.rmSync(temp,{recursive:true,force:true})}
console.log("Expanded SPX recognition PASSED:",study.featureCount,"features;",
  study.combinationCount,"hypotheses;",study.distinctFamilies.length,
  "families, training/validation/holdout isolation, dated JL monitor");
