"""Golden cases for cutting a pydna Dseq -> packages/dseq/test/golden/dseq-cut.json

Each case takes a molecule, asks where a set of enzymes cuts it, and records the cut sites, which of them
pydna considers possible, how it pairs them up, every fragment that comes out, and the fragments of a few
pairs taken by hand -- including pairs whose cuts cross, which it refuses. The slicing cases are here too,
because cutting a circle depends on slices that wrap.
"""
import json, os
from Bio.Restriction import RestrictionBatch
from pydna.dseq import CircularBytes, Dseq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseq", "test", "golden", "dseq-cut.json")

#: A small batch, so that the recorded cutter counts stay readable.
SMALL = ["EcoRI", "BamHI", "HindIII", "SmaI", "PstI", "NotI", "XbaI", "KpnI", "BsaI", "EcoRV"]


def snap(d):
    """Enough of a molecule to pin it down, in the shape `dseq.json` uses."""
    return {"data": d._data.decode("ascii"), "watson": d.watson, "crick": d.crick, "len": len(d),
            "ovhg": d.ovhg, "right_ovhg": d.right_ovhg, "str": str(d), "circular": bool(d.circular)}


def err(e):
    """One exception, as JSON."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    return {"type": type(e).__name__, "msg": msg}


def enc_cut(cut):
    """A cut site as JSON: the position, the overhang and the enzyme's name."""
    (watson, ovhg), enzyme = cut
    return {"watson": watson, "ovhg": ovhg, "enzyme": None if enzyme is None else str(enzyme)}


def guard(fn):
    """Run something, giving either its value or the error it raised."""
    try:
        return {"value": fn()}
    except Exception as e:
        return {"exc": err(e)}


cases = []


def add(data, circular, enzymes, slices=(), pairs=()):
    cases.append({"data": data, "circular": circular, "enzymes": list(enzymes),
                  "slices": [list(s) for s in slices], "pairs": [list(p) for p in pairs]})


SLICES = [[0, 4, None], [2, 6, None], [None, None, None], [4, 2, None], [-4, None, None], [None, -2, None],
          [0, 10, 2], [10, 0, -1], [3, 3, None], [0, None, 3]]

# a molecule with one site for each of several enzymes, linear and circular
PLASMID = "AAGAATTCAAGGATCCAAAAGCTTAACCCGGGAACTGCAGAAGCGGCCGCAAATCTAGAAAGGTACCAAA"
for circular in (False, True):
    add(PLASMID, circular, ["EcoRI"], SLICES, [[0, 1], [0, 0], [1, 0]])
    add(PLASMID, circular, ["BamHI", "HindIII"], SLICES, [[0, 1], [1, 2]])
    add(PLASMID, circular, ["SmaI"], SLICES)                       # blunt
    add(PLASMID, circular, ["PstI"], SLICES)                       # 3' overhang
    add(PLASMID, circular, ["NotI", "XbaI", "KpnI"], SLICES)
    add(PLASMID, circular, ["EcoRI", "BamHI", "HindIII", "SmaI", "PstI"], SLICES, [[0, 2], [2, 4], [0, 4]])
    add(PLASMID, circular, ["BsaI"], SLICES)                       # cuts away from its site
    add(PLASMID, circular, ["EcoRV"], SLICES)                      # no site at all
    add(PLASMID, circular, [], SLICES)
# a site that straddles the origin of a circle: the molecule starts in the middle of GAATTC
add("AATTCAAAAAAAAAAAAAAAAAAAAAAAAAAAG", True, ["EcoRI"], SLICES)
add("AATTCAAAAAAAAAAAAAAAAAAAAAAAAAAAG", False, ["EcoRI"], SLICES)
# two sites close together, so that the cuts cross
add("GAATTCGAATTC", False, ["EcoRI"], SLICES, [[0, 1], [1, 0]])
add("GGATCCGGATCC", False, ["BamHI"], SLICES, [[0, 1]])
# molecules that already have ends, where a site can fall across the single-stranded part
add("PPPPGAATTCAAGGATCCAAQQQQ", False, ["EcoRI", "BamHI"], SLICES)
add("PPPPPPGAATTCQQQQQQ", False, ["EcoRI"], SLICES)
add("QQQQGAATTCAAGGATCCAAPPPP", False, ["EcoRI", "BamHI"], SLICES)
# a single strand, which has no ends to speak of
add("PEXIPEXIPEXI", False, ["EcoRI"], SLICES)
# short and empty molecules
add("GAATTC", False, ["EcoRI"], SLICES)
add("GAATTC", True, ["EcoRI"], SLICES)
add("", False, ["EcoRI"], [[0, 1, None], [None, None, None]])

