// Sectors: leadership quilt, performance table, excess returns, small multiples and correlations.
(function () {
  const { pct, spct, num, signClass, parseMonth } = MH;
  MH.shell("sectors");

  const ABBR = {
    spy: "S&P 500", xlk: "Tech", xlc: "Comm", xly: "Discr", xlf: "Fin", xlv: "Health", xli: "Indus",
    xlp: "Staples", xle: "Energy", xlb: "Mater", xlu: "Util", xlre: "RealEst",
  };
  const OTHERS = ["tlt", "gold", "wti", "btc"];

  MH.load("markets").then((M) => {
    const byId = Object.fromEntries(M.assets.map((a) => [a.id, a]));
    const sectors = M.assets.filter((a) => a.group === "sectors" && a.id !== "spy");
    const spy = byId.spy;
    document.getElementById("updated").textContent = `Data through ${MH.fmtDay(MH.parseDay(M.updated))}.`;

    const mret = {};
    for (const a of M.assets) {
      const m = new Map();
      for (let i = 1; i < a.monthly.length; i++) m.set(a.monthly[i][0], a.monthly[i][1] / a.monthly[i - 1][1] - 1);
      mret[a.id] = m;
    }

    quilt(sectors.concat(spy), spy);
    perf(sectors.concat(spy), mret);
    excess(sectors, spy);
    multiples(sectors, spy);
    correlations(sectors.concat([spy], OTHERS.map((id) => byId[id])), mret, M.updated);
  }).catch(MH.fail);

  // ---------- leadership quilt ----------
  function quilt(list, spy) {
    const tbl = document.getElementById("quilt");
    const years = Object.keys(spy.annual).map(Number).filter((y) => y >= 1999);
    const cols = years.map((y) => list.filter((a) => a.annual[y] != null).sort((a, b) => b.annual[y] - a.annual[y]));
    const n = d3.max(cols, (c) => c.length);
    const head = document.createElement("thead");
    const hr = document.createElement("tr");
    hr.append(Object.assign(document.createElement("th"), { className: "rank" }));
    for (const y of years) hr.append(Object.assign(document.createElement("th"), { textContent: y === spy.ytdYear ? `${y} YTD` : y }));
    head.append(hr);
    const body = document.createElement("tbody");
    const cells = {};
    for (let r = 0; r < n; r++) {
      const tr = document.createElement("tr");
      tr.append(Object.assign(document.createElement("th"), { className: "rank", textContent: r === 0 ? "Best" : r === n - 1 ? "Worst" : "" }));
      cols.forEach((col, i) => {
        const td = document.createElement("td");
        const a = col[r];
        if (a) {
          const v = a.annual[years[i]];
          td.className = `${MH.retClass(v)}${a.id === "spy" ? " bench" : ""}`;
          const b = document.createElement("b");
          b.textContent = ABBR[a.id];
          td.append(b, document.createTextNode(spct(v, 0)));
          td.dataset.id = a.id;
          (cells[a.id] = cells[a.id] || []).push(td);
          td.addEventListener("pointerenter", () => focus(a.id));
          td.addEventListener("pointermove", (evt) => MH.showTip(evt, `${a.name}, ${years[i]}`, [
            { value: spct(v), cls: signClass(v), label: `rank ${r + 1} of ${col.length}` },
          ]));
          td.addEventListener("pointerleave", () => { MH.hideTip(); focus(sel.value || null); });
        } else td.className = "empty";
        tr.append(td);
      });
      body.append(tr);
    }
    tbl.replaceChildren(head, body);
    MH.retLegend(document.getElementById("quilt-legend"));
    const sc = document.getElementById("quilt-scroll");
    sc.scrollLeft = sc.scrollWidth;

    const sel = document.getElementById("follow");
    sel.append(new Option("None", ""));
    for (const a of list) sel.append(new Option(a.name, a.id));
    sel.addEventListener("change", () => focus(sel.value || null));
    function focus(id) {
      tbl.classList.toggle("focus", !!id);
      tbl.querySelectorAll("td.on").forEach((td) => td.classList.remove("on"));
      if (id) (cells[id] || []).forEach((td) => td.classList.add("on"));
    }
  }

  // ---------- performance table ----------
  function stats(a, mret, months = 120) {
    const b = mret.spy;
    const keys = [...mret[a.id].keys()].filter((k) => b.has(k)).slice(-months);
    const xs = keys.map((k) => b.get(k)), ys = keys.map((k) => mret[a.id].get(k));
    const mx = d3.mean(xs), my = d3.mean(ys);
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
    return { beta: cov / vx, corr: cov / Math.sqrt(vx * vy) };
  }

  function perf(list, mret) {
    const tbl = document.getElementById("perf");
    const rows = list.map((a) => ({ a, ...a.stats, short: a.name, vol: a.stats.vol10y, dd: a.stats.maxDrawdown.value, ...stats(a, mret) }));
    const state = { key: "cagr10", dir: -1 };
    const render = () => {
      MH.sortable(tbl, state, render);
      const sorted = rows.slice().sort((x, y) => {
        const a = x[state.key], b = y[state.key];
        if (a == null) return 1;
        if (b == null) return -1;
        return (a < b ? -1 : a > b ? 1 : 0) * state.dir;
      });
      const c = (v) => `<td class="${signClass(v)}">${spct(v)}</td>`;
      tbl.querySelector("tbody").innerHTML = sorted.map((r) => `<tr${r.a.id === "spy" ? ' style="font-weight:600"' : ""}>
        <td class="name-cell">${r.a.name}<small>${r.a.ticker} · since ${r.a.start.slice(0, 4)}</small></td>
        ${c(r.ytd)}${c(r.r1y)}${c(r.cagr3)}${c(r.cagr5)}${c(r.cagr10)}${c(r.cagrAll)}
        <td>${pct(r.vol)}</td><td>${num(r.beta, 2)}</td><td>${num(r.corr, 2)}</td><td class="neg">${spct(r.dd, 0)}</td>
      </tr>`).join("");
    };
    render();
  }

  // ---------- excess returns ----------
  function exClass(d) {
    if (d == null) return "empty";
    if (d <= -0.1) return "r-n3";
    if (d <= -0.03) return "r-n2";
    if (d < 0) return "r-n1";
    if (d < 0.03) return "r-p1";
    if (d < 0.1) return "r-p2";
    return "r-p3";
  }
  function excess(sectors, spy) {
    const tbl = document.getElementById("excess");
    const years = Object.keys(spy.annual).map(Number).filter((y) => y >= 1999).sort((a, b) => b - a);
    const pts = (d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d * 100).toFixed(1)}`;
    let html = `<thead><tr><th>Year</th>${sectors.map((a) => `<th title="${a.name}">${a.short}</th>`).join("")}<th>S&amp;P 500</th></tr></thead><tbody>`;
    for (const y of years) {
      const b = spy.annual[y];
      html += `<tr><th>${y}${y === spy.ytdYear ? ' <span class="ytd-mark">YTD</span>' : ""}</th>`;
      for (const a of sectors) {
        const r = a.annual[y];
        const d = r == null ? null : r - b;
        html += `<td class="${exClass(d)}" data-id="${a.id}" data-y="${y}">${d == null ? "" : pts(d)}</td>`;
      }
      html += `<td class="muted">${spct(b, 1)}</td></tr>`;
    }
    html += `</tbody><tfoot><tr><th>Years ahead</th>${sectors.map((a) => {
      const ys = years.filter((y) => a.annual[y] != null && y !== spy.ytdYear);
      return `<td>${ys.filter((y) => a.annual[y] > spy.annual[y]).length} / ${ys.length}</td>`;
    }).join("")}<td></td></tr></tfoot>`;
    tbl.innerHTML = html;
    const byId = Object.fromEntries(sectors.map((a) => [a.id, a]));
    tbl.querySelectorAll("td[data-id]").forEach((td) => {
      const a = byId[td.dataset.id], y = +td.dataset.y;
      if (a.annual[y] == null) return;
      td.addEventListener("pointermove", (evt) => MH.showTip(evt, `${a.name}, ${y}`, [
        { value: `${pts(a.annual[y] - spy.annual[y])} pts`, cls: signClass(a.annual[y] - spy.annual[y]), label: "vs S&P 500" },
        { value: spct(a.annual[y]), label: a.name },
        { value: spct(spy.annual[y]), label: "S&P 500" },
      ]));
      td.addEventListener("pointerleave", MH.hideTip);
    });
    const lg = document.getElementById("excess-legend");
    lg.className = "legend";
    lg.innerHTML = [["r-n3", "10 pts or more behind"], ["r-n2", "3–10 behind"], ["r-n1", "0–3 behind"], ["r-p1", "0–3 ahead"], ["r-p2", "3–10 ahead"], ["r-p3", "10 pts or more ahead"]]
      .map(([c, l]) => `<span class="key"><span class="sw ${c}"></span>${l}</span>`).join("");
  }

  // ---------- small multiples ----------
  function multiples(sectors, spy) {
    const wrap = document.getElementById("multiples");
    const thisYear = new Date().getFullYear();
    const starts = [[1999, "1999"], [2010, "2010"], [2020, "2020"], [thisYear - 4, "Last 5 years"]];
    let start = 1999;
    const draw = () => {
      wrap.replaceChildren();
      const spyMap = new Map(spy.monthly);
      const panels = sectors.map((a) => {
        const first = a.monthly[0][0];
        const baseM = `${start - 1}-12` >= first ? `${start - 1}-12` : first;
        const base = new Map(a.monthly).get(baseM), sb = spyMap.get(baseM);
        const sv = a.monthly.filter(([m]) => m >= baseM).map(([m, v]) => [parseMonth(m), (v / base) * 100]);
        const bv = spy.monthly.filter(([m]) => m >= baseM).map(([m, v]) => [parseMonth(m), (v / sb) * 100]);
        return { a, baseM, sv, bv };
      });
      const lo = d3.min(panels, (p) => d3.min(p.sv.concat(p.bv), (d) => d[1]));
      const hi = d3.max(panels, (p) => d3.max(p.sv.concat(p.bv), (d) => d[1]));
      panels.sort((p, q) => q.sv.at(-1)[1] / q.bv.at(-1)[1] - p.sv.at(-1)[1] / p.bv.at(-1)[1]);
      for (const p of panels) {
        const card = document.createElement("div");
        card.className = "card";
        const h = document.createElement("h3");
        h.textContent = p.a.name;
        const yrs = (p.sv.at(-1)[0] - p.sv[0][0]) / (365.25 * 864e5);
        const ann = (p.sv.at(-1)[1] / 100) ** (1 / yrs) - 1, bann = (p.bv.at(-1)[1] / 100) ** (1 / yrs) - 1;
        const meta = document.createElement("p");
        meta.className = "meta";
        meta.innerHTML = `<span class="${signClass(ann - bann)}">${spct(ann)} a year</span> vs ${spct(bann)} for the S&amp;P 500${p.baseM !== `${start - 1}-12` ? ` · since ${p.baseM.slice(0, 4)}` : ""}`;
        const chart = document.createElement("div");
        chart.className = "chart";
        card.append(h, meta, chart);
        wrap.append(card);
        MH.lineChart(chart, {
          series: [
            { id: "spy", name: "S&P 500", color: "var(--muted)", values: p.bv, width: 1.25 },
            { id: p.a.id, name: p.a.name, color: "var(--s1)", values: p.bv.length ? p.sv : [] },
          ],
          log: true, height: 170, yDomain: [lo, hi], endLabels: false, label: `${p.a.name} vs S&P 500`,
          xDomain: [parseMonth(`${start - 1}-12`), p.sv.at(-1)[0]],
          yFormat: (v) => num(v, 0), tipFormat: (v) => num(v, 1),
        });
      }
    };
    MH.seg(document.getElementById("mult-start"), starts, start, (v) => { start = v; draw(); });
    draw();
  }

  // ---------- correlations ----------
  function corrClass(c) {
    if (c <= -0.3) return "r-n3";
    if (c <= -0.1) return "r-n2";
    if (c < 0) return "r-n1";
    if (c < 0.4) return "r-p1";
    if (c < 0.7) return "r-p2";
    return "r-p3";
  }
  function correlations(list, mret, updated) {
    const tbl = document.getElementById("corr");
    let months = 120;
    const draw = () => {
      const end = updated.slice(0, 7);
      const keys = [...mret.spy.keys()].filter((k) => k <= end).slice(-months);
      const avail = list.filter((a) => keys.every((k) => mret[a.id].has(k)));
      const corr = (a, b) => {
        const xs = keys.map((k) => mret[a.id].get(k)), ys = keys.map((k) => mret[b.id].get(k));
        const mx = d3.mean(xs), my = d3.mean(ys);
        let c = 0, vx = 0, vy = 0;
        for (let i = 0; i < xs.length; i++) { c += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
        return c / Math.sqrt(vx * vy);
      };
      const label = (a) => ABBR[a.id] || a.short;
      let html = `<thead><tr><th></th>${avail.map((a) => `<th title="${a.name}">${label(a)}</th>`).join("")}</tr></thead><tbody>`;
      for (const a of avail) {
        html += `<tr><th>${label(a)}</th>`;
        for (const b of avail) {
          if (a === b) { html += `<td class="empty muted">–</td>`; continue; }
          const c = corr(a, b);
          html += `<td class="${corrClass(c)}" title="${a.name} / ${b.name}: ${c.toFixed(2)}">${c.toFixed(2).replace("-", "−")}</td>`;
        }
        html += "</tr>";
      }
      tbl.innerHTML = html + "</tbody>";
      const missing = list.filter((a) => !avail.includes(a)).map((a) => a.name);
      const lg = document.getElementById("corr-legend");
      lg.className = "legend";
      lg.innerHTML = [["r-n3", "−0.3 or lower"], ["r-n2", "−0.3 to −0.1"], ["r-n1", "−0.1 to 0"], ["r-p1", "0 to 0.4"], ["r-p2", "0.4 to 0.7"], ["r-p3", "0.7 or higher"]]
        .map(([c, l]) => `<span class="key"><span class="sw ${c}"></span>${l}</span>`).join("") +
        `<span class="muted">${keys.length} months to ${MH.fmtMonth(parseMonth(keys.at(-1)))}${missing.length ? `. Not enough history: ${missing.join(", ")}` : ""}.</span>`;
    };
    MH.seg(document.getElementById("corr-window"), [[36, "3 years"], [60, "5 years"], [120, "10 years"], [240, "20 years"]], months, (v) => { months = v; draw(); });
    draw();
  }
})();
