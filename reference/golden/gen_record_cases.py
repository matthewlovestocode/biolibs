"""Golden cases for Bio.SeqRecord.

Output: packages/seqrecord/test/golden/seqrecord.json
Cases record the full state of the record after every call, so hidden side effects (such as the
lazy creation of letter_annotations) are compared too.
"""
import json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
import Bio
import Bio.Seq as BioSeq
from Bio.SeqRecord import SeqRecord
from codec import S, M, U, P, B, SL as SLICE, LST, TUP
from codec_feature import enc, dec, X, SL as LOC, CL, FEAT, REC

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqrecord", "test", "golden", "seqrecord.json")
rnd = random.Random(777)

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def pyadd(a, b):
    return a + b

def apply(case, recv, args):
    op = case.get("op")
    if "ctor" in case: return SeqRecord(*args)
    if "func" in case: return getattr(BioSeq, case["func"])(*args)
    if op == "__getitem__": return recv[args[0]]
    if op == "__iter__": return list(recv)
    if op == "__contains__": return args[0] in recv
    if op == "__bytes__": return bytes(recv)
    if op == "__str__": return str(recv)
    if op == "__repr__": return repr(recv)
    if op == "__len__": return len(recv)
    if op == "__add__": return recv + args[0]
    if op == "__radd__": return args[0] + recv
    for sym, name in (("lt", "__lt__"), ("le", "__le__"), ("eq", "__eq__"), ("ne", "__ne__"), ("gt", "__gt__"), ("ge", "__ge__")):
        if op == name: return getattr(recv, name)(args[0])
    if op == "set_seq": recv.seq = args[0]; return None
    if op == "set_letter": recv.letter_annotations = args[0]; return None
    if op == "letter_setitem": recv.letter_annotations[args[0]] = args[1]; return None
    if op == "letter_update": recv.letter_annotations.update(args[0]); return None
    if op in ("seq", "id", "name", "description", "dbxrefs", "annotations", "features", "letter_annotations"): return getattr(recv, op)
    if op == "format": return recv.format(*args)
    return getattr(recv, op)(*args)

def run(case):
    recv = dec(case["recv"]) if "recv" in case else None
    before = enc(recv) if recv is not None else None
    args = [dec(a) for a in case.get("args", [])]
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            out["result"] = enc(apply(case, recv, args))
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    if recv is not None:
        after = enc(recv)
        if after == before: out["unchanged"] = True      # the common case: omit the (large) state
        else: out["after"] = after
    return out

cases, seen = [], set()
def add(c):
    k = json.dumps(c, sort_keys=True)
    if k in seen: return
    seen.add(k); c.update(run(c)); cases.append(c)

