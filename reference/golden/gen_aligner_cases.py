"""Golden cases for Bio.Align.PairwiseAligner -> packages/align/test/golden/aligner.json

Case kinds:
  settings  construct an aligner, apply property operations, record each result, str() and the algorithm
  score     configure an aligner and score two sequences (or fail with the same error)
  align     configure an aligner and align two sequences: score, number of alignments, the first alignments, indexing
Values are JSON: numbers, strings, null, {"fn": ...} (a gap function), {"matrix": NAME}.
"""
import json, os, random, warnings
import Bio
from Bio import Align
from Bio.Align import substitution_matrices as SM
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "aligner.json")
rnd = random.Random(5)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e): return None if type(e).__name__ == "AttributeError" else (str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e))

FUNCS = {
    "affine": lambda a, b: (lambda i, j: a + b * (j - 1)),
    "pos": lambda a, b: (lambda i, j: a - b * j - 0.01 * i),
    "const": lambda a, b: (lambda i, j: a),
    "bad": lambda a, b: (lambda i, j: "x"),
    "int": lambda a, b: (lambda i, j: -int(j)),
}
def mkfn(spec): return FUNCS[spec["fn"]](spec.get("a", -1.0), spec.get("b", -0.5))
def val(v):
    if isinstance(v, dict) and "fn" in v: return mkfn(v)
    if isinstance(v, dict) and "matrix" in v: return SM.load(v["matrix"])
    return v

def enc(x):
    if isinstance(x, Align.substitution_matrices.Array): return {"$": "matrix", "alphabet": x.alphabet if isinstance(x.alphabet, str) else list(x.alphabet)}
    if callable(x): return {"$": "function"}
    return x

def build(case):
    a = Align.PairwiseAligner(scoring=case.get("scoring"))
    for name, v in case.get("props", []): setattr(a, name, val(v))
    return a

def seq_in(s):
    if isinstance(s, dict):
        k = s["t"]
        if k == "seq": return Seq(s["v"])
        if k == "record": return SeqRecord(Seq(s["v"]))
        if k == "bytes": return s["v"].encode("latin-1")
        if k == "list": return list(s["v"])
        if k == "tuple": return tuple(s["v"])
        if k == "int": return s["v"]
    return s

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            a = build(case)
            if case["kind"] == "settings":
                res = []
                out["ops_out"] = res
                for op in case["ops"]:
                    try:
                        if op[0] == "get": res.append({"result": enc(getattr(a, op[1]))})
                        elif op[0] == "set": setattr(a, op[1], val(op[2])); res.append({"result": None})
                        elif op[0] == "str": res.append({"result": (lambda t: None if "function" in t or "Array object" in t else t)(str(a))})
                    except Exception as e: res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
                out["algorithm"] = a.algorithm
            elif case["kind"] == "align":
                out["algorithm"] = a.algorithm
                al = a.align(seq_in(case["a"]), seq_in(case["b"]), case.get("strand", "+"))
                out["score"] = al.score
                try: out["len"] = len(al)
                except Exception as e: out["len_exc"] = {"type": tname(e), "msg": emsg(e)}
                first = []
                out["first"] = first
                for k, x in enumerate(al):
                    if k >= 300: break
                    first.append({"coordinates": x.coordinates.tolist(), "score": x.score})
                idx = []
                out["idx"] = idx
                for k in case["indices"]:
                    try: idx.append({"result": al[k].coordinates.tolist()})
                    except Exception as e: idx.append({"exc": {"type": tname(e), "msg": emsg(e)}})
            elif case["kind"] == "score":
                out["score"] = a.score(seq_in(case["a"]), seq_in(case["b"]), case.get("strand", "+")) if "strand" in case else a.score(seq_in(case["a"]), seq_in(case["b"]))
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out

def quiet_crashes():
    """In a forked child: turn fatal signals (a segfault inside Biopython's C code) into a plain exit, so that the
    operating system raises no "Python quit unexpectedly" crash report. The parent sees the non-zero status."""
    import ctypes
    libc = ctypes.CDLL(None)
    libc.signal.restype = ctypes.c_void_p
    libc.signal.argtypes = [ctypes.c_int, ctypes.c_void_p]
    exit_ptr = ctypes.cast(libc._exit, ctypes.c_void_p).value
    for sig in (4, 5, 6, 10, 11): libc.signal(sig, exit_ptr)      # SIGILL, SIGTRAP, SIGABRT, SIGBUS, SIGSEGV

