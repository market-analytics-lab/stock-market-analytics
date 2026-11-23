"use strict";
/*
 * Browser-state regression: each trading day gets exactly one SPX flag.
 * Existing GitHub dates supersede stale browser annotations and purple
 * research dots; reclassifying a local annotation edits it in place.
 */
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");

const elements=new Map();
let autoId=0;
function element(id){
  const e={
    id,children:[],textContent:"",value:"",style:{},dataset:{},
    clientWidth:1100,clientHeight:480,events:{},
    classList:{toggle(){}},setAttribute(){},
    appendChild(child){this.children.push(child);return child;},
    replaceChildren(){this.children=[];},
    addEventListener(name,cb){this.events[name]=cb;},
    focus(){},select(){}
  };
  elements.set(id,e);
  return e;
}
for(const id of [
  "candle-explorer","candle-explorer-surface","candle-explorer-status",
  "candle-explorer-coverage","candle-explorer-patterns",
  "candle-explorer-selected","candle-explorer-crosshair",
  "candle-explorer-current","candle-historical-quality",
  "candle-date-jump","candle-date-go","candle-log-scale",
  "candle-fit","candle-zoom-out","candle-zoom-in",
  "candle-overlay-toggle","candle-label-type","candle-label-toggle",
  "candle-label-undo","candle-label-copy","candle-label-output",
  "candle-label-status","candle-label-summary",
  "candle-backcast-toggle","candle-backcast-filter",
  "candle-backcast-count","candle-view-pre97",
  "candle-backcast-engine","candle-expanded-recent-toggle",
  "candle-expanded-recent-count","candle-latest-jl",
  "candle-expanded-summary","candle-expanded-table"
])element(id);
const targets=["dH","dL","JH","JL","RH","RL"].map(code=>{
  const node=element("target-"+code);
  node.dataset.candleTarget=code;return node;
});
const ranges=["1M","3M","6M","1Y","5Y","10Y","25Y","50Y","ALL"].map(key=>{
  const node=element("range-"+key);
  node.dataset.candleRange=key;return node;
});
elements.get("candle-explorer").querySelectorAll=query=>
  query.includes("data-candle-target")?targets:ranges;
elements.get("candle-label-type").value="RH";
elements.get("candle-backcast-filter").value="core";
elements.get("candle-backcast-engine").value="expanded";

const initialLocal=[
  {date:"2000-03-24",code:"RH"},
  {date:"2000-03-24",code:"dH"},
  {date:"2023-01-03",code:"RL"},
  {date:"2023-01-03",code:"dH"}
];
const local=new Map([["spx-additional-turns-v1",JSON.stringify(initialLocal)]]);
let currentMarkers=[],chartClick=null;
const scale={
  setVisibleLogicalRange(){},fitContent(){},applyOptions(){},
  options(){return{barSpacing:7}}
};
const chartLibrary={
  CandlestickSeries:{},LineSeries:{},
  CrosshairMode:{Normal:0},
  PriceScaleMode:{Logarithmic:1,Normal:0},
  createSeriesMarkers(){
    return{setMarkers(markers){currentMarkers=markers;}};
  },
  createChart(){
    return{
      addSeries(){return{setData(){},applyOptions(){}};},
      timeScale(){return scale;},
      priceScale(){return{applyOptions(){}};},
      applyOptions(){},resize(){},
      subscribeCrosshairMove(){},
      subscribeClick(handler){chartClick=handler;}
    };
  }
};
const ctx=vm.createContext({
  window:{LightweightCharts:chartLibrary},
  document:{
    getElementById(id){return elements.get(id)||null;},
    createElement(type){return element(type+"-"+(++autoId));},
    documentElement:{dataset:{theme:"dark"}}
  },
  localStorage:{
    getItem(key){return local.get(key)||null;},
    setItem(key,value){local.set(key,value);}
  },
  navigator:{clipboard:{writeText:async()=>{}}},
  console
});
for(const file of [
  "spx-long-ohlc.js",
  "spx-turning-points.js",
  "spx-candle-report.js",
  "spx-candle-advanced-data.js",
  "spx-candle-miner.js",
  "spx-candle-explorer.js"
]){
  vm.runInContext(fs.readFileSync(file,"utf8"),ctx,{
    filename:file,timeout:60000
  });
}
const unique=()=>{
  const dates=currentMarkers.map(m=>m.time);
  assert.equal(new Set(dates).size,dates.length,"Duplicate chart flags on a trading day");
  for(let i=1;i<dates.length;i++)
    assert(dates[i-1]<dates[i],"Flag positions must be strictly increasing");
};
const get=id=>elements.get(id);
unique();
assert.equal(ctx.window.SPX_TURNING.points.length,175);
assert.equal(currentMarkers.length,176,
  "175 permanent turns plus one genuinely new local annotation");
assert.deepEqual(JSON.parse(local.get("spx-additional-turns-v1")),
  [{date:"2023-01-03",code:"dH"}],
  "Stale duplicates and duplicate local dates must be cleaned on load");
