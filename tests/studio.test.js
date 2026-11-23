// Dependency-free checks: `node --test` (or `npm test`). The Python suite in this folder adds independent RDF and
// SHACL validation of the same output, and tests/kernel/ checks what la-gram and the workspace read from it.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const core = require("../js/core.js");
const generator = require("../js/generator.js");
const importer = require("../js/importer.js");
const { lint } = require("../js/lint.js");
const zip = require("../js/zip.js");
const templates = require("../templates/templates.js");

const N3 = importer.N3;
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const OWL = "http://www.w3.org/2002/07/owl#";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const VANN = "http://purl.org/vocab/vann/";
const ARCH = "https://meta.linked.archi/core#";
const VIS = "https://meta.linked.archi/core-vis#";

function quads(text) {
  return new N3.Parser({ format: "text/turtle" }).parse(text);
}

/** Canonical lines for comparing graphs whose blank nodes may be renamed. */
function signature(text) {
  const lines = quads(text).map((q) => [q.subject, q.predicate, q.object]
    .map((t) => (t.termType === "BlankNode" ? "_" : t.termType === "Literal" ? JSON.stringify([t.value, t.language, t.datatype.value]) : t.value))
    .join(" "));
  return lines.sort();
}

const project = (name) => core.normalize(JSON.parse(JSON.stringify(templates[name].project)));
const files = (p) => new Map(generator.generate(p).map((f) => [f.kind, f]));
const store = (text) => new N3.Store(quads(text));
const fixture = (rel) => ({ name: rel, text: fs.readFileSync(path.join(__dirname, "..", "fixtures", rel), "utf8") });

// ---------------------------------------------------------------- templates

for (const [name, t] of Object.entries(templates)) {
  test(`template ${name} generates parseable Turtle and no error`, () => {
    const ttl = generator.generate(t.project).filter((f) => f.name.endsWith(".ttl"));
    assert.equal(ttl.length, 6);
    for (const f of ttl) assert.ok(quads(f.content).length > 0, f.name);
    assert.deepEqual(lint(t.project).filter((i) => i.level === "error"), []);
  });
}

for (const name of ["cloudplatform", "archimate4"]) {
  test(`${name}: generate -> import -> generate is lossless (SReq 7.5)`, () => {
    const first = generator.generate(project(name)).filter((f) => f.name.endsWith(".ttl"));
    const { project: again } = importer.importTurtle(first.map((f) => ({ name: f.name, text: f.content })));
    const second = new Map(generator.generate(again).map((f) => [f.name, f.content]));
    for (const f of first) assert.deepEqual(signature(second.get(f.name)), signature(f.content), f.name);
  });
}

// ---------------------------------------------------------------- headers (SReq 1)

test("every document declares its preferred namespace and prefix (SReq 1.2)", () => {
  const p = project("cloudplatform");
  const ns = core.namespaces(p);
  const P = p.meta.prefix;
  const expected = { onto: P, shapes: `${P}sh`, taxonomy: `${P}tax`, viewpoints: `${P}vp`, notation: `${P}not`, manifest: `${P}mm` };
  for (const [kind, prefix] of Object.entries(expected)) {
    const s = store(files(p).get(kind).content);
    const root = ns[prefix];
    assert.equal(s.getObjects(root, VANN + "preferredNamespacePrefix", null)[0]?.value, prefix, kind);
    assert.equal(s.getObjects(root, VANN + "preferredNamespaceUri", null)[0]?.value, root, kind);
  }
});

test("the taxonomy is a plain concept scheme (SReq 1.3, SD-5)", () => {
  const p = project("cloudplatform");
  const scheme = core.namespaces(p)[`${p.meta.prefix}tax`];
  const s = store(files(p).get("taxonomy").content);
  assert.deepEqual(s.getObjects(scheme, RDF + "type", null).map((o) => o.value), [SKOS + "ConceptScheme"]);
  for (const prop of ["imports", "versionIRI", "priorVersion"]) assert.equal(s.getObjects(scheme, OWL + prop, null).length, 0, prop);
  assert.equal(s.getObjects(scheme, OWL + "versionInfo", null)[0]?.value, p.meta.version);
});

