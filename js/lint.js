/*
 * Linked.Archi Metamodel Studio — checks.
 *
 * Problems that would make the generated documents wrong ("error"), or a metamodel that is
 * valid RDF but probably not what its author meant ("warning"), or worth a look ("info").
 * Each finding names the tab and item to open, so the UI can jump to it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.LAStudio = Object.assign(root.LAStudio || {}, { lint: factory(root.LAStudio.core) });
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  function lint(project) {
    const out = [];
    const add = (level, tab, id, message) => out.push({ level, tab, id, message });
    const m = project.meta;
    const ns = core.namespaces(project);

    // ---- metadata
    if (!core.PREFIX_NAME.test(m.prefix || "")) add("error", "overview", "", `Prefix "${m.prefix}" is not a valid Turtle prefix (letters, digits, - and _; starts with a letter).`);
    if (core.STD_PREFIXES[m.prefix]) add("error", "overview", "", `Prefix "${m.prefix}" is reserved for ${core.STD_PREFIXES[m.prefix]}.`);
    if (!/^https?:\/\/[^\s#]+\/$/.test(m.baseIri || "")) add("error", "overview", "", "Base IRI must be an http(s) IRI ending in \"/\" with no \"#\" (the documents live at <base>onto#, <base>shapes#, …).");
    if (/\.example\.|example\.(org|com|net)/.test(m.baseIri || "")) add("info", "overview", "", "The base IRI is a placeholder (example.org). Set the IRI the documents will be published at.");
    if (!core.LOCAL_NAME.test(m.name || "")) add("error", "overview", "", `Metamodel name "${m.name}" must be a local name (letters, digits, - and _).`);
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(m.slug || "")) add("error", "overview", "", "File slug must be lower case letters, digits, '.' and '-'.");
    if (!m.title) add("warning", "overview", "", "The metamodel has no title.");
    if (!m.description) add("info", "overview", "", "Add a description: it becomes dct:description on every document.");
    for (const d of ["created", "modified"]) if (m[d] && !/^\d{4}-\d{2}-\d{2}$/.test(m[d])) add("error", "overview", "", `${d} must be a date (YYYY-MM-DD).`);
    for (const imp of m.imports || []) {
      if (!core.PREFIX_NAME.test(imp.prefix || "")) add("error", "overview", "", `Import prefix "${imp.prefix}" is invalid.`);
      if (!/^https?:\/\/.+[#/]$/.test(imp.namespace || "")) add("error", "overview", "", `Import ${imp.prefix}: namespace must be an IRI ending in # or /.`);
      if (imp.prefix in core.STD_PREFIXES || [m.prefix, m.prefix + "sh", m.prefix + "tax", m.prefix + "vp", m.prefix + "not", m.prefix + "mm"].includes(imp.prefix)) add("error", "overview", "", `Import prefix "${imp.prefix}" clashes with a prefix the generator uses.`);
    }

    // ---- id uniqueness and syntax, per namespace
    for (const scope of Object.keys(core.SCOPES)) {
      const seen = new Map();
      for (const id of core.idsInScope(project, scope)) seen.set(id, (seen.get(id) || 0) + 1);
      for (const [id, n] of seen) if (n > 1) add("error", tabForScope(scope), id, `"${id}" is used ${n} times in the ${scope} namespace; ids must be unique there.`);
    }
    const checkId = (tab, item, what) => {
      if (!core.LOCAL_NAME.test(item.id || "")) add("error", tab, item.id, `${what} id "${item.id}" is not a valid local name.`);
    };

    // ---- references resolve
    const idx = core.conceptIndex(project);
    const knownPrefix = (ref) => !core.isCurie(ref) || ref.split(":")[0] in ns;
    const checkRef = (tab, id, ref, what, kinds) => {
      if (/^https?:\/\//.test(ref)) return;
      if (!knownPrefix(ref)) { add("error", tab, id, `${what} "${ref}" uses an undeclared prefix. Add it under Imports.`); return; }
      const hit = idx.get(ref);
      if (!hit && !core.isCurie(ref)) add("error", tab, id, `${what} "${ref}" is not defined.`);
      else if (hit && kinds && !kinds.includes(hit.kind)) add("warning", tab, id, `${what} "${ref}" is a ${hit.kind}.`);
    };

    // ---- elements
    const elemIds = new Set(project.elements.map((e) => e.id));
    for (const e of project.elements) {
      checkId("elements", e, "Element");
      if (!e.label) add("info", "elements", e.id, `${e.id} has no label; "${core.humanize(e.id)}" will be used.`);
      if (!e.definition && !e.abstract) add("warning", "elements", e.id, `${e.id} has no definition.`);
      for (const p of e.parents) checkRef("elements", e.id, p, `Parent of ${e.id}`, ["element"]);
      if (e.parents.includes(e.id) || core.ancestors(project, e.id).has(e.id)) add("error", "elements", e.id, `${e.id} inherits from itself.`);
      for (const c of e.categories) if (!project.taxonomy.categories.some((x) => x.id === c)) add("error", "elements", e.id, `${e.id}: taxonomy category "${c}" does not exist.`);
      if (!e.abstract && m.assets.taxonomy && project.taxonomy.categories.length && !e.categories.length) add("info", "elements", e.id, `${e.id} is in no taxonomy category, so it will not appear in the palette groups.`);
      if (e.abstract && !Array.from(core.descendants(project, e.id)).some((d) => d !== e.id)) add("info", "elements", e.id, `${e.id} is abstract and nothing specializes it.`);
      const n = e.notation || {};
      for (const k of ["fill", "stroke", "font"]) if (n[k] && !/^#[0-9a-fA-F]{6}$/.test(n[k])) add("warning", "elements", e.id, `${e.id}: ${k} colour "${n[k]}" is not #rrggbb.`);
      if (n.shape && !core.resolveShape(project, n.shape)) add("error", "elements", e.id, `${e.id}: shape "${n.shape}" is neither a core-vis shape nor an own shape.`);
    }

    // ---- own shapes (SReq 6.5)
    const notationNames = new Set([core.notationSetName(project)]
      .concat(project.elements.map((e) => `${e.id}Notation`), project.relationships.map((r) => `${r.id}Notation`)));
    if (m.notationSetName && !core.LOCAL_NAME.test(m.notationSetName)) add("error", "notation", "", `Notation set name "${m.notationSetName}" is not a valid local name.`);
    for (const s of project.shapes) {
      checkId("notation", s, "Shape");
      if (!s.outline) add("error", "notation", s.id, `Shape ${s.id} has no outline path, so nothing can draw it.`);
      if (s.fallback && !core.CORE_SHAPES[s.fallback]) add("error", "notation", s.id, `Shape ${s.id}: fallback "${s.fallback}" is not a core-vis shape.`);
      if (notationNames.has(s.id)) add("error", "notation", s.id, `Shape ${s.id} has the IRI of a notation descriptor or of the notation set.`);
    }

    // ---- relationships
    const relById = new Map(project.relationships.map((r) => [r.id, r]));
    const predicates = new Map();
    for (const r of project.relationships) {
      checkId("relationships", r, "Relationship");
      const pred = r.predicate || core.suggestPredicate(r.id);
      if (!core.LOCAL_NAME.test(pred)) add("error", "relationships", r.id, `${r.id}: predicate "${pred}" is not a valid local name.`);
      if (elemIds.has(pred)) add("error", "relationships", r.id, `${r.id}: predicate "${pred}" is also an element id.`);
      if (!predicates.has(pred)) predicates.set(pred, []);
      predicates.get(pred).push(r.id);
      if (!r.notation) add("info", "relationships", r.id, `${r.id} has no notation letter (skos:notation), which relationship tables use.`);
      if (!r.definition) add("warning", "relationships", r.id, `${r.id} has no definition.`);
      if (r.parent && !relById.has(r.parent) && !core.isCurie(r.parent)) add("error", "relationships", r.id, `${r.id}: parent relationship "${r.parent}" does not exist.`);
      for (const d of r.domain) checkRef("relationships", r.id, d, `Domain of ${r.id}`, ["element"]);
      for (const d of r.range) checkRef("relationships", r.id, d, `Range of ${r.id}`, ["element"]);
      for (const c of r.categories) if (!project.taxonomy.categories.some((x) => x.id === c)) add("error", "relationships", r.id, `${r.id}: taxonomy category "${c}" does not exist.`);
      const st = r.style || {};
      if (st.line && !core.LINE_STYLES.includes(st.line)) add("error", "relationships", r.id, `${r.id}: line style "${st.line}" is not one of ${core.LINE_STYLES.join(", ")}.`);
      for (const end of ["source", "target"]) if (st[end] && !core.DECORATIONS.includes(st[end])) add("error", "relationships", r.id, `${r.id}: ${end} end "${st[end]}" is not one of ${core.DECORATIONS.join(", ")}.`);
      if (st.stroke && !/^#[0-9a-fA-F]{6}$/.test(st.stroke)) add("warning", "relationships", r.id, `${r.id}: colour "${st.stroke}" is not #rrggbb.`);
      // Child rules should stay inside the parent's (an instance of the child is one of the parent).
      const parent = relById.get(r.parent);
      if (parent && (project.rules[parent.id] || []).length && (project.rules[r.id] || []).length) {
        const allowed = new Set(project.rules[parent.id]);
        const extra = project.rules[r.id].filter((k) => !allowed.has(k));
        if (extra.length) add("warning", "rules", r.id, `${r.id} allows ${extra.length} pair(s) its parent ${parent.id} does not (e.g. ${extra[0].replace("|", " → ")}). The parent's shape also applies to ${r.id} when the ontology is loaded with the data.`);
      }
    }
    for (const [pred, rels] of predicates) {
      if (rels.length < 2) continue;
      const roots = rels.filter((id) => !rels.includes((relById.get(id) || {}).parent));
      if (roots.length > 1) add("error", "relationships", rels[0], `Predicate "${pred}" is shared by ${rels.join(", ")}, which are not subtypes of one another.`);
    }
    for (const a of project.attributes) {
      checkId("attributes", a, "Attribute");
      if (elemIds.has(a.id) || relById.has(a.id) || predicates.has(a.id)) add("error", "attributes", a.id, `Attribute "${a.id}" clashes with an element, relationship or predicate.`);
      for (const d of a.domain) checkRef("attributes", a.id, d, `Domain of ${a.id}`, ["element", "relationship"]);
      if (!core.isCurie(a.datatype || "") || !knownPrefix(a.datatype)) add("error", "attributes", a.id, `${a.id}: datatype "${a.datatype}" must be a CURIE such as xsd:string.`);
    }

    // ---- rules
    const concrete = new Set(core.concreteElements(project));
    let ruleCount = 0;
    for (const [relId, pairs] of Object.entries(project.rules)) {
      if (!relById.has(relId)) { add("error", "rules", relId, `Rules exist for unknown relationship "${relId}".`); continue; }
      for (const key of pairs) {
        ruleCount++;
        const [s, t] = core.splitPair(key);
        for (const x of [s, t]) if (!idx.has(x) && !core.isCurie(x)) add("error", "rules", relId, `${relId}: rule ${s} → ${t} names "${x}", which is not defined.`);
        if (!concrete.has(s) || !concrete.has(t)) add("info", "rules", relId, `${relId}: rule ${s} → ${t} uses an abstract or external type; it is kept but not shown in the matrix.`);
      }
    }
    if (m.assets.shapes && project.relationships.length && !ruleCount) add("warning", "rules", "", "No relationship rules: the SHACL shapes will not constrain anything. Fill in the matrix, or seed it from the domain/range guidance.");
    const unconstrained = project.relationships.filter((r) => !(project.rules[r.id] || []).length);
    if (ruleCount && unconstrained.length) add("info", "rules", "", `Not constrained by any rule: ${unconstrained.map((r) => r.id).join(", ")}.`);

    // ---- taxonomy
    for (const c of project.taxonomy.categories) {
      checkId("taxonomy", c, "Category");
      if (c.parent && !project.taxonomy.categories.some((x) => x.id === c.parent)) add("error", "taxonomy", c.id, `Category ${c.id}: parent "${c.parent}" does not exist.`);
      if (hasCycle(project.taxonomy.categories, c.id)) add("error", "taxonomy", c.id, `Category ${c.id} is its own ancestor.`);
    }
    // ---- proposal orders (SReq 4.2–4.3)
    const general = project.proposalOrders.filter((o) => !o.domain.length && !o.range.length);
    if (general.length > 1) add("warning", "taxonomy", general[1].id, `${general.length} proposal orders apply to every pair (${general.map((o) => o.id).join(", ")}); a metamodel has one general order, and the others should name the types they apply to.`);
    if (project.proposalOrders.length && !m.assets.taxonomy) add("warning", "taxonomy", "", "Proposal orders are written in the taxonomy document, which is not shipped: they will be left out.");
    for (const o of project.proposalOrders) {
      checkId("taxonomy", o, "Proposal order");
      if (!o.members.length) add("warning", "taxonomy", o.id, `Proposal order ${o.id} lists no relationship type; it is not written.`);
      for (const id of o.members) if (!relById.has(id)) add("error", "taxonomy", o.id, `Proposal order ${o.id} names "${id}", which is not a relationship type.`);
      const repeated = o.members.filter((id, i) => o.members.indexOf(id) !== i);
      if (repeated.length) add("warning", "taxonomy", o.id, `Proposal order ${o.id} lists ${repeated[0]} more than once.`);
      for (const d of o.domain) checkRef("taxonomy", o.id, d, `Source type of ${o.id}`, ["element"]);
      for (const d of o.range) checkRef("taxonomy", o.id, d, `Target type of ${o.id}`, ["element"]);
    }

    // ---- orders, the palette grouping and the diagram group order (SReq 4.4–4.5, SD-14)
    const catIds = new Set(project.taxonomy.categories.map((c) => c.id));
    const collections = [["paletteGrouping", "The palette grouping"], ["diagramGroupOrder", "The diagram group order"]]
      .map(([key, what]) => [project.taxonomy[key] || { id: "", members: [] }, what]).filter(([c]) => (c.members || []).length);
    const taxNames = new Set(core.idsInScope(project, "taxonomy").concat(collections.map(([c]) => c.id)));
    for (const c of project.taxonomy.categories) {
      if (!core.narrowerOrder(project, c.id).explicit) continue;
      const name = core.orderName(c.id);
      if (taxNames.has(name)) add("error", "taxonomy", c.id, `The order of ${c.id} is written as ${name}, which is also the id of something else in the taxonomy. Rename one of them.`);
    }
    for (const [coll, what] of collections) {
      if (!core.LOCAL_NAME.test(coll.id || "")) add("error", "taxonomy", "", `${what}'s id "${coll.id}" is not a valid local name.`);
      else if (core.idsInScope(project, "taxonomy").includes(coll.id)) add("error", "taxonomy", "", `${what} is written as ${coll.id}, which is also the id of a category or a proposal order.`);
      for (const id of coll.members) if (!catIds.has(id)) add("error", "taxonomy", "", `${what} names "${id}", which is not a category.`);
      const repeated = coll.members.filter((id, i) => coll.members.indexOf(id) !== i);
      if (repeated.length) add("warning", "taxonomy", "", `${what} lists ${repeated[0]} more than once.`);
      if (!m.assets.taxonomy) add("warning", "taxonomy", "", `${what} is written in the taxonomy document, which is not shipped: it will be left out.`);
    }
    if (collections.length === 2 && collections[0][0].id === collections[1][0].id) add("error", "taxonomy", "", `The palette grouping and the diagram group order are both written as ${collections[0][0].id}.`);

    // ---- viewpoints
    const vpIds = (list) => new Set(list.map((x) => x.id));
    const stakeholders = vpIds(project.stakeholders), concerns = vpIds(project.concerns), purposes = vpIds(project.purposes), vcats = vpIds(project.viewpointCategories);
    const vpRef = (set, ref) => set.has(ref) || core.isCurie(ref) || /^https?:/.test(ref);
    for (const c of project.viewpointCategories) {
      checkId("viewpoints", c, "Viewpoint category");
      if (c.parent && !vcats.has(c.parent)) add("error", "viewpoints", c.id, `Viewpoint category ${c.id}: parent "${c.parent}" does not exist.`);
      if (hasCycle(project.viewpointCategories, c.id)) add("error", "viewpoints", c.id, `Viewpoint category ${c.id} is its own ancestor.`);
    }
    for (const v of project.viewpoints) {
      checkId("viewpoints", v, "Viewpoint");
      if (!v.concepts.length) add("warning", "viewpoints", v.id, `Viewpoint ${v.id} includes no concepts.`);
      for (const c of v.concepts) checkRef("viewpoints", v.id, c, `Concept in ${v.id}`);
      for (const s of v.stakeholders) if (!vpRef(stakeholders, s)) add("error", "viewpoints", v.id, `${v.id}: stakeholder "${s}" is not defined.`);
      for (const s of v.concerns) if (!vpRef(concerns, s)) add("error", "viewpoints", v.id, `${v.id}: concern "${s}" is not defined.`);
      for (const s of v.purposes) if (!vpRef(purposes, s)) add("error", "viewpoints", v.id, `${v.id}: purpose "${s}" is not defined.`);
      for (const s of v.categories) if (!vcats.has(s)) add("error", "viewpoints", v.id, `${v.id}: category "${s}" is not defined.`);
      if (!v.stakeholders.length) add("info", "viewpoints", v.id, `Viewpoint ${v.id} targets no stakeholder.`);
      if (!v.concerns.length) add("info", "viewpoints", v.id, `Viewpoint ${v.id} frames no concern.`);
      if (!v.viewTypes.length) add("info", "viewpoints", v.id, `Viewpoint ${v.id} has no view type (Diagram, Catalog, Matrix).`);
    }
    for (const list of [project.stakeholders, project.concerns, project.purposes]) for (const x of list) checkId("stakeholders", x, "Item");
    for (const s of project.stakeholders) for (const c of s.concerns) if (!vpRef(concerns, c)) add("error", "stakeholders", s.id, `${s.id}: concern "${c}" is not defined.`);
    if (m.assets.viewpoints && !project.viewpoints.length) add("info", "viewpoints", "", "No viewpoints yet: a metamodel usually ships at least one.");

    // ---- external concepts
    for (const x of project.externalConcepts) {
      if (!core.isCurie(x.ref || "")) add("error", "overview", x.ref, `External concept "${x.ref}" must be a CURIE (prefix:Name).`);
      else if (!knownPrefix(x.ref)) add("error", "overview", x.ref, `External concept "${x.ref}" uses an undeclared prefix.`);
    }

    const order = { error: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  function tabForScope(scope) {
    return { concept: "elements", taxonomy: "taxonomy", viewpoint: "viewpoints", notation: "notation" }[scope];
  }

  function hasCycle(list, id) {
    const byId = new Map(list.map((x) => [x.id, x]));
    const seen = new Set();
    let cur = byId.get(id);
    while (cur && cur.parent) {
      if (cur.parent === id || seen.has(cur.parent)) return true;
      seen.add(cur.parent);
      cur = byId.get(cur.parent);
    }
    return false;
  }

  return { lint };
});