def run_isolated(case):
    """Run a case in a forked child: Biopython's FOGSAA can crash the interpreter (a segmentation fault in its C code)
    on some inputs, and one such case must not lose the rest. Returns None if the child died."""
    r, w = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        quiet_crashes()
        try:
            os.write(w, json.dumps(run(case)).encode())
        finally:
            os._exit(0)
    os.close(w)
    chunks = []
    while True:
        b = os.read(r, 1 << 20)
        if not b: break
        chunks.append(b)
    os.close(r)
    _, status = os.waitpid(pid, 0)
    if status != 0 or not chunks: return None
    return json.loads(b"".join(chunks))

crashed = []
def add(c):
    res = run_isolated(c)
    if res is None:
        crashed.append(c)
        return
    c.update(res); cases.append(c)

DNA, PROT = "ACGT", "ACDEFGHIKLMNPQRSTVWY"
def rs(alpha, lo=1, hi=12): return "".join(rnd.choice(alpha) for _ in range(rnd.randint(lo, hi)))

GAP_PROPS = ["gap_score", "open_gap_score", "extend_gap_score", "internal_gap_score", "open_internal_gap_score", "extend_internal_gap_score", "end_gap_score", "open_end_gap_score", "extend_end_gap_score",
             "left_gap_score", "open_left_gap_score", "extend_left_gap_score", "right_gap_score", "open_right_gap_score", "extend_right_gap_score",
             "insertion_score", "open_insertion_score", "extend_insertion_score", "deletion_score", "open_deletion_score", "extend_deletion_score",
             "end_insertion_score", "open_end_insertion_score", "extend_end_insertion_score", "end_deletion_score", "open_end_deletion_score", "extend_end_deletion_score",
             "internal_insertion_score", "open_internal_insertion_score", "extend_internal_insertion_score", "left_insertion_score", "open_left_insertion_score", "extend_left_insertion_score",
             "right_insertion_score", "open_right_insertion_score", "extend_right_insertion_score", "internal_deletion_score", "open_internal_deletion_score", "extend_internal_deletion_score",
             "left_deletion_score", "open_left_deletion_score", "extend_left_deletion_score", "right_deletion_score", "open_right_deletion_score", "extend_right_deletion_score"]
OLD = ["target_gap_score", "query_gap_score", "target_open_gap_score", "query_end_gap_score", "target_internal_open_gap_score", "query_left_extend_gap_score", "internal_open_gap_score", "left_extend_gap_score", "end_open_gap_score", "target_gap_function", "query_gap_function"]
MATS = [{"matrix": m} for m in ("BLOSUM62", "NUC.4.4", "PAM250", "BLASTN", "BLASTP", "BLOSUM45", "MEGABLAST")]
def rand_num(): return rnd.choice([0, -1, -2, -0.5, -3.5, 1, 2, -10, 0.25, -1.5, 3])
def rand_val(name):
    r = rnd.random()
    if "function" in name: return {"fn": rnd.choice(["affine", "pos", "const"]), "a": rand_num(), "b": rand_num()}
    if name in ("gap_score", "insertion_score", "deletion_score", "target_gap_score", "query_gap_score") and r < .15: return {"fn": rnd.choice(["affine", "pos", "const", "int"]), "a": rand_num(), "b": rand_num()}
    if r < .04: return rnd.choice(["x", None, [1], {"fn": "const"}, True])
    return rand_num()

def rand_config():
    props = []
    if rnd.random() < .85: props.append(["mode", rnd.choice(["global", "global", "local"])])
    r = rnd.random()
    if r < .35: props.append(["substitution_matrix", rnd.choice(MATS)])
    elif r < .9: props += [["match_score", rnd.choice([1, 2, 5, 1.5])], ["mismatch_score", rnd.choice([0, -1, -2, -0.5, 1])]]
    if rnd.random() < .15: props.append(["wildcard", rnd.choice(["N", "X", "A", None])])
    for _ in range(rnd.choice([0, 1, 1, 2, 2, 3, 4])):
        name = rnd.choice(GAP_PROPS if rnd.random() < .9 else OLD)
        props.append([name, rand_val(name)])
    return {"scoring": rnd.choice([None] * 8 + ["blastn", "megablast", "blastp"]), "props": props}

