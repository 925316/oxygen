// Seed analysis: one loaded world -> one flat summary object.
// The summary is the single shape consumed by filters, scoring, the results
// table and the CSV export, so all of them agree on every field.
const types = require("./geyser-types.cjs");
const base = require("./base-plan.cjs");

const kgPerS = types.kgPerS;

function sumRates(geysers, wanted) {
  let total = 0;
  for (const g of geysers) if (wanted.has(g.type)) total += kgPerS(g);
  return total;
}

function countTypes(geysers, wanted) {
  let n = 0;
  for (const g of geysers) if (wanted.has(g.type)) n++;
  return n;
}

const WATER_SET = types.WATER_SET;
const JUNK_SET = types.JUNK_SET;
const METAL_SET = types.METAL_SET;
const CLEAN_SET = new Set(types.CLEAN);
const SALT_SET = new Set(types.SALT);
const POLLUTED_SET = new Set(types.POLLUTED);
const SLUSH_SET = new Set(types.SLUSH);
const STEAM_SET = new Set(types.STEAM);
const METHANE_SET = new Set(types.METHANE);
const HYDROGEN_SET = new Set(types.HYDROGEN);
const COLD_SET = new Set(types.COLD);
const BIG_SET = new Set(["big_volcano"]);
const SMALL_SET = new Set(["small_volcano"]);
const IRON_SET = new Set(["molten_iron"]);
const COPPER_SET = new Set(["molten_copper"]);
const GOLD_SET = new Set(["molten_gold"]);

// Analyze a loaded seed. `loaded` is the object returned by seedgen.load().
function summarize(loaded) {
  const { world, coord, map } = loaded;
  const hq = base.findHQ(world.buildings);
  if (!hq) {
    const err = new Error(`no Headquarters building in ${coord}`);
    err.code = "NO_HQ";
    throw err;
  }

  const geysers = world.geysers ?? [];
  const plan = base.judge(geysers, hq);

  return {
    seed: map.seed,
    coord,
    hq: { x: hq.x, y: hq.y },
    geyserCount: geysers.length,

    water: sumRates(geysers, WATER_SET),
    clean: sumRates(geysers, CLEAN_SET),
    salt: sumRates(geysers, SALT_SET),
    polluted: sumRates(geysers, POLLUTED_SET),
    slush: sumRates(geysers, SLUSH_SET),
    cold: sumRates(geysers, COLD_SET),
    coldCount: countTypes(geysers, COLD_SET),
    steam: sumRates(geysers, STEAM_SET),

    volcanoRate: sumRates(geysers, BIG_SET),
    bigVolcano: countTypes(geysers, BIG_SET),
    smallVolcano: countTypes(geysers, SMALL_SET),

    metal: sumRates(geysers, METAL_SET),
    iron: countTypes(geysers, IRON_SET),
    copper: countTypes(geysers, COPPER_SET),
    gold: countTypes(geysers, GOLD_SET),
    ironRate: sumRates(geysers, IRON_SET),
    copperRate: sumRates(geysers, COPPER_SET),
    goldRate: sumRates(geysers, GOLD_SET),

    methane: sumRates(geysers, METHANE_SET),
    hydrogen: sumRates(geysers, HYDROGEN_SET),
    junkCount: countTypes(geysers, JUNK_SET),

    nearest: plan.nearest,
    near: plan.near.map((g) => ({ type: g.type, lx: g.lx, ly: g.ly, pod: g.pod, crowding: g.crowding })),
    crowding: plan.near.reduce((a, g) => a + g.crowding, 0),
    nearJunk: plan.nearJunk,
    blocked: plan.blocked,
    blockedBy: plan.blockedBy,
  };
}

function nearJunkCount(geysers, hq, radius) {
  if (!hq || radius >= 99) return 0;
  let n = 0;
  for (const g of geysers) {
    if (!JUNK_SET.has(g.type)) continue;
    const { lx, ly } = base.toLocal(g, hq);
    if (base.frameDistance(lx, ly) <= radius) n++;
  }
  return n;
}

// Reject on the cheap fields before allocating a summary object. Returns the
// name of the first failing condition, or null when the seed survives. Missing
// HQ is reported as a rejection rather than thrown.
function quickRejects(loaded, filter) {
  const world = loaded.world;
  const hq = base.findHQ(world.buildings);
  const geysers = world.geysers ?? [];

  let bigVolcano = 0;
  let iron = 0;
  let copper = 0;
  let gold = 0;
  let junkCount = 0;
  let water = 0;
  let clean = 0;
  let salt = 0;
  let cold = 0;

  for (const g of geysers) {
    switch (g.type) {
      case "big_volcano": bigVolcano++; break;
      case "molten_iron": iron++; break;
      case "molten_copper": copper++; break;
      case "molten_gold": gold++; break;
      default:
        if (JUNK_SET.has(g.type)) junkCount++;
    }
    if (WATER_SET.has(g.type)) water += kgPerS(g);
    if (g.type === "hot_water") clean += kgPerS(g);
    else if (g.type === "salt_water") salt += kgPerS(g);
    if (COLD_SET.has(g.type)) cold += kgPerS(g);
  }

  if (bigVolcano < (filter.bigVolcano ?? 0)) return "bigVolcano";
  if (iron < (filter.iron ?? 0) || copper < (filter.copper ?? 0) || gold < (filter.gold ?? 0)) return "metalCounts";
  if (water < (filter.minWater ?? 0)) return "water";
  if (salt < (filter.saltWater ?? 0)) return "salt";
  if (clean < (filter.cleanWater ?? 0)) return "clean";
  if (cold < (filter.coldWater ?? 0)) return "cold";
  if (junkCount > (filter.maxJunk ?? 99)) return "junk";
  if (!hq) return "noHQ";

  if (filter.requireClear !== false) {
    for (const g of geysers) {
      const { lx, ly } = base.toLocal(g, hq);
      if (base.inBase(lx, ly)) return "blocked";
    }
  }
  if (nearJunkCount(geysers, hq, filter.maxNearJunk ?? 99) > (filter.maxNearJunk ?? 99)) return "nearJunk";
  return null;
}

module.exports = { summarize, quickRejects };
