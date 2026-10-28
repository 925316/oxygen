// Dynamic seed-range dispatcher.
//
// A worker is not handed one static slice; it asks for a small batch whenever
// it runs dry. A slow seed therefore only delays the worker that hit it, and
// fast workers keep taking more work instead of idling at the end.
const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const WORKER_FILE = path.join(__dirname, "scan-worker.cjs");

// Seeds per work item. Small enough to balance the load across workers, large
// enough that the postMessage round trip stays negligible next to ~220 ms of
// work per seed.
const DEFAULT_BATCH = 4;

class Scan {
  constructor({ from, to, filter, weights, targets, threads, batch = DEFAULT_BATCH, topN = 0 }) {
    this.from = from;
    this.to = to;
    this.cursor = from;
    this.batch = Math.max(1, batch);
    this.total = Math.max(0, to - from);
    this.startedAt = Date.now();
    this.done = 0;
    this.hits = [];
    this.hitTotal = 0;
    // A long scan can pass millions of seeds, so the hit list is capped. The
    // cap is applied when the buffer grows past twice the limit, which keeps
    // the sort cost amortised instead of paid on every hit.
    this.topN = Math.max(0, topN);
    this.rejected = {};
    this.workers = [];
    this.finished = false;
    this.stopped = false;
    this.threadLimit = threads ?? Math.max(1, os.cpus().length - 1);

    const count = Math.min(this.threadLimit, Math.max(1, Math.ceil(this.total / this.batch)));
    this.remaining = count;

    for (let i = 0; i < count; i++) {
      const w = new Worker(WORKER_FILE, { workerData: { filter, weights, targets } });
      this.workers.push(w);

      // A worker reports "done" and then exits; count each worker exactly once.
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        this.workerEnded();
      };

      w.on("message", (msg) => {
        if (msg.type === "need") {
          w.postMessage({ type: "range", ...this.nextRange() });
          return;
        }
        this.onMessage(msg);
        if (msg.type === "done") settle();
      });
      w.on("error", settle);
      w.on("exit", settle);
    }
  }

  nextRange() {
    if (this.stopped || this.cursor >= this.to) return { start: null };
    const start = this.cursor;
    const end = Math.min(this.to, start + this.batch);
    this.cursor = end;
    return { start, end };
  }

  onMessage(msg) {
    switch (msg.type) {
      case "progress": this.done += msg.count; break;
      case "hit": this.addHit(msg.data); break;
      case "reject": this.rejected[msg.reason] = (this.rejected[msg.reason] ?? 0) + 1; break;
      default: break;
    }
  }

  addHit(hit) {
    this.hitTotal++;
    this.hits.push(hit);
    if (this.topN <= 0) return;
    // Trim lazily: only once the buffer is twice the cap, so the sort is paid
    // once per topN hits rather than on every accepted seed.
    if (this.hits.length <= this.topN * 2) return;
    this.hits.sort((a, b) => b.score - a.score || a.seed - b.seed);
    this.hits.length = this.topN;
  }

  workerEnded() {
    this.remaining--;
    if (this.remaining <= 0) {
      this.finished = true;
      this.workers = [];
    }
  }

  stop() {
    this.stopped = true;
    for (const w of this.workers) {
      w.postMessage({ type: "stop" });
      w.terminate();
    }
    this.workers = [];
    this.finished = true;
  }

  progress() {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    return {
      running: !this.finished,
      total: this.total,
      done: Math.min(this.done, this.total),
      hits: this.hitTotal,
      kept: this.hits.length,
      speed: elapsed > 0 ? this.done / elapsed : 0,
      elapsed,
      threads: this.threadLimit,
      rejected: this.rejectionReport(),
    };
  }

  rejectionReport() {
    const scanned = Math.max(1, this.done);
    return Object.entries(this.rejected)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count, pct: Math.round((count / scanned) * 1000) / 10 }));
  }

  sortedHits() {
    return [...this.hits].sort((a, b) => b.score - a.score);
  }
}

module.exports = { Scan, DEFAULT_BATCH };
