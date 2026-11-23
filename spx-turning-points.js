"use strict";
/*
 * SPX turning-point study.
 * Dates are supplied research labels, NOT independently validated SPX turning points.
 * Projection windows are exploratory, fitted to a very small sample.
 * No prediction is guaranteed; no synthetic OHLC is created.
 */
(() => {
  const recentPoints = [
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
  ].map(([date, code]) => ({ date, code }));

  // User-supplied SPX CLOSE turning-point annotations spanning 1997–2024.
  // These are subjective research labels, not separately audited market pivots.
  const priorPoints = [
    ["1997-02-18", "dH"],
    ["1997-04-11", "dL"],
    ["1997-08-06", "dH"],
    ["1997-08-29", "dL"],
    ["1997-10-07", "dH"],
    ["1997-10-27", "dL"],
    ["1997-12-05", "dH"],
    ["1998-01-09", "dL"],
    ["1998-04-22", "dH"],
    ["1998-06-15", "dL"],
    ["1998-07-17", "JH"],
    ["1998-08-31", "JL"],
    ["1998-09-23", "dH"],
    ["1998-10-08", "dL"],
    ["1998-11-27", "dH"],
    ["1998-12-14", "dL"],
    ["1999-05-13", "dH"],
    ["1999-05-27", "dL"],
    ["1999-07-16", "JH"],
    ["1999-10-15", "JL"],
    ["1999-12-31", "dH"],
    ["2000-02-25", "dL"],
    ["2000-03-24", "RH"],
    ["2002-10-09", "RL"],
    ["2002-11-27", "JH"],
    ["2003-03-11", "JL"],
    ["2004-02-11", "JH"],
    ["2004-08-12", "JL"],
    ["2004-10-06", "dH"],
    ["2004-10-25", "dL"],
    ["2004-12-30", "dH"],
    ["2005-01-24", "dL"],
    ["2005-03-07", "JH"],
    ["2005-04-20", "JL"],
    ["2005-06-17", "dH"],
    ["2005-06-27", "dL"],
    ["2005-08-03", "JH"],
    ["2005-10-13", "JL"],
    ["2005-12-14", "dH"],
    ["2005-12-30", "dL"],
    ["2006-01-11", "dH"],
    ["2006-02-07", "dL"],
    ["2006-05-05", "JH"],
    ["2006-06-13", "JL"],
    ["2006-07-03", "dH"],
    ["2006-07-17", "dL"],
    ["2007-02-20", "dH"],
    ["2007-03-05", "dL"],
    ["2007-06-04", "dH"],
    ["2007-06-07", "dL"],
    ["2007-07-19", "JH"],
    ["2007-08-15", "JL"],
    ["2007-10-09", "RH"],
    ["2009-03-09", "RL"],
    ["2009-06-12", "dH"],
    ["2009-07-10", "dL"],
    ["2009-09-22", "dH"],
    ["2009-10-02", "dL"],
    ["2009-10-19", "dH"],
    ["2009-10-30", "dL"],
    ["2010-01-19", "dH"],
    ["2010-02-08", "dL"],
    ["2010-04-23", "JH"],
    ["2010-07-02", "JL"],
    ["2010-08-09", "dH"],
    ["2010-08-26", "dL"],
    ["2010-11-05", "dH"],
    ["2010-11-16", "dL"],
    ["2011-02-18", "dH"],
    ["2011-03-16", "dL"],
    ["2011-04-06", "dH"],
    ["2011-04-18", "dL"],
    ["2011-04-29", "JH"],
    ["2011-10-03", "JL"],
    ["2011-10-28", "dH"],
    ["2011-11-25", "dL"],
    ["2011-12-07", "dH"],
    ["2011-12-19", "dL"],
    ["2012-04-02", "JH"],
    ["2012-06-01", "JL"],
    ["2012-09-14", "JH"],
    ["2012-11-15", "JL"],
    ["2013-05-21", "dH"],
    ["2013-06-24", "dL"],
    ["2013-08-02", "dH"],
    ["2013-08-27", "dL"],
    ["2013-09-18", "dH"],
    ["2013-10-08", "dL"],
    ["2014-01-15", "dH"],
    ["2014-02-03", "dL"],
    ["2014-04-02", "dH"],
    ["2014-04-11", "dL"],
    ["2014-07-23", "dH"],
    ["2014-08-07", "dL"],
    ["2014-09-18", "JH"],
    ["2014-10-15", "JL"],
    ["2014-12-05", "dH"],
    ["2014-12-16", "dL"],
    ["2014-12-29", "dH"],
    ["2015-01-15", "dL"],
    ["2015-03-02", "dH"],
    ["2015-03-11", "dL"],
    ["2015-05-21", "JH"],
    ["2016-02-11", "JL"],
    ["2016-04-20", "dH"],
    ["2016-05-19", "dL"],
    ["2016-06-08", "dH"],
    ["2016-06-27", "dL"],
    ["2016-08-15", "JH"],
    ["2016-11-03", "JL"],
    ["2017-03-01", "dH"],
    ["2017-04-13", "dL"],
    ["2017-08-07", "dH"],
    ["2017-08-18", "dL"],
    ["2018-01-26", "JH"],
    ["2018-02-08", "JL"],
    ["2018-03-09", "dH"],
    ["2018-04-02", "dL"],
    ["2018-04-17", "dH"],
    ["2018-05-03", "dL"],
    ["2018-06-12", "dH"],
    ["2018-06-27", "dL"],
    ["2018-09-20", "JH"],
    ["2018-12-24", "JL"],
    ["2019-04-30", "dH"],
    ["2019-06-03", "dL"],
    ["2019-07-26", "dH"],
    ["2019-08-14", "dL"],
    ["2019-09-12", "dH"],
    ["2019-10-02", "dL"],
    ["2020-01-17", "dH"],
    ["2020-01-31", "dL"],
    ["2020-02-19", "JH"],
    ["2020-03-23", "JL"],
    ["2020-06-08", "dH"],
    ["2020-06-11", "dL"],
    ["2020-09-02", "dH"],
    ["2020-09-23", "dL"],
    ["2020-10-12", "dH"],
    ["2020-10-30", "dL"],
    ["2021-02-12", "dH"],
    ["2021-03-04", "dL"],
    ["2021-09-02", "dH"],
    ["2021-10-04", "dL"],
    ["2021-11-18", "dH"],
    ["2021-12-01", "dL"],
    ["2022-01-03", "RH"],
    ["2022-10-12", "RL"],
    ["2022-11-30", "dH"],
    ["2022-12-28", "dL"],
    ["2023-02-02", "dH"],
    ["2023-03-13", "dL"],
    ["2023-07-31", "JH"],
    ["2023-10-27", "JL"],
    ["2024-03-28", "dH"],
    ["2024-04-19", "dL"],
    ["2024-07-16", "dH"],
    ["2024-08-05", "dL"],
    ["2024-08-30", "dH"],
    ["2024-09-06", "dL"],
    ["2024-10-18", "dH"],
    ["2024-10-31", "dL"],
  ].map(([date,code]) => ({date,code}));

  // Exactly one label per SPX trading date, even when the same observation
  // is submitted in more than one batch. Later corrections take precedence.
  const byDate = new Map();
  for (const point of [...recentPoints, ...priorPoints]) byDate.set(point.date, point);
  const points = [...byDate.values()]
    .sort((a,b)=>a.date.localeCompare(b.date))
    .map(p=>Object.freeze(p));
  const counts = Object.freeze(["dH","dL","JH","JL","RH","RL"]
    .reduce((acc,code)=>(acc[code]=points.filter(p=>p.code===code).length,acc),{}));

  const colors = Object.freeze({
    dH: "#f8a23d", dL: "#31c88a", JH: "#f16475", JL: "#6397ff",
    RH: "#b86cf4", RL: "#23c9c9"
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
    counts,
    codes: Object.freeze(["dH","dL","JH","JL","RH","RL"]),
    descriptions: Object.freeze({dH:"Moderate high",dL:"Moderate low",
      JH:"Major high",JL:"Major low",RH:"Bear-market high",RL:"Bear-market low"}),
    latest,
    windows: Object.freeze(windows),
    colors,
    rules,
    addDays,
    pretty,
  });
})();
