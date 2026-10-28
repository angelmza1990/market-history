// Valuation: company lookup with P/E and EV/EBITDA over time, the alerts table and sector medians.
(function () {
  const { num } = MH;
  MH.shell("valuation");

  const QUICK = ["GOOGL", "AAPL", "META", "NVDA", "TSLA"];
  const SIGNALS = { under: "Undervalued", fair: "Fairly valued", over: "Overvalued", none: "Not rated" };
  const METRICS = { pe: "P/E", ev: "EV/EBITDA" };
  const X = (v) => (v == null ? "–" : `${num(v, v >= 100 ? 0 : 1)}×`);
  const ord = (p) => {
    const n = Math.min(99, Math.max(1, Math.round(p * 100)));
    const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
    return `${n}${s}`;
  };
  const sigKey = (c) => c.signal || "none";

  MH.load("valuation").then((V) => {
    const R = V.rules;
    const byTicker = new Map(V.companies.map((c) => [c.t, c]));
    const sectorOf = new Map(V.sectors.map((s) => [s.name, s]));
    const market = sectorOf.get("S&P 500");
    const sectorNames = V.sectors.map((s) => s.name).filter((n) => n !== "S&P 500");
    document.getElementById("updated").textContent =
      `Prices through ${MH.fmtDay(MH.parseDay(V.updated))}. Earnings and balance sheets are refreshed after each quarterly report.`;

    const months = (s) => {
      const start = MH.parseMonth(s.from);
      return s.v.map((v, i) => [d3.timeMonth.offset(start, i), v]);
    };

    // ---------- market tiles ----------
    const counts = market.signals;
    const tiles = [
      { label: "Median P/E, S&P 500 companies", value: X(market.pe.now), delta: `${ord(market.pe.pct)} percentile of 10 years · median ${X(market.pe.med)}` },
      { label: "Median EV/EBITDA", value: X(market.ev.now), delta: `${ord(market.ev.pct)} percentile since 2022 · median ${X(market.ev.med)}` },
      { label: "Undervalued", value: String(counts.under), delta: `of ${market.count} companies`, cls: "pos" },
      { label: "Overvalued", value: String(counts.over), delta: `${counts.fair} fairly valued, ${counts.none} not rated`, cls: "neg" },
    ];
    document.getElementById("market-tiles").replaceChildren(...tiles.map(tile));

    function tile(t) {
      const d = document.createElement("div");
      d.className = "tile";
      const l = document.createElement("p");
      l.className = "label";
      l.textContent = t.label;
      const v = document.createElement("div");
      v.className = `value${t.cls ? ` ${t.cls}` : ""}`;
      v.textContent = t.value;
      const s = document.createElement("div");
      s.className = "delta";
      const sp = document.createElement("span");
      sp.textContent = t.delta || "";
      s.append(sp);
      d.append(l, v, s);
      return d;
    }

    function badge(c) {
      const b = document.createElement("span");
      b.className = `badge ${sigKey(c)}`;
      b.textContent = SIGNALS[sigKey(c)];
      return b;
    }

    // ---------- company lookup ----------
    const list = document.getElementById("company-list");
    V.companies.forEach((c) => list.append(new Option(`${c.t} · ${c.n}`, c.t)));
    const search = document.getElementById("search");
    const findTicker = (q) => {
      q = q.trim();
      if (!q) return null;
      const t = q.split(" · ")[0].toUpperCase();
      if (byTicker.has(t)) return t;
      const lower = q.toLowerCase();
      const hit = V.companies.find((c) => c.n.toLowerCase().startsWith(lower)) || V.companies.find((c) => c.n.toLowerCase().includes(lower));
      return hit ? hit.t : null;
    };
    search.addEventListener("change", () => {
      const t = findTicker(search.value);
      if (t) show(t);
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const t = findTicker(search.value);
        if (t) show(t);
      }
    });
    const quick = document.getElementById("quick");
    QUICK.filter((t) => byTicker.has(t)).forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = t;
      b.dataset.t = t;
      b.addEventListener("click", () => show(t));
      quick.append(b);
    });

    let current = null;
    function show(t, scroll) {
      const c = byTicker.get(t);
      if (!c) return;
      current = t;
      search.value = "";
      search.placeholder = `${c.t} · ${c.n}`;
      quick.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
      try { history.replaceState(null, "", `#${t}`); } catch (e) { /* file:// */ }

      const head = document.getElementById("co-head");
      const h = document.createElement("h3");
      h.textContent = `${c.n} (${c.t})`;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${c.s} · ${c.i}`;
      head.replaceChildren(h, badge(c), meta);

      const sec = sectorOf.get(c.s);
      const mt = (k) => {
        const m = c[k];
        if (m.na) return { label: METRICS[k], value: "n/a", delta: "not used for financial companies" };
        if (m.now == null) return { label: METRICS[k], value: "n/m", delta: k === "pe" ? "no positive earnings over the last four quarters" : "no positive EBITDA or no data" };
        const bits = [];
        if (m.pct != null) bits.push(`${ord(m.pct)} percentile of its history`);
        if (m.sector != null) bits.push(`${num(m.sector, 2)}× the sector median (${X(sec[k].now)})`);
        return { label: METRICS[k], value: X(m.now), delta: bits.join(" · ") };
      };
      document.getElementById("co-tiles").replaceChildren(...[
        { label: "Price", value: `$${num(c.price, 2)}`, delta: `close of ${MH.fmtDay(MH.parseDay(c.date))}` },
        { label: "Market value", value: c.mcap ? (c.mcap >= 1000 ? `$${num(c.mcap / 1000, 2)} trillion` : `$${num(c.mcap, c.mcap >= 100 ? 0 : 1)} billion`) : "–", delta: c.eps != null ? `EPS, last four quarters: $${num(c.eps, 2)}` : "" },
        mt("pe"), mt("ev"),
      ].map(tile));

      chart("pe", c, sec);
      chart("ev", c, sec);
      legend();
      why(c, sec);
      highlightRow();
      if (scroll) document.getElementById("company").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function chart(k, c, sec) {
      const el = document.getElementById(`${k}-chart`);
      const note = document.getElementById(`${k}-note`);
      const s = c.series[k];
      if (!s || c[k].na) {
        const msg = Object.assign(document.createElement("p"), {
          className: "empty-chart",
          textContent: c[k].na ? "EV/EBITDA is not used for financial companies." : "Not enough data.",
        });
        MH.responsive(el, () => el.replaceChildren(msg));
        note.textContent = "";
        return;
      }
      const own = months(s);
      const last = own[own.length - 1][0];
      const from = k === "pe" ? d3.timeMonth.offset(last, -(R.historyMonths - 1)) : own[0][0];
      const inRange = (d) => d[0] >= from;
      const values = own.filter(inRange);
      const sectorVals = sec.series[k] ? months(sec.series[k]).filter(inRange) : [];
      const all = values.concat(sectorVals).map((d) => d[1]).filter((v) => v != null);
      const lo = d3.min(all), hi = d3.max(all);
      const m = c[k];
      note.textContent = k === "pe" ? "last 10 years" : `since ${MH.fmtMonth(own[0][0])}`;
      MH.lineChart(el, {
        height: 280,
        label: `${METRICS[k]} of ${c.n} and the ${c.s} median`,
        series: [
          { id: "sector", name: `${c.s} median`, color: "var(--muted)", width: 1.5, dash: "4 3", values: sectorVals },
          { id: "own", name: c.t, color: "var(--s1)", values },
        ],
        xDomain: [from, last],
        log: lo > 0 && hi / lo > 8,
        band: m.p20 != null ? { lo: m.p20, hi: m.p80, label: "usual range" } : null,
        yFormat: (v) => num(v, v >= 10 || Number.isInteger(v) ? 0 : 1),
        tipFormat: X,
        endLabels: false,
      });
    }

    function legend() {
      const el = document.getElementById("co-legend");
      el.className = "legend";
      el.innerHTML = '<span class="key"><span class="ln" style="background:var(--s1)"></span>Company</span>'
        + '<span class="key"><span class="ln" style="background:var(--muted)"></span>Sector median (dashed)</span>'
        + '<span class="key"><span class="sw" style="background:var(--band)"></span>Usual range: 20th to 80th percentile of the last 10 years</span>';
    }

    function why(c, sec) {
      const ul = document.getElementById("why");
      ul.replaceChildren();
      const li = (parts) => {
        const l = document.createElement("li");
        parts.forEach((p) => {
          if (typeof p === "string") l.append(p);
          else {
            const b = document.createElement("span");
            b.className = `vote ${p.vote < 0 ? "pos" : p.vote > 0 ? "neg" : ""}`;
            b.textContent = p.text;
            l.append(b);
          }
        });
        ul.append(l);
      };
      const word = (v) => (v < 0 ? "cheap" : v > 0 ? "expensive" : "neutral");
      for (const k of ["pe", "ev"]) {
        const m = c[k], name = METRICS[k];
        if (m.na) { li([`${name}: not used for financial companies, whose debt is part of the business rather than its financing.`]); continue; }
        if (m.now == null) { li([`${name}: not meaningful, ${k === "pe" ? "earnings over the last four quarters were negative or are missing" : "EBITDA is negative or missing"}. No vote.`]); continue; }
        if (m.pct == null) li([`${name} of ${X(m.now)}: only ${m.months} months of history, too short to compare. No vote.`]);
        else {
          const share = m.pct <= 0.5 ? `lower than in ${Math.min(99, Math.round((1 - m.pct) * 100))}%` : `higher than in ${Math.min(99, Math.round(m.pct * 100))}%`;
          li([`${name} of ${X(m.now)} is ${share} of the last ${m.months} months (usual range ${X(m.p20)} to ${X(m.p80)}, median ${X(m.med)}): `,
            { vote: m.voteHistory, text: `${word(m.voteHistory)} against its history` }, "."]);
        }
        if (m.sector != null) {
          li([`${name} is ${num(m.sector, 2)}× the median of the ${sec.name} sector (${X(sec[k].now)}, ${sec[k].companies} companies): `,
            { vote: m.voteSector, text: `${word(m.voteSector)} against its sector` }, "."]);
        }
      }
      if (c.score == null) li(["No comparison could be made, so there is no signal."]);
      else {
        li([`Average of ${c.votes} votes: ${num(c.score, 2)} → `, { vote: c.signal === "under" ? -1 : c.signal === "over" ? 1 : 0, text: SIGNALS[sigKey(c)] }, "."]);
      }
      if (c.pe.pct != null && c.ev.pct != null && Math.abs(c.pe.pct - c.ev.pct) > 0.5) {
        li(["The two multiples disagree. One-off gains or losses often move net earnings, and so the P/E, without touching EBITDA."]);
      }
    }

    // ---------- alerts table ----------
    const sel = document.getElementById("sector");
    sel.append(new Option("All sectors", ""));
    sectorNames.forEach((n) => sel.append(new Option(n, n)));
    let signal = "all";
    const state = { key: "mcap", dir: -1 };
    const value = {
      t: (c) => c.t, s: (c) => c.s, mcap: (c) => c.mcap, score: (c) => c.score,
      pe: (c) => c.pe.now, pePct: (c) => c.pe.pct, peSec: (c) => c.pe.sector,
      ev: (c) => c.ev.now, evPct: (c) => c.ev.pct, evSec: (c) => c.ev.sector,
    };
    function signalFilter() {
      const pool = V.companies.filter((c) => !sel.value || c.s === sel.value);
      const n = (k) => pool.filter((c) => sigKey(c) === k).length;
      MH.seg(document.getElementById("signal-filter"), [
        ["all", `All (${pool.length})`], ["under", `Undervalued (${n("under")})`], ["over", `Overvalued (${n("over")})`],
        ["fair", `Fairly valued (${n("fair")})`], ["none", `Not rated (${n("none")})`],
      ], signal, (v) => { signal = v; renderTable(); });
    }
    sel.addEventListener("change", () => { signalFilter(); renderTable(); });

    function pbar(p) {
      const td = document.createElement("td");
      if (p == null) { td.textContent = "–"; td.className = "muted"; return td; }
      const w = document.createElement("span");
      w.className = "pbar";
      const b = document.createElement("b");
      b.textContent = ord(p);
      const tr = document.createElement("span");
      tr.className = "track";
      const i = document.createElement("i");
      i.style.left = `${p * 100}%`;
      tr.append(i);
      w.append(b, tr);
      td.append(w);
      return td;
    }
    function ratio(r) {
      const td = document.createElement("td");
      td.textContent = r == null ? "–" : `${num(r, 2)}×`;
      if (r != null) td.className = r <= R.cheapRatio ? "pos" : r >= R.dearRatio ? "neg" : "";
      return td;
    }

    function renderTable() {
      const rows = V.companies.filter((c) => (!sel.value || c.s === sel.value) && (signal === "all" || sigKey(c) === signal));
      const f = value[state.key];
      rows.sort((a, b) => {
        const x = f(a), y = f(b);
        if (x == null) return y == null ? 0 : 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * (state.dir < 0 ? -1 : 1) * (typeof x === "string" ? -1 : 1);
      });
      const tb = document.querySelector("#screen-table tbody");
      tb.replaceChildren(...rows.map((c) => {
        const tr = document.createElement("tr");
        tr.className = "pick";
        tr.dataset.t = c.t;
        const name = document.createElement("td");
        name.className = "name-cell";
        name.append(c.t, Object.assign(document.createElement("small"), { textContent: c.n }));
        const td = (text, cls) => Object.assign(document.createElement("td"), { textContent: text, className: cls || "" });
        const sig = document.createElement("td");
        sig.append(badge(c));
        sig.style.textAlign = "left";
        const sector = td(c.s, "hide-sm");
        sector.style.textAlign = "left";
        tr.append(name, sig, sector, td(c.mcap ? `$${num(c.mcap, 0)}B` : "–", "hide-sm"),
          td(c.pe.now == null ? "n/m" : X(c.pe.now)), pbar(c.pe.pct), ratio(c.pe.sector),
          td(c.ev.na ? "n/a" : c.ev.now == null ? "n/m" : X(c.ev.now)), pbar(c.ev.pct), ratio(c.ev.sector));
        tr.addEventListener("click", () => show(c.t, true));
        return tr;
      }));
      document.getElementById("screen-count").textContent = `${rows.length} ${rows.length === 1 ? "company" : "companies"}`;
      MH.sortable(document.getElementById("screen-table"), state, renderTable);
      highlightRow();
    }
    function highlightRow() {
      document.querySelectorAll("#screen-table tbody tr").forEach((tr) => tr.classList.toggle("current", tr.dataset.t === current));
    }

    // ---------- sectors ----------
    const stb = document.querySelector("#sector-table tbody");
    V.sectors.forEach((s) => {
      const tr = document.createElement("tr");
      const td = (text, cls) => Object.assign(document.createElement("td"), { textContent: text, className: cls || "" });
      const name = document.createElement("td");
      if (s.name === "S&P 500") name.innerHTML = "<strong>All S&amp;P 500</strong>";
      else {
        const a = document.createElement("a");
        a.href = "#screen";
        a.textContent = s.name;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          sel.value = s.name;
          signalFilter();
          renderTable();
          document.getElementById("screen").scrollIntoView({ behavior: "smooth" });
        });
        name.append(a);
      }
      tr.append(name, td(String(s.count)), td(X(s.pe.now)), td(X(s.pe.med)), pbar(s.pe.pct),
        td(s.ev.now == null ? "n/a" : X(s.ev.now)), td(X(s.ev.med)), pbar(s.ev.pct),
        td(String(s.signals.under), "pos"), td(String(s.signals.over), "neg"));
      stb.append(tr);
    });

    const pick = document.getElementById("sector-chart-pick");
    sectorNames.forEach((n) => pick.append(new Option(n, n)));
    pick.value = "Information Technology";
    function sectorChart() {
      const s = sectorOf.get(pick.value);
      const own = months(s.series.pe), all = months(market.series.pe);
      const last = own[own.length - 1][0];
      const from = d3.timeMonth.offset(last, -(R.historyMonths - 1));
      MH.lineChart(document.getElementById("sector-chart"), {
        height: 300,
        label: `Median P/E of ${s.name} companies and of all S&P 500 companies`,
        series: [
          { id: "all", name: "All S&P 500 companies", color: "var(--muted)", width: 1.5, dash: "4 3", values: all.filter((d) => d[0] >= from) },
          { id: "sector", name: s.name, color: "var(--s1)", values: own.filter((d) => d[0] >= from) },
        ],
        xDomain: [from, last],
        band: s.pe.p20 != null ? { lo: s.pe.p20, hi: s.pe.p80, label: "usual range" } : null,
        yFormat: (v) => num(v, 0),
        tipFormat: X,
        endLabels: false,
      });
      const lg = document.getElementById("sector-legend");
      lg.className = "legend";
      lg.innerHTML = '<span class="key"><span class="ln" style="background:var(--s1)"></span>Sector median</span>'
        + '<span class="key"><span class="ln" style="background:var(--muted)"></span>All S&amp;P 500 companies (dashed)</span>'
        + '<span class="key"><span class="sw" style="background:var(--band)"></span>Sector\'s usual range</span>';
    }
    pick.addEventListener("change", sectorChart);
    sectorChart();

    // ---------- rules ----------
    document.getElementById("rules").innerHTML = `
      <p><strong>P/E</strong> is the price divided by earnings per share of the last four reported quarters. A quarter counts from the day it was reported, so the history only uses figures that were public at the time. The earnings are those Yahoo Finance compares with analysts' estimates, which for many companies leave out one-off items.</p>
      <p><strong>EV/EBITDA</strong> is enterprise value (market value plus debt minus cash and short-term investments) divided by EBITDA of the last twelve months, normalized for unusual items when available. It compares companies with different amounts of debt. Yahoo Finance only publishes about four years of these statements, so its history starts in 2022. It is not used for banks, insurers and other financial companies.</p>
      <p><strong>The signal</strong> comes from up to four votes. Against its own history, a multiple in the company's cheapest ${Math.round(R.lowPct * 100)}% of months votes cheap and one in its most expensive ${Math.round((1 - R.highPct) * 100)}% votes expensive. Against its sector, a multiple below ${num(R.cheapRatio, 2)}× the sector median votes cheap and one above ${num(R.dearRatio, 2)}× votes expensive. The average of the votes, from −1 to +1, is the score: ${num(R.under, 1)} or less is undervalued, +${num(R.over, 1)} or more is overvalued, anything between is fairly valued. Negative earnings, or less than three years of P/E history, give no vote.</p>
      <p><strong>What it leaves out.</strong> A low multiple can be deserved: earnings may be about to fall, as in cyclical companies at the top of their cycle, and a high multiple can be justified by fast growth, which these ratios ignore. A company whose business has changed is compared with a past that no longer applies. Sector medians use today's members of the index. Use the signal as a starting point for research.</p>
      <p class="muted">For research and education. Nothing on this page is investment advice.</p>`;

    signalFilter();
    renderTable();
    const fromHash = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    show(byTicker.has(fromHash) ? fromHash : "NVDA");
    addEventListener("hashchange", () => {
      const t = decodeURIComponent(location.hash.slice(1)).toUpperCase();
      if (byTicker.has(t) && t !== current) show(t, true);
    });
  }).catch(MH.fail);
})();