def rand_seqs(cfg):
    uses_matrix = any(p[0] == "substitution_matrix" for p in cfg["props"]) or cfg["scoring"]
    alpha = rnd.choice([DNA, PROT]) if not uses_matrix else rnd.choice([DNA, DNA, PROT, "ACGTN", "ACGU"])
    kinds = ["str"] * 10 + ["seq", "record", "bytes", "list"]
    def one():
        s = rs(alpha)
        k = rnd.choice(kinds)
        return s if k == "str" else {"t": k, "v": s if k != "list" else list(s)}
    return one(), one()

# settings: operation sequences
for _ in range(500):
    cfg = rand_config()
    ops = []
    for _ in range(rnd.randint(3, 10)):
        r = rnd.random()
        if r < .45: ops.append(["get", rnd.choice(GAP_PROPS + ["mode", "match_score", "mismatch_score", "match", "mismatch", "substitution_matrix", "epsilon", "wildcard", "algorithm"] + (OLD if rnd.random() < .2 else []))])
        elif r < .85:
            name = rnd.choice(GAP_PROPS + ["match_score", "mismatch_score", "epsilon", "mode", "wildcard", "substitution_matrix"])
            if name == "mode": v = rnd.choice(["global", "local", "fogsaa", "x", None, 1])
            elif name == "wildcard": v = rnd.choice(["N", "", "NN", None, 5, "é"])
            elif name == "substitution_matrix": v = rnd.choice(MATS + [None, "x", 5])
            else: v = rand_val(name)
            ops.append(["set", name, v])
        else: ops.append(["str"])
    add({"kind": "settings", "scoring": cfg["scoring"], "props": cfg["props"], "ops": ops})
for sc in ("blastn", "megablast", "blastp", "other", ""): add({"kind": "settings", "scoring": sc, "props": [], "ops": [["get", "gap_score"], ["get", "match_score"], ["get", "open_gap_score"], ["get", "substitution_matrix"], ["str"]]})
add({"kind": "settings", "scoring": None, "props": [["bogus", 1]], "ops": []})
add({"kind": "settings", "scoring": None, "props": [["alphabet", "ACGT"]], "ops": [["get", "alphabet"]]})

# score: random configurations and sequences
for _ in range(2500):
    cfg = rand_config(); a, b = rand_seqs(cfg)
    c = {"kind": "score", "scoring": cfg["scoring"], "props": cfg["props"], "a": a, "b": b}
    if rnd.random() < .25: c["strand"] = rnd.choice(["-", "-", "+", "x"])
    add(c)
# focused linear/affine/function grids so every algorithm and strand is exercised with valid input
for mode in ("global", "local"):
    for strand in ("+", "-"):
        for gaps in ([["gap_score", -1]], [["gap_score", -2.5], ["mismatch_score", -1]], [["open_gap_score", -3], ["extend_gap_score", -0.5]], [["open_gap_score", -3], ["extend_gap_score", -0.5], ["end_gap_score", 0]],
                     [["open_left_gap_score", -1], ["extend_left_gap_score", -2], ["open_right_gap_score", -3], ["extend_right_gap_score", -0.25]],
                     [["insertion_score", {"fn": "affine", "a": -2, "b": -0.5}], ["deletion_score", {"fn": "pos", "a": -1, "b": 0.2}]], [["gap_score", {"fn": "affine", "a": -1.5, "b": -0.25}]],
                     [["open_insertion_score", -1], ["extend_insertion_score", -3], ["open_deletion_score", -0.5], ["extend_deletion_score", -0.1]], [["end_insertion_score", 0], ["internal_deletion_score", -2]]):
            for _ in range(8):
                alpha = rnd.choice([DNA, PROT])
                add({"kind": "score", "scoring": None, "props": [["mode", mode], ["match_score", 2], ["mismatch_score", -1]] + gaps, "a": rs(alpha, 1, 14), "b": rs(alpha, 1, 14), "strand": strand})
                add({"kind": "score", "scoring": None, "props": [["mode", mode], ["substitution_matrix", {"matrix": "BLOSUM62"}]] + gaps, "a": rs(PROT, 1, 14), "b": rs(PROT, 1, 14), "strand": strand})

