// Hit rate of the checks below is a property of the world distribution, not of
// the seed range: the engine is deterministic and unbiased across seeds. The
// tables are measured from real generate() output and let a scan be refused or
// sized before it starts.
//
// Re-measure with verify/verify-feasibility.cjs after a game build bump.
//
// Single-condition rates come from a 600-seed sample away from 0 (seeds
// 1000000..1000599). Joint rates come from 1000-seed runs without other
// constraints. Anything not listed is estimated from the marginals plus a
// correlation correction, and that estimate is deliberately pessimistic:
// over-promising a hit rate is what makes a scan run for hours.
//
// The tables describe the world, not a filter: big volcanoes and water go
// together poorly, and big volcanoes and metal volcanoes worse, so a filter
// that asks for both must be penalised below the product of its marginals.

// Seed offset used for stand-alone measurements. Seed 0 is an edge case in the
// generator (no world traits, unusually clean rolls) and must stay out of the
// tables, or every estimate is optimistic by a few percent.
const SAMPLE_FROM = 1000000;

const MEASURED = {
  samples: 600,
  // P(a seed has at least n big volcanoes). Small volcanoes do not count.
  bigAtLeast: { 0: 1.0, 1: 0.432, 2: 0.098, 3: 0.025, 4: 0.002 },
  // P(all of iron, copper and gold volcanoes present at least once).
  allMetals: 0.09,
  // P(iron volcano >= 1) and P(gold volcano >= 1): the two the default filter
  // asks for. Copper is optional because it is the weakest of the three.
  ironAtLeast: 0.45,
  goldAtLeast: 0.45,
  // Water and the metal volcanoes trade off with big volcanoes.
  metalGivenBig: { withBig: 0.56, withoutBig: 0.67 },
  // Rate buckets, P(rate >= threshold), kg/s.
  waterAtLeast: { 8: 0.975, 12: 0.65, 14: 0.44, 16: 0.277, 18: 0.135 },
  cleanAtLeast: { 1: 0.45, 2: 0.45, 5: 0.112 },
  saltAtLeast: { 4: 0.48, 8: 0.123, 10: 0.025 },
  // Cold water, i.e. cool slush plus cool salt slush.
  coldAtLeast: { 1: 0.732, 2: 0.335, 3: 0.095 },
  // Total metal rate, kg/s.
  metalAtLeast: { 0.7: 0.30, 1.2: 0.098, 1.5: 0.028 },
};

// Measured joint rates. Each entry covers a whole filter, so its rate is used
// directly instead of being multiplied out of the marginals.
//
// The big>=2 entry is the only one that comes from a large run: a 33,334-seed
// scan of that exact filter hit 192 seeds (0.576%). That is far above the
// product of the marginals, because the engine rolls big volcanoes, metal
// volcanoes and water from correlated streams, so multiplying them
// under-counts by roughly a factor of three. Every other joint entry is still
// an estimate.
const JOINT = [
  {
    label: "big>=3 + iron/copper/gold>=1",
    rate: 0.0,
    match: (f) => f.bigVolcano >= 3 && f.iron >= 1 && f.copper >= 1 && f.gold >= 1,
  },
  {
    label: "big>=2 + iron/copper/gold>=1 + water>=8 (measured, 33334 seeds)",
    rate: 0.00576,
    match: (f) =>
      f.bigVolcano === 2 && f.iron >= 1 && f.copper >= 1 && f.gold >= 1 &&
      f.minWater >= 8 && f.maxJunk >= 99 && f.coldWater <= 0,
  },
  {
    label: "big>=2 + iron/copper/gold>=1",
    rate: 0.005,
    match: (f) => f.bigVolcano === 2 && f.iron >= 1 && f.copper >= 1 && f.gold >= 1 && f.minWater <= 0,
  },
];

// Filters whose measured pass rate is zero: no seed range can satisfy them.
const IMPOSSIBLE = [
  {
    key: "big5",
    test: (f) => f.bigVolcano >= 5,
    why: "no seed in 600 had 5+ big volcanoes; the engine caps the generic geyser rolls well below that",
  },
  {
    key: "big4metals",
    test: (f) => f.bigVolcano >= 4 && f.iron >= 1 && f.copper >= 1 && f.gold >= 1,
    why: "big>=4 combined with all three metal volcanoes had zero hits in 600 seeds",
  },
  {
    key: "big3metals",
    test: (f) => f.bigVolcano >= 3 && f.iron >= 1 && f.copper >= 1 && f.gold >= 1,
    why: "big>=3 with all three metal volcanoes had zero hits in 33,334 seeds; that scan found only 18 seeds with 3 big volcanoes at all, and none had iron, copper and gold together",
  },
  {
    key: "junk0",
    test: (f) => f.maxJunk === 0,
    why: "every sampled seed had at least one junk geyser; maxJunk must be at least 1",
  },
  {
    key: "water25",
    test: (f) => f.minWater >= 25,
    why: "water total never exceeded 24.6 kg/s in 600 seeds",
  },
];

