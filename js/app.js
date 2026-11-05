/*
 * Linked.Archi Metamodel Studio — user interface.
 *
 * Plain DOM, no framework and no build: open index.html from disk or any static server.
 * State is one project object (see core.js). Text fields write into it as you type;
 * structural edits (add, delete, rename, pickers) re-render the page. Everything is kept
 * in this browser's localStorage between visits and can be saved as a .studio.json file.
 */
(function () {
  "use strict";

  const { core, generator, importer, lint: linter, zip, templates } = window.LAStudio;
  const STORE_KEY = "la-metamodel-studio:project";
  const THEME_KEY = "la-metamodel-studio:theme";

  // ------------------------------------------------------------------ state

  let project = loadStored() || startFrom("cloudplatform");
  const ui = {
    tab: "overview",
    sel: {},           // tab -> selected id
    filter: {},        // tab -> search text
    matrixRel: "",     // "" = all relationships
    matrixRowCat: "",
    matrixColCat: "",
    outFile: "",
  };
  const history = { undo: [], redo: [] };
  let pendingSnapshot = null;
  let issues = [];

  function startFrom(key) {
    const t = templates[key] || templates.blank;
    const p = core.normalize(JSON.parse(JSON.stringify(t.project)));
    const today = new Date().toISOString().slice(0, 10);
    if (!p.meta.created) p.meta.created = today;
    if (!p.meta.modified) p.meta.modified = today;
    return p;
  }

  function loadStored() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? core.normalize(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer); saveTimer = null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(project)); } catch (e) { /* storage unavailable: keep working */ }
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }
  window.addEventListener("pagehide", () => { if (saveTimer) saveNow(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveTimer) saveNow(); });

  /** Record an undo point, run a structural change, re-render. */
  function mutate(fn, opts) {
    history.undo.push(JSON.stringify(project));
    if (history.undo.length > 100) history.undo.shift();
    history.redo = [];
    fn(project);
    changed(opts && opts.render === false ? false : true);
  }

  /** Text inputs: one undo point per focus, model updated on every keystroke. */
  function bindText(el, get, set, opts) {
    el.value = get() == null ? "" : get();
    el.addEventListener("focus", () => { pendingSnapshot = JSON.stringify(project); });
    el.addEventListener("input", () => {
      if (pendingSnapshot) {
        history.undo.push(pendingSnapshot); history.redo = []; pendingSnapshot = null;
      }
      set(el.value);
      changed(false);
      if (opts && opts.onInput) opts.onInput(el.value);
    });
    if (opts && opts.onCommit) el.addEventListener("change", () => opts.onCommit(el.value));
    return el;
  }

  function changed(rerender) {
    persist();
    issues = linter.lint(project);
    if (rerender) render();
    else { renderSidebar(); renderTitle(); }
  }

  function undo() {
    if (!history.undo.length) return;
    history.redo.push(JSON.stringify(project));
    project = core.normalize(JSON.parse(history.undo.pop()));
    changed(true);
  }
  function redo() {
    if (!history.redo.length) return;
    history.undo.push(JSON.stringify(project));
    project = core.normalize(JSON.parse(history.redo.pop()));
    changed(true);
  }

  // ------------------------------------------------------------------ DOM helpers

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  const $ = (id) => document.getElementById(id);

  function field(label, input, hint, cls) {
    return h("label", { class: "field " + (cls || "") }, h("span", {}, label), input, hint ? h("small", {}, hint) : null);
  }
  function textInput(get, set, attrs, opts) {
    return bindText(h("input", Object.assign({ type: "text" }, attrs || {})), get, set, opts);
  }
  function textArea(get, set, rows, attrs) {
    return bindText(h("textarea", Object.assign({ rows: rows || 3 }, attrs || {})), get, set);
  }
  function checkbox(label, get, set) {
    const input = h("input", { type: "checkbox" });
    input.checked = !!get();
    input.addEventListener("change", () => mutate(() => set(input.checked)));
    return h("label", { class: "check" }, input, label);
  }
  function select(options, get, set, attrs) {
    const el = h("select", attrs || {}, options.map((o) => h("option", { value: o.value }, o.label)));
    el.value = get() || "";
    el.addEventListener("change", () => mutate(() => set(el.value)));
    return el;
  }

  let listCounter = 0;
  /**
   * values: string[]; options: [{value, label, hint}]; free: accept anything matching
   * `free` (a RegExp) that is not an option. Edits go through mutate().
   */
  function chips(get, set, options, opts) {
    opts = opts || {};
    const box = h("div", { class: "chips" });
    const listId = "dl" + (++listCounter);
    const byValue = new Map(options.map((o) => [o.value, o]));
    for (const v of get()) {
      const o = byValue.get(v);
      box.appendChild(h("span", { class: "chip" + (core.isCurie(v) ? " ext" : ""), title: v },
        o && o.label && o.label !== v ? [o.label, " ", h("code", {}, v)] : v,
        h("button", { class: "x", type: "button", title: "Remove", "aria-label": `Remove ${v}`, onclick: () => mutate(() => set(get().filter((x) => x !== v))) }, "×")));
    }
    const input = h("input", { list: listId, placeholder: opts.placeholder || "Add…", "aria-label": opts.label || "Add value" });
    const dl = h("datalist", { id: listId }, options.filter((o) => !get().includes(o.value)).map((o) => h("option", { value: o.value }, o.label && o.label !== o.value ? o.label : null)));
    const accept = () => {
      const raw = input.value.trim();
      if (!raw) return;
      let value = byValue.has(raw) ? raw : (options.find((o) => (o.label || "").toLowerCase() === raw.toLowerCase()) || {}).value;
      if (!value && opts.free && opts.free.test(raw)) value = raw;
      if (!value) { toast(`"${raw}" is not one of the choices${opts.free ? " (or a prefix:Name reference)" : ""}.`); return; }
      if (!get().includes(value)) mutate(() => set(get().concat([value])));
      input.value = "";
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); accept(); } });
    input.addEventListener("change", () => { if (byValue.has(input.value.trim())) accept(); });
    box.appendChild(input);
    box.appendChild(dl);
    return box;
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function uniqueId(base, scope) {
    const taken = new Set(core.idsInScope(project, scope));
    let id = base, n = 2;
    while (taken.has(id)) id = base + n++;
    return id;
  }

  // ------------------------------------------------------------------ option lists

  function elementOptions(includeAbstract) {
    const out = [];
    for (const e of project.elements) if (includeAbstract || !e.abstract) out.push({ value: e.id, label: (e.label || core.humanize(e.id)) + (e.abstract ? " (abstract)" : "") });
    for (const x of project.externalConcepts) if ((x.kind || "element") === "element" && (includeAbstract || !x.abstract)) out.push({ value: x.ref, label: x.label || x.ref });
    if (includeAbstract) out.push({ value: "arch:Element", label: "Element (core)" });
    return out;
  }
  function relationshipOptions() {
    return project.relationships.map((r) => ({ value: r.id, label: r.label || core.humanize(r.id) }));
  }
  const curieRe = /^[A-Za-z][A-Za-z0-9_-]*:[A-Za-z_][A-Za-z0-9_.-]*$/;
  const vpOptions = (list) => list.map((x) => ({ value: x.id, label: x.label || core.humanize(x.id) }));
  const catOptions = () => project.taxonomy.categories.map((c) => ({ value: c.id, label: catPath(c) }));
  function catPath(c) {
    const byId = new Map(project.taxonomy.categories.map((x) => [x.id, x]));
    const parts = [c.label || core.humanize(c.id)];
    let cur = c, guard = 0;
    while (cur.parent && byId.has(cur.parent) && guard++ < 20) { cur = byId.get(cur.parent); parts.unshift(cur.label || core.humanize(cur.id)); }
    return parts.join(" › ");
  }
  const labelOf = (ref) => { const hit = core.conceptIndex(project).get(ref); return hit ? hit.label : ref; };

  // ------------------------------------------------------------------ chrome

  const TABS = [
    { id: "overview", label: "Overview", icon: "◇" },
    { group: "Model concepts" },
    { id: "elements", label: "Elements", icon: "▢", count: () => project.elements.length },
    { id: "relationships", label: "Relationships", icon: "↗", count: () => project.relationships.length },
    { id: "attributes", label: "Attributes", icon: "≔", count: () => project.attributes.length },
    { id: "rules", label: "Relationship rules", icon: "▦", count: () => Object.values(project.rules).reduce((n, l) => n + l.length, 0) },
    { group: "Classification & views" },
    { id: "taxonomy", label: "Taxonomy", icon: "☰", count: () => project.taxonomy.categories.length },
    { id: "viewpoints", label: "Viewpoints", icon: "◎", count: () => project.viewpoints.length },
    { id: "stakeholders", label: "Stakeholders & concerns", icon: "☺", count: () => project.stakeholders.length + project.concerns.length },
    { id: "notation", label: "Notation", icon: "✎" },
    { group: "Publish" },
    { id: "output", label: "Generated files", icon: "⇩" },
    { id: "issues", label: "Checks", icon: "✓" },
  ];

  function renderSidebar() {
    const sb = $("sidebar");
    sb.textContent = "";
    const errors = issues.filter((i) => i.level === "error").length;
    const warnings = issues.filter((i) => i.level === "warning").length;
    for (const t of TABS) {
      if (t.group) { sb.appendChild(h("div", { class: "nav-group" }, t.group)); continue; }
      let extra = t.count ? h("span", { class: "count" }, t.count()) : null;
      if (t.id === "issues" && (errors || warnings)) extra = h("span", { class: "badge" + (errors ? "" : " warn") }, errors || warnings);
      sb.appendChild(h("button", {
        class: "nav-item" + (ui.tab === t.id ? " active" : ""), "aria-current": ui.tab === t.id ? "page" : null,
        onclick: () => go(t.id),
      }, h("span", { "aria-hidden": "true" }, t.icon), t.label, extra));
    }
  }
  function renderTitle() {
    const m = project.meta;
    $("projectTitle").textContent = `${m.title || "Untitled"} · ${m.prefix}: · v${m.version}`;
    document.title = `${m.title || "Untitled"} — Metamodel Studio`;
    $("btnUndo").disabled = !history.undo.length;
    $("btnRedo").disabled = !history.redo.length;
  }
  function go(tab, id) {
    ui.tab = tab;
    if (id !== undefined) ui.sel[tab] = id;
    render();
    $("main").scrollTop = 0;
  }

  function render() {
    closePopover();
    renderSidebar();
    renderTitle();
    const main = $("main");
    main.textContent = "";
    const view = VIEWS[ui.tab] || VIEWS.overview;
    append(main, [view()]);
  }

  function pageHead(title, text, ...actions) {
    return h("div", { class: "page-head" }, h("div", { class: "grow" }, h("h1", {}, title), text ? h("p", {}, text) : null), actions);
  }

  function inlineIssues(tab, id) {
    const mine = issues.filter((i) => i.tab === tab && i.id === id && i.level !== "info");
    if (!mine.length) return null;
    return h("div", { class: "inline-issues" }, mine.map((i) => h("div", { class: "issue " + i.level }, h("span", { class: "lvl" }, i.level), h("span", {}, i.message))));
  }

  // ------------------------------------------------------------------ overview

  function viewOverview() {
    const m = project.meta;
    const ns = core.namespaces(project);
    const f = core.fileNames(project);
    const stat = (n, label, tab) => h("div", { class: "stat", role: "button", tabindex: "0", onclick: () => go(tab), onkeydown: (e) => { if (e.key === "Enter") go(tab); } }, h("b", {}, n), h("span", {}, label));
    const assets = [
      ["onto", "Model concepts", "arch:modelConcepts", f.onto, ns[m.prefix], true],
      ["shapes", "Formal rules (SHACL)", "arch:formalRules", f.shapes, ns[m.prefix + "sh"], m.assets.shapes],
      ["taxonomy", "Concept classification", "arch:conceptClassification", f.taxonomy, ns[m.prefix + "tax"], m.assets.taxonomy],
      ["viewpoints", "Viewpoints & catalog", "arch:architectureViewpoints · arch:viewpointLibrary", f.viewpoints, ns[m.prefix + "vp"], m.assets.viewpoints],
      ["notation", "Notation set", "arch:notationSet", f.notation, ns[m.prefix + "not"], m.assets.notation],
    ];
    const setMeta = (k) => (v) => { m[k] = v; };
    return h("div", {},
      pageHead("Overview", "A metamodel is published as a set of semantic assets tied together by an arch:Metamodel manifest — the same structure as the ArchiMate, BPMN, C4, Backstage and LeanIX metamodels on meta.linked.archi."),
      h("div", { class: "card" },
        h("div", { class: "stats" },
          stat(project.elements.filter((e) => !e.abstract).length, "concrete elements", "elements"),
          stat(project.elements.filter((e) => e.abstract).length, "abstract elements", "elements"),
          stat(project.relationships.length, "relationships", "relationships"),
          stat(project.attributes.length, "attributes", "attributes"),
          stat(Object.values(project.rules).reduce((n, l) => n + l.length, 0), "rules", "rules"),
          stat(project.taxonomy.categories.length, "categories", "taxonomy"),
          stat(project.viewpoints.length, "viewpoints", "viewpoints"),
          stat(issues.filter((i) => i.level === "error").length, "errors", "issues"))),
      h("div", { class: "card" },
        h("h3", {}, "Identity"),
        h("div", { class: "grid3" },
          field("Title", textInput(() => m.title, setMeta("title")), "e.g. ArchiMate 4.0"),
          field("Metamodel name", textInput(() => m.name, setMeta("name"), { class: "mono" }), `Manifest IRI: ${m.prefix}mm:${m.name}`),
          field("Namespace prefix", textInput(() => m.prefix, (v) => { m.prefix = v.trim(); }, { class: "mono" }, { onCommit: () => render() }), "Short; also prefixes sh, tax, vp, not, mm"),
          field("Base IRI", textInput(() => m.baseIri, (v) => { m.baseIri = v.trim(); }, { class: "mono" }, { onCommit: () => render() }), "Documents live at <base>onto#, <base>shapes#, …", "span2"),
          field("File slug", textInput(() => m.slug, (v) => { m.slug = v.trim(); }, { class: "mono" }), `${m.slug}-onto.ttl, …`),
          field("Document version", textInput(() => m.version, setMeta("version")), "owl:versionInfo / versionIRI of each document"),
          field("Language version", textInput(() => m.languageVersion, setMeta("languageVersion")), "owl:versionInfo on the arch:Metamodel — what models conform to"),
          field("Status", select(["draft", "stable", "testing", "deprecated"].map((s) => ({ value: s, label: s })), () => m.status, setMeta("status"))),
          field("Creator", textInput(() => m.creator, setMeta("creator"))),
          field("Publisher", textInput(() => m.publisher, setMeta("publisher"))),
          field("License", textInput(() => m.license, setMeta("license")), "IRI or text"),
          field("Created", textInput(() => m.created, setMeta("created"), { type: "date" })),
          field("Modified", textInput(() => m.modified, setMeta("modified"), { type: "date" })),
          field("Framework label", textInput(() => m.frameworkLabel, setMeta("frameworkLabel")), "arch:basedOnFramework"),
          field("Prior version IRI", textInput(() => m.priorVersion, setMeta("priorVersion"), { class: "mono" }), "owl:priorVersion", "span3"),
          field("Description", textArea(() => m.description, setMeta("description"), 4), null, "span3"),
          field("Scope note", textArea(() => m.scopeNote, setMeta("scopeNote"), 2), null, "span3"),
          field("History note", textArea(() => m.historyNote, setMeta("historyNote"), 2), null, "span3"),
          field("Change note", textArea(() => m.changeNote, setMeta("changeNote"), 2), null, "span3"))),
      h("div", { class: "card" },
        h("h3", {}, "Semantic assets"),
        h("p", { class: "muted small" }, `The manifest ${m.prefix}mm:${m.name} points at each document it ships. Untick an asset to leave it out.`),
        h("div", { class: "asset-map" }, assets.map(([key, label, prop, file, nsIri, on]) => h("div", { class: "asset" + (on ? "" : " off") },
          h("div", { class: "row" }, h("strong", {}, label), h("span", { class: "spacer" }),
            key === "onto" ? h("span", { class: "pill accent" }, "required") : checkbox("include", () => m.assets[key], (v) => { m.assets[key] = v; })),
          h("div", { class: "prop" }, prop), h("div", { class: "file" }, file), h("div", { class: "ns" }, nsIri))))),
      h("div", { class: "card" },
        h("h3", {}, "Manifest: stakeholders & considerations"),
        h("p", { class: "muted small" }, "arch:metamodelIdentifiesStakeholder / arch:metamodelIdentifiesConsideration — shared terms from core-viewpoints (archvp:)."),
        h("div", { class: "grid2" },
          field("Stakeholders", h("div", { class: "checks" }, core.CORE_STAKEHOLDERS.map((s) => checkbox(core.humanize(s), () => m.manifestStakeholders.includes(s), (v) => { m.manifestStakeholders = v ? m.manifestStakeholders.concat([s]) : m.manifestStakeholders.filter((x) => x !== s); })))),
          field("Considerations", h("div", { class: "checks" }, core.CORE_CONCERNS.map((s) => checkbox(core.humanize(s), () => m.manifestConcerns.includes(s), (v) => { m.manifestConcerns = v ? m.manifestConcerns.concat([s]) : m.manifestConcerns.filter((x) => x !== s); })))))),
      viewImports());
  }

  function viewImports() {
    const m = project.meta;
    const known = core.KNOWN_LANGUAGES.filter((l) => !m.imports.some((i) => i.prefix === l.prefix));
    return h("div", { class: "card" },
      h("h3", {}, "Extending other languages"),
      h("p", { class: "muted small" }, "Import a published language to specialize its element types (e.g. a Microservice that is an am4:ApplicationComponent). Declare the external types you refer to, so they can be parents, rule endpoints and viewpoint members."),
      h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Prefix"), h("th", {}, "Namespace"), h("th", {}))),
        h("tbody", {}, m.imports.map((imp, i) => h("tr", {},
          h("td", { style: { width: "120px" } }, textInput(() => imp.prefix, (v) => { imp.prefix = v.trim(); }, { class: "mono" })),
          h("td", {}, textInput(() => imp.namespace, (v) => { imp.namespace = v.trim(); }, { class: "mono" })),
          h("td", { style: { width: "40px" } }, h("button", { class: "btn small ghost", title: "Remove", onclick: () => mutate(() => m.imports.splice(i, 1)) }, "×")))))),
      h("div", { class: "row", style: { marginTop: "8px" } },
        known.map((l) => h("button", { class: "btn small", onclick: () => mutate(() => m.imports.push({ prefix: l.prefix, namespace: l.namespace })) }, `+ ${l.label} (${l.prefix}:)`)),
        h("button", { class: "btn small", onclick: () => mutate(() => m.imports.push({ prefix: "ex", namespace: "https://example.org/onto#" })) }, "+ Other…")),
      h("h3", { style: { marginTop: "16px" } }, "External concepts"),
      h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Reference"), h("th", {}, "Label"), h("th", {}, "Kind"), h("th", {}, "Abstract"), h("th", {}))),
        h("tbody", {}, project.externalConcepts.map((x) => h("tr", {},
          h("td", {}, textInput(() => x.ref, (v) => { x.ref = v.trim(); }, { class: "mono", placeholder: "am4:Node" }, {
            onCommit: () => mutate(() => {}),
          })),
          h("td", {}, textInput(() => x.label, (v) => { x.label = v; })),
          h("td", { style: { width: "130px" } }, select([{ value: "element", label: "element" }, { value: "relationship", label: "relationship" }], () => x.kind || "element", (v) => { x.kind = v; })),
          h("td", { style: { width: "80px" } }, checkbox("", () => x.abstract, (v) => { x.abstract = v; })),
          h("td", { style: { width: "40px" } }, h("button", { class: "btn small ghost", title: "Remove", onclick: () => mutate(() => core.removeExternal(project, x.ref)) }, "×")))))),
      h("div", { class: "row", style: { marginTop: "8px" } },
        h("button", { class: "btn small", onclick: () => mutate(() => project.externalConcepts.push({ ref: (m.imports[0] ? m.imports[0].prefix : "am4") + ":NewType", label: "", kind: "element", parents: [] })) }, "+ External concept")));
  }

  // ------------------------------------------------------------------ master/detail scaffold

  function masterDetail(tab, opts) {
    const sel = ui.sel[tab];
    const search = h("input", { type: "search", placeholder: "Filter…", value: ui.filter[tab] || "", "aria-label": "Filter list" });
    const body = h("div", { class: "list-body" });
    const fill = () => {
      body.textContent = "";
      const rows = opts.rows((ui.filter[tab] || "").toLowerCase());
      if (!rows.length) body.appendChild(h("div", { class: "empty" }, opts.emptyText || "Nothing here yet."));
      for (const r of rows) {
        if (r.group) { body.appendChild(h("div", { class: "li-group" }, r.group)); continue; }
        body.appendChild(h("button", {
          class: "li" + (r.id === sel ? " sel" : ""), style: r.depth ? { paddingLeft: 8 + r.depth * 14 + "px" } : null,
          onclick: () => go(tab, r.id),
        }, r.swatch ? h("span", { class: "sw", style: { background: r.swatch } }) : null,
        h("span", { class: r.abstract ? "abs" : "" }, r.label), r.tag ? h("span", { class: "tag" }, r.tag) : null));
      }
    };
    search.addEventListener("input", () => { ui.filter[tab] = search.value; fill(); });
    fill();
    const detail = opts.detail(sel);
    return h("div", { class: "md" },
      h("div", { class: "list" }, h("div", { class: "list-tools" }, search, opts.tools), body),
      h("div", {}, detail || h("div", { class: "card empty" }, opts.pickText || "Select an item on the left, or add a new one.")));
  }

  function matches(filter, ...texts) {
    return !filter || texts.some((t) => String(t || "").toLowerCase().includes(filter));
  }

  function idField(tab, scope, item, what) {
    return field(`${what} id (IRI local name)`, textInput(() => item.id, () => {}, { class: "mono" }, {
      onCommit: (v) => {
        const next = v.trim();
        if (next === item.id) return;
        if (!core.LOCAL_NAME.test(next)) { toast("An id must start with a letter or _ and use letters, digits, - or _."); render(); return; }
        if (core.idsInScope(project, scope).includes(next)) { toast(`"${next}" is already used.`); render(); return; }
        const old = item.id;
        mutate(() => { core.renameRef(project, old, next, scope); item.id = next; ui.sel[tab] = next; });
      },
    }), "Renaming updates every reference.");
  }

  function deleteButton(tab, listName, item, what) {
    return h("button", { class: "btn danger small", onclick: () => {
      if (!confirm(`Delete ${what} "${item.id}" and every reference to it?`)) return;
      mutate(() => { core.removeRef(project, item.id, listName); ui.sel[tab] = null; });
    } }, "Delete");
  }

  // ------------------------------------------------------------------ elements

  function elementRows(filter) {
    const rows = [];
    const byParent = new Map();
    const local = new Set(project.elements.map((e) => e.id));
    for (const e of project.elements) {
      const lp = e.parents.filter((p) => local.has(p));
      const key = lp.length ? lp[0] : "";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(e);
    }
    const walk = (key, depth, seen) => {
      for (const e of (byParent.get(key) || []).sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id))) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (matches(filter, e.id, e.label, ...e.altLabels)) {
          rows.push({ id: e.id, label: e.label || core.humanize(e.id), abstract: e.abstract, depth: filter ? 0 : depth, swatch: e.abstract ? null : (e.notation && e.notation.fill) || "transparent", tag: e.abstract ? "abstract" : null });
        }
        walk(e.id, depth + 1, seen);
      }
    };
    walk("", 0, new Set());
    return rows;
  }

  function viewElements() {
    const tools = [
      h("button", { class: "btn small", onclick: () => addElement(false) }, "+ Element"),
      h("button", { class: "btn small", onclick: () => addElement(true) }, "+ Abstract"),
    ];
    return h("div", {},
      pageHead("Element types", "Each becomes an owl:Class under arch:Element. Abstract types (arch:isAbstractClass) organize the hierarchy and can be used in domain/range guidance; concrete types appear in the palette, rules and viewpoints."),
      masterDetail("elements", { rows: elementRows, tools, detail: elementDetail, emptyText: "No element types yet." }));
  }

  function addElement(abstract) {
    const id = uniqueId(abstract ? "NewAbstractElement" : "NewElement", "concept");
    const sel = project.elements.find((e) => e.id === ui.sel.elements);
    mutate(() => {
      project.elements.push({ id, label: core.humanize(id), altLabels: [], definition: "", scopeNote: "", example: "", changeNote: "", parents: sel && sel.abstract ? [sel.id] : [], abstract, categories: [], notation: abstract ? {} : { fill: "#e8f1fb", stroke: "#333333", shape: "rectangle" } });
      ui.sel.elements = id;
    });
  }

  function elementDetail(id) {
    const e = project.elements.find((x) => x.id === id);
    if (!e) return null;
    const usedRules = Object.entries(project.rules).reduce((n, [, l]) => n + l.filter((k) => core.splitPair(k).includes(e.id)).length, 0);
    const usedViews = project.viewpoints.filter((v) => v.concepts.includes(e.id)).length;
    const parentOpts = elementOptions(true).filter((o) => o.value !== e.id && !core.descendants(project, e.id).has(o.value));
    const n = e.notation || (e.notation = {});
    const outgoing = project.relationships.map((r) => {
      const targets = (project.rules[r.id] || []).map(core.splitPair).filter(([s]) => s === e.id).map(([, t]) => labelOf(t));
      return targets.length ? h("div", { class: "small" }, h("b", {}, r.label || r.id), " → ", targets.join(", ")) : null;
    }).filter(Boolean);
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, e.label || core.humanize(e.id)), h("span", { class: "pill" }, `${project.meta.prefix}:${e.id}`),
        e.abstract ? h("span", { class: "pill" }, "abstract") : null,
        h("button", { class: "btn small", onclick: () => duplicateElement(e) }, "Duplicate"), deleteButton("elements", "elements", e, "element")),
      inlineIssues("elements", e.id),
      h("div", { class: "grid2" },
        idField("elements", "concept", e, "Element"),
        field("Label (skos:prefLabel)", textInput(() => e.label, (v) => { e.label = v; })),
        field("Specializes (rdfs:subClassOf)", chips(() => e.parents, (v) => { e.parents = v; }, parentOpts, { free: curieRe, placeholder: "Add parent type…" }), "Empty means arch:Element. External types (am4:…) are allowed.", "span2"),
        field("Alternative labels (skos:altLabel)", chips(() => e.altLabels, (v) => { e.altLabels = v; }, [], { free: /.+/, placeholder: "Type and press Enter…" })),
        field("Taxonomy categories", chips(() => e.categories, (v) => { e.categories = v; }, catOptions(), { placeholder: "Add category…" })),
        h("div", { class: "field span2" }, checkbox("Abstract — classification only, not placed in models (arch:isAbstractClass)", () => e.abstract, (v) => { e.abstract = v; })),
        field("Definition (skos:definition)", textArea(() => e.definition, (v) => { e.definition = v; }, 3), null, "span2"),
        field("Scope note", textArea(() => e.scopeNote, (v) => { e.scopeNote = v; }, 2)),
        field("Example", textArea(() => e.example, (v) => { e.example = v; }, 2)),
        field("Change note", textArea(() => e.changeNote, (v) => { e.changeNote = v; }, 2), null, "span2")),
      e.abstract ? null : h("div", { style: { marginTop: "14px" } },
        h("h3", {}, "Notation"),
        h("div", { class: "row" },
          field("Fill", colorInput(() => n.fill, (v) => { n.fill = v; })),
          field("Line", colorInput(() => n.stroke, (v) => { n.stroke = v; })),
          field("Shape", select(core.SHAPES.map((s) => ({ value: s, label: s })), () => n.shape || "rectangle", (v) => { n.shape = v; })),
          h("div", { style: { marginLeft: "12px" } }, shapeSvg(n, 90, 54, e.label || e.id)))),
      h("div", { style: { marginTop: "14px" } },
        h("h3", {}, "Usage"),
        h("p", { class: "small muted" }, `Appears in ${usedRules} relationship rule(s) and ${usedViews} viewpoint(s).`,
          " ", h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); ui.matrixRowCat = ""; go("rules"); } }, "Open the rules matrix")),
        outgoing.length ? outgoing : null));
  }

  function duplicateElement(e) {
    const id = uniqueId(e.id + "Copy", "concept");
    mutate(() => {
      const copy = JSON.parse(JSON.stringify(e));
      copy.id = id; copy.label = (e.label || core.humanize(e.id)) + " copy";
      project.elements.push(copy);
      for (const rel of Object.keys(project.rules)) {
        const extra = [];
        for (const k of project.rules[rel]) {
          const [s, t] = core.splitPair(k);
          if (s === e.id) extra.push(core.pairKey(id, t === e.id ? id : t));
          if (t === e.id && s !== e.id) extra.push(core.pairKey(s, id));
        }
        project.rules[rel] = Array.from(new Set(project.rules[rel].concat(extra))).sort();
      }
      ui.sel.elements = id;
    });
  }

  function colorInput(get, set) {
    const c = h("input", { type: "color", value: get() || "#ffffff" });
    c.addEventListener("focus", () => { pendingSnapshot = JSON.stringify(project); });
    c.addEventListener("input", () => { if (pendingSnapshot) { history.undo.push(pendingSnapshot); history.redo = []; pendingSnapshot = null; } set(c.value); changed(false); });
    c.addEventListener("change", () => render());
    return c;
  }

  function shapeSvg(n, w, hgt, label) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", w); svg.setAttribute("height", hgt); svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
    const fill = n.fill || "#ffffff", stroke = n.stroke || "#333333";
    const mk = (tag, attrs) => { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); svg.appendChild(el); return el; };
    const common = { fill, stroke, "stroke-width": 1.4 };
    const p = 3, W = w - 2 * p, H = hgt - 2 * p;
    switch (n.shape) {
      case "rounded-rectangle": mk("rect", Object.assign({ x: p, y: p, width: W, height: H, rx: 10 }, common)); break;
      case "ellipse": mk("ellipse", Object.assign({ cx: w / 2, cy: hgt / 2, rx: W / 2, ry: H / 2 }, common)); break;
      case "circle": mk("circle", Object.assign({ cx: w / 2, cy: hgt / 2, r: Math.min(W, H) / 2 }, common)); break;
      case "hexagon": mk("polygon", Object.assign({ points: `${p + 12},${p} ${w - p - 12},${p} ${w - p},${hgt / 2} ${w - p - 12},${hgt - p} ${p + 12},${hgt - p} ${p},${hgt / 2}` }, common)); break;
      case "parallelogram": mk("polygon", Object.assign({ points: `${p + 12},${p} ${w - p},${p} ${w - p - 12},${hgt - p} ${p},${hgt - p}` }, common)); break;
      case "diamond": mk("polygon", Object.assign({ points: `${w / 2},${p} ${w - p},${hgt / 2} ${w / 2},${hgt - p} ${p},${hgt / 2}` }, common)); break;
      case "cylinder":
        mk("path", Object.assign({ d: `M${p},${p + 7} v${H - 14} a${W / 2},7 0 0 0 ${W},0 v${-(H - 14)}` }, common));
        mk("ellipse", Object.assign({ cx: w / 2, cy: p + 7, rx: W / 2, ry: 7 }, common)); break;
      case "folder":
        mk("path", Object.assign({ d: `M${p},${p + 8} h${W} v${H - 8} h${-W} z M${p},${p + 8} v-8 h${W * 0.4} l6,8` }, common)); break;
      default: mk("rect", Object.assign({ x: p, y: p, width: W, height: H, rx: 2 }, common));
    }
    if (label) {
      const t = mk("text", { x: w / 2, y: hgt / 2 + 4, "text-anchor": "middle", "font-size": 10.5, fill: n.font || "#1d2330", "font-family": "system-ui, sans-serif" });
      t.textContent = label.length > 16 ? label.slice(0, 15) + "…" : label;
    }
    return svg;
  }

  // ------------------------------------------------------------------ relationships

  function viewRelationships() {
    const tools = [h("button", { class: "btn small", onclick: addRelationship }, "+ Relationship")];
    return h("div", {},
      pageHead("Relationship types", "Each becomes three terms, as in the published languages: a QualifiedRelationship subclass (the relationship as a resource), its direct predicate (arch:unqualifiedForm) for traversal, and a qualified predicate to navigate to the resource."),
      masterDetail("relationships", {
        rows: (f) => project.relationships.filter((r) => matches(f, r.id, r.label, r.predicate, r.notation)).map((r) => ({
          id: r.id, label: r.label || core.humanize(r.id), depth: r.parent && project.relationships.some((x) => x.id === r.parent) ? 1 : 0,
          tag: [r.notation, r.predicate].filter(Boolean).join(" · "),
        })),
        tools, detail: relationshipDetail, emptyText: "No relationship types yet.",
      }));
  }

  function addRelationship() {
    const id = uniqueId("NewRelationship", "concept");
    mutate(() => {
      project.relationships.push({ id, label: core.humanize(id), predicate: "relatesTo", predicateLabel: "", predicateDefinition: "", notation: "", parent: "", definition: "", scopeNote: "", changeNote: "", domain: [], range: [], categories: [], style: { line: "solid", arrow: "open" } });
      ui.sel.relationships = id;
    });
  }

  function relationshipDetail(id) {
    const r = project.relationships.find((x) => x.id === id);
    if (!r) return null;
    const P = project.meta.prefix;
    const pred = r.predicate || core.suggestPredicate(r.id);
    const s = r.style || (r.style = {});
    const ruleCount = (project.rules[r.id] || []).length;
    const parentOpts = [{ value: "", label: "— none (arch:QualifiedRelationship) —" }].concat(
      project.relationships.filter((x) => x.id !== r.id).map((x) => ({ value: x.id, label: x.label || x.id })));
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, r.label || core.humanize(r.id)),
        r.notation ? h("span", { class: "pill accent mono" }, r.notation) : null,
        deleteButton("relationships", "relationships", r, "relationship")),
      inlineIssues("relationships", r.id),
      h("div", { class: "grid3" },
        idField("relationships", "concept", r, "Class"),
        field("Label", textInput(() => r.label, (v) => { r.label = v; })),
        field("Notation letter (skos:notation)", textInput(() => r.notation, (v) => { r.notation = v.trim(); }, { class: "mono", maxlength: "4" }), "Used in the rules matrix"),
        field("Direct predicate (arch:unqualifiedForm)", textInput(() => r.predicate, (v) => { r.predicate = v.trim(); }, { class: "mono" }), `${P}:${pred}`),
        field("Predicate label", textInput(() => r.predicateLabel, (v) => { r.predicateLabel = v; }), "e.g. Serves"),
        field("Specializes", select(parentOpts, () => r.parent, (v) => { r.parent = v; if (v) { const p = project.relationships.find((x) => x.id === v); if (p && !r.predicate) r.predicate = p.predicate; } }),
          "A subtype keeping the parent's predicate declares no predicate of its own (like ReadAccess → accesses)"),
        field("Domain guidance (arch:domainIncludes)", chips(() => r.domain, (v) => { r.domain = v; }, elementOptions(true), { free: curieRe, placeholder: "Source types…" }), "Guidance, not validation — empty means any element", "span3"),
        field("Range guidance (arch:rangeIncludes)", chips(() => r.range, (v) => { r.range = v; }, elementOptions(true), { free: curieRe, placeholder: "Target types…" }), null, "span3"),
        field("Taxonomy categories", chips(() => r.categories, (v) => { r.categories = v; }, catOptions()), null, "span3"),
        field("Definition", textArea(() => r.definition, (v) => { r.definition = v; }, 3), null, "span3"),
        field("Predicate definition", textArea(() => r.predicateDefinition, (v) => { r.predicateDefinition = v; }, 2), "Defaults to the definition", "span3"),
        field("Scope note", textArea(() => r.scopeNote, (v) => { r.scopeNote = v; }, 2), null, "span2"),
        field("Change note", textArea(() => r.changeNote, (v) => { r.changeNote = v; }, 2))),
      h("div", { style: { marginTop: "14px" } },
        h("h3", {}, "Notation"),
        h("div", { class: "row" },
          field("Line", select(core.LINE_STYLES.map((x) => ({ value: x, label: x })), () => s.line || "solid", (v) => { s.line = v; })),
          field("Arrow head", select(core.ARROW_HEADS.map((x) => ({ value: x, label: x })), () => s.arrow || "open", (v) => { s.arrow = v; })),
          field("Colour", colorInput(() => s.stroke || "#333333", (v) => { s.stroke = v; })),
          lineSvg(s))),
      h("div", { style: { marginTop: "14px" } },
        h("h3", {}, "Rules"),
        h("p", { class: "small" }, ruleCount ? `${ruleCount} allowed source → target pair(s). ` : "No rules: this relationship is not constrained by the SHACL shapes. ",
          h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); ui.matrixRel = r.id; go("rules"); } }, "Edit in the matrix"))));
  }

  function lineSvg(s) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", 130); svg.setAttribute("height", 30); svg.setAttribute("viewBox", "0 0 130 30");
    const color = s.stroke || "currentColor";
    const line = document.createElementNS(ns, "line");
    Object.entries({ x1: 8, y1: 15, x2: 112, y2: 15, stroke: color, "stroke-width": 1.6, "stroke-dasharray": s.line === "dashed" ? "6 4" : s.line === "dotted" ? "1.5 3" : "" }).forEach(([k, v]) => line.setAttribute(k, v));
    svg.appendChild(line);
    const head = document.createElementNS(ns, "path");
    const shapes = {
      open: ["M104,9 L116,15 L104,21", "none"], filled: ["M104,9 L118,15 L104,21 Z", color],
      "hollow-triangle": ["M104,8 L118,15 L104,22 Z", "var(--panel)"], diamond: ["M100,15 L109,10 L118,15 L109,20 Z", "var(--panel)"],
      "filled-diamond": ["M100,15 L109,10 L118,15 L109,20 Z", color], circle: ["M112,15 m-4,0 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0", color], none: ["", "none"],
    };
    const [d, fill] = shapes[s.arrow || "open"] || shapes.open;
    head.setAttribute("d", d); head.setAttribute("fill", fill); head.setAttribute("stroke", color); head.setAttribute("stroke-width", 1.6);
    svg.appendChild(head);
    return svg;
  }

  // ------------------------------------------------------------------ attributes

  function viewAttributes() {
    const tools = [h("button", { class: "btn small", onclick: addAttribute }, "+ Attribute")];
    return h("div", {},
      pageHead("Attributes", "Properties element or relationship instances carry (owl:DatatypeProperty), e.g. a resilience level or an influence strength. The shapes check datatype, cardinality and allowed values."),
      masterDetail("attributes", {
        rows: (f) => project.attributes.filter((a) => matches(f, a.id, a.label)).map((a) => ({ id: a.id, label: a.label || core.humanize(a.id), tag: a.datatype })),
        tools, detail: attributeDetail, emptyText: "No attributes yet.",
      }));
  }

  function addAttribute() {
    const id = uniqueId("newAttribute", "concept");
    mutate(() => {
      project.attributes.push({ id, label: core.humanize(id), definition: "", domain: [], datatype: "xsd:string", values: [], required: false, multiple: false, deprecated: false });
      ui.sel.attributes = id;
    });
  }

  function attributeDetail(id) {
    const a = project.attributes.find((x) => x.id === id);
    if (!a) return null;
    const domainOpts = elementOptions(true).concat(relationshipOptions());
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, a.label || core.humanize(a.id)), h("span", { class: "pill mono" }, a.datatype), deleteButton("attributes", "attributes", a, "attribute")),
      inlineIssues("attributes", a.id),
      h("div", { class: "grid3" },
        idField("attributes", "concept", a, "Property"),
        field("Label", textInput(() => a.label, (v) => { a.label = v; })),
        field("Datatype", select(core.DATATYPES.map((d) => ({ value: d, label: d })), () => a.datatype, (v) => { a.datatype = v; })),
        field("Applies to", chips(() => a.domain, (v) => { a.domain = v; }, domainOpts, { free: curieRe, placeholder: "Element or relationship types…" }), "rdfs:domain (one) or arch:domainIncludes (several); empty = any element", "span3"),
        field("Allowed values (sh:in)", chips(() => a.values, (v) => { a.values = v; }, [], { free: /.+/, placeholder: "Type a value and press Enter…" }), "Leave empty for any value", "span3"),
        h("div", { class: "checks span3" },
          checkbox("Required (sh:minCount 1)", () => a.required, (v) => { a.required = v; }),
          checkbox("Repeatable (no sh:maxCount)", () => a.multiple, (v) => { a.multiple = v; }),
          checkbox("Deprecated (owl:deprecated, not validated)", () => a.deprecated, (v) => { a.deprecated = v; })),
        field("Definition", textArea(() => a.definition, (v) => { a.definition = v; }, 3), null, "span3")));
  }

  // ------------------------------------------------------------------ rules matrix

  function viewRules() {
    const rels = project.relationships;
    if (!rels.length) return h("div", {}, pageHead("Relationship rules", null), h("div", { class: "card empty" }, "Add relationship types first."));
    if (ui.matrixRel && !rels.some((r) => r.id === ui.matrixRel)) ui.matrixRel = "";
    const relSel = select([{ value: "", label: "All relationships (letters)" }].concat(rels.map((r) => ({ value: r.id, label: `${r.notation ? r.notation + " — " : ""}${r.label || r.id}` }))), () => ui.matrixRel, (v) => { ui.matrixRel = v; });
    const catSel = (key) => select([{ value: "", label: "All" }].concat(catOptions()), () => ui[key], (v) => { ui[key] = v; });
    const concrete = core.concreteElements(project);
    const inCat = (cat) => (id) => {
      if (!cat) return true;
      const item = project.elements.find((e) => e.id === id);
      if (!item) return false;
      const sub = new Set([cat]);
      let grew = true;
      while (grew) { grew = false; for (const c of project.taxonomy.categories) if (c.parent && sub.has(c.parent) && !sub.has(c.id)) { sub.add(c.id); grew = true; } }
      return item.categories.some((c) => sub.has(c));
    };
    const rows = concrete.filter(inCat(ui.matrixRowCat));
    const cols = concrete.filter(inCat(ui.matrixColCat));
    const one = ui.matrixRel ? rels.find((r) => r.id === ui.matrixRel) : null;
    const letter = relLetter;
    const sets = new Map(rels.map((r) => [r.id, core.ruleSet(project, r.id)]));

    const cellContent = (s, t) => {
      if (one) return sets.get(one.id).has(core.pairKey(s, t)) ? ["on", letter(one)] : ["", ""];
      const ls = rels.filter((r) => sets.get(r.id).has(core.pairKey(s, t))).map(letter);
      return ls.length ? [ls.length === 1 ? "on" : "multi", ls.join("")] : ["", ""];
    };

    const table = h("table", { class: "matrix", role: "grid" });
    const head = h("tr", {}, h("th", { class: "corner" }, "source ↓  target →"));
    for (const t of cols) {
      head.appendChild(h("th", {}, h("div", { class: "vt", title: one ? `Toggle the whole column for ${one.label || one.id}` : t, onclick: () => one && toggleLine(one.id, rows.map((s) => [s, t])) }, labelOf(t))));
    }
    table.appendChild(h("thead", {}, head));
    const tbody = h("tbody", {});
    for (const s of rows) {
      const tr = h("tr", {}, h("th", { title: one ? `Toggle the whole row for ${one.label || one.id}` : s, onclick: () => one && toggleLine(one.id, cols.map((t) => [s, t])) }, labelOf(s)));
      for (const t of cols) {
        const [cls, txt] = cellContent(s, t);
        const td = h("td", { class: `cell ${cls}${s === t ? " diag" : ""}`, tabindex: "0", title: `${labelOf(s)} → ${labelOf(t)}`, "data-s": s, "data-t": t }, txt);
        td.addEventListener("click", (ev) => cellClick(ev, s, t, one));
        td.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); cellClick(ev, s, t, one); } });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return h("div", {},
      pageHead("Relationship rules", "Which relationship may connect which source type to which target type. Each relationship with at least one rule gets SHACL shapes; one with none is left unconstrained. Click a cell to toggle it; with one relationship selected, click a row or column header to toggle the whole line."),
      h("div", { class: "matrix-tools" },
        field("Relationship", relSel), field("Rows (sources)", catSel("matrixRowCat")), field("Columns (targets)", catSel("matrixColCat")),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small", title: "Allow every source/target pair the domain and range guidance permits", onclick: () => seedFromGuidance(one) }, one ? `Seed ${one.label || one.id} from domain/range` : "Seed all from domain/range"),
        h("button", { class: "btn small", onclick: () => copyRulesFromParent(one), disabled: !(one && one.parent && project.rules[one.parent]) }, "Copy parent's rules"),
        h("button", { class: "btn small danger", onclick: () => clearRules(one) }, one ? "Clear this relationship" : "Clear all")),
      h("div", { class: "legend" }, rels.map((r) => h("span", {}, h("b", {}, letter(r)), " ", r.label || r.id, ` (${(project.rules[r.id] || []).length})`))),
      rows.length && cols.length ? h("div", { class: "matrix-wrap" }, table) : h("div", { class: "card empty" }, "No concrete element types in this selection."));
  }

  /** The notation letter, or the id's capitals (ReadAccess -> RA) so letters do not collide. */
  function relLetter(r) {
    return r.notation || (r.id.match(/[A-Z]/g) || [r.id.charAt(0)]).join("");
  }

  function toggleLine(relId, pairs) {
    const set = core.ruleSet(project, relId);
    const allOn = pairs.every(([s, t]) => set.has(core.pairKey(s, t)));
    mutate(() => { for (const [s, t] of pairs) core.setRule(project, relId, s, t, !allOn); });
  }

  function cellClick(ev, s, t, one) {
    if (one) {
      const on = core.ruleSet(project, one.id).has(core.pairKey(s, t));
      mutate(() => core.setRule(project, one.id, s, t, !on));
      const sel = document.querySelector(`.cell[data-s="${CSS.escape(s)}"][data-t="${CSS.escape(t)}"]`);
      if (sel) sel.focus();
      return;
    }
    openPopover(ev.currentTarget, h("div", {},
      h("h4", {}, `${labelOf(s)} → ${labelOf(t)}`),
      project.relationships.map((r) => {
        const input = h("input", { type: "checkbox" });
        input.checked = core.ruleSet(project, r.id).has(core.pairKey(s, t));
        input.addEventListener("change", () => {
          history.undo.push(JSON.stringify(project)); history.redo = [];
          core.setRule(project, r.id, s, t, input.checked);
          persist(); issues = linter.lint(project);
          const cell = document.querySelector(`.cell[data-s="${CSS.escape(s)}"][data-t="${CSS.escape(t)}"]`);
          if (cell) {
            const ls = project.relationships.filter((x) => core.ruleSet(project, x.id).has(core.pairKey(s, t))).map(relLetter);
            cell.textContent = ls.join("");
            cell.className = `cell ${ls.length ? (ls.length === 1 ? "on" : "multi") : ""}${s === t ? " diag" : ""}`;
          }
          renderSidebar(); renderTitle();
        });
        return h("label", { class: "check", style: { display: "flex", padding: "2px 0" } }, input, h("b", { class: "mono" }, relLetter(r)), " ", r.label || r.id);
      })));
  }

  function seedFromGuidance(one) {
    const rels = one ? [one] : project.relationships;
    const concrete = new Set(core.concreteElements(project));
    const expand = (refs) => {
      const out = new Set();
      for (const ref of refs.length ? refs : ["arch:Element"]) for (const d of core.descendants(project, ref)) if (concrete.has(d)) out.add(d);
      return out;
    };
    let added = 0;
    mutate(() => {
      for (const r of rels) {
        // A subtype with no guidance of its own inherits its parent's.
        const parent = project.relationships.find((x) => x.id === r.parent);
        const dom = r.domain.length ? r.domain : (parent ? parent.domain : []);
        const ran = r.range.length ? r.range : (parent ? parent.range : []);
        for (const s of expand(dom)) for (const t of expand(ran)) {
          if (!core.ruleSet(project, r.id).has(core.pairKey(s, t))) { core.setRule(project, r.id, s, t, true); added++; }
        }
      }
    });
    toast(`Added ${added} rule(s) from the domain/range guidance. Review them: guidance is broader than a specification's tables.`);
  }

  function copyRulesFromParent(one) {
    if (!one || !one.parent) return;
    mutate(() => { project.rules[one.id] = (project.rules[one.parent] || []).slice(); });
  }

  function clearRules(one) {
    if (!confirm(one ? `Remove every rule of ${one.label || one.id}?` : "Remove every relationship rule?")) return;
    mutate(() => { if (one) delete project.rules[one.id]; else project.rules = {}; });
  }

  let popEl = null;
  function openPopover(anchor, content) {
    closePopover();
    popEl = h("div", { class: "popover", role: "dialog" }, content);
    document.body.appendChild(popEl);
    const r = anchor.getBoundingClientRect();
    const pw = popEl.offsetWidth, ph = popEl.offsetHeight;
    popEl.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)) + "px";
    popEl.style.top = (r.bottom + ph + 8 > window.innerHeight ? Math.max(8, r.top - ph - 4) : r.bottom + 4) + "px";
    setTimeout(() => document.addEventListener("mousedown", outside), 0);
  }
  function outside(ev) { if (popEl && !popEl.contains(ev.target)) closePopover(); }
  function closePopover() {
    if (popEl) { popEl.remove(); popEl = null; document.removeEventListener("mousedown", outside); }
  }

  // ------------------------------------------------------------------ taxonomy

  function viewTaxonomy() {
    const tax = project.taxonomy;
    const tree = (parent) => {
      const kids = tax.categories.filter((c) => (c.parent || "") === parent);
      if (!kids.length) return null;
      return h("ul", { class: "tree" }, kids.map((c) => {
        const members = project.elements.filter((e) => e.categories.includes(c.id)).map((e) => e.label || e.id)
          .concat(project.relationships.filter((r) => r.categories.includes(c.id)).map((r) => r.label || r.id));
        return h("li", {},
          h("div", { class: "tree-row" },
            textInput(() => c.label, (v) => { c.label = v; }, { "aria-label": "Category label" }),
            h("code", { class: "muted" }, c.id),
            h("span", { class: "small muted", title: members.join(", ") }, members.length ? `${members.length} member(s)` : ""),
            h("button", { class: "btn small ghost", title: "Add sub-category", onclick: () => addCategory(c.id) }, "+"),
            h("button", { class: "btn small ghost", title: "Edit", onclick: () => go("taxonomy", c.id) }, "✎"),
            h("button", { class: "btn small ghost", title: "Delete", onclick: () => { if (confirm(`Delete category ${c.id}?`)) mutate(() => core.removeRef(project, c.id, "taxonomy.categories")); } }, "×")),
          tree(c.id));
      }));
    };
    const sel = tax.categories.find((c) => c.id === ui.sel.taxonomy);
    const orderList = project.proposalOrder;
    return h("div", {},
      pageHead("Taxonomy", "The SKOS concept scheme that classifies the concepts (arch:conceptClassification) — the groups a modelling tool's palette shows. Assign members here or on each element and relationship."),
      h("div", { class: "grid2" },
        h("div", { class: "card" },
          field("Scheme label", textInput(() => tax.label, (v) => { tax.label = v; }, { placeholder: `${project.meta.title} Concept Scheme` })),
          h("div", { style: { marginTop: "12px" } }, tree("") || h("p", { class: "muted" }, "No categories yet.")),
          h("button", { class: "btn small", style: { marginTop: "8px" }, onclick: () => addCategory("") }, "+ Top-level category")),
        h("div", {},
          sel ? categoryDetail(sel) : h("div", { class: "card empty" }, "Pick a category (✎) to edit its members."),
          h("div", { class: "card" },
            h("h3", {}, "Relationship proposal order"),
            h("p", { class: "small muted" }, "arch:RelationshipProposalOrder — the order a modelling tool proposes relationship types when two elements are connected."),
            h("ol", {}, orderList.map((id, i) => h("li", {}, h("div", { class: "row" },
              h("span", {}, labelOf(id)), h("span", { class: "spacer" }),
              h("button", { class: "btn small ghost", disabled: i === 0, onclick: () => mutate(() => { orderList.splice(i - 1, 0, orderList.splice(i, 1)[0]); }), "aria-label": "Move up" }, "↑"),
              h("button", { class: "btn small ghost", disabled: i === orderList.length - 1, onclick: () => mutate(() => { orderList.splice(i + 1, 0, orderList.splice(i, 1)[0]); }), "aria-label": "Move down" }, "↓"),
              h("button", { class: "btn small ghost", onclick: () => mutate(() => orderList.splice(i, 1)), "aria-label": "Remove" }, "×"))))),
            chips(() => [], (v) => { project.proposalOrder = orderList.concat(v.filter((x) => !orderList.includes(x))); }, relationshipOptions().filter((o) => !orderList.includes(o.value)), { placeholder: "Append relationship…" })))));
  }

  function addCategory(parent) {
    const id = uniqueId("NewCategory", "taxonomy");
    mutate(() => { project.taxonomy.categories.push({ id, label: core.humanize(id), definition: "", parent }); ui.sel.taxonomy = id; });
  }

  function categoryDetail(c) {
    const members = project.elements.filter((e) => e.categories.includes(c.id)).map((e) => e.id)
      .concat(project.relationships.filter((r) => r.categories.includes(c.id)).map((r) => r.id));
    const setMembers = (list) => {
      for (const e of project.elements) e.categories = list.includes(e.id) ? Array.from(new Set(e.categories.concat([c.id]))) : e.categories.filter((x) => x !== c.id);
      for (const r of project.relationships) r.categories = list.includes(r.id) ? Array.from(new Set(r.categories.concat([c.id]))) : r.categories.filter((x) => x !== c.id);
    };
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, c.label || c.id)),
      inlineIssues("taxonomy", c.id),
      h("div", { class: "grid2" },
        idField("taxonomy", "taxonomy", c, "Category"),
        field("Parent", select([{ value: "", label: "— top level —" }].concat(catOptions().filter((o) => o.value !== c.id)), () => c.parent, (v) => { c.parent = v; })),
        field("Definition", textArea(() => c.definition, (v) => { c.definition = v; }, 2), null, "span2"),
        field("Members (skos:narrower)", chips(() => members, setMembers, elementOptions(true).filter((o) => !core.isCurie(o.value)).concat(relationshipOptions())), null, "span2")));
  }

  // ------------------------------------------------------------------ viewpoints

  function viewViewpoints() {
    const tools = [h("button", { class: "btn small", onclick: addViewpoint }, "+ Viewpoint")];
    const catRows = (f) => {
      const rows = [];
      const placed = new Set();
      const walk = (parent, depth) => {
        for (const c of project.viewpointCategories.filter((x) => (x.parent || "") === parent)) {
          const vps = project.viewpoints.filter((v) => v.categories.includes(c.id) && matches(f, v.id, v.label));
          rows.push({ group: "  ".repeat(depth) + (c.label || c.id) });
          for (const v of vps) { rows.push({ id: v.id, label: v.label || core.humanize(v.id), depth: depth + 1, tag: `${v.concepts.length}` }); placed.add(v.id); }
          walk(c.id, depth + 1);
        }
      };
      walk("", 0);
      const rest = project.viewpoints.filter((v) => !placed.has(v.id) && matches(f, v.id, v.label));
      if (rest.length) { rows.push({ group: "Uncategorized" }); for (const v of rest) rows.push({ id: v.id, label: v.label || core.humanize(v.id), tag: `${v.concepts.length}` }); }
      return rows;
    };
    return h("div", {},
      pageHead("Viewpoints", "arch:Viewpoint individuals: the concepts each admits, its stakeholders, the concerns it frames and its purposes, grouped in a SKOS viewpoint catalog (arch:viewpointLibrary)."),
      masterDetail("viewpoints", { rows: catRows, tools, detail: viewpointDetail, emptyText: "No viewpoints yet." }),
      viewpointCategoriesCard());
  }

  function addViewpoint() {
    const id = uniqueId("NewViewpoint", "viewpoint");
    mutate(() => {
      project.viewpoints.push({ id, label: core.humanize(id), definition: "", concepts: [], stakeholders: [], concerns: [], purposes: [], viewTypes: ["Diagram"], categories: project.viewpointCategories[0] ? [project.viewpointCategories[0].id] : [] });
      ui.sel.viewpoints = id;
    });
  }

  function viewpointDetail(id) {
    const v = project.viewpoints.find((x) => x.id === id);
    if (!v) return null;
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, v.label || core.humanize(v.id)), h("span", { class: "pill" }, `${v.concepts.length} concepts`),
        h("button", { class: "btn small", onclick: () => {
          const nid = uniqueId(v.id + "Copy", "viewpoint");
          mutate(() => { const c = JSON.parse(JSON.stringify(v)); c.id = nid; c.label = (v.label || v.id) + " copy"; project.viewpoints.push(c); ui.sel.viewpoints = nid; });
        } }, "Duplicate"),
        deleteButton("viewpoints", "viewpoints", v, "viewpoint")),
      inlineIssues("viewpoints", v.id),
      h("div", { class: "grid2" },
        idField("viewpoints", "viewpoint", v, "Viewpoint"),
        field("Label", textInput(() => v.label, (x) => { v.label = x; })),
        field("Definition", textArea(() => v.definition, (x) => { v.definition = x; }, 2), null, "span2"),
        field("Catalog categories", chips(() => v.categories, (x) => { v.categories = x; }, vpOptions(project.viewpointCategories))),
        field("View types (arch:viewType)", h("div", { class: "checks" }, core.VIEW_TYPES.map((t) => checkbox(t, () => v.viewTypes.includes(t), (on) => { v.viewTypes = on ? v.viewTypes.concat([t]) : v.viewTypes.filter((x) => x !== t); })))),
        field("Stakeholders", chips(() => v.stakeholders, (x) => { v.stakeholders = x; }, vpOptions(project.stakeholders).concat(core.CORE_STAKEHOLDERS.map((s) => ({ value: "archvp:" + s, label: core.humanize(s) + " (core)" }))), { free: curieRe })),
        field("Concerns framed", chips(() => v.concerns, (x) => { v.concerns = x; }, vpOptions(project.concerns).concat(core.CORE_CONCERNS.map((s) => ({ value: "archvp:" + s, label: core.humanize(s) + " (core)" }))), { free: curieRe })),
        field("Purposes", chips(() => v.purposes, (x) => { v.purposes = x; }, vpOptions(project.purposes)), null, "span2")),
      h("h3", { style: { marginTop: "16px" } }, "Concepts admitted (arch:includesConcept)"),
      conceptPicker(v));
  }

  function conceptPicker(v) {
    const groups = [];
    const used = new Set();
    const leafCats = project.taxonomy.categories;
    for (const c of leafCats) {
      const items = project.elements.filter((e) => !e.abstract && e.categories.includes(c.id)).map((e) => e.id)
        .concat(project.relationships.filter((r) => r.categories.includes(c.id)).map((r) => r.id));
      if (items.length) { groups.push([catPath(c), items]); items.forEach((i) => used.add(i)); }
    }
    const restEl = project.elements.filter((e) => !e.abstract && !used.has(e.id)).map((e) => e.id);
    const restRel = project.relationships.filter((r) => !used.has(r.id)).map((r) => r.id);
    const ext = project.externalConcepts.filter((x) => !x.abstract).map((x) => x.ref);
    if (restEl.length) groups.push([leafCats.length ? "Other elements" : "Elements", restEl]);
    if (restRel.length) groups.push([leafCats.length ? "Other relationships" : "Relationships", restRel]);
    if (ext.length) groups.push(["External", ext]);
    const extraRefs = v.concepts.filter((c) => !groups.some(([, items]) => items.includes(c)));
    return h("div", {},
      h("div", { class: "picker" }, groups.map(([title, items]) => {
        const all = items.every((i) => v.concepts.includes(i));
        const allBox = h("input", { type: "checkbox", "aria-label": `All of ${title}` });
        allBox.checked = all;
        allBox.addEventListener("change", () => mutate(() => {
          v.concepts = allBox.checked ? Array.from(new Set(v.concepts.concat(items))) : v.concepts.filter((c) => !items.includes(c));
        }));
        return h("div", { class: "picker-group" },
          h("header", {}, allBox, title),
          items.map((i) => {
            const box = h("input", { type: "checkbox" });
            box.checked = v.concepts.includes(i);
            box.addEventListener("change", () => mutate(() => {
              v.concepts = box.checked ? v.concepts.concat([i]) : v.concepts.filter((c) => c !== i);
            }));
            return h("label", {}, box, labelOf(i));
          }));
      })),
      extraRefs.length ? h("p", { class: "small muted", style: { marginTop: "8px" } }, "Also included: ", extraRefs.join(", ")) : null);
  }

  function viewpointCategoriesCard() {
    const cats = project.viewpointCategories;
    return h("div", { class: "card", style: { marginTop: "16px" } },
      h("h3", {}, "Viewpoint catalog categories"),
      h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Id"), h("th", {}, "Label"), h("th", {}, "Parent"), h("th", {}, "Viewpoints"), h("th", {}))),
        h("tbody", {}, cats.map((c) => h("tr", {},
          h("td", {}, h("code", {}, c.id)),
          h("td", {}, textInput(() => c.label, (x) => { c.label = x; })),
          h("td", {}, select([{ value: "", label: "— top level —" }].concat(cats.filter((x) => x.id !== c.id).map((x) => ({ value: x.id, label: x.label || x.id }))), () => c.parent, (x) => { c.parent = x; })),
          h("td", {}, project.viewpoints.filter((v) => v.categories.includes(c.id)).length),
          h("td", {}, h("button", { class: "btn small ghost", onclick: () => mutate(() => core.removeRef(project, c.id, "viewpointCategories")) }, "×")))))),
      h("button", { class: "btn small", style: { marginTop: "8px" }, onclick: () => {
        const id = uniqueId("NewViewpointCategory", "viewpoint");
        mutate(() => cats.push({ id, label: core.humanize(id), definition: "", parent: "" }));
      } }, "+ Category"));
  }

  // ------------------------------------------------------------------ stakeholders, concerns, purposes

  function viewStakeholders() {
    const table = (title, listName, hint, extraCol) => {
      const list = project[listName];
      return h("div", { class: "card" },
        h("h3", {}, title), h("p", { class: "small muted" }, hint),
        h("table", { class: "tbl" },
          h("thead", {}, h("tr", {}, h("th", {}, "Id"), h("th", {}, "Label"), h("th", {}, "Definition"), extraCol ? h("th", {}, extraCol.title) : null, h("th", {}, "Used by"), h("th", {}))),
          h("tbody", {}, list.map((x) => {
            const usedBy = project.viewpoints.filter((v) => (v[listName] || []).includes(x.id)).length;
            return h("tr", {},
              h("td", { style: { width: "190px" } }, textInput(() => x.id, () => {}, { class: "mono" }, {
                onCommit: (val) => {
                  const next = val.trim();
                  if (next === x.id) return;
                  if (!core.LOCAL_NAME.test(next) || core.idsInScope(project, "viewpoint").includes(next)) { toast(`"${next}" is not a valid, unused id.`); render(); return; }
                  const old = x.id;
                  mutate(() => { core.renameRef(project, old, next, "viewpoint"); x.id = next; });
                },
              })),
              h("td", {}, textInput(() => x.label, (val) => { x.label = val; })),
              h("td", {}, textInput(() => x.definition, (val) => { x.definition = val; })),
              extraCol ? h("td", { style: { minWidth: "220px" } }, extraCol.cell(x)) : null,
              h("td", { class: "small muted" }, `${usedBy} viewpoint(s)`),
              h("td", {}, h("button", { class: "btn small ghost", title: "Delete", onclick: () => mutate(() => core.removeRef(project, x.id, listName)) }, "×")));
          }))),
        h("button", { class: "btn small", style: { marginTop: "8px" }, onclick: () => {
          const base = { stakeholders: "NewStakeholder", concerns: "NewConcern", purposes: "NewPurpose" }[listName];
          const id = uniqueId(base, "viewpoint");
          mutate(() => list.push(Object.assign({ id, label: core.humanize(id), definition: "" }, listName === "stakeholders" ? { concerns: [] } : {})));
        } }, "+ Add"));
    };
    return h("div", {},
      pageHead("Stakeholders, concerns & purposes", "Defined in the viewpoints document (ISO/IEC/IEEE 42010 terms). Viewpoints can also refer to the shared core-viewpoints terms (archvp:)."),
      table("Stakeholders (arch:Stakeholder)", "stakeholders", "Who the viewpoints are for.", { title: "Concerns", cell: (s) => chips(() => s.concerns, (v) => { s.concerns = v; }, vpOptions(project.concerns), { free: curieRe }) }),
      table("Concerns (arch:Concern)", "concerns", "Interests in the system that viewpoints frame."),
      table("Purposes (arch:Purpose)", "purposes", "Designing, deciding, informing…"));
  }

  // ------------------------------------------------------------------ notation

  function viewNotation() {
    const groups = [];
    const used = new Set();
    for (const c of project.taxonomy.categories) {
      const items = project.elements.filter((e) => !e.abstract && e.categories.includes(c.id) && !used.has(e.id));
      if (items.length) { groups.push([catPath(c), items]); items.forEach((e) => used.add(e.id)); }
    }
    const rest = project.elements.filter((e) => !e.abstract && !used.has(e.id));
    if (rest.length) groups.push([groups.length ? "Other" : "Elements", rest]);
    const sel = project.elements.find((e) => e.id === ui.sel.notation);
    return h("div", {},
      pageHead("Notation", "The default visual notation (archvis:NotationSet) — the palette a modelling tool builds from the metamodel. Click an element to restyle it."),
      sel ? h("div", { class: "card" },
        h("div", { class: "row" }, h("strong", {}, sel.label || sel.id),
          field("Fill", colorInput(() => sel.notation.fill, (v) => { sel.notation.fill = v; })),
          field("Line", colorInput(() => sel.notation.stroke, (v) => { sel.notation.stroke = v; })),
          field("Text", colorInput(() => sel.notation.font || "#1d2330", (v) => { sel.notation.font = v; })),
          field("Shape", select(core.SHAPES.map((s) => ({ value: s, label: s })), () => sel.notation.shape || "rectangle", (v) => { sel.notation.shape = v; })),
          h("button", { class: "btn small", onclick: () => {
            const cat = sel.categories[0];
            if (!cat) { toast("This element is in no category."); return; }
            mutate(() => { for (const e of project.elements) if (!e.abstract && e.categories.includes(cat)) e.notation = Object.assign({}, e.notation, { fill: sel.notation.fill, stroke: sel.notation.stroke }); });
          } }, "Apply colours to its category"))) : null,
      groups.map(([title, items]) => h("div", { class: "card" }, h("h3", {}, title),
        h("div", { class: "palette" }, items.map((e) => h("div", { class: "swatch" + (sel && sel.id === e.id ? " sel" : ""), role: "button", tabindex: "0", onclick: () => go("notation", e.id), onkeydown: (ev) => { if (ev.key === "Enter") go("notation", e.id); } },
          shapeSvg(e.notation || {}, 120, 60, ""), h("span", {}, e.label || e.id)))))),
      h("div", { class: "card" }, h("h3", {}, "Relationships"),
        h("div", { class: "palette" }, project.relationships.map((r) => h("div", { class: "swatch", role: "button", tabindex: "0", onclick: () => go("relationships", r.id) }, lineSvg(r.style || {}), h("span", {}, `${r.notation ? r.notation + " · " : ""}${r.label || r.id}`))))),
      h("p", { class: "small muted" }, "The notation document uses archvis:NotationSet, archvis:Style and its colour properties as the converters do; the per-concept descriptor terms (archvis:VisualNotation, notationFor, defaultStyle, shape, lineStyle, arrowHead) should be checked against core-vis before publishing."));
  }

  // ------------------------------------------------------------------ output

  function highlight(text, name) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (!/\.ttl$/.test(name)) return esc(text);
    return text.split("\n").map((line) => {
      if (/^\s*#/.test(line)) return `<span class="tk-c">${esc(line)}</span>`;
      let out = "";
      const re = /("(?:[^"\\]|\\.)*"(?:@[A-Za-z-]+|\^\^[\w-]+:[\w-]*)?)|(<[^>\s]*>)|(@prefix|\ba\b(?=\s))|([A-Za-z][\w-]*:[\w.-]*)/g;
      let last = 0, m;
      while ((m = re.exec(line))) {
        out += esc(line.slice(last, m.index));
        const cls = m[1] ? "tk-s" : m[2] ? "tk-i" : m[3] ? "tk-k" : "tk-p";
        out += `<span class="${cls}">${esc(m[0])}</span>`;
        last = m.index + m[0].length;
      }
      return out + esc(line.slice(last));
    }).join("\n");
  }

  function viewOutput() {
    let files;
    try { files = generator.generate(project); } catch (e) {
      return h("div", {}, pageHead("Generated files", null), h("div", { class: "issue error" }, h("span", { class: "lvl" }, "error"), String(e.message || e)));
    }
    if (!files.some((f) => f.name === ui.outFile)) ui.outFile = files[0].name;
    const cur = files.find((f) => f.name === ui.outFile);
    const errors = issues.filter((i) => i.level === "error");
    return h("div", {},
      pageHead("Generated files", "The complete semantic asset set, regenerated from the project on every change.",
        h("button", { class: "btn primary", onclick: exportZip }, "Export .zip")),
      errors.length ? h("div", { class: "issue error", style: { cursor: "pointer" }, onclick: () => go("issues") }, h("span", { class: "lvl" }, "check"), `${errors.length} error(s) — the files may be incomplete or invalid. Open Checks.`) : null,
      h("div", { class: "files" },
        h("div", { class: "list" }, h("div", { class: "list-body" }, files.map((f) => h("button", { class: "li" + (f.name === ui.outFile ? " sel" : ""), onclick: () => { ui.outFile = f.name; render(); } },
          h("span", {}, f.name), h("span", { class: "tag" }, `${Math.max(1, Math.round(f.content.length / 1024))} KB`))))),
        h("div", {},
          h("div", { class: "row", style: { marginBottom: "8px" } }, h("strong", { class: "mono" }, cur.name), h("span", { class: "spacer" }),
            h("button", { class: "btn small", onclick: () => { navigator.clipboard.writeText(cur.content).then(() => toast("Copied."), () => toast("Copy failed: select the text instead.")); } }, "Copy"),
            h("button", { class: "btn small", onclick: () => download(cur.name, cur.content, cur.name.endsWith(".ttl") ? "text/turtle" : "text/plain") }, "Download")),
          h("pre", { class: "code", html: highlight(cur.content, cur.name) }))));
  }

  function exportZip() {
    let files;
    try { files = generator.generate(project); } catch (e) { toast("Cannot generate: " + e.message); return; }
    const errors = issues.filter((i) => i.level === "error").length;
    if (errors && !confirm(`There are ${errors} error(s) in Checks. Export anyway?`)) return;
    const slug = project.meta.slug || "metamodel";
    const data = zip.build(files.map((f) => ({ name: `${slug}/${f.name}`, content: f.content })));
    download(`${slug}-${project.meta.version || "draft"}.zip`, new Blob([data], { type: "application/zip" }));
    toast(`Exported ${files.length} files.`);
  }

  // ------------------------------------------------------------------ issues

  function viewIssues() {
    const counts = ["error", "warning", "info"].map((l) => `${issues.filter((i) => i.level === l).length} ${l}${l === "info" ? "" : "s"}`).join(" · ");
    return h("div", {},
      pageHead("Checks", `Errors make the generated documents wrong; warnings are probably unintended; info is worth a look. ${counts}.`),
      issues.length ? issues.map((i) => h("button", { class: "issue " + i.level, onclick: () => go(i.tab, i.id || ui.sel[i.tab]) }, h("span", { class: "lvl" }, i.level), h("span", {}, i.message)))
        : h("div", { class: "card empty" }, "No findings."));
  }

  const VIEWS = {
    overview: viewOverview, elements: viewElements, relationships: viewRelationships, attributes: viewAttributes,
    rules: viewRules, taxonomy: viewTaxonomy, viewpoints: viewViewpoints, stakeholders: viewStakeholders,
    notation: viewNotation, output: viewOutput, issues: viewIssues,
  };

  // ------------------------------------------------------------------ top-bar actions

  function setProject(p, message) {
    history.undo.push(JSON.stringify(project)); history.redo = [];
    project = core.normalize(p);
    ui.sel = {}; ui.filter = {}; ui.matrixRel = ""; ui.matrixRowCat = ""; ui.matrixColCat = ""; ui.outFile = "";
    ui.tab = "overview";
    changed(true);
    if (message) toast(message);
  }

  function buildNewMenu() {
    const pop = $("menuNew");
    pop.textContent = "";
    for (const [key, t] of Object.entries(templates)) {
      pop.appendChild(h("button", { class: "menu-item", onclick: () => {
        pop.hidden = true;
        if (!confirm(`Replace the current project with "${t.label}"? (Undo can bring it back.)`)) return;
        setProject(startFrom(key), `Started from ${t.label}.`);
      } }, t.label, h("small", {}, t.description)));
    }
  }

  function wire() {
    $("btnNew").addEventListener("click", (e) => { e.stopPropagation(); $("menuNew").hidden = !$("menuNew").hidden; });
    document.addEventListener("click", (e) => { if (!$("menuNew").contains(e.target)) $("menuNew").hidden = true; });
    $("btnOpen").addEventListener("click", () => $("fileOpen").click());
    $("fileOpen").addEventListener("change", async () => {
      const f = $("fileOpen").files[0];
      if (!f) return;
      try {
        const p = JSON.parse(await f.text());
        if (!p.meta || !Array.isArray(p.elements)) throw new Error("not a studio project");
        setProject(p, `Opened ${f.name}.`);
      } catch (e) { toast(`Could not open ${f.name}: ${e.message}`); }
      $("fileOpen").value = "";
    });
    $("btnSave").addEventListener("click", () => download(core.fileNames(project).project, JSON.stringify(project, null, 2) + "\n", "application/json"));
    $("btnExport").addEventListener("click", exportZip);
    $("btnUndo").addEventListener("click", undo);
    $("btnRedo").addEventListener("click", redo);
    $("btnTheme").addEventListener("click", () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch (e) { /* ignore */ }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); if (e.shiftKey) redo(); else undo();
      }
      if (e.key === "Escape") closePopover();
    });

    // Import dialog
    const dlg = $("dlgImport");
    $("btnImport").addEventListener("click", () => { $("importReport").hidden = true; dlg.showModal(); });
    $("importGo").addEventListener("click", async (e) => {
      e.preventDefault();
      const docs = [];
      const report = $("importReport");
      report.hidden = false; report.textContent = "Reading…";
      try {
        for (const f of $("importFiles").files) docs.push({ name: f.name, text: await f.text() });
        for (const url of $("importUrls").value.split(/\s+/).filter(Boolean)) {
          const res = await fetch(url, { headers: { Accept: "text/turtle" } });
          if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
          docs.push({ name: url, text: await res.text(), baseIRI: url });
        }
        if (!docs.length) { report.textContent = "Choose at least one file or URL."; return; }
        const { project: p, report: lines } = importer.importTurtle(docs);
        dlg.close();
        setProject(p, "Imported.");
        alert("Import summary\n\n" + lines.join("\n"));
      } catch (err) {
        report.textContent = "Import failed: " + (err.message || err) + (/fetch/i.test(String(err)) ? "\nThe server may not allow cross-origin requests: download the files and choose them above instead." : "");
      }
    });
  }

  // ------------------------------------------------------------------ boot

  try { const t = localStorage.getItem(THEME_KEY); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
  buildNewMenu();
  wire();
  issues = linter.lint(project);
  render();
  window.__studio = { get project() { return project; }, go, render };
})();
