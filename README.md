# Linked.Archi Metamodel Studio

A browser tool for designing a **complete Linked.Archi metamodel**: the full set of
semantic assets that make up a modeling language, matching how ArchiMate 4.0, BPMN, C4,
Backstage and LeanIX are published on meta.linked.archi. You fill in forms, a
relationship matrix and checklists. The studio writes the OWL, SHACL and SKOS, and the
`arch:Metamodel` manifest that ties them together.

**Use it online: <https://linked-archi.github.io/metamodel-studio/>**. Your work stays in
your browser (localStorage) until you save or export it. Nothing is uploaded.

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
| `arch:formalRules` | `<slug>-shapes.ttl`: `<base>shapes#` | SHACL. Per relationship, a `sh:NodeShape` targeting the relationship class with an `sh:or` of `(source, target)` `sh:and` pairs; per source element, a shape over its direct predicates; per attribute, datatype, cardinality and `sh:in`. This is the layout of the published ArchiMate shapes (`amsh:AggregationShape`, `amsh:BusinessRoleRelShape`). |
| `arch:conceptClassification` | `<slug>-tax.ttl`: `skos:ConceptScheme` at `<base>tax#` | Categories (`skos:narrower` down to the classes), the palette groups, and the `arch:RelationshipProposalOrder`. |
| `arch:architectureViewpoints`, `arch:viewpointLibrary` | `<slug>-viewpoints.ttl`: `<base>viewpoints#` | `arch:Viewpoint` individuals (`arch:includesConcept`, `arch:targetsStakeholder`, `arch:viewpointFramesConcern`, `arch:viewpointHasPurpose`, `arch:viewType`), the stakeholders, concerns and purposes they use, and the `ViewpointCatalog` concept scheme. |
| `arch:notationSet` | `<slug>-notation.ttl`: `<base>notation#` | An `archvis:NotationSet` with a visual descriptor per concept (shape, colours, line and arrow style). |
| *(entry point)* | `<slug>-metamodel.ttl`: `<base>metamodel#<Name>` | The `arch:Metamodel` itself: `owl:versionInfo` (the *language* version), `arch:basedOnFramework`, `arch:metamodelIdentifiesStakeholder`/`…Consideration`, and the properties above. |

Every document carries the header the published ones do: `dct:title`, `dct:description`,
`dct:creator`, `dct:created`/`dct:modified`, `bibo:status`, `owl:versionIRI`
(`<base>onto/<version>#`), `owl:versionInfo`, and the `vann:` preferred namespace and
prefix. Following the published layout, the prefixes are `<p>`, `<p>sh`, `<p>tax`,
`<p>vp`, `<p>not` and `<p>mm`. For ArchiMate 4.0 these are `am4:`, `am4vp:`, `am4tax:` and so on.

