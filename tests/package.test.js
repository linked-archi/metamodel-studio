// The packages and the demo site (SReq 10.5–10.6, SD-19), with `npm test`. A build goes into a temporary folder; the
// npm package is installed from its tarball by the npm that comes with Node, offline, and run. Nothing else is
// installed. The page's side of the demo, its link to a starting point, is checked by tests/ui.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const { build, buildVersion } = require("../scripts/build.js");
const page = require("../scripts/page.js");

const ROOT = path.join(__dirname, "..");
const PKG = require("../package.json");
const VERSION = "9.8.7-test.1";
let tmp = null;
let built = null;

/** npm, without the settings `npm test` passes its scripts, so it works on the folder given. */
function npm(args, cwd) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^npm_/i.test(k)));
  const win = process.platform === "win32";
  return execFileSync(win ? "npm.cmd" : "npm", args, { cwd, env: Object.assign(env, { NO_UPDATE_NOTIFIER: "1" }), encoding: "utf8", shell: win, stdio: ["ignore", "pipe", "pipe"] });
}

/** The entries of a zip the studio wrote (stored, no compression): name and bytes. */
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
    const nameLen = buf.readUInt16LE(at + 28);
    const size = buf.readUInt32LE(at + 20);
    const local = buf.readUInt32LE(at + 42);
    const data = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out.push({ name: buf.toString("utf8", at + 46, at + 46 + nameLen), data: buf.subarray(data, data + size) });
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return out;
}

/** A request with its path sent as written, so `..` and escapes reach the server. */
function get(port, rawPath, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: rawPath, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", location: res.headers.location, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "la-studio-"));
  built = build({ version: VERSION, out: path.join(tmp, "dist"), baseUrl: "https://example.org/studio" });
});
after(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

test("a build is the version it is given, or the next release's as a development build (SD-19)", () => {
  assert.equal(buildVersion("1.2.3"), "1.2.3");
  assert.throws(() => buildVersion("v1.2"), /not a version/);
  assert.match(buildVersion(), new RegExp(`^${PKG.version.replace(/\./g, "\\.")}-dev(\\.g[0-9a-f]{7})?$`));
  assert.equal(built.version, VERSION);
});

test("the npm package holds the command line, the engine and the page, and nothing else (SReq 10.5)", () => {
  for (const f of page.PAGE_FILES) assert.ok(PKG.files.includes(f) || PKG.files.includes(`${f}/`) || f === "LICENSE", `package.json's files leave out ${f}`);
  const expected = page.pageFiles().concat(["index.js", "scripts/cli.js", "scripts/page.js", "README.md", "package.json"]).sort();
  assert.deepEqual(built.pkg.files.slice().sort(), expected);
  assert.equal(built.pkg.name, `${PKG.name}-${VERSION}.tgz`);
  assert.match(built.pkg.integrity, /^sha512-/);
});

test("installed from its tarball, la-studio runs and the engine loads (SReq 10.5)", () => {
  const proj = path.join(tmp, "proj");
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, "package.json"), JSON.stringify({ name: "uses-the-studio", version: "1.0.0", private: true }));
  npm(["install", built.pkg.file, "--offline", "--no-audit", "--no-fund", "--loglevel=error"], proj);
  const dir = path.join(proj, "node_modules", PKG.name);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.equal(manifest.version, VERSION);
  // The development dependencies name a tarball on the maintainer's computer: they stay out.
  assert.equal(manifest.devDependencies, undefined);
  assert.equal(manifest.scripts, undefined);
  assert.ok(fs.existsSync(path.join(proj, "node_modules", ".bin", process.platform === "win32" ? "la-studio.cmd" : "la-studio")));

  const cli = (...args) => execFileSync(process.execPath, [path.join(dir, "scripts", "cli.js"), ...args], { cwd: tmp, encoding: "utf8" });
  assert.equal(cli("--version").trim(), `la-studio ${VERSION}`);
  cli("template", "cloudplatform", "-o", "cp.json");
  cli("generate", "cp.json", "-o", "out");
  assert.ok(fs.existsSync(path.join(tmp, "out", "cloudplatform-metamodel.ttl")));

  const engine = require(dir);
  assert.deepEqual(Object.keys(engine).sort(), ["core", "generator", "importer", "lint", "templates", "version", "zip"]);
  assert.equal(engine.version, VERSION);
  const project = engine.core.normalize(JSON.parse(fs.readFileSync(path.join(tmp, "cp.json"), "utf8")));
  assert.equal(engine.generator.generate(project).length, 8);
  assert.deepEqual(engine.lint.lint(project).filter((i) => i.level === "error"), []);
  assert.deepEqual(Object.keys(engine.templates).sort(), ["archimate4", "blank", "cloudplatform"]);
});

