/*
 * Linked.Archi Metamodel Studio — trees, ordered lists, menus and drag and drop (SReq 11, SD-16).
 *
 * Plain DOM, no framework and no build. The page computes the rows; this draws them as a WAI-ARIA tree and turns
 * drags, menus and keys into calls the page makes on the engine (core.js). A drag starts once the pointer has moved
 * a few pixels with the button down; it highlights where it would land and says what a drop would do, unfolds a
 * folded row it rests on, and stops on Escape: the gestures of la-gram's model explorer. Every drop target decides
 * itself whether it takes what is dragged. Everything a drag does can also be done from a row's menu or the keyboard
 * (WCAG 2.2, 2.1.1 and 2.5.7).
 */
(function (root) {
  "use strict";

  const DRAG_THRESHOLD = 5;
  const UNFOLD_MS = 700;
  /** The share of a row's height, at its top and at its bottom, that drops before or after it rather than into it. */
  const EDGE = 0.28;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // ---------------------------------------------------------------- drag and drop

  /** Drop targets: element -> { accept(payload, where, alt), between, into, unfold }. */
  const targets = new WeakMap();
  let press = null;
  let drag = null;
  let suppressClick = false;

  /**
   * Make `el` draggable. `payload()` says what a drag of it carries, { kind, items, label }, or null when it cannot
   * be dragged. Touch scrolls instead: on a touch screen a row's menu moves it.
   */
  function draggable(el, payload) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      if (e.target.closest("button, input, select, textarea, a, [data-nodrag]")) return;
      press = { x: e.clientX, y: e.clientY, payload, el };
    });
  }

  /**
   * Make `el` a drop target. `accept(payload, where, alt)` returns null when it takes nothing of that kind, or
   * { ok, hint, run }: `hint` says what a drop does, or why it does not; `run()` does it. With `between`, the top
   * and bottom of `el` drop before and after it, and its middle into it unless `into` is false. `unfold()` opens a
   * folded row the pointer rests on.
   */
  function dropTarget(el, opts) {
    targets.set(el, opts);
    el.setAttribute("data-drop", "");
  }

  function targetAt(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && !targets.has(el)) el = el.parentElement;
    return el;
  }

  function begin(e) {
    const payload = press.payload();
    const source = press.el;
    press = null;
    if (!payload) return;
    const hint = h("span", { class: "dnd-hint" });
    drag = { payload, source, hint, ghost: h("div", { class: "dnd-ghost", "aria-hidden": "true" }, h("b", {}, payload.label), hint), over: null, timer: null, scroll: null };
    document.body.appendChild(drag.ghost);
    document.body.classList.add("dnd-active");
    source.classList.add("dnd-source");
    moveTo(e);
  }

  function moveTo(e) {
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.alt = e.altKey;
    drag.ghost.style.left = e.clientX + 14 + "px";
    drag.ghost.style.top = e.clientY + 14 + "px";
    evaluate();
    autoScroll();
  }

  function evaluate() {
    const el = targetAt(drag.x, drag.y);
    const opts = el ? targets.get(el) : null;
    let where = "into";
    if (opts && opts.between) {
      const r = el.getBoundingClientRect();
      const f = (drag.y - r.top) / Math.max(1, r.height);
      if (opts.into === false) where = f < 0.5 ? "before" : "after";
      else where = f < EDGE ? "before" : f > 1 - EDGE ? "after" : "into";
    }
    const verdict = opts ? opts.accept(drag.payload, where, drag.alt) : null;
    // A target may land a drop elsewhere than the pointer says: a type dropped at a category's edge goes into it.
    if (verdict && verdict.where) where = verdict.where;
    const prev = drag.over;
    if (prev && prev.el !== el) prev.el.classList.remove("drop-into", "drop-before", "drop-after", "drop-no");
    if (el) {
      el.classList.remove("drop-into", "drop-before", "drop-after", "drop-no");
      if (verdict) el.classList.add(verdict.ok ? `drop-${where}` : "drop-no");
    }
    drag.hint.textContent = verdict ? verdict.hint || "" : "";
    drag.ghost.classList.toggle("no", !!verdict && !verdict.ok);
    // Resting on a folded row opens it, to go further in.
    if (!prev || prev.el !== el || prev.where !== where) {
      clearTimeout(drag.timer);
      if (el && opts.unfold && where === "into") drag.timer = setTimeout(() => { if (drag && drag.over && drag.over.el === el) opts.unfold(); }, UNFOLD_MS);
    }
    drag.over = el ? { el, where, verdict } : null;
  }

  /** Near the top or bottom of a scrolled list, the list scrolls. */
  function autoScroll() {
    const under = document.elementFromPoint(drag.x, drag.y);
    let box = under;
    while (box && box !== document.body && !(box.scrollHeight > box.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (!box || box === document.body) { drag.scroll = null; return; }
    const r = box.getBoundingClientRect();
    const dy = drag.y < r.top + 28 ? -8 : drag.y > r.bottom - 28 ? 8 : 0;
    if (!dy) { drag.scroll = null; return; }
    const running = drag.scroll;
    drag.scroll = { box, dy };
    if (running) return;
    const step = () => {
      if (!drag || !drag.scroll) return;
      drag.scroll.box.scrollTop += drag.scroll.dy;
      evaluate();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function finish(run) {
    if (!drag) return;
    clearTimeout(drag.timer);
    if (drag.over) drag.over.el.classList.remove("drop-into", "drop-before", "drop-after", "drop-no");
    drag.ghost.remove();
    drag.source.classList.remove("dnd-source");
    document.body.classList.remove("dnd-active");
    drag = null;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (run) run();
  }

  document.addEventListener("pointermove", (e) => {
    if (drag) { moveTo(e); return; }
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_THRESHOLD) begin(e);
  });
  document.addEventListener("pointerup", (e) => {
    press = null;
    if (!drag) return;
    drag.alt = e.altKey;
    evaluate();
    const v = drag.over && drag.over.verdict;
    finish(v && v.ok ? v.run : null);
  });
  document.addEventListener("pointercancel", () => { press = null; finish(null); });
  document.addEventListener("keydown", (e) => {
    if (!drag) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); }
    else if (e.key === "Alt") { drag.alt = true; evaluate(); }
  }, true);
  document.addEventListener("keyup", (e) => { if (drag && e.key === "Alt") { drag.alt = false; evaluate(); } }, true);
  document.addEventListener("click", (e) => { if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); } }, true);

  // ---------------------------------------------------------------- popovers, menus and pickers

  let popEl = null;
  let returnTo = null;

  function closeMenu(refocus) {
    if (!popEl) return;
    popEl.remove();
    popEl = null;
    document.removeEventListener("pointerdown", outside, true);
    if (refocus && returnTo && document.contains(returnTo)) returnTo.focus();
    returnTo = null;
  }
  function outside(e) { if (popEl && !popEl.contains(e.target)) closeMenu(false); }

  function place(el, at) {
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    let x;
    let y;
    if (at && at.getBoundingClientRect) {
      const r = at.getBoundingClientRect();
      x = r.left;
      y = r.bottom + 4;
      if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 4);
    } else {
      x = at.x;
      y = at.y;
      if (y + ph > innerHeight - 8) y = Math.max(8, innerHeight - ph - 8);
    }
    el.style.left = Math.max(8, Math.min(innerWidth - pw - 8, x)) + "px";
    el.style.top = y + "px";
  }

  /** Show `content` in a popover at `at`, an element (below it) or a point { x, y }. Escape closes it. */
  function popover(at, content, role) {
    closeMenu(false);
    returnTo = document.activeElement;
    popEl = h("div", { class: "popover", role: role || "dialog" }, content);
    document.body.appendChild(popEl);
    place(popEl, at);
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    popEl.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); } });
    return popEl;
  }

  /** A menu of items { label, run, disabled, note, danger }, "-" for a line between them. Arrow keys move, Enter runs. */
  function menu(at, items) {
    const buttons = [];
    const box = h("div", { class: "ctx-menu" }, items.filter(Boolean).map((it) => {
      if (it === "-") return h("div", { class: "ctx-sep", role: "separator" });
      const b = h("button", {
        class: "menu-item" + (it.danger ? " danger" : ""), role: "menuitem", type: "button", tabindex: "-1", disabled: !!it.disabled,
        onclick: () => { closeMenu(true); it.run(); },
      }, it.label, it.note ? h("small", {}, it.note) : null);
      buttons.push(b);
      return b;
    }));
    const pop = popover(at, box, "menu");
    const enabled = () => buttons.filter((b) => !b.disabled);
    pop.addEventListener("keydown", (e) => {
      const list = enabled();
      const i = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
      else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === "Tab") { e.preventDefault(); closeMenu(true); }
    });
    (enabled()[0] || pop).focus();
  }

  /** Pick one of `options` ({ value, label, depth, disabled, note }), narrowed as one types: "Move under…" and the like. */
  function picker(at, title, options, onPick) {
    const input = h("input", { type: "search", placeholder: "Filter…", "aria-label": title });
    const list = h("div", { class: "picker-list", role: "listbox", "aria-label": title });
    const fill = () => {
      const q = input.value.trim().toLowerCase();
      list.textContent = "";
      const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q));
      for (const o of shown) {
        list.appendChild(h("button", {
          type: "button", class: "picker-opt", role: "option", disabled: !!o.disabled, title: o.note || null,
          style: { paddingLeft: 8 + (q ? 0 : (o.depth || 0) * 14) + "px" },
          onclick: () => { closeMenu(true); onPick(o.value); },
        }, h("span", {}, o.label), o.note ? h("small", {}, o.note) : null));
      }
      if (!shown.length) list.appendChild(h("div", { class: "muted small picker-none" }, "Nothing matches."));
    };
    const enabled = () => Array.from(list.querySelectorAll("button:not([disabled])"));
    input.addEventListener("input", fill);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); const first = enabled()[0]; if (first) first.click(); }
      if (e.key === "ArrowDown") { e.preventDefault(); const first = enabled()[0]; if (first) first.focus(); }
    });
    list.addEventListener("keydown", (e) => {
      const all = enabled();
      const i = all.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); if (all[i + 1]) all[i + 1].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); if (i > 0) all[i - 1].focus(); else input.focus(); }
    });
    fill();
    popover(at, h("div", { class: "picker-pop" }, h("h4", {}, title), input, list), "dialog");
    input.focus();
  }

  // ---------------------------------------------------------------- the tree

  /**
   * A tree, as the WAI-ARIA tree pattern. Rows come flat and in order, each with its depth: an item under one parent
   * (SD-12), so an item with two parents has two rows. The page draws it again after every change, so expansion,
   * selection and focus live in the page.
   *
   * opts: { name, label, rows, onSelect(row, { toggle, range }), onToggle(row, open), menu(row) -> items,
   *         onMove(row, "up" | "down" | "left" | "right") for Alt+arrows }
   * row:  { key, parentKey, depth, label, title, kind, expandable, expanded, selected, also, picked, muted, italic,
   *         swatch, icon, tag, badges, drag() -> payload | null, drop: drop-target options | null }
   */
  function tree(opts) {
    const rows = opts.rows;
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const els = new Map();
    const focusKey = (rows.find((r) => r.selected) || rows[0] || {}).key;
    const box = h("div", { class: "tv", role: "tree", "aria-label": opts.label, "aria-multiselectable": "true", "data-scope": opts.name });
    const openMenu = (r, at) => { if (opts.menu) { const items = opts.menu(r); if (items && items.length) menu(at, items); } };
    for (const r of rows) {
      const cls = ["tv-row", r.kind || "", r.selected ? "sel" : "", r.also ? "also" : "", r.picked ? "picked" : "", r.muted ? "muted" : ""].filter(Boolean).join(" ");
      const el = h("div", {
        class: cls, role: "treeitem", "aria-level": String(r.depth + 1), "aria-expanded": r.expandable ? String(!!r.expanded) : null,
        "aria-selected": String(!!(r.selected || r.picked)), tabindex: r.key === focusKey ? "0" : "-1", "data-key": r.key, "data-id": r.id || null, title: r.title || null,
      },
      h("span", { class: "tv-indent", style: { width: r.depth * 16 + "px" } }),
      h("span", {
        class: "tv-twisty" + (r.expandable ? "" : " none"), "aria-hidden": "true", "data-nodrag": "",
        onclick: r.expandable ? (e) => { e.stopPropagation(); opts.onToggle(r, !r.expanded); } : null,
      }, r.expandable ? (r.expanded ? "▾" : "▸") : ""),
      r.swatch !== undefined ? h("span", { class: "sw", style: { background: r.swatch || "transparent" } }) : null,
      r.icon ? h("span", { class: "tv-icon", "aria-hidden": "true" }, r.icon) : null,
      h("span", { class: "tv-label" + (r.italic ? " abs" : "") }, r.label),
      r.badges || null,
      r.tag ? h("span", { class: "tag" }, r.tag) : null,
      opts.menu ? h("button", {
        class: "tv-more", type: "button", tabindex: "-1", "aria-label": `Actions for ${r.label}`, "data-nodrag": "",
        onclick: (e) => { e.stopPropagation(); openMenu(r, e.currentTarget); },
      }, "⋯") : null);
      el.addEventListener("click", (e) => opts.onSelect(r, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey }));
      el.addEventListener("contextmenu", (e) => { if (!opts.menu) return; e.preventDefault(); openMenu(r, { x: e.clientX, y: e.clientY }); });
      if (r.drag) draggable(el, r.drag);
      if (r.drop) dropTarget(el, r.drop);
      els.set(r.key, el);
      box.appendChild(el);
    }
    const focusRow = (key) => {
      const el = els.get(key);
      if (!el) return;
      for (const other of els.values()) other.tabIndex = -1;
      el.tabIndex = 0;
      el.focus();
    };
    box.addEventListener("keydown", (e) => {
      const row = byKey.get(document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : "");
      if (!row || e.target !== els.get(row.key)) return;
      const i = rows.indexOf(row);
      const go = (r) => { if (r) { e.preventDefault(); focusRow(r.key); } };
      if (e.altKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
        e.preventDefault();
        if (opts.onMove) opts.onMove(row, e.key.slice(5).toLowerCase());
        return;
      }
      if (e.key === "ArrowDown") go(rows[i + 1]);
      else if (e.key === "ArrowUp") go(rows[i - 1]);
      else if (e.key === "Home") go(rows[0]);
      else if (e.key === "End") go(rows[rows.length - 1]);
      else if (e.key === "ArrowRight") {
        if (row.expandable && !row.expanded) { e.preventDefault(); opts.onToggle(row, true); } else if (row.expandable) go(rows[i + 1]);
      } else if (e.key === "ArrowLeft") {
        if (row.expandable && row.expanded) { e.preventDefault(); opts.onToggle(row, false); } else go(byKey.get(row.parentKey));
      } else if (e.key === "Enter") { e.preventDefault(); opts.onSelect(row, {}); }
      else if (e.key === " ") { e.preventDefault(); opts.onSelect(row, { toggle: true }); }
      else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) { e.preventDefault(); openMenu(row, els.get(row.key)); }
    });
    return { node: box, focus: focusRow, rowEl: (key) => els.get(key) };
  }

  // ---------------------------------------------------------------- ordered lists

  /**
   * A list whose order matters, its items moved by drag, by their buttons and by Alt+Up and Alt+Down: proposal
   * orders, the palette grouping, the diagram group order. opts: { name, label, items: [{ id, label }],
   * move(from, to), remove(index) }.
   */
  function orderedList(opts) {
    const kind = "olist:" + opts.name;
    const last = opts.items.length - 1;
    const list = h("ol", { class: "olist", "aria-label": opts.label, "data-scope": opts.name });
    opts.items.forEach((it, i) => {
      const li = h("li", { class: "olist-row", tabindex: "0", "data-key": it.id, "aria-label": `${i + 1}. ${it.label}` },
        h("span", { class: "grip", "aria-hidden": "true" }, "⠿"),
        h("span", { class: "olist-n" }, `${i + 1}`),
        h("span", { class: "olist-label" }, it.label),
        h("span", { class: "spacer" }),
        h("button", { class: "btn small ghost", type: "button", disabled: i === 0, "aria-label": `Move ${it.label} up`, onclick: () => opts.move(i, i - 1) }, "↑"),
        h("button", { class: "btn small ghost", type: "button", disabled: i === last, "aria-label": `Move ${it.label} down`, onclick: () => opts.move(i, i + 1) }, "↓"),
        h("button", { class: "btn small ghost", type: "button", "aria-label": `Remove ${it.label}`, onclick: () => opts.remove(i) }, "×"));
      li.addEventListener("keydown", (e) => {
        if (e.target !== li || !e.altKey) return;
        if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); opts.move(i, i - 1); }
        if (e.key === "ArrowDown" && i < last) { e.preventDefault(); opts.move(i, i + 1); }
      });
      draggable(li, () => ({ kind, items: [i], label: it.label }));
      dropTarget(li, {
        between: true,
        into: false,
        accept: (p, where) => {
          if (p.kind !== kind) return null;
          const from = p.items[0];
          let to = where === "before" ? i : i + 1;
          if (from < to) to--;
          if (to === from) return { ok: false, hint: "Already here" };
          return { ok: true, hint: `To place ${to + 1}`, run: () => opts.move(from, to) };
        },
      });
      list.appendChild(li);
    });
    return list;
  }

  root.LAStudio = Object.assign(root.LAStudio || {}, {
    ui: { h, draggable, dropTarget, tree, orderedList, menu, picker, popover, closeMenu, isDragging: () => !!drag },
  });
})(typeof self !== "undefined" ? self : this);
