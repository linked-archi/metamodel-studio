# Linked.Archi Metamodel Studio

A browser tool for designing a **complete Linked.Archi metamodel**: the full set of
semantic assets that make up a modeling language, matching how ArchiMate 4.0, BPMN, C4,
Backstage and LeanIX are published on meta.linked.archi. You fill in forms, a
relationship matrix and checklists. The studio writes the OWL, SHACL and SKOS, the
notation in core-vis terms, and the `arch:Metamodel` manifest that ties them together.

**Use it online: <https://app.linked.archi/metamodel-studio/>**. Your work stays in
your browser (localStorage) until you save or export it. Nothing is uploaded.

The source, its issues and merge requests are on GitLab:
<https://gitlab.com/linked-archi/linked-archi-tools/modellers/metamodel-studio>. GitHub has a
read-only copy.

It needs no build step, no server and no dependencies, so it also runs offline. Open
`index.html` in a browser:

```bash
xdg-open index.html      # or: open index.html on macOS, or double-click it
npm run serve            # or serve the folder from any static host
```

The same code runs from the command line for CI and scripting (Node 18 or newer, no
packages to install):

```bash
node scripts/cli.js template cloudplatform -o cloudplatform.studio.json
node scripts/cli.js generate cloudplatform.studio.json -o out/
node scripts/cli.js lint cloudplatform.studio.json
node scripts/cli.js import onto.ttl shapes.ttl viewpoints.ttl -o project.studio.json
```

## What a Linked.Archi metamodel is

A metamodel is the definition of a modeling language. In Linked.Archi it is not a single
file. It is a **manifest**: an instance of `arch:Metamodel` (core ontology,
`https://meta.linked.archi/core#`) whose properties point at the documents that make up
the language. The studio generates one document per manifest property:

