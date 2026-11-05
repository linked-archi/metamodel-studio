// Dependency-free checks: `node --test` (or `npm test`). The Python suite in this folder
// adds independent RDF and SHACL validation of the same output.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const N3 = require("../vendor/n3.min.js");
const core = require("../js/core.js");
const generator = require("../js/generator.js");
const importer = require("../js/importer.js");
const { lint } = require("../js/lint.js");
const zip = require("../js/zip.js");
const templates = require("../templates/templates.js");

function quads(text) {
  return new N3.Parser({ format: "text/turtle" }).parse(text);
}

/** Canonical lines for comparing graphs whose blank nodes may be renamed. */
function signature(text) {
  const qs = quads(text);
  const lines = qs.map((q) => [q.subject, q.predicate, q.object]
    .map((t) => (t.termType === "BlankNode" ? "_" : t.termType === "Literal" ? JSON.stringify([t.value, t.language, t.datatype.value]) : t.value))
    .join(" "));
  return lines.sort();
}

for (const [name, t] of Object.entries(templates)) {
  test(`template ${name} generates parseable Turtle`, () => {
    const files = generator.generate(t.project);
    const ttl = files.filter((f) => f.name.endsWith(".ttl"));
    assert.equal(ttl.length, 6);
    for (const f of ttl) assert.ok(quads(f.content).length > 0, f.name);
  });
}

test("cloudplatform template passes every check", () => {
  const errors = lint(templates.cloudplatform.project).filter((i) => i.level === "error");
  assert.deepEqual(errors, []);
});

test("generate -> import -> generate is lossless", () => {
  const first = generator.generate(templates.cloudplatform.project).filter((f) => f.name.endsWith(".ttl"));
  const { project } = importer.importTurtle(first.map((f) => ({ name: f.name, text: f.content })));
  const second = new Map(generator.generate(project).map((f) => [f.name, f.content]));
  for (const f of first) assert.deepEqual(signature(second.get(f.name)), signature(f.content), f.name);
});

test("renaming an element updates rules, viewpoints and parents", () => {
  const p = core.normalize(JSON.parse(JSON.stringify(templates.cloudplatform.project)));
  // As the UI does: references first, then the item itself.
  core.renameRef(p, "Microservice", "Service", "concept");
  p.elements.find((e) => e.id === "Microservice").id = "Service";
  const flat = JSON.stringify(p);
  assert.ok(!/"Microservice"|Microservice\|/.test(flat.replace(/"label":"[^"]*"/g, "")));
  assert.ok(p.rules.Usage.includes("Service|Database"));
  // A same-named id in another namespace is left alone.
  core.renameRef(p, "Exposure", "Ingress", "concept");
  assert.ok(p.concerns.some((c) => c.id === "Exposure"));
});

test("zip export is readable", () => {
  const data = zip.build([{ name: "a.txt", content: "hello" }]);
  assert.equal(data[0], 0x50);
  assert.equal(data[1], 0x4b);
  assert.equal(zip.crc32(new TextEncoder().encode("hello")), 0x3610a686);
});

test("ArchiMate 4.0 fixture imports", () => {
  const read = (f) => ({ name: f, text: fs.readFileSync(path.join(__dirname, "..", "fixtures", f), "utf8") });
  const { project } = importer.importTurtle([read("archimate4-onto.ttl"), read("archimate4-viewpoints.ttl")]);
  assert.equal(project.meta.prefix, "am4");
  assert.equal(project.elements.length, 62);
  assert.equal(project.relationships.length, 15);
  assert.equal(project.viewpoints.length, 25);
});
