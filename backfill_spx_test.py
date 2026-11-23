"""Isolated tests for SPX daily deep-history importer."""
from __future__ import annotations
import unittest
from datetime import date,timedelta
from backfill_spx_daily import parse_yahoo_csv, merge_history, metadata

class BackfillTests(unittest.TestCase):
    def test_csv_no_invented_ohlc(self):
        text="Date,Open,High,Low,Close,Adj Close,Volume\n1957-03-04,44,45,43,44.5,44.5,123\n1957-03-05,44.4,44.7,44.2,44.6,44.6,99\n1957-03-06,44,42,43,44,44,88\n"
        result=parse_yahoo_csv(text)
        self.assertEqual(len(result),2)
        self.assertEqual(result[0],["1957-03-04",44,45,43,44.5])

    def test_reject_sparse_history(self):
        with self.assertRaises(ValueError):
            merge_history([["1957-03-04",45,45,45,45]],[])

    def test_long_history_merge_and_flat_flags(self):
        start=date(1957,3,4)
        rows=[]
        for i in range(14500):
            day=(start+timedelta(days=i)).isoformat()
            v=round(50+i*.1,2)
            rows.append([day,v,v+1,v-1,v])
        combined=merge_history(rows,[[rows[-1][0],150,151,149,150]])
        self.assertEqual(len(combined),14500)
        self.assertEqual(combined[-1][4],150)
        out=metadata(combined,"test archive")
        self.assertEqual(out["flatOHLCCount"],0)
        self.assertEqual(out["firstDate"],start.isoformat())

    def test_never_manufacture_wick(self):
        start=date(1957,3,4)
        rows=[]
        for i in range(14500):
            day=(start+timedelta(days=i)).isoformat()
            rows.append([day,50,50,50,50])
        out=metadata(rows,"test close-only")
        self.assertEqual(out["flatOHLCCount"],14500)
        self.assertIsNone(out["firstNonFlatDate"])

if __name__=="__main__":
    unittest.main()
