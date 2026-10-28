"""Download the S&P 500 constituents, their prices and their fundamentals into data/raw/valuation/.

    python3 scripts/fetch_valuation.py            # prices for all, fundamentals for stale companies
    python3 scripts/fetch_valuation.py --all      # fundamentals for every company
    python3 scripts/fetch_valuation.py NVDA AAPL  # fundamentals for these tickers only

Files
  companies.csv         ticker, Yahoo symbol, name, GICS sector and sub-industry (Wikipedia's
                        list of S&P 500 companies, plus EXTRA_STOCKS from universe.py)
  prices.csv            month-end close of every company, split-adjusted, since 2005
  latest.csv            latest daily close and its date
  eps/<TICKER>.csv      earnings per share of every quarterly report (Yahoo's earnings history)
  statements/<T>.csv    annual and quarterly EBITDA, debt, cash and shares (Yahoo's statements)
  fetched.json          when each company's fundamentals were last downloaded

Fundamentals change four times a year, so a normal run only refreshes a company when its
data is more than a week old or it has reported since the last download, at most
MAX_REFRESH companies per run. Prices are refreshed for everyone on every run.
"""

import csv
import json
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import yfinance as yf

from fetch_data import save
from universe import EXTRA_STOCKS

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "valuation"
WIKI = "https://en.wikipedia.org/w/index.php?title=List_of_S%26P_500_companies&action=raw"
UA = "market-history/1.0 (https://github.com/angelmza1990/market-history)"
PRICE_START = "2005-01-01"
MAX_REFRESH = 200
STALE_DAYS = 7

# Yahoo's fundamentals timeseries: each item is fetched for both annual and quarterly periods.
ITEMS = ["NormalizedEBITDA", "EBITDA", "TotalDebt", "CashCashEquivalentsAndShortTermInvestments",
         "CashAndCashEquivalents", "OrdinarySharesNumber", "DilutedAverageShares"]
TIMESERIES = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{}"


def wiki_text(cell):
    cell = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", cell)
    cell = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", cell)
    return re.sub(r"\{\{[^}]*\}\}", "", cell).strip()


