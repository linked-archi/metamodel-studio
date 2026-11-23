# Tasks: Metamodel Studio

`(SReq n.m)` points at `requirements.md`, `(SD-n)` at `design.md`.

---

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
- [x] `.github/` removed: no GitHub Actions, no GitHub Pages
- [x] README: the online address, the source and issues, the pipeline, *Deploying*
- [ ] On GitLab: the public project `linked-archi/linked-archi-tools/modellers/metamodel-studio`, created empty; the
  environment `production` and the deploy variables (README, *Deploying*)
- [ ] On the server: the folder and the two nginx locations (README, *Deploying*)
- [ ] `main` pushed to GitLab; the first deploy
- [ ] A push mirror to `github.com/linked-archi/metamodel-studio` (*Settings › Repository › Mirroring
  repositories*). On GitHub: issues off, and the description pointing to GitLab

## A2–A4

See `plan.md`. Not started.

## Known limitations

- **Import keeps what the project model holds.** From a published set it drops icons (`arch:prefVisNotation`,
  `arch-vis:iconSymbol`), alternative styles, rendering modes and default sizes, presentation contexts, palette
  grouping and diagram group order, element and principle shapes, relationship tables, and the source attribution
  on classes.
- **The kernel checks run locally only** until `@linked-archi/kernel` is published (SReq 9.5). They use the tarball
  the kernel packed on 2026-11-20; its `metamodel-manager` and `rdf-engine` equal the kernel's source of
  2026-11-21. When the kernel packs again, run `npm install`.
- **An imported own shape is previewed as its fallback shape.**
- **`templates/templates.js` is 362 KB**, most of it ArchiMate 4.0's 5,932 rules, and the page loads it at start.
- **la-gram takes one uploaded file at a time.** A set that is not yet published is uploaded document by document,
  the manifest last (README, *Using the result in la-gram*).

## Change log

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
