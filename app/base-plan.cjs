// Base plan geometry. Coordinates are local to the base frame: origin at the
// top-left corner, X to the right, Y downward.
//
// The frame is pinned to the starting-base template, not to the Headquarters:
// the template anchors at (hq.x, hq.y + 1), so local y = POD_LOCAL_Y_BOTTOM -
// (y - hq.y) puts the anchor row at 0 and the top-left of the reserved area at
// (0, 0). Pod placement comes from the game's own template
// (StreamingAssets/templates/bases/sandstoneBase.yaml): its floor spans anchor
// dx -3..4 at dy -2 and the Headquarters sits on dx 0, dy -1.
const types = require("./geyser-types.cjs");
const JUNK_SET = types.JUNK_SET;

const BASE_W = 50;
const BASE_H = 38;

// The tower is a 3-wide vertical shaft the player wants to run from the top of
// the map to the bottom. It sits left of centre: 25 columns to its left, the
// shaft itself, then 22 columns to its right, which is 25 + 3 + 22 = 50. Its
// local x is fixed; its y is not, because the shaft spans the whole world and
// not just the 38-row base frame.
const TOWER_X0 = 25;
const TOWER_X1 = 27;
const TOWER_LEFT_W = TOWER_X0;
const TOWER_RIGHT_W = BASE_W - TOWER_X1 - 1;

// The pod occupies 4x2 cells; the plan reserves a 4x4 block around it, which
// is why the reserved regions below are larger than the footprint.
const POD_LOCAL_X = 32;
const POD_LOCAL_Y_BOTTOM = 37;
// Game-space offset from the Headquarters to the base template anchor.
const HQ_TO_ANCHOR_DY = 1;

// Regions that must stay free of geysers. Together they tile the whole 50x38
// frame, so `blockAt` is never null inside it: any geyser landing inside the
// base is a rejection, not only one on a protected cell.
const BLOCKS = [
  { name: "left", x0: 0, x1: TOWER_X0 - 1, y0: 0, y1: 37 },
  { name: "tower", x0: TOWER_X0, x1: TOWER_X1, y0: 0, y1: 37 },
  { name: "mid", x0: TOWER_X1 + 1, x1: 31, y0: 0, y1: 37 },
  { name: "gap", x0: 32, x1: 39, y0: 0, y1: 31 },
  { name: "pod", x0: 32, x1: 39, y0: 32, y1: 37 },
  { name: "vertical", x0: 40, x1: 49, y0: 0, y1: 37 },
];

const BLOCK_LABEL = {
  pod: "打印仓旁",
  vertical: "垂直区域",
  gap: "打印仓上方",
  left: "左侧区域",
  tower: "通天塔通道",
  mid: "通道右侧区域",
};

// How close a geyser crowds a build plan, as a 0-100 cost. Only geysers inside
// the frame or a few cells outside its edge earn a non-zero value: further out
// a stockpile or a wall is enough, and nothing has to be worked around.
const CROWD_RADIUS = 3;

function crowding(lx, ly) {
  const frame = frameDistance(lx, ly);
  if (frame > CROWD_RADIUS) return 0;
  return Math.round((100 * (CROWD_RADIUS - frame + 1)) / (CROWD_RADIUS + 1));
}

// Chebyshev distance from a local cell to the pod. 0 is the pod's own cell.
function podDistance(lx, ly) {
  return Math.max(Math.abs(lx - POD_LOCAL_X), Math.abs(ly - POD_LOCAL_Y_BOTTOM));
}

// The shaft ignores y: it runs the full height of the world, and `ly` from
// toLocal already spans the whole map, not just the base frame.
function inTower(lx) {
  return lx >= TOWER_X0 && lx <= TOWER_X1;
}

// World cell -> local base cell.
function toLocal(geyser, hq) {
  return {
    lx: POD_LOCAL_X + (geyser.x - hq.x),
    ly: POD_LOCAL_Y_BOTTOM - (geyser.y - hq.y),
  };
}

function inBase(lx, ly) {
  return lx >= 0 && lx < BASE_W && ly >= 0 && ly < BASE_H;
}

function blockAt(lx, ly) {
  return BLOCKS.find((b) => lx >= b.x0 && lx <= b.x1 && ly >= b.y0 && ly <= b.y1) ?? null;
}

// Grid distance from the base frame edge to the nearest cell. A geyser inside
// the frame is at distance 0. Used to price "near the base" as a band rather
// than a yes/no.
function frameDistance(lx, ly) {
  return Math.max(0, -lx, lx - (BASE_W - 1), -ly, ly - (BASE_H - 1));
}

// Chebyshev distance from a local cell to the nearest protected region.
function blockDistance(lx, ly) {
  let best = Infinity;
  for (const b of BLOCKS) {
    const dx = lx < b.x0 ? b.x0 - lx : lx > b.x1 ? lx - b.x1 : 0;
    const dy = ly < b.y0 ? b.y0 - ly : ly > b.y1 ? ly - b.y1 : 0;
    best = Math.min(best, Math.max(dx, dy));
  }
  return best;
}

// Classify every geyser against the base frame in one pass.
// `near` lists the geysers that crowd the build plan: inside the frame, or
// within `radius` cells of its edge. `nearest` is the distance to the nearest
// one. Geysers are sorted by a 2D Chebyshev distance to the pod, not by their
// distance to the frame, because a geyser 4 cells above the frame edge can be
// as far from the pod as one 30 cells to the side.
// `nearJunk` counts junk geysers within `junkRadius` cells of the frame edge:
// a junk vent next to the base is a net negative, since it occupies terrain
// and pushes heat or gas toward the colony.
function judge(geysers, hq, { junkRadius = 60, radius = 40 } = {}) {
  const near = [];
  let nearest = Infinity;
  let nearJunk = 0;
  let inside = 0;
  // The shaft spans the whole map, so it is checked against every geyser and
  // not just the ones near the base frame.
  const towerHits = [];

  for (const g of geysers) {
    const { lx, ly } = toLocal(g, hq);
    if (inTower(lx)) towerHits.push({ type: g.type, lx, ly });
    const frame = frameDistance(lx, ly);
    if (JUNK_SET.has(g.type) && frame <= junkRadius) nearJunk++;
    if (inBase(lx, ly)) inside++;
    if (frame > radius) continue;

    const block = inBase(lx, ly) ? blockAt(lx, ly) : null;
    const a = podDistance(lx, ly);
    nearest = Math.min(nearest, a);
    near.push({ type: g.type, lx, ly, frame, pod: a, block: block?.name ?? null, crowding: crowding(lx, ly, radius) });
  }

  near.sort((a, b) => a.pod - b.pod || a.frame - b.frame || a.lx - b.lx || a.ly - b.ly);
  const blockedBy = near.find((g) => g.frame === 0 && g.block) ?? null;

  return {
    blocked: blockedBy !== null,
    blockedBy,
    nearest: nearest === Infinity ? -1 : nearest,
    near,
    nearJunk,
    inside,
    towerHits,
    towerBlocked: towerHits.length > 0,
  };
}

function findHQ(buildings) {
  return (buildings ?? []).find((b) => b.tag === "Headquarters") ?? null;
}

module.exports = {
  BASE_W, BASE_H, POD_LOCAL_X, POD_LOCAL_Y_BOTTOM, BLOCKS, BLOCK_LABEL, CROWD_RADIUS,
  TOWER_X0, TOWER_X1, TOWER_LEFT_W, TOWER_RIGHT_W,
  toLocal, inBase, inTower, blockAt, blockDistance, frameDistance, podDistance, crowding, judge, findHQ,
};