// ---------------------------------------------------------------- proposal orders (SReq 4)

test("the manifest names each proposal order, and the taxonomy declares it in order (SReq 1.4, 4.2)", () => {
  const p = project("cloudplatform");
  const ns = core.namespaces(p);
  const P = p.meta.prefix;
  const manifest = store(files(p).get("manifest").content);
  const tax = store(files(p).get("taxonomy").content);
  const named = manifest.getObjects(ns[`${P}mm`] + p.meta.name, ARCH + "relationshipProposalOrder", null).map((o) => o.value).sort();
  assert.deepEqual(named, p.proposalOrders.map((o) => ns[`${P}tax`] + o.id).sort());
  assert.equal(tax.getSubjects(RDF + "type", ARCH + "RelationshipProposalOrder", null).length, 0);
  for (const o of p.proposalOrders) {
    const iri = ns[`${P}tax`] + o.id;
    assert.ok(tax.has(N3.DataFactory.quad(N3.DataFactory.namedNode(iri), N3.DataFactory.namedNode(RDF + "type"), N3.DataFactory.namedNode(SKOS + "OrderedCollection"))), o.id);
    const list = [];
    for (let cell = tax.getObjects(iri, SKOS + "memberList", null)[0]; cell && cell.value !== RDF + "nil"; cell = tax.getObjects(cell, RDF + "rest", null)[0]) {
      list.push(tax.getObjects(cell, RDF + "first", null)[0].value);
    }
    assert.deepEqual(list, o.members.map((m) => ns[P] + m), o.id);
    assert.deepEqual(tax.getObjects(iri, ARCH + "domainIncludes", null).map((x) => x.value).sort(), o.domain.map((d) => ns[P] + d).sort(), o.id);
  }
});

// ---------------------------------------------------------------- notation (SReq 6)

