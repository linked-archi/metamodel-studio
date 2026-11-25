/*
 * Linked.Archi Metamodel Studio — user interface.
 *
 * Plain DOM, no framework and no build: open index.html from disk or any static server.
 * State is one project object (see core.js). Text fields write into it as you type;
 * structural edits (add, delete, rename, pickers, drags) re-render the page. Everything is kept
 * in this browser's localStorage between visits and can be saved as a .studio.json file.
 * Trees, menus, ordered lists and drag and drop come from tree.js (SReq 11, SD-16).
 */
(function () {
  "use strict";

  const { core, generator, importer, lint: linter, zip, templates, ui: kit } = window.LAStudio;
  const STORE_KEY = "la-metamodel-studio:project";
  const THEME_KEY = "la-metamodel-studio:theme";
  const VIEW_KEY = "la-metamodel-studio:view";
  const BASES_KEY = "la-metamodel-studio:bases";

  // ------------------------------------------------------------------ state

  // A link may name the starting point to open, ?template=archimate4 (SReq 10.4): on a first visit it is the one
  // opened; over a project kept from before, see openLinked().
  const linked = linkedTemplate();
  const stored = loadStored();
  let project = stored || startFrom(linked || "cloudplatform");
  const ui = {
    tab: "overview",
    sel: {},           // tab -> selected id
    selKey: {},        // tab -> the tree row chosen for it: an item with two parents has two rows (SD-12)
    picked: {},        // tab -> Set of the row keys chosen together, with Ctrl, Cmd or Shift
    anchor: {},        // tab -> the row a Shift-click range starts from
    rows: {},          // tab -> the tree rows as last drawn
    filter: {},        // tab -> search text
    matrixRel: "",     // "" = all relationships
    matrixRowCat: "",
    matrixColCat: "",
    outFile: "",
    taxMember: "",     // the member row chosen on the Taxonomy page
    grid: { rows: "", cols: "" },
    focusAfter: null,  // { scope, key, id }: the row to focus after the next render, when a move changes its key
  };
  const view = loadView();
  // The languages the project extends (SReq 12, SD-18): those the studio has, and the project with their types
  // added for showing (`ctx`). Never saved in the project; documents loaded for a base stay in this browser.
  let loadedBases = loadBases();
  let bases = [];
  let ctx = project;
  let labelIndex = null;
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

  /** The starting point a link names, ?template=<key>, when the studio has one by that key. */
  function linkedTemplate() {
    try {
      const key = new URLSearchParams(location.search).get("template");
      return key && Object.prototype.hasOwnProperty.call(templates, key) ? key : null;
    } catch (e) { return null; }
  }

  /** The key of the starting point `p` is, as it came but for its dates; null once it has been changed. */
  function asItCame(p) {
    const plain = (x) => JSON.stringify(Object.assign({}, x, { meta: Object.assign({}, x.meta, { created: "", modified: "" }) }));
    const mine = plain(p);
    return Object.keys(templates).find((key) => plain(startFrom(key)) === mine) || null;
  }

  /** The languages loaded from their documents in this browser: namespace -> { project, loaded }. */
  function loadBases() {
    try {
      const found = JSON.parse(localStorage.getItem(BASES_KEY) || "{}") || {};
      for (const x of Object.values(found)) if (x && x.project) x.project = core.normalize(x.project);
      return found;
    } catch (e) { return {}; }
  }
  function saveBases() {
    try { localStorage.setItem(BASES_KEY, JSON.stringify(loadedBases)); return true; } catch (e) { return false; }
  }
  /** Where a base may come from: documents loaded in this browser first, then the studio's own templates. */
  function baseCandidates() {
    return Object.entries(loadedBases).map(([namespace, x]) => ({ namespace, project: x.project, bundled: false }))
      .concat(Object.values(templates).map((t) => ({ namespace: core.conceptNamespace(t.project), project: t.project, bundled: true })));
  }
  function refreshBases() {
    bases = core.basesFor(project, baseCandidates());
    ctx = core.withBases(project, bases);
    labelIndex = null;
  }
  /** Whether the trees show the bases' types: when there are any, unless this viewer hid them. */
  const showingBases = () => bases.length > 0 && view.showBase !== false;

  /** What this viewer keeps between visits: folded rows, the taxonomy's view, whether relations show. Not project data. */
  function loadView() {
    const fallback = { collapsed: {}, opened: {}, showMembers: true, relations: true, taxView: "tree", showBase: true, matrixBase: false, welcome: true };
    try { return Object.assign(fallback, JSON.parse(localStorage.getItem(VIEW_KEY) || "{}")); } catch (e) { return fallback; }
  }
  function saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (e) { /* storage unavailable: keep working */ }
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

  /** Run a structural change and re-render; record an undo point when it changed the project. */
  function mutate(fn, opts) {
    const before = JSON.stringify(project);
    fn(project);
    if (JSON.stringify(project) !== before) {
      history.undo.push(before);
      if (history.undo.length > 100) history.undo.shift();
      history.redo = [];
    }
    changed(opts && opts.render === false ? false : true);
  }

  /**
   * A change to element types' parents or categories: made as mutate() does, then the other side of each category
   * that matched an abstract type exactly is offered the same change (SReq 11.6).
   */
  function change(fn, opts) {
    const before = core.matchSnapshot(project);
    mutate(fn, opts);
    const ups = core.matchFollowUps(project, before);
    if (!ups.length) return;
    const names = (ids) => (ids.length === 1 ? labelOf(ids[0]) : `${ids.length} types`);
    const say = {
      classify: (f) => `Classify ${names(f.ids)} in ${catLabel(f.category)}`,
      unclassify: (f) => `Take ${names(f.ids)} out of ${catLabel(f.category)}`,
      addParent: (f) => `Make ${names(f.ids)} a kind of ${labelOf(f.type)}`,
      removeParent: (f) => `Stop ${names(f.ids)} specializing ${labelOf(f.type)}`,
    };
    const first = ups[0];
    const actions = ups.slice(0, 3).map((f) => ({ label: say[f.action](f), run: () => mutate(() => core.applyFollowUp(project, f)) }));
    if (ups.length > 1) actions.push({ label: "All of these", run: () => mutate(() => ups.forEach((f) => core.applyFollowUp(project, f))) });
    toast(`${catLabel(first.category)} holds the subtypes of ${labelOf(first.type)}${ups.length > 1 ? ", and other categories match too" : ""}.`, actions);
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
    refreshBases();
    issues = linter.lint(project, { bases });
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
    // Changes go through `opts.mutate`: change() for parents and categories, which offers the matching change (SReq 11.6).
    const run = opts.mutate || mutate;
    const box = h("div", { class: "chips" });
    const listId = "dl" + (++listCounter);
    const byValue = new Map(options.map((o) => [o.value, o]));
    for (const v of get()) {
      const o = byValue.get(v);
      box.appendChild(h("span", { class: "chip" + (core.isCurie(v) ? " ext" : ""), title: v },
        o && o.label && o.label !== v ? [o.label, " ", h("code", {}, v)] : v,
        h("button", { class: "x", type: "button", title: "Remove", "aria-label": `Remove ${v}`, onclick: () => run(() => set(get().filter((x) => x !== v))) }, "×")));
    }
    const input = h("input", { list: listId, placeholder: opts.placeholder || "Add…", "aria-label": opts.label || "Add value" });
    const dl = h("datalist", { id: listId }, options.filter((o) => !get().includes(o.value)).map((o) => h("option", { value: o.value }, o.label && o.label !== o.value ? o.label : null)));
    const accept = () => {
      const raw = input.value.trim();
      if (!raw) return;
      let value = byValue.has(raw) ? raw : (options.find((o) => (o.label || "").toLowerCase() === raw.toLowerCase()) || {}).value;
      if (!value && opts.free && opts.free.test(raw)) value = raw;
      if (!value) { toast(`"${raw}" is not one of the choices${opts.free ? " (or a prefix:Name reference)" : ""}.`); return; }
      if (!get().includes(value)) run(() => set(get().concat([value])));
      input.value = "";
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); accept(); } });
    input.addEventListener("change", () => { if (byValue.has(input.value.trim())) accept(); });
    box.appendChild(input);
    box.appendChild(dl);
    return box;
  }

  /** A short message; with actions, buttons for the changes it offers (SReq 11.6), shown for longer. */
  function toast(msg, actions) {
    const t = $("toast");
    t.textContent = "";
    t.appendChild(h("span", {}, msg));
    if (actions && actions.length) {
      t.appendChild(h("span", { class: "toast-actions" }, actions.map((a) => h("button", { class: "btn small", type: "button", onclick: () => { t.hidden = true; a.run(); } }, a.label))));
    }
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, actions && actions.length ? 15000 : 3200);
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
    // Outside types: those the project declares, and the types of the languages it extends (SReq 12.2).
    for (const x of ctx.externalConcepts) if ((x.kind || "element") === "element" && (includeAbstract || !x.abstract)) out.push({ value: x.ref, label: (x.label || x.ref) + (x.baseTitle ? ` (${x.baseTitle})` : "") });
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
  /** A concept's label: the project's own, an outside type's, or a base type's (SReq 12.2). */
  const labelOf = (ref) => {
    if (!labelIndex) labelIndex = core.conceptIndex(ctx);
    const hit = labelIndex.get(ref);
    return hit ? hit.label : ref;
  };

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
    const sel = $("main").querySelector(".tv-row.sel");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }

  /**
   * Draw the page again. Lists keep where they were scrolled, and the row that had the keyboard focus keeps it, or
   * the row a move took it to (ui.focusAfter), or its item's first row (SReq 11.3).
   */
  function render() {
    labelIndex = null;
    kit.closeMenu(false);
    closePopover();
    renderSidebar();
    renderTitle();
    const main = $("main");
    const scrolls = Array.from(main.querySelectorAll("[data-scroll]")).map((el) => [el.dataset.scroll, el.scrollTop]);
    const top = main.scrollTop;
    const active = document.activeElement;
    const scope = active && active.closest ? active.closest("[data-scope]") : null;
    const focus = ui.focusAfter || (scope && active.dataset.key ? { scope: scope.dataset.scope, key: active.dataset.key, id: active.dataset.id } : null);
    ui.focusAfter = null;
    main.textContent = "";
    append(main, [(VIEWS[ui.tab] || VIEWS.overview)()]);
    main.scrollTop = top;
    for (const [name, at] of scrolls) {
      const el = main.querySelector(`[data-scroll="${CSS.escape(name)}"]`);
      if (el) el.scrollTop = at;
    }
    if (focus) {
      const box = main.querySelector(`[data-scope="${CSS.escape(focus.scope)}"]`);
      const el = box && (box.querySelector(`[data-key="${CSS.escape(focus.key)}"]`) || (focus.id ? box.querySelector(`[data-id="${CSS.escape(focus.id)}"]`) : null));
      if (el) {
        for (const other of box.querySelectorAll("[tabindex='0'][data-key]")) other.tabIndex = -1;
        el.tabIndex = 0;
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "nearest" });
      }
    }
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

  /** Where to start, for a first visit, until it is hidden (SReq 10.4). Kept with this viewer's view, not the project. */
  function gettingStarted() {
    if (view.welcome === false) return null;
    const to = (tab, label) => h("a", { href: `#${tab}`, onclick: (e) => { e.preventDefault(); go(tab); } }, label);
    const cloud = templates.cloudplatform && project.meta.name === templates.cloudplatform.project.meta.name;
    return h("div", { class: "card welcome", role: "note", "aria-label": "Where to start" },
      h("div", { class: "welcome-head" },
        h("h3", {}, "Where to start"),
        h("button", { class: "btn small", onclick: () => { view.welcome = false; saveView(); render(); } }, "Hide")),
      cloud ? h("p", {}, "This is Cloud Platform, a small language that extends ArchiMate 4.0. New ▾ opens ArchiMate 4.0 itself, or a blank metamodel.") : null,
      h("ul", {},
        h("li", {}, to("elements", "Elements"), ": drag a type onto another to make it a subtype, or hold Alt to give it a second parent. A row's ⋯ menu and the keyboard do the same."),
        h("li", {}, to("taxonomy", "Taxonomy"), ": the categories as a tree or a board, and the type each one stands for."),
        h("li", {}, to("rules", "Relationship rules"), ": which relationships each pair of types may have."),
        h("li", {}, h("b", {}, "Export asset set"), ": the Turtle documents la-gram and the workspace read. Your work stays in this browser until you save or export it.")));
  }

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
      gettingStarted(),
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

  /** Whether the studio shows a language the project imports (SReq 12.1, 12.6), and how to load or forget its documents. */
  function baseStatus(imp) {
    const b = bases.find((x) => x.namespace === imp.namespace);
    if (b && b.bundled) return h("span", { class: "muted" }, `${b.title}, from the studio's copy`);
    if (b) {
      return [h("span", { class: "muted" }, `${b.title}, loaded in this browser on ${(loadedBases[b.namespace] || {}).loaded || "?"} `),
        h("button", { class: "btn small ghost", type: "button", onclick: () => forgetBase(b.namespace) }, "Forget")];
    }
    if (!imp.prefix || !/^https?:\/\//.test(imp.namespace || "")) return null;
    return h("button", { class: "btn small", type: "button", onclick: () => openImport(imp) }, "Load its documents…");
  }

  function forgetBase(namespace) {
    delete loadedBases[namespace];
    saveBases();
    changed(true);
  }

  /** What the studio keeps of a language loaded as a base: its types, attributes and taxonomy, not its rules or viewpoints. */
  function compactBase(p) {
    return core.normalize({
      meta: { title: p.meta.title, name: p.meta.name, prefix: p.meta.prefix, baseIri: p.meta.baseIri, version: p.meta.version },
      elements: p.elements.map((e) => ({ id: e.id, label: e.label, parents: e.parents, abstract: e.abstract, categories: e.categories, definition: e.definition, notation: e.notation && e.notation.fill ? { fill: e.notation.fill } : {} })),
      relationships: p.relationships.map((r) => ({ id: r.id, label: r.label, parent: r.parent, notation: r.notation, predicate: r.predicate, definition: r.definition, categories: r.categories })),
      attributes: p.attributes,
      taxonomy: p.taxonomy,
    });
  }

  function viewImports() {
    const m = project.meta;
    const known = core.KNOWN_LANGUAGES.filter((l) => !m.imports.some((i) => i.prefix === l.prefix));
    return h("div", { class: "card" },
      h("h3", {}, "Extending other languages"),
      h("p", { class: "muted small" }, "Import a published language to specialize its element types (e.g. a Microservice that is an am4:ApplicationComponent). The studio shows the types of a language you extend, read only, in its trees, with yours under the ones they specialize: ArchiMate 4.0 is built in, and another is shown once its documents are loaded. Declare any other external types you refer to, so they can be parents, rule endpoints and viewpoint members."),
      h("table", { class: "tbl" },
        h("thead", {}, h("tr", {}, h("th", {}, "Prefix"), h("th", {}, "Namespace"), h("th", {}, "Shown"), h("th", {}))),
        h("tbody", {}, m.imports.map((imp, i) => h("tr", {},
          h("td", { style: { width: "120px" } }, textInput(() => imp.prefix, (v) => { imp.prefix = v.trim(); }, { class: "mono" })),
          h("td", {}, textInput(() => imp.namespace, (v) => { imp.namespace = v.trim(); }, { class: "mono" }, { onCommit: () => mutate(() => {}) })),
          h("td", { class: "small base-status" }, baseStatus(imp)),
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
    const body = h("div", { class: "list-body", "data-scroll": "list-" + tab });
    const fill = () => {
      body.textContent = "";
      if (opts.tree) {
        // A hierarchy is a tree (SReq 11.1); a filter keeps the rows that match and the rows above them.
        const filter = (ui.filter[tab] || "").toLowerCase();
        const t = opts.tree(filter);
        body.appendChild(t.rows.length ? kit.tree(t).node : h("div", { class: "empty" }, filter ? "Nothing matches." : opts.emptyText || "Nothing here yet."));
        return;
      }
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

  function deleteItem(tab, listName, item, what) {
    if (!confirm(`Delete ${what} "${item.id}" and every reference to it?`)) return;
    mutate(() => { core.removeRef(project, item.id, listName); ui.sel[tab] = null; });
  }

  function deleteButton(tab, listName, item, what) {
    return h("button", { class: "btn danger small", onclick: () => deleteItem(tab, listName, item, what) }, "Delete");
  }

  // ------------------------------------------------------------------ trees: rows, choosing, moving (SReq 11, SD-12)

  const collapsedSet = (tab) => new Set(view.collapsed[tab] || []);
  const openedSet = (tab) => new Set((view.opened || {})[tab] || []);
  /** Whether a row is open: as this viewer left it, or `dflt`. A base type is folded at first unless one of the project's types is under it. */
  const isOpen = (tab, key, dflt) => (collapsedSet(tab).has(key) ? false : openedSet(tab).has(key) ? true : dflt);
  /** Fold or unfold a row; this viewer keeps it between visits. */
  function setOpen(tab, key, open) {
    const closed = collapsedSet(tab);
    const opened = openedSet(tab);
    if (open) { closed.delete(key); opened.add(key); } else { closed.add(key); opened.delete(key); }
    // Rows that moved leave keys behind: keep the latest few hundred.
    view.collapsed[tab] = [...closed].slice(-400);
    view.opened = Object.assign({}, view.opened, { [tab]: [...opened].slice(-400) });
    saveView();
  }
  /** Unfold every row of `id`, so that what was just put under it shows. */
  function unfoldItem(tab, id) {
    view.collapsed[tab] = (view.collapsed[tab] || []).filter((k) => k !== id && !k.endsWith("/" + id));
    saveView();
  }
  const pickedSet = (tab) => ui.picked[tab] || new Set();

  /** The selected item's rows: the one chosen, or its first, is selected; its other places are highlighted (SReq 11.1). */
  function markSelection(tab, rows, selectedId, isItem) {
    const picked = pickedSet(tab);
    const mine = rows.filter((r) => r.id === selectedId && isItem(r));
    const chosen = mine.find((r) => r.key === ui.selKey[tab]) || mine[0];
    for (const r of mine) { if (r === chosen) r.selected = true; else r.also = true; }
    for (const r of rows) if (picked.has(r.key)) r.picked = true;
    ui.rows[tab] = rows;
    return rows;
  }

  /** A row clicked, or chosen with Enter or Space: Ctrl, Cmd or Space adds it to the rows chosen together, Shift a range of them. */
  function chooseRow(tab, row, mods, open) {
    const rows = ui.rows[tab] || [];
    if (mods.toggle && row.drag) {
      const picked = new Set(pickedSet(tab));
      if (picked.has(row.key)) picked.delete(row.key); else picked.add(row.key);
      ui.picked[tab] = picked;
      ui.anchor[tab] = row.key;
      render();
      return;
    }
    if (mods.range && row.drag && ui.anchor[tab]) {
      const keys = rows.map((r) => r.key);
      const a = keys.indexOf(ui.anchor[tab]);
      const b = keys.indexOf(row.key);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        ui.picked[tab] = new Set(rows.slice(lo, hi + 1).filter((r) => r.group === row.group).map((r) => r.key));
        render();
        return;
      }
    }
    ui.picked[tab] = new Set();
    ui.anchor[tab] = row.key;
    open(row);
  }

  /** What dragging `row` carries: it, or all the rows of its kind chosen with it. */
  function dragOf(tab, row, kind, item) {
    const noun = { category: "categories", vpcat: "categories", viewpoint: "viewpoints" }[kind] || "types";
    return () => {
      const picked = pickedSet(tab);
      const together = (ui.rows[tab] || []).filter((r) => picked.has(r.key) && r.group === row.group);
      const rows = picked.has(row.key) && together.length > 1 ? together : [row];
      return { kind, items: rows.map(item), label: rows.length === 1 ? row.label : `${rows.length} ${noun}` };
    };
  }

  /** Where a menu's picker opens: at the row it was opened from. */
  function rowAnchor(scope, key) {
    const box = document.querySelector(`[data-scope="${CSS.escape(scope)}"]`);
    return (box && box.querySelector(`[data-key="${CSS.escape(key)}"]`)) || { x: Math.max(8, innerWidth / 2 - 160), y: 120 };
  }

  const catLabel = (id) => { const c = project.taxonomy.categories.find((x) => x.id === id); return c ? c.label || core.humanize(c.id) : id; };
  const catPathLabel = (id) => core.categoryPath(project, id).map(catLabel).join(" › ");
  const byLabelItem = (a, b) => (a.label || a.id).localeCompare(b.label || b.id);
  function categoriesOf(ref) {
    const item = project.elements.find((e) => e.id === ref) || project.relationships.find((r) => r.id === ref);
    return item ? item.categories : [];
  }

  /** Element types as a tree for a picker, each under its first parent; those `ok` refuses are shown but cannot be picked. */
  function elementChoices(ok, why) {
    const local = new Set(project.elements.map((e) => e.id));
    const out = [];
    const seen = new Set();
    const add = (value, label, depth) => { const allowed = ok(value); out.push({ value, label, depth, disabled: !allowed, note: allowed ? "" : why(value) }); };
    const walk = (parent, depth) => {
      for (const e of project.elements.filter((x) => x.parents[0] === parent).sort(byLabelItem)) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        add(e.id, (e.label || core.humanize(e.id)) + (e.abstract ? " (abstract)" : ""), depth);
        walk(e.id, depth + 1);
      }
    };
    for (const e of project.elements.filter((x) => !local.has(x.parents[0])).sort(byLabelItem)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      add(e.id, (e.label || core.humanize(e.id)) + (e.abstract ? " (abstract)" : ""), 0);
      walk(e.id, 1);
    }
    // Types of other languages: those the project names as parents, and those it declares.
    const outside = new Set(project.elements.flatMap((e) => e.parents).filter((p) => !local.has(p)));
    for (const x of project.externalConcepts) if ((x.kind || "element") === "element" && x.ref) outside.add(x.ref);
    for (const ref of [...outside].sort()) add(ref, `${labelOf(ref)} (${ref})`, 0);
    return out;
  }

  /** Categories as a tree for a picker. */
  function categoryChoices(ok, why) {
    const out = [];
    const walk = (parent, depth, trail) => {
      for (const id of core.subcategories(project, parent)) {
        if (trail.has(id)) continue;
        const allowed = ok(id);
        out.push({ value: id, label: catLabel(id), depth, disabled: !allowed, note: allowed ? "" : why(id) });
        walk(id, depth + 1, new Set(trail).add(id));
      }
    };
    walk("", 0, new Set());
    return out;
  }

  /** Classify a type in a category chosen from a list; given `from`, it leaves that category (SReq 11.3). */
  function pickCategoryFor(ref, at, from) {
    if (!project.taxonomy.categories.length) { toast("There are no taxonomy categories yet."); return; }
    const mine = categoriesOf(ref);
    kit.picker(at, from ? `Move ${labelOf(ref)} to` : `Classify ${labelOf(ref)} in`, categoryChoices((c) => !mine.includes(c), () => "already there"),
      (c) => change(() => core.classify(project, ref, c, from)));
  }

  // ------------------------------------------------------------------ relations (SReq 11.4)

  /** A link to a concept's page; a type the project does not define is named, not linked. */
  function refLink(ref) {
    const hit = core.conceptIndex(ctx).get(ref);
    const base = core.baseConcept(ctx, ref);
    if (!hit || (!hit.local && !base)) return h("span", { class: "muted", title: ref }, labelOf(ref) === ref ? ref : `${labelOf(ref)}`);
    // A type of a language the project extends opens its read-only page (SReq 12.3).
    return h("a", { href: "#", class: base ? "base-link" : null, title: base ? `${ref}, ${base.baseTitle}` : `${project.meta.prefix}:${ref}`, onclick: (ev) => { ev.preventDefault(); go(hit.kind === "relationship" ? "relationships" : "elements", ref); } }, labelOf(ref));
  }
  function catLink(id) {
    return h("a", { href: "#", title: `${project.meta.prefix}tax:${id}`, onclick: (ev) => { ev.preventDefault(); ui.taxMember = ""; view.taxView = "tree"; go("taxonomy", id); } }, catPathLabel(id));
  }
  const via = (ref) => (ref ? h("span", { class: "muted" }, ` via ${labelOf(ref)}`) : null);

  /**
   * How a category and an abstract type match (SReq 11.6): exactly, or closely with what differs, each difference
   * with a fix. `from` is the page it is shown on: the category's or the type's.
   */
  function matchView(m, from, stated) {
    const names = (ids) => ids.map(labelOf).join(", ");
    // A link the taxonomy states (SReq 4.6) is told as such; one its members suggest, as a match (SReq 11.6).
    const head = stated
      ? (from === "category"
        ? ["It stands for ", refLink(m.type), m.exact ? ". Its element types are exactly that type's subtypes." : ". Its element types differ from that type's subtypes."]
        : [catLink(m.category), m.exact ? " stands for it. Its element types are exactly its subtypes." : " stands for it. Its element types differ from its subtypes."])
      : m.exact
        ? (from === "category" ? ["Its element types are exactly the subtypes of ", refLink(m.type), "."] : ["Its subtypes are exactly the element types of ", catLink(m.category), "."])
        : (from === "category" ? ["Its element types are nearly the subtypes of ", refLink(m.type), "."] : ["Its subtypes are nearly the element types of ", catLink(m.category), "."]);
    return h("div", { class: "match " + (m.exact ? "exact" : "close") }, head,
      m.extra.length ? h("div", { class: "match-diff" }, `In ${catLabel(m.category)} but no subtype of ${labelOf(m.type)}: ${names(m.extra)}. `,
        h("button", { class: "btn small", type: "button", onclick: () => mutate(() => m.extra.forEach((x) => core.addParent(project, x, m.type))) }, m.extra.length === 1 ? "Make it a subtype" : "Make them subtypes"), " ",
        h("button", { class: "btn small", type: "button", onclick: () => mutate(() => m.extra.forEach((x) => core.regroup(project, x, m.category, null))) }, m.extra.length === 1 ? "Take it out" : "Take them out")) : null,
      m.missing.length ? h("div", { class: "match-diff" }, `Subtypes of ${labelOf(m.type)} not in ${catLabel(m.category)}: ${names(m.missing)}. `,
        h("button", { class: "btn small", type: "button", onclick: () => mutate(() => m.missing.forEach((x) => core.classify(project, x, m.category))) }, m.missing.length === 1 ? "Classify it here" : "Classify them here")) : null);
  }

  /** The rules of each relationship type a type is the source or the target of, folded. */
  function rulesBlock(list) {
    if (!list.length) return null;
    return h("div", { class: "rel-list" }, list.map(({ rel, refs }) => {
      const r = project.relationships.find((x) => x.id === rel);
      return h("details", { class: "rel-rule" },
        h("summary", {}, h("b", { class: "mono" }, r ? relLetter(r) : ""), " ", labelOf(rel), h("span", { class: "muted" }, ` · ${refs.length}`)),
        h("div", { class: "rel-refs" }, refs.map((x) => refLink(x))));
    }));
  }

  /** What a type is related to (SReq 11.4): a diagram, and the same in lists for keyboards and screen readers. */
  function relationsPanel(ref) {
    const r = core.relationsOf(ctx, ref);
    if (!r) return null;
    const box = h("details", { class: "relations", open: view.relations !== false ? true : null });
    box.addEventListener("toggle", () => { view.relations = box.open; saveView(); });
    const block = (title, content) => h("section", { class: "rel-block" }, h("h4", {}, title),
      content && (!Array.isArray(content) || content.length) ? content : h("p", { class: "muted" }, "None"));
    const links = (items) => (items.length ? h("div", { class: "rel-list" }, items) : null);
    const isRel = r.kind === "relationship";
    const blocks = [
      block(r.paths.length > 1 ? `Paths to the root (${r.paths.length})` : "Path to the root", r.paths.map((path) => h("div", { class: "crumbs" },
        path.map((x, i) => [i ? h("span", { class: "sep", "aria-hidden": "true" }, "›") : null, x === ref ? h("b", {}, labelOf(x)) : refLink(x)])))),
      block(`Subtypes${r.subtypes.length ? ` (${r.subtypes.length}${r.descendants > r.subtypes.length ? `, ${r.descendants} in all` : ""})` : ""}`, links(r.subtypes.map(refLink))),
      block("Categories", links(r.categories.map((c) => catLink(c.id)))),
      // Those it has in a language the project extends, through the base types it is or specializes (SReq 12.4).
      bases.length ? block(`Categories in ${bases.map((b) => b.title).join(", ")}`, links(r.inherited.map((c) => h("div", {}, c.label, via(c.via))))) : null,
    ];
    if (!isRel && r.local && r.abstract) {
      // The categories that say they stand for it, then those whose members match its subtypes (SReq 4.6, 11.6).
      const linked = [];
      for (const [category, l] of core.categoryLinks(project)) {
        if (l.stated && l.stated.type === ref) linked.push(matchView(Object.assign({ category }, l.stated), "type", true));
        else if (l.computed && l.computed.type === ref) linked.push(matchView(Object.assign({ category }, l.computed), "type"));
      }
      blocks.push(block("Categories that stand for it", linked));
    }
    if (isRel) {
      blocks.push(block(`Sources (${r.sources.length})`, links(r.sources.map(refLink))));
      blocks.push(block(`Targets (${r.targets.length})`, links(r.targets.map(refLink))));
    } else {
      blocks.push(block("Rules as source", rulesBlock(r.rulesOut)));
      blocks.push(block("Rules as target", rulesBlock(r.rulesIn)));
      // Grouped by side and by the ancestor they come through: its own first.
      const guidance = new Map();
      for (const g of r.guidance) {
        const k = `${g.via ? 1 : 0}|${g.side}|${g.via || ""}`;
        if (!guidance.has(k)) guidance.set(k, { side: g.side, via: g.via, rels: [] });
        guidance.get(k).rels.push(g.rel);
      }
      blocks.push(block("Domain and range guidance", links([...guidance.keys()].sort().map((k) => {
        const g = guidance.get(k);
        return h("div", {}, g.side === "domain" ? "Source of " : "Target of ", g.rels.map((rel, i) => [i ? ", " : "", refLink(rel)]), via(g.via));
      }))));
    }
    blocks.push(block("Attributes", links(r.attributes.map((a) => {
      const attr = ctx.attributes.find((x) => x.id === a.id) || {};
      // A base's attribute is named, with its language; the project's own opens its page.
      const name = attr.base
        ? h("span", { title: a.id }, `${attr.label || core.humanize(a.id.slice(a.id.indexOf(":") + 1))} (${attr.baseTitle})`)
        : h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); go("attributes", a.id); } }, attr.label || core.humanize(a.id));
      return h("div", {}, name, via(a.via));
    }))));
    blocks.push(block("Proposal orders", links(r.proposalOrders.map((o) => {
      const order = project.proposalOrders.find((x) => x.id === o.id) || {};
      const name = order.label || core.humanize(o.id);
      return h("div", {}, name, h("span", { class: "muted" }, o.side === "member" ? `: place ${o.position} of ${o.of}` : o.side === "domain" ? ": its sources" : ": its targets"), via(o.via));
    }))));
    blocks.push(block("Viewpoints", links(r.viewpoints.map((id) => {
      const v = project.viewpoints.find((x) => x.id === id);
      return h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); go("viewpoints", id); } }, (v && v.label) || core.humanize(id));
    }))));
    box.appendChild(h("summary", {}, "Relations"));
    box.appendChild(relationsDiagram(r));
    box.appendChild(h("div", { class: "rel-grid" }, blocks));
    box.appendChild(h("p", { class: "small" }, h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); ui.matrixRel = isRel ? ref : ""; ui.matrixRowCat = ""; go("rules"); } }, "Open the rules matrix")));
    return box;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  /** The item with its parents above, its subtypes below and its categories beside it (SReq 11.4). Click a box to open it. */
  function relationsDiagram(r) {
    const W = 680, NH = 26, GAP = 34, PAD = 6, MAX = 7;
    const isRel = r.kind === "relationship";
    const short = (s) => (s.length > 22 ? s.slice(0, 21) + "…" : s);
    const width = (s) => Math.round(Math.min(160, Math.max(60, s.length * 6.4 + 22)));
    const ups = r.parents.length ? r.parents : [isRel ? core.RELATIONSHIP_ROOT : core.ELEMENT_ROOT];
    const cats = r.categories.map((c) => c.id);
    const area = cats.length ? Math.round(W * 0.66) : W;
    const yTop = PAD, yMid = PAD + NH + GAP, yBot = yMid + NH + GAP;
    const row = (items, y) => {
      const shown = items.slice(0, MAX).map((ref) => ({ ref, text: short(labelOf(ref)) }));
      if (items.length > MAX) shown.push({ ref: null, text: `+${items.length - MAX} more` });
      const ws = shown.map((n) => width(n.text));
      let x = Math.max(PAD, (area - ws.reduce((a, b) => a + b, 0) - 10 * (ws.length - 1)) / 2);
      return shown.map((n, i) => { const node = Object.assign(n, { x, y, w: ws[i] }); x += ws[i] + 10; return node; });
    };
    const top = row(ups, yTop);
    const self = row([r.ref], yMid)[0];
    const bottom = row(r.subtypes, yBot);
    const catH = cats.length * NH + Math.max(0, cats.length - 1) * 8;
    const catTop = Math.max(PAD, yMid + NH / 2 - catH / 2);
    const H = Math.max(bottom.length ? yBot + NH + PAD : yMid + NH + PAD, catTop + catH + PAD);
    const parentsText = ups.map(labelOf).join(" and ");
    const svg = svgEl("svg", {
      viewBox: `0 0 ${W} ${H}`, class: "rel-diagram", role: "img",
      "aria-label": `${labelOf(r.ref)}: a kind of ${parentsText}; ${r.subtypes.length} subtype(s); in ${cats.length} categor${cats.length === 1 ? "y" : "ies"}.`,
    });
    const marker = svgEl("marker", { id: "rel-tri", viewBox: "0 0 10 10", refX: "10", refY: "5", markerWidth: "9", markerHeight: "9", orient: "auto-start-reverse" }, svgEl("defs", {}, svg));
    svgEl("path", { d: "M0,0 L10,5 L0,10 Z", class: "tri" }, marker);
    const line = (x1, y1, x2, y2, cls) => svgEl("line", { x1, y1, x2, y2, class: "edge " + (cls || ""), "marker-end": cls ? null : "url(#rel-tri)" }, svg);
    // A subtype points at its parent with a hollow triangle, as a specialization is drawn.
    for (const p of top) line(self.x + self.w / 2, yMid, p.x + p.w / 2, yTop + NH);
    for (const c of bottom) line(c.x + c.w / 2, yBot, self.x + self.w / 2, yMid + NH);
    const catNodes = cats.map((id, i) => ({ cat: id, text: short(catLabel(id)), x: area + 22, y: catTop + i * (NH + 8), w: Math.min(W - area - 22 - PAD, width(short(catLabel(id)))) }));
    for (const c of catNodes) {
      const l = line(self.x + self.w, yMid + NH / 2, c.x, c.y + NH / 2, "cat");
      l.removeAttribute("marker-end");
    }
    const node = (n, cls, open) => {
      const g = svgEl("g", { class: "node " + cls + (open ? " link" : "") }, svg);
      svgEl("rect", { x: n.x, y: n.y, width: n.w, height: NH, rx: cls.includes("category") ? 13 : 5 }, g);
      const t = svgEl("text", { x: n.x + n.w / 2, y: n.y + NH / 2 + 4, "text-anchor": "middle" }, g);
      t.textContent = n.text;
      if (n.ref || n.cat) svgEl("title", {}, g).textContent = n.cat ? catPathLabel(n.cat) : n.ref;
      if (open) g.addEventListener("click", open);
    };
    const opener = (ref) => {
      const hit = ref ? core.conceptIndex(ctx).get(ref) : null;
      return hit && (hit.local || core.baseConcept(ctx, ref)) && ref !== r.ref ? () => go(hit.kind === "relationship" ? "relationships" : "elements", ref) : null;
    };
    const kind = (ref) => {
      if (!ref) return "more";
      const hit = core.conceptIndex(ctx).get(ref);
      return hit && hit.local ? "" : core.baseConcept(ctx, ref) ? "base" : "outside";
    };
    for (const n of top) node(n, kind(n.ref), opener(n.ref));
    node(self, "self", null);
    for (const n of bottom) node(n, kind(n.ref), opener(n.ref));
    for (const n of catNodes) node(n, "category", () => { ui.taxMember = ""; view.taxView = "tree"; go("taxonomy", n.cat); });
    return svg;
  }

  // ------------------------------------------------------------------ elements

  /**
   * The element hierarchy (SReq 11.1, 12.2): each type under each of its parents. The types of a language the
   * project extends come in, read only, with the project's own types where they specialize them; any other parent of
   * another language is an anchor.
   */
  function elementTree(filter) {
    const withBase = showingBases();
    const own = new Map(project.elements.map((e) => [e.id, e]));
    const base = new Map(withBase ? ctx.externalConcepts.filter((x) => x.base && x.kind === "element").map((x) => [x.ref, x]) : []);
    const kids = new Map();
    const put = (parent, child) => { if (!kids.has(parent)) kids.set(parent, []); kids.get(parent).push(child); };
    for (const e of project.elements) for (const p of e.parents.length ? e.parents : [core.ELEMENT_ROOT]) put(p, e.id);
    for (const x of base.values()) for (const p of x.parents) put(p, x.ref);
    // A base type starts open when one of the project's types is under it.
    const ownBelow = new Set();
    if (withBase) for (const e of project.elements) for (const a of core.ancestors(ctx, e.id)) ownBelow.add(a);
    const sorted = (ids) => ids.slice().sort((a, b) => (own.has(b) - own.has(a)) || labelOf(a).localeCompare(labelOf(b)) || a.localeCompare(b));
    const memo = new Map();
    const shows = (id, trail) => {
      if (!filter) return true;
      if (memo.has(id)) return memo.get(id);
      if (trail.has(id)) return false;
      const e = own.get(id);
      const x = base.get(id);
      const hit = (!!e && matches(filter, id, e.label, ...e.altLabels)) || (!!x && matches(filter, id, x.label))
        || (kids.get(id) || []).some((k) => shows(k, new Set(trail).add(id)));
      memo.set(id, hit);
      return hit;
    };
    const rows = [];
    const P = project.meta.prefix;
    const walk = (parent, parentKey, depth, trail) => {
      for (const id of sorted(kids.get(parent) || [])) {
        if (trail.has(id) || !shows(id, new Set())) continue;
        const key = `${parentKey}/${id}`;
        const below = kids.get(id) || [];
        const e = own.get(id);
        let row;
        if (e) {
          const others = e.parents.filter((p) => p !== parent);
          row = {
            key, parentKey, depth, id, from: parent, group: "element", kind: e.abstract ? "abstract" : "element",
            label: e.label || core.humanize(id), italic: e.abstract, title: `${P}:${id}`,
            swatch: e.abstract ? undefined : (e.notation && e.notation.fill) || "transparent",
            tag: e.abstract ? "abstract" : null,
            badges: others.length ? h("span", { class: "pill tiny", title: `Also under ${others.map(labelOf).join(", ")}` }, `+${others.length} parent${others.length > 1 ? "s" : ""}`) : null,
            expandable: below.length > 0, expanded: !!filter || isOpen("elements", key, true),
          };
          row.drag = dragOf("elements", row, "element", (x) => ({ id: x.id, from: x.from }));
        } else {
          const x = base.get(id);
          row = {
            key, parentKey, depth, id, from: parent, group: "base", kind: "base", label: x.label, italic: x.abstract,
            title: `${id}, ${x.baseTitle}: read only`, swatch: x.abstract ? undefined : x.fill || "transparent",
            tag: x.abstract ? "abstract" : id.slice(0, id.indexOf(":")),
            expandable: below.length > 0, expanded: !!filter || isOpen("elements", key, ownBelow.has(id)),
          };
        }
        row.drop = elementDrop(row);
        rows.push(row);
        if (below.length && row.expanded) walk(id, key, depth + 1, new Set(trail).add(id));
      }
    };
    const anchor = (ref, label, tag, kind) => {
      const below = kids.get(ref) || [];
      if (kind !== "root" && !below.length) return;
      if (filter && !below.some((k) => shows(k, new Set()))) return;
      const row = { key: ref, parentKey: null, depth: 0, id: ref, group: "anchor", kind, label, tag, title: ref, expandable: below.length > 0, expanded: !!filter || isOpen("elements", ref, true) };
      row.drop = elementDrop(row);
      rows.push(row);
      if (row.expanded) walk(ref, ref, 1, new Set());
    };
    anchor(core.ELEMENT_ROOT, "Element", "core", "root");
    // A parent of another language the studio does not show: its name, and its prefix as the tag.
    for (const ref of [...kids.keys()].filter((p) => p !== core.ELEMENT_ROOT && !own.has(p) && !base.has(p)).sort()) {
      anchor(ref, labelOf(ref) === ref ? core.humanize(ref.slice(ref.indexOf(":") + 1)) : labelOf(ref), core.isCurie(ref) ? ref.slice(0, ref.indexOf(":")) : "outside", "anchor");
    }
    markSelection("elements", rows, ui.sel.elements, (r) => r.group === "element" || r.group === "base");
    return {
      name: "elements", label: "Element types", rows,
      onSelect: (r, mods) => chooseRow("elements", r, mods, (x) => { if (x.group === "element" || x.group === "base") { ui.selKey.elements = x.key; go("elements", x.id); } }),
      onToggle: (r, open) => { setOpen("elements", r.key, open); render(); },
      menu: elementMenu,
      onMove: elementKeyMove,
    };
  }

  /** A drop on an element tree row (SReq 11.2–11.3): move under it; with Alt, add it as a parent; on Element, leave the parent. */
  function elementDrop(row) {
    return {
      unfold: row.expandable && !row.expanded ? () => { setOpen("elements", row.key, true); render(); } : null,
      accept: (p, where, alt) => {
        if (p.kind !== "element") return null;
        const to = row.id;
        if (to === core.ELEMENT_ROOT) {
          const leaving = p.items.filter((it) => it.from !== core.ELEMENT_ROOT);
          if (!leaving.length) return { ok: false, hint: "Already at the top" };
          return { ok: true, hint: leaving.length === 1 ? `Stop specializing ${labelOf(leaving[0].from)}` : "Leave the parents they are under", run: () => change(() => leaving.forEach((it) => core.removeParent(project, it.id, it.from))) };
        }
        const refused = p.items.find((it) => !core.canSpecialize(ctx, it.id, to));
        if (refused) return { ok: false, hint: refused.id === to ? "Not under itself" : `${labelOf(to)} is one of its subtypes` };
        if (alt) {
          const adding = p.items.filter((it) => !core.parentsOf(project, it.id).includes(to));
          if (!adding.length) return { ok: false, hint: `Already a kind of ${labelOf(to)}` };
          return { ok: true, hint: `Also a kind of ${labelOf(to)}`, run: () => change(() => adding.forEach((it) => core.addParent(project, it.id, to))) };
        }
        const moving = p.items.filter((it) => it.from !== to);
        if (!moving.length) return { ok: false, hint: "Already here" };
        return { ok: true, hint: `Move under ${labelOf(to)}. With Alt: add it as a parent`, run: () => change(() => moving.forEach((it) => core.moveParent(project, it.id, it.from, to))) };
      },
    };
  }

  function elementMenu(row) {
    if (row.group === "base") {
      return [
        { label: "Open", run: () => { ui.selKey.elements = row.key; go("elements", row.id); } },
        "-",
        { label: "New subtype of it", run: () => addElement(false, row.id) },
        { label: "New abstract subtype of it", run: () => addElement(true, row.id) },
      ];
    }
    if (row.group === "anchor") {
      return [
        { label: row.kind === "root" ? "New element type" : "New subtype", run: () => addElement(false, row.id) },
        { label: row.kind === "root" ? "New abstract type" : "New abstract subtype", run: () => addElement(true, row.id) },
      ];
    }
    const e = project.elements.find((x) => x.id === row.id);
    if (!e) return [];
    const at = () => rowAnchor("elements", row.key);
    return [
      { label: "Open", run: () => { ui.selKey.elements = row.key; go("elements", row.id); } },
      "-",
      { label: "New subtype", run: () => addElement(false, row.id) },
      { label: "Move under…", run: () => pickElementParent(row, false, at()) },
      { label: "Add a parent…", run: () => pickElementParent(row, true, at()) },
      row.from !== core.ELEMENT_ROOT ? { label: `Stop specializing ${labelOf(row.from)}`, run: () => change(() => core.removeParent(project, row.id, row.from)) } : null,
      { label: "Classify in…", run: () => pickCategoryFor(row.id, at()) },
      "-",
      { label: "Duplicate", run: () => duplicateElement(e) },
      { label: "Delete…", danger: true, run: () => deleteItem("elements", "elements", e, "element") },
    ];
  }

  /** "Move under…" and "Add a parent…": a parent picked from the hierarchy; itself and its subtypes cannot be. */
  function pickElementParent(row, add, at) {
    const parents = core.parentsOf(project, row.id);
    const choices = elementChoices((x) => core.canSpecialize(project, row.id, x) && !parents.includes(x),
      (x) => (x === row.id ? "itself" : parents.includes(x) ? "already a parent" : "one of its subtypes"));
    kit.picker(at, add ? `Add a parent to ${row.label}` : `Move ${row.label} under`, choices,
      (to) => change(() => (add ? core.addParent(project, row.id, to) : core.moveParent(project, row.id, row.from, to))));
  }

  /** Alt+Right puts a type under the one above it; Alt+Left takes it out to its parent's parent. */
  function elementKeyMove(row, dir) {
    if (row.group !== "element") return;
    const rows = ui.rows.elements || [];
    if (dir === "up" || dir === "down") { toast("Subtypes are listed by name: they have no order to change."); return; }
    if (dir === "right") {
      const sib = rows.slice(0, rows.indexOf(row)).reverse().find((r) => r.parentKey === row.parentKey);
      if (!sib || sib.group !== "element") { toast("There is no type above it to go under."); return; }
      if (!core.canSpecialize(project, row.id, sib.id)) { toast(`${row.label} cannot go under ${sib.label}.`); return; }
      setOpen("elements", sib.key, true);
      ui.focusAfter = { scope: "elements", key: `${sib.key}/${row.id}`, id: row.id };
      change(() => core.moveParent(project, row.id, row.from, sib.id));
      return;
    }
    const parentRow = rows.find((r) => r.key === row.parentKey);
    if (!parentRow || parentRow.group !== "element") { toast("It is at the top already."); return; }
    ui.focusAfter = { scope: "elements", key: `${parentRow.parentKey}/${row.id}`, id: row.id };
    change(() => core.moveParent(project, row.id, row.from, parentRow.from));
  }

  /** The switch that shows or hides the types of the languages the project extends (SReq 12.2), when there are any. */
  function baseSwitch() {
    if (!bases.length) return null;
    const box = h("input", { type: "checkbox" });
    box.checked = view.showBase !== false;
    box.addEventListener("change", () => { view.showBase = box.checked; saveView(); render(); });
    return h("label", { class: "check small base-switch", title: "Their types are shown read only; yours can specialize them." }, box, `Show ${bases.map((b) => b.title).join(", ")}`);
  }

  function viewElements() {
    const tools = [
      h("button", { class: "btn small", onclick: () => addElement(false) }, "+ Element"),
      h("button", { class: "btn small", onclick: () => addElement(true) }, "+ Abstract"),
      baseSwitch(),
    ];
    return h("div", {},
      pageHead("Element types", "Each becomes an owl:Class under arch:Element. A type with two parents appears under both. Drag a type onto another to move it there, or hold Alt to add a parent instead; each row's ⋯ menu does the same, and Alt+Right and Alt+Left move the focused row in and out."),
      masterDetail("elements", { tree: elementTree, tools, detail: elementDetail, emptyText: "No element types yet." }));
  }

  /** A new type, under `parent` (arch:Element: none) or, when none is given, under the selected abstract type. */
  function addElement(abstract, parent) {
    const id = uniqueId(abstract ? "NewAbstractElement" : "NewElement", "concept");
    const sel = project.elements.find((e) => e.id === ui.sel.elements);
    const parents = parent !== undefined ? (parent === core.ELEMENT_ROOT ? [] : [parent]) : sel && sel.abstract ? [sel.id] : [];
    if (parents[0]) unfoldItem("elements", parents[0]);
    ui.tab = "elements";
    change(() => {
      project.elements.push({ id, label: core.humanize(id), altLabels: [], definition: "", scopeNote: "", example: "", changeNote: "", parents, abstract, categories: [], notation: abstract ? {} : { fill: "#e8f1fb", stroke: "#333333", shape: "rectangle" } });
      ui.sel.elements = id;
      ui.selKey.elements = "";
    });
  }

  /**
   * A type of a language the project extends (SReq 12.3): read only here, with what it is related to, the project's
   * types among them, and a way to specialize it.
   */
  function baseDetail(ref) {
    const x = core.baseConcept(ctx, ref);
    if (!x) return null;
    const isRel = x.kind === "relationship";
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, x.label), h("span", { class: "pill" }, ref), h("span", { class: "pill accent" }, x.baseTitle),
        x.abstract ? h("span", { class: "pill" }, "abstract") : null,
        h("button", { class: "btn small", onclick: () => (isRel ? addRelationship(ref) : addElement(false, ref)) }, isRel ? "New kind of it" : "New subtype"),
        isRel ? null : h("button", { class: "btn small", onclick: () => addElement(true, ref) }, "New abstract subtype")),
      h("p", { class: "small muted" }, `A type of ${x.baseTitle}, which this metamodel extends: read only here. Your types can specialize it; drag one onto it, or use its menu.`),
      x.definition ? h("p", { class: "base-def" }, x.definition) : null,
      relationsPanel(ref));
  }

  function elementDetail(id) {
    const e = project.elements.find((x) => x.id === id);
    if (!e) return baseDetail(id);
    const parentOpts = elementOptions(true).filter((o) => o.value !== e.id && !core.descendants(project, e.id).has(o.value));
    const n = e.notation || (e.notation = {});
    const setCategories = (list) => {
      for (const c of e.categories.filter((x) => !list.includes(x))) core.unclassify(project, e.id, c);
      for (const c of list) core.classify(project, e.id, c);
    };
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, e.label || core.humanize(e.id)), h("span", { class: "pill" }, `${project.meta.prefix}:${e.id}`),
        e.abstract ? h("span", { class: "pill" }, "abstract") : null,
        h("button", { class: "btn small", onclick: () => duplicateElement(e) }, "Duplicate"), deleteButton("elements", "elements", e, "element")),
      inlineIssues("elements", e.id),
      relationsPanel(e.id),
      h("div", { class: "grid2" },
        idField("elements", "concept", e, "Element"),
        field("Label (skos:prefLabel)", textInput(() => e.label, (v) => { e.label = v; })),
        field("Specializes (rdfs:subClassOf)", chips(() => e.parents, (v) => { e.parents = v; }, parentOpts, { free: curieRe, placeholder: "Add parent type…", mutate: change }), "Empty means arch:Element. External types (am4:…) are allowed.", "span2"),
        field("Alternative labels (skos:altLabel)", chips(() => e.altLabels, (v) => { e.altLabels = v; }, [], { free: /.+/, placeholder: "Type and press Enter…" })),
        field("Taxonomy categories", chips(() => e.categories, setCategories, catOptions(), { placeholder: "Add category…", mutate: change })),
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
          field("Shape", shapeSelect(() => n.shape, (v) => { n.shape = v; })),
          h("div", { style: { marginLeft: "12px" } }, shapeSvg(n, 90, 54, e.label || e.id)))));
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

  /** Core-vis shapes, the built-in own shapes and the project's own shapes (SReq 6.3, 6.5). */
  function shapeSelect(get, set) {
    const groups = [["Core-vis", "core"], ["Built in", "builtin"], ["Own", "own"]];
    const choices = core.shapeChoices(project);
    const el = h("select", {}, groups.map(([label, kind]) => {
      const opts = choices.filter((c) => c.kind === kind);
      return opts.length ? h("optgroup", { label }, opts.map((o) => h("option", { value: o.value }, o.label))) : null;
    }));
    el.value = get() || "rectangle";
    el.addEventListener("change", () => mutate(() => set(el.value)));
    return el;
  }

  /**
   * A preview of an element's figure. An own shape the studio builds in is drawn as itself; another is drawn as
   * its fallback (tasks.md, Known limitations).
   */
  function shapeSvg(n, w, hgt, label) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", w); svg.setAttribute("height", hgt); svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
    const fill = n.fill || "#ffffff", stroke = n.stroke || "#333333";
    const mk = (tag, attrs) => { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); svg.appendChild(el); return el; };
    const common = { fill, stroke, "stroke-width": 1.4 };
    const p = 3, W = w - 2 * p, H = hgt - 2 * p;
    const resolved = core.resolveShape(project, n.shape);
    let figure = n.shape || "rectangle";
    if (resolved && resolved.kind === "own") {
      const builtin = resolved.builtin || (core.BUILTIN_SHAPES[resolved.id.toLowerCase()] ? resolved.id.toLowerCase() : "");
      figure = builtin || resolved.definition.fallback || "rectangle";
    }
    switch (figure) {
      case "octagon": {
        const c = Math.min(10, H / 3);
        mk("polygon", Object.assign({ points: `${p + c},${p} ${w - p - c},${p} ${w - p},${p + c} ${w - p},${hgt - p - c} ${w - p - c},${hgt - p} ${p + c},${hgt - p} ${p},${hgt - p - c} ${p},${p + c}` }, common));
        break;
      }
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

  /**
   * The relationship types as a tree of what each is a kind of (SReq 11.1, 12.2). The types of a language the
   * project extends come in, read only, with the project's own under them; any other parent is an anchor.
   */
  function relationshipTree(filter) {
    const withBase = showingBases();
    const own = new Map(project.relationships.map((r) => [r.id, r]));
    const base = new Map(withBase ? ctx.externalConcepts.filter((x) => x.base && x.kind === "relationship").map((x) => [x.ref, x]) : []);
    const kids = new Map();
    const put = (parent, child) => { if (!kids.has(parent)) kids.set(parent, []); kids.get(parent).push(child); };
    for (const r of project.relationships) put(r.parent || core.RELATIONSHIP_ROOT, r.id);
    for (const x of base.values()) put(x.parents[0] || core.RELATIONSHIP_ROOT, x.ref);
    const ownBelow = new Set();
    if (withBase) for (const r of project.relationships) for (const a of core.relationshipPath(ctx, r.id)) ownBelow.add(a);
    const sorted = (ids) => ids.slice().sort((a, b) => (own.has(b) - own.has(a)) || labelOf(a).localeCompare(labelOf(b)) || a.localeCompare(b));
    const memo = new Map();
    const shows = (id, trail) => {
      if (!filter) return true;
      if (memo.has(id)) return memo.get(id);
      if (trail.has(id)) return false;
      const r = own.get(id);
      const x = base.get(id);
      const hit = (!!r && matches(filter, id, r.label, r.predicate, r.notation)) || (!!x && matches(filter, id, x.label, x.notation))
        || (kids.get(id) || []).some((k) => shows(k, new Set(trail).add(id)));
      memo.set(id, hit);
      return hit;
    };
    const rows = [];
    const P = project.meta.prefix;
    const walk = (parent, parentKey, depth, trail) => {
      for (const id of sorted(kids.get(parent) || [])) {
        if (trail.has(id) || !shows(id, new Set())) continue;
        const key = `${parentKey}/${id}`;
        const below = kids.get(id) || [];
        const r = own.get(id);
        let row;
        if (r) {
          row = {
            key, parentKey, depth, id, from: parent, group: "relationship", kind: "relationship", icon: "↗",
            label: r.label || core.humanize(id), title: `${P}:${id}`, tag: [r.notation, r.predicate].filter(Boolean).join(" · "),
            expandable: below.length > 0, expanded: !!filter || isOpen("relationships", key, true),
          };
          row.drag = dragOf("relationships", row, "relationship", (x) => ({ id: x.id, from: x.from }));
        } else {
          const x = base.get(id);
          row = {
            key, parentKey, depth, id, from: parent, group: "base", kind: "base", icon: "↗", label: x.label,
            title: `${id}, ${x.baseTitle}: read only`, tag: [x.notation, id.slice(0, id.indexOf(":"))].filter(Boolean).join(" · "),
            expandable: below.length > 0, expanded: !!filter || isOpen("relationships", key, ownBelow.has(id)),
          };
        }
        row.drop = relationshipDrop(row);
        rows.push(row);
        if (below.length && row.expanded) walk(id, key, depth + 1, new Set(trail).add(id));
      }
    };
    const anchor = (ref, label, tag, kind) => {
      const below = kids.get(ref) || [];
      if (kind !== "root" && !below.length) return;
      if (filter && !below.some((k) => shows(k, new Set()))) return;
      const row = { key: ref, parentKey: null, depth: 0, id: ref, group: "anchor", kind, label, tag, title: ref, expandable: below.length > 0, expanded: !!filter || isOpen("relationships", ref, true) };
      row.drop = relationshipDrop(row);
      rows.push(row);
      if (row.expanded) walk(ref, ref, 1, new Set());
    };
    anchor(core.RELATIONSHIP_ROOT, "Qualified relationship", "core", "root");
    for (const ref of [...kids.keys()].filter((p) => p !== core.RELATIONSHIP_ROOT && !own.has(p) && !base.has(p)).sort()) {
      anchor(ref, labelOf(ref) === ref && core.isCurie(ref) ? core.humanize(ref.slice(ref.indexOf(":") + 1)) : labelOf(ref), core.isCurie(ref) ? ref.slice(0, ref.indexOf(":")) : "outside", "anchor");
    }
    markSelection("relationships", rows, ui.sel.relationships, (r) => r.group === "relationship" || r.group === "base");
    return {
      name: "relationships", label: "Relationship types", rows,
      onSelect: (r, mods) => chooseRow("relationships", r, mods, (x) => { if (x.group === "relationship" || x.group === "base") { ui.selKey.relationships = x.key; go("relationships", x.id); } }),
      onToggle: (r, open) => { setOpen("relationships", r.key, open); render(); },
      menu: relationshipMenu,
      onMove: relationshipKeyMove,
    };
  }

  /** A drop on a relationship row makes the dragged types kinds of it; on the root, kinds of no other. Never of their own kinds. */
  function relationshipDrop(row) {
    return {
      unfold: row.expandable && !row.expanded ? () => { setOpen("relationships", row.key, true); render(); } : null,
      accept: (p) => {
        if (p.kind !== "relationship") return null;
        const to = row.id === core.RELATIONSHIP_ROOT ? "" : row.id;
        const moving = p.items.filter((it) => (it.from === core.RELATIONSHIP_ROOT ? "" : it.from) !== to);
        if (!moving.length) return { ok: false, hint: "Already here" };
        const refused = moving.find((it) => to && (it.id === to || core.relationshipDescendants(project, it.id).has(to)));
        if (refused) return { ok: false, hint: refused.id === to ? "Not a kind of itself" : `${labelOf(to)} is one of its kinds` };
        return { ok: true, hint: to ? `A kind of ${labelOf(to)}` : "A kind of no other relationship type", run: () => mutate(() => moving.forEach((it) => core.setRelationshipParent(project, it.id, to))) };
      },
    };
  }

  function relationshipMenu(row) {
    if (row.group === "anchor") return [{ label: row.kind === "root" ? "New relationship type" : "New kind of it", run: () => addRelationship(row.kind === "root" ? "" : row.id) }];
    if (row.group === "base") {
      return [
        { label: "Open", run: () => { ui.selKey.relationships = row.key; go("relationships", row.id); } },
        "-",
        { label: "New kind of it", run: () => addRelationship(row.id) },
      ];
    }
    const r = project.relationships.find((x) => x.id === row.id);
    if (!r) return [];
    const at = () => rowAnchor("relationships", row.key);
    return [
      { label: "Open", run: () => { ui.selKey.relationships = row.key; go("relationships", row.id); } },
      "-",
      { label: "New kind of it", run: () => addRelationship(row.id) },
      { label: "Move under…", run: () => pickRelationshipParent(row, at()) },
      r.parent ? { label: "Make it a kind of no other", run: () => mutate(() => core.setRelationshipParent(project, row.id, "")) } : null,
      { label: "Classify in…", run: () => pickCategoryFor(row.id, at()) },
      "-",
      { label: "Delete…", danger: true, run: () => deleteItem("relationships", "relationships", r, "relationship") },
    ];
  }

  function pickRelationshipParent(row, at) {
    const below = core.relationshipDescendants(project, row.id);
    const r = project.relationships.find((x) => x.id === row.id);
    const out = [];
    const walk = (parent, depth) => {
      for (const x of project.relationships.filter((y) => (y.parent || "") === parent).sort(byLabelItem)) {
        const ok = !below.has(x.id) && x.id !== r.parent;
        out.push({ value: x.id, label: x.label || core.humanize(x.id), depth, disabled: !ok, note: ok ? "" : x.id === r.parent ? "already its parent" : "itself or one of its kinds" });
        walk(x.id, depth + 1);
      }
    };
    walk("", 0);
    kit.picker(at, `Make ${row.label} a kind of`, out, (to) => mutate(() => core.setRelationshipParent(project, row.id, to)));
  }

  /** Alt+Right makes a type a kind of the one above it; Alt+Left a kind of its parent's parent. */
  function relationshipKeyMove(row, dir) {
    if (row.group !== "relationship") return;
    const rows = ui.rows.relationships || [];
    if (dir === "up" || dir === "down") { toast("Relationship types are listed by name: they have no order to change here."); return; }
    if (dir === "right") {
      const sib = rows.slice(0, rows.indexOf(row)).reverse().find((r) => r.parentKey === row.parentKey);
      if (!sib || sib.group !== "relationship") { toast("There is no relationship type above it to go under."); return; }
      if (core.relationshipDescendants(project, row.id).has(sib.id)) { toast(`${row.label} cannot go under ${sib.label}.`); return; }
      setOpen("relationships", sib.key, true);
      ui.focusAfter = { scope: "relationships", key: `${sib.key}/${row.id}`, id: row.id };
      mutate(() => core.setRelationshipParent(project, row.id, sib.id));
      return;
    }
    const parentRow = rows.find((r) => r.key === row.parentKey);
    if (!parentRow || parentRow.group !== "relationship") { toast("It is at the top already."); return; }
    ui.focusAfter = { scope: "relationships", key: `${parentRow.parentKey}/${row.id}`, id: row.id };
    mutate(() => core.setRelationshipParent(project, row.id, parentRow.from));
  }

  function viewRelationships() {
    const tools = [h("button", { class: "btn small", onclick: () => addRelationship() }, "+ Relationship"), baseSwitch()];
    return h("div", {},
      pageHead("Relationship types", "Each becomes three terms, as in the published languages: a QualifiedRelationship subclass (the relationship as a resource), its direct predicate (arch:unqualifiedForm) for traversal, and a qualified predicate to navigate to the resource. Drag a type onto another to make it a kind of it."),
      masterDetail("relationships", { tree: relationshipTree, tools, detail: relationshipDetail, emptyText: "No relationship types yet." }));
  }

  /** A new relationship type; a kind of `parent` keeps its predicate and line (SReq 2.2). */
  function addRelationship(parent) {
    const id = uniqueId("NewRelationship", "concept");
    const p = parent ? project.relationships.find((x) => x.id === parent) : null;
    if (parent) unfoldItem("relationships", parent);
    ui.tab = "relationships";
    mutate(() => {
      project.relationships.push({ id, label: core.humanize(id), predicate: p ? p.predicate : "relatesTo", predicateLabel: "", predicateDefinition: "", notation: "", parent: parent || "", definition: "", scopeNote: "", changeNote: "", domain: [], range: [], categories: [], style: p ? Object.assign({}, p.style) : { line: "solid", source: "none", target: "open" } });
      ui.sel.relationships = id;
      ui.selKey.relationships = "";
    });
  }

  function relationshipDetail(id) {
    const r = project.relationships.find((x) => x.id === id);
    if (!r) return baseDetail(id);
    const P = project.meta.prefix;
    const pred = r.predicate || core.suggestPredicate(r.id);
    const s = r.style || (r.style = {});
    const ruleCount = (project.rules[r.id] || []).length;
    const kinds = core.relationshipDescendants(project, r.id);
    const parentOpts = [{ value: "", label: "— none (arch:QualifiedRelationship) —" }].concat(
      project.relationships.filter((x) => !kinds.has(x.id)).map((x) => ({ value: x.id, label: x.label || x.id })));
    const setCategories = (list) => {
      for (const c of r.categories.filter((x) => !list.includes(x))) core.unclassify(project, r.id, c);
      for (const c of list) core.classify(project, r.id, c);
    };
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, r.label || core.humanize(r.id)),
        r.notation ? h("span", { class: "pill accent mono" }, r.notation) : null,
        deleteButton("relationships", "relationships", r, "relationship")),
      inlineIssues("relationships", r.id),
      relationsPanel(r.id),
      h("div", { class: "grid3" },
        idField("relationships", "concept", r, "Class"),
        field("Label", textInput(() => r.label, (v) => { r.label = v; })),
        field("Notation letter (skos:notation)", textInput(() => r.notation, (v) => { r.notation = v.trim(); }, { class: "mono", maxlength: "4" }), "Used in the rules matrix"),
        field("Direct predicate (arch:unqualifiedForm)", textInput(() => r.predicate, (v) => { r.predicate = v.trim(); }, { class: "mono" }), `${P}:${pred}`),
        field("Predicate label", textInput(() => r.predicateLabel, (v) => { r.predicateLabel = v; }), "e.g. Serves"),
        field("Specializes", select(parentOpts, () => r.parent, (v) => { core.setRelationshipParent(project, r.id, v); }),
          "A subtype keeping the parent's predicate declares no predicate of its own (like ReadAccess → accesses)"),
        field("Domain guidance (arch:domainIncludes)", chips(() => r.domain, (v) => { r.domain = v; }, elementOptions(true), { free: curieRe, placeholder: "Source types…" }), "Guidance, not validation — empty means any element", "span3"),
        field("Range guidance (arch:rangeIncludes)", chips(() => r.range, (v) => { r.range = v; }, elementOptions(true), { free: curieRe, placeholder: "Target types…" }), null, "span3"),
        field("Taxonomy categories", chips(() => r.categories, setCategories, catOptions()), null, "span3"),
        field("Definition", textArea(() => r.definition, (v) => { r.definition = v; }, 3), null, "span3"),
        field("Predicate definition", textArea(() => r.predicateDefinition, (v) => { r.predicateDefinition = v; }, 2), "Defaults to the definition", "span3"),
        field("Scope note", textArea(() => r.scopeNote, (v) => { r.scopeNote = v; }, 2), null, "span2"),
        field("Change note", textArea(() => r.changeNote, (v) => { r.changeNote = v; }, 2))),
      h("div", { style: { marginTop: "14px" } },
        h("h3", {}, "Notation"),
        h("div", { class: "row" },
          field("Line", select(core.LINE_STYLES.map((x) => ({ value: x, label: x })), () => s.line || "solid", (v) => { s.line = v; })),
          field("Source end", select(decorationOptions(), () => s.source || "none", (v) => { s.source = v; })),
          field("Target end", select(decorationOptions(), () => s.target || "open", (v) => { s.target = v; })),
          field("Colour", colorInput(() => s.stroke || "#333333", (v) => { s.stroke = v; })),
          lineSvg(s))),
      h("div", { style: { marginTop: "14px" } },
        h("h3", {}, "Rules"),
        h("p", { class: "small" }, ruleCount ? `${ruleCount} allowed source → target pair(s). ` : "No rules: this relationship is not constrained by the SHACL shapes. ",
          h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); ui.matrixRel = r.id; go("rules"); } }, "Edit in the matrix"))));
  }

  /** The line ends core-vis decorates either end of a line with (SReq 6.4). */
  const DECORATION_LABELS = {
    none: "none", open: "open arrowhead", filled: "filled arrowhead", "hollow-triangle": "hollow triangle",
    diamond: "hollow diamond", "filled-diamond": "filled diamond", circle: "dot", half: "half arrowhead",
  };
  const decorationOptions = () => core.DECORATIONS.map((x) => ({ value: x, label: DECORATION_LABELS[x] || x }));

  function lineSvg(s) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", 130); svg.setAttribute("height", 30); svg.setAttribute("viewBox", "0 0 130 30");
    const color = s.stroke || "currentColor";
    const line = document.createElementNS(ns, "line");
    Object.entries({ x1: 10, y1: 15, x2: 118, y2: 15, stroke: color, "stroke-width": 1.6, "stroke-dasharray": s.line === "dashed" ? "6 4" : s.line === "dotted" ? "1.5 3" : "" }).forEach(([k, v]) => line.setAttribute(k, v));
    svg.appendChild(line);
    // Each marker is drawn with its tip at 0, pointing right: as it is at the target end, mirrored at the source.
    const markers = {
      open: ["M-12,-6 L0,0 L-12,6", "none"], filled: ["M-14,-6 L0,0 L-14,6 Z", color],
      "hollow-triangle": ["M-14,-7 L0,0 L-14,7 Z", "var(--panel)"], diamond: ["M-18,0 L-9,-5 L0,0 L-9,5 Z", "var(--panel)"],
      "filled-diamond": ["M-18,0 L-9,-5 L0,0 L-9,5 Z", color], circle: ["M-8,0 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0", color],
      half: ["M-12,-6 L0,0", "none"], none: ["", "none"],
    };
    const end = (kind, x, mirrored) => {
      const [d, fill] = markers[kind] || markers.none;
      if (!d) return;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d); path.setAttribute("fill", fill); path.setAttribute("stroke", color); path.setAttribute("stroke-width", 1.6);
      path.setAttribute("transform", `translate(${x},15)${mirrored ? " scale(-1,1)" : ""}`);
      svg.appendChild(path);
    };
    end(s.target || "open", 118, false);
    end(s.source || "none", 10, true);
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
    // With the switch on, the concrete types of the languages the project extends are rows and columns too (SReq 12.2).
    const concrete = core.concreteElements(view.matrixBase && bases.length ? ctx : project);
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
        bases.length ? (() => {
          const box = h("input", { type: "checkbox" });
          box.checked = !!view.matrixBase;
          box.addEventListener("change", () => { view.matrixBase = box.checked; saveView(); render(); });
          return h("label", { class: "check small", title: "Rules from your types to theirs, or between theirs, as your shapes allow" }, box, `With ${bases.map((b) => b.title).join(", ")}'s types`);
        })() : null,
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
          persist(); issues = linter.lint(project, { bases });
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

  // ------------------------------------------------------------------ taxonomy (SReq 4, 11.3, 11.5–11.7)

  function viewTaxonomy() {
    const grid = view.taxView === "grid";
    const switcher = h("div", { class: "seg", role: "group", "aria-label": "Show the taxonomy as" },
      [["tree", "Tree"], ["grid", "Grid"]].map(([v, label]) => h("button", {
        class: "btn small" + ((v === "grid") === grid ? " primary" : ""), type: "button", "aria-pressed": String((v === "grid") === grid),
        onclick: () => { view.taxView = v; saveView(); render(); },
      }, label)));
    return h("div", {},
      pageHead("Taxonomy", "The SKOS concept scheme that classifies the concepts (arch:conceptClassification): the groups a modelling tool's palette shows. Drag types into categories and categories into one another; hold Alt to add a type to a category without taking it out of the one it was in. Every row's ⋯ menu does the same.", switcher),
      grid ? taxonomyGrid() : taxonomyBoard());
  }

  function taxonomyBoard() {
    const tax = project.taxonomy;
    const t = taxonomyTree();
    const sel = tax.categories.find((c) => c.id === ui.sel.taxonomy);
    const member = ui.taxMember && (project.elements.some((e) => e.id === ui.taxMember) || project.relationships.some((r) => r.id === ui.taxMember)) ? ui.taxMember : "";
    const showMembers = h("input", { type: "checkbox" });
    showMembers.checked = view.showMembers !== false;
    showMembers.addEventListener("change", () => { view.showMembers = showMembers.checked; saveView(); render(); });
    return h("div", { class: "grid2 tax-board" },
      h("div", { class: "card" },
        field("Scheme label", textInput(() => tax.label, (v) => { tax.label = v; }, { placeholder: `${project.meta.title} Concept Scheme` })),
        h("div", { class: "row tax-tools" },
          h("button", { class: "btn small", onclick: () => addCategory("") }, "+ Top-level category"),
          h("span", { class: "spacer" }),
          h("label", { class: "check" }, showMembers, "Show members")),
        h("div", { class: "tax-tree", "data-scroll": "tax-tree" }, kit.tree(t).node)),
      h("div", {},
        member ? memberDetail(member) : sel ? categoryDetail(sel) : h("div", { class: "card empty" }, "Choose a category or a member on the left."),
        typesCard(),
        groupingCard(),
        proposalOrdersCard()));
  }

  /** The categories, each with its sub-categories and its members in their order (SReq 4.4, 11.1). */
  function taxonomyTree() {
    const tax = project.taxonomy;
    const collapsed = collapsedSet("taxonomy");
    const showMembers = view.showMembers !== false;
    const links = core.categoryLinks(project);
    const P = project.meta.prefix;
    const rows = [];
    const root = { key: "scheme", parentKey: null, depth: 0, id: "", group: "scheme", kind: "root", label: tax.label || `${project.meta.title} Concept Scheme`, tag: "scheme", expandable: tax.categories.length > 0, expanded: !collapsed.has("scheme") };
    root.drop = categoryDrop(root);
    rows.push(root);
    const walk = (parent, parentKey, depth, trail) => {
      for (const id of core.subcategories(project, parent)) {
        if (trail.has(id)) continue;
        const c = tax.categories.find((x) => x.id === id);
        const o = core.narrowerOrder(project, id);
        const members = showMembers ? o.members : [];
        const key = `${parentKey}/${id}`;
        const link = links.get(id) || {};
        const s = link.stated;
        const m = link.computed;
        const row = {
          key, parentKey, depth, id, parent, group: "category", kind: "category", label: c.label || core.humanize(id), title: `${P}tax:${id}`,
          tag: String(core.categoryMembers(project, id, true).length),
          badges: [
            // The type it says it stands for first; failing that, the one its members suggest.
            s ? h("span", { class: "pill tiny match " + (s.exact ? "exact" : "close"), title: s.exact ? `It stands for ${labelOf(s.type)}, and its element types are that type's subtypes` : `It stands for ${labelOf(s.type)}, but its element types differ from that type's subtypes` }, `stands for ${labelOf(s.type)}`)
              : m ? h("span", { class: "pill tiny match " + (m.exact ? "exact" : "close"), title: m.exact ? `Its element types are the subtypes of ${labelOf(m.type)}` : `Its element types are nearly the subtypes of ${labelOf(m.type)}` }, `${m.exact ? "=" : "≈"} ${labelOf(m.type)}`) : null,
            o.explicit ? h("span", { class: "pill tiny", title: `Written as ${P}tax:${core.orderName(id)}` }, "ordered") : null,
          ],
          expandable: o.categories.length + members.length > 0, expanded: !collapsed.has(key),
        };
        row.drag = dragOf("taxonomy", row, "category", (x) => ({ id: x.id, from: x.parent }));
        row.drop = categoryDrop(row);
        rows.push(row);
        if (!row.expandable || !row.expanded) continue;
        walk(id, key, depth + 1, new Set(trail).add(id));
        for (const ref of members) {
          const e = project.elements.find((x) => x.id === ref);
          const mrow = {
            key: `${key}/m:${ref}`, parentKey: key, depth: depth + 1, id: ref, cat: id, group: "type", kind: "member", label: labelOf(ref), title: `${P}:${ref}`,
            swatch: e && !e.abstract ? (e.notation && e.notation.fill) || "transparent" : undefined, icon: e ? null : "↗", italic: !!(e && e.abstract),
          };
          mrow.drag = dragOf("taxonomy", mrow, "type", (x) => ({ id: x.id, from: x.cat }));
          mrow.drop = memberDrop(mrow);
          rows.push(mrow);
        }
      }
    };
    if (root.expanded) walk("", "scheme", 1, new Set());
    // The taxonomies of the languages the project extends, read only, with the project's types where their base types are (SReq 12.4).
    if (showingBases()) for (const b of bases) baseSchemeRows(b, rows);
    if (ui.taxMember) markSelection("taxonomy", rows, ui.taxMember, (r) => r.group === "type");
    else markSelection("taxonomy", rows, ui.sel.taxonomy, (r) => r.group === "category");
    return {
      name: "taxonomy", label: "Taxonomy", rows,
      onSelect: (r, mods) => chooseRow("taxonomy", r, mods, (x) => {
        if (x.group === "type") { ui.taxMember = x.id; ui.selKey.taxonomy = x.key; ui.sel.taxonomy = x.cat; render(); }
        else if (x.group === "category") { ui.taxMember = ""; ui.selKey.taxonomy = x.key; ui.sel.taxonomy = x.id; render(); }
        else if (x.group === "inherited" || x.group === "basemember") go("elements", x.id);
        else if ((x.group === "basecat" || x.group === "basescheme") && x.expandable) { setOpen("taxonomy", x.key, !x.expanded); render(); }
      }),
      onToggle: (r, open) => { setOpen("taxonomy", r.key, open); render(); },
      menu: taxonomyMenu,
      onMove: taxonomyKeyMove,
    };
  }

  /**
   * A drop on a category row. A category dropped on its middle goes into it, on its top or bottom edge before or
   * after it; a type goes into it wherever it is dropped (SReq 11.3). On the scheme, a category becomes top level.
   */
  function categoryDrop(row) {
    const scheme = row.group === "scheme";
    return {
      between: !scheme,
      unfold: row.expandable && !row.expanded ? () => { setOpen("taxonomy", row.key, true); render(); } : null,
      accept: (p, where, alt) => {
        if (p.kind === "category") {
          if (scheme) {
            const moving = p.items.filter((it) => it.from);
            if (!moving.length) return { ok: false, hint: "Already at the top level" };
            return { ok: true, hint: "Make it a top-level category", run: () => mutate(() => moving.forEach((it) => core.moveCategory(project, it.id, ""))) };
          }
          const parent = where === "into" ? row.id : row.parent;
          const refused = p.items.find((it) => it.id === row.id || (parent && core.categoryDescendants(project, it.id).has(parent)));
          if (refused) return { ok: false, hint: "Not inside itself" };
          if (where === "into") {
            const moving = p.items.filter((it) => it.from !== row.id);
            if (!moving.length) return { ok: false, hint: "Already here" };
            return { ok: true, hint: `Into ${row.label}`, run: () => mutate(() => moving.forEach((it) => core.moveCategory(project, it.id, row.id))) };
          }
          const siblings = core.subcategories(project, row.parent);
          const before = where === "before" ? row.id : siblings[siblings.indexOf(row.id) + 1] || null;
          return { ok: true, hint: `${where === "before" ? "Before" : "After"} ${row.label}`, run: () => mutate(() => p.items.forEach((it) => core.moveCategory(project, it.id, row.parent, before === it.id ? null : before))) };
        }
        if (p.kind === "type" && !scheme) {
          const moving = p.items.filter((it) => (alt ? !categoriesOf(it.id).includes(row.id) : it.from !== row.id && (it.from || !categoriesOf(it.id).includes(row.id))));
          if (!moving.length) return { ok: false, hint: "Already here", where: "into" };
          const from = !alt && moving.length === 1 ? moving[0].from : null;
          return {
            ok: true, where: "into",
            hint: alt ? `Also in ${row.label}` : from ? `Move to ${row.label}. With Alt: keep it in ${catLabel(from)} too` : `Classify in ${row.label}`,
            run: () => change(() => moving.forEach((it) => core.classify(project, it.id, row.id, alt ? null : it.from))),
          };
        }
        return null;
      },
    };
  }

  /** A drop on a member row places the dragged types before or after it, in its category (SReq 11.7). */
  function memberDrop(row) {
    return {
      between: true,
      into: false,
      accept: (p, where, alt) => {
        if (p.kind !== "type") return null;
        const items = p.items.filter((it) => it.id !== row.id);
        if (!items.length) return { ok: false, hint: "Already here" };
        const members = core.categoryMembers(project, row.cat, false);
        const before = where === "before" ? row.id : members[members.indexOf(row.id) + 1] || null;
        const same = items.every((it) => it.from === row.cat);
        return {
          ok: true,
          hint: same ? `${where === "before" ? "Before" : "After"} ${row.label}` : `To ${catLabel(row.cat)}, ${where} ${row.label}`,
          run: () => change(() => {
            for (const it of items) {
              core.classify(project, it.id, row.cat, alt || it.from === row.cat ? null : it.from);
              core.reorder(project, row.cat, "members", it.id, before === it.id ? null : before);
            }
          }),
        };
      },
    };
  }

  function taxonomyMenu(row) {
    const at = () => rowAnchor("taxonomy", row.key);
    if (row.group === "scheme") return [{ label: "New top-level category", run: () => addCategory("") }];
    if (row.group === "inherited" || row.group === "basemember") return [{ label: "Open its page", run: () => go("elements", row.id) }];
    if (row.group === "basecat" || row.group === "basescheme") return [];
    if (row.group === "category") {
      const siblings = core.subcategories(project, row.parent);
      const i = siblings.indexOf(row.id);
      return [
        { label: "New sub-category", run: () => addCategory(row.id) },
        { label: "Move into…", run: () => pickCategoryParent(row, at()) },
        row.parent ? { label: "Make it top level", run: () => mutate(() => core.moveCategory(project, row.id, "")) } : null,
        { label: "Move up", disabled: i <= 0, run: () => shiftRow(row, -1) },
        { label: "Move down", disabled: i < 0 || i >= siblings.length - 1, run: () => shiftRow(row, 1) },
        core.narrowerOrder(project, row.id).explicit ? { label: "Clear its order", run: () => mutate(() => core.clearOrder(project, row.id)) } : null,
        "-",
        { label: "Delete…", danger: true, run: () => { if (confirm(`Delete category ${row.id}?`)) mutate(() => { core.removeRef(project, row.id, "taxonomy.categories"); if (ui.sel.taxonomy === row.id) ui.sel.taxonomy = null; }); } },
      ];
    }
    const members = core.categoryMembers(project, row.cat, false);
    const i = members.indexOf(row.id);
    const isRel = project.relationships.some((r) => r.id === row.id);
    return [
      { label: "Open its page", run: () => go(isRel ? "relationships" : "elements", row.id) },
      "-",
      { label: "Move to…", run: () => pickCategoryFor(row.id, at(), row.cat) },
      { label: "Also classify in…", run: () => pickCategoryFor(row.id, at()) },
      { label: `Take it out of ${catLabel(row.cat)}`, run: () => change(() => core.unclassify(project, row.id, row.cat)) },
      { label: "Move up", disabled: i <= 0, run: () => shiftRow(row, -1) },
      { label: "Move down", disabled: i < 0 || i >= members.length - 1, run: () => shiftRow(row, 1) },
    ];
  }

  /** A category among its siblings, or a member among its category's members, one place up or down (SReq 11.7). */
  function shiftRow(row, delta) {
    ui.focusAfter = { scope: "taxonomy", key: row.key, id: row.id };
    if (row.group === "category") mutate(() => core.shift(project, row.parent, "categories", row.id, delta));
    else mutate(() => core.shift(project, row.cat, "members", row.id, delta));
  }

  function pickCategoryParent(row, at) {
    const inside = core.categoryDescendants(project, row.id);
    const choices = [{ value: "", label: "Top level", depth: 0, disabled: !row.parent, note: row.parent ? "" : "already there" }]
      .concat(categoryChoices((c) => !inside.has(c) && c !== row.parent, (c) => (c === row.parent ? "already its parent" : "itself or inside it")));
    kit.picker(at, `Move ${row.label} into`, choices, (to) => mutate(() => core.moveCategory(project, row.id, to)));
  }

  /** Alt+Up and Alt+Down reorder; on a category, Alt+Right puts it into the one above, Alt+Left takes it out of its parent. */
  function taxonomyKeyMove(row, dir) {
    if (row.group !== "category" && row.group !== "type") return;
    if (dir === "up" || dir === "down") { shiftRow(row, dir === "up" ? -1 : 1); return; }
    if (row.group === "type") { toast("A type moves to another category from its menu: Move to…"); return; }
    if (dir === "right") {
      const siblings = core.subcategories(project, row.parent);
      const prev = siblings[siblings.indexOf(row.id) - 1];
      if (!prev) { toast("There is no category above it to go into."); return; }
      setOpen("taxonomy", `${row.parentKey}/${prev}`, true);
      ui.focusAfter = { scope: "taxonomy", key: `${row.parentKey}/${prev}/${row.id}`, id: row.id };
      mutate(() => core.moveCategory(project, row.id, prev));
      return;
    }
    if (!row.parent) { toast("It is at the top level already."); return; }
    const parentRow = (ui.rows.taxonomy || []).find((r) => r.key === row.parentKey);
    const grand = parentRow ? parentRow.parent || "" : "";
    const aunts = core.subcategories(project, grand);
    ui.focusAfter = { scope: "taxonomy", key: `${parentRow ? parentRow.parentKey : "scheme"}/${row.id}`, id: row.id };
    mutate(() => core.moveCategory(project, row.id, grand, aunts[aunts.indexOf(row.parent) + 1] || null));
  }

  function addCategory(parent) {
    const id = uniqueId("NewCategory", "taxonomy");
    if (parent) unfoldItem("taxonomy", parent);
    mutate(() => {
      project.taxonomy.categories.push({ id, label: core.humanize(id), definition: "", parent, categoryOrder: [], memberOrder: [], orderLabel: "" });
      ui.sel.taxonomy = id;
      ui.taxMember = "";
      ui.selKey.taxonomy = "";
    });
  }

  function categoryDetail(c) {
    const members = core.categoryMembers(project, c.id, false);
    const found = core.categoryMatches(project).get(c.id);
    const m = found ? Object.assign({ category: c.id }, found) : null;
    const o = core.narrowerOrder(project, c.id);
    const inside = core.categoryDescendants(project, c.id);
    const setMembers = (list) => {
      for (const id of members.filter((x) => !list.includes(x))) core.unclassify(project, id, c.id);
      for (const id of list) core.classify(project, id, c.id);
    };
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, c.label || c.id), h("span", { class: "pill" }, `${project.meta.prefix}tax:${c.id}`),
        h("button", { class: "btn danger small", onclick: () => { if (confirm(`Delete category ${c.id}?`)) mutate(() => { core.removeRef(project, c.id, "taxonomy.categories"); ui.sel.taxonomy = null; }); } }, "Delete")),
      inlineIssues("taxonomy", c.id),
      h("div", { class: "grid2" },
        idField("taxonomy", "taxonomy", c, "Category"),
        field("Label", textInput(() => c.label, (v) => { c.label = v; })),
        field("Parent", select([{ value: "", label: "— top level —" }].concat(catOptions().filter((x) => !inside.has(x.value))), () => c.parent, (v) => { core.moveCategory(project, c.id, v); })),
        field("Definition", textArea(() => c.definition, (v) => { c.definition = v; }, 2), null, "span2"),
        field("Members (skos:narrower)", chips(() => members, setMembers, elementOptions(true).filter((x) => !core.isCurie(x.value)).concat(relationshipOptions()), { mutate: change }), null, "span2")),
      standsForSection(c, m),
      h("h3", { style: { marginTop: "14px" } }, "Order"),
      o.explicit
        ? h("p", { class: "small" }, `It has an order of its own, written as ${project.meta.prefix}tax:${core.orderName(c.id)}: la-gram's palette follows it. `,
          h("button", { class: "btn small", onclick: () => mutate(() => core.clearOrder(project, c.id)) }, "Clear the order"))
        : h("p", { class: "small muted" }, "No order of its own: la-gram lists its groups and types by name. Drag a row in the tree, or press Alt+Up or Alt+Down on it, to give it one."));
  }

  /**
   * The element type a category stands for (SReq 4.6): the one it states, its rdfs:seeAlso, compared with its
   * members; and the one its members suggest, when that is another, with a way to state it (SReq 11.6).
   */
  function standsForSection(c, found) {
    const link = core.categoryLinks(project).get(c.id) || {};
    const stated = link.stated ? Object.assign({ category: c.id }, link.stated) : null;
    const options = [{ value: "", label: "— none —" }].concat(elementOptions(true).filter((o) => o.value !== core.ELEMENT_ROOT));
    if (c.standsFor && !options.some((o) => o.value === c.standsFor)) options.push({ value: c.standsFor, label: c.standsFor });
    return h("div", {},
      h("h3", { style: { marginTop: "14px" } }, "The type it stands for"),
      field("Stands for (rdfs:seeAlso)", select(options, () => c.standsFor, (v) => { c.standsFor = v; }),
        "The element type this category is the taxonomy's name for, as the published taxonomies link a concept to its class."),
      stated ? matchView(stated, "category", true) : null,
      found && (!stated || found.type !== stated.type) ? h("div", {},
        matchView(found, "category"),
        h("button", { class: "btn small", type: "button", onclick: () => mutate(() => { c.standsFor = found.type; }) }, `Say it stands for ${labelOf(found.type)}`)) : null,
      !stated && !found ? h("p", { class: "small muted" }, "No abstract type has these element types, or nearly these, as its subtypes.") : null);
  }

  /**
   * A language the project extends, its taxonomy read only (SReq 12.4): its categories with their types, and the
   * project's types in the categories of the base types they specialize, each where it is deepest.
   */
  function baseSchemeRows(b, rows) {
    const bp = b.project;
    const top = `base ${b.namespace}`;
    const ownIn = new Map();
    for (const e of project.elements) {
      for (const a of core.ancestors(ctx, e.id)) {
        const x = core.baseConcept(ctx, a);
        if (!x || x.base !== b.namespace) continue;
        const local = a.slice(a.indexOf(":") + 1);
        const item = bp.elements.find((y) => y.id === local);
        const cats = ((item && item.categories) || []).concat(bp.taxonomy.categories.filter((c) => c.standsFor === local).map((c) => c.id));
        for (const c of cats) {
          if (!ownIn.has(c)) ownIn.set(c, []);
          if (!ownIn.get(c).some((t) => t.id === e.id)) ownIn.get(c).push({ id: e.id, via: a });
        }
      }
    }
    const below = (c) => [...core.categoryDescendants(bp, c)].filter((d) => d !== c);
    const mine = (c) => (ownIn.get(c) || []).filter((t) => !below(c).some((d) => (ownIn.get(d) || []).some((u) => u.id === t.id)));
    const anyMine = (c) => [c].concat(below(c)).some((d) => (ownIn.get(d) || []).length);
    const root = {
      key: top, parentKey: null, depth: 0, id: "", group: "basescheme", kind: "root base", noMenu: true, label: bp.taxonomy.label || `${b.title} Concept Scheme`,
      tag: `${b.title}, read only`, expandable: bp.taxonomy.categories.length > 0, expanded: isOpen("taxonomy", top, false),
    };
    rows.push(root);
    if (!root.expanded) return;
    const walk = (parent, parentKey, depth, trail) => {
      for (const id of core.subcategories(bp, parent)) {
        if (trail.has(id)) continue;
        const c = bp.taxonomy.categories.find((x) => x.id === id);
        const key = `${parentKey}/${id}`;
        const members = core.categoryMembers(bp, id, false);
        const yours = mine(id);
        const row = {
          key, parentKey, depth, id: "", group: "basecat", kind: "basecat base", noMenu: true, label: c.label || core.humanize(id), title: `${b.prefix}tax:${id}, ${b.title}: read only`,
          tag: yours.length ? `${yours.length} yours` : null,
          badges: c.standsFor ? h("span", { class: "pill tiny" }, `stands for ${labelOf(`${b.prefix}:${c.standsFor}`)}`) : null,
          expandable: core.subcategories(bp, id).length + members.length + yours.length > 0, expanded: isOpen("taxonomy", key, anyMine(id)),
        };
        rows.push(row);
        if (!row.expandable || !row.expanded) continue;
        walk(id, key, depth + 1, new Set(trail).add(id));
        for (const t of yours) {
          const e = project.elements.find((x) => x.id === t.id);
          rows.push({ key: `${key}/own:${t.id}`, parentKey: key, depth: depth + 1, id: t.id, group: "inherited", kind: "member inherited", label: labelOf(t.id), swatch: e.abstract ? undefined : (e.notation && e.notation.fill) || "transparent", italic: e.abstract, tag: `via ${labelOf(t.via)}`, title: `${project.meta.prefix}:${t.id}: in it as a kind of ${labelOf(t.via)}` });
        }
        for (const local of members) {
          const ref = `${b.prefix}:${local}`;
          const x = core.baseConcept(ctx, ref) || {};
          rows.push({ key: `${key}/m:${ref}`, parentKey: key, depth: depth + 1, id: ref, group: "basemember", kind: "member base", label: labelOf(ref), swatch: x.kind === "element" && !x.abstract ? x.fill || "transparent" : undefined, icon: x.kind === "relationship" ? "↗" : null, title: `${ref}, ${b.title}` });
        }
      }
    };
    walk("", top, 1, new Set());
  }

  function memberDetail(ref) {
    const cats = categoriesOf(ref);
    const isRel = project.relationships.some((r) => r.id === ref);
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, labelOf(ref)), h("span", { class: "pill" }, `${project.meta.prefix}:${ref}`),
        h("button", { class: "btn small", onclick: () => go(isRel ? "relationships" : "elements", ref) }, "Open its page")),
      h("h3", {}, "Classified in"),
      cats.length
        ? h("ul", { class: "plain" }, cats.map((c) => h("li", {}, catLink(c), " ",
          h("button", { class: "btn small ghost", type: "button", "aria-label": `Take it out of ${catLabel(c)}`, onclick: () => change(() => core.unclassify(project, ref, c)) }, "×"))))
        : h("p", { class: "muted" }, "No category."),
      h("button", { class: "btn small", type: "button", onclick: (ev) => pickCategoryFor(ref, ev.currentTarget) }, "Also classify in…"));
  }

  /** The types to drag onto categories, those in none first. A member dropped here leaves its category. */
  function typesCard() {
    const all = project.elements.filter((e) => !e.abstract).map((e) => e.id).concat(project.relationships.map((r) => r.id));
    const chip = (id) => {
      const e = project.elements.find((x) => x.id === id);
      const n = categoriesOf(id).length;
      const el = h("div", { class: "type-chip", tabindex: "0", role: "button", title: `${labelOf(id)}: drag it onto a category, or press Enter to choose one` },
        e ? h("span", { class: "sw", style: { background: (e.notation && e.notation.fill) || "transparent" } }) : h("span", { class: "tv-icon", "aria-hidden": "true" }, "↗"),
        labelOf(id), n ? h("span", { class: "muted" }, ` · ${n}`) : null);
      el.addEventListener("click", () => pickCategoryFor(id, el));
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pickCategoryFor(id, el); } });
      kit.draggable(el, () => ({ kind: "type", items: [{ id, from: null }], label: labelOf(id) }));
      return el;
    };
    const search = h("input", { type: "search", placeholder: "Filter types…", value: ui.filter.types || "", "aria-label": "Filter types" });
    const body = h("div", { class: "types-body", "data-scroll": "types" });
    const fill = () => {
      body.textContent = "";
      const f = (ui.filter.types || "").toLowerCase();
      const shown = all.filter((id) => matches(f, id, labelOf(id))).sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
      const loose = shown.filter((id) => !categoriesOf(id).length);
      body.appendChild(h("div", { class: "li-group" }, `In no category (${loose.length})`));
      body.appendChild(loose.length ? h("div", {}, loose.map(chip)) : h("p", { class: "muted small" }, "Every type is in a category."));
      const rest = h("details", { open: f ? true : null }, h("summary", { class: "li-group" }, `All types (${shown.length})`), h("div", {}, shown.map(chip)));
      body.appendChild(rest);
    };
    search.addEventListener("input", () => { ui.filter.types = search.value; fill(); });
    fill();
    const card = h("div", { class: "card types-card" },
      h("h3", {}, "Types to classify"),
      h("p", { class: "small muted" }, "Drag a type onto a category; Enter on a type chooses one from a list. A member dragged here leaves its category."),
      search, body);
    kit.dropTarget(card, {
      accept: (p) => {
        if (p.kind !== "type") return null;
        const leaving = p.items.filter((it) => it.from);
        if (!leaving.length) return { ok: false, hint: "Drop it on a category" };
        return { ok: true, hint: leaving.length === 1 ? `Take it out of ${catLabel(leaving[0].from)}` : "Take them out of their categories", run: () => change(() => leaving.forEach((it) => core.unclassify(project, it.id, it.from))) };
      },
    });
    return card;
  }

  /** The palette grouping and the diagram group order (SReq 4.5): categories in order, moved by drag, buttons or Alt+arrows. */
  function groupingCard() {
    const tax = project.taxonomy;
    const editor = (key, title, text) => {
      const coll = tax[key];
      return h("div", { class: "grouping" },
        h("h4", {}, title), h("p", { class: "small muted" }, text),
        coll.members.length ? kit.orderedList({
          name: key, label: title, items: coll.members.map((id) => ({ id, label: catPathLabel(id) })),
          move: (from, to) => { ui.focusAfter = { scope: key, key: coll.members[from] }; mutate(() => { const [x] = coll.members.splice(from, 1); coll.members.splice(to, 0, x); }); },
          remove: (i) => mutate(() => coll.members.splice(i, 1)),
        }) : h("p", { class: "muted small" }, "None."),
        chips(() => [], (v) => { coll.members = coll.members.concat(v.filter((x) => !coll.members.includes(x))); }, catOptions().filter((o) => !coll.members.includes(o.value)), { placeholder: "Add a category…" }));
    };
    return h("div", { class: "card" },
      h("h3", {}, "Palette and diagram"),
      editor("paletteGrouping", "Palette grouping (arch:paletteGrouping)", "The dimensions la-gram's palette groups element types by, the main one first: it makes a section of each group of the first, in that group's order."),
      editor("diagramGroupOrder", "Diagram bands (arch:diagramGroupOrder)", "The groups a diagram keeps in bands, the top band first."));
  }

  /** The relationship proposal orders (SReq 4.2–4.3, SD-4). */
  function proposalOrdersCard() {
    const orders = project.proposalOrders;
    return h("div", { class: "card" },
      h("div", { class: "row" }, h("h3", {}, "Relationship proposal orders"), h("span", { class: "spacer" }),
        h("button", { class: "btn small", onclick: addProposalOrder }, "+ Order")),
      h("p", { class: "small muted" }, "The orders in which a modelling tool proposes relationship types when two elements are connected (arch:relationshipProposalOrder). "
        + "One with no source or target types is the general order, which applies to every pair; a metamodel has one. "
        + "One that names source or target types applies where the source or the target is of one of them, or of a subtype, and its places win over the general order's."),
      orders.length ? orders.map(proposalOrderEditor) : h("p", { class: "muted small" }, "No proposal order yet."));
  }

  function proposalOrderEditor(o) {
    const list = o.members;
    const scoped = o.domain.length || o.range.length;
    const scope = "order-" + o.id;
    return h("div", { class: "card", style: { boxShadow: "none" } },
      h("div", { class: "detail-head" },
        h("h2", {}, o.label || (scoped ? core.humanize(o.id) : "General order")),
        h("span", { class: "pill" }, scoped ? "scoped" : "general"),
        h("button", { class: "btn danger small", onclick: () => { if (confirm(`Delete proposal order ${o.id}?`)) mutate(() => core.removeRef(project, o.id, "proposalOrders")); } }, "Delete")),
      inlineIssues("taxonomy", o.id),
      h("div", { class: "grid2" },
        idField("taxonomy", "taxonomy", o, "Order"),
        field("Label", textInput(() => o.label, (v) => { o.label = v; }, { placeholder: scoped ? core.humanize(o.id) : `${project.meta.title} relationship proposal order` })),
        field("Source types (arch:domainIncludes)", chips(() => o.domain, (v) => { o.domain = v; }, elementOptions(true), { free: curieRe, placeholder: "Any source…" })),
        field("Target types (arch:rangeIncludes)", chips(() => o.range, (v) => { o.range = v; }, elementOptions(true), { free: curieRe, placeholder: "Any target…" }))),
      list.length ? kit.orderedList({
        name: scope, label: `Relationship types of ${o.label || o.id}, in order`, items: list.map((id) => ({ id, label: labelOf(id) })),
        move: (from, to) => { ui.focusAfter = { scope, key: list[from] }; mutate(() => { const [x] = list.splice(from, 1); list.splice(to, 0, x); }); },
        remove: (i) => mutate(() => list.splice(i, 1)),
      }) : null,
      chips(() => [], (v) => { o.members = list.concat(v.filter((x) => !list.includes(x))); }, relationshipOptions().filter((opt) => !list.includes(opt.value)), { placeholder: "Append relationship…" }));
  }

  function addProposalOrder() {
    const hasGeneral = project.proposalOrders.some((o) => !o.domain.length && !o.range.length);
    const id = uniqueId(hasGeneral ? "NewProposalOrder" : "ProposalOrder", "taxonomy");
    mutate(() => project.proposalOrders.push({
      id, label: "", definition: "", scopeNote: "", domain: [], range: [],
      // A new general order starts with every relationship type, to be put in order.
      members: hasGeneral ? [] : project.relationships.map((r) => r.id),
    }));
  }

  /**
   * Two dimensions crossed (SReq 11.5): the groups of one as columns, of another as rows, and in each cell the element
   * types in both. Dragging a type to another cell moves it to that cell's groups; with Alt it stays in its own too.
   */
  function taxonomyGrid() {
    const dims = project.taxonomy.categories.filter((c) => core.subcategories(project, c.id).length).map((c) => c.id);
    if (!dims.length) return h("div", { class: "card empty" }, "A grid needs a dimension: a category with sub-categories, such as Domain with Business, Application and Technology under it.");
    const grouping = project.taxonomy.paletteGrouping.members.filter((d) => dims.includes(d));
    const cols = dims.includes(ui.grid.cols) ? ui.grid.cols : grouping[0] || dims[0];
    const rowsDim = ui.grid.rows === "-" ? "" : dims.includes(ui.grid.rows) && ui.grid.rows !== cols ? ui.grid.rows : grouping.find((d) => d !== cols) || dims.find((d) => d !== cols) || "";
    const dimSelect = (value, set, none) => {
      const el = h("select", {}, (none ? [h("option", { value: "-" }, "— none —")] : []).concat(dims.map((d) => h("option", { value: d }, catPathLabel(d)))));
      el.value = value || "-";
      el.addEventListener("change", () => { set(el.value); render(); });
      return el;
    };
    const colGroups = core.subcategories(project, cols);
    const rowGroups = rowsDim ? core.subcategories(project, rowsDim) : [];
    const deep = new Map(colGroups.concat(rowGroups).map((g) => [g, new Set(core.categoryMembers(project, g, true))]));
    const groupsOf = (id, groups) => { const gs = groups.filter((g) => deep.get(g).has(id)); return gs.length ? gs : [null]; };
    const cells = new Map();
    for (const e of project.elements.filter((x) => !x.abstract).sort(byLabelItem)) {
      for (const r of rowsDim ? groupsOf(e.id, rowGroups) : [null]) {
        for (const c of groupsOf(e.id, colGroups)) {
          const k = `${r}|${c}`;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(e.id);
        }
      }
    }
    const rowList = rowGroups.concat(!rowsDim || [...cells.keys()].some((k) => k.startsWith("null|")) ? [null] : []);
    const colList = colGroups.concat([...cells.keys()].some((k) => k.endsWith("|null")) ? [null] : []);
    const name = (g, dim) => (g ? catLabel(g) : dim ? `No ${catLabel(dim).toLowerCase()}` : "All");
    const chip = (id, r, c) => {
      const e = project.elements.find((x) => x.id === id);
      const el = h("span", { class: "gchip", tabindex: "0", role: "button", title: `${labelOf(id)}: drag it to another cell; Enter opens it` },
        h("span", { class: "sw", style: { background: (e.notation && e.notation.fill) || "transparent" } }), labelOf(id));
      el.addEventListener("click", () => go("elements", id));
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") go("elements", id); });
      kit.draggable(el, () => ({ kind: "cell", items: [{ id, row: r, col: c }], label: labelOf(id) }));
      return el;
    };
    const table = h("table", { class: "tax-grid" },
      h("thead", {}, h("tr", {}, h("th", { class: "corner" }, rowsDim ? `${catLabel(rowsDim)} ↓  ${catLabel(cols)} →` : `${catLabel(cols)} →`),
        colList.map((c) => h("th", { title: c ? catPathLabel(c) : "" }, name(c, cols))))),
      h("tbody", {}, rowList.map((r) => h("tr", {}, h("th", { title: r ? catPathLabel(r) : "" }, name(r, rowsDim)),
        colList.map((c) => {
          const td = h("td", { class: "gcell" }, (cells.get(`${r}|${c}`) || []).map((id) => chip(id, r, c)));
          kit.dropTarget(td, gridDrop(r, c));
          return td;
        })))));
    return h("div", {},
      h("div", { class: "card row grid-tools" },
        field("Columns", dimSelect(cols, (v) => { ui.grid.cols = v; })),
        field("Rows", dimSelect(rowsDim, (v) => { ui.grid.rows = v; }, true)),
        h("button", { class: "btn small", type: "button", disabled: !rowsDim, onclick: () => { ui.grid = { rows: cols, cols: rowsDim }; render(); } }, "Swap"),
        h("p", { class: "small muted grow" }, "Drag a type to another cell to move it to that cell's groups; hold Alt to keep it in its own as well. The tree and each type's page do the same without dragging.")),
      h("div", { class: "grid-wrap", "data-scroll": "tax-grid" }, table));
  }

  function gridDrop(r, c) {
    return {
      accept: (p, where, alt) => {
        if (p.kind !== "cell") return null;
        const moving = p.items.filter((it) => it.row !== r || it.col !== c);
        if (!moving.length) return { ok: false, hint: "Already here" };
        const where2 = [r && catLabel(r), c && catLabel(c)].filter(Boolean).join(" and ") || "no group";
        return {
          ok: true, hint: alt ? `Also in ${where2}` : `Move to ${where2}. With Alt: keep it where it is too`,
          run: () => change(() => moving.forEach((it) => { core.regroup(project, it.id, it.row, r, alt); core.regroup(project, it.id, it.col, c, alt); })),
        };
      },
    };
  }

  // ------------------------------------------------------------------ viewpoints

  function viewViewpoints() {
    const here = () => (project.viewpointCategories.some((c) => c.id === ui.sel.viewpoints) ? ui.sel.viewpoints : "");
    const tools = [
      h("button", { class: "btn small", onclick: () => addViewpoint(here()) }, "+ Viewpoint"),
      h("button", { class: "btn small", onclick: () => addViewpointCategory(here()) }, "+ Category"),
    ];
    return h("div", {},
      pageHead("Viewpoints", "arch:Viewpoint individuals: the concepts each admits, its stakeholders, the concerns it frames and its purposes, grouped in a SKOS viewpoint catalog (arch:viewpointLibrary). Drag viewpoints between catalog categories and categories into one another; hold Alt to add a viewpoint to a category without taking it out of the one it was in."),
      masterDetail("viewpoints", { tree: viewpointTree, tools, detail: (id) => viewpointDetail(id) || viewpointCategoryDetail(id), emptyText: "No viewpoints yet." }));
  }

  /** The viewpoint catalog as a tree (SReq 11.1): each viewpoint under each of its categories. */
  function viewpointTree(filter) {
    const collapsed = collapsedSet("viewpoints");
    const cats = project.viewpointCategories;
    const catIds = new Set(cats.map((c) => c.id));
    const shownVp = (v) => matches(filter, v.id, v.label);
    const memo = new Map();
    const shows = (id, trail) => {
      if (!filter) return true;
      if (memo.has(id)) return memo.get(id);
      if (trail.has(id)) return false;
      const c = cats.find((x) => x.id === id);
      const hit = matches(filter, id, c && c.label) || project.viewpoints.some((v) => v.categories.includes(id) && shownVp(v))
        || cats.some((x) => x.parent === id && shows(x.id, new Set(trail).add(id)));
      memo.set(id, hit);
      return hit;
    };
    const vpRow = (v, parentKey, depth, cat) => {
      const row = { key: `${parentKey}/v:${v.id}`, parentKey, depth, id: v.id, cat, group: "viewpoint", kind: "viewpoint", icon: "◎", label: v.label || core.humanize(v.id), title: v.id, tag: String(v.concepts.length) };
      row.drag = dragOf("viewpoints", row, "viewpoint", (x) => ({ id: x.id, from: x.cat }));
      return row;
    };
    const rows = [];
    const root = { key: "catalog", parentKey: null, depth: 0, id: "", group: "catalog", kind: "root", label: `${project.meta.title} Viewpoint Catalog`, tag: "catalog", expandable: true, expanded: !!filter || !collapsed.has("catalog") };
    root.drop = viewpointDrop(root);
    rows.push(root);
    const walk = (parent, parentKey, depth, trail) => {
      for (const c of cats.filter((x) => (x.parent || "") === parent)) {
        if (trail.has(c.id) || !shows(c.id, new Set())) continue;
        const key = `${parentKey}/${c.id}`;
        const inside = project.viewpoints.filter((v) => v.categories.includes(c.id) && shownVp(v)).sort(byLabelItem);
        const subs = cats.filter((x) => x.parent === c.id);
        // The count takes in the viewpoints of its sub-categories too.
        const branch = core.viewpointCategoryDescendants(project, c.id);
        const all = project.viewpoints.filter((v) => v.categories.some((x) => branch.has(x))).length;
        const row = {
          key, parentKey, depth, id: c.id, parent, group: "vpcat", kind: "category", label: c.label || core.humanize(c.id), title: c.id,
          tag: String(all), expandable: subs.length + inside.length > 0, expanded: !!filter || !collapsed.has(key),
        };
        row.drag = dragOf("viewpoints", row, "vpcat", (x) => ({ id: x.id, from: x.parent }));
        row.drop = viewpointDrop(row);
        rows.push(row);
        if (!row.expandable || !row.expanded) continue;
        walk(c.id, key, depth + 1, new Set(trail).add(c.id));
        for (const v of inside) rows.push(vpRow(v, key, depth + 1, c.id));
      }
    };
    if (root.expanded) {
      walk("", "catalog", 1, new Set());
      for (const v of project.viewpoints.filter((x) => !x.categories.some((c) => catIds.has(c)) && shownVp(x)).sort(byLabelItem)) rows.push(vpRow(v, "catalog", 1, ""));
    }
    markSelection("viewpoints", rows, ui.sel.viewpoints, (r) => r.group === "viewpoint" || r.group === "vpcat");
    return {
      name: "viewpoints", label: "Viewpoint catalog", rows,
      onSelect: (r, mods) => chooseRow("viewpoints", r, mods, (x) => { if (x.group !== "catalog") { ui.selKey.viewpoints = x.key; go("viewpoints", x.id); } }),
      onToggle: (r, open) => { setOpen("viewpoints", r.key, open); render(); },
      menu: viewpointMenu,
      onMove: viewpointKeyMove,
    };
  }

  const vpCatLabel = (id) => { const c = project.viewpointCategories.find((x) => x.id === id); return c ? c.label || core.humanize(c.id) : id; };

  /** A drop on a catalog category: a viewpoint moves there (with Alt, it is in both); a category goes into it. On the catalog, out of them. */
  function viewpointDrop(row) {
    const catalog = row.group === "catalog";
    return {
      unfold: row.expandable && !row.expanded ? () => { setOpen("viewpoints", row.key, true); render(); } : null,
      accept: (p, where, alt) => {
        if (p.kind === "viewpoint") {
          if (catalog) {
            const leaving = p.items.filter((it) => it.from);
            if (!leaving.length) return { ok: false, hint: "Already here" };
            return { ok: true, hint: leaving.length === 1 ? `Take it out of ${vpCatLabel(leaving[0].from)}` : "Take them out of their categories", run: () => mutate(() => leaving.forEach((it) => core.moveViewpoint(project, it.id, it.from, null))) };
          }
          const inCat = (id) => (project.viewpoints.find((v) => v.id === id) || { categories: [] }).categories.includes(row.id);
          const moving = p.items.filter((it) => (alt ? !inCat(it.id) : it.from !== row.id));
          if (!moving.length) return { ok: false, hint: "Already here" };
          return { ok: true, hint: alt ? `Also in ${row.label}` : `Move to ${row.label}. With Alt: keep it where it is too`, run: () => mutate(() => moving.forEach((it) => core.moveViewpoint(project, it.id, it.from, row.id, alt))) };
        }
        if (p.kind === "vpcat") {
          const to = catalog ? "" : row.id;
          if (p.items.some((it) => to && (it.id === to || core.viewpointCategoryDescendants(project, it.id).has(to)))) return { ok: false, hint: "Not inside itself" };
          const moving = p.items.filter((it) => (it.from || "") !== to);
          if (!moving.length) return { ok: false, hint: "Already here" };
          return { ok: true, hint: to ? `Into ${row.label}` : "Make it a top-level category", run: () => mutate(() => moving.forEach((it) => core.moveViewpointCategory(project, it.id, to))) };
        }
        return null;
      },
    };
  }

  function viewpointMenu(row) {
    const at = () => rowAnchor("viewpoints", row.key);
    if (row.group === "catalog") return [{ label: "New viewpoint", run: () => addViewpoint("") }, { label: "New top-level category", run: () => addViewpointCategory("") }];
    if (row.group === "vpcat") {
      const c = project.viewpointCategories.find((x) => x.id === row.id);
      return [
        { label: "New viewpoint in it", run: () => addViewpoint(row.id) },
        { label: "New sub-category", run: () => addViewpointCategory(row.id) },
        { label: "Move into…", run: () => pickViewpointCategory(at(), `Move ${row.label} into`, (x) => !core.viewpointCategoryDescendants(project, row.id).has(x) && x !== row.parent, (to) => mutate(() => core.moveViewpointCategory(project, row.id, to)), true, !!row.parent) },
        row.parent ? { label: "Make it top level", run: () => mutate(() => core.moveViewpointCategory(project, row.id, "")) } : null,
        "-",
        { label: "Delete…", danger: true, run: () => deleteItem("viewpoints", "viewpointCategories", c, "viewpoint category") },
      ];
    }
    const v = project.viewpoints.find((x) => x.id === row.id);
    if (!v) return [];
    return [
      { label: "Open", run: () => { ui.selKey.viewpoints = row.key; go("viewpoints", row.id); } },
      "-",
      { label: "Move to…", run: () => pickViewpointCategory(at(), `Move ${row.label} to`, (x) => !v.categories.includes(x), (to) => mutate(() => core.moveViewpoint(project, v.id, row.cat, to))) },
      { label: "Also in…", run: () => pickViewpointCategory(at(), `Add ${row.label} to`, (x) => !v.categories.includes(x), (to) => mutate(() => core.moveViewpoint(project, v.id, null, to))) },
      row.cat ? { label: `Take it out of ${vpCatLabel(row.cat)}`, run: () => mutate(() => core.moveViewpoint(project, v.id, row.cat, null)) } : null,
      "-",
      { label: "Delete…", danger: true, run: () => deleteItem("viewpoints", "viewpoints", v, "viewpoint") },
    ];
  }

  /** A catalog category picked from the tree of them; `top` offers the top level too. */
  function pickViewpointCategory(at, title, ok, onPick, top, topOk) {
    const out = top ? [{ value: "", label: "Top level", depth: 0, disabled: !topOk, note: topOk ? "" : "already there" }] : [];
    const walk = (parent, depth, trail) => {
      for (const c of project.viewpointCategories.filter((x) => (x.parent || "") === parent)) {
        if (trail.has(c.id)) continue;
        const allowed = ok(c.id);
        out.push({ value: c.id, label: c.label || core.humanize(c.id), depth, disabled: !allowed, note: allowed ? "" : "not here" });
        walk(c.id, depth + 1, new Set(trail).add(c.id));
      }
    };
    walk("", 0, new Set());
    kit.picker(at, title, out, onPick);
  }

  /** On a catalog category, Alt+Right puts it into the one above it and Alt+Left takes it out of its parent. */
  function viewpointKeyMove(row, dir) {
    if (row.group !== "vpcat") { if (row.group === "viewpoint") toast("A viewpoint moves to another category from its menu: Move to…"); return; }
    if (dir === "up" || dir === "down") { toast("Catalog categories keep the order they were made in."); return; }
    const rows = ui.rows.viewpoints || [];
    if (dir === "right") {
      const sib = rows.slice(0, rows.indexOf(row)).reverse().find((r) => r.parentKey === row.parentKey);
      if (!sib || sib.group !== "vpcat") { toast("There is no category above it to go into."); return; }
      setOpen("viewpoints", sib.key, true);
      ui.focusAfter = { scope: "viewpoints", key: `${sib.key}/${row.id}`, id: row.id };
      mutate(() => core.moveViewpointCategory(project, row.id, sib.id));
      return;
    }
    const parentRow = rows.find((r) => r.key === row.parentKey);
    if (!parentRow || parentRow.group !== "vpcat") { toast("It is at the top level already."); return; }
    ui.focusAfter = { scope: "viewpoints", key: `${parentRow.parentKey}/${row.id}`, id: row.id };
    mutate(() => core.moveViewpointCategory(project, row.id, parentRow.parent || ""));
  }

  function addViewpoint(cat) {
    const id = uniqueId("NewViewpoint", "viewpoint");
    if (cat) unfoldItem("viewpoints", cat);
    mutate(() => {
      project.viewpoints.push({ id, label: core.humanize(id), definition: "", concepts: [], stakeholders: [], concerns: [], purposes: [], viewTypes: ["Diagram"], categories: cat ? [cat] : project.viewpointCategories[0] ? [project.viewpointCategories[0].id] : [] });
      ui.sel.viewpoints = id;
      ui.selKey.viewpoints = "";
    });
  }

  function addViewpointCategory(parent) {
    const id = uniqueId("NewViewpointCategory", "viewpoint");
    if (parent) unfoldItem("viewpoints", parent);
    mutate(() => {
      project.viewpointCategories.push({ id, label: core.humanize(id), definition: "", parent: parent || "" });
      ui.sel.viewpoints = id;
      ui.selKey.viewpoints = "";
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
    // A viewpoint may admit the types of a language the project extends (SReq 12.2).
    if (showingBases()) for (const b of bases) groups.push([b.title, ctx.externalConcepts.filter((x) => x.base === b.namespace && !x.abstract).map((x) => x.ref)]);
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

  function viewpointCategoryDetail(id) {
    const c = project.viewpointCategories.find((x) => x.id === id);
    if (!c) return null;
    const inside = project.viewpoints.filter((v) => v.categories.includes(c.id));
    const below = core.viewpointCategoryDescendants(project, c.id);
    return h("div", { class: "card" },
      h("div", { class: "detail-head" }, h("h2", {}, c.label || core.humanize(c.id)), h("span", { class: "pill" }, `${inside.length} viewpoints`),
        deleteButton("viewpoints", "viewpointCategories", c, "viewpoint category")),
      inlineIssues("viewpoints", c.id),
      h("div", { class: "grid2" },
        idField("viewpoints", "viewpoint", c, "Category"),
        field("Label", textInput(() => c.label, (x) => { c.label = x; })),
        field("Parent", select([{ value: "", label: "— top level —" }].concat(project.viewpointCategories.filter((x) => !below.has(x.id)).map((x) => ({ value: x.id, label: x.label || x.id }))), () => c.parent, (x) => { core.moveViewpointCategory(project, c.id, x); })),
        field("Definition", textArea(() => c.definition, (x) => { c.definition = x; }, 2), null, "span2")),
      h("h3", { style: { marginTop: "14px" } }, "Viewpoints in it"),
      inside.length
        ? h("div", { class: "rel-list" }, inside.sort(byLabelItem).map((v) => h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); go("viewpoints", v.id); } }, v.label || core.humanize(v.id))))
        : h("p", { class: "muted small" }, "None."));
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
      pageHead("Notation", "The default visual notation (arch-vis:NotationSet) — the palette a modelling tool builds from the metamodel. Click an element to restyle it."),
      sel ? h("div", { class: "card" },
        h("div", { class: "row" }, h("strong", {}, sel.label || sel.id),
          field("Fill", colorInput(() => sel.notation.fill, (v) => { sel.notation.fill = v; })),
          field("Line", colorInput(() => sel.notation.stroke, (v) => { sel.notation.stroke = v; })),
          field("Text", colorInput(() => sel.notation.font || "#1d2330", (v) => { sel.notation.font = v; })),
          field("Shape", shapeSelect(() => sel.notation.shape, (v) => { sel.notation.shape = v; })),
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
      ownShapesCard(),
      h("p", { class: "small muted" }, "Written in core-vis terms: each descriptor (arch-vis:VisualNotation) has an arch-vis:Style with its shape type and colours, or for a relationship its line style, both line ends (arch-vis:sourceDecor, arch-vis:targetDecor) and colour. A figure core-vis does not define is declared as an own arch-vis:ShapeType, which a modeller draws, or draws as its fallback."));
  }

  /** Own shapes (SReq 6.5, SD-3): figures core-vis does not define, with a core fallback and path templates. */
  function ownShapesCard() {
    const sel = project.shapes.find((s) => s.id === ui.sel.shapes);
    const used = (id) => project.elements.filter((e) => !e.abstract && e.notation && e.notation.shape === id).length;
    return h("div", { class: "card" },
      h("div", { class: "row" }, h("h3", {}, "Own shapes"), h("span", { class: "spacer" }),
        h("button", { class: "btn small", onclick: addShape }, "+ Shape")),
      h("p", { class: "small muted" }, "Declared in the notation document as arch-vis:ShapeType: a core fallback, and the geometry as SVG path templates whose numbers may be {expressions} over w, h and the variables. "
        + "Cylinder and folder are built in and declared when an element uses them; a shape here with the id Cylinder or Folder replaces them."),
      project.shapes.length
        ? h("div", { class: "row" }, project.shapes.map((s) => h("button", { class: "btn small" + (sel && sel.id === s.id ? " primary" : ""), title: `${used(s.id)} element type(s) use it`, onclick: () => { ui.sel.shapes = s.id; render(); } }, `${s.label || s.id} · ${used(s.id)}`)))
        : h("p", { class: "muted small" }, "None: every element uses a core-vis or a built-in shape."),
      sel ? h("div", { style: { marginTop: "12px" } },
        inlineIssues("notation", sel.id),
        h("div", { class: "grid2" },
          idField("shapes", "notation", sel, "Shape"),
          field("Label", textInput(() => sel.label, (v) => { sel.label = v; })),
          field("Fallback", select(Object.keys(core.CORE_SHAPES).map((x) => ({ value: x, label: x })), () => sel.fallback || "rectangle", (v) => { sel.fallback = v; }), "Drawn by a modeller that cannot draw the templates"),
          field("Variables", textInput(() => sel.variables, (v) => { sel.variables = v; }, { class: "mono", placeholder: "b = min(h * 0.2, 12)" })),
          field("Outline path", textInput(() => sel.outline, (v) => { sel.outline = v; }, { class: "mono", placeholder: "M0,0 L{w},0 L{w},{h} L0,{h} Z" }), "Filled and stroked", "span2"),
          field("Detail path", textInput(() => sel.detail, (v) => { sel.detail = v; }, { class: "mono" }), "Inner lines, stroked only", "span2"),
          field("Content box", textInput(() => sel.contentBox, (v) => { sel.contentBox = v; }, { class: "mono", placeholder: "x y width height" })),
          field("Label box", textInput(() => sel.labelBox, (v) => { sel.labelBox = v; }, { class: "mono", placeholder: "x y width height" })),
          field("Definition", textArea(() => sel.definition, (v) => { sel.definition = v; }, 2), null, "span2")),
        h("div", { class: "row", style: { marginTop: "8px" } }, deleteButton("shapes", "shapes", sel, "shape"))) : null);
  }

  function addShape() {
    const id = uniqueId("NewShape", "notation");
    mutate(() => {
      project.shapes.push({ id, label: core.humanize(id), definition: "", fallback: "rectangle", variables: "", outline: "M0,0 L{w},0 L{w},{h} L0,{h} Z", detail: "", contentBox: "", labelBox: "" });
      ui.sel.shapes = id;
    });
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
      issues.length ? issues.map((i) => h("button", { class: "issue " + i.level, onclick: () => openFinding(i) }, h("span", { class: "lvl" }, i.level), h("span", {}, i.message)))
        : h("div", { class: "card empty" }, "No findings."));
  }

  /** Open the item a finding is about. On the Notation page that is an own shape; on Taxonomy, a category or an order. */
  function openFinding(i) {
    if (i.tab === "notation" && project.shapes.some((s) => s.id === i.id)) { ui.sel.shapes = i.id; go("notation"); return; }
    if (i.tab === "taxonomy" && (!i.id || project.proposalOrders.some((o) => o.id === i.id))) { view.taxView = "tree"; go("taxonomy"); return; }
    if (i.tab === "taxonomy") { view.taxView = "tree"; ui.taxMember = ""; }
    go(i.tab, i.id || ui.sel[i.tab]);
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
    ui.selKey = {}; ui.picked = {}; ui.anchor = {}; ui.rows = {}; ui.taxMember = ""; ui.grid = { rows: "", cols: "" };
    ui.tab = "overview";
    changed(true);
    if (message) toast(message);
  }

  /**
   * The starting point a link names, after the first render (SReq 10.4). The parameter leaves the address, so a
   * reload keeps the work. A project kept from before is replaced without asking only when it is a starting point
   * as it came; otherwise only if the visitor agrees, and Undo brings it back.
   */
  function openLinked() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    const key = params.get("template");
    if (key === null) return;
    params.delete("template");
    const query = params.toString();
    try { window.history.replaceState(null, "", location.pathname + (query ? `?${query}` : "") + location.hash); } catch (e) { /* the address cannot change here: keep it */ }
    if (!linked) { toast(`The studio has no starting point "${key}". It has ${Object.keys(templates).join(", ")}.`); return; }
    const t = templates[linked];
    // Kept at once, so a reload opens what the link opened rather than the default starting point.
    if (!stored) { saveNow(); toast(`Started from ${t.label}.`); return; }
    const came = asItCame(stored);
    if (came === linked) return;
    if (!came && !confirm(`Replace the current project with "${t.label}"? (Undo can bring it back.)`)) return;
    setProject(startFrom(linked), `Started from ${t.label}.`);
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

    // Import dialog: a project's documents, or those of a language it extends (SReq 12.6).
    const dlg = $("dlgImport");
    const defaultTitle = $("importTitle").textContent;
    $("btnImport").addEventListener("click", () => openImport(null));
    dlg.addEventListener("close", () => {
      importFor = null;
      $("importTitle").textContent = defaultTitle;
      $("importText").hidden = false;
      $("importBaseText").hidden = true;
    });
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
        if (importFor) {
          const imp = importFor;
          const { project: b } = importer.importTurtle(docs, { namespace: imp.namespace, prefix: imp.prefix });
          if (!b.elements.length && !b.relationships.length) { report.textContent = `These documents define no types in ${imp.namespace}.`; return; }
          loadedBases[imp.namespace] = { project: compactBase(b), loaded: new Date().toISOString().slice(0, 10) };
          const kept = saveBases();
          dlg.close();
          changed(true);
          toast(kept ? `${b.meta.title} is shown as the language ${imp.prefix}: names.` : `${b.meta.title} is shown until the page is reloaded: this browser could not keep it.`);
          return;
        }
        const { project: p, report: lines } = importer.importTurtle(docs);
        dlg.close();
        setProject(p, "Imported.");
        alert("Import summary\n\n" + lines.join("\n"));
      } catch (err) {
        report.textContent = "Import failed: " + (err.message || err) + (/fetch/i.test(String(err)) ? "\nThe server may not allow cross-origin requests: download the files and choose them above instead." : "");
      }
    });
  }

  /** The import of a language a project extends, while the dialog is open for it (SReq 12.6). */
  let importFor = null;
  function openImport(imp) {
    importFor = imp || null;
    $("importReport").hidden = true;
    if (imp) {
      $("importTitle").textContent = `Load the documents of ${imp.prefix}:`;
      $("importBaseText").textContent = `The studio shows the types of ${imp.namespace} beside yours, read only. The documents stay in this browser, not in the project: give at least its ontology, and its taxonomy for its categories.`;
      $("importBaseText").hidden = false;
      $("importText").hidden = true;
    }
    $("dlgImport").showModal();
  }

  // ------------------------------------------------------------------ boot

  try { const t = localStorage.getItem(THEME_KEY); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
  buildNewMenu();
  wire();
  refreshBases();
  issues = linter.lint(project, { bases });
  render();
  openLinked();
  window.__studio = { get project() { return project; }, go, render };
})();
