# Stock Market Analytics

An interactive, GitHub Pages–ready market-analysis site. The initial release focuses on the **S&P 500 index (SPX)**.

## SPX dashboard

- Interactive **SP:SPX** candlestick chart powered by TradingView's embeddable Advanced Chart.
- One-click candle intervals: **1m, 5m, 15m, 1H, 4H, 1D, 1W, and 1M**.
- TradingView chart tools for zooming, panning, drawing, comparing symbols, and technical studies (as available in the embedded widget).
- Responsive layout, light/dark theme switch, and fullscreen when supported.
- Direct link to open the full chart on TradingView.

This version is **charting only**: there is no independent SPX data feed, prediction model, backtester, or trade recommendation engine yet.

## Publish with GitHub Pages

The site uses plain HTML, CSS, and JavaScript — **no build, dependencies, API keys, or backend required**.

1. In this repository, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then **Save**.
4. After GitHub finishes publishing, your URL should be:
   **https://jaczerin24.github.io/stock-market-analytics/**

You can also preview locally using a basic static file server, such as:

```sh
python -m http.server 8000
```

Then visit http://localhost:8000.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Accessible page structure and TradingView widget |
| `styles.css` | Responsive website design |
| `app.js` | Candle interval, theme, and fullscreen controls |

### Market-data notes

The embedded TradingView widget retrieves its own market data. **Availability, historical depth, quote delays, and intraday permissions are determined by TradingView and its data providers.** Some intervals may be unavailable for certain users/markets. The widget requires internet access, and some privacy settings, blockers, or networks may block third-party scripts.

The chart source and TradingView attribution are intentionally visible. This project is not affiliated with TradingView or S&P Dow Jones Indices.

**Disclaimer:** Market analytics are for education and research, not personalized financial advice. SPX is an index and cannot be purchased directly.

## Possible next steps

- Add an independently sourced, date-stamped OHLC historical data layer.
- Backtest technical signals against historical SPX data.
- Add probabilistic forecasts, calibration plots, and out-of-sample verification.
- Add a market breadth and volatility dashboard alongside SPX.

## License

MIT — see [LICENSE](LICENSE).
