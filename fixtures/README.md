# Fixtures

Byte-identical copies of documents published at meta.linked.archi (the linked-archi-meta repository), under the
licences they state, mostly CC-BY-4.0. They are test inputs and the source of the ArchiMate 4.0 template
(`scripts/build-templates.js`).

| File | What it is | Used by |
|---|---|---|
| `core/core-onto.ttl`, `core/core-vis-onto.ttl` | The core ontology (`arch:`) and core-vis (`arch-vis:`) | the check that every term the generator writes is declared |
| `archimate4/archimate4-onto.ttl`, `-tax.ttl`, `-viewpoints.ttl`, `-notation.ttl`, `-metamodel.ttl`, `-relationship-shapes.ttl` | ArchiMate 4.0 | the ArchiMate 4.0 template, the import tests |
| `archimate4/archimate4-relationship-tables.ttl` | ArchiMate 4.0's relationship tables, RDF 1.2 | the check that triple terms parse |

They are copied from the installed `@linked-archi/kernel` package, whose `assets/` are byte-identical to
meta.linked.archi. Do not edit them. To refresh them:

```bash
npm install                      # once: the kernel is a development dependency
npm run fixtures                 # copy what differs
npm run fixtures -- --check      # compare only
npm run templates                # then rebuild the templates
```

A test fails while the committed templates are stale, and the kernel checks (`npm run test:kernel`) fail while a
fixture differs from the kernel's copy.
