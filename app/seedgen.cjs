// The single module that talks to @onimaxxing/worldgen-node.
// Everything else in app/ depends on this interface, never on the package
// directly, so the engine can be swapped or wrapped without a repo-wide edit.
//
// One seed is generated at most once per load(): the engine returns a full
// 256x384 grid every time (~220 ms here), so callers that need several views
// of the same seed must share the cached result rather than call again.

const { worldgen } = require("@onimaxxing/worldgen-node");

const COORD_PREFIX = "SNDST-A";
// Seeds are signed 32-bit integers in game coordinates.
const MAX_SEED = 2147483647;

// PREFIX-SEED-MIXING-STORIES-xxx-yyy. Only the prefix and seed are meaningful
// here; the rest is pinned to the basegame defaults. Keep all five groups: a
// shorter coordinate parses without complaint but describes a different map.
const SUFFIX = "0-0-0-0";

function coordFor(seed) {
  if (typeof seed === "string" && !/^\d+$/.test(seed)) return seed;
  return `${COORD_PREFIX}-${seed}-${SUFFIX}`;
}

let lastKey = null;
let lastLoad = null;

function fail(reason) {
  const err = new Error(reason);
  err.code = "WORLDGEN_FAILED";
  return err;
}

// Generate (or reuse) the starting world for one seed.
// `ms` is the generation time; a cache hit returns the original object, so the
// caller can read `ms` to see what the generation actually cost.
function load(seed) {
  const coord = coordFor(seed);
  if (lastKey === coord) return lastLoad;

  // Drop the previous result before generating: the engine already holds its
  // own copy in WASM, so keeping ours alive doubles peak memory. A 256x384
  // world is ~2.7 MB of typed arrays per seed; a long scan that never clears
  // would otherwise walk the whole heap until GC catches up.
  lastKey = null;
  lastLoad = null;

  const t0 = Date.now();
  const map = worldgen.generate(coord);
  const ms = Date.now() - t0;

  if (!map || map.error) throw fail(`generate returned no map for ${coord}: ${map?.error ?? "null"}`);
  if (map.failure) throw fail(`worldgen failed for ${coord} at ${map.failure.stage}: ${map.failure.message}`);
  if (!map.worlds || map.worlds.length === 0) throw fail(`no worlds in ${coord}`);

  const world = map.worlds.find((w) => w.is_starting) ?? null;
  if (!world) throw fail(`no starting world in ${coord}`);

  lastKey = coord;
  lastLoad = { seed, coord, map, world, ms, cached: false };
  return lastLoad;
}

function peek(seed) {
  return lastKey === coordFor(seed) ? lastLoad : null;
}

function clear() {
  lastKey = null;
  lastLoad = null;
}

function version() {
  return worldgen.version();
}

// Geyser rate is in grams per second; every user-facing number is kg/s.
const kgPerS = (g) => (g.scaled_rate ?? 0) / 1000;

module.exports = {
  COORD_PREFIX, MAX_SEED, coordFor, load, peek, clear, version, kgPerS,
};
