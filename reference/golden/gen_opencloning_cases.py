"""Golden cases for pydna.opencloning_models -> packages/opencloning/test/golden/opencloning.json

A cloning plan written down: which sequences, which primers, and for each product the step that made it
and what went into it. That is pydna's `CloningStrategy`, and it serialises to the OpenCloning data
model, which is the format these cases pin.

What matters about such a document is that it can be **replayed**: run every step again from the inputs
and check that the molecule the document claims really comes out. So the cases record the document, the
records read back out of it, the replay's verdict for a product that belongs and for one that does not,
the normalised document, and the printed history.

Identifiers here are the records' own, under `id_mode(use_python_internal_id=False)`. pydna otherwise
numbers by `id()` of the Python object, which is a memory address: it differs run to run, and a port has
no equivalent. Every record is given a number of its own instead, which is what that mode is for.

Everything comes from fixed lists and a seeded generator; nothing iterates a set.
"""
import json, os, random, warnings
from Bio.Restriction import BamHI, BsaI, EcoRI
from pydna.assembly2 import (fusion_pcr_assembly, gibson_assembly, in_fusion_assembly, in_vivo_assembly,
                             ligation_assembly, pcr_assembly, restriction_ligation_assembly)
from pydna.dseqrecord import Dseqrecord
from pydna.primer import Primer
from pydna.opencloning_models import CloningStrategy, SequenceLocationStr, id_mode
from opencloning_linkml.datamodel import CloningStrategy as OfficialStrategy
from pydna.utils import create_location

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "opencloning", "test", "golden",
                   "opencloning.json")
ENZYMES = {"EcoRI": EcoRI, "BamHI": BamHI, "BsaI": BsaI}
rng = random.Random(20261116)


def dna(n):
    """`n` random bases."""
    return "".join(rng.choice("ACGT") for _ in range(n))


