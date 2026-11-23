/*
 * What la-gram and the workspace read from the studio's asset sets, through @linked-archi/kernel (SReq 9).
 *
 * Each check generates a set, loads it as la-gram loads an uploaded metamodel and compares what the kernel reads
 * with what the project says: shapes and colours, lines and line ends, proposal orders, permitted pairs,
 * completeness, viewpoints. The ArchiMate 4.0 checks compare a regenerated set with the published one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ARCHIMATE4, bundledDocument, conceptIri, core, generator, importer, loadBundled, loadGenerated, templates } from './kernel.mjs';

const project = (name) => core.normalize(JSON.parse(JSON.stringify(templates[name].project)));

/** What the kernel should read for an element type's style, in its terms. */
function expectedElementStyle(p, element) {
  const shape = core.resolveShape(p, element.notation.shape || 'rectangle');
  const style = {
    shapeType: shape.kind === 'core' ? shape.local : core.CORE_SHAPES[shape.definition.fallback || 'rectangle'],
    customShape: shape.kind === 'own' ? core.namespaces(p)[`${p.meta.prefix}not`] + shape.id : undefined,
  };
  if (element.notation.fill) style.fillColor = element.notation.fill;
  if (element.notation.stroke) style.lineColor = element.notation.stroke;
  return style;
}

function readElementStyle(entry) {
  const s = entry?.style ?? {};
  const out = { shapeType: s.shapeType, customShape: s.customShape?.iri };
  if (s.fillColor) out.fillColor = s.fillColor;
  if (s.lineColor) out.lineColor = s.lineColor;
  return out;
}

/** What the kernel should read for a relationship type's line. */
function expectedLine(r) {
  const s = r.style;
  return {
    lineStyle: core.LINE_STYLE_IRIS[s.line || 'solid'],
    sourceDecor: core.DECORATION_IRIS[s.source || 'none'],
    targetDecor: core.DECORATION_IRIS[s.target || 'open'],
    ...(s.stroke ? { lineColor: s.stroke } : {}),
  };
}

function readLine(entry) {
  const s = entry?.relationshipStyle ?? {};
  return { lineStyle: s.lineStyle, sourceDecor: s.sourceDecor, targetDecor: s.targetDecor, ...(s.lineColor ? { lineColor: s.lineColor } : {}) };
}

/** Checks every template must pass. */
function templateChecks(name, { beside = [] } = {}) {
  let p;
  let k;
  beforeAll(async () => {
    p = project(name);
    k = await loadGenerated(p, { beside });
  });

  it('loads every document the manifest names', () => {
    const named = k.own.assets.filter((a) => /^arch:(modelConcepts|formalRules|conceptClassification|architectureViewpoints|viewpointLibrary|notationSet)$/.test(a.via));
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((a) => a.outcome !== 'loaded' && a.outcome !== 'already-loaded')).toEqual([]);
  });

  it("reads each element type's shape and colours", () => {
    for (const e of p.elements.filter((x) => !x.abstract && x.notation && Object.keys(x.notation).length)) {
      expect(readElementStyle(k.elements.get(conceptIri(p, e.id))), e.id).toEqual(expectedElementStyle(p, e));
    }
  });

  it("reads each relationship type's line, both line ends and colour", () => {
    for (const r of p.relationships.filter((x) => x.style && Object.keys(x.style).length)) {
      expect(readLine(k.relationships.get(conceptIri(p, r.id))), r.id).toEqual(expectedLine(r));
    }
  });

  it('reads the proposal orders the manifest names, with their members in order', () => {
    const tax = core.namespaces(p)[`${p.meta.prefix}tax`];
    expect(k.namedOrders.sort()).toEqual(p.proposalOrders.map((o) => tax + o.id).sort());
    expect(k.proposalOrders.size).toBe(k.allNamedOrders.length);
    for (const o of p.proposalOrders) expect(k.orderMembers(tax + o.id), o.id).toEqual(o.members.map((m) => conceptIri(p, m)));
  });

  it('reads exactly the permitted pairs of each relationship type with rules', () => {
    // Only the project's own types: a language loaded beside it brings its own rules.
    const constrained = Object.entries(p.rules).filter(([, pairs]) => pairs.length);
    for (const r of p.relationships) expect(k.table.covers([conceptIri(p, r.id)]), r.id).toBe((p.rules[r.id] ?? []).length > 0);
    for (const [rel, pairs] of constrained) {
      const bySource = new Map();
      for (const [s, t] of pairs.map(core.splitPair)) bySource.set(s, [...(bySource.get(s) ?? []), conceptIri(p, t)]);
      for (const [s, targets] of bySource) expect(k.table.targetsOf(conceptIri(p, rel), conceptIri(p, s)), `${rel} from ${s}`).toEqual(targets.sort());
    }
  });

  it('reports nothing incomplete', () => {
    expect(k.completeness).toEqual([]);
  });

  it('reads the viewpoints', () => {
    const vp = core.namespaces(p)[`${p.meta.prefix}vp`];
    expect(k.viewpoints.filter((v) => v.iri.startsWith(vp)).map((v) => v.iri).sort()).toEqual(p.viewpoints.map((v) => vp + v.id).sort());
  });
}

