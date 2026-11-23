/*
 * Linked.Archi Metamodel Studio — generator.
 *
 * Turns a studio project into a complete Linked.Archi semantic asset set, following the
 * conventions of the documents published at meta.linked.archi (archimate4, bpmn, c4,
 * backstage, leanix):
 *
 *   <slug>-onto.ttl        owl:Ontology  — element classes, relationship classes, their
 *                                          direct and qualified predicates   (arch:modelConcepts)
 *   <slug>-shapes.ttl      SHACL shapes  — which relationship may connect which types
 *                                                                              (arch:formalRules)
 *   <slug>-tax.ttl         SKOS scheme   — classification of concepts, relationship
 *                                          proposal order               (arch:conceptClassification)
 *   <slug>-viewpoints.ttl  viewpoints, stakeholders, concerns, purposes and the viewpoint
 *                          catalog     (arch:architectureViewpoints, arch:viewpointLibrary)
 *   <slug>-notation.ttl    notation set — default visual style per concept   (arch:notationSet)
 *   <slug>-metamodel.ttl   the arch:Metamodel manifest that points at all of the above
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.LAStudio = Object.assign(root.LAStudio || {}, { generator: factory(root.LAStudio.core) });
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  // ---------------------------------------------------------------- Turtle writer

  function escapeString(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  class TurtleDoc {
    constructor(ns, header) {
      this.ns = ns;
      this.header = header || [];
      this.used = new Set();
      this.blocks = [];
    }

    /** A reference: absolute IRI, CURIE, or a local name in `defaultPrefix`. */
    ref(value, defaultPrefix) {
      const v = String(value || "").trim();
      if (/^https?:\/\//.test(v)) return `<${v}>`;
      if (core.isCurie(v) || /^[A-Za-z][A-Za-z0-9_-]*:$/.test(v)) {
        const prefix = v.slice(0, v.indexOf(":"));
        if (!(prefix in this.ns)) throw new Error(`Unknown prefix "${prefix}" in ${v}`);
        this.used.add(prefix);
        return v;
      }
      if (!defaultPrefix) throw new Error(`Cannot resolve reference "${v}"`);
      this.used.add(defaultPrefix);
      return `${defaultPrefix}:${v}`;
    }

    lit(text, lang) {
      return `"${escapeString(text)}"` + (lang ? `@${lang}` : "");
    }

    typed(text, datatype) {
      return `"${escapeString(text)}"^^${this.ref(datatype)}`;
    }

    list(items) {
      return items.length ? `( ${items.join(" ")} )` : "()";
    }

    /** subject, [[predicate, object | object[]], ...]; empty objects are skipped. */
    add(subject, pairs) {
      const lines = [];
      for (const [pred, objs] of pairs) {
        const values = (Array.isArray(objs) ? objs : [objs]).filter((o) => o !== undefined && o !== null && o !== "");
        if (!values.length) continue;
        lines.push(`${pred === "a" ? "a" : pred} ${values.join(" ,\n\t\t")}`);
      }
      if (!lines.length) return;
      this.blocks.push(`${subject}\n\t${lines.join(" ;\n\t")} .`);
    }

    comment(text) {
      this.blocks.push(text.split("\n").map((l) => `# ${l}`).join("\n"));
    }

    render() {
      const order = Object.keys(this.ns);
      const prefixes = order.filter((p) => this.used.has(p));
      const head = this.header.map((l) => `# ${l}`).join("\n");
      const prefixLines = prefixes.map((p) => `@prefix ${p}: <${this.ns[p]}> .`).join("\n");
      return [head, prefixLines, this.blocks.join("\n\n")].filter(Boolean).join("\n\n") + "\n";
    }
  }

  // ---------------------------------------------------------------- helpers

  function texts(doc, values, lang) {
    return (values || []).filter((v) => String(v || "").trim()).map((v) => doc.lit(String(v).trim(), lang));
  }

  function text(doc, value, lang) {
    const v = String(value || "").trim();
    return v ? doc.lit(v, lang) : null;
  }

  /**
   * The root resource of a document and its metadata (SReq 1.2–1.3). `extra.scheme` makes it a plain
   * skos:ConceptScheme (SD-5): no owl:Ontology, owl:imports, owl:versionIRI or owl:priorVersion, which are OWL
   * ontology properties; owl:versionInfo is an annotation property and stays.
   */
  function ontologyHeader(doc, project, iri, kind, extra) {
    const m = project.meta;
    const lang = m.lang || "en";
    const scheme = !!(extra && extra.scheme);
    const pairs = [
      ["a", scheme ? [doc.ref("skos:ConceptScheme")] : extra && extra.types ? extra.types : [doc.ref("owl:Ontology")]],
      [doc.ref("owl:imports"), scheme ? null : (extra && extra.imports) || [doc.ref("arch:")]],
      [doc.ref("vann:preferredNamespaceUri"), extra && extra.nsUri ? doc.lit(extra.nsUri) : null],
      [doc.ref("vann:preferredNamespacePrefix"), extra && extra.nsPrefix ? doc.lit(extra.nsPrefix) : null],
      [doc.ref("dct:title"), doc.lit(`${m.title} ${kind}`, lang)],
      [doc.ref("dct:description"), extra && extra.description ? doc.lit(extra.description, lang) : null],
      [doc.ref("dct:creator"), m.creator ? doc.lit(m.creator) : null],
      [doc.ref("dct:publisher"), m.publisher ? doc.lit(m.publisher, lang) : null],
      [doc.ref("dct:license"), /^https?:\/\//.test(m.license || "") ? doc.ref(m.license) : (m.license ? doc.lit(m.license) : null)],
      [doc.ref("dct:created"), m.created ? doc.typed(m.created, "xsd:date") : null],
      [doc.ref("dct:modified"), m.modified ? doc.typed(m.modified, "xsd:date") : null],
      [doc.ref("bibo:status"), m.status ? doc.lit(m.status) : null],
      [doc.ref("owl:versionIRI"), m.version && !scheme ? doc.ref(`${iri.replace(/#$/, "")}/${m.version}#`) : null],
      [doc.ref("owl:versionInfo"), m.version ? doc.lit(m.version, lang) : null],
      [doc.ref("owl:priorVersion"), extra && extra.priorVersion && !scheme ? doc.ref(extra.priorVersion) : null],
    ];
    if (extra && extra.more) pairs.push(...extra.more);
    doc.add(doc.ref(iri), pairs);
  }

  function generatedBy(project, what) {
    return [
      `${project.meta.title} — ${what}`,
      `Generated by Linked.Archi Metamodel Studio from ${core.fileNames(project).project}.`,
      "Edit the project, not this file: regenerating overwrites it.",
    ];
  }

  // ---------------------------------------------------------------- ontology

  function buildOntology(project) {
    const m = project.meta;
    const P = m.prefix;
    const ns = core.namespaces(project);
    const lang = m.lang || "en";
    const doc = new TurtleDoc(ns, generatedBy(project, "model concepts ontology"));
    const iri = ns[P];
    const imports = [doc.ref("arch:")].concat((m.imports || []).filter((i) => i.prefix && i.namespace).map((i) => doc.ref(`${i.prefix}:`)));

    ontologyHeader(doc, project, iri, "Ontology", {
      imports,
      nsUri: iri,
      nsPrefix: P,
      description: m.description,
      priorVersion: m.priorVersion,
      more: [
        [doc.ref("skos:scopeNote"), text(doc, m.scopeNote, lang)],
        [doc.ref("skos:historyNote"), text(doc, m.historyNote, lang)],
        [doc.ref("skos:changeNote"), text(doc, m.changeNote, lang)],
      ],
    });

    const relById = new Map(project.relationships.map((r) => [r.id, r]));

    for (const e of project.elements) {
      const parents = e.parents.length ? e.parents : ["arch:Element"];
      doc.add(doc.ref(e.id, P), [
        ["a", doc.ref("owl:Class")],
        [doc.ref("rdfs:subClassOf"), parents.map((p) => doc.ref(p, P))],
        [doc.ref("arch:isAbstractClass"), e.abstract ? "true" : null],
        [doc.ref("skos:prefLabel"), doc.lit(e.label || core.humanize(e.id), lang)],
        [doc.ref("skos:altLabel"), texts(doc, e.altLabels, lang)],
        [doc.ref("skos:definition"), text(doc, e.definition, lang)],
        [doc.ref("skos:scopeNote"), text(doc, e.scopeNote, lang)],
        [doc.ref("skos:example"), text(doc, e.example, lang)],
        [doc.ref("skos:changeNote"), text(doc, e.changeNote, lang)],
      ]);
    }

    for (const r of project.relationships) {
      const parent = r.parent ? relById.get(r.parent) : null;
      const pred = r.predicate || core.suggestPredicate(r.id);
      const label = r.label || core.humanize(r.id);
      const domain = r.domain.length ? r.domain : ["arch:Element"];
      const range = r.range.length ? r.range : ["arch:Element"];
      // An external parent (a CURIE) contributes rdfs:subClassOf only; its predicate is unknown here.
      const parentPred = parent ? (parent.predicate || core.suggestPredicate(parent.id)) : null;
      // A subtype that keeps its parent's predicate (ReadAccess -> accesses) declares only
      // its class: the predicate and the qualified predicate belong to the parent.
      const sharesPredicate = parentPred === pred;
      if (!sharesPredicate) {
        doc.add(doc.ref(pred, P), [
          ["a", doc.ref("owl:ObjectProperty")],
          [doc.ref("rdfs:subPropertyOf"), parentPred ? doc.ref(parentPred, P) : null],
          [doc.ref("skos:prefLabel"), doc.lit(r.predicateLabel || core.humanize(pred).replace(/^./, (c) => c.toUpperCase()), lang)],
          [doc.ref("skos:definition"), text(doc, r.predicateDefinition || r.definition, lang)],
          [doc.ref("arch:domainIncludes"), domain.map((d) => doc.ref(d, P))],
          [doc.ref("arch:rangeIncludes"), range.map((d) => doc.ref(d, P))],
        ]);
      }
      doc.add(doc.ref(r.id, P), [
        ["a", doc.ref("owl:Class")],
        [doc.ref("rdfs:subClassOf"), r.parent ? doc.ref(r.parent, P) : doc.ref("arch:QualifiedRelationship")],
        [doc.ref("arch:unqualifiedForm"), doc.ref(pred, P)],
        [doc.ref("skos:prefLabel"), doc.lit(label, lang)],
        [doc.ref("skos:notation"), r.notation ? doc.lit(r.notation) : null],
        [doc.ref("skos:definition"), text(doc, r.definition, lang)],
        [doc.ref("skos:scopeNote"), text(doc, r.scopeNote, lang)],
        [doc.ref("skos:changeNote"), text(doc, r.changeNote, lang)],
      ]);
      if (!sharesPredicate) {
        doc.add(doc.ref(`qualified${r.id}`, P), [
          ["a", doc.ref("owl:ObjectProperty")],
          [doc.ref("rdfs:range"), doc.ref(r.id, P)],
          [doc.ref("arch:unqualifiedForm"), doc.ref(pred, P)],
          [doc.ref("arch:domainIncludes"), domain.map((d) => doc.ref(d, P))],
          [doc.ref("skos:prefLabel"), doc.lit(`qualified ${label}`, lang)],
          [doc.ref("skos:definition"), doc.lit(`Navigates from a source element to ${/^[AEIOU]/i.test(label) ? "an" : "a"} ${r.id} qualified relationship\nresource.`, lang)],
        ]);
      }
    }

    for (const a of project.attributes) {
      const domain = a.domain.length ? a.domain : ["arch:Element"];
      doc.add(doc.ref(a.id, P), [
        ["a", doc.ref("owl:DatatypeProperty")],
        [doc.ref("skos:prefLabel"), doc.lit(a.label || core.humanize(a.id).replace(/^./, (c) => c.toUpperCase()), lang)],
        [doc.ref("skos:definition"), text(doc, a.definition, lang)],
        [doc.ref("rdfs:domain"), domain.length === 1 ? doc.ref(domain[0], P) : null],
        [doc.ref("arch:domainIncludes"), domain.length > 1 ? domain.map((d) => doc.ref(d, P)) : null],
        [doc.ref("rdfs:range"), doc.ref(a.datatype || "xsd:string")],
        [doc.ref("owl:deprecated"), a.deprecated ? "true" : null],
      ]);
    }
    return doc.render();
  }

  /** A value for sh:in, typed like the attribute (plain string for xsd:string). */
  function attributeValue(doc, a, v) {
    const dt = a.datatype || "xsd:string";
    if (dt === "xsd:string") return doc.lit(v);
    if (dt === "xsd:boolean" || dt === "xsd:integer" || dt === "xsd:decimal") {
      if (dt === "xsd:boolean" && /^(true|false)$/.test(v)) return v;
      if (dt === "xsd:integer" && /^[+-]?[0-9]+$/.test(v)) return v;
      if (dt === "xsd:decimal" && /^[+-]?[0-9]*\.[0-9]+$/.test(v)) return v;
    }
    return doc.typed(v, dt);
  }

  // ---------------------------------------------------------------- shapes

  /**
   * One sh:NodeShape per relationship class that has rules (targets the qualified
   * relationship resource; source/target pairs as an sh:or of sh:and), and one per
   * source element type (targets the element; constrains its direct predicates). This is
   * the layout of the published ArchiMate shapes (e.g. amsh:AggregationShape and
   * amsh:BusinessRoleRelShape). A relationship with no rules is left unconstrained.
   */
  function buildShapes(project) {
    const m = project.meta;
    const P = m.prefix;
    const SH = P + "sh";
    const ns = core.namespaces(project);
    const lang = m.lang || "en";
    const doc = new TurtleDoc(ns, generatedBy(project, "SHACL shapes"));
    ontologyHeader(doc, project, ns[SH], "SHACL Shapes", {
      imports: [doc.ref("arch:"), doc.ref(`${P}:`)],
      nsUri: ns[SH],
      nsPrefix: SH,
      description: `Which relationship may connect which element types in ${m.title}. A relationship type with no rules is not constrained.`,
    });

    const constrained = project.relationships.filter((r) => (project.rules[r.id] || []).length);
    const idx = core.conceptIndex(project);
    const label = (ref) => (idx.get(ref) ? idx.get(ref).label : ref);
    const localName = (ref) => (core.isCurie(ref) ? ref.replace(":", "_") : ref);

    // Relationship-resource shapes.
    for (const r of constrained) {
      const bySource = new Map();
      for (const key of project.rules[r.id]) {
        const [s, t] = core.splitPair(key);
        if (!bySource.has(s)) bySource.set(s, []);
        bySource.get(s).push(t);
      }
      const alternatives = Array.from(bySource.keys()).sort().map((s) => {
        const targets = bySource.get(s).sort().map((t) => `[ ${doc.ref("sh:class")} ${doc.ref(t, P)} ]`);
        const tgt = targets.length === 1
          ? `[ ${doc.ref("sh:property")} [ ${doc.ref("sh:path")} ${doc.ref("arch:target")} ; ${targets[0].slice(2, -2)} ] ]`
          : `[ ${doc.ref("sh:property")} [ ${doc.ref("sh:path")} ${doc.ref("arch:target")} ; ${doc.ref("sh:or")} ${doc.list(targets)} ] ]`;
        const src = `[ ${doc.ref("sh:property")} [ ${doc.ref("sh:path")} ${doc.ref("arch:source")} ; ${doc.ref("sh:class")} ${doc.ref(s, P)} ] ]`;
        return `[ ${doc.ref("sh:and")} ( ${src}\n\t\t\t${tgt} ) ]`;
      });
      doc.add(doc.ref(`${r.id}Shape`, SH), [
        ["a", doc.ref("sh:NodeShape")],
        [doc.ref("sh:targetClass"), doc.ref(r.id, P)],
        [doc.ref("sh:message"), doc.lit(`Invalid ${r.label || core.humanize(r.id)}: this source-target pair is not permitted by the ${m.title} metamodel.`, lang)],
        [doc.ref("sh:or"), `(\n\t\t${alternatives.join("\n\t\t")}\n\t)`],
      ]);
    }

    // Attribute shapes: datatype, cardinality and allowed values.
    for (const a of project.attributes) {
      if (a.deprecated) continue;
      const domain = a.domain.length ? a.domain : ["arch:Element"];
      const values = (a.values || []).filter((v) => String(v).trim() !== "");
      const prop = [
        `${doc.ref("sh:path")} ${doc.ref(a.id, P)}`,
        `${doc.ref("sh:datatype")} ${doc.ref(a.datatype || "xsd:string")}`,
      ];
      if (!a.multiple) prop.push(`${doc.ref("sh:maxCount")} 1`);
      if (a.required) prop.push(`${doc.ref("sh:minCount")} 1`);
      if (values.length) prop.push(`${doc.ref("sh:in")} ${doc.list(values.map((v) => attributeValue(doc, a, String(v).trim())))}`);
      const expect = [a.required ? "required" : "optional", a.multiple ? "repeatable" : "single", (a.datatype || "xsd:string")].join(", ");
      prop.push(`${doc.ref("sh:message")} ${doc.lit(`${P}:${a.id} is ${expect}` + (values.length ? `, one of: ${values.join(", ")}` : "") + ".", lang)}`);
      doc.add(doc.ref(`${a.id}AttributeShape`, SH), [
        ["a", doc.ref("sh:NodeShape")],
        [doc.ref("sh:targetClass"), domain.map((d) => doc.ref(d, P))],
        [doc.ref("sh:property"), `[ ${prop.join(" ;\n\t\t\t")} ]`],
      ]);
    }

    // Element shapes over direct predicates.
    const sources = new Set();
    for (const r of constrained) for (const key of project.rules[r.id]) sources.add(core.splitPair(key)[0]);
    const allSources = new Set(core.concreteElements(project));
    for (const s of sources) allSources.add(s);
    for (const s of Array.from(allSources).sort()) {
      const props = [];
      const byPredicate = new Map();
      for (const r of constrained) {
        const pred = r.predicate || core.suggestPredicate(r.id);
        if (!byPredicate.has(pred)) byPredicate.set(pred, new Set());
        for (const [src, t] of project.rules[r.id].map(core.splitPair)) if (src === s) byPredicate.get(pred).add(t);
      }
      for (const [pred, targetSet] of byPredicate) {
        const targets = Array.from(targetSet).sort();
        const msg = doc.lit(`${label(s)} cannot use ${P}:${pred} to connect to this target element type.`, lang);
        if (!targets.length) {
          props.push(`[ ${doc.ref("sh:path")} ${doc.ref(pred, P)} ;\n\t\t\t${doc.ref("sh:maxCount")} 0 ;\n\t\t\t${doc.ref("sh:message")} ${msg} ]`);
        } else {
          const ors = targets.map((t) => `[ ${doc.ref("sh:class")} ${doc.ref(t, P)} ]`);
          props.push(`[ ${doc.ref("sh:path")} ${doc.ref(pred, P)} ;\n\t\t\t${doc.ref("sh:or")} ${doc.list(ors)} ;\n\t\t\t${doc.ref("sh:message")} ${msg} ]`);
        }
      }
      if (!props.length) continue;
      doc.add(doc.ref(`${localName(s)}RelShape`, SH), [
        ["a", doc.ref("sh:NodeShape")],
        [doc.ref("sh:targetClass"), doc.ref(s, P)],
        [doc.ref("sh:property"), props],
      ]);
    }
    return doc.render();
  }

  // ---------------------------------------------------------------- taxonomy

  function buildTaxonomy(project) {
    const m = project.meta;
    const P = m.prefix;
    const T = P + "tax";
    const ns = core.namespaces(project);
    const lang = m.lang || "en";
    const doc = new TurtleDoc(ns, generatedBy(project, "concept classification"));
    const cats = project.taxonomy.categories;
    const tops = cats.filter((c) => !c.parent);
    const schemeLabel = project.taxonomy.label || `${m.title} Concept Scheme`;

    ontologyHeader(doc, project, ns[T], "Taxonomy", {
      scheme: true,
      nsUri: ns[T],
      nsPrefix: T,
      description: `Classification of the ${m.title} model concepts${project.proposalOrders.length ? ", and the orders in which a modelling tool proposes its relationship types" : ""}.`,
      more: [
        [doc.ref("skos:prefLabel"), doc.lit(schemeLabel, lang)],
        [doc.ref("skos:hasTopConcept"), tops.map((c) => doc.ref(c.id, T))],
      ],
    });

    const members = new Map(cats.map((c) => [c.id, []]));
    for (const e of project.elements) for (const c of e.categories) if (members.has(c)) members.get(c).push(e.id);
    for (const r of project.relationships) for (const c of r.categories) if (members.has(c)) members.get(c).push(r.id);

    for (const c of cats) {
      const children = cats.filter((x) => x.parent === c.id).map((x) => doc.ref(x.id, T));
      doc.add(doc.ref(c.id, T), [
        ["a", doc.ref("skos:Concept")],
        [doc.ref("skos:prefLabel"), doc.lit(c.label || core.humanize(c.id), lang)],
        [doc.ref("skos:definition"), text(doc, c.definition, lang)],
        [doc.ref("skos:inScheme"), doc.ref(`${T}:`)],
        [doc.ref("skos:topConceptOf"), c.parent ? null : doc.ref(`${T}:`)],
        [doc.ref("skos:broader"), c.parent ? doc.ref(c.parent, T) : null],
        [doc.ref("skos:narrower"), children.concat(members.get(c.id).map((id) => doc.ref(id, P)))],
      ]);
    }

    // Proposal orders (SReq 4.2, SD-4): ordered collections of relationship types, named from the manifest with
    // arch:relationshipProposalOrder. A scoped one names the types it applies to with domain/rangeIncludes.
    for (const o of proposalOrdersToWrite(project)) {
      const scoped = o.domain.length || o.range.length;
      doc.add(doc.ref(o.id, T), [
        ["a", doc.ref("skos:OrderedCollection")],
        [doc.ref("skos:prefLabel"), doc.lit(o.label || (scoped ? core.humanize(o.id) : `${m.title} relationship proposal order`), lang)],
        [doc.ref("skos:definition"), doc.lit(o.definition || (scoped
          ? "The order in which a modelling tool proposes relationship types between elements of the types it names."
          : "The order in which a modelling tool proposes relationship types when two elements are connected."), lang)],
        [doc.ref("skos:scopeNote"), text(doc, o.scopeNote, lang)],
        [doc.ref("arch:domainIncludes"), o.domain.map((d) => doc.ref(d, P))],
        [doc.ref("arch:rangeIncludes"), o.range.map((d) => doc.ref(d, P))],
        [doc.ref("skos:memberList"), doc.list(o.members.map((id) => doc.ref(id, P)))],
      ]);
    }
    return doc.render();
  }

  /** The proposal orders worth writing: those that list a relationship type the project defines. */
  function proposalOrdersToWrite(project) {
    const rels = new Set(project.relationships.map((r) => r.id));
    return project.proposalOrders
      .map((o) => Object.assign({}, o, { members: o.members.filter((id) => rels.has(id)) }))
      .filter((o) => o.id && o.members.length);
  }

  // ---------------------------------------------------------------- viewpoints

  function buildViewpoints(project) {
    const m = project.meta;
    const P = m.prefix;
    const V = P + "vp";
    const ns = core.namespaces(project);
    const lang = m.lang || "en";
    const doc = new TurtleDoc(ns, generatedBy(project, "viewpoint library"));
    ontologyHeader(doc, project, ns[V], "Viewpoints", {
      imports: [doc.ref("arch:"), doc.ref(`${P}:`)],
      nsUri: ns[V],
      nsPrefix: V,
      description: `The ${m.title} viewpoints as arch:Viewpoint individuals, with the concepts each admits (arch:includesConcept), its stakeholders, the concerns it frames and its purposes, grouped in a SKOS viewpoint catalog.`,
    });

    const cats = project.viewpointCategories;
    const tops = cats.filter((c) => !c.parent);
    doc.add(doc.ref("ViewpointCatalog", V), [
      ["a", doc.ref("skos:ConceptScheme")],
      [doc.ref("skos:prefLabel"), doc.lit(`${m.title} Viewpoint Catalog`, lang)],
      [doc.ref("dct:description"), doc.lit(`The ${m.title} viewpoints, grouped by category.`, lang)],
      [doc.ref("skos:hasTopConcept"), tops.map((c) => doc.ref(c.id, V))],
    ]);
    const vpRef = (id) => doc.ref(id, V);
    for (const c of cats) {
      const narrower = cats.filter((x) => x.parent === c.id).map((x) => x.id)
        .concat(project.viewpoints.filter((v) => v.categories.includes(c.id)).map((v) => v.id));
      doc.add(vpRef(c.id), [
        ["a", doc.ref("skos:Concept")],
        [doc.ref("skos:prefLabel"), doc.lit(c.label || core.humanize(c.id), lang)],
        [doc.ref("skos:definition"), text(doc, c.definition, lang)],
        [doc.ref("skos:topConceptOf"), c.parent ? null : vpRef("ViewpointCatalog")],
        [doc.ref("skos:broader"), c.parent ? vpRef(c.parent) : null],
        [doc.ref("skos:inScheme"), vpRef("ViewpointCatalog")],
        [doc.ref("skos:narrower"), narrower.map(vpRef)],
      ]);
    }

    for (const p of project.purposes) {
      doc.add(vpRef(p.id), [
        ["a", doc.ref("arch:Purpose")],
        [doc.ref("skos:prefLabel"), doc.lit(p.label || core.humanize(p.id), lang)],
        [doc.ref("skos:definition"), text(doc, p.definition, lang)],
      ]);
    }
    for (const c of project.concerns) {
      doc.add(vpRef(c.id), [
        ["a", doc.ref("arch:Concern")],
        [doc.ref("skos:prefLabel"), doc.lit(c.label || core.humanize(c.id), lang)],
        [doc.ref("skos:definition"), text(doc, c.definition, lang)],
      ]);
    }
    for (const s of project.stakeholders) {
      doc.add(vpRef(s.id), [
        ["a", doc.ref("arch:Stakeholder")],
        [doc.ref("skos:prefLabel"), doc.lit(s.label || core.humanize(s.id), lang)],
        [doc.ref("skos:definition"), text(doc, s.definition, lang)],
        [doc.ref("arch:stakeholderHasConcern"), s.concerns.map(vpRef)],
      ]);
    }
    for (const v of project.viewpoints) {
      doc.add(vpRef(v.id), [
        ["a", doc.ref("arch:Viewpoint")],
        [doc.ref("skos:prefLabel"), doc.lit(v.label || core.humanize(v.id), lang)],
        [doc.ref("skos:definition"), text(doc, v.definition, lang)],
        [doc.ref("arch:includesConcept"), v.concepts.map((c) => doc.ref(c, P))],
        [doc.ref("arch:targetsStakeholder"), v.stakeholders.map(vpRef)],
        [doc.ref("arch:viewpointFramesConcern"), v.concerns.map(vpRef)],
        [doc.ref("arch:viewpointHasPurpose"), v.purposes.map(vpRef)],
        [doc.ref("arch:viewType"), v.viewTypes.map((t) => doc.ref(`arch:${t}`))],
        [doc.ref("skos:inScheme"), vpRef("ViewpointCatalog")],
        [doc.ref("skos:broader"), v.categories.map(vpRef)],
      ]);
    }
    return doc.render();
  }

  // ---------------------------------------------------------------- notation

  /**
   * The notation set in core-vis terms (SReq 6, SD-2, SD-3): one arch-vis:VisualNotation per concrete element type
   * and per relationship type that has a notation, each with an arch-vis:Style carrying everything visual — the
   * shape type and colours of an element; the line style, both line ends and colour of a relationship. Own shapes
   * are declared first, as arch-vis:ShapeTypes with a core fallback and path templates.
   */
  function buildNotation(project) {
    const m = project.meta;
    const P = m.prefix;
    const N = P + "not";
    const ns = core.namespaces(project);
    const lang = m.lang || "en";
    const doc = new TurtleDoc(ns, generatedBy(project, "notation set"));
    ontologyHeader(doc, project, ns[N], "Notation", {
      imports: [doc.ref("arch:"), doc.ref("arch-vis:"), doc.ref(`${P}:`)],
      nsUri: ns[N],
      nsPrefix: N,
      description: `The default visual notation of the ${m.title} concepts, for palette generation and diagram rendering.`,
    });
    const setRef = doc.ref(core.notationSetName(project), N);
    doc.add(setRef, [
      ["a", doc.ref("arch-vis:NotationSet")],
      [doc.ref("skos:prefLabel"), doc.lit(`${m.title} Standard Notation`, lang)],
    ]);
    const coreShape = (name) => doc.ref(`arch-vis:${core.CORE_SHAPES[name] || "Rectangle"}`);

    for (const s of core.ownShapesInUse(project)) {
      doc.add(doc.ref(s.id, N), [
        ["a", doc.ref("arch-vis:ShapeType")],
        [doc.ref("skos:prefLabel"), doc.lit(s.label || core.humanize(s.id), lang)],
        [doc.ref("skos:definition"), text(doc, s.definition, lang)],
        [doc.ref("arch-vis:fallbackShape"), coreShape(s.fallback || "rectangle")],
        [doc.ref("arch-vis:shapeVariables"), s.variables ? doc.lit(s.variables) : null],
        [doc.ref("arch-vis:outlinePath"), s.outline ? doc.lit(s.outline) : null],
        [doc.ref("arch-vis:detailPath"), s.detail ? doc.lit(s.detail) : null],
        [doc.ref("arch-vis:contentBox"), s.contentBox ? doc.lit(s.contentBox) : null],
        [doc.ref("arch-vis:labelBox"), s.labelBox ? doc.lit(s.labelBox) : null],
      ]);
    }

    const styleNode = (parts) => `[ ${[`a ${doc.ref("arch-vis:Style")}`].concat(parts.filter(Boolean)).join(" ;\n\t\t")} ]`;
    const colour = (prop, value) => (value ? `${doc.ref(`arch-vis:${prop}`)} ${doc.lit(value)}` : null);

    for (const e of project.elements) {
      const n = e.notation || {};
      if (e.abstract || !(n.shape || n.fill || n.stroke || n.font)) continue;
      const shape = core.resolveShape(project, n.shape);
      const shapeRef = !shape ? coreShape("rectangle") : shape.kind === "core" ? doc.ref(`arch-vis:${shape.local}`) : doc.ref(shape.id, N);
      doc.add(doc.ref(`${e.id}Notation`, N), [
        ["a", doc.ref("arch-vis:VisualNotation")],
        [doc.ref("arch-vis:notationFor"), doc.ref(e.id, P)],
        [doc.ref("arch-vis:inNotationSet"), setRef],
        [doc.ref("arch-vis:defaultStyle"), styleNode([
          `${doc.ref("arch-vis:shapeType")} ${shapeRef}`,
          colour("fillColor", n.fill), colour("lineColor", n.stroke), colour("fontColor", n.font),
        ])],
      ]);
    }
    for (const r of project.relationships) {
      const s = r.style || {};
      if (!(s.line || s.source || s.target || s.stroke)) continue;
      doc.add(doc.ref(`${r.id}Notation`, N), [
        ["a", doc.ref("arch-vis:VisualNotation")],
        [doc.ref("arch-vis:notationFor"), doc.ref(r.id, P)],
        [doc.ref("arch-vis:inNotationSet"), setRef],
        [doc.ref("arch-vis:defaultStyle"), styleNode([
          `${doc.ref("arch-vis:lineStyle")} ${doc.ref(`arch-vis:${core.LINE_STYLE_IRIS[s.line] || "SolidLine"}`)}`,
          `${doc.ref("arch-vis:sourceDecor")} ${doc.ref(`arch-vis:${core.DECORATION_IRIS[s.source] || "NoDecoration"}`)}`,
          `${doc.ref("arch-vis:targetDecor")} ${doc.ref(`arch-vis:${core.DECORATION_IRIS[s.target] || "OpenArrowhead"}`)}`,
          colour("lineColor", s.stroke),
        ])],
      ]);
    }
    return doc.render();
  }

  // ---------------------------------------------------------------- manifest

  function buildManifest(project) {
    const m = project.meta;
    const P = m.prefix;
    const MM = P + "mm";
    const ns = core.namespaces(project);
    const lang = m.lang || "en";
    const a = m.assets;
    const doc = new TurtleDoc(ns, generatedBy(project, "arch:Metamodel manifest"));
    ontologyHeader(doc, project, ns[MM], "Metamodel", {
      nsUri: ns[MM],
      nsPrefix: MM,
      description: `The manifest of the ${m.title} metamodel: it names every document that makes up the modeling language.`,
    });
    const files = [`model concepts (${core.fileNames(project).onto})`];
    if (a.shapes) files.push("SHACL shapes");
    if (a.taxonomy) files.push("SKOS taxonomy");
    if (a.viewpoints) files.push("viewpoints");
    if (a.notation) files.push("notation set");
    const ref = (r, dflt) => doc.ref(r, dflt);
    doc.add(doc.ref(m.name, MM), [
      ["a", doc.ref("arch:Metamodel")],
      [doc.ref("skos:prefLabel"), doc.lit(`${m.title} Metamodel`, lang)],
      [doc.ref("dct:description"), doc.lit(`The complete ${m.title} metamodel definition, aggregating the ${files.join(", ")}.` + (m.description ? `\n\n${m.description}` : ""), lang)],
      [doc.ref("owl:versionInfo"), m.languageVersion ? doc.lit(m.languageVersion, lang) : null],
      [doc.ref("skos:scopeNote"), m.languageVersion && m.version ? doc.lit(`owl:versionInfo "${m.languageVersion}" is the language version — what a model conforms to. ${m.version} on the document headers is the documents' own version.`, lang) : null],
      [doc.ref("arch:basedOnFramework"), doc.ref(`${m.name}Framework`, MM)],
      [doc.ref("arch:modelConcepts"), doc.ref(`${P}:`)],
      [doc.ref("arch:formalRules"), a.shapes ? doc.ref(`${P}sh:`) : null],
      [doc.ref("arch:conceptClassification"), a.taxonomy ? doc.ref(`${P}tax:`) : null],
      // The orders live in the taxonomy document (SReq 1.4, SD-4).
      [doc.ref("arch:relationshipProposalOrder"), a.taxonomy ? proposalOrdersToWrite(project).map((o) => doc.ref(o.id, `${P}tax`)) : null],
      [doc.ref("arch:architectureViewpoints"), a.viewpoints ? doc.ref(`${P}vp:`) : null],
      [doc.ref("arch:viewpointLibrary"), a.viewpoints ? doc.ref("ViewpointCatalog", `${P}vp`) : null],
      [doc.ref("arch:notationSet"), a.notation ? doc.ref(core.notationSetName(project), `${P}not`) : null],
      [doc.ref("arch:metamodelIdentifiesStakeholder"), m.manifestStakeholders.map((s) => ref(s, "archvp"))],
      [doc.ref("arch:metamodelIdentifiesConsideration"), m.manifestConcerns.map((s) => ref(s, "archvp"))],
    ]);
    doc.add(doc.ref(`${m.name}Framework`, MM), [
      ["a", doc.ref("arch:Framework")],
      [doc.ref("skos:prefLabel"), doc.lit(m.frameworkLabel || m.title, lang)],
    ]);
    return doc.render();
  }

  // ---------------------------------------------------------------- README

  function buildReadme(project) {
    const m = project.meta;
    const f = core.fileNames(project);
    const ns = core.namespaces(project);
    const rows = [
      ["Model concepts (OWL)", f.onto, ns[m.prefix], "arch:modelConcepts", true],
      ["Formal rules (SHACL)", f.shapes, ns[m.prefix + "sh"], "arch:formalRules", m.assets.shapes],
      ["Concept classification (SKOS)", f.taxonomy, ns[m.prefix + "tax"], "arch:conceptClassification", m.assets.taxonomy],
      ["Viewpoints", f.viewpoints, ns[m.prefix + "vp"], "arch:architectureViewpoints, arch:viewpointLibrary", m.assets.viewpoints],
      ["Notation set", f.notation, ns[m.prefix + "not"], "arch:notationSet", m.assets.notation],
      ["Metamodel manifest", f.manifest, ns[m.prefix + "mm"] + m.name, "(entry point)", true],
    ].filter((r) => r[4]);
    const counts = [
      `${project.elements.filter((e) => !e.abstract).length} concrete element types`,
      `${project.elements.filter((e) => e.abstract).length} abstract element types`,
      `${project.relationships.length} relationship types`,
      `${project.attributes.length} attributes`,
      `${Object.values(project.rules).reduce((n, l) => n + l.length, 0)} relationship rules`,
      `${proposalOrdersToWrite(project).length} relationship proposal orders`,
      `${project.viewpoints.length} viewpoints`,
    ];
    return [
      `# ${m.title} — Linked.Archi semantic asset set`,
      "",
      m.description || "",
      "",
      `Version ${m.version} (language version ${m.languageVersion}), status: ${m.status}.`,
      "",
      counts.map((c) => `- ${c}`).join("\n"),
      "",
      "| Asset | File | Namespace / IRI | Manifest property |",
      "|---|---|---|---|",
      rows.map((r) => `| ${r[0]} | \`${r[1]}\` | \`${r[2]}\` | ${r[3]} |`).join("\n"),
      "",
      "## Publishing",
      "",
      `Serve each document at its namespace without the fragment (for example \`${ns[m.prefix].replace(/#$/, "")}\`),`,
      "with content negotiation for `text/turtle`, as meta.linked.archi does for the published languages.",
      "",
      "## Using it in la-gram",
      "",
      "Published at its IRIs, the set loads in la-gram by its metamodel IRI",
      `(\`${ns[m.prefix + "mm"]}${m.name}\`). Before that, upload the documents with`,
      "*Metamodels › Upload metamodel or asset file…*, one at a time: every other document first, the manifest",
      `(\`${f.manifest}\`) last.`,
      "",
      "## Using it with linked-archi-apm",
      "",
      "```bash",
      `la-profile derive ${m.slug} --metamodel ${f.manifest} --notation ${m.prefix} -o profiles/${m.slug}.yaml`,
      `la-validate run --data model.trig --shapes ${f.shapes}`,
      "```",
      "",
      `The editable source is \`${f.project}\`: open it in Linked.Archi Metamodel Studio to change the metamodel and regenerate these files.`,
      "",
    ].join("\n");
  }

  // ---------------------------------------------------------------- entry point

  /** project -> [{name, content, kind}] in publication order. */
  function generate(input) {
    const project = core.normalize(JSON.parse(JSON.stringify(input)));
    const f = core.fileNames(project);
    const a = project.meta.assets;
    const out = [{ kind: "onto", name: f.onto, content: buildOntology(project) }];
    if (a.shapes) out.push({ kind: "shapes", name: f.shapes, content: buildShapes(project) });
    if (a.taxonomy) out.push({ kind: "taxonomy", name: f.taxonomy, content: buildTaxonomy(project) });
    if (a.viewpoints) out.push({ kind: "viewpoints", name: f.viewpoints, content: buildViewpoints(project) });
    if (a.notation) out.push({ kind: "notation", name: f.notation, content: buildNotation(project) });
    out.push({ kind: "manifest", name: f.manifest, content: buildManifest(project) });
    out.push({ kind: "readme", name: f.readme, content: buildReadme(project) });
    out.push({ kind: "project", name: f.project, content: JSON.stringify(project, null, 2) + "\n" });
    return out;
  }

  return {
    generate, buildOntology, buildShapes, buildTaxonomy, buildViewpoints, buildNotation,
    buildManifest, buildReadme, TurtleDoc,
  };
});
