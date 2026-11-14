"""Golden cases for Bio.SeqFeature (positions, locations, SeqFeature, Reference) and the INSDC
location-string writers that turn a location back into GenBank/EMBL text.

Output: packages/seqfeature/test/golden/seqfeature.json
Same case shape as gen_seq_cases.py; see codec_feature.py for the encoding.
"""
import json, os, random, sys, itertools, warnings
sys.path.insert(0, os.path.dirname(__file__))
import Bio
from Bio import SeqFeature as SF
from codec import S, M, B, LST, SL as SLICE, TUP
from codec_feature import enc, dec, pos, X, SL, CL, FEAT
from Bio.SeqIO.InsdcIO import (
    _insdc_feature_position_string as insdc_pos,
    _insdc_location_string as insdc_loc,
    _insdc_location_string_ignoring_strand_and_subfeatures as insdc_loc_plain,
)

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqfeature", "test", "golden", "seqfeature.json")
rnd = random.Random(424242)

def tname(e):
    return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

#: The three module-level writers in `Bio.SeqIO.InsdcIO`. They are the other direction from
#: `Location.fromstring`: zero-based half-open positions back to one-based inclusive GenBank text, where
#: a fuzzy position prints differently again and `UnknownPosition` becomes a `>` or `<` bound.
INSDC = {"position": insdc_pos, "location": insdc_loc, "plain": insdc_loc_plain}

STATIC = {"Position.fromstring": SF.Position.fromstring, "Location.fromstring": SF.Location.fromstring, "SimpleLocation.fromstring": SF.SimpleLocation.fromstring}

def apply(case, recv, args):
    op = case.get("op")
    if "insdc" in case: return INSDC[case["insdc"]](*args)
    if "static" in case: return STATIC[case["static"]](*args)
    if "ctor" in case: return getattr(SF, case["ctor"])(*args)
    if op == "__str__": return str(recv)
    if op == "__repr__": return repr(recv)
    if op == "__add__": return recv + args[0]
    if op == "__radd__": return args[0] + recv
    if op == "__sub__": return recv - args[0]
    if op == "__len__": return len(recv)
    if op == "__contains__": return args[0] in recv
    if op == "__iter__": return list(recv)
    if op == "__eq__": return recv == args[0]
    if op == "__lt__": return recv < args[0]
    if op == "__le__": return recv <= args[0]
    if op == "__gt__": return recv > args[0]
    if op == "__ge__": return recv >= args[0]
    if op == "int": return int(recv)
    if op in ("start", "end", "strand", "parts", "ref", "ref_db", "operator", "position_choices", "location", "type", "id", "qualifiers"): return getattr(recv, op)
    if op == "set_strand": recv.strand = args[0]; return None
    if op in ("_shift", "_flip", "extract", "translate"): return getattr(recv, op)(*args)
    raise KeyError(op)

def run(case):
    recv = dec(case["recv"]) if "recv" in case else None
    args = [dec(a) for a in case.get("args", [])]
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            out["result"] = enc(apply(case, recv, args))
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    if recv is not None and case.get("op") == "set_strand": out["after"] = enc(recv)
    return out

cases, seen = [], set()
def add(c):
    k = json.dumps(c, sort_keys=True)
    if k in seen: return
    seen.add(k); c.update(run(c)); cases.append(c)

# ---------------------------------------------------------------------------------------- positions
P = [pos("ExactPosition", 0), pos("ExactPosition", 5), pos("UncertainPosition", 5), pos("BeforePosition", 3), pos("AfterPosition", 7),
     pos("WithinPosition", 5, 3, 5), pos("WithinPosition", 3, 3, 5), pos("BetweenPosition", 5, 5, 6), pos("BetweenPosition", 6, 5, 6),
     pos("OneOfPosition", 5, [X(5), X(7)]), pos("OneOfPosition", 7, [X(5), X(7)]), pos("OneOfPosition", 3, [X(3), X(6), X(9)]), pos("UnknownPosition")]
PI = [p for p in P if p["cls"] != "UnknownPosition"]
for p in P:
    for op in ("__str__", "__repr__"): add({"op": op, "recv": p, "args": []})
    for n in (-3, 0, 5): add({"op": "__add__", "recv": p, "args": [n]})
    for n in (0, 10, 20): add({"op": "_flip", "recv": p, "args": [n]})
    for o in (5, 3, None, "5", 5.5, X(5), pos("BeforePosition", 5), pos("UnknownPosition")): add({"op": "__eq__", "recv": p, "args": [o]})
