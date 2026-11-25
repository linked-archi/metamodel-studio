# Editing hierarchies and classification

## Goal

The studio shows how each concept relates to the others and lets its hierarchies be changed by drag and drop, from
a menu and from the keyboard. Requirement 11 in `../../specs/studio/requirements.md`; decisions SD-12 to SD-16 in
`../../specs/studio/design.md`.

## What was wrong

Found on 2026-11-25 with the ArchiMate 4.0 and Cloud Platform templates in headless Chrome:

- **The element tree listed a type under its first parent only.** 29 ArchiMate 4.0 types have two parents, so the
  six domain abstracts showed as empty roots and their pages listed no subtypes.
- **The relationship list indented subtypes but kept them in alphabetical order:** Read Access appeared to sit under
  Influence, Write Access under Triggering.
- **Parents from other languages did not show:** Cloud Platform's Workload, a kind of `am4:ApplicationComponent`,
  showed as a plain root.
- **A page showed only what its item points at:** no subtypes, paths to the root, incoming rules, attributes or
  viewpoints.
- **The taxonomy was a column of text boxes:** members behind a hover count, labels cut off, members added by typing.
- **The taxonomy repeats the class hierarchy without saying so:** 16 of the 21 element categories of ArchiMate 4.0
  hold exactly the concrete subtypes of one abstract type.
- **No drag, multi-select or collapse.** Proposal orders moved one step per click.
- **Order was lost:** the published taxonomy orders its groups and members with 7 thesaurus arrays and names a palette
  grouping and a diagram group order, which the kernel reads for la-gram's palette. Import dropped them and the
  generator could not write them.

## Decisions

Decision confirmed on 2026-11-25:

- **A type with several parents appears under each,** and selecting it highlights its other places (SD-12).
- **The link between a category and an abstract type is computed from membership,** not stored: no new field, no
  name comparison (SD-13).
- **All six parts now, before A2:** one tree for every hierarchy; a panel of each item's relations; drag and drop
  with a menu and keys for every move; the taxonomy as a board with a grid of two dimensions; the computed category
  match; orders written for la-gram (project format `/3`, SD-14, SD-15).
- **Names of the orders follow the published ArchiMate 4.0 taxonomy:** `<Category>Order`, `PaletteGrouping`,
  `DiagramGroupOrder`; an imported set keeps its own collection names (SD-14).

## Status

**2026-11-25: done, uncommitted, for review.** The checklist is *Hierarchy editing* in `../../specs/studio/tasks.md`.
`npm test` (31), the Python tests (12), `npm run test:kernel` (31) and the page's checks (11) pass.

## To continue

- Playwright is a development dependency since 2026-11-25, so `npm run test:ui` runs its checks.
- The `rdfs:seeAlso` from a category to its abstract type: decision confirmed on 2026-11-25, to keep it as the
  category's `standsFor`. Done with the base metamodel in `../base-metamodel/`.
