"use strict";
/* Display the independent, dated SPX historical validation study. */
(() => {
  const model=window.SPX_PATTERN_ENGINE;
  const slot=document.getElementById("pattern-research");
  if(!slot) return;
  if(!model) {
    slot.textContent="The historical pattern study could not be loaded.";
    return;
  }
  const pct=(value,dec=1)=>Number.isFinite(value)?(100*value).toFixed(dec)+"%":"N/A";
  const num=(value)=>Number(value).toLocaleString("en-US",{maximumFractionDigits:2});
  const el=(tag,cl,text)=>{
    const n=document.createElement(tag);
    if(cl)n.className=cl;
    if(text!==undefined)n.textContent=text;
    return n;
  };
  const prose=(txt)=>el("p","research-note",txt);
  const types=[
    { name:"Moderate high",code:"dH" },
    { name:"Moderate low",code:"dL" },
    { name:"Major high",code:"JH" },
    { name:"Major low",code:"JL" }
  ];
  const top=el("div","research-intro");
  top.appendChild(el("h2","", "SPX turning-point research"));
  top.appendChild(prose(
    "An independent price-and-pattern model alongside your original calendar windows. Forecasts use information available at each evaluation date, not future prices."
  ));
  slot.appendChild(top);
  const meta=el("div","research-meta");
  [
    ["History","Jan 1871 – "+model.dataEnd.slice(0,7)],
    ["Out-of-sample","Jan 1990 – "+model.testTo.slice(0,7)],
    ["Predictions tested",String(model.evaluations[0].tested)],
    ["Horizon","Following three months"]
  ].forEach(([key,value])=>{
    const box=el("div","research-metric");
    box.appendChild(el("span","",key));
    box.appendChild(el("strong","",value));
    meta.appendChild(box);
  });
  slot.appendChild(meta);

  const headline=el("h3","","Most recent monthly forecast");
  slot.appendChild(headline);
  slot.appendChild(prose("As of "+model.latestDate.slice(0,7)+
     "; probability that a subsequently defined monthly turning point occurs in one of the next three months. These are research estimates, not probabilities for your exact-day turning-point definitions."));
  const grid=el("div","research-cards");
  for(let i=0;i<4;i++) {
    const row=model.evaluations[i], item=types[i], p=model.latestForecast[i];
    const card=el("article","research-card");
    const heading=el("div","research-card-head");
    heading.appendChild(el("strong","",item.code+" · "+item.name));
    card.appendChild(heading);
    card.appendChild(el("div","research-big",pct(p)));
    const bar=el("div","research-meter");
    const fill=el("span","");
    fill.style.width=Math.min(100,p*100)+"%";
    fill.style.background=["#f8a23d","#31c88a","#f16475","#6397ff"][i];
    bar.appendChild(fill);
    card.appendChild(bar);
    card.appendChild(el("small","", "Historical baseline: "+pct(model.latestBase[i])));
    card.appendChild(el("small",row.brierSkill>0.01?"research-plus":"research-caution",
      "Walk-forward skill: "+pct(row.brierSkill,1)+" vs base-rate forecast"));
    grid.appendChild(card);
  }
  slot.appendChild(grid);
  slot.appendChild(el("h3","","Historical results: what actually worked?"));
  slot.appendChild(prose("Every monthly evaluation was made by a model fitted to earlier data with a 15-month outcome embargo. Top-decile hit rates are descriptive rankings of held-out predictions, not profitable trade returns."));
  const table=el("table","research-table");
  const thead=document.createElement("thead");
  const headers=["Turn","Test events","Unconditional rate","Top-scored 10% hit rate","Lift","Brier skill"];
  const hr=document.createElement("tr");
  headers.forEach(name=>hr.appendChild(el("th","",name)));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody=document.createElement("tbody");
  model.evaluations.forEach((row,i)=>{
    const tr=el("tr","");
    [
      types[i].code+" · "+types[i].name,
      row.events+" / "+row.tested,
      pct(row.actualRate),
      row.topHits+" / "+row.topCount+" ("+pct(row.topRate)+")",
      Number.isFinite(row.topLift)?row.topLift.toFixed(2)+"×":"N/A",
      pct(row.brierSkill,2)
    ].forEach((v,j)=>{
      const cell=el("td",j===5&&row.brierSkill<=0?"research-caution":"",v);
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  const scroller=el("div","research-table-wrap");scroller.appendChild(table);slot.appendChild(scroller);
  slot.appendChild(prose("Brier skill greater than zero beats a rolling historical base-rate forecast; negative values mean the statistical model performed worse. On this test, moderate and major lows did not consistently improve every metric. The major-high model did not demonstrate useful ranking performance."));

  slot.appendChild(el("h3","","Current daily SPX confirmation checklist"));
  const daily=model.daily;
  if(daily){
    slot.appendChild(prose("Latest daily OHLC dataset: "+daily.asOf+
       ". These are descriptive indicators calculated from SPX daily prices—not independently backtested turning-point forecasts."));
    const metrics=el("div","research-meta");
    [
      ["Daily close",num(daily.price)],
      ["RSI(14)",daily.rsi.toFixed(1)],
      ["20-day SMA",num(daily.sma20)],
      ["50-day SMA",num(daily.sma50)],
      ["Realized volatility (20D)",pct(daily.annualVol)]
    ].forEach(([key,value])=>{
      const box=el("div","research-metric");
      box.appendChild(el("span","",key));
      box.appendChild(el("strong","",value));
      metrics.appendChild(box);
    });
    slot.appendChild(metrics);
    const checks=el("div","research-checks");
    [[daily.highFactors,"High warning signs"],[daily.lowFactors,"Low warning signs"]].forEach(([factors,title])=>{
      const section=el("div","research-check");
      section.appendChild(el("strong","",title+": "+factors.filter(x=>x.hit).length+" / "+factors.length));
      for(const x of factors) section.appendChild(el("div",x.hit?"research-hit":"research-miss",(x.hit?"✓ ":"○ ")+x.label));
      checks.appendChild(section);
    });
    slot.appendChild(checks);
  }
  slot.appendChild(el("h3","","Data quality and study limitations"));
  const notes=el("div","research-method");
  [
    "Sample labels: your 13 dH/dL/JH/JL dates are kept on the SPX chart, but they are too few to train a defensible 4-class probability model. The historical test uses separately defined, reproducible swing labels.",
    "Moderate monthly turning point: +/-2-month extremum followed by a >=6% move against the preceding trend within six months. Major: +/-5-month extremum and >=16% 12-month reversal. Major overrides moderate.",
    "Inputs: 1-, 3-, 6-, 12-month price changes; trend/acceleration; 12-month high/low location; realized volatility; RSI-like momentum; seasonality and fixed 48/96-month cycles. All features come from the preceding record.",
    "This is a diagnostic, not a discovery that all cycles work. Adding numerous patterns can overfit; the held-out test decides whether features add value.",
    "The long history uses monthly S&P Composite averages, not genuine closing-price highs and lows. Daily OHLC data starts in November 2024. VIX and true market breadth are not included in the historical probabilities unless a verified independent historical dataset is added.",
    "The validation sample spans 1990–Aug 2025; parameters and label definitions are not optimized against your 13 dates. Results do not establish statistical significance or investment profitability."
  ];
  notes.forEach(line=>notes.appendChild(prose(line)));
  slot.appendChild(notes);
})();
