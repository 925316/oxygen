// End-to-end server check. Run: node verify/verify-server.cjs
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PORT = 7810;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(url, { method = "GET", payload } = {}) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? null : JSON.stringify(payload);
    const headers = body
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      : {};
    const t0 = Date.now();
    const req = http.request(url, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { raw }; }
        resolve({ status: res.statusCode, ms: Date.now() - t0, body: parsed });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const post = (url, payload) => request(url, { method: "POST", payload });

(async () => {
  const existing = await request(`${BASE}/api/config`).catch(() => null);
  if (existing) {
    console.error(`port ${PORT} already in use -- stop the process listening on it first`);
    process.exit(2);
  }

  const child = spawn(process.execPath, [path.join(ROOT, "server.cjs")], {
    env: { ...process.env, PORT: String(PORT), NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = false;
  child.stdout.on("data", (d) => { if (String(d).includes("running at")) ready = true; });
  child.stderr.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 40 && !ready; i++) await sleep(100);

  let failures = 0;
  const check = (label, cond, extra = "") => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
    if (!cond) failures++;
  };

  try {
    // First generate in a process pays WASM instantiation; measure the warm path.
    const warm = await request(`${BASE}/api/seed/42`);
    check("GET /api/seed/42", warm.status === 200 && warm.body.geysers.length > 0, `cold ${warm.ms}ms`);

    const cfg = await request(`${BASE}/api/config`);
    check("GET /api/config", cfg.status === 200 && cfg.body.baseW === 50, `${cfg.ms}ms`);

    // Ask for the same seed twice: the second response must report a cache hit
    // rather than a fresh generation. A wall-clock bound cannot tell "slow
    // machine" from "generated twice"; the reported flag can.
    const first = await request(`${BASE}/api/seed/48731`);
    const second = await request(`${BASE}/api/seed/48731`);
    check("detail reports a cold generation first", first.body.cached === false, `ms=${first.body.ms}`);
    check("detail reuses the cached world", second.body.cached === true);
    check("cached detail returns the same generated world", second.body.ms === first.body.ms,
      `generation took ${first.body.ms}ms, reused without regenerating`);

    const f1 = await post(`${BASE}/api/feasibility`, { filter: { bigVolcano: 2 } });
    check("feasibility big>=2 is possible", f1.status === 200 && f1.body.ok === true, `${f1.ms}ms rate=${f1.body?.rate}`);
    check("feasibility text is Chinese", typeof f1.body?.text === "string" && /命中率/.test(f1.body.text), f1.body?.text);

    const f2 = await post(`${BASE}/api/feasibility`, { filter: { bigVolcano: 5 } });
    check("feasibility big>=5 is impossible", f2.status === 200 && f2.body.impossible === true, `${f2.ms}ms`);

    const blocked = await post(`${BASE}/api/scan`, { from: 0, count: 10, filter: { bigVolcano: 5 } });
    check("scan refuses impossible filter", blocked.status === 422, `status=${blocked.status}`);

    const scan = await post(`${BASE}/api/scan`, { from: 0, count: 300, filter: { bigVolcano: 1 } });
    check("scan accepts big>=1", scan.status === 200 && scan.body.total === 300, `${scan.ms}ms`);

    let final = null;
    for (let i = 0; i < 300; i++) {
      await sleep(500);
      const p = await request(`${BASE}/api/progress`);
      final = p.body;
      if (!final.running) break;
    }
    check("scan finished", final?.running === false, `done=${final?.done}/${final?.total}`);

    const res = await request(`${BASE}/api/results`);
    check("results returned", res.body.hits.length > 0, `hits=${res.body.hits.length}`);

    const throughput = final ? final.done / final.elapsed : 0;
    check("throughput is plausible (>10/s)", throughput > 10, `${throughput.toFixed(1)}/s`);
  } finally {
    child.kill();
    await sleep(300);
  }

  console.log(failures === 0 ? "\nRESULT: all server checks passed" : `\nRESULT: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
