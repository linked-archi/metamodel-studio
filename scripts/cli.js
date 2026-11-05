#!/usr/bin/env node
/*
 * Metamodel Studio from the command line — the same code the browser runs.
 *
 *   node cli.js generate <project.studio.json> [-o <dir>]   write the asset set
 *   node cli.js import <doc.ttl>... [-o <project.json>]     Turtle -> studio project
 *   node cli.js lint <project.studio.json>                  print checks; exit 1 on errors
 *   node cli.js template <blank|cloudplatform|archimate4> [-o <project.json>]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const core = require("../js/core.js");
const generator = require("../js/generator.js");
const importer = require("../js/importer.js");
const { lint } = require("../js/lint.js");

function usage(code) {
  process.stderr.write(fs.readFileSync(__filename, "utf8").split("\n").slice(2, 9).map((l) => l.replace(/^ \* ?/, "")).join("\n") + "\n");
  process.exit(code);
}

function option(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function readProject(file) {
  return core.normalize(JSON.parse(fs.readFileSync(file, "utf8")));
}

function main(argv) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") usage(cmd ? 0 : 2);
  const out = option(args, "-o");

  if (cmd === "generate") {
    if (args.length !== 1) usage(2);
    const project = readProject(args[0]);
    const dir = out || ".";
    fs.mkdirSync(dir, { recursive: true });
    for (const f of generator.generate(project)) {
      fs.writeFileSync(path.join(dir, f.name), f.content);
      console.log(path.join(dir, f.name));
    }
    const errors = lint(project).filter((i) => i.level === "error");
    for (const e of errors) console.error(`error: ${e.message}`);
    return errors.length ? 1 : 0;
  }

  if (cmd === "import") {
    if (!args.length) usage(2);
    const docs = args.map((f) => ({ name: f, text: fs.readFileSync(f, "utf8") }));
    const { project, report } = importer.importTurtle(docs);
    const json = JSON.stringify(project, null, 2) + "\n";
    if (out) fs.writeFileSync(out, json); else process.stdout.write(json);
    for (const line of report) console.error(line);
    return 0;
  }

  if (cmd === "lint") {
    if (args.length !== 1) usage(2);
    const findings = lint(readProject(args[0]));
    for (const f of findings) console.log(`${f.level}\t${f.tab}\t${f.id || "-"}\t${f.message}`);
    return findings.some((f) => f.level === "error") ? 1 : 0;
  }

  if (cmd === "template") {
    const templates = require("../templates/templates.js");
    const t = templates[args[0]];
    if (!t) { console.error(`unknown template; one of: ${Object.keys(templates).join(", ")}`); return 2; }
    const json = JSON.stringify(t.project, null, 2) + "\n";
    if (out) fs.writeFileSync(out, json); else process.stdout.write(json);
    return 0;
  }

  usage(2);
  return 2;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
}
