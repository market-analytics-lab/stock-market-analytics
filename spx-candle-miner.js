"use strict";
/*
 * Thin in-browser adapter for a reproducible offline-generated SPX study.
 * The computationally expensive 1997–2026 search runs on GitHub Actions.
 * Chart and report use genuine ^GSPC daily OHLC, not monthly reconstruction.
 */
(() => {
  const archive=window.SPX_LONG_OHLC;
  const report=window.SPX_CANDLE_REPORT;
  if(archive?.symbol!=="SPX"||report?.symbol!=="SPX"||!Array.isArray(archive.daily))return;
  const series=archive.daily.filter(row=>row[0]>=report.dateStart&&row[0]<=report.dateEnd)
    .map(([time,open,high,low,close])=>({time,open,high,low,close}));
  const mismatched=series.length!==report.barCount||series.at(-1)?.time!==report.dateEnd;
  const turnCounts=window.SPX_TURNING?.counts||{};
  const labelMismatch=report.labels.some(code=>report.counts[code]!==turnCounts[code]);
  const analysis=report.analysis;
  window.SPX_CANDLE_PATTERNS=Object.freeze({
    ...report,daily:series,
    labels:report.labels,
    selectedEvents:report.selectedEvents,
    analysis,
    signals(id){return report.signals[id]||[];},
    stale:mismatched||labelMismatch,
    note:report.caution,
  });
})();