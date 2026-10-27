// Terminal strings for the CLI tools, matched to the browser UI so a user sees
// the same wording in both places. Run order in `labels` follows the report.
//
// Placeholders use {name} and are filled by the caller.

const TEXT = {
  zh: {
    usage: "用法: node scripts/inspect-seed.cjs <种子数字 或 完整坐标>",
    generateFailed: "生成失败: {msg}",
    coord: "坐标: {coord}",
    world: "星球: {name}  {width}x{height}  ({cells} 格)",
    timing: "耗时: {ms} ms   cluster: {cluster}",
    geysers: "【泉水】共 {n} 个",
    water: "【水源】",
    waterTotal: "总量",
    volcanoes: "【火山】",
    metals: "【金属】",
    gases: "【气体】",
    base: "【基地净空】",
    noHQ: "  无打印仓，无法判定",
    baseBlocked: "  被挡住: {type} 在基地 ({lx},{ly})，落在「{block}」区",
    baseClear: "  通过，基地内 {inside} 个泉，最近距规划区 {nearest}",
    resources: "【资源储量】",
    resourcesNote: "  注: 以上为世界生成时的静态储量，不含液体/气体池与泉的产出",
    oilWells: "【油井】{n} 个",
    traits: "【世界特质】",
    none: "无",
    junkTag: "  [废]",
    inBase: "  基地({lx},{ly})",
    countUnit: " 座",
    countItem: " 个",
    "shard.infeasible": "筛选条件无法满足: {reason}",
    "shard.start": "分片 {index}/{shards}: 种子 {from}..{to}（共 {count} 个），{threads} 线程",
    "shard.progress": "  {done}/{total}   {speed}/s   命中 {hits}   已用 {elapsed}s   ",
    "shard.wrote": "  已写入 {hits} 个命中到 {output}",
    "shard.empty": "分片 {index}/{shards}: 区间为空，跳过",
    "shard.stopped": "  到达时限，已停止: 覆盖 {from}..{to}（{done} 个），下次请从 {to} 续扫",
    "merge.done": "合并 {shards} 个分片: 扫描 {seeds} 个种子，命中 {hits} 个",
    "merge.rate": "命中率 {rate}%  分片累计耗时 {seconds}s",
    "merge.partial": "  注意: {n} 个分片到达时限提前停止，{seeds} 个种子未扫",
    "merge.filter": "筛选条件: {text}",
    "merge.noFilter": "未设筛选条件",
    "report.partial": "注意: 有 {n} 个分片到达时限提前停止，结果只覆盖已扫部分。",
    "report.baseBlocked": "被挡",
    "report.baseClear": "净空",    "filter.bigVolcano": "大火山≥{n}",
    "filter.iron": "铁火山≥{n}",    "filter.copper": "铜火山≥{n}",
    "filter.gold": "金火山≥{n}",
    "filter.totalMetal": "金属总产≥{n}",
    "filter.saltWater": "盐水≥{n}",
    "filter.cleanWater": "清水≥{n}",
    "filter.coldWater": "低温水≥{n}",
    "filter.minWater": "水总量≥{n}",
    "filter.maxJunk": "废喷孔≤{n}",
    "filter.maxNearJunk": "基地旁废喷孔≤{n}",
    "filter.requireClear": "基地 50x38 内无泉",
    "merge.row": "  #{rank} 种子={seed} 分数={score} 水={water} 清水={clean} 盐水={salt} 大火山={big} 金属={metal} 废弃={junk} 基地净空={clear}",
    "yes": "是",
    "no": "否",
  },
  en: {
    usage: "usage: node scripts/inspect-seed.cjs <seed number or full coordinate>",
    generateFailed: "generation failed: {msg}",
    coord: "Coordinate: {coord}",
    world: "World: {name}  {width}x{height}  ({cells} cells)",
    timing: "Took: {ms} ms   cluster: {cluster}",
    geysers: "[Geysers] {n} total",
    water: "[Water]",
    waterTotal: "total",
    volcanoes: "[Volcanoes]",
    metals: "[Metals]",
    gases: "[Gases]",
    base: "[Base clearance]",
    noHQ: "  no printing pod, cannot judge",
    baseBlocked: "  blocked: {type} at base ({lx},{ly}), inside the \"{block}\" zone",
    baseClear: "  clear, {inside} geysers inside the base, nearest {nearest} from the planned area",
    resources: "[Resources]",
    resourcesNote: "  note: static mass at world generation, excludes liquid/gas pools and geyser output",
    oilWells: "[Oil wells] {n}",
    traits: "[World traits]",
    none: "none",
    junkTag: "  [junk]",
    inBase: "  base({lx},{ly})",
    countUnit: " pcs",
    countItem: " pcs",
    "shard.infeasible": "filter cannot be satisfied: {reason}",
    "shard.start": "shard {index}/{shards}: seeds {from}..{to} ({count} seeds) on {threads} thread(s)",
    "shard.progress": "  {done}/{total}   {speed}/s   {hits} hits   {elapsed}s   ",
    "shard.wrote": "  wrote {hits} hits to {output}",
    "shard.empty": "shard {index}/{shards}: empty range, nothing to do",
    "shard.stopped": "  deadline reached, stopped after {from}..{to} ({done} seeds); resume from {to}",
    "merge.done": "merged {shards} shard(s): {seeds} seeds, {hits} hits",
    "merge.rate": "hit rate {rate}%  ({seconds}s of shard time)",
    "merge.partial": "  warning: {n} shard(s) stopped at the deadline, {seeds} seeds left unscanned",
    "merge.filter": "Filter: {text}",
    "merge.noFilter": "no filter",
    "report.partial": "Note: {n} shard(s) stopped at the deadline; results cover only the scanned part.",
    "report.baseBlocked": "blocked",
    "report.baseClear": "clear",
    "filter.bigVolcano": "big volcanoes >= {n}",
    "filter.iron": "iron volcano >= {n}",
    "filter.copper": "copper volcano >= {n}",
    "filter.gold": "gold volcano >= {n}",
    "filter.totalMetal": "total metal >= {n}",
    "filter.saltWater": "salt water >= {n}",
    "filter.cleanWater": "clean water >= {n}",
    "filter.coldWater": "cold water >= {n}",
    "filter.minWater": "total water >= {n}",
    "filter.maxJunk": "junk vents <= {n}",
    "filter.maxNearJunk": "junk vents near base <= {n}",
    "filter.requireClear": "no geysers inside the 50x38 base",
    "merge.row": "  #{rank} seed={seed} score={score} water={water} clean={clean} salt={salt} bigV={big} metal={metal} junk={junk} clear={clear}",
    "yes": "yes",
    "no": "no",
  },
};

