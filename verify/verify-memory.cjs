// Memory regression for the scan path.
// Run: node --expose-gc verify/verify-memory.cjs [seeds=60]
//
// Checks two things the earlier single-threaded test missed:
//   1. a worker thread must not grow the heap or RSS over a long range;
//   2. dispatched hits must not retain the generated world.
// Holding even one world per hit is what makes a real scan climb past a
// gigabyte, so RSS is sampled during the run instead of only at the end.
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const N = Number(process.argv[2] ?? 60);
const ROOT = path.join(__dirname, "..");
const mb = (b) => Math.round(b / 1024 / 1024);

if (typeof global.gc !== "function") {
  console.error("run with --expose-gc");
  process.exit(1);
}

function report(label, samples) {
  const first = samples[1] ?? samples[0];
  const last = samples[samples.length - 1];
  console.log(`\n${label}`);
  for (const s of samples) console.log(`  ${String(s.at).padStart(4)}  heap ${String(s.heap).padStart(4)}MB  rss ${String(s.rss).padStart(4)}MB`);
  return { heapGrowth: last.heap - first.heap, rssGrowth: last.rss - first.rss };
}

// --- 1. single thread ------------------------------------------------------
{
  const seedgen = require("../app/seedgen.cjs");
  const analysis = require("../app/analysis.cjs");
  const samples = [];
  for (let s = 0; s < N; s++) {
    analysis.summarize(seedgen.load(s));
    if (s % 10 === 0 || s === N - 1) {
      global.gc();
      const m = process.memoryUsage();
      samples.push({ at: s, heap: mb(m.heapUsed), rss: mb(m.rss) });
    }
  }
  report("single thread", samples);
}

// --- 2. worker thread ------------------------------------------------------
async function workerRun() {
  const limitHeap = 16;
  const limitRss = 400;
  const samples = [];
  let hits = 0;

  await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "memory-probe-worker.cjs"), {
      workerData: { from: 10000, to: 10000 + N, filter: { bigVolcano: 1 } },
    });
    const timer = setInterval(() => {
      const m = process.memoryUsage();
      samples.push({ at: samples.length, heap: mb(m.heapUsed), rss: mb(m.rss) });
    }, 500);

    worker.on("message", (msg) => {
      if (msg.type === "hit") hits++;
    });
    worker.on("exit", () => { clearInterval(timer); resolve(); });
    worker.on("error", (err) => { clearInterval(timer); reject(err); });
  });

  global.gc();
  const m = process.memoryUsage();
  samples.push({ at: samples.length, heap: mb(m.heapUsed), rss: mb(m.rss) });

  const { heapGrowth, rssGrowth } = report(`worker thread (${hits} hits)`, samples);

  const ok = heapGrowth < limitHeap && rssGrowth < limitRss;
  console.log(`\nheap growth ${heapGrowth}MB (limit ${limitHeap}), rss growth ${rssGrowth}MB (limit ${limitRss})`);
  console.log(ok ? "RESULT: no leak in the scan path" : "RESULT: scan path is retaining memory");
  process.exit(ok ? 0 : 1);
}

workerRun();
