const $ = (id) => document.getElementById(id);

const { t, geyserName, zoneName, rejectName, whyText, setLanguage, lang } = window.I18N;

let config = null;
let hits = [];
let sortKey = "score";
let sortAsc = false;
let selectedSeed = null;
let selectedDetail = null;
let pollTimer = null;
let lastProgress = null;

// ------------------------------------------------------------------ helpers

async function api(path, options) {
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${separator}lang=${lang()}`, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.text ?? body.error ?? `HTTP ${res.status}`);
  return body;
}

function fmt(n, digits = 2) {
  return Number(n).toFixed(digits);
}

function formatDuration(sec) {
  if (sec < 60) return t("unit.sec", { n: sec.toFixed(0) });
  if (sec < 3600) return t("unit.min", { n: (sec / 60).toFixed(1) });
  return t("unit.hour", { n: (sec / 3600).toFixed(1) });
}

// The user's standing requirements. The inputs are pre-filled with these, and
// the "apply default filter" button restores them after manual edits.
const DEFAULT_FILTER = {
  bigVolcano: 1,
  iron: 1,
  copper: 0,
  gold: 1,
  totalMetal: 0,
  saltWater: 0,
  cleanWater: 0,
  coldWater: 0,
  minWater: 12,
  maxJunk: 99,
  maxNearJunk: 99,
  requireClear: true,
};

const FILTER_INPUTS = {
  "f-bigVolcano": "bigVolcano",
  "f-iron": "iron",
  "f-copper": "copper",
  "f-gold": "gold",
  "f-totalMetal": "totalMetal",
  "f-saltWater": "saltWater",
  "f-cleanWater": "cleanWater",
  "f-coldWater": "coldWater",
  "f-minWater": "minWater",
  "f-maxJunk": "maxJunk",
  "f-maxNearJunk": "maxNearJunk",
};

function applyFilter(filter) {
  for (const [id, key] of Object.entries(FILTER_INPUTS)) {
    if (filter[key] !== undefined && $(id)) $(id).value = filter[key];
  }
  if (filter.requireClear !== undefined) $("f-requireClear").checked = filter.requireClear;
}

function readFilters() {
  return {
    bigVolcano: Number($("f-bigVolcano").value) || 0,
    iron: Number($("f-iron").value) || 0,
    copper: Number($("f-copper").value) || 0,
    gold: Number($("f-gold").value) || 0,
    totalMetal: Number($("f-totalMetal").value) || 0,
    saltWater: Number($("f-saltWater").value) || 0,
    cleanWater: Number($("f-cleanWater").value) || 0,
    coldWater: Number($("f-coldWater").value) || 0,
    minWater: Number($("f-minWater").value) || 0,
    maxJunk: Number($("f-maxJunk").value) >= 0 ? Number($("f-maxJunk").value) : 99,
    maxNearJunk: Number($("f-maxNearJunk").value) >= 0 ? Number($("f-maxNearJunk").value) : 99,
    requireClear: $("f-requireClear").checked,
  };
}

function readWeights() {
  const stored = localStorage.getItem("oni-weights");
  return stored ? JSON.parse(stored) : {};
}

function saveFilters() {
  const data = { filter: readFilters() };
  localStorage.setItem("oni-filters", JSON.stringify(data));
}

function restoreFilters() {
  const raw = localStorage.getItem("oni-filters");
  if (!raw) return;
  try {
    const { filter } = JSON.parse(raw);
    applyFilter(filter ?? {});
  } catch {
    // Ignore corrupt stored settings; the HTML defaults stay in place.
  }
}

// ------------------------------------------------------------------ rendering

function renderTable() {
  const tbody = $("results").querySelector("tbody");
  tbody.innerHTML = "";

  const sorted = [...hits].sort((a, b) => {
    if (sortKey === "rank") return 0;
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortAsc ? av - bv : bv - av;
  });

  for (const [i, h] of sorted.entries()) {
    const tr = document.createElement("tr");
    tr.dataset.seed = h.seed;
    if (h.seed === selectedSeed) tr.classList.add("active");
    tr.innerHTML = `
      <td class="dim">${i + 1}</td>
      <td class="seed">${h.seed}</td>
      <td><strong>${fmt(h.score, 1)}</strong></td>
      <td class="${h.bigVolcano >= 1 ? "good" : "dim"}">${h.bigVolcano}</td>
      <td>${fmt(h.volcanoRate)}</td>
      <td class="${h.clean > 0 ? "good" : "dim"}">${fmt(h.clean)}</td>
      <td>${fmt(h.salt)}</td>
      <td>${fmt(h.water, 1)}</td>
      <td>${fmt(h.metal)}</td>
      <td class="${h.methane > 0 ? "" : "dim"}">${fmt(h.methane, 3)}</td>
      <td class="${h.junkCount > 0 ? "bad" : "dim"}">${h.junkCount}</td>
      <td class="dim">${h.blocked ? t("cell.blocked") : h.nearest < 0 ? t("cell.clear") : h.nearest}</td>`;
    tr.addEventListener("click", () => openDetail(h.seed));
    tbody.appendChild(tr);
  }

  $("hit-count").textContent = hits.length;
  $("empty-hint").style.display = hits.length ? "none" : "block";
  $("btn-export").disabled = hits.length === 0;
}

function renderProgress(p) {
  lastProgress = p;
  const reasons = Array.isArray(p?.rejected) && p.rejected.length
    ? t("progress.rejected", {
      list: p.rejected
        .filter((r) => r.reason !== "shield")
        .slice(0, 3)
        .map((r) => `${rejectName(r.reason)} ${r.pct}%`)
        .join(" / "),
    })
    : "";

  if (!p || !p.running) {
    if (p && p.total) {
      $("progress-bar").style.width = "100%";
      $("progress-text").textContent = t("progress.done", {
        done: p.done.toLocaleString(),
        total: p.total.toLocaleString(),
        elapsed: p.elapsed.toFixed(1),
        hits: p.hits,
      }) + reasons;
    } else {
      $("progress-bar").style.width = "0";
      $("progress-text").textContent = t("progress.idle");
    }
    $("btn-start").disabled = false;
    $("btn-stop").disabled = true;
    return;
  }

  const pct = p.total ? (p.done / p.total) * 100 : 0;
  $("progress-bar").style.width = `${pct.toFixed(1)}%`;
  const remain = p.speed > 0 ? Math.max(0, (p.total - p.done) / p.speed) : 0;
  $("progress-text").textContent = t("progress.running", {
    done: p.done.toLocaleString(),
    total: p.total.toLocaleString(),
    pct: pct.toFixed(1),
    speed: p.speed.toFixed(1),
    hits: p.hits,
    remain: formatDuration(remain),
  }) + reasons;
  $("btn-start").disabled = true;
  $("btn-stop").disabled = false;
}

// ------------------------------------------------------------------ base map

function drawBaseMap(detail) {
  const svg = $("base-map");
  svg.innerHTML = "";

  const ns = "http://www.w3.org/2000/svg";
  const add = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
    return el;
  };

  // Grid background.
  add("rect", { x: 0, y: 0, width: 50, height: 38, fill: "#151922", stroke: "#2a2f3a", "stroke-width": 0.3 });

  for (const block of config.blocks) {
    add("rect", {
      x: block.x0, y: block.y0,
      width: block.x1 - block.x0 + 1, height: block.y1 - block.y0 + 1,
      fill: "rgba(232,102,77,0.18)", stroke: "rgba(232,102,77,0.7)", "stroke-width": 0.25,
    });
  }

  // The tower shaft spans the whole map, so on this frame it is a full-height
  // strip that also extends past the top and bottom edges.
  add("rect", {
    x: config.towerX0, y: 0,
    width: config.towerX1 - config.towerX0 + 1, height: config.baseH,
    fill: "rgba(232,102,77,0.34)", stroke: "rgba(232,102,77,0.95)", "stroke-width": 0.4,
  });

  // Pod 4x4.
  add("rect", {
    x: 32, y: 34, width: 4, height: 4,
    fill: "rgba(78,201,138,0.35)", stroke: "#4ec98a", "stroke-width": 0.35,
  });
  add("rect", {
    x: 32, y: 36, width: 4, height: 2,
    fill: "rgba(78,201,138,0.75)", stroke: "#4ec98a", "stroke-width": 0.35,
  });

  // Geysers inside the base footprint.
  for (const g of detail.geysers) {
    if (!g.inBase) continue;
    const cx = g.lx + 0.5;
    const cy = g.ly + 0.5;
    const color = g.block ? "#e8664d" : g.junk ? "#e8b84d" : "#4ea1ff";
    add("circle", { cx, cy, r: 0.75, fill: color, stroke: "#0f1115", "stroke-width": 0.18 });
    add("text", {
      x: cx, y: cy + 2.0, "text-anchor": "middle", "font-size": 1.4, fill: color,
    }).textContent = geyserName(g.type);
  }

  // Axis hints: origin marker and pod label.
  add("text", { x: 1, y: 2, "font-size": 1.6, fill: "#5b6472" }).textContent = "(0,0)";
  add("text", { x: 34, y: 37.9, "font-size": 1.3, fill: "#4ec98a", "text-anchor": "middle" }).textContent = "POD";
}

function renderDetail(detail) {
  $("detail-panel").classList.remove("hidden");
  $("detail-seed").textContent = detail.coord.split("-")[3] ?? detail.coord;

  const tbody = $("geyser-table").querySelector("tbody");
  tbody.innerHTML = "";
  const sorted = [...detail.geysers].sort((a, b) => b.rate - a.rate);
  for (const g of sorted) {
    const tr = document.createElement("tr");
    if (g.block) tr.classList.add("blocked");
    else if (g.junk) tr.classList.add("junk");
    const zone = g.block
      ? `<span class="badge">${zoneName(g.block)}</span>`
      : g.inBase ? t("zone.empty") : t("zone.outside");
    tr.innerHTML = `
      <td>${geyserName(g.type)}</td>
      <td class="num">${fmt(g.rate, 3)}</td>
      <td>${g.inBase ? `(${g.lx}, ${g.ly})` : "—"}</td>
      <td>${zone}</td>`;
    tbody.appendChild(tr);
  }

  const res = $("resources");
  res.innerHTML = "";
  for (const [el, kg] of Object.entries(detail.resources)) {
    const div = document.createElement("div");
    div.className = "res-item";
    div.innerHTML = `<span>${el}</span><span>${kg.toLocaleString()} kg</span>`;
    res.appendChild(div);
  }
  if (!Object.keys(detail.resources).length) {
    res.innerHTML = `<span class="hint">${t("detail.noData")}</span>`;
  }

  drawBaseMap(detail);
}

async function openDetail(seed) {
  selectedSeed = seed;
  for (const tr of $("results").querySelectorAll("tbody tr")) {
    tr.classList.toggle("active", Number(tr.dataset.seed) === seed);
  }
  try {
    const detail = await api(`/api/seed/${seed}`);
    selectedDetail = detail;
    renderDetail(detail);
    $("detail-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    alert(t("err.detail", { seed, msg: err.message }));
  }
}

// ------------------------------------------------------------------ feasibility

// The server returns a reasonKey for unreachable filters; the wording is
// resolved here so switching language re-renders the same verdict.
function translateAdvice(verdict) {
  const target = verdict?.targetHits ?? 100;
  if (!verdict) return t("feas.unknown");
  if (verdict.impossible) {
    return t("feas.impossible", { why: whyText(verdict.reasonKey, verdict.reason) });
  }
  const secs = verdict.expectedSeconds;
  const time = formatDuration(secs);
  if (secs < 60) return t("feas.fast", { time, target });
  if (secs < 3600) return t("feas.normal", { time, target });
  return t("feas.slow", { time, target });
}

// ------------------------------------------------------------------ actions

async function startScan() {
  saveFilters();
  hits = [];
  selectedSeed = null;
  selectedDetail = null;
  $("detail-panel").classList.add("hidden");
  renderTable();

  const from = Number($("from").value) || 0;
  const count = Number($("count").value) || 1000;

  // Ask the backend whether this filter can pass and how long it will take.
  // Impossible combinations are refused before a single seed is generated.
  let verdict;
  try {
    verdict = await api("/api/feasibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter: readFilters(), targetHits: 100 }),
    });
  } catch {
    verdict = null;
  }

  if (verdict && verdict.impossible) {
    alert(translateAdvice(verdict));
    return;
  }
  if (verdict && verdict.expectedSeeds > count * 4) {
    const go = confirm(t("feas.confirm", {
      advice: translateAdvice(verdict),
      count: count.toLocaleString(),
      target: Math.ceil((verdict.targetHits ?? 100) / 4),
    }));
    if (!go) return;
  }

  try {
    await api("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, count, filter: readFilters(), weights: readWeights() }),
    });
    poll();
  } catch (err) {
    alert(t("err.start", { msg: err.message }));
  }
}

async function stopScan() {
  await api("/api/stop", { method: "POST" });
  poll();
}

async function poll() {
  clearTimeout(pollTimer);
  let p;
  try {
    p = await api("/api/progress");
  } catch {
    pollTimer = setTimeout(poll, 3000);
    return;
  }
  renderProgress(p);

  if (p.running || p.total) {
    const data = await api("/api/results");
    hits = data.hits;
    renderTable();
    renderProgress(data.progress);
  }
  if (p.running) pollTimer = setTimeout(poll, 800);
}

function exportCsv() {
  const cols = [
    ["seed", "csv.seed"], ["score", "csv.score"], ["bigVolcano", "csv.bigVolcano"],
    ["volcanoRate", "csv.volcanoRate"], ["clean", "csv.clean"], ["salt", "csv.salt"],
    ["water", "csv.water"], ["metal", "csv.metal"], ["methane", "csv.methane"],
    ["junkCount", "csv.junkCount"], ["nearest", "csv.nearest"],
    ["hqX", "csv.hqX"], ["hqY", "csv.hqY"],
  ];
  const rows = [cols.map(([, key]) => t(key)).join(",")];
  const sorted = [...hits].sort((a, b) => b.score - a.score);
  for (const h of sorted) {
    rows.push(cols.map(([key]) => {
      if (key === "hqX") return h.hq.x;
      if (key === "hqY") return h.hq.y;
      const v = h[key];
      return typeof v === "number" ? v.toFixed(3) : v ?? "";
    }).join(","));
  }
  const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `oni-seeds-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function clearResults() {
  try {
    await api("/api/clear", { method: "POST" });
    hits = [];
    selectedSeed = null;
    selectedDetail = null;
    $("detail-panel").classList.add("hidden");
    renderTable();
    $("progress-text").textContent = t("progress.idle");
    $("progress-bar").style.width = "0";
  } catch (err) {
    alert(err.message);
  }
}

// ------------------------------------------------------------------ language

function updateLangButtons() {
  for (const btn of document.querySelectorAll(".lang-switch button")) {
    btn.classList.toggle("active", btn.dataset.lang === lang());
  }
}

function updateThreadInfo() {
  if (!config) return;
  $("thread-info").textContent = t("threads", { cpus: config.cpus, threads: config.threads });
}

function updateEta() {
  const count = Number($("count").value) || 0;
  const speed = 20;
  $("eta").textContent = count > 0
    ? t("scan.eta", { time: formatDuration(count / speed), speed })
    : "";
}

// Re-render everything that holds translated text. Called once at boot and
// again on every language switch.
function refreshLocalizedText() {
  updateLangButtons();
  updateThreadInfo();
  updateEta();
  renderTable();
  if (lastProgress) renderProgress(lastProgress);
  if (selectedDetail) renderDetail(selectedDetail);
}

function switchLanguage(next) {
  setLanguage(next);
  refreshLocalizedText();
}

// ------------------------------------------------------------------ init

async function init() {
  config = await api("/api/config");

  restoreFilters();
  setLanguage(window.I18N.detect());

  for (const btn of document.querySelectorAll(".lang-switch button")) {
    btn.addEventListener("click", () => switchLanguage(btn.dataset.lang));
  }

  document.querySelectorAll("#results thead th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (sortKey === key) sortAsc = !sortAsc;
      else { sortKey = key; sortAsc = key === "rank"; }
      renderTable();
    });
  });

  $("btn-start").addEventListener("click", startScan);
  $("btn-stop").addEventListener("click", stopScan);
  $("btn-export").addEventListener("click", exportCsv);
  $("btn-clear").addEventListener("click", clearResults);
  $("btn-preset").addEventListener("click", () => {
    applyFilter(DEFAULT_FILTER);
    saveFilters();
  });
  $("btn-close-detail").addEventListener("click", () => {
    $("detail-panel").classList.add("hidden");
    selectedSeed = null;
    selectedDetail = null;
    renderTable();
  });
  $("count").addEventListener("input", updateEta);

  refreshLocalizedText();
  poll();
}

init();