Sources for this structure: the core ontology (`fixtures/core-onto.ttl`), the
ArchiMate 4.0 ontology and viewpoints (`fixtures/archimate4-*.ttl`), the published
Backstage, C4 and LeanIX manifests and shapes (`fixtures/shapes.ttl`), and the manifest
reader of `la-profile derive` in
[linked-archi-apm](https://github.com/linked-archi/linked-archi-apm).

## The sections

- **Overview**: identity, IRIs, versions, which assets to ship, the manifest's
  stakeholders and considerations, and other languages you extend (for example,
  `cp:Microservice` ⊑ `am4:ApplicationComponent`).
- **Elements**: the type hierarchy as a tree. Abstract and concrete types, multiple
  inheritance, labels, definitions, taxonomy categories and default notation.
- **Relationships**: class, direct predicate, notation letter, specialization (a subtype
  that keeps its parent's predicate, such as `ReadAccess` → `accesses`, declares no
  predicate of its own), and domain/range guidance.
- **Attributes**: datatype, applies-to, allowed values, required or repeatable.
- **Relationship rules**: a source × target matrix. Look at one relationship to toggle
  cells, rows or columns. Look at all of them to see the letters (as in the ArchiMate
  relationship tables) and pick from a popover. *Seed from domain/range* expands the
  guidance to concrete types as a starting point. A relationship with no rules stays
  unconstrained.
- **Taxonomy**: the category tree, its members, and the relationship proposal order.
- **Viewpoints**: catalog categories, stakeholders, concerns, purposes, view types, and
  the admitted concepts picked by taxonomy group.
- **Notation**: the palette rendered from the notation set.
- **Generated files**: every document, live, with syntax highlighting, plus download as
  a `.zip`.
- **Checks**: undefined references, duplicate ids, invalid names, cycles, child
  relationships allowing more than their parent, missing definitions and more. Each
  finding links to the item.

Work is saved in the browser as you go (localStorage, per browser). Use **Save project**
for the `.studio.json` file, which is the editable source to keep in version control,
and **Undo** (Ctrl+Z) for mistakes.

## Starting points

- **Blank**.
- **Cloud Platform**: a small metamodel that extends ArchiMate 4.0, with complete rules,
  attributes, taxonomy and viewpoints. It is the quickest way to see every section filled in.
- **ArchiMate 4.0**: built from the linked-archi-meta extracts in `fixtures/`:
  62 element types, 15 relationship types and the 25 Appendix C viewpoints. The extracts
  have no ArchiMate 4.0 SHACL shapes, so its rule matrix starts empty, and its taxonomy is
  derived from the 4.0 domain marker classes.
- **Import Turtle…**: any published Linked.Archi documents, by file or URL. URLs work
  only if the server allows cross-origin requests; otherwise download the files and choose
  them. Element types are found through `rdfs:subClassOf arch:Element` (or any `owl:Class`
  in the language namespace), relationships through `arch:QualifiedRelationship`, and rules
  from the relationship shapes.

Generating, importing and generating again is lossless. The tests check that all six
documents come back isomorphic.

## Using the result with linked-archi-apm

The [linked-archi-apm](https://github.com/linked-archi/linked-archi-apm) skills read the
generated set directly: `la-profile derive` reads the manifest, and `la-validate` runs the
shapes. From a linked-archi-apm checkout:

```bash
python3 bin/la-kg profile derive cloudplatform --metamodel out/cloudplatform-metamodel.ttl --notation cp -o profiles/cloudplatform.yaml
python3 bin/la-kg validate run --data model.trig --shapes out/cloudplatform-shapes.ttl
```

## Known assumption

`archvis:NotationSet`, `archvis:Style` and its colour properties are the terms the
converters emit. The per-concept descriptor terms in the notation document
(`archvis:VisualNotation`, `archvis:notationFor`, `archvis:inNotationSet`,
`archvis:defaultStyle`, `archvis:shape`, `archvis:lineStyle`, `archvis:arrowHead`) follow
core's prose description of a VisualNotation and **have not been checked against
`core-vis-onto.ttl`**, which is not in this repository. Check them before publishing, or
untick the notation asset. Everything else uses terms declared in the core ontology.

## Layout

| Path | |
|---|---|
| `index.html`, `styles.css`, `js/app.js` | The user interface |
| `js/core.js` | Project model: defaults, namespaces, scoped ids, rename and delete |
| `js/generator.js` | Project → Turtle documents |
| `js/importer.js` | Turtle documents → project (uses N3.js) |
| `js/lint.js` | Checks |
| `js/zip.js` | `.zip` export |
| `templates/templates.js` | Starting points, written by `scripts/build-templates.js` |
| `scripts/cli.js` | Command line |
| `fixtures/` | Published extracts used by tests and the ArchiMate 4.0 template |
| `tests/` | `studio.test.js` (Node), `test_metamodel_studio.py` (Python) |
| `vendor/n3.min.js` | [N3.js](https://github.com/rdfjs/N3.js) 1.17.4, MIT (`vendor/N3-LICENSE.md`) |

## Development

```bash
npm test                                         # Node checks, no dependencies
pip install -r requirements-dev.txt
python3 -m unittest discover -s tests            # independent RDF and SHACL checks
npm run templates                                # after changing the importer or fixtures
```

A test fails when the committed templates are stale.

Every push to `main` runs the tests and redeploys the online version
(`.github/workflows/pages.yml`). It publishes only what the browser loads: `index.html`,
`styles.css`, `js/`, `vendor/` and `templates/`.

## Licence

Apache-2.0. See `NOTICE` for the vendored N3.js (MIT) and the fixture extracts (CC-BY-4.0).
