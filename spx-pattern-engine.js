"use strict";
/*
 * Historical SPX turning-point research engine v1.
 * Uses prior information only for each prediction. Labels are derived AFTER
 * a price swing has matured; future prices never enter predictive features.
 * The 1871+ price series contains monthly averages, NOT monthly closes.
 * Probability estimates are exploratory and must be judged by walk-forward tests.
 */
(() => {
  const data = window.SPX_HISTORY;
  const ohlc = window.SPX_OHLC;
  if (!data || !ohlc || !Array.isArray(data.monthly)) return;
  const raw = data.monthly.map(row => ({ date: row[0], price: Number(row[1]) }))
    .filter(row => Number.isFinite(row.price) && row.price > 0);
  const complete = raw.filter(row => row.date <= data.lastCompleteMonth);
  const names = ["moderateHigh", "moderateLow", "majorHigh", "majorLow"];
  const short = ["dH", "dL", "JH", "JL"];
  const H = 3;               // predicted event within the following three months
  const LABEL_LOOKAHEAD = 12;
  const EMBARGO = H + LABEL_LOOKAHEAD;
  const FOLD_MONTHS = 60;     // retrain each 5 years; no future-period tuning
  const MIN_TRAIN_MONTHS = 240;
  const period = (index) => new Date(raw[index].date + "T12:00:00Z").getUTCMonth();
  const ret = (i, n) => Math.log(raw[i].price / raw[i - n].price);
  const featureCount = 16;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function stats(vals) {
    const mean = vals.reduce((a,b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / vals.length;
    return { mean, sd: Math.sqrt(Math.max(0, variance)) };
  }
  function features(i) {
    const p = raw[i].price;
    const prev = raw.slice(i - 13, i + 1);
    const close12 = raw.slice(i - 11, i + 1).map(row => row.price);
    const movements = prev.slice(1).map((row,j) => Math.log(row.price / prev[j].price));
    const d6 = stats(movements.slice(-6)).sd * Math.sqrt(12);
    const d12 = stats(movements).sd * Math.sqrt(12);
    const changes = raw.slice(i - 14, i + 1).slice(1).map((row,j) => row.price - raw[i - 14 + j].price);
    const up = changes.reduce((sum,n) => sum + Math.max(n,0),0) / changes.length;
    const down = changes.reduce((sum,n) => sum + Math.max(-n,0),0) / changes.length;
    const rsi = (up+down)>0 ? (up/(up+down)-.5)*2 : 0;
    const m = period(i);
    const monthIndex = i;
    return [
      ret(i,1), ret(i,3), ret(i,6), ret(i,12),
      ret(i,3) - ret(i-3,3),
      p / (close12.reduce((a,b) => a+b,0)/close12.length)-1,
      p / Math.max(...close12)-1, p / Math.min(...close12)-1,
      d6, d12, rsi,
      Math.sin(2*Math.PI*m/12), Math.cos(2*Math.PI*m/12),
      Math.sin(2*Math.PI*monthIndex/48), Math.cos(2*Math.PI*monthIndex/48),
      Math.sin(2*Math.PI*monthIndex/96)
    ];
  }

  function truePivot(i) {
    // Explicit objective definitions, chosen as design parameters rather than
    // selected after viewing the 1990+ test results.
    if (i < 26 || i + LABEL_LOOKAHEAD >= raw.length) return null;
    const p = raw[i].price;
    const prev6 = raw.slice(i-6, i).map(r => r.price);
    const next6 = raw.slice(i+1, i+7).map(r => r.price);
    const next12 = raw.slice(i+1, i+13).map(r => r.price);
    const peak2 = raw.slice(i-2,i+3).every((r,k) => k===2 || p >= r.price);
    const trough2 = raw.slice(i-2,i+3).every((r,k) => k===2 || p <= r.price);
    const peak5 = raw.slice(i-5,i+6).every((r,k) => k===5 || p >= r.price);
    const trough5 = raw.slice(i-5,i+6).every((r,k) => k===5 || p <= r.price);
    const highMove = Math.min(...next6)/p-1;
    const lowMove = Math.max(...next6)/p-1;
    const highMajor = peak5 && Math.min(...next12)/p-1 <= -.16 && p / Math.min(...prev6) - 1 >= .05;
    const lowMajor = trough5 && Math.max(...next12)/p-1 >= .16 && Math.max(...prev6)/p - 1 >= .05;
    const highMinor = peak2 && highMove <= -.06 && p / Math.min(...prev6)-1 >= .025;
    const lowMinor = trough2 && lowMove >= .06 && Math.max(...prev6)/p-1 >= .025;
    return [highMinor && !highMajor, lowMinor && !lowMajor, highMajor, lowMajor];
  }
  const pivots = raw.map((_,i)=>truePivot(i));
  const allFeatures = raw.map((_,i)=>i>=26?features(i):null);
  const targets = raw.map((_,i) => names.map((_,k) => {
    if (i+EMBARGO>=raw.length) return null;
    return [1,2,3].some(offset => pivots[i+offset] && pivots[i+offset][k]) ? 1 : 0;
  }));

  function trainingRows(cutoffIndex) {
    const last = cutoffIndex-EMBARGO;
    const out = [];
    for(let i=27; i<=last; i++) {
      if (allFeatures[i] && targets[i][0]!==null) out.push(i);
    }
    return out;
  }
  function fit(indexes, kind) {
    const avg = new Array(featureCount).fill(0);
    const sd = new Array(featureCount).fill(0);
    for (const i of indexes) for (let f=0;f<featureCount;f++) avg[f]+=allFeatures[i][f];
    for(let f=0;f<featureCount;f++) avg[f]/=indexes.length;
    for (const i of indexes) for(let f=0;f<featureCount;f++) sd[f]+=(allFeatures[i][f]-avg[f])**2;
    for(let f=0;f<featureCount;f++) sd[f]=Math.max(1e-7,Math.sqrt(sd[f]/indexes.length));
    const x=indexes.map(i=>allFeatures[i].map((v,f)=>clamp((v-avg[f])/sd[f],-5,5)));
    const y=indexes.map(i=>targets[i][kind]);
    const base=clamp(y.reduce((a,b)=>a+b,0)/y.length, .0001, .9999);
    const w=new Array(featureCount).fill(0);
    let bias=Math.log(base/(1-base));
    const ridge=0.08;
    for(let pass=0;pass<260;pass++) {
      const grad=new Array(featureCount).fill(0);
      let gb=0;
      for(let j=0;j<x.length;j++) {
        let z=bias;
        for(let f=0;f<featureCount;f++) z+=w[f]*x[j][f];
        const err=(1/(1+Math.exp(-clamp(z,-25,25))))-y[j];
        gb+=err;
        for(let f=0;f<featureCount;f++) grad[f]+=err*x[j][f];
      }
      const rate=.24/(1+pass/150);
      bias-=rate*gb/x.length;
      for(let f=0;f<featureCount;f++) w[f]-=rate*(grad[f]/x.length + ridge*w[f]);
    }
    return { avg, sd, w, bias, base };
  }
  function predict(model, vector) {
    let z=model.bias;
    for(let f=0;f<featureCount;f++) z+=model.w[f]*clamp((vector[f]-model.avg[f])/model.sd[f],-5,5);
    return clamp(1/(1+Math.exp(-clamp(z,-25,25))), 0,1);
  }

  const testStart=raw.findIndex(row=>row.date>="1990-01-01");
  const testEnd=raw.length-EMBARGO-1;
  const predictionRows=[];
  const testYears={start:raw[testStart]?.date, end:raw[testEnd]?.date};
  let fitted=null;
  let trainedTo=null;
  for(let i=testStart;i<=testEnd;i++){
    if(!fitted || i-testStart>=FOLD_MONTHS && (i-testStart)%FOLD_MONTHS===0) {
      const train=trainingRows(i);
      if(train.length < MIN_TRAIN_MONTHS) continue;
      fitted=names.map((_,k)=>fit(train,k));
      trainedTo=raw[i-EMBARGO].date;
    }
    const vector=allFeatures[i];
    if (!vector || targets[i][0]===null) continue;
    predictionRows.push({
      date:raw[i].date,
      probabilities:fitted.map(model=>predict(model,vector)),
      baseline:fitted.map(model=>model.base),
      actual:targets[i].slice(),
      fittedThrough:trainedTo,
    });
  }
  const trainLatest = trainingRows(raw.length-1);
  const finalModels=names.map((_,k)=>fit(trainLatest,k));
  const lastIndex=raw.findIndex(row=>row.date===data.lastCompleteMonth);
  const latestForecast=finalModels.map(model=>predict(model, allFeatures[lastIndex]));
  const latestBase=finalModels.map(model=>model.base);
  const evaluations=names.map((name,k)=>{
    const vals=predictionRows.map(row=>({
      date:row.date,p:row.probabilities[k],base:row.baseline[k],y:row.actual[k]
    }));
    const successes=vals.reduce((a,v)=>a+v.y,0);
    const actualRate=successes/vals.length;
    const brier=vals.reduce((a,v)=>a+(v.p-v.y)**2,0)/vals.length;
    const baselineBrier=vals.reduce((a,v)=>a+(v.base-v.y)**2,0)/vals.length;
    const top=Math.max(1, Math.ceil(vals.length*.1));
    const winners=vals.slice().sort((a,b)=>b.p-a.p).slice(0,top);
    const topHits=winners.reduce((a,v)=>a+v.y,0);
    const topRate=topHits/top;
    const emitted=vals.filter(v=>v.p>=.5);
    return {
      key:name,code:short[k],tested:vals.length,events:successes,
      actualRate,meanProbability:vals.reduce((a,v)=>a+v.p,0)/vals.length,
      brier,baselineBrier,brierSkill:1-brier/baselineBrier,
      topCount:top,topHits,topRate,topLift:actualRate>0?topRate/actualRate:null,
      highThresholdCount:emitted.length,
      highThresholdPrecision:emitted.length?emitted.filter(v=>v.y).length/emitted.length:null
    };
  });
  const ranked = predictionRows.map(row=>{
    const high=row.probabilities[0]+row.probabilities[2];
    const low=row.probabilities[1]+row.probabilities[3];
    return {date:row.date,high:Math.min(1,high),low:Math.min(1,low)};
  });
  // For the historical chart, show only the top decile of earlier, out-of-sample
  // alerts. Top decile threshold is determined from ALL OOS predictions and
  // therefore is retrospective visualization, NOT an executable past alert.
  const thresholds=["high","low"].map(key=>{
    const sorted=ranked.map(v=>v[key]).sort((a,b)=>a-b);
    return sorted[Math.floor(sorted.length*.9)]||1;
  });
  const chartSignals=ranked.filter(r=>r.high>=thresholds[0] || r.low>=thresholds[1])
    .map(row=>({date:row.date,kind:row.high>=thresholds[0]&&row.high>=row.low?"H":
       row.low>=thresholds[1]?"L":"H",high:row.high,low:row.low}));

  function rsiDaily(bars, n=14) {
    const changes=bars.slice(-n-1).slice(1).map((bar,j)=>bar.close-bars[bars.length-n-1+j].close);
    const gains=changes.reduce((a,x)=>a+Math.max(0,x),0);
    const losses=changes.reduce((a,x)=>a+Math.max(0,-x),0);
    return gains+losses ? 100*gains/(gains+losses) : 50;
  }
  function dailyEvidence() {
    const rows=ohlc.daily.map(r=>({time:r[0],open:r[1],high:r[2],low:r[3],close:r[4]}));
    if (rows.length<55) return null;
    const last=rows.at(-1),prior=rows.at(-2);
    const prev20=rows.slice(-21,-1);
    const mean=(arr)=>arr.reduce((a,b)=>a+b,0)/arr.length;
    const sma20=mean(rows.slice(-20).map(r=>r.close));
    const sma50=mean(rows.slice(-50).map(r=>r.close));
    const high20=Math.max(...prev20.map(r=>r.close));
    const low20=Math.min(...prev20.map(r=>r.close));
    const rsi=rsiDaily(rows);
    const returns=rows.slice(-21).slice(1).map((row,j)=>Math.log(row.close/rows[rows.length-21+j].close));
    const annualVol=stats(returns).sd*Math.sqrt(252);
    const highFactors=[
      { label:"Within 2% of preceding 20-session closing high",hit:last.close>=high20*.98 },
      { label:"RSI(14) over 60",hit:rsi>60 },
      { label:"Closing below previous session",hit:last.close<prior.close },
      { label:"Below 20-day average",hit:last.close<sma20 },
      { label:"Short-term momentum rolled over",hit:last.close<rows.at(-4).close },
    ];
    const lowFactors=[
      { label:"Within 2% of preceding 20-session closing low",hit:last.close<=low20*1.02 },
      { label:"RSI(14) below 40",hit:rsi<40 },
      { label:"Closing above previous session",hit:last.close>prior.close },
      { label:"Above 20-day average",hit:last.close>sma20 },
      { label:"Short-term momentum improved",hit:last.close>rows.at(-4).close },
    ];
    return {
      asOf:last.time,price:last.close,sma20,sma50,high20,low20,rsi,annualVol,
      highFactors,lowFactors,highScore:highFactors.filter(x=>x.hit).length,
      lowScore:lowFactors.filter(x=>x.hit).length
    };
  }

  const analysis=Object.freeze({
    symbol:"SPX",dataStart:raw[0].date,
    dataEnd:data.lastCompleteMonth,modelVersion:"v1 (research)",
    foldMonths:FOLD_MONTHS, embargoMonths:EMBARGO,
    forecastHorizonMonths:H,trainingFrom:raw[27].date,
    testFrom:testYears.start,testTo:testYears.end,
    features:featureCount,monthlyCount:complete.length,
    evaluations,latestForecast,latestBase,
    latestDate:data.lastCompleteMonth,
    trainingLastMatured:raw[raw.length-1-EMBARGO].date,
    daily:dailyEvidence(), historicalSignals:chartSignals,
    forecastRows:predictionRows,
    definitions:{
      moderate:"Local +/-2-month extreme; >=6% reversal in following six months; excludes major",
      major:"Local +/-5-month extreme; >=16% reversal within following 12 months",
      warning:"Probability of that event occurring within the NEXT three monthly periods",
      holdout:"1990 onward; 5-year expanding refits; 15-month label embargo",
      warningAboutData:"1871+ figures are reconstructed monthly averages, not daily OHLC or monthly end closes.",
    }
  });
  window.SPX_PATTERN_ENGINE=analysis;
})();