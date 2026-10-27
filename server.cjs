// Local HTTP server for the seed scanner UI. Start it with `node server.cjs`
// (or the Windows launcher) and it opens a browser automatically.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { exec } = require("node:child_process");

const { BASE_W, BASE_H, BLOCKS } = require("./app/base-plan.cjs");
const seedgen = require("./app/seedgen.cjs");
const analysis = require("./app/analysis.cjs");
const detailView = require("./app/detail.cjs");
const scoring = require("./app/scoring.cjs");
const feasibility = require("./app/feasibility.cjs");
const feasibilityText = require("./app/feasibility-text.cjs");
const { Scan } = require("./app/dispatcher.cjs");

const PORT = Number(process.env.PORT ?? 0) || 7777;
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------------------------------------------------------------- scan state

let scan = null;

function stopScan() {
  if (!scan) return;
  scan.stop();
  scan = null;
}

function startDynamicScan({ from, to, filter, weights, targets }) {
  if (scan && !scan.finished) throw new Error("a scan is already running");
  scan = new Scan({
    from,
    to,
    filter: scoring.normalizeFilter(filter ?? {}),
    weights: weights ?? {},
    targets: targets ?? {},
    threads: Math.max(1, os.cpus().length - 1),
  });
  return { total: scan.total, threads: scan.threadLimit };
}

function progressPayload() {
  return scan ? scan.progress() : { running: false };
}

function scanHits() {
  return scan ? scan.sortedHits() : [];
}

// ---------------------------------------------------------------- http utils

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(data);
}

// Read a JSON request body.
//
// Chunks are collected as Buffers and decoded once at 'end'. Decoding each
// chunk separately would corrupt a multi-byte sequence split across packets,
// so this is not interchangeable with string concatenation. The size cap is a
// hard cutoff: once exceeded, further chunks are ignored and the request is
// rejected with 413.
const MAX_BODY = 1e6;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        aborted = true;
        const err = new Error("body too large");
        err.status = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (aborted) return;
      if (size === 0) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        err.status = 400;
        reject(err);
      }
    });

    req.on("error", (err) => {
      if (!aborted) { aborted = true; reject(err); }
    });
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(buf);
  });
}

// ---------------------------------------------------------------- routes

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (route === "/api/config" && req.method === "GET") {
    return sendJson(res, 200, {
      cpus: os.cpus().length,
      threads: Math.max(1, os.cpus().length),
      baseW: BASE_W,
      baseH: BASE_H,
      blocks: BLOCKS,
    });
  }

  if (route === "/api/scan" && req.method === "POST") {
    const body = await readJson(req);
    const lang = body.lang ?? url.searchParams.get("lang");
    const from = Number(body.from ?? 0);
    const count = Number(body.count ?? 1000);
    if (!Number.isFinite(from) || from < 0) return sendJson(res, 400, { error: "invalid from" });
    if (!Number.isFinite(count) || count <= 0) return sendJson(res, 400, { error: "invalid count" });

    // Refuse filters that cannot pass instead of burning the whole range.
    const verdict = feasibility.check(scoring.normalizeFilter(body.filter ?? {}), {
      targetHits: Number(body.targetHits ?? 100),
      threads: Math.max(1, os.cpus().length - 1),
    });
    const text = feasibilityText.describeVerdict(verdict, lang);

    if (verdict.impossible && body.ignoreFeasibility !== true) {
      return sendJson(res, 422, { error: text, text, feasibility: verdict });
    }

    try {
      const info = startDynamicScan({ from, to: from + count, filter: body.filter ?? {}, weights: body.weights ?? {} });
      return sendJson(res, 200, { ok: true, ...info, feasibility: verdict, text });
    } catch (err) {
      return sendJson(res, 409, { error: err.message });
    }
  }

  if (route === "/api/stop" && req.method === "POST") {
    stopScan();
    return sendJson(res, 200, { ok: true });
  }

  if (route === "/api/progress" && req.method === "GET") {
    return sendJson(res, 200, progressPayload());
  }

  if (route === "/api/results" && req.method === "GET") {
    return sendJson(res, 200, { hits: scanHits(), progress: progressPayload() });
  }

  if (route === "/api/clear" && req.method === "POST") {
    if (scan && !scan.finished) return sendJson(res, 409, { error: "scan running" });
    scan = null;
    return sendJson(res, 200, { ok: true });
  }

  // Detail view. The summary and the per-geyser breakdown come from one
  // generated world; loading it twice here would also make detail() report a
  // cache hit on the very first request.
  const seedMatch = route.match(/^\/api\/seed\/(\d+)$/);
  if (seedMatch && req.method === "GET") {
    const seed = Number(seedMatch[1]);
    try {
      const detail = detailView.detail(seed, url.searchParams.get("lang"));
      const loaded = seedgen.peek(seed);
      const summary = analysis.summarize(loaded);
      return sendJson(res, 200, {
        ...detail,
        summary,
        score: scoring.scoreOf(summary),
      });
    } catch (err) {
      return sendJson(res, 404, { error: err.message });
    }
  }

  // Pre-scan feasibility: answers "will this filter ever pass" and "how long
  // will it take" without generating a single seed. The verdict itself is pure
  // data; only the human-readable text depends on ?lang=.
  if (route === "/api/feasibility" && req.method === "POST") {
    const body = await readJson(req);
    const filter = scoring.normalizeFilter(body.filter ?? {});
    const targetHits = Number(body.targetHits ?? 100);
    const threads = Math.max(1, os.cpus().length - 1);
    const verdict = feasibility.check(filter, { targetHits, threads });
    const lang = url.searchParams.get("lang") ?? body.lang;
    return sendJson(res, 200, { ...verdict, text: feasibilityText.describeVerdict(verdict, lang) });
  }

  return sendJson(res, 404, { error: "unknown endpoint" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      sendJson(res, err.status ?? 500, { error: err.message });
    }
    return;
  }
  serveStatic(req, res);
});

function openBrowser(address) {
  const cmd = process.platform === "win32" ? `start "" "${address}"`
    : process.platform === "darwin" ? `open "${address}"`
    : `xdg-open "${address}"`;
  exec(cmd, () => {});
}

server.listen(PORT, "127.0.0.1", () => {
  const port = server.address().port;
  const address = `http://127.0.0.1:${port}`;
  console.log(`ONI seed scanner running at ${address}`);
  console.log("Close this window (or press Ctrl+C) to stop the server.");
  if (!process.env.NO_OPEN) openBrowser(address);
});

process.on("SIGINT", () => {
  stopScan();
  server.close(() => process.exit(0));
});