for p in PI:
    add({"op": "int", "recv": p, "args": []})
    for o in (4, 5, 6): 
        for op in ("__lt__", "__le__", "__gt__", "__ge__"): add({"op": op, "recv": p, "args": [o]})
for cls, v in [("ExactPosition", 5), ("UncertainPosition", 5), ("BeforePosition", 5), ("AfterPosition", 5)]:
    for ext in (None, 0, 1): add({"ctor": cls, "args": [v] if ext is None else [v, ext]})
    add({"ctor": cls, "args": [2.7]}); add({"ctor": cls, "args": [None]}); add({"ctor": cls, "args": [-1]})
for cls in ("WithinPosition", "BetweenPosition"):
    for a in ([3, 3, 5], [5, 3, 5], [4, 3, 5], [3, 5, 3]): add({"ctor": cls, "args": a})
add({"ctor": "OneOfPosition", "args": [5, LST(X(5), X(7))]}); add({"ctor": "OneOfPosition", "args": [6, LST(X(5), X(7))]}); add({"ctor": "OneOfPosition", "args": [5, LST()]})
add({"ctor": "UnknownPosition", "args": []})
TEXTS = ["5", "0", "1", "?", "?5", "<5", ">5", "<1", ">10", "(3.9)", "(3.3)", "(10.2)", "one-of(6,9)", "one-of(3)", "one-of(3,6,9)", "one-of(9,6)", "one-of(3,+5)",
         "abc", "", "5..6", " 7 ", "+5", "1_0", "-3", "<", "one-of(3,x)", "(3.9)xyz", "one-of(6,9)q", "?x", "<<5", "1e3"]
for t in TEXTS:
    for off in (None, 0, -1, 1, -2): add({"static": "Position.fromstring", "args": [t] if off is None else [t, off]})

# ---------------------------------------------------------------------------------------- simple locations
LOCS = [SL(0, 5), SL(5, 10, 1), SL(5, 10, -1), SL(5, 10, 0), SL(5, 5), SL(0, 0, 1), SL(3, 8, None, "NC_1.1"), SL(3, 8, 1, "NC_1.1", "GenBank"),
        SL(pos("BeforePosition", 3), pos("AfterPosition", 9), 1), SL(pos("WithinPosition", 3, 3, 5), pos("OneOfPosition", 9, [X(7), X(9)]), -1),
        SL(pos("UnknownPosition"), X(5)), SL(X(2), pos("UnknownPosition"), 1), SL(pos("UncertainPosition", 4), X(12), -1)]
COMP = [CL([SL(0, 3, 1), SL(10, 15, 1)]), CL([SL(10, 15, -1), SL(0, 3, -1)], "order"), CL([SL(0, 3, 1), SL(10, 15, -1)]), CL([SL(0, 3), SL(5, 8), SL(12, 14)]),
        CL([SL(0, 3, 1, "NC_2.1"), SL(5, 8, 1)]), CL([SL(0, 3, 1), SL(5, 8, 1)], "bond"), CL([SL(pos("BeforePosition", 0), X(3), 1), SL(5, pos("AfterPosition", 9), 1)])]
ALL = LOCS + COMP
INT_LOCS = [l for l in ALL if not json.dumps(l).count("UnknownPosition")]

for a in (0, 5, 10):
    for b in (0, 5, 10, 3):
        for st in (None, 1, -1, 0, 2, "x", 1.0):
            add({"ctor": "SimpleLocation", "args": [a, b] if st is None else [a, b, st]})
for args in ([5.5, 10], [5, "10"], [None, 5], ["a", "b"], [X(5), X(3)], [pos("BeforePosition", 9), X(3)], [X(5), pos("AfterPosition", 9), 1, "ref", "db"], [pos("UnknownPosition"), X(3)]):
    add({"ctor": "SimpleLocation", "args": args})
for parts in ([SL(0, 3), SL(5, 8)], [SL(0, 3)], [], [SL(0, 3), 5], [SL(0, 3), COMP[0]], [SL(0, 3), SL(5, 8), SL(9, 10)]):
    for op in (None, "order", "bond", "weird"): add({"ctor": "CompoundLocation", "args": [LST(*parts)] if op is None else [LST(*parts), op]})

for l in ALL:
    for op in ("__str__", "__repr__", "start", "end", "strand", "parts", "ref", "ref_db"): add({"op": op, "recv": l, "args": []})
    if l["cls"] == "CompoundLocation": add({"op": "operator", "recv": l, "args": []})