describe('Cloud Platform, loaded beside ArchiMate 4.0 as an extension is', () => {
  templateChecks('cloudplatform', { beside: [ARCHIMATE4] });

  it('draws a database as its own cylinder and a usage as a dashed line with an open arrowhead', async () => {
    const k = await loadGenerated(project('cloudplatform'));
    const db = k.elements.get('https://meta.example.org/cloudplatform/onto#Database');
    expect(db?.style?.customShape?.iri).toBe('https://meta.example.org/cloudplatform/notation#Cylinder');
    expect(db?.style?.customShape?.outline).toBeTruthy();
    expect(readLine(k.relationships.get('https://meta.example.org/cloudplatform/onto#Usage'))).toMatchObject({
      lineStyle: 'DashedLine', sourceDecor: 'NoDecoration', targetDecor: 'OpenArrowhead',
    });
  });
});

describe('The ArchiMate 4.0 template, loaded alone', () => {
  templateChecks('archimate4');
});

describe('Importing the published ArchiMate 4.0 and generating it again', () => {
  const FILES = ['onto', 'tax', 'viewpoints', 'notation', 'metamodel', 'relationship-shapes', 'relationship-tables'];
  let published;
  let regenerated;
  let p;

  beforeAll(async () => {
    const documents = FILES.map((f) => bundledDocument(`archimate4/archimate4-${f}.ttl`));
    p = importer.importTurtle(documents).project;
    published = await loadBundled(ARCHIMATE4);
    regenerated = await loadGenerated(p);
  });

  it('parses every document, the RDF 1.2 relationship tables included', () => {
    expect(p.elements.length).toBeGreaterThan(0);
  });

  it("keeps every element type's shape and colours", () => {
    expect(published.elements.size).toBe(44);
    for (const [iri, entry] of published.elements) {
      expect(readElementStyle(regenerated.elements.get(iri)), iri).toEqual(readElementStyle(entry));
    }
  });

  it("keeps every relationship type's line and line ends", () => {
    expect(published.relationships.size).toBe(15);
    for (const [iri, entry] of published.relationships) {
      expect(readLine(regenerated.relationships.get(iri)), iri).toEqual(readLine(entry));
    }
  });

  it('keeps all proposal orders, their members and what they apply to', () => {
    expect(published.namedOrders.length).toBe(9);
    expect(regenerated.namedOrders.sort()).toEqual(published.namedOrders.sort());
    for (const order of published.namedOrders) expect(regenerated.orderMembers(order), order).toEqual(published.orderMembers(order));
    const scope = (k, order) => ['domainIncludes', 'rangeIncludes'].map((pr) =>
      k.store.getQuads({ termType: 'NamedNode', value: order }, { termType: 'NamedNode', value: `https://meta.linked.archi/core#${pr}` }).map((q) => q.object.value).sort());
    for (const order of published.namedOrders) expect(scope(regenerated, order), order).toEqual(scope(published, order));
  });

  it('generates a set that loads with nothing incomplete', () => {
    expect(regenerated.completeness).toEqual([]);
    expect(generator.generate(p).filter((f) => f.name.endsWith('.ttl')).length).toBe(6);
  });
});
