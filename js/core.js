/*
 * Linked.Archi Metamodel Studio — shared model definitions.
 *
 * The project file (*.studio.json) is the editable source of a metamodel. Everything a
 * published Linked.Archi semantic asset set contains is derived from it by generator.js:
 * the OWL ontology, SHACL shapes, SKOS taxonomy, viewpoint library, notation set and the
 * arch:Metamodel manifest that ties them together.
 *
 * Loads as a plain <script> (window.LAStudio) or as a CommonJS module under Node, so the
 * same code runs in the browser and in the repository's tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LAStudio = Object.assign(root.LAStudio || {}, { core: factory() });
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Format /2 (SD-10): proposal orders, both line ends, own shapes. normalize() migrates /1. */
  const FORMAT = "linked-archi-metamodel-studio/2";

  /** Namespaces every generated document may use. Values are the published IRIs. */
  const STD_PREFIXES = {
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    owl: "http://www.w3.org/2002/07/owl#",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    skos: "http://www.w3.org/2004/02/skos/core#",
    sh: "http://www.w3.org/ns/shacl#",
    dct: "http://purl.org/dc/terms/",
    vann: "http://purl.org/vocab/vann/",
    bibo: "http://purl.org/ontology/bibo/",
    arch: "https://meta.linked.archi/core#",
    archvp: "https://meta.linked.archi/core-viewpoints#",
    "arch-vis": "https://meta.linked.archi/core-vis#",
    "arch-tax": "https://meta.linked.archi/core-tax#",
  };
  const VIS = STD_PREFIXES["arch-vis"];

  /** Published Linked.Archi language namespaces a custom metamodel can extend. */
  const KNOWN_LANGUAGES = [
    { prefix: "am4", namespace: "https://meta.linked.archi/archimate4/onto#", label: "ArchiMate 4.0" },
    { prefix: "am", namespace: "https://meta.linked.archi/archimate3/onto#", label: "ArchiMate 3.2" },
    { prefix: "bpmn", namespace: "https://meta.linked.archi/bpmn/onto#", label: "BPMN 2.0" },
    { prefix: "c4", namespace: "https://meta.linked.archi/c4/onto#", label: "C4 model" },
    { prefix: "bs", namespace: "https://meta.linked.archi/backstage/onto#", label: "Backstage catalog" },
    { prefix: "lmm", namespace: "https://meta.linked.archi/leanix/onto#", label: "LeanIX Meta Model v4" },
  ];

  /** Shared stakeholders and concerns published in core-viewpoints (archvp:). */
  const CORE_STAKEHOLDERS = [
    "ApplicationArchitect", "BusinessArchitect", "CIO", "EnterpriseArchitect",
    "OperationsManager", "ProductManager", "SoftwareDeveloper", "SolutionArchitect",
  ];
  const CORE_CONCERNS = [
    "BehaviorConcern", "DependencyConcern", "DeploymentConcern", "EvolutionConcern",
    "GovernanceConcern", "IntegrationConcern", "QualityConcern", "StakeholderConcern",
    "StructureConcern",
  ];

  const VIEW_TYPES = ["Diagram", "Catalog", "Matrix"];
  const DATATYPES = ["xsd:string", "xsd:boolean", "xsd:integer", "xsd:decimal", "xsd:double", "xsd:date", "xsd:dateTime", "xsd:duration", "xsd:anyURI"];

  // ---- notation vocabulary (SD-2): the studio's names in a project, core-vis individuals in the documents

  /** Shapes core-vis defines, by the studio's name, with their core-vis local names. */
  const CORE_SHAPES = {
    rectangle: "Rectangle", "rounded-rectangle": "RoundedRectangle", ellipse: "Ellipse", circle: "Circle",
    hexagon: "Hexagon", diamond: "Diamond", parallelogram: "Parallelogram", octagon: "Octagon",
  };

  /**
   * Figures core-vis does not define (SD-3). Used by an element, one is declared in the notation document as the
   * notation's own arch-vis:ShapeType: a core fallback, and its geometry as path templates over w, h and the
   * variables. A project shape with the same id replaces it.
   */
  const BUILTIN_SHAPES = {
    cylinder: {
      id: "Cylinder", label: "Cylinder", definition: "An upright cylinder, its top rim drawn whole. A data store.",
      fallback: "rectangle", variables: "ry = min(h * 0.15, 12)",
      outline: "M0,{ry} A{w / 2},{ry} 0 0 1 {w},{ry} L{w},{h - ry} A{w / 2},{ry} 0 0 1 0,{h - ry} Z",
      detail: "M0,{ry} A{w / 2},{ry} 0 0 0 {w},{ry}", contentBox: "0 {2 * ry} {w} {h - 3 * ry}", labelBox: "",
    },
    folder: {
      id: "Folder", label: "Folder", definition: "A rectangle with a tab on the left of its top. A grouping or a package.",
      fallback: "rectangle", variables: "th = min(h * 0.2, 12); tw = min(w * 0.4, 80)",
      outline: "M0,0 L{tw},0 L{tw + th / 2},{th} L{w},{th} L{w},{h} L0,{h} Z",
      detail: "M0,{th} L{tw + th / 2},{th}", contentBox: "0 {th} {w} {h - th}", labelBox: "",
    },
  };
  const SHAPES = Object.keys(CORE_SHAPES).concat(Object.keys(BUILTIN_SHAPES));

  const LINE_STYLES = ["solid", "dashed", "dotted"];
  const LINE_STYLE_IRIS = { solid: "SolidLine", dashed: "DashedLine", dotted: "DottedLine" };

  /** Line ends, by the studio's name, with core-vis's decorations. Either end of a line takes one. */
  const DECORATIONS = ["none", "open", "filled", "hollow-triangle", "diamond", "filled-diamond", "circle", "half"];
  const DECORATION_IRIS = {
    none: "NoDecoration", open: "OpenArrowhead", filled: "ClosedArrowhead", "hollow-triangle": "HollowArrowhead",
    diamond: "HollowDiamond", "filled-diamond": "FilledDiamond", circle: "CircleDot", half: "HalfArrowhead",
  };
  /** Earlier name of DECORATIONS. */
  const ARROW_HEADS = DECORATIONS;

  /** core-vis local name -> the studio's name, for import. */
  const invert = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  const SHAPE_NAMES = invert(CORE_SHAPES);
  const LINE_STYLE_NAMES = invert(LINE_STYLE_IRIS);
  const DECORATION_NAMES = invert(DECORATION_IRIS);

  const LOCAL_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
  const PREFIX_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

  function emptyProject() {
    const today = new Date().toISOString().slice(0, 10);
    return {
      format: FORMAT,
      meta: {
        name: "MyMetamodel",
        title: "My Metamodel",
        slug: "my-metamodel",
        prefix: "mm",
        baseIri: "https://meta.example.org/my-metamodel/",
        version: "0.1.0",
        languageVersion: "1.0",
        status: "draft",
        lang: "en",
        creator: "",
        publisher: "",
        license: "",
        description: "",
        created: today,
        modified: today,
        priorVersion: "",
        frameworkLabel: "",
        scopeNote: "",
        historyNote: "",
        changeNote: "",
        imports: [],
        manifestStakeholders: [],
        manifestConcerns: [],
        notationSetName: "",
        assets: { shapes: true, taxonomy: true, viewpoints: true, notation: true },
      },
      elements: [],
      relationships: [],
      attributes: [],
      rules: {},
      taxonomy: { label: "", categories: [] },
      proposalOrders: [],
      shapes: [],
      stakeholders: [],
      concerns: [],
      purposes: [],
      viewpointCategories: [],
      viewpoints: [],
      externalConcepts: [],
    };
  }

  /** Fill in anything an older or hand-written project file left out, and migrate format /1 (SD-9). */
  function normalize(project) {
    const base = emptyProject();
    const p = Object.assign({}, base, project || {});
    p.format = FORMAT;
    p.meta = Object.assign({}, base.meta, p.meta || {});
    p.meta.assets = Object.assign({}, base.meta.assets, p.meta.assets || {});
    for (const key of ["imports", "manifestStakeholders", "manifestConcerns"]) {
      if (!Array.isArray(p.meta[key])) p.meta[key] = [];
    }
    // /1 had one unscoped order: it becomes the general order.
    if (Array.isArray(p.proposalOrder)) {
      if (!Array.isArray((project || {}).proposalOrders) && p.proposalOrder.length) {
        p.proposalOrders = [{ id: "ProposalOrder", members: p.proposalOrder.slice() }];
      }
      delete p.proposalOrder;
    }
    for (const key of ["elements", "relationships", "attributes", "proposalOrders", "shapes", "stakeholders", "concerns", "purposes", "viewpointCategories", "viewpoints", "externalConcepts"]) {
      if (!Array.isArray(p[key])) p[key] = [];
    }
    if (!p.rules || typeof p.rules !== "object" || Array.isArray(p.rules)) p.rules = {};
    p.taxonomy = Object.assign({ label: "", categories: [] }, p.taxonomy || {});
    if (!Array.isArray(p.taxonomy.categories)) p.taxonomy.categories = [];
    p.elements = p.elements.map((e) => Object.assign({
      id: "", label: "", altLabels: [], definition: "", scopeNote: "", example: "", changeNote: "",
      parents: [], abstract: false, categories: [], notation: {},
    }, e));
    p.relationships = p.relationships.map((r) => {
      const out = Object.assign({
        id: "", label: "", predicate: "", predicateLabel: "", predicateDefinition: "", notation: "", parent: "",
        definition: "", scopeNote: "", changeNote: "", domain: [], range: [], categories: [], style: {},
      }, r);
      // /1 decorated one end, the target, as `arrow`.
      const style = Object.assign({}, out.style || {});
      if (style.arrow !== undefined) {
        if (style.target === undefined) style.target = style.arrow;
        delete style.arrow;
      }
      out.style = style;
      return out;
    });
    p.proposalOrders = p.proposalOrders.map((o) => Object.assign({
      id: "", label: "", definition: "", scopeNote: "", members: [], domain: [], range: [],
    }, o));
    p.shapes = p.shapes.map((s) => Object.assign({
      id: "", label: "", definition: "", fallback: "rectangle", variables: "", outline: "", detail: "", contentBox: "", labelBox: "",
    }, s));
    p.attributes = p.attributes.map((a) => Object.assign({
      id: "", label: "", definition: "", domain: [], datatype: "xsd:string", values: [],
      required: false, multiple: false, deprecated: false,
    }, a));
    p.viewpoints = p.viewpoints.map((v) => Object.assign({
      id: "", label: "", definition: "", concepts: [], stakeholders: [], concerns: [],
      purposes: [], viewTypes: [], categories: [],
    }, v));
    p.stakeholders = p.stakeholders.map((s) => Object.assign({ id: "", label: "", definition: "", concerns: [] }, s));
    return p;
  }

  /** "Business Actor" -> "BusinessActor"; "serves to" -> "servesTo" (lowerFirst). */
  function toLocalName(text, lowerFirst) {
    const words = String(text || "").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
    let name = words.map((w, i) => (i === 0 && lowerFirst ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1)).join("");
    if (/^[0-9]/.test(name)) name = "_" + name;
    return name;
  }

  /** "BusinessActor" -> "Business Actor". */
  function humanize(id) {
    return String(id || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  }

  /** Default direct predicate for a relationship class name: Serving -> serves, Flow -> flowsTo. */
  function suggestPredicate(relId) {
    const known = {
      Composition: "composedOf", Aggregation: "aggregates", Assignment: "assignedTo",
      Realization: "realizes", Serving: "serves", Access: "accesses", Influence: "influences",
      Triggering: "triggers", Flow: "flowsTo", Specialization: "specializes",
      Association: "associatedWith", Dependency: "dependsOn", Usage: "uses",
      Ownership: "ownedBy", Deployment: "deployedOn", Containment: "contains",
    };
    if (known[relId]) return known[relId];
    let base = toLocalName(relId, true);
    if (/ing$/.test(base)) return base.replace(/ing$/, "s");
    if (/ion$/.test(base)) return base.replace(/ation$|ion$/, "es");
    return "has" + toLocalName(relId);
  }

  /** Every prefix -> namespace in scope for a project (standard + own + imports). */
  function namespaces(project) {
    const m = project.meta;
    const base = m.baseIri;
    const own = {};
    own[m.prefix] = base + "onto#";
    own[m.prefix + "sh"] = base + "shapes#";
    own[m.prefix + "tax"] = base + "tax#";
    own[m.prefix + "vp"] = base + "viewpoints#";
    own[m.prefix + "not"] = base + "notation#";
    own[m.prefix + "mm"] = base + "metamodel#";
    const imported = {};
    for (const imp of m.imports || []) if (imp.prefix && imp.namespace) imported[imp.prefix] = imp.namespace;
    return Object.assign({}, STD_PREFIXES, imported, own);
  }

  function isCurie(ref) {
    return /^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z_][A-Za-z0-9_.-]*$/.test(ref || "") && !/^https?:/.test(ref);
  }

  /** Concepts (elements and relationships, local and external) addressable by reference. */
  function conceptIndex(project) {
    const idx = new Map();
    for (const e of project.elements) idx.set(e.id, { kind: "element", local: true, item: e, label: e.label || humanize(e.id), abstract: !!e.abstract });
    for (const r of project.relationships) idx.set(r.id, { kind: "relationship", local: true, item: r, label: r.label || humanize(r.id), abstract: false });
    for (const x of project.externalConcepts) {
      if (!x.ref) continue;
      idx.set(x.ref, { kind: x.kind || "element", local: false, item: x, label: x.label || x.ref, abstract: !!x.abstract });
    }
    if (!idx.has("arch:Element")) idx.set("arch:Element", { kind: "element", local: false, item: { ref: "arch:Element" }, label: "Element (core)", abstract: true, core: true });
    return idx;
  }

  /** Concrete element types: the rows and columns of the relationship matrix. */
  function concreteElements(project) {
    const out = project.elements.filter((e) => !e.abstract).map((e) => e.id);
    for (const x of project.externalConcepts) if ((x.kind || "element") === "element" && !x.abstract && x.ref) out.push(x.ref);
    return out;
  }

  /** ref -> every local/external element that is it or inherits from it (transitively). */
  function descendants(project, ref) {
    const children = new Map();
    for (const e of project.elements) {
      for (const parent of e.parents.length ? e.parents : ["arch:Element"]) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(e.id);
      }
    }
    for (const x of project.externalConcepts) {
      for (const parent of x.parents || []) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(x.ref);
      }
    }
    const seen = new Set([ref]);
    const queue = [ref];
    while (queue.length) {
      const next = queue.shift();
      for (const c of children.get(next) || []) if (!seen.has(c)) { seen.add(c); queue.push(c); }
    }
    if (ref === "arch:Element") {
      for (const e of project.elements) seen.add(e.id);
      for (const x of project.externalConcepts) if ((x.kind || "element") === "element") seen.add(x.ref);
    }
    return seen;
  }

  /** ref -> its ancestors (local parents only; external parents stop the walk). */
  function ancestors(project, ref) {
    const byId = new Map(project.elements.map((e) => [e.id, e]));
    const ext = new Map(project.externalConcepts.map((x) => [x.ref, x]));
    const seen = new Set();
    const queue = [ref];
    while (queue.length) {
      const id = queue.shift();
      const item = byId.get(id) || ext.get(id);
      for (const p of (item && item.parents) || []) if (!seen.has(p)) { seen.add(p); queue.push(p); }
    }
    return seen;
  }

  /** Rules are stored per relationship as "Source|Target" pair strings. */
  function pairKey(src, tgt) { return src + "|" + tgt; }
  function splitPair(key) { const i = key.indexOf("|"); return [key.slice(0, i), key.slice(i + 1)]; }

  function ruleSet(project, relId) {
    return new Set(project.rules[relId] || []);
  }

  function setRule(project, relId, src, tgt, allowed) {
    const set = ruleSet(project, relId);
    const key = pairKey(src, tgt);
    if (allowed) set.add(key); else set.delete(key);
    if (set.size) project.rules[relId] = Array.from(set).sort();
    else delete project.rules[relId];
  }

  /**
   * Ids live in four namespaces, so the same local name may be used once in each:
   *   "concept"   elements, relationships and attributes   (<base>onto#)
   *   "taxonomy"  taxonomy categories and proposal orders  (<base>tax#)
   *   "viewpoint" viewpoints, viewpoint categories, stakeholders, concerns, purposes
   *                                                        (<base>viewpoints#)
   *   "notation"  own shapes                               (<base>notation#)
   * Every field that holds a reference belongs to exactly one of them. An element's notation.shape names an own
   * shape; renameRef and removeRef handle it apart, as it is nested.
   */
  const SCOPES = {
    concept: {
      lists: ["elements", "relationships", "attributes"],
      fields: [["elements", "parents"], ["relationships", "domain"], ["relationships", "range"], ["viewpoints", "concepts"], ["externalConcepts", "parents"], ["attributes", "domain"],
        ["proposalOrders", "members"], ["proposalOrders", "domain"], ["proposalOrders", "range"]],
      scalars: [["relationships", "parent"]],
    },
    taxonomy: {
      lists: ["taxonomy.categories", "proposalOrders"],
      fields: [["elements", "categories"], ["relationships", "categories"]],
      scalars: [["taxonomy.categories", "parent"]],
    },
    viewpoint: {
      lists: ["viewpoints", "viewpointCategories", "stakeholders", "concerns", "purposes"],
      fields: [["viewpoints", "stakeholders"], ["viewpoints", "concerns"], ["viewpoints", "purposes"], ["viewpoints", "categories"], ["stakeholders", "concerns"]],
      scalars: [["viewpointCategories", "parent"]],
    },
    notation: {
      lists: ["shapes"],
      fields: [],
      scalars: [],
    },
  };

  function listAt(project, path) {
    return path === "taxonomy.categories" ? project.taxonomy.categories : project[path];
  }

  function scopeOf(listName) {
    for (const [scope, def] of Object.entries(SCOPES)) if (def.lists.includes(listName)) return scope;
    throw new Error("unknown list " + listName);
  }

  /** Rename an id everywhere it is referenced within its scope. */
  function renameRef(project, oldId, newId, scope) {
    if (!oldId || oldId === newId) return;
    const def = SCOPES[scope || "concept"];
    const swap = (list) => (list || []).map((x) => (x === oldId ? newId : x));
    for (const [list, field] of def.fields) for (const item of listAt(project, list)) item[field] = swap(item[field]);
    for (const [list, field] of def.scalars) for (const item of listAt(project, list)) if (item[field] === oldId) item[field] = newId;
    if (scope === "notation") {
      for (const e of project.elements) if (e.notation && e.notation.shape === oldId) e.notation.shape = newId;
    }
    if ((scope || "concept") === "concept") {
      if (project.rules[oldId]) { project.rules[newId] = project.rules[oldId]; delete project.rules[oldId]; }
      for (const rel of Object.keys(project.rules)) {
        project.rules[rel] = project.rules[rel].map((k) => {
          const [s, t] = splitPair(k);
          return pairKey(s === oldId ? newId : s, t === oldId ? newId : t);
        });
      }
    }
  }

  /** Remove an id from its list and every reference to it within its scope. */
  function removeRef(project, id, listName) {
    const scope = scopeOf(listName);
    const def = SCOPES[scope];
    const drop = (list) => (list || []).filter((x) => x !== id);
    const removed = listAt(project, listName).find((x) => x.id === id);
    if (listName === "taxonomy.categories") project.taxonomy.categories = project.taxonomy.categories.filter((x) => x.id !== id);
    else project[listName] = project[listName].filter((x) => x.id !== id);
    for (const [list, field] of def.fields) for (const item of listAt(project, list)) item[field] = drop(item[field]);
    for (const [list, field] of def.scalars) for (const item of listAt(project, list)) if (item[field] === id) item[field] = "";
    if (scope === "notation") {
      // An element drawn as a deleted shape is drawn as that shape's fallback.
      const fallback = (removed && removed.fallback) || "rectangle";
      for (const e of project.elements) if (e.notation && e.notation.shape === id) e.notation.shape = fallback;
    }
    if (scope === "concept") {
      delete project.rules[id];
      for (const rel of Object.keys(project.rules)) {
        project.rules[rel] = project.rules[rel].filter((k) => { const [s, t] = splitPair(k); return s !== id && t !== id; });
        if (!project.rules[rel].length) delete project.rules[rel];
      }
    }
  }

  /** Every id in a scope, for uniqueness checks. */
  function idsInScope(project, scope) {
    const ids = [];
    for (const list of SCOPES[scope].lists) for (const x of listAt(project, list)) ids.push(x.id);
    return ids;
  }

  /** Remove an external concept and every reference to it. */
  function removeExternal(project, ref) {
    project.externalConcepts = project.externalConcepts.filter((x) => x.ref !== ref);
    const def = SCOPES.concept;
    const drop = (list) => (list || []).filter((x) => x !== ref);
    for (const [list, field] of def.fields) for (const item of listAt(project, list)) item[field] = drop(item[field]);
    for (const rel of Object.keys(project.rules)) {
      project.rules[rel] = project.rules[rel].filter((k) => { const [s, t] = splitPair(k); return s !== ref && t !== ref; });
      if (!project.rules[rel].length) delete project.rules[rel];
    }
  }

  /**
   * What a shape name stands for (SD-2, SD-3): a core-vis shape, or an own shape with its definition. A project
   * shape wins over a built-in one with the same id. null for a name that is neither.
   */
  function resolveShape(project, name) {
    const n = name || "rectangle";
    if (CORE_SHAPES[n]) return { kind: "core", name: n, local: CORE_SHAPES[n] };
    const shapes = (project && project.shapes) || [];
    const own = shapes.find((s) => s.id === n);
    if (own) return { kind: "own", id: own.id, definition: own };
    const builtin = BUILTIN_SHAPES[n];
    if (builtin) return { kind: "own", id: builtin.id, definition: shapes.find((s) => s.id === builtin.id) || builtin, builtin: n };
    return null;
  }

  /** The shapes an element may take: core ones, the built-in own ones a project does not replace, the project's. */
  function shapeChoices(project) {
    const own = new Set(((project && project.shapes) || []).map((s) => s.id));
    return Object.keys(CORE_SHAPES).map((value) => ({ value, label: value, kind: "core" }))
      .concat(Object.keys(BUILTIN_SHAPES).filter((k) => !own.has(BUILTIN_SHAPES[k].id)).map((value) => ({ value, label: value, kind: "builtin" })))
      .concat(((project && project.shapes) || []).map((s) => ({ value: s.id, label: s.label ? `${s.label} (${s.id})` : s.id, kind: "own" })));
  }

  /** The own shapes the notation document declares: every project shape, and each built-in one an element uses. */
  function ownShapesInUse(project) {
    const out = new Map(project.shapes.map((s) => [s.id, s]));
    for (const e of project.elements) {
      if (e.abstract || !e.notation) continue;
      const s = resolveShape(project, e.notation.shape);
      if (s && s.kind === "own" && !out.has(s.id)) out.set(s.id, s.definition);
    }
    return Array.from(out.values());
  }

  /** The local name of the notation set in <base>notation#. */
  function notationSetName(project) {
    return project.meta.notationSetName || `${project.meta.name}StandardNotation`;
  }

  function fileNames(project) {
    const s = project.meta.slug || "metamodel";
    return {
      onto: `${s}-onto.ttl`,
      shapes: `${s}-shapes.ttl`,
      taxonomy: `${s}-tax.ttl`,
      viewpoints: `${s}-viewpoints.ttl`,
      notation: `${s}-notation.ttl`,
      manifest: `${s}-metamodel.ttl`,
      project: `${s}.studio.json`,
      readme: "README.md",
    };
  }

  return {
    FORMAT, STD_PREFIXES, VIS, KNOWN_LANGUAGES, CORE_STAKEHOLDERS, CORE_CONCERNS, VIEW_TYPES,
    SHAPES, CORE_SHAPES, BUILTIN_SHAPES, SHAPE_NAMES, LINE_STYLES, LINE_STYLE_IRIS, LINE_STYLE_NAMES,
    DECORATIONS, DECORATION_IRIS, DECORATION_NAMES, ARROW_HEADS, LOCAL_NAME, PREFIX_NAME,
    DATATYPES, emptyProject, normalize, toLocalName, humanize, suggestPredicate, namespaces, isCurie,
    conceptIndex, concreteElements, descendants, ancestors, pairKey, splitPair, ruleSet,
    setRule, renameRef, removeRef, removeExternal, idsInScope, scopeOf, SCOPES, listAt, fileNames,
    resolveShape, shapeChoices, ownShapesInUse, notationSetName,
  };
});