for l in INT_LOCS:
    add({"op": "__len__", "recv": l, "args": []}); add({"op": "__iter__", "recv": l, "args": []})
    for v in (-1, 0, 2, 3, 5, 7, 9, 10, 14, 15, 100, 2.5, "a", None, X(5)): add({"op": "__contains__", "recv": l, "args": [v]})
    for n in (-3, 0, 4, 100): 
        for op in ("__add__", "__radd__", "__sub__", "_shift"): add({"op": op, "recv": l, "args": [n]})
    for n in (0, 12, 30): add({"op": "_flip", "recv": l, "args": [n]})
    for o in ALL[::3]: add({"op": "__eq__", "recv": l, "args": [o]})
    for o in (5, None, "x"): add({"op": "__eq__", "recv": l, "args": [o]})
    for st in (1, -1, 0, None, 2, "+"): add({"op": "set_strand", "recv": l, "args": [st]})
for l in ALL:
    for o in (LOCS[1], LOCS[2], COMP[0], COMP[1], COMP[5], 5, "x", None, 2.5):
        add({"op": "__add__", "recv": l, "args": [o]}); add({"op": "__radd__", "recv": l, "args": [o]})
    add({"op": "__sub__", "recv": l, "args": ["x"]})
    add({"op": "__sub__", "recv": l, "args": [3]})
add({"op": "__eq__", "recv": X(3) if False else LOCS[0], "args": [SL(pos("BeforePosition", 0), pos("BeforePosition", 5))]})

# extract
SEQ = "ACGTACGTTTGGCCAAGGTTAACC"
PARENTS = [S(SEQ), M(SEQ), SEQ, S(""), S("ACG")]
REFS = [None, {"$": "dict", "v": []}, {"$": "dict", "v": [["NC_1.1", S("TTTTTTTTTTTT")]]}, {"$": "dict", "v": [["other", S("GGGG")]]}, {"$": "dict", "v": [["NC_2.1", "CCCCCCCCCCCC"]]}]
for l in INT_LOCS:
    for par in PARENTS:
        for ref in REFS:
            add({"op": "extract", "recv": l, "args": [par] if ref is None and rnd.random() < .5 else [par, ref]})

# ---------------------------------------------------------------------------------------- Location.fromstring
LTEXT = ["1..10", "complement(1..10)", "join(1..10,20..30)", "complement(join(1..10,20..30))", "order(1..10,20..30)", "join(1..10,complement(20..30))",
         "join(complement(1..10),complement(20..30))", "complement(join(complement(1..10),20..30))", "bond(5)", "bond(5,9)", "join(bond(5),9..12)", "<5..>10", "<1..>10",
         "(3.5)..(8.9)", "(3.5)..9", "5..(8.9)", "one-of(3,4)..9", "3..one-of(8,9)", "one-of(3,4)..one-of(8,9)", "5^6", "9^10", "5^7", "10^1", "1^2", "complement(5^6)",
         "join(1..5,10)", "join(1..5,10..)", "NC_000001.1:5..10", "join(1..5,NC_1.1:7..9)", "complement(NC_1.1:5..10)", "1..", "..5", "abc", "", "join()", "join(1..10)",
         "complement(join(1..10))", "join(1..10,20..30", "complement(1..10", "complement(", "5", "<5", ">5", "?5", "0..5", "-3..5", "5..3", "10..5", "5..5", "1..1",
         "join(10..5,1..3)", "complement(10..5)", "order(1..5,join(7..9,11..12))", "join(1..5,order(7..9,11..12))", "join(1..5,7..9,11..13,15..17)",
         "complement(join(1..5,7..9,11..13))", "join(<1..5,7..>9)", "join(1..5, 7..9)", " 1..5", "1..5 ", "5..10abc", "join(1..5,x..y)", "x..y", "1..2..3",
         "join(complement(1..5),7..9)", "order(complement(1..5),complement(7..9))", "bond(complement(5))", "complement(bond(5))", "complement(order(1..5,7..9))",
         "join(1..5,,7..9)", "join(1..5,7..9,)", "join(1..5,7..9,))", "12345..67890", "1..10,20..30", "join(NC_1.1:1..5,NC_2.1:7..9)", "AB_1.2|x:3..9"]
for t in LTEXT:
    for length, circ in [(None, False), (30, False), (30, True), (8, True), (3, True), (5, False), (0, True)]:
        for stranded in (True, False):
            add({"static": "Location.fromstring", "args": [t] if (length, circ, stranded) == (None, False, True) else [t, length, circ, stranded]})
    for length, circ in [(None, False), (30, True), (6, True)]:
        add({"static": "SimpleLocation.fromstring", "args": [t, length, circ]})

