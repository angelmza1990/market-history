// Portfolio check: a hypothetical portfolio's concentration, sectors, valuation and past behavior.
// Everything runs in the browser; the holdings are kept in localStorage only.
(function () {
  const { pct, spct, num, signClass } = MH;
  MH.shell("portfolio");

  const ACK_KEY = "mh-portfolio-ack";
  const SAVE_KEY = "mh-portfolio";
  const EXAMPLE = [["GOOGL", 20], ["AAPL", 20], ["META", 20], ["NVDA", 20], ["TSLA", 20]];
  const SIGNALS = { under: "Undervalued", fair: "Fairly valued", over: "Overvalued", none: "Not rated" };
  const SECTOR_FUNDS = {
    xlk: "Information Technology", xlc: "Communication Services", xly: "Consumer Discretionary", xlf: "Financials",
    xlv: "Health Care", xli: "Industrials", xlp: "Consumer Staples", xle: "Energy", xlb: "Materials",
    xlu: "Utilities", xlre: "Real Estate",
  };
  const OTHER_FUNDS = {
    tlt: "Bonds", ief: "Bonds", lqd: "Bonds", eem: "Emerging markets", argt: "Argentina",
    gold: "Gold", btc: "Crypto", eth: "Crypto",
  };
  const FUND_TICKERS = { gold: "GOLD", btc: "BTC", eth: "ETH" };
  const X = (v) => (v == null ? "–" : `${num(v, v >= 100 ? 0 : 1)}×`);

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
      const funds = new Map();
      for (const a of M.assets) {
        if (SECTOR_FUNDS[a.id] || OTHER_FUNDS[a.id] || a.id === "spy") funds.set(FUND_TICKERS[a.id] || a.ticker, a);
      }
      const spx = M.assets.find((a) => a.id === "spx");
      const totalCap = d3.sum(V.companies, (c) => c.mcap || 0);
      const indexSectors = d3.rollup(V.companies, (cs) => d3.sum(cs, (c) => c.mcap || 0) / totalCap, (c) => c.s);
      const sectorNames = [...indexSectors.keys()].sort((a, b) => indexSectors.get(b) - indexSectors.get(a));

      const lookup = (raw) => {
        const t = raw.trim().toUpperCase().replace(/\s.*$/, "");
        const alias = t.replace("-", ".");
        if (companies.has(alias)) return { t: alias, kind: "stock", c: companies.get(alias) };
        if (funds.has(t)) return { t, kind: "fund", a: funds.get(t) };
        return null;
      };

      // ---------- editor ----------
      const dl = document.getElementById("tickers");
      V.companies.forEach((c) => dl.append(new Option(c.n, c.t)));
      funds.forEach((a, t) => dl.append(new Option(a.name, t)));
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
          return { tr, raw: t.value, w: parseFloat(w.value.replace(",", ".")), hit: lookup(t.value) };
        }).filter((r) => r.raw.trim() || !Number.isNaN(r.w));
      }

      function refresh() {
        let total = 0;
        rowsEl.querySelectorAll("tr").forEach((tr) => {
          const [t, w] = tr.querySelectorAll("input");
          const hit = lookup(t.value);
          const name = tr.querySelector(".name");
          name.textContent = !t.value.trim() ? "" : hit ? (hit.c ? hit.c.n : hit.a.name) : "Not covered";
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

      let saved = [];
      try { saved = JSON.parse(store.get(SAVE_KEY) || "[]"); } catch (e) { saved = []; }
      setRows(Array.isArray(saved) && saved.length ? saved : EXAMPLE);
      // run once the helpers below are defined
      setTimeout(run);

      // ---------- evaluation ----------
      function seriesOf(h) {
        if (h.kind === "stock") {
          const s = S.prices[h.t];
          if (!s) return new Map();
          const start = MH.parseMonth(s.from);
          return new Map(s.v.map((v, i) => [d3.timeFormat("%Y-%m")(d3.timeMonth.offset(start, i)), v]).filter((d) => d[1] != null));
        }
        return new Map(h.a.monthly);
      }

      let windowKey = "5y";
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
        merged.forEach((h) => { h.w /= sum; h.series = seriesOf(h); });
        merged.sort((a, b) => b.w - a.w);
        const msgs = [];
        if (bad.length) msgs.push(`Left out (not covered): ${bad.join(", ")}.`);
        if (Math.abs(sum - 100) > 0.05) msgs.push(`Weights added up to ${num(sum, 1)}% and were scaled to 100%.`);
        note.textContent = msgs.join(" ");
        evaluate(merged, Math.abs(sum - 100) > 0.05 ? sum : null);
        document.getElementById("results").hidden = false;
      }

      function evaluate(H, scaledFrom) {
        // ---- concentration and sectors ----
        const effN = 1 / d3.sum(H, (h) => h.w * h.w);
        const sectorW = new Map();
        const addTo = (k, w) => sectorW.set(k, (sectorW.get(k) || 0) + w);
        for (const h of H) {
          if (h.kind === "stock") addTo(h.c.s, h.w);
          else if (h.a.id === "spy") indexSectors.forEach((w, s) => addTo(s, h.w * w));
          else addTo(SECTOR_FUNDS[h.a.id] || OTHER_FUNDS[h.a.id], h.w);
        }

        // ---- valuation (stocks only) ----
        const stocks = H.filter((h) => h.kind === "stock");
        const stockW = d3.sum(stocks, (h) => h.w);
        const harmonic = (key) => {
          const ok = stocks.filter((h) => h.c[key].now > 0);
          const w = d3.sum(ok, (h) => h.w);
          return ok.length ? { value: w / d3.sum(ok, (h) => h.w / h.c[key].now), cover: w } : null;
        };
        const indexMultiple = (key) => {
          const ok = V.companies.filter((c) => c[key].now > 0 && c.mcap);
          return d3.sum(ok, (c) => c.mcap) / d3.sum(ok, (c) => c.mcap / c[key].now);
        };
        const pe = harmonic("pe"), ev = harmonic("ev");
        const idxPe = indexMultiple("pe"), idxEv = indexMultiple("ev");
        const sigW = { under: 0, fair: 0, over: 0, none: 0 };
        stocks.forEach((h) => { sigW[h.c.signal || "none"] += h.w; });

        // ---- history ----
        const months = commonMonths(H);
        const bench = new Map(spx.monthly);
        const port = [], idx = [];
        for (let i = 1; i < months.length; i++) {
          const m = months[i], p = months[i - 1];
          port.push([m, d3.sum(H, (h) => h.w * (h.series.get(m) / h.series.get(p) - 1))]);
          idx.push([m, bench.get(m) / bench.get(p) - 1]);
        }

        renderTiles(H, effN, pe, idxPe, port, idx, scaledFrom);
        renderHoldings(H);
        renderSectors(sectorW);
        renderValuation(pe, ev, idxPe, idxEv, sigW, stockW);
        renderHistory(H, port, idx, months);
        renderCorrelation(H, months);
        renderObservations(H, effN, sectorW, pe, idxPe, sigW, stockW, port, idx);
      }

      function commonMonths(H) {
        const all = [...H[0].series.keys()].filter((m) => H.every((h) => h.series.has(m)) && bench(m));
        // keep the unbroken run of months that ends today
        const out = [];
        for (let i = all.length - 1; i >= 0; i--) {
          if (out.length && monthsApart(all[i], out[0]) !== 1) break;
          out.unshift(all[i]);
        }
        return out;
      }
      const benchMap = new Map(spx.monthly);
      const bench = (m) => benchMap.has(m);
      const monthsApart = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

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

      function renderTiles(H, effN, pe, idxPe, port, idx, scaledFrom) {
        const n5 = Math.min(60, port.length);
        const p = stats(port.slice(-n5), idx.slice(-n5)), b = stats(idx.slice(-n5));
        const years = n5 / 12;
        const span = years >= 1 ? `${num(years, years % 1 ? 1 : 0)} years` : `${n5} months`;
        document.getElementById("summary-sub").textContent =
          `${H.length} holdings${scaledFrom ? `, weights scaled from ${num(scaledFrom, 1)}%` : ""}. Past figures cover the last ${span}, with the mix rebalanced every month, against the S&P 500 price index.`;
        const top = H[0];
        document.getElementById("tiles").replaceChildren(
          tile("Holdings", String(H.length), `like ${num(effN, 1)} equal positions`),
          tile("Largest position", pct(top.w, 0), top.t),
          tile("Weighted P/E", X(pe && pe.value), `S&P 500: ${X(idxPe)}`),
          tile(`Annualized return, ${span}`, p ? spct(p.ret) : "–", b ? `S&P 500: ${spct(b.ret)}` : "", p ? signClass(p.ret) : ""),
          tile("Volatility", p ? pct(p.vol, 0) : "–", b ? `S&P 500: ${pct(b.vol, 0)}` : ""),
          tile("Worst fall", p ? pct(p.dd, 0) : "–", b ? `S&P 500: ${pct(b.dd, 0)}` : "", "neg"),
        );
      }

      function badge(sig) {
        const b = document.createElement("span");
        b.className = `badge ${sig}`;
        b.textContent = SIGNALS[sig];
        return b;
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
          name.append(a, Object.assign(document.createElement("small"), { textContent: h.kind === "stock" ? h.c.n : h.a.name }));
          const ms = [...h.series.values()];
          const last = ms[ms.length - 1];
          const r1 = ms.length > 12 ? last / ms[ms.length - 13] - 1 : null;
          const r5 = ms.length > 60 ? (last / ms[ms.length - 61]) ** (1 / 5) - 1 : null;
          const rets = ms.slice(-61).map((v, i, a) => (i ? v / a[i - 1] - 1 : null)).slice(1);
          const vol = rets.length > 12 ? d3.deviation(rets) * Math.sqrt(12) : null;
          const sector = td(h.kind === "stock" ? h.c.s : h.a.id === "spy" ? "All sectors" : SECTOR_FUNDS[h.a.id] || OTHER_FUNDS[h.a.id]);
          sector.style.textAlign = "left";
          const sig = document.createElement("td");
          sig.style.textAlign = "left";
          if (h.kind === "stock") sig.append(badge(h.c.signal || "none"));
          else sig.textContent = "–";
          tr.append(name, td(pct(h.w, 1)), sector,
            td(h.kind === "stock" ? (h.c.pe.now == null ? "n/m" : X(h.c.pe.now)) : "–"),
            td(h.kind === "stock" ? (h.c.ev.na ? "n/a" : h.c.ev.now == null ? "n/m" : X(h.c.ev.now)) : "–"),
            sig, td(spct(r1), signClass(r1)), td(spct(r5), signClass(r5)), td(vol == null ? "–" : pct(vol, 0)));
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

      function renderValuation(pe, ev, idxPe, idxEv, sigW, stockW) {
        document.getElementById("val-sub").textContent = stockW < 1
          ? `Computed on the ${pct(stockW, 0)} of the portfolio in individual stocks; funds and other assets are left out. Multiples are weighted harmonically, as if the portfolio were one company owning its share of each business.`
          : "Multiples are weighted harmonically, as if the portfolio were one company owning its share of each business. Companies with negative earnings are left out of that multiple.";
        const m = document.getElementById("val-multiples");
        m.replaceChildren();
        const h = document.createElement("h3");
        h.textContent = "Multiples against the S&P 500";
        m.append(h);
        const tbl = document.createElement("table");
        tbl.className = "data";
        tbl.innerHTML = "<thead><tr><th></th><th>Portfolio</th><th>S&amp;P 500</th><th>Difference</th></tr></thead>";
        const tb = document.createElement("tbody");
        for (const [name, p, i] of [["P/E", pe, idxPe], ["EV/EBITDA", ev, idxEv]]) {
          const tr = document.createElement("tr");
          const d = p ? p.value / i - 1 : null;
          tr.innerHTML = "<td></td><td></td><td></td><td></td>";
          const c = tr.children;
          c[0].textContent = name + (p && p.cover < stockW - 0.001 ? ` (on ${pct(p.cover / stockW, 0)} of stocks)` : "");
          c[1].textContent = X(p && p.value);
          c[2].textContent = X(i);
          c[3].textContent = d == null ? "–" : spct(d, 0);
          tb.append(tr);
        }
        tbl.append(tb);
        m.append(tbl);
        const note = document.createElement("p");
        note.className = "note";
        note.textContent = "The S&P 500 figure weights every company by market value. A higher multiple means paying more for each dollar of current earnings; it says nothing on its own about future growth.";
        m.append(note);

        const s = document.getElementById("val-signals");
        s.replaceChildren();
        const h2 = document.createElement("h3");
        h2.textContent = "Weight by valuation signal";
        s.append(h2);
        const keys = ["under", "fair", "over", "none"];
        const colors = { under: "var(--pos-3)", fair: "var(--line-2)", over: "var(--neg-3)", none: "var(--line)" };
        const split = document.createElement("div");
        split.className = "split";
        keys.filter((k) => sigW[k] > 0).forEach((k) => {
          const sp = document.createElement("span");
          sp.style.background = colors[k];
          sp.style.flex = `${sigW[k]} 0 0`;
          sp.title = `${SIGNALS[k]}: ${pct(sigW[k], 0)}`;
          split.append(sp);
        });
        s.append(split);
        const lg = document.createElement("div");
        lg.className = "legend";
        lg.innerHTML = keys.map((k) => `<span class="key"><span class="sw" style="background:${colors[k]}"></span>${SIGNALS[k]} ${pct(sigW[k], 0)}</span>`).join("");
        s.append(lg);
        const n2 = document.createElement("p");
        n2.className = "note";
        n2.innerHTML = 'Share of the whole portfolio in stocks with each signal from the <a href="../valuation/">valuation page</a>, which compares each company with its own history and its sector.';
        s.append(n2);
      }

      function renderHistory(H, port, idx, months) {
        const avail = port.length;
        const opts = [["1y", "1 year", 12], ["3y", "3 years", 36], ["5y", "5 years", 60], ["10y", "10 years", 120]].filter((o) => o[2] <= avail);
        if (!opts.length || opts[opts.length - 1][2] < avail) opts.push(["max", `All (${num(avail / 12, 1)} years)`, avail]);
        if (!opts.some((o) => o[0] === windowKey)) windowKey = opts[opts.length - 1][0];
        const youngest = H.reduce((a, h) => ([...h.series.keys()][0] > [...a.series.keys()][0] ? h : a));
        document.getElementById("hist-sub").textContent =
          `A portfolio holding these weights, rebalanced at the end of every month, against the S&P 500 price index. History is available since ${MH.fmtMonth(MH.parseMonth(months[0]))}${H.length > 1 ? `, when ${youngest.t} starts` : ""}. Stock dividends, costs and taxes are not included.`;
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
            label: "Growth of 100: portfolio against the S&P 500",
            series: [
              { id: "spx", name: "S&P 500", short: "S&P 500", color: "var(--muted)", values: grow(b) },
              { id: "port", name: "Portfolio", short: "Portfolio", color: "var(--s1)", values: grow(p) },
            ],
            log: n > 60, baseline: 100,
            yFormat: (v) => num(v, 0),
            tipFormat: (v) => num(v, 1),
          });
          const sp = stats(p, b), sb = stats(b);
          const yp = yearly(p), yb = yearly(b);
          const best = (y) => { const e = [...y].sort((a, c) => c[1] - a[1]); return e.length ? `${spct(e[0][1], 0)} (${e[0][0]})` : "–"; };
          const worst = (y) => { const e = [...y].sort((a, c) => a[1] - c[1]); return e.length ? `${spct(e[0][1], 0)} (${e[0][0]})` : "–"; };
          const full = (y) => new Map([...y].filter(([yr]) => p.filter((d) => +d[0].slice(0, 4) === yr).length === 12));
          const tb = document.querySelector("#risk-table tbody");
          tb.innerHTML = "";
          for (const [name, s, y] of [["Portfolio", sp, full(yp)], ["S&P 500", sb, full(yb)]]) {
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
          for (const [name, y] of [["Portfolio", yp], ["S&P 500", yb]]) {
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

      function renderObservations(H, effN, sectorW, pe, idxPe, sigW, stockW, port, idx) {
        const out = [];
        const top = H[0];
        if (top.w >= 0.2) out.push(`${top.t} is ${pct(top.w, 0)} of the portfolio: a 30% fall in ${top.t} alone would take about ${pct(top.w * 0.3, 0)} off the total.`);
        out.push(`The weights are as concentrated as ${num(effN, 1)} equally weighted positions.`);
        const big = [...sectorW].map(([s, w]) => [s, w, indexSectors.get(s) || 0]).filter(([, w, i]) => w - i >= 0.1).sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]));
        big.forEach(([s, w, i]) => out.push(`${s} is ${pct(w, 0)} of the portfolio, against ${pct(i, 0)} of the S&P 500.`));
        const missing = sectorNames.filter((s) => !(sectorW.get(s) > 0.005));
        if (missing.length) out.push(`No exposure to ${missing.length} of the 11 sectors: ${missing.join(", ")}.`);
        if (pe && idxPe) {
          const d = pe.value / idxPe - 1;
          if (Math.abs(d) >= 0.1) out.push(`The stocks' weighted P/E of ${X(pe.value)} is ${pct(Math.abs(d), 0)} ${d > 0 ? "above" : "below"} the S&P 500's ${X(idxPe)}: the market is paying ${d > 0 ? "more" : "less"} for each dollar of their current earnings.`);
        }
        if (stockW > 0) {
          if (sigW.over >= 0.4) out.push(`${pct(sigW.over, 0)} of the portfolio is in stocks flagged as overvalued against their own history and sector.`);
          if (sigW.under >= 0.4) out.push(`${pct(sigW.under, 0)} of the portfolio is in stocks flagged as undervalued against their own history and sector.`);
        }
        const n = Math.min(60, port.length);
        const s = stats(port.slice(-n), idx.slice(-n)), b = stats(idx.slice(-n));
        if (s) {
          if (s.beta >= 1.2) out.push(`With a beta of ${num(s.beta, 2)}, the portfolio has moved on average ${num(s.beta, 1)} times as much as the S&P 500 in the same month.`);
          else if (s.beta <= 0.8) out.push(`With a beta of ${num(s.beta, 2)}, the portfolio has moved less than the S&P 500, on average ${num(s.beta, 1)} times its monthly move.`);
          if (s.dd < b.dd - 0.1) out.push(`Its worst fall over the period, ${pct(s.dd, 0)}, was deeper than the S&P 500's ${pct(b.dd, 0)}.`);
          if (s.vol > b.vol * 1.5) out.push(`Its volatility of ${pct(s.vol, 0)} a year is more than one and a half times the S&P 500's ${pct(b.vol, 0)}.`);
        }
        const ul = document.getElementById("obs");
        ul.replaceChildren(...out.map((t) => Object.assign(document.createElement("li"), { textContent: t })));
      }
    }).catch(MH.fail);
  }
})();
