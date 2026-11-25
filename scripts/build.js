#!/usr/bin/env node
/*
 * The demo site and the packages, into dist/ (SReq 10.6, SD-19):
 *
 *   node scripts/build.js [--version <v>] [--base-url <url>] [--out <dir>]
 *
 *   dist/linked-archi-metamodel-studio-<v>.tgz   the npm package: la-studio, the engine for Node, and the page
 *   dist/metamodel-studio-<v>.zip                the page, to open from disk or put on any static host
 *   dist/site/                                   the demo: the page, and packages/ with both files and a page
 *                                                saying how to install them
 *
 * A release gives its tag's version; any other build is package.json's, the next release's, with -dev.g<commit>.
 * --base-url is where the site is served, for the install commands (default: package.json's homepage). The page
 * is copied as it is: it needs no build (conventions, principle 4).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, pageFiles } = require("./page.js");
const zip = require("../js/zip.js");

const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (e) { return ""; }
}

/** The commit built, abbreviated; empty outside a Git checkout. */
function commit() {
  return (process.env.GITHUB_SHA || git(["rev-parse", "HEAD"])).slice(0, 7);
}

/**
 * The version given, or the next release's marked as a development build of this commit. The `g` keeps the
 * identifier from being a number with a leading zero, which semver forbids.
 */
function buildVersion(given) {
  if (given) {
    if (!SEMVER.test(given)) throw new Error(`not a version: ${given}`);
    return given;
  }
  const c = commit();
  return `${PKG.version}-dev${c ? `.g${c}` : ""}`;
}

/** Copy a file or a folder from the repository into `toDir`, at the same relative path. */
function copyInto(rel, toDir) {
  const from = path.join(ROOT, rel);
  const to = path.join(toDir, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: (src) => !path.basename(src).startsWith(".") });
}

/**
 * The npm package, packed from a copy of what package.json's `files` names: the copy takes the build's version
 * and leaves out the scripts and development dependencies, which name a tarball on this computer.
 */
function npmPackage(version, out) {
  const stage = path.join(out, "package");
  for (const rel of PKG.files.concat(["README.md", "LICENSE"])) copyInto(rel.replace(/\/$/, ""), stage);
  const manifest = { name: PKG.name, version };
  for (const k of ["description", "license", "private", "homepage", "repository", "main", "bin", "files", "engines"]) {
    if (PKG[k] !== undefined) manifest[k] = PKG[k];
  }
  fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
  // An absolute path: npm reads "dist/package" as a GitHub repository.
  const win = process.platform === "win32";
  const json = execFileSync(win ? "npm.cmd" : "npm", ["pack", path.resolve(stage), "--pack-destination", path.resolve(out), "--json", "--loglevel=error"],
    { cwd: ROOT, encoding: "utf8", shell: win, stdio: ["ignore", "pipe", "inherit"] });
  fs.rmSync(stage, { recursive: true, force: true });
  const packed = JSON.parse(json)[0];
  return { file: path.join(out, packed.filename), name: packed.filename, size: packed.size, integrity: packed.integrity, files: packed.files.map((f) => f.path) };
}

