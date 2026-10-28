// Shared release handling for the scan workflow.
//
// Everything the scan produces lives on one rolling release under one fixed
// tag, and every write replaces the previous one in place: the download links
// never change and the number of assets stays constant. The release body is
// owned by ci-progress.cjs, which rewrites it with the current report after
// each batch.
const api = "https://api.github.com";

const RELEASE_BODY = "Rolling scan state. The body is refreshed after every batch.";

function need(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

function repo() {
  return need("CI_REPO");
}

function tag() {
  return need("CI_TAG");
}

async function call(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : `${api}${url}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${need("GH_TOKEN")}`,
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function upload(url, data, name) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${need("GH_TOKEN")}`,
      "content-type": "application/octet-stream",
      "content-length": String(data.length),
    },
    body: data,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${name} -> ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// GitHub lets several releases share one tag name, and `/releases/tags/{tag}`
// then returns whichever it likes. Two writers that both see "missing" can
// both create one, so every lookup collapses the extras back to a single
// release that all later writes target.
async function listForTag() {
  const all = await call("GET", `/repos/${repo()}/releases?per_page=100`);
  const mine = (all ?? []).filter((r) => r.tag_name === tag());
  if (!mine.length) return null;
  return mine.find((r) => !r.draft) ?? mine[0];
}

// Keep at most one release for the tag: a race can leave several, and writes
// to a duplicate are invisible on the page, so the extras are removed.
async function collapseDuplicates(keep) {
  const all = await call("GET", `/repos/${repo()}/releases?per_page=100`);
  const extra = (all ?? []).filter((r) => r.tag_name === tag() && r.id !== keep.id);
  for (const r of extra) {
    try {
      await call("DELETE", `/repos/${repo()}/releases/${r.id}`);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  return extra.length;
}

async function getRelease(create) {
  const existing = await listForTag();
  if (existing) {
    const removed = await collapseDuplicates(existing);
    if (removed) console.log(`removed ${removed} duplicate release(s) for ${tag()}`);
    return existing;
  }
  if (!create) return null;
  try {
    return await call("POST", `/repos/${repo()}/releases`, {
      tag_name: tag(),
      name: tag(),
      body: RELEASE_BODY,
      draft: false,
      prerelease: true,
    });
  } catch (err) {
    if (err.status !== 422) throw err;
    // A parallel writer created it between the lookup and the create. The list
    // endpoint lags the write slightly, so retry before giving up.
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      const raced = await listForTag();
      if (raced) {
        await collapseDuplicates(raced);
        return raced;
      }
    }
    throw err;
  }
}

async function findAsset(release, name) {
  return (release.assets ?? []).find((a) => a.name === name) ?? null;
}

async function readAsset(release, name, fallback) {
  const asset = await findAsset(release, name);
  if (!asset) return fallback;
  const res = await fetch(asset.browser_download_url, {
    headers: { authorization: `Bearer ${need("GH_TOKEN")}`, accept: "application/octet-stream" },
  });
  if (!res.ok) {
    if (res.status === 404) return fallback;
    throw new Error(`download ${name} -> ${res.status}`);
  }
  return JSON.parse(await res.text());
}

// A PATCH on an asset only renames it and an upload of an existing name is
// rejected, so replacing content means deleting first, as the API docs require.
async function replaceAsset(release, name, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), "utf8");
  const existing = await findAsset(release, name);
  if (existing) {
    try {
      await call("DELETE", `/repos/${repo()}/releases/assets/${existing.id}`);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  const url = `https://uploads.github.com/repos/${repo()}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`;
  try {
    return await upload(url, payload, name);
  } catch (err) {
    // Another writer re-uploaded the same name in between; take its copy.
    if (!/already_exists/.test(err.message)) throw err;
    const fresh = await call("GET", `/repos/${repo()}/releases/${release.id}/assets?per_page=100`);
    const found = (fresh ?? []).find((a) => a.name === name);
    if (!found) throw err;
    return found;
  }
}

async function setBody(release, body) {
  await call("PATCH", `/repos/${repo()}/releases/${release.id}`, { body });
}

module.exports = {
  RELEASE_BODY, getRelease, findAsset, readAsset, replaceAsset, setBody, call, need,
};
