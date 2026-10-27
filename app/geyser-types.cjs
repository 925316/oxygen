// Game vocabulary: what a geyser type is, how it is grouped, what it is worth.
// Pure data plus tiny predicates. No generation, no geometry.
const kgPerS = (g) => (g.scaled_rate ?? 0) / 1000;

const WATER = ["steam", "hot_steam", "hot_water", "salt_water", "filthy_water", "slush_water", "slush_salt_water"];
const JUNK = ["chlorine_gas", "hot_co2", "liquid_co2", "hot_po2", "slimy_po2", "oil_drip"];
const VOLCANO = ["big_volcano", "small_volcano"];
const METAL = ["molten_iron", "molten_copper", "molten_gold"];

const SALT = ["salt_water"];
const POLLUTED = ["filthy_water"];
const SLUSH = ["slush_water", "slush_salt_water"];
// Cold water is the strongest quality signal the community agrees on: the same
// rate is both a water source and free cooling, so it is tracked on its own.
const COLD = ["slush_water", "slush_salt_water"];
const CLEAN = ["hot_water"];
const STEAM = ["steam", "hot_steam"];
const METHANE = ["methane"];
const HYDROGEN = ["hot_hydrogen"];

// Processing cost of each water type, used by scoring. Clean is free; salt
// needs desalination, slush needs thawing, polluted needs filtering.
const WATER_VALUE = {
  hot_water: 1.0,
  salt_water: 0.8,
  slush_water: 1.0,
  slush_salt_water: 0.9,
  filthy_water: 0.5,
  steam: 0.3,
  hot_steam: 0.3,
};

// Display names are Chinese on purpose: they are shown to the user verbatim.
const NAMES = {
  steam: "低温蒸汽喷孔", hot_steam: "蒸汽喷孔", hot_water: "清水泉",
  salt_water: "盐水泉", filthy_water: "污水泉", slush_water: "低温泥浆泉",
  slush_salt_water: "低温盐泥泉", molten_iron: "铁火山", molten_copper: "铜火山",
  molten_gold: "金火山", molten_aluminum: "铝火山", big_volcano: "火山",
  small_volcano: "小型火山", methane: "天然气泉", chlorine_gas: "氯气喷孔",
  hot_hydrogen: "氢气喷孔", hot_co2: "二氧化碳喷孔", liquid_co2: "二氧化碳泉",
  hot_po2: "高温污氧喷孔", slimy_po2: "含菌污氧喷孔", oil_drip: "渗油裂缝",
};

// Elements worth reporting in the seed detail view.
const RESOURCE_ELEMENTS = ["CrudeOil", "Magma", "Lead", "Wolframite", "Ice", "Sand", "Algae", "Coal", "Diamond"];

const WATER_SET = new Set(WATER);
const JUNK_SET = new Set(JUNK);
const METAL_SET = new Set(METAL);
const VOLCANO_SET = new Set(VOLCANO);

module.exports = {
  kgPerS,
  WATER, JUNK, VOLCANO, METAL,
  WATER_SET, JUNK_SET, METAL_SET, VOLCANO_SET,
  CLEAN, SALT, POLLUTED, SLUSH, STEAM, COLD, METHANE, HYDROGEN,
  WATER_VALUE, NAMES, RESOURCE_ELEMENTS,
};
