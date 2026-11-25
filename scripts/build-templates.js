#!/usr/bin/env node
/*
 * Rebuilds templates/templates.js — the starting points offered by the studio's
 * "New from template" menu — from the documents committed under fixtures/.
 *
 *   node scripts/build-templates.js
 *
 * The ArchiMate 4.0 template is imported from the published ArchiMate 4.0 documents in fixtures/
 * (fixtures/README.md): its element and relationship types, relationship rules, taxonomy, proposal
 * orders, viewpoints and notation, own shapes included.
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
  const { project } = importer.importTurtle(
    ["onto", "tax", "viewpoints", "notation", "metamodel", "relationship-shapes"].map((f) => read(`fixtures/archimate4/archimate4-${f}.ttl`)),
  );
  // The framework's label is in archimate-framework.ttl, which the template does not import.
  project.meta.frameworkLabel = project.meta.frameworkLabel || "ArchiMate";
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
    { id: "Deployment", label: "Deployment", predicate: "deployedOn", predicateLabel: "Deployed On", notation: "d", parent: "", definition: "A workload runs on a platform resource.", domain: ["Workload"], range: ["Cluster"], categories: ["Structural"], style: { line: "solid", source: "circle", target: "filled" } },
    { id: "Usage", label: "Usage", predicate: "uses", predicateLabel: "Uses", notation: "u", parent: "", definition: "A workload depends on another workload or a resource at run time.", domain: ["Workload"], range: ["Workload", "PlatformResource"], categories: ["Dependency"], style: { line: "dashed", source: "none", target: "open" } },
    { id: "Publication", label: "Publication", predicate: "publishesTo", predicateLabel: "Publishes To", notation: "p", parent: "Usage", definition: "A workload publishes messages to a queue.", domain: ["Workload"], range: ["MessageQueue"], categories: ["Dependency"], style: { line: "dashed", source: "none", target: "filled" } },
    { id: "Exposure", label: "Exposure", predicate: "exposes", predicateLabel: "Exposes", notation: "x", parent: "", definition: "An API gateway routes traffic to a workload.", domain: ["ApiGateway"], range: ["Workload"], categories: ["Dependency"], style: { line: "solid", source: "none", target: "open", stroke: "#1f6f8b" } },
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
      // Workloads before the cluster they run on: an order of its own (SReq 4.4), where la-gram would otherwise sort by name.
      { id: "Compute", label: "Compute", definition: "Things that run code.", parent: "Elements", memberOrder: ["Microservice", "Function", "Cluster"] },
      { id: "Data", label: "Data", definition: "Things that hold state.", parent: "Elements" },
      { id: "Integration", label: "Integration", definition: "Things that connect workloads.", parent: "Elements" },
      { id: "Relationships", label: "Relationships", definition: "", parent: "" },
      { id: "Structural", label: "Structural", definition: "", parent: "Relationships" },
      { id: "Dependency", label: "Dependency", definition: "", parent: "Relationships" },
    ],
    // A palette section for each kind of element; a diagram keeps the entry points on top and the data at the
    // bottom (SReq 4.5).
    paletteGrouping: { id: "PaletteGrouping", label: "", definition: "", members: ["Elements"] },
    diagramGroupOrder: { id: "DiagramGroupOrder", label: "", definition: "", scopeNote: "", members: ["Integration", "Compute", "Data"] },
  };
  p.proposalOrders = [
    { id: "ProposalOrder", label: "", members: ["Usage", "Deployment", "Publication", "Exposure"], domain: [], range: [] },
    // From a workload to a platform resource, running on it and publishing to it come before using it.
    { id: "WorkloadToResourceOrder", label: "Workload to platform resource", members: ["Deployment", "Publication", "Usage"], domain: ["Workload"], range: ["PlatformResource"] },
  ];
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
  archimate4: { label: "ArchiMate 4.0", description: "The published ArchiMate 4.0: element and relationship types, relationship rules, taxonomy, proposal orders, the Appendix C viewpoints and the notation.", project: archimate4() },
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
