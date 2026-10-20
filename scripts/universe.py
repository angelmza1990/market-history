"""The assets and macro series the site covers.

Each asset is downloaded from Yahoo Finance. `basis` says how its return is measured:
  price  - change in the index level or futures price (no dividends)
  total  - change in the dividend-adjusted price of an ETF (dividends reinvested)
"""

GROUPS = [
    ("us", "US equities"),
    ("intl", "International equities"),
    ("bonds", "Bonds & dollar"),
    ("commodities", "Commodities"),
    ("crypto", "Crypto"),
    ("sectors", "US sectors"),
]

# (id, Yahoo ticker, name, group, basis, short label)
ASSETS = [
    ("spx", "^GSPC", "S&P 500", "us", "price", "S&P 500"),
    ("ndx", "^NDX", "Nasdaq-100", "us", "price", "Nasdaq-100"),
    ("ixic", "^IXIC", "Nasdaq Composite", "us", "price", "Nasdaq Comp."),
    ("dji", "^DJI", "Dow Jones Industrial Average", "us", "price", "Dow Jones"),
    ("rut", "^RUT", "Russell 2000", "us", "price", "Russell 2000"),

    ("stoxx", "^STOXX50E", "Euro Stoxx 50", "intl", "price", "Euro Stoxx 50"),
    ("dax", "^GDAXI", "DAX (Germany)", "intl", "total", "DAX"),
    ("ftse", "^FTSE", "FTSE 100 (UK)", "intl", "price", "FTSE 100"),
    ("nikkei", "^N225", "Nikkei 225 (Japan)", "intl", "price", "Nikkei 225"),
    ("hsi", "^HSI", "Hang Seng (Hong Kong)", "intl", "price", "Hang Seng"),
    ("sse", "000001.SS", "Shanghai Composite (China)", "intl", "price", "Shanghai"),
    ("bvsp", "^BVSP", "Bovespa (Brazil)", "intl", "price", "Bovespa"),
    ("eem", "EEM", "MSCI Emerging Markets (iShares ETF)", "intl", "total", "Emerging Mkts"),
    ("argt", "ARGT", "MSCI Argentina (Global X ETF, USD)", "intl", "total", "Argentina (USD)"),

    ("tlt", "TLT", "US Treasuries 20+ years (iShares ETF)", "bonds", "total", "Treasuries 20Y+"),
    ("ief", "IEF", "US Treasuries 7-10 years (iShares ETF)", "bonds", "total", "Treasuries 7-10Y"),
    ("lqd", "LQD", "US investment-grade corporate bonds (iShares ETF)", "bonds", "total", "IG Corporates"),
    ("dxy", "DX-Y.NYB", "US Dollar Index", "bonds", "price", "Dollar Index"),

    ("gold", "GC=F", "Gold", "commodities", "price", "Gold"),
    ("silver", "SI=F", "Silver", "commodities", "price", "Silver"),
    ("copper", "HG=F", "Copper", "commodities", "price", "Copper"),
    ("wti", "CL=F", "Crude oil (WTI)", "commodities", "price", "Oil (WTI)"),
    ("natgas", "NG=F", "Natural gas (Henry Hub)", "commodities", "price", "Natural gas"),
    ("wheat", "ZW=F", "Wheat", "commodities", "price", "Wheat"),
    ("corn", "ZC=F", "Corn", "commodities", "price", "Corn"),
    ("soy", "ZS=F", "Soybeans", "commodities", "price", "Soybeans"),

    ("btc", "BTC-USD", "Bitcoin", "crypto", "price", "Bitcoin"),
    ("eth", "ETH-USD", "Ethereum", "crypto", "price", "Ethereum"),

    ("spy", "SPY", "S&P 500 (SPDR ETF, total return)", "sectors", "total", "S&P 500 (TR)"),
    ("xlk", "XLK", "Technology", "sectors", "total", "Technology"),
    ("xlc", "XLC", "Communication Services", "sectors", "total", "Communication"),
    ("xly", "XLY", "Consumer Discretionary", "sectors", "total", "Cons. Discretionary"),
    ("xlf", "XLF", "Financials", "sectors", "total", "Financials"),
    ("xlv", "XLV", "Health Care", "sectors", "total", "Health Care"),
    ("xli", "XLI", "Industrials", "sectors", "total", "Industrials"),
    ("xlp", "XLP", "Consumer Staples", "sectors", "total", "Cons. Staples"),
    ("xle", "XLE", "Energy", "sectors", "total", "Energy"),
    ("xlb", "XLB", "Materials", "sectors", "total", "Materials"),
    ("xlu", "XLU", "Utilities", "sectors", "total", "Utilities"),
    ("xlre", "XLRE", "Real Estate", "sectors", "total", "Real Estate"),
]

# Series that are levels, not prices: shown on the macro page, never as returns.
LEVELS = [
    ("vix", "^VIX", "CBOE Volatility Index (VIX)"),
]

# FRED series (id, name, frequency of the source)
FRED = [
    ("USREC", "NBER US recession indicator", "monthly"),
    ("CPIAUCSL", "Consumer Price Index, all items", "monthly"),
    ("CPILFESL", "Consumer Price Index, less food and energy", "monthly"),
    ("FEDFUNDS", "Effective federal funds rate", "monthly"),
    ("GS10", "10-year Treasury yield", "monthly"),
    ("GS2", "2-year Treasury yield", "monthly"),
    ("UNRATE", "Unemployment rate", "monthly"),
    ("A191RL1Q225SBEA", "Real GDP growth, annualized quarterly rate", "quarterly"),
    ("A191RL1A225NBEA", "Real GDP growth, annual", "annual"),
    ("M2SL", "M2 money stock", "monthly"),
]
