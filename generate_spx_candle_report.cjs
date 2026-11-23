"use strict";
/*
 * SPX candlestick precursor discovery, reproducible offline build.
 * Uses actual SPX daily O/H/L/C, not reconstructed monthly values.
 *
 * A "hit" means the specified human-labeled CLOSE turning point occurs
 * one, two or three TRADING sessions AFTER an observed candle pattern.
 * No testing target is consulted for selecting/ranking pattern candidates.
 *
 * Development period: 1997-01-01 through 2018-12-31.
 * Holdout: 2019-01-01 onward; keep 3-session label embargo.
 * RH/RL have zero initial labels and are "awaiting examples", NOT zero skill.
 *
 * WARNING: Many candidate rules / correlated signals => overfitting risk.
 * Rankings and holdout results are descriptive, not validated trade advice.
 */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");

const sandbox=vm.createContext({window:{}});
for(const file of [process.env.SPX_LONG_OHLC_INPUT||"spx-long-ohlc.js","spx-turning-points.js"]){
  vm.runInContext(fs.readFileSync(file,"utf8"),sandbox,{filename:file,timeout:30000});
}
const long=sandbox.window.SPX_LONG_OHLC;
const turns=sandbox.window.SPX_TURNING;
assert(long?.symbol==="SPX"&&turns?.points?.length>0);
const daily=long.daily.filter(row=>row[0]>="1996-10-01").map(
  ([time,open,high,low,close])=>({time,open,high,low,close})
);
const N=daily.length, warmup=31, forward=3;
const TRAIN_START="1997-01-01",TEST_START="2019-01-01";
const SPLIT=daily.findIndex(row=>row.time>=TEST_START);
assert(N>6000&&SPLIT>3500,"Incomplete training history");
const codes=["dH","dL","JH","JL","RH","RL"];
const indexByDate=new Map(daily.map((b,i)=>[b.time,i]));
const labeled=Object.fromEntries(codes.map(code=>[
  code,turns.points.filter(p=>p.code===code).map(p=>p.date)
]));
const labelIndex=Object.fromEntries(codes.map(code=>[
  code,new Set(labeled[code].map(d=>indexByDate.get(d)).filter(Number.isInteger))
]));
const allMissing=turns.points.filter(p=>p.date>="1997-01-01"&&!indexByDate.has(p.date));
assert.deepEqual(JSON.parse(JSON.stringify(allMissing)),[],"All supplied labels must be on real archived sessions");

