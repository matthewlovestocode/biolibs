"""Golden cases for Dseqrecord's cutting -> packages/dseqrecord/test/golden/dseqrecord-cut.json

Cutting a record is cutting a molecule and then deciding, for every feature, which fragment it belongs to.
`Dseq` already knows where the enzymes break the strands; what these cases are about is the second half:
a feature inside one fragment travels with it, one that straddles a cut is dropped, and on a circle a
feature that spanned the origin has to be found again in whichever fragment now holds it.

So the molecules here are chosen for their cut sites and are given features deliberately placed across
them: inside a fragment, over a cut, and through the origin.

`synced` is here too, because it is cutting's sibling: both are about putting a circular molecule back
into a known frame. Note that it searches for stretches starting at the *reference's* own beginning, so
the reference is varied rather than the molecule.

`linearize`'s three refusals are recorded as well -- a linear molecule, enzymes that do not cut, and
enzymes that cut more than once -- since the whole point of the method is that there is exactly one answer.
"""
import json, os, warnings
from Bio.Restriction import BamHI, CommOnly, EcoRI, EcoRV, HindIII, NotI, RestrictionBatch, SmaI
from pydna.dseqrecord import Dseqrecord

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseqrecord", "test", "golden",
                   "dseqrecord-cut.json")


def err(e):
    """One exception, as JSON."""
    return {"type": type(e).__name__, "msg": str(e)}


def guard(fn):
    """Run something, giving its value or the error it raised, with any warnings."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            out = {"value": fn()}
        except Exception as e:
            out = {"exc": err(e)}
    if caught:
        out["warnings"] = [[type(w.message).__name__, str(w.message)] for w in caught]
    return out


def feat(sf):
    """One feature, in the shape the port records it."""
    loc = sf.location
    return {"str": str(loc) if loc is not None else None,
            "parts": None if loc is None else [[int(p.start), int(p.end), p.strand] for p in loc.parts],
            "type": sf.type, "len": len(sf),
            "qualifiers": {k: v for k, v in sorted(sf.qualifiers.items())}}


def snap(r):
    """Enough of a fragment to pin it down."""
    return {"code": r.seq._data.decode("ascii"), "watson": r.seq.watson, "crick": r.seq.crick,
            "circular": bool(r.circular), "len": len(r), "ovhg": r.seq.ovhg,
            "id": r.id, "name": r.name, "features": [feat(f) for f in r.features], "repr": repr(r)}


#: Enzymes by the name the port will look them up under.
ENZYMES = {"EcoRI": EcoRI, "BamHI": BamHI, "HindIII": HindIII, "EcoRV": EcoRV, "SmaI": SmaI,
           "NotI": NotI}

#: Molecules with known sites, and where to put features on each.
#: EcoRI is GAATTC, BamHI GGATCC, HindIII AAGCTT, EcoRV GATATC (blunt), SmaI CCCGGG (blunt).
MOLECULES = [
    # One site, in the middle: the simplest division.
    ("aaaGAATTCttt", [(0, 3), (4, 8), (9, 12)]),
    # Two sites for one enzyme, so a circle gives two fragments and a line gives three.
    ("aaGAATTCaaGAATTCaa", [(0, 2), (6, 12), (16, 18)]),
    # Two different enzymes.
    ("aaGAATTCaaGGATCCaa", [(0, 2), (6, 12), (16, 18)]),
    # A blunt cutter, which leaves no overhang for a feature to fall inside.
    ("aaaGATATCttt", [(0, 3), (4, 8), (9, 12)]),
    ("aaaCCCGGGttt", [(0, 3), (4, 8), (9, 12)]),
    # A site straddling the origin of a circle, which is where the bookkeeping is hardest.
    ("TTCaaaaaaaGAA", [(0, 3), (10, 13), (5, 8)]),
    # No site at all.
    ("aaaaaaaaaaaa", [(0, 3), (4, 8)]),
    # A site at the very start and at the very end.
    ("GAATTCaaaaaa", [(0, 6), (6, 12)]),
    ("aaaaaaGAATTC", [(0, 6), (6, 12)]),
]
#: Which enzymes to try against each molecule.
TRIES = [["EcoRI"], ["BamHI"], ["EcoRI", "BamHI"], ["HindIII"], ["EcoRV"], ["SmaI"], ["NotI"],
         ["EcoRI", "EcoRI"], []]

cases = []
for data, spans in MOLECULES:
    for circular in (False, True):
        def build(data=data, spans=spans, circular=circular):
            r = Dseqrecord(data, circular=circular)
            for i, (x, y) in enumerate(spans):
                if y <= len(r):
                    r.add_feature(x, y, type_="misc", label=[f"f{i}"])
            return r
        case = {"data": data, "circular": circular, "spans": [list(s) for s in spans],
                "built": guard(lambda: snap(build()))}
        if "exc" in case["built"]:
            cases.append(case)
            continue
        r = build()
        case["cuts"] = {}
        for names in TRIES:
            key = "+".join(names) or "none"
            enzymes = [ENZYMES[n] for n in names]
            case["cuts"][key] = {
                "fragments": guard(lambda e=enzymes: [snap(f) for f in build().cut(*e)]),
                "number_of_cuts": guard(lambda e=enzymes: build().number_of_cuts(*e)),
                "linearize": guard(lambda e=enzymes: snap(build().linearize(*e))),
            }
        # The cutter queries, over a small batch so the answer is readable and stable.
        batch = RestrictionBatch([EcoRI, BamHI, HindIII, EcoRV, SmaI, NotI])
        case["queries"] = {
            name: guard(lambda name=name: sorted(str(e) for e in getattr(r, name)(batch=batch)))
            for name in ("no_cutters", "unique_cutters", "once_cutters", "twice_cutters", "cutters")
        }
        case["n_cutters"] = {str(n): guard(lambda n=n: sorted(str(e) for e in r.n_cutters(n=n,
                                                                                          batch=batch)))
                             for n in (0, 1, 2, 3)}
        # The default batch is CommOnly, which is large, so only its size is recorded.
        case["default_batch_sizes"] = guard(lambda: [len(r.cutters()), len(r.no_cutters()),
                                                     len(CommOnly)])
        cases.append(case)

#: Molecules and references for `synced`, with the reference varied rather than the molecule.
SYNCED = [
    ("gaattcaaaaa", ["gaattc", "aaaaagaattc", "aaaaa", "ttcaaaaagaa", "zzzzz", ""]),
    ("atgaCCCgggt", ["atga", "CCCggg", "gggtatga", "tacg", ""]),
    ("aaaatttt", ["aaaa", "tttt", "ttttaaaa", "aaaatttt"]),
]
synced = []
for data, refs in SYNCED:
    for ref in refs:
        for limit in (3, 4, 25):
            for circular in (True, False):
                def run(data=data, ref=ref, limit=limit, circular=circular):
                    return snap(Dseqrecord(data, circular=circular).synced(ref, limit=limit))
                synced.append({"data": data, "ref": ref, "limit": limit, "circular": circular,
                               "result": guard(run)})
    # Against a record rather than a string, which reads its watson strand.
    synced.append({"data": data, "ref": {"record": data}, "limit": 4, "circular": True,
                   "result": guard(lambda data=data: snap(Dseqrecord(data, circular=True).synced(
                       Dseqrecord(data), limit=4)))})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"pydna": __import__("pydna").__version__, "cases": cases, "synced": synced},
          open(OUT, "w"), indent=0, allow_nan=False)
print(len(cases), "molecules,", len(synced), "synced ->", os.path.relpath(OUT))
