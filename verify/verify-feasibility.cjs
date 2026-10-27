// Validate the feasibility model against real scans.
// Run: node verify-feasibility.cjs [seeds=200]
//
// The rule that matters: a verdict of "impossible" must never be wrong, and a
// verdict of "possible" must not be wildly optimistic, because that is what
// makes a user leave a scan running for hours.
const seedgen = require("../app/seedgen.cjs");
const analysis = require("../app/analysis.cjs");
const scoring = require("../app/scoring.cjs");
const feasibility = require("../app/feasibility.cjs");

const N = Number(process.argv[2] ?? 300);

const CASES = [
  { filter: { bigVolcano: 1 }, label: "big>=1" },
  { filter: { bigVolcano: 2 }, label: "big>=2" },
  { filter: { bigVolcano: 3 }, label: "big>=3" },
  { filter: { bigVolcano: 4 }, label: "big>=4" },
  { filter: { iron: 1, copper: 1, gold: 1 }, label: "metals>=1 each" },
  { filter: { bigVolcano: 2, iron: 1, copper: 1, gold: 1 }, label: "big>=2 + metals" },
  { filter: { bigVolcano: 3, iron: 1, copper: 1, gold: 1 }, label: "big>=3 + metals" },
  { filter: { minWater: 12 }, label: "water>=12" },
  { filter: { minWater: 12, bigVolcano: 2 }, label: "water>=12 + big>=2" },
  { filter: { bigVolcano: 5 }, label: "big>=5 (impossible)" },
  { filter: { maxJunk: 0 }, label: "junk==0 (impossible)" },
];

console.log(`measuring each filter over ${N} seeds...\n`);
console.log("filter                              predicted   measured  verdict");

let failures = 0;
const rows = [];
for (const c of CASES) {
  const pred = feasibility.check(c.filter, { targetHits: 100, threads: 15 });
  let hits = 0;
  let valid = 0;
  for (let s = 0; s < N; s++) {
    seedgen.clear();
    let loaded;
    try { loaded = seedgen.load(s); } catch { continue; }
    valid++;
    if (analysis.quickRejects(loaded, scoring.normalizeFilter(c.filter))) continue;
    if (scoring.passes(analysis.summarize(loaded), c.filter)) hits++;
  }
  const measured = hits / Math.max(1, valid);

  let verdict = "ok";
  if (pred.impossible && hits > 0) {
    verdict = "WRONG: said impossible but hits exist";
    failures++;
  } else if (!pred.impossible && hits === 0) {
    // Predicting possible when nothing shows up in the sample is only a real
    // error if the predicted rate would have produced hits here.
    if (pred.rate * valid >= 3) {
      verdict = "WRONG: predicted hits, measured zero";
      failures++;
    } else {
      verdict = "ok (below detection limit)";
    }
  } else if (!pred.impossible && measured > 0) {
    const ratio = pred.rate / measured;
    if (ratio > 3) verdict = `optimistic x${ratio.toFixed(1)}`;
    else if (ratio < 1 / 3) verdict = `pessimistic x${ratio.toFixed(1)}`;
  }

  rows.push({ label: c.label, pred: pred.impossible ? "IMPOSSIBLE" : `${(100 * pred.rate).toFixed(2)}%`, measured: `${(100 * measured).toFixed(2)}%`, verdict });
  console.log(
    `${c.label.padEnd(34)} ${rows[rows.length - 1].pred.padStart(10)} ${rows[rows.length - 1].measured.padStart(10)}  ${verdict}`
  );
}

console.log(failures === 0
  ? "\nRESULT: no wrong verdicts"
  : `\nRESULT: ${failures} wrong verdict(s)`);
process.exit(failures === 0 ? 0 : 1);
