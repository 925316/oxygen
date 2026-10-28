// Scoring and threshold filters, kept apart from analysis so results can be
// reweighted without touching how a seed is measured.
//
// Scores are relative ranking values, not absolute quality: every axis is
// normalized against a fixed target so numbers stay comparable between runs.
// The weights follow community consensus on Terra: cold water first, then
// total water, then metal volcanoes and natural gas. Big volcanoes are a
// preference floor, not a quality axis.
const types = require("./geyser-types.cjs");

const DEFAULT_WEIGHTS = {
  water: 30,
  cold: 20,
  volcano: 10,
  metal: 15,
  gas: 12,
  junkPenalty: 1,
  nearJunkPenalty: 3,
  crowdingPenalty: 1.5,
};

const DEFAULT_TARGETS = {
  water: 14,
  cold: 2,
  volcano: 4,
  metal: 1.5,
  gas: 0.3,
};

// Fallback used when no filter file is given. It mirrors
// config/default-filter.json on purpose: a caller that forgets the file must
// not silently scan with every gate at zero.
const DEFAULT_FILTER = {
  bigVolcano: 1,
  iron: 1,
  copper: 0,
  gold: 1,
  totalMetal: 0,
  saltWater: 0,
  cleanWater: 2,
  coldWater: 2,
  minWater: 16,
  maxJunk: 3,
  maxNearJunk: 0,
  requireClear: true,
  requireTower: true,
};

// Water is priced by what it costs to use it, and the community ranks it the
// same way: cold water needs nothing, clean water only needs cooling, the rest
// need desalination or filtering before they are worth anything.
function waterValue(s) {
  return s.clean * 1.0 + s.salt * 0.8 + (s.slush ?? 0) * 1.0 + (s.polluted ?? 0) * 0.5 + (s.steam ?? 0) * 0.3;
}

function scoreOf(s, weights = {}, targets = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const t = { ...DEFAULT_TARGETS, ...targets };

  const waterAxis = Math.min(waterValue(s) / t.water, 1) * w.water;
  const coldAxis = Math.min((s.cold ?? s.slush ?? 0) / t.cold, 1) * w.cold;
  const volcanoAxis = Math.min((s.volcanoRate + (s.smallVolcano ?? 0) * 0.3) / t.volcano, 1) * w.volcano;
  const metalAxis = Math.min(((s.ironRate ?? 0) * 1.0 + (s.copperRate ?? 0) * 0.8 + (s.goldRate ?? 0) * 1.2) / t.metal, 1) * w.metal;
  const gasAxis = Math.min(((s.methane ?? 0) * 0.7 + (s.hydrogen ?? 0) * 0.3) / t.gas, 1) * w.gas;

  const score = waterAxis + coldAxis + volcanoAxis + metalAxis + gasAxis
    - (s.junkCount ?? 0) * w.junkPenalty
    - (s.nearJunk ?? 0) * w.nearJunkPenalty
    - (s.crowding ?? 0) / 100 * w.crowdingPenalty;
  return Math.round(score * 10) / 10;
}

function normalizeFilter(filter = {}) {
  const f = { ...DEFAULT_FILTER };
  for (const k of Object.keys(DEFAULT_FILTER)) {
    if (filter[k] !== undefined && filter[k] !== null && filter[k] !== "") f[k] = filter[k];
  }
  return f;
}

function passes(s, rawFilter = {}) {
  const f = normalizeFilter(rawFilter);
  if (f.requireClear && s.blocked) return false;
  if (f.requireTower && s.towerBlocked) return false;
  if (s.bigVolcano < f.bigVolcano) return false;
  if (s.iron < f.iron || s.copper < f.copper || s.gold < f.gold) return false;
  if (s.metal < f.totalMetal) return false;
  if (s.salt < f.saltWater) return false;
  if (s.clean < f.cleanWater) return false;
  if ((s.cold ?? 0) < f.coldWater) return false;
  if (s.water < f.minWater) return false;
  if (s.junkCount > f.maxJunk) return false;
  if ((s.nearJunk ?? 0) > f.maxNearJunk) return false;
  return true;
}

// Every failing condition, so the UI can show why a seed was dropped.
function rejectReasons(s, rawFilter = {}) {
  const f = normalizeFilter(rawFilter);
  const out = [];
  if (f.requireClear && s.blocked) out.push("blocked");
  if (f.requireTower && s.towerBlocked) out.push("tower");
  if (s.bigVolcano < f.bigVolcano) out.push("bigVolcano");
  if (s.iron < f.iron) out.push("iron");
  if (s.copper < f.copper) out.push("copper");
  if (s.gold < f.gold) out.push("gold");
  if (s.metal < f.totalMetal) out.push("metalTotal");
  if (s.salt < f.saltWater) out.push("salt");
  if (s.clean < f.cleanWater) out.push("clean");
  if ((s.cold ?? 0) < f.coldWater) out.push("cold");
  if (s.water < f.minWater) out.push("water");
  if (s.junkCount > f.maxJunk) out.push("junk");
  if ((s.nearJunk ?? 0) > f.maxNearJunk) out.push("nearJunk");
  return out;
}

module.exports = {
  DEFAULT_WEIGHTS, DEFAULT_TARGETS, DEFAULT_FILTER,
  waterValue, scoreOf, normalizeFilter, passes, rejectReasons,
};
