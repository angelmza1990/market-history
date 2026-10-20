// Economy: macro panels with recessions, S&P 500 returns by backdrop, decades and a yearly table.
(function () {
  const { pct, spct, num, signClass, parseMonth } = MH;
  MH.shell("macro");

  Promise.all([MH.load("markets"), MH.load("macro")]).then(([M, macro]) => {
    const byId = Object.fromEntries(M.assets.map((a) => [a.id, a]));
    const lastMacro = Object.values(macro.sources).map((s) => s.last).sort().at(-1);
    document.getElementById("updated").textContent =
      `Market data through ${MH.fmtDay(MH.parseDay(M.updated))}; economic series through ${MH.fmtMonth(MH.parseDay(lastMacro))}.`;
    const recessions = macro.recessions.map(([a, b]) => [parseMonth(a), b ? parseMonth(b) : new Date()]);

    panels(macro, byId, recessions);
    regimes(macro, byId.spx);
    decades(macro, byId);
    years(macro, byId);
  }).catch(MH.fail);

  const ser = (rows) => rows.map(([m, v]) => [parseMonth(m), v]);
  const lastOf = (rows) => rows.at(-1);

  function panels(macro, byId, recessions) {
    const mo = macro.monthly;
    const defs = [
      { title: "Inflation", sub: "Consumer prices, change over 12 months",
        series: [["cpi", "CPI, all items"], ["core", "Core CPI, excluding food and energy"]], fmt: (v) => pct(v, 0), tip: (v) => pct(v, 1), baseline: 0 },
      { title: "Interest rates", sub: "Federal funds rate and Treasury yields, monthly average",
        series: [["fedfunds", "Federal funds rate"], ["gs2", "2-year Treasury"], ["gs10", "10-year Treasury"]], fmt: (v) => pct(v, 0), tip: (v) => pct(v, 2), baseline: 0 },
      { title: "Yield curve", sub: "10-year minus 2-year Treasury yield; below zero the curve is inverted",
        series: [["spread", "10-year minus 2-year"]], fmt: (v) => pct(v, 1), tip: (v) => pct(v, 2), baseline: 0 },
      { title: "Unemployment", sub: "Unemployment rate",
        series: [["unrate", "Unemployment rate"]], fmt: (v) => pct(v, 0), tip: (v) => pct(v, 1) },
      { title: "Growth", sub: "Real GDP, quarterly change at an annual rate",
        series: [["gdp", "Real GDP growth"]], fmt: (v) => pct(v, 0), tip: (v) => pct(v, 1), baseline: 0,
        yDomain: [-0.1, 0.1], note: "Axis clipped at ±10%; the 2020 swings reached −28% and +35%." },
      { title: "Money supply", sub: "M2, change over 12 months",
        series: [["m2", "M2 growth"]], fmt: (v) => pct(v, 0), tip: (v) => pct(v, 1), baseline: 0 },
      { title: "Volatility", sub: "VIX, monthly average of daily closes",
        series: [["vix", "VIX"]], fmt: (v) => num(v, 0), tip: (v) => num(v, 1) },
      { title: "Stock market stress", sub: "S&P 500 distance below its all-time high",
        custom: [{ id: "spxdd", name: "S&P 500 drawdown", values: ser(byId.spx.drawdown) }], fmt: (v) => pct(v, 0), tip: (v) => pct(v, 1), baseline: 0, area: true },
    ];
    const wrap = document.getElementById("panels");
    const charts = defs.map((d) => {
      const card = document.createElement("div");
      card.className = "card";
      const h = document.createElement("h3");
      h.textContent = d.title;
      const meta = document.createElement("p");
      meta.className = "meta";
      const series = d.custom || d.series.map(([k, name], i) => ({ id: k, name, color: MH.seriesColor(i), values: ser(mo[k]) }));
      series.forEach((s, i) => { s.color = s.color || MH.seriesColor(i); s.short = s.name; });
      const latest = series.map((s) => {
        const l = lastOf(s.values);
        return `<b>${d.tip(l[1])}</b> ${series.length > 1 ? esc(s.name.split(",")[0]) : ""}`;
      }).join(" · ");
      meta.innerHTML = `${esc(d.sub)}. Latest: ${latest} <span class="muted">(${MH.fmtMonth(lastOf(series[0].values)[0])})</span>`;
      const chart = document.createElement("div");
      chart.className = "chart";
      card.append(h, meta, chart);
      if (series.length > 1) {
        const lg = document.createElement("div");
        lg.className = "legend";
        lg.innerHTML = series.map((s) => `<span class="key"><span class="ln" style="background:${s.color}"></span>${esc(s.name)}</span>`).join("");
        card.append(lg);
      }
      if (d.note) card.append(Object.assign(document.createElement("p"), { className: "note", textContent: d.note }));
      wrap.append(card);
      return { d, chart, series };
    });

    let since = 1970;
    const draw = () => {
      const x0 = new Date(since, 0, 1), x1 = new Date();
      for (const { d, chart, series } of charts) {
        const ss = series.map((s) => {
          const v = s.values.filter((p) => p[0] >= x0);
          return { ...s, values: d.yDomain ? v.map(([t, y]) => [t, Math.max(d.yDomain[0], Math.min(d.yDomain[1], y))]) : v };
        });
        // the tooltip should show the true value even where the axis clips
        const raw = new Map(series.flatMap((s) => s.values.map((p) => [`${s.id}|${+p[0]}`, p[1]])));
        MH.lineChart(chart, {
          series: ss, height: 230, endLabels: false, recessions, area: d.area, baseline: d.baseline,
          xDomain: [x0, x1], yDomain: d.yDomain, yFormat: d.fmt, tipFormat: d.tip, label: d.title,
          rawValue: (s, p) => raw.get(`${s.id}|${+p[0]}`),
        });
      }
    };
    MH.seg(document.getElementById("since"), [[1950, "1950"], [1970, "1970"], [1990, "1990"], [2005, "2005"], [2015, "2015"]], since, (v) => { since = v; draw(); });
    draw();
  }

  // ---------- regimes ----------
  function decSpread(macro) {
    return Object.fromEntries(macro.monthly.spread.filter(([m]) => m.endsWith("-12")).map(([m, v]) => [+m.slice(0, 4), v]));
  }

  function regimes(macro, spx) {
    const ann = Object.fromEntries(macro.annual.map((d) => [d.year, d]));
    const spread = decSpread(macro);
    const years = Object.entries(spx.annual).filter(([y]) => +y !== spx.ytdYear).map(([y, r]) => ({ y: +y, r, m: ann[+y] || {} }));
    const groups = [
      {
        title: "Recessions", desc: "Years with at least one month of NBER-dated recession, since 1928.",
        buckets: [["Recession year", (d) => d.m.recession], ["No recession", (d) => d.m.recession === false]],
      },
      {
        title: "Inflation", desc: "December-to-December CPI inflation, since 1948.",
        buckets: [
          ["Below 2%", (d) => d.m.cpi != null && d.m.cpi < 0.02],
          ["2% to 4%", (d) => d.m.cpi >= 0.02 && d.m.cpi < 0.04],
          ["4% to 6%", (d) => d.m.cpi >= 0.04 && d.m.cpi < 0.06],
          ["6% or more", (d) => d.m.cpi >= 0.06],
        ],
      },
      {
        title: "Fed policy", desc: "Change in the federal funds rate over the year, since 1955.",
        buckets: [
          ["Cut by 0.5 pts or more", (d) => d.m.fedfundsChange != null && d.m.fedfundsChange <= -0.005],
          ["Roughly unchanged", (d) => d.m.fedfundsChange != null && Math.abs(d.m.fedfundsChange) < 0.005],
          ["Raised by 0.5 pts or more", (d) => d.m.fedfundsChange >= 0.005],
        ],
      },
      {
        title: "Yield curve going in", desc: "10-year minus 2-year yield in the December before the year began, since 1977.",
        buckets: [
          ["Inverted (below 0)", (d) => spread[d.y - 1] != null && spread[d.y - 1] < 0],
          ["Flat (0 to 1 pt)", (d) => spread[d.y - 1] >= 0 && spread[d.y - 1] < 0.01],
          ["Steep (1 pt or more)", (d) => spread[d.y - 1] >= 0.01],
        ],
      },
    ];
    const wrap = document.getElementById("regimes");
    const allMax = 0.2;
    for (const g of groups) {
      const card = document.createElement("div");
      card.className = "card";
      const rows = g.buckets.map(([label, f]) => {
        const ys = years.filter(f);
        const rs = ys.map((d) => d.r);
        return { label, ys, n: ys.length, mean: d3.mean(rs), median: d3.median(rs), up: rs.filter((r) => r > 0).length };
      });
      card.innerHTML = `<h3>${g.title}</h3><p>${g.desc}</p>
        <table class="data"><thead><tr><th></th><th>Years</th><th>Average</th><th></th><th>Median</th><th>Up</th></tr></thead><tbody>
        ${rows.map((r) => `<tr title="${r.ys.map((d) => d.y).join(", ")}">
          <td>${r.label}</td><td>${r.n}</td>
          <td class="${signClass(r.mean)}">${spct(r.mean)}</td>
          <td style="width:70px;text-align:left">${r.mean == null ? "" : `<span class="bar-in" style="width:${Math.min(1, Math.abs(r.mean) / allMax) * 60}px;background:${r.mean >= 0 ? "var(--pos-3)" : "var(--neg-3)"}"></span>`}</td>
          <td class="${signClass(r.median)}">${spct(r.median)}</td>
          <td>${r.n ? pct(r.up / r.n, 0) : "–"}</td></tr>`).join("")}
        </tbody></table>`;
      wrap.append(card);
    }
  }

  // ---------- decades ----------
  function decades(macro, byId) {
    const ids = ["spx", "ixic", "dji", "nikkei", "tlt", "gold", "wti"];
    const cpi = Object.fromEntries(macro.annual.map((d) => [d.year, d.cpi]));
    const now = new Date().getFullYear();
    const rows = [];
    for (let d = 1930; d <= now; d += 10) {
      const span = d3.range(d, Math.min(d + 10, now));
      if (!span.length) continue;
      const cells = ids.map((id) => {
        const a = byId[id];
        const rs = span.map((y) => (y === a.ytdYear ? undefined : a.annual[y])).filter((r) => r != null);
        if (rs.length < 3) return null;
        return { g: rs.reduce((p, r) => p * (1 + r), 1) ** (1 / rs.length) - 1, n: rs.length, first: span.find((y) => a.annual[y] != null) };
      });
      const infl = span.map((y) => cpi[y]).filter((v) => v != null);
      rows.push({ d, span, cells, infl: infl.length ? infl.reduce((p, r) => p * (1 + r), 1) ** (1 / infl.length) - 1 : null });
    }
    const tbl = document.getElementById("decades");
    tbl.innerHTML = `<thead><tr><th>Decade</th>${ids.map((id) => `<th>${byId[id].short}</th>`).join("")}<th>US inflation</th><th>S&amp;P 500 after inflation</th></tr></thead><tbody>
      ${rows.map((r) => {
        const spx = r.cells[0];
        const real = spx && r.infl != null ? (1 + spx.g) / (1 + r.infl) - 1 : null;
        const label = r.d + 10 > now ? `${r.d}s <span class="muted">(${r.d}–${now - 1})</span>` : `${r.d}s`;
        return `<tr><td>${label}</td>${r.cells.map((c) => c == null ? "<td class=\"muted\">–</td>"
          : `<td class="${signClass(c.g)}">${spct(c.g)}${c.n < r.span.length ? ` <span class="muted" title="${c.n} years of data">from ${c.first}</span>` : ""}</td>`).join("")}
          <td>${pct(r.infl)}</td><td class="${signClass(real)}">${spct(real)}</td></tr>`;
      }).join("")}</tbody>`;
  }

  // ---------- year by year ----------
  function years(macro, byId) {
    const assets = ["spx", "ixic", "tlt", "gold", "wti", "btc"].map((id) => byId[id]);
    const ytdYear = byId.spx.ytdYear;
    const latest = (k) => macro.monthly[k].at(-1);
    const tbl = document.getElementById("years");
    const ann = macro.annual.slice().reverse().filter((d) => d.year >= 1928 && d.year <= (ytdYear || 9999));
    tbl.innerHTML = `<thead><tr><th>Year</th>${assets.map((a) => `<th>${a.short}</th>`).join("")}
      <th>Inflation</th><th>Fed funds</th><th>Change</th><th>10-yr yield</th><th>Unemployment</th><th>Real GDP</th><th>VIX avg.</th><th></th></tr></thead><tbody>
      ${ann.map((d) => {
        const cur = d.year === ytdYear;
        // the current year has no December reading yet: use the latest month
        const v = (k, mk) => (cur && d[k] == null && mk ? latest(mk)[1] : d[k]);
        const star = (k, mk) => (cur && d[k] == null && mk ? "<span class=\"muted\">*</span>" : "");
        return `<tr><td>${d.year}${cur ? ' <span class="ytd-mark">YTD</span>' : ""}</td>
          ${assets.map((a) => { const r = a.annual[d.year]; return `<td class="${signClass(r)}">${r == null ? "<span class=\"muted\">–</span>" : spct(r)}</td>`; }).join("")}
          <td>${pct(v("cpi", "cpi"))}${star("cpi", "cpi")}</td>
          <td>${pct(v("fedfunds", "fedfunds"), 2)}${star("fedfunds", "fedfunds")}</td>
          <td class="muted">${d.fedfundsChange == null ? (cur ? "" : "–") : `${d.fedfundsChange > 0 ? "+" : d.fedfundsChange < 0 ? "−" : ""}${Math.abs(d.fedfundsChange * 100).toFixed(2)}`}</td>
          <td>${pct(v("gs10", "gs10"), 2)}${star("gs10", "gs10")}</td>
          <td>${pct(v("unrate", "unrate"))}${star("unrate", "unrate")}</td>
          <td class="${signClass(d.gdp)}">${spct(d.gdp)}</td>
          <td>${d.vix == null ? "–" : num(d.vix, 1)}</td>
          <td>${d.recession ? '<span class="rec-tag">Recession</span>' : ""}</td></tr>`;
      }).join("")}</tbody>`;
    if (ytdYear) {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = `* ${ytdYear}: latest monthly reading (${MH.fmtMonth(parseMonth(latest("cpi")[0]))}) in place of December.`;
      tbl.closest(".card").after(p);
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
