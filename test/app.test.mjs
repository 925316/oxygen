import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const seedgen = require("../app/seedgen.cjs");
const analysis = require("../app/analysis.cjs");
const scoring = require("../app/scoring.cjs");
const base = require("../app/base-plan.cjs");
const feasibility = require("../app/feasibility.cjs");
const detail = require("../app/detail.cjs");

// Ranges are chosen so the suite stays under a minute: every distinct seed
// costs one 200-250 ms world generation.

test("coordinate format keeps all five groups after the prefix", () => {
  assert.equal(seedgen.coordFor(42), "SNDST-A-42-0-0-0-0");
  assert.equal(seedgen.coordFor("SNDST-A-42-0-0-0-0"), "SNDST-A-42-0-0-0-0");
});

test("the one-slot cache returns the same object and does not regenerate", () => {
  seedgen.clear();
  const first = seedgen.load(42);
  const t0 = Date.now();
  const second = seedgen.load(42);
  const elapsed = Date.now() - t0;
  assert.equal(first, second);
  assert.ok(elapsed < 20, `cached load took ${elapsed}ms`);
});

test("load() drops the previous world before generating", () => {
  seedgen.clear();
  const a = seedgen.load(42);
  const b = seedgen.load(43);
  assert.notEqual(a, b);
  assert.equal(seedgen.peek(42), null);
  assert.equal(seedgen.peek(43), b);
});

test("summary fields agree with a direct recount of the geysers", () => {
  seedgen.clear();
  const loaded = seedgen.load(12695);
  const s = analysis.summarize(loaded);
  const geysers = loaded.world.geysers;

  const kg = (g) => (g.scaled_rate ?? 0) / 1000;
  const big = geysers.filter((g) => g.type === "big_volcano").length;
  const metal = geysers.filter((g) => ["molten_iron", "molten_copper", "molten_gold"].includes(g.type)).length;

  assert.equal(s.bigVolcano, big);
  assert.equal(s.iron + s.copper + s.gold, metal);
  assert.equal(s.geyserCount, geysers.length);
  assert.ok(Math.abs(s.water - geysers
    .filter((g) => ["steam", "hot_steam", "hot_water", "salt_water", "filthy_water", "slush_water", "slush_salt_water"].includes(g.type))
    .reduce((a, g) => a + kg(g), 0)) < 1e-9);
});

test("quickRejects never rejects a seed that passes the full filter", () => {
  seedgen.clear();
  const loaded = seedgen.load(12695);
  const s = analysis.summarize(loaded);
  const filters = [
    {},
    { bigVolcano: 0 },
    { minWater: 0 },
    { requireClear: true },
  ];
  for (const f of filters) {
    const veto = analysis.quickRejects(loaded, scoring.normalizeFilter(f));
    if (scoring.passes(s, f)) assert.equal(veto, null, `unexpected veto ${veto} for ${JSON.stringify(f)}`);
  }
});

test("base plan: a geyser at the pod is inside the frame and rejected", () => {
  const hq = { x: 128, y: 190 };
  const pod = base.toLocal({ x: 128, y: 190 }, hq);
  assert.equal(pod.lx, base.POD_LOCAL_X);
  assert.equal(pod.ly, base.POD_LOCAL_Y_BOTTOM);
  // The protected regions tile the whole 50x38 frame, so every cell inside it
  // has a name: a geyser on the pod's own bottom-left cell is a rejection, and
  // so is one anywhere else inside the base.
  assert.equal(base.blockAt(pod.lx, pod.ly).name, "pod");
  assert.equal(base.blockAt(38, 35).name, "pod");
  assert.equal(base.blockAt(0, 0).name, "left");
  for (let lx = 0; lx < base.BASE_W; lx++) {
    for (let ly = 0; ly < base.BASE_H; ly++) {
      assert.ok(base.blockAt(lx, ly), `cell (${lx},${ly}) inside the frame has no block`);
    }
  }
});

test("base plan: distance is zero inside a block and positive outside", () => {
  assert.equal(base.blockDistance(10, 35), 0);
  assert.ok(base.blockDistance(-5, 35) > 0);
});

test("base plan: the pod is the origin of the near-base distances", () => {
  assert.equal(base.podDistance(base.POD_LOCAL_X, base.POD_LOCAL_Y_BOTTOM), 0);
  assert.equal(base.podDistance(base.POD_LOCAL_X + 3, base.POD_LOCAL_Y_BOTTOM - 4), 4);
  // Crowding only prices geysers inside the frame or just outside its edge.
  assert.ok(base.crowding(10, 10) > 0);
  assert.equal(base.crowding(base.POD_LOCAL_X + 100, base.POD_LOCAL_Y_BOTTOM), 0);
});

test("base plan: junk vents are counted inside a band around the frame", () => {
  const hq = { x: 128, y: 190 };
  // (hq.x + dx, hq.y) maps to local x = 32 + dx, local y = 37: the bottom row,
  // which is inside the frame for dx 0..17.
  const inside = [8, 9, 10].map((dx) => ({ type: "steam", x: hq.x + dx, y: hq.y }));
  const insideJunk = { type: "chlorine_gas", x: hq.x + 5, y: hq.y };
  const farJunk = { type: "oil_drip", x: hq.x + 200, y: hq.y };
  const plan = base.judge([...inside, insideJunk, farJunk], hq);
  assert.equal(plan.inside, 4);
  assert.equal(plan.nearJunk, 1);
  assert.equal(plan.blocked, true);
  assert.deepEqual(plan.near.map((g) => g.type).sort(), ["chlorine_gas", "steam", "steam", "steam"]);
});

test("feasibility: impossible filters are refused", () => {
  assert.equal(feasibility.check({ ...scoring.DEFAULT_FILTER, bigVolcano: 5 }).impossible, true);
  assert.equal(feasibility.check({ ...scoring.DEFAULT_FILTER, maxJunk: 0 }).impossible, true);
  assert.equal(feasibility.check({ ...scoring.DEFAULT_FILTER, bigVolcano: 2 }).impossible, false);
});

test("feasibility: tighter filters never predict a higher rate", () => {
  const loose = feasibility.estimateRate({ ...scoring.DEFAULT_FILTER, bigVolcano: 1 });
  const strict = feasibility.estimateRate({ ...scoring.DEFAULT_FILTER, bigVolcano: 1, minWater: 15 });
  assert.ok(strict <= loose, `strict ${strict} > loose ${loose}`);
});

test("detail reuses the cache instead of regenerating", () => {
  seedgen.clear();
  const first = detail.detail(383);
  const second = detail.detail(383);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.ms, first.ms);
  assert.equal(second.coord, seedgen.coordFor(383));
  assert.ok(second.geysers.length > 0);
  assert.ok(second.world.oilWells >= 0);
});

test("scoring is monotonic in water", () => {
  const a = { clean: 1, salt: 0, slush: 0, polluted: 0, steam: 0, volcanoRate: 0, smallVolcano: 0, ironRate: 0, copperRate: 0, goldRate: 0, methane: 0, hydrogen: 0, junkCount: 0 };
  const b = { ...a, clean: 5 };
  assert.ok(scoring.scoreOf(b) > scoring.scoreOf(a));
});

test("weights can be overridden without touching the algorithm", () => {
  const s = { clean: 10, salt: 0, slush: 0, polluted: 0, steam: 0, volcanoRate: 0, smallVolcano: 0, ironRate: 0, copperRate: 0, goldRate: 0, methane: 0, hydrogen: 0, junkCount: 0 };
  const normal = scoring.scoreOf(s);
  const doubled = scoring.scoreOf(s, { water: 70 });
  assert.ok(doubled > normal);
});
