// Thread scaling benchmark: one fixed seed range, scanned at several thread
// counts, reporting throughput and the speedup curve.
//
// Run: node bench/bench-scaling.cjs [seedsPerStep=300] [steps=1,2,4,8,12,16]
//
// Seeds per step is deliberately small: the point is the shape of the scaling
// curve, not a long run. Each step is a fresh Scan, so the fixed cost of
// spawning workers is included, which is what a CI shard pays too.
const os = require("node:os");
const { Scan } = require("../app/dispatcher.cjs");

const COUNT = Number(process.argv[2] ?? 300);
const STEPS = (process.argv[3] ?? "1,2,4,8,12,16")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const FROM = Number(process.argv[4] ?? 5000000);

function measure(threads) {
  return new Promise((resolve) => {
    const scan = new Scan({ from: FROM, to: FROM + COUNT, filter: {}, weights: {}, targets: {}, threads });
    const timer = setInterval(() => {
      if (!scan.finished) return;
      clearInterval(timer);
      const secs = (Date.now() - scan.startedAt) / 1000;
      resolve({ threads, scanned: scan.done, secs, rate: scan.done / secs });
    }, 100);
  });
}

(async () => {
  const cores = os.cpus().length;
  console.log(`cores=${cores}  seeds per step=${COUNT}  range=${FROM}..${FROM + COUNT - 1}\n`);
  console.log("threads   scanned   seconds   seeds/s   vs 1T   efficiency");

  const rows = [];
  for (const threads of STEPS) {
    const r = await measure(threads);
    rows.push(r);
    const base = rows[0].rate;
    const speedup = r.rate / base;
    const efficiency = r.threads === rows[0].threads ? 1 : speedup / r.threads;
    console.log(
      `${String(threads).padStart(6)}   ${String(r.scanned).padStart(7)}   ${r.secs.toFixed(1).padStart(7)}   ` +
      `${r.rate.toFixed(1).padStart(7)}   ${speedup.toFixed(2).padStart(6)}   ${(efficiency * 100).toFixed(0).padStart(3)}%`,
    );
  }

  const best = rows.reduce((a, b) => (b.rate > a.rate ? b : a));
  const half = Math.max(1, Math.floor(cores / 2));
  const halfRow = rows.find((r) => r.threads === half);
  console.log(`\nbest: ${best.threads} threads at ${best.rate.toFixed(1)}/s`);
  if (halfRow) {
    const ratio = best.rate / halfRow.rate;
    console.log(`half cores (${half} threads): ${halfRow.rate.toFixed(1)}/s, all-core best is ${ratio.toFixed(2)}x of that`);
  }
  console.log(`seeds per second per thread at best: ${(best.rate / best.threads).toFixed(2)}`);
  process.exit(0);
})();
