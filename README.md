# Market History

> **Not investment advice.** An educational project; it does not replace a licensed financial adviser. See the [disclaimer](#disclaimer).

A long-run view of markets and the economy: calendar-year returns, growth, drawdowns and correlations for major stock indices, bonds, commodities, crypto and the eleven US sectors, set against US inflation, interest rates, unemployment, growth and recessions; and the valuation of every S&P 500 company against its own history and its sector.

**Live site:** https://angelmza1990.github.io/market-history/

## Pages

- **[Overview](https://angelmza1990.github.io/market-history/)**: latest levels, a year-to-date ranking, a summary table of every asset (1, 3, 5 and 10-year returns, distance from the high, maximum drawdown, share of positive years) and a short framework for reading the cycle.
- **[Annual returns](https://angelmza1990.github.io/market-history/annual-returns/)**: a heatmap of every calendar year for every asset, with up and down years, averages, best and worst years and the longest losing streak; and one asset in depth, with its year-by-year bars and the distribution of its years in 10-point bands.
- **[Long run](https://angelmza1990.github.io/market-history/long-run/)**: growth of 100 from any start year since 1928, on a log or linear scale, with US recessions and major market events, drawdowns from the all-time high, and statistics for the chosen window.
- **[Sectors](https://angelmza1990.github.io/market-history/sectors/)**: sector leadership by year, performance with volatility, beta and correlation, returns against the S&P 500 year by year, one panel per sector, and a correlation matrix with bonds, gold, oil and Bitcoin.
- **[Valuation](https://angelmza1990.github.io/market-history/valuation/)**: trailing P/E and EV/EBITDA for every S&P 500 company, month by month, against the company's own last ten years and the median of its sector; a signal (undervalued, fairly valued, overvalued) built from those comparisons; forward P/E and PEG; dividend yield (since 2005) and free cash flow yield over time; a quality rank within the sector from margins, returns on capital and debt; a searchable company view, an alerts table filterable by sector and signal, and sector medians over time.
- **[Portfolio check](https://angelmza1990.github.io/market-history/portfolio/)**: an educational tool, behind a disclaimer, that describes a hypothetical portfolio entered as tickers and weights: concentration, sectors against the S&P 500, weighted valuation multiples, yields and quality, the same mix's past returns with dividends reinvested against a chosen benchmark (S&P 500, Nasdaq-100, Dow Jones, Russell 2000, emerging markets or 60/40), what it would have done in the major market falls since 2000, and how the holdings move together. The holdings stay in the browser.
- **[Economy](https://angelmza1990.github.io/market-history/macro/)**: inflation, interest rates, the yield curve, unemployment, GDP growth, money supply, volatility and market stress; S&P 500 returns grouped by recession, inflation, Fed policy and the shape of the yield curve; decade-by-decade returns against inflation; and a year-by-year table.
- **[Methodology](https://angelmza1990.github.io/market-history/methodology/)**: sources, definitions and limitations.

## Coverage

| Group | Assets | From |
|---|---|---|
| US equities | S&P 500, Nasdaq-100, Nasdaq Composite, Dow Jones, Russell 2000 | 1928 (S&P 500) |
| International equities | Euro Stoxx 50, DAX, FTSE 100, Nikkei 225, Hang Seng, Shanghai Composite, Bovespa, MSCI Emerging Markets, MSCI Argentina | 1965 (Nikkei) |
| Bonds & dollar | US Treasuries 20+ and 7–10 years, investment-grade corporates, US Dollar Index | 1971 (dollar) |
| Commodities | Gold, silver, copper, WTI crude, natural gas, wheat, corn, soybeans | 2000 |
| Crypto | Bitcoin, Ethereum | 2014 |
| US sectors | The eleven Select Sector SPDR ETFs and the SPDR S&P 500 ETF | 1999 |
| Valuation | Every S&P 500 company (Wikipedia's constituents list, GICS sectors); P/E from quarterly earnings reports, EV/EBITDA from Yahoo's statements | 2005 (P/E), 2022 (EV/EBITDA) |
| Economy | CPI, core CPI, federal funds rate, 2- and 10-year yields, unemployment, real GDP, M2, VIX, NBER recessions | 1854 (recessions) |

Index returns exclude dividends; ETF returns are total returns with dividends reinvested. See the methodology page for details.

## How it works

The site is static HTML, CSS and JavaScript with [D3.js](https://d3js.org/) (vendored in `assets/vendor/`), served by GitHub Pages. No build step.

```
scripts/universe.py     the assets and series covered
scripts/fetch_data.py   downloads Yahoo Finance and FRED data into data/raw/
scripts/build_data.py   builds data/markets.json and data/macro.json
scripts/fetch_valuation.py  downloads S&P 500 constituents, prices, earnings and statements into data/raw/valuation/
scripts/build_valuation.py  builds data/valuation.json
scripts/check_pages.mjs opens every page in headless Chrome
```

The raw downloads are committed as a snapshot, so the datasets can always be rebuilt. The build checks the S&P 500 against known calendar-year returns (1931, 2008, 2013, 2022) and stops if they do not match.

Two GitHub Actions workflows run on their own:

- **Update data** runs after the US close every weekday, refreshes the sources, rebuilds the datasets and commits them if anything changed.
- **Check pages** runs on every push and fails on script errors, missing files, empty pages or sideways scrolling at phone width.

## Run it locally

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/fetch_data.py   # optional: refresh the snapshot
.venv/bin/python scripts/build_data.py
.venv/bin/python scripts/fetch_valuation.py --all   # optional: every company's fundamentals (~15 min)
.venv/bin/python scripts/build_valuation.py
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Disclaimer

- This project is for information and education only. It is **not investment, financial, tax or legal advice**, and nothing in it is a recommendation, solicitation or offer to buy, sell or hold any security.
- It does **not replace advice from a licensed financial adviser** who knows your goals, time horizon, finances and tolerance for risk. Talk to one before making investment decisions.
- Labels such as "undervalued" and "overvalued" are mechanical comparisons of valuation multiples with a company's own history and its sector. They ignore growth, risk and much else, and are not ratings or price targets.
- The portfolio check describes a hypothetical portfolio; it does not judge whether it suits anyone.
- Data comes from third parties (Yahoo Finance, FRED, Wikipedia), is processed automatically and may be incomplete, delayed or wrong. It is provided as is, without warranty of any kind.
- Past performance does not guarantee future results. Every investment can lose value.
- The author accepts no liability for any loss or decision arising from the use of this site or its code.

## License

MIT. Data belongs to its providers: Yahoo Finance and the Federal Reserve Bank of St. Louis (FRED). The list of S&P 500 companies comes from Wikipedia (CC BY-SA 4.0).
