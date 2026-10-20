// Overview: snapshot tiles, year-to-date ranking, summary table and the reading framework.
(function () {
  const { pct, spct, num, signClass } = MH;
  MH.shell("overview");

  Promise.all([MH.load("markets"), MH.load("macro")]).then(([M, macro]) => {
    const byId = Object.fromEntries(M.assets.map((a) => [a.id, a]));
    const year = new Date(M.updated).getFullYear();
    document.getElementById("updated").textContent = `Data through ${MH.fmtDay(MH.parseDay(M.updated))}.`;
    document.getElementById("ytd-title").textContent = `${year} year to date`;

    tiles(byId, macro);
    ytdChart(M.assets.filter((a) => a.group !== "sectors" && a.stats.ytd != null));
    table(M);
    framework(byId, macro);
  }).catch(MH.fail);

  function tiles(byId, macro) {
    const el = document.getElementById("tiles");
    const add = (label, value, delta, deltaLabel) => {
      const t = document.createElement("div");
      t.className = "tile";
      t.innerHTML = `<p class="label"></p><div class="value"></div><div class="delta"><b></b> <span></span></div>`;
      t.querySelector(".label").textContent = label;
      t.querySelector(".value").textContent = value;
      const b = t.querySelector(".delta b");
      b.textContent = delta;
      t.querySelector(".delta span").textContent = deltaLabel;
      el.append(t);
      return b;
    };
    for (const id of ["spx", "ndx", "dji", "gold", "wti", "btc", "eth"]) {
      const a = byId[id];
      const prefix = ["gold", "wti", "btc", "eth"].includes(id) ? "$" : "";
      add(a.short, prefix + num(a.last.value, a.last.value > 1000 ? 0 : 2), spct(a.stats.ytd), "YTD").className = signClass(a.stats.ytd);
    }
    const last = (k) => macro.monthly[k].at(-1);
    const g10 = last("gs10"), g10y = macro.monthly.gs10.find((d) => d[0] === `${+g10[0].slice(0, 4) - 1}-12`);
    const chg = g10y ? g10[1] - g10y[1] : null;
    add(`10-year Treasury, ${MH.fmtMonth(MH.parseMonth(g10[0]))}`, pct(g10[1], 2),
      chg == null ? "" : `${chg >= 0 ? "+" : "−"}${Math.abs(chg * 100).toFixed(2)} pts`, `since December (${MH.fmtMonth(MH.parseMonth(g10[0]))})`);
    const cpi = last("cpi");
    add(`US inflation (CPI), ${MH.fmtMonth(MH.parseMonth(cpi[0]))}`, pct(cpi[1], 1), "", "year over year");
  }

  function ytdChart(list) {
    const el = document.getElementById("ytd-chart");
    const data = list.slice().sort((a, b) => b.stats.ytd - a.stats.ytd);
    MH.responsive(el, (W) => {
      const row = 24, narrow = W < 560;
      const m = { top: 4, right: 56, bottom: 22, left: narrow ? 108 : 150 };
      const H = data.length * row + m.top + m.bottom;
      const iw = W - m.left - m.right;
      const ext = d3.extent(data, (a) => a.stats.ytd);
      const x = d3.scaleLinear().domain([Math.min(0, ext[0]), Math.max(0, ext[1])]).nice().range([0, iw]);
      const y = d3.scaleBand().domain(data.map((a) => a.id)).range([0, data.length * row]).paddingInner(0.3);
      const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Year-to-date return by asset");
      const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);
      const ticks = x.ticks(narrow ? 4 : 8);
      g.append("g").attr("class", "grid").selectAll("line").data(ticks).join("line")
        .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", data.length * row);
      g.append("g").attr("class", "axis").attr("transform", `translate(0,${data.length * row})`)
        .call(d3.axisBottom(x).tickValues(ticks).tickFormat((v) => pct(v, 0)).tickSize(0).tickPadding(8));
      const r = 3;
      g.append("g").selectAll("path").data(data).join("path")
        .attr("d", (a) => {
          const v = a.stats.ytd, x0 = x(0), x1 = x(v), y0 = y(a.id), h = y.bandwidth();
          const w = Math.abs(x1 - x0), rr = Math.min(r, w);
          return v >= 0
            ? `M${x0},${y0}H${x1 - rr}Q${x1},${y0} ${x1},${y0 + rr}V${y0 + h - rr}Q${x1},${y0 + h} ${x1 - rr},${y0 + h}H${x0}Z`
            : `M${x0},${y0}H${x1 + rr}Q${x1},${y0} ${x1},${y0 + rr}V${y0 + h - rr}Q${x1},${y0 + h} ${x1 + rr},${y0 + h}H${x0}Z`;
        })
        .attr("fill", (a) => (a.stats.ytd >= 0 ? "var(--pos-3)" : "var(--neg-3)"));
      g.append("line").attr("class", "baseline").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", data.length * row);
      g.append("g").selectAll("text").data(data).join("text")
        .attr("x", -10).attr("y", (a) => y(a.id) + y.bandwidth() / 2 + 4).attr("text-anchor", "end")
        .style("fill", "var(--ink-2)").style("font-size", "12px").text((a) => a.short);
      g.append("g").selectAll("text").data(data).join("text")
        .attr("x", (a) => (a.stats.ytd >= 0 ? x(a.stats.ytd) + 6 : x(0) + 6))
        .attr("y", (a) => y(a.id) + y.bandwidth() / 2 + 4)
        .style("fill", "var(--ink)").style("font-size", "12px").text((a) => spct(a.stats.ytd));
      g.append("g").selectAll("rect").data(data).join("rect")
        .attr("x", -m.left).attr("width", W).attr("y", (a) => y(a.id) - 4).attr("height", row).attr("fill", "transparent")
        .on("pointermove", (evt, a) => MH.showTip(evt, a.name, [
          { value: spct(a.stats.ytd), cls: signClass(a.stats.ytd), label: "year to date" },
          { value: spct(a.stats.r1y), cls: signClass(a.stats.r1y), label: "last 12 months" },
        ]))
        .on("pointerleave", MH.hideTip);
      el.replaceChildren(svg.node());
    });
  }

  function table(M) {
    const tbl = document.getElementById("summary");
    const tbody = tbl.querySelector("tbody");
    const state = { key: null, dir: -1 };
    const groupName = Object.fromEntries(M.groups.map((g) => [g.id, g.name]));
    const val = (a, k) => {
      if (k === "name") return a.short;
      if (k === "start") return a.start;
      if (k === "maxDrawdown") return a.stats.maxDrawdown.value;
      if (k === "upShare") return a.stats.years ? a.stats.up / a.stats.years : null;
      return a.stats[k];
    };
    const cell = (v, signed = true) => `<td class="${signed ? signClass(v) : ""}">${signed ? spct(v) : pct(v)}</td>`;
    const rowHtml = (a) => {
      const s = a.stats, dd = s.maxDrawdown;
      const ddTitle = dd.trough ? `${dd.peak.slice(0, 7)} to ${dd.trough.slice(0, 7)}${dd.recovered ? `, recovered ${dd.recovered.slice(0, 7)}` : ", not yet recovered"}` : "";
      return `<tr>
        <td class="name-cell">${esc(a.short)}<small>${a.name !== a.short ? esc(a.name) + " · " : ""}${a.basis === "total" ? "total return · " : ""}since ${a.start.slice(0, 4)}</small></td>
        <td>${num(a.last.value)}</td>
        ${cell(s.ytd)}${cell(s.r1y)}${cell(s.cagr3)}${cell(s.cagr5)}${cell(s.cagr10)}
        <td class="${s.fromHigh < -0.0005 ? "neg" : ""}">${s.fromHigh > -0.0005 ? "At high" : spct(s.fromHigh)}</td>
        <td class="neg" title="${ddTitle}">${spct(dd.value, 0)} <span class="muted">${dd.trough ? dd.trough.slice(0, 4) : ""}</span></td>
        <td>${s.years ? `${s.up} of ${s.years}` : "–"}</td>
      </tr>`;
    };
    const render = () => {
      MH.sortable(tbl, state, render);
      if (!state.key) {
        tbody.innerHTML = M.groups.map((g) => `<tr class="group-row"><td colspan="10">${esc(groupName[g.id])}</td></tr>` +
          M.assets.filter((a) => a.group === g.id).map(rowHtml).join("")).join("");
        return;
      }
      const list = M.assets.slice().sort((a, b) => {
        const va = val(a, state.key), vb = val(b, state.key);
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * state.dir;
      });
      tbody.innerHTML = list.map(rowHtml).join("");
    };
    render();
  }

  function framework(byId, macro) {
    const spx = byId.spx, s = spx.stats;
    const full = Object.entries(spx.annual).filter(([y]) => +y !== spx.ytdYear).map(([y, r]) => [+y, r]);
    const near = full.filter(([, r]) => Math.abs(r - s.mean) <= 0.05).length;
    const bad = full.filter(([, r]) => r <= -0.1).map(([y]) => y);
    const worst = full.slice().sort((a, b) => a[1] - b[1]).slice(0, 3);
    const yr = (id) => byId[id].stats.maxDrawdown;
    const m22 = macro.annual.find((d) => d.year === 2022);
    const r22 = (id) => byId[id].annual["2022"];
    const nik = yr("nikkei");

    const paras = [
      `<strong>Positive years are the norm, not a promise.</strong> Since ${full[0][0]}, the S&amp;P 500 rose in ${s.up} of ${s.years} calendar years, excluding dividends. The average year returned ${spct(s.mean)}, yet only ${near} years landed within five points of that average: returns arrive in large, uneven steps. The index fell 10% or more in ${bad.length} years, and the three worst were ${worst.map(([y, r]) => `${y} (${spct(r)})`).join(", ")}.`,
      `<strong>Drawdowns are the cost of equity returns.</strong> From its 1929 peak the S&amp;P 500 lost ${spct(yr("spx").value, 0)} and did not regain that level until ${yr("spx").recovered.slice(0, 4)}. The Nasdaq Composite fell ${spct(yr("ixic").value, 0)} after the dot-com bubble and took until ${yr("ixic").recovered.slice(0, 4)} to recover. Japan's Nikkei 225 peaked in ${nik.peak.slice(0, 4)} and ${nik.recovered ? `only reclaimed that high in ${nik.recovered.slice(0, 4)}` : "has not yet reclaimed that high"}. Time horizon matters as much as the asset.`,
      `<strong>Inflation and interest rates set the backdrop.</strong> Rising inflation usually means rising rates, and rates are the discount on every future cash flow. In 2022, with US inflation at ${pct(m22.cpi)} in December and the federal funds rate up ${(m22.fedfundsChange * 100).toFixed(1)} points over the year, the S&amp;P 500 fell ${spct(r22("spx"))} and long-dated Treasuries ${spct(r22("tlt"))}: stocks and bonds fell together, which a classic 60/40 portfolio is not built for.`,
      `<strong>Recessions and bear markets overlap, but not perfectly.</strong> Stocks tend to fall before a recession is declared and to recover before it ends. The economy page shades every NBER recession so the timing can be compared directly with returns, the yield curve and unemployment.`,
      `<strong>Leadership rotates.</strong> The leaders of one decade are rarely the leaders of the next. In the 2000s energy was the best-performing US sector while technology lost money; in the 2010s technology and consumer discretionary led and energy came last. The sectors page tracks that rotation year by year. Bitcoin and Ethereum add a different kind of risk, with drawdowns of ${spct(yr("btc").value, 0)} and ${spct(yr("eth").value, 0)} from their highs.`,
    ];
    document.getElementById("framework").innerHTML = paras.map((p) => `<p>${p}</p>`).join("");
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
