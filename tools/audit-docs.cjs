// Keep the bilingual README structurally in sync.
// Run: node tools/audit-docs.cjs
//
// The two halves are written by hand, so they drift. This checks that both
// exist and that the English and Chinese halves have the same number of
// sections, so a new section cannot be added to only one side unnoticed.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

let findings = 0;
function fail(msg) {
  console.log(`  FAIL ${msg}`);
  findings++;
}

const enAt = readme.indexOf("## English");
const zhAt = readme.indexOf("## 简体中文");

if (enAt < 0) fail("README.md has no '## English' section");
if (zhAt < 0) fail("README.md has no '## 简体中文' section");

if (enAt >= 0 && zhAt >= 0) {
  if (enAt > zhAt) fail("English section should come before the Chinese one");

  const en = readme.slice(enAt, zhAt);
  const zh = readme.slice(zhAt);
  const heading = (text) => (text.match(/^### .+$/gm) || []).length;

  const enCount = heading(en);
  const zhCount = heading(zh);
  if (enCount !== zhCount) fail(`section count differs: English ${enCount}, Chinese ${zhCount}`);

  const enTables = (en.match(/^\|.*\|$/gm) || []).length;
  const zhTables = (zh.match(/^\|.*\|$/gm) || []).length;
  if (enTables !== zhTables) fail(`table row count differs: English ${enTables}, Chinese ${zhTables}`);

  console.log(`sections: ${enCount} per language, tables: ${enTables} rows per language`);
}

console.log(findings === 0 ? "\nRESULT: README halves are in sync" : `\nRESULT: ${findings} problem(s)`);
process.exit(findings === 0 ? 0 : 1);
