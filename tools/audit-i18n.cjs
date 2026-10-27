// Every user-visible string must exist in both languages and be reachable.
// Run: node tools/audit-i18n.cjs
//
// Checks the browser bundle (public/), the shared name tables, the CLI strings
// and every data-i18n key used by the markup, then reports anything that only
// exists in one language or not at all.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
let findings = 0;

function fail(msg) {
  console.log(`  FAIL ${msg}`);
  findings++;
}

function sameKeys(label, zh, en) {
  const onlyZh = Object.keys(zh).filter((k) => !(k in en));
  const onlyEn = Object.keys(en).filter((k) => !(k in zh));
  if (onlyZh.length) fail(`${label}: missing in en -> ${onlyZh.join(", ")}`);
  if (onlyEn.length) fail(`${label}: missing in zh -> ${onlyEn.join(", ")}`);
  return Object.keys(zh).length;
}

// i18n.js declares I18N inside an IIFE; evaluate just that literal.
function readI18N() {
  const src = fs.readFileSync(path.join(ROOT, "public", "i18n.js"), "utf8");
  const start = src.indexOf("const I18N");
  const end = src.indexOf("};", start);
  if (start < 0 || end < 0) throw new Error("could not locate the I18N table");
  return new Function(`return ${src.slice(start + "const I18N = ".length, end + 1)};`)();
}

function main() {
  const table = readI18N();
  const keys = sameKeys("I18N", table.zh, table.en);
  console.log(`I18N: ${keys} keys per language`);

  const loc = require(path.join(ROOT, "public", "locales.js"));
  const geysers = sameKeys("GEYSER_NAMES", loc.GEYSER_NAMES.zh, loc.GEYSER_NAMES.en);
  sameKeys("BLOCK_NAMES", loc.BLOCK_NAMES.zh, loc.BLOCK_NAMES.en);
  sameKeys("REJECT_NAMES", loc.REJECT_NAMES.zh, loc.REJECT_NAMES.en);
  const whys = sameKeys("WHY", loc.WHY.zh, loc.WHY.en);
  console.log(`locales: ${geysers} geyser names, ${whys} unreachable reasons`);

  const cli = require(path.join(ROOT, "app", "cli-text.cjs"));
  sameKeys("cli rows", cli.rowsFor("zh"), cli.rowsFor("en"));
  for (const key of ["usage", "coord", "geysers", "baseClear", "resources"]) {
    if (cli.makeT("zh")(key) === key) fail(`cli-text: missing key ${key}`);
  }

  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const markupKeys = new Set([...html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]));
  for (const key of markupKeys) if (!(key in table.zh)) fail(`index.html references unknown key ${key}`);

  // Every literal the page passes to t(). Accepts both bare keys ("threads")
  // and dotted ones ("unit.sec"); a renamed local binding is still picked up.
  const appSrc = fs.readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
  const anyCall = /\b\w+\("([a-z][\w]*(?:\.[\w]+)*)"/g;
  // Only keep strings that look like keys, not CSS classes or DOM ids.
  const keyPattern = /^[a-z]+(\.[\w]+)+$/;
  const codedKeys = new Set([...appSrc.matchAll(anyCall)].map((m) => m[1]));
  const knownBare = new Set(["threads"]);

  for (const key of codedKeys) {
    if (!keyPattern.test(key) && !knownBare.has(key)) continue;
    if (!(key in table.zh)) fail(`app.js references unknown key ${key}`);
  }

  // Keys synthesised at runtime, e.g. t(key) over the CSV column table.
  const dynamicPrefixes = [...appSrc.matchAll(/"([a-z]+)\.[a-z]+"/g)].map((m) => m[1]);

  const unused = Object.keys(table.zh).filter((key) =>
    !markupKeys.has(key) && !codedKeys.has(key)
    && !dynamicPrefixes.some((p) => key.startsWith(`${p}.`)));
  if (unused.length) console.log(`  note: ${unused.length} unreferenced key(s): ${unused.join(", ")}`);

  console.log(`markup: ${markupKeys.size} keys, app.js: ${codedKeys.size} referenced keys`);
}

main();
console.log(findings === 0 ? "\nRESULT: all languages complete" : `\nRESULT: ${findings} problem(s)`);
process.exit(findings === 0 ? 0 : 1);
