// Internal consistency of the app layer.
// Run: node verify/verify.cjs
//
// Every summary field is re-derived here straight from the raw worldgen output
// and compared against analysis.summarize(). The two paths must never diverge:
// the aggregation in analysis.cjs is the only thing standing between the engine
// and every filter, score and export in the app.
const seedgen = require("../app/seedgen.cjs");
const analysis = require("../app/analysis.cjs");
const scoring = require("../app/scoring.cjs");
const base = require("../app/base-plan.cjs");
const detail = require("../app/detail.cjs");

const SEEDS = [0, 1, 2, 42, 383, 376, 12695, 48731, 604729236];

let failures = 0;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function diff(label, seed, expected, actual) {
  failures++;
  console.log(`  MISMATCH ${label} seed=${seed}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

const WATER = ["steam", "hot_steam", "hot_water", "salt_water", "filthy_water", "slush_water", "slush_salt_water"];
const JUNK = ["chlorine_gas", "hot_co2", "liquid_co2", "hot_po2", "slimy_po2", "oil_drip"];
const METAL = ["molten_iron", "molten_copper", "molten_gold"];
const kg = (g) => (g.scaled_rate ?? 0) / 1000;

console.log("== summarize agrees with a direct recount ==");
for (const seed of SEEDS) {
  seedgen.clear();
  const loaded = seedgen.load(seed);
  const s = analysis.summarize(loaded);
  const gs = loaded.world.geysers ?? [];
  const rate = (types) => gs.filter((g) => types.includes(g.type)).reduce((a, g) => a + kg(g), 0);
  const count = (t) => gs.filter((g) => g.type === t).length;

  const expected = {
    seed: loaded.map.seed,
    geyserCount: gs.length,
    water: rate(WATER),
    clean: rate(["hot_water"]),
    salt: rate(["salt_water"]),
    polluted: rate(["filthy_water"]),
    slush: rate(["slush_water", "slush_salt_water"]),
    steam: rate(["steam", "hot_steam"]),
    volcanoRate: rate(["big_volcano"]),
    bigVolcano: count("big_volcano"),
    smallVolcano: count("small_volcano"),
    metal: rate(METAL),
    iron: count("molten_iron"),
    copper: count("molten_copper"),
    gold: count("molten_gold"),
    ironRate: rate(["molten_iron"]),
    copperRate: rate(["molten_copper"]),
    goldRate: rate(["molten_gold"]),
    methane: rate(["methane"]),
    hydrogen: rate(["hot_hydrogen"]),
    junkCount: gs.filter((g) => JUNK.includes(g.type)).length,
  };

  for (const [k, v] of Object.entries(expected)) {
    const got = s[k];
    if (typeof v === "number" && !close(v, got)) diff(k, seed, v, got);
  }

  // Base plan verdict recomputed from scratch.
  const hq = base.findHQ(loaded.world.buildings);
  const veto = analysis.quickRejects(loaded, scoring.normalizeFilter({}));
  const blockedByPoint = gs.some((g) => {
    const { lx, ly } = base.toLocal(g, hq);
    return base.inBase(lx, ly) && base.blockAt(lx, ly);
  });
  if (blockedByPoint !== s.blocked) diff("blocked", seed, blockedByPoint, s.blocked);
  if (blockedByPoint && veto !== "blocked") diff("quickRejects blocked", seed, "blocked", veto);
}
console.log(`  ${SEEDS.length} seeds, one field per summarized counter`);

console.log("\n== score is stable and bounded ==");
for (const seed of SEEDS) {
  seedgen.clear();
  const s = analysis.summarize(seedgen.load(seed));
  const a = scoring.scoreOf(s);
  const b = scoring.scoreOf(s);
  if (a !== b) diff("score determinism", seed, a, b);
  if (a < -100 || a > 100) diff("score range", seed, "within [-100,100]", a);
}
console.log("  deterministic and in range");

console.log("\n== passes() agrees with rejectReasons() ==");
const FILTERS = [
  {},
  { requireClear: true },
  { bigVolcano: 2, iron: 1, copper: 1, gold: 1, minWater: 8 },
  { maxJunk: 5 },
  { requireClear: false, minWater: 15 },
];
for (const f of FILTERS) {
  for (const seed of SEEDS) {
    seedgen.clear();
    const s = analysis.summarize(seedgen.load(seed));
    const ok = scoring.passes(s, f);
    const reasons = scoring.rejectReasons(s, f);
    if (ok !== (reasons.length === 0)) {
      diff(`passes vs reasons ${JSON.stringify(f)}`, seed, ok, reasons);
    }
  }
}
console.log(`  ${FILTERS.length} filters x ${SEEDS.length} seeds`);

console.log("\n== quickRejects never vetoes a passing seed ==");
for (const f of FILTERS) {
  const nf = scoring.normalizeFilter(f);
  for (const seed of SEEDS) {
    seedgen.clear();
    const loaded = seedgen.load(seed);
    const veto = analysis.quickRejects(loaded, nf);
    if (veto === null && scoring.passes(analysis.summarize(loaded), f) === false) {
      diff(`quickRejects false negative ${JSON.stringify(f)}`, seed, "no veto", veto);
    }
  }
}
console.log("  checked");

console.log("\n== detail agrees with summarize ==");
for (const seed of SEEDS.slice(0, 4)) {
  seedgen.clear();
  const loaded = seedgen.load(seed);
  const summary = analysis.summarize(loaded);
  const d = detail.detail(seed);   // must reuse the cached world
  if (d.geysers.length !== summary.geyserCount) diff("detail.geyserCount", seed, summary.geyserCount, d.geysers.length);
  if (d.hq.x !== summary.hq.x || d.hq.y !== summary.hq.y) diff("detail.hq", seed, summary.hq, d.hq);
  if (d.coord !== seedgen.coordFor(seed)) diff("detail.coord", seed, seedgen.coordFor(seed), d.coord);
  if (!loaded.map.element_table.length) diff("detail.elementTable", seed, "> 0", 0);
}
console.log("  geysers, hq and coord agree");

console.log("\n== one-slot cache avoids a second generate ==");
seedgen.clear();
const t0 = Date.now();
const first = seedgen.load(12695);
const t1 = Date.now();
const second = seedgen.load(12695);
const t2 = Date.now();
console.log(`  first load ${t1 - t0} ms, second load ${t2 - t1} ms, same object ${first === second}`);
if (first !== second) diff("cache", 12695, "one object", "two objects");
if (t2 - t1 > 20) diff("cache latency", 12695, "under 20 ms", `${t2 - t1} ms`);

console.log(failures === 0 ? "\nRESULT: all consistency checks passed" : `\nRESULT: ${failures} mismatches`);
process.exit(failures === 0 ? 0 : 1);
