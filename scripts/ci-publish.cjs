// A shard's checkpoint upload. The release body is deliberately untouched: only
// ci-progress.cjs rewrites it, so a checkpoint cannot overwrite the report with
// a placeholder.
const fs = require("node:fs");
const path = require("node:path");
const release = require("./ci-release.cjs");

function need(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

async function main() {
  const asset = need("CI_ASSET");
  const file = need("CI_FILE");
  if (!fs.existsSync(file)) throw new Error(`file not found: ${file}`);

  const target = await release.getRelease(true);
  const created = await release.replaceAsset(target, asset, fs.readFileSync(file));
  console.log(`uploaded ${path.basename(file)} (${created.size} bytes) -> ${created.browser_download_url}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
