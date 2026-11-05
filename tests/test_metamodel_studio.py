"""Metamodel Studio: the generated semantic asset sets are valid RDF that does what it says.

The studio is JavaScript, shared between the browser and its Node CLI; these tests drive
the CLI and check its output with independent RDF tooling (pyoxigraph, rdflib, pyshacl).
They skip when Node is not installed. What they pin:

- every template generates Turtle that parses;
- the manifest is an ``arch:Metamodel`` naming every asset document;
- the generated SHACL accepts permitted relationships and attribute values and rejects the rest;
- generate -> import -> generate is lossless, so a published set can be edited again;
- importing the linked-archi-meta ArchiMate 4.0 extracts keeps their substance;
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
                self.assertEqual(project["format"], "linked-archi-metamodel-studio/1")

    def test_cloudplatform_template_has_no_errors(self):
        result = _node("lint", str(self.template("cloudplatform")), check=False)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertNotIn("error\t", result.stdout)

    def test_archimate4_extract_reports_its_one_dangling_reference(self):
        # am4:realizes names am4:ImplementationAndMigrationElement in arch:domainIncludes,
        # and no document in the extract declares that class. The check must surface it.
        result = _node("lint", str(self.template("archimate4")), check=False)
        errors = [line for line in result.stdout.splitlines() if line.startswith("error\t")]
        self.assertEqual(len(errors), 1, result.stdout)
        self.assertIn("ImplementationAndMigrationElement", errors[0])


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

    def test_archimate4_extract_survives_import(self):
        out = self.generate(self.template("archimate4"), check=False)
        for name, floor in (("archimate4-onto.ttl", 0.95), ("archimate4-viewpoints.ttl", 0.99)):
            with self.subTest(document=name):
                original = rdflib.Graph().parse(FIXTURES / name)
                regenerated = rdflib.Graph().parse(out / name)
                kept = sum(1 for t in original if t in regenerated)
                self.assertGreaterEqual(kept / len(original), floor, f"{kept}/{len(original)}")

    def test_archimate4_template_content(self):
        project = json.loads(self.template("archimate4").read_text(encoding="utf-8"))
        elements = {e["id"]: e for e in project["elements"]}
        relationships = {r["id"]: r for r in project["relationships"]}
        self.assertEqual(len(elements), 62)
        self.assertEqual(sum(e["abstract"] for e in elements.values()), 18)
        self.assertEqual(len(relationships), 15)
        self.assertEqual(len(project["viewpoints"]), 25)
        self.assertEqual(relationships["Serving"]["notation"], "v")
        self.assertEqual(relationships["ReadAccess"]["parent"], "Access")
        self.assertEqual(relationships["ReadAccess"]["predicate"], "accesses")
        self.assertIn("ApplicationDomain", elements["ApplicationComponent"]["categories"])


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
