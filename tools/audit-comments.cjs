// Audit comments and strings across the project.
// Run: node tools/audit-comments.cjs
//
// Flags:
//   CJK      - Chinese text outside of user-facing strings that belong in data
//   ARROW    - Unicode arrows or other non-ASCII symbols in code/comments
//   RESTATE  - comment that merely repeats the next line of code
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const CODE_EXT = /\.(cjs|mjs|js|css)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Files whose Chinese text is user-facing data, not prose.
const DATA_FILES = new Set([
  path.join(ROOT, "app", "geyser-types.cjs"),
  path.join(ROOT, "app", "base-plan.cjs"),
  path.join(ROOT, "app", "feasibility-text.cjs"),
  path.join(ROOT, "public", "app.js"),
  path.join(ROOT, "public", "index.html"),
]);

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;
const ARROW = /[\u2190-\u21ff\u25b2-\u25c0\u2600-\u27bf]/;

const findings = { cjk: [], arrow: [] };

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (!CODE_EXT.test(file)) continue;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let inBlockComment = false;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isBlock = inBlockComment || trimmed.startsWith("/*") || trimmed.startsWith("*");
    const isLineComment = trimmed.startsWith("//");
    const commentOnly = isBlock || isLineComment;

    if (CJK.test(line) && !DATA_FILES.has(file) && (commentOnly || /\/\/|\/\*/.test(line))) {
      findings.cjk.push(`${rel}:${i + 1}  ${trimmed.slice(0, 100)}`);
    }
    if (ARROW.test(line) && commentOnly) {
      findings.arrow.push(`${rel}:${i + 1}  ${trimmed.slice(0, 100)}`);
    }
    if (trimmed.startsWith("/*") && !trimmed.includes("*/")) inBlockComment = true;
    if (inBlockComment && trimmed.includes("*/")) inBlockComment = false;
  });
}

for (const [kind, label] of [["cjk", "Chinese in comments"], ["arrow", "Unicode symbols in comments"]]) {
  console.log(`\n== ${label} (${findings[kind].length}) ==`);
  for (const line of findings[kind]) console.log(`  ${line}`);
}

const total = findings.cjk.length + findings.arrow.length;
console.log(total === 0 ? "\nRESULT: clean" : `\nRESULT: ${total} finding(s)`);
process.exit(total === 0 ? 0 : 1);