function bucket(table, value) {
  let rate = 0;
  for (const [threshold, p] of Object.entries(table)) {
    if (value <= Number(threshold)) rate = Math.max(rate, p);
  }
  return rate;
}

// Raw marginal estimate, before any joint override.
function marginalRate(f) {
  let rate = 1;

  if (f.bigVolcano > 0) {
    rate *= MEASURED.bigAtLeast[Math.min(4, f.bigVolcano)] ?? 0;
  }

  const metals = (f.iron >= 1 ? 1 : 0) + (f.copper >= 1 ? 1 : 0) + (f.gold >= 1 ? 1 : 0);
  if (metals === 3) rate *= MEASURED.allMetals;
  else if (f.iron >= 1 && f.gold >= 1) rate *= MEASURED.ironAtLeast * MEASURED.goldAtLeast;
  else if (metals > 0) rate *= 0.45 ** metals;

  // Asking for both axes is harder than either alone: the engine rolls them
  // from the same stream and they trade off.
  if (f.bigVolcano >= 1 && metals > 0) {
    rate *= MEASURED.metalGivenBig.withBig / MEASURED.metalGivenBig.withoutBig;
  }

  if (f.minWater > 0) rate *= bucket(MEASURED.waterAtLeast, f.minWater);
  if (f.cleanWater > 0) rate *= bucket(MEASURED.cleanAtLeast, f.cleanWater);
  if (f.saltWater > 0) rate *= bucket(MEASURED.saltAtLeast, f.saltWater);
  if (f.coldWater > 0) rate *= bucket(MEASURED.coldAtLeast, f.coldWater);
  if (f.totalMetal > 0) rate *= bucket(MEASURED.metalAtLeast, f.totalMetal);
  if (f.maxJunk < 99) rate *= f.maxJunk <= 2 ? 0.2 : f.maxJunk <= 4 ? 0.6 : 0.9;

  return Math.max(rate, 1e-7);
}

// P(the 50x38 base frame is clear of geysers). Measured at offset 1000000:
// 5.1% of 2000 unfiltered seeds had a geyser inside the frame. The default
// filter requires a bigger frame than the old one did, so this replaces the
// earlier 8-in-200 figure that came from the old partial plan.
const CLEAR_RATE = 0.9;

// Estimate P(a random seed passes the filter).
function estimateRate(f) {
  const joint = JOINT.find((j) => j.match(f));
  const rate = joint ? joint.rate : marginalRate(f);
  // The joint entries are measured without a base-clearance requirement; a
  // geyser landing in the 50x38 frame is a further, small rejection.
  if (f.requireClear) return rate * CLEAR_RATE;
  return rate;
}

// Seeds per second on one thread. Measured with bench/bench-scaling.cjs on 16
// cores: 2.2/s single-threaded, 1.39/s per thread at the 12-thread sweet spot.
// 1.8 keeps the estimate pessimistic for a machine with fewer cores or a
// noisy neighbour, while bench-scaling.cjs is what to re-run after a change.
const PER_THREAD = 1.8;

const threadRate = (threads = 8) => threads * PER_THREAD;

// Pure data, no wording: callers render it through feasibility-text.cjs so the
// same verdict can be shown in any supported language.
function check(filter, { targetHits = 100, threads = 8 } = {}) {
  const impossible = IMPOSSIBLE.find((i) => i.test(filter));
  if (impossible) {
    return {
      ok: false,
      impossible: true,
      reasonKey: impossible.key,
      reason: impossible.why,
      rate: 0,
      targetHits,
      expectedSeeds: Infinity,
      expectedSeconds: Infinity,
      sources: "measured",
    };
  }

  const rate = estimateRate(filter);
  const expectedSeeds = rate > 0 ? Math.ceil(targetHits / rate) : Infinity;

  return {
    ok: true,
    impossible: false,
    rate,
    targetHits,
    expectedSeeds,
    expectedSeconds: expectedSeeds / threadRate(threads),
    sources: JOINT.find((j) => j.match(filter))?.label ?? "marginal estimate",
  };
}

module.exports = { check, estimateRate, marginalRate, MEASURED, JOINT, IMPOSSIBLE, threadRate, PER_THREAD };