// Row labels shared by the water / volcano / metal / gas sections.
const ROWS = {
  zh: {
    clean: "清水泉", salt: "盐水泉", polluted: "污水泉", slush: "低温泉", steam: "蒸汽",
    big: "火山", small: "小型火山", iron: "铁火山", copper: "铜火山", gold: "金火山",
    methane: "天然气", hydrogen: "氢气", junk: "废弃喷孔",
  },
  en: {
    clean: "Water geyser", salt: "Salt water", polluted: "Polluted water",
    slush: "Cold slush", steam: "Steam",
    big: "Volcano", small: "Minor volcano", iron: "Iron volcano",
    copper: "Copper volcano", gold: "Gold volcano",
    methane: "Natural gas", hydrogen: "Hydrogen", junk: "Junk vents",
  },
};

const SUPPORTED = ["zh", "en"];

function makeT(lang) {
  const active = SUPPORTED.includes(lang) ? lang : (String(lang ?? "").toLowerCase().startsWith("zh") ? "zh" : "en");
  const table = TEXT[active];
  const t = (key, vars) => {
    const text = table[key] ?? TEXT.en[key] ?? key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
  };
  // Callers hand t() to modules that format their own numbers; expose the
  // resolved language so those modules do not have to re-derive it.
  t.lang = active;
  return t;
}

function rowsFor(lang) {
  return SUPPORTED.includes(lang) ? ROWS[lang] : ROWS.en;
}

module.exports = { makeT, rowsFor, SUPPORTED };
