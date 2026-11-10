# SPX Market Analytics

An interactive S&P 500 **index** chart, published as a GitHub Pages dashboard. The embedded chart uses historical **SPX** values — **not Apple (AAPL), SPY, or a CFD proxy**.

![SPX historical S&P 500 index close chart](spx-preview.png)

**[Open the interactive SPX viewer](https://market-analytics-lab.github.io/stock-market-analytics/)**

## What's in the viewer

- Actual S&P 500 index (SPX) historical closing prices, highs, and lows.
- Selectable date ranges: **1M, 3M, 6M, YTD, 1Y, and MAX**.
- Hover over the plotted line for a date and its close/high/low.
- Highest and lowest index levels in the selected historical range.
- Dark/light theme and fullscreen mode.

**Market data as of November 9, 2026.** The embedded chart is a **static historical snapshot**, not a live market feed; the date is displayed on the page. Daily observations are provided for approximately one year, with coarser older observations for the MAX view. The one-year preview image above is also static.

The original TradingView widget was removed because its `SP:SPX` symbol could not be displayed in a third-party embedded chart (the widget reported *“This symbol is only available on TradingView”*). You can still use the [full SPX TradingView chart](https://www.tradingview.com/chart/?symbol=SP%3ASPX) for live/intraday charting.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Dashboard layout and chart controls |
| `styles.css` | Site layout and responsive theme |
| `chart.css` | Native SPX chart styles |
| `app.js` | Theme and fullscreen controls |
| `chart.js` | SVG plotting, range selection, tooltip, and range extrema |
| `spx-data.js` | Timestamped S&P 500 index historical observations |
| `spx-preview.png` | Repository README chart preview |

## Hosting

The website is available at **https://market-analytics-lab.github.io/stock-market-analytics/** and uses static HTML, CSS, and JavaScript. No build, API key, or backend is required.

If GitHub Pages needs to be configured again: go to **Settings → Pages → Deploy from a branch**, select `main` and `/(root)`, then save.

You can also use `python -m http.server 8000` to preview the website locally.

This repository currently presents historical data only. It does **not** yet implement predictive models, backtesting, probability estimates, or trading signals.

**Disclaimer:** This is educational market research, not a trading recommendation. SPX is an index and cannot be purchased directly.

## License

MIT — see [LICENSE](LICENSE).
