/*
 * What @linked-archi/kernel — and so la-gram and the workspace — reads from an asset set (SReq 9, SD-7).
 *
 * A set is loaded the way la-gram loads an uploaded metamodel: its documents served by IRI, the core documents and
 * any bundled language beside it from the kernel's bundle, the manifest followed from there. What the kernel then
 * reads is returned in the studio's terms, so a test compares it with the project.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { DataFactory } from 'n3';
import { rdfEngine, metamodelManager } from '@linked-archi/kernel';
import { BundledAssetSource, ChainedAssetSource, UploadedAssetSource } from '@linked-archi/kernel/metamodel-manager/asset-sources.js';
import { readProposalOrders } from '@linked-archi/kernel/model-manager/proposal-order.js';
import { readRelationshipTable } from '@linked-archi/kernel/model-manager/relationship-table.js';

const require = createRequire(import.meta.url);
export const core = require('../../js/core.js');
export const generator = require('../../js/generator.js');
export const importer = require('../../js/importer.js');
export const templates = require('../../templates/templates.js');

export const ARCHIMATE4 = 'https://meta.linked.archi/archimate4/metamodel#ArchiMate4';
const ARCH = 'https://meta.linked.archi/core#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const { namedNode } = DataFactory;

/** The published documents the kernel bundles (byte-identical to meta.linked.archi). */
export function bundledDocument(relativePath) {
  const url = new URL(`../../node_modules/@linked-archi/kernel/assets/${relativePath}`, import.meta.url);
  return { name: relativePath.split('/').pop(), text: readFileSync(url, 'utf8') };
}

/** The document IRI of each generated file, by its kind. */
function documentIris(project) {
  const ns = core.namespaces(project);
  const p = project.meta.prefix;
  return { onto: ns[p], shapes: ns[`${p}sh`], taxonomy: ns[`${p}tax`], viewpoints: ns[`${p}vp`], notation: ns[`${p}not`], manifest: ns[`${p}mm`] };
}

/** A project concept reference as an IRI: a local id in the language namespace, or a CURIE. */
export function conceptIri(project, ref) {
  const ns = core.namespaces(project);
  if (/^https?:\/\//.test(ref)) return ref;
  if (core.isCurie(ref)) return ns[ref.slice(0, ref.indexOf(':'))] + ref.slice(ref.indexOf(':') + 1);
  return ns[project.meta.prefix] + ref;
}

async function kernelWith(uploads) {
  const store = await rdfEngine.OxigraphRdfStore.create();
  const uploaded = new UploadedAssetSource();
  for (const u of uploads) uploaded.add(u.iri, u.text, 'text/turtle', u.name);
  const loader = new metamodelManager.N3MetamodelLoader(new rdfEngine.N3TtlParser(), store, new ChainedAssetSource([uploaded, new BundledAssetSource()]));
  await loader.loadCoreAssets();
  return { store, loader };
}

/** Generate a project's asset set and load it through the kernel; `beside` loads bundled languages first. */
export async function loadGenerated(project, { beside = [] } = {}) {
  const files = generator.generate(project).filter((f) => f.name.endsWith('.ttl'));
  const iris = documentIris(project);
  const { store, loader } = await kernelWith(files.map((f) => ({ iri: iris[f.kind], text: f.content, name: f.name })));
  const loaded = [];
  for (const iri of beside) loaded.push(await loader.loadBundledMetamodel(iri));
  const manifest = files.find((f) => f.kind === 'manifest');
  const own = await loader.loadMetamodelFromManifest(manifest.content, { origin: 'uploaded' });
  loaded.push(own);
  return read(store, loaded, own);
}

/** Load a language from the kernel's bundle, as la-gram does offline. */
export async function loadBundled(metamodelIri) {
  const { store, loader } = await kernelWith([]);
  const own = await loader.loadBundledMetamodel(metamodelIri);
  return read(store, [own], own);
}

function read(store, loaded, own) {
  const metamodels = loaded.map((m) => ({
    iri: m.metamodelIri,
    label: m.info?.name || m.metamodelIri,
    documents: m.assets.filter((a) => a.outcome === 'loaded' || a.outcome === 'already-loaded').map((a) => a.documentIri),
    conceptDocuments: m.assets.filter((a) => a.via === 'arch:modelConcepts').map((a) => a.documentIri),
  }));
  const palette = new metamodelManager.SparqlPaletteGenerator(store).generatePalette(undefined, {
    metamodelIris: metamodels.map((m) => m.iri),
    metamodels,
    ...(own.notationSetIri ? { defaultNotationSetIris: [own.notationSetIri] } : {}),
  });
  const elements = new Map(palette.elementGroups.flatMap((g) => g.elements).map((e) => [e.iri, e]));
  const relationships = new Map(palette.relationshipTypes.filter((r) => !r.core).map((r) => [r.iri, r]));
  return {
    store,
    own,
    palette,
    elements,
    relationships,
    completeness: palette.completeness ?? [],
    proposalOrders: readProposalOrders(store),
    orderMembers: (orderIri) => listMembers(store, orderIri),
    namedOrders: store.getQuads(namedNode(own.metamodelIri), namedNode(`${ARCH}relationshipProposalOrder`)).map((q) => q.object.value),
    /** Every order the loaded metamodels name, a language loaded beside included. */
    allNamedOrders: [...new Set(loaded.flatMap((m) => store.getQuads(namedNode(m.metamodelIri), namedNode(`${ARCH}relationshipProposalOrder`)).map((q) => q.object.value)))],
    table: readRelationshipTable(store),
    viewpoints: new metamodelManager.SparqlViewpointManager(store).getViewpoints(),
  };
}

function listMembers(store, orderIri) {
  const head = store.getQuads(namedNode(orderIri), namedNode(`${SKOS}memberList`))[0]?.object;
  const out = [];
  const seen = new Set();
  for (let cell = head; cell && cell.value !== `${RDF}nil` && !seen.has(cell.value); ) {
    seen.add(cell.value);
    const first = store.getQuads(cell, namedNode(`${RDF}first`))[0]?.object;
    if (first) out.push(first.value);
    cell = store.getQuads(cell, namedNode(`${RDF}rest`))[0]?.object;
  }
  return out;
}
