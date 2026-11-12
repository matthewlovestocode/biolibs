"""Generate golden cases for Bio.Seq by running them through real Biopython.

Usage:  reference/.venv/bin/python reference/golden/gen_seq_cases.py
Output: packages/seq/test/golden/seq.json
Deterministic (seeded). Each case: {op, recv?, func?, ctor?, args} plus Biopython's recorded outcome.
"""
import json, os, random, sys, itertools, warnings
sys.path.insert(0, os.path.dirname(__file__))
import Bio
import Bio.Seq as BioSeq
from Bio.Seq import Seq, MutableSeq
from Bio.Data import CodonTable
from codec import enc, dec, S, M, U, P, B, SL, LST, TUP

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seq", "test", "golden", "seq.json")
rnd = random.Random(20260511)

# ---------------------------------------------------------------- execution
def tname(e):
    if isinstance(e, UnicodeError): return "ValueError"
    return type(e).__name__

def emsg(e):
    if isinstance(e, UnicodeError): return None
    if isinstance(e, KeyError): return str(e.args[0]) if e.args else ""
    return str(e)

def apply_data(name, d, args):
    """Call a method of the sequence-data provider (`seq._data`) directly."""
    args = [a._data if isinstance(a, Seq) else a for a in args]
    if name == "__len__": return len(d)
    if name == "__getitem__": return d[args[0]]
    if name == "__bytes__": return bytes(d)
    if name == "__hash__": hash(d); return "hash-ok"
    if name == "__eq__": return d == args[0]
    if name == "__lt__": return d < args[0]
    if name == "__le__": return d <= args[0]
    if name == "__gt__": return d > args[0]
    if name == "__ge__": return d >= args[0]
    if name == "__add__": return d + args[0]
    if name == "__radd__": return args[0] + d
    if name == "__mul__": return d * args[0]
    if name == "__contains__": return args[0] in d
    if name in ("defined", "defined_ranges"): return getattr(d, name)
    return getattr(d, name)(*args)

def apply(case, recv, args):
    op = case.get("op")
    if op and op.startswith("data:"): return apply_data(op[5:], recv._data, args)
    if "func" in case: return getattr(BioSeq, case["func"])(*args)
    if "ctor" in case: return getattr(BioSeq, case["ctor"])(*args)
    if op == "__len__": return len(recv)
    if op == "__getitem__": return recv[args[0]]
    if op == "__add__": return recv + args[0]
    if op == "__radd__": return args[0] + recv
    if op == "__mul__": return recv * args[0]
    if op == "__rmul__": return args[0] * recv
    if op == "__imul__":
        r = recv; r *= args[0]; return r
    if op == "__eq__": return recv == args[0]
    if op == "__lt__": return recv < args[0]
    if op == "__le__": return recv <= args[0]
    if op == "__gt__": return recv > args[0]
    if op == "__ge__": return recv >= args[0]
    if op == "__contains__": return args[0] in recv
    if op == "__str__": return str(recv)
    if op == "__bytes__": return bytes(recv)
    if op == "__repr__": return repr(recv)
    if op == "__hash__": hash(recv); return "hash-ok"
    if op == "__iter__": return list(recv)
    if op == "__setitem__": recv[args[0]] = args[1]; return None
    if op == "__delitem__": del recv[args[0]]; return None
    if op == "search": return list(recv.search(args[0]))
    if op in ("defined", "defined_ranges"): return getattr(recv, op)
    if op in ("split", "rsplit"): return getattr(recv, op)(*args)
    r = getattr(recv, op)(*args)
    return r

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
    if isinstance(recv, MutableSeq):
        out["after"] = enc(recv)
    return out

# ------------------------------------------------------------------- pools
STR = ["", "A", "ACGT", "acgt", "AcGt", "AAAA", "ACGTACGTACGT", "AUGGCC", "ACGTNRYKMSWBDHV",
       "ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG", "  AC GT\n", " ACGT ", "ATGAAATAG", "ATGAAATGA", "ATGAAACC",
       "GGGAAA", "TTTTTT", "ATG---AAA", "NNNNNN", "ACGTZ", "ATGTTAA", "AAATTTGGGCCC",
       "ACGT" * 25, "gattaca", "MKV*", "TTAATTAA"]
SPECIAL = [U(1), U(10), P(12, [(0, "ACGT"), (10, "TT")]), P(6, [(2, "AC")]), P(8, [(0, "ACG"), (5, "TTT")]),
           P(9, [(3, "GGGAAA")]), P(20, [(0, "AC"), (4, "GT"), (9, "AAAA"), (16, "TT")]), U(0), P(5, [(1, "A"), (3, "C")])]