test("la-studio serve serves the page, and nothing outside its folder (SReq 10.5)", async () => {
  const server = await page.serve({ port: 0 });
  const port = server.address().port;
  try {
    const home = await get(port, "/");
    assert.equal(home.status, 200);
    assert.match(home.type, /^text\/html/);
    assert.match(home.body, /<title>Metamodel Studio<\/title>/);
    assert.match((await get(port, "/js/core.js")).type, /^text\/javascript/);
    assert.match((await get(port, "/favicon.svg")).type, /^image\/svg\+xml/);
    // Files beside the page, for importing by URL.
    assert.match((await get(port, "/fixtures/archimate4/archimate4-onto.ttl")).type, /^text\/turtle/);
    assert.equal((await get(port, "/js")).location, "/js/");
    for (const p of ["/js/", "/.git/config", "/node_modules/vitest/package.json", "/.agents/conventions.md"]) {
      assert.equal((await get(port, p)).status, 404, p);
    }
    assert.equal((await get(port, "/", "POST")).status, 405);
    assert.equal((await get(port, "/", "HEAD")).body, "");
  } finally {
    server.close();
  }
  // A file just outside the folder served is never reached, however the path is written.
  const site = path.join(tmp, "served");
  fs.mkdirSync(site);
  fs.writeFileSync(path.join(site, "inside.txt"), "inside\n");
  fs.writeFileSync(path.join(tmp, "outside.txt"), "outside\n");
  const other = await page.serve({ port: 0, root: site });
  try {
    const at = other.address().port;
    assert.equal((await get(at, "/inside.txt")).body, "inside\n");
    for (const p of ["/../outside.txt", "/%2e%2e/outside.txt", "/..%2foutside.txt", "/%2e%2e%2foutside.txt", "/..%5coutside.txt", "/x%5c..%5c..%5coutside.txt", "/.%2e/outside.txt"]) {
      const res = await get(at, p);
      assert.equal(res.status, 404, `${p} gave ${res.status}: ${res.body}`);
    }
  } finally {
    other.close();
  }
});

test("the demo site is the page, with both packages and a page that says how to install them (SReq 10.6)", () => {
  const files = [];
  const walk = (rel) => {
    const abs = path.join(built.site, rel);
    if (fs.statSync(abs).isDirectory()) for (const n of fs.readdirSync(abs)) walk(rel ? `${rel}/${n}` : n);
    else files.push(rel);
  };
  walk("");
  const packages = [`packages/${built.pkg.name}`, `packages/${built.page.name}`, "packages/index.html"];
  assert.deepEqual(files.sort(), page.pageFiles().concat(packages).sort());
  const about = fs.readFileSync(path.join(built.site, "packages", "index.html"), "utf8");
  assert.ok(about.includes(`npm install --global https://example.org/studio/packages/${built.pkg.name}`));
  assert.ok(about.includes(`/releases/tag/v${VERSION}`), "a release's page links to the release");
  assert.ok(about.includes(built.pkg.integrity));
  assert.ok(!/\.scripts\/|\.reference\/|\/Users\//.test(about), "names no folder on a computer");
});

test("the page's zip holds the page as it is, in a folder named after the build (SReq 10.6)", () => {
  const entries = unzip(fs.readFileSync(built.page.file));
  assert.deepEqual(entries.map((e) => e.name), page.pageFiles().map((f) => `metamodel-studio-${VERSION}/${f}`));
  for (const e of entries) {
    assert.ok(e.data.equals(fs.readFileSync(path.join(ROOT, e.name.split("/").slice(1).join("/")))), e.name);
  }
});

test("building a version again gives the same bytes, so the demo's copies equal the release's (SD-19)", (t) => {
  try { execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, stdio: "ignore" }); } catch (e) { t.skip("not a Git checkout: the zip is dated by the commit"); return; }
  const again = build({ version: VERSION, out: path.join(tmp, "again"), baseUrl: "https://example.org/studio" });
  assert.equal(again.pkg.integrity, built.pkg.integrity);
  assert.ok(fs.readFileSync(again.page.file).equals(fs.readFileSync(built.page.file)));
});