GENE = FEAT(LOC(0, 4, 1), "gene", "g1", [("gene", LST("a"))])
CDS = FEAT(LOC(2, 8, -1), "CDS", "<unknown id>", [("codon_start", LST("1"))])
REFF = FEAT(LOC(1, 3, 1, "NC_9.1"), "misc")
EXON = FEAT(CL([LOC(0, 2, 1), LOC(5, 7, 1)]), "mRNA")
FUZZ = FEAT(LOC({"$": "pos", "cls": "BeforePosition", "v": 1}, {"$": "pos", "cls": "AfterPosition", "v": 6}, 1), "region")
UNK = FEAT(LOC({"$": "pos", "cls": "UnknownPosition"}, X(5), 1), "weird")
# An unknown *end*, which is the case that makes reverse_complement fail: flipping turns it into an
# unknown start, and sorting the flipped features then compares None with an int. An unknown start
# (UNK above) flips to a known one, so it sorts fine -- the two are not symmetrical.
UNKEND = FEAT(LOC(X(2), {"$": "pos", "cls": "UnknownPosition"}, 1), "weird")
Q8 = [("quality", LST(*[40] * 8)), ("label", "abcdefgh")]
R = {
 "full": REC(S("ACGTACGT"), "r1", "n1", "d1", ["DB:1", "DB:2"], [GENE, CDS], [("molecule_type", "DNA"), ("organism", "X y"), ("n", 5), ("tags", LST("a", "b"))], Q8),
 "plain": REC(S("ACGTACGT"), "r2", "n2", "d2"),
 "noseq": REC(None, "r3", "n3", "d3", [], [], [("k", "v")]),
 "mutable": REC(M("ACGTACGT"), "r4", "n4", "d4", [], [GENE]),
 "rna": REC(S("ACGUACGU"), "r5", "n5", "d5", [], [GENE, EXON], [("molecule_type", "RNA")]),
 "protein": REC(S("MKVLAA"), "r6", "n6", "d6", [], [], [("molecule_type", "protein")], [("quality", LST(*[1] * 6))]),
 "undef": REC(U(8), "r7", "n7", "d7"),
 "partial": REC(P(8, [(0, "ACG"), (5, "TTT")]), "r8", "n8", "d8"),
 "feat": REC(S("ACGTACGTACGT"), "r9", "n9", "d9", [], [GENE, CDS, EXON, FUZZ, REFF], [("molecule_type", "DNA")]),
 "emptyletters": REC(S("ACGT"), "r10", "n10", "d10", [], [], [], []),
 "orf": REC(S("ATGAAATAGCCC"), "r11", "n11", "d11", ["X:1"], [GENE], [("molecule_type", "DNA")], [("q", "abcdefghijkl")]),
 "lower": REC(S("acgtacgt"), "r12", "n12", "d12"),
 "mixed": REC(S("AcGtAcGt"), None, "n13", "", [], [], [("a", LST())]),
 "unknownfeat": REC(S("ACGTACGT"), "r14", "n14", "d14", [], [UNK, GENE]),
 "unknownfeat2": REC(S("ACGTACGT"), "r15", "n15", "d15", [], [GENE, UNK]),
 "nummol": REC(S("ACGTACGT"), "r16", "n16", "d16", [], [], [("molecule_type", 5)]),
 "empty": REC(S(""), "r17", "n17", "d17"),
 "unkendfeat": REC(S("ACGTACGT"), "r18", "n18", "d18", [], [UNKEND, GENE]),
 "unkendfeat2": REC(S("ACGTACGT"), "r19", "n19", "d19", [], [GENE, UNKEND]),
 "unkendonly": REC(S("ACGTACGT"), "r20", "n20", "d20", [], [UNKEND]),
}
RL = list(R.values())

# ---- constructor
SEQS = [S("ACGT"), M("ACGT"), None, "ACGT", 5, B("AC")]
for seq in SEQS:
    for kw in ([], ["i"], ["i", "n", "d"], [None], ["i", 5], ["i", "n", 5]):
        add({"ctor": True, "args": [seq] + kw})
EMPTYD = {"$": "dict", "v": []}
for extra in ([LST("a"), LST(GENE), {"$": "dict", "v": [["k", 1]]}], [None, None, None], ["x", LST(), EMPTYD], [LST("a"), LST(GENE), {"$": "dict", "v": []}], [LST(), LST(), LST()],
              [LST("a"), LST(GENE), {"$": "dict", "v": [["k", 1]]}, {"$": "dict", "v": [["q", "abcd"]]}], [LST(), LST(), EMPTYD, {"$": "dict", "v": [["q", "abc"]]}],
              [LST(), LST(), EMPTYD, {"$": "dict", "v": [["q", "abcd"], ["r", LST(1, 2, 3, 4)], ["bad", "x"]]}], [LST(), LST(), EMPTYD, LST()], [LST(), LST(), 5],
              [LST(), "notalist"], [5], [LST(), LST(), EMPTYD, EMPTYD], [LST(5, 6)], [LST(), LST(5)]):
    add({"ctor": True, "args": [S("ACGT"), "i", "n", "d"] + extra})

