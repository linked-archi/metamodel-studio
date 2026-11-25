"""Metamodel Studio: the generated semantic asset sets are valid RDF that does what it says.

The studio is JavaScript, shared between the browser and its Node CLI; these tests drive
the CLI and check its output with independent RDF tooling (pyoxigraph, rdflib, pyshacl).
They skip when Node is not installed. What they pin:

- every template generates Turtle that parses, with no error-level finding;
- every core and core-vis term the documents use is declared in core or core-vis (SReq 1.5);
- the manifest is an ``arch:Metamodel`` naming every asset document, every proposal order, the palette grouping
  and the diagram group order;
- the generated SHACL accepts permitted relationships and attribute values and rejects the rest;
- generate -> import -> generate is lossless, so a published set can be edited again;
- importing the published ArchiMate 4.0 keeps what the project model holds;
- the committed templates are what the build script produces.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"
STUDIO = ROOT
CLI = STUDIO / "scripts" / "cli.js"
NODE = shutil.which("node")

try:
    import pyoxigraph
except ModuleNotFoundError:  # pragma: no cover - CI installs it
    pyoxigraph = None

try:
    import pyshacl
    import rdflib
    from rdflib import compare as rdf_compare
except ModuleNotFoundError:  # pragma: no cover
    pyshacl = rdflib = rdf_compare = None


def _node(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        [NODE, str(CLI), *args], capture_output=True, text=True, timeout=120, cwd=ROOT
    )
    if check and result.returncode != 0:
        raise AssertionError(f"cli {' '.join(args)} failed ({result.returncode}):\n{result.stderr}")
    return result


@unittest.skipUnless(NODE, "node is not installed")
class StudioTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="studio-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def template(self, name: str) -> Path:
        path = self.tmp / f"{name}.studio.json"
        _node("template", name, "-o", str(path))
        return path

    def generate(self, project: Path, out: str = "out", check: bool = True) -> Path:
        out_dir = self.tmp / out
        _node("generate", str(project), "-o", str(out_dir), check=check)
        return out_dir


class TestGeneratedDocumentsParse(StudioTestCase):
    @unittest.skipUnless(pyoxigraph, "pyoxigraph is not installed")
    def test_every_template_generates_parseable_turtle(self):
        for name in ("blank", "cloudplatform", "archimate4"):
            with self.subTest(template=name):
                out = self.generate(self.template(name), out=name, check=False)
                turtle = sorted(out.glob("*.ttl"))
                self.assertEqual(
                    {p.name.rsplit("-", 1)[-1] for p in turtle},
                    {"onto.ttl", "shapes.ttl", "tax.ttl", "viewpoints.ttl", "notation.ttl", "metamodel.ttl"},
                )
                for path in turtle:
                    store = pyoxigraph.Store()
                    store.bulk_load(path=str(path), format=pyoxigraph.RdfFormat.TURTLE)
                    self.assertGreater(len(store), 0, path.name)
                self.assertTrue((out / "README.md").is_file())
                project = json.loads(next(out.glob("*.studio.json")).read_text(encoding="utf-8"))
                self.assertEqual(project["format"], "linked-archi-metamodel-studio/3")

    def test_every_template_has_no_errors(self):
        for name in ("blank", "cloudplatform", "archimate4"):
            with self.subTest(template=name):
                result = _node("lint", str(self.template(name)), check=False)
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertNotIn("error\t", result.stdout)

    @unittest.skipUnless(pyoxigraph, "pyoxigraph is not installed")
    def test_every_core_term_is_declared(self):
        # SReq 1.5: what the generator writes in arch: and arch-vis: is declared in the published core and
        # core-vis (fixtures/core/). Terms of core-viewpoints (archvp:) are not checked: the published manifests
        # name stakeholders core-viewpoints does not declare.
        declared = set()
        for name in ("core-onto.ttl", "core-vis-onto.ttl"):
            store = pyoxigraph.Store()
            store.bulk_load(path=str(FIXTURES / "core" / name), format=pyoxigraph.RdfFormat.TURTLE)
            declared |= {q.subject.value for q in store if isinstance(q.subject, pyoxigraph.NamedNode)}
        namespaces = ("https://meta.linked.archi/core#", "https://meta.linked.archi/core-vis#")
        for name in ("cloudplatform", "archimate4"):
            out = self.generate(self.template(name), out=name)
            used = set()
            for path in out.glob("*.ttl"):
                store = pyoxigraph.Store()
                store.bulk_load(path=str(path), format=pyoxigraph.RdfFormat.TURTLE)
                for q in store:
                    for term in (q.subject, q.predicate, q.object):
                        if isinstance(term, pyoxigraph.NamedNode) and term.value.startswith(namespaces):
                            used.add(term.value)
            with self.subTest(template=name):
                self.assertGreater(len(used), 30)
                self.assertEqual(sorted(used - declared - set(namespaces)), [])


@unittest.skipUnless(pyoxigraph, "pyoxigraph is not installed")
class TestManifest(StudioTestCase):
    def test_manifest_names_every_asset(self):
        out = self.generate(self.template("cloudplatform"))
        store = pyoxigraph.Store()
        store.bulk_load(path=str(out / "cloudplatform-metamodel.ttl"), format=pyoxigraph.RdfFormat.TURTLE)
        rows = list(store.query("""
            PREFIX arch: <https://meta.linked.archi/core#>
            PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            SELECT ?m ?label ?p ?asset WHERE {
              ?m a arch:Metamodel ; skos:prefLabel ?label ; ?p ?asset .
              FILTER(STRSTARTS(STR(?p), STR(arch:)))
            }"""))
        base = "https://meta.example.org/cloudplatform/"
        self.assertEqual({r["m"].value for r in rows}, {base + "metamodel#CloudPlatform"})
        self.assertEqual({r["label"].value for r in rows}, {"Cloud Platform Metamodel"})
        assets = {}
        for r in rows:
            assets.setdefault(r["p"].value.rsplit("#", 1)[-1], set()).add(r["asset"].value)
        self.assertEqual(assets["modelConcepts"], {base + "onto#"})
        self.assertEqual(assets["formalRules"], {base + "shapes#"})
        self.assertEqual(assets["conceptClassification"], {base + "tax#"})
        self.assertEqual(assets["architectureViewpoints"], {base + "viewpoints#"})
        self.assertEqual(assets["viewpointLibrary"], {base + "viewpoints#ViewpointCatalog"})
        self.assertEqual(assets["notationSet"], {base + "notation#CloudPlatformStandardNotation"})
        self.assertEqual(assets["basedOnFramework"], {base + "metamodel#CloudPlatformFramework"})
        self.assertEqual(assets["relationshipProposalOrder"], {base + "tax#ProposalOrder", base + "tax#WorkloadToResourceOrder"})
        self.assertEqual(assets["paletteGrouping"], {base + "tax#PaletteGrouping"})
        self.assertEqual(assets["diagramGroupOrder"], {base + "tax#DiagramGroupOrder"})

    def test_orders_are_thesaurus_arrays_under_their_category(self):
        # SReq 4.4: an ISO 25964 thesaurus array under the category, its members in order, read here with
        # independent tooling.
        out = self.generate(self.template("archimate4"))
        store = pyoxigraph.Store()
        store.bulk_load(path=str(out / "archimate4-tax.ttl"), format=pyoxigraph.RdfFormat.TURTLE)
        rows = list(store.query("""
            PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            PREFIX iso-thes: <http://purl.org/iso25964/skos-thes#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            SELECT ?array ?category (COUNT(?member) AS ?n) WHERE {
              ?array a iso-thes:ThesaurusArray, skos:OrderedCollection ;
                     iso-thes:superOrdinate ?category ; skos:memberList/rdf:rest*/rdf:first ?member .
            } GROUP BY ?array ?category"""))
        tax = "https://meta.linked.archi/archimate4/tax#"
        found = {r["array"].value.removeprefix(tax): (r["category"].value.removeprefix(tax), int(r["n"].value)) for r in rows}
        self.assertEqual(len(found), 7)
        self.assertEqual(found["DomainOrder"], ("Domain", 7))
        self.assertEqual(found["CommonDomainOrder"], ("CommonDomain", 9))


@unittest.skipUnless(pyshacl, "pyshacl is not installed")
class TestShapes(StudioTestCase):
    MODEL = """
        @prefix cp: <https://meta.example.org/cloudplatform/onto#> .
        @prefix arch: <https://meta.linked.archi/core#> .
        @prefix ex: <https://example.org/model#> .
        ex:svc a cp:Microservice ; cp:resilienceLevel "tier-1" ; cp:replicas 3 .
        ex:fn a cp:Function ; cp:resilienceLevel "tier-2" .
        ex:db a cp:Database .
        ex:k8s a cp:Cluster .
        ex:svc cp:deployedOn ex:k8s ; cp:uses ex:db .
        ex:r1 a cp:Deployment ; arch:source ex:svc ; arch:target ex:k8s .
        ex:r2 a cp:Usage ; arch:source ex:svc ; arch:target ex:db .
    """

    def validate(self, extra: str = "") -> tuple[bool, set[str]]:
        out = self.generate(self.template("cloudplatform"))
        data = rdflib.Graph()
        data.parse(data=self.MODEL + extra, format="turtle")
        data.parse(out / "cloudplatform-onto.ttl")
        shapes = rdflib.Graph().parse(out / "cloudplatform-shapes.ttl")
        conforms, report, _ = pyshacl.validate(data, shacl_graph=shapes, inference="rdfs")
        sh = rdflib.Namespace("http://www.w3.org/ns/shacl#")
        focus = {str(o).rsplit("#", 1)[-1] for o in report.objects(None, sh.focusNode)}
        return conforms, focus

    def test_permitted_relationships_conform(self):
        conforms, focus = self.validate()
        self.assertTrue(conforms, focus)

    def test_forbidden_pair_is_rejected_on_both_forms(self):
        conforms, focus = self.validate("""
            ex:db cp:uses ex:svc .
            ex:r3 a cp:Usage ; arch:source ex:db ; arch:target ex:svc .
        """)
        self.assertFalse(conforms)
        self.assertEqual(focus, {"db", "r3"})

    def test_attribute_constraints(self):
        conforms, focus = self.validate("""
            ex:bad a cp:Microservice ; cp:resilienceLevel "gold" .
            ex:missing a cp:Function .
        """)
        self.assertFalse(conforms)
        self.assertEqual(focus, {"bad", "missing"})


@unittest.skipUnless(rdf_compare, "rdflib is not installed")
class TestRoundTrip(StudioTestCase):
    def test_generate_import_generate_is_lossless(self):
        first = self.generate(self.template("cloudplatform"), out="first")
        reimported = self.tmp / "reimported.json"
        _node("import", *[str(p) for p in sorted(first.glob("*.ttl"))], "-o", str(reimported))
        second = self.generate(reimported, out="second")
        for path in sorted(first.glob("*.ttl")):
            with self.subTest(document=path.name):
                a = rdflib.Graph().parse(path)
                b = rdflib.Graph().parse(second / path.name)
                self.assertTrue(rdf_compare.isomorphic(a, b), path.name)

    # What the project model does not hold yet (tasks.md, Known limitations): source attribution on the classes.
    NOT_HELD = {
        "http://www.w3.org/2000/01/rdf-schema#seeAlso",
        "http://purl.org/dc/terms/source",
        "http://www.w3.org/ns/prov#wasQuotedFrom",
        "http://www.w3.org/ns/prov#wasDerivedFrom",
        "http://purl.org/dc/terms/isReplacedBy",
        "http://www.w3.org/2004/02/skos/core#editorialNote",
        "http://creativecommons.org/ns#license",
    }

    def test_archimate4_survives_import(self):
        # The template is imported from the published documents; generating it again keeps what the model holds.
        # The documents' own headers are the studio's, so a few header statements differ.
        out = self.generate(self.template("archimate4"))
        for name, floor in (("archimate4-onto.ttl", 0.98), ("archimate4-viewpoints.ttl", 0.99)):
            with self.subTest(document=name):
                original = [t for t in rdflib.Graph().parse(FIXTURES / "archimate4" / name) if str(t[1]) not in self.NOT_HELD]
                regenerated = rdflib.Graph().parse(out / name)
                kept = sum(1 for t in original if t in regenerated)
                self.assertGreaterEqual(kept / len(original), floor, f"{kept}/{len(original)}")

    def test_archimate4_template_content(self):
        project = json.loads(self.template("archimate4").read_text(encoding="utf-8"))
        elements = {e["id"]: e for e in project["elements"]}
        relationships = {r["id"]: r for r in project["relationships"]}
        self.assertEqual(len(elements), 61)
        self.assertEqual(sum(e["abstract"] for e in elements.values()), 17)
        self.assertEqual(len(relationships), 15)
        self.assertEqual(len(project["viewpoints"]), 25)
        self.assertEqual(sum(len(pairs) for pairs in project["rules"].values()), 5932)
        self.assertEqual(len(project["proposalOrders"]), 9)
        self.assertEqual(len(project["shapes"]), 6)
        self.assertEqual(relationships["Serving"]["notation"], "v")
        self.assertEqual(relationships["ReadAccess"]["parent"], "Access")
        self.assertEqual(relationships["ReadAccess"]["predicate"], "accesses")
        self.assertIn("ApplicationDomain", elements["ApplicationComponent"]["categories"])
        self.assertEqual(relationships["Composition"]["style"], {"line": "solid", "source": "filled-diamond", "target": "none"})


@unittest.skipUnless(NODE, "node is not installed")
class TestTemplatesAreBuilt(unittest.TestCase):
    def test_committed_templates_match_the_build_script(self):
        committed = (STUDIO / "templates" / "templates.js").read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "studio"
            shutil.copytree(STUDIO, copy, ignore=shutil.ignore_patterns(".git", "__pycache__", "node_modules"))
            subprocess.run([NODE, str(copy / "scripts" / "build-templates.js")], check=True, capture_output=True, timeout=120)
            rebuilt = (copy / "templates" / "templates.js").read_text(encoding="utf-8")
        self.assertEqual(committed, rebuilt, "run: node scripts/build-templates.js")


if __name__ == "__main__":
    unittest.main()
