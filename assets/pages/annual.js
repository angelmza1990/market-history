// Annual returns: heatmap of calendar years by asset, and one asset in depth.
(function () {
  const { pct, spct, signClass } = MH;
  MH.shell("annual");

  const KEY = ["spx", "ndx", "dji", "rut", "stoxx", "nikkei", "eem", "tlt", "gold", "wti", "btc", "eth"];

  MH.load("markets").then((M) => {
    const byId = Object.fromEntries(M.assets.map((a) => [a.id, a]));
    document.getElementById("updated").textContent = `Data through ${MH.fmtDay(MH.parseDay(M.updated))}.`;

    const groups = [["key", "Key assets"]].concat(M.groups.map((g) => [g.id, g.name]), [["all", "All"]]);
    const pick = (g) => (g === "key" ? KEY.map((id) => byId[id]) : g === "all" ? M.assets : M.assets.filter((a) => a.group === g));
    let group = "key";
    MH.seg(document.getElementById("group-seg"), groups, group, (g) => { group = g; heat(pick(g)); });
    MH.retLegend(document.getElementById("heat-legend"));
    heat(pick(group));

    const sel = document.getElementById("asset-select");
    for (const g of M.groups) {
      const og = document.createElement("optgroup");
      og.label = g.name;
      for (const a of M.assets.filter((x) => x.group === g.id)) {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.name;
        og.append(opt);
      }
      sel.append(og);
    }
    const fromUrl = new URLSearchParams(location.search).get("asset");
    sel.value = byId[fromUrl] ? fromUrl : "spx";
    sel.addEventListener("change", () => {
      history.replaceState(null, "", `?asset=${sel.value}`);
      detail(byId[sel.value]);
    });
    detail(byId[sel.value]);
  }).catch(MH.fail);

  function rows(a) {
    return Object.entries(a.annual).map(([y, r]) => ({ year: +y, value: r, ytd: +y === a.ytdYear }));
  }

  function heat(assets) {
    const tbl = document.getElementById("heat");
    const years = [...new Set(assets.flatMap((a) => Object.keys(a.annual).map(Number)))].sort((a, b) => b - a);
    const head = document.createElement("thead");
    const hr = document.createElement("tr");
    hr.append(Object.assign(document.createElement("th"), { textContent: "Year" }));
    for (const a of assets) {
      const th = document.createElement("th");
      th.textContent = a.short;
      th.title = a.name + (a.basis === "total" ? " (total return)" : "");
      hr.append(th);
    }
    head.append(hr);

    const body = document.createElement("tbody");
    for (const y of years) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = y;
      if (assets.some((a) => a.ytdYear === y)) {
        const s = document.createElement("span");
        s.className = "ytd-mark";
        s.textContent = " YTD";
        th.append(s);
      }
      tr.append(th);
      for (const a of assets) {
        const r = a.annual[y];
        const td = document.createElement("td");
        td.className = MH.retClass(r);
        if (r != null) {
          td.textContent = spct(r, Math.abs(r) >= 1 ? 0 : 1);
          td.tabIndex = -1;
          const show = (evt) => MH.showTip(evt, `${a.name}, ${y}${a.ytdYear === y ? " (year to date)" : ""}`, [
            { value: spct(r), cls: signClass(r), label: "calendar-year return" },
          ]);
          td.addEventListener("pointermove", show);
          td.addEventListener("pointerleave", MH.hideTip);
        }
        tr.append(td);
      }
      body.append(tr);
    }

    // Summary rows over full years only.
    const foot = document.createElement("tfoot");
    const full = (a) => Object.entries(a.annual).filter(([y]) => +y !== a.ytdYear).map(([, r]) => r);
    const summary = [
      ["Up years", (a) => `${a.stats.up} / ${a.stats.years}`],
      ["Down years", (a) => `${a.stats.down} / ${a.stats.years}`],
      ["Share up", (a) => (a.stats.years ? pct(a.stats.up / a.stats.years, 0) : "–")],
      ["Average", (a) => spct(a.stats.mean)],
      ["Median", (a) => spct(a.stats.median)],
      ["Best", (a) => spct(d3.max(full(a)))],
      ["Worst", (a) => spct(d3.min(full(a)))],
      ["Longest down run", (a) => { const n = downRun(a); return n ? `${n} yr` : "–"; }],
    ];
    for (const [label, f] of summary) {
      const tr = document.createElement("tr");
      tr.append(Object.assign(document.createElement("th"), { textContent: label }));
      for (const a of assets) tr.append(Object.assign(document.createElement("td"), { textContent: f(a) }));
      foot.append(tr);
    }
    tbl.replaceChildren(head, body, foot);
  }

  function downRun(a) {
    let best = 0, cur = 0;
    for (const [y, r] of Object.entries(a.annual)) {
      if (+y === a.ytdYear) continue;
      cur = r < 0 ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  }

  function detail(a) {
    const s = a.stats;
    const data = rows(a);
    const full = data.filter((d) => !d.ytd);
    const best = d3.greatest(full, (d) => d.value), worst = d3.least(full, (d) => d.value);
    const stats = [
      ["Years", `${s.years}`, `${full[0]?.year ?? "–"}–${full.at(-1)?.year ?? "–"}`],
      ["Up years", `${s.up}`, s.years ? `${pct(s.up / s.years, 0)} of years` : ""],
      ["Down years", `${s.down}`, s.years ? `${pct(s.down / s.years, 0)} of years` : ""],
      ["Average year", spct(s.mean), `median ${spct(s.median)}`],
      ["Best year", best ? spct(best.value) : "–", best ? String(best.year) : ""],
      ["Worst year", worst ? spct(worst.value) : "–", worst ? String(worst.year) : ""],
      ["Annualized, all years", spct(s.cagrAll), `since ${a.start.slice(0, 4)}`],
      ["Longest down run", `${downRun(a)} yr`, "consecutive losing years"],
    ];
    document.getElementById("asset-stats").innerHTML = stats.map(([l, v, d]) =>
      `<div class="tile"><p class="label">${l}</p><div class="value">${v}</div><div class="delta"><span>${d}</span></div></div>`).join("");
    document.getElementById("bars-title").textContent = `${a.name}: calendar-year returns`;
    document.getElementById("bars-note").textContent =
      (a.basis === "total" ? "Total return: dividends reinvested. " : "Price return: dividends and coupons are not included. ") +
      (a.ytdYear ? `${a.ytdYear} is year to date and drawn lighter.` : "");

    MH.barChart(document.getElementById("bars"), { data, name: a.short, label: `${a.name} calendar-year returns` });
    hist(data);
  }

  function hist(data) {
    const edges = d3.range(-0.5, 0.61, 0.1);
    // bin i holds [edges[i-1], edges[i]); the first and last bins are open-ended
    const lo = Math.max(-0.5, Math.floor(d3.min(data, (d) => d.value) * 10) / 10);
    const hi = Math.min(0.6, Math.ceil(d3.max(data, (d) => d.value) * 10 + 1e-9) / 10);
    const bounds = edges.filter((e) => e >= lo - 1e-9 && e <= hi + 1e-9);
    if (bounds.length < 2) bounds.push(bounds[0] + 0.1);
    const bins = [];
    for (let i = 0; i < bounds.length - 1; i++) bins.push({ a: bounds[i], b: bounds[i + 1], years: [] });
    for (const d of data) {
      let i = bins.findIndex((b) => d.value >= b.a && d.value < b.b);
      if (i < 0) i = d.value < bins[0].a ? 0 : bins.length - 1;
      bins[i].years.push(d);
    }
    const lbl = (b, i) => {
      const f = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}`;
      if (i === 0 && data.some((d) => d.value < b.a)) return `< ${f(b.b)}%`;
      if (i === bins.length - 1 && data.some((d) => d.value >= b.b)) return `> ${f(b.a)}%`;
      return `${f(b.a)} to ${f(b.b)}`;
    };
    const el = document.getElementById("hist");
    el.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "hist";
    const axis = document.createElement("div");
    axis.className = "hist-axis";
    bins.forEach((b, i) => {
      const col = document.createElement("div");
      col.className = "bin";
      for (const d of b.years.sort((x, y) => x.year - y.year)) {
        const c = document.createElement("div");
        c.className = `yr ${MH.retClass(d.value)}${d.ytd ? " ytd" : ""}`;
        c.textContent = d.year;
        c.addEventListener("pointermove", (evt) => MH.showTip(evt, d.ytd ? `${d.year} (year to date)` : String(d.year),
          [{ value: spct(d.value), cls: signClass(d.value), label: "" }]));
        c.addEventListener("pointerleave", MH.hideTip);
        col.append(c);
      }
      const n = document.createElement("div");
      n.className = "hist-count";
      n.textContent = b.years.length || "";
      col.append(n);
      wrap.append(col);
      axis.append(Object.assign(document.createElement("span"), { textContent: lbl(b, i) }));
    });
    el.append(wrap, axis);
  }
})();
