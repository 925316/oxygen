// Worker thread: pulls seed ranges from the main thread instead of being
// handed one fixed slice. Slow seeds therefore only stall the worker that hit
// them, while idle workers keep taking work.
//
// Messages main -> worker:
//   { type: "range", start, end }   a batch of seeds; start === null means stop
//   { type: "stop" }                terminate early
// Messages worker -> main:
//   { type: "need" }                ready for another range
//   { type: "hit", data }           one accepted seed
//   { type: "progress", count }     seeds finished since the last report
//   { type: "reject", reason }      one rejected seed, tallied by condition
//   { type: "done" }                finished all work
const { parentPort, workerData } = require("node:worker_threads");
const seedgen = require("./seedgen.cjs");
const analysis = require("./analysis.cjs");
const scoring = require("./scoring.cjs");

const { filter, weights, targets } = workerData;
const normalized = scoring.normalizeFilter(filter);

let pendingRange = null;
let stop = false;

function nextRange() {
  return new Promise((resolve) => {
    pendingRange = resolve;
    parentPort.postMessage({ type: "need" });
  });
}

parentPort.on("message", (msg) => {
  if (msg.type === "range") {
    const resolve = pendingRange;
    pendingRange = null;
    if (resolve) resolve(msg.start === null ? null : msg);
  } else if (msg.type === "stop") {
    stop = true;
    const resolve = pendingRange;
    pendingRange = null;
    if (resolve) resolve(null);
  }
});

let sinceReport = 0;
function flush() {
  if (sinceReport === 0) return;
  parentPort.postMessage({ type: "progress", count: sinceReport });
  sinceReport = 0;
}

async function main() {
  for (;;) {
    if (stop) break;
    const range = await nextRange();
    if (!range) break;

    for (let seed = range.start; seed < range.end; seed++) {
      if (stop) break;

      let loaded;
      try {
        loaded = seedgen.load(seed);
      } catch {
        sinceReport++;
        continue;
      }

      const veto = analysis.quickRejects(loaded, normalized);
      if (veto) {
        parentPort.postMessage({ type: "reject", reason: veto });
      } else {
        const s = analysis.summarize(loaded);
        if (scoring.passes(s, normalized)) {
          s.score = scoring.scoreOf(s, weights, targets);
          parentPort.postMessage({ type: "hit", data: s });
        } else {
          for (const r of scoring.rejectReasons(s, normalized)) {
            parentPort.postMessage({ type: "reject", reason: r });
          }
        }
      }

      sinceReport++;
      if (sinceReport >= 16) flush();
    }
    flush();
  }

  flush();
  parentPort.postMessage({ type: "done" });
}

main();
