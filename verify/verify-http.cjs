// Request-body and route checks. Run: node verify/verify-http.cjs
//
// Sends bodies with an explicit Content-Length and, for one case, splits the
// body across several writes so the server sees multiple chunks.
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PORT = 7820;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function postRaw(route, body, { chunkSize } = {}) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = http.request(`${BASE}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": buf.length },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { raw }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (chunkSize) {
      let off = 0;
      const step = () => {
        if (off >= buf.length) { req.end(); return; }
        req.write(buf.subarray(off, Math.min(buf.length, off + chunkSize)));
        off += chunkSize;
        setImmediate(step);
      };
      step();
    } else {
      req.end(buf);
    }
  });
}

function postSplitUtf8(route, text, cutInside) {
  const buf = Buffer.from(text, "utf8");
  const cut = buf.indexOf(Buffer.from(cutInside, "utf8")) + 1;
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": buf.length },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on("error", reject);
    req.write(buf.subarray(0, cut));
    setTimeout(() => req.end(buf.subarray(cut)), 30);
  });
}

const getJson = (route) => new Promise((resolve, reject) => {
  http.get(`${BASE}${route}`, (res) => {
    let raw = "";
    res.on("data", (c) => { raw += c; });
    res.on("end", () => resolve(JSON.parse(raw)));
  }).on("error", reject);
});

(async () => {
  const alive = await getJson("/api/progress").catch(() => null);
  if (alive) {
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
    const split = await postRaw("/api/feasibility", JSON.stringify({ filter: { bigVolcano: 5 } }), { chunkSize: 4 });
    check("split body keeps the filter", split.status === 200 && split.body.impossible === true, `status=${split.status}`);

    const cn = await postSplitUtf8("/api/feasibility", JSON.stringify({ filter: { bigVolcano: 2 }, note: "大火山" }), "大");
    check("split multi-byte UTF-8 parses", cn.status === 200 && cn.body.ok === true, `status=${cn.status}`);

    const bad = await postRaw("/api/feasibility", "{not json");
    check("malformed JSON returns 400", bad.status === 400, `status=${bad.status}`);

    const huge = await postRaw("/api/feasibility", JSON.stringify({ pad: "x".repeat(1_100_000) }));
    check("oversized body returns 413", huge.status === 413, `status=${huge.status}`);

    const empty = await postRaw("/api/feasibility", "");
    check("empty body uses defaults", empty.status === 200 && empty.body.ok === true, `status=${empty.status}`);

    const scan = await postRaw("/api/scan", JSON.stringify({ from: 0, count: 120, filter: { bigVolcano: 2 } }));
    check("scan starts", scan.status === 200 && scan.body.ok === true, `total=${scan.body.total}`);

    let final = null;
    for (let i = 0; i < 300; i++) {
      await sleep(400);
      final = await getJson("/api/progress");
      if (!final.running) break;
    }
    check("scan finished", final?.running === false, `done=${final?.done}/${final?.total} hits=${final?.hits}`);
    check("rejection reasons reported", Array.isArray(final?.rejected) && final.rejected.length > 0,
      JSON.stringify(final?.rejected?.slice(0, 2)));
  } finally {
    child.kill();
    await sleep(300);
  }

  console.log(failures === 0 ? "\nRESULT: all http checks passed" : `\nRESULT: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