# align: small sequences so the enumeration stays tractable
IDX = [0, 1, -1, 2, 7, -3, 50, 10**6, -10**6, 0]
def rand_align_config():
    props = []
    props.append(["mode", rnd.choice(["global", "global", "local"])])
    r = rnd.random()
    if r < .3: props.append(["substitution_matrix", rnd.choice(MATS[:5])])
    else: props += [["match_score", rnd.choice([1, 2, 5, 1.5])], ["mismatch_score", rnd.choice([0, -1, -2, -0.5, 1])]]
    if rnd.random() < .15: props.append(["wildcard", rnd.choice(["N", "X", "A"])])
    kind = rnd.random()
    if kind < .5: props.append(["gap_score", rnd.choice([-1, -2, -0.5, 0, -3])])
    elif kind < .7: props += [["gap_score", rnd.choice([-1, -2])], [rnd.choice(["end_gap_score", "left_gap_score", "right_gap_score", "end_insertion_score", "left_deletion_score", "right_insertion_score"]), rnd.choice([0, -0.5, -3])]]
    elif kind < .85: props += [["open_gap_score", rnd.choice([-3, -2, -1])], [rnd.choice(["extend_gap_score", "extend_end_gap_score"]), rnd.choice([-0.5, -1, 0])]]
    elif kind < .93: props += [["insertion_score", rnd.choice([-1, -2])], ["deletion_score", rnd.choice([-1, -3])]]
    elif kind < .97: props.append(["gap_score", {"fn": rnd.choice(["affine", "pos", "const", "int"]), "a": rnd.choice([-1, -2, -0.5]), "b": rnd.choice([-0.5, -1, 0, 0.25])}])
    else: props += [["insertion_score", {"fn": rnd.choice(["affine", "pos"]), "a": rnd.choice([-1, -2]), "b": rnd.choice([-0.5, -1])}], ["deletion_score", rnd.choice([-1, -3])]]
    return {"scoring": None, "props": props}
for _ in range(2200):
    cfg = rand_align_config(); uses = any(p[0] == "substitution_matrix" for p in cfg["props"])
    alpha = rnd.choice([DNA, "AC", "ACG", "ACGTN"]) if not uses else rnd.choice([PROT, "ACGT"])
    k = rnd.choice(["str"] * 10 + ["seq", "record"])
    mk = lambda t: t if k == "str" else {"t": k, "v": t}
    add({"kind": "align", "scoring": None, "props": cfg["props"], "a": mk(rs(alpha, 1, 9)), "b": mk(rs(alpha, 1, 9)), "strand": rnd.choice(["+", "+", "-"]), "indices": IDX})
# Waterman-Smith-Beyer: gap functions with ties, both modes and strands
for _ in range(700):
    fn1 = {"fn": rnd.choice(["affine", "pos", "const", "int"]), "a": rnd.choice([-1, -2, -0.5, -3, 0]), "b": rnd.choice([-0.5, -1, 0, 0.25, -2])}
    props = [["mode", rnd.choice(["global", "local"])], ["match_score", rnd.choice([1, 2, 3])], ["mismatch_score", rnd.choice([0, -1, -2])]]
    r = rnd.random()
    props.append(["gap_score", fn1] if r < .5 else ["insertion_score", fn1] if r < .75 else ["deletion_score", fn1])
    if r >= .5: props.append(["deletion_score" if r < .75 else "insertion_score", rnd.choice([-1, -2, {"fn": "const", "a": -1.5}])])
    if rnd.random() < .2: props.append(["epsilon", rnd.choice([1e-6, 0.01, 0.5])])
    alpha = rnd.choice(["AC", "ACG", DNA])
    add({"kind": "align", "scoring": None, "props": props, "a": rs(alpha, 1, 8), "b": rs(alpha, 1, 8), "strand": rnd.choice(["+", "-"]), "indices": IDX})
# FOGSAA: one optimal alignment found by best-first search (with the warnings for scores it cannot handle)
def rand_fogsaa_props():
    props = [["mode", "fogsaa"]]
    r = rnd.random()
    if r < .25: props.append(["substitution_matrix", rnd.choice(MATS[:5])])
    else: props += [["match_score", rnd.choice([1, 2, 3, 5, 0, -1])], ["mismatch_score", rnd.choice([0, -1, -2, 1, -0.5, -3])]]
    if rnd.random() < .15: props.append(["wildcard", rnd.choice(["N", "A"])])
    k = rnd.random()
    if k < .35: props.append(["gap_score", rnd.choice([-1, -2, -0.5, -3, 0, -5])])
    elif k < .6: props += [["open_gap_score", rnd.choice([-3, -2, -1, -5])], ["extend_gap_score", rnd.choice([-0.5, -1, 0, -2])]]
    elif k < .8: props += [["gap_score", rnd.choice([-1, -2, -3])], [rnd.choice(["end_gap_score", "left_gap_score", "right_gap_score", "end_insertion_score", "left_deletion_score", "right_insertion_score", "open_end_gap_score", "extend_end_gap_score"]), rnd.choice([0, -0.5, -4, -1])]]
    elif k < .9: props += [["insertion_score", rnd.choice([-1, -2])], ["deletion_score", rnd.choice([-1, -3])]]
    else: props += [["internal_insertion_score", rnd.choice([-1, -2, -3])], ["left_deletion_score", rnd.choice([-1, -4])], ["right_insertion_score", rnd.choice([-1, 0])]]
    if rnd.random() < .1: props.append(["epsilon", rnd.choice([1e-6, 0.01, 0.5])])
    return props
