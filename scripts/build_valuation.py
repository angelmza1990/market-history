"""Build data/valuation.json from the snapshot in data/raw/valuation/.

    python3 scripts/build_valuation.py

For every company: monthly trailing P/E and EV/EBITDA, where today's multiples sit in the
company's own history and against its sector, and a signal that combines the two.

Definitions
  P/E        month-end close / sum of the last four reported quarterly EPS. A quarter's EPS
             counts from the day it was reported, so every month only uses figures that
             were public at the time. Yahoo's earnings history reports the EPS the market
             compared with estimates, which for many companies excludes one-off items.
  EV/EBITDA  (month-end close x shares + total debt - cash and short-term investments)
             / EBITDA of the last twelve months (normalized EBITDA when Yahoo has it).
             Balance-sheet figures and EBITDA count from the next earnings report after
             the period ends. Not computed for Financials, where debt is a raw material
             rather than financing.
  History    the last 10 years of monthly values (at least 3 years for P/E, 2 for
             EV/EBITDA). A multiple is "below its range" in its cheapest 20% of months and
             "above its range" in its most expensive 20%.
  Sector     today's multiple against the median of the companies in the same GICS sector:
             below 0.8x the median is cheap, above 1.25x expensive.
  Signal     each comparison votes -1 (cheap), 0 or +1 (expensive); the average of the
             votes is the score. -0.5 or less is "undervalued", +0.5 or more "overvalued",
             anything between "fairly valued". Negative earnings give no vote.
"""

import csv
import json
import statistics
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "valuation"
OUT = ROOT / "data" / "valuation.json"

START = "2005-01"
HISTORY_MONTHS = 120
MIN_HISTORY = {"pe": 36, "ev": 24}
MAX_MULTIPLE = 1000          # beyond this the denominator is close to zero: not meaningful
LOW_PCT, HIGH_PCT = 0.2, 0.8
CHEAP_RATIO, DEAR_RATIO = 0.8, 1.25
UNDER, OVER = -0.5, 0.5
NO_EV_SECTORS = {"Financials"}
# Yahoo counts Berkshire's shares in Class A equivalents; one A share is worth 1,500 B shares.
SHARE_UNITS = {"BRK.B": 1500}


def read_csv(path):
    with path.open() as f:
        return list(csv.DictReader(f))


