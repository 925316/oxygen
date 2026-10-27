const fs = require("node:fs");
const path = require("node:path");
const cli = require("../app/cli-text.cjs");
const locales = require("../app/locales.cjs");

const TOP_ROWS = 25;

const REASON_KEYS = {
  bigVolcano: "bigVolcano",
  iron: "iron",
  copper: "copper",
  gold: "gold",
  metalTotal: "metalTotal",
  metalCounts: "metalCounts",
  water: "water",
  salt: "salt",
  clean: "clean",
  cold: "cold",
  junk: "junk",
  nearJunk: "nearJunk",
  blocked: "blocked",
  noHQ: "noHQ",
};

const TEXT = {
  zh: {
    title: "类地种子扫描 {from}..{to}",
    seeds: "扫描种子数",
    hits: "命中",
    rate: "命中率",
    shards: "分片 / 每分片线程",
    wall: "累计耗时",
    filter: "筛选条件",
    noHits: "没有种子满足条件。下面的淘汰统计显示哪一条淘汰得最多，放宽它成本最低。",
    top: "前 {n} 名",
    table: ["#", "种子", "分数", "总水", "清水", "低温水", "大火山", "金属", "废喷孔", "基地"],
    more: "其余 {n} 个在 hits.json 里。",
    rejected: "淘汰统计",
    reason: "原因",
    count: "种子数",
    rejectShare: "占比",
    baseBlocked: "report.baseBlocked",
    baseClear: "report.baseClear",
    note: "分数只用于本次结果内部的排序，不代表绝对好坏。",
  },
  en: {
    title: "Terra seed scan {from}..{to}",
    seeds: "Seeds scanned",
    hits: "Hits",
    rate: "Hit rate",
    shards: "Shards / threads per shard",
    wall: "Wall time (sum of shards)",
    filter: "Filter",
    noHits: "No seeds matched. The rejection breakdown below shows which condition rejected the most seeds; relaxing that one is the cheapest change.",
    top: "Top {n} seeds",
    table: ["#", "Seed", "Score", "Water", "Clean", "Cold", "Big volc.", "Metal", "Junk", "Base"],
    more: "{n} more in the `hits.json` artifact.",
    rejected: "Rejection breakdown",
    reason: "Reason",
    count: "Seeds",
    rejectShare: "Share",
    baseBlocked: "report.baseBlocked",
    baseClear: "report.baseClear",
    note: "Scores are relative ranking values within this run, not absolute quality.",
  },
};

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 || process.argv[idx + 1] === undefined ? fallback : process.argv[idx + 1];
}

function fmt(n, digits = 2) {
  return Number(n).toFixed(digits);
}

function duration(sec) {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
  return `${(sec / 3600).toFixed(2)} h`;
}

// Reads through the same chrome as cli-scan, so one --lang or ONI_LANG drives
// every piece of terminal output in a run.
function readLang() {
  const idx = process.argv.indexOf("--lang");
  const flag = idx !== -1 ? process.argv[idx + 1] : undefined;
  return flag ?? process.env.ONI_LANG ?? "zh";
}

const lang = cli.SUPPORTED.includes(readLang()) ? readLang() : "zh";const t = cli.makeT(lang);
const words = TEXT[lang];

function describeFilter(filter) {
  const parts = [];
  for (const [key, value] of Object.entries(filter ?? {})) {
    if (key === "requireClear") continue;
    if (key === "maxJunk" || key === "maxNearJunk") {
      if (value < 99) parts.push(t(`filter.${key}`, { n: value }));
      continue;
    }
    if (value > 0) parts.push(t(`filter.${key}`, { n: value }));
  }
  if (filter?.requireClear) parts.push(t("filter.requireClear"));
  return parts.length ? parts.join(lang === "zh" ? "，" : ", ") : t("merge.noFilter");
}

function rejectText(reason) {
  return locales.rejectName(REASON_KEYS[reason] ?? "noHQ", lang);
}

function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
}

function buildReport(data) {
  const lines = [];
  const { range, scanned, hitCount, hitRate, filter, shards, threads, elapsedSeconds } = data;

  lines.push(`## ${fill(words.title, { from: range.from, to: range.to - 1 })}`);
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| ${words.seeds} | ${scanned.toLocaleString()} |`);
  lines.push(`| ${words.hits} | **${hitCount.toLocaleString()}** |`);
  lines.push(`| ${words.rate} | ${(hitRate * 100).toFixed(3)}% |`);
  lines.push(`| ${words.shards} | ${shards} / ${threads} |`);
  lines.push(`| ${words.wall} | ${duration(elapsedSeconds ?? 0)} |`);  lines.push(`| ${words.filter} | ${describeFilter(filter)} |`);
  lines.push("");
  if (data.partialShards?.length) {
    lines.push(t("report.partial", { n: data.partialShards.length }));
    lines.push("");
  }

  if (!hitCount) {
    lines.push(words.noHits);
    lines.push("");
  } else {
    lines.push(`### ${fill(words.top, { n: Math.min(TOP_ROWS, hitCount) })}`);
    lines.push("");
    lines.push(`| ${words.table.join(" | ")} |`);
    lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
    for (const [i, hit] of data.hits.slice(0, TOP_ROWS).entries()) {
      const baseText = t(hit.blocked ? words.baseBlocked : words.baseClear);
      lines.push(
        `| ${i + 1} | \`${hit.seed}\` | ${fmt(hit.score, 1)} | ${fmt(hit.water, 1)} | ` +
        `${fmt(hit.clean)} | ${fmt(hit.cold ?? 0)} | ${hit.bigVolcano} | ${fmt(hit.metal)} | ` +
        `${hit.junkCount} | ${baseText} |`,
      );
    }
    lines.push("");
    if (hitCount > TOP_ROWS) {
      lines.push(t("more", { n: hitCount - TOP_ROWS }));
      lines.push("");
    }
  }

  if (data.rejected?.length) {
    lines.push(`### ${words.rejected}`);
    lines.push("");
    lines.push(`| ${words.reason} | ${words.count} | ${words.rejectShare} |`);
    lines.push("|---|---:|---:|");
    for (const r of data.rejected.slice(0, 10)) {
      lines.push(`| ${rejectText(r.reason)} | ${r.count.toLocaleString()} | ${r.pct}% |`);
    }
    lines.push("");
  }

  lines.push(words.note);
  lines.push("");
  return lines.join("\n");
}

const input = arg("input", "hits.json");
const output = arg("output");

if (!fs.existsSync(input)) {
  console.error(`input not found: ${input}`);
  process.exit(1);
}

const report = buildReport(JSON.parse(fs.readFileSync(input, "utf8")));

if (output) {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, report, "utf8");
  console.log(`wrote ${output}`);
}
process.stdout.write(report);