def recvs(mutable_ok=True, special=False):
    out = [S(s) for s in STR]
    if mutable_ok: out += [M(s) for s in STR]
    if special: out += SPECIAL
    return out

SUBS = ["", "A", "AC", "AA", "T", "ACGT", "GG", "X", "TT", "acgt", "N", "CG", S("AC"), M("GT"), B("AC"), 5, None]
IDX = [None, 0, 1, 2, 3, -1, -2, 5, 100, -100, 12]
CHARS = [None, "A", "AT", "ACGT", " ", " \n", "N", S("A"), M("A"), B("A"), 5]
SEPS = [None, "A", "AC", "", "T", S("GG"), B("C"), " ", 5]
MAXS = [-1, 0, 1, 2, 5]
STEPS = [None, 1, 2, 3, -1, -2, -3, 0, 7]
GETIDX = [0, 1, 2, 3, 5, -1, -2, -5, 11, 40, 100, -100]
SLICES = [SL(a, b, c) for a in IDX for b in IDX for c in STEPS]
TAILS = ["A", "AC", "ACGT", "T", "", "GG", S("AC"), M("GT"), B("AC"), TUP("A", "T"), TUP("AC", S("GT")), TUP(), 5]
BOOL = [False, True]

cases = []
seen = set()
def add(c):
    k = json.dumps(c, sort_keys=True)
    if k in seen: return
    seen.add(k)
    c.update(run(c))
    cases.append(c)

def draw(op, argpools, n, recv_list, extra=None):
    """Randomly sample n (receiver, args) combinations for a method call."""
    for _ in range(n):
        args = [rnd.choice(p) for p in argpools]
        # randomly drop optional trailing args to exercise defaults
        keep = rnd.randint(extra if extra is not None else len(args), len(args)) if argpools else 0
        add({"op": op, "recv": rnd.choice(recv_list), "args": args[:keep]})

N = 160
R = recvs(True, False)
RS = recvs(True, True)

# --- searching ---------------------------------------------------------------
for op in ("count", "count_overlap", "find", "rfind", "index", "rindex"):
    draw(op, [SUBS, IDX, IDX], N, R, extra=1)
    draw(op, [SUBS, IDX, IDX], 40, SPECIAL, extra=1)
draw("search", [[LST("A", "CG"), LST("AC", "GT", "T"), LST(S("AC"), M("GG")), LST("A", 5), LST(), LST("ACGT", "CGT", "GT")]], 60, R)
draw("search", [[LST("A", "CG"), LST("AC", "GT")]], 20, SPECIAL)
draw("startswith", [TAILS, IDX, IDX], N, R, extra=1)
draw("endswith", [TAILS, IDX, IDX], N, R, extra=1)
for op in ("startswith", "endswith"): draw(op, [TAILS, IDX, IDX], 30, SPECIAL, extra=1)
draw("__contains__", [SUBS + [65, 300, -1]], N, R)
draw("__contains__", [SUBS], 20, SPECIAL)

# --- split / strip ------------------------------------------------------------------
for op in ("split", "rsplit"):
    draw(op, [SEPS, MAXS], N, R, extra=0)
    draw(op, [SEPS, MAXS], 20, SPECIAL, extra=0)
for op in ("strip", "lstrip", "rstrip"):
    draw(op, [CHARS, BOOL], N, R, extra=0)
    draw(op, [CHARS, BOOL], 20, SPECIAL, extra=0)
for op in ("removeprefix", "removesuffix"):
    draw(op, [SUBS[:-2] + [S("AC"), M("GT"), B("AC"), 5], BOOL], N, R, extra=1)
    draw(op, [SUBS[:-2], BOOL], 20, SPECIAL, extra=1)

# --- case / content transforms ----------------------------------------------------
for op in ("upper", "lower", "complement", "complement_rna", "reverse_complement", "reverse_complement_rna", "transcribe", "back_transcribe"):
    for r in R: 
        for inplace in (None, False, True):
            add({"op": op, "recv": r, "args": [] if inplace is None else [inplace]})
    for r in SPECIAL:
        for inplace in (None, True):
            add({"op": op, "recv": r, "args": [] if inplace is None else [inplace]})
for op in ("isupper", "islower", "defined", "defined_ranges", "__len__", "__str__", "__bytes__", "__repr__", "__hash__", "__iter__"):
    for r in RS: add({"op": op, "recv": r, "args": []})
