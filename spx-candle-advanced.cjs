"use strict";
/*
 * Independent expanded SPX candle pattern discovery.
 *
 * Research periods:
 *    train     1997-01-01..2014-12-31 (feature selection)
 *    validate  2015-01-01..2018-12-31 (choice among frozen candidates)
 *    holdout   2019-01-01..last mature day (report only, never used for ranking)
 *    backcast  1962..1996 (backwards transfer; NOT forward verification)
 *
 * A target matches a PERSON-LABELED high/low 1-3 trading days AFTER a
 * candidate candle. Indicator values are constructed solely from t and
 * the preceding candles. Historical target labels are subjective.
 *
 * Large hypothesis libraries require multiplicity correction; no trade edge
 * or statistically calibrated future-event probabilities are claimed.
 */
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const scope=vm.createContext({window:{}});
for(const file of [process.env.SPX_LONG_OHLC_INPUT||"spx-long-ohlc.js","spx-turning-points.js"]){
  vm.runInContext(fs.readFileSync(file,"utf8"),scope,{filename:file,timeout:40000});
}
const source=scope.window.SPX_LONG_OHLC;
const turns=scope.window.SPX_TURNING;
assert(source?.symbol==="SPX"&&turns?.points?.length>100);
const bars=source.daily.filter(x=>x[0]>="1962-01-02").map(([date,o,h,l,c])=>({date,o,h,l,c}));
const N=bars.length,W=Math.ceil(N/32),warmup=65,horizon=3;
const ids=["dH","dL","JH","JL"]; // RH/RL far too sparse for robust advanced fitting
const yLabels=Object.fromEntries(ids.map(k=>[k,new Set(turns.points.filter(t=>t.code===k).map(t=>t.date))]));
const dateToIndex=new Map(bars.map((b,i)=>[b.date,i]));
const splitA="2015-01-01",splitB="2019-01-01",studyStart="1997-01-01";
const trainMask=new Uint32Array(W),valMask=new Uint32Array(W),testMask=new Uint32Array(W),backMask=new Uint32Array(W);
function bit(a,i){a[i>>>5]|=1<<(i&31)}
function has(a,i){return i>=0&&!!(a[i>>>5]&(1<<(i&31)))}
function pop(n){n=n-((n>>>1)&0x55555555);n=(n&0x33333333)+((n>>>2)&0x33333333);return (((n+(n>>>4))&0x0f0f0f0f)*0x01010101)>>>24}
function count(a){let n=0;for(let i=0;i<W;i++)n+=pop(a[i]);return n}
for(let i=warmup;i+horizon<N;i++){
  const d=bars[i].date;
  if(d<studyStart)bit(backMask,i);
  else if(d<splitA&&bars[i+horizon].date<splitA)bit(trainMask,i);
  else if(d>=splitA&&d<splitB&&bars[i+horizon].date<splitB)bit(valMask,i);
  else if(d>=splitB)bit(testMask,i);
}
const masks={train:trainMask,validation:valMask,holdout:testMask,history:backMask};
const target={};
for(const k of ids){
  const z=new Uint32Array(W);
  for(const date of yLabels[k]){
    const ix=dateToIndex.get(date);
    if(ix===undefined)continue;
    for(let lead=1;lead<=horizon;lead++)if(ix-lead>=warmup)bit(z,ix-lead);
  }
  target[k]=z;
}
// Raw candle descriptors: all can be evaluated from the current and past bars.
const open=new Float64Array(N),high=new Float64Array(N),low=new Float64Array(N),close=new Float64Array(N);
const rng=new Float64Array(N),body=new Float64Array(N),upWick=new Float64Array(N),downWick=new Float64Array(N);
const ratioTop=new Float64Array(N),ratioBottom=new Float64Array(N),ratioBody=new Float64Array(N),closePos=new Float64Array(N);
const diff=new Float64Array(N),green=new Uint8Array(N),red=new Uint8Array(N),flat=new Uint8Array(N);
const trueRange=new Float64Array(N),hammer=new Uint8Array(N),star=new Uint8Array(N),doji=new Uint8Array(N);
const inside=new Uint8Array(N),outside=new Uint8Array(N),gapUp=new Uint8Array(N),gapDown=new Uint8Array(N);
const engulfBull=new Uint8Array(N),engulfBear=new Uint8Array(N),longTop=new Uint8Array(N),longBottom=new Uint8Array(N);
const neutral=new Uint8Array(N),tinyUpper=new Uint8Array(N),tinyLower=new Uint8Array(N),valid=new Uint8Array(N);
for(let i=0;i<N;i++){
  const b=bars[i];open[i]=b.o;high[i]=b.h;low[i]=b.l;close[i]=b.c;
  const r=Math.max(0,b.h-b.l);
  rng[i]=r;valid[i]=r>.011?1:0;
  body[i]=Math.abs(b.c-b.o);
  upWick[i]=b.h-Math.max(b.o,b.c);
  downWick[i]=Math.min(b.o,b.c)-b.l;
  ratioTop[i]=r>.011?upWick[i]/r:NaN;
  ratioBottom[i]=r>.011?downWick[i]/r:NaN;
  ratioBody[i]=r>.011?body[i]/r:NaN;
  closePos[i]=r>.011?(b.c-b.l)/r:NaN;
  diff[i]=i?b.c/close[i-1]-1:0;
  green[i]=b.c>b.o?1:0;red[i]=b.c<b.o?1:0;
  flat[i]=r<=.011?1:0;
  trueRange[i]=i?Math.max(r,Math.abs(b.h-close[i-1]),Math.abs(b.l-close[i-1])):r;
  hammer[i]=valid[i]&&downWick[i]>=body[i]*2&&upWick[i]<=body[i]?1:0;
  star[i]=valid[i]&&upWick[i]>=body[i]*2&&downWick[i]<=body[i]?1:0;
  doji[i]=valid[i]&&ratioBody[i]<=.12?1:0;
  longTop[i]=valid[i]&&ratioTop[i]>=.52?1:0;
  longBottom[i]=valid[i]&&ratioBottom[i]>=.52?1:0;
  tinyUpper[i]=valid[i]&&ratioTop[i]<=.03?1:0;
  tinyLower[i]=valid[i]&&ratioBottom[i]<=.03?1:0;
  neutral[i]=valid[i]&&ratioBody[i]<=.25?1:0;
  if(i){
    inside[i]=b.h<high[i-1]&&b.l>low[i-1]?1:0;
    outside[i]=b.h>high[i-1]&&b.l<low[i-1]?1:0;
    gapUp[i]=b.o>high[i-1]?1:0;gapDown[i]=b.o<low[i-1]?1:0;
    engulfBull[i]=green[i]&&red[i-1]&&b.o<=close[i-1]&&b.c>=open[i-1]?1:0;
    engulfBear[i]=red[i]&&green[i-1]&&b.o>=close[i-1]&&b.c<=open[i-1]?1:0;
  }
}
const prefixCache=new WeakMap();
function prefix(a){
  if(prefixCache.has(a))return prefixCache.get(a);
  const b=new Int32Array(N+1);
  for(let i=0;i<N;i++)b[i+1]=b[i]+(a[i]?1:0);
  prefixCache.set(a,b);return b;
}
function nIn(a,i,n){const p=prefix(a);return p[i+1]-p[Math.max(0,i+1-n)]}
function avg(a,i,n){let sum=0;for(let j=i-n+1;j<=i;j++)sum+=a[j];return sum/n}
function highest(a,i,n){let m=-Infinity;for(let j=i-n+1;j<=i;j++)if(a[j]>m)m=a[j];return m}
function lowest(a,i,n){let m=Infinity;for(let j=i-n+1;j<=i;j++)if(a[j]<m)m=a[j];return m}
function ret(i,n){return close[i]/close[i-n]-1}
function atr(i,n){return avg(trueRange,i,n)/close[i]}
function rangePos(i,n){const hi=highest(high,i,n),lo=lowest(low,i,n);return hi>lo?(close[i]-lo)/(hi-lo):.5}
function vol(i,n){let sm=0,sq=0;for(let j=i-n+1;j<=i;j++){const x=diff[j];sm+=x;sq+=x*x}return Math.sqrt(Math.max(0,sq/n-(sm/n)**2))}
function slope(i,n){return close[i]/avg(close,i,n)-1}
function recency(i,n,f){for(let t=0;t<n;t++)if(f(i-t))return t;return 999}
function candlesOK(i,n){for(let j=0;j<n;j++)if(!valid[i-j])return false;return true}
const atoms=[];
function feature(name,family,test,need=1){
  const flags=new Uint32Array(W);
  for(let i=warmup;i<N;i++){
    if(!candlesOK(i,Math.max(need,1)))continue;
    if(test(i))bit(flags,i);
  }
  atoms.push({id:"F"+atoms.length,name,family,flags,need});
}
const ordinary={hammer,star,doji,longTop,longBottom,tinyUpper,tinyLower,
  inside,outside,gapUp,gapDown,engulfBull,engulfBear,neutral,green,red};
