"use strict";
/*
 * SPX Candlestick Pattern Explorer, v1.
 * Genuine daily OHLC only. Candidate rules use data on/before signal time t.
 * The target is a USER-LABELED turn on t+1, t+2 or t+3 trading sessions.
 * Chronological train/test split with 3-session label embargo.
 *
 * IMPORTANT: thousands of searched patterns => data-mining/multiple-testing risk.
 * Holdout outcomes are diagnostic, never used to select/rank candidates.
 */
(() => {
  const source = window.SPX_OHLC;
  const labeled = window.SPX_TURNING?.points;
  if (source?.symbol !== "SPX" || !Array.isArray(source.daily) || !labeled) return;
  const bars=source.daily.map(([time,open,high,low,close])=>({time,open,high,low,close}))
    .filter(b=>[b.open,b.high,b.low,b.close].every(Number.isFinite) &&
      b.high >= Math.max(b.open,b.close) && b.low <= Math.min(b.open,b.close));
  const L=bars.length, minIndex=30, horizon=3;
  if (L<100) return;
  const dateIndex=new Map(bars.map((b,i)=>[b.time,i]));
  const labels=["dH","dL","JH","JL"];
  const labelDates=Object.fromEntries(labels.map(c=>[c,new Set(labeled.filter(p=>p.code.toLowerCase()===c.toLowerCase()).map(p=>p.date))]));
  const labelIndex=Object.fromEntries(labels.map(c=>[c,new Set([...labelDates[c]].map(d=>dateIndex.get(d)).filter(Number.isInteger))]));
  // Exclude the first 30 sessions for long-range features.
  const split=Math.floor(L*.7);
  const train=Array.from({length:Math.max(0,split-horizon-minIndex)},(_,j)=>j+minIndex);
  const test=Array.from({length:Math.max(0,L-horizon-split)},(_,j)=>j+split);
  const targets={};
  for(const code of labels) {
    const points=labelIndex[code];
    targets[code]=Array.from({length:L},(_,i)=>
      i>=minIndex && i+horizon<L && [1,2,3].some(k=>points.has(i+k)));
  }
  const range=i=>Math.max(1e-9,bars[i].high-bars[i].low);
  const body=i=>Math.abs(bars[i].close-bars[i].open);
  const upper=i=>bars[i].high-Math.max(bars[i].open,bars[i].close);
  const lower=i=>Math.min(bars[i].open,bars[i].close)-bars[i].low;
  const up=i=>bars[i].close>bars[i].open;
  const down=i=>bars[i].close<bars[i].open;
  const avg=(vals)=>vals.reduce((a,b)=>a+b,0)/vals.length;
  const trailing=(i,n,projector)=>avg(Array.from({length:n},(_,j)=>projector(i-j)));
  const hi=(i,n,k="high")=>Math.max(...bars.slice(i-n,i).map(b=>b[k]));
  const lo=(i,n,k="low")=>Math.min(...bars.slice(i-n,i).map(b=>b[k]));
  const predicates=[];
  function add(name,fn,category) {
    const flags=Array.from({length:L},(_,i)=>i>=minIndex && Boolean(fn(i)));
    predicates.push({name,flags,category});
  }
  const thresholds=[.02,.08,.15,.25,.4,.6,.8];
  thresholds.forEach(t=>{
    add("Upper wick ≤ "+Math.round(t*100)+"% of range",i=>upper(i)/range(i)<=t,"wick");
    add("Upper wick ≥ "+Math.round(t*100)+"% of range",i=>upper(i)/range(i)>=t,"wick");
    add("Lower wick ≤ "+Math.round(t*100)+"% of range",i=>lower(i)/range(i)<=t,"wick");
    add("Lower wick ≥ "+Math.round(t*100)+"% of range",i=>lower(i)/range(i)>=t,"wick");
    add("Body ≤ "+Math.round(t*100)+"% of range",i=>body(i)/range(i)<=t,"body");
    add("Body ≥ "+Math.round(t*100)+"% of range",i=>body(i)/range(i)>=t,"body");
  });
  add("No upper wick (≤0.01 index point)",i=>upper(i)<=.0101,"wick");
  add("No lower wick (≤0.01 index point)",i=>lower(i)<=.0101,"wick");
  add("Green candle",i=>up(i),"color");
  add("Red candle",i=>down(i),"color");
  add("Close in top 10% of range",i=>(bars[i].high-bars[i].close)/range(i)<=.1,"close");
  add("Close in bottom 10% of range",i=>(bars[i].close-bars[i].low)/range(i)<=.1,"close");
  add("Hammer (lower wick ≥2× body)",i=>lower(i)>=2*body(i)&&upper(i)<=body(i),"named");
  add("Shooting star (upper wick ≥2× body)",i=>upper(i)>=2*body(i)&&lower(i)<=body(i),"named");
  add("Doji (body ≤10% of range)",i=>body(i)/range(i)<=.1,"named");
  add("Bullish engulfing",i=>up(i)&&down(i-1)&&bars[i].open<=bars[i-1].close&&bars[i].close>=bars[i-1].open,"named");
  add("Bearish engulfing",i=>down(i)&&up(i-1)&&bars[i].open>=bars[i-1].close&&bars[i].close<=bars[i-1].open,"named");
  add("Inside bar",i=>bars[i].high<bars[i-1].high&&bars[i].low>bars[i-1].low,"named");
  add("Outside bar",i=>bars[i].high>bars[i-1].high&&bars[i].low<bars[i-1].low,"named");
  add("Gap up",i=>bars[i].open>bars[i-1].high,"gap");
  add("Gap down",i=>bars[i].open<bars[i-1].low,"gap");
  add("Opening gap up vs prior close",i=>bars[i].open>bars[i-1].close*1.002,"gap");
  add("Opening gap down vs prior close",i=>bars[i].open<bars[i-1].close*.998,"gap");
  add("Close above previous close",i=>bars[i].close>bars[i-1].close,"movement");
  add("Close below previous close",i=>bars[i].close<bars[i-1].close,"movement");
  add("Close at 5-day high",i=>bars[i].close>=hi(i,5,"close"),"structure");
  add("Close at 5-day low",i=>bars[i].close<=lo(i,5,"close"),"structure");
  add("Close at 10-day high",i=>bars[i].close>=hi(i,10,"close"),"structure");
  add("Close at 10-day low",i=>bars[i].close<=lo(i,10,"close"),"structure");
  add("Near 20-day closing high (within 1%)",i=>bars[i].close>=hi(i,20,"close")*.99,"structure");
  add("Near 20-day closing low (within 1%)",i=>bars[i].close<=lo(i,20,"close")*1.01,"structure");
  add("Range expands above 1.5× prior 10",i=>range(i)>=1.5*trailing(i-1,10,range),"range");
  add("Range contracts below 0.65× prior 10",i=>range(i)<=.65*trailing(i-1,10,range),"range");
  add("Green body ≥1% of index",i=>up(i)&&body(i)/bars[i].close>=.01,"body");
  add("Red body ≥1% of index",i=>down(i)&&body(i)/bars[i].close>=.01,"body");
  add("Close above 10-day SMA",i=>bars[i].close>=trailing(i,10,j=>bars[j].close),"trend");
  add("Close below 10-day SMA",i=>bars[i].close<trailing(i,10,j=>bars[j].close),"trend");
  add("Close above 20-day SMA",i=>bars[i].close>=trailing(i,20,j=>bars[j].close),"trend");
  add("Close below 20-day SMA",i=>bars[i].close<trailing(i,20,j=>bars[j].close),"trend");
  for(const n of [2,3,4,5]){
    add(n+" consecutive green candles",i=>Array.from({length:n},(_,j)=>up(i-j)).every(Boolean),"sequence");
    add(n+" consecutive red candles",i=>Array.from({length:n},(_,j)=>down(i-j)).every(Boolean),"sequence");
  }
  for(const n of [3,5,7]) for(const k of [1,2,3,4,5]) {
    if (k>n)continue;
    add("≥"+k+" green candles in "+n,i=>Array.from({length:n},(_,j)=>up(i-j)).filter(Boolean).length>=k,"sequence");
    add("≥"+k+" red candles in "+n,i=>Array.from({length:n},(_,j)=>down(i-j)).filter(Boolean).length>=k,"sequence");
  }
  add("Separated green candles G-R-G",i=>up(i)&&down(i-1)&&up(i-2),"sequence");
  add("Separated red candles R-G-R",i=>down(i)&&up(i-1)&&down(i-2),"sequence");
  add("Three greens separated within five sessions",i=>up(i)&&up(i-2)&&up(i-4),"sequence");
  add("Three reds separated within five sessions",i=>down(i)&&down(i-2)&&down(i-4),"sequence");
  for(const n of [2,3,4]) for(let k=0;k<2**n;k++){
    const pattern=Array.from({length:n},(_,j)=>k&(1<<(n-j-1))?"G":"R").join("");
    add(n+"-bar "+pattern,i=>Array.from({length:n},(_,j)=>pattern[n-1-j]==="G"?up(i-j):down(i-j)).every(Boolean),"color-code");
  }
  // Lagged rules explicitly describe the day BEFORE the current signal.
  // The current signal still precedes the future target by 1..3 sessions.
  const prior=predicates.filter(p=>["wick","body","color","named","sequence","gap"].includes(p.category));
  const base=predicates.map((p,k)=>({id:"S"+k,name:p.name,flags:p.flags,family:p.category}));
  const lagged=[];
  prior.forEach((p,k)=>{
    for(const offset of [1,2]){
      const shifted=Array.from({length:L},(_,i)=>i>=minIndex+offset&&p.flags[i-offset]);
      lagged.push({id:"L"+k+"_"+offset,name:p.name+" "+offset+" day"+(offset===1?"":"s")+" earlier",
        flags:shifted,family:p.category,lag:offset});
    }
  });
  const atomic=base.concat(lagged);
  const candidates=atomic.slice(); // retain every single-rule candidate
  // Prune pair combinations using unsupervised prevalence only.
  // Outcome labels are not consulted to decide what enters the library.
  const viable=atomic.filter(p=>{
    let n=0;for(const i of train)if(p.flags[i])n++;
    return n>=5 && n<=train.length*.85;
  });
  // Restrict pairs to different families or different time offsets and avoid
  // obvious identical-name synonyms; this still creates thousands of patterns.
  for(let a=0;a<viable.length;a++) for(let b=a+1;b<viable.length;b++){
    const x=viable[a],y=viable[b];
    if(x.family===y.family && !x.lag && !y.lag)continue;
    const flags=Array.from({length:L},(_,i)=>x.flags[i]&&y.flags[i]);
    candidates.push({id:x.id+"+"+y.id,name:x.name+" + "+y.name,flags,family:"combination"});
  }
  function evaluate(c,code,indices) {
    const ys=targets[code];
    let fired=0,hits=0;
    for(const i of indices)if(c.flags[i]){fired++; if(ys[i])hits++;}
    return {fired,hits,precision:fired?hits/fired:null};
  }
  const analysis={};
  const baseRates={};
  for(const code of labels) {
    const trainEvents=train.filter(i=>targets[code][i]).length;
    const testEvents=test.filter(i=>targets[code][i]).length;
    const baseline=trainEvents/train.length;
    const baselineTest=testEvents/test.length;
    baseRates[code]={train:baseline,test:baselineTest,trainWindows:trainEvents,testWindows:testEvents,
      trainLabels:labeled.filter(p=>p.code===code && dateIndex.has(p.date) && dateIndex.get(p.date)<split).length,
      testLabels:labeled.filter(p=>p.code===code && dateIndex.has(p.date) && dateIndex.get(p.date)>=split).length};
    const ranked=[];
    for(const c of candidates){
      const tr=evaluate(c,code,train);
      if(tr.fired<5 || tr.fired>train.length*.6 || tr.hits<1)continue;
      const te=evaluate(c,code,test);
      const precision=tr.precision;
      // Wilson lower bound, conservative for tiny success counts; training ONLY.
      const z=1.96, n=tr.fired;
      const center=precision+z*z/(2*n);
      const spread=z*Math.sqrt((precision*(1-precision)+z*z/(4*n))/n);
      const lower=(center-spread)/(1+z*z/n);
      const score=(lower-baseline)*Math.sqrt(tr.hits);
      ranked.push({id:c.id,name:c.name,family:c.family,
        train:tr,test:te,score,lift:baseline?precision/baseline:0,
        lastBarMatch:!!c.flags[L-1],candidate:c});
    }
    ranked.sort((a,b)=>b.score-a.score || b.train.hits-a.train.hits ||
      a.train.fired-b.train.fired || a.id.localeCompare(b.id));
    const leaders=ranked.slice(0,25).map(({candidate,...rest})=>rest);
    analysis[code]={leaders,baseline:baseRates[code]};
  }
  const candidatesMap=new Map(candidates.map(c=>[c.id,c]));
  function signals(id) {
    const c=candidatesMap.get(id);
    return c ? bars.filter((_,i)=>c.flags[i]).map(b=>b.time) : [];
  }
  const exposed={
    symbol:"SPX",asOf:source.asOf,barCount:L,dateStart:bars[0].time,dateEnd:bars[L-1].time,
    daily:bars,splitDate:bars[split].time,trainCount:train.length,testCount:test.length,
    leadSessions:horizon,candidatesGenerated:candidates.length,atomicCount:atomic.length,
    labels,analysis,baseRates,signals,
    selectedEvents:labels.map(code=>({code,
      dates:[...labelDates[code]].filter(d=>dateIndex.has(d))})),
    latestMatches:Object.fromEntries(labels.map(code=>[code,analysis[code].leaders
      .slice(0,10).filter(x=>x.lastBarMatch).map(x=>({id:x.id,name:x.name,
        train:x.train,test:x.test}))])),
    note:"Exploratory exhaustive search, tiny labeled sample and multiple-comparison risk. No validated odds or trade signals."
  };
  window.SPX_CANDLE_PATTERNS=exposed;
})();