assert.equal(currentMarkers.filter(m=>m.time==="2000-03-24").length,1);
assert.equal(currentMarkers.find(m=>m.time==="2000-03-24").text,"RH");
assert.equal(currentMarkers.find(m=>m.time==="2023-01-03").text,"dH*");
assert(ctx.window.SPX_CANDLE_PATTERNS.historicalBackcast.candidates.length>20);
const advanced=ctx.window.SPX_CANDLE_PATTERNS.advanced;
assert(advanced && advanced.featureCount>=1000);
assert(get("candle-expanded-summary").textContent.includes("automatic candle features"));
assert(get("candle-latest-jl").children.some(n=>n.textContent.includes(
  advanced.latestJL.lastConfirmedJL)));
const backcastEngine=get("candle-backcast-engine");
assert.equal(backcastEngine.value,"expanded");
const backcastToggle=get("candle-backcast-toggle");
const filter=get("candle-backcast-filter");
assert.equal(currentMarkers.filter(m=>m.text.endsWith("?")).length,0,
  "Guess markers must be OFF by default");
backcastToggle.events.click({currentTarget:backcastToggle});
unique();
const rawCandidates=advanced.pastSuggestions;
const normal=rawCandidates.filter(m=>["dH","dL","JH","JL"].includes(m.code)).length;
assert.equal(currentMarkers.filter(m=>m.text.endsWith("?")).length,normal);
assert.equal(currentMarkers.length,176+normal);
assert(currentMarkers.filter(m=>m.text.endsWith("?")).every(m=>
  m.time<"1997-01-01"&&m.time>="1962-01-02"&&m.shape==="circle"));
assert(currentMarkers.every(m=>!m.text.endsWith("?")||m.time<"1997-01-01"));
// Switch to original independent engine without losing the on/off state.
backcastEngine.value="original";
backcastEngine.events.change({currentTarget:backcastEngine});
unique();
assert.equal(currentMarkers.filter(m=>m.text.endsWith("?")).length,
  ctx.window.SPX_CANDLE_PATTERNS.historicalBackcast.candidates
  .filter(x=>["dH","dL","JH","JL"].includes(x.code)).length);
filter.value="RH";
filter.events.change({currentTarget:filter});
unique();
assert.equal(currentMarkers.filter(m=>m.text==="RH?").length,
  ctx.window.SPX_CANDLE_PATTERNS.historicalBackcast.candidates.filter(m=>m.code==="RH").length);
assert(currentMarkers.filter(m=>m.text.endsWith("?")).every(m=>m.text==="RH?"));
filter.value="all";
filter.events.change({currentTarget:filter});
unique();
assert.equal(currentMarkers.filter(m=>m.text.endsWith("?")).length,
  ctx.window.SPX_CANDLE_PATTERNS.historicalBackcast.candidates.length,"Original all-six filter includes bear-market exploratory classes");
backcastToggle.events.click({currentTarget:backcastToggle});
unique();
assert.equal(currentMarkers.filter(m=>m.text.endsWith("?")).length,0);
assert.equal(currentMarkers.length,176);

const recentToggle=get("candle-expanded-recent-toggle");
assert.equal(currentMarkers.filter(m=>m.text.endsWith("~")).length,0);
recentToggle.events.click({currentTarget:recentToggle});
unique();
assert.equal(currentMarkers.filter(m=>m.text.endsWith("~")).length,
  advanced.recentSuggestions.filter(x=>!ctx.window.SPX_TURNING.points.some(y=>y.date===x.date)).length);
recentToggle.events.click({currentTarget:recentToggle});
unique();
assert.equal(currentMarkers.filter(m=>m.text.endsWith("~")).length,0);
const on=get("candle-label-toggle");
on.events.click({currentTarget:on});
chartClick({time:"2000-03-24"});
unique();
assert.match(get("candle-label-status").textContent,/already permanently labeled RH/);
assert.equal(currentMarkers.length,176);
chartClick({time:"2023-01-03"});
unique();
assert.equal(currentMarkers.length,176,"Re-labeling must edit, not add");
assert.equal(get("candle-label-output").value,"2023-01-03 RH");
const rh=targets.find(button=>button.dataset.candleTarget==="RH");
rh.events.click();
const table=get("candle-explorer-patterns").children[0];
assert(table,"RH patterns should be available as tiny-sample case studies");
const topButton=table.children[1].children[0].children[3].children[0];
assert.equal(typeof topButton.events.click,"function");
topButton.events.click();
unique();
assert.equal(currentMarkers.filter(m=>m.time==="2000-03-24").length,1,
  "A purple pattern marker must not double-flag a bear-market high");
assert(currentMarkers.some(m=>m.text==="P•"||m.text==="T•"),
  "Chosen pattern overlays must still work when enabled");
assert.equal(get("candle-label-summary").textContent.includes("175 unique"),true);
console.log("SPX candle annotation test passed: 175 permanent labels,",
  "one marker per session, locally saved duplicate cleanup,",
  "pattern overlays, pre-1997 backcast on/off and class filters.");
