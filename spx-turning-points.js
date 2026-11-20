"use strict";
/*
 * SPX turning-point study.
 * Dates are supplied research labels, NOT independently validated SPX turning points.
 * Projection windows are exploratory, fitted to a very small sample.
 * No prediction is guaranteed; no synthetic OHLC is created.
 */
(() => {
  const points = [
    ["2024-12-06", "dH"],
    ["2025-01-10", "dL"],
    ["2025-02-19", "JH"],
    ["2025-04-08", "JL"],
    ["2025-10-29", "dH"],
    ["2025-11-20", "dL"],
    ["2026-01-27", "JH"],
    ["2026-03-30", "JL"],
    ["2026-06-02", "dH"],
    ["2026-06-10", "dL"],
    ["2026-08-13", "dH"],
    ["2026-09-16", "dL"],
    ["2026-10-06", "JH"],
  ].map(([date, code]) => Object.freeze({ date, code }));

  const colors = Object.freeze({
    dH: "#f8a23d", dL: "#31c88a", JH: "#f16475", JL: "#6397ff"
  });

  // Calendar-day intervals between selected consecutive event categories.
  // dH→dL observed 8, 22, 34, 35 days.
  // dL→JH observed 20, 40, 68 days.
  // JH→JL observed 48, 62 days.
  // JL→dH observed 64, 204 days; 204 is not modeled as a routine cycle.
  const rules = Object.freeze({
    dH: [
      { next: "dL", startDays: 8, endDays: 10, name: "Fast moderate-low window", evidence: "1 observed 8-day gap" },
      { next: "dL", startDays: 22, endDays: 35, name: "Moderate-low window", evidence: "3 observed gaps: 22, 34, 35 days" },
    ],
    dL: [
      { next: "JH", startDays: 20, endDays: 25, name: "Early major-high window", evidence: "1 observed 20-day gap" },
      { next: "JH", startDays: 40, endDays: 68, name: "Major-high window", evidence: "2 observed gaps: 40, 68 days" },
    ],
    JH: [
      { next: "JL", startDays: 48, endDays: 62, name: "Major-low watch", evidence: "2 observed gaps: 48, 62 days" },
    ],
    JL: [
      { next: "dH", startDays: 60, endDays: 68, name: "Moderate-high watch", evidence: "1 observed 64-day gap; also a 204-day gap" },
    ]
  });

  function addDays(iso, count) {
    const date = new Date(iso + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }
  function pretty(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US",
      { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  const latest = points[points.length - 1];
  const windows = (rules[latest.code] || []).map(rule => Object.freeze({
    ...rule,
    from: addDays(latest.date, rule.startDays),
    to: addDays(latest.date, rule.endDays),
    sourceDate: latest.date,
    sourceCode: latest.code,
  }));

  window.SPX_TURNING = Object.freeze({
    points: Object.freeze(points),
    latest,
    windows: Object.freeze(windows),
    colors,
    rules,
    addDays,
    pretty,
  });
})();
