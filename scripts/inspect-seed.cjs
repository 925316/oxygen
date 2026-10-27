// Single-seed inspector: prints a full profile for any coordinate.
//
// Usage:
//   node scripts/inspect-seed.cjs 12695
//   node scripts/inspect-seed.cjs SNDST-A-12695-0-0-0-0 --lang en
//
// Language comes from --lang, then ONI_LANG, then Chinese.

const seedgen = require("../app/seedgen.cjs");
const types = require("../app/geyser-types.cjs");
const base = require("../app/base-plan.cjs");
const locales = require("../app/locales.cjs");
const cli = require("../app/cli-text.cjs");

const argv = process.argv.slice(2);
let seedArg = null;
let langArg = process.env.ONI_LANG;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--lang" || argv[i] === "-l") langArg = argv[++i];
  else if (!seedArg) seedArg = argv[i];
}

const lang = locales.normalizeLang(langArg);
const t = cli.makeT(lang);
const rows = cli.rowsFor(lang);

// Full-width characters occupy two terminal columns; pad by display width so
// the columns line up regardless of whether the console renders CJK as wide.
function displayWidth(s) {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0) > 0x7f ? 2 : 1;
  return w;
}

function pad(s, n) {
  return s + " ".repeat(Math.max(0, n - displayWidth(s)));
}

function main() {
  if (!seedArg) {
    console.error(t("usage"));
    process.exit(1);
  }

  let loaded;
  try {
    loaded = seedgen.load(seedArg);
  } catch (err) {
    console.error(t("generateFailed", { msg: err.message }));
    process.exit(1);
  }

  const { map, world, coord, ms } = loaded;
  const hq = base.findHQ(world.buildings);
  const hqPoint = hq ? { x: hq.x, y: hq.y } : { x: 0, y: 0 };
  const geysers = world.geysers ?? [];
  const kg = types.kgPerS;
  const name = (type) => locales.geyserName(type, lang);
  const count = (type) => geysers.filter((g) => g.type === type).length;
  const rate = (list) => geysers.filter((g) => list.includes(g.type)).reduce((a, g) => a + kg(g), 0);
  const bar = "=".repeat(62);

  console.log(bar);
  console.log(t("coord", { coord }));
  console.log(t("world", { name: world.name, width: world.width, height: world.height, cells: world.width * world.height }));
  console.log(t("timing", { ms, cluster: map.cluster_id }));
  console.log(bar);

  console.log(`\n${t("geysers", { n: geysers.length })}\n`);
  const sorted = [...geysers].sort((a, b) => kg(b) - kg(a));
  for (const g of sorted) {
    const cell = pad(name(g.type), 18);
    const junk = types.JUNK_SET.has(g.type) ? t("junkTag") : "";
    const { lx, ly } = base.toLocal(g, hqPoint);
    const where = base.inBase(lx, ly) ? t("inBase", { lx, ly }) : "";
    console.log(`  ${cell}${kg(g).toFixed(3).padStart(7)} kg/s  (${g.x}, ${g.y})${where}${junk}`);
  }

  console.log(`\n${t("water")}`);
  console.log(`  ${pad(t("waterTotal"), 14)}${rate(types.WATER).toFixed(2)} kg/s`);
  console.log(`  ${pad(rows.clean, 14)}${rate(types.CLEAN).toFixed(2)} kg/s  x${count("hot_water")}`);
  console.log(`  ${pad(rows.salt, 14)}${rate(types.SALT).toFixed(2)} kg/s  x${count("salt_water")}`);
  console.log(`  ${pad(rows.polluted, 14)}${rate(types.POLLUTED).toFixed(2)} kg/s  x${count("filthy_water")}`);
  console.log(`  ${pad(rows.slush, 14)}${rate(types.SLUSH).toFixed(2)} kg/s  x${count("slush_water") + count("slush_salt_water")}`);
  console.log(`  ${pad(rows.steam, 14)}${rate(types.STEAM).toFixed(2)} kg/s  x${count("steam") + count("hot_steam")}`);

  console.log(`\n${t("volcanoes")}`);
  console.log(`  ${pad(rows.big, 14)}${count("big_volcano")}${t("countUnit")}   ${rate(["big_volcano"]).toFixed(2)} kg/s`);
  console.log(`  ${pad(rows.small, 14)}${count("small_volcano")}${t("countUnit")}   ${rate(["small_volcano"]).toFixed(2)} kg/s`);

  console.log(`\n${t("metals")}`);
  for (const [label, type] of [[rows.iron, "molten_iron"], [rows.copper, "molten_copper"], [rows.gold, "molten_gold"]]) {
    console.log(`  ${pad(label, 14)}${count(type)}${t("countUnit")}   ${rate([type]).toFixed(3)} kg/s`);
  }

  console.log(`\n${t("gases")}`);
  console.log(`  ${pad(rows.methane, 14)}${rate(types.METHANE).toFixed(3)} kg/s  x${count("methane")}`);
  console.log(`  ${pad(rows.hydrogen, 14)}${rate(types.HYDROGEN).toFixed(3)} kg/s  x${count("hot_hydrogen")}`);
  console.log(`  ${pad(rows.junk, 14)}${geysers.filter((g) => types.JUNK_SET.has(g.type)).length}${t("countItem")}`);

  const plan = base.judge(geysers, hqPoint);
  console.log(`\n${t("base")}`);
  if (!hq) {
    console.log(t("noHQ"));
  } else if (plan.blocked) {
    const b = plan.blockedBy;
    console.log(t("baseBlocked", {
      type: name(b.type), lx: b.lx, ly: b.ly,
      block: locales.blockName(b.block, lang),
    }));
  } else {
    console.log(t("baseClear", { inside: plan.inside, nearest: plan.nearest < 0 ? t("none") : plan.nearest }));
  }

  const masses = new Map();
  const idx = world.element_idx;
  const table = map.element_table;
  const mass = world.mass;
  for (let i = 0; i < idx.length; i++) {
    const el = table[idx[i]];
    masses.set(el, (masses.get(el) ?? 0) + mass[i]);
  }
  console.log(`\n${t("resources")}`);
  for (const el of types.RESOURCE_ELEMENTS) {
    const kg = masses.get(el);
    if (!kg) continue;
    console.log(`  ${pad(el, 14)}${Math.round(kg).toLocaleString(lang === "zh" ? "zh-CN" : "en-US").padStart(14)} kg`);
  }
  console.log(t("resourcesNote"));

  const oilWells = (world.other_entities ?? []).filter((e) => e.tag === "OilWell").length;
  console.log(`\n${t("oilWells", { n: oilWells })}`);
  console.log(`\n${t("traits")}${world.world_traits?.length ? world.world_traits.join(", ") : t("none")}`);
  console.log(bar);
}

main();
