"use strict";
/*
 * External context: Cboe VIX and S&P 500 constituent breadth.
 * Context is NOT merged into the 1871+ monthly price-only model.
 * VIX conditional event counts are descriptive with fixed prior-percentile rules.
 */
(() => {
  const study=window.SPX_PATTERN_ENGINE;
  const source=window.SPX_VIX;
  const breadth=window.SPX_BREADTH;
  if(!study) return;
  const vixMap=new Map((source?.monthly || []).map(([date,value])=>[date,Number(value)]));
  const sorted=[...vixMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const quantile=(array,p)=>{
    const s=array.slice().sort((a,b)=>a-b);
    if(!s.length) return null;
    return s[Math.min(s.length-1,Math.floor((s.length-1)*p))];
  };
  const eligible=study.forecastRows.map(row=>{
    const index=sorted.findIndex(([date])=>date===row.date);
    if(index<60) return null;
    const prior=sorted.slice(index-60,index).map(([,v])=>v);
    const vix=sorted[index][1];
    return {...row,vix,lowCut:quantile(prior,.25),highCut:quantile(prior,.75),
      regime:vix>=quantile(prior,.75)?"elevated":vix<=quantile(prior,.25)?"subdued":"ordinary"};
  }).filter(Boolean);
  const vixStats=["dH","dL","JH","JL"].map((name,k)=>{
    const classified=["elevated","ordinary","subdued"].map(regime=>{
      const rows=eligible.filter(row=>row.regime===regime);
      const count=rows.length;
      const events=rows.filter(row=>row.actual[k]).length;
      return {regime,count,events,rate:count?events/count:null};
    });
    return {code:name,groups:classified};
  });
  const lastVix=sorted.at(-1)||null;
  function getBreadth(){
    if(!breadth?.daily?.length) return null;
    const prices=new Map((window.SPX_OHLC?.daily||[]).map(r=>[r[0],r[4]]));
    const data=breadth.daily.map(([date,up,down,line])=>({date,up,down,line}))
      .filter(row=>row.date<=window.SPX_OHLC.asOf && prices.has(row.date));
    if(data.length<22) return null;
    const now=data.at(-1),prev=data.at(-21);
    const lastFive=data.slice(-5);
    const pNow=prices.get(now.date),pPrev=prices.get(prev.date);
    const priceReturn=100*(pNow/pPrev-1);
    const lineChange=now.line-prev.line;
    const advPercent=now.up/(now.up+now.down);
    const priceUp=priceReturn>0,breadthUp=lineChange>0;
    return {asOf:now.date,advances:now.up,declines:now.down,
      advPercent,adLine:now.line,ad20Change:lineChange,
      netFive:lastFive.reduce((sum,item)=>sum+item.up-item.down,0),
      spx20Return:priceReturn,
      divergence:priceUp!==breadthUp ? (priceUp?"SPX rising while breadth declining":"SPX falling while breadth rising") : "SPX and breadth agree on 20-session direction",
      biased:true};
  }
  const context={
    vix:{source:source?.source || "Unavailable",lastDate:lastVix?.[0]||null,
      lastValue:lastVix?.[1]||null,eligibleMonths:eligible.length,
      testFrom:eligible[0]?.date||null,testTo:eligible.at(-1)?.date||null,
      conditional:vixStats},
    breadth:getBreadth()
  };
  window.SPX_MARKET_CONTEXT=Object.freeze(context);
  const slot=document.getElementById("pattern-research");
  if(!slot) return;
  const section=document.createElement("section");
  section.className="research-context";
  section.innerHTML="<h3>External market context: VIX and breadth</h3>";
  const make=(tag,cl,txt)=>{const e=document.createElement(tag);if(cl)e.className=cl;e.textContent=txt;return e;};
  section.appendChild(make("p","research-note","These additional indicators help corroborate or contradict SPX price action. They are not included in the 155-year probability model, because consistent VIX and point-in-time breadth records do not extend back to 1871."));
  if(lastVix){
    const v=make("p","research-note","VIX archive: "+lastVix[1].toFixed(2)+" at "+lastVix[0].slice(0,7)+
      " (month-end observation; may be stale). Fixed prior-60-month VIX quartiles are used below; these are conditional historical associations, not trained forecasts.");
    section.appendChild(v);
    const list=document.createElement("table");list.className="research-table";
    list.innerHTML="<thead><tr><th>Next-3-month turning point</th><th>Elevated VIX</th><th>Ordinary VIX</th><th>Subdued VIX</th></tr></thead>";
    const tbody=document.createElement("tbody");
    for(const item of vixStats){
      const tr=make("tr","","");
      tr.appendChild(make("td","",item.code));
      for(const g of item.groups)tr.appendChild(make("td","",g.count?g.events+" / "+g.count+" ("+(g.rate*100).toFixed(1)+"%)":"Insufficient data"));
      tbody.appendChild(tr);
    }
    list.appendChild(tbody);
    const sc=document.createElement("div");sc.className="research-table-wrap";sc.appendChild(list);section.appendChild(sc);
    section.appendChild(make("p","research-note","VIX conditional sample: "+eligible.length+" monthly observations, "+
      (eligible[0]?.date||"—")+" through "+(eligible.at(-1)?.date||"—")+
      ". This secondary regime comparison is descriptive; small class counts can make percentages unstable."));
  }
  if(context.breadth){
    const b=context.breadth;
    section.appendChild(make("p","research-note",
      "Breadth through "+b.asOf+": "+b.advances+" advancing / "+b.declines+" declining S&P 500 constituents ("+
       (100*b.advPercent).toFixed(1)+"% advancing). A/D line 20-session change "+
       (b.ad20Change>=0?"+":"")+b.ad20Change.toLocaleString("en-US")+
       ", versus SPX 20-session return "+(b.spx20Return>=0?"+":"")+b.spx20Return.toFixed(2)+"%. "+
       b.divergence+"."));
    section.appendChild(make("p","research-note",
      "Breadth warning: this third-party series is calculated using a modern constituent universe across about two years. It may have survivorship/selection bias, and must not be interpreted as historically reconstructed 1871 breadth."));
  } else {
    section.appendChild(make("p","research-note","Reliable S&P 500 breadth history is unavailable; no breadth figure was invented."));
  }
  slot.appendChild(section);
})();
