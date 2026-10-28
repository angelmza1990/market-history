// Portfolio check: a hypothetical portfolio's concentration, sectors, valuation, quality, past
// behavior against a chosen benchmark and in past market crises.
// Everything runs in the browser; the holdings are kept in localStorage only.
(function () {
  const { pct, spct, num, signClass } = MH;
  MH.shell("portfolio");

  const ACK_KEY = "mh-portfolio-ack";
  const SAVE_KEY = "mh-portfolio";
  const BENCH_KEY = "mh-portfolio-bench";
  const EXAMPLE = [["GOOGL", 20], ["AAPL", 20], ["META", 20], ["NVDA", 20], ["TSLA", 20]];
  const SIGNALS = { under: "Undervalued", fair: "Fairly valued", over: "Overvalued", none: "Not rated" };
  const QUALITY = { high: "High", average: "Average", low: "Low", none: "Not ranked" };
  // Funds from the markets dataset (total return for ETFs, price for gold and crypto)
  const MARKET_FUNDS = {
    xlk: "Information Technology", xlc: "Communication Services", xly: "Consumer Discretionary", xlf: "Financials",
    xlv: "Health Care", xli: "Industrials", xlp: "Consumer Staples", xle: "Energy", xlb: "Materials",
    xlu: "Utilities", xlre: "Real Estate",
    tlt: "Bonds", ief: "Bonds", lqd: "Bonds", argt: "Argentina", gold: "Gold", btc: "Crypto", eth: "Crypto",
  };
  const MARKET_TICKERS = { gold: "GOLD", btc: "BTC", eth: "ETH" };
  // Index funds from the stocks dataset (total return): what each counts as in the sector table
  const INDEX_FUNDS = {
    SPY: ["SPDR S&P 500 ETF", null], QQQ: ["Invesco QQQ (Nasdaq-100)", "Nasdaq-100 fund"],
    DIA: ["SPDR Dow Jones Industrial Average ETF", "Dow Jones fund"], IWM: ["iShares Russell 2000 ETF", "US small caps"],
    EEM: ["iShares MSCI Emerging Markets ETF", "Emerging markets"], AGG: ["iShares Core US Aggregate Bond ETF", "Bonds"],
  };
  const BENCHES = [
    ["SPY", "S&P 500"], ["QQQ", "Nasdaq-100"], ["DIA", "Dow Jones"], ["IWM", "Russell 2000"],
    ["EEM", "Emerging markets"], ["6040", "60/40 stocks and bonds"],
  ];
  // Market falls, month-end to month-end (start month is the last month-end before the fall)
  const EPISODES = [
    ["Dot-com bust", "2000-03", "2002-09"],
    ["Global financial crisis", "2007-10", "2009-02"],
    ["Euro debt crisis", "2011-04", "2011-09"],
    ["China and oil slump", "2015-07", "2016-02"],
    ["Late-2018 sell-off", "2018-09", "2018-12"],
    ["Covid crash", "2020-01", "2020-03"],
    ["Inflation and rate hikes", "2021-12", "2022-09"],
  ];
  const X = (v) => (v == null || Number.isNaN(v) ? "–" : `${num(v, v >= 100 ? 0 : 1)}×`);
  const Y = (v) => (v == null || Number.isNaN(v) ? "–" : `${num(v, 2)}%`);
  const ym = d3.timeFormat("%Y-%m");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: nothing kept */ } },
  };

  // ---------- disclaimer gate ----------
  const gate = document.getElementById("gate");
  const tool = document.getElementById("tool");
  const box = document.getElementById("ack-box");
  const ackBtn = document.getElementById("ack-btn");
  box.addEventListener("change", () => { ackBtn.disabled = !box.checked; });
  ackBtn.addEventListener("click", () => {
    store.set(ACK_KEY, "1");
    open();
  });
  let started = false;
  function open() {
    gate.hidden = true;
    tool.hidden = false;
    if (!started) { started = true; start(); }
  }
  if (store.get(ACK_KEY) === "1") open();

  function start() {
    Promise.all([MH.load("valuation"), MH.load("stocks"), MH.load("markets")]).then(([V, S, M]) => {
      const companies = new Map(V.companies.map((c) => [c.t, c]));
      const packedSeries = (s) => {
        const start = MH.parseMonth(s.from);
        return new Map(s.v.map((v, i) => [ym(d3.timeMonth.offset(start, i)), v]).filter((d) => d[1] != null));
      };
      const funds = new Map();
      for (const [t, [name, group]] of Object.entries(INDEX_FUNDS)) {
        if (S.benchmarks[t]) funds.set(t, { t, name, group, series: packedSeries(S.benchmarks[t]) });
      }
      for (const a of M.assets) {
        if (MARKET_FUNDS[a.id]) {
          const t = MARKET_TICKERS[a.id] || a.ticker;
          funds.set(t, { t, name: a.name, group: MARKET_FUNDS[a.id], series: new Map(a.monthly) });
        }
      }

      // 60/40: 60% S&P 500 and 40% US bonds, rebalanced monthly
      const benchSeries = new Map([...funds].filter(([t]) => INDEX_FUNDS[t]).map(([t, f]) => [t, f.series]));
      if (benchSeries.has("SPY") && benchSeries.has("AGG")) {
        const spy = benchSeries.get("SPY"), agg = benchSeries.get("AGG");
        const ms = [...agg.keys()].filter((m) => spy.has(m));
        const mix = new Map([[ms[0], 100]]);
        for (let i = 1; i < ms.length; i++) {
          const r = 0.6 * (spy.get(ms[i]) / spy.get(ms[i - 1]) - 1) + 0.4 * (agg.get(ms[i]) / agg.get(ms[i - 1]) - 1);
          mix.set(ms[i], mix.get(ms[i - 1]) * (1 + r));
        }
        benchSeries.set("6040", mix);
      }
      const benches = BENCHES.filter(([k]) => benchSeries.has(k));
      let benchKey = benches.some(([k]) => k === store.get(BENCH_KEY)) ? store.get(BENCH_KEY) : "SPY";
      const benchName = (k) => benches.find((b) => b[0] === k)[1];

      // S&P 500 aggregates, weighted by market value
      const capped = V.companies.filter((c) => c.mcap);
      const totalCap = d3.sum(capped, (c) => c.mcap);
      const indexSectors = d3.rollup(capped, (cs) => d3.sum(cs, (c) => c.mcap) / totalCap, (c) => c.s);
      const sectorNames = [...indexSectors.keys()].sort((a, b) => indexSectors.get(b) - indexSectors.get(a));
      const capHarmonic = (f) => {
        const ok = capped.filter((c) => f(c) > 0);
        return d3.sum(ok, (c) => c.mcap) / d3.sum(ok, (c) => c.mcap / f(c));
      };
      const capMean = (f) => {
        const ok = capped.filter((c) => f(c) != null);
        return d3.sum(ok, (c) => c.mcap * f(c)) / d3.sum(ok, (c) => c.mcap);
      };
      const INDEX = {
        pe: capHarmonic((c) => c.pe.now), fwd: capHarmonic((c) => c.growth.fwdPe), ev: capHarmonic((c) => c.ev.now),
        peg: capMean((c) => (c.growth.peg > 0 ? c.growth.peg : null)), dy: capMean((c) => c.dy.now ?? 0),
        fcf: capMean((c) => (c.fcf.na ? null : c.fcf.now)),
      };

      const lookup = (raw) => {
        const t = raw.trim().toUpperCase().replace(/\s.*$/, "");
        const alias = t.replace("-", ".");
        if (companies.has(alias) && S.prices[alias]) {
          const c = companies.get(alias);
          return { t: alias, kind: "stock", c, name: c.n, group: c.s, series: packedSeries(S.prices[alias]) };
        }
        if (funds.has(t)) return { ...funds.get(t), kind: "fund" };
        return null;
      };

      // ---------- editor ----------
      const dl = document.getElementById("tickers");
      V.companies.forEach((c) => dl.append(new Option(c.n, c.t)));
      funds.forEach((f, t) => dl.append(new Option(f.name, t)));
      const rowsEl = document.getElementById("rows");

      function addRow(t = "", w = "") {
        const tr = document.createElement("tr");
        const tdT = document.createElement("td");
        const inT = Object.assign(document.createElement("input"), { value: t, placeholder: "Ticker", autocomplete: "off" });
        inT.setAttribute("list", "tickers");
        inT.setAttribute("aria-label", "Ticker");
        tdT.append(inT);
        const tdW = document.createElement("td");
        tdW.className = "w";
        const inW = Object.assign(document.createElement("input"), { value: w, placeholder: "%", inputMode: "decimal" });
        inW.setAttribute("aria-label", "Weight in percent");
        tdW.append(inW);
        const tdN = document.createElement("td");
        tdN.className = "name";
        const tdX = document.createElement("td");
        tdX.className = "x";
        const del = Object.assign(document.createElement("button"), { type: "button", className: "row-btn", textContent: "×" });
        del.setAttribute("aria-label", "Remove holding");
        del.addEventListener("click", () => { tr.remove(); refresh(); });
        tdX.append(del);
        tr.append(tdT, tdW, tdN, tdX);
        inT.addEventListener("input", refresh);
        inW.addEventListener("input", refresh);
        rowsEl.append(tr);
        return tr;
      }

      function readRows() {
        return [...rowsEl.querySelectorAll("tr")].map((tr) => {
          const [t, w] = tr.querySelectorAll("input");
          return { raw: t.value, w: parseFloat(w.value.replace(",", ".")), hit: lookup(t.value) };
        }).filter((r) => r.raw.trim() || !Number.isNaN(r.w));
      }

      function refresh() {
        let total = 0;
        rowsEl.querySelectorAll("tr").forEach((tr) => {
          const [t, w] = tr.querySelectorAll("input");
          const hit = lookup(t.value);
          tr.querySelector(".name").textContent = !t.value.trim() ? "" : hit ? hit.name : "Not covered";
          tr.classList.toggle("bad", !!t.value.trim() && !hit);
          const v = parseFloat(w.value.replace(",", "."));
          if (v > 0) total += v;
        });
        document.getElementById("total").textContent = `Total: ${num(total, total % 1 ? 1 : 0)}%`;
        store.set(SAVE_KEY, JSON.stringify(readRows().map((r) => [r.raw.trim(), Number.isNaN(r.w) ? "" : r.w])));
      }

      function setRows(list) {
        rowsEl.replaceChildren();
        list.forEach(([t, w]) => addRow(t, w));
        if (!list.length) addRow();
        refresh();
      }

      document.getElementById("add").addEventListener("click", () => { addRow().querySelector("input").focus(); });
      document.getElementById("example").addEventListener("click", () => { setRows(EXAMPLE); run(); });
      document.getElementById("clear").addEventListener("click", () => {
        setRows([]);
        document.getElementById("results").hidden = true;
      });
      document.getElementById("paste-btn").addEventListener("click", () => {
        const list = document.getElementById("paste-box").value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
          .map((s) => {
            const m = s.match(/^([A-Za-z.\-^=]+)\s*[:=]?\s*([\d.]+)?\s*%?$/);
            return m ? [m[1].toUpperCase(), m[2] ? +m[2] : ""] : null;
          }).filter(Boolean);
        if (list.length) setRows(list);
      });
      document.getElementById("run").addEventListener("click", run);

      const benchSel = document.getElementById("bench");
      benches.forEach(([k, label]) => benchSel.append(new Option(label, k)));
      benchSel.value = benchKey;
      benchSel.addEventListener("change", () => {
        benchKey = benchSel.value;
        store.set(BENCH_KEY, benchKey);
        if (last) evaluate(...last);
      });

      // ---------- evaluation ----------
      let windowKey = "5y";
      let last = null;
      function run() {
        const rows = readRows();
        const note = document.getElementById("run-note");
        const bad = rows.filter((r) => r.raw.trim() && !r.hit).map((r) => r.raw.trim().toUpperCase());
        const good = rows.filter((r) => r.hit && r.w > 0);
        // merge repeated tickers
        const merged = d3.rollups(good, (rs) => ({ ...rs[0].hit, w: d3.sum(rs, (r) => r.w) }), (r) => r.hit.t).map((d) => d[1]);
        if (!merged.length) {
          note.textContent = "Add at least one covered ticker with a weight above zero.";
          return;
        }
        const sum = d3.sum(merged, (h) => h.w);
        merged.forEach((h) => { h.w /= sum; });
        merged.sort((a, b) => b.w - a.w);
        const msgs = [];
        if (bad.length) msgs.push(`Left out (not covered): ${bad.join(", ")}.`);
        if (Math.abs(sum - 100) > 0.05) msgs.push(`Weights added up to ${num(sum, 1)}% and were scaled to 100%.`);
        note.textContent = msgs.join(" ");
        last = [merged, Math.abs(sum - 100) > 0.05 ? sum : null];
        evaluate(...last);
        document.getElementById("results").hidden = false;
      }

      function evaluate(H, scaledFrom) {
        // ---- concentration and sectors ----
        const effN = 1 / d3.sum(H, (h) => h.w * h.w);
        const sectorW = new Map();
        const addTo = (k, w) => sectorW.set(k, (sectorW.get(k) || 0) + w);
        for (const h of H) {
          if (h.kind === "fund" && h.t === "SPY") indexSectors.forEach((w, s) => addTo(s, h.w * w));
          else addTo(h.group, h.w);
        }

        // ---- valuation and quality (stocks only) ----
        const stocks = H.filter((h) => h.kind === "stock");
        const stockW = d3.sum(stocks, (h) => h.w);
        const harmonic = (f) => {
          const ok = stocks.filter((h) => f(h.c) > 0);
          const w = d3.sum(ok, (h) => h.w);
          return ok.length ? { value: w / d3.sum(ok, (h) => h.w / f(h.c)), cover: w } : null;
        };
        const mean = (f) => {
          const ok = stocks.filter((h) => f(h.c) != null);
          const w = d3.sum(ok, (h) => h.w);
          return ok.length ? { value: d3.sum(ok, (h) => h.w * f(h.c)) / w, cover: w } : null;
        };
        const P = {
          pe: harmonic((c) => c.pe.now), fwd: harmonic((c) => c.growth.fwdPe), ev: harmonic((c) => c.ev.now),
          peg: mean((c) => (c.growth.peg > 0 ? c.growth.peg : null)), dy: mean((c) => c.dy.now ?? 0),
          fcf: mean((c) => (c.fcf.na ? null : c.fcf.now)),
        };
        const sigW = { under: 0, fair: 0, over: 0, none: 0 };
        const qualW = { high: 0, average: 0, low: 0, none: 0 };
        stocks.forEach((h) => {
          sigW[h.c.signal || "none"] += h.w;
          qualW[h.c.quality.label || "none"] += h.w;
        });

        // ---- history against the chosen benchmark ----
        const bench = benchSeries.get(benchKey);
        const months = commonMonths(H, bench);
        const port = [], idx = [];
        for (let i = 1; i < months.length; i++) {
          const m = months[i], p = months[i - 1];
          port.push([m, d3.sum(H, (h) => h.w * (h.series.get(m) / h.series.get(p) - 1))]);
          idx.push([m, bench.get(m) / bench.get(p) - 1]);
        }

        renderTiles(H, effN, P, port, idx, scaledFrom);
        renderHoldings(H);
        renderSectors(sectorW);
        renderValuation(P, sigW, qualW, stockW);
        renderHistory(H, port, idx, months);
        const scen = renderScenarios(H);
        renderCorrelation(H, months);
        renderObservations(H, effN, sectorW, P, sigW, qualW, stockW, port, idx, scen);
      }

      const monthsApart = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
      function commonMonths(H, bench) {
        const all = [...H[0].series.keys()].filter((m) => bench.has(m) && H.every((h) => h.series.has(m))).sort();
        // keep the unbroken run of months that ends today
        const out = [];
        for (let i = all.length - 1; i >= 0; i--) {
          if (out.length && monthsApart(all[i], out[0]) !== 1) break;
          out.unshift(all[i]);
        }
        return out;
      }

      const stats = (r, b) => {
        const n = r.length;
        if (n < 2) return null;
        const vals = r.map((d) => d[1]);
        let g = 1, peak = 1, dd = 0;
        for (const v of vals) { g *= 1 + v; peak = Math.max(peak, g); dd = Math.min(dd, g / peak - 1); }
        const out = { ret: g ** (12 / n) - 1, vol: d3.deviation(vals) * Math.sqrt(12), dd, total: g - 1 };
        if (b) {
          const bv = b.map((d) => d[1]);
          const mb = d3.mean(bv), mr = d3.mean(vals);
          const cov = d3.sum(vals, (v, i) => (v - mr) * (bv[i] - mb)) / (n - 1);
          out.beta = cov / d3.variance(bv);
          out.corr = cov / (d3.deviation(vals) * d3.deviation(bv));
        }
        return out;
      };
      const yearly = (r) => {
        const out = new Map();
        r.forEach(([m, v]) => out.set(+m.slice(0, 4), (out.get(+m.slice(0, 4)) ?? 1) * (1 + v)));
        return new Map([...out].map(([y, g]) => [y, g - 1]));
      };

      function tile(label, value, delta, cls) {
        const d = document.createElement("div");
        d.className = "tile";
        d.innerHTML = '<p class="label"></p><div class="value"></div><div class="delta"><span></span></div>';
        d.querySelector(".label").textContent = label;
        d.querySelector(".value").textContent = value;
        if (cls) d.querySelector(".value").classList.add(cls);
        d.querySelector(".delta span").textContent = delta;
        return d;
      }

      function renderTiles(H, effN, P, port, idx, scaledFrom) {
        const n5 = Math.min(60, port.length);
        const p = stats(port.slice(-n5), idx.slice(-n5)), b = stats(idx.slice(-n5));
        const years = n5 / 12;
        const span = years >= 1 ? `${num(years, years % 1 ? 1 : 0)} years` : `${n5} months`;
        const bn = benchName(benchKey);
        document.getElementById("summary-sub").textContent =
          `${H.length} holdings${scaledFrom ? `, weights scaled from ${num(scaledFrom, 1)}%` : ""}. Past figures cover the last ${span}, with dividends reinvested and the mix rebalanced every month, against the ${bn}.`;
        const top = H[0];
        document.getElementById("tiles").replaceChildren(
          tile("Holdings", String(H.length), `like ${num(effN, 1)} equal positions`),
          tile("Largest position", pct(top.w, 0), top.t),
          tile("Weighted P/E", X(P.pe && P.pe.value), `S&P 500: ${X(INDEX.pe)}`),
          tile(`Annualized return, ${span}`, p ? spct(p.ret) : "–", b ? `${bn}: ${spct(b.ret)}` : "", p ? signClass(p.ret) : ""),
          tile("Volatility", p ? pct(p.vol, 0) : "–", b ? `${bn}: ${pct(b.vol, 0)}` : ""),
          tile("Worst fall", p ? pct(p.dd, 0) : "–", b ? `${bn}: ${pct(b.dd, 0)}` : "", "neg"),
        );
      }

      function badge(cls, text) {
        return Object.assign(document.createElement("span"), { className: `badge ${cls}`, textContent: text });
      }

      function renderHoldings(H) {
        const tb = document.querySelector("#holdings-table tbody");
        tb.replaceChildren(...H.map((h) => {
          const tr = document.createElement("tr");
          const td = (t, cls) => Object.assign(document.createElement("td"), { textContent: t, className: cls || "" });
          const name = document.createElement("td");
          name.className = "name-cell";
          const a = document.createElement(h.kind === "stock" ? "a" : "span");
          a.textContent = h.t;
          if (h.kind === "stock") a.href = `../valuation/#${h.t}`;
          name.append(a, Object.assign(document.createElement("small"), { textContent: h.name }));
          const ms = [...h.series.values()];
          const lastV = ms[ms.length - 1];
          const r1 = ms.length > 12 ? lastV / ms[ms.length - 13] - 1 : null;
          const r5 = ms.length > 60 ? (lastV / ms[ms.length - 61]) ** (1 / 5) - 1 : null;
          const rets = ms.slice(-61).map((v, i, arr) => (i ? v / arr[i - 1] - 1 : null)).slice(1);
          const vol = rets.length > 12 ? d3.deviation(rets) * Math.sqrt(12) : null;
          const sector = td(h.group || "All sectors");
          sector.style.textAlign = "left";
          const sig = document.createElement("td");
          sig.style.textAlign = "left";
          const qual = document.createElement("td");
          qual.style.textAlign = "left";
          if (h.kind === "stock") {
            sig.append(badge(h.c.signal || "none", SIGNALS[h.c.signal || "none"]));
            if (h.c.quality.label) qual.append(badge(`q-${h.c.quality.label}`, QUALITY[h.c.quality.label]));
            else qual.textContent = "–";
          } else { sig.textContent = "–"; qual.textContent = "–"; }
          const c = h.c;
          tr.append(name, td(pct(h.w, 1)), sector,
            td(c ? (c.pe.now == null ? "n/m" : X(c.pe.now)) : "–"), td(c ? X(c.growth.fwdPe) : "–"),
            td(c ? Y(c.dy.now) : "–"), sig, qual,
            td(spct(r1), signClass(r1)), td(spct(r5), signClass(r5)), td(vol == null ? "–" : pct(vol, 0)));
          return tr;
        }));
      }

      function renderSectors(sectorW) {
        const rows = sectorNames.map((s) => [s, sectorW.get(s) || 0, indexSectors.get(s)]);
        [...sectorW.keys()].filter((k) => !indexSectors.has(k)).forEach((k) => rows.push([k, sectorW.get(k), 0]));
        const max = d3.max(rows, (r) => Math.max(r[1], r[2]));
        const tb = document.querySelector("#sector-table tbody");
        tb.replaceChildren(...rows.map(([s, w, iw]) => {
          const tr = document.createElement("tr");
          const td = (t, cls) => Object.assign(document.createElement("td"), { textContent: t, className: cls || "" });
          const d = w - iw;
          const bars = document.createElement("td");
          bars.style.textAlign = "left";
          bars.innerHTML = `<span class="bar-cell" style="background:var(--s1);width:${(w / max) * 160}px"></span><br><span class="bar-cell" style="background:var(--line-2);width:${(iw / max) * 160}px"></span>`;
          tr.append(td(s), td(pct(w, 1)), td(iw ? pct(iw, 1) : "–"), td(`${d >= 0 ? "+" : "−"}${num(Math.abs(d) * 100, 1)} pts`, Math.abs(d) >= 0.1 ? "neg" : ""), bars);
          return tr;
        }));
        const lg = document.getElementById("sector-legend");
        lg.className = "legend";
        lg.innerHTML = '<span class="key"><span class="sw" style="background:var(--s1)"></span>Portfolio</span><span class="key"><span class="sw" style="background:var(--line-2)"></span>S&amp;P 500 by market value</span><span class="key">Differences of 10 points or more in red</span>';
      }

      function split(el, title, weights, labels, colors, noteHtml) {
        const h = document.createElement("h3");
        h.textContent = title;
        const bar = document.createElement("div");
        bar.className = "split";
        Object.keys(labels).filter((k) => weights[k] > 0).forEach((k) => {
          const sp = document.createElement("span");
          sp.style.background = colors[k];
          sp.style.flex = `${weights[k]} 0 0`;
          sp.title = `${labels[k]}: ${pct(weights[k], 0)}`;
          bar.append(sp);
        });
        const lg = document.createElement("div");
        lg.className = "legend";
        lg.innerHTML = Object.keys(labels).map((k) => `<span class="key"><span class="sw" style="background:${colors[k]}"></span>${labels[k]} ${pct(weights[k], 0)}</span>`).join("");
        const n = document.createElement("p");
        n.className = "note";
        n.innerHTML = noteHtml;
        el.append(h, bar, lg, n);
      }

      function renderValuation(P, sigW, qualW, stockW) {
        document.getElementById("val-sub").textContent = (stockW < 1
          ? `Computed on the ${pct(stockW, 0)} of the portfolio in individual stocks; funds and other assets are left out. `
          : "") + "Multiples are weighted harmonically, as if the portfolio were one company owning its share of each business; yields and PEG are weighted averages. Companies with negative earnings are left out of the multiples.";
        const m = document.getElementById("val-multiples");
        m.replaceChildren();
        const h = document.createElement("h3");
        h.textContent = "Against the S&P 500";
        m.append(h);
        const tbl = document.createElement("table");
        tbl.className = "data";
        tbl.innerHTML = "<thead><tr><th></th><th>Portfolio</th><th>S&amp;P 500</th><th>Difference</th></tr></thead>";
        const tb = document.createElement("tbody");
        const rows = [
          ["P/E", "pe", X, true], ["Forward P/E", "fwd", X, true], ["EV/EBITDA", "ev", X, true],
          ["PEG", "peg", (v) => (v == null ? "–" : num(v, 2)), true], ["Dividend yield", "dy", Y, false], ["FCF yield", "fcf", Y, false],
        ];
        for (const [name, k, f, multiple] of rows) {
          const p = P[k], i = INDEX[k];
          const tr = document.createElement("tr");
          tr.innerHTML = "<td></td><td></td><td></td><td></td>";
          const c = tr.children;
          c[0].textContent = name + (p && p.cover < stockW - 0.001 ? ` (on ${pct(p.cover / stockW, 0)} of stocks)` : "");
          c[1].textContent = f(p && p.value);
          c[2].textContent = f(i);
          if (p && i) {
            c[3].textContent = multiple ? spct(p.value / i - 1, 0) : `${p.value >= i ? "+" : "−"}${num(Math.abs(p.value - i), 2)} pts`;
          } else c[3].textContent = "–";
          tb.append(tr);
        }
        tbl.append(tb);
        m.append(tbl);
        const note = document.createElement("p");
        note.className = "note";
        note.textContent = "The S&P 500 figures weight every company by market value. Higher multiples, or lower yields, mean paying more for each dollar of earnings, cash flow or dividends; that says nothing on its own about future growth.";
        m.append(note);

        const s = document.getElementById("val-signals");
        s.replaceChildren();
        split(s, "Weight by valuation signal", sigW, SIGNALS,
          { under: "var(--pos-3)", fair: "var(--line-2)", over: "var(--neg-3)", none: "var(--line)" },
          'Signals from the <a href="../valuation/">valuation page</a>, which compares each company with its own history and its sector.');
        const gap = document.createElement("div");
        gap.style.height = "14px";
        s.append(gap);
        split(s, "Weight by quality", qualW, QUALITY,
          { high: "var(--pos-3)", average: "var(--line-2)", low: "var(--neg-3)", none: "var(--line)" },
          "Each company ranked within its sector on margins, returns on capital and debt (see the valuation page).");
      }

      function renderHistory(H, port, idx, months) {
        const avail = port.length;
        const opts = [["1y", "1 year", 12], ["3y", "3 years", 36], ["5y", "5 years", 60], ["10y", "10 years", 120]].filter((o) => o[2] <= avail);
        if (!opts.length || opts[opts.length - 1][2] < avail) opts.push(["max", `All (${num(avail / 12, 1)} years)`, avail]);
        if (!opts.some((o) => o[0] === windowKey)) windowKey = opts[opts.length - 1][0];
        const firstMonth = (h) => [...h.series.keys()].sort()[0];
        const youngest = H.reduce((a, h) => (firstMonth(h) > firstMonth(a) ? h : a));
        const bn = benchName(benchKey);
        const bench = benchSeries.get(benchKey);
        const benchFirst = [...bench.keys()].sort()[0];
        document.getElementById("hist-sub").textContent =
          `A portfolio holding these weights, rebalanced at the end of every month, with dividends reinvested, against the ${bn}. History is available since ${MH.fmtMonth(MH.parseMonth(months[0]))}${benchFirst === months[0] ? `, when the ${bn} data starts` : H.length > 1 ? `, when ${youngest.t} starts` : ""}. Costs and taxes are not included.`;
        const draw = () => {
          const n = Math.min(avail, opts.find((o) => o[0] === windowKey)[2]);
          const p = port.slice(-n), b = idx.slice(-n);
          const grow = (r) => {
            let g = 100;
            const start = MH.parseMonth(r[0][0]);
            return [[d3.timeMonth.offset(start, -1), 100]].concat(r.map(([m, v]) => [MH.parseMonth(m), (g *= 1 + v)]));
          };
          MH.lineChart(document.getElementById("growth-chart"), {
            height: 320,
            label: `Growth of 100: portfolio against the ${bn}`,
            series: [
              { id: "bench", name: bn, short: bn, color: "var(--muted)", values: grow(b) },
              { id: "port", name: "Portfolio", short: "Portfolio", color: "var(--s1)", values: grow(p) },
            ],
            log: n > 60, baseline: 100,
            yFormat: (v) => num(v, 0),
            tipFormat: (v) => num(v, 1),
          });
          const sp = stats(p, b), sb = stats(b);
          const yp = yearly(p), yb = yearly(b);
          const full = (y) => new Map([...y].filter(([yr]) => p.filter((d) => +d[0].slice(0, 4) === yr).length === 12));
          const best = (y) => { const e = [...y].sort((a, c) => c[1] - a[1]); return e.length ? `${spct(e[0][1], 0)} (${e[0][0]})` : "–"; };
          const worst = (y) => { const e = [...y].sort((a, c) => a[1] - c[1]); return e.length ? `${spct(e[0][1], 0)} (${e[0][0]})` : "–"; };
          const tb = document.querySelector("#risk-table tbody");
          tb.innerHTML = "";
          for (const [name, s, y] of [["Portfolio", sp, full(yp)], [bn, sb, full(yb)]]) {
            const tr = document.createElement("tr");
            const cells = [name, spct(s.ret), pct(s.vol, 0), pct(s.dd, 0), s.beta == null ? "1.00" : num(s.beta, 2), s.corr == null ? "1.00" : num(s.corr, 2), best(y), worst(y)];
            cells.forEach((c, i) => tr.append(Object.assign(document.createElement("td"), { textContent: c, className: i === 1 ? signClass(s.ret) : "" })));
            tb.append(tr);
          }
          // full calendar years only, plus the current year to date
          const cur = +months[months.length - 1].slice(0, 4);
          const years = [...yp.keys()].filter((y) => y === cur || p.filter((d) => +d[0].slice(0, 4) === y).length === 12).slice(-12);
          const yt = document.getElementById("years-table");
          yt.innerHTML = "";
          const head = document.createElement("tr");
          head.append(document.createElement("th"));
          years.forEach((y) => head.append(Object.assign(document.createElement("th"), { textContent: y === cur ? `${y} YTD` : String(y) })));
          const thead = document.createElement("thead");
          thead.append(head);
          const body = document.createElement("tbody");
          for (const [name, y] of [["Portfolio", yp], [bn, yb]]) {
            const tr = document.createElement("tr");
            tr.append(Object.assign(document.createElement("td"), { textContent: name }));
            years.forEach((yr) => tr.append(Object.assign(document.createElement("td"), { textContent: spct(y.get(yr), 0), className: signClass(y.get(yr)) })));
            body.append(tr);
          }
          yt.append(thead, body);
        };
        MH.seg(document.getElementById("window"), opts.map(([k, l]) => [k, l]), windowKey, (k) => { windowKey = k; draw(); });
        draw();
      }

      // Each holding's beta against the S&P 500 over all its monthly history.
      function betaVsSpy(h) {
        const spy = benchSeries.get("SPY");
        const ms = [...h.series.keys()].filter((m) => spy.has(m)).sort();
        const a = [], b = [];
        for (let i = 1; i < ms.length; i++) {
          if (monthsApart(ms[i - 1], ms[i]) !== 1) continue;
          a.push(h.series.get(ms[i]) / h.series.get(ms[i - 1]) - 1);
          b.push(spy.get(ms[i]) / spy.get(ms[i - 1]) - 1);
        }
        if (a.length < 24) return 1;
        const ma = d3.mean(a), mb = d3.mean(b);
        return d3.sum(a, (v, i) => (v - ma) * (b[i] - mb)) / d3.sum(b, (v) => (v - mb) ** 2);
      }

      function renderScenarios(H) {
        const spy = benchSeries.get("SPY");
        const bench = benchSeries.get(benchKey);
        const bn = benchName(benchKey);
        const change = (s, a, b) => (s.has(a) && s.has(b) ? s.get(b) / s.get(a) - 1 : null);
        const betas = new Map(H.map((h) => [h.t, betaVsSpy(h)]));
        const thead = document.querySelector("#scenarios thead tr");
        thead.innerHTML = "<th>Episode</th><th>Period</th><th>Portfolio</th><th>S&amp;P 500</th>" + (benchKey !== "SPY" ? `<th>${bn.replace("&", "&amp;")}</th>` : "") + "<th style='text-align:left'>How the portfolio figure was made</th>";
        const out = [];
        const tb = document.querySelector("#scenarios tbody");
        tb.replaceChildren(...EPISODES.map(([name, a, b]) => {
          const sp = change(spy, a, b);
          let total = 0, estimated = [];
          for (const h of H) {
            const r = change(h.series, a, b);
            if (r != null) total += h.w * r;
            else {
              estimated.push(h.t);
              total += h.w * betas.get(h.t) * sp;
            }
          }
          out.push({ name, port: total, spy: sp, estimated: estimated.length });
          const tr = document.createElement("tr");
          const td = (t, cls) => Object.assign(document.createElement("td"), { textContent: t, className: cls || "" });
          const period = `${MH.fmtMonth(MH.parseMonth(a))} – ${MH.fmtMonth(MH.parseMonth(b))}`;
          const how = td(estimated.length === 0 ? "Actual prices of every holding"
            : estimated.length === H.length ? "Estimated from each holding's beta (none was trading yet)"
              : `Actual prices; estimated from beta for ${estimated.join(", ")}`, "muted");
          how.style.textAlign = "left";
          how.style.whiteSpace = "normal";
          const cells = [td(name), td(period), td(spct(total, 0) + (estimated.length ? "*" : ""), signClass(total)), td(spct(sp, 0), signClass(sp))];
          if (benchKey !== "SPY") { const r = change(bench, a, b); cells.push(td(spct(r, 0), signClass(r))); }
          tr.append(...cells, how);
          return tr;
        }));
        return out;
      }

      function renderCorrelation(H, months) {
        const block = document.getElementById("corr-block");
        if (H.length < 2 || H.length > 20) { block.hidden = true; return; }
        block.hidden = false;
        const ms = months.slice(-61);
        const rets = H.map((h) => ms.slice(1).map((m, i) => h.series.get(m) / h.series.get(ms[i]) - 1));
        const corr = (a, b) => {
          const ma = d3.mean(a), mb = d3.mean(b);
          return d3.sum(a, (v, i) => (v - ma) * (b[i] - mb)) / Math.sqrt(d3.sum(a, (v) => (v - ma) ** 2) * d3.sum(b, (v) => (v - mb) ** 2));
        };
        const t = document.getElementById("corr");
        t.innerHTML = "";
        const head = document.createElement("tr");
        head.append(document.createElement("th"));
        H.forEach((h) => head.append(Object.assign(document.createElement("th"), { textContent: h.t })));
        const thead = document.createElement("thead");
        thead.append(head);
        const body = document.createElement("tbody");
        H.forEach((a, i) => {
          const tr = document.createElement("tr");
          tr.append(Object.assign(document.createElement("th"), { textContent: a.t }));
          H.forEach((b, j) => {
            const c = i === j ? 1 : corr(rets[i], rets[j]);
            const td = document.createElement("td");
            td.textContent = i === j ? "" : num(c, 2);
            td.className = i === j ? "empty" : c >= 0.7 ? "r-n3" : c >= 0.5 ? "r-n2" : c >= 0.3 ? "r-n1" : c >= 0 ? "r-p1" : "r-p2";
            td.addEventListener("pointermove", (evt) => MH.showTip(evt, `${a.t} and ${b.t}`, [{ value: num(c, 2), label: "correlation of monthly returns" }]));
            td.addEventListener("pointerleave", MH.hideTip);
            tr.append(td);
          });
          body.append(tr);
        });
        t.append(thead, body);
      }

      function renderObservations(H, effN, sectorW, P, sigW, qualW, stockW, port, idx, scen) {
        const out = [];
        const top = H[0];
        const bn = benchName(benchKey);
        if (top.w >= 0.2) out.push(`${top.t} is ${pct(top.w, 0)} of the portfolio: a 30% fall in ${top.t} alone would take about ${pct(top.w * 0.3, 0)} off the total.`);
        out.push(`The weights are as concentrated as ${num(effN, 1)} equally weighted positions.`);
        const big = [...sectorW].map(([s, w]) => [s, w, indexSectors.get(s) || 0]).filter(([, w, i]) => w - i >= 0.1).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]));
        big.forEach(([s, w, i]) => out.push(`${s} is ${pct(w, 0)} of the portfolio, against ${pct(i, 0)} of the S&P 500.`));
        const missing = sectorNames.filter((s) => !(sectorW.get(s) > 0.005));
        if (missing.length) out.push(`No exposure to ${missing.length} of the 11 sectors: ${missing.join(", ")}.`);
        if (P.pe && INDEX.pe) {
          const d = P.pe.value / INDEX.pe - 1;
          if (Math.abs(d) >= 0.1) out.push(`The stocks' weighted P/E of ${X(P.pe.value)} is ${pct(Math.abs(d), 0)} ${d > 0 ? "above" : "below"} the S&P 500's ${X(INDEX.pe)}: the market is paying ${d > 0 ? "more" : "less"} for each dollar of their current earnings.`);
          if (P.fwd && P.fwd.value < P.pe.value * 0.85) out.push(`On expected earnings for the next twelve months the weighted P/E drops to ${X(P.fwd.value)}: the price already assumes strong profit growth.`);
        }
        if (P.dy && Math.abs(P.dy.value - INDEX.dy) >= 0.5) out.push(`The stocks yield ${Y(P.dy.value)} in dividends, against ${Y(INDEX.dy)} for the S&P 500.`);
        if (stockW > 0) {
          if (sigW.over >= 0.4) out.push(`${pct(sigW.over, 0)} of the portfolio is in stocks flagged as overvalued against their own history and sector.`);
          if (sigW.under >= 0.4) out.push(`${pct(sigW.under, 0)} of the portfolio is in stocks flagged as undervalued against their own history and sector.`);
          if (qualW.low >= 0.3) out.push(`${pct(qualW.low, 0)} of the portfolio is in companies ranked in the bottom third of their sector for quality.`);
          if (qualW.high >= 0.6) out.push(`${pct(qualW.high, 0)} of the portfolio is in companies ranked in the top third of their sector for quality.`);
        }
        const n = Math.min(60, port.length);
        const s = stats(port.slice(-n), idx.slice(-n)), b = stats(idx.slice(-n));
        if (s) {
          if (s.beta >= 1.2) out.push(`With a beta of ${num(s.beta, 2)} against the ${bn}, the portfolio has moved on average ${num(s.beta, 1)} times as much as the index in the same month.`);
          else if (s.beta <= 0.8) out.push(`With a beta of ${num(s.beta, 2)} against the ${bn}, the portfolio has moved less than the index, on average ${num(s.beta, 1)} times its monthly move.`);
          if (s.dd < b.dd - 0.1) out.push(`Its worst fall over the period, ${pct(s.dd, 0)}, was deeper than the ${bn}'s ${pct(b.dd, 0)}.`);
          if (s.vol > b.vol * 1.5) out.push(`Its volatility of ${pct(s.vol, 0)} a year is more than one and a half times the ${bn}'s ${pct(b.vol, 0)}.`);
        }
        const worst = scen.filter((e) => e.port != null).sort((a, c) => a.port - c.port)[0];
        if (worst) out.push(`Of the past crises below, the hardest for this mix would have been the ${worst.name.toLowerCase()}: ${spct(worst.port, 0)}${worst.estimated ? " (partly estimated)" : ""}, against ${spct(worst.spy, 0)} for the S&P 500.`);
        const ul = document.getElementById("obs");
        ul.replaceChildren(...out.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
      }

      let saved = [];
      try { saved = JSON.parse(store.get(SAVE_KEY) || "[]"); } catch (e) { saved = []; }
      setRows(Array.isArray(saved) && saved.length ? saved : EXAMPLE);
      run();
    }).catch(MH.fail);
  }
})();
