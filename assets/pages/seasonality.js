// Seasonality: returns by calendar month, their uncertainty, every month on record and the two halves of the year.
(function () {
  const { pct, spct } = MH;
  MH.shell("seasonality");
  const $ = (id) => document.getElementById(id);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WINDOWS = [["all", "Full history"], ["1950", "Since 1950"], ["30", "Last 30 years"], ["10", "Last 10 years"]];
  // Monthly moves are smaller than yearly ones, so the heatmap bands are narrower than on the annual page.
  const monthClass = (r) => (r == null ? "empty" : r <= -0.08 ? "r-n3" : r <= -0.03 ? "r-n2" : r < 0 ? "r-n1" : r < 0.03 ? "r-p1" : r < 0.08 ? "r-p2" : "r-p3");

  MH.load("markets").then((M) => {
    const byId = Object.fromEntries(M.assets.map((a) => [a.id, a]));
    document.getElementById("updated").textContent = `Data through ${MH.fmtDay(MH.parseDay(M.updated))}.`;
    const sel = $("asset-select");
    for (const g of M.groups) {
      const og = document.createElement("optgroup");
      og.label = g.name;
      for (const a of M.assets.filter((x) => x.group === g.id)) og.append(new Option(a.name, a.id));
      sel.append(og);
    }
    const q = new URLSearchParams(location.search);
    sel.value = byId[q.get("asset")] ? q.get("asset") : "spx";
    let win = WINDOWS.some(([k]) => k === q.get("w")) ? q.get("w") : "all";
    const segWin = () => MH.seg($("window"), WINDOWS, win, (v) => { win = v; draw(); });
    sel.addEventListener("change", draw);
    segWin();
    draw();

    /** Monthly returns [{ y, m, r }] from month-end closes, without the month in progress. */
    function monthly(a) {
      const out = [];
      const rows = a.monthly.slice();
      if (rows.length && rows[rows.length - 1][0] === M.updated.slice(0, 7)) rows.pop();
      for (let i = 1; i < rows.length; i++) {
        const [key, v] = rows[i], prev = rows[i - 1][1];
        if (!(prev > 0)) continue;
        out.push({ y: +key.slice(0, 4), m: +key.slice(5, 7) - 1, r: v / prev - 1 });
      }
      return out;
    }

    function draw() {
      const a = byId[sel.value];
      history.replaceState(null, "", `?asset=${a.id}${win === "all" ? "" : `&w=${win}`}`);
      const all = monthly(a);
      const lastYear = all.length ? all[all.length - 1].y : 0;
      const from = win === "all" ? -Infinity : win === "1950" ? 1950 : lastYear - +win + 1;
      const rs = all.filter((d) => d.y >= from);
      const firstYear = rs.length ? rs[0].y : null;
      $("months-title").textContent = `${a.short}: average return by calendar month, ${firstYear}–${lastYear}`;

      const by = MONTHS.map((_, m) => {
        const v = rs.filter((d) => d.m === m);
        const vals = v.map((d) => d.r), n = vals.length;
        const mean = d3.mean(vals), sd = d3.deviation(vals);
        const best = d3.greatest(v, (d) => d.r), worst = d3.least(v, (d) => d.r);
        return { m, n, mean, median: d3.median(vals), up: n ? vals.filter((x) => x > 0).length / n : null, se: n > 1 ? sd / Math.sqrt(n) : null, best, worst };
      });

      // tiles
      const ok = by.filter((d) => d.n);
      const top = d3.greatest(ok, (d) => d.mean), low = d3.least(ok, (d) => d.mean);
      const winter = rs.filter((d) => d.m >= 10 || d.m <= 3), summer = rs.filter((d) => d.m >= 4 && d.m <= 9);
      const sig = ok.filter((d) => d.se && Math.abs(d.mean) > 2 * d.se).length;
      const tiles = [
        ["Best month on average", `${MONTHS[top.m]} ${spct(top.mean)}`, `rose ${pct(top.up, 0)} of the time`],
        ["Worst month on average", `${MONTHS[low.m]} ${spct(low.mean)}`, `rose ${pct(low.up, 0)} of the time`],
        ["Months up", pct(rs.filter((d) => d.r > 0).length / rs.length, 0), `of ${rs.length.toLocaleString("en-US")} months`],
        ["Nov–Apr vs May–Oct", `${spct(d3.mean(winter, (d) => d.r))} vs ${spct(d3.mean(summer, (d) => d.r))}`, "average month in each half"],
        ["Clearly non-zero", `${sig} of 12`, "months whose average is more than 2 SE from 0"],
      ];
      $("stats").innerHTML = tiles.map(([l, v, d]) => `<div class="tile"><p class="label">${l}</p><div class="value">${v}</div><div class="delta"><span>${d}</span></div></div>`).join("");

      bars(by);
      table(by);
      halves(rs, a);
      heat(rs);
    }

    function bars(by) {
      MH.responsive($("months"), (W) => {
        const H = W < 560 ? 280 : 330, m = { top: 18, right: 8, bottom: 46, left: 46 };
        const ok = by.filter((d) => d.n);
        const lo = d3.min(ok, (d) => d.mean - 2 * (d.se || 0)), hi = d3.max(ok, (d) => d.mean + 2 * (d.se || 0));
        const x = d3.scaleBand().domain(MONTHS).range([m.left, W - m.right]).padding(0.28);
        const y = d3.scaleLinear().domain([Math.min(0, lo), Math.max(0, hi)]).nice().range([H - m.bottom, m.top]);
        const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Average return by calendar month");
        for (const t of y.ticks(5)) {
          svg.append("line").attr("x1", m.left).attr("x2", W - m.right).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", t === 0 ? "var(--ink-2)" : "var(--line)");
          svg.append("text").attr("x", m.left - 6).attr("y", y(t)).attr("dy", "0.32em").attr("text-anchor", "end").text(spct(t, Math.abs(t) < 0.01 && t ? 1 : 0));
        }
        for (const d of by) {
          const cx = x(MONTHS[d.m]), bw = x.bandwidth();
          if (d.n) {
            svg.append("rect").attr("x", cx).attr("width", bw).attr("y", Math.min(y(0), y(d.mean))).attr("height", Math.abs(y(d.mean) - y(0)))
              .attr("rx", 2).attr("fill", d.mean >= 0 ? "var(--pos-3)" : "var(--neg-3)")
              .on("pointermove", (e) => MH.showTip(e, MONTHS[d.m], [
                { label: "Average", value: spct(d.mean, 2) }, { label: "Median", value: spct(d.median, 2) },
                { label: "Rose", value: `${pct(d.up, 0)} of ${d.n} years` },
                { label: "Best", value: `${spct(d.best.r)} (${d.best.y})` }, { label: "Worst", value: `${spct(d.worst.r)} (${d.worst.y})` },
              ])).on("pointerleave", MH.hideTip);
            if (d.se) {
              const c = cx + bw / 2;
              svg.append("path").attr("d", `M${c},${y(d.mean - 2 * d.se)}V${y(d.mean + 2 * d.se)}M${c - 5},${y(d.mean - 2 * d.se)}h10M${c - 5},${y(d.mean + 2 * d.se)}h10`)
                .attr("stroke", "var(--ink)").attr("stroke-width", 1.2).attr("fill", "none").attr("pointer-events", "none");
            }
          }
          svg.append("text").attr("class", "lbl").attr("x", cx + bw / 2).attr("y", H - m.bottom + 16).attr("text-anchor", "middle").text(MONTHS[d.m]);
          svg.append("text").attr("x", cx + bw / 2).attr("y", H - m.bottom + 32).attr("text-anchor", "middle").text(d.n ? pct(d.up, 0) : "–");
        }
        $("months").replaceChildren(svg.node());
      });
    }

    function table(by) {
      $("table").innerHTML = `<thead><tr><th>Month</th><th class="num">Average</th><th class="num">Median</th><th class="num">Rose</th><th class="num">Best</th><th class="num">Worst</th><th class="num">Years</th></tr></thead><tbody>` +
        by.map((d) => d.n ? `<tr><td>${MONTHS[d.m]}</td><td class="num ${MH.signClass(d.mean)}">${spct(d.mean, 2)}</td><td class="num">${spct(d.median, 2)}</td><td class="num">${pct(d.up, 0)}</td>
          <td class="num">${spct(d.best.r)} <span class="muted">${d.best.y}</span></td><td class="num">${spct(d.worst.r)} <span class="muted">${d.worst.y}</span></td><td class="num">${d.n}</td></tr>` : "").join("") + "</tbody>";
    }

    function halves(rs, a) {
      let w = 100, s = 100;
      const W = [], S = [];
      for (const d of rs) {
        if (d.m >= 10 || d.m <= 3) w *= 1 + d.r; else s *= 1 + d.r;
        const date = new Date(d.y, d.m, 28);
        W.push([date, w]); S.push([date, s]);
      }
      MH.lineChart($("halves"), {
        series: [
          { id: "w", name: "November to April", short: "Nov–Apr", color: "var(--s1)", values: W },
          { id: "s", name: "May to October", short: "May–Oct", color: "var(--s2)", values: S },
        ],
        log: true, height: 320, yFormat: (v) => MH.num(v, 0), tipFormat: (v) => MH.num(v, 0), label: "Growth of 100 in each half of the year",
      });
      $("halves-legend").innerHTML = `<span class="key"><span class="ln" style="background:var(--s1)"></span>November to April: ${MH.num(w, 0)}</span><span class="key"><span class="ln" style="background:var(--s2)"></span>May to October: ${MH.num(s, 0)}</span>`;
      $("halves-sub").textContent = `Growth of 100 invested in the ${a.short} only from November to April, against only from May to October, out of the market the rest of the year (no interest on cash). ${a.basis === "total" ? "Total return, with dividends." : "Price only, without dividends."}`;
    }

    function heat(rs) {
      const years = [...new Set(rs.map((d) => d.y))].sort((p, q) => q - p);
      const get = new Map(rs.map((d) => [`${d.y}-${d.m}`, d.r]));
      const head = `<thead><tr><th>Year</th>${MONTHS.map((m) => `<th>${m}</th>`).join("")}<th>Year</th></tr></thead>`;
      const body = years.map((y) => {
        const cells = MONTHS.map((_, m) => get.get(`${y}-${m}`));
        const have = cells.filter((r) => r != null);
        const total = have.length ? have.reduce((p, r) => p * (1 + r), 1) - 1 : null;
        return `<tr><th>${y}</th>${cells.map((r) => `<td class="${monthClass(r)}">${r == null ? "" : spct(r, 1)}</td>`).join("")}<td class="total ${MH.retClass(total)}">${total == null ? "" : spct(total, 0)}${have.length < 12 ? "*" : ""}</td></tr>`;
      }).join("");
      $("heat").innerHTML = head + `<tbody>${body}</tbody>`;
      const keys = [["r-n3", "−8% or worse"], ["r-n2", "−8% to −3%"], ["r-n1", "−3% to 0%"], ["r-p1", "0% to +3%"], ["r-p2", "+3% to +8%"], ["r-p3", "+8% or better"]];
      $("heat-legend").innerHTML = keys.map(([c, l]) => `<span class="key"><span class="sw ${c}"></span>${l}</span>`).join("") + `<span class="muted">* part of a year. The year column uses the annual page's bands.</span>`;
    }
  }).catch(MH.fail);
})();