| Manifest property | Document | What it holds |
|---|---|---|
| `arch:modelConcepts` | `<slug>-onto.ttl`: `owl:Ontology` at `<base>onto#` | Element types (`owl:Class` ⊑ `arch:Element`, abstract ones marked `arch:isAbstractClass true`). Relationship types as three terms each: a `QualifiedRelationship` subclass carrying `skos:notation` (the letter of the specification's tables), its direct predicate (`arch:unqualifiedForm`) with `arch:domainIncludes`/`arch:rangeIncludes` guidance, and a `qualified<Rel>` predicate. Attributes (`owl:DatatypeProperty`). |
| `arch:formalRules` | `<slug>-shapes.ttl`: `<base>shapes#` | SHACL. Per relationship, a `sh:NodeShape` targeting the relationship class with an `sh:or` of `(source, target)` `sh:and` pairs; per source element, a shape over its direct predicates; per attribute, datatype, cardinality and `sh:in`. This is the layout of the published ArchiMate shapes. |
| `arch:conceptClassification` | `<slug>-tax.ttl`: a plain `skos:ConceptScheme` at `<base>tax#` | Categories (`skos:narrower` down to the classes) and the relationship proposal orders (`skos:OrderedCollection`). |
| `arch:relationshipProposalOrder` | in `<slug>-tax.ttl` | Each order in which a modelling tool proposes relationship types when two elements are connected: the general one, and any that name the source or target types they apply to (`arch:domainIncludes`, `arch:rangeIncludes`). |
| `arch:architectureViewpoints`, `arch:viewpointLibrary` | `<slug>-viewpoints.ttl`: `<base>viewpoints#` | `arch:Viewpoint` individuals (`arch:includesConcept`, `arch:targetsStakeholder`, `arch:viewpointFramesConcern`, `arch:viewpointHasPurpose`, `arch:viewType`), the stakeholders, concerns and purposes they use, and the `ViewpointCatalog` concept scheme. |
| `arch:notationSet` | `<slug>-notation.ttl`: `<base>notation#` | An `arch-vis:NotationSet` with an `arch-vis:VisualNotation` per concept. Its `arch-vis:Style` carries the shape type (`arch-vis:Rectangle`, `arch-vis:RoundedRectangle`, …) and colours of an element type, and the line style and both line ends (`arch-vis:sourceDecor`, `arch-vis:targetDecor`) of a relationship type. Figures core-vis does not define, such as a cylinder, are declared as own `arch-vis:ShapeType`s with a core fallback and path templates. |
| *(entry point)* | `<slug>-metamodel.ttl`: `<base>metamodel#<Name>` | The `arch:Metamodel` itself: `owl:versionInfo` (the *language* version), `arch:basedOnFramework`, `arch:metamodelIdentifiesStakeholder`/`…Consideration`, and the properties above. |

Every document carries the header the published ones do: `dct:title`, `dct:description`,
`dct:creator`, `dct:created`/`dct:modified`, `bibo:status`, `owl:versionInfo`, and the
`vann:` preferred namespace and prefix. The ontologies also carry `owl:imports` and
`owl:versionIRI` (`<base>onto/<version>#`); the taxonomy, a concept scheme, does not.
Following the published layout, the prefixes are `<p>`, `<p>sh`, `<p>tax`, `<p>vp`,
`<p>not` and `<p>mm`. For ArchiMate 4.0 these are `am4:`, `am4sh:`, `am4tax:` and so on.

Every core and core-vis term the studio writes is declared in the published core
(0.6.0) and core-vis ontologies; a test checks it against `fixtures/core/`. Sources for
this structure: those ontologies, the published ArchiMate 4.0 documents (`fixtures/`),
the published Backstage, C4 and LeanIX manifests and shapes, and the manifest reader of
`la-profile derive` in [linked-archi-apm](https://github.com/linked-archi/linked-archi-apm).

## The sections

- **Overview**: identity, IRIs, versions, which assets to ship, the manifest's
  stakeholders and considerations, and other languages you extend (for example,
  `cp:Microservice` ⊑ `am4:ApplicationComponent`).
- **Elements**: the type hierarchy as a tree. Abstract and concrete types, multiple
  inheritance, labels, definitions, taxonomy categories and default notation.
- **Relationships**: class, direct predicate, notation letter, specialization (a subtype
  that keeps its parent's predicate, such as `ReadAccess` → `accesses`, declares no
  predicate of its own), domain/range guidance, and the line: its style, both ends and
  colour.
- **Attributes**: datatype, applies-to, allowed values, required or repeatable.
- **Relationship rules**: a source × target matrix. Look at one relationship to toggle
  cells, rows or columns. Look at all of them to see the letters (as in the ArchiMate
  relationship tables) and pick from a popover. *Seed from domain/range* expands the
  guidance to concrete types as a starting point. A relationship with no rules stays
  unconstrained.
- **Taxonomy**: the category tree, its members, and the relationship proposal orders,
  general and scoped.
- **Viewpoints**: catalog categories, stakeholders, concerns, purposes, view types, and
  the admitted concepts picked by taxonomy group.
- **Notation**: the palette rendered from the notation set, and the own shapes.
- **Generated files**: every document, live, with syntax highlighting, plus download as
  a `.zip`.
- **Checks**: undefined references, duplicate ids, invalid names, cycles, child
  relationships allowing more than their parent, unknown shapes, line styles and line
  ends, own shapes without an outline, proposal orders naming what is not a relationship
  type, missing definitions and more. Each finding links to the item.

Work is saved in the browser as you go (localStorage, per browser). Use **Save project**
for the `.studio.json` file, which is the editable source to keep in version control,
and **Undo** (Ctrl+Z) for mistakes. Project files saved by earlier versions open and are
brought up to date.

## Starting points

- **Blank**.
- **Cloud Platform**: a small metamodel that extends ArchiMate 4.0, with complete rules,
  attributes, taxonomy, proposal orders and viewpoints, and a database drawn as an own
  cylinder. It is the quickest way to see every section filled in.
- **ArchiMate 4.0**: the published ArchiMate 4.0 documents in `fixtures/`: 61 element
  types (17 abstract), 15 relationship types, 5,932 relationship rules, 9 proposal
  orders, the 25 Appendix C viewpoints, and the notation with its 6 own shapes.
- **Import Turtle…**: any published Linked.Archi documents, by file or URL, RDF 1.2
  included. URLs work only if the server allows cross-origin requests; otherwise download
  the files and choose them. Element types are found through `rdfs:subClassOf arch:Element`
  (or any `owl:Class` in the language namespace), relationships through
  `arch:QualifiedRelationship`, rules from the relationship shapes, proposal orders from
  the manifest. Documents written by earlier versions of the studio import too.

Generating, importing and generating again is lossless. The tests check that all six
documents come back isomorphic. Importing a published set keeps what the studio's project
model holds: it leaves out, for now, icons, alternative styles, rendering modes,
presentation contexts, palette grouping, element and principle shapes, relationship
tables and the source attribution on classes.

## Using the result in la-gram

la-gram loads a published set by its metamodel IRI, for example
`https://meta.example.org/cloudplatform/metamodel#CloudPlatform`. Before the set is
published, upload its documents with *Metamodels › Upload metamodel or asset file…*,
one at a time: every other document first, the manifest last.

The kernel checks (`npm run test:kernel`) load every generated set the way la-gram does,
through `@linked-archi/kernel`, and compare what it reads with the project: the shapes,
lines and line ends, the proposal orders, the permitted pairs, and that nothing is
reported incomplete.

## Using the result with linked-archi-apm

The [linked-archi-apm](https://github.com/linked-archi/linked-archi-apm) skills read the
generated set directly: `la-profile derive` reads the manifest, and `la-validate` runs the
shapes. From a linked-archi-apm checkout:

```bash
python3 bin/la-kg profile derive cloudplatform --metamodel out/cloudplatform-metamodel.ttl --notation cp -o profiles/cloudplatform.yaml
python3 bin/la-kg validate run --data model.trig --shapes out/cloudplatform-shapes.ttl
```

## Layout

| Path | |
|---|---|
| `index.html`, `styles.css`, `js/app.js` | The user interface |
| `js/core.js` | Project model: defaults, namespaces, scoped ids, rename and delete, the notation vocabulary |
| `js/generator.js` | Project → Turtle documents |
| `js/importer.js` | Turtle documents → project (uses N3.js) |
| `js/lint.js` | Checks |
| `js/zip.js` | `.zip` export |
| `templates/templates.js` | Starting points, written by `scripts/build-templates.js` |
| `scripts/cli.js` | Command line |
| `scripts/sync-fixtures.mjs` | Refreshes `fixtures/` from the kernel's copies of the published documents |
| `fixtures/` | Published documents, byte for byte: core, core-vis and ArchiMate 4.0 (`fixtures/README.md`) |
| `tests/` | `studio.test.js` (Node), `test_metamodel_studio.py` (Python), `kernel/` (through `@linked-archi/kernel`) |
| `vendor/n3.min.js` | [N3.js](https://github.com/rdfjs/N3.js) 2.13.12, its browser bundle, MIT (`vendor/N3-LICENSE.md`) |
| `.agents/` | Conventions, specification and plan, for people and coding agents (`AGENTS.md`) |

## Development

```bash
npm test                                         # Node checks, no dependencies
pip install -r requirements-dev.txt
python3 -m unittest discover -s tests            # independent RDF and SHACL checks
npm install                                      # development dependencies: Vitest and the kernel
npm run test:kernel                              # what la-gram and the workspace read from the output
npm run fixtures                                 # refresh fixtures/ from the kernel (-- --check compares)
npm run templates                                # after changing the importer, generator or fixtures
```

A test fails when the committed templates are stale. The kernel checks need Node 22 and
`@linked-archi/kernel`, installed from the tarball in `../linked-archi-kernel`; until the
kernel is published they run locally, not in CI.

GitLab CI (`.gitlab-ci.yml`) runs `npm test`, the Python tests and the command line on
every merge request and on `main`.

## Deploying

Each merge to `main` puts the page at <https://app.linked.archi/metamodel-studio/> once the
checks pass. The `deploy` job copies it over SSH onto the server that serves app.linked.archi,
as la-gram's pipeline copies la-gram, and takes away files no longer there. Only what the
browser loads goes: `index.html`, `styles.css`, `js/`, `vendor/`, `templates/`, `LICENSE` and
`NOTICE`.

Once, before the first deploy:

1. **Create the environment `production`**, with the URL above (*Operate › Environments*), so
   the variable form can offer it.
2. **Add the deploy variables** (*Settings › CI/CD › Variables*), each with *Protect variable*
   ticked, *Expand variable reference* cleared and the environment scope `production`:

   | Key | Type | Value |
   |---|---|---|
   | `DEPLOY_SSH_KEY` | File | the deploy user's private SSH key, all of it, ending with a new line |
   | `DEPLOY_HOST` | Variable | `app.linked.archi` |
   | `DEPLOY_USER` | Variable | `deploy` |
   | `STUDIO_DEPLOY_PATH` | Variable | `/var/www/linked-archi-app/metamodel-studio` |

   The key and the user can be the ones la-gram's deploy uses, or a key of the studio's own,
   added to the deploy user's `~/.ssh/authorized_keys`.
3. **On the server:** the folder for the deploy user, and two locations in the nginx site for
   app.linked.archi (kept with the host's configuration), beside la-gram's:

   ```bash
   sudo mkdir -p /var/www/linked-archi-app/metamodel-studio
   sudo chown deploy:www-data /var/www/linked-archi-app/metamodel-studio
   ```

   ```nginx
   location = /metamodel-studio {
       absolute_redirect off;
       return 301 /metamodel-studio/;
   }
   location ^~ /metamodel-studio/ {
       try_files $uri $uri/ =404;
   }
   ```

   Then `sudo nginx -t && sudo systemctl reload nginx`. The studio runs under the headers the
   site already sends for la-gram, its Content-Security-Policy included. Add no `add_header` in
   these locations: one would drop every header the site sets.

## Licence

Apache-2.0. See `NOTICE` for the vendored N3.js (MIT) and the fixtures (the licences they
state, mostly CC-BY-4.0).
