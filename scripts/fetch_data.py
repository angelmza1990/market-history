"""Download every source into data/raw/.

    python3 scripts/fetch_data.py

Yahoo Finance prices go to data/raw/yahoo/<id>.csv (daily close and adjusted close),
FRED series to data/raw/fred/<SERIES>.csv. The files are kept in the repo as a snapshot,
so the site can be rebuilt even if a source changes or disappears.

FRED is read through its API when FRED_API_KEY is set (free key from
https://fred.stlouisfed.org/docs/api/api_key.html), otherwise through the public CSV
download, which often times out from cloud servers such as GitHub's runners.

A download that comes back shorter than the snapshot it would replace is rejected
and the old file is kept.
"""

import csv
import io
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import yfinance as yf

from universe import ASSETS, FRED, LEVELS

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"


def row_count(path):
    if not path.exists():
        return 0
    with path.open() as f:
        return sum(1 for _ in f) - 1


def save(path, header, rows):
    """Write rows unless they would shrink the existing snapshot."""
    old = row_count(path)
    if len(rows) < old * 0.98:
        print(f"  ! {path.name}: got {len(rows)} rows, snapshot has {old}; keeping the snapshot")
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    with tmp.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    tmp.replace(path)
    print(f"  {path.name}: {len(rows)} rows ({rows[0][0]} to {rows[-1][0]})")
    return True


def fetch_yahoo(asset_id, ticker):
    for attempt in range(3):
        try:
            hist = yf.Ticker(ticker).history(period="max", auto_adjust=False, actions=False)
            break
        except Exception as e:  # network errors, rate limits
            print(f"  retry {ticker}: {e}")
            time.sleep(5 * (attempt + 1))
    else:
        return False
    rows = []
    for ts, r in hist.iterrows():
        close, adj = r["Close"], r["Adj Close"]
        if close != close:  # NaN
            continue
        rows.append([ts.strftime("%Y-%m-%d"), f"{close:.6g}", f"{adj:.6g}" if adj == adj else ""])
    if not rows:
        print(f"  ! {ticker}: no data")
        return False
    return save(RAW / "yahoo" / f"{asset_id}.csv", ["date", "close", "adj_close"], rows)


def fetch_fred(series):
    key = os.environ.get("FRED_API_KEY")
    if key:
        url = ("https://api.stlouisfed.org/fred/series/observations"
               f"?series_id={series}&api_key={key}&file_type=json")
    else:
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"
    req = urllib.request.Request(url, headers={"User-Agent": "market-history/1.0"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode()
            break
        except Exception as e:
            print(f"  retry {series}: {type(e).__name__}")  # never print the URL: it holds the key
            time.sleep(5)
    else:
        return False
    if key:
        obs = json.loads(text)["observations"]
        rows = [[o["date"], o["value"]] for o in obs if o["value"] not in ("", ".")]
    else:
        reader = csv.reader(io.StringIO(text))
        next(reader)
        rows = [[d, v] for d, v in reader if v not in ("", ".")]
    if not rows:
        print(f"  ! {series}: no data")
        return False
    return save(RAW / "fred" / f"{series}.csv", ["date", "value"], rows)


def main():
    """Exit 1 if any price failed; FRED failures only warn (its series change monthly)."""
    in_ci = os.environ.get("GITHUB_ACTIONS") == "true"
    yahoo_failed, fred_failed = [], []
    print("Yahoo Finance")
    for asset_id, ticker, *_ in ASSETS + [(i, t) for i, t, _ in LEVELS]:
        if not fetch_yahoo(asset_id, ticker):
            yahoo_failed.append(ticker)
    print("FRED" + (" (API)" if os.environ.get("FRED_API_KEY") else " (CSV download)"))
    names = [s for s, *_ in FRED]
    for series in names:
        if not fetch_fred(series):
            fred_failed.append(series)
            if fred_failed == names[:2]:
                # the first two both failed: FRED is unreachable from here, skip the rest
                fred_failed = names
                break
    if fred_failed:
        msg = f"FRED not updated ({', '.join(fred_failed)}); the previous snapshot was kept."
        if not os.environ.get("FRED_API_KEY"):
            msg += " Set the FRED_API_KEY secret to use the FRED API."
        print(f"::warning::{msg}" if in_ci else msg)
    if yahoo_failed:
        msg = f"Prices not updated: {', '.join(yahoo_failed)}; the previous snapshot was kept."
        print(f"::error::{msg}" if in_ci else msg)
        sys.exit(1)


if __name__ == "__main__":
    main()
