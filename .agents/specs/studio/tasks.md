# Tasks: Metamodel Studio

`(SReq n.m)` points at `requirements.md`, `(SD-n)` at `design.md`.

---

## A4 Form authoring scope — 2026-11-25

- [x] Align the plan with the current S01 contract. Author SHACL sections, field names and order, and
  language-tagged ontology and taxonomy labels for any metamodel.
- [ ] Implement and qualify the A4 authoring and round-trip behavior.

## A1 Align with core, core-vis and the kernel

**2026-11-21: done, uncommitted, for review.** Working notes and the failing baseline: `../../tasks/a1-align/`.

- [x] Checked in la-gram's page (its web build of 2026-11-21, headless Chrome): the Cloud Platform set uploaded file by file, the manifest last; *Show loaded assets…* lists every document loaded and nothing incomplete; the palette has Compute, Data and Integration; the canvas draws the database as a cylinder, usage and publication dashed, deployment with a dot at its start and a filled arrowhead, exposure in its colour; drawing a line proposes the studio's relationship first, and from a database to a microservice offers no usage. Validation reports the required resilience level on the two workloads, as the attribute shape says (2026-11-21)

- [x] Working documents: `.agents/` (conventions, requirements, design, plan, tasks), `.kiro` links, `AGENTS.md`, `CLAUDE.md`; the draft platform decision (2026-11-21)
- [x] Kernel checks written first, failing on the code as it was: 7 failed, 8 passed, 5 skipped (SReq 9, SD-7) — *tests/kernel/consumers.test.mjs*, *baseline.md*
- [x] Notation in core-vis terms: shape types on the style, line styles, both line ends, colours on the style (SReq 6.2–6.4, SD-2) — *studio.test.js*, *consumers.test.mjs*
- [x] Own shapes: cylinder and folder built in, project shapes, import keeps a notation's own shapes (SReq 6.5, SD-3) — *studio.test.js*
- [x] The notation document imports core-vis (SReq 6.1) — *studio.test.js*
- [x] Proposal orders: `skos:OrderedCollection`s named by `arch:relationshipProposalOrder`, general and scoped, generated, imported and edited (SReq 4.2–4.3, 1.4, SD-4) — *studio.test.js*, *consumers.test.mjs*, *test_metamodel_studio.py*
- [x] The taxonomy as a plain `skos:ConceptScheme` (SReq 1.3, SD-5) — *studio.test.js*
- [x] `vann:` prefix and namespace on every document (SReq 1.2) — *studio.test.js*
- [x] N3.js 2.13.12, one file for the browser and Node; RDF 1.2 parses (SReq 7.4, SD-8) — *studio.test.js*
- [x] Earlier project files and earlier studio output still open (SReq 7.3, 10.3, SD-9, SD-10) — *studio.test.js*
- [x] Fixtures: byte-identical copies from the kernel's assets, `npm run fixtures`, `--check` (SD-6) — *tests/kernel/fixtures.test.mjs*
- [x] ArchiMate 4.0 template from the published documents: 5,932 rules, taxonomy, 9 proposal orders, notation with 6 own shapes — *test_metamodel_studio.py*
- [x] Checks for shapes, line styles, line ends, own shapes and proposal orders (SReq 8.1) — *studio.test.js*
- [x] Generated terms declared in core and core-vis (SReq 1.5) — *test_metamodel_studio.py*
- [x] `npm test` (18), the Python tests (11) and `npm run test:kernel` (29) pass; the page renders every section of both templates and imports the published ArchiMate 4.0 with no console error
- [x] README, fixtures/README, NOTICE, the CI note

## Move to GitLab (SD-11)

**2026-11-22: the repository's part done, uncommitted, for review.** The rest is done on GitLab and GitHub, by the
maintainer.

- [x] `.gitlab-ci.yml`, valid against GitLab's CI schema:
  - `check`: `npm test`, the Python tests and the command line, on a merge request and on `main`. Its job run in
    `node:22` under Docker passed: 18 Node tests, 11 Python tests, none skipped;
  - `deploy`: on `main`, the page to `https://app.linked.archi/metamodel-studio/`, as la-gram's `web-deploy`.
    Rehearsed in Docker against a stand-in SSH host: the 13 files copied, 644 and 755; a file no longer in the
    page taken away; without `STUDIO_DEPLOY_PATH` it stops and says so