for _ in range(1500):
    props = rand_fogsaa_props(); uses = any(p[0] == "substitution_matrix" for p in props)
    alpha = rnd.choice([DNA, "AC", "ACG", "ACGTN"]) if not uses else rnd.choice([PROT, "ACGT"])
    k = rnd.choice(["str"] * 10 + ["seq", "record"])
    mk = lambda t: t if k == "str" else {"t": k, "v": t}
    add({"kind": "align", "scoring": None, "props": props, "a": mk(rs(alpha, 1, 12)), "b": mk(rs(alpha, 1, 12)), "strand": rnd.choice(["+", "+", "-"]), "indices": IDX})
    add({"kind": "score", "scoring": None, "props": props, "a": mk(rs(alpha, 1, 12)), "b": mk(rs(alpha, 1, 12)), "strand": rnd.choice(["+", "-"])})
for a, b in [("A", "A"), ("A", "C"), ("AC", "A"), ("A", "ACGT"), ("TACCG", "ACG"), ("KEVLA", "EVL"), ("ACGT", "ACGT"), ("AAAA", "AA"), ("ACGTACGT", "ACGT"), ("GATTACA", "GCATGCU")]:
    for props in ([["mode", "fogsaa"]], [["mode", "fogsaa"], ["match_score", 2], ["mismatch_score", -1], ["gap_score", -2]], [["mode", "fogsaa"], ["substitution_matrix", {"matrix": "BLOSUM62"}]], [["mode", "fogsaa"], ["match_score", 1], ["mismatch_score", 1]]):
        for strand in ("+", "-"):
            add({"kind": "align", "scoring": None, "props": props, "a": a, "b": b, "strand": strand, "indices": IDX})
            add({"kind": "score", "scoring": None, "props": props, "a": a, "b": b, "strand": strand})
for a, b in [("A", "A"), ("A", "C"), ("AC", "A"), ("TACCG", "ACG"), ("KEVLA", "EVL"), ("ACGT", "ACGT"), ("AAAA", "AA"), ("ACGTACGT", "ACGT"), ("", "A"), ("A", "")]:
    for props in ([], [["mode", "local"]], [["mode", "global"], ["match_score", 2], ["mismatch_score", -1]], [["mode", "local"], ["match_score", 2], ["mismatch_score", -1], ["gap_score", -1]], [["substitution_matrix", {"matrix": "BLOSUM62"}]], [["gap_score", 0]]):
        for strand in ("+", "-"): add({"kind": "align", "scoring": None, "props": props, "a": a, "b": b, "strand": strand, "indices": IDX})
# edge sequences
for a, b in [("A", "A"), ("A", "C"), ("AC", "A"), ("A", "ACGT"), ("", "A"), ("A", ""), ("", ""), ("ACGT", "ACGT"), ("TACCG", "ACG"), ("KEVLA", "EVL"), ("é", "é"), ("日本", "日本語"), ("😀A", "A😀")]:
    for props in ([], [["mode", "local"]], [["substitution_matrix", {"matrix": "BLOSUM62"}]], [["mode", "local"], ["open_gap_score", -2], ["extend_gap_score", -1]], [["gap_score", {"fn": "affine"}]]):
        add({"kind": "score", "scoring": None, "props": props, "a": a, "b": b})
for a, b in [({"t": "int", "v": 5}, "A"), ({"t": "tuple", "v": ["A", "C"]}, {"t": "tuple", "v": ["A", "C"]}), ({"t": "list", "v": [1, 2, 3]}, {"t": "list", "v": [1, 2]}), ("ACG", {"t": "int", "v": 5})]:
    add({"kind": "score", "scoring": None, "props": [], "a": a, "b": b})
json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(len(crashed), "cases dropped because Biopython crashed;", len(cases), "cases,", sum("exc" in c for c in cases), "raise ->", os.path.relpath(OUT))
