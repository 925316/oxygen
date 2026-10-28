// Batch progress for the sweep, kept on a release instead of in a branch.
//
// A run covers one contiguous batch of seeds. When it succeeds the boundary is
// stored as `progress.json` on the release, and the same run queues the next
// batch from that boundary, so a single manual start keeps walking the seed
// space. The release also carries a rolling leaderboard of the best hits, which
// is folded across batches so a later, worse batch cannot hide an earlier find.
const fs = require("node:fs");
const release = require("./ci-release.cjs");
const cli = require("../app/cli-text.cjs");

const api = "https://api.github.com";
const MAX_SEED = 2147483647;
const END = MAX_SEED + 1;

const { need, call, getRelease, readAsset, replaceAsset, setBody } = release;

function out(file, values) {
  for (const [key, value] of Object.entries(values)) {
    fs.appendFileSync(file, `${key}=${value}\n`);
  }
}

function batchSize() {
  const value = Number(process.env.REQUESTED_COUNT);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`count must be a positive number, got ${JSON.stringify(process.env.REQUESTED_COUNT)}`);
  }
  return Math.floor(value);
}

async function cmdResolve() {
  const tag = need("CI_TAG");
  const requested = (process.env.REQUESTED_FROM ?? "").trim();
  const count = batchSize();

  const target = await getRelease(false);
  const progress = target
    ? await readAsset(target, "progress.json", { next: 0, batches: 0, scanned: 0 })
    : { next: 0, batches: 0, scanned: 0 };

  const auto = requested === "" || requested === "auto";
  const from = auto ? progress.next : Number(requested);
  if (!Number.isInteger(from) || from < 0) {
    throw new Error(`from must be a seed number or "auto", got ${JSON.stringify(requested)}`);
  }

  const to = Math.min(END, from + count);
  const tagInfo = `release=${tag} next=${progress.next} batches=${progress.batches}`;
  if (from >= END) {
    console.log(`::notice::the seed space is fully scanned (${tagInfo})`);
    out(process.env.GITHUB_OUTPUT, { from, count: 0, done: "true" });
    return;
  }
  console.log(`batch ${from} .. ${to - 1} (${to - from} seeds, ${tagInfo})`);
  out(process.env.GITHUB_OUTPUT, { from, count: to - from, done: "false" });
}

function readOption(name, env) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
  return process.env[env];
}

async function cmdPublish() {
  const input = readOption("input", "CI_INPUT") ?? "out/hits.json";
  const batch = JSON.parse(fs.readFileSync(input, "utf8"));
  const target = await getRelease(true);
  const tag = need("CI_TAG");
  const keep = Number(process.env.CI_TOP_N ?? 5000) || 5000;

  const previous = await readAsset(target, "leaderboard.json", { hits: [] });
  const bySeed = new Map();
  for (const hit of [...previous.hits, ...(batch.hits ?? [])]) {
    const known = bySeed.get(hit.seed);
    if (!known || hit.score > known.score) bySeed.set(hit.seed, hit);
  }
  const merged = [...bySeed.values()].sort((a, b) => b.score - a.score || a.seed - b.seed).slice(0, keep);
  await replaceAsset(target, "leaderboard.json", { topN: keep, hits: merged });

  const progress = await readAsset(target, "progress.json", { next: 0, batches: 0, scanned: 0 });
  // `range.to` is planned; only `coveredTo` reflects a deadline-truncated batch.
  const end = batch.coveredTo ?? batch.range?.to ?? progress.next;
  const scanned = batch.scanned ?? 0;
  const next = Math.max(progress.next, end);
  const updated = {
    next,
    batches: (progress.batches ?? 0) + 1,
    scanned: (progress.scanned ?? 0) + scanned,
    hitCount: merged.length,
    lastBatch: { from: batch.range?.from ?? null, to: end, scanned, hits: batch.hitCount ?? null },
    updatedAt: new Date().toISOString(),
  };
  await replaceAsset(target, "progress.json", updated);
  await rewriteBody(target, updated, merged);
  console.log(`published: next=${updated.next} batches=${updated.batches} kept=${merged.length} (${tag})`);
}

// The release page answers a different question from the run summary: the
// summary describes one batch, the release describes how far the whole sweep
// has walked and which seeds still lead after every batch so far.
const REPORT_TEXT = {
  zh: {
    title: "类地种子扫描总进度",
    field: "项目",
    value: "数值",
    seeds: "累计扫描种子数",
    next: "下一批起点",
    covered: "已覆盖",
    batches: "完成批次",
    hits: "榜单种子数",
    updated: "更新时间",
    noHits: "目前还没有种子通过筛选。",
    top: "历史最佳 {n} 名",
    table: ["#", "种子", "分数", "总水", "清水", "低温水", "大火山", "金属", "废喷孔", "通天塔", "基地"],
    more: "其余 {n} 个在榜单 `leaderboard.json` 里。",
    note: "分数只用于榜单内部的排序，不代表绝对好坏。",
  },
  en: {
    title: "Terra seed sweep, overall progress",
    field: "Field",
    value: "Value",
    seeds: "Seeds scanned so far",
    next: "Next batch starts at",
    covered: "Covered",
    batches: "Batches finished",
    hits: "Seeds on the board",
    updated: "Updated",
    noHits: "No seed has passed the filter yet.",
    top: "Best {n} seeds found so far",
    table: ["#", "Seed", "Score", "Water", "Clean", "Cold", "Big volc.", "Metal", "Junk", "Tower", "Base"],
    more: "{n} more on the board in `leaderboard.json`.",
    note: "Scores rank seeds within this board, not absolute quality.",
  },
};