- [x] The page under the site's headers, la-gram's Content-Security-Policy included, at `/metamodel-studio/`: every
  section of both templates, an export, an import of the published ArchiMate 4.0 and a reload; no CSP violation.
  The one console error is the missing `/favicon.ico`, as before
- [x] `.github/` removed: no GitHub Actions, no GitHub Pages. Reversed on 2026-11-25: three workflows and the demo
  (SD-19, *The demo and the releases*)
- [x] README: the online address, the source and issues, the pipeline, *Deploying*
- [ ] On GitLab: the public project `linked-archi/linked-archi-tools/modellers/metamodel-studio`, created empty; the
  environment `production` and the deploy variables (README, *Deploying*)
- [ ] On the server: the folder and the two nginx locations (README, *Deploying*)
- [ ] `main` pushed to GitLab; the first deploy
- [ ] A push mirror to `github.com/linked-archi/metamodel-studio` (*Settings › Repository › Mirroring
  repositories*). On GitHub: issues off, and the description pointing to GitLab

## Hierarchy editing (SReq 11, SD-12 to SD-16)

**2026-11-25: done, uncommitted, for review.** Working notes: `../../tasks/hierarchy-editing/`.

- [x] One tree for every hierarchy: an item under each of its parents, a type of another language as an anchor, rows
  that fold (SReq 11.1, SD-12) — *tests/ui*
- [x] Moves that refuse cycles; the row under the pointer says what a drop does, or why not (SReq 11.2) —
  *studio.test.js, tests/ui*
- [x] Drag and drop, with a menu and keys for every move; several rows at once (SReq 11.3, SD-16) — *tests/ui*
- [x] Relations on each element and relationship type's page, with a diagram (SReq 11.4) — *studio.test.js*
- [x] The taxonomy as a board: members in the tree, the types in no category, a grid of two dimensions (SReq 11.5) —
  *tests/ui*
- [x] The match between a category and an abstract type, computed, with fixes and offers (SReq 11.6, SD-13) —
  *studio.test.js, tests/ui*
- [x] Orders: a category's groups and types, the palette grouping, the diagram bands and the proposal orders;
  written, imported and read by the kernel (SReq 4.4–4.5, 7.2, 9.2, 9.4, 11.7, SD-14) — *studio.test.js,
  test_metamodel_studio.py, consumers.test.mjs*
- [x] Project format `/3` (SReq 10.3, SD-15) — *studio.test.js*
- [x] The Cloud Platform template orders Compute's types, groups its palette by Elements and keeps diagram bands
- [x] `npm test` (31), the Python tests (12), `npm run test:kernel` (31) and `npm run test:ui` (11) pass; every page
  renders both templates with no page error, light and dark, and at phone width
- [x] Playwright as a development dependency, `playwright@1.63.0`, the version la-gram uses (2026-11-25)
- [x] Reading and writing the `rdfs:seeAlso` from a category to its abstract type: decided on 2026-11-25, done in
  *The category link and the base* below

## The category link and the base (SReq 4.6, 11.8, 12, SD-17, SD-18)

**2026-11-25: done, uncommitted, for review.** Working notes: `../../tasks/base-metamodel/`.

- [x] A category's `standsFor`: read from `rdfs:seeAlso` to an element type, written back, renamed and deleted with
  its type (SReq 4.6, SD-17) — *studio.test.js, test_metamodel_studio.py*
- [x] Its page compares the stated type with the members, and offers to name the type the members suggest; the
  tree's badge shows the stated type first (SReq 11.8) — *studio.test.js, tests/ui*
- [x] Checks: a link to what is no element type, an empty category standing for a concrete type, and members that
  differ from the stated type's subtypes (SReq 4.6) — *studio.test.js*
- [x] The bases of a project, from its imports and the studio's templates or documents loaded in the browser
  (SReq 12.1, SD-18) — *studio.test.js*
- [x] The trees show a base's types, read only, with the project's types under them; a drop on a base type
  specializes it (SReq 12.2) — *tests/ui*
- [x] A base type's page, read only, with a way to make a subtype of it (SReq 12.3) — *tests/ui*
- [x] The categories a type has in a base, in its relations and in the base's taxonomy on the taxonomy page
  (SReq 12.4) — *studio.test.js, tests/ui*
- [x] Checks on references into a base, in the page and on the command line (SReq 12.5) — *studio.test.js*
- [x] Loading a base's documents from the Overview, kept in the browser (SReq 12.6) — *tests/ui*, with the kernel's
  ArchiMate 3.2 documents