test("the notation is written in core-vis terms (SReq 6, SD-2)", () => {
  const p = project("cloudplatform");
  const ns = core.namespaces(p);
  const N = ns[`${p.meta.prefix}not`];
  const text = files(p).get("notation").content;
  const s = store(text);
  assert.ok(!/core-vis#(shape|arrowHead)\b/.test(quads(text).map((q) => q.predicate.value).join(" ")), "no term core-vis lacks");
  assert.ok(s.getObjects(N, OWL + "imports", null).some((o) => o.value === VIS), "imports core-vis");
  const styleOf = (concept) => {
    const vn = s.getSubjects(VIS + "notationFor", ns[p.meta.prefix] + concept, null)[0];
    return s.getObjects(vn, VIS + "defaultStyle", null)[0];
  };
  assert.equal(s.getObjects(styleOf("Microservice"), VIS + "shapeType", null)[0].value, VIS + "RoundedRectangle");
  assert.equal(s.getObjects(styleOf("Microservice"), VIS + "fillColor", null)[0].value, "#b5e3f5");
  assert.equal(s.getObjects(styleOf("Database"), VIS + "shapeType", null)[0].value, N + "Cylinder");
  const usage = styleOf("Usage");
  assert.equal(s.getObjects(usage, VIS + "lineStyle", null)[0].value, VIS + "DashedLine");
  assert.equal(s.getObjects(usage, VIS + "sourceDecor", null)[0].value, VIS + "NoDecoration");
  assert.equal(s.getObjects(usage, VIS + "targetDecor", null)[0].value, VIS + "OpenArrowhead");
  assert.equal(s.getObjects(styleOf("Exposure"), VIS + "lineColor", null)[0].value, "#1f6f8b");
});

test("an own shape is declared with a fallback and its templates (SReq 6.5, SD-3)", () => {
  const p = project("cloudplatform");
  const N = core.namespaces(p)[`${p.meta.prefix}not`];
  const s = store(files(p).get("notation").content);
  const cylinder = N + "Cylinder";
  assert.ok(s.getObjects(cylinder, RDF + "type", null).some((o) => o.value === VIS + "ShapeType"));
  assert.equal(s.getObjects(cylinder, VIS + "fallbackShape", null)[0].value, VIS + "Rectangle");
  assert.equal(s.getObjects(cylinder, VIS + "outlinePath", null)[0].value, core.BUILTIN_SHAPES.cylinder.outline);
  assert.equal(s.getSubjects(RDF + "type", VIS + "ShapeType", null).length, 1, "only the shapes in use");
});

test("renaming or deleting an own shape follows into the element notations", () => {
  const p = project("cloudplatform");
  p.shapes.push({ id: "Bucket", label: "Bucket", fallback: "ellipse", outline: "M0,0 L{w},0 L{w},{h} Z" });
  p.elements.find((e) => e.id === "Database").notation.shape = "Bucket";
  core.renameRef(p, "Bucket", "Pail", "notation");
  p.shapes[0].id = "Pail";
  assert.equal(p.elements.find((e) => e.id === "Database").notation.shape, "Pail");
  core.removeRef(p, "Pail", "shapes");
  assert.equal(p.elements.find((e) => e.id === "Database").notation.shape, "ellipse");
});

// ---------------------------------------------------------------- import (SReq 7)

test("the published ArchiMate 4.0 imports, the RDF 1.2 relationship tables included (SReq 7.2, 7.4)", () => {
  const read = (f) => fixture(`archimate4/archimate4-${f}.ttl`);
  const { project: p } = importer.importTurtle(["onto", "tax", "viewpoints", "notation", "metamodel", "relationship-shapes", "relationship-tables"].map(read));
  assert.equal(p.meta.prefix, "am4");
  assert.equal(p.elements.length, 61);
  assert.equal(p.elements.filter((e) => e.abstract).length, 17);
  assert.equal(p.relationships.length, 15);
  assert.equal(p.viewpoints.length, 25);
  assert.equal(Object.values(p.rules).reduce((n, l) => n + l.length, 0), 5932);
  assert.equal(p.proposalOrders.length, 9);
  assert.deepEqual(p.proposalOrders.find((o) => o.id === "BehaviorProposalOrder").domain, ["BehaviorElement"]);
  assert.deepEqual(p.shapes.map((s) => s.id).sort(), ["BandedRectangle", "Box3D", "Cloud", "Folder", "TabbedRectangle", "WavyRectangle"]);
  assert.equal(p.meta.notationSetName, "ArchiMate40StandardNotation");
  assert.deepEqual(p.relationships.find((r) => r.id === "Composition").style, { line: "solid", source: "filled-diamond", target: "none" });
  assert.equal(p.elements.filter((e) => !e.abstract && e.notation.shape).length, 44);
});

test("output of earlier studio versions still imports (SReq 7.3, SD-9)", () => {
  const ttl = `
    @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix skos: <http://www.w3.org/2004/02/skos/core#> . @prefix arch: <https://meta.linked.archi/core#> .
    @prefix archvis: <https://meta.linked.archi/core-vis#> .
    @prefix x: <https://example.org/x/onto#> . @prefix xtax: <https://example.org/x/tax#> . @prefix xnot: <https://example.org/x/notation#> .
    <https://example.org/x/onto#> a owl:Ontology .
    x:Store a owl:Class ; rdfs:subClassOf arch:Element .
    x:Uses a owl:Class ; rdfs:subClassOf arch:QualifiedRelationship ; arch:unqualifiedForm x:uses .
    x:uses a owl:ObjectProperty .
    xtax:RelationshipProposalOrder a arch:RelationshipProposalOrder ; skos:memberList ( x:Uses ) .
    xnot:Set a archvis:NotationSet .
    xnot:StoreNotation a archvis:VisualNotation ; archvis:notationFor x:Store ; archvis:inNotationSet xnot:Set ;
      archvis:shape "cylinder" ; archvis:defaultStyle [ a archvis:Style ; archvis:fillColor "#ffeecc" ] .
    xnot:UsesNotation a archvis:VisualNotation ; archvis:notationFor x:Uses ; archvis:inNotationSet xnot:Set ;
      archvis:lineStyle "dashed" ; archvis:arrowHead "filled" .`;
  const { project: p } = importer.importTurtle([{ name: "old.ttl", text: ttl }]);
  assert.deepEqual(p.elements.find((e) => e.id === "Store").notation, { fill: "#ffeecc", shape: "cylinder" });
  assert.deepEqual(p.relationships.find((r) => r.id === "Uses").style, { line: "dashed", target: "filled" });
  assert.deepEqual(p.proposalOrders.map((o) => [o.id, o.members]), [["RelationshipProposalOrder", ["Uses"]]]);
});

test("a format /1 project opens as /2 (SReq 10.3, SD-9)", () => {
  const p = core.normalize({
    format: "linked-archi-metamodel-studio/1",
    proposalOrder: ["Usage", "Deployment"],
    relationships: [{ id: "Usage", style: { line: "dashed", arrow: "open" } }, { id: "Deployment" }],
  });
  assert.equal(p.format, "linked-archi-metamodel-studio/2");
  assert.ok(!("proposalOrder" in p));
  assert.deepEqual(p.proposalOrders.map((o) => [o.id, o.members, o.domain, o.range]), [["ProposalOrder", ["Usage", "Deployment"], [], []]]);
  assert.deepEqual(p.relationships[0].style, { line: "dashed", target: "open" });
});

// ---------------------------------------------------------------- checks (SReq 8)

test("checks catch unknown notation values, empty own shapes and wrong proposal orders (SReq 8.1)", () => {
  const p = project("cloudplatform");
  p.elements.find((e) => e.id === "Database").notation.shape = "blob";
  p.relationships.find((r) => r.id === "Usage").style = { line: "wavy", source: "nail", target: "open" };
  p.shapes.push({ id: "Empty", fallback: "rectangle", outline: "" });
  p.proposalOrders.push({ id: "Second", members: ["Microservice"], domain: [], range: [] });
  const errors = lint(p).filter((i) => i.level === "error").map((i) => i.message).join("\n");
  assert.match(errors, /Database: shape "blob"/);
  assert.match(errors, /line style "wavy"/);
  assert.match(errors, /source end "nail"/);
  assert.match(errors, /Shape Empty has no outline/);
  assert.match(errors, /Proposal order Second names "Microservice"/);
  assert.match(lint(p).filter((i) => i.level === "warning").map((i) => i.message).join("\n"), /2 proposal orders apply to every pair/);
});

test("cloudplatform template passes every check", () => {
  assert.deepEqual(lint(templates.cloudplatform.project).filter((i) => i.level === "error"), []);
});

// ---------------------------------------------------------------- the rest

test("renaming an element updates rules, viewpoints, parents and proposal orders", () => {
  const p = project("cloudplatform");
  // As the UI does: references first, then the item itself.
  core.renameRef(p, "Workload", "Service", "concept");
  p.elements.find((e) => e.id === "Workload").id = "Service";
  assert.ok(p.elements.find((e) => e.id === "Microservice").parents.includes("Service"));
  assert.deepEqual(p.proposalOrders.find((o) => o.id === "WorkloadToResourceOrder").domain, ["Service"]);
  core.renameRef(p, "Usage", "Use", "concept");
  assert.ok(p.rules.Use && !p.rules.Usage);
  assert.ok(p.proposalOrders.every((o) => !o.members.includes("Usage")));
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
