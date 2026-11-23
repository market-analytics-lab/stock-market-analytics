"use strict";
/* Separate SPX candlestick chart with user labels and selected pattern signals. */
(() => {
  const model=window.SPX_CANDLE_PATTERNS, lib=window.LightweightCharts;
  const shell=document.getElementById("candle-explorer");
  const surface=document.getElementById("candle-explorer-surface");
  if (!shell||!surface)return;
  const get=id=>document.getElementById(id);
  if(!model||!lib) {get("candle-explorer-status").textContent="Candle miner could not load.";return;}
  // Historical chart data is intentionally separate from the candidate-rule
  // miner: adding 70 years of unlabeled days must not swamp the 13 labeled turns.
  const archive=window.SPX_LONG_OHLC;
  const merged=new Map();
  for(const r of archive?.daily||[])merged.set(r[0],{time:r[0],open:r[1],high:r[2],low:r[3],close:r[4]});
  for(const b of model.daily)merged.set(b.time,b);
  const full=[...merged.values()].sort((a,b)=>a.time.localeCompare(b.time));
  const lastDate=full.at(-1).time, firstDate=full[0].time;
  const flatCount=full.filter(b=>Math.abs(b.high-b.low)<=.01).length;
  const firstWickDate=full.find(b=>b.high-b.low>.01)?.time||null;
  const colors={dH:"#f8a23d",dL:"#31c88a",JH:"#f16475",JL:"#6397ff",
    RH:"#b86cf4",RL:"#23c9c9"};
  const p=v=>v===null?"N/A":(v*100).toFixed(1)+"%";
  const node=(tag,cl,value)=>{
    const e=document.createElement(tag);if(cl)e.className=cl;
    if(value!==undefined)e.textContent=value;return e;
  };
  const chart=lib.createChart(surface,{width:surface.clientWidth,height:surface.clientHeight,
    layout:{background:{type:"solid",color:"#101a2a"},textColor:"#9aabc4",attributionLogo:true},
    grid:{vertLines:{color:"#223149"},horzLines:{color:"#223149"}},
    rightPriceScale:{borderColor:"#304058",scaleMargins:{top:.12,bottom:.1}},
    timeScale:{borderColor:"#304058",barSpacing:7,rightOffset:3},
    crosshair:{mode:lib.CrosshairMode.Normal},
    handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true},
    handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true}
  });
  const candles=chart.addSeries(lib.CandlestickSeries,{
    upColor:"#26bb9a",downColor:"#ef626e",borderVisible:false,
    wickUpColor:"#26bb9a",wickDownColor:"#ef626e",priceLineVisible:true
  });
  candles.setData(full);
  // In older vendor periods the record often has O=H=L=C.
  // A separate closing-level line is used over that close-only area:
  // no wicks are manufactured for those sessions.
  const legacyLine=chart.addSeries(lib.LineSeries,{
    color:"#a8a9ff",lineWidth:1,priceLineVisible:false,
    lastValueVisible:false,title:"Older index closing level (flat OHLC archive)"
  });
  const legacy=full.filter(b=>firstWickDate && b.time<firstWickDate).map(b=>({time:b.time,value:b.close}));
  if(legacy.length)legacyLine.setData(legacy);
  const markerApi=typeof lib.createSeriesMarkers==="function"?lib.createSeriesMarkers(candles,[]):null;
  const byDate=new Map(full.map(b=>[b.time,b]));
  let code="JL",id=null,showSignals=false,logScale=false;
  // Historical backcasts are pre-1997 candidate-pattern coincidences, not
  // verified user labels, and never modify the stored historical database.
  const historicalBackcast=model.historicalBackcast||null;
  const advanced=model.advanced||null;
  let showBackcast=false,backcastFilter="core",backcastEngine=advanced?"expanded":"original";
  let showRecentExpanded=false;
  function activeBackcast(){
    if(backcastEngine==="expanded"&&advanced)return {candidates:advanced.pastSuggestions};
    return historicalBackcast;
  }
  function backcastAllowed(type){
    if(backcastFilter==="all")return true;
    if(backcastFilter==="core")return ["dH","dL","JH","JL"].includes(type);
    return type===backcastFilter;
  }
  function historicalFocus(){
    const start=full.findIndex(b=>b.time>="1987-01-01");
    const end=full.findIndex(b=>b.time>="1997-01-01");
    if(start>=0&&end>start)chart.timeScale().setVisibleLogicalRange({
      from:Math.max(0,start-8),to:Math.min(full.length+2,end+8)
    });
  }
  function backcastStatus(){
    const output=get("candle-backcast-count");
    if(!output)return;
    const active=activeBackcast();
    const eligible=(active?.candidates||[]).filter(item=>backcastAllowed(item.code));
    const counts=Object.fromEntries(["dH","dL","JH","JL","RH","RL"].map(k=>[
      k,eligible.filter(x=>x.code===k).length
    ]));
    output.textContent=active
      ?(showBackcast?"Visible":"Hidden")+" · "+eligible.length+
        " historical hypotheses ("+Object.entries(counts).filter(x=>x[1]).map(x=>x[0]+" "+x[1]).join(" · ")+
        ") · "+(backcastEngine==="expanded"?"expanded 1,020-feature model":"original model")+
        " · signals 1–3 sessions ahead, not confirmed turns"
      :"No retrospective research candidates are available yet.";
  }
  // One chart flag per trading date. The permanent GitHub labels take
  // precedence over temporary annotations and research pattern dots.
  const permanent=new Map((window.SPX_TURNING?.points||[]).map(p=>[p.date,p.code]));
  // Optional research labels are local to this browser until the user
  // explicitly copies and shares their dates. No GitHub writes occur here.
  const saveKey="spx-additional-turns-v1";
  let isMarking=false;
  let manualLabels=[];
  try {
    const raw=JSON.parse(localStorage.getItem(saveKey)||"[]");
    if(Array.isArray(raw)){
      // Previously shared annotations can remain in browser storage after
      // they have been committed to GitHub; never render or export them twice.
      const onePerDate=new Map();
      for(const x of raw){
        if(!x||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||
          !["dH","dL","JH","JL","RH","RL"].includes(x.code)||
          permanent.has(x.date))continue;
        onePerDate.set(x.date,{date:x.date,code:x.code});
      }
      manualLabels=[...onePerDate.values()].slice(-500);
    }
  } catch(_) { manualLabels=[]; }
  function shareText(){
    return manualLabels.slice().sort((a,b)=>a.date.localeCompare(b.date)).
      map(x=>x.date+" "+x.code).join("\n");
  }
  function persist(){
    try { localStorage.setItem(saveKey,JSON.stringify(manualLabels)); }
    catch(_) { /* Some browsers block local storage; export still works. */ }
  }
  function showManualStatus(message){
    const area=get("candle-label-status");
    if(area)area.textContent=message;
    const output=get("candle-label-output");
    if(output)output.value=shareText();
  }
  function paintTheme(){
    const light=document.documentElement.dataset.theme==="light";
    chart.applyOptions({layout:{background:{type:"solid",color:light?"#fff":"#101a2a"},
      textColor:light?"#53677f":"#9aabc4",attributionLogo:true},
      grid:{vertLines:{color:light?"#edf2f7":"#223149"},
        horzLines:{color:light?"#edf2f7":"#223149"}},
      rightPriceScale:{borderColor:light?"#dce4ef":"#304058"},
      timeScale:{borderColor:light?"#dce4ef":"#304058"}});
  }
  function setRange(key){
    if(key==="ALL"){chart.timeScale().fitContent();return;}
    const days={ "1M":31,"3M":93,"6M":186,"1Y":366,"5Y":1827,"10Y":3653,"25Y":9132,"50Y":18263}[key]||186;
    const firstDateCutoff=new Date(Date.parse(lastDate+"T12:00:00Z")-86400000*days).toISOString().slice(0,10);
    const first=full.findIndex(b=>b.time>=firstDateCutoff);
    chart.timeScale().setVisibleLogicalRange({from:Math.max(-.5,first-.5),to:full.length+3});
  }
  function plotMarkers(){
    if(!markerApi)return;
    const uniqueByDay=new Map();
    for(const [time,turnCode] of permanent){
      if(!byDate.has(time))continue;
      uniqueByDay.set(time,{
        time,position:turnCode.endsWith("H")?"aboveBar":"belowBar",
        color:colors[turnCode],shape:turnCode.endsWith("H")?"arrowDown":"arrowUp",
        text:turnCode,size:turnCode.startsWith("J")?2:1
      });
    }
    for(const own of manualLabels){
      if(!byDate.has(own.date)||uniqueByDay.has(own.date))continue;
      uniqueByDay.set(own.date,{
        time:own.date,position:own.code.endsWith("H")?"aboveBar":"belowBar",
        color:colors[own.code],shape:own.code.endsWith("H")?"arrowDown":"arrowUp",
        text:own.code+"*",size:own.code.startsWith("J")?2:1
      });
    }
    // Optional 1962–1996 backward transfer. Circles marked "?"
    // distinguish guesses from the user's confirmed high/low arrows.
    if(showBackcast&&activeBackcast()){
      for(const suggestion of activeBackcast().candidates){
        if(!backcastAllowed(suggestion.code)||!byDate.has(suggestion.date)||
          uniqueByDay.has(suggestion.date))continue;
        const type=suggestion.code;
        uniqueByDay.set(suggestion.date,{
          time:suggestion.date,
          position:type.endsWith("H")?"aboveBar":"belowBar",
          color:colors[type],shape:"circle",text:type+"?",size:1
        });
      }
    }
    // Separate optional recent model signals. "~" indicates a historical
    // date when a JL-like precursor pattern FIRED, not a confirmed low.
    if(showRecentExpanded&&advanced){
      for(const suggestion of advanced.recentSuggestions){
        if(!byDate.has(suggestion.date)||uniqueByDay.has(suggestion.date))continue;
        const type=suggestion.code;
        uniqueByDay.set(suggestion.date,{
          time:suggestion.date,
          position:type.endsWith("H")?"aboveBar":"belowBar",
          color:colors[type],shape:"circle",text:type+"~",size:1
        });
      }
    }
    if(showSignals&&id){
      for(const time of model.signals(id)){
        // A research dot must not obscure an already labeled turning point.
        if(!byDate.has(time)||uniqueByDay.has(time))continue;
        uniqueByDay.set(time,{
          time,position:code.endsWith("H")?"aboveBar":"belowBar",
          color:"#bca4ff",shape:"circle",
          text:time<model.splitDate?"P•":"T•",size:1
        });
      }
    }
    const markers=[...uniqueByDay.values()].sort((a,b)=>a.time.localeCompare(b.time));
    markerApi.setMarkers(markers);
  }
  function drawTable(){
    const panel=get("candle-explorer-patterns");panel.replaceChildren();
    const patterns=model.analysis[code].leaders.slice(0,12);
    if(!patterns.length){
      const waiting=model.analysis[code].status==="awaiting-user-labels";
      panel.appendChild(node("p","candle-warning",waiting
        ?"Awaiting "+code+" dates. Select this bear-market category above, label its historical candles, and send your saved date list. No pattern or probability is being invented."
        :"No candidate patterns met the minimum training support for this class."));
      return;
    }
    const table=node("table","candle-pattern-table");
    const head=node("thead",""),tr=node("tr","");
    ["Discovered precursor rule","Earlier: hits / fires","Later holdout: hits / fires","Chart"].forEach(t=>tr.appendChild(node("th","",t)));
    head.appendChild(tr);table.appendChild(head);
    const body=node("tbody","");
    patterns.forEach(item=>{
      const row=node("tr",item.id===id?"selected":"");
      const name=node("td","",item.name);name.appendChild(node("small","candle-pattern-family",item.family));row.appendChild(name);
      row.appendChild(node("td","",item.train.hits+"/"+item.train.fired+" ("+p(item.train.precision)+", "+item.train.eventsCovered+" unique turns)"));
      row.appendChild(node("td","",item.test.fired?item.test.hits+"/"+item.test.fired+" ("+p(item.test.precision)+", "+item.test.eventsCovered+" unique turns)":"0 fires (not tested)"));
      const button=node("button","candle-explorer-pick",item.id===id?"Showing":"Show");
      button.type="button";button.setAttribute("aria-label","Show "+item.name);
      button.addEventListener("click",()=>{
        id=item.id;showSignals=true;
        const toggle=get("candle-overlay-toggle");
        toggle?.classList.toggle("active",true);
        toggle?.setAttribute("aria-pressed","true");
        render();
      });
      const last=node("td","");last.appendChild(button);row.appendChild(last);body.appendChild(row);
    });
    table.appendChild(body);panel.appendChild(table);
  }
  function textInfo(){
    const target=model.analysis[code],b=target.baseline;
    get("candle-explorer-status").textContent=
      full.length.toLocaleString("en-US")+" archived trading dates shown ("+firstDate+" to "+lastDate+"). "+
      model.candidatesGenerated.toLocaleString("en-US")+" candidate candle rules evaluated against "+
      model.barCount.toLocaleString("en-US")+" real daily SPX records ("+model.dateStart+" to "+model.dateEnd+
      "). Historical rule selection uses observations before "+model.splitDate+
      "; later dates were held out. Signals precede a user-supplied "+code+" turn by 1–3 trading sessions.";
    get("candle-explorer-coverage").textContent=
      target.status==="awaiting-user-labels"
       ?"No "+code+" examples have been supplied. The category is ready for labeling, without manufactured performance statistics."
       :"Training (1997–2018): "+model.trainCount.toLocaleString("en-US")+" decision sessions; "+
        b.trainLabels+" labeled "+code+" dates / "+b.trainWindows+
        " precursor sessions. Holdout (2019–present): "+model.testCount.toLocaleString("en-US")+
        " decision sessions; "+b.testLabels+" labeled "+code+" dates / "+b.testWindows+
        " precursor sessions. Training baseline: "+p(b.train)+".";
    const summary=get("candle-label-summary");
    if(summary)summary.textContent=
      "Saved historical turn labels: "+model.labels.map(x=>x+" "+(model.counts[x]||0)).join(" · ")+
      " ("+permanent.size+" unique confirmed dates; one visible flag per date). "+
      (model.stale?"Warning: historical research report needs refresh; chart dates may be newer than its fitted model.":"The model report and chart datasets agree.");
    const matches=model.latestMatches[code];
    const last=get("candle-explorer-current");last.replaceChildren();
    last.appendChild(node("strong","","Latest indexed candle ("+model.dateEnd+"): "));
    last.appendChild(node("span","",target.status==="awaiting-user-labels"
      ?"Awaiting labeled examples — no "+code+" model trained."
      :matches.length+" of the ten highest-ranked training rules for "+code+" match."));
    if(target.status==="very-small-sample"){
      last.appendChild(node("small","","ONLY "+target.baseline.trainLabels+
        " labeled bear-market turns in training; patterns are illustrative, not validated."));
    }
    last.appendChild(node("small","","A pattern match is not a probability, trade signal, or confirmed reversal."));
    const selected=target.leaders.find(x=>x.id===id);
    const info=get("candle-explorer-selected");info.replaceChildren();
    if(selected) {
      info.appendChild(node("strong","","Selected: "+selected.name));
      info.appendChild(node("span","", " Earlier "+selected.train.hits+"/"+selected.train.fired+
        " winning signal days covering "+selected.train.eventsCovered+" distinct turns; later "+
        selected.test.hits+"/"+selected.test.fired+" winning signal days covering "+
        selected.test.eventsCovered+" distinct turns. Training baseline "+p(b.train)+"."));
      info.appendChild(node("small","","Purple P• = training occurrence (through 2018); T• = 2019+ holdout occurrence. Colored arrows = your historical labeled dates."));
    }
  }

  function advancedStatus(){
    const status=get("candle-expanded-recent-count");
    if(!status)return;
    if(!advanced){status.textContent="Expanded model unavailable or out of date.";return;}
    const n=advanced.recentSuggestions.length;
    status.textContent=(showRecentExpanded?"Visible":"Hidden")+" · "+n+
      " model-only setup dates since 2025; circles use ~, never confirmed JL labels.";
  }
  function renderAdvanced(){
    const output=get("candle-expanded-summary");
    const panel=get("candle-expanded-table");
    const info=get("candle-latest-jl");
    if(!advanced){
      if(output)output.textContent="Expanded study not loaded. The original model remains accessible.";
      if(info)info.textContent="Last confirmed JL: "+
        ((window.SPX_TURNING?.points||[]).filter(p=>p.code==="JL").at(-1)?.date||"none")+
        ". New candidate model unavailable.";
      if(panel)panel.replaceChildren();
      return;
    }
    if(output)output.textContent=
      advanced.featureCount.toLocaleString("en-US")+" automatic candle features across "+
      advanced.distinctFamilies.length+" independent descriptor families generated "+
      advanced.combinationCount.toLocaleString("en-US")+
      " single and paired hypotheses. Features include hammers/stars within 2–34 sessions, "+
      "wick clusters, failed breakouts, gap reversals, price extremes, candle run patterns, "+
      "volatility shifts, trend extensions and combinations. Training "+advanced.samples.train+
      " sessions (1997–2014), validation "+advanced.samples.validation+
      " (2015–2018), untouched later test "+advanced.samples.holdout+
      " (2019–2026). Pattern results are exploratory, not calibrated probabilities.";
    if(panel){
      panel.replaceChildren();
      const table=node("table","candle-pattern-table");
      const head=node("thead",""),heading=node("tr","");
      ["Type","Newly discovered precursor pattern","1997–14 training","2015–18 validation","2019+ holdout"].forEach(x=>
        heading.appendChild(node("th","",x)));
      head.appendChild(heading);table.appendChild(head);
      const body=node("tbody","");
      for(const type of ["dH","dL","JH","JL"]){
        for(const rule of advanced.studies[type].leaders.slice(0,3)){
          const row=node("tr","");
          row.appendChild(node("td","",type));
          row.appendChild(node("td","",rule.name));
          for(const key of ["training","validation","holdout"]){
            const metric=rule[key];
            row.appendChild(node("td","",
              metric.hits+"/"+metric.fired+" precursor days ("+
              (metric.rate===null?"no matches":(100*metric.rate).toFixed(1)+"%")+
              "; "+metric.distinctTurns+" turns)"));
          }
          body.appendChild(row);
        }
      }
      table.appendChild(body);panel.appendChild(table);
    }
    if(info){
      info.replaceChildren();
      const jl=advanced.latestJL;
      info.appendChild(node("strong","","Last confirmed JL: "+(jl.lastConfirmedJL||"None")+" · "));
      info.appendChild(node("span","",
        "Most recent model-only JL setup: "+(jl.lastModelJLTrigger||"No recent trigger")+
        " (NOT a confirmed JL, trigger precedes any potential turn by 1–3 sessions)."));
      info.appendChild(node("small","",jl.status+" as of "+jl.mostRecentBar+
        ". Latest candle matched "+jl.currentJLRuleMatches+"/"+jl.minimumVotes+
        " required voting rules. The November 5 setup window has already expired."));
      info.appendChild(node("small","","Independent legacy timing watch: "+
        jl.calendarWatch.earliest+" through "+jl.calendarWatch.latest+
        " after the October 6 JH. This is a hypothesis, not an established major-low date."));
      info.appendChild(node("small","","If a new JL-like setup fires after a daily data refresh, "+
        "its exact trigger date will appear here automatically; the actual JL date remains unconfirmed until identified."));
    }
    advancedStatus();
  }

  function render(){
    if(!model.analysis[code].leaders.some(x=>x.id===id))id=model.analysis[code].leaders[0]?.id||null;
    for(const btn of shell.querySelectorAll("[data-candle-target]")){
      const on=btn.dataset.candleTarget===code;btn.classList.toggle("active",on);btn.setAttribute("aria-pressed",String(on));
    }
    drawTable();textInfo();renderAdvanced();plotMarkers();
  }
  for(const button of shell.querySelectorAll("[data-candle-target]"))
    button.addEventListener("click",()=>{
      code=button.dataset.candleTarget;id=null;showSignals=false;
      const toggle=get("candle-overlay-toggle");
      toggle?.classList.toggle("active",false);
      toggle?.setAttribute("aria-pressed","false");
      render();
    });
  for(const button of shell.querySelectorAll("[data-candle-range]"))
    button.addEventListener("click",()=>{
      for(const b of shell.querySelectorAll("[data-candle-range]")){
        const active=b===button;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));
      }
      setRange(button.dataset.candleRange);
    });
  get("candle-overlay-toggle")?.addEventListener("click",event=>{
    showSignals=!showSignals;event.currentTarget.classList.toggle("active",showSignals);
    event.currentTarget.setAttribute("aria-pressed",String(showSignals));plotMarkers();
  });

  const hypothesisToggle=get("candle-backcast-toggle");
  const hypothesisFilter=get("candle-backcast-filter");
  const engineSelect=get("candle-backcast-engine");
  if(engineSelect)engineSelect.value=backcastEngine;
  engineSelect?.addEventListener("change",event=>{
    backcastEngine=event.currentTarget.value==="original"?"original":"expanded";
    plotMarkers();backcastStatus();
  });
  hypothesisToggle?.addEventListener("click",event=>{
    if(!activeBackcast()){
      backcastStatus();return;
    }
    showBackcast=!showBackcast;
    event.currentTarget.classList.toggle("active",showBackcast);
    event.currentTarget.setAttribute("aria-pressed",String(showBackcast));
    event.currentTarget.textContent="Show model guesses: "+(showBackcast?"On":"Off");
    if(showBackcast)historicalFocus();
    plotMarkers();
    backcastStatus();
  });
  hypothesisFilter?.addEventListener("change",event=>{
    backcastFilter=event.currentTarget.value||"core";
    plotMarkers();backcastStatus();
  });
  get("candle-expanded-recent-toggle")?.addEventListener("click",event=>{
    showRecentExpanded=!showRecentExpanded;
    event.currentTarget.classList.toggle("active",showRecentExpanded);
    event.currentTarget.setAttribute("aria-pressed",String(showRecentExpanded));
    event.currentTarget.textContent="Recent expanded-model setups: "+(showRecentExpanded?"On":"Off");
    plotMarkers();advancedStatus();
  });
  get("candle-view-pre97")?.addEventListener("click",historicalFocus);
  backcastStatus();

  const labelMode=get("candle-label-toggle");
  const labelType=get("candle-label-type");
  const labelUndo=get("candle-label-undo");
  const labelCopy=get("candle-label-copy");
  labelMode?.addEventListener("click",event=>{
    isMarking=!isMarking;
    event.currentTarget.classList.toggle("active",isMarking);
    event.currentTarget.setAttribute("aria-pressed",String(isMarking));
    event.currentTarget.textContent="Click candle to label: "+(isMarking?"On":"Off");
    showManualStatus(isMarking?"Choose a turn type, then click a daily candle. Your labels are saved only in this browser.":
      manualLabels.length+" additional turning-point dates saved in this browser.");
  });
  if(typeof chart.subscribeClick==="function")chart.subscribeClick(param=>{
    if(!isMarking||!param?.time)return;
    const t=param.time;
    const date=typeof t==="string"?t:typeof t==="object"?
      [t.year,String(t.month).padStart(2,"0"),String(t.day).padStart(2,"0")].join("-"):"";
    if(!byDate.has(date))return;
    const selected=labelType?.value||"dH";
    if(!["dH","dL","JH","JL","RH","RL"].includes(selected))return;
    if(permanent.has(date)){
      showManualStatus(date+" is already permanently labeled "+permanent.get(date)+
        ". Existing chart dates are displayed once. Send any correction here instead.");return;
    }
    const existing=manualLabels.find(x=>x.date===date);
    if(existing){
      if(existing.code===selected){
        showManualStatus(date+" "+selected+" is already labeled once.");return;
      }
      existing.code=selected; // Edit the existing annotation instead of doubling it.
    } else {
      manualLabels.push({date,code:selected});
    }
    manualLabels=manualLabels.slice(-500);
    persist();plotMarkers();
    showManualStatus("Saved "+date+" "+selected+" locally. Total new labels: "+manualLabels.length+
      ". Copy the list and send it in the chat to incorporate it into the model.");
  });
  labelUndo?.addEventListener("click",()=>{
    if(!manualLabels.length){showManualStatus("No added labels to undo.");return;}
    const gone=manualLabels.pop();persist();plotMarkers();
    showManualStatus("Undid "+gone.date+" "+gone.code+". "+manualLabels.length+" additional labels remain.");
  });
  labelCopy?.addEventListener("click",async()=>{
    const data=shareText();
    if(!data){showManualStatus("No additional high/low labels yet. Click candles to create them.");return;}
    try {
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(data);
      showManualStatus("Copied "+manualLabels.length+" dates. Paste these dates in our chat for model training.");
    } catch(_) {
      const output=get("candle-label-output");
      if(output){output.focus();output.select();}
      showManualStatus("Select and copy the dates in the text box, then paste them in the chat.");
    }
  });
  persist(); // Clean up browser-saved duplicates already incorporated into GitHub.
  showManualStatus(manualLabels.length+" additional unsubmitted turn dates saved locally. "+ 
    "Only dates explicitly shared in chat can be added to the historical pattern research.");

  get("candle-fit")?.addEventListener("click",()=>chart.timeScale().fitContent());
  const dateInput=get("candle-date-jump");
  if(dateInput){dateInput.min=firstDate;dateInput.max=lastDate;dateInput.value=lastDate;}
  function goToDate(){
    if(!dateInput||!dateInput.value)return;
    const selected=dateInput.value;
    let idx=full.findIndex(b=>b.time>=selected);
    if(idx<0)idx=full.length-1;
    chart.timeScale().setVisibleLogicalRange({
      from:Math.max(-1,idx-70),to:Math.min(full.length+2,idx+70)
    });
    const bar=full[idx];
    get("candle-explorer-crosshair").textContent=
      "Historical SPX "+bar.time+": O "+bar.open.toFixed(2)+" H "+
      bar.high.toFixed(2)+" L "+bar.low.toFixed(2)+" C "+bar.close.toFixed(2);
  }
  get("candle-date-go")?.addEventListener("click",goToDate);
  dateInput?.addEventListener("change",goToDate);
  get("candle-log-scale")?.addEventListener("click",event=>{
    logScale=!logScale;
    chart.priceScale("right").applyOptions({
      mode:logScale?lib.PriceScaleMode.Logarithmic:lib.PriceScaleMode.Normal
    });
    event.currentTarget.classList.toggle("active",logScale);
    event.currentTarget.setAttribute("aria-pressed",String(logScale));
  });
  get("candle-zoom-in")?.addEventListener("click",()=>{
    const scale=chart.timeScale(),spacing=scale.options().barSpacing;
    scale.applyOptions({barSpacing:Math.min(70,spacing*1.5)});
  });
  get("candle-zoom-out")?.addEventListener("click",()=>{
    const scale=chart.timeScale(),spacing=scale.options().barSpacing;
    scale.applyOptions({barSpacing:Math.max(1,spacing/1.5)});
  });
  chart.subscribeCrosshairMove(param=>{
    const t=param.time;
    const key=typeof t==="string"?t:t&&typeof t==="object"?
      [t.year,String(t.month).padStart(2,"0"),String(t.day).padStart(2,"0")].join("-"):null;
    const bar=byDate.get(key)||full.at(-1);
    get("candle-explorer-crosshair").textContent=bar.time+" · O "+bar.open.toFixed(2)+
      " H "+bar.high.toFixed(2)+" L "+bar.low.toFixed(2)+" C "+bar.close.toFixed(2);
  });
  if(typeof ResizeObserver==="function")new ResizeObserver(()=>chart.resize(surface.clientWidth,surface.clientHeight)).observe(surface);
  if(typeof MutationObserver==="function")new MutationObserver(paintTheme).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
  const quality=get("candle-historical-quality");
  if(quality)quality.textContent=
    "Historical depth: "+full.length.toLocaleString("en-US")+
    " days, "+firstDate+" through "+lastDate+
    ". "+flatCount.toLocaleString("en-US")+" historical records have zero reported O–H–L–C range. "+
    "Such observations are price-level references, NOT genuine wick measurements. "+
    "First archived non-flat day: "+(firstWickDate||"unavailable")+
    ". Candlestick pattern study begins in 1997 and excludes old close-only bars.";
  paintTheme();render();setRange("6M");
  const b=full.at(-1);get("candle-explorer-crosshair").textContent=b.time+" · O "+b.open.toFixed(2)+" H "+b.high.toFixed(2)+" L "+b.low.toFixed(2)+" C "+b.close.toFixed(2);
})();
