# Baseline: the kernel checks on the code as it was

`npm run test:kernel`, 2026-11-21, before any A1 change to the engine: **7 failed, 8 passed, 5 skipped** of 20.

| Check | Result | Why |
|---|---|---|
| Importing the published ArchiMate 4.0 (5 checks) | skipped | `archimate4-relationship-tables.ttl: Unexpected RDF* syntax on line 1829`: N3.js 1.17.4 does not parse RDF 1.2 triple terms |
| Element shapes and colours (both templates) | failed | the project has no way to name a core-vis shape (`core.resolveShape` does not exist yet) |
| Database drawn as its own cylinder | failed | the kernel reads no shape: `archvis:shape "cylinder"` is not a core-vis term |
| Relationship lines and ends (both templates) | failed | no mapping to core-vis line styles and decorations; one end only |
| Proposal orders (both templates) | failed | a single `proposalOrder` typed `arch:RelationshipProposalOrder`, which the manifest does not name |
| Documents load, permitted pairs, completeness, viewpoints (both templates) | passed | |

The checks that failed on a missing function fail on what the kernel reads, too: the probes of 2026-11-20/21
(`README.md`, *What was wrong*) loaded the same sets and read no shapes, fallback lines and no proposal order.
