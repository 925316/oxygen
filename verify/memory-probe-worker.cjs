// Worker used by verify-memory.cjs: scans a range and reports hits, without
// the dispatcher so the measurement covers only the generate/summarize path.
const { parentPort, workerData } = require("node:worker_threads");
const seedgen = require("../app/seedgen.cjs");
const analysis = require("../app/analysis.cjs");
const scoring = require("../app/scoring.cjs");

const { from, to, filter } = workerData;
const normalized = scoring.normalizeFilter(filter);

for (let seed = from; seed < to; seed++) {
  let loaded;
  try {
    loaded = seedgen.load(seed);
  } catch {
    continue;
  }
  if (analysis.quickRejects(loaded, normalized)) continue;
  const s = analysis.summarize(loaded);
  if (scoring.passes(s, normalized)) {
    s.score = scoring.scoreOf(s);
    parentPort.postMessage({ type: "hit", data: s });
  }
}

parentPort.postMessage({ type: "done" });
