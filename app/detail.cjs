// Full per-seed breakdown for the detail view.
// Same one-slot cache as analysis.summarize(), so opening a seed after a scan
// hit reuses the world that produced it.
const seedgen = require("./seedgen.cjs");
const types = require("./geyser-types.cjs");
const base = require("./base-plan.cjs");
const locales = require("./locales.cjs");

const kgPerS = types.kgPerS;

// element_idx holds dense table indices, so resolve each index once.
function elementMass(world, table) {
  const out = new Map();
  const idx = world.element_idx;
  const mass = world.mass;
  const names = [];
  for (let i = 0; i < idx.length; i++) {
    let el = names[idx[i]];
    if (el === undefined) { el = table[idx[i]]; names[idx[i]] = el; }
    out.set(el, (out.get(el) ?? 0) + mass[i]);
  }
  return out;
}

function detail(seed, lang) {
  // peek() before load() tells us whether the world was already in memory;
  // load() returns the same object either way, so it cannot report this itself.
  const hit = seedgen.peek(seed) !== null;
  const loaded = seedgen.load(seed);
  const { map, world, coord, ms } = loaded;
  const hq = base.findHQ(world.buildings);
  const hqPoint = hq ? { x: hq.x, y: hq.y } : { x: 0, y: 0 };

  const geysers = (world.geysers ?? []).map((g) => {
    const { lx, ly } = base.toLocal(g, hqPoint);
    const inside = base.inBase(lx, ly);
    const block = base.blockAt(lx, ly)?.name ?? null;
    return {
      type: g.type,
      name: locales.geyserName(g.type, lang),
      rate: kgPerS(g),
      x: g.x,
      y: g.y,
      lx,
      ly,
      inBase: inside,
      block,
      blockName: block ? locales.blockName(block, lang) : null,
      junk: types.JUNK_SET.has(g.type),
    };
  });

  const masses = hq ? elementMass(world, map.element_table) : new Map();
  const resources = {};
  for (const el of types.RESOURCE_ELEMENTS) {
    const kg = Math.round(masses.get(el) ?? 0);
    if (kg > 0) resources[el] = kg;
  }

  return {
    seed: map.seed,
    coord,
    ms,
    cached: hit,
    elementTableSize: map.element_table.length,
    world: {
      name: world.name,
      width: world.width,
      height: world.height,
      traits: world.world_traits ?? [],
      oilWells: (world.other_entities ?? []).filter((e) => e.tag === "OilWell").length,
    },
    hq: hq ? { x: hq.x, y: hq.y } : null,
    geysers,
    resources,
  };
}

module.exports = { detail, elementMass };
