/*
 * The page as a browser loads it: the files it needs, and a server for them on this computer (`la-studio serve`).
 * The command line and scripts/build.js use both (SReq 10.5, SD-19).
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

/** The folder the page is in: the repository, or the installed package. */
const ROOT = path.resolve(__dirname, "..");

/** What the browser loads, with the licence notices that go with it: the demo site and the page's zip. */
const PAGE_FILES = ["index.html", "styles.css", "favicon.svg", "js", "vendor", "templates", "LICENSE", "NOTICE"];

/** Every file of the page, as paths relative to `root` with forward slashes, sorted. */
function pageFiles(root = ROOT) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (fs.statSync(abs).isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) if (!name.startsWith(".")) walk(`${rel}/${name}`);
    } else out.push(rel);
  };
  for (const f of PAGE_FILES) walk(f);
  return out;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttl": "text/turtle; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".tgz": "application/gzip",
};

/**
 * Serves `root` on this computer only, as a static host would: the page, and any file beside it a project may
 * import by URL. Dot-files and node_modules are never served, and nothing outside `root`. Resolves to the
 * listening server; `port` 0 takes any free port.
 */
function serve({ port = 8000, host = "127.0.0.1", root = ROOT } = {}) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const send = (status, headers, body) => { res.writeHead(status, headers); res.end(req.method === "HEAD" ? undefined : body); };
    const missing = () => send(404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found\n");
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, { Allow: "GET, HEAD" }, "");
    let pathname;
    try { pathname = new URL(req.url, "http://localhost").pathname; } catch (e) { return send(400, {}, ""); }
    let parts;
    try { parts = pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch (e) { return send(400, {}, ""); }
    // `..`, dot-files, other drives and backslashes never name a file: nothing outside the folder is reachable.
    if (parts.some((p) => p.startsWith(".") || p === "node_modules" || /[\\/:\0]/.test(p))) return missing();
    let file = path.join(base, ...parts);
    if (file !== base && !file.startsWith(base + path.sep)) return missing();
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) {
        if (!pathname.endsWith("/")) return send(301, { Location: `${pathname}/` }, "");
        file = path.join(file, "index.html");
        try { st = fs.statSync(file); err = null; } catch (e) { err = e; }
      }
      if (err || !st.isFile()) return missing();
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Content-Length": st.size,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(server); });
  });
}

module.exports = { ROOT, PAGE_FILES, pageFiles, serve };
