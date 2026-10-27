// Memory of the real dispatcher with its full worker count.
// Run: node --expose-gc verify/verify-scan-memory.cjs [seeds=400]
//
// A single worker stays flat, but every worker owns a WASM instance, and the
// sum of fifteen of them is what the UI actually runs. This measures RSS while
// scanning and reports where the floor is.
const os = require("node:os");
const { Scan } = require("../app/dispatcher.cjs");

const N = Number(process.argv[2] ?? 400);
const mb = (b) => Math.round(b / 1024 / 1024);

const scan = new Scan({
  from: 0,
  to: N,
  filter: { bigVolcano: 1 },
  threads: Math.max(1, os.cpus().length - 1),
});

console.log(`seeds ${N}, threads ${scan.threadLimit}`);
const samples = [];

const timer = setInterval(() => {
  const m = process.memoryUsage();
  const p = scan.progress();
  samples.push({ done: p.done, rss: mb(m.rss) });
  if (p.running) return;

  clearInterval(timer);
  const peak = Math.max(...samples.map((s) => s.rss));
  const last = samples[samples.length - 1];
  console.log(`peak rss ${peak}MB after ${p.done} seeds, hits ${p.hits}`);
  console.log(`per worker: ~${Math.round(peak / scan.threadLimit)}MB`);
  process.exit(0);
}, 1000);