def guard(fn):
    """Run something, giving its value or the error it raised, with any warnings."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            out = {"value": fn()}
        except Exception as e:
            out = {"exc": {"type": type(e).__name__, "msg": str(e)}}
    if caught:
        out["warnings"] = [[type(w.message).__name__, str(w.message)] for w in caught]
    return out


# ------------------------------------------------------------------------------- inputs and snapshots
def spec(watson, circular=False, name="name", number=1, primer=False):
    """One input, as the JSON both sides build it from. `number` is the identifier it carries."""
    if primer:
        return {"primer": watson, "name": name, "id": str(number)}
    return {"watson": watson, "circular": circular, "name": name, "id": str(number)}


def build(s):
    """The pydna object a spec stands for."""
    if "primer" in s:
        return Primer(s["primer"], id=s["id"], name=s["name"])
    return Dseqrecord(s["watson"], circular=s["circular"], id=s["id"], name=s["name"])


def snap(r):
    """Enough of a record to pin it down, with the step that made it."""
    source = getattr(r, "source", None)
    return {"watson": r.seq.watson, "crick": r.seq.crick, "ovhg": r.seq.ovhg, "circular": bool(r.circular),
            "id": r.id, "name": r.name, "seguid": r.seq.seguid(),
            "features": [[str(f.location), f.type] for f in r.features],
            "source": None if source is None else type(source).__name__}


def document(records, description=""):
    """The plan these records came from, as the OpenCloning document."""
    with id_mode(use_python_internal_id=False):
        return json.loads(CloningStrategy.from_dseqrecords(records, description=description).model_dump_json())


cases = {"plans": [], "locations": [], "pieces": [], "official": []}


def plan(name, inputs, make, description="", wrong="ACGTACGTACGTACGTACGTAAAA"):
    """Run one plan and record everything about the document it makes."""
    def run():
        built = [build(s) for s in inputs]
        products = make(built)
        if not products:
            return {"products": 0}
        # Every record in a document needs an identifier of its own, inputs and products alike.
        for i, product in enumerate(products):
            product.id = str(100 + i)
        out = {"products": len(products), "document": document(products, description),
               "history": products[0].history(),
               "validate": guard(lambda: products[0].validate_history()),
               "validate_wrong": guard(lambda: products[0].source.validate(Dseqrecord(wrong))),
               "snaps": [snap(p) for p in products]}
        # Reading the document back gives the records again, each with the step that made it.
        with id_mode(use_python_internal_id=False):
            strategy = CloningStrategy.from_dseqrecords(products, description=description)
            out["read_back"] = guard(lambda: [snap(r) for r in strategy.to_dseqrecords()])
            out["normalized"] = guard(lambda: json.loads(strategy.normalize().model_dump_json()))
            out["validate_strategy"] = guard(lambda: strategy.validate())
            out["not_inputs"] = guard(lambda: strategy.get_ids_of_sequences_that_are_not_inputs())
            out["inputs"] = guard(lambda: strategy.get_ids_of_sequences_that_are_inputs())
        return out
    cases["plans"].append({"name": name, "inputs": inputs, "description": description,
                           "wrong": wrong, "result": guard(run)})


# ------------------------------------------------------------------------------------------- the plans
# Three windows of one circle, each sharing 25 bases with the next: the plasmid three fragments make.
RING = dna(75)
DOUBLED = RING + RING
THIRDS = [spec(DOUBLED[i * 25:i * 25 + 50], name=f"f{i + 1}", number=i + 1) for i in range(3)]
plan("gibson_three", THIRDS, lambda f: gibson_assembly(f, 25, True), "three fragments into a plasmid")
plan("gibson_two", THIRDS[:2], lambda f: gibson_assembly(f, 25), "two fragments end to end")
plan("in_fusion", THIRDS, lambda f: in_fusion_assembly(f, 25, True))
plan("fusion_pcr", THIRDS, lambda f: fusion_pcr_assembly(f, 25, True))
plan("in_vivo", THIRDS, lambda f: in_vivo_assembly(f, 25, True))

# Ligation: a plasmid cut in two and closed again.
CUT_PLASMID = spec("tt" + "GAATTC" + dna(14) + "GGATCC" + dna(14) + "GAATTC" + "gg", True, "vector", 1)
def ligation_plan(built):
    """Cut the plasmid and ligate the pieces back together."""
    pieces = built[0].cut(EcoRI)
    for i, piece in enumerate(pieces):
        piece.id = str(10 + i)
        piece.name = f"piece{i + 1}"
        piece.source = None
    return ligation_assembly(pieces, False, False, True)
plan("ligation", [CUT_PLASMID], ligation_plan, "cut and closed again")

# Restriction and ligation in one pot, and the same with a type IIS enzyme.
VECTOR = spec(dna(20) + "GAATTC" + dna(12) + "GGATCC" + dna(20), True, "vector", 1)
INSERT = spec(dna(8) + "GAATTC" + dna(30) + "GGATCC" + dna(8), False, "insert", 2)
plan("restriction_ligation", [VECTOR, INSERT],
     lambda f: restriction_ligation_assembly(f, [EcoRI, BamHI], True, True), "cut and joined in one pot")
O1, O2, O3 = "AATG", "GCTT", "CGAA"
GG = [spec(dna(25) + O3 + "T" + "GAGACC" + dna(15) + "GGTCTC" + "A" + O1 + dna(25), True, "acceptor", 1),
      spec(dna(6) + "GGTCTC" + "A" + O1 + dna(30) + O2 + "T" + "GAGACC" + dna(6), False, "part1", 2),
      spec(dna(6) + "GGTCTC" + "A" + O2 + dna(30) + O3 + "T" + "GAGACC" + dna(6), False, "part2", 3)]
plan("golden_gate", GG, lambda f: restriction_ligation_assembly(f, [BsaI], True, True), "golden gate")

# A PCR, whose document holds primers as well as sequences.
TEMPLATE_TEXT = dna(20) + "GGATCCattacggtcagc".upper() + dna(30) + "TTAAGCCGTAACGTTTGCCAT"
TEMPLATE = spec(TEMPLATE_TEXT, False, "template", 1)
FORWARD = spec("gaattc" + "GGATCCattacggtcagc".upper(), name="fwd", number=2, primer=True)
REVERSE = spec("ATGGCAAACGTTACGGCTTAA", name="rvs", number=3, primer=True)
plan("pcr", [TEMPLATE, FORWARD, REVERSE], lambda f: pcr_assembly(f[0], f[1], f[2], False, 14), "a pcr")
plan("pcr_features", [TEMPLATE, FORWARD, REVERSE], lambda f: pcr_assembly(f[0], f[1], f[2], True, 14),
     "a pcr, primers marked")

# Two steps: amplify a piece of a template, then join it to a backbone by Gibson. The document holds the
# whole history, so replaying it has to replay the PCR first.
ARM = dna(25)
BACKBONE_TEXT = "CCTAGGTTACGGCATTAGCC" + dna(40) + ARM
INNER = dna(30)
PCR_TEMPLATE_TEXT = dna(15) + ARM + INNER + "CCTAGGTTACGGCATTAGCC" + dna(15)
TWO_STEP = [spec(PCR_TEMPLATE_TEXT, False, "template", 1),
            spec(ARM, name="fwd", number=2, primer=True),
            spec("GGCTAATGCCGTAACCTAGG", name="rvs", number=3, primer=True),
            spec(BACKBONE_TEXT, False, "backbone", 4)]
def two_step(built):
    """Amplify a piece, then join it to the backbone."""
    amplified = pcr_assembly(built[0], built[1], built[2], False, 20)
    if not amplified:
        return []
    amplified[0].id = "50"
    amplified[0].name = "amplicon"
    return gibson_assembly([built[3], amplified[0]], 20, True)
plan("pcr_then_gibson", TWO_STEP, two_step, "amplify, then assemble")

# Two Gibson steps, so that the history tree has a branch running past a nested step: the glyph a
# renderer gets wrong if it tracks depth but not which ancestors still have siblings to come.
def nested(built):
    """Join two fragments, then join the result to the third."""
    first = gibson_assembly(built[:2], 25)
    if not first:
        return []
    first[0].id = "50"
    return gibson_assembly([first[0], built[2]], 25)
plan("gibson_nested", THIRDS, nested, "two steps, one fragment at a time")

# A plan whose product is not what the steps make: the document is well formed but does not replay.
def tampered(built):
    """Assemble, then claim a different molecule came out."""
    products = gibson_assembly(built, 25, True)
    if not products:
        return []
    product = products[0]
    forged = Dseqrecord(str(product.seq)[:-3], circular=True, id="100", name=product.name)
    forged.source = product.source
    return [forged]
plan("tampered", THIRDS, tampered, "a product that does not follow")

# Renumbering a plan, and the plain dictionary form of one. `reassign_ids` is what pydna uses to turn
# the memory addresses it numbers by into 1, 2, 3; given numbers of its own it still sorts and renumbers.
def renumber():
    """Write a plan with scattered numbers, renumber it, and say what came out."""
    built = [build(s) for s in THIRDS]
    products = gibson_assembly(built, 25, True)
    products[0].id = "100"
    with id_mode(use_python_internal_id=False):
        strategy = CloningStrategy.from_dseqrecords(products, description="renumbered")
        before = json.loads(strategy.model_dump_json())
        strategy.reassign_ids()
        after = json.loads(strategy.model_dump_json())
        plain = strategy.model_dump()
    return {"before": [s["id"] for s in before["sequences"]], "after": after,
            "dump_keys": sorted(plain), "dump_ids": [s["id"] for s in plain["sequences"]]}
cases["plans"].append({"name": "reassign_ids", "inputs": THIRDS, "description": "renumbered",
                       "wrong": "", "result": guard(renumber)})

# ------------------------------------------------------------------------------------- location strings
for start, end, length in ((0, 25, 50), (25, 50, 50), (40, 10, 50), (0, 50, 50), (0, 0, 50), (3, 4, 10),
                           (45, 5, 50), (0, 1, 1)):
    cases["locations"].append({
        "start": start, "end": end, "length": length,
        "text": guard(lambda: str(SequenceLocationStr.from_biopython_location(create_location(start, end, length)))),
        "round_trip": guard(lambda: str(SequenceLocationStr(
            str(SequenceLocationStr.from_biopython_location(create_location(start, end, length)))).to_biopython_location())),
    })
for start, end, length in ((0, 25, 50), (40, 10, 50), (3, 4, 10)):
    cases["locations"].append({"from_start_and_end": [start, end, length],
                               "text": guard(lambda: str(SequenceLocationStr.from_start_and_end(start, end, length)))})
for text in ("1..25", "join(41..50,1..10)", "26..50", "1..1", "nonsense"):
    cases["locations"].append({"text_in": text,
                               "parsed": guard(lambda: str(SequenceLocationStr.field_validator(text).to_biopython_location()))})

# ------------------------------------------------------------- what a source hands its replay as inputs
# `_get_input_sequences` drops the repeated fragment of an insertion, and `_minimal_assembly_overlap`
# finds the shortest stretch any two fragments share, which is the limit the replay runs at.
for name, inputs, make in (("gibson_three", THIRDS, lambda f: gibson_assembly(f, 25, True)),
                           ("gibson_two", THIRDS[:2], lambda f: gibson_assembly(f, 25)),
                           ("pcr", [TEMPLATE, FORWARD, REVERSE], lambda f: pcr_assembly(f[0], f[1], f[2], False, 14))):
    def pieces(name=name, inputs=inputs, make=make):
        """What the source would hand its replay."""
        built = [build(s) for s in inputs]
        products = make(built)
        if not products:
            return None
        source = products[0].source
        return {"inputs_handled": [s.name for s in source._get_input_sequences(True)],
                "inputs_plain": [s.name for s in source._get_input_sequences(False)],
                "primers": [p.name for p in source._get_input_primers()],
                "overlap": source._minimal_assembly_overlap()}
    cases["pieces"].append({"name": name, "result": guard(pieces)})

# ------------------------------------------------------- the data model's own reading of a plan
# A plan is only worth sending if the other end reads it with something other than this code. These
# documents are handed to `opencloning_linkml`, the library the OpenCloning data model is defined by,
# and written back out by it: what is recorded is what that library emits, so replaying one here shows
# the two agree about the format rather than only about pydna.
for name in ("gibson_three", "pcr", "pcr_then_gibson", "restriction_ligation"):
    plan_case = next(c for c in cases["plans"] if c["name"] == name)
    if "value" not in plan_case["result"] or not plan_case["result"]["value"].get("products"):
        continue
    ours = plan_case["result"]["value"]["document"]
    official = OfficialStrategy.model_validate(ours)
    emitted = json.loads(official.model_dump_json(exclude_none=False))
    cases["official"].append({
        "name": name,
        "document": emitted,
        "unchanged": emitted == ours,
        "source_types": [type(s).__name__ for s in official.sources],
    })

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0, sort_keys=True)
print({k: len(v) for k, v in cases.items()}, "->", os.path.relpath(OUT), os.path.getsize(OUT) // 1024, "kB")
