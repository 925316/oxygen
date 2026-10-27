// Bilingual UI strings for the browser. Static markup is filled from
// data-i18n attributes; runtime text goes through t().
//
// Geyser, zone and rejection names come from locales.js so the page, the server
// and the CLI spell them the same way.
(function () {
  "use strict";

  const I18N = {
    zh: {
      "meta.title": "ONI 种子扫描器",
      "header.title": "ONI 种子扫描器",
      "header.sub": "本体 Terra · 全本地离线",
      "lang.aria": "界面语言",
      "scan.title": "扫描设置",
      "scan.from": "起始种子",
      "scan.count": "扫描数量",
      "scan.eta": "预计 {time}（约 {speed}/s）",
      "filter.bigVolcano": "大火山 ≥",
      "filter.iron": "铁火山 ≥",
      "filter.copper": "铜火山 ≥",
      "filter.gold": "金火山 ≥",
      "filter.totalMetal": "金属总产 ≥ kg/s",
      "filter.saltWater": "盐水 ≥ kg/s",
      "filter.cleanWater": "清水 ≥ kg/s",
      "filter.coldWater": "低温水 ≥ kg/s",
      "filter.minWater": "水总量 ≥ kg/s",
      "filter.maxJunk": "废弃喷孔 ≤",
      "filter.maxNearJunk": "基地旁废喷孔 ≤",
      "filter.requireClear": "基地 50×38 内不能有泉",
      "btn.start": "开始扫描",
      "btn.stop": "停止",
      "btn.export": "导出 CSV",
      "btn.clear": "清空结果",
      "btn.preset": "套用默认条件",
      "btn.preset.title": "大火山≥2、三金属各≥1、水总量≥8、基地净空",
      "btn.close": "关闭",
      "threads": "{cpus} 核 CPU，使用 {threads} 线程",
      "progress.idle": "空闲",
      "progress.done": "完成：{done} / {total}，用时 {elapsed}s，命中 {hits}",
      "progress.running": "{done} / {total}  ({pct}%) · {speed}/s · 已找到 {hits} · 剩余 {remain}",
      "progress.rejected": " · 淘汰：{list}",
      "result.title": "结果",
      "result.empty": "还没有结果。设置条件后点「开始扫描」。",
      "col.rank": "#",
      "col.seed": "种子",
      "col.score": "分数",
      "col.bigVolcano": "大火山",
      "col.volcanoRate": "火山 kg/s",
      "col.clean": "清水 kg/s",
      "col.salt": "盐水 kg/s",
      "col.water": "水总量",
      "col.metal": "金属 kg/s",
      "col.methane": "天然气",
      "col.junkCount": "废喷孔",
      "col.nearest": "最近泉",
      "cell.blocked": "被遮挡",
      "cell.clear": "净空",
      "detail.seed": "种子",
      "detail.mapTitle": "基地平面图 (50 × 38)",
      "detail.geysers": "泉水明细",
      "detail.resources": "资源储量",
      "detail.noData": "无数据",
      "legend.block": "规划区（不可有泉）",
      "legend.pod": "打印仓",
      "legend.geyser": "泉（框内）",
      "legend.outside": "泉（基地区外）",
      "gcol.type": "类型",
      "gcol.rate": "kg/s",
      "gcol.local": "基地内坐标",
      "gcol.zone": "所在区域",
      "zone.empty": "基地内空区",
      "zone.outside": "基地外",
      "unit.sec": "{n} 秒",
      "unit.min": "{n} 分钟",
      "unit.hour": "{n} 小时",
      "feas.impossible": "不可行：{why}。请放宽条件。",
      "feas.fast": "很快，约 {time} 可凑齐 {target} 个候选。",
      "feas.normal": "约 {time} 可凑齐 {target} 个候选。",
      "feas.slow": "条件很严：约 {time} 才能凑齐 {target} 个候选，建议放宽一项。",
      "feas.unknown": "无法预估",
      "feas.confirm": "{advice}\n\n当前只扫 {count} 个种子，按这个条件预计命中不到 25 个。\n\n继续扫描吗？",
      "err.start": "启动失败：{msg}",
      "err.detail": "读取种子 {seed} 失败：{msg}",
      "csv.seed": "种子",
      "csv.score": "分数",
      "csv.bigVolcano": "大火山",
      "csv.volcanoRate": "火山kg/s",
      "csv.clean": "清水kg/s",
      "csv.salt": "盐水kg/s",
      "csv.water": "水总量kg/s",
      "csv.metal": "金属kg/s",
      "csv.methane": "天然气kg/s",
      "csv.junkCount": "废喷孔",
      "csv.nearest": "最近泉距离",
      "csv.hqX": "打印仓X",
      "csv.hqY": "打印仓Y",
    },
    en: {
      "meta.title": "ONI Seed Scanner",
      "header.title": "ONI Seed Scanner",
      "header.sub": "Vanilla Terra · fully local",
      "lang.aria": "Interface language",
      "scan.title": "Scan settings",
      "scan.from": "Start seed",
      "scan.count": "Seed count",
      "scan.eta": "~{time} (about {speed}/s)",
      "filter.bigVolcano": "Big volcanoes ≥",
      "filter.iron": "Iron volcano ≥",
      "filter.copper": "Copper volcano ≥",
      "filter.gold": "Gold volcano ≥",
      "filter.totalMetal": "Total metal ≥ kg/s",
      "filter.saltWater": "Salt water ≥ kg/s",
      "filter.cleanWater": "Clean water ≥ kg/s",
      "filter.coldWater": "Cold water ≥ kg/s",
      "filter.minWater": "Total water ≥ kg/s",
      "filter.maxJunk": "Junk vents ≤",
      "filter.maxNearJunk": "Junk vents near base ≤",
      "filter.requireClear": "No geysers inside the 50×38 base",
      "btn.start": "Start scan",
      "btn.stop": "Stop",
      "btn.export": "Export CSV",
      "btn.clear": "Clear results",
      "btn.preset": "Apply default filter",
      "btn.preset.title": "Big volcanoes ≥2, one of each metal volcano, water ≥8, base clear",
      "btn.close": "Close",
      "threads": "{cpus} CPU cores, using {threads} threads",
      "progress.idle": "Idle",
      "progress.done": "Done: {done} / {total}, {elapsed}s, {hits} hits",
      "progress.running": "{done} / {total}  ({pct}%) · {speed}/s · {hits} found · {remain} left",
      "progress.rejected": " · rejected: {list}",
      "result.title": "Results",
      "result.empty": "No results yet. Set the filters and press Start scan.",
      "col.rank": "#",
      "col.seed": "Seed",
      "col.score": "Score",
      "col.bigVolcano": "Big volc.",
      "col.volcanoRate": "Volcano kg/s",
      "col.clean": "Clean kg/s",
      "col.salt": "Salt kg/s",
      "col.water": "Total water",
      "col.metal": "Metal kg/s",
      "col.methane": "Nat. gas",
      "col.junkCount": "Junk",
      "col.nearest": "Nearest",
      "cell.blocked": "Blocked",
      "cell.clear": "Clear",
      "detail.seed": "Seed",
      "detail.mapTitle": "Base layout (50 × 38)",
      "detail.geysers": "Geyser details",
      "detail.resources": "Resource reserves",
      "detail.noData": "No data",
      "legend.block": "Planned area (no geysers)",
      "legend.pod": "Printing pod",
      "legend.geyser": "Geyser (inside)",
      "legend.outside": "Geyser (outside)",
      "gcol.type": "Type",
      "gcol.rate": "kg/s",
      "gcol.local": "Base coords",
      "gcol.zone": "Zone",
      "zone.empty": "Empty area in base",
      "zone.outside": "Outside base",
      "unit.sec": "{n} s",
      "unit.min": "{n} min",
      "unit.hour": "{n} h",
      "feas.impossible": "Not feasible: {why}. Please relax the filters.",
      "feas.fast": "Fast: about {time} to reach {target} candidates.",
      "feas.normal": "About {time} to reach {target} candidates.",
      "feas.slow": "Very strict: about {time} to reach {target} candidates. Consider relaxing one filter.",
      "feas.unknown": "Cannot estimate",
      "feas.confirm": "{advice}\n\nThis scan only covers {count} seeds and is unlikely to reach 25 hits.\n\nContinue anyway?",
      "err.start": "Failed to start: {msg}",
      "err.detail": "Failed to load seed {seed}: {msg}",
      "csv.seed": "Seed",
      "csv.score": "Score",
      "csv.bigVolcano": "Big volcanoes",
      "csv.volcanoRate": "Volcano kg/s",
      "csv.clean": "Clean kg/s",
      "csv.salt": "Salt kg/s",
      "csv.water": "Total water kg/s",
      "csv.metal": "Metal kg/s",
      "csv.methane": "Natural gas kg/s",
      "csv.junkCount": "Junk vents",
      "csv.nearest": "Nearest geyser",
      "csv.hqX": "Pod X",
      "csv.hqY": "Pod Y",
    },
  };

  const LOCALES = window.ONI_LOCALES;
  const SUPPORTED = LOCALES.SUPPORTED;
  const STORAGE_KEY = "oni-lang";

  let current = "zh";

  function detect() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(stored)) return stored;
    return (navigator.language ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function interpolate(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (m, key) => (vars[key] !== undefined ? String(vars[key]) : m));
  }

  // Missing keys fall back to Chinese, then to the key itself, so a partially
  // translated build still renders something meaningful instead of blanks.
  function t(key, vars) {
    const text = I18N[current][key] ?? I18N.zh[key] ?? key;
    return interpolate(text, vars);
  }

  function lookup(table, key) {
    return table[current]?.[key] ?? table.en?.[key] ?? table.zh?.[key] ?? key;
  }

  function geyserName(type) {
    return lookup(LOCALES.GEYSER_NAMES, type);
  }

  function zoneName(block) {
    return lookup(LOCALES.BLOCK_NAMES, block);
  }

  function rejectName(reason) {
    return lookup(LOCALES.REJECT_NAMES, reason);
  }

  // The backend reports an English sentence for an infeasible filter; it also
  // sends reasonKey, which survives translation.
  function whyText(reasonKey, fallback) {
    if (!reasonKey) return fallback ?? "";
    return lookup(LOCALES.WHY, reasonKey);
  }

  function setLanguage(lang) {
    current = SUPPORTED.includes(lang) ? lang : "zh";
    localStorage.setItem(STORAGE_KEY, current);
    document.documentElement.lang = current === "zh" ? "zh-CN" : "en";
    document.title = t("meta.title");
    applyStaticText();
  }

  function applyStaticText() {
    for (const el of document.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.dataset.i18n);
    }
    for (const el of document.querySelectorAll("[data-i18n-title]")) {
      el.title = t(el.dataset.i18nTitle);
    }
    for (const el of document.querySelectorAll("[data-i18n-aria]")) {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    }
  }

  function lang() {
    return current;
  }

  window.I18N = {
    t, geyserName, zoneName, rejectName, whyText,
    setLanguage, applyStaticText, lang, SUPPORTED, detect,
  };
})();
