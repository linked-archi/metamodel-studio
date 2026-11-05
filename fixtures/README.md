# Fixtures

Extracts of documents published at meta.linked.archi (linked-archi-meta, CC-BY-4.0),
copied from the linked-archi-apm repository's `fixtures/`. They are test inputs and the
source of the ArchiMate 4.0 template (`scripts/build-templates.js`).

| File | Origin |
|---|---|
| `archimate4-onto.ttl`, `archimate4-viewpoints.ttl` | ArchiMate 4.0 ontology and viewpoints, minus statements citing a source elsewhere |
| `archimate3.2-onto.ttl`, `archimate3.2-viewpoints.ttl` | The same for ArchiMate 3.2 |
| `core-onto.ttl` | The Linked.Archi core ontology (`arch:`), which defines `arch:Metamodel` and its properties |
| `shapes.ttl` | Selected published SHACL: one ArchiMate 3.2 relationship shape, and the Backstage, C4 and LeanIX manifests and shapes |

They carry no ArchiMate 4.0 SHACL shapes, so the ArchiMate 4.0 template's rule matrix
starts empty. After replacing a fixture, run `npm run templates`; a test fails while the
committed templates are stale.
