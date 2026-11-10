"use strict";

/* Actual SPX OHLC bars with TradingView Lightweight Charts v5.
 * This is not the proprietary TradingView Advanced Charts product.
 */
(() => {
  const source = window.SPX_OHLC;
  const library = window.LightweightCharts;
  const wrapper = document.getElementById("spx-chart");
  const surface = document.getElementById("candle-surface");
  const intervalButtons = [...document.querySelectorAll("[data-interval]")];
  const rangeButtons = [...document.querySelectorAll("[data-range]")];
  const modeButtons = [...document.querySelectorAll("[data-chart-mode]")];
  const averageButtons = [...document.querySelectorAll("[data-average]")];
  const format = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (!source || !library || !wrapper || !surface) {
    if (wrapper) wrapper.textContent = "SPX chart library or historical data did not load. Use the full TradingView link below.";
    return;
  }
  if (source.symbol !== "SPX") throw new Error("SPX data source validation failed");

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

  let interval = "1D";
  let range = "6M";
  let mode = "candles";
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
  const sma20 = chart.addSeries(library.LineSeries, { color: "#f2b45e", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });
  const sma50 = chart.addSeries(library.LineSeries, { color: "#83a7ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false });

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

  function dataForRange() {
    if (!selectedBars.length) return { first: 0, values: [] };
    const last = epoch(selectedBars.at(-1).time);
    const requestedDays = { "1D": 1, "5D": 5, "1M": 31, "3M": 93, "6M": 186, "1Y": 366, "ALL": Infinity };
    const earliest = last - requestedDays[range] * 86400;
    let first = selectedBars.findIndex((bar) => epoch(bar.time) >= earliest);
    if (first < 0) first = 0;
    return { first, values: selectedBars.slice(first) };
  }

  function applyRange() {
    const { first, values } = dataForRange();
    const count = Math.max(values.length, 1);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(first - .5, -.5), to: selectedBars.length - 1 + Math.max(1.5, count * .03) });
    const high = Math.max(...values.map((bar) => bar.high));
    const low = Math.min(...values.map((bar) => bar.low));
    const before = values[0];
    const after = values.at(-1);
    document.getElementById("spx-last").textContent = price(after.close);
    document.getElementById("spx-high").textContent = price(high);
    document.getElementById("spx-low").textContent = price(low);
    const delta = 100 * (after.close / before.open - 1);
    const deltaElement = document.getElementById("spx-change");
    deltaElement.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%`;
    deltaElement.classList.toggle("negative", delta < 0);
    const requested = { "1D": "1 day", "5D": "5 days", "1M": "1 month", "3M": "3 months", "6M": "6 months", "1Y": "1 year", "ALL": "all available" }[range];
    document.getElementById("coverage-note").textContent = `${selectedBars.length} real ${interval} SPX bars available · Showing ${count} bars for ${requested} · As of ${source.asOf} (historical, not live)`;
    setOHLC(after, dateOf(after.time));
  }

  function setInterval(next) {
    if (!buckets[next]?.length) return;
    interval = next;
    selectedBars = buckets[interval];
    lookups = new Map(selectedBars.map((bar) => [timeKey(bar.time), bar]));
    candles.setData(selectedBars);
    line.setData(selectedBars.map((bar) => ({ time: bar.time, value: bar.close })));
    sma20.setData(simpleMovingAverage(selectedBars, 20));
    sma50.setData(simpleMovingAverage(selectedBars, 50));
    chart.timeScale().applyOptions({ timeVisible: !["1D", "1W", "1M"].includes(interval), secondsVisible: false });
    toggleButtons(intervalButtons, "interval", interval);
    const defaults = { "1": "1D", "5": "5D", "15": "5D", "60": "1M", "240": "1M", "1D": "6M", "1W": "1Y", "1M": "ALL" };
    range = defaults[interval];
    toggleButtons(rangeButtons, "range", range);
    document.getElementById("interval-description").textContent = `${{ "1": "1 minute", "5": "5 minute", "15": "15 minute", "60": "1 hour", "240": "4 hour", "1D": "daily", "1W": "weekly", "1M": "monthly" }[interval]} candles`;
    applyRange();
  }

  intervalButtons.forEach((button) => button.addEventListener("click", () => setInterval(button.dataset.interval)));
  rangeButtons.forEach((button) => button.addEventListener("click", () => {
    range = button.dataset.range;
    toggleButtons(rangeButtons, "range", range);
    applyRange();
  }));
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    mode = button.dataset.chartMode;
    candles.applyOptions({ visible: mode === "candles" });
    line.applyOptions({ visible: mode === "line" });
    toggleButtons(modeButtons, "chartMode", mode);
  }));
  averageButtons.forEach((button) => button.addEventListener("click", () => {
    const n = Number(button.dataset.average);
    averages[n] = !averages[n];
    (n === 20 ? sma20 : sma50).applyOptions({ visible: averages[n] });
    button.classList.toggle("active", averages[n]);
    button.setAttribute("aria-pressed", String(averages[n]));
  }));

  chart.subscribeCrosshairMove((param) => {
    const bar = param.time !== undefined ? lookups.get(timeKey(param.time)) : null;
    setOHLC(bar || selectedBars.at(-1), dateOf(bar ? bar.time : selectedBars.at(-1).time));
  });

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
  new ResizeObserver(() => chart.resize(surface.clientWidth, surface.clientHeight)).observe(surface);
  setInterval("1D");
})();
