const fs = require("node:fs");
const path = require("node:path");
const { Scan } = require("../app/dispatcher.cjs");
const scoring = require("../app/scoring.cjs");
const feasibility = require("../app/feasibility.cjs");
const feasibilityText = require("../app/feasibility-text.cjs");
const t = require("../app/cli-text.cjs").makeT(readLang());

const MAX_SEED = 2147483647;

function readOption(name, env) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
  return process.env[env];
}

function readNumber(name, env, fallback) {
  const raw = readOption(name, env);
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got ${JSON.stringify(raw)}`);
  return value;
}

// How many top-scoring seeds a shard keeps. A strict filter still passes
// millions of seeds over the whole space, so a shard writes a rolling leader
// board instead of every hit: memory and output size stay flat no matter how
// far it scans.
function readTopN() {
  const value = Math.floor(readNumber("top-n", "CI_TOP_N", 5000));
  if (value < 0) throw new Error(`--top-n must be >= 0, got ${value}`);
  return value;
}

// Keep the best `n` hits, ordered by score then seed. Sorting is only paid when
// the board is full, which is rare once scanning is past the warm-up.
function trimTop(hits, n) {
  if (n <= 0 || hits.length <= n) return hits;
  const sorted = [...hits].sort((a, b) => b.score - a.score || a.seed - b.seed);
  return sorted.slice(0, n);
}

// Terminal output follows --lang / ONI_LANG, like inspect-seed.cjs does.
// readLang() runs before makeT() is called, so it may only touch argv and env.
function readLang() {
  return readOption("lang", "ONI_LANG") ?? "zh";
}

function describeVerdict(verdict) {
  return feasibilityText.describeVerdict(verdict, t.lang);
}

function readFilter() {
  let filter = { ...scoring.DEFAULT_FILTER };
  let raw = {};

  const file = readOption("filter-file", "CI_FILTER_FILE");
  if (file) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    raw = parsed.filter ?? parsed;
    filter = { ...filter, ...raw };
  }

  const numeric = {
    bigVolcano: "CI_BIG_VOLCANO",
    iron: "CI_IRON",
    copper: "CI_COPPER",
    gold: "CI_GOLD",
    totalMetal: "CI_TOTAL_METAL",
    saltWater: "CI_SALT_WATER",
    cleanWater: "CI_CLEAN_WATER",
    coldWater: "CI_COLD_WATER",
    minWater: "CI_MIN_WATER",
    maxJunk: "CI_MAX_JUNK",
    maxNearJunk: "CI_MAX_NEAR_JUNK",
  };
  for (const [key, env] of Object.entries(numeric)) {
    const value = readNumber(key, env, undefined);
    if (value !== undefined) filter[key] = value;
  }

  const clear = readOption("require-clear", "CI_REQUIRE_CLEAR");
  if (clear !== undefined) {
    const text = String(clear).toLowerCase();
    if (!["true", "false", "1", "0"].includes(text)) {
      throw new Error(`--require-clear must be true or false, got ${JSON.stringify(clear)}`);
    }
    filter.requireClear = text === "true" || text === "1";
  }

  const tower = readOption("require-tower", "CI_REQUIRE_TOWER");
  if (tower !== undefined) {
    const text = String(tower).toLowerCase();
    if (!["true", "false", "1", "0"].includes(text)) {
      throw new Error(`--require-tower must be true or false, got ${JSON.stringify(tower)}`);
    }
    filter.requireTower = text === "true" || text === "1";
  }

  const normalized = scoring.normalizeFilter(filter);
  for (const [key, value] of Object.entries(normalized)) {
    if (key === "requireClear" || key === "requireTower") continue;
    if (Number(value) < 0) throw new Error(`filter ${key} must be >= 0, got ${value}`);
  }
  // `raw` is what gets written into the payload, so it has to carry the flags
  // applied above rather than only what the file said.
  raw = { ...raw, ...normalized };
  return { filter: normalized, raw };
}

function readWeights(file) {
  if (!file) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return parsed.weights ?? parsed;
}

function readRange() {
  const from = readNumber("from", "CI_FROM", 0);
  const to = readNumber("to", "CI_TO", from + readNumber("count", "CI_COUNT", 1000));

  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error("--from and --to must be integers");
  if (from < 0) throw new Error(`--from must be >= 0, got ${from}`);
  if (to <= from) throw new Error(`--to (${to}) must be greater than --from (${from})`);
  if (to > MAX_SEED + 1) {
    throw new Error(`--to must be <= ${MAX_SEED + 1} (the highest valid seed is ${MAX_SEED}), got ${to}`);
  }
  return { from, to };
}

function readShards() {
  const shards = readNumber("shards", "CI_SHARDS", 1);
  const index = readNumber("index", "CI_INDEX", 0);
  if (!Number.isInteger(shards) || shards < 1) throw new Error(`--shards must be a positive integer, got ${shards}`);
  if (!Number.isInteger(index) || index < 0 || index >= shards) {
    throw new Error(`--index must be in [0, ${shards - 1}], got ${index}`);
  }
  return { shards, index };
}

// Wall-clock limit for one shard, so a run stops on its own before a CI
// timeout kills it with nothing written. `--deadline` accepts an epoch in ms,
// an ISO timestamp or YYYY-MM-DDTHH:MM; `--time-budget` accepts a number of
// minutes. Returns an absolute epoch in ms, or null for no limit.
function readDeadline() {
  const absolute = readOption("deadline", "CI_DEADLINE");
  if (absolute !== undefined && absolute !== "") {
    const asNumber = Number(absolute);
    const at = Number.isFinite(asNumber) && asNumber > 1e11 ? asNumber : Date.parse(absolute);
    if (!Number.isFinite(at)) throw new Error(`--deadline is not a valid time: ${JSON.stringify(absolute)}`);
    return at;
  }
  const budget = readOption("time-budget", "CI_TIME_BUDGET_MIN");
  if (budget !== undefined && budget !== "") {
    const minutes = Number(budget);
    // Zero means "no limit", which is what an unused workflow input sends.
    if (!Number.isFinite(minutes) || minutes < 0) {
      throw new Error(`--time-budget must be zero or a positive number of minutes, got ${JSON.stringify(budget)}`);
    }
    if (minutes === 0) return null;
    return Date.now() + minutes * 60_000;
  }
  return null;
}

function shardRange(from, to, shards, index) {
  const total = to - from;
  const per = Math.ceil(total / shards);
  const start = from + index * per;
  const end = Math.min(to, start + per);
  return { from: start, to: Math.max(start, end) };
}

function runShard() {
  const { from, to } = readRange();
  const { shards, index } = readShards();
  const slice = shardRange(from, to, shards, index);
  const { filter, raw } = readFilter();
  const filterFile = readOption("filter-file", "CI_FILTER_FILE");
  const weightsFile = readOption("weights-file", "CI_WEIGHTS_FILE");
  const weights = readWeights(weightsFile ?? filterFile);
  const threads = Math.max(1, Math.floor(readNumber("threads", "CI_THREADS", 1)));
  const output = readOption("output", "CI_OUTPUT") ?? `shard-${index}.json`;

  if (slice.to <= slice.from) {
    writeJson(output, {
      index, shards, filter: raw, range: slice, scanned: 0, hits: [], rejected: [], finished: true,
    });
    console.log(t("shard.empty", { index, shards }));
    return 0;
  }

  const verdict = feasibility.check(filter, { targetHits: 1, threads });
  if (verdict.impossible) {
    console.error(t("shard.infeasible", { reason: describeVerdict(verdict) }));
    return 2;
  }

  console.log(t("shard.start", {
    index, shards, from: slice.from, to: slice.to - 1, count: slice.to - slice.from, threads,
  }));

  const started = Date.now();
  const deadline = readDeadline();
  const topN = readTopN();
  const scan = new Scan({
    from: slice.from,
    to: slice.to,
    filter,
    weights,
    targets: {},
    threads,
    topN,
  });

  // A shard that dies mid-run loses everything it wrote since the last save, so
  // the same payload is rewritten on a timer as well as at the end. The file is
  // replaced through a temp file so an upload never catches half a document.
  const checkpointMs = Math.max(0, readNumber("checkpoint-seconds", "CI_CHECKPOINT_SEC", 600)) * 1000;

  // `timeout` marks a deadline stop, which the merge accepts as partial.
  // `final` marks the end of the run; a periodic checkpoint is neither, so it
  // is written with finished=false and the merge refuses it unless the shard
  // later completes.
  function payloadFor({ timeout = false, final = false } = {}) {
    const coveredTo = timeout ? Math.min(slice.to, slice.from + scan.done) : slice.to;
    return {
      index,
      shards,
      filter: raw,
      weights,
      range: timeout || !final ? { from: slice.from, to: coveredTo } : slice,
      planned: slice,
      scanned: scan.done,
      elapsedSeconds: Math.round((Date.now() - started) / 100) / 10,
      threads,
      topN: topN || null,
      hits: trimTop(scan.sortedHits(), topN),
      rejected: scan.rejectionReport(),
      finished: final,
      stoppedBy: timeout ? "deadline" : null,
      checkpoint: !final,
    };
  }

  function save(opts) {
    const payload = payloadFor(opts);
    const temp = `${output}.tmp`;
    writeJson(temp, payload);
    fs.renameSync(temp, output);
    return payload;
  }

  let lastCheckpoint = started;

  const tick = setInterval(() => {
    const p = scan.progress();
    const elapsed = (Date.now() - started) / 1000;
    process.stdout.write("\r" + t("shard.progress", {
      done: p.done, total: p.total, speed: p.speed.toFixed(1), hits: p.hits, elapsed: elapsed.toFixed(0),
    }));
    if (!p.running) finish();
    // Stopping keeps the seeds already scanned; `partial` tells the merge that
    // this shard does not cover its whole slice.
    else if (deadline !== null && Date.now() >= deadline) finish("deadline");
    else if (checkpointMs > 0 && Date.now() - lastCheckpoint >= checkpointMs) {
      lastCheckpoint = Date.now();
      save({});
    }
  }, 2000);

  let written = false;
  function finish(reason) {
    if (written) return;
    written = true;
    clearInterval(tick);

    if (reason) scan.stop();

    const timeout = reason === "deadline";
    const payload = save({ timeout, final: true });
    process.stdout.write("\n");
    console.log(t("shard.wrote", { hits: payload.hits.length, output }));
    if (timeout) process.stdout.write(t("shard.stopped", { done: scan.done, from: slice.from, to: payload.range.to }) + "\n");
    process.exit(0);
  }
  return null;
}

function readShardFiles(inputDir) {
  if (!fs.existsSync(inputDir)) throw new Error(`input directory does not exist: ${inputDir}`);
  return fs
    .readdirSync(inputDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(inputDir, name));
}

// A shard that hit its deadline is complete as far as the merge is concerned,
// but the range it actually covered is smaller than the slice it planned.
function checkCoverage(payloads, from, to, shards, partial) {
  const seen = new Set(payloads.map((p) => p.index));
  const missing = [];
  for (let i = 0; i < shards; i++) if (!seen.has(i)) missing.push(i);
  if (missing.length) {
    throw new Error(`missing shard(s): ${missing.join(", ")} (found ${seen.size}/${shards})`);
  }

  const scanned = payloads.reduce((a, p) => a + (p.scanned ?? 0), 0);
  const expected = to - from;
  // A deadline stops a shard early on purpose: the gap is reported, not an
  // error. Anything else (overlap, dropped seeds, stale shards) is a real bug.
  if (partial.length && scanned < expected) return;
  if (scanned !== expected) {
    throw new Error(`coverage mismatch: shards cover ${scanned} seeds, range is ${expected}`);
  }
}

function runMerge() {
  const inputDir = readOption("inputs", "CI_INPUTS") ?? ".";
  const output = readOption("output", "CI_OUTPUT") ?? "hits.json";
  const files = readShardFiles(inputDir);
  if (!files.length) throw new Error(`no shard files found in ${inputDir}`);

  const payloads = files.map((file) => {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed.finished && parsed.stoppedBy !== "deadline") throw new Error(`${file} is not a finished shard`);
    return parsed;
  });

  const partial = payloads.filter((p) => p.stoppedBy === "deadline").map((p) => p.planned ?? p.range);
  const from = Math.min(...payloads.map((p) => p.range.from));
  const to = Math.max(...payloads.map((p) => (p.planned ?? p.range).to));
  // `to` is the planned end, so a batch killed by its deadline ends earlier.
  // Shards run in parallel over consecutive slices, so the seeds really covered
  // are the longest unbroken run from `from`, not the largest shard end.
  const coveredTo = (() => {
    const ordered = [...payloads].sort((a, b) => a.range.from - b.range.from);
    let reached = from;
    for (const p of ordered) {
      if (p.range.from > reached) break;
      if (p.range.to > reached) reached = p.range.to;
    }
    return reached;
  })();
  const shards = payloads[0].shards;
  checkCoverage(payloads, from, to, shards, partial);

  const bySeed = new Map();
  for (const p of payloads) {
    for (const hit of p.hits) {
      const previous = bySeed.get(hit.seed);
      if (!previous || hit.score > previous.score) bySeed.set(hit.seed, hit);
    }
  }

  const hits = [...bySeed.values()].sort((a, b) => b.score - a.score || a.seed - b.seed);
  const keep = readTopN();
  const kept = keep > 0 ? hits.slice(0, keep) : hits;
  const rejected = {};
  for (const p of payloads) {
    for (const r of p.rejected ?? []) rejected[r.reason] = (rejected[r.reason] ?? 0) + r.count;
  }
  const scanned = payloads.reduce((a, p) => a + (p.scanned ?? 0), 0);
  const elapsed = payloads.reduce((a, p) => a + (p.elapsedSeconds ?? 0), 0);

  const summary = {
    range: { from, to },
    coveredTo,
    seeds: to - from,
    scanned,
    partialShards: partial.length ? partial : undefined,
    shards,
    threads: payloads[0].threads,
    filter: payloads[0].filter,
    weights: payloads[0].weights ?? {},
    elapsedSeconds: Math.round(elapsed * 10) / 10,
    hitCount: hits.length,
    keptCount: kept.length,
    topN: keep || null,
    hitRate: scanned ? hits.length / scanned : 0,
    rejected: Object.entries(rejected)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count, pct: scanned ? Math.round((count / scanned) * 1000) / 10 : 0 })),
    hits: kept,
  };

  writeJson(output, summary);

  console.log(t("merge.done", {
    shards: payloads.length, seeds: scanned.toLocaleString(), hits: hits.length,
  }));
  if (keep > 0 && kept.length < hits.length) {
    console.log(`  kept the top ${kept.length} by score (${hits.length} hits before trimming)`);
  }
  console.log(t("merge.rate", { rate: (summary.hitRate * 100).toFixed(3), seconds: summary.elapsedSeconds.toFixed(0) }));
  if (partial.length) console.log(t("merge.partial", { n: partial.length, seeds: (to - from - scanned).toLocaleString() }));
  for (const [i, hit] of hits.slice(0, 10).entries()) {
    console.log(t("merge.row", {
      rank: String(i + 1).padStart(2),
      seed: String(hit.seed).padEnd(10),
      score: hit.score.toFixed(1).padStart(5),
      water: hit.water.toFixed(1),
      clean: hit.clean.toFixed(1),
      salt: hit.salt.toFixed(1),
      big: hit.bigVolcano,
      metal: hit.metal.toFixed(2),
      junk: hit.junkCount,
      clear: t(hit.blocked ? "no" : "yes"),
    }));
  }
  return 0;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function main() {
  const mode = process.argv[2];
  if (mode === "shard") return runShard();
  if (mode === "merge") return runMerge();
  console.error("usage: node scripts/ci-scan.cjs <shard|merge> [options]");
  return 1;
}

try {
  const code = main();
  if (code !== null) process.exit(code);
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
