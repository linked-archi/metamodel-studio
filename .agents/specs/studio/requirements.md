# Requirements: Metamodel Studio

## Introduction

The studio designs a Linked.Archi metamodel and generates its semantic asset set. These requirements say what it
guarantees its users and the tools that read its output: la-gram and the Linked.Archi workspace, both through
`@linked-archi/kernel`. Numbers are SReq n.m and are stable: a requirement taken out keeps its number, marked
*withdrawn*.

## Glossary

- **Project.** The editable source of a metamodel, a `.studio.json` file (`core.js`).
- **Asset set.** The documents generated from a project: ontology, shapes, taxonomy, viewpoints, notation and
  manifest.
- **Own shape.** A figure core-vis does not define, declared in the notation document as an `arch-vis:ShapeType`
  with a core fallback and path templates.
- **Proposal order.** An ordered list of relationship types a modelling tool proposes when two elements are
  connected. The general order applies to every pair; a scoped one names source and/or target types.

---

### Requirement 1: The asset set

1. A project generates up to six documents, each at its own namespace under the base IRI:

   | Document | Namespace | Root resource |
   |---|---|---|
   | `<slug>-onto.ttl` | `<base>onto#` | `owl:Ontology` |
   | `<slug>-shapes.ttl` | `<base>shapes#` | `owl:Ontology` |
   | `<slug>-tax.ttl` | `<base>tax#` | `skos:ConceptScheme` |
   | `<slug>-viewpoints.ttl` | `<base>viewpoints#` | `owl:Ontology` |
   | `<slug>-notation.ttl` | `<base>notation#` | `owl:Ontology` |
   | `<slug>-metamodel.ttl` | `<base>metamodel#` | `owl:Ontology`, with the `arch:Metamodel` |

   The ontology and the manifest are always written; the user chooses which of the others to ship.
2. Every document declares `vann:preferredNamespaceUri`, `vann:preferredNamespacePrefix`, `dct:title`, the dates,
   `bibo:status` and `owl:versionInfo`.
3. The taxonomy is a plain `skos:ConceptScheme`: it is not typed `owl:Ontology` and carries no `owl:imports`,
   `owl:versionIRI` or `owl:priorVersion`. The other documents carry `owl:imports` and `owl:versionIRI`
   (`<namespace>/<version>#`).
4. The manifest names each document with the core property for its role (`arch:modelConcepts`, `arch:formalRules`,
   `arch:conceptClassification`, `arch:architectureViewpoints`, `arch:viewpointLibrary`, `arch:notationSet`), and
   each proposal order with `arch:relationshipProposalOrder`.
5. Every `arch:` and `arch-vis:` term the documents use is declared in core or core-vis as published (test).

### Requirement 2: Model concepts

1. An element type is an `owl:Class` under `arch:Element` or another element type; an abstract one carries
   `arch:isAbstractClass true`.
2. A relationship type is three terms: a class under `arch:QualifiedRelationship` with `arch:unqualifiedForm`, its
   direct predicate with `arch:domainIncludes`/`arch:rangeIncludes`, and a `qualified<Rel>` predicate. A subtype
   that keeps its parent's predicate declares only its class.
3. An attribute is an `owl:DatatypeProperty`: `rdfs:domain` for one type, `arch:domainIncludes` for several.

### Requirement 3: Formal rules

1. A relationship type with rules gets a node shape on its class whose `sh:or` lists the permitted
   (source, target) pairs, over `arch:source` and `arch:target`.
2. Each source type gets a node shape over its direct predicates, so the plain triple is checked too.
3. An attribute gets a property shape with its datatype, cardinality and allowed values.
4. A relationship type with no rules is left unconstrained.

### Requirement 4: Classification and proposal orders

1. Categories form a tree; a category names its members with `skos:narrower`.
2. Each proposal order is a `skos:OrderedCollection` in the taxonomy document, with `skos:memberList` in order. A
   scoped order names its source types with `arch:domainIncludes` and its target types with `arch:rangeIncludes`.