#: Direct cases for the circular byte string that slicing and cutting a circle rest on.
CIRCULAR = []
for data in ("", "A", "GATTACA", "GAATTCGAATTC"):
    ops = []
    for shift in (0, 1, 3, -2, 7, 14):
        ops.append(["shifted", [shift]])
    for start, stop, step in ([0, 3, None], [5, 2, None], [None, None, None], [2, 2, None], [-3, None, None],
                              [0, 10, 2], [6, 0, -1], [None, None, -1], [1, None, 7]):
        ops.append(["slice", [start, stop, step]])
    for start, length in ([0, 3], [5, 4], [2, 0], [-1, 3], [3, 20]):
        ops.append(["cutaround", [start, length]])
    for sub in ("GAT", "ACAG", "TTC", "", "XYZ"):
        ops.append(["find", [sub]])
    for start, end, replacement in ([0, 3, "TTT"], [5, 2, "TTTT"], [0, 2, "T"], [1, 4, "GGG"]):
        ops.append(["replace_with", [start, end, replacement]])
    for index in (0, 1, -1, 9):
        ops.append(["at", [index]])
    CIRCULAR.append({"data": data, "ops": ops})


def run_circular(cb, name, args):
    """One operation on a circular byte string."""
    if name == "shifted":
        return cb.shifted(args[0]).decode("ascii")
    if name == "slice":
        return cb[args[0]:args[1]:args[2]].decode("ascii")
    if name == "cutaround":
        return cb.cutaround(args[0], args[1]).decode("ascii")
    if name == "find":
        return cb.find(args[0])
    if name == "replace_with":
        # as bytes: pydna's own code concatenates the replacement with a byte string, so a str argument
        # can only ever raise
        return cb.replace_with(args[0], args[1], args[2].encode("ascii")).decode("ascii")
    if name == "at":
        return chr(cb[args[0]])
    raise KeyError(name)


out = []
for case in cases:
    got = dict(case)
    batch = RestrictionBatch(case["enzymes"]) if case["enzymes"] else RestrictionBatch()
    enzymes = list(batch)
    try:
        d = Dseq(case["data"], circular=case["circular"])
    except Exception as e:
        got["exc"] = err(e)
        out.append(got)
        continue
    got["snap"] = snap(d)
    got["cutsites"] = guard(lambda: [enc_cut(c) for c in d.get_cutsites(*enzymes)])
    got["pairs_out"] = guard(lambda: [[None if a is None else enc_cut(a), None if b is None else enc_cut(b)]
                                      for a, b in d.get_cutsite_pairs(d.get_cutsites(*enzymes))])
    got["fragments"] = guard(lambda: [snap(f) for f in d.cut(*enzymes)])
    got["left_end"] = guard(lambda: list(d.left_end_position()))
    got["right_end"] = guard(lambda: list(d.right_end_position()))
    got["left_cutsite"] = guard(lambda: enc_cut(d.get_left_end_as_cutsite()))
    got["right_cutsite"] = guard(lambda: enc_cut(d.get_right_end_as_cutsite()))
    # under its own key, so that the case keeps the slices it was asked for
    got["slices_out"] = [guard(lambda s=s: snap(d[s[0]:s[1]:s[2]])) for s in case["slices"]]
    # `apply_cut` on pairs of cut sites picked by index, which is where crossing cuts are refused
    sites = d.get_cutsites(*enzymes)
    applied = []
    for i, j in case["pairs"]:
        if i >= len(sites) or j >= len(sites):
            applied.append(None)
            continue
        applied.append(guard(lambda i=i, j=j: snap(d.apply_cut(sites[i], sites[j]))))
    got["applied"] = applied
    got["cutters"] = guard(lambda: sorted(str(e) for e in d.cutters(RestrictionBatch(SMALL))))
    got["no_cutters"] = guard(lambda: sorted(str(e) for e in d.no_cutters(RestrictionBatch(SMALL))))
    got["unique_cutters"] = guard(lambda: sorted(str(e) for e in d.unique_cutters(RestrictionBatch(SMALL))))
    got["twice_cutters"] = guard(lambda: sorted(str(e) for e in d.twice_cutters(RestrictionBatch(SMALL))))
    got["three_cutters"] = guard(lambda: sorted(str(e) for e in d.n_cutters(3, RestrictionBatch(SMALL))))
    out.append(got)

circular_out = []
for case in CIRCULAR:
    cb = CircularBytes(case["data"].encode("ascii"))
    got = dict(case)
    got["ops_out"] = [guard(lambda n=name, a=args: run_circular(cb, n, a)) for name, args in case["ops"]]
    circular_out.append(got)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"cuts": out, "circular": circular_out}, open(OUT, "w"), indent=0)
print(len(out), "cut cases and", len(circular_out), "circular-string cases;",
      sum("exc" in c for c in out), "raise ->", os.path.relpath(OUT))