# ---------------------------------------------------------------------------------------- SeqFeature
Q = [(("gene", LST("demo")), ("product", LST("a protein"))), (("codon_start", LST("2")),), (("transl_table", LST("2")),), (("codon_start", LST("4")),), (("codon_start", LST("x")),),
     (("codon_start", LST("1")), ("transl_table", LST("11"))), (("note", LST("it's", 'a "quote"')),), ()]
FL = [SL(0, 9, 1), SL(0, 12, -1), SL(3, 15, 1), CL([SL(0, 3, 1), SL(6, 12, 1)]), CL([SL(6, 12, -1), SL(0, 3, -1)]), SL(0, 30, 1), SL(2, 5, 1, "NC_1.1")]
FEATS = [FEAT(l, t, i, q) for l in FL for t in ("CDS", "gene", "") for i in ("<unknown id>", "f1") for q in Q[:4]] + [FEAT(None, "x"), FEAT(None)]
FEATS = rnd.sample(FEATS, 70) + FEATS[-2:] + [FEAT(FL[0], "CDS", "<unknown id>", Q[5]), FEAT(FL[0], "CDS", "f", Q[6])]
for f in FEATS:
    for op in ("__repr__", "__str__", "__len__", "__iter__", "location", "type", "id", "qualifiers"): add({"op": op, "recv": f, "args": []})
    for v in (0, 3, 100): add({"op": "__contains__", "recv": f, "args": [v]})
    for o in (f, FEATS[0], FEAT(FL[0], "CDS"), None, 5): add({"op": "__eq__", "recv": f, "args": [o]})
    for n in (3, 10): add({"op": "_shift", "recv": f, "args": [n]}); add({"op": "_flip", "recv": f, "args": [n * 3]})
    for par in PARENTS[:3]: add({"op": "extract", "recv": f, "args": [par]})
    for _ in range(4):
        args = [rnd.choice(PARENTS[:3])]
        for pool in ([1, 2, 11, "Standard", "Bogus", 99], [None, 0, 1, 2, 3, -1], ["*", "#"], [False, True], [None, False, True], [None, "-"]):
            if rnd.random() < .5: args.append(rnd.choice(pool))
            else: break
        add({"op": "translate", "recv": f, "args": args})
add({"ctor": "SeqFeature", "args": []}); add({"ctor": "SeqFeature", "args": [None, "x"]}); add({"ctor": "SeqFeature", "args": [5]}); add({"ctor": "SeqFeature", "args": ["loc"]})
add({"ctor": "SeqFeature", "args": [FL[0], "CDS", "id", None, LST()]})
add({"ctor": "SeqFeature", "args": [FL[0], "CDS", "id", {"$": "dict", "v": [["a", LST("b")]]}]})

# ---------------------------------------------------------------------------------------- Reference
def REF(**kw):
    d = {"$": "ref", "authors": "", "consrtm": "", "title": "", "journal": "", "medline_id": "", "pubmed_id": "", "comment": "", "location": []}
    d.update(kw); return d
REFS_ = [REF(), REF(authors="A B", title="T", journal="J", medline_id="1", pubmed_id="2", comment="c", location=[SL(0, 5, 1)]), REF(consrtm="Group", title="it's"),
         REF(location=[SL(0, 5, 1), CL([SL(0, 1), SL(3, 4)])]), REF(title='say "hi"')]
for r in REFS_:
    for op in ("__str__", "__repr__"): add({"op": op, "recv": r, "args": []})
    for o in REFS_: add({"op": "__eq__", "recv": r, "args": [o]})
add({"ctor": "Reference", "args": []})

# ------------------------------------------------------------------------------- INSDC location strings
# Ported but, until these cases, only exercised indirectly through the GenBank writer in another package.
for l in ALL:
    for n in (100, 15, 10):
        add({"insdc": "location", "args": [l, n]})
        add({"insdc": "plain", "args": [l, n]})
for q in P:
    for off in (0, 1, -1):
        add({"insdc": "position", "args": [q, off]})
# A plain integer is not a position object, which is the one refusal the writer has of its own.
for bad in (5, "5", None):
    add({"insdc": "position", "args": [bad, 0]})

json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(f"{len(cases)} cases, {sum('exc' in c for c in cases)} raise, {sum(bool(c['warnings']) for c in cases)} warn -> {os.path.relpath(OUT)} ({os.path.getsize(OUT)/1e6:.1f} MB)")
