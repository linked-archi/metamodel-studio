# A1: align the studio with core, core-vis and the kernel

## Goal

A set the studio generates is read by la-gram, and later the workspace, as its author designed it. Both read
metamodels through `@linked-archi/kernel`, so the test is the kernel's reading.

## What was wrong

Found on 2026-11-20/21 by loading the studio's output into la-gram's engine and into the kernel alone:

- **Notation.** The studio wrote `archvis:shape "cylinder"`, `archvis:lineStyle "dashed"` and
  `archvis:arrowHead "open"`. core-vis has no `shape` or `arrowHead`, and its `lineStyle` takes an IRI. la-gram kept
  the colours only: no element got its shape, and every relationship came out solid with an open arrowhead.
- **Proposal order.** The studio wrote `a arch:RelationshipProposalOrder`, a class core 0.6.0 removed (meta commit
  3dae749, 2026-11-15), and the manifest did not name it. la-gram read no order.
- **Import.** N3.js 1.17.4 could not parse RDF 1.2 triple terms (ArchiMate's relationship tables), and the importer
  missed the published notation and proposal orders: importing ArchiMate 4.0 kept 0 of 44 shapes and 0 of 9 orders.
- **Headers.** The taxonomy was typed `owl:Ontology` with `owl:imports`; four of six documents had no `vann:` prefix.
- **Fixtures.** Extracts of core 0.4.0 and an older ArchiMate 4.0, with no shapes; the ArchiMate 4.0 template had
  an empty rule matrix and one error-level check finding.

core-vis itself needs no change: the studio now writes the terms it already defines.

## Decisions

In `../../specs/studio/design.md`: SD-2 (notation), SD-3 (own shapes), SD-4 (proposal orders), SD-5 (taxonomy),
SD-6 (fixtures), SD-7 (kernel checks), SD-8 (N3.js), SD-9 and SD-10 (earlier files, format `/2`).

## Status

**2026-11-21: done, uncommitted, for review.** The checklist is A1 in `../../specs/studio/tasks.md`; the kernel
checks' first run, on the code as it was, is in `baseline.md`. All 29 kernel checks now pass.

**2026-11-21, la-gram's page:** the Cloud Platform set loads, and every shape, line, line end and colour draws as
designed (`../../specs/studio/tasks.md`, A1).

**Next:** A2. Platform decision PD-16 was accepted on 2026-11-24 (`../metamodel-authoring-decision/`).