def fetch_companies():
    """The constituents table of Wikipedia's 'List of S&P 500 companies'."""
    req = urllib.request.Request(WIKI, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode()
    table = text[text.index('id="constituents"'):]
    table = table[:table.index("\n|}")]
    by_name = {}
    for chunk in table.split("\n|-")[2:]:
        cells = [c.strip() for c in re.split(r"\n\|\|?|\|\|", chunk) if c.strip()]
        m = re.search(r"\{\{[\w ]+\|([^}|]+)", cells[0])
        if not m:
            continue
        ticker, name = m.group(1).strip(), wiki_text(cells[1])
        share_class = re.search(r"\s*\(Class (\w)\)$", name)
        name = name[:share_class.start()] if share_class else name
        # One row per company: keep its Class A shares (GOOGL, FOXA, NWSA).
        if name in by_name and not (share_class and share_class.group(1) == "A"):
            continue
        by_name[name] = [ticker, ticker.replace(".", "-"), name, wiki_text(cells[2]), wiki_text(cells[3])]
    rows = list(by_name.values())
    for ticker, name, sector, industry in EXTRA_STOCKS:
        if ticker not in {r[0] for r in rows}:
            rows.append([ticker, ticker.replace(".", "-"), name, sector, industry])
    if len(rows) < 480:
        raise ValueError(f"only {len(rows)} companies parsed")
    return sorted(rows)


def read_companies():
    with (RAW / "companies.csv").open() as f:
        return list(csv.reader(f))[1:]


def fetch_prices(companies):
    """Month-end closes since 2005 and the latest daily close, for every company at once."""
    symbols = [c[1] for c in companies]
    monthly = yf.download(symbols, start=PRICE_START, interval="1mo", auto_adjust=False,
                          progress=False, threads=True)["Close"]
    daily = yf.download(symbols, period="10d", interval="1d", auto_adjust=False,
                        progress=False, threads=True)["Close"]
    rows, latest, missing = [], [], []
    for ticker, symbol, *_ in companies:
        if symbol not in monthly or monthly[symbol].dropna().empty:
            missing.append(ticker)
            continue
        for ts, v in monthly[symbol].dropna().items():
            rows.append([ticker, ts.strftime("%Y-%m"), f"{v:.6g}"])
        last = daily[symbol].dropna() if symbol in daily else None
        if last is not None and not last.empty:
            latest.append([ticker, last.index[-1].strftime("%Y-%m-%d"), f"{last.iloc[-1]:.6g}"])
    rows.sort()
    latest.sort()
    ok = save(RAW / "prices.csv", ["ticker", "month", "close"], rows)
    ok = save(RAW / "latest.csv", ["ticker", "date", "close"], latest) and ok
    return ok, missing


def fetch_eps(symbol):
    """Every quarterly report: date and reported EPS (future dates kept, without EPS)."""
    df = yf.Ticker(symbol).get_earnings_dates(limit=100)
    if df is None or df.empty:
        return []
    rows = {}
    for ts, r in df.iterrows():
        eps = r.get("Reported EPS")
        day = ts.strftime("%Y-%m-%d")
        if eps == eps and eps is not None:
            rows[day] = f"{eps:.4g}"
        else:
            rows.setdefault(day, "")
    return sorted(rows.items())


def fetch_statements(symbol, session):
    types = [f"{p}{i}" for p in ("annual", "quarterly") for i in ITEMS]
    now = int(time.time())
    resp = session.cache_get(TIMESERIES.format(symbol), params={
        "symbol": symbol, "type": ",".join(types), "period1": now - 15 * 365 * 86400, "period2": now})
    rows = []
    for res in resp.json()["timeseries"]["result"]:
        key = res["meta"]["type"][0]
        period = "annual" if key.startswith("annual") else "quarterly"
        item = key[len(period):]
        for x in res.get(key) or []:
            if x and x.get("reportedValue"):
                rows.append([x["asOfDate"], period, item, f"{x['reportedValue']['raw']:.6g}"])
    return sorted(rows)


def write_rows(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def stale(ticker, fetched, today):
    """Never fetched, more than a week old, or a report date has passed since the download."""
    last = fetched.get(ticker)
    if not last:
        return True
    last = date.fromisoformat(last)
    if (today - last).days >= STALE_DAYS:
        return True
    path = RAW / "eps" / f"{ticker}.csv"
    if path.exists():
        with path.open() as f:
            for r in csv.DictReader(f):
                if not r["eps"] and last <= date.fromisoformat(r["date"]) <= today:
                    return True
    return False


def fetch_fundamentals(companies, wanted, refresh_all):
    fetched_path = RAW / "fetched.json"
    fetched = json.loads(fetched_path.read_text()) if fetched_path.exists() else {}
    today = datetime.now(timezone.utc).date()
    if wanted:
        todo = [c for c in companies if c[0] in wanted]
    elif refresh_all:
        todo = companies
    else:
        todo = [c for c in companies if stale(c[0], fetched, today)]
        # oldest first, so every company comes round within a few runs
        todo.sort(key=lambda c: fetched.get(c[0], ""))
        todo = todo[:MAX_REFRESH]
    print(f"Fundamentals: {len(todo)} of {len(companies)} companies")
    session = yf.Ticker("SPY")._data
    failed, in_a_row = [], 0
    for i, (ticker, symbol, *_) in enumerate(todo):
        for attempt in range(3):
            try:
                eps = fetch_eps(symbol)
                statements = fetch_statements(symbol, session)
                break
            except Exception as e:  # rate limits, network errors, odd payloads
                print(f"  retry {ticker}: {type(e).__name__}: {e}"[:160])
                time.sleep(10 * (attempt + 1))
        else:
            failed.append(ticker)
            in_a_row += 1
            if in_a_row >= 5:
                print("  ! five failures in a row: Yahoo is refusing requests, stopping here")
                failed += [c[0] for c in todo[i + 1:]]
                break
            continue
        in_a_row = 0
        # Never replace a snapshot with an empty download.
        if eps:
            write_rows(RAW / "eps" / f"{ticker}.csv", ["date", "eps"], eps)
        if statements:
            write_rows(RAW / "statements" / f"{ticker}.csv", ["date", "period", "item", "value"], statements)
        if eps or statements:
            fetched[ticker] = today.isoformat()
        else:
            failed.append(ticker)
        if (i + 1) % 50 == 0:
            print(f"  {i + 1} done")
            fetched_path.write_text(json.dumps(dict(sorted(fetched.items())), indent=0))
    fetched_path.write_text(json.dumps(dict(sorted(fetched.items())), indent=0))
    return failed


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    RAW.mkdir(parents=True, exist_ok=True)
    print("S&P 500 constituents")
    try:
        companies = fetch_companies()
        write_rows(RAW / "companies.csv", ["ticker", "yahoo", "name", "sector", "industry"], companies)
        print(f"  {len(companies)} companies")
    except Exception as e:
        print(f"  ! Wikipedia: {e}; keeping the previous list")
        companies = read_companies()

    print("Prices")
    ok, missing = fetch_prices(companies)
    if missing:
        print(f"  ! no prices for {', '.join(missing)}")

    failed = fetch_fundamentals(companies, set(args), "--all" in sys.argv)
    if failed:
        print(f"Fundamentals not updated: {', '.join(failed[:40])}{' …' if len(failed) > 40 else ''}; previous snapshot kept.")
    if not ok or len(failed) > 25:
        sys.exit(1)


if __name__ == "__main__":
    main()
