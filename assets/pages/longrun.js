// Long run: growth of 100 from a chosen start year, drawdowns and period statistics.
(function () {
  const { pct, spct, num, signClass, parseMonth } = MH;
  MH.shell("longrun");

  const EVENTS = [
    ["1929-10", "1929 crash"], ["1945-08", "End of WWII"], ["1973-10", "Oil embargo"], ["1980-01", "Volcker"],
    ["1987-10", "Black Monday"], ["2000-03", "Dot-com peak"], ["2008-09", "Lehman"], ["2020-03", "COVID-19"],
    ["2022-03", "Fed hikes"],
  ];
  const PRESETS = [
    ["S&P 500 since 1928", ["spx"], 1928, true],
    ["US indices", ["spx", "ixic", "dji", "rut"], 1993, true],
    ["Stocks, bonds, gold, oil", ["spy", "tlt", "gold", "wti"], 2001, true],
    ["World", ["spx", "dax", "ftse", "nikkei", "hsi", "bvsp"], 1994, true],
    ["Crypto", ["btc", "eth", "ndx", "gold"], 2018, true],
  ];
  const MAX = 8;

  MH.load("markets").then((M) => MH.load("macro").then((macro) => run(M, macro))).catch(MH.fail);

  function run(M, macro) {
    const byId = Object.fromEntries(M.assets.map((a) => [a.id, a]));
    const monthIdx = Object.fromEntries(M.assets.map((a) => [a.id, new Map(a.monthly)]));
    document.getElementById("updated").textContent = `Data through ${MH.fmtDay(MH.parseDay(M.updated))}.`;
    const recessions = macro.recessions.map(([a, b]) => [parseMonth(a), b ? parseMonth(b) : new Date()]);

    const params = new URLSearchParams(location.search);
    const state = {
      ids: (params.get("assets") || "spx,ndx,gold,tlt").split(",").filter((id) => byId[id]).slice(0, MAX),
      start: +params.get("start") || 2003,
      log: params.get("scale") !== "linear",
      rec: true,
    };
    const slots = {};
    const assignSlot = (id) => {
      if (slots[id] != null) return;
      const used = new Set(Object.values(slots));
      let i = 0;
      while (used.has(i)) i++;
      slots[id] = i;
    };
    state.ids.forEach(assignSlot);

    const has = (id, year) => monthIdx[id].has(`${year - 1}-12`);

    // controls
    const startSel = document.getElementById("start");
    const thisYear = new Date(M.updated).getFullYear();
    for (let y = thisYear; y >= 1928; y--) startSel.append(new Option(String(y), String(y)));
    startSel.value = state.start;
    startSel.addEventListener("change", () => { state.start = +startSel.value; update(); });
    MH.seg(document.getElementById("scale"), [[true, "Log"], [false, "Linear"]], state.log, (v) => { state.log = v; update(); });
    MH.seg(document.getElementById("rec"), [[true, "Show"], [false, "Hide"]], true, (v) => { state.rec = v; update(); });

    const presetsEl = document.getElementById("presets");
    presetsEl.className = "chips";
    for (const [label, ids, start, log] of PRESETS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = label;
      b.addEventListener("click", () => {
        for (const k of Object.keys(slots)) delete slots[k];
        state.ids = ids.slice();
        ids.forEach(assignSlot);
        state.start = start;
        state.log = log;
        startSel.value = start;
        MH.seg(document.getElementById("scale"), [[true, "Log"], [false, "Linear"]], state.log, (v) => { state.log = v; update(); });
        update();
      });
      presetsEl.append(b);
    }

    const picker = document.getElementById("picker");
    const chips = {};
    for (const g of M.groups) {
      const row = document.createElement("div");
      row.className = "picker-row";
      row.append(Object.assign(document.createElement("span"), { className: "lbl", textContent: g.name }));
      const wrap = document.createElement("div");
      wrap.className = "chips";
      for (const a of M.assets.filter((x) => x.group === g.id)) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "chip";
        c.append(document.createElement("i"), document.createTextNode(a.short));
        c.title = a.name;
        c.addEventListener("click", () => {
          const i = state.ids.indexOf(a.id);
          if (i >= 0) { state.ids.splice(i, 1); delete slots[a.id]; }
          else if (state.ids.length < MAX) { state.ids.push(a.id); assignSlot(a.id); }
          update();
        });
        chips[a.id] = c;
        wrap.append(c);
      }
      row.append(wrap);
      picker.append(row);
    }

    function update() {
      const active = state.ids.filter((id) => has(id, state.start));
      for (const [id, c] of Object.entries(chips)) {
        const on = state.ids.includes(id);
        c.setAttribute("aria-pressed", String(on));
        c.disabled = !has(id, state.start) || (!on && state.ids.length >= MAX);
        c.querySelector("i").style.background = on ? MH.seriesColor(slots[id]) : "";
        if (!has(id, state.start)) c.title = `${byId[id].name}: data starts ${byId[id].start.slice(0, 4)}`;
      }
      document.getElementById("pick-count").textContent = `(${active.length} selected)`;
      const q = `?assets=${state.ids.join(",")}&start=${state.start}${state.log ? "" : "&scale=linear"}`;
      history.replaceState(null, "", q);

      const baseM = `${state.start - 1}-12`;
      const series = active.map((id) => {
        const a = byId[id];
        const base = monthIdx[id].get(baseM);
        const vals = a.monthly.filter(([m]) => m >= baseM).map(([m, v]) => [parseMonth(m), (v / base) * 100]);
        return { id, name: a.name, short: a.short, color: MH.seriesColor(slots[id]), values: vals, a };
      });
      const missing = state.ids.filter((id) => !has(id, state.start)).map((id) => byId[id].short);
      document.getElementById("growth-title").textContent = `Growth of 100 since the end of ${state.start - 1}`;

      const legend = document.getElementById("growth-legend");
      legend.className = "legend";
      legend.innerHTML = series.map((s) => `<span class="key"><span class="ln" style="background:${s.color}"></span>${esc(s.name)}${s.a.basis === "total" ? " (total return)" : ""}</span>`).join("") +
        (missing.length ? `<span class="muted">Not shown, no data at the start: ${esc(missing.join(", "))}</span>` : "");

      const x0 = series.length ? parseMonth(baseM) : null;
      const annotations = EVENTS.map(([m, label]) => ({ date: parseMonth(m), label }));
      MH.lineChart(document.getElementById("growth"), {
        series, log: state.log, height: 440, label: "Growth of 100",
        yFormat: (v) => num(v, v < 10 ? 1 : 0), tipFormat: (v) => num(v, v < 10 ? 2 : v < 1000 ? 1 : 0),
        recessions: state.rec ? recessions : [], annotations, baseline: state.log ? null : 100,
      });
      MH.lineChart(document.getElementById("dd"), {
        series: series.map((s) => ({ ...s, values: s.a.drawdown.filter(([m]) => m >= baseM).map(([m, v]) => [parseMonth(m), v]) })),
        area: true, baseline: 0, height: 260, label: "Drawdown from all-time high",
        yFormat: (v) => pct(v, 0), tipFormat: (v) => pct(v, 1), recessions: state.rec ? recessions : [],
        xDomain: x0 ? [x0, d3.max(series, (s) => s.values.at(-1)[0])] : undefined,
        yDomain: [Math.min(-0.05, d3.min(series, (s) => d3.min(s.a.drawdown.filter(([m]) => m >= baseM), (d) => d[1])) ?? 0), 0],
        endLabels: false, reserveRight: series.length <= 4,
      });
      table(series);
    }

    function table(series) {
      const tbody = document.querySelector("#period tbody");
      tbody.innerHTML = series.map((s) => {
        const v = s.values;
        const end = v.at(-1)[1];
        const years = (v.at(-1)[0] - v[0][0]) / (365.25 * 86400000);
        const rets = v.slice(1).map((d, i) => d[1] / v[i][1] - 1);
        const vol = rets.length > 12 ? d3.deviation(rets) * Math.sqrt(12) : null;
        let peak = 0, dd = 0;
        for (const [, x] of v) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); }
        const yrs = Object.entries(s.a.annual).filter(([y]) => +y >= state.start);
        const full = yrs.filter(([y]) => +y !== s.a.ytdYear);
        const best = d3.greatest(full, (d) => d[1]), worst = d3.least(full, (d) => d[1]);
        const ann = years > 1 ? (end / 100) ** (1 / years) - 1 : null;
        return `<tr>
          <td><span class="ln" style="display:inline-block;width:12px;height:2px;margin-right:8px;vertical-align:middle;background:${s.color}"></span>${esc(s.short)}</td>
          <td>${num(end, end < 1000 ? 1 : 0)}</td>
          <td class="${signClass(end - 100)}">${spct(end / 100 - 1, 0)}</td>
          <td class="${signClass(ann)}">${spct(ann)}</td>
          <td>${pct(vol)}</td>
          <td class="neg">${spct(dd, 0)}</td>
          <td>${best ? `${spct(best[1], 0)} <span class="muted">${best[0]}</span>` : "–"}</td>
          <td>${worst ? `${spct(worst[1], 0)} <span class="muted">${worst[0]}</span>` : "–"}</td>
          <td>${full.length ? `${full.filter((d) => d[1] > 0).length} of ${full.length}` : "–"}</td>
        </tr>`;
      }).join("");
    }

    update();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
})();
