// Derive the pod footprint from the game's own starting-base template instead
// of assuming it. The template places its anchor at (hq.x, hq.y + 1), so every
// cell's local offset is relative to that point.
//
// Run: node profile-pod.cjs [seeds=30]
const { worldgen } = require("@onimaxxing/worldgen-node");

const N = Number(process.argv[2] ?? 30);
const coord = (s) => `SNDST-A-${s}-0-0-0-0`;

const hqOffsets = new Map();
const podCells = new Set();
const wallCells = new Set();
let anchorDx = new Map();

for (let s = 0; s < N; s++) {
  const m = worldgen.generate(coord(s));
  if (!m || m.error || m.failure) continue;
  const w = m.worlds.find((x) => x.is_starting);
  const hq = (w.buildings ?? []).find((b) => b.tag === "Headquarters");
  const base = (w.template_placements ?? []).find((p) => p.rule === "starting_base");
  if (!hq || !base) continue;

  hqOffsets.set(`${hq.x - base.x},${hq.y - base.y}`, (hqOffsets.get(`${hq.x - base.x},${hq.y - base.y}`) ?? 0) + 1);

  for (const b of w.buildings ?? []) {
    const dx = b.x - base.x;
    const dy = b.y - base.y;
    if (b.tag === "Tile") podCells.add(`${dx},${dy}`);
    if (b.tag === "ExteriorWall") wallCells.add(`${dx},${dy}`);
  }
}

console.log(`seeds sampled: ${N}`);
console.log("hq offset from template anchor:", JSON.stringify([...hqOffsets.entries()]));

const byDy = (set) => {
  const rows = {};
  for (const c of set) {
    const [x, y] = c.split(",").map(Number);
    (rows[y] ??= []).push(x);
  }
  return rows;
};

console.log("\nTile cells relative to anchor (dx, dy):");
const tiles = byDy(podCells);
for (const dy of Object.keys(tiles).sort((a, b) => Number(a) - Number(b))) {
  const xs = tiles[dy].sort((a, b) => a - b);
  console.log(`  dy=${String(dy).padStart(3)}  dx=${xs.join(",")}`);
}

console.log("\nExteriorWall cells relative to anchor:");
const walls = byDy(wallCells);
for (const dy of Object.keys(walls).sort((a, b) => Number(a) - Number(b))) {
  const xs = walls[dy].sort((a, b) => a - b);
  console.log(`  dy=${String(dy).padStart(3)}  dx=${Math.min(...xs)}..${Math.max(...xs)} (${xs.length} cells)`);
}
