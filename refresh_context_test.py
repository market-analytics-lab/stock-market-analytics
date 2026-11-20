"""Offline regressions for the optional SPX market-context refresh."""
import json
import unittest
from datetime import date, timedelta
from refresh_context import prepare_breadth, prepare_vix, asset_buster


class ContextRefreshTests(unittest.TestCase):
    def test_vix_csv_monthly_from_genuine_daily(self):
        start = date(1990, 1, 2)
        rows = ["DATE,OPEN,HIGH,LOW,CLOSE"]
        for i in range(7600):
            day = start + timedelta(days=i)
            rows.append(f"{day.strftime('%m/%d/%Y')},20,20,20,{19+i%7}")
        result = prepare_vix("\n".join(rows))
        self.assertEqual(result["symbol"], "VIX")
        self.assertGreater(len(result["monthly"]), 200)
        self.assertEqual(result["latestDaily"][1], 19+(7599%7))

    def test_breadth_filters_future_sessions(self):
        start = date(2026, 1, 1)
        rows = [{"date": (start+timedelta(days=i)).isoformat(),
                 "advances": 240, "declines": 260, "ad_line": i-100}
                for i in range(120)]
        feed = {"metadata": {"universe": "S&P 500",
                              "total_stocks": 503,
                              "generated_at": "2026-05-01T00:00:00Z"},
                "data": rows}
        result = prepare_breadth(json.dumps(feed), "2026-04-30")
        self.assertEqual(result["asOf"], "2026-04-30")
        self.assertEqual(len(result["daily"]), 120)

    def test_breadth_universe_safety(self):
        source = {"metadata": {"universe": "Nasdaq"}, "data": []}
        with self.assertRaises(ValueError):
            prepare_breadth(json.dumps(source), "2026-11-20")

    def test_cache_busting(self):
        html = '<script src="./spx-vix-data.js?v=old" defer></script>'
        updated = asset_buster(html, "spx-vix-data.js", "2026-11-19")
        self.assertIn("?asof=2026-11-19", updated)


if __name__ == "__main__":
    unittest.main()
