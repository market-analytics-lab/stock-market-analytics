# SPX Market Analytics — Candlestick Viewer

An interactive chart of the **S&P 500 index (SPX / Yahoo symbol `^GSPC`)**, with actual recent OHLC candles **and monthly S&P Composite history back to January 1871**. This is **not Apple (AAPL), SPY, or an SPX CFD proxy**.

![SPX index historical price preview](spx-preview.png)

### [Open the interactive SPX historical and candlestick viewer](https://market-analytics-lab.github.io/stock-market-analytics/)

## Chart controls

| Control | Available choices |
| --- | --- |
| Candle intervals | **1m, 5m, 15m, 1H, 4H, 1D, 1W, 1M**; plus **1871+** monthly historical line |
| Visible chart range | **1D, 5D, 1M, 3M, 6M, 1Y, 5Y, 10Y, 25Y, 50Y, 100Y, ALL**. Long ranges and ALL open historical monthly data. |
| Chart style | Candles or closing-price line for real OHLC; line-only for 1871+ reconstructed monthly index levels |
| Indicators | 20-bar and 50-bar simple moving averages (SMA) |
| Navigation | Mouse-wheel/pinch zoom, drag/pan, crosshair, +/− zoom and fit-to-data |
| Additional | OHLC readout on recent bars, monthly-level readout in history, log/linear price scale, dark/light, fullscreen, range high/low |

Weekly/monthly candles are aggregated from **actual daily OHLC** bars. The 15-minute and 4-hour candles are aggregated from genuine intraday bars. No candle's opening price is guessed or filled from a previous close.

### Historical series: January 1871 onward

Use **1871+** in the chart-interval row, or **ALL / 5Y / 10Y / 25Y / 50Y / 100Y** in the visible-range row. The long-horizon chart switches to a **logarithmic monthly line** by default. Click **Log Scale** to switch between logarithmic and linear.

The **S&P 500 in its modern form launched March 4, 1957**. Before that date the chart presents Robert Shiller's **reconstructed monthly S&P Composite** data; it is not a literal SPX trading history and does **not** supply candle opens, intramonth highs, intramonth lows, or closing values. The monthly values are index observations/averages. Range high and low in historical mode refer to the highest/lowest **monthly reported level**, not intramonth peaks and troughs. The series is price-only, not dividend-inclusive or inflation-adjusted.

- **January 1871 – September 2026:** monthly SP500 series in [datasets/s-and-p-500](https://github.com/datasets/s-and-p-500), compiled from [Robert Shiller's monthly data](https://shillerdata.com/) and extended more recently with the Federal Reserve's monthly S&P 500 series.
- **October 2026 onward:** arithmetic averages of actual daily ^GSPC closes in the repository's refreshed data. The current month is flagged as provisional until the next month has trading observations. No OHLC candles are inferred from monthly averages.

When selecting recent candles, the viewer shows real OHLC (where available) and returns to a linear scale by default. Clicking **Candles** from the historical line switches back to 1D candles.

**Recent OHLC coverage in the initial November 9, 2026 snapshot (automatically advanced as newer bars become available):**

- ~500 daily bars (approximately 2 years); weekly/monthly from these daily bars.
- 3 trading sessions of 1-minute bars.
- 12 trading sessions of 5-minute bars (also used for 15-minute).
- 45 trading sessions of hourly bars (also used for 4-hour).
- The viewer automatically limits a selected time range to available source history when you request more history than exists for that interval.

The data is a **daily updated snapshot, not live streaming or licensed real-time SPX quotes**. Live data and the complete proprietary TradingView toolset are available on [the full TradingView SPX chart](https://www.tradingview.com/chart/?symbol=SP%3ASPX).

### Sources and charting

- OHLC source: Yahoo Finance S&P 500 index (`^GSPC`), using the Yahoo Chart API for fresh post-close daily/intraday bars, with a publicly maintained [SPX market-data archive](https://github.com/Alexduanran/spx-0dte-archive) as a daily fallback. `build_ohlc.py` supplies quote validation and the archive parser. New bars are never invented.
- Rendering: [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) 5.0.9. It is distinct from TradingView's proprietary Advanced Chart. © TradingView. The required TradingView attribution link is included in the viewer.
- Data generation uses true open, high, low and close observations and validates bar consistency. Intraday times are represented as US/Eastern-market timestamps.

## Automatic daily refresh

- **When:** Every day at **3:30 p.m. America/Chicago (Central Time)**, using a time-zone-aware GitHub Actions schedule that follows daylight saving time.
- **What:** The workflow fetches genuine Yahoo ^GSPC daily OHLC, attempts the recent 1-minute, 5-minute and hourly snapshots, and preserves validated existing bars when a source is temporarily unavailable. It updates the reconstructed historical chart's latest monthly average using actual daily closes.
- **Publishing:** Only when fresh daily bars arrive, the workflow commits updated datasets and a date-versioned HTML reference to `main`, then explicitly requests a GitHub Pages rebuild. Data files are versioned in HTML to prevent stale browser-cache data.
- **No market session:** Weekends and holidays typically produce no new price observations and therefore no chart data commit.
- **Timing is best-effort:** GitHub may start scheduled jobs late and Yahoo's data may not be available at exactly 3:30 p.m. The viewer shows each series' latest source date; it is not real-time.
- **Manual run:** Go to the repository's **Actions** tab → **Refresh SPX chart at 3:30 PM Central** → **Run workflow**. Offline tests run before the dataset changes.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Dashboard, timeframe/range buttons, OHLC display |
| `styles.css` | Site layout |
| `chart.css`, `tv-chart.css` | Chart and responsive controls |
| `app.js` | Dark/light and fullscreen |
| `tv-chart.js` | Recent candles, historical monthly line, timeframe aggregation, scales, moving averages and interaction |
| `spx-ohlc-data.js` | Recent daily and intraday SPX OHLC data snapshot |
| `spx-history-data.js` | 1,871 reconstructed/monthly S&P Composite and S&P 500 observations, January 1871 onward |
| `build_ohlc.py` | Validate SPX data and parse historical archive fallback |
| `refresh_spx.py` | Fetch current OHLC, extend daily candles, and maintain the monthly historical series |
| `refresh_spx_test.py` | Offline regression tests for the refresher |
| `.github/workflows/refresh-spx.yml` | Daily 3:30 p.m. Central GitHub Actions schedule and GitHub Pages rebuild |
| `spx-preview.png` | README historical close preview |

The older `chart.js` and `spx-data.js` files remain in the repository as an earlier chart version, but they are no longer used by the live viewer.

## Hosting

GitHub Pages serves the site at https://market-analytics-lab.github.io/stock-market-analytics/ from the repository's `main` branch. The daily job explicitly requests GitHub Pages to rebuild after a data commit; no external API key or hosted server is required.

**Disclaimer:** Educational market research only. SPX cannot be purchased directly, and this site does not yet provide predictive models or trading recommendations.

## License

MIT — see [LICENSE](LICENSE). The TradingView Lightweight Charts library is separately licensed under Apache 2.0 and subject to its attribution requirements.
