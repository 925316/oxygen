// Measure detail-view cost end to end.
// Run: node bench/bench-detail.cjs [seeds=5]
//
// Both views of a seed must share one generation; generating twice per page
// is the failure this benchmark guards against.
const { performance } = require("node:perf_hooks");
const seedgen = require("../app/seedgen.cjs");
const analysis = require("../app/analysis.cjs");
const detail = require("../app/detail.cjs");

const SEEDS = [0, 42, 12695, 48731, 604729236].slice(0, Number(process.argv[2] ?? 5));
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const load = [];
const rest = [];
for (const seed of SEEDS) {
  seedgen.clear();
  let t = performance.now();
  const loaded = seedgen.load(seed);
  load.push(performance.now() - t);

  t = performance.now();
  analysis.summarize(loaded);
  detail.detail(seed);
  rest.push(performance.now() - t);
}

console.log(`generate (load) : ${avg(load).toFixed(0)} ms  [${load.map((x) => x.toFixed(0)).join(", ")}]`);
console.log(`summarize+detail: ${avg(rest).toFixed(1)} ms`);
console.log(`total           : ${(avg(load) + avg(rest)).toFixed(0)} ms`);
