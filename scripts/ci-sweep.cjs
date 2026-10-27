// Where the sweep has got to.
//
// The scan is a full pass over every seed, so the only state that matters is
// the boundary: everything below `next` has been scanned, everything at or
// above it has not. Each block of runs takes a contiguous chunk from `next`,
// splits it across shards; a shard that runs out of time before finishing its
// slice reports the exact seed it stopped at, and that point becomes the new
// `next` for the whole sweep. No seed is skipped and none is scanned twice.
//
// The file lives in the repo on the `state` branch so runs are independent and
// resumable; nothing here is time based, so a slow runner just moves the
// boundary less far.
const fs = require("node:fs");
const path = require("node:path");

const MAX_SEED = 2147483647;

const EMPTY_STATE = {
  next: 0,
  blocks: 0,
  scanned: 0,
  hits: 0,
  updatedAt: null,
};

function readState(file = ".sweep/state.json") {
  if (!fs.existsSync(file)) return { ...EMPTY_STATE };
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return { ...EMPTY_STATE, ...parsed };
}

function writeState(state, file = ".sweep/state.json") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

// The seed range one shard owns inside a block: blockStart + index * per.
function shardSlice(blockStart, span, shards, index) {
  if (blockStart > MAX_SEED) return null;
  const per = Math.ceil(span / shards);
  const from = blockStart + index * per;
  const to = Math.min(MAX_SEED + 1, Math.min(blockStart + span, from + per));
  if (to <= from) return null;
  return { from, to };
}

// What a shard has to know, printed for the workflow to consume.
function describe({ blockStart, span, shards, index }) {
  const slice = shardSlice(blockStart, span, shards, index);
  return {
    from: slice?.from ?? blockStart,
    to: slice?.to ?? blockStart,
    empty: slice ? "false" : "true",
    block: blockStart,
    span,
  };
}

// Move `next` forward by the contiguous prefix the shards actually covered.
// `covered` is the set of ranges this block's shards reported as scanned.
function advance(state, covered, { scanned, hits, note }) {
  const nextState = {
    ...state,
    blocks: state.blocks + 1,
    scanned: state.scanned + scanned,
    hits: state.hits + hits,
    updatedAt: new Date().toISOString(),
  };
  let next = state.next;
  // Walk forward through covered ranges: as long as the block starting at
  // `next` is fully covered, `next` can move to its end.
  const sorted = [...covered].sort((a, b) => a.from - b.from);
  for (const r of sorted) {
    if (r.from > next) break;
    if (r.to > next) next = r.to;
  }
  nextState.next = Math.min(next, MAX_SEED + 1);
  if (note) nextState.note = note;
  return nextState;
}

// Keep the longest contiguous prefix that this block actually covered, then
// move the boundary there. A shard that ran out of time leaves a gap that this
// rule deliberately refuses to jump over, so the block is retried from the
// first unreached seed on the next run.
function advanceFromShards(state, shards, file = ".sweep/state.json") {
  const covered = [];
  for (const p of shards) {
    if (p.finished === false || p.stoppedBy) continue;
    covered.push(p.planned ?? p.range);
  }
  const scanned = shards.reduce((a, p) => a + (p.scanned ?? 0), 0);
  const hits = shards.reduce((a, p) => a + (p.hits?.length ?? 0), 0);
  const next = advance(state, covered, { scanned, hits });
  writeState(next, file);
  return next;
}

module.exports = { EMPTY_STATE, MAX_SEED, readState, writeState, shardSlice, describe, advance, advanceFromShards };

if (require.main === module) {
  const arg = (name, fallback) => {
    const idx = process.argv.indexOf(`--${name}`);
    return idx === -1 || process.argv[idx + 1] === undefined ? fallback : process.argv[idx + 1];
  };
  const cmd = process.argv[2];
  const stateFile = arg("state", ".sweep/state.json");
  if (cmd === "range") {
    const state = readState(stateFile);
    const out = describe({
      blockStart: state.next,
      span: Number(arg("span", process.env.CI_SPAN)),
      shards: Number(arg("shards", process.env.CI_SHARDS ?? "1")),
      index: Number(arg("index", process.env.CI_INDEX ?? "0")),
    });
    for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
  } else if (cmd === "advance") {
    const dir = arg("shards", "flat");
    const files = fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
    const shards = files.map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")));
    if (!shards.length) {
      console.log("no shards to advance from");
      process.exit(0);
    }
    console.log(JSON.stringify(advanceFromShards(readState(stateFile), shards), null, 2));
  } else if (cmd === "show") {
    console.log(JSON.stringify(readState(stateFile), null, 2));
  } else {
    console.error("usage: node scripts/ci-sweep.cjs <range|advance|show> [options]");
    process.exit(1);
  }
}
