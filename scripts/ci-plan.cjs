// Plan a scan against a wall-clock budget.
//
// Usage:
//   node scripts/ci-plan.cjs --from 0 --count 2147483648 --threads 8
//   node scripts/ci-plan.cjs --from 0 --count 2147483648 --threads 2 --time-budget 330 --shards 20
//
// Answers the question you actually have before a long run: how many seeds fit
// in the budget, and does the shard layout you asked for finish on time.
// `--time-budget` is the wall-clock minutes for the whole run; `--reserve` is
// the time kept back to write and upload results.
//
// Every number here is an estimate from measured throughput. Run `npm run
// bench` on the target machine to refresh that measurement.
const os = require("node:os");
const feasibility = require("../app/feasibility.cjs");
const seedgen = require("../app/seedgen.cjs");
const cli = require("../app/cli-text.cjs");

const TEXT = {
  zh: {
    device: "本机核心数 {cores}，使用线程 {threads}",
    range: "区间 {from}..{to}，共 {count} 个种子",
    speed: "单线程 {perThread}/s，{threads} 线程约 {speed}/s",
    budget: "时间预算 {minutes} 分钟，预留 {reserve} 分钟，可用 {usable} 分钟",
    fits: "按当前设置可在预算内扫完，预计 {hours} 小时",
    overflow: "速度不够：扫完约需 {hours} 小时，超出预算 {over} 小时",
    cover: "预算内最多扫 {seeds} 个种子，建议区间 {from}..{to}",
    shards: "切成 {shards} 个分片，每片约 {per} 个种子",
    shardTime: "每片约需 {hours} 小时 ({ok})",
    shardOk: "在预算内",
    shardOver: "超出预算",
    exact: "要扫完整个区间，至少需要 {need} 个并行分片（每片 {threads} 线程）",
    partial: "若各分片按预算提前停止，本次可覆盖约 {seeds} 个种子，续扫起点 {resume}",
  },
  en: {
    device: "{cores} cores, using {threads} threads",
    range: "range {from}..{to}, {count} seeds",
    speed: "{perThread}/s per thread, about {speed}/s on {threads} threads",
    budget: "budget {minutes} min, reserve {reserve} min, usable {usable} min",
    fits: "fits in the budget, about {hours} h",
    overflow: "not fast enough: about {hours} h, {over} h over budget",
    cover: "at most {seeds} seeds fit, suggested range {from}..{to}",
    shards: "split into {shards} shards, about {per} seeds each",
    shardTime: "about {hours} h per shard ({ok})",
    shardOk: "within budget",
    shardOver: "over budget",
    exact: "covering the whole range needs {need} parallel shards of {threads} threads",
    partial: "if every shard stops at the budget, this run covers about {seeds} seeds; resume at {resume}",
  },
};

function readOption(name, env) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] !== undefined) return process.argv[idx + 1];
  return env ? process.env[env] : undefined;
}

function readNumber(name, env, fallback) {
  const raw = readOption(name, env);
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got ${JSON.stringify(raw)}`);
  return value;
}

const lang = String(readOption("lang", "ONI_LANG") ?? "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
const words = TEXT[lang];
const t = cli.makeT(lang);
const fill = (template, vars) =>
  String(template).replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
const line = (key, vars) => console.log(fill(words[key], vars));

const cores = os.cpus().length;
const threads = Math.max(1, Math.floor(readNumber("threads", "CI_THREADS", Math.max(1, cores - 1))));
const from = Math.max(0, Math.floor(readNumber("from", "CI_FROM", 0)));
const count = Math.floor(readNumber("count", "CI_COUNT", seedgen.MAX_SEED + 1 - from));
const to = Math.min(seedgen.MAX_SEED + 1, from + count);
const budget = readNumber("time-budget", "CI_TIME_BUDGET_MIN", undefined);
const reserve = readNumber("reserve", "CI_RESERVE_MIN", 10);
const shards = Math.max(1, Math.floor(readNumber("shards", "CI_SHARDS", 1)));
const perThread = feasibility.PER_THREAD;
const speed = threads * perThread;
const seeds = to - from;
const hours = (sec) => (sec / 3600).toFixed(2);

line("device", { cores, threads });
line("range", { from, to: to - 1, count: seeds.toLocaleString() });
line("speed", { perThread, threads, speed: speed.toFixed(1) });

const fullSeconds = seeds / speed;
if (budget === undefined) {
  line("fits", { hours: hours(fullSeconds) });
} else {
  const usable = Math.max(0, budget - reserve);
  const limit = usable * 60 * speed;
  line("budget", { minutes: budget, reserve, usable });
  if (seeds <= limit) {
    line("fits", { hours: hours(fullSeconds) });
  } else {
    line("overflow", { hours: hours(fullSeconds), over: hours((seeds - limit) / speed) });
    line("cover", { seeds: Math.floor(limit).toLocaleString(), from, to: from + Math.floor(limit) });
  }

  const per = Math.ceil(seeds / shards);
  const shardSeconds = per / speed;
  const ok = shardSeconds <= usable * 60 ? words.shardOk : words.shardOver;
  line("shards", { shards, per: per.toLocaleString() });
  line("shardTime", { hours: hours(shardSeconds), ok });

  const need = Math.ceil(fullSeconds / Math.max(1, usable * 60));
  line("exact", { need: need.toLocaleString(), threads });

  const covered = Math.min(seeds, Math.floor(limit) * shards);
  line("partial", { seeds: covered.toLocaleString(), resume: from + Math.min(seeds, Math.floor(limit)) });
}

process.exit(0);
