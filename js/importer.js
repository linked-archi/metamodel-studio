/*
 * Linked.Archi Metamodel Studio — importer.
 *
 * Reads existing Linked.Archi documents (ontology, SHACL shapes, taxonomy, viewpoints,
 * manifest — any subset, in any order) back into a studio project, so a published
 * metamodel such as ArchiMate 4.0 can be used as the starting point for a new one.
 *
 * Needs N3.js (vendor/n3.min.js): window.N3 in the browser, require() under Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./core.js"), require("../vendor/n3.min.js"));
  } else {
    root.LAStudio = Object.assign(root.LAStudio || {}, { importer: factory(root.LAStudio.core, root.N3) });
  }
})(typeof self !== "undefined" ? self : this, function (core, N3) {
  "use strict";

  const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
  const OWL = "http://www.w3.org/2002/07/owl#";
  const SKOS = "http://www.w3.org/2004/02/skos/core#";
  const SH = "http://www.w3.org/ns/shacl#";
  const DCT = "http://purl.org/dc/terms/";
  const VANN = "http://purl.org/vocab/vann/";
  const BIBO = "http://purl.org/ontology/bibo/";
  const ARCH = "https://meta.linked.archi/core#";
  const ARCHVP = "https://meta.linked.archi/core-viewpoints#";

  class Graph {
    constructor() {
      this.sp = new Map(); // s -> p -> [o]
      this.po = new Map(); // p -> o(key) -> [s]
      this.prefixes = {};
    }

    add(q) {
      const s = q.subject.value, p = q.predicate.value, o = q.object;
      if (!this.sp.has(s)) this.sp.set(s, new Map());
      const m = this.sp.get(s);
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(o);
      const ok = o.termType + ":" + o.value;
      if (!this.po.has(p)) this.po.set(p, new Map());
      const n = this.po.get(p);
      if (!n.has(ok)) n.set(ok, []);
      n.get(ok).push(s);
    }

    objects(s, p) { return ((this.sp.get(s) || new Map()).get(p) || []); }
    iris(s, p) { return this.objects(s, p).filter((o) => o.termType === "NamedNode").map((o) => o.value); }
    subjects(p, oIri) { return ((this.po.get(p) || new Map()).get("NamedNode:" + oIri) || []); }
    has(s, p, oIri) { return this.iris(s, p).includes(oIri); }
    types(s) { return this.iris(s, RDF + "type"); }

    /** Preferred literal: lang, then no lang, then any. */
    text(s, p, lang) {
      const lits = this.objects(s, p).filter((o) => o.termType === "Literal");
      const pick = lits.find((o) => o.language === lang) || lits.find((o) => !o.language) || lits[0];
      return pick ? pick.value : "";
    }

    texts(s, p, lang) {
      const lits = this.objects(s, p).filter((o) => o.termType === "Literal");
      const own = lits.filter((o) => o.language === lang || !o.language);
      return (own.length ? own : lits).map((o) => o.value);
    }

    list(head) {
      const out = [];
      let node = head;
      let guard = 0;
      while (node && node.value !== RDF + "nil" && guard++ < 10000) {
        const first = this.objects(node.value, RDF + "first")[0];
        if (first) out.push(first);
        node = this.objects(node.value, RDF + "rest")[0];
      }
      return out;
    }
  }

  function parseAll(documents) {
    const g = new Graph();
    for (const doc of documents) {
      const parser = new N3.Parser({ format: "text/turtle", baseIRI: doc.baseIRI });
      let quads;
      try {
        quads = parser.parse(doc.text, null, (prefix, iri) => {
          if (prefix && !(prefix in g.prefixes)) g.prefixes[prefix] = iri.value || String(iri);
        });
      } catch (err) {
        throw new Error(`${doc.name || "document"}: ${err.message}`);
      }
      for (const q of quads) g.add(q);
    }
    return g;
  }

  function nsOf(iri) {
    const i = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
    return iri.slice(0, i + 1);
  }

  function localOf(iri) {
    const i = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
    return iri.slice(i + 1);
  }

  /** Classes reachable downward from `rootIri` through rdfs:subClassOf. */
  function subclassesOf(g, rootIri) {
    const seen = new Set();
    const queue = [rootIri];
    while (queue.length) {
      const c = queue.shift();
      for (const sub of g.subjects(RDFS + "subClassOf", c)) {
        if (!seen.has(sub)) { seen.add(sub); queue.push(sub); }
      }
    }
    return seen;
  }

  /**
   * documents: [{name, text}] Turtle. Returns {project, report}: the project, and what
   * was found and what could not be mapped.
   */
  function importTurtle(documents, options) {
    const opts = options || {};
    const lang = opts.lang || "en";
    const g = parseAll(documents);
    const report = [];

    // ---- which namespace is the language's own?
    const relClasses = subclassesOf(g, ARCH + "QualifiedRelationship");
    const elemClasses = subclassesOf(g, ARCH + "Element");
    for (const r of relClasses) elemClasses.delete(r);
    const tally = new Map();
    for (const c of [...elemClasses, ...relClasses]) tally.set(nsOf(c), (tally.get(nsOf(c)) || 0) + 1);
    let ns = opts.namespace || "";
    if (!ns) {
      let best = 0;
      for (const [k, v] of tally) if (v > best && k !== ARCH) { best = v; ns = k; }
    }
    if (!ns) throw new Error("No element or relationship classes found: the documents declare no rdfs:subClassOf arch:Element or arch:QualifiedRelationship.");

    const ontologyIri = g.subjects(RDF + "type", OWL + "Ontology").find((o) => o === ns || o + "#" === ns || o === ns.replace(/#$/, "")) || ns;
    const prefixFromVann = g.text(ontologyIri, VANN + "preferredNamespacePrefix");
    const prefixFromDecl = Object.keys(g.prefixes).find((p) => g.prefixes[p] === ns);
    const prefix = opts.prefix || prefixFromVann || prefixFromDecl || "mm";

    // ---- reference mapping: IRIs in our namespaces -> local ids, others -> CURIE
    const nsToPrefix = new Map();
    for (const [p, iri] of Object.entries(core.STD_PREFIXES)) nsToPrefix.set(iri, p);
    for (const [p, iri] of Object.entries(g.prefixes)) if (!nsToPrefix.has(iri)) nsToPrefix.set(iri, p);
    const usedImports = new Map();

    const project = core.emptyProject();
    const m = project.meta;
    const baseIri = ns.endsWith("onto#") ? ns.slice(0, -"onto#".length) : (ns.endsWith("#") ? ns.slice(0, -1) + "/" : ns);
    m.baseIri = baseIri;
    m.prefix = prefix;
    m.slug = (baseIri.replace(/\/$/, "").split("/").pop() || prefix).toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
    m.lang = lang;
    const own = core.namespaces(project);
    const ownNs = { concept: own[prefix], taxonomy: own[prefix + "tax"], viewpoint: own[prefix + "vp"] };

    function ref(iri, scope) {
      if (ownNs[scope] && iri.startsWith(ownNs[scope]) && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(iri.slice(ownNs[scope].length))) {
        return iri.slice(ownNs[scope].length);
      }
      const n = nsOf(iri);
      const local = localOf(iri);
      let p = nsToPrefix.get(n);
      if (p === prefix && n !== ns) p = null; // never let a foreign namespace shadow ours
      if (p && core.LOCAL_NAME.test(local)) {
        if (!(p in core.STD_PREFIXES) && !(p in own)) usedImports.set(p, n);
        return `${p}:${local}`;
      }
      return iri;
    }

    // ---- ontology header
    const title = g.text(ontologyIri, DCT + "title", lang);
    m.title = title.replace(/^Linked\.Archi\s+/i, "").replace(/\s+Ontology$/i, "") || core.humanize(prefix);
    m.name = core.toLocalName(m.title) || "Metamodel";
    m.description = g.text(ontologyIri, DCT + "description", lang);
    m.creator = g.texts(ontologyIri, DCT + "creator", lang).join(", ");
    m.publisher = g.text(ontologyIri, DCT + "publisher", lang);
    m.created = g.text(ontologyIri, DCT + "created");
    m.modified = g.text(ontologyIri, DCT + "modified");
    m.status = g.text(ontologyIri, BIBO + "status") || "draft";
    m.version = g.text(ontologyIri, OWL + "versionInfo", lang) || m.version;
    m.languageVersion = m.version;
    m.scopeNote = g.texts(ontologyIri, SKOS + "scopeNote", lang).join("\n");
    m.historyNote = g.texts(ontologyIri, SKOS + "historyNote", lang).join("\n");
    m.changeNote = g.texts(ontologyIri, SKOS + "changeNote", lang).join("\n");
    const prior = g.iris(ontologyIri, OWL + "priorVersion")[0];
    if (prior) m.priorVersion = prior;
    const license = g.iris(ontologyIri, DCT + "license")[0] || g.text(ontologyIri, DCT + "license");
    if (license) m.license = license;

    const inNs = (iri) => iri.startsWith(ns) && core.LOCAL_NAME.test(iri.slice(ns.length));

    // Element types that specialize only an external class (cp:Microservice ⊑ am4:ApplicationComponent)
    // do not reach arch:Element unless that language is loaded too: every other owl:Class in
    // the language namespace is an element type.
    for (const c of g.subjects(RDF + "type", OWL + "Class")) {
      if (inNs(c) && !relClasses.has(c)) elemClasses.add(c);
    }

    // ---- elements
    const elementIris = [...elemClasses].filter(inNs).sort();
    for (const iri of elementIris) {
      const parents = g.iris(iri, RDFS + "subClassOf").map((p) => ref(p, "concept"));
      project.elements.push({
        id: iri.slice(ns.length),
        label: g.text(iri, SKOS + "prefLabel", lang) || g.text(iri, RDFS + "label", lang),
        altLabels: g.texts(iri, SKOS + "altLabel", lang),
        definition: g.text(iri, SKOS + "definition", lang) || g.text(iri, RDFS + "comment", lang),
        scopeNote: g.text(iri, SKOS + "scopeNote", lang),
        example: g.text(iri, SKOS + "example", lang),
        changeNote: g.texts(iri, SKOS + "changeNote", lang).join("\n"),
        parents: parents.length === 1 && parents[0] === "arch:Element" ? [] : parents,
        abstract: g.objects(iri, ARCH + "isAbstractClass").some((o) => o.value === "true" || o.value === "1"),
        categories: [],
        notation: {},
      });
    }

    // ---- relationships
    const relIris = [...relClasses].filter(inNs).sort();
    for (const iri of relIris) {
      const pred = g.iris(iri, ARCH + "unqualifiedForm")[0] || "";
      const parentIri = g.iris(iri, RDFS + "subClassOf").find((p) => p !== ARCH + "QualifiedRelationship");
      const predLocal = pred && inNs(pred) ? pred.slice(ns.length) : "";
      project.relationships.push({
        id: iri.slice(ns.length),
        label: g.text(iri, SKOS + "prefLabel", lang) || g.text(iri, RDFS + "label", lang),
        predicate: predLocal || core.suggestPredicate(iri.slice(ns.length)),
        predicateLabel: pred ? g.text(pred, SKOS + "prefLabel", lang) : "",
        predicateDefinition: pred ? g.text(pred, SKOS + "definition", lang) : "",
        notation: g.text(iri, SKOS + "notation"),
        parent: parentIri ? ref(parentIri, "concept") : "",
        definition: g.text(iri, SKOS + "definition", lang) || (pred ? g.text(pred, SKOS + "definition", lang) : ""),
        scopeNote: g.text(iri, SKOS + "scopeNote", lang),
        changeNote: g.texts(iri, SKOS + "changeNote", lang).join("\n"),
        domain: pred ? g.iris(pred, ARCH + "domainIncludes").map((x) => ref(x, "concept")).filter((x) => x !== "arch:Element") : [],
        range: pred ? g.iris(pred, ARCH + "rangeIncludes").map((x) => ref(x, "concept")).filter((x) => x !== "arch:Element") : [],
        categories: [],
        style: {},
      });
      if (pred && !predLocal) report.push(`Relationship ${iri.slice(ns.length)}: unqualified form ${pred} is outside ${ns}; a local predicate was suggested.`);
    }
    // ---- attributes (owl:DatatypeProperty in the language namespace)
    for (const iri of g.subjects(RDF + "type", OWL + "DatatypeProperty").filter(inNs).sort()) {
      const range = g.iris(iri, RDFS + "range")[0];
      project.attributes.push({
        id: iri.slice(ns.length),
        label: g.text(iri, SKOS + "prefLabel", lang) || g.text(iri, RDFS + "label", lang),
        definition: g.text(iri, SKOS + "definition", lang) || g.text(iri, RDFS + "comment", lang),
        domain: g.iris(iri, RDFS + "domain").concat(g.iris(iri, ARCH + "domainIncludes")).map((x) => ref(x, "concept")).filter((x) => x !== "arch:Element"),
        datatype: range ? ref(range, "concept") : "xsd:string",
        values: [],
        required: false,
        multiple: false,
        deprecated: g.objects(iri, OWL + "deprecated").some((o) => o.value === "true"),
      });
    }

    const relIds = new Set(project.relationships.map((r) => r.id));
    const elemIds = new Set(project.elements.map((e) => e.id));

    // ---- rules from SHACL: relationship shapes (sh:targetClass Rel ; sh:or ( [sh:and (src tgt)] ... ))
    let ruleCount = 0;
    for (const shape of g.subjects(RDF + "type", SH + "NodeShape")) {
      for (const target of g.iris(shape, SH + "targetClass")) {
        const relId = inNs(target) ? target.slice(ns.length) : null;
        if (!relId || !relIds.has(relId)) continue;
        for (const alt of g.objects(shape, SH + "or").flatMap((h) => g.list(h))) {
          const parts = g.objects(alt.value, SH + "and").flatMap((h) => g.list(h));
          let sources = [], targets = [];
          for (const part of parts) {
            for (const prop of g.objects(part.value, SH + "property")) {
              const path = g.iris(prop.value, SH + "path")[0];
              const classes = g.iris(prop.value, SH + "class")
                .concat(g.objects(prop.value, SH + "or").flatMap((h) => g.list(h)).flatMap((o) => g.iris(o.value, SH + "class")));
              if (path === ARCH + "source") sources = sources.concat(classes);
              if (path === ARCH + "target") targets = targets.concat(classes);
            }
          }
          for (const s of sources) for (const t of targets) {
            core.setRule(project, relId, ref(s, "concept"), ref(t, "concept"), true);
            ruleCount++;
          }
        }
      }
    }

    // ---- attribute constraints from SHACL property shapes on the attribute's path
    const attrById = new Map(project.attributes.map((a) => [a.id, a]));
    for (const shape of g.subjects(RDF + "type", SH + "NodeShape")) {
      for (const prop of g.objects(shape, SH + "property")) {
        const path = g.iris(prop.value, SH + "path")[0];
        const a = path && inNs(path) ? attrById.get(path.slice(ns.length)) : null;
        if (!a) continue;
        const max = g.text(prop.value, SH + "maxCount"), min = g.text(prop.value, SH + "minCount");
        a.multiple = max === "";
        a.required = min !== "" && Number(min) > 0;
        const values = g.objects(prop.value, SH + "in").flatMap((h) => g.list(h)).map((o) => o.value);
        if (values.length) a.values = values;
      }
    }

    // ---- notation (archvis:VisualNotation descriptors)
    const VIS = "https://meta.linked.archi/core-vis#";
    for (const vn of g.subjects(RDF + "type", VIS + "VisualNotation")) {
      const target = g.iris(vn, VIS + "notationFor")[0];
      if (!target || !inNs(target)) continue;
      const id = target.slice(ns.length);
      const style = g.objects(vn, VIS + "defaultStyle")[0];
      const colour = (p) => (style ? g.text(style.value, VIS + p) : "");
      const e = project.elements.find((x) => x.id === id);
      const r = project.relationships.find((x) => x.id === id);
      if (e) {
        e.notation = {};
        for (const [k, p] of [["fill", "fillColor"], ["stroke", "lineColor"], ["font", "fontColor"]]) if (colour(p)) e.notation[k] = colour(p);
        if (g.text(vn, VIS + "shape")) e.notation.shape = g.text(vn, VIS + "shape");
      } else if (r) {
        r.style = {};
        if (g.text(vn, VIS + "lineStyle")) r.style.line = g.text(vn, VIS + "lineStyle");
        if (g.text(vn, VIS + "arrowHead")) r.style.arrow = g.text(vn, VIS + "arrowHead");
        if (colour("lineColor")) r.style.stroke = colour("lineColor");
      }
    }

    // ---- external concepts referenced by rules (so they show up in the matrix)
    const ext = new Set();
    for (const list of Object.values(project.rules)) for (const k of list) for (const x of core.splitPair(k)) if (!elemIds.has(x)) ext.add(x);
    for (const x of ext) if (x !== "arch:Element" && core.isCurie(x)) project.externalConcepts.push({ ref: x, label: x, kind: "element", parents: [] });

    // ---- taxonomy
    const schemes = g.subjects(RDF + "type", SKOS + "ConceptScheme");
    const viewpointIris = new Set(g.subjects(RDF + "type", ARCH + "Viewpoint"));
    const catalogSchemes = new Set();
    for (const v of viewpointIris) for (const s of g.iris(v, SKOS + "inScheme")) catalogSchemes.add(s);
    const taxScheme = schemes.find((s) => s === ownNs.taxonomy) || schemes.find((s) => !catalogSchemes.has(s) && g.subjects(SKOS + "inScheme", s).some((c) => g.iris(c, SKOS + "narrower").some((n) => elemIds.has(ref(n, "concept")) || relIds.has(ref(n, "concept")))));
    if (taxScheme) {
      project.taxonomy.label = g.text(taxScheme, SKOS + "prefLabel", lang);
      const concepts = g.subjects(SKOS + "inScheme", taxScheme).filter((c) => g.types(c).includes(SKOS + "Concept"));
      const catIds = new Map();
      for (const c of concepts) catIds.set(c, ref(c, "taxonomy"));
      for (const c of concepts) {
        const id = catIds.get(c);
        const broader = g.iris(c, SKOS + "broader").find((b) => catIds.has(b)) ||
          concepts.find((other) => g.has(other, SKOS + "narrower", c));
        project.taxonomy.categories.push({
          id: core.LOCAL_NAME.test(id) ? id : core.toLocalName(localOf(c)),
          label: g.text(c, SKOS + "prefLabel", lang),
          definition: g.text(c, SKOS + "definition", lang),
          parent: broader ? catIds.get(broader) : "",
        });
        for (const n of g.iris(c, SKOS + "narrower")) {
          const r = ref(n, "concept");
          const item = project.elements.find((e) => e.id === r) || project.relationships.find((x) => x.id === r);
          if (item && !item.categories.includes(id)) item.categories.push(id);
        }
      }
    }
    for (const order of g.subjects(RDF + "type", ARCH + "RelationshipProposalOrder")) {
      if (g.objects(order, ARCH + "domainIncludes").length || g.objects(order, ARCH + "rangeIncludes").length) continue;
      const members = g.objects(order, SKOS + "memberList").flatMap((h) => g.list(h)).map((o) => ref(o.value, "concept"));
      if (members.length) project.proposalOrder = members.filter((x) => relIds.has(x));
    }

    // ---- viewpoints
    const vref = (iri) => ref(iri, "viewpoint");
    const vpConcepts = new Set();
    for (const catalog of catalogSchemes) for (const c of g.subjects(SKOS + "inScheme", catalog)) if (!viewpointIris.has(c)) vpConcepts.add(c);
    for (const c of [...vpConcepts].sort()) {
      const broader = g.iris(c, SKOS + "broader").find((b) => vpConcepts.has(b));
      project.viewpointCategories.push({
        id: vref(c), label: g.text(c, SKOS + "prefLabel", lang), definition: g.text(c, SKOS + "definition", lang),
        parent: broader ? vref(broader) : "",
      });
    }
    const typed = (t) => g.subjects(RDF + "type", ARCH + t).sort();
    const isLocalVp = (iri) => iri.startsWith(ownNs.viewpoint);
    for (const [type, list] of [["Purpose", project.purposes], ["Concern", project.concerns], ["Stakeholder", project.stakeholders]]) {
      for (const iri of typed(type).filter(isLocalVp)) {
        const item = { id: vref(iri), label: g.text(iri, SKOS + "prefLabel", lang), definition: g.text(iri, SKOS + "definition", lang) };
        if (type === "Stakeholder") item.concerns = g.iris(iri, ARCH + "stakeholderHasConcern").map(vref);
        list.push(item);
      }
    }
    for (const iri of [...viewpointIris].sort()) {
      project.viewpoints.push({
        id: vref(iri),
        label: g.text(iri, SKOS + "prefLabel", lang),
        definition: g.text(iri, SKOS + "definition", lang),
        concepts: g.iris(iri, ARCH + "includesConcept").map((c) => ref(c, "concept")),
        stakeholders: g.iris(iri, ARCH + "targetsStakeholder").map(vref),
        concerns: g.iris(iri, ARCH + "viewpointFramesConcern").map(vref),
        purposes: g.iris(iri, ARCH + "viewpointHasPurpose").map(vref),
        viewTypes: g.iris(iri, ARCH + "viewType").filter((t) => t.startsWith(ARCH)).map((t) => t.slice(ARCH.length)),
        categories: g.iris(iri, SKOS + "broader").filter((b) => vpConcepts.has(b)).map(vref),
      });
    }

    // ---- manifest
    const manifests = g.subjects(RDF + "type", ARCH + "Metamodel");
    const manifest = manifests.find((mm) => g.iris(mm, ARCH + "modelConcepts").some((o) => o === ns || o === ontologyIri))
      || (manifests.length === 1 ? manifests[0] : null);
    if (manifest) {
      m.name = core.LOCAL_NAME.test(localOf(manifest)) ? localOf(manifest) : m.name;
      const label = g.text(manifest, SKOS + "prefLabel", lang);
      if (label) m.title = label.replace(/\s+Metamodel$/i, "");
      m.languageVersion = g.text(manifest, OWL + "versionInfo", lang) || m.languageVersion;
      m.manifestStakeholders = g.iris(manifest, ARCH + "metamodelIdentifiesStakeholder").map((x) => (x.startsWith(ARCHVP) ? x.slice(ARCHVP.length) : x));
      m.manifestConcerns = g.iris(manifest, ARCH + "metamodelIdentifiesConsideration").map((x) => (x.startsWith(ARCHVP) ? x.slice(ARCHVP.length) : x));
      const fw = g.iris(manifest, ARCH + "basedOnFramework")[0];
      if (fw) m.frameworkLabel = g.text(fw, SKOS + "prefLabel", lang);
    }

    m.imports = [...usedImports].filter(([p]) => p !== prefix).map(([p, n]) => ({ prefix: p, namespace: n }));
    m.assets = {
      shapes: true,
      taxonomy: true,
      viewpoints: true,
      notation: true,
    };

    report.unshift(
      `Namespace ${ns} (prefix ${prefix}).`,
      `${project.elements.length} element types (${project.elements.filter((e) => e.abstract).length} abstract), ${project.relationships.length} relationship types, ${project.attributes.length} attributes.`,
      `${ruleCount} relationship rules from SHACL shapes.`,
      `${project.taxonomy.categories.length} taxonomy categories, ${project.viewpoints.length} viewpoints in ${project.viewpointCategories.length} categories, ${project.stakeholders.length} stakeholders, ${project.concerns.length} concerns, ${project.purposes.length} purposes.`,
    );
    return { project: core.normalize(project), report };
  }

  return { importTurtle, parseAll };
});
