// One journal entry per scan, so a run can be printed, exported or inspected
// without the caller keeping its own bookkeeping.
const seedgen = require("./seedgen.cjs");
const analysis = require("./analysis.cjs");
const scoring = require("./scoring.cjs");

function open({ filter, weights, targets } = {}) {
  return {
    filter: scoring.normalizeFilter(filter),
    weights: weights ?? {},
    targets: targets ?? {},
    startedAt: Date.now(),
    scanned: 0,
    rejected: {},
    hits: [],
    finished: false,
  };
}

// Scan a seed range on the current thread. `onProgress(done, total)` fires
// every `reportEvery` seeds; `shouldStop()` is polled for cancellation.
function run(journal, from, to, { onProgress, shouldStop, reportEvery = 25 } = {}) {
  const total = Math.max(0, to - from);
  let done = 0;

  for (let seed = from; seed < to; seed++) {
    if (shouldStop && shouldStop()) break;

    let loaded;
    try {
      loaded = seedgen.load(seed);
    } catch {
      journal.scanned++;
      done++;
      continue;
    }

    // Cheap rejection first: most seeds die here without building a summary.
    const veto = analysis.quickRejects(loaded, journal.filter);
    if (veto) {
      journal.rejected[veto] = (journal.rejected[veto] ?? 0) + 1;
    } else {
      const s = analysis.summarize(loaded);
      if (scoring.passes(s, journal.filter)) {
        s.score = scoring.scoreOf(s, journal.weights, journal.targets);
        journal.hits.push(s);
      } else {
        for (const r of scoring.rejectReasons(s, journal.filter)) {
          journal.rejected[r] = (journal.rejected[r] ?? 0) + 1;
        }
      }
    }

    journal.scanned++;
    done++;
    if (onProgress && done % reportEvery === 0) onProgress(done, total);
  }

  if (onProgress) onProgress(done, total);
  journal.finished = true;
  return journal;
}

function sortedHits(journal) {
  return [...journal.hits].sort((a, b) => b.score - a.score);
}

// Human-readable rejection breakdown, sorted by frequency.
function rejectionReport(journal) {
  return Object.entries(journal.rejected)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      count,
      pct: journal.scanned ? Math.round((count / journal.scanned) * 1000) / 10 : 0,
    }));
}

module.exports = { open, run, sortedHits, rejectionReport };