for(const [name,a] of Object.entries(ordinary)){
  feature(name+" today","candlestick",i=>!!a[i]);
  for(const lag of [1,2,3,5,8]){
    feature(name+" "+lag+" session"+(lag===1?"":"s")+" ago","lagged-candle",i=>!!a[i-lag],lag+1);
  }
}
for(const window of [2,3,5,8,13,21,34]){
  const w=window;
  for(const [name,a] of Object.entries(ordinary)){
    for(const thr of [.20,.45,.70]){
      const k=Math.max(1,Math.ceil(thr*w));
      feature(name+" at least "+k+"x in last "+w,"rolling-candle",
        i=>nIn(a,i,w)>=k,w);
    }
    feature(name+" occurred within "+w+" sessions","recent-formation",
      i=>nIn(a,i,w)>=1,w);
  }
  // Composition and texture of the candle sequence, not user-specified motifs
  for(const pct of [.25,.50,.75]){
    feature("Green candles ≥"+Math.ceil(w*pct)+" of "+w,"color-balance",
      i=>nIn(green,i,w)>=Math.ceil(w*pct),w);
    feature("Red candles ≥"+Math.ceil(w*pct)+" of "+w,"color-balance",
      i=>nIn(red,i,w)>=Math.ceil(w*pct),w);
  }
  for(const thresh of [.004,.012,.025,.06]){
    feature(w+"-session gain ≥"+(100*thresh).toFixed(1)+"%","momentum",
      i=>ret(i,w)>=thresh,w+1);
    feature(w+"-session loss ≤-"+(100*thresh).toFixed(1)+"%","momentum",
      i=>ret(i,w)<=-thresh,w+1);
  }
  for(const thr of [.1,.2,.4,.6,.8,.9]){
    feature("Close near "+w+"-day LOW (range position ≤"+Math.round(thr*100)+"%)",
      "location",i=>rangePos(i,w)<=thr,w);
    feature("Close near "+w+"-day HIGH (range position ≥"+Math.round(thr*100)+"%)",
      "location",i=>rangePos(i,w)>=thr,w);
  }
  for(const thr of [.002,.006,.012]){
    feature("ATR("+w+") ≥"+(thr*100).toFixed(1)+"% of close",
      "volatility",i=>atr(i,w)>=thr,w);
    feature("ATR("+w+") <"+(thr*100).toFixed(1)+"% of close",
      "volatility",i=>atr(i,w)<thr,w);
  }
  for(const thr of [.01,.025,.05]){
    feature("Close above "+w+"-SMA by ≥"+(thr*100).toFixed(1)+"%",
      "trend-extension",i=>slope(i,w)>=thr,w);
    feature("Close below "+w+"-SMA by ≥"+(thr*100).toFixed(1)+"%",
      "trend-extension",i=>slope(i,w)<=-thr,w);
  }
  for(const boundary of [.25,.5,.75]){
    feature("Average upper-wick share in "+w+" ≥"+Math.round(boundary*100)+"%",
      "wick-cluster",i=>avg(ratioTop,i,w)>=boundary,w);
    feature("Average lower-wick share in "+w+" ≥"+Math.round(boundary*100)+"%",
      "wick-cluster",i=>avg(ratioBottom,i,w)>=boundary,w);
  }
  for(const th of [0.6,1.3,1.8]){
    feature("Today range "+(th<1?"compressed ":"expanded ")+" vs "+w+"-day ×"+th,
      "range-anomaly",i=>th<1?rng[i]<avg(rng,i,w)*th:rng[i]>avg(rng,i,w)*th,w);
  }
}
// Second-order events, anchored only to observed earlier bars.
for(const offset of [1,2,3,5,8,13,21,34]){
  feature("Upward reversal after a red candle "+offset+" sessions ago",
    "turnaround",i=>green[i]&&red[i-offset]&&close[i]>close[i-1],offset+1);
  feature("Downward reversal after a green candle "+offset+" sessions ago",
    "turnaround",i=>red[i]&&green[i-offset]&&close[i]<close[i-1],offset+1);
  feature("Hammer "+offset+" sessions earlier, now increasing close","hammer-follow-through",
    i=>hammer[i-offset]&&close[i]>close[i-offset],offset+1);
  feature("Hammer "+offset+" sessions earlier, now falling close","hammer-failure",
    i=>hammer[i-offset]&&close[i]<close[i-offset],offset+1);
  feature("Shooting star "+offset+" earlier, now decreasing close","star-follow-through",
    i=>star[i-offset]&&close[i]<close[i-offset],offset+1);
  feature("Shooting star "+offset+" earlier, now rising close","star-failure",
    i=>star[i-offset]&&close[i]>close[i-offset],offset+1);
  feature("Doji "+offset+" sessions ago followed by current lower close",
    "indecision",i=>doji[i-offset]&&close[i]<close[i-offset],offset+1);
  feature("Doji "+offset+" sessions ago followed by current higher close",
    "indecision",i=>doji[i-offset]&&close[i]>close[i-offset],offset+1);
}
for(const w of [5,8,13,21]){
  feature("Recent hammer AND current lower close within "+w,"hammer-regime",
    i=>nIn(hammer,i,w)>0&&close[i]<close[i-3],w);
  feature("Recent hammer AND current higher close within "+w,"hammer-regime",
    i=>nIn(hammer,i,w)>0&&close[i]>close[i-3],w);
  feature("Recent star AND current lower close within "+w,"star-regime",
    i=>nIn(star,i,w)>0&&close[i]<close[i-3],w);
  feature("Recent star AND current higher close within "+w,"star-regime",
    i=>nIn(star,i,w)>0&&close[i]>close[i-3],w);
  feature("Hammer inside last "+w+" AND near "+w+" day low",
    "pattern-position",i=>nIn(hammer,i,w)>0&&rangePos(i,w)<=.25,w);
  feature("Star inside last "+w+" AND near "+w+" day high",
    "pattern-position",i=>nIn(star,i,w)>0&&rangePos(i,w)>=.75,w);
  feature("2+ bearish gaps inside "+w+" sessions AND rebound",
    "gap-reversal",i=>nIn(gapDown,i,w)>=2&&close[i]>close[i-1],w);
  feature("2+ bullish gaps inside "+w+" sessions AND decline",
    "gap-reversal",i=>nIn(gapUp,i,w)>=2&&close[i]<close[i-1],w);
  feature("Wick-dominated bottom (2+ long lower wicks in "+w+")",
    "wick-exhaustion",i=>nIn(longBottom,i,w)>=2&&rangePos(i,w)<.3,w);
  feature("Wick-dominated top (2+ long upper wicks in "+w+")",
    "wick-exhaustion",i=>nIn(longTop,i,w)>=2&&rangePos(i,w)>.7,w);
  feature("Compression -> range burst in last "+w+" sessions",
    "volatility-switch",i=>rng[i]>avg(rng,i,w)*1.3&&rng[i-1]<avg(rng,i-1,w)*.65,w+1);
}
for(const w of [5,13,21,34]){
  feature("Intraday lower low + bullish close, "+w+"-day support",
    "break-failure",i=>low[i]<lowest(low,i-1,w)&&green[i],w+1);
  feature("Intraday higher high + bearish close, "+w+"-day resistance",
    "break-failure",i=>high[i]>highest(high,i-1,w)&&red[i],w+1);
  feature("New "+w+"-day low with heavy lower wick",
    "extreme-wick",i=>low[i]<=lowest(low,i,w)&&ratioBottom[i]>.45,w);
  feature("New "+w+"-day high with heavy upper wick",
    "extreme-wick",i=>high[i]>=highest(high,i,w)&&ratioTop[i]>.45,w);
}
const perDate=new Uint8Array(N);
for(let i=0;i<N;i++){
  const d=new Date(bars[i].date+"T12:00:00Z");const dow=d.getUTCDay();
  for(const [name,test] of [["Monday",dow===1],["Tuesday",dow===2],["Wednesday",dow===3],["Thursday",dow===4],["Friday",dow===5]])
    if(test)perDate[i]=dow;
}
for(const [name,d] of [["Monday",1],["Tuesday",2],["Wednesday",3],["Thursday",4],["Friday",5]]){
  feature(name+" candle","calendar",i=>perDate[i]===d);
}
for(const n of [2,3,5,8]){
  feature("Close rising across last "+n+" sessions","close-streak",
    i=>Array.from({length:n},(_,j)=>diff[i-j]>0).every(Boolean),n);
  feature("Close falling across last "+n+" sessions","close-streak",
    i=>Array.from({length:n},(_,j)=>diff[i-j]<0).every(Boolean),n);
}
for(const n of [3,5,8,13,21]){
  feature("Realized vol "+n+" high vs 21-day baseline",
    "volatility-acceleration",i=>vol(i,n)>vol(i,21)*1.5,22);
  feature("Realized vol "+n+" low vs 21-day baseline",
    "volatility-acceleration",i=>vol(i,n)<vol(i,21)*.7,22);
}
// Use a strict nonflat context guard, including the lag before the trigger.
const goodContext=new Uint8Array(N);
for(let i=warmup;i<N;i++)goodContext[i]=candlesOK(i,9)?1:0;
for(const f of atoms)for(let i=warmup;i<N;i++)if(!goodContext[i])f.flags[i>>>5]&=~(1<<(i&31));

