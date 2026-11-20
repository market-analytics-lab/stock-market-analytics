"use strict";

/* Actual SPX OHLC bars with TradingView Lightweight Charts v5.
 * This is not the proprietary TradingView Advanced Charts product.
 */
(() => {
  const source = window.SPX_OHLC;
  const historySource = window.SPX_HISTORY;
  const library = window.LightweightCharts;
  const wrapper = document.getElementById("spx-chart");
  const surface = document.getElementById("candle-surface");
  const intervalButtons = [...document.querySelectorAll("[data-interval]")];
  const rangeButtons = [...document.querySelectorAll("[data-range]")];
  const modeButtons = [...document.querySelectorAll("[data-chart-mode]")];
  const averageButtons = [...document.querySelectorAll("[data-average]")];
  const format = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!source || !historySource || !library || !wrapper || !surface) {
    if (wrapper) wrapper.textContent = "SPX chart library or historical data did not load. Use the full TradingView link below.";
    return;
  }
  if (source.symbol !== "SPX") throw new Error("SPX data source validation failed");
  if (historySource.symbol !== "SPX" || historySource.monthly[0][0] !== "1871-01-01") {
    throw new Error("Historical S&P Composite data validation failed");
  }

  const price = (value) => format.format(value);
  const dateOf = (time) => typeof time === "number"
    ? new Date(time * 1000).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + " ET"
    : new Date(time + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const epoch = (time) => typeof time === "number" ? time : Date.parse(time + "T00:00:00Z") / 1000;
  const timeKey = (time) => typeof time === "object" ? `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}` : String(time);

  function decode(entries) {
    return entries.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
  }

  function aggregate(bars, keyForBar, timeForBucket) {
    const result = [];
    let priorKey = null;
    for (const bar of bars) {
      const key = keyForBar(bar);
      if (key !== priorKey) {
        result.push({ ...bar, time: timeForBucket ? timeForBucket(bar, key) : bar.time });
        priorKey = key;
      } else {
        const last = result[result.length - 1];
        last.high = Math.max(last.high, bar.high);
        last.low = Math.min(last.low, bar.low);
        last.close = bar.close;
      }
    }
    return result;
  }

  const day = decode(source.daily);
  const oneMinute = decode(source.oneMinute);
  const fiveMinute = decode(source.fiveMinute);
  const oneHour = decode(source.oneHour);
  const weekStart = (date) => {
    const monday = new Date(date + "T00:00:00Z");
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  };
  const sessionStarts = new Map();
  const fourHourKey = (bar) => {
    // U.S. regular-session bars remain within one UTC calendar day.
    const session = new Date(bar.time * 1000).toISOString().slice(0, 10);
    if (!sessionStarts.has(session)) sessionStarts.set(session, bar.time);
    const bucket = Math.floor((bar.time - sessionStarts.get(session)) / 14400);
    return `${session}/${bucket}`;
  };
  const buckets = {
    "1": oneMinute,
    "5": fiveMinute,
    "15": aggregate(fiveMinute, (bar) => Math.floor(bar.time / 900)),
    "60": oneHour,
    "240": aggregate(oneHour, fourHourKey),
    "1D": day,
    "1W": aggregate(day, (bar) => weekStart(bar.time), (_, key) => key),
    "1M": aggregate(day, (bar) => bar.time.slice(0, 7), (_, key) => `${key}-01`),
  };
  const historyBars = historySource.monthly.map(([time, value]) => ({ time, value }));
  const latestHistoryKey = historyBars.at(-1).time;
  const latestHistoryMonth = new Date(latestHistoryKey + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const longRanges = new Set(["5Y", "10Y", "25Y", "50Y", "100Y", "ALL"]);

  let interval = "1D";
  let range = "6M";
  let mode = "candles";
  let logScale = false;
  let selectedBars = buckets[interval];
  let lookups = new Map();
  const averages = { 20: false, 50: false };

  const palette = () => document.documentElement.dataset.theme === "light"
    ? { background: "#ffffff", text: "#53677f", grid: "#edf2f7", border: "#dce4ef" }
    : { background: "#101a2a", text: "#9aabc4", grid: "#223149", border: "#304058" };

  const color = palette();
  const chart = library.createChart(surface, {
    width: surface.clientWidth,
    height: surface.clientHeight,
    layout: { background: { type: "solid", color: color.background }, textColor: color.text, attributionLogo: true },
    grid: { vertLines: { color: color.grid }, horzLines: { color: color.grid } },
    rightPriceScale: { borderColor: color.border, scaleMargins: { top: 0.1, bottom: 0.08 } },
    timeScale: { borderColor: color.border, timeVisible: false, secondsVisible: false, rightOffset: 5, barSpacing: 8 },
    crosshair: { mode: library.CrosshairMode.Normal },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    localization: { priceFormatter: price },
  });
  const candles = chart.addSeries(library.CandlestickSeries, {
    upColor: "#26bb9a", downColor: "#ef626e", borderVisible: false,
    wickUpColor: "#26bb9a", wickDownColor: "#ef626e",
    priceLineVisible: true,
  });
  const line = chart.addSeries(library.LineSeries, { color: "#62d9ba", lineWidth: 2, visible: false, priceLineVisible: false });
  const historyLine = chart.addSeries(library.LineSeries, { color: "#62d9ba", lineWidth: 2, visible: false, priceLineVisible: true, title: "Historical monthly S&P Composite" });
  const sma20 = chart.addSeries(library.LineSeries, { color: "#f2b45e", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
  const sma50 = chart.addSeries(library.LineSeries, { color: "#83a7ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });


  // User-labeled turning points and exploratory, non-validated time windows.
  const turns = window.SPX_TURNING;
  const bandHost = document.createElement("div");
  bandHost.className = "spx-turn-band-host";
  surface.appendChild(bandHost);
  let showTurnLabels = true;
  let showTurnWindows = true;
  let candleMarkers = null;
  let historicalMarkers = null;
  let futureCount = 0;
  let futureDates = [];
  let projectionPaintPending = false;

  function utcDay(date) {
    return Date.parse(date + "T12:00:00Z");
  }
  function nextSessionDates(lastDate, maxDate) {
    const out = [];
    let date = new Date(lastDate + "T12:00:00Z");
    while (true) {
      date.setUTCDate(date.getUTCDate() + 1);
      const key = date.toISOString().slice(0, 10);
      if (key > maxDate) break;
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) out.push(key);
    }
    return out;
  }
  function nearestBarDate(eventDate, bars, resolution) {
    if (!bars.length) return null;
    let key = eventDate;
    if (resolution === "1W") key = weekStart(eventDate);
    if (resolution === "1M" || resolution === "HIST") key = eventDate.slice(0, 7) + "-01";
    if (resolution === "1D" || resolution === "1W" || resolution === "1M" || resolution === "HIST") {
      if (bars.some(bar => bar.time === key)) return key;
      // Closed-market event dates map to the following session, never silently to a distant bar.
      if (resolution === "1D") {
        const next = bars.find(bar => bar.time > key && utcDay(bar.time) - utcDay(key) <= 4 * 86400000);
        return next ? next.time : null;
      }
      return null;
    }
    // Intraday events apply only if intraday bars cover the nominated date.
    const match = bars.find(bar => new Date(bar.time * 1000).toLocaleDateString("en-CA",
      { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }) === key);
    return match ? match.time : null;
  }
  function renderTurnMarkers() {
    if (!turns || !library.createSeriesMarkers) return;
    const historical = interval === "HIST";
    const target = historical ? historyLine : candles;
    if (historical && candleMarkers) candleMarkers.setMarkers([]);
    if (!historical && historicalMarkers) historicalMarkers.setMarkers([]);
    if (!showTurnLabels) {
      if (candleMarkers) candleMarkers.setMarkers([]);
      if (historicalMarkers) historicalMarkers.setMarkers([]);
      return;
    }
    const mapped = new Map();
    for (const point of turns.points) {
      const time = nearestBarDate(point.date, selectedBars, interval);
      if (!time) continue;
      if (!mapped.has(String(time))) mapped.set(String(time), []);
      mapped.get(String(time)).push(point);
    }
    const markers = [...mapped].map(([k, items]) => {
      const hasHigh = items.some(item => item.code.endsWith("H"));
      const major = items.some(item => item.code.startsWith("J"));
      const item = items.find(point => point.code.startsWith("J")) || items[0];
      const time = typeof selectedBars[0].time === "number" ? Number(k) : k;
      return {
        time,
        position: hasHigh ? "aboveBar" : "belowBar",
        color: turns.colors[item.code],
        shape: hasHigh ? "arrowDown" : "arrowUp",
        text: items.map(p => p.code).join("/"),
        size: major ? 2 : 1,
      };
    }).sort((a, b) => epoch(a.time) - epoch(b.time));
    if (historical) {
      if (!historicalMarkers) historicalMarkers = library.createSeriesMarkers(target, markers);
      else historicalMarkers.setMarkers(markers);
    } else {
      if (!candleMarkers) candleMarkers = library.createSeriesMarkers(target, markers);
      else candleMarkers.setMarkers(markers);
    }
  }
  function renderWindowSummary() {
    const area = document.getElementById("turning-watch-readout");
    if (!area || !turns) return;
    const latestAvailable = day.at(-1).time;
    area.textContent = "";
    const header = document.createElement("strong");
    header.textContent = "NEXT TIMING WINDOW · " + turns.latest.code + " " + turns.pretty(turns.latest.date);
    area.appendChild(header);
    for (const window of turns.windows) {
      const entry = document.createElement("span");
      let phase = latestAvailable < window.from ? "upcoming" : latestAvailable > window.to ? "elapsed" : "watch period";
      entry.textContent = window.next + ": " + turns.pretty(window.from) + " – " +
        turns.pretty(window.to) + " (" + phase + ")";
      area.appendChild(entry);
    }
    const caution = document.createElement("small");
    caution.textContent = "Experimental calendar-day windows from 13 user-selected dates; not statistically validated, not confirmed price pivots.";
    area.appendChild(caution);
  }
  function repaintTurnWindows() {
    bandHost.replaceChildren();
    if (!turns || !showTurnWindows || interval === "HIST" ||
        !["1D", "1W", "1M"].includes(interval)) return;
    const timeScale = chart.timeScale();
    const size = surface.clientWidth;
    for (const w of turns.windows) {
      const startTime = nearestBarDate(w.from, selectedBars.concat(futureDates.map(time => ({ time }))), interval) ||
        (interval === "1D" ? futureDates.find(time => time >= w.from) : null);
      const endTime = nearestBarDate(w.to, selectedBars.concat(futureDates.map(time => ({ time }))), interval) ||
        (interval === "1D" ? [...futureDates].reverse().find(time => time <= w.to) : null);
      // Weekly/monthly periods may be represented by their first calendar date.
      const startKey = interval === "1W" ? weekStart(w.from) :
        interval === "1M" ? w.from.slice(0, 7) + "-01" : startTime;
      const endKey = interval === "1W" ? weekStart(w.to) :
        interval === "1M" ? w.to.slice(0, 7) + "-01" : endTime;
      if (!startKey || !endKey) continue;
      const x1 = timeScale.timeToCoordinate(startKey);
      const x2 = timeScale.timeToCoordinate(endKey);
      if (!Number.isFinite(x1) || !Number.isFinite(x2)) continue;
      const halfBar = Math.abs(timeScale.timeToCoordinate(selectedBars.at(-1).time) -
        timeScale.timeToCoordinate(selectedBars.at(-2).time)) / 2 || 3;
      const left = Math.max(0, Math.min(x1, x2) - halfBar);
      const right = Math.min(size, Math.max(x1, x2) + halfBar);
      if (right <= left) continue;
      const element = document.createElement("div");
      element.className = "spx-turn-band " + (w.next.endsWith("H") ? "high-watch" : "low-watch");
      element.style.left = left + "px";
      element.style.width = Math.max(2, right - left) + "px";
      element.title = w.next + " experimental window " + w.from + " to " + w.to +
        " | " + w.evidence;
      const text = document.createElement("span");
      text.textContent = w.next + " WATCH";
      element.appendChild(text);
      bandHost.appendChild(element);
    }
  }
  function scheduleTurnWindowPaint() {
    if (projectionPaintPending) return;
    projectionPaintPending = true;
    requestAnimationFrame(() => {
      projectionPaintPending = false;
      repaintTurnWindows();
    });
  }
  function setupForecastSpace(bars, resolution) {
    futureDates = [];
    futureCount = 0;
    if (!turns || !["1D", "1W", "1M"].includes(resolution) || !bars.length) return bars;
    const lastDate = bars.at(-1).time;
    const latestWindow = turns.windows.at(-1);
    const limit = turns.addDays(latestWindow.to, 10);
    if (limit <= lastDate) return bars;
    const sessions = nextSessionDates(lastDate, limit);
    if (resolution === "1D") futureDates = sessions;
    else if (resolution === "1W") futureDates = [...new Set(sessions.map(weekStart))].filter(t => t > lastDate);
    else futureDates = [...new Set(sessions.map(t => t.slice(0, 7) + "-01"))].filter(t => t > lastDate);
    futureCount = futureDates.length;
    return bars.concat(futureDates.map(time => ({ time })));
  }

  function simpleMovingAverage(bars, n) {
    let sum = 0;
    return bars.flatMap((bar, i) => {
      sum += bar.close;
      if (i >= n) sum -= bars[i - n].close;
      return i >= n - 1 ? [{ time: bar.time, value: +(sum / n).toFixed(2) }] : [];
    });
  }

  function toggleButtons(buttons, attr, activeValue) {
    for (const button of buttons) {
      const active = button.dataset[attr] === activeValue;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function setOHLC(bar, label) {
    if (!bar) return;
    document.getElementById("ohlc-date").textContent = label;
    for (const column of ["open", "high", "low", "close"]) {
      document.getElementById(`ohlc-${column}`).textContent = price(bar[column]);
    }
    const rising = bar.close >= bar.open;
    document.getElementById("ohlc-close").classList.toggle("down", !rising);
  }

  function setHistoryReadout(bar) {
    if (!bar) return;
    // The first of the month is a date key, not the date of a daily trading observation.
    document.getElementById("history-date").textContent = new Date(bar.time + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    document.getElementById("history-level").textContent = price(bar.value);
    document.getElementById("history-partial").textContent = historySource.latestMonthPartial && bar.time === latestHistoryKey ? "(month to date)" : "";
  }

  function changeLogScale(active) {
    logScale = active;
    chart.priceScale("right").applyOptions({ mode: active ? library.PriceScaleMode.Logarithmic : library.PriceScaleMode.Normal });
    const button = document.getElementById("log-scale");
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  function dataForRange() {
    if (!selectedBars.length) return { first: 0, values: [] };
    const last = epoch(selectedBars.at(-1).time);
    const requestedDays = { "1D": 1, "5D": 5, "1M": 31, "3M": 93, "6M": 186, "1Y": 366, "5Y": 1827, "10Y": 3653, "25Y": 9132, "50Y": 18263, "100Y": 36525, "ALL": Infinity };
    const earliest = last - requestedDays[range] * 86400;
    let first = selectedBars.findIndex((bar) => epoch(bar.time) >= earliest);
    if (first < 0) first = 0;
    return { first, values: selectedBars.slice(first) };
  }

  function applyRange() {
    const { first, values } = dataForRange();
    if (!values.length) return;
    const count = Math.max(values.length, 1);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(first - .5, -.5), to: selectedBars.length - 1 + ((["3M", "6M", "1Y"].includes(range) && ["1D", "1W", "1M"].includes(interval)) ? futureCount + 2 : Math.max(1.5, count * .03)) });
    const historical = interval === "HIST";
    const high = Math.max(...values.map((bar) => historical ? bar.value : bar.high));
    const low = Math.min(...values.map((bar) => historical ? bar.value : bar.low));
    const before = values[0];
    const after = values.at(-1);
    document.getElementById("spx-last").textContent = price(historical ? after.value : after.close);
    document.getElementById("spx-high").textContent = price(high);
    document.getElementById("spx-low").textContent = price(low);
    const delta = 100 * (historical ? (after.value / before.value - 1) : (after.close / before.open - 1));
    const deltaElement = document.getElementById("spx-change");
    deltaElement.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`;
    deltaElement.classList.toggle("negative", delta < 0);
    const requested = { "1D": "1 day", "5D": "5 days", "1M": "1 month", "3M": "3 months", "6M": "6 months", "1Y": "1 year", "5Y": "5 years", "10Y": "10 years", "25Y": "25 years", "50Y": "50 years", "100Y": "100 years", "ALL": "all available" }[range];
    if (historical) {
      document.getElementById("coverage-note").textContent = `${historyBars.length} monthly S&P Composite / S&P 500 levels since 1871 · Showing ${count} months for ${requested} · ${historySource.latestMonthPartial ? latestHistoryMonth + " provisional" : "Last month complete"} · Updated through ${historySource.asOf} · NOT historical OHLC`;
      setHistoryReadout(after);
      return;
    }
    const intervalName = { "1": "1-minute", "5": "5-minute", "15": "15-minute", "60": "hourly", "240": "4-hour", "1D": "daily", "1W": "weekly", "1M": "monthly" }[interval];
    const aggregation = ["15", "240", "1W", "1M"].includes(interval) ? " · Aggregated from actual OHLC" : "";
    document.getElementById("coverage-note").textContent = `${selectedBars.length} ${intervalName} SPX bars · Showing ${count} bars for ${requested}${aggregation} · Latest visible bar ${dateOf(after.time)} · Daily snapshot through ${source.asOf} (not live)`;
    setOHLC(after, dateOf(after.time));
  }

  function setInterval(next) {
    if (!buckets[next]?.length) return;
    interval = next;
    selectedBars = buckets[interval];
    wrapper.classList.remove("history-mode");
    document.getElementById("history-note").hidden = true;
    document.getElementById("history-readout").hidden = true;
    document.getElementById("ohlc-strip").hidden = false;
    document.getElementById("spx-last-label").textContent = "LAST CLOSE";
    document.getElementById("spx-high-label").textContent = "RANGE HIGH";
    document.getElementById("spx-low-label").textContent = "RANGE LOW";
    historyLine.applyOptions({ visible: false });
    historyLine.setData([]);
    candles.applyOptions({ visible: mode === "candles" });
    line.applyOptions({ visible: mode === "line" });
    sma20.applyOptions({ visible: averages[20] });
    sma50.applyOptions({ visible: averages[50] });
    changeLogScale(false);
    lookups = new Map(selectedBars.map((bar) => [timeKey(bar.time), bar]));
    candles.setData(setupForecastSpace(selectedBars, interval));
    renderTurnMarkers();
    scheduleTurnWindowPaint();
    line.setData(selectedBars.map((bar) => ({ time: bar.time, value: bar.close })));
    sma20.setData(simpleMovingAverage(selectedBars, 20));
    sma50.setData(simpleMovingAverage(selectedBars, 50));
    chart.timeScale().applyOptions({ timeVisible: !["1D", "1W", "1M"].includes(interval), secondsVisible: false });
    toggleButtons(intervalButtons, "interval", interval);
    const defaults = { "1": "1D", "5": "5D", "15": "5D", "60": "1M", "240": "1M", "1D": "6M", "1W": "1Y", "1M": "1Y" };
    range = defaults[interval];
    toggleButtons(rangeButtons, "range", range);
    toggleButtons(modeButtons, "chartMode", mode);
    document.getElementById("interval-description").textContent = `${{ "1": "1 minute", "5": "5 minute", "15": "15 minute", "60": "1 hour", "240": "4 hour", "1D": "daily", "1W": "weekly", "1M": "monthly" }[interval]} candles`;
    applyRange();
  }

  function showHistory(requestedRange = "ALL") {
    interval = "HIST";
    selectedBars = historyBars;
    range = requestedRange;
    lookups = new Map(historyBars.map((bar) => [timeKey(bar.time), bar]));
    wrapper.classList.add("history-mode");
    document.getElementById("history-note").hidden = false;
    document.getElementById("history-readout").hidden = false;
    document.getElementById("ohlc-strip").hidden = true;
    document.getElementById("spx-last-label").textContent = "MONTHLY INDEX LEVEL";
    document.getElementById("spx-high-label").textContent = "HIGHEST MONTHLY LEVEL";
    document.getElementById("spx-low-label").textContent = "LOWEST MONTHLY LEVEL";
    candles.applyOptions({ visible: false });
    line.applyOptions({ visible: false });
    sma20.applyOptions({ visible: false });
    sma50.applyOptions({ visible: false });
    candles.setData([]);
    line.setData([]);
    sma20.setData([]);
    sma50.setData([]);
    historyLine.setData(historyBars);
    historyLine.applyOptions({ visible: true });
    futureDates = [];
    futureCount = 0;
    renderTurnMarkers();
    scheduleTurnWindowPaint();
    chart.timeScale().applyOptions({ timeVisible: false, secondsVisible: false });
    changeLogScale(true);
    toggleButtons(intervalButtons, "interval", "HIST");
    toggleButtons(rangeButtons, "range", range);
    toggleButtons(modeButtons, "chartMode", "line");
    document.getElementById("interval-description").textContent = "monthly historical index levels (1871 onward)";
    applyRange();
  }

  intervalButtons.forEach((button) => button.addEventListener("click", () => button.dataset.interval === "HIST" ? showHistory() : setInterval(button.dataset.interval)));
  rangeButtons.forEach((button) => button.addEventListener("click", () => {
    const next = button.dataset.range;
    if (interval !== "HIST" && longRanges.has(next)) {
      showHistory(next);
      return;
    }
    range = next;
    toggleButtons(rangeButtons, "range", range);
    applyRange();
  }));
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    if (interval === "HIST") {
      if (button.dataset.chartMode === "candles") {
        mode = "candles";
        setInterval("1D");
      }
      return;
    }
    mode = button.dataset.chartMode;
    candles.applyOptions({ visible: mode === "candles" });
    line.applyOptions({ visible: mode === "line" });
    toggleButtons(modeButtons, "chartMode", mode);
  }));
  averageButtons.forEach((button) => button.addEventListener("click", () => {
    if (interval === "HIST") {
      setInterval("1D");
    }
    const n = Number(button.dataset.average);
    averages[n] = !averages[n];
    (n === 20 ? sma20 : sma50).applyOptions({ visible: averages[n] });
    button.classList.toggle("active", averages[n]);
    button.setAttribute("aria-pressed", String(averages[n]));
  }));

  chart.subscribeCrosshairMove((param) => {
    const bar = param.time !== undefined ? lookups.get(timeKey(param.time)) : null;
    const displayed = bar || selectedBars.at(-1);
    if (interval === "HIST") setHistoryReadout(displayed);
    else setOHLC(displayed, dateOf(displayed.time));
  });

  document.getElementById("log-scale").addEventListener("click", () => changeLogScale(!logScale));

  document.getElementById("fit-chart").addEventListener("click", () => chart.timeScale().fitContent());
  document.getElementById("zoom-in").addEventListener("click", () => changeZoom(.7));
  document.getElementById("zoom-out").addEventListener("click", () => changeZoom(1.4));

  function changeZoom(factor) {
    const current = chart.timeScale().getVisibleLogicalRange();
    if (!current) return;
    const middle = (current.from + current.to) / 2;
    const half = (current.to - current.from) * factor / 2;
    chart.timeScale().setVisibleLogicalRange({ from: middle - half, to: middle + half });
  }

  function applyPalette() {
    const next = palette();
    chart.applyOptions({
      layout: { background: { type: "solid", color: next.background }, textColor: next.text, attributionLogo: true },
      grid: { vertLines: { color: next.grid }, horzLines: { color: next.grid } },
      timeScale: { borderColor: next.border },
      rightPriceScale: { borderColor: next.border },
    });
  }
  new MutationObserver(applyPalette).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new ResizeObserver(() => { chart.resize(surface.clientWidth, surface.clientHeight); scheduleTurnWindowPaint(); }).observe(surface);
  chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleTurnWindowPaint);
  document.getElementById("show-turn-labels")?.addEventListener("click", event => {
    showTurnLabels = !showTurnLabels;
    event.currentTarget.classList.toggle("active", showTurnLabels);
    event.currentTarget.setAttribute("aria-pressed", String(showTurnLabels));
    renderTurnMarkers();
  });
  document.getElementById("show-turn-windows")?.addEventListener("click", event => {
    showTurnWindows = !showTurnWindows;
    event.currentTarget.classList.toggle("active", showTurnWindows);
    event.currentTarget.setAttribute("aria-pressed", String(showTurnWindows));
    scheduleTurnWindowPaint();
  });
  renderWindowSummary();
  setInterval("1D");
})();