draw("replace", [SUBS[:-2] + [S("AC"), M("T"), B("A"), 5], SUBS[:-2] + [S("GG"), B("N")], BOOL], N, R, extra=2)
draw("replace", [["A", "AC", "", "T"], ["C", "GG", "TT", ""], BOOL], 40, SPECIAL, extra=2)
draw("join", [["", "A", "ACGT", S("AC"), M("T"), LST("A", "C"), LST(S("A"), M("C"), "G"), LST("A", 5), LST(), 5, B("AC")]], 80, R)

# --- indexing --------------------------------------------------------------------------
for r in R: 
    for i in GETIDX: add({"op": "__getitem__", "recv": r, "args": [i]})
draw("__getitem__", [SLICES], 600, R)
for r in SPECIAL:
    for i in GETIDX: add({"op": "__getitem__", "recv": r, "args": [i]})
# exhaustive slices over the partially defined receivers (the hardest code path)
for r in SPECIAL[2:7] + SPECIAL[8:9]:
    n = (lambda d: d.get("length") or d.get("undef"))(r)
    rng = list(range(-n - 2, n + 3)) + [None]
    for a, b, c in itertools.product(rng[::2] + [None], rng[1::2] + [None], [None, 1, 2, 3, -1, -2, -3]):
        add({"op": "__getitem__", "recv": r, "args": [SL(a, b, c)]})

# --- arithmetic / comparison -------------------------------------------------------
OPERANDS = ["", "A", "ACGT", S("AC"), M("GT"), B("AC"), 5, None, "é", S("ACGT"), M("ACGT"), U(3), P(6, [(1, "AC")])]
for op in ("__add__", "__eq__", "__lt__", "__le__", "__gt__", "__ge__"):
    draw(op, [OPERANDS], 140, R)
    draw(op, [OPERANDS], 60, SPECIAL)
draw("__radd__", [OPERANDS], 60, R)
draw("__radd__", [["", "AC", U(3) if False else "A"]], 20, SPECIAL)
for op in ("__mul__", "__rmul__", "__imul__"):
    draw(op, [[0, 1, 2, 3, -1, 5, "a", 1.5, None]], 50, R)
    draw(op, [[0, 1, 2, 3, -1]], 25, SPECIAL)

# --- translation -----------------------------------------------------------------------
TABLE = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
         "Standard", "Vertebrate Mitochondrial", "SGC0", "Bacterial", "Ciliate Nuclear", "1", "11", " 2 ", 99, "99", "Bogus", "",
         None, 1.0, 2.7, {"$": "table", "id": 1, "kind": "ambiguous_generic"}, {"$": "table", "id": 2, "kind": "unambiguous_dna"},
         {"$": "table", "id": 11, "kind": "generic"}, {"$": "table", "id": 6, "kind": "unambiguous_rna"}]
STOPS = ["*", "#", "STOP", ""]
GAPS = [None, "-", "--", "?", 5, ""]
TR = [S(s) for s in STR] + [M(s) for s in STR]
draw("translate", [TABLE, STOPS, BOOL, BOOL, GAPS], 700, TR, extra=0)
draw("translate", [TABLE[:30], STOPS[:2], BOOL, BOOL], 40, SPECIAL, extra=0)
for r in TR: 
    add({"op": "translate", "recv": r, "args": []})
    add({"op": "translate", "recv": r, "args": [1, "*", True]})
    add({"op": "translate", "recv": r, "args": [1, "*", False, True]})
# every sense/stop codon individually in every table (unambiguous + all-ambiguous 3-mers sampled)
codons = [a + b + c for a in "TCAG" for b in "TCAG" for c in "TCAG"]
IUP = "GATCRYWSMKHBVDN"
amb = ["".join(x) for x in itertools.product(IUP, repeat=3)]
amb_s = rnd.sample(amb, 500)
for tid in sorted(CodonTable.generic_by_id):
    add({"op": "translate", "recv": S("".join(codons)), "args": [tid]})
    add({"op": "translate", "recv": S("".join(amb_s)), "args": [tid]})
    add({"op": "translate", "recv": S("".join(c.replace("T", "U") for c in codons)), "args": [tid]})
    add({"op": "translate", "recv": S("".join(codons)), "args": [tid, "*", True]})
    for st in CodonTable.generic_by_id[tid].start_codons[:2]:
        add({"op": "translate", "recv": S(st + "AAACCC" + CodonTable.generic_by_id[tid].stop_codons[0]), "args": [tid, "*", False, True]})
for ch in "GATCRYWSMKHBVDNUXZ-.":   # invalid / gap characters
    add({"op": "translate", "recv": S(ch * 3), "args": [1, "*", False, False, "-"]})
    add({"op": "translate", "recv": S(ch * 3), "args": []})

