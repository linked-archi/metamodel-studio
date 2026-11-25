---
inclusion: auto
description: Principles, conventions and workflow for the Linked.Archi Metamodel Studio, which designs Linked.Archi metamodels and generates their semantic asset sets.
---

# Metamodel Studio — Project Conventions

## What This Is

A browser tool and a command line for designing a Linked.Archi metamodel and generating its semantic asset set:
the ontology, SHACL shapes, SKOS taxonomy, viewpoints, notation set and the `arch:Metamodel` manifest. One engine
(`js/core.js`, `generator.js`, `importer.js`, `lint.js`) serves the browser and the command line.

The studio is the writing side of the ecosystem. la-gram and the Linked.Archi workspace read metamodels through
`@linked-archi/kernel` (`../linked-archi-kernel`), so a generated set is right when the kernel reads from it what
its author designed. The plan is for this engine to become the authoring engine behind the workspace's
Administration screens: `specs/studio/plan.md`, and platform decision PD-16 in
`linked-archi-platform/docs/decisions.md` (accepted on 2026-11-24; history in `tasks/metamodel-authoring-decision/`).

## Principles

1. **Use the published vocabulary exactly.** Every `arch:` and `arch-vis:` term the generator writes is declared in
   core or core-vis, as published at meta.linked.archi. A test checks it against `fixtures/core/`. When the
   vocabulary changes, the studio follows it; it never writes a term of its own in those namespaces.
2. **What the consumers read decides.** The kernel checks (`tests/kernel/`) load every generated set the way
   la-gram does and compare what the kernel reads with the project: shapes, lines, line ends, colours, proposal
   orders, permitted pairs, completeness.
3. **The studio's own output round-trips.** Generate, import and generate again gives the same graphs. Importing a
   published set keeps what the project model can hold; `specs/studio/tasks.md`, *Known limitations*, lists what it
   cannot hold yet.
4. **The browser app needs no build.** Plain scripts and the vendored N3.js browser bundle; it runs from disk or
   from any static host. Development tools (Vitest, the kernel package, Playwright) are development dependencies
   only.
5. **The engine has no DOM.** `core.js`, `generator.js`, `importer.js`, `lint.js` and `zip.js` run unchanged in
   Node. Only the page's own scripts touch the page: `app.js`, and `tree.js` for its trees, ordered lists, menus
   and drag and drop. What a move does to the project is the engine's (`core.js`), so the workspace's
   Administration screens get the same moves through the engine package.
6. **Every drag has a menu and a key.** Whatever can be done by dragging can be done from a row's menu and from
   the keyboard (WCAG 2.2, 2.1.1 and 2.5.7).

## Code Conventions

- **Modules** are UMD: `window.LAStudio.<name>` in the browser, CommonJS under Node. No other globals. `tree.js` is
  `window.LAStudio.ui`, the browser only.
- **Ids** are local names, unique per namespace (`core.SCOPES`): concepts in `<base>onto#`, categories and
  proposal orders in `<base>tax#`, viewpoint items in `<base>viewpoints#`, own shapes in `<base>notation#`. Rename
  and delete through `core.renameRef` and `core.removeRef`, which update every reference in the scope.
- **Notation values** are the studio's names (`rounded-rectangle`, `dashed`, `open`). `core.js` alone maps them to
  core-vis IRIs, both ways (`CORE_SHAPES`, `LINE_STYLE_IRIS`, `DECORATION_IRIS`).
- **Project files** carry `format`. A structural change bumps it, and `core.normalize` migrates older files.
- **Generated and copied files are not edited by hand:**
  - `templates/templates.js` is written by `npm run templates`;
  - `fixtures/` holds byte-identical copies of published documents, refreshed by `npm run fixtures`;
  - `vendor/n3.min.js` is N3.js's browser bundle, at the version the kernel pins (2.13.12).
- **Comments** say why, and name the requirement (SReq n.m) or design decision (SD-n) behind a choice.

## Tech Stack

- **App and engine:** JavaScript (ES2019+), no framework, no build; N3.js 2.13.12 for parsing.
- **Tests:** `node:test` (no dependencies); Python with pyoxigraph and pyshacl; Vitest with `@linked-archi/kernel`
  (development dependencies, Node 22+); Playwright for the page (a development dependency, with the installed
  Chrome or Playwright's Chromium).

## File Structure

```
index.html, styles.css    the page
js/app.js                 the user interface
js/tree.js                its trees, ordered lists, menus and drag and drop
js/core.js                project model, namespaces, scoped ids, rename and delete, notation vocabulary,
                          and the moves, orders and relations the trees use
js/generator.js           project -> Turtle documents
js/importer.js            Turtle documents -> project
js/lint.js                checks
js/zip.js                 .zip export
scripts/cli.js            command line
scripts/build-templates.js  templates/templates.js from fixtures/
scripts/sync-fixtures.mjs   fixtures/ from the installed kernel package
fixtures/                 copies of published documents (core, ArchiMate 4.0)
tests/studio.test.js      Node checks, no dependencies
tests/test_metamodel_studio.py  RDF and SHACL checks with independent tooling
tests/kernel/             what la-gram and the workspace read from generated sets, through the kernel
tests/ui/                 the page in a browser: drags, menus and keys
vendor/n3.min.js          N3.js browser bundle
```

## Workflow

- **Specs are living documents.** A change and the documents that describe it go in together.
- **Task folders.** A piece of work another person or agent may continue gets a folder, `.agents/tasks/<name>/`,
  written before the work.

### Finishing a change

1. **Tests.** `npm test` and `python3 -m unittest discover -s tests`. After `npm install`, `npm run test:kernel`,
   and for a change to the page `npm run test:ui`. A fixed bug gets a test that fails without the fix.
2. **Templates.** `npm run templates` when the importer, the generator, the project model or `fixtures/` changed.
   A test fails while the committed templates are stale.
3. **`README.md`**: what the change does for a user.
4. **`specs/studio/`**: a requirement changed or added (SReq n.m), a decision made for a reason (SD-n), the
   checklist in `tasks.md` and an entry at the top of its change log.
