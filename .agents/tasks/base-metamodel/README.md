# The category link, and the metamodel a project extends

## Goal

Two things, decided together on 2026-11-25:

- **A category keeps the type it stands for.** The published ArchiMate 4.0 taxonomy links each category to its OWL
  class with `rdfs:seeAlso` ("The two are linked via rdfs:seeAlso on each SKOS concept pointing to its
  corresponding OWL class"). Import dropped it. Now it is read, kept as the category's `standsFor`, written, and
  shown beside the match worked out from the members (SD-13).
- **A metamodel that extends or tailors another shows that other one.** A project that imports ArchiMate 4.0
  shows ArchiMate 4.0's types in its trees, read only, with its own types where they specialize them; its pages show
  the base's taxonomy, and the categories its types have through the base types they specialize.

Requirements 4.6 and 12 in `../../specs/studio/requirements.md`; decisions SD-17 and SD-18 in
`../../specs/studio/design.md`.

## Decisions

Decision confirmed on 2026-11-25:

- **The field is `standsFor`,** one element type per category, in project format `/3`, which is not yet published.
  Only an `rdfs:seeAlso` to an element type becomes it: ArchiMate 4.0's links from two relationship categories to
  its strength collections do not.
- **The base is not stored in the project.** The project names the languages it extends in its imports, as before.
  The studio shows one when it has its documents: ArchiMate 4.0 from its own template, any other loaded from its
  documents and kept in that browser. Pinning a base and its version is A3's.
- **The base is read only.** Its types take drops (to specialize them) and their menus make subtypes, but nothing
  of the base changes, and the project's types are not classified in the base's categories.

## Status

**2026-11-25: done, uncommitted, for review.** The checklist is *The category link and the base* in
`../../specs/studio/tasks.md`. `npm test` (36), the Python tests (13), `npm run test:kernel` (31) and the page's
checks (16) pass.

## To continue

- A3: pin the base and its version in the project, and load it from its IRI.
- To decide with A3: classifying the project's types in a base's categories, so that la-gram's palette puts them in
  the base's sections.

## Found on the way

- The kernel bundles ArchiMate 3.2 and 4.0, and no BPMN, C4, Backstage or LeanIX. The studio bundles ArchiMate 4.0
  as a template; the others are loaded from their documents.
- The kernel reads a category with nothing under it that stands for a class as that class, and leaves abstract
  classes out of the palette. A check says so when an empty category stands for a concrete type.