const counts={train:count(trainMask),validation:count(valMask),holdout:count(testMask)};
const activeMask=masks;
function metrics(c,kind,mask){
  const tar=target[kind],a=c.a.flags,b=c.b?.flags;
  let fired=0,hits=0;
  for(let w=0;w<W;w++){
    const f=a[w]&(b?b[w]:-1)&mask[w];
    fired+=pop(f);hits+=pop(f&tar[w]);
  }
  return {fired,hits,rate:fired?hits/fired:null};
}
function covered(c,kind,mask){
  let n=0;
  for(const date of yLabels[kind]){
    const index=dateToIndex.get(date);
    if(index===undefined)continue;
    for(let k=1;k<=3;k++){
      const i=index-k;
      if(i>=0&&has(mask,i)&&has(c.a.flags,i)&&(!c.b||has(c.b.flags,i))){n++;break}
    }
  }
  return n;
}
function countMaskIntersect(a,b){let n=0;for(let w=0;w<W;w++)n+=pop(a[w]&b[w]);return n}
const baseline={};
for(const code of ids){
  baseline[code]={};
  for(const [name,mask] of Object.entries(activeMask)){
    const n=count(mask);
    const hits=countMaskIntersect(mask,target[code]);
    baseline[code][name]={signalDays:hits,sessions:n,rate:n?hits/n:0,
      labels:[...yLabels[code]].filter(date=>{
        const ix=dateToIndex.get(date);
        return ix!==undefined&&[1,2,3].some(k=>ix-k>=0&&has(mask,ix-k));
      }).length};
  }
}
const candidates=[];
for(const a of atoms)candidates.push({id:a.id,name:a.name,group:a.family,a,b:null});
const validAtoms=atoms.filter(a=>{
  const n=countMaskIntersect(a.flags,trainMask);return n>=45&&n<=counts.train*.72;
});
for(let i=0;i<validAtoms.length;i++)for(let j=i+1;j<validAtoms.length;j++){
  const a=validAtoms[i],b=validAtoms[j];
  if(a.family===b.family)continue;
  candidates.push({id:a.id+"+"+b.id,name:a.name+" + "+b.name,
    group:"combination",a,b});
}
const results={},signalDict={},timeIndex=bars.map(x=>x.date);
for(const code of ids){
  const prior=baseline[code].train.rate;
  const firstPass=[];
  for(const candidate of candidates){
    const train=metrics(candidate,code,trainMask);
    if(train.fired<22||train.fired>counts.train*.48||train.hits<3)continue;
    const unique=covered(candidate,code,trainMask);
    if(unique<2)continue;
    const score=(((train.hits+.5)/(train.fired+15))-prior)*Math.sqrt(unique);
    if(score<=0)continue;
    firstPass.push({candidate,train,trainCovered:unique,score});
  }
  firstPass.sort((a,b)=>b.score-a.score||b.trainCovered-a.trainCovered);
  // Fold 2 evaluates a bounded, training-selected shortlist. Final 2019+
  // scores are NEVER used in the selection of these results.
  const finalists=[];
  for(const x of firstPass.slice(0,300)){
    const validation=metrics(x.candidate,code,valMask);
    const valEvents=covered(x.candidate,code,valMask);
    const valBase=baseline[code].validation.rate;
    // Allow rare-event classes to show a diagnostic while not claiming
    // statistically validated patterns when there are few val labels.
    const agreement=validation.fired>=7&&valEvents>=1;
    const holdPenalty=validation.fired<7?.3:validation.hits===0?.48:1;
    const quality=(validation.rate===null?0:(validation.rate-valBase));
    const finalScore=x.score*holdPenalty+Math.max(-.05,Math.min(.05,quality))*2+
      (agreement?.03:0);
    finalists.push({...x,validation,valEvents,finalScore});
  }
  finalists.sort((a,b)=>b.finalScore-a.finalScore||b.score-a.score);
  const leaders=[];
  for(const x of finalists.slice(0,12)){
    const c=x.candidate;
    const holdout=metrics(c,code,testMask);
    const hist=metrics(c,code,backMask);
    const dates=[];
    for(let i=warmup;i<N;i++)if(has(c.a.flags,i)&&(!c.b||has(c.b.flags,i)))dates.push(timeIndex[i]);
    signalDict[c.id]=dates;
    leaders.push({id:c.id,name:c.name,group:c.group,
      training:{...x.train,distinctTurns:x.trainCovered},
      validation:{...x.validation,distinctTurns:x.valEvents},
      holdout:{...holdout,distinctTurns:covered(c,code,testMask)},
      historicalFires:hist.fired,
      score:x.finalScore,
      triggerToday:has(c.a.flags,N-1)&&(!c.b||has(c.b.flags,N-1))
    });
  }
  results[code]={leaders,
    counts:baseline[code],
    candidateRulesSearched:candidates.length,
    caveat:"Candidate rules trained before 2015; intermediate validation 2015–2018; final holdout 2019 onward was not used for selection. Searching many correlated candidates increases false discovery."};
}
const chosen=Object.fromEntries(ids.map(k=>[k,results[k].leaders.slice(0,7)]));
const signalSets=Object.fromEntries(Object.entries(signalDict).map(([id,dates])=>[id,new Set(dates)]));
function consensusOnDay(code,i){
  const used=chosen[code];let votes=0;
  for(const p of used)if(signalSets[p.id]?.has(bars[i].date))votes++;
  return votes;
}
// Build history/near-term consensus from FROZEN model rules. No future
// prices or labels are used to score any date. Suppress adjacent spam.
const pre97=[],recent=[],byCat={},minVotes={dH:4,dL:4,JH:4,JL:4};
for(const code of ids){
  let lastBack=-9999,lastRecent=-9999;byCat[code]={history:0,recent:0};
  for(let i=warmup;i<N;i++){
    const date=bars[i].date;
    if(date>="1997-01-01"&&date<"2025-01-01")continue;
    if(!goodContext[i])continue;
    const votes=consensusOnDay(code,i);
    if(votes<minVotes[code])continue;
    const x={date,code,votes,top:chosen[code].length};
    if(date<"1997-01-01"){
      if(i-lastBack<18)continue;lastBack=i;pre97.push(x);byCat[code].history++;
    }else{
      if(i-lastRecent<5)continue;lastRecent=i;recent.push(x);byCat[code].recent++;
    }
  }
}
function keepOneByDate(events){
  const priority={"JL":4,"JH":3,"dL":2,"dH":1};
  const map=new Map();
  for(const e of events){
    const old=map.get(e.date);
    if(!old||e.votes>old.votes||e.votes===old.votes&&priority[e.code]>priority[old.code])
      map.set(e.date,e);
  }
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
const earliestJL=turns.points.filter(x=>x.code==="JL").sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.date||null;
const jlSuggestions=keepOneByDate(recent).filter(x=>x.code==="JL");
const lastJLSuggestion=jlSuggestions.at(-1)||null;
const lastPrice=bars.at(-1);
const currentVotes=Object.fromEntries(ids.map(k=>[k,consensusOnDay(k,N-1)]));
// Independent price-action checkpoint for JL-like lows, with an explicit
// CONFIRMATION DELAY. It labels the historical pivot candle, but only
// becomes available after at least five newer sessions and a 4% rebound
// within fifteen sessions. It is NOT a true user-defined JL.
const pricePivots=[];
let lastAcceptedPivot=-99;
for(let i=warmup+65;i+15<N;i++){
  if(bars[i].date<"1997-01-01"||i-lastAcceptedPivot<35)continue;
  if(!goodContext[i]||close[i]>lowest(close,i,65))continue;
  let localBottom=true;
  for(let k=1;k<=5;k++){
    if(close[i+k]<close[i]||close[i-k]<close[i]){localBottom=false;break;}
  }
  if(!localBottom)continue;
  let confirmedIndex=-1;
  for(let k=5;k<=15;k++){
    if(close[i+k]>=close[i]*1.04){confirmedIndex=i+k;break;}
  }
  if(confirmedIndex<0)continue;
  pricePivots.push({
    pivotDate:bars[i].date,knownAfter:bars[confirmedIndex].date,
    pivotClose:close[i],rebound:close[confirmedIndex]/close[i]-1,
    source:"20+ session closing low, five-session pivot and 4% rebound"
  });
  lastAcceptedPivot=i;
}
const laterPivots=pricePivots.filter(p=>p.pivotDate>="2019-01-01");
let nearLabeledJL=0;
for(const event of laterPivots){
  const index=dateToIndex.get(event.pivotDate);
  if([...yLabels.JL].some(date=>{
    const ix=dateToIndex.get(date);
    return ix!==undefined&&Math.abs(index-ix)<=5;
  }))nearLabeledJL++;
}

const watch={
  lastConfirmedJL:earliestJL,
  lastAlgorithmicPricePivot:pricePivots.at(-1)||null,
  algorithmicPivot2019Plus:{detected:laterPivots.length,nearUserJLWithin5Days:nearLabeledJL,
    caveat:"Heuristic detected only after a five-session price pivot and 4% rebound within 15 sessions. Not a user-defined or verified major low."},
  // Signal triggers are 1–3 TRADING SESSIONS *before* intended highs/lows.
  lastModelJLTrigger:lastJLSuggestion?.date||null,
  lastModelJLVotes:lastJLSuggestion?.votes||0,
  mostRecentBar:lastPrice.date,
  currentJLRuleMatches:currentVotes.JL,
  minimumVotes:minVotes.JL,
  nextTradingSessionsAfterTrigger: [1,3],
  recentUserProvidedJH:turns.points.filter(t=>t.code==="JH").at(-1)?.date||null,
  calendarWatch:{earliest:"2026-11-23",latest:"2026-12-07",
    basis:"Legacy 48–62-calendar-day gap after 2026-10-06 JH, not independently validated"},
  status:currentVotes.JL>=minVotes.JL?"JL-pattern setup on latest completed candle":
    "No JL-pattern setup on latest completed candle",
  precisionClaim:false
};
const out={
  name:"Independent SPX Multi-Horizon Candlestick Study",version:"2026-11-23-expanded-v2",
  asOf:source.asOf,dates:{start:bars[0].date,trainEnd:"2014-12-31",
    validationEnd:"2018-12-31",holdoutStart:"2019-01-01"},
  featureCount:atoms.length,combinationCount:candidates.length,
  distinctFamilies:[...new Set(atoms.map(x=>x.family))],
  studies:results,baselines:baseline,samples:counts,
  pastSuggestions:keepOneByDate(pre97),
  recentSuggestions:keepOneByDate(recent),
  automaticJLPricePivots:pricePivots.filter(p=>p.pivotDate>="2025-01-01"),
  labelsCovered:turns.counts,
  latestJL:watch,
  notes:[
    "Historical model circles before 1997 are BACK-CASTS made using 1997–2014 training labels; they are not verified highs or lows.",
    "Candle features are computed only from current and earlier OHLC, including multi-window occurrences of hammers, stars, dojis, gaps, reversals, wick clusters, volatility, compression, and candle run structure.",
    "2015–2018 validation was used to select among 300 training finalists; 2019+ results are shown only after rule selection.",
    "Different rule combinations are highly correlated and not independent votes. A large search space creates a severe multiple-testing hazard.",
    "JL model markers refer to precursor setup dates; an actual low one to three sessions later is NOT confirmed until price action and a human-labeled date support it.",
    "An additional JL-like price-pivot date can appear ONLY after at least five later price bars and a substantial rebound. These retrospective pivots are not equivalent to major lows.",
    "This model is research only; no validated trading strategy or precisely calibrated JL probabilities have been established."
  ]
};
const filename=process.env.SPX_ADVANCED_REPORT_OUTPUT||"spx-candle-advanced-data.js";
fs.writeFileSync(filename,
  "/* Autogenerated multi-horizon candle discovery; do not treat guesses as observed turns. */\n"+
  "window.SPX_ADVANCED_CANDLES = "+JSON.stringify(out)+";\n","utf8");
console.log("Expanded candle study",JSON.stringify({
  features:out.featureCount,patterns:out.combinationCount,samples:counts,
  familyCount:out.distinctFamilies.length,pre97:out.pastSuggestions.length,
  byClass:Object.fromEntries(ids.map(k=>[k,{top:out.studies[k].leaders[0],
    pre97:out.pastSuggestions.filter(s=>s.code===k).length}])),
  lastJL:watch
}));
