#!/usr/bin/env node
/*
 * Rebuilds templates/templates.js — the starting points offered by the studio's
 * "New from template" menu — from the documents committed under fixtures/.
 *
 *   node scripts/build-templates.js
 *
 * The ArchiMate 4.0 template is imported from the ontology and viewpoint extracts of
 * linked-archi-meta in fixtures/ (see fixtures/README.md). Those extracts carry no ArchiMate 4.0 SHACL
 * shapes and only one taxonomy concept, so the template's taxonomy is derived from the
 * 4.0 domain marker classes, and its relationship rules start empty: import the published
 * archimate4 shapes, or seed them from the domain/range guidance in the studio.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const core = require("../js/core.js");
const importer = require("../js/importer.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(__dirname, "../templates/templates.js");

function read(rel) {
  return { name: rel, text: fs.readFileSync(path.join(ROOT, rel), "utf8") };
}

function archimate4() {
  const { project } = importer.importTurtle([
    read("fixtures/archimate4-onto.ttl"),
    read("fixtures/archimate4-viewpoints.ttl"),
  ]);
  const m = project.meta;
  m.name = "ArchiMate4";
  m.title = "ArchiMate 4.0";
  m.frameworkLabel = "ArchiMate";
  m.manifestStakeholders = ["EnterpriseArchitect", "SolutionArchitect", "BusinessArchitect", "ApplicationArchitect"];
  m.manifestConcerns = ["StructureConcern", "BehaviorConcern", "DependencyConcern", "DeploymentConcern", "EvolutionConcern"];

  // Taxonomy from the domain marker classes (Figure 2-4 of the 4.0 specification).
  const domains = [
    ["CommonDomain", "Common Domain", "CommonDomainElement"],
    ["BusinessDomain", "Business Domain", "BusinessDomainElement"],
    ["ApplicationDomain", "Application Domain", "ApplicationDomainElement"],
    ["TechnologyDomain", "Technology Domain", "TechnologyDomainElement"],
    ["StrategyDomain", "Strategy Domain", "StrategyElement"],
    ["MotivationDomain", "Motivation Domain", "MotivationElement"],
    ["ImplementationAndMigrationDomain", "Implementation & Migration Domain", "ImplementationAndMigrationDomainElement"],
  ];
  project.taxonomy.label = "ArchiMate 4.0 Concept Scheme";
  project.taxonomy.categories = [
    { id: "Domains", label: "Domains", definition: "The element types by the domain of the 4.0 Hexagonion they belong to.", parent: "" },
    ...domains.map(([id, label]) => ({ id, label, definition: "", parent: "Domains" })),
    { id: "OtherElements", label: "Composite elements and junctions", definition: "Elements that belong to no single domain.", parent: "Domains" },
    { id: "Relationships", label: "Relationships", definition: "The relationship types by their kind.", parent: "" },
    { id: "StructuralRelationships", label: "Structural relationships", definition: "", parent: "Relationships" },
    { id: "DependencyRelationships", label: "Dependency relationships", definition: "", parent: "Relationships" },
    { id: "DynamicRelationships", label: "Dynamic relationships", definition: "", parent: "Relationships" },
    { id: "OtherRelationships", label: "Other relationships", definition: "", parent: "Relationships" },
  ];
  for (const e of project.elements) {
    if (e.abstract) continue;
    const anc = core.ancestors(project, e.id);
    const hit = domains.find(([, , marker]) => anc.has(marker));
    e.categories = [hit ? hit[0] : "OtherElements"];
  }
  const relKinds = {
    StructuralRelationships: ["Composition", "Aggregation", "Assignment", "Realization"],
    DependencyRelationships: ["Serving", "Access", "ReadAccess", "WriteAccess", "ReadWriteAccess", "Influence", "Association", "DirectedAssociation"],
    DynamicRelationships: ["Triggering", "Flow"],
    OtherRelationships: ["Specialization"],
  };
  for (const r of project.relationships) {
    const kind = Object.keys(relKinds).find((k) => relKinds[k].includes(r.id));
    r.categories = [kind || "OtherRelationships"];
  }
  project.proposalOrder = ["Serving", "Realization", "Assignment", "Composition", "Aggregation", "Access", "Triggering", "Flow", "Influence", "Specialization", "Association"]
    .filter((id) => project.relationships.some((r) => r.id === id));

  // Default colours of the ArchiMate notation, by domain.
  const colours = {
    BusinessDomain: "#ffffb5", ApplicationDomain: "#b5ffff", TechnologyDomain: "#c9e7b7",
    StrategyDomain: "#f5deaa", MotivationDomain: "#ccccff", ImplementationAndMigrationDomain: "#ffe0e0",
    CommonDomain: "#e8e8e8", OtherElements: "#ffffff",
  };
  for (const e of project.elements) {
    if (e.abstract) continue;
    e.notation = { fill: colours[e.categories[0]] || "#ffffff", stroke: "#000000", shape: /Junction/.test(e.id) ? "circle" : "rectangle" };
  }
  const lines = { Influence: "dashed", Access: "dotted", ReadAccess: "dotted", WriteAccess: "dotted", ReadWriteAccess: "dotted", Flow: "dashed", Realization: "dashed" };
  const arrows = {
    Composition: "filled-diamond", Aggregation: "diamond", Assignment: "filled", Realization: "hollow-triangle",
    Serving: "open", Access: "none", ReadAccess: "open", WriteAccess: "open", ReadWriteAccess: "open", Influence: "open",
    Triggering: "filled", Flow: "filled", Specialization: "hollow-triangle", Association: "none", DirectedAssociation: "open",
  };
  for (const r of project.relationships) r.style = { line: lines[r.id] || "solid", arrow: arrows[r.id] || "open", stroke: "#000000" };
  return core.normalize(project);
}

function cloudPlatform() {
  const p = core.emptyProject();
  Object.assign(p.meta, {
    name: "CloudPlatform",
    title: "Cloud Platform",
    slug: "cloudplatform",
    prefix: "cp",
    baseIri: "https://meta.example.org/cloudplatform/",
    version: "0.1.0",
    languageVersion: "1.0",
    description: "A small custom metamodel for cloud-native platforms. Its element types specialize ArchiMate 4.0 ones, so ArchiMate-aware queries and viewpoints still find them.",
    frameworkLabel: "Cloud Platform Architecture",
    imports: [{ prefix: "am4", namespace: "https://meta.linked.archi/archimate4/onto#" }],
    manifestStakeholders: ["SolutionArchitect", "SoftwareDeveloper", "OperationsManager"],
    manifestConcerns: ["DeploymentConcern", "DependencyConcern", "StructureConcern"],
  });
  const el = (id, parents, cats, fill, definition, extra) => Object.assign({ id, label: core.humanize(id), parents, categories: cats, definition, notation: { fill, stroke: "#333333", shape: "rounded-rectangle" } }, extra || {});
  p.elements = [
    { id: "Workload", label: "Workload", parents: ["am4:ApplicationComponent"], abstract: true, definition: "Software that runs on the platform." },
    { id: "PlatformResource", label: "Platform Resource", parents: ["am4:Node"], abstract: true, definition: "Infrastructure the platform provides to workloads." },
    el("Microservice", ["Workload"], ["Compute"], "#b5e3f5", "An independently deployable service with its own data."),
    el("Function", ["Workload"], ["Compute"], "#c8ecf8", "A short-lived, event-driven unit of compute.", { label: "Serverless Function" }),
    el("Database", ["PlatformResource"], ["Data"], "#d9f2c4", "A managed data store.", { notation: { fill: "#d9f2c4", stroke: "#333333", shape: "cylinder" } }),
    el("MessageQueue", ["PlatformResource"], ["Integration"], "#fde3b5", "A managed queue or topic for asynchronous messaging."),
    el("Cluster", ["PlatformResource"], ["Compute"], "#e3d9f5", "A container orchestration cluster."),
    el("ApiGateway", ["PlatformResource", "am4:TechnologyInterface"], ["Integration"], "#fde3b5", "The managed entry point that exposes workloads' APIs.", { label: "API Gateway" }),
  ];
  p.relationships = [
    { id: "Deployment", label: "Deployment", predicate: "deployedOn", predicateLabel: "Deployed On", notation: "d", parent: "", definition: "A workload runs on a platform resource.", domain: ["Workload"], range: ["Cluster"], categories: ["Structural"], style: { line: "solid", arrow: "filled" } },
    { id: "Usage", label: "Usage", predicate: "uses", predicateLabel: "Uses", notation: "u", parent: "", definition: "A workload depends on another workload or a resource at run time.", domain: ["Workload"], range: ["Workload", "PlatformResource"], categories: ["Dependency"], style: { line: "dashed", arrow: "open" } },
    { id: "Publication", label: "Publication", predicate: "publishesTo", predicateLabel: "Publishes To", notation: "p", parent: "Usage", definition: "A workload publishes messages to a queue.", domain: ["Workload"], range: ["MessageQueue"], categories: ["Dependency"], style: { line: "dashed", arrow: "filled" } },
    { id: "Exposure", label: "Exposure", predicate: "exposes", predicateLabel: "Exposes", notation: "x", parent: "", definition: "An API gateway routes traffic to a workload.", domain: ["ApiGateway"], range: ["Workload"], categories: ["Dependency"], style: { line: "solid", arrow: "open" } },
  ];
  p.attributes = [
    { id: "resilienceLevel", label: "Resilience Level", definition: "The availability tier a workload is engineered for.", domain: ["Workload"], datatype: "xsd:string", values: ["tier-1", "tier-2", "tier-3"], required: true, multiple: false },
    { id: "replicas", label: "Replicas", definition: "The number of instances a microservice runs with.", domain: ["Microservice"], datatype: "xsd:integer", values: [], required: false, multiple: false },
  ];
  const rules = {
    Deployment: ["Microservice|Cluster", "Function|Cluster"],
    Usage: ["Microservice|Microservice", "Microservice|Function", "Microservice|Database", "Microservice|MessageQueue", "Function|Database", "Function|MessageQueue", "Function|Microservice"],
    Publication: ["Microservice|MessageQueue", "Function|MessageQueue"],
    Exposure: ["ApiGateway|Microservice", "ApiGateway|Function"],
  };
  p.rules = rules;
  p.taxonomy = {
    label: "Cloud Platform Concept Scheme",
    categories: [
      { id: "Elements", label: "Elements", definition: "", parent: "" },
      { id: "Compute", label: "Compute", definition: "Things that run code.", parent: "Elements" },
      { id: "Data", label: "Data", definition: "Things that hold state.", parent: "Elements" },
      { id: "Integration", label: "Integration", definition: "Things that connect workloads.", parent: "Elements" },
      { id: "Relationships", label: "Relationships", definition: "", parent: "" },
      { id: "Structural", label: "Structural", definition: "", parent: "Relationships" },
      { id: "Dependency", label: "Dependency", definition: "", parent: "Relationships" },
    ],
  };
  p.proposalOrder = ["Usage", "Deployment", "Publication", "Exposure"];
  p.purposes = [{ id: "Designing", label: "Designing", definition: "Creating or refining the platform architecture." }, { id: "Operating", label: "Operating", definition: "Running and troubleshooting the platform." }];
  p.concerns = [
    { id: "Placement", label: "Workload placement", definition: "Where each workload runs." },
    { id: "RuntimeDependencies", label: "Runtime dependencies", definition: "What a workload needs to be available to work." },
    { id: "Exposure", label: "API exposure", definition: "Which workloads are reachable from outside." },
  ];
  p.stakeholders = [
    { id: "PlatformEngineer", label: "Platform Engineer", definition: "", concerns: ["Placement", "RuntimeDependencies"] },
    { id: "ServiceOwner", label: "Service Owner", definition: "", concerns: ["RuntimeDependencies", "Exposure"] },
  ];
  p.viewpointCategories = [{ id: "PlatformViewpoints", label: "Platform viewpoints", definition: "", parent: "" }];
  p.viewpoints = [
    { id: "DeploymentViewpoint", label: "Deployment Viewpoint", definition: "Which workloads run on which clusters.", concepts: ["Microservice", "Function", "Cluster", "Deployment"], stakeholders: ["PlatformEngineer"], concerns: ["Placement"], purposes: ["Designing", "Operating"], viewTypes: ["Diagram", "Matrix"], categories: ["PlatformViewpoints"] },
    { id: "DependencyViewpoint", label: "Dependency Viewpoint", definition: "What each workload depends on at run time.", concepts: ["Microservice", "Function", "Database", "MessageQueue", "Usage", "Publication"], stakeholders: ["ServiceOwner", "PlatformEngineer"], concerns: ["RuntimeDependencies"], purposes: ["Operating"], viewTypes: ["Diagram", "Catalog"], categories: ["PlatformViewpoints"] },
    { id: "ExposureViewpoint", label: "API Exposure Viewpoint", definition: "Which workloads each API gateway exposes.", concepts: ["ApiGateway", "Microservice", "Function", "Exposure"], stakeholders: ["ServiceOwner"], concerns: ["Exposure"], purposes: ["Designing"], viewTypes: ["Catalog"], categories: ["PlatformViewpoints"] },
  ];
  return core.normalize(p);
}

const templates = {
  blank: { label: "Blank metamodel", description: "Start from nothing.", project: core.emptyProject() },
  cloudplatform: { label: "Cloud Platform (extends ArchiMate 4.0)", description: "A small custom metamodel with complete relationship rules, taxonomy and viewpoints.", project: cloudPlatform() },
  archimate4: { label: "ArchiMate 4.0", description: "Elements, relationships and the Appendix C viewpoints from the linked-archi-meta extract. Relationship rules start empty.", project: archimate4() },
};
for (const t of Object.values(templates)) {
  // Templates must not carry the build date: keep the file stable across rebuilds.
  t.project.meta.created = t.project.meta.created || "";
  t.project.meta.modified = t.project.meta.modified || "";
}
templates.blank.project.meta.created = "";
templates.blank.project.meta.modified = "";
templates.cloudplatform.project.meta.created = "2026-11-05";
templates.cloudplatform.project.meta.modified = "2026-11-05";

const body = [
  "/* Generated by scripts/build-templates.js from fixtures/ — do not edit. */",
  "(function (root) {",
  "  var templates = " + JSON.stringify(templates, null, 1) + ";",
  "  if (typeof module === \"object\" && module.exports) module.exports = templates;",
  "  else root.LAStudio = Object.assign(root.LAStudio || {}, { templates: templates });",
  "})(typeof self !== \"undefined\" ? self : this);",
  "",
].join("\n");
fs.writeFileSync(OUT, body);
console.log(`wrote ${path.relative(ROOT, OUT)} (${Object.keys(templates).join(", ")})`);
