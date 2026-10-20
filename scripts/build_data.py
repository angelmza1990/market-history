"""Build the site's datasets from the snapshot in data/raw/.

    python3 scripts/build_data.py

Writes data/markets.json (every asset: monthly closes, monthly drawdowns, calendar-year
returns and summary statistics) and data/macro.json (US economic indicators).

Conventions
  - Calendar-year return = last close of the year / last close of the previous year - 1.
    The first year of a series counts only if there is a close in the previous year,
    so a partial first year is never reported as a full one.
  - The current year is year-to-date and flagged as such.
  - Drawdowns are measured on daily closes, from the running all-time high.
  - Volatility is the standard deviation of monthly returns, annualized (x sqrt 12).
"""

import csv
import json
import math
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

from universe import ASSETS, FRED, GROUPS

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"


def read_yahoo(asset_id, basis):
    rows = []
    with (RAW / "yahoo" / f"{asset_id}.csv").open() as f:
        for r in csv.DictReader(f):
            v = r["adj_close"] if basis == "total" and r["adj_close"] else r["close"]
            v = float(v)
            # Futures can print zero or negative (WTI, April 2020); returns need a positive price.
            if v > 0:
                rows.append((date.fromisoformat(r["date"]), v))
    return rows


def read_fred(series):
    with (RAW / "fred" / f"{series}.csv").open() as f:
        return [(date.fromisoformat(r["date"]), float(r["value"])) for r in csv.DictReader(f)]


def last_per(rows, key):
    out = {}
    for d, v in rows:
        out[key(d)] = (d, v)
    return out


def r4(x):
    return None if x is None or math.isnan(x) else round(x, 4)


def cagr(rows, years, end):
    """Annualized return over the last `years`, or None if the series is too short."""
    start = end[0] - timedelta(days=round(365.25 * years))
    if rows[0][0] > start + timedelta(days=7):
        return None
    base = next(v for d, v in reversed(rows) if d <= start)
    return (end[1] / base) ** (1 / years) - 1


def build_asset(spec, today):
    asset_id, ticker, name, group, basis, short = spec
    rows = read_yahoo(asset_id, basis)
    last = rows[-1]

    # Monthly closes and the deepest drawdown seen within each month.
    monthly, dd_monthly = {}, {}
    peak, max_dd, peak_date, trough = 0.0, 0.0, rows[0][0], None
    run_peak_date, dd_episode = rows[0][0], None
    for d, v in rows:
        if v > peak:
            peak, run_peak_date = v, d
        dd = v / peak - 1
        m = d.strftime("%Y-%m")
        monthly[m] = v
        dd_monthly[m] = min(dd_monthly.get(m, 0.0), dd)
        if dd < max_dd:
            max_dd, trough, dd_episode = dd, d, run_peak_date
    # When (if ever) the worst drawdown was recovered.
    recovered = None
    if trough:
        level = next(v for d, v in rows if d == dd_episode)
        recovered = next((d for d, v in rows if d > trough and v >= level), None)

    years = last_per(rows, lambda d: d.year)
    annual = {}
    for y in sorted(years):
        if y - 1 in years:
            annual[y] = years[y][1] / years[y - 1][1] - 1
    ytd_year = last[0].year if last[0].year == today.year else None

    full = [r for y, r in annual.items() if y != ytd_year]
    mrets = []
    mvals = list(monthly.values())
    for a, b in zip(mvals, mvals[1:]):
        mrets.append(b / a - 1)
    vol = statistics.stdev(mrets[-120:]) * math.sqrt(12) if len(mrets) > 24 else None

    one_year = next((v for d, v in reversed(rows) if d <= last[0] - timedelta(days=365)), None)
    span = (last[0] - rows[0][0]).days / 365.25
    return {
        "id": asset_id,
        "ticker": ticker,
        "name": name,
        "short": short,
        "group": group,
        "basis": basis,
        "start": rows[0][0].isoformat(),
        "last": {"date": last[0].isoformat(), "value": round(last[1], 4)},
        "ytdYear": ytd_year,
        "annual": {str(y): r4(r) for y, r in annual.items()},
        "monthly": [[m, round(v, 4)] for m, v in monthly.items()],
        "drawdown": [[m, r4(v)] for m, v in dd_monthly.items()],
        "stats": {
            "ytd": r4(annual.get(ytd_year)) if ytd_year else None,
            "r1y": r4(last[1] / one_year - 1) if one_year else None,
            "cagr3": r4(cagr(rows, 3, last)),
            "cagr5": r4(cagr(rows, 5, last)),
            "cagr10": r4(cagr(rows, 10, last)),
            "cagr20": r4(cagr(rows, 20, last)),
            "cagrAll": r4((last[1] / rows[0][1]) ** (1 / span) - 1) if span > 1 else None,
            "fromHigh": r4(last[1] / peak - 1),
            "high": {"date": run_peak_date.isoformat(), "value": round(peak, 4)},
            "maxDrawdown": {
                "value": r4(max_dd),
                "peak": dd_episode.isoformat() if dd_episode else None,
                "trough": trough.isoformat() if trough else None,
                "recovered": recovered.isoformat() if recovered else None,
            },
            "vol10y": r4(vol),
            "years": len(full),
            "up": sum(r > 0 for r in full),
            "down": sum(r < 0 for r in full),
            "mean": r4(statistics.mean(full)) if full else None,
            "median": r4(statistics.median(full)) if full else None,
        },
    }