/** The page as a zip, in a folder named after the build, dated by the commit so a rebuild gives the same bytes. */
function pageZip(version, out) {
  const name = `metamodel-studio-${version}.zip`;
  const iso = git(["log", "-1", "--format=%cI"]);
  const files = pageFiles().map((rel) => ({ name: `metamodel-studio-${version}/${rel}`, content: fs.readFileSync(path.join(ROOT, rel)) }));
  const bytes = zip.build(files, iso ? new Date(iso) : new Date());
  fs.writeFileSync(path.join(out, name), bytes);
  return { file: path.join(out, name), name, size: bytes.length, files: files.map((f) => f.name) };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/** The page under packages/: what each file is, and the commands that install and use it. */
function downloadsPage({ version, release, sha, baseUrl, pkg, page }) {
  const repo = String((PKG.repository && PKG.repository.url) || PKG.repository || "").replace(/^git\+/, "").replace(/\.git$/, "");
  const url = `${baseUrl}packages/${pkg.name}`;
  const code = (lines) => `<pre><code>${lines.map(esc).join("\n")}</code></pre>`;
  const where = release
    ? `<p>The next release replaces these files here. Each release keeps its own on GitHub: <a href="${esc(`${repo}/releases/tag/v${version}`)}">Metamodel Studio ${esc(version)}</a>.</p>`
    : `<p>A development build of commit <code>${esc(sha || "unknown")}</code>, not a release. Releases are on <a href="${esc(`${repo}/releases`)}">GitHub</a>.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Metamodel Studio ${esc(version)}</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<meta name="description" content="The Linked.Archi Metamodel Studio ${esc(version)}: the npm package with the la-studio command and the engine, and the page as a zip.">
<style>
:root { --bg: #f6f7f9; --panel: #fff; --ink: #1d2330; --muted: #6c7689; --line: #dde1e8; --accent: #0f7b74; --code-bg: #f3f5f8;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #12151b; --panel: #1a1e26; --ink: #e6e9ef; --muted: #8d96a8; --line: #2d3340; --accent: #3cbfb3; --code-bg: #151920; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 780px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { font-size: 26px; margin: 0 0 6px; }
h2 { font-size: 18px; margin: 0 0 6px; }
a { color: var(--accent); }
.lead { color: var(--muted); margin: 0 0 24px; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px 18px 6px; margin-bottom: 18px; }
.file { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; margin: 10px 0; }
.file a { font-weight: 600; word-break: break-all; }
.meta { color: var(--muted); font-size: 13px; }
.integrity { font-family: var(--mono); font-size: 12px; color: var(--muted); word-break: break-all; }
pre { background: var(--code-bg); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; overflow-x: auto; font: 13px/1.5 var(--mono); }
code { font-family: var(--mono); font-size: 0.92em; }
footer { color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<main>
<h1>Metamodel Studio ${esc(version)}</h1>
<p class="lead">Design a Linked.Archi metamodel and generate its semantic asset set: the ontology, SHACL shapes, SKOS
taxonomy, viewpoints, notation and <code>arch:Metamodel</code> manifest. <a href="../">Open the studio</a> to try it with
nothing installed. Your work stays in your browser.</p>

<section>
<h2>The command line and the engine</h2>
<p>One npm package, for Node 18 or newer: the <code>la-studio</code> command, the engine for Node, and the page, which
<code>la-studio serve</code> serves on your computer. It has no dependencies.</p>
<div class="file"><a href="${esc(pkg.name)}" download>${esc(pkg.name)}</a><span class="meta">${kb(pkg.size)}, ${pkg.files.length} files</span></div>
<div class="integrity">${esc(pkg.integrity)}</div>
${code([`npm install --global ${url}`, "la-studio template cloudplatform -o cloudplatform.studio.json", "la-studio generate cloudplatform.studio.json -o out/", "la-studio serve"])}
<p>Or in a project, for the engine:</p>
${code([`npm install ${url}`])}
${code(['const fs = require("fs");', `const { core, generator, lint } = require("${PKG.name}");`, "", 'const project = core.normalize(JSON.parse(fs.readFileSync("cloudplatform.studio.json", "utf8")));', "for (const f of generator.generate(project)) fs.writeFileSync(f.name, f.content);", "console.log(lint.lint(project));"])}
<p>The engine's calls may still change: it becomes a package of its own.</p>
</section>

<section>
<h2>The page</h2>
<p>The studio as a folder. Unzip it and open <code>index.html</code>, or put the folder on any static host.</p>
<div class="file"><a href="${esc(page.name)}" download>${esc(page.name)}</a><span class="meta">${kb(page.size)}, ${page.files.length} files</span></div>
</section>

${where}
<footer>Apache-2.0. <a href="${esc(repo)}">Source on GitHub</a>.</footer>
</main>
</body>
</html>
`;
}

/** Builds everything into `out`, replacing what an earlier build put there. */
function build({ version: given, baseUrl, out = path.join(ROOT, "dist") } = {}) {
  const version = buildVersion(given);
  const base = String(baseUrl || PKG.homepage || "./").replace(/\/?$/, "/");
  fs.mkdirSync(out, { recursive: true });
  for (const name of fs.readdirSync(out)) {
    if (name === "site" || name === "package" || /^(linked-archi-metamodel-studio|metamodel-studio)-.*\.(tgz|zip)$/.test(name)) {
      fs.rmSync(path.join(out, name), { recursive: true, force: true });
    }
  }
  const pkg = npmPackage(version, out);
  const page = pageZip(version, out);
  const site = path.join(out, "site");
  for (const rel of pageFiles()) copyInto(rel, site);
  const packages = path.join(site, "packages");
  fs.mkdirSync(packages, { recursive: true });
  for (const f of [pkg, page]) fs.copyFileSync(f.file, path.join(packages, f.name));
  fs.writeFileSync(path.join(packages, "index.html"), downloadsPage({ version, release: Boolean(given), sha: commit(), baseUrl: base, pkg, page }));
  return { version, pkg, page, site };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
  try {
    const options = { version: opt("--version"), baseUrl: opt("--base-url"), out: opt("--out") };
    if (args.length) throw new Error(`unknown arguments: ${args.join(" ")} (see the comment at the top of scripts/build.js)`);
    const result = build(options);
    const rel = (p) => { const r = path.relative(process.cwd(), p); return !r ? "." : r.startsWith("..") ? p : r; };
    console.log(`Metamodel Studio ${result.version}`);
    console.log(`  ${rel(result.pkg.file)}  ${kb(result.pkg.size)}, ${result.pkg.files.length} files`);
    console.log(`  ${rel(result.page.file)}  ${kb(result.page.size)}, ${result.page.files.length} files`);
    console.log(`  ${rel(result.site)}/  the demo site, with both under packages/`);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { build, buildVersion };
