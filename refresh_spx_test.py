"""Offline unit checks for the scheduled SPX snapshot updater."""

import unittest

from refresh_spx import (
    merge_by_key,
    prepare_monthly,
    prepare_ohlc,
    recent_sessions,
    render_monthly,
    versioned_index,
)


class RefreshSPXTests(unittest.TestCase):
    def test_merged_daily_bars_retain_previous_real_data(self):
        old = [["2026-11-09", 1, 2, 0.5, 1.5]]
        new = [["2026-11-10", 1.5, 3, 1, 2.5]]
        self.assertEqual(len(merge_by_key(old, new)), 2)
        self.assertEqual(merge_by_key(old, new)[-1][-1], 2.5)

    def test_intraday_sessions_are_new_york_trading_days(self):
        # Two 14:30 UTC samples in November (9:30 a.m. in New York).
        rows = [[1794310200, 5, 7, 4, 6], [1794396600, 6, 8, 5, 7]]
        self.assertEqual(len(recent_sessions(rows, 1)), 1)
        self.assertEqual(recent_sessions(rows, 1)[0], rows[-1])

    def test_months_are_averages_of_real_daily_closes(self):
        old = [
            ["1871-01-01", 4.44],
            ["2026-09-01", 7669.41],
            ["2026-10-01", 9999],
            ["2026-11-01", 9999],
        ]
        days = [
            ["2026-10-01", 100, 110, 95, 100],
            ["2026-10-02", 110, 120, 100, 110],
            ["2026-11-10", 120, 130, 115, 125],
        ]
        result = prepare_monthly(old, days, "2026-11-10")
        self.assertEqual(result["monthly"][-2:], [["2026-10-01", 105], ["2026-11-01", 125]])
        self.assertEqual(result["lastCompleteMonth"], "2026-10-01")
        self.assertEqual(result["asOf"], "2026-11-10")
        self.assertTrue(result["latestMonthPartial"])
        self.assertIn("Jan 1871", render_monthly(result))

    def test_rejects_unreasonably_small_daily_download(self):
        original = {
            "symbol": "SPX", "daily": [["2026-11-09", 1, 2, 0.5, 1.5]] * 500,
            "oneMinute": [], "fiveMinute": [], "oneHour": [],
        }
        with self.assertRaises(ValueError):
            prepare_ohlc(original, {"daily": [["2026-11-10", 1, 2, 0.5, 1.5]],
                                    "1m": [], "5m": [], "60m": []})

    def test_cache_busting_urls_are_replaced_without_duplication(self):
        html = '<script src="./spx-ohlc-data.js" defer></script>\n<script src="./spx-history-data.js?v=old" defer></script>'
        refreshed = versioned_index(html, "2026-11-10")
        self.assertEqual(refreshed.count("?asof=2026-11-10"), 2)
        self.assertNotIn("v=old", refreshed)


if __name__ == "__main__":
    unittest.main()
