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
- **Dimension.** A category whose sub-categories classify the same types another way than a sibling dimension does:
  ArchiMate 4.0's Domain and Aspect. The palette grouping names the dimensions a palette groups by.
- **Row.** In a tree, an item under one of its parents. An item with two parents has two rows.
- **Base.** A language a project extends or tailors, named by one of its imports: ArchiMate 4.0 for Cloud Platform.

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
   `arch:conceptClassification`, `arch:architectureViewpoints`, `arch:viewpointLibrary`, `arch:notationSet`), each
   proposal order with `arch:relationshipProposalOrder`, and the palette grouping and the diagram group order with
   `arch:paletteGrouping` and `arch:diagramGroupOrder` (4.5).
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
4. A category with an order of its own has an ISO 25964 thesaurus array under it: a `skos:OrderedCollection` and
   `iso-thes:ThesaurusArray` named `<Category>Order`, with `iso-thes:superOrdinate` the category and a
   `skos:memberList` that lists each concept narrower than the category once, its sub-categories first. A category
   with no order of its own has none, and a modelling tool lists its narrower concepts by name.
5. The palette grouping (the dimensions a palette groups element types by, the main one first) and the diagram group
   order (the groups a diagram keeps in bands, the top band first) are `skos:OrderedCollection`s of categories in the
   taxonomy document, named by the manifest (1.4). Each is written only when it names a category.
6. A category may name the element type it stands for, the project's or a base's: `rdfs:seeAlso` from the category
   to the class, as the published taxonomies link a concept to its class.

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
   the taxonomy, the type each category stands for (an `rdfs:seeAlso` to an element type; other links stay out), the
   orders under its categories, proposal orders (from the manifest's
   `arch:relationshipProposalOrder`), the palette grouping and the diagram group order (from the manifest's
   `arch:paletteGrouping` and `arch:diagramGroupOrder`), viewpoints, the manifest and the notation in core-vis
   terms, own shapes included.
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
   relationship type with rules, exactly the permitted pairs; and a palette with a section for each group of the
   palette grouping's first dimension, groups and types in the orders the project gives them.
3. The kernel reports nothing incomplete about a template: an extension loaded beside the language it extends, a
   language alone.
4. Importing the published ArchiMate 4.0 and generating it again keeps, as the kernel reads them, every element
   type's shape, every relationship type's line and ends, all its proposal orders, and its palette: the sections,
   their order and the order of the types in each, and the order of the relationship types.
5. These checks run with `npm run test:kernel` after `npm install`. Until `@linked-archi/kernel` is published (its
   K02), they run where the kernel's tarball is (`../linked-archi-kernel`), not in CI.

### Requirement 10: Where it runs

1. The browser app runs from disk or a static host, with no build and no server, and keeps the project in the
   browser's local storage.
2. The command line runs the same engine under Node with no packages installed.
3. Project files of formats `linked-archi-metamodel-studio/1` and `/2` open and are migrated to `/3`.

### Requirement 11: Editing hierarchies and classification

The page shows how each concept relates to the others, and its hierarchies change by drag and drop, from a menu and
from the keyboard.

1. Every hierarchy is a tree: element types, relationship types, taxonomy categories with their members, and the
   viewpoint catalog. An item appears under each of its parents, and choosing one of its rows highlights the others;
   a type of another language that the project specializes heads the project's subtypes of it, and cannot be
   changed. Rows fold and unfold.
2. A move never puts an item under itself or one of its own descendants. While dragging, the row under the pointer
   says what a drop would do, or why it would not.
3. Each of these can be done by drag and drop, from the row's menu and from the keyboard: moving an item under
   another parent, giving an element type a second parent, taking it out of a parent, classifying a type,
   moving it to another category or adding it to one, and moving a viewpoint or a category (WCAG 2.2, 2.1.1 and
   2.5.7). Several rows chosen together move together.
4. The page of each element and relationship type shows its relations: its paths to the root, its parents and
   subtypes, its categories, the rules it is the source or the target of, the attributes, domain and range guidance
   and proposal orders that name it or one of its ancestors, the viewpoints that include it, and a diagram of its
   parents, subtypes and categories. The lists say what the diagram shows.
5. The taxonomy shows each category's members and the types in no category. A grid crosses two dimensions, with each
   element type in the cell of its groups; dragging it to another cell moves it to that cell's groups.
6. A category whose element types, its sub-categories' included, are the concrete subtypes of one abstract type is
   shown as matching it, on both pages; one that nearly matches shows what differs, with a fix for each difference.
   The match is worked out from membership alone: nothing is stored and no names are compared (SD-13). When a change
   to one side of an exact match leaves the other behind, the page offers the same change on the other side.
7. Sibling categories, a category's members, the palette grouping, the diagram group order and proposal orders are
   ordered by drag, by Alt+Up and Alt+Down, and from the menu. The order is part of the project and is written
   (4.4, 4.5).
8. A category's page names the type it stands for (4.6) and compares that type's subtypes with its members, as for
   a match (11.6); where it names none and its members match a type, it offers to name that one.

### Requirement 12: Extending a metamodel

A metamodel that extends or tailors another shows that other one, its base, beside its own concepts.

1. The bases of a project are the languages its imports name whose documents the studio has: ArchiMate 4.0, which it
   carries, and any other whose documents were loaded in that browser. The project itself does not change: it names
   its bases by their namespaces, as before.
2. The trees of element and relationship types show a base's types, read only, with the project's own types under
   the ones they specialize; a base branch with none of the project's types starts folded, and the base can be hidden.
   The pickers, the rules matrix (on request) and the viewpoints' concepts offer a base's types too.
3. A base type has a page of its own: its definition and relations, the project's types among its subtypes, and a way
   to make a subtype of it. A drop of one of the project's types on a base type specializes it (11.3). Nothing of the
   base can be moved or changed.
4. A type's relations name the categories it has in a base's taxonomy, through the base types it is or specializes,
   and the taxonomy page shows each base's taxonomy, read only, with the project's types in those categories.
5. The checks say when a reference into a base names nothing it defines, or names a type of the wrong kind.
6. The Overview says, for each import, whether the studio shows it, and loads the documents of one it does not
   carry. Those documents stay in that browser.
