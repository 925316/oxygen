// Unit tests for the CI scan driver: range splitting, argument validation and
// merge coverage.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRIVER = path.join(ROOT, "scripts", "ci-scan.cjs");

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [DRIVER, ...args], { cwd: ROOT }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code ?? 1 : 0, stdout, stderr });
    });
  });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oni-ci-"));
}

function emptyShard(index, shards, from, to) {
  return { index, shards, range: { from, to }, scanned: to - from, hits: [], rejected: [], finished: true };
}

test("shard slices partition the range with no gaps or overlaps", async () => {
  const dir = tempDir();
  const seen = new Set();
  for (let index = 0; index < 4; index++) {
    const out = path.join(dir, `shard-${index}.json`);
    const result = await run([
      "shard", "--from", "0", "--to", "3", "--shards", "4", "--index", String(index), "--output", out,
    ]);
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(fs.readFileSync(out, "utf8"));
    for (let seed = payload.range.from; seed < payload.range.to; seed++) {
      assert.ok(!seen.has(seed), `seed ${seed} appears in two shards`);
      seen.add(seed);
    }
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test("the exclusive upper bound is one past the highest valid seed", async () => {
  const result = await run([
    "shard", "--from", "2147483600", "--to", "2147483649", "--shards", "1", "--index", "0",
  ]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /highest valid seed is 2147483647/);
});

test("index outside the shard count is rejected", async () => {
  const result = await run(["shard", "--from", "0", "--to", "100", "--shards", "4", "--index", "4"]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /--index must be in \[0, 3\]/);
});

test("equal from and to is rejected", async () => {
  const result = await run(["shard", "--from", "10", "--to", "10", "--shards", "1", "--index", "0"]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /must be greater than/);
});

test("merge refuses to run with a missing shard", async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shard-0.json"), JSON.stringify(emptyShard(0, 2, 0, 5)));
  const result = await run(["merge", "--inputs", dir, "--output", path.join(dir, "hits.json")]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /missing shard\(s\): 1/);
});

test("merge detects a coverage gap", async () => {
  const dir = tempDir();
  for (let i = 0; i < 2; i++) {
    fs.writeFileSync(path.join(dir, `shard-${i}.json`), JSON.stringify({
      ...emptyShard(i, 2, i * 5, i * 5 + 5), scanned: 4,
    }));
  }
  const result = await run(["merge", "--inputs", dir, "--output", path.join(dir, "hits.json")]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /coverage mismatch/);
});

test("merge deduplicates seeds and ranks by score", async () => {
  const dir = tempDir();
  const hit = (seed, score) => ({
    seed, score, water: 10, clean: 1, salt: 1, bigVolcano: 2, metal: 1, junkCount: 0, blocked: false,
  });
  fs.writeFileSync(path.join(dir, "shard-0.json"), JSON.stringify({
    ...emptyShard(0, 2, 0, 5),
    hits: [hit(1, 10), hit(2, 30)],
    rejected: [{ reason: "water", count: 3, pct: 60 }],
  }));
  fs.writeFileSync(path.join(dir, "shard-1.json"), JSON.stringify({
    ...emptyShard(1, 2, 5, 10),
    hits: [hit(9, 20), hit(2, 25)],
    rejected: [{ reason: "water", count: 4, pct: 80 }],
  }));

  const out = path.join(dir, "hits.json");
  const result = await run(["merge", "--inputs", dir, "--output", out]);
  assert.equal(result.code, 0, result.stderr);

  const summary = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(summary.hitCount, 3);
  assert.deepEqual(summary.hits.map((h) => h.seed), [2, 9, 1]);
  assert.equal(summary.rejected.find((r) => r.reason === "water").count, 7);
});