def yoy(rows):
    by = {d: v for d, v in rows}
    out = []
    for d, v in rows:
        prev = by.get(date(d.year - 1, d.month, 1))
        if prev:
            out.append((d, v / prev - 1))
    return out


def month_key(d):
    return d.strftime("%Y-%m")


def build_macro():
    s = {k: read_fred(k) for k, *_ in FRED}
    names = {k: n for k, n, _ in FRED}

    rec = s["USREC"]
    recessions, start = [], None
    for d, v in rec:
        if v == 1 and start is None:
            start = d
        if v == 0 and start is not None:
            recessions.append([month_key(start), month_key(d - timedelta(days=1))])
            start = None
    if start is not None:
        recessions.append([month_key(start), None])

    gs10, gs2 = dict(s["GS10"]), dict(s["GS2"])
    spread = [(d, gs10[d] - gs2[d]) for d in sorted(gs2) if d in gs10]

    vix = read_yahoo("vix", "price")
    vix_m = {}
    for d, v in vix:
        vix_m.setdefault(month_key(d), []).append(v)

    monthly = {
        "cpi": [[month_key(d), r4(v)] for d, v in yoy(s["CPIAUCSL"])],
        "core": [[month_key(d), r4(v)] for d, v in yoy(s["CPILFESL"])],
        "fedfunds": [[month_key(d), r4(v / 100)] for d, v in s["FEDFUNDS"]],
        "gs10": [[month_key(d), r4(v / 100)] for d, v in s["GS10"]],
        "gs2": [[month_key(d), r4(v / 100)] for d, v in s["GS2"]],
        "spread": [[month_key(d), r4(v / 100)] for d, v in spread],
        "unrate": [[month_key(d), r4(v / 100)] for d, v in s["UNRATE"]],
        "m2": [[month_key(d), r4(v)] for d, v in yoy(s["M2SL"])],
        "gdp": [[month_key(d), r4(v / 100)] for d, v in s["A191RL1Q225SBEA"]],
        "vix": [[m, round(statistics.mean(v), 2)] for m, v in vix_m.items()],
    }

    # One row per calendar year, with year-end (December) readings.
    def dec(rows):
        return {d.year: v for d, v in rows if d.month == 12}

    cpi_dec = dec(yoy(s["CPIAUCSL"]))
    ff_dec = dec(s["FEDFUNDS"])
    g10 = dec(s["GS10"])
    un = dec(s["UNRATE"])
    gdp = {d.year: v for d, v in s["A191RL1A225NBEA"]}
    rec_years = {d.year for d, v in rec if v == 1}
    vix_y = {}
    for d, v in vix:
        vix_y.setdefault(d.year, []).append(v)
    annual = []
    for y in range(1929, date.today().year + 1):
        annual.append({
            "year": y,
            "cpi": r4(cpi_dec.get(y)),
            "fedfunds": r4(ff_dec[y] / 100) if y in ff_dec else None,
            "fedfundsChange": r4((ff_dec[y] - ff_dec[y - 1]) / 100) if y in ff_dec and y - 1 in ff_dec else None,
            "gs10": r4(g10[y] / 100) if y in g10 else None,
            "unrate": r4(un[y] / 100) if y in un else None,
            "gdp": r4(gdp[y] / 100) if y in gdp else None,
            "recession": y in rec_years,
            "vix": round(statistics.mean(vix_y[y]), 1) if y in vix_y else None,
        })

    return {
        "sources": {k: {"name": names[k], "last": s[k][-1][0].isoformat()} for k in s},
        "recessions": recessions,
        "monthly": monthly,
        "annual": annual,
    }


def main():
    today = date.today()
    assets = []
    for spec in ASSETS:
        try:
            assets.append(build_asset(spec, today))
        except FileNotFoundError:
            print(f"! missing snapshot for {spec[1]}", file=sys.stderr)
            sys.exit(1)

    spx = next(a for a in assets if a["id"] == "spx")
    # Sanity checks against well-known S&P 500 calendar-year price returns.
    for y, expected in {"1931": -0.4713, "2008": -0.3849, "2013": 0.2960, "2022": -0.1944}.items():
        got = spx["annual"][y]
        if abs(got - expected) > 0.002:
            sys.exit(f"S&P 500 {y}: got {got}, expected {expected}")

    markets = {
        "updated": max(a["last"]["date"] for a in assets),
        "groups": [{"id": g, "name": n} for g, n in GROUPS],
        "assets": assets,
    }
    (OUT / "markets.json").write_text(json.dumps(markets, separators=(",", ":")))
    (OUT / "macro.json").write_text(json.dumps(build_macro(), separators=(",", ":")))
    for name in ("markets.json", "macro.json"):
        print(f"{name}: {(OUT / name).stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