# ---- reading, indexing, conversion
for k, r in R.items():
    for op in ("__str__", "__repr__", "__len__", "__bytes__", "__iter__", "id", "name", "description", "dbxrefs", "annotations", "features", "seq", "letter_annotations", "isupper", "islower", "upper", "lower"):
        add({"op": op, "recv": r, "args": []})
    for i in (0, 1, -1, 3, 7, 8, -9, 100): add({"op": "__getitem__", "recv": r, "args": [i]})
    for i in (1.5, "x", None): add({"op": "__getitem__", "recv": r, "args": [i]})
    for sl in [SLICE(a, b, c) for a in (None, 0, 2, -3, 20) for b in (None, 4, 6, -1, 100) for c in (None, 1, 2, -1, 0)]:
        if rnd.random() < 0.18: add({"op": "__getitem__", "recv": r, "args": [sl]})
    for sub in ("A", "CG", "T", "", S("AC"), "X"): add({"op": "__contains__", "recv": r, "args": [sub]}); add({"op": "count", "recv": r, "args": [sub]})
    add({"op": "count", "recv": r, "args": ["A", 1, 6]})
    for o in (r, R["plain"], 5, None): 
        for op in ("__lt__", "__le__", "__eq__", "__ne__", "__gt__", "__ge__"): add({"op": op, "recv": r, "args": [o]})
    # Only formats that need no writer yet; "fasta"/"genbank"/... are verified when Bio.SeqIO is ported.
    for f in ("", "bogus", "FASTA", " "): add({"op": "format", "recv": r, "args": [f]})
# every slice for the fully featured records (features are filtered, letters sliced)
for name in ("full", "feat", "orf", "protein"):
    n = R[name]["seq"]["v"].__len__() if "v" in R[name]["seq"] else 8
    for a in list(range(-n - 1, n + 2, 2)) + [None]:
        for b in list(range(-n - 1, n + 2, 2)) + [None]:
            for c in (None, 1, 2, -1):
                add({"op": "__getitem__", "recv": R[name], "args": [SLICE(a, b, c)]})

# ---- arithmetic
OPS = [S("TT"), M("GG"), "AA", "", 5, None, LST(), R["plain"], R["full"], R["feat"], R["noseq"], R["orf"], R["rna"], R["mutable"], R["undef"], R["protein"], R["emptyletters"], R["lower"]]
for r in RL:
    for o in OPS:
        add({"op": "__add__", "recv": r, "args": [o]})
        add({"op": "__radd__", "recv": r, "args": [o]})
# letter-annotation concatenation (strings, lists, mixed types)
A_ = REC(S("ACG"), "a", "n", "d", [], [], [], [("q", LST(1, 2, 3)), ("s", "abc"), ("only_a", "xyz")])
B_ = REC(S("TT"), "a", "n", "d2", ["X"], [GENE], [], [("q", LST(9, 8)), ("s", "de"), ("only_b", "pq")])
C_ = REC(S("TT"), "c", "n", "d", [], [], [], [("q", "ab"), ("s", LST(1, 2))])
for l, r in ((A_, B_), (B_, A_), (A_, C_), (C_, A_), (A_, A_)): add({"op": "__add__", "recv": l, "args": [r]})
D1 = REC(S("AC"), "i", "n", "d", ["x", "y"], [GENE], [("a", 1), ("b", LST(1)), ("c", "same")], [])
D2 = REC(S("GT"), "i", "n2", "d", ["y", "z"], [CDS], [("a", 1), ("b", LST(1)), ("c", "other"), ("e", 2)], [])
add({"op": "__add__", "recv": D1, "args": [D2]}); add({"op": "__add__", "recv": D2, "args": [D1]})

# ---- reverse_complement
RC_ARGS = [[], [True], ["new"], [""], [None], [True, True, True], ["i", "n", "d"], [False, False, False, False], [False, False, False, True, True, True, True],
           [False, False, False, LST(GENE)], [False, False, False, True, {"$": "dict", "v": [["k", "v"]]}], [False, False, False, True, False, False, LST("db:1")],
           [False, False, False, True, False, {"$": "dict", "v": [["quality", LST(*[1] * 8)]]}], [False, False, False, True, False, {"$": "dict", "v": [["quality", LST(1)]]}],
           [False, False, False, True, False, False, True], [False, False, False, True, False, 5], [1, 1, 1], [0], [LST("a")], [False, False, False, 0], [False, False, False, 1, 1, 0]]
