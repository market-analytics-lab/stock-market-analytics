"use strict";

// Offline-capable SPX price chart. Every plotted value is an S&P 500 index
// observation in spx-data.js; no ETF/CFD proxy is substituted.
(() => {
  const history = window.SPX_HISTORY;
  const host = document.getElementById("spx-chart");
  const rangeButtons = [...document.querySelectorAll("[data-range]")];
  if (!host || !history) return;

  const daily = history.daily.map(([time, close, high, low]) => ({ time, close, high, low }));
  const older = history.monthly
    .filter(([time]) => time < daily[0].time)
    .map(([time, close, high, low]) => ({ time, close, high, low }));
  const all = [...older, ...daily];
  const svgNS = "http://www.w3.org/2000/svg";
  const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let range = "1Y";
  let current = [];
  let hovered = -1;

  const status = document.createElement("div");
  status.className = "spx-status";
  status.innerHTML = '<div><span class="spx-status-label">LAST CLOSE</span><strong id="spx-last">—</strong></div><div><span class="spx-status-label">PERIOD CHANGE</span><strong id="spx-change">—</strong></div><div><span class="spx-status-label">PERIOD HIGH</span><strong id="spx-high">—</strong></div><div><span class="spx-status-label">PERIOD LOW</span><strong id="spx-low">—</strong></div>';

  const graph = document.createElement("div");
  graph.className = "spx-graph";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "S&P 500 historical closing prices");
  svg.setAttribute("preserveAspectRatio", "none");
  graph.append(svg);

  const tip = document.createElement("div");
  tip.className = "spx-tooltip";
  tip.hidden = true;
  graph.append(tip);

  const foot = document.createElement("div");
  foot.className = "spx-data-note";
  foot.textContent = `SPX historical observations • As of ${dateFormat.format(new Date(history.asOf * 1000))} • Historical snapshot, not a live quote`;
  host.replaceChildren(status, graph, foot);

  function svgElement(name, attrs, text) {
    const element = document.createElementNS(svgNS, name);
    for (const [key, val] of Object.entries(attrs)) element.setAttribute(key, String(val));
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function seriesForRange(value) {
    const end = daily[daily.length - 1].time;
    const days = { "1M": 31, "3M": 93, "6M": 186, "1Y": 370 };
    if (value === "MAX") return all;
    if (value === "YTD") {
      const year = new Date(end * 1000).getUTCFullYear();
      const start = Date.UTC(year, 0, 1) / 1000;
      return daily.filter((row) => row.time >= start);
    }
    return daily.filter((row) => row.time >= end - (days[value] || 370) * 86400);
  }

  function render() {
    current = seriesForRange(range);
    if (!current.length) return;
    const width = Math.max(graph.clientWidth, 300);
    const height = Math.max(graph.clientHeight, 320);
    const margin = { top: 26, right: 90, bottom: 43, left: 18 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const lower = Math.min(...current.map((p) => p.low));
    const upper = Math.max(...current.map((p) => p.high));
    const padding = Math.max((upper - lower) * .09, 10);
    const yMin = lower - padding;
    const yMax = upper + padding;
    const x = (i) => margin.left + (current.length === 1 ? 0 : i / (current.length - 1)) * plotWidth;
    const y = (v) => margin.top + (1 - (v - yMin) / (yMax - yMin)) * plotHeight;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.replaceChildren();

    const defs = svgElement("defs", {});
    const gradient = svgElement("linearGradient", { id: "spx-fill-gradient", x1: "0", y1: "0", x2: "0", y2: "1" });
    gradient.append(svgElement("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": ".26" }));
    gradient.append(svgElement("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": "0" }));
    defs.append(gradient);
    svg.append(defs);

    for (let n = 0; n <= 4; n++) {
      const value = yMin + (yMax - yMin) * n / 4;
      const py = y(value);
      svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right + 6, y1: py, y2: py, class: "spx-gridline" }));
      svg.append(svgElement("text", { x: width - margin.right + 13, y: py + 4, class: "spx-axis" }, number.format(value)));
    }

    const tickCount = width < 650 ? 3 : 6;
    for (let n = 0; n < tickCount; n++) {
      const index = Math.round(n * (current.length - 1) / (tickCount - 1));
      svg.append(svgElement("text", { x: x(index), y: height - 14, class: "spx-axis", "text-anchor": n === 0 ? "start" : n === tickCount - 1 ? "end" : "middle" }, shortDate.format(new Date(current[index].time * 1000))));
    }

    const line = current.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.close).toFixed(1)}`).join(" ");
    const fill = `${line} L${x(current.length - 1).toFixed(1)} ${y(yMin).toFixed(1)} L${x(0).toFixed(1)} ${y(yMin).toFixed(1)} Z`;
    svg.append(svgElement("path", { d: fill, fill: "url(#spx-fill-gradient)" }));
    svg.append(svgElement("path", { d: line, class: "spx-line" }));

    const highIndex = current.findIndex((p) => p.high === upper);
    const lowIndex = current.findIndex((p) => p.low === lower);
    for (const [index, value, kind] of [[highIndex, upper, "high"], [lowIndex, lower, "low"]]) {
      const markerX = x(index), markerY = y(value);
      svg.append(svgElement("circle", { cx: markerX, cy: markerY, r: 4, class: `spx-extreme spx-${kind}` }));
      const labelY = markerY + (kind === "high" ? -11 : 20);
      const anchor = markerX < width / 2 ? "start" : "end";
      svg.append(svgElement("text", { x: markerX + (anchor === "start" ? 7 : -7), y: labelY, "text-anchor": anchor, class: `spx-extreme-text spx-${kind}` }, `${kind.toUpperCase()} ${number.format(value)}`));
    }

    const last = current.at(-1);
    const first = current[0];
    const changePct = (last.close / first.close - 1) * 100;
    document.getElementById("spx-last").textContent = number.format(last.close);
    const changeNode = document.getElementById("spx-change");
    changeNode.textContent = `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
    changeNode.classList.toggle("negative", changePct < 0);
    document.getElementById("spx-high").textContent = number.format(upper);
    document.getElementById("spx-low").textContent = number.format(lower);

    // Hover interaction is intentionally rebuilt on each resize/range change.
    hovered = -1;
    tip.hidden = true;
    const focusGroup = svgElement("g", {});
    focusGroup.style.display = "none";
    const focusLine = svgElement("line", { class: "spx-crosshair" });
    const focusDot = svgElement("circle", { r: 5, class: "spx-focus-dot" });
    focusGroup.append(focusLine, focusDot);
    svg.append(focusGroup);

    graph.onpointermove = (event) => {
      const rect = graph.getBoundingClientRect();
      const pos = event.clientX - rect.left;
      if (pos < margin.left || pos > width - margin.right) {
        focusGroup.style.display = "none";
        tip.hidden = true;
        return;
      }
      const index = Math.round((pos - margin.left) / plotWidth * (current.length - 1));
      const row = current[index];
      if (index !== hovered) {
        hovered = index;
        const px = x(index), py = y(row.close);
        focusGroup.style.display = "";
        focusLine.setAttribute("x1", px);
        focusLine.setAttribute("x2", px);
        focusLine.setAttribute("y1", margin.top);
        focusLine.setAttribute("y2", height - margin.bottom);
        focusDot.setAttribute("cx", px);
        focusDot.setAttribute("cy", py);
        tip.replaceChildren();
        const date = document.createElement("strong");
        date.textContent = dateFormat.format(new Date(row.time * 1000));
        const details = document.createElement("span");
        details.textContent = `Close ${number.format(row.close)} · High ${number.format(row.high)} · Low ${number.format(row.low)}`;
        tip.append(date, details);
        tip.hidden = false;
        tip.style.left = `${Math.min(Math.max(px, 108), width - 108)}px`;
      }
    };
    graph.onpointerleave = () => { focusGroup.style.display = "none"; tip.hidden = true; };
  }

  rangeButtons.forEach((button) => button.addEventListener("click", () => {
    range = button.dataset.range;
    rangeButtons.forEach((b) => {
      const active = b === button;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    document.getElementById("interval-description").textContent = range === "MAX" ? "full available history" : `${range} historical view`;
    render();
  }));

  const resizeObserver = new ResizeObserver(render);
  resizeObserver.observe(graph);
  render();
})();
