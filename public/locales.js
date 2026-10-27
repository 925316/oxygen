// Shared locale tables. Loaded by the browser through public/i18n.js and by
// Node code through app/locales.cjs, so a geyser is named the same way in the
// UI, the server and the CLI.
//
// Keys are the engine's own ids; a missing key falls back to the id.
(function (root) {
  "use strict";

  const GEYSER_NAMES = {
    zh: {
      steam: "低温蒸汽喷孔", hot_steam: "蒸汽喷孔", hot_water: "清水泉",
      salt_water: "盐水泉", filthy_water: "污水泉", slush_water: "低温泥浆泉",
      slush_salt_water: "低温盐泥泉", molten_iron: "铁火山", molten_copper: "铜火山",
      molten_gold: "金火山", molten_aluminum: "铝火山", big_volcano: "火山",
      small_volcano: "小型火山", methane: "天然气泉", chlorine_gas: "氯气喷孔",
      hot_hydrogen: "氢气喷孔", hot_co2: "二氧化碳喷孔", liquid_co2: "二氧化碳泉",
      hot_po2: "高温污氧喷孔", slimy_po2: "含菌污氧喷孔", oil_drip: "渗油裂缝",
    },
    en: {
      steam: "Cool Steam Vent", hot_steam: "Steam Vent", hot_water: "Water Geyser",
      salt_water: "Salt Water Geyser", filthy_water: "Polluted Water Vent",
      slush_water: "Cool Slush Geyser", slush_salt_water: "Cool Salt Slush Geyser",
      molten_iron: "Iron Volcano", molten_copper: "Copper Volcano",
      molten_gold: "Gold Volcano", molten_aluminum: "Aluminum Volcano",
      big_volcano: "Volcano", small_volcano: "Minor Volcano",
      methane: "Natural Gas Geyser", chlorine_gas: "Chlorine Gas Vent",
      hot_hydrogen: "Hydrogen Vent", hot_co2: "Carbon Dioxide Vent",
      liquid_co2: "Carbon Dioxide Geyser", hot_po2: "Infectious Polluted Oxygen Vent",
      slimy_po2: "Slimy Polluted Oxygen Vent", oil_drip: "Leaky Oil Fissure",
    },
  };

  const BLOCK_NAMES = {
    zh: { horizontal: "水平区域", pod: "打印仓旁", vertical: "垂直区域", gap: "打印仓上方", left: "左侧区域" },
    en: { horizontal: "Horizontal zone", pod: "Beside pod", vertical: "Vertical zone", gap: "Above pod", left: "Left zone" },
  };

  const REJECT_NAMES = {
    zh: {
      bigVolcano: "大火山不足", iron: "铁火山不足", copper: "铜火山不足", gold: "金火山不足",
      metalCounts: "金属不足", metalTotal: "金属不足",
      water: "水不足", salt: "盐水不足", clean: "清水不足", cold: "低温水不足",
      junk: "废喷孔超限", nearJunk: "基地旁废喷孔过多", blocked: "基地被挡", noHQ: "无打印仓",
    },
    en: {
      bigVolcano: "too few big volcanoes", iron: "not enough iron volcano",
      copper: "not enough copper volcano", gold: "not enough gold volcano",
      metalCounts: "not enough metal", metalTotal: "not enough metal",
      water: "not enough water", salt: "not enough salt water", clean: "not enough clean water",
      cold: "not enough cold water",
      junk: "too many junk vents", nearJunk: "too many junk vents near the base",
      blocked: "base blocked", noHQ: "no printing pod",
    },
  };

  // Why a filter was judged unreachable. A verdict carries reasonKey so the
  // sentence can be rendered in whichever language is active.
  const WHY = {
    zh: {
      big5: "抽样的 600 个种子里没有出现 5 座以上大火山；通用喷孔的抽取上限远低于此",
      big4metals: "大火山≥4 同时要求铁/铜/金三座火山，600 个种子零命中",
      big3metals: "大火山≥3 同时要求铁/铜/金三座火山：3.3 万种子扫描里大火山≥3 的只有 18 个，且都没有三种金属齐全",
      junk0: "抽样的种子都至少有一个废弃喷孔；废弃喷孔上限至少要设 1",
      water25: "600 个种子中水总量最高未超过 24.6 kg/s",
    },
    en: {
      big5: "no seed in 600 had 5+ big volcanoes; the generic geyser rolls cap well below that",
      big4metals: "big volcanoes >= 4 together with all three metal volcanoes had zero hits in 600 seeds",
      big3metals: "big volcanoes >= 3 with all three metal volcanoes: a 33,334-seed scan found only 18 seeds with 3+ big volcanoes, none with the full metal set",
      junk0: "every sampled seed had at least one junk vent; the junk limit must be at least 1",
      water25: "water total never exceeded 24.6 kg/s in 600 seeds",
    },
  };

  const SUPPORTED = ["zh", "en"];

  const api = { GEYSER_NAMES, BLOCK_NAMES, REJECT_NAMES, WHY, SUPPORTED };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ONI_LOCALES = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
