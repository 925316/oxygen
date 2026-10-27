// Find relative requires that point at files that no longer exist.
// Run: node tools/check-requires.cjs
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SKIP = new Set(["node_modules", ".git"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(cjs|mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolves(target) {
  const candidates = [target, `${target}.cjs`, `${target}.mjs`, `${target}.js`,
    path.join(target, "index.cjs"), path.join(target, "index.js")];
  return candidates.some((c) => fs.existsSync(c));
}

let bad = 0;
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    if (!resolves(target)) {
      console.log(`MISSING  ${path.relative(ROOT, file)}  ->  ${match[1]}`);
      bad++;
    }
  }
}

console.log(bad === 0 ? "RESULT: every relative require resolves" : `RESULT: ${bad} missing target(s)`);
process.exit(bad === 0 ? 0 : 1);