def month_end(m):
    y, mo = int(m[:4]), int(m[5:7])
    return date(y + mo // 12, mo % 12 + 1, 1) - timedelta(days=1)


def months_between(a, b):
    out, y, m = [], int(a[:4]), int(a[5:7])
    while f"{y:04d}-{m:02d}" <= b:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def reports(ticker):
    """Reported quarters [(date, eps)], with duplicate announcements a few weeks apart merged."""
    path = RAW / "eps" / f"{ticker}.csv"
    if not path.exists():
        return [], []
    rows = read_csv(path)
    dates = [date.fromisoformat(r["date"]) for r in rows]
    out = []
    for r in rows:
        if not r["eps"]:
            continue
        d = date.fromisoformat(r["date"])
        if out and (d - out[-1][0]).days < 45:
            out[-1] = (d, float(r["eps"]))
        else:
            out.append((d, float(r["eps"])))
    return out, dates


def ttm_eps(quarters):
    """[(effective date, trailing EPS or None)]: None when the last four reports are not
    four consecutive quarters (a gap in the history)."""
    out = []
    for i in range(len(quarters)):
        if i < 3:
            continue
        span = (quarters[i][0] - quarters[i - 3][0]).days
        ok = 230 <= span <= 320
        out.append((quarters[i][0], sum(q[1] for q in quarters[i - 3:i + 1]) if ok else None))
    return out


def statements(ticker):
    path = RAW / "statements" / f"{ticker}.csv"
    data = defaultdict(dict)
    if path.exists():
        for r in read_csv(path):
            data[(r["period"], r["item"])][date.fromisoformat(r["date"])] = float(r["value"])
    return data


def as_of(series, d, max_days=400):
    """The latest value on or before d, if not older than max_days."""
    best = None
    for k, v in series.items():
        if k <= d and (d - k).days <= max_days and (best is None or k > best[0]):
            best = (k, v)
    return best[1] if best else None


def quarterly_ebitda(st):
    """Normalized EBITDA by quarter, except where it is more than twice the company's usual
    quarter (Yahoo sometimes adds back far more than the one-off item): reported EBITDA then."""
    norm, rep = st.get(("quarterly", "NormalizedEBITDA"), {}), st.get(("quarterly", "EBITDA"), {})
    if not norm:
        return dict(rep)
    typical = statistics.median(abs(v) for v in norm.values())
    out = {}
    for d in set(norm) | set(rep):
        n = norm.get(d)
        out[d] = n if n is not None and abs(n) <= 2 * typical else rep.get(d, n)
    return out


def ebitda_points(st, report_dates):
    """[(available from, period end, TTM EBITDA, shares, debt, cash)], and the share counts."""
    def item(period, *names):
        for n in names:
            if st.get((period, n)):
                return st[(period, n)]
        return {}

    ttm = {}
    for d, v in item("annual", "NormalizedEBITDA", "EBITDA").items():
        ttm[d] = v
    q = quarterly_ebitda(st)
    qd = sorted(q)
    for i in range(3, len(qd)):
        gaps = [(qd[j] - qd[j - 1]).days for j in range(i - 2, i + 1)]
        if all(80 <= g <= 100 for g in gaps):
            ttm[qd[i]] = sum(q[qd[j]] for j in range(i - 3, i + 1))

    def merged(*names):
        out = {}
        for period in ("annual", "quarterly"):
            for n in names:
                if st.get((period, n)):
                    for d, v in st[(period, n)].items():
                        out.setdefault(d, v)
                    break
        return out

    debt = merged("TotalDebt")
    cash = merged("CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalents")
    shares = merged("OrdinarySharesNumber", "DilutedAverageShares")
    points = []
    for end, e in sorted(ttm.items()):
        sh = as_of(shares, end, 200)
        if not sh:
            continue
        after = [d for d in report_dates if end < d <= end + timedelta(days=120)]
        available = min(after) if after else end + timedelta(days=60)
        points.append((available, end, e, sh, as_of(debt, end) or 0.0, as_of(cash, end) or 0.0))
    return points, shares


def rnd(x):
    if x is None:
        return None
    return round(x) if abs(x) >= 100 else round(x, 1)


def percentile(values, x):
    below = sum(v < x for v in values)
    equal = sum(v == x for v in values)
    return (below + 0.5 * equal) / len(values)


def quantile(sorted_values, q):
    i = (len(sorted_values) - 1) * q
    lo = int(i)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (i - lo)


def history_stats(series, key):
    """Where the latest value sits in the last 10 years of the series."""
    now = series[-1]
    window = [v for v in series[-HISTORY_MONTHS:] if v is not None]
    if now is None or len(window) < MIN_HISTORY[key]:
        return {"now": rnd(now), "months": len(window)}
    s = sorted(window)
    return {
        "now": rnd(now), "months": len(window),
        "pct": round(percentile(window, now), 3),
        "med": rnd(statistics.median(s)), "p20": rnd(quantile(s, LOW_PCT)), "p80": rnd(quantile(s, HIGH_PCT)),
    }


def packed(months, series):
    """{from, v}: the series from its first value, rounded."""
    first = next((i for i, v in enumerate(series) if v is not None), None)
    if first is None:
        return None
    return {"from": months[first], "v": [rnd(v) for v in series[first:]]}


def build_company(c, prices, latest, months):
    ticker, sector = c["ticker"], c["sector"]
    px = prices.get(ticker, {})
    last = latest.get(ticker)
    if not px or not last:
        return None
    # The current month is valued at the latest close.
    px = dict(px)
    px[months[-1]] = last[1]
    quarters, report_dates = reports(ticker)
    eps = ttm_eps(quarters)
    points, shares = ebitda_points(statements(ticker), report_dates)
    use_ev = sector not in NO_EV_SECTORS
    shares_now = as_of(shares, last[0], 500)
    if shares_now:
        shares_now *= SHARE_UNITS.get(ticker, 1)

    pe, ev = [], []
    for m in months:
        end = min(month_end(m), last[0])
        close = px.get(m)
        # P/E: the trailing EPS known at the end of the month, if reported in the last 200 days
        t = next((x for x in reversed(eps) if x[0] <= end), None)
        v = None
        if close and t and t[1] and (end - t[0]).days <= 200 and t[1] > 0:
            v = close / t[1]
            if v > MAX_MULTIPLE:
                v = None
        pe.append(v)
        # EV/EBITDA: the latest reported period, if it ended within the last 15 months
        p = next((x for x in reversed(points) if x[0] <= end), None)
        v = None
        if use_ev and close and p and (end - p[1]).days <= 460 and p[2] > 0:
            v = (close * p[3] + p[4] - p[5]) / p[2]
            if not 0 < v <= MAX_MULTIPLE:
                v = None
        ev.append(v)

    t_now = next((x for x in reversed(eps) if x[0] <= last[0]), None)
    out = {
        "t": ticker, "n": c["name"], "s": sector, "i": c["industry"],
        "price": round(last[1], 2), "date": last[0].isoformat(),
        "mcap": round(last[1] * shares_now / 1e9, 1) if shares_now else None,
        "eps": round(t_now[1], 2) if t_now and t_now[1] is not None and (last[0] - t_now[0]).days <= 200 else None,
        "pe": history_stats(pe, "pe"), "ev": history_stats(ev, "ev"),
        "series": {"pe": packed(months, pe), "ev": packed(months, ev)},
    }
    if sector in NO_EV_SECTORS:
        out["ev"]["na"] = True
    return out


def expand(months, s):
    if not s:
        return [None] * len(months)
    k = months.index(s["from"])
    return [None] * k + s["v"]


def vote_history(st):
    if "pct" not in st:
        return None
    return -1 if st["pct"] <= LOW_PCT else 1 if st["pct"] >= HIGH_PCT else 0


def vote_sector(ratio):
    if ratio is None:
        return None
    return -1 if ratio <= CHEAP_RATIO else 1 if ratio >= DEAR_RATIO else 0


def main():
    companies = read_csv(RAW / "companies.csv")
    prices = defaultdict(dict)
    for r in read_csv(RAW / "prices.csv"):
        prices[r["ticker"]][r["month"]] = float(r["close"])
    latest = {r["ticker"]: (date.fromisoformat(r["date"]), float(r["close"])) for r in read_csv(RAW / "latest.csv")}
    updated = max(d for d, _ in latest.values())
    months = months_between(START, updated.strftime("%Y-%m"))

    built, missing = [], []
    for c in companies:
        b = build_company(c, prices, latest, months)
        (built.append(b) if b else missing.append(c["ticker"]))
    if missing:
        print(f"no prices: {', '.join(missing)}")

    # Sector medians, today and month by month
    by_sector = defaultdict(list)
    for c in built:
        by_sector[c["s"]].append(c)
    groups = sorted(by_sector.items()) + [("S&P 500", built)]
    sectors = []
    medians_now = {}
    for name, members in groups:
        entry = {"name": name, "count": len(members), "series": {}}
        for key in ("pe", "ev"):
            grid = [expand(months, c["series"][key]) for c in members]
            series = []
            for i in range(len(months)):
                vals = [g[i] for g in grid if g[i] is not None]
                series.append(statistics.median(vals) if len(vals) >= 5 else None)
            entry[key] = history_stats(series, key)
            entry[key]["companies"] = sum(g[-1] is not None for g in grid)
            entry["series"][key] = packed(months, series)
            medians_now[(name, key)] = series[-1]
        sectors.append(entry)

    # Signals
    for c in built:
        votes = []
        for key in ("pe", "ev"):
            st = c[key]
            med = medians_now.get((c["s"], key))
            if st.get("now") is not None and med:
                st["sector"] = round(st["now"] / med, 2)
            st["voteHistory"] = vote_history(st)
            st["voteSector"] = vote_sector(st.get("sector"))
            votes += [v for v in (st["voteHistory"], st["voteSector"]) if v is not None]
        c["score"] = round(sum(votes) / len(votes), 2) if votes else None
        c["votes"] = len(votes)
        c["signal"] = (None if c["score"] is None else "under" if c["score"] <= UNDER
                       else "over" if c["score"] >= OVER else "fair")
    for s in sectors:
        members = built if s["name"] == "S&P 500" else by_sector[s["name"]]
        s["signals"] = {k: sum(c["signal"] == k for c in members) for k in ("under", "fair", "over")}
        s["signals"]["none"] = sum(c["signal"] is None for c in members)

    check(built, sectors)
    data = {
        "updated": updated.isoformat(),
        "start": START,
        "rules": {"historyMonths": HISTORY_MONTHS, "minHistory": MIN_HISTORY, "lowPct": LOW_PCT, "highPct": HIGH_PCT,
                  "cheapRatio": CHEAP_RATIO, "dearRatio": DEAR_RATIO, "under": UNDER, "over": OVER,
                  "noEvSectors": sorted(NO_EV_SECTORS)},
        "sectors": sectors,
        "companies": sorted(built, key=lambda c: -(c["mcap"] or 0)),
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    rated = sum(c["signal"] is not None for c in built)
    print(f"valuation.json: {OUT.stat().st_size / 1024:.0f} KB, {len(built)} companies, {rated} rated")


def check(built, sectors):
    """Stop if the dataset is clearly broken."""
    with_pe = sum(c["pe"].get("now") is not None for c in built)
    if len(built) < 450 or with_pe < 0.8 * len(built):
        sys.exit(f"only {len(built)} companies, {with_pe} with a P/E")
    market = next(s for s in sectors if s["name"] == "S&P 500")
    if not 10 <= (market["pe"]["now"] or 0) <= 40:
        sys.exit(f"median P/E of the S&P 500 companies is {market['pe']['now']}")


if __name__ == "__main__":
    main()
