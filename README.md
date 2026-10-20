# Market History

A long-run view of markets and the economy: calendar-year returns, growth, drawdowns and correlations for major stock indices, bonds, commodities, crypto and the eleven US sectors, set against US inflation, interest rates, unemployment, growth and recessions.

**Live site:** https://angelmza1990.github.io/market-history/

## Pages

- **[Overview](https://angelmza1990.github.io/market-history/)**: latest levels, a year-to-date ranking, a summary table of every asset (1, 3, 5 and 10-year returns, distance from the high, maximum drawdown, share of positive years) and a short framework for reading the cycle.
- **[Annual returns](https://angelmza1990.github.io/market-history/annual-returns/)**: a heatmap of every calendar year for every asset, with up and down years, averages, best and worst years and the longest losing streak; and one asset in depth, with its year-by-year bars and the distribution of its years in 10-point bands.
- **[Long run](https://angelmza1990.github.io/market-history/long-run/)**: growth of 100 from any start year since 1928, on a log or linear scale, with US recessions and major market events, drawdowns from the all-time high, and statistics for the chosen window.
- **[Sectors](https://angelmza1990.github.io/market-history/sectors/)**: sector leadership by year, performance with volatility, beta and correlation, returns against the S&P 500 year by year, one panel per sector, and a correlation matrix with bonds, gold, oil and Bitcoin.
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
| Economy | CPI, core CPI, federal funds rate, 2- and 10-year yields, unemployment, real GDP, M2, VIX, NBER recessions | 1854 (recessions) |

Index returns exclude dividends; ETF returns are total returns with dividends reinvested. See the methodology page for details.

## How it works

The site is static HTML, CSS and JavaScript with [D3.js](https://d3js.org/) (vendored in `assets/vendor/`), served by GitHub Pages. No build step.

```
scripts/universe.py     the assets and series covered
scripts/fetch_data.py   downloads Yahoo Finance and FRED data into data/raw/
scripts/build_data.py   builds data/markets.json and data/macro.json
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
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Disclaimer

For research and education. Nothing here is investment advice.

## License

MIT. Data belongs to its providers: Yahoo Finance and the Federal Reserve Bank of St. Louis (FRED).
