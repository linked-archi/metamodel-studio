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

  /**
   * Format /3 (SD-15): the order of a category's narrower concepts, the type a category stands for, the palette
   * grouping and the diagram group order. /2 (SD-10) added proposal orders, both line ends and own shapes.
   * normalize() migrates /1 and /2.
   */
  const FORMAT = "linked-archi-metamodel-studio/3";

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
    // ISO 25964's SKOS extension: a thesaurus array orders a concept's narrower concepts (SReq 4.4, SD-14).
    "iso-thes": "http://purl.org/iso25964/skos-thes#",
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
      taxonomy: emptyTaxonomy(),
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

  /**
   * The taxonomy: its categories, and the two collections the manifest names (SReq 4.5): the dimensions a palette
   * groups element types by, the main one first, and the groups a diagram keeps in bands, the top band first. Their
   * ids default to the names the published ArchiMate 4.0 taxonomy gives them (SD-14).
   */
  function emptyTaxonomy() {
    return {
      label: "",
      categories: [],
      paletteGrouping: { id: "PaletteGrouping", label: "", definition: "", members: [] },
      diagramGroupOrder: { id: "DiagramGroupOrder", label: "", definition: "", scopeNote: "", members: [] },
    };
  }

  /** Fill in anything an older or hand-written project file left out, and migrate formats /1 and /2 (SD-9, SD-15). */
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
    const tax = emptyTaxonomy();
    p.taxonomy = Object.assign({}, tax, p.taxonomy || {});
    if (!Array.isArray(p.taxonomy.categories)) p.taxonomy.categories = [];
    // A category's own order of its narrower concepts (SReq 4.4): its sub-categories and its members, each list
    // naming ids of one namespace, so that renaming and deleting reach them (SCOPES). `standsFor` is the element
    // type the category stands for, its rdfs:seeAlso (SReq 4.6, SD-17).
    p.taxonomy.categories = p.taxonomy.categories.map((c) => Object.assign({
      id: "", label: "", definition: "", parent: "", standsFor: "", categoryOrder: [], memberOrder: [], orderLabel: "",
    }, c));
    for (const key of ["paletteGrouping", "diagramGroupOrder"]) {
      p.taxonomy[key] = Object.assign({}, tax[key], p.taxonomy[key] || {});
      if (!Array.isArray(p.taxonomy[key].members)) p.taxonomy[key].members = [];
      if (!p.taxonomy[key].id) p.taxonomy[key].id = tax[key].id;
    }
    p.viewpointCategories = p.viewpointCategories.map((c) => Object.assign({ id: "", label: "", definition: "", parent: "" }, c));
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
        ["proposalOrders", "members"], ["proposalOrders", "domain"], ["proposalOrders", "range"], ["taxonomy.categories", "memberOrder"]],
      scalars: [["relationships", "parent"], ["taxonomy.categories", "standsFor"]],
    },
    taxonomy: {
      lists: ["taxonomy.categories", "proposalOrders"],
      fields: [["elements", "categories"], ["relationships", "categories"], ["taxonomy.categories", "categoryOrder"],
        ["taxonomy.paletteGrouping", "members"], ["taxonomy.diagramGroupOrder", "members"]],
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
    if (path === "taxonomy.categories") return project.taxonomy.categories;
    // The palette grouping and the diagram group order: one object each, holding category ids.
    if (path === "taxonomy.paletteGrouping" || path === "taxonomy.diagramGroupOrder") return [project.taxonomy[path.slice("taxonomy.".length)]];
    return project[path];
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

  // ---- hierarchies, classification and orders (SReq 11, SD-12 to SD-14)
  //
  // What the page's trees, menus and keys do to the project, and what they show. A tree row is an item under one
  // parent (SD-12), so a move names the parent it leaves. Each change returns whether it changed anything; one that
  // would make a cycle changes nothing.

  /** The root every element type specializes, and the one every relationship type does. */
  const ELEMENT_ROOT = "arch:Element";
  const RELATIONSHIP_ROOT = "arch:QualifiedRelationship";

  const elementOf = (project, id) => project.elements.find((e) => e.id === id);
  const relationshipOf = (project, id) => project.relationships.find((r) => r.id === id);
  const categoryOf = (project, id) => project.taxonomy.categories.find((c) => c.id === id);
  const uniq = (list) => Array.from(new Set(list));

  /** Labels for sorting and showing references: concepts, categories, and the core roots. */
  function labelOf(project, ref) {
    const hit = conceptIndex(project).get(ref);
    if (hit) return hit.label;
    if (ref === RELATIONSHIP_ROOT) return "Qualified Relationship (core)";
    const c = categoryOf(project, ref);
    return c ? c.label || humanize(c.id) : ref;
  }
  function byLabel(project) {
    const idx = conceptIndex(project);
    const label = (ref) => (idx.get(ref) || {}).label || ref;
    return (a, b) => label(a).localeCompare(label(b)) || a.localeCompare(b);
  }

  /** An element type's parents; none means arch:Element. An outside type's are those the project declares. */
  function parentsOf(project, ref) {
    const e = elementOf(project, ref);
    if (e) return e.parents.length ? e.parents.slice() : [ELEMENT_ROOT];
    const x = project.externalConcepts.find((c) => c.ref === ref);
    return x ? (x.parents || []).slice() : [];
  }

  /**
   * The element types directly under `ref` (a local or outside type, or arch:Element for those with no parent): the
   * project's, then the outside types declared under it, such as a base's (withBases).
   */
  function subtypes(project, ref) {
    return project.elements.filter((e) => (e.parents.length ? e.parents : [ELEMENT_ROOT]).includes(ref)).map((e) => e.id)
      .concat(project.externalConcepts.filter((x) => (x.kind || "element") === "element" && (x.parents || []).includes(ref)).map((x) => x.ref));
  }

  /** Every path from a root down to element type `id`. A path starts at arch:Element, or at an outside type whose parents the project does not declare. */
  function elementPaths(project, id, limit) {
    const max = limit || 50;
    const out = [];
    const walk = (ref, below, seen) => {
      if (out.length >= max || seen.has(ref)) return;
      const up = ref === ELEMENT_ROOT ? [] : parentsOf(project, ref);
      if (!up.length) { out.push([ref].concat(below)); return; }
      const next = new Set(seen).add(ref);
      for (const p of up) walk(p, [ref].concat(below), next);
    };
    walk(id, [], new Set());
    return out;
  }

  /** Whether element type `id` may specialize `parent`: an element type that is neither `id` nor one of its subtypes (SReq 11.2). */
  function canSpecialize(project, id, parent) {
    if (!parent || parent === id) return false;
    if (parent === ELEMENT_ROOT) return true;
    if (descendants(project, id).has(parent)) return false;
    const hit = conceptIndex(project).get(parent);
    return hit ? hit.kind === "element" : isCurie(parent);
  }

  /** Element type `id` specializes `to` in the place of `from`. `to` arch:Element (or none) only takes `from` away. */
  function moveParent(project, id, from, to) {
    const e = elementOf(project, id);
    if (!e || from === to) return false;
    if (!to || to === ELEMENT_ROOT) return removeParent(project, id, from);
    if (!canSpecialize(project, id, to)) return false;
    const next = e.parents.slice();
    const i = next.indexOf(from);
    if (i >= 0) next.splice(i, 1, to); else next.push(to);
    e.parents = uniq(next);
    return true;
  }

  /** Element type `id` specializes `to` as well. */
  function addParent(project, id, to) {
    const e = elementOf(project, id);
    if (!e || !to || to === ELEMENT_ROOT || e.parents.includes(to) || !canSpecialize(project, id, to)) return false;
    e.parents = e.parents.concat([to]);
    return true;
  }

  /** Element type `id` stops specializing `from`; with no parent left it specializes arch:Element. */
  function removeParent(project, id, from) {
    const e = elementOf(project, id);
    if (!e || !e.parents.includes(from)) return false;
    e.parents = e.parents.filter((p) => p !== from);
    return true;
  }

  /**
   * The relationship types directly under `ref` (a relationship type, or arch:QualifiedRelationship for those with
   * no parent): the project's, then outside ones declared under it, such as a base's (withBases).
   */
  function relationshipSubtypes(project, ref) {
    return project.relationships.filter((r) => (r.parent || RELATIONSHIP_ROOT) === ref).map((r) => r.id)
      .concat(project.externalConcepts.filter((x) => x.kind === "relationship" && (x.parents || []).includes(ref)).map((x) => x.ref));
  }

  /** What relationship type `id` is a kind of: arch:QualifiedRelationship at the top, null when it is not known. */
  function relationshipParent(project, id) {
    const r = relationshipOf(project, id);
    if (r) return r.parent || RELATIONSHIP_ROOT;
    const x = project.externalConcepts.find((c) => c.ref === id && c.kind === "relationship");
    return x && x.parents && x.parents[0] ? x.parents[0] : null;
  }

  function relationshipDescendants(project, id) {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      for (const c of relationshipSubtypes(project, queue.shift())) if (!seen.has(c)) { seen.add(c); queue.push(c); }
    }
    return seen;
  }

  /** From the root down to relationship type `id`: arch:QualifiedRelationship first, or an outside parent not known further. */
  function relationshipPath(project, id) {
    const out = [id];
    const seen = new Set([id]);
    let p = relationshipParent(project, id);
    while (p && p !== RELATIONSHIP_ROOT) {
      if (seen.has(p)) return out; // a cycle, which the checks report
      out.unshift(p);
      seen.add(p);
      p = relationshipParent(project, p);
    }
    if (p === RELATIONSHIP_ROOT) out.unshift(RELATIONSHIP_ROOT);
    return out;
  }

  /**
   * Relationship type `id` becomes a kind of `parent`; none, or arch:QualifiedRelationship, makes it a kind of no
   * other. A subtype with no predicate of its own takes its parent's (SReq 2.2).
   */
  function setRelationshipParent(project, id, parent) {
    const r = relationshipOf(project, id);
    const to = !parent || parent === RELATIONSHIP_ROOT ? "" : parent;
    if (!r || (r.parent || "") === to) return false;
    if (to && (to === id || relationshipDescendants(project, id).has(to))) return false;
    if (to && !relationshipOf(project, to) && !isCurie(to)) return false;
    r.parent = to;
    const p = to ? relationshipOf(project, to) : null;
    if (p && !r.predicate) r.predicate = p.predicate;
    return true;
  }

  /** `ids` with those `order` names first, in its order, then the rest as they were. */
  function applyOrder(ids, order) {
    const present = new Set(ids);
    const first = uniq((order || []).filter((x) => present.has(x)));
    const placed = new Set(first);
    return first.concat(ids.filter((x) => !placed.has(x)));
  }

  /** The categories directly under `parent` ("" for the top level), in its order (SReq 4.4); the top level in the project's order. */
  function subcategories(project, parent) {
    const kids = project.taxonomy.categories.filter((c) => (c.parent || "") === (parent || "")).map((c) => c.id);
    const owner = parent ? categoryOf(project, parent) : null;
    return applyOrder(kids, owner ? owner.categoryOrder : []);
  }

  /** Category `id` and every category under it. */
  function categoryDescendants(project, id) {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const next = queue.shift();
      for (const c of project.taxonomy.categories) if ((c.parent || "") === next && !seen.has(c.id)) { seen.add(c.id); queue.push(c.id); }
    }
    return seen;
  }

  /** From the top level down to category `id`. */
  function categoryPath(project, id) {
    const out = [];
    const seen = new Set();
    let cur = categoryOf(project, id);
    while (cur && !seen.has(cur.id)) { out.unshift(cur.id); seen.add(cur.id); cur = cur.parent ? categoryOf(project, cur.parent) : null; }
    return out;
  }

  /**
   * The element and relationship types classified in category `id`. Direct members come in its order, the others
   * by label, as la-gram's palette lists a group with no order of its own; with `deep`, those of its
   * sub-categories are included, unordered.
   */
  function categoryMembers(project, id, deep) {
    const cats = deep ? categoryDescendants(project, id) : new Set([id]);
    const items = project.elements.filter((e) => e.categories.some((c) => cats.has(c))).map((e) => e.id)
      .concat(project.relationships.filter((r) => r.categories.some((c) => cats.has(c))).map((r) => r.id));
    if (deep) return items;
    const c = categoryOf(project, id);
    return applyOrder(items.sort(byLabel(project)), c ? c.memberOrder : []);
  }

  /**
   * The concepts narrower than category `id`, in the order written for it: its sub-categories, then its members
   * (SReq 4.4). `explicit` says whether it has an order of its own; only one that does is written (SD-14).
   */
  function narrowerOrder(project, id) {
    const categories = subcategories(project, id);
    const members = categoryMembers(project, id, false);
    const c = categoryOf(project, id);
    const explicit = !!c && ((c.categoryOrder || []).some((x) => categories.includes(x)) || (c.memberOrder || []).some((x) => members.includes(x)));
    return { categories, members, explicit };
  }

  /** The local name of category `id`'s order, as the published ArchiMate 4.0 taxonomy names them: DomainOrder under Domain (SD-14). */
  function orderName(id) {
    return `${id}Order`;
  }

  /**
   * Put `id`, a sub-category ("categories") or member ("members") of category `parent`, before `before` (null: last),
   * and keep that as the category's order (SReq 11.7). The top level, which no category orders, keeps the project's
   * order of its categories instead.
   */
  function reorder(project, parent, kind, id, before) {
    if (kind === "categories" && !parent) {
      const list = project.taxonomy.categories;
      const from = list.findIndex((c) => c.id === id);
      if (from < 0 || before === id) return false;
      const [item] = list.splice(from, 1);
      const at = before ? list.findIndex((c) => c.id === before) : -1;
      list.splice(at < 0 ? list.length : at, 0, item);
      return list.indexOf(item) !== from;
    }
    const owner = categoryOf(project, parent);
    if (!owner || before === id) return false;
    const current = kind === "categories" ? subcategories(project, parent) : categoryMembers(project, parent, false);
    if (!current.includes(id)) return false;
    const next = current.filter((x) => x !== id);
    const at = before ? next.indexOf(before) : -1;
    next.splice(at < 0 ? next.length : at, 0, id);
    if (next.join("\n") === current.join("\n")) return false;
    owner[kind === "categories" ? "categoryOrder" : "memberOrder"] = next;
    return true;
  }

  /** Move `id` one place up (-1) or down (+1) among the sub-categories or members of `parent`. */
  function shift(project, parent, kind, id, delta) {
    const current = kind === "categories" ? subcategories(project, parent) : categoryMembers(project, parent, false);
    const i = current.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= current.length) return false;
    return reorder(project, parent, kind, id, delta < 0 ? current[j] : current[j + 1] || null);
  }

  /** Category `id` has no order of its own any more: la-gram lists its narrower concepts by name. */
  function clearOrder(project, id) {
    const c = categoryOf(project, id);
    if (!c || !narrowerOrder(project, id).explicit) return false;
    c.categoryOrder = [];
    c.memberOrder = [];
    c.orderLabel = "";
    return true;
  }

  /**
   * Category `id` goes under `parent` ("" for the top level). With `before` (a sibling there, or null for last) it
   * takes that place too. Never under itself or one of its sub-categories (SReq 11.2).
   */
  function moveCategory(project, id, parent, before) {
    const c = categoryOf(project, id);
    const to = parent || "";
    if (!c) return false;
    if (to && (to === id || !categoryOf(project, to) || categoryDescendants(project, id).has(to))) return false;
    const from = c.parent || "";
    let changed = false;
    if (from !== to) {
      const old = from ? categoryOf(project, from) : null;
      if (old) old.categoryOrder = (old.categoryOrder || []).filter((x) => x !== id);
      c.parent = to;
      changed = true;
    }
    if (before !== undefined) changed = reorder(project, to, "categories", id, before) || changed;
    return changed;
  }

  function dropFromMemberOrder(project, catId, ref) {
    const c = categoryOf(project, catId);
    if (c && (c.memberOrder || []).includes(ref)) c.memberOrder = c.memberOrder.filter((x) => x !== ref);
  }

  /** Type `ref` is classified in category `id`; given `from`, it leaves that category (SReq 11.3). */
  function classify(project, ref, id, from) {
    const item = elementOf(project, ref) || relationshipOf(project, ref);
    if (!item || !categoryOf(project, id)) return false;
    let changed = false;
    if (from && from !== id && item.categories.includes(from)) {
      item.categories = item.categories.filter((c) => c !== from);
      dropFromMemberOrder(project, from, ref);
      changed = true;
    }
    if (!item.categories.includes(id)) { item.categories = item.categories.concat([id]); changed = true; }
    return changed;
  }

  /** Type `ref` leaves category `id`. */
  function unclassify(project, ref, id) {
    const item = elementOf(project, ref) || relationshipOf(project, ref);
    if (!item || !item.categories.includes(id)) return false;
    item.categories = item.categories.filter((c) => c !== id);
    dropFromMemberOrder(project, id, ref);
    return true;
  }

  /**
   * In a grid of two dimensions: type `ref` moves from group `from` to group `to` of one dimension (either may be
   * null: in no group of it). It leaves every category of `from`'s branch unless `keep`, and joins `to` unless it is
   * in `to`'s branch already (SReq 11.5).
   */
  function regroup(project, ref, from, to, keep) {
    const item = elementOf(project, ref) || relationshipOf(project, ref);
    if (!item || from === to) return false;
    let changed = false;
    if (from && !keep) {
      const branch = categoryDescendants(project, from);
      for (const c of item.categories.filter((x) => branch.has(x))) changed = unclassify(project, ref, c) || changed;
    }
    if (to && !categoryMembers(project, to, true).includes(ref)) changed = classify(project, ref, to) || changed;
    return changed;
  }

  /** Viewpoint category `id` and every one under it. */
  function viewpointCategoryDescendants(project, id) {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const next = queue.shift();
      for (const c of project.viewpointCategories) if ((c.parent || "") === next && !seen.has(c.id)) { seen.add(c.id); queue.push(c.id); }
    }
    return seen;
  }

  /** Viewpoint category `id` goes under `parent` ("" for the top level), never under itself. */
  function moveViewpointCategory(project, id, parent) {
    const c = project.viewpointCategories.find((x) => x.id === id);
    const to = parent || "";
    if (!c || (c.parent || "") === to) return false;
    if (to && (to === id || !project.viewpointCategories.some((x) => x.id === to) || viewpointCategoryDescendants(project, id).has(to))) return false;
    c.parent = to;
    return true;
  }

  /** Viewpoint `id` leaves catalog category `from`, unless `keep`, and joins `to`. */
  function moveViewpoint(project, id, from, to, keep) {
    const v = project.viewpoints.find((x) => x.id === id);
    if (!v || from === to) return false;
    let changed = false;
    if (from && !keep && v.categories.includes(from)) { v.categories = v.categories.filter((c) => c !== from); changed = true; }
    if (to && !v.categories.includes(to)) { v.categories = v.categories.concat([to]); changed = true; }
    return changed;
  }

  /**
   * What concept `ref` is related to (SReq 11.4): its paths to the root, parents and subtypes, categories, the rules
   * it is the source or the target of (for a relationship type, its sources and targets), the attributes, guidance
   * and proposal orders that name it or one of its ancestors, the viewpoints that include it, and the categories an
   * abstract element type matches. `via` names the ancestor through which something applies; null, the item itself.
   */
  function relationsOf(project, ref) {
    const hit = conceptIndex(project).get(ref);
    if (!hit) return null;
    const isRel = hit.kind === "relationship";
    const out = { ref, kind: hit.kind, local: hit.local, abstract: !!hit.abstract };
    let lineage;
    if (isRel) {
      const path = relationshipPath(project, ref);
      out.paths = [path];
      const parent = hit.local ? hit.item.parent : (hit.item.parents || [])[0];
      out.parents = parent && parent !== RELATIONSHIP_ROOT ? [parent] : [];
      out.subtypes = relationshipSubtypes(project, ref);
      out.descendants = relationshipDescendants(project, ref).size - 1;
      const pairs = (project.rules[ref] || []).map(splitPair);
      out.pairs = pairs.length;
      out.sources = uniq(pairs.map(([s]) => s)).sort(byLabel(project));
      out.targets = uniq(pairs.map(([, t]) => t)).sort(byLabel(project));
      lineage = path.slice(0, -1).reverse();
    } else {
      out.paths = elementPaths(project, ref);
      out.parents = hit.local ? hit.item.parents.slice() : (hit.item.parents || []).slice();
      out.subtypes = subtypes(project, ref);
      out.descendants = descendants(project, ref).size - 1;
      const asSource = new Map();
      const asTarget = new Map();
      for (const [rel, list] of Object.entries(project.rules)) {
        for (const key of list) {
          const [s, t] = splitPair(key);
          if (s === ref) asSource.set(rel, (asSource.get(rel) || []).concat([t]));
          if (t === ref) asTarget.set(rel, (asTarget.get(rel) || []).concat([s]));
        }
      }
      const rels = project.relationships.map((r) => r.id);
      const sorted = (m) => [...m].sort(([a], [b]) => rels.indexOf(a) - rels.indexOf(b)).map(([rel, refs]) => ({ rel, refs: refs.sort(byLabel(project)) }));
      out.rulesOut = sorted(asSource);
      out.rulesIn = sorted(asTarget);
      lineage = [...ancestors(project, ref)].concat([ELEMENT_ROOT]);
    }
    const via = (list) => {
      if ((list || []).includes(ref)) return { via: null };
      const a = lineage.find((x) => (list || []).includes(x));
      return a ? { via: a } : null;
    };
    out.categories = (hit.item.categories || []).map((id) => ({ id, path: categoryPath(project, id) }));
    // An attribute that names no type applies to every element (SReq 2.3).
    out.attributes = project.attributes.map((a) => {
      const v = a.domain.length ? via(a.domain) : isRel ? null : { via: ELEMENT_ROOT };
      return v ? Object.assign({ id: a.id }, v) : null;
    }).filter(Boolean);
    out.guidance = isRel ? [] : project.relationships.flatMap((r) => ["domain", "range"].map((side) => {
      const v = via(r[side]);
      return v ? Object.assign({ rel: r.id, side }, v) : null;
    })).filter(Boolean);
    out.proposalOrders = project.proposalOrders.flatMap((o) => {
      if (isRel) {
        const i = o.members.indexOf(ref);
        return i >= 0 ? [{ id: o.id, side: "member", position: i + 1, of: o.members.length }] : [];
      }
      return ["domain", "range"].map((side) => {
        const v = via(o[side]);
        return v ? Object.assign({ id: o.id, side }, v) : null;
      }).filter(Boolean);
    });
    out.viewpoints = project.viewpoints.filter((v) => v.concepts.includes(ref)).map((v) => v.id);
    out.matches = !isRel && hit.abstract ? typeMatches(project, ref) : [];
    // The categories of a language it extends (SReq 12.4): a base type's own, and those of every base type among its
    // ancestors, the nearest first, each once. A category that a deeper one of the same base already implies is left
    // out: Internal Active Structure says Active Structure.
    const inherited = [];
    const seen = new Set();
    for (const a of [ref].concat(lineage)) {
      const x = project.externalConcepts.find((c) => c.ref === a && c.baseCategories);
      if (!x) continue;
      for (const c of x.baseCategories) {
        if (seen.has(c.key)) continue;
        seen.add(c.key);
        inherited.push(Object.assign({ via: a === ref ? null : a }, c));
      }
    }
    const implied = (c) => inherited.some((d) => d !== c && d.base === c.base && d.trail.length > c.trail.length && d.trail[c.trail.length - 1] === c.trail[c.trail.length - 1]);
    out.inherited = inherited.filter((c) => !implied(c));
    return out;
  }

  /**
   * Which abstract element type each category stands for, read from membership alone (SD-13). A category whose
   * element types, those of its sub-categories included, are exactly the concrete subtypes of an abstract type
   * matches it; one that differs from them by a little is close to it. Nothing is stored, and no name is compared.
   * Map(category id -> { type, exact, extra: members that are no subtype, missing: subtypes that are no member }).
   */
  function categoryMatches(project) {
    const concrete = new Set(project.elements.filter((e) => !e.abstract).map((e) => e.id));
    const types = project.elements.filter((e) => e.abstract).map((e) => ({
      id: e.id,
      subs: new Set([...descendants(project, e.id)].filter((d) => concrete.has(d))),
      depth: ancestors(project, e.id).size,
    })).filter((t) => t.subs.size);
    const out = new Map();
    for (const c of project.taxonomy.categories) {
      const members = new Set(categoryMembers(project, c.id, true).filter((x) => concrete.has(x)));
      if (!members.size) continue;
      let best = null;
      for (const t of types) {
        let shared = 0;
        for (const x of members) if (t.subs.has(x)) shared++;
        if (!shared) continue;
        const score = shared / (members.size + t.subs.size - shared);
        // An equal score goes to the more specific type.
        if (!best || score > best.score || (score === best.score && t.depth > best.t.depth)) best = { t, score, shared };
      }
      if (!best) continue;
      const exact = best.score === 1;
      if (!exact && (best.score < 0.75 || best.shared < 2)) continue;
      out.set(c.id, {
        type: best.t.id,
        exact,
        extra: [...members].filter((x) => !best.t.subs.has(x)).sort(),
        missing: [...best.t.subs].filter((x) => !members.has(x)).sort(),
      });
    }
    return out;
  }

  /** The categories that match abstract element type `id`, exactly or closely. */
  function typeMatches(project, id) {
    const out = [];
    for (const [category, m] of categoryMatches(project)) if (m.type === id) out.push(Object.assign({ category }, m));
    return out;
  }

  /** How category `catId`'s element types, its sub-categories' included, compare with the concrete subtypes of `type`. */
  function compareWithType(project, catId, type) {
    const concrete = new Set(project.elements.filter((e) => !e.abstract).map((e) => e.id));
    const members = new Set(categoryMembers(project, catId, true).filter((x) => concrete.has(x)));
    const subs = new Set([...descendants(project, type)].filter((d) => concrete.has(d)));
    const extra = [...members].filter((x) => !subs.has(x)).sort();
    const missing = [...subs].filter((x) => !members.has(x)).sort();
    return { type, exact: members.size > 0 && !extra.length && !missing.length, extra, missing };
  }

  /**
   * Each category's link to an element type (SReq 4.6, 11.6): the one it states, `standsFor`, with how its members
   * compare with that type's concrete subtypes; and the one its members suggest (categoryMatches). Map(category id ->
   * { stated, computed }), for the categories with either.
   */
  function categoryLinks(project) {
    const computed = categoryMatches(project);
    const out = new Map();
    for (const c of project.taxonomy.categories) {
      const stated = c.standsFor ? compareWithType(project, c.id, c.standsFor) : null;
      const found = computed.get(c.id) || null;
      if (stated || found) out.set(c.id, { stated, computed: found });
    }
    return out;
  }

  /**
   * The exact links as they are now, with their members and subtypes: what matchFollowUps compares with (SReq 11.6).
   * A link the taxonomy states counts as one its members suggest does.
   */
  function matchSnapshot(project) {
    const concrete = new Set(project.elements.filter((e) => !e.abstract).map((e) => e.id));
    const pairs = [];
    const add = (category, type) => {
      if (pairs.some((p) => p.category === category && p.type === type)) return;
      pairs.push({
        category,
        type,
        members: new Set(categoryMembers(project, category, true)),
        subtypes: new Set([...descendants(project, type)].filter((d) => concrete.has(d))),
      });
    };
    for (const [category, m] of categoryMatches(project)) if (m.exact) add(category, m.type);
    for (const c of project.taxonomy.categories) if (c.standsFor && compareWithType(project, c.id, c.standsFor).exact) add(c.id, c.standsFor);
    return { pairs };
  }

  /**
   * After a change to element types' parents or categories, what the other side of each match that was exact
   * before needs to follow it (SReq 11.6): a type that became a subtype of the matched type is offered the category,
   * one that stopped being one is offered leaving it; a type that joined the category is offered the type as a
   * parent, one that left it is offered losing that parent. The most specific offer wins: classifying in a
   * sub-category, or specializing a subtype, covers the broader one.
   */
  function matchFollowUps(project, before) {
    const concrete = new Set(project.elements.filter((e) => !e.abstract).map((e) => e.id));
    const out = [];
    for (const p of before.pairs) {
      if (!categoryOf(project, p.category) || !elementOf(project, p.type)) continue;
      const members = new Set(categoryMembers(project, p.category, true));
      const subs = new Set([...descendants(project, p.type)].filter((d) => concrete.has(d)));
      const has = (id, key, value) => { const e = elementOf(project, id); return !!e && e[key].includes(value); };
      const add = (action, ids) => { if (ids.length) out.push({ action, category: p.category, type: p.type, ids: ids.sort() }); };
      add("classify", [...subs].filter((x) => !p.subtypes.has(x) && !members.has(x)));
      add("unclassify", [...p.subtypes].filter((x) => !subs.has(x) && has(x, "categories", p.category)));
      add("addParent", [...members].filter((x) => concrete.has(x) && !p.members.has(x) && !subs.has(x)));
      add("removeParent", [...p.members].filter((x) => !members.has(x) && has(x, "parents", p.type)));
    }
    const covered = (f, other) => other !== f && other.action === f.action && (f.action === "classify"
      ? categoryDescendants(project, f.category).has(other.category)
      : f.action === "addParent" && descendants(project, f.type).has(other.type));
    for (const f of out) {
      f.ids = f.ids.filter((id) => !out.some((other) => covered(f, other) && other.ids.includes(id)));
    }
    return out.filter((f) => f.ids.length);
  }

  /** Make the change a follow-up offers. Returns how many types it changed. */
  function applyFollowUp(project, f) {
    let n = 0;
    for (const id of f.ids) {
      const done = f.action === "classify" ? classify(project, id, f.category)
        : f.action === "unclassify" ? unclassify(project, id, f.category)
          : f.action === "addParent" ? addParent(project, id, f.type)
            : f.action === "removeParent" ? removeParent(project, id, f.type) : false;
      if (done) n++;
    }
    return n;
  }

  // ---- the languages a project extends (SReq 12, SD-18)

  /** Where a project's concepts live, <base>onto#: what a language that extends it imports. */
  function conceptNamespace(project) {
    return namespaces(project)[project.meta.prefix];
  }

  /**
   * The languages a project extends that the studio has: for each of its imports whose namespace is that of a
   * candidate ({ namespace, project, bundled }: a template, or documents loaded in the browser),
   * { prefix, namespace, title, project, bundled }.
   */
  function basesFor(project, candidates) {
    const own = conceptNamespace(project);
    const out = [];
    for (const imp of project.meta.imports || []) {
      if (!imp.prefix || !imp.namespace || imp.namespace === own) continue;
      const hit = (candidates || []).find((c) => c && c.project && c.namespace === imp.namespace);
      if (hit) out.push({ prefix: imp.prefix, namespace: imp.namespace, title: hit.project.meta.title || imp.prefix, project: hit.project, bundled: !!hit.bundled });
    }
    return out;
  }

  /**
   * The project with the types of the languages it extends added as outside concepts, for the page to show and query
   * (SReq 12.2–12.4): each base type as prefix:id, its parents named the same way (the core root for none), with its
   * label, definition, and the base's categories it is in or that stand for it; the base's attributes too. An outside
   * concept the project declares itself wins. Nothing generates or checks this: the project stays as it is.
   */
  function withBases(project, bases) {
    if (!bases || !bases.length) return project;
    const declared = new Set(project.externalConcepts.map((x) => x.ref));
    const extra = [];
    const attributes = [];
    for (const b of bases) {
      const bp = normalize(b.project);
      const local = new Set(bp.elements.map((e) => e.id).concat(bp.relationships.map((r) => r.id), bp.attributes.map((a) => a.id)));
      const name = (ref) => (local.has(ref) ? `${b.prefix}:${ref}` : ref);
      const label = (id) => { const c = bp.taxonomy.categories.find((x) => x.id === id); return c ? c.label || humanize(c.id) : id; };
      const cats = (item) => uniq((item.categories || []).concat(bp.taxonomy.categories.filter((c) => c.standsFor === item.id).map((c) => c.id)))
        .map((c) => ({ key: `${b.namespace} ${c}`, base: b.title, trail: categoryPath(bp, c), label: categoryPath(bp, c).map(label).join(" › ") }));
      const common = (item, kind) => ({ label: item.label || humanize(item.id), kind, definition: item.definition || "", base: b.namespace, baseTitle: b.title, baseCategories: cats(item) });
      for (const e of bp.elements) {
        const ref = `${b.prefix}:${e.id}`;
        if (declared.has(ref)) continue;
        extra.push(Object.assign({ ref, abstract: !!e.abstract, parents: e.parents.length ? e.parents.map(name) : [ELEMENT_ROOT], fill: (e.notation && e.notation.fill) || "" }, common(e, "element")));
      }
      for (const r of bp.relationships) {
        const ref = `${b.prefix}:${r.id}`;
        if (declared.has(ref)) continue;
        extra.push(Object.assign({ ref, abstract: false, parents: [r.parent ? name(r.parent) : RELATIONSHIP_ROOT], notation: r.notation || "" }, common(r, "relationship")));
      }
      for (const a of bp.attributes) attributes.push(Object.assign({}, a, { id: `${b.prefix}:${a.id}`, domain: a.domain.map(name), base: b.namespace, baseTitle: b.title }));
    }
    return Object.assign({}, project, { externalConcepts: project.externalConcepts.concat(extra), attributes: project.attributes.concat(attributes) });
  }

  /** The base type `ref` is, in a project withBases() made: its entry, or null. */
  function baseConcept(project, ref) {
    return project.externalConcepts.find((x) => x.ref === ref && x.base) || null;
  }

  return {
    FORMAT, STD_PREFIXES, VIS, KNOWN_LANGUAGES, CORE_STAKEHOLDERS, CORE_CONCERNS, VIEW_TYPES,
    SHAPES, CORE_SHAPES, BUILTIN_SHAPES, SHAPE_NAMES, LINE_STYLES, LINE_STYLE_IRIS, LINE_STYLE_NAMES,
    DECORATIONS, DECORATION_IRIS, DECORATION_NAMES, ARROW_HEADS, LOCAL_NAME, PREFIX_NAME,
    DATATYPES, emptyProject, normalize, toLocalName, humanize, suggestPredicate, namespaces, isCurie,
    conceptIndex, concreteElements, descendants, ancestors, pairKey, splitPair, ruleSet,
    setRule, renameRef, removeRef, removeExternal, idsInScope, scopeOf, SCOPES, listAt, fileNames,
    resolveShape, shapeChoices, ownShapesInUse, notationSetName, emptyTaxonomy,
    // hierarchies, classification and orders (SReq 11)
    ELEMENT_ROOT, RELATIONSHIP_ROOT, labelOf, parentsOf, subtypes, elementPaths, canSpecialize, moveParent, addParent,
    removeParent, relationshipSubtypes, relationshipDescendants, relationshipPath, setRelationshipParent, subcategories,
    categoryDescendants, categoryPath, categoryMembers, narrowerOrder, orderName, reorder, shift, clearOrder, moveCategory,
    classify, unclassify, regroup, viewpointCategoryDescendants, moveViewpointCategory, moveViewpoint, relationsOf,
    categoryMatches, typeMatches, matchSnapshot, matchFollowUps, applyFollowUp, compareWithType, categoryLinks,
    relationshipParent,
    // the languages a project extends (SReq 12)
    conceptNamespace, basesFor, withBases, baseConcept,
  };
});