- [x] `npm test` (36), the Python tests (13), `npm run test:kernel` (31) and `npm run test:ui` (16) pass; the
  ArchiMate 4.0 palette la-gram reads is unchanged with the links written

## The demo and the releases (SReq 10.4–10.6, SD-19)

**2026-11-25: done, for review.** Working notes: `../../tasks/demo-and-releases/`. Publishing needs two settings on
GitHub and a tag, by the maintainer.

- [x] The engine for Node: `index.js`, the page's `window.LAStudio` without its user interface — *package.test.js*
- [x] `la-studio serve`, the page on this computer only and nothing outside its folder; `la-studio --version`
  (SReq 10.5) — *package.test.js*
- [x] `npm run build`: the npm package, packed from a copy at the build's version without the scripts and
  development dependencies; the page's zip; the demo site, with both under `packages/` and a page saying how to
  install them (SReq 10.6) — *package.test.js*
- [x] Installed from its tarball's address with npm 11: globally, in a project and with `npx`. The command, the
  engine and the page run from it — *package.test.js*; by hand over HTTP
- [x] Building a version again gives the same bytes, so the demo's copies equal the release's — *package.test.js*;
  the release's and the demo's steps rehearsed under bash
- [x] A link opens a starting point, and the Overview says where to start (SReq 10.4) — *tests/ui*
- [x] The page's icon, `favicon.svg`: the page had none, so every visit logged a failed request for one
- [x] `.github/workflows/`: `ci.yml`, `release.yml`, `demo.yml`, valid against GitHub's workflow schema, with the
  actions' current major versions
- [x] README, *Installing* and *Releases and the demo*; SReq 10.4–10.6; SD-19, and SD-11's line on GitHub
- [ ] On GitHub, once: *Settings › Pages › Source: GitHub Actions*; *Settings › Environments › github-pages ›
  Deployment branches and tags*, a tag rule `v*`
- [ ] The first release, `v0.1.0`, and the demo checked at <https://linked-archi.github.io/metamodel-studio/>

## A2–A4

See `plan.md`. Not started.

## Known limitations

- **Import keeps what the project model holds.** From a published set it drops icons (`arch:prefVisNotation`,
  `arch-vis:iconSymbol`), alternative styles, rendering modes and default sizes, presentation contexts, element and
  principle shapes, relationship tables, the source attribution on classes, and ArchiMate 4.0's strength
  collections, which two relationship categories link to with `rdfs:seeAlso`.
- **A base is shown, not pinned.** The project names it by an import; the studio carries ArchiMate 4.0, and any other
  base's documents are loaded per browser. The project's types are shown in a base's categories, not classified in
  them (SD-18).
- **Drag and drop needs a mouse or a pen.** On a touch screen a list scrolls instead, and a row's menu moves it.
- **Subtypes have no order of their own:** element and relationship subtypes are listed by name, catalog categories
  in the order they were made.
- **The page's checks run locally,** with Playwright and a browser, not in CI.
- **The page's zip is not compressed,** 965 KB: the studio's zip writer stores its entries, as the asset set's
  export does.
- **The kernel checks run locally only** until `@linked-archi/kernel` is published (SReq 9.5). They use the tarball
  the kernel packed on 2026-11-20; its `metamodel-manager` and `rdf-engine` equal the kernel's source of
  2026-11-21. When the kernel packs again, run `npm install`.
- **An imported own shape is previewed as its fallback shape.**
- **`templates/templates.js` is 362 KB**, most of it ArchiMate 4.0's 5,932 rules, and the page loads it at start.
- **la-gram takes one uploaded file at a time.** A set that is not yet published is uploaded document by document,
  the manifest last (README, *Using the result in la-gram*).

## Change log

- **2026-11-25. The demo and the releases (SReq 10.4–10.6, SD-19).**
  - **A demo on GitHub Pages,** built by `demo.yml` from each release and by hand: the page, a link to each
    starting point, a note on where to start, and under `packages/` the release's two files. *tests/ui*
  - **Two packages on each release:** the npm package, with `la-studio`, the engine for Node and the page, which
    `la-studio serve` serves; and the page as a zip. Both install from their address, with no registry.
    *package.test.js*
  - **CI on GitHub,** the checks GitLab's `check` job runs, and the build. *ci.yml*