const TOP_ROWS = 20;

function shareText(next) {
  const ppm = (next / END) * 1e6;
  // A fresh sweep sits far below one percent. Rounding to tenths would print
  // 0.0 for a run that has done real work, so keep significant digits instead.
  return ppm < 1000 ? `${ppm.toPrecision(2)} ppm` : `${(ppm / 1e4).toFixed(2)}%`;
}

// Layout follows ci-report.cjs so the two pages read as one document: English
// block, `---`, Chinese block, same table columns in both.
function buildBodyFor(progress, hits, lang) {
  const tw = cli.makeT(lang);
  const w = REPORT_TEXT[lang];
  const next = progress.next ?? 0;
  const shown = Math.min(TOP_ROWS, hits.length);
  const lines = [];
  lines.push(`## ${w.title}`);
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| ${w.seeds} | ${(progress.scanned ?? 0).toLocaleString()} |`);
  lines.push(`| ${w.next} | ${next.toLocaleString()} |`);
  lines.push(`| ${w.covered} | ${shareText(next)} of 2^32 |`);
  lines.push(`| ${w.batches} | ${progress.batches ?? 0} |`);
  lines.push(`| ${w.hits} | ${hits.length.toLocaleString()} |`);
  lines.push(`| ${w.updated} | ${progress.updatedAt ?? "-"} |`);
  lines.push("");

  if (!hits.length) {
    lines.push(w.noHits);
    lines.push("");
  } else {
    lines.push(`### ${w.top.replace("{n}", String(shown))}`);
    lines.push("");
    lines.push(`| ${w.table.join(" | ")} |`);
    lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|");
    for (const [i, hit] of hits.slice(0, TOP_ROWS).entries()) {
      const towerText = tw(hit.towerBlocked ? "report.towerBlocked" : "report.towerClear");
      const baseText = tw(hit.blocked ? "report.baseBlocked" : "report.baseClear");
      lines.push(
        `| ${i + 1} | \`${hit.seed}\` | ${Number(hit.score).toFixed(1)} | `
        + `${Number(hit.water).toFixed(1)} | ${Number(hit.clean ?? 0).toFixed(2)} | `
        + `${Number(hit.cold ?? 0).toFixed(1)} | ${hit.bigVolcano} | ${Number(hit.metal).toFixed(2)} | `
        + `${hit.junkCount} | ${towerText} | ${baseText} |`,
      );
    }
    lines.push("");
    if (hits.length > TOP_ROWS) {
      lines.push(w.more.replace("{n}", String(hits.length - TOP_ROWS)));
      lines.push("");
    }
  }

  lines.push(w.note);
  lines.push("");
  return lines.join("\n");
}

function buildBody(progress, hits) {
  return [buildBodyFor(progress, hits, "en"), "---", "", buildBodyFor(progress, hits, "zh")].join("\n");
}

async function rewriteBody(target, progress, hits) {
  await setBody(target, buildBody(progress, hits));
}

async function cmdQueueNext() {
  const target = await getRelease(false);
  const progress = target
    ? await readAsset(target, "progress.json", { next: 0, batches: 0, scanned: 0 })
    : { next: 0, batches: 0, scanned: 0 };
  if (progress.next >= END) {
    console.log(`::notice::the seed space is fully scanned at ${progress.next}; chain stops`);
    return;
  }

  const maxRuns = Number(process.env.MAX_RUNS ?? 0) || 0;
  if (maxRuns > 0 && progress.batches >= maxRuns) {
    console.log(`::notice::reached max_runs=${maxRuns} after ${progress.batches} batches; chain stops`);
    return;
  }

  const count = Number(process.env.BATCH ?? 0);
  const url = `${api}/repos/${need("CI_REPO")}/actions/workflows/${need("CI_WORKFLOW")}/dispatches`;
  await call("POST", url, { ref: "master", inputs: { from: "auto", count: String(count) } });
  console.log(`queued the next batch from ${progress.next} (${count} seeds)`);
}

function main() {
  const cmd = process.argv[2];
  const run = { resolve: cmdResolve, publish: cmdPublish, "queue-next": cmdQueueNext }[cmd];
  if (!run) throw new Error(`usage: node scripts/ci-progress.cjs <resolve|publish|queue-next>`);
  return run();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