const W=Math.ceil(N/32);
const bit=(words,i)=>{words[i>>>5]|=1<<(i&31);};
const isBit=(words,i)=>i>=0&&!!(words[i>>>5]&(1<<(i&31)));
const pop=(v)=>{
  v=v-((v>>>1)&0x55555555);
  v=(v&0x33333333)+((v>>>2)&0x33333333);
  return (((v+(v>>>4))&0x0f0f0f0f)*0x01010101)>>>24;
};
const trainMask=new Uint32Array(W),testMask=new Uint32Array(W);
for(let i=warmup;i+forward<N;i++){
  if(daily[i].time>=TRAIN_START&&i+forward<SPLIT)bit(trainMask,i);
  if(i>=SPLIT)bit(testMask,i);
}
const countMask=(mask)=>mask.reduce((n,w)=>n+pop(w),0);
const trainCount=countMask(trainMask),testCount=countMask(testMask);
const targetMasks={};
for(const code of codes){
  const mask=new Uint32Array(W);
  for(const index of labelIndex[code]){
    for(let k=1;k<=forward;k++)if(index-k>=warmup)bit(mask,index-k);
  }
  targetMasks[code]=mask;
}
const trainLabels=Object.fromEntries(codes.map(code=>[code,[...labelIndex[code]].filter(i=>i>0&&i<SPLIT).length]));
const testLabels=Object.fromEntries(codes.map(code=>[code,[...labelIndex[code]].filter(i=>i>=SPLIT).length]));
const barRange=i=>daily[i].high-daily[i].low;
const body=i=>Math.abs(daily[i].close-daily[i].open);
const upper=i=>daily[i].high-Math.max(daily[i].open,daily[i].close);
const lower=i=>Math.min(daily[i].open,daily[i].close)-daily[i].low;
const up=i=>daily[i].close>daily[i].open;
const down=i=>daily[i].close<daily[i].open;
const past=(i,n,key)=>daily.slice(i-n,i);
const average=(i,n,fn)=>{let sum=0;for(let j=0;j<n;j++)sum+=fn(i-j);return sum/n;};
const priorHigh=(i,n,key)=>{let mx=-Infinity;for(let k=i-n;k<i;k++)mx=Math.max(mx,daily[k][key]);return mx;};
const priorLow=(i,n,key)=>{let lo=Infinity;for(let k=i-n;k<i;k++)lo=Math.min(lo,daily[k][key]);return lo;};
const validRange=i=>barRange(i)>.011;
const atomic=[];
function atom(name,family,check,lag=0){
  const flags=new Uint32Array(W);
  for(let i=warmup;i<N;i++){
    const k=i-lag;
    if(k<warmup-lag)continue;
    // The 1997+ training series has actual nonflat OHLC. Avoid fabricating
    // patterns from any vendor close-only placeholder or zero-range bar.
    if(!validRange(k))continue;
    if(check(k))bit(flags,i);
  }
  atomic.push({name:lag?name+" "+lag+" day"+(lag===1?"":"s")+" earlier":name,
    family,lag,bits:flags,id:"A"+atomic.length});
}
const defs=[];
function def(name,group,fn){defs.push({name,group,fn});}
for(const x of [.02,.08,.15,.25,.4,.6,.8]){
  def("Upper wick ≤ "+Math.round(x*100)+"% of range","wick",i=>upper(i)/barRange(i)<=x);
  def("Upper wick ≥ "+Math.round(x*100)+"% of range","wick",i=>upper(i)/barRange(i)>=x);
  def("Lower wick ≤ "+Math.round(x*100)+"% of range","wick",i=>lower(i)/barRange(i)<=x);
  def("Lower wick ≥ "+Math.round(x*100)+"% of range","wick",i=>lower(i)/barRange(i)>=x);
  def("Body ≤ "+Math.round(x*100)+"% of range","body",i=>body(i)/barRange(i)<=x);
  def("Body ≥ "+Math.round(x*100)+"% of range","body",i=>body(i)/barRange(i)>=x);
}
def("No upper wick (≤0.01 index point)","wick",i=>upper(i)<=.0101);
def("No lower wick (≤0.01 index point)","wick",i=>lower(i)<=.0101);
def("Green candle","color",up);
def("Red candle","color",down);
def("Close in top 10% of range","close",i=>(daily[i].high-daily[i].close)/barRange(i)<=.1);
def("Close in bottom 10% of range","close",i=>(daily[i].close-daily[i].low)/barRange(i)<=.1);
def("Hammer (lower wick ≥2× body)","named",i=>lower(i)>=2*body(i)&&upper(i)<=body(i));
def("Shooting star (upper wick ≥2× body)","named",i=>upper(i)>=2*body(i)&&lower(i)<=body(i));
def("Doji (body ≤10% of range)","named",i=>body(i)/barRange(i)<=.1);
def("Bullish engulfing","named",i=>up(i)&&down(i-1)&&daily[i].open<=daily[i-1].close&&daily[i].close>=daily[i-1].open);
def("Bearish engulfing","named",i=>down(i)&&up(i-1)&&daily[i].open>=daily[i-1].close&&daily[i].close<=daily[i-1].open);
def("Inside bar","named",i=>daily[i].high<daily[i-1].high&&daily[i].low>daily[i-1].low);
def("Outside bar","named",i=>daily[i].high>daily[i-1].high&&daily[i].low<daily[i-1].low);
def("Gap up","gap",i=>daily[i].open>daily[i-1].high);
def("Gap down","gap",i=>daily[i].open<daily[i-1].low);
def("Gap up from prior close ≥0.2%","gap",i=>daily[i].open>daily[i-1].close*1.002);
def("Gap down from prior close ≥0.2%","gap",i=>daily[i].open<daily[i-1].close*.998);
def("Close above previous close","movement",i=>daily[i].close>daily[i-1].close);
def("Close below previous close","movement",i=>daily[i].close<daily[i-1].close);
for(const n of [5,10,20]){
  def("Close at "+n+"-day high","structure",i=>daily[i].close>=priorHigh(i,n,"close"));
  def("Close at "+n+"-day low","structure",i=>daily[i].close<=priorLow(i,n,"close"));
}
def("Within 1% of 20-day closing high","structure",i=>daily[i].close>=priorHigh(i,20,"close")*.99);
def("Within 1% of 20-day closing low","structure",i=>daily[i].close<=priorLow(i,20,"close")*1.01);
def("Range ≥1.5× prior 10-day average","range",i=>barRange(i)>=1.5*average(i-1,10,barRange));
def("Range ≤0.65× prior 10-day average","range",i=>barRange(i)<=.65*average(i-1,10,barRange));
def("Green body ≥1% of index","body",i=>up(i)&&body(i)/daily[i].close>=.01);
def("Red body ≥1% of index","body",i=>down(i)&&body(i)/daily[i].close>=.01);
for(const n of [10,20]){
  def("Close above "+n+"-day SMA","trend",i=>daily[i].close>=average(i,n,j=>daily[j].close));
  def("Close below "+n+"-day SMA","trend",i=>daily[i].close<average(i,n,j=>daily[j].close));
}
for(const n of [2,3,4,5]){
  def(n+" consecutive green candles","sequence",i=>Array.from({length:n},(_,j)=>up(i-j)).every(Boolean));
  def(n+" consecutive red candles","sequence",i=>Array.from({length:n},(_,j)=>down(i-j)).every(Boolean));
}
for(const n of [3,5,7])for(const k of [1,2,3,4,5]){
  if(k>n)continue;
  def("≥"+k+" green candles in "+n,"sequence",i=>Array.from({length:n},(_,j)=>up(i-j)).filter(Boolean).length>=k);
  def("≥"+k+" red candles in "+n,"sequence",i=>Array.from({length:n},(_,j)=>down(i-j)).filter(Boolean).length>=k);
}
def("Separated green candles G-R-G","sequence",i=>up(i)&&down(i-1)&&up(i-2));
def("Separated red candles R-G-R","sequence",i=>down(i)&&up(i-1)&&down(i-2));
def("Three greens separated in five sessions","sequence",i=>up(i)&&up(i-2)&&up(i-4));
def("Three reds separated in five sessions","sequence",i=>down(i)&&down(i-2)&&down(i-4));
for(const n of [2,3,4])for(let code=0;code<(1<<n);code++){
  const letters=Array.from({length:n},(_,j)=>code&(1<<(n-j-1))?"G":"R").join("");
  def(n+"-bar "+letters,"color-code",i=>
    Array.from({length:n},(_,j)=>letters[n-j-1]==="G"?up(i-j):down(i-j)).every(Boolean));
}
for(const d of defs)atom(d.name,d.group,d.fn);
for(const d of defs.filter(d=>["wick","body","color","named","sequence","gap"].includes(d.group)))
  for(const lag of [1,2])atom(d.name,d.group,d.fn,lag);