# --- module-level functions ------------------------------------------------------------------
FUNC_ARGS = ["", "ACGT", "acgtn", "AUGC", "ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG", "ACGTRYKM", "ACGTZ", S("ACGT"), M("ACGT"), S("AUGC"), M("auGc"), U(5), P(8, [(0, "ACG"), (5, "TTT")]), 5, None, B("ACGT")]
for f in ("transcribe", "back_transcribe", "complement", "complement_rna", "reverse_complement", "reverse_complement_rna"):
    for a in FUNC_ARGS:
        add({"func": f, "args": [a]})
        if f not in ("transcribe", "back_transcribe"):
            add({"func": f, "args": [a, True]})
            add({"func": f, "args": [a, False]})
draw_f = lambda f, pools, n: [add({"func": f, "args": [rnd.choice(p) for p in pools][:rnd.randint(1, len(pools))]}) for _ in range(n)]
draw_f("translate", [[s for s in STR] + [S(s) for s in STR[:12]] + [M(s) for s in STR[:6]], TABLE[:30], STOPS, BOOL, BOOL, GAPS], 500)

# --- constructors -------------------------------------------------------------------------------
CTOR = [("Seq", ["ACGT"]), ("Seq", [""]), ("Seq", [B("ACGT")]), ("Seq", [S("ACGT")]), ("Seq", [M("ACGT")]), ("Seq", [5]), ("Seq", ["é"]),
        ("Seq", [B("AC\xe9")]), ("Seq", [None]), ("Seq", [None, 0]), ("Seq", [None, 5]), ("Seq", [None, -1]), ("Seq", ["ACGT", 2]),
        ("Seq", [{"$": "dict", "v": [[0, "ACGT"]]}, 4]), ("Seq", [{"$": "dict", "v": [[0, "ACGT"]]}, 10]),
        ("Seq", [{"$": "dict", "v": [[2, "ACGT"]]}, 6]), ("Seq", [{"$": "dict", "v": [[0, "AC"], [2, "GT"]]}, 4]),
        ("Seq", [{"$": "dict", "v": [[0, "AC"], [2, "GT"], [5, "A"]]}, 8]), ("Seq", [{"$": "dict", "v": [[0, "ACG"], [2, "GT"]]}, 8]),
        ("Seq", [{"$": "dict", "v": [[0, "ACGT"]]}, 3]), ("Seq", [{"$": "dict", "v": []}, 5]), ("Seq", [{"$": "dict", "v": [[0, "A"]]}]),
        ("Seq", [{"$": "dict", "v": [[3, B("TT")], [0, "AA"]]}, 9]),
        ("Seq", [{"$": "dict", "v": [[0, "ACGT"]]}, 0]), ("Seq", [{"$": "dict", "v": [[0, "ACGT"]]}, -3]),
        ("MutableSeq", ["ACGT"]), ("MutableSeq", [B("ACGT")]), ("MutableSeq", [S("ACGT")]), ("MutableSeq", [M("ACGT")]), ("MutableSeq", [5]),
        ("MutableSeq", [None]), ("MutableSeq", ["é"]), ("MutableSeq", [""]), ("MutableSeq", [U(4)])]
for cls, a in CTOR: add({"ctor": cls, "args": a})

# --- MutableSeq mutation ------------------------------------------------------------------------------
MR = [M(s) for s in STR]
for r in MR:
    for i in [0, 1, 2, -1, -2, 5, 100, -100, 30]:
        for v in ["T", "ä", "TT", "", S("T"), 5]:
            if rnd.random() < 0.25: add({"op": "__setitem__", "recv": r, "args": [i, v]})
        if rnd.random() < 0.5: add({"op": "__delitem__", "recv": r, "args": [i]})
        for c in ["T", "", "TT", "é", 5]:
            if rnd.random() < 0.15:
                add({"op": "append", "recv": r, "args": [c]}); add({"op": "insert", "recv": r, "args": [i, c]})
        if rnd.random() < 0.5: add({"op": "pop", "recv": r, "args": [i]})
    add({"op": "pop", "recv": r, "args": []})
    add({"op": "reverse", "recv": r, "args": []})
    for it in ["A", "T", "N", "", "AC", "é", 5, "€"]:
        if rnd.random() < 0.4: add({"op": "remove", "recv": r, "args": [it]})
    for o in ["", "TT", S("GG"), M("CC"), 5, B("A")]:
        add({"op": "extend", "recv": r, "args": [o]})
    for sl in rnd.sample(SLICES, 60):
        for v in ["", "T", "TTT", S("GG"), M("C"), 5]:
            if rnd.random() < 0.1: add({"op": "__setitem__", "recv": r, "args": [sl, v]})
        if rnd.random() < 0.3: add({"op": "__delitem__", "recv": r, "args": [sl]})