for r in RL:
    for a in RC_ARGS: add({"op": "reverse_complement", "recv": r, "args": a})

# ---- translate
TR_ARGS = [[], [11], [2, "#"], [1, "*", True], [1, "*", False, True], ["Standard", "*", False, False, "-"], [1, "*", False, False, None, True, True, True],
           [1, "*", False, False, None, "i", "n", "d"], [1, "*", False, False, None, False, False, False, LST(GENE)], [1, "*", False, False, None, False, False, False, True],
           [1, "*", False, False, None, False, False, False, False, True], [1, "*", False, False, None, False, False, False, False, {"$": "dict", "v": [["k", 1]]}],
           [1, "*", False, False, None, False, False, False, False, False, {"$": "dict", "v": [["q", "abcdefghijkl"]]}], [1, "*", False, False, None, False, False, False, False, False, True],
           [1, "*", False, False, None, False, False, False, False, False, False, LST("db:1")], [1, "*", False, False, None, False, False, False, False, False, False, True], ["Bogus"], [99], [None]]
for r in RL:
    for a in TR_ARGS: add({"op": "translate", "recv": r, "args": a})

# ---- Bio.Seq functions and Seq.join given records
for r in RL:
    for f in ("reverse_complement", "complement", "complement_rna", "reverse_complement_rna"):
        for extra in ([], [True], [False]): add({"func": f, "args": [r] + extra})
    add({"op": "join", "recv": S("-"), "args": [r]})
    add({"op": "join", "recv": S("-"), "args": [LST(r)]})
    add({"op": "join", "recv": S("-"), "args": [LST("A", r)]})

# ---- mutation: seq and letter annotations
NEWSEQ = [S("TTTTTTTT"), S("TT"), M("GGGGGGGG"), None, "ACGTACGT", 5, S("")]
for r in RL:
    for v in NEWSEQ: add({"op": "set_seq", "recv": r, "args": [v]})
    for d in ({"$": "dict", "v": []}, {"$": "dict", "v": [["q", LST(*[2] * 8)]]}, {"$": "dict", "v": [["q", LST(1, 2)]]}, {"$": "dict", "v": [["q", "abcdefgh"], ["z", "no"]]},
              LST(), None, 5, {"$": "dict", "v": [["q", 5]]}):
        add({"op": "set_letter", "recv": r, "args": [d]})
    for k, v in (("q", LST(*[3] * 8)), ("q", "abcdefgh"), ("q", LST(1)), ("q", 5), ("q", None), ("q", {"$": "dict", "v": []}), ("q", "")):
        add({"op": "letter_setitem", "recv": r, "args": [k, v]})
    add({"op": "letter_update", "recv": r, "args": [{"$": "dict", "v": [["a", "abcdefgh"], ["b", LST(*[1] * 8)]]}]})
    add({"op": "letter_update", "recv": r, "args": [{"$": "dict", "v": [["a", "abcdefgh"], ["b", LST(1)]]}]})

# Store each named record once; cases refer to it by name.
def shrink(x):
    if isinstance(x, dict):
        for name, rec in R.items():
            if x == rec: return {"$": "recref", "name": name}
        return {k: shrink(v) for k, v in x.items()}
    if isinstance(x, list): return [shrink(i) for i in x]
    return x
for c in cases:
    for key in ("recv", "args"): 
        if key in c: c[key] = shrink(c[key])
json.dump({"biopython": Bio.__version__, "records": R, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(f"{len(cases)} cases, {sum('exc' in c for c in cases)} raise, {sum(bool(c['warnings']) for c in cases)} warn -> {os.path.relpath(OUT)} ({os.path.getsize(OUT)/1e6:.1f} MB)")