3. The manifest names every proposal order (1.4). A metamodel has at most one general order.

### Requirement 5: Viewpoints

1. Viewpoints are `arch:Viewpoint` individuals with `arch:includesConcept`, `arch:targetsStakeholder`,
   `arch:viewpointFramesConcern`, `arch:viewpointHasPurpose` and `arch:viewType`, grouped in a SKOS viewpoint
   catalog with the stakeholders, concerns and purposes they use.

### Requirement 6: Notation

1. The notation document declares one `arch-vis:NotationSet` and imports core and core-vis.
2. Each concrete element type has an `arch-vis:VisualNotation` whose `arch-vis:defaultStyle` is an
   `arch-vis:Style` with `arch-vis:shapeType` and the colours set (`fillColor`, `lineColor`, `fontColor`).
3. The shape is a core-vis shape (`Rectangle`, `RoundedRectangle`, `Ellipse`, `Circle`, `Hexagon`, `Diamond`,
   `Parallelogram`, `Octagon`) or an own shape (6.5).
4. Each relationship type has an `arch-vis:VisualNotation` whose style has `arch-vis:lineStyle` (`SolidLine`,
   `DashedLine`, `DottedLine`), `arch-vis:sourceDecor` and `arch-vis:targetDecor` (core-vis decorations), and its
   colour when one is set.
5. An own shape is declared once in the notation document, with `skos:prefLabel`, `arch-vis:fallbackShape` (a core
   shape) and its geometry as path templates (`shapeVariables`, `outlinePath`, `detailPath`, `contentBox`,
   `labelBox`). The studio provides two, cylinder and folder; a project may define more, and import keeps those it
   finds.

### Requirement 7: Import

1. Any published Linked.Archi documents load, by file or URL, in any order and any subset.
2. Import reads element and relationship types, attributes, rules from relationship shapes, attribute constraints,
   the taxonomy, proposal orders (from the manifest's `arch:relationshipProposalOrder`), viewpoints, the manifest
   and the notation in core-vis terms, own shapes included.
3. Output of earlier studio versions still imports: `archvis:shape` and `archvis:arrowHead` literals, literal line
   styles and `arch:RelationshipProposalOrder` collections.
4. RDF 1.2 Turtle parses, triple terms included. A document that does not parse is named in the error.
5. Generate, import and generate again gives isomorphic graphs (test).

### Requirement 8: Checks

1. Checks find what would make the documents wrong (error), what is valid but probably unintended (warning) and
   what is worth a look (info), each linked to the item. Among them: undefined references, duplicate or invalid
   ids, cycles, subtypes allowing more than their parent, unknown shapes, line styles and line ends, own shapes
   without an outline, proposal orders naming what is not a relationship type, more than one general order.

### Requirement 9: Agreement with the kernel

1. A generated set loads through `@linked-archi/kernel` from the documents alone, every document named by the
   manifest loaded.
2. The kernel reads, for each element type, the shape and colours the project gives it; for each relationship type,
   its line style, both line ends and colour; the proposal orders with their members in order; for each
   relationship type with rules, exactly the permitted pairs.
3. The kernel reports nothing incomplete about a template: an extension loaded beside the language it extends, a
   language alone.
4. Importing the published ArchiMate 4.0 and generating it again keeps, as the kernel reads them, every element
   type's shape, every relationship type's line and ends, and all its proposal orders.
5. These checks run with `npm run test:kernel` after `npm install`. Until `@linked-archi/kernel` is published (its
   K02), they run where the kernel's tarball is (`../linked-archi-kernel`), not in CI.

### Requirement 10: Where it runs

1. The browser app runs from disk or a static host, with no build and no server, and keeps the project in the
   browser's local storage.
2. The command line runs the same engine under Node with no packages installed.
3. Project files of format `linked-archi-metamodel-studio/1` open and are migrated to `/2`.