# --- SequenceDataAbstractBaseClass / bytes, called directly on seq._data ----------------------------
DR = [S(x) for x in ["", "ACGT", "acgt", "AcGt", "AAAA", "ACGTACGTACGT", "  AC GT\n", "ATGGCC", "\u00e9AC"]] + SPECIAL
BS = [B(x) for x in ["", "A", "AC", "T", "ACGT", "N", " ", "GG", "acgt"]]
TABLE_FWD = B("".join(chr(i) for i in range(65)) + "T" + "".join(chr(i) for i in range(66, 67)) + "G" + "".join(chr(i) for i in range(68, 256)))
DEL = [B(""), B("A"), B("GT")]
for name in ("count", "find", "rfind", "index", "rindex", "startswith", "endswith"):
    draw("data:" + name, [BS, IDX, IDX], 60, DR, extra=1)
for name in ("split", "rsplit"):
    draw("data:" + name, [[None] + BS, MAXS], 50, DR, extra=0)
for name in ("strip", "lstrip", "rstrip"):
    draw("data:" + name, [[None] + BS], 40, DR, extra=0)
for name in ("removeprefix", "removesuffix"):
    draw("data:" + name, [BS], 40, DR)
draw("data:replace", [BS, BS], 80, DR)
draw("data:translate", [[TABLE_FWD], DEL], 40, DR, extra=1)
draw("data:decode", [["ascii", "utf-8"]], 30, DR, extra=0)
for name in ("upper", "lower", "isupper", "islower", "__len__", "__bytes__", "__hash__"):
    for r in DR: add({"op": "data:" + name, "recv": r, "args": []})
for name in ("defined", "defined_ranges"):          # only provider objects have these (not raw bytes)
    for r in SPECIAL:
        if r != U(0): add({"op": "data:" + name, "recv": r, "args": []})   # U(0) is plain empty bytes
for name in ("__eq__", "__lt__", "__le__", "__gt__", "__ge__", "__add__", "__radd__", "__contains__"):
    draw("data:" + name, [BS + [S("AC"), U(3), P(6, [(1, "AC")])] if name in ("__add__", "__radd__") else BS], 50, DR)
draw("data:__mul__", [[0, 1, 2, 3, -1]], 40, DR)
for r in DR:
    for i in GETIDX: add({"op": "data:__getitem__", "recv": r, "args": [i]})
draw("data:__getitem__", [SLICES], 300, DR)

# --- coverage-gap cases: split/rsplit leftovers, non-ASCII bytes, dict/list operands, Seq-valued segments -----------
for r in [S(x) for x in ["  AC GT\n", " A  B  C ", "A B C D", "  ", "ACGT", "\tA\nB C ", "A,B,,C", "AxxBxxC"]] + [M("  AC GT\n"), M(" A  B  C ")]:
    for mx in [-1, 0, 1, 2, 3, 4]:
        for sep in [None, " ", "x", "xx", ",", S("x")]:
            add({"op": "split", "recv": r, "args": [sep, mx]}); add({"op": "rsplit", "recv": r, "args": [sep, mx]})
for r in [S("AC\u00e9"), S("\u00e9"), M("AC\u00e9"), S("AC\u00ffGT")]:        # latin-1 bytes are not valid ASCII text
    for op in ("__str__", "__repr__", "__iter__", "translate", "upper", "lower", "complement", "reverse_complement", "split", "__eq__", "count"):
        add({"op": op, "recv": r, "args": [S("A")] if op in ("__eq__", "count") else []})
    add({"op": "__getitem__", "recv": r, "args": [1]}); add({"op": "__getitem__", "recv": r, "args": [SL(0, 2, None)]})
for r in R[:6]:
    for o in [{"$": "dict", "v": []}, LST(), LST(1, 2), {"$": "dict", "v": [[1, 2]]}]:
        for op in ("__add__", "__radd__", "__eq__", "__lt__", "__contains__"):
            add({"op": op, "recv": r, "args": [o]})
for sd in ([[0, S("AC")], [4, M("GT")]], [[0, S("ACGT")]], [[1, None]], [[0, "A"], [2, LST()]], [[0, B("AC")], [2, "GG"], [4, S("T")]]):
    add({"ctor": "Seq", "args": [{"$": "dict", "v": sd}, 6]})

json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
n_exc = sum("exc" in c for c in cases); n_w = sum(bool(c["warnings"]) for c in cases)
print(f"{len(cases)} cases, {n_exc} raise, {n_w} warn -> {os.path.relpath(OUT)}  ({os.path.getsize(OUT)/1e6:.1f} MB)")