- **2026-11-25. The category link and the base (SReq 4.6, 11.8, 12, SD-17, SD-18).**
  - **A category keeps the type it stands for,** `standsFor`, read from and written as `rdfs:seeAlso`, as the
    published ArchiMate 4.0 taxonomy links its 14 categories to their classes. Its page compares that type with the
    members. *studio.test.js, test_metamodel_studio.py, tests/ui*
  - **A metamodel that extends another shows it:** its types in the trees, read only, with the project's under them;
    a page for each; the categories the project's types have through them; checks on references into it; and its
    documents loaded from the Overview when the studio does not carry it. *studio.test.js, tests/ui*
- **2026-11-25. Editing hierarchies and classification (SReq 11, SD-12 to SD-16).**
  - **Trees** for element types, relationship types, taxonomy categories and the viewpoint catalog: an item under
    each of its parents, a type of another language as an anchor. The element tree had listed a type under its first
    parent only, so ArchiMate 4.0's domain types showed empty; the relationship list had indented subtypes under the
    wrong rows. *tests/ui*
  - **Drag and drop, menus and keys** for every move (`tree.js`), each through a new engine function in `core.js`.
    *studio.test.js, tests/ui*
  - **Relations** on each type's page, with a diagram. *studio.test.js*
  - **The taxonomy as a board,** with a grid of two dimensions and the match between categories and abstract types
    worked out from membership. *studio.test.js, tests/ui*
  - **Orders written and read:** thesaurus arrays under categories, the palette grouping and the diagram group order;
    project format `/3`. Importing ArchiMate 4.0 and generating it again now gives la-gram the published palette.
    *studio.test.js, test_metamodel_studio.py, consumers.test.mjs*
- **2026-11-22. The repository moves to GitLab (SD-11).** A public project beside la-gram, with a push mirror to
  GitHub for visibility. The engine becomes `packages/engine` here and is published to the project's package
  registry. `.gitlab-ci.yml` replaces GitHub Actions, and the page is deployed beside la-gram at
  `https://app.linked.archi/metamodel-studio/`; no GitHub Pages.
- **2026-11-22. Platform decision PD-16 proposed.** The draft moved to `linked-archi-platform/docs/decisions.md`;
  the platform's `docs/plan.md` lists this plan's steps as tickets A1–A4, F05 depends on A3, and K02 is frozen from
  A2's calls too. The workspace's Req 14.2–14.3 and W08 follow it. The kernel's K02 list is still to follow
  (`../../tasks/metamodel-authoring-decision/`).
- **2026-11-21. A1: aligned with core 0.6.0, core-vis 0.9 and the kernel.**
  - **Notation** in core-vis terms: each descriptor's `arch-vis:Style` has the shape type and colours, or a
    relationship's line style, both line ends and colour; figures core-vis lacks are own `arch-vis:ShapeType`s
    (cylinder and folder built in); octagon added; the document imports core-vis. la-gram, which kept only the
    colours before, now reads every shape, line and line end. *tests/studio.test.js, tests/kernel/consumers.test.mjs*
  - **Proposal orders** as `skos:OrderedCollection`s named from the manifest with
    `arch:relationshipProposalOrder`, any number, general or scoped; edited on the Taxonomy page. la-gram read none
    before. *studio.test.js, consumers.test.mjs, test_metamodel_studio.py*
  - **Headers:** the taxonomy is a plain concept scheme; every document declares its `vann:` prefix.
    *studio.test.js*
  - **Import:** N3.js 2.13.12 (RDF 1.2), the published notation, own shapes and proposal orders, and the studio's
    earlier terms. Importing the published ArchiMate 4.0 now keeps its 44 shapes and 9 proposal orders, as the
    kernel reads them. *studio.test.js, consumers.test.mjs*
  - **Project format `/2`**, migrating `/1` on open. *studio.test.js*
  - **Fixtures** replaced by byte-identical copies of the published core, core-vis and ArchiMate 4.0
    (`npm run fixtures`); the stale extracts and the unused ArchiMate 3.2 and `shapes.ttl` extracts removed. The
    ArchiMate 4.0 template is built from them, rules included, with no error-level finding.
    *tests/kernel/fixtures.test.mjs, test_metamodel_studio.py*
  - **Checks** for unknown shapes, line styles and line ends, own shapes without an outline, and proposal orders.
    *studio.test.js*
  - **Kernel checks** (`npm run test:kernel`): Vitest and the kernel's tarball as development dependencies.
- **2026-11-21. Working documents.** `.agents/` written from the analysis of the studio against la-gram, the kernel,
  linked-archi-meta and the workspace; the plan A1–A4 agreed; the platform decision drafted.