const countAndHits=(bitsA,bitsB,mask,targets)=>{
  let fired=0,hits=0;
  for(let w=0;w<W;w++){
    const allowed=(bitsB===null?bitsA[w]:bitsA[w]&bitsB[w])&mask[w];
    fired+=pop(allowed);hits+=pop(allowed&targets[w]);
  }
  return {fired,hits,precision:fired?hits/fired:null};
};
const countTraining=(a)=>{let n=0;for(let i=0;i<W;i++)n+=pop(a.bits[i]&trainMask[i]);return n;};
const viable=atomic.filter(a=>{
  const n=countTraining(a);
  return n>=25&&n<=trainCount*.88;
});
const candidates=[];
for(const a of atomic)candidates.push({id:a.id,name:a.name,family:a.family,a,b:null});
for(let i=0;i<viable.length;i++)for(let j=i+1;j<viable.length;j++){
  const a=viable[i],b=viable[j];
  if(a.family===b.family&&!a.lag&&!b.lag)continue;
  candidates.push({id:a.id+"+"+b.id,name:a.name+" + "+b.name,
    family:"combination",a,b});
}
const masks=(c,mask,target)=>countAndHits(c.a.bits,c.b?.bits||null,mask,target);
function coverage(c,code,mask){
  let covered=0;
  for(const evt of labelIndex[code]){
    if([1,2,3].some(k=>evt-k>=0&&isBit(mask,evt-k)&&isBit(c.a.bits,evt-k)&&(!c.b||isBit(c.b.bits,evt-k))))covered++;
  }
  return covered;
}
function candidateSignals(c){
  const out=[];
  for(let i=warmup;i<N;i++)if(isBit(c.a.bits,i)&&(!c.b||isBit(c.b.bits,i)))out.push(daily[i].time);
  return out;
}
const summary={};
const selectedSignals={};
for(const code of codes){
  const trainWindows=countAndHits(trainMask,null,trainMask,targetMasks[code]).hits;
  const testWindows=countAndHits(testMask,null,testMask,targetMasks[code]).hits;
  const baseline=trainWindows/trainCount;
  const baselineTest=testWindows/testCount;
  const labelsInTraining=trainLabels[code]||0;
  const labelsInTest=testLabels[code]||0;
  const baseRates={train:baseline,test:baselineTest,
    trainWindows,testWindows,trainLabels:labelsInTraining,testLabels:labelsInTest};
  if(!labelsInTraining){
    summary[code]={leaders:[],baseline:baseRates,status:"awaiting-user-labels"};
    continue;
  }
  const ranked=[];
  // With just two earlier RH/RL bear markets, show only patterns covering
  // BOTH examples. These are descriptive case comparisons, not meaningful
  // statistical training or calibrated forecasts. Later examples remain held out.
  const verySmallSample=labelsInTraining<3;
  const minimumCovered=verySmallSample?2:3;
  const minimumHits=verySmallSample?2:4;
  for(const c of candidates){
    const tr=masks(c,trainMask,targetMasks[code]);
    if(tr.fired<20||tr.fired>trainCount*.55||tr.hits<minimumHits)continue;
    const unique=coverage(c,code,trainMask);
    if(unique<minimumCovered)continue;
    const n=tr.fired,pt=tr.hits/n,z=1.96;
    const lower=(pt+z*z/(2*n)-z*Math.sqrt((pt*(1-pt)+z*z/(4*n))/n))/(1+z*z/n);
    const score=(lower-baseline)*Math.sqrt(unique);
    if(!Number.isFinite(score))continue;
    ranked.push({candidate:c,score,tr,unique});
  }
  ranked.sort((x,y)=>y.score-x.score||y.unique-x.unique||y.tr.hits-x.tr.hits||
     x.candidate.name.localeCompare(y.candidate.name));
  const leaders=[];
  for(const item of ranked.slice(0,25)){
    const c=item.candidate;
    const tst=masks(c,testMask,targetMasks[code]);
    const training={...item.tr,eventsCovered:item.unique};
    const testing={...tst,eventsCovered:coverage(c,code,testMask)};
    leaders.push({id:c.id,name:c.name,family:c.family,
      train:training,test:testing,
      score:item.score,lift:baseline>0?item.tr.precision/baseline:0,
      lastBarMatch:isBit(c.a.bits,N-1)&&(!c.b||isBit(c.b.bits,N-1))});
    if(!selectedSignals[c.id])selectedSignals[c.id]=candidateSignals(c);
  }
  summary[code]={leaders,baseline:baseRates,
    status:leaders.length?(verySmallSample?"very-small-sample":"research"):
      "insufficient-pattern-support"};
}
const latestMatches=Object.fromEntries(codes.map(code=>[
  code,(summary[code].leaders||[]).slice(0,10).filter(x=>x.lastBarMatch)
    .map(x=>({id:x.id,name:x.name,train:x.train,test:x.test}))
]));
const payload={
  symbol:"SPX",version:"2026-11-23-multidecade-v2",asOf:long.asOf,
  barCount:N,dateStart:daily[0].time,dateEnd:daily.at(-1).time,
  studyStart:TRAIN_START,splitDate:TEST_START,
  trainCount,testCount,leadSessions:forward,embargoSessions:forward,
  candidatesGenerated:candidates.length,atomicCount:atomic.length,
  labels:codes,counts:turns.counts,analysis:summary,latestMatches,signals:selectedSignals,
  selectedEvents:codes.map(code=>({code,dates:labeled[code]})),
  excludedEarlyWicks:"OHLC flat observations excluded; study begins 1997 with reliable high/low records.",
  caution:"Thousands of correlated patterns fit to user-defined turning points; descriptive holdout counts are not calibrated probabilities or trading evidence."
};
const scriptBody="/* Precomputed real daily SPX candle discovery, 1997+.\n"+
  " * Training pre-2019; holdout 2019-present; labels may be subjective.\n"+
  " * Generated reproducibly via node generate_spx_candle_report.cjs.\n"+
  " */\nwindow.SPX_CANDLE_REPORT = "+JSON.stringify(payload)+";\n";
const path=process.env.SPX_CANDLE_REPORT_OUTPUT||"spx-candle-report.js";
if(fs.existsSync(path)&&fs.readFileSync(path,"utf8")===scriptBody){
  console.log("SPX pattern report unchanged:",payload.asOf);
}else{
  fs.writeFileSync(path,scriptBody,"utf8");
}
console.log("SPX model generated:",payload.candidatesGenerated,"rules",N,
  "dates",payload.dateStart,payload.dateEnd);
for(const code of codes){
  const x=summary[code];
  console.log(code,"labels",turns.counts[code],
   "train",x.baseline.trainLabels,"test",x.baseline.testLabels,
   "ranked",x.leaders.length,
   x.leaders[0]&&JSON.stringify({name:x.leaders[0].name,
     train:x.leaders[0].train,test:x.leaders[0].test}));
}
