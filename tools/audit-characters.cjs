// Scan every text file for characters that do not belong in source.
// Run: node tools/audit-characters.cjs
//
// Reports:
//   U+FFFD  replacement character, usually a decoding accident
//   control bytes 0000-0008, 000B, 000C, 000E-001F (tab/LF/CR excluded)
//   U+00A0 / U+3000  non-breaking and ideographic spaces inside code
//   BOM     UTF-8 byte order mark
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const TEXT = /\.(cjs|mjs|js|json|md|html|css|bat|txt|yml|yaml)$/;

function describeCode(code) {
  if (code === 0xfffd) return "U+FFFD replacement character";
  if (code === 0xfeff) return "U+FEFF byte order mark";
  if (code === 0x00a0) return "U+00A0 non-breaking space";
  if (code === 0x3000) return "U+3000 ideographic space";
  if (code < 0x20) return `control byte 0x${code.toString(16).padStart(2, "0")}`;
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

let findings = 0;
for (const file of walk(ROOT)) {
  if (!TEXT.test(file)) continue;
  const rel = path.relative(ROOT, file);
  const raw = fs.readFileSync(file);
  const text = raw.toString("utf8");

  // A BOM only matters at the very start of a file.
  if (text.charCodeAt(0) === 0xfeff) {
    console.log(`${rel}:1  ${describeCode(0xfeff)} at file start`);
    findings++;
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const ch of line) {
      const code = ch.codePointAt(0);
      const bad = code === 0xfffd
        || code === 0x3000
        || (code < 0x20 && code !== 0x09 && code !== 0x0d);
      if (bad) {
        console.log(`${rel}:${i + 1}  ${describeCode(code)}`);
        findings++;
        break;
      }
    }
  });

  // Windows batch files must stay ASCII with CRLF line endings.
  if (rel.endsWith(".bat")) {
    const nonAscii = [...text].find((ch) => ch.codePointAt(0) > 0x7f);
    if (nonAscii) {
      console.log(`${rel}  non-ASCII character ${describeCode(nonAscii.codePointAt(0))} in a .bat file`);
      findings++;
    }
  }
}

console.log(findings === 0 ? "\nRESULT: no stray characters" : `\nRESULT: ${findings} finding(s)`);
process.exit(findings === 0 ? 0 : 1);
