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
const ISO_THES = "http://purl.org/iso25964/skos-thes#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

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

test("a format /1 project opens as /3 (SReq 10.3, SD-9)", () => {
  const p = core.normalize({
    format: "linked-archi-metamodel-studio/1",
    proposalOrder: ["Usage", "Deployment"],
    relationships: [{ id: "Usage", style: { line: "dashed", arrow: "open" } }, { id: "Deployment" }],
  });
  assert.equal(p.format, "linked-archi-metamodel-studio/3");
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

// ---------------------------------------------------------------- orders (SReq 4.4–4.5)

/** The members of an RDF list, as IRIs. */
function listOf(s, head) {
  const out = [];
  for (let cell = head; cell && cell.value !== RDF + "nil"; cell = s.getObjects(cell, RDF + "rest", null)[0]) out.push(s.getObjects(cell, RDF + "first", null)[0].value);
  return out;
}

test("a category's own order is a thesaurus array under it; the manifest names the palette grouping and the diagram group order (SReq 4.4–4.5)", () => {
  const p = project("cloudplatform");
  const ns = core.namespaces(p);
  const T = ns.cptax, C = ns.cp;
  const tax = store(files(p).get("taxonomy").content);
  const arrays = tax.getSubjects(RDF + "type", ISO_THES + "ThesaurusArray", null).map((x) => x.value);
  assert.deepEqual(arrays, [T + "ComputeOrder"], "only the category with an order of its own");
  assert.equal(tax.getObjects(T + "ComputeOrder", ISO_THES + "superOrdinate", null)[0].value, T + "Compute");
  assert.deepEqual(listOf(tax, tax.getObjects(T + "ComputeOrder", SKOS + "memberList", null)[0]), ["Microservice", "Function", "Cluster"].map((x) => C + x));
  assert.deepEqual(listOf(tax, tax.getObjects(T + "PaletteGrouping", SKOS + "memberList", null)[0]), [T + "Elements"]);
  assert.deepEqual(listOf(tax, tax.getObjects(T + "DiagramGroupOrder", SKOS + "memberList", null)[0]), ["Integration", "Compute", "Data"].map((x) => T + x));
  const manifest = store(files(p).get("manifest").content);
  const mm = ns.cpmm + p.meta.name;
  assert.equal(manifest.getObjects(mm, ARCH + "paletteGrouping", null)[0].value, T + "PaletteGrouping");
  assert.equal(manifest.getObjects(mm, ARCH + "diagramGroupOrder", null)[0].value, T + "DiagramGroupOrder");
});

test("without an order of its own a category writes no array, and nothing names an empty collection", () => {
  const p = project("cloudplatform");
  assert.ok(core.clearOrder(p, "Compute"));
  p.taxonomy.paletteGrouping.members = [];
  p.taxonomy.diagramGroupOrder.members = ["Gone"];
  const tax = files(p).get("taxonomy").content;
  assert.doesNotMatch(tax, /ThesaurusArray|PaletteGrouping|DiagramGroupOrder/);
  assert.doesNotMatch(files(p).get("manifest").content, /paletteGrouping|diagramGroupOrder/);
  assert.match(lint(p).filter((i) => i.level === "error").map((i) => i.message).join("\n"), /The diagram group order names "Gone"/);
});

test("the published ArchiMate 4.0 keeps its orders, palette grouping and diagram group order (SReq 7.2, 9.4)", () => {
  const p = project("archimate4");
  const ordered = p.taxonomy.categories.filter((c) => core.narrowerOrder(p, c.id).explicit).map((c) => c.id);
  assert.deepEqual(ordered.sort(), ["Aspect", "CommonDomain", "DependencyRelationship", "Domain", "DynamicRelationship", "Relationship", "StructuralRelationship"]);
  assert.deepEqual(core.narrowerOrder(p, "Domain").categories.slice(0, 3), ["CommonDomain", "BusinessDomain", "ApplicationDomain"]);
  assert.deepEqual(core.narrowerOrder(p, "StructuralRelationship").members, ["Composition", "Aggregation", "Assignment", "Realization"]);
  assert.deepEqual(p.taxonomy.paletteGrouping.members, ["Domain", "Aspect"]);
  assert.equal(p.taxonomy.diagramGroupOrder.members[0], "MotivationDomain");
  // The published names come back.
  const tax = store(files(p).get("taxonomy").content);
  const T = core.namespaces(p).am4tax;
  assert.equal(tax.getSubjects(RDF + "type", ISO_THES + "ThesaurusArray", null).length, 7);
  assert.equal(tax.getObjects(T + "DomainOrder", SKOS + "prefLabel", null)[0].value, "Domains in Order");
  assert.equal(tax.getObjects(T + "CommonDomainOrder", ISO_THES + "superOrdinate", null)[0].value, T + "CommonDomain");
});

test("renaming and deleting reach the orders and the collections", () => {
  const p = project("cloudplatform");
  core.renameRef(p, "Microservice", "Service", "concept");
  p.elements.find((e) => e.id === "Microservice").id = "Service";
  assert.deepEqual(p.taxonomy.categories.find((c) => c.id === "Compute").memberOrder, ["Service", "Function", "Cluster"]);
  core.renameRef(p, "Compute", "Processing", "taxonomy");
  p.taxonomy.categories.find((c) => c.id === "Compute").id = "Processing";
  assert.deepEqual(p.taxonomy.diagramGroupOrder.members, ["Integration", "Processing", "Data"]);
  core.removeRef(p, "Elements", "taxonomy.categories");
  assert.deepEqual(p.taxonomy.paletteGrouping.members, []);
  core.removeRef(p, "Cluster", "elements");
  assert.deepEqual(p.taxonomy.categories.find((c) => c.id === "Processing").memberOrder, ["Service", "Function"]);
});

test("a format /2 project opens as /3 with no orders", () => {
  const p = core.normalize({ format: "linked-archi-metamodel-studio/2", taxonomy: { label: "", categories: [{ id: "A", label: "A", parent: "" }] } });
  assert.equal(p.format, core.FORMAT);
  assert.deepEqual(p.taxonomy.categories[0], { id: "A", label: "A", definition: "", parent: "", standsFor: "", categoryOrder: [], memberOrder: [], orderLabel: "" });
  assert.deepEqual(p.taxonomy.paletteGrouping, { id: "PaletteGrouping", label: "", definition: "", members: [] });
  assert.equal(p.taxonomy.diagramGroupOrder.id, "DiagramGroupOrder");
});

// ---------------------------------------------------------------- hierarchies and classification (SReq 11)

test("a type with two parents has a path through each; moves keep the other parent and refuse cycles (SReq 11.1–11.2)", () => {
  const p = project("archimate4");
  assert.deepEqual(core.elementPaths(p, "ApplicationComponent").map((path) => path.join(">")), [
    "arch:Element>StructureElement>ActiveStructureElement>InternalActiveStructureElement>ApplicationComponent",
    "arch:Element>ApplicationDomainElement>ApplicationComponent",
  ]);
  assert.deepEqual(core.subtypes(p, "ApplicationDomainElement").sort(), ["ApplicationComponent", "ApplicationInterface", "DataObject"]);
  // A move replaces the parent it names, in its place.
  assert.ok(core.moveParent(p, "ApplicationComponent", "ApplicationDomainElement", "TechnologyDomainElement"));
  assert.deepEqual(p.elements.find((e) => e.id === "ApplicationComponent").parents, ["InternalActiveStructureElement", "TechnologyDomainElement"]);
  // Under itself or one of its subtypes: refused, nothing changes.
  assert.equal(core.moveParent(p, "StructureElement", "arch:Element", "InternalActiveStructureElement"), false);
  assert.equal(core.addParent(p, "ActiveStructureElement", "ApplicationComponent"), false);
  assert.deepEqual(p.elements.find((e) => e.id === "StructureElement").parents, []);
  assert.ok(core.addParent(p, "Device", "ApplicationDomainElement"));
  assert.ok(core.removeParent(p, "Device", "ApplicationDomainElement"));
  assert.equal(core.removeParent(p, "Device", "ApplicationDomainElement"), false);
  // Moving to arch:Element takes the parent away.
  assert.ok(core.moveParent(p, "Grouping", "CompositeElement", "arch:Element"));
  assert.deepEqual(p.elements.find((e) => e.id === "Grouping").parents, []);
  // An outside parent is a path's root.
  const cp = project("cloudplatform");
  assert.deepEqual(core.elementPaths(cp, "ApiGateway").map((path) => path[0]).sort(), ["am4:Node", "am4:TechnologyInterface"]);
});

test("a relationship type becomes a kind of another, never of its own subtype (SReq 11.2)", () => {
  const p = project("archimate4");
  assert.deepEqual(core.relationshipPath(p, "ReadAccess"), ["arch:QualifiedRelationship", "Access", "ReadAccess"]);
  assert.equal(core.setRelationshipParent(p, "Access", "ReadAccess"), false);
  assert.ok(core.setRelationshipParent(p, "Composition", ""));
  assert.equal(p.relationships.find((r) => r.id === "Composition").parent, "");
  p.relationships.push({ id: "Peek", parent: "", predicate: "", domain: [], range: [], categories: [] });
  assert.ok(core.setRelationshipParent(p, "Peek", "Access"));
  assert.equal(p.relationships.find((r) => r.id === "Peek").predicate, "accesses", "a subtype takes its parent's predicate");
});

test("categories move and keep an order; types are classified, regrouped and ordered (SReq 11.3, 11.5, 11.7)", () => {
  const p = project("archimate4");
  assert.equal(core.moveCategory(p, "Aspect", "StructureAspect"), false, "never under its own sub-category");
  assert.ok(core.moveCategory(p, "EventAspect", "Aspect", "StructureAspect"));
  assert.deepEqual(core.subcategories(p, "Aspect").slice(0, 2), ["EventAspect", "StructureAspect"]);
  assert.ok(core.shift(p, "Domain", "categories", "BusinessDomain", -1));
  assert.deepEqual(core.subcategories(p, "Domain").slice(0, 2), ["BusinessDomain", "CommonDomain"]);
  // Members: a category with no order of its own lists them by label; a move makes one.
  assert.equal(core.narrowerOrder(p, "BusinessDomain").explicit, false);
  assert.deepEqual(core.categoryMembers(p, "BusinessDomain", false), ["BusinessActor", "BusinessInterface", "BusinessObject", "Product"]);
  assert.ok(core.reorder(p, "BusinessDomain", "members", "Product", "BusinessActor"));
  assert.equal(core.narrowerOrder(p, "BusinessDomain").explicit, true);
  assert.equal(core.categoryMembers(p, "BusinessDomain", false)[0], "Product");
  // Leaving a category takes a type out of its order too.
  assert.ok(core.classify(p, "Product", "ApplicationDomain", "BusinessDomain"));
  assert.ok(!p.taxonomy.categories.find((c) => c.id === "BusinessDomain").memberOrder.includes("Product"));
  assert.equal(core.classify(p, "Product", "ApplicationDomain"), false, "already there");
  // In the grid: from the Business Domain's branch to the Technology Domain's, keeping its aspect.
  assert.ok(core.regroup(p, "BusinessActor", "BusinessDomain", "TechnologyDomain"));
  assert.deepEqual(p.elements.find((e) => e.id === "BusinessActor").categories.sort(), ["InternalActiveStructure", "TechnologyDomain"]);
  assert.ok(core.unclassify(p, "BusinessActor", "TechnologyDomain"));
});

test("viewpoints and their categories move, never under themselves (SReq 11.3)", () => {
  const p = project("archimate4");
  const [a, b] = p.viewpointCategories.filter((c) => !c.parent);
  assert.ok(core.moveViewpointCategory(p, b.id, a.id));
  assert.equal(core.moveViewpointCategory(p, a.id, b.id), false);
  const v = p.viewpoints[0];
  const from = v.categories[0];
  assert.ok(core.moveViewpoint(p, v.id, from, b.id));
  assert.ok(!v.categories.includes(from) && v.categories.includes(b.id));
  assert.ok(core.moveViewpoint(p, v.id, b.id, from, true), "kept in both");
  assert.ok(v.categories.includes(from) && v.categories.includes(b.id));
});

test("a category matches the abstract type whose subtypes are its members (SReq 11.6, SD-13)", () => {
  const p = project("archimate4");
  const matches = core.categoryMatches(p);
  assert.equal([...matches.values()].filter((m) => m.exact).length, 16);
  assert.deepEqual(matches.get("ApplicationDomain"), { type: "ApplicationDomainElement", exact: true, extra: [], missing: [] });
  assert.deepEqual(matches.get("CommonDomain"), { type: "CommonDomainElement", exact: false, extra: ["Grouping", "Location"], missing: [] });
  assert.deepEqual(core.typeMatches(p, "MotivationElement").map((m) => m.category).sort(), ["MotivationAspect", "MotivationDomain"]);
  // Cloud Platform's Compute holds both workloads and the cluster: too far from Workload to be shown as its match.
  assert.equal(core.categoryMatches(project("cloudplatform")).has("Compute"), false);
});

test("a change on one side of an exact match offers the same change on the other (SReq 11.6)", () => {
  const p = project("archimate4");
  let before = core.matchSnapshot(p);
  core.moveParent(p, "BusinessActor", "BusinessDomainElement", "ApplicationDomainElement");
  assert.deepEqual(core.matchFollowUps(p, before).map((f) => [f.action, f.category, f.ids.join()]).sort(), [
    ["classify", "ApplicationDomain", "BusinessActor"],
    ["unclassify", "BusinessDomain", "BusinessActor"],
  ]);
  for (const f of core.matchFollowUps(p, before)) core.applyFollowUp(p, f);
  assert.deepEqual(p.elements.find((e) => e.id === "BusinessActor").categories.sort(), ["ApplicationDomain", "InternalActiveStructure"]);
  // Classified in a sub-category: the most specific type is offered, not its ancestors as well.
  before = core.matchSnapshot(p);
  core.classify(p, "BusinessObject", "InternalBehavior");
  assert.deepEqual(core.matchFollowUps(p, before).map((f) => [f.action, f.type, f.ids.join()]), [["addParent", "InternalBehaviorElement", "BusinessObject"]]);
});

test("the relations of a type: paths, rules, attributes, guidance, orders and viewpoints (SReq 11.4)", () => {
  const p = project("cloudplatform");
  const r = core.relationsOf(p, "Microservice");
  assert.deepEqual(r.paths, [["am4:ApplicationComponent", "Workload", "Microservice"]]);
  assert.deepEqual(r.categories, [{ id: "Compute", path: ["Elements", "Compute"] }]);
  assert.deepEqual(r.rulesOut.map((x) => [x.rel, x.refs.length]), [["Deployment", 1], ["Usage", 4], ["Publication", 1]]);
  // By label: "Microservice" before "Serverless Function".
  assert.deepEqual(r.rulesIn.map((x) => [x.rel, x.refs.join()]), [["Usage", "Microservice,Function"], ["Exposure", "ApiGateway"]]);
  assert.deepEqual(r.attributes, [{ id: "resilienceLevel", via: "Workload" }, { id: "replicas", via: null }]);
  assert.deepEqual(r.guidance.filter((g) => g.rel === "Usage").map((g) => g.side), ["domain", "range"]);
  assert.deepEqual(r.proposalOrders, [{ id: "WorkloadToResourceOrder", side: "domain", via: "Workload" }]);
  assert.equal(r.viewpoints.length, 3);
  const usage = core.relationsOf(p, "Usage");
  assert.deepEqual(usage.subtypes, ["Publication"]);
  assert.deepEqual(usage.proposalOrders.map((o) => [o.id, o.position]), [["ProposalOrder", 1], ["WorkloadToResourceOrder", 3]]);
  assert.equal(usage.pairs, 7);
});

test("checks catch an order whose name is taken", () => {
  const p = project("cloudplatform");
  p.taxonomy.categories.push({ id: "ComputeOrder", label: "Clash", parent: "", categoryOrder: [], memberOrder: [], orderLabel: "" });
  assert.match(lint(p).filter((i) => i.level === "error").map((i) => i.message).join("\n"), /The order of Compute is written as ComputeOrder/);
});

// ---------------------------------------------------------------- the type a category stands for (SReq 4.6, SD-17)

test("a category keeps the element type it stands for: read from rdfs:seeAlso and written back (SReq 4.6)", () => {
  const p = project("archimate4");
  const linked = p.taxonomy.categories.filter((c) => c.standsFor);
  assert.equal(linked.length, 14);
  assert.equal(p.taxonomy.categories.find((c) => c.id === "ApplicationDomain").standsFor, "ApplicationDomainElement");
  // A link to a strength collection is no type.
  assert.equal(p.taxonomy.categories.find((c) => c.id === "StructuralRelationship").standsFor, "");
  const ns = core.namespaces(p);
  const tax = store(files(p).get("taxonomy").content);
  assert.deepEqual(tax.getObjects(ns.am4tax + "ApplicationDomain", RDFS + "seeAlso", null).map((o) => o.value), [ns.am4 + "ApplicationDomainElement"]);
  assert.equal(tax.getQuads(null, RDFS + "seeAlso", null, null).length, 14);
});

test("renaming and deleting reach the type a category stands for", () => {
  const p = project("archimate4");
  core.renameRef(p, "ApplicationDomainElement", "AppDomainElement", "concept");
  assert.equal(p.taxonomy.categories.find((c) => c.id === "ApplicationDomain").standsFor, "AppDomainElement");
  core.removeRef(p, "TechnologyDomainElement", "elements");
  assert.equal(p.taxonomy.categories.find((c) => c.id === "TechnologyDomain").standsFor, "");
});

test("the link a category states is compared with its members; checks say where they differ (SReq 4.6, 11.6)", () => {
  const p = project("archimate4");
  const links = core.categoryLinks(p);
  assert.equal(links.get("ApplicationDomain").stated.exact, true);
  assert.deepEqual(links.get("CommonDomain").stated, { type: "CommonDomainElement", exact: false, extra: ["Grouping", "Location"], missing: [] });
  const info = lint(p).filter((i) => i.level === "info").map((i) => i.message).join("\n");
  assert.match(info, /Category CommonDomain stands for CommonDomainElement\. Grouping and Location are in it, yet no subtypes of it\./);
  // A link to a relationship type is wrong; an empty category standing for a concrete type is read as that type.
  p.taxonomy.categories.find((c) => c.id === "Junction").standsFor = "Serving";
  p.taxonomy.categories.push({ id: "Devices", label: "Devices", parent: "", standsFor: "Device", categoryOrder: [], memberOrder: [], orderLabel: "" });
  const found = lint(p);
  assert.match(found.filter((i) => i.level === "warning").map((i) => i.message).join("\n"), /stands for, "Serving" is a relationship/);
  assert.match(found.filter((i) => i.level === "info").map((i) => i.message).join("\n"), /Devices has nothing under it and stands for Device/);
});

// ---------------------------------------------------------------- the languages a project extends (SReq 12, SD-18)

const bundled = () => Object.values(templates).map((t) => ({ namespace: core.conceptNamespace(t.project), project: t.project, bundled: true }));

test("a project's imports say which languages it extends; the studio shows those it has (SReq 12.1–12.4)", () => {
  const p = project("cloudplatform");
  const bases = core.basesFor(p, bundled());
  assert.deepEqual(bases.map((b) => [b.prefix, b.title, b.bundled]), [["am4", "ArchiMate 4.0", true]]);
  const ctx = core.withBases(p, bases);
  // Its types reach the core root through ArchiMate 4.0's, and inherit its categories.
  assert.deepEqual(core.elementPaths(ctx, "Microservice").map((path) => path.join(">")), [
    "arch:Element>am4:StructureElement>am4:ActiveStructureElement>am4:InternalActiveStructureElement>am4:ApplicationComponent>Workload>Microservice",
    "arch:Element>am4:ApplicationDomainElement>am4:ApplicationComponent>Workload>Microservice",
  ]);
  assert.deepEqual(core.relationsOf(ctx, "Microservice").inherited.map((c) => [c.label, c.via]), [
    ["Domain › Application Domain", "am4:ApplicationComponent"],
    ["Aspect › Structure › Active Structure › Internal Active Structure", "am4:ApplicationComponent"],
  ]);
  assert.deepEqual(core.subtypes(ctx, "am4:ApplicationComponent"), ["Workload"]);
  assert.deepEqual(core.relationshipPath(ctx, "am4:ReadAccess"), ["arch:QualifiedRelationship", "am4:Access", "am4:ReadAccess"]);
  assert.equal(core.canSpecialize(ctx, "Cluster", "am4:Serving"), false, "a relationship type is no parent for an element type");
  // A base type's own page: its subtypes, the project's included.
  assert.deepEqual(core.relationsOf(ctx, "am4:Node").subtypes, ["PlatformResource"]);
  // The project itself is as it was.
  assert.deepEqual(p.externalConcepts, []);
  assert.equal(p.attributes.length, 2);
});

test("checks say when a reference into a language the project extends names nothing there (SReq 12.5)", () => {
  const p = project("cloudplatform");
  p.elements.find((e) => e.id === "Cluster").parents = ["PlatformResource", "am4:Kubernetes"];
  p.relationships.find((r) => r.id === "Usage").parent = "am4:Node";
  const bases = core.basesFor(p, bundled());
  const warnings = lint(p, { bases }).filter((i) => i.level === "warning").map((i) => i.message).join("\n");
  assert.match(warnings, /Parent of Cluster "am4:Kubernetes" is not a type of ArchiMate 4\.0/);
  assert.match(warnings, /Parent of Usage "am4:Node" is an element of ArchiMate 4\.0/);
  assert.doesNotMatch(lint(p).map((i) => i.message).join("\n"), /am4:Kubernetes/, "without the base, nothing to compare with");
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
