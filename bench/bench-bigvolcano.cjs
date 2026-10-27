// Compare big-volcano-only filters at the throughput level the UI actually
// uses. Measures real pass rate and real speed; no feasibility model involved.
//
// Run: node bench-bigvolcano.cjs [seeds=1000] [threads=15]
const { Scan } = require("../app/dispatcher.cjs");
const os = require("node:os");

const COUNT = Number(process.argv[2] ?? 1000);
const THREADS = Number(process.argv[3] ?? Math.max(1, os.cpus().length - 1));
const FROM = 0;

const CASES = [
  { label: "big>=1 (no small volcanoes)", filter: { bigVolcano: 1 } },
  { label: "big>=2 (no small volcanoes)", filter: { bigVolcano: 2 } },
];

function runCase({ label, filter }) {
  return new Promise((resolve) => {
    const scan = new Scan({ from: FROM, to: FROM + COUNT, filter, threads: THREADS });
    const timer = setInterval(() => {
      if (!scan.finished) return;
      clearInterval(timer);
      resolve({
        label,
        scanned: scan.done,
        hits: scan.hits.length,
        secs: (Date.now() - scan.startedAt) / 1000,
        rejected: scan.rejectionReport(),
      });
    }, 100);
  });
}

(async () => {
  console.log(`cpus=${os.cpus().length} threads=${THREADS} seeds=${COUNT}\n`);
  for (const c of CASES) {
    const r = await runCase(c);
    const rate = r.scanned / r.secs;
    const hitRate = r.hits / Math.max(1, r.scanned);
    console.log(`${r.label}`);
    console.log(`  ${r.scanned} seeds in ${r.secs.toFixed(1)}s = ${rate.toFixed(1)}/s`);
    console.log(`  hits=${r.hits}  pass rate=${(100 * hitRate).toFixed(1)}%`);
    const per100 = hitRate > 0 ? Math.ceil(100 / hitRate) : Infinity;
    console.log(`  seeds needed for 100 hits: ${per100 === Infinity ? "never" : per100.toLocaleString()}`);
    console.log(`  time for 100 hits: ${per100 === Infinity ? "-" : ((per100 / rate) / 60).toFixed(1) + " min"}`);
    console.log(`  rejection reasons: ${r.rejected.slice(0, 4).map((x) => `${x.reason}=${x.pct}%`).join(" ")}`);
    console.log("");
  }
})().then(() => process.exit(0));
