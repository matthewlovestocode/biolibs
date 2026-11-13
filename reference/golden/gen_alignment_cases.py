"""Golden cases for Bio.Align.Alignment -> packages/align/test/golden/alignment.json

Each case builds an Alignment from sequences and coordinates, then applies operations (str, format, length, shape,
aligned, indices, inverse_indices, target, query, comparisons, sort) and records each result or exception.
"""
import json, os, random, warnings
import numpy as np
import Bio
from Bio import Align
from Bio.Align import Alignment, PairwiseAligner, substitution_matrices as SM
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "alignment.json")
rnd = random.Random(11)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else ("ValueError" if isinstance(e, UnicodeError) else type(e).__name__)
def emsg(e): return None if type(e).__name__ == "AttributeError" or isinstance(e, UnicodeError) else (str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e))

def seq_in(s):
    if isinstance(s, dict):
        k = s["t"]
        if k == "seq": return Seq(s["v"])
        if k == "record":
            r = SeqRecord(Seq(s["v"]), id=s.get("id", "<unknown id>"))
            if "weight" in s: r.annotations["weight"] = s["weight"]
            return r
        if k == "bytes": return s["v"].encode("latin-1")
        if k == "list": return list(s["v"])
    return s

def enc(x):
    if isinstance(x, Alignment):
        d = {"aln": {"sequences": enc(list(x.sequences)), "coordinates": x.coordinates.tolist()}}
        if hasattr(x, "score"): d["aln"]["score"] = x.score
        if hasattr(x, "column_annotations"): d["aln"]["colann"] = {k: (v if isinstance(v, str) else list(v)) for k, v in x.column_annotations.items()}
        return d
    if x is None: return {"none": True}
    if isinstance(x, np.ndarray): return x.tolist()
    if isinstance(x, (np.integer,)): return int(x)
    if isinstance(x, (np.bool_,)): return bool(x)
    if isinstance(x, str): return {"s": x}
    if isinstance(x, Seq): return {"Seq": str(x)}
    if isinstance(x, SeqRecord): return {"rec": x.id, "seq": str(x.seq)}
    if isinstance(x, bytes): return {"b": x.decode("latin-1")}
    if isinstance(x, (list, tuple)): return [enc(i) for i in x]
    return x

def key_fn(name):
    return {"len": lambda s: len(s), "neg": lambda s: -len(s), "str": lambda s: str(s.seq) if isinstance(s, SeqRecord) else str(s), "id": lambda s: s.id}[name]

FUNCS = {"affine": lambda a, b: (lambda i, j: a + b * (j - 1)), "pos": lambda a, b: (lambda i, j: a - b * j - 0.01 * i), "const": lambda a, b: (lambda i, j: a)}
def scoring_py(sp):
    if sp is None: return None
    if "wildcard" in sp: return sp["wildcard"]
    if "matrix" in sp: return SM.load(sp["matrix"])
    if "int" in sp: return sp["int"]
    if "aligner" in sp:
        al = PairwiseAligner()
        for name, v in sp["aligner"]:
            if isinstance(v, dict) and "fn" in v: v = FUNCS[v["fn"]](v.get("a", -1.0), v.get("b", -0.5))
            elif isinstance(v, dict) and "matrix" in v: v = SM.load(v["matrix"])
            setattr(al, name, v)
        return al
    raise ValueError(sp)
COUNT_NAMES = ["score", "aligned", "substitution_score", "identities", "mismatches", "positives", "gap_score", "gaps", "open_gaps", "extend_gaps", "open_left_gaps", "open_right_gaps", "open_internal_gaps", "extend_left_gaps", "extend_right_gaps", "extend_internal_gaps", "open_left_insertions", "open_left_deletions", "open_right_insertions", "open_right_deletions", "open_internal_insertions", "open_internal_deletions", "extend_left_insertions", "extend_left_deletions", "extend_right_insertions", "extend_right_deletions", "extend_internal_insertions", "extend_internal_deletions", "left_insertions", "left_deletions", "right_insertions", "right_deletions", "internal_insertions", "internal_deletions", "insertions", "open_insertions", "extend_insertions", "deletions", "open_deletions", "extend_deletions", "left_gaps", "right_gaps", "internal_gaps"]
def key_py(k):
    if isinstance(k, dict):
        if "slice" in k: return slice(*k["slice"])
        if "list" in k: return list(k["list"])
        if "tuple" in k: return tuple(key_py(i) for i in k["tuple"])
        if "str" in k: return k["str"]
        if "float" in k: return float(k["float"])
        if "none" in k: return None
    return k

def build(case):
    seqs = [seq_in(s) for s in case["sequences"]]
    coords = None if case["coordinates"] is None else np.array(case["coordinates"], dtype=np.intp)
    a = Alignment(seqs, coords)
    if "score" in case: a.score = case["score"]
    if "colann" in case: a.column_annotations = {k: (v if isinstance(v, str) else list(v)) for k, v in case["colann"].items()}
    if "annotations" in case: a.annotations = dict(case["annotations"])
    return a

def apply(a, op, others):
    k = op[0]
    if k == "str": return str(a)
    if k == "format": return a.format(op[1]) if op[1] == "" else None
    if k == "format_matrix": return a.format("", SM.load(op[1]))
    if k == "format_aligner": return a.format("", PairwiseAligner(substitution_matrix=SM.load(op[1])))
    if k == "length": return a.length
    if k == "shape": return a.shape
    if k == "len": return len(a)
    if k == "aligned": return a.aligned
    if k == "indices": return a.indices
    if k == "inverse_indices": return a.inverse_indices
    if k == "target": return a.target
    if k == "query": return a.query
    if k == "set_target": a.target = seq_in(op[1]); return str(a.target)
    if k == "set_query": a.query = seq_in(op[1]); return str(a.query)
    if k == "cmp":
        b = others[op[1]]
        return [a == b, a != b, a < b, a <= b, a > b, a >= b]
    if k == "parse_printed":
        seqs, coords = Alignment.parse_printed_alignment([l.encode() for l in op[1]])
        return {"seqs": [x.decode() for x in seqs], "coords": coords.tolist()}
    if k == "frequencies": return {c: v.tolist() for c, v in a.frequencies.items()}
    if k == "substitutions": m = a.substitutions; return {"alphabet": m.alphabet, "v": np.asarray(m).ravel().tolist()}
    if k == "same_ref": return Alignment.from_alignments_with_same_reference([others[i] for i in op[1]])
    if k == "counts":
        c = a.counts(scoring_py(op[1]))
        return {"str": str(c), **{n: getattr(c, n) for n in COUNT_NAMES}}
    if k == "map": return a.map(others[op[1]])
    if k == "mapall": return a.mapall([others[i] for i in op[1]])
    if k == "get": return a[key_py(op[1])]
    if k == "reverse_complement": return a.reverse_complement()
    if k == "add": return a + others[op[1]]
    if k == "annotations": return {k2: v for k2, v in a.annotations.items()} if hasattr(a, "annotations") else {"none": True}
    if k == "sort":
        a.sort(key_fn(op[1]) if op[1] else None, op[2])
        return [enc(a.sequences), a.coordinates.tolist()]
    raise ValueError(k)

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            a = build(case)
            def mk(o):
                x = Alignment([seq_in(s) for s in o["sequences"]], np.array(o["coordinates"], dtype=np.intp))
                if "colann" in o: x.column_annotations = {k: (v if isinstance(v, str) else list(v)) for k, v in o["colann"].items()}
                if "annotations" in o: x.annotations = dict(o["annotations"])
                return x
            others = [mk(o) for o in case.get("others", [])]
            res = []
            out["ops_out"] = res
            for op in case["ops"]:
                try: res.append({"result": enc(apply(a, op, others))})
                except Exception as e: res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
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


crashed = []
def add(c):
    res = run_isolated(run, c)
    if res is None:
        # retry op by op to keep the cases that do not crash
        ops = c["ops"]; kept = []
        for i, op in enumerate(ops):
            single = dict(c, ops=[op])
            r1 = run_isolated(run, single)
            if r1 is not None: kept.append(op)
            else: crashed.append(op)
        c = dict(c, ops=kept)
        res = run_isolated(run, c)
        if res is None: return
    # A zero-width selection of three or more rows makes Biopython's printed-alignment parser read uninitialised
    # memory (its coordinate array comes back empty); that behaviour is undefined, so those operations are not recorded.
    if "ops_out" in res:
        keep = [i for i, o in enumerate(res["ops_out"]) if not (isinstance(o.get("result"), dict) and "aln" in o["result"] and o["result"]["aln"]["coordinates"] == [] and o["result"]["aln"]["sequences"])]
        res["ops_out"] = [res["ops_out"][i] for i in keep]
        c = dict(c, ops=[c["ops"][i] for i in keep])
    c.update(res); cases.append(c)

DNA, PROT = "ACGT", "ACDEFGHIKLMNPQRSTVWY"
def rs(alpha, lo=1, hi=12): return "".join(rnd.choice(alpha) for _ in range(rnd.randint(lo, hi)))
OPS = [["str"], ["format", ""], ["length"], ["shape"], ["len"], ["aligned"], ["indices"], ["inverse_indices"], ["target"], ["query"], ["format_matrix", "BLOSUM62"], ["format_aligner", "NUC.4.4"], ["format_matrix", "BLOSUM45"]]

def wrap(s, kind):
    if kind == "str": return s
    if kind == "record": return {"t": "record", "v": s, "id": rnd.choice(["seqA", "a_very_long_identifier", "x", ""])}
    return {"t": kind, "v": s if kind != "list" else list(s)}

# pairwise alignments produced by the aligner (forward and reverse strand), in assorted sequence types
for _ in range(900):
    alpha = rnd.choice([DNA, DNA, PROT, "ACGTN"])
    a_s, b_s = rs(alpha, 1, 25), rs(alpha, 1, 25)
    kind = rnd.choice(["str"] * 6 + ["seq", "record", "bytes", "list"])
    aligner = PairwiseAligner(mode=rnd.choice(["global", "local"]), match_score=rnd.choice([1, 2]), mismatch_score=rnd.choice([0, -1]), gap_score=rnd.choice([-1, -2, -0.5]))
    try:
        als = aligner.align(a_s, b_s, rnd.choice(["+", "+", "-"]))
        al = als[0] if len(als) else None
    except Exception: al = None
    if al is None: continue
    case = {"kind": "alignment", "sequences": [wrap(a_s, kind), wrap(b_s, kind)], "coordinates": al.coordinates.tolist(), "ops": OPS}
    # the same alignment on the minus strand, if present
    add(case)
for strand in ("+", "-"):
    for _ in range(300):
        a_s, b_s = rs(DNA, 2, 140), rs(DNA, 2, 140)
        al = PairwiseAligner(mode="global", match_score=1, mismatch_score=0, gap_score=-1).align(a_s, b_s, strand)[0]
        add({"kind": "alignment", "sequences": [a_s, b_s], "coordinates": al.coordinates.tolist(), "ops": OPS})
for _ in range(120):    # long enough to wrap lines
    a_s, b_s = rs(DNA, 120, 400), rs(DNA, 120, 400)
    al = PairwiseAligner(mode=rnd.choice(["global", "local"]), match_score=1, mismatch_score=-1, gap_score=-2).align(a_s, b_s, rnd.choice(["+", "-"]))[0]
    add({"kind": "alignment", "sequences": [a_s, b_s], "coordinates": al.coordinates.tolist(), "ops": OPS[:6]})
# unicode and non-text sequences
for a_s, b_s in [("é", "é"), ("日本語", "日本"), ("ÀB", "AB"), ("😀A", "A😀")]:
    al = PairwiseAligner().align(a_s, b_s)
    add({"kind": "alignment", "sequences": [a_s, b_s], "coordinates": al[0].coordinates.tolist(), "ops": OPS[:6]})
    add({"kind": "alignment", "sequences": [a_s, b_s], "coordinates": al[0].coordinates.tolist(), "ops": [["str"]]})
    add({"kind": "alignment", "sequences": [a_s, b_s], "coordinates": [[len(a_s), 0], [0, len(b_s)]], "ops": OPS[:6]})
# hand-made coordinates, including multiple alignments and invalid ones
def multi(n, cols):
    coords = [[0] for _ in range(n)]; lens = [0] * n
    for _ in range(cols):
        step = rnd.randint(1, 4)
        for i in range(n):
            gap = rnd.random() < .3
            lens[i] += 0 if gap else step
            coords[i].append(lens[i])
    return coords, lens
for _ in range(300):
    n = rnd.choice([1, 2, 3, 3, 4]); coords, lens = multi(n, rnd.randint(1, 7))
    # merge: columns where everything is a gap are legal but odd; keep them
    seqs = [rs(DNA, lens[i] if lens[i] else 0, lens[i] if lens[i] else 0) for i in range(n)]
    rev = [i for i in range(n) if rnd.random() < .25]
    for i in rev: coords[i] = [lens[i] - c for c in coords[i]]
    add({"kind": "alignment", "sequences": seqs, "coordinates": coords, "ops": OPS[:9] + [["str"]]})
for _ in range(200):    # random coordinates: mostly invalid
    n = rnd.choice([2, 2, 3]); m = rnd.randint(2, 6)
    coords = [[rnd.randint(0, 6) for _ in range(m)] for _ in range(n)]
    add({"kind": "alignment", "sequences": [rs(DNA, 6, 6) for _ in range(n)], "coordinates": coords, "ops": OPS[:9]})
add({"kind": "alignment", "sequences": ["ACGT", "ACGT"], "coordinates": None, "ops": OPS[:9]})
add({"kind": "alignment", "sequences": ["ACGT", "ACG"], "coordinates": None, "ops": OPS[:9]})
add({"kind": "alignment", "sequences": [], "coordinates": None, "ops": OPS[:9]})
add({"kind": "alignment", "sequences": [{"t": "list", "v": [1, 2]}], "coordinates": None, "ops": OPS[:9]})
# comparisons and sorting
for _ in range(300):
    kind = rnd.choice(["str", "str", "seq", "record"])
    def pair():
        a_s, b_s = rs(DNA, 2, 8), rs(DNA, 2, 8)
        al = PairwiseAligner(gap_score=-1).align(a_s, b_s)[0]
        return {"sequences": [wrap(a_s, kind), wrap(b_s, kind)], "coordinates": al.coordinates.tolist()}
    base = pair(); others = [pair() for _ in range(3)] + [dict(base)]
    others.append({"sequences": base["sequences"], "coordinates": base["coordinates"][::-1]})
    add({"kind": "alignment", "sequences": base["sequences"], "coordinates": base["coordinates"], "others": others,
         "ops": [["cmp", i] for i in range(len(others))] + [["sort", rnd.choice([None, "len", "neg", "str"] + (["id"] if kind == "record" else [])), rnd.random() < .5]]})
for ids in (["b", "a"], ["a", "a"], ["z", "y", "x"]):
    n = len(ids)
    add({"kind": "alignment", "sequences": [{"t": "record", "v": "ACG", "id": i} for i in ids], "coordinates": [[0, 3]] * n, "ops": [["sort", None, False], ["sort", None, True], ["sort", "len", True]]})
add({"kind": "alignment", "sequences": ["ACG", "ACG", "TT"], "coordinates": [[0, 3], [0, 3], [0, 2]], "ops": [["target"], ["query"], ["set_target", "GG"], ["set_query", "GG"], ["sort", None, False]]})
add({"kind": "alignment", "sequences": ["ACG", "ACG"], "coordinates": [[0, 3], [0, 3]], "ops": [["set_target", "GG"], ["set_query", "TT"], ["target"], ["query"]]})
# from_alignments_with_same_reference
def same_ref_case():
    ref = rs(DNA, 6, 30)
    pw = []
    for _ in range(rnd.randint(1, 4)):
        q = rs(DNA, 4, 24)
        try: pw.append((q, PairwiseAligner(mode="global", match_score=2, mismatch_score=-1, gap_score=-2).align(ref, q)[0]))
        except IndexError: return None
    return ref, pw
for _ in range(300):
    r = same_ref_case()
    if r is None: continue
    ref, pw = r
    kind = rnd.choice(["str", "seq", "record"])
    mk = lambda q, al: {"sequences": [wrap(ref, kind), wrap(q, kind)], "coordinates": al.coordinates.tolist()}
    if rnd.random() < .15: pw[-1] = (pw[-1][0], pw[-1][1])
    specs = [mk(q, al) for q, al in pw]
    bad = rnd.random()
    if bad < .1: specs[-1] = {"sequences": [wrap(ref[:-1] or "A", kind), wrap("A", kind)], "coordinates": [[0, 1], [0, 1]]}
    elif bad < .2: specs[-1] = {"sequences": [wrap(ref.lower(), kind), specs[-1]["sequences"][1]], "coordinates": specs[-1]["coordinates"]}
    elif bad < .25: specs[-1] = {"sequences": [wrap("".join(rnd.choice(DNA) for _ in ref), kind), specs[-1]["sequences"][1]], "coordinates": specs[-1]["coordinates"]}
    add({"kind": "alignment", "sequences": specs[0]["sequences"], "coordinates": specs[0]["coordinates"], "others": specs, "ops": [["same_ref", list(range(len(specs)))], ["same_ref", []]]})
# counts: with and without an aligner, a matrix or a wildcard
AL_CONFIGS = [
    [["match_score", 2], ["mismatch_score", -1], ["gap_score", -1.5]], [["match_score", 1], ["mismatch_score", 0]], [["substitution_matrix", {"matrix": "NUC.4.4"}], ["open_gap_score", -5], ["extend_gap_score", -2]],
    [["match_score", 2], ["mismatch_score", -1], ["open_gap_score", -3], ["extend_gap_score", -0.5], ["end_gap_score", 0]], [["match_score", 2], ["mismatch_score", -1], ["gap_score", {"fn": "affine", "a": -2, "b": -0.5}]],
    [["match_score", 2], ["mismatch_score", -1], ["insertion_score", {"fn": "pos", "a": -1, "b": 0.2}], ["deletion_score", -2]], [["match_score", 1], ["mismatch_score", -1], ["wildcard", "N"], ["gap_score", -1]],
    [["match_score", 2], ["mismatch_score", -1], ["left_gap_score", -1], ["right_gap_score", -3], ["internal_gap_score", -2]]]
def count_scorings(alpha):
    out = [None, {"wildcard": "N"}, {"wildcard": "A"}, {"wildcard": ""}, {"wildcard": "NN"}, {"int": 5}, {"matrix": "NUC.4.4"}, {"matrix": "BLOSUM62"}, {"matrix": "BLASTN"}]
    for cfg in AL_CONFIGS: out.append({"aligner": cfg})
    return out
for _ in range(500):
    alpha = rnd.choice([DNA, DNA, "ACGTN", PROT])
    a_s, b_s = rs(alpha, 1, 24), rs(alpha, 1, 24)
    cfg = rnd.choice(AL_CONFIGS)
    al_obj = PairwiseAligner()
    for name, v in cfg:
        if isinstance(v, dict) and "fn" in v: v = FUNCS[v["fn"]](v.get("a", -1.0), v.get("b", -0.5))
        elif isinstance(v, dict) and "matrix" in v: v = SM.load(v["matrix"])
        setattr(al_obj, name, v)
    al_obj.mode = rnd.choice(["global", "local"])
    try: al = al_obj.align(a_s, b_s, rnd.choice(["+", "+", "-"]))[0]
    except (IndexError, ValueError): continue
    kind = rnd.choice(["str"] * 4 + ["seq", "record", "bytes"])
    add({"kind": "alignment", "sequences": [wrap(a_s, kind), wrap(b_s, kind)], "coordinates": al.coordinates.tolist(), "ops": [["counts", sp] for sp in count_scorings(alpha)]})
for _ in range(300):    # multiple alignments, reverse-strand rows, undefined sequences
    n = rnd.choice([2, 3, 4]); coords, lens = multi(n, rnd.randint(1, 8))
    kind = rnd.choice(["str", "seq", "record", "list"])
    seqs = [rs(rnd.choice([DNA, "ACGTN"]), lens[i], lens[i]) for i in range(n)]
    for i in range(n):
        if rnd.random() < .2: coords[i] = [lens[i] - c for c in coords[i]]
    add({"kind": "alignment", "sequences": [wrap(x, kind) for x in seqs], "coordinates": coords, "ops": [["counts", sp] for sp in [None, {"wildcard": "N"}, {"matrix": "NUC.4.4"}, {"aligner": AL_CONFIGS[0]}, {"aligner": AL_CONFIGS[2]}, {"aligner": AL_CONFIGS[4]}]]})
# map: compose two pairwise alignments, on either strand
for _ in range(700):
    T, Q, R = rs(DNA, 4, 30), rs(DNA, 4, 24), rs(DNA, 3, 20)
    mode1, mode2 = rnd.choice(["global", "local"]), rnd.choice(["global", "local"])
    try:
        a1 = PairwiseAligner(mode=mode1, match_score=2, mismatch_score=-1, gap_score=-1.5).align(T, Q, rnd.choice(["+", "+", "-"]))[0]
        a2 = PairwiseAligner(mode=mode2, match_score=2, mismatch_score=-1, gap_score=-1.5).align(Q, R, rnd.choice(["+", "+", "-"]))[0]
    except IndexError: continue
    kind = rnd.choice(["str"] * 3 + ["seq", "record"])
    wrapped = lambda seqs: [wrap(x, kind) for x in seqs]
    add({"kind": "alignment", "sequences": wrapped([T, Q]), "coordinates": a1.coordinates.tolist(),
         "others": [{"sequences": wrapped([Q, R]), "coordinates": a2.coordinates.tolist()}, {"sequences": wrapped([Q + "A", R]), "coordinates": a2.coordinates.tolist()}], "ops": [["map", 0], ["map", 1]]})
for _ in range(300):    # mapall: a multiple alignment of S_i, with each S_i aligned to a different R_i
    n = rnd.choice([2, 3, 4]); coords, lens = multi(n, rnd.randint(2, 6))
    if any(l == 0 for l in lens): continue
    S = [rs(DNA, lens[i], lens[i]) for i in range(n)]
    R = [rs(DNA, 3, 15) for _ in range(n)]
    try: P = [PairwiseAligner(mode="global", match_score=2, mismatch_score=-1, gap_score=-1.5).align(S[i], R[i])[0] for i in range(n)]
    except IndexError: continue
    add({"kind": "alignment", "sequences": S, "coordinates": coords,
         "others": [{"sequences": [S[i], R[i]], "coordinates": P[i].coordinates.tolist()} for i in range(n)], "ops": [["mapall", list(range(n))], ["mapall", list(range(n))[::-1]], ["mapall", []]]})
# frequencies and substitutions
for _ in range(500):
    n = rnd.choice([2, 2, 3, 4]); coords, lens = multi(n, rnd.randint(1, 8))
    kind = rnd.choice(["str", "str", "seq", "record", "list"])
    seqs = [rs(rnd.choice([DNA, "ACGTN", "ACGU"]), lens[i], lens[i]) for i in range(n)]
    rev = [i for i in range(n) if rnd.random() < .2]
    for i in rev: coords[i] = [lens[i] - c for c in coords[i]]
    wr = []
    for x in seqs:
        w = wrap(x, kind)
        if kind == "record" and rnd.random() < .4: w["weight"] = rnd.choice([0.5, 2, 3.25])
        wr.append(w)
    add({"kind": "alignment", "sequences": wr, "coordinates": coords, "ops": [["frequencies"], ["substitutions"]]})
for _ in range(150):
    a_s, b_s = rs(DNA, 2, 20), rs(DNA, 2, 20)
    try: al = PairwiseAligner(mode=rnd.choice(["global", "local"]), match_score=1, mismatch_score=-1, gap_score=-2).align(a_s, b_s, rnd.choice(["+", "-"]))[0]
    except IndexError: continue
    add({"kind": "alignment", "sequences": [a_s, b_s], "coordinates": al.coordinates.tolist(), "ops": [["frequencies"], ["substitutions"]]})
add({"kind": "alignment", "sequences": ["é日", "é日"], "coordinates": [[0, 2], [0, 2]], "ops": [["frequencies"], ["substitutions"]]})
# indexing: integers, slices, pairs; valid and invalid keys
def rand_key(n, m):
    def ik(size): return rnd.choice([rnd.randint(-size - 2, size + 1), rnd.randint(0, max(size - 1, 0)), rnd.randint(0, max(size - 1, 0))])
    def sl(size): return {"slice": [rnd.choice([None, rnd.randint(-size - 2, size + 2)]), rnd.choice([None, rnd.randint(-size - 2, size + 2)]), rnd.choice([None, None, 1, 1, 2, -1, -2, 3])]}
    def col():
        r = rnd.random()
        if r < .35: return ik(m)
        if r < .7: return sl(m)
        if r < .9: return {"list": [rnd.randint(-m - 1, m + 1) for _ in range(rnd.randint(0, 5))]}
        return rnd.choice([{"str": "ab"}, {"float": 1.5}, {"list": ["a", 1]}, {"none": True}, {"list": [1.5]}])
    def row():
        r = rnd.random()
        if r < .45: return ik(n)
        if r < .9: return sl(n)
        return rnd.choice([{"list": [0, 1]}, {"str": "a"}, {"float": 1.5}, {"list": [9]}])
    r = rnd.random()
    if r < .15: return ik(n)
    if r < .3: return sl(n)
    if r < .35: return rnd.choice([{"str": "x"}, {"float": 2.5}, {"none": True}, {"tuple": [0]}])
    return {"tuple": [row(), col()]} if r < .95 else {"tuple": [row(), col(), 0]}
def getitem_case(sequences, coords, extra=None):
    n = len(sequences); m = max(1, (coords[0][-1] if coords and coords[0] else 1) + 3) if coords else 1
    case = {"kind": "alignment", "sequences": sequences, "coordinates": coords, "ops": [["get", rand_key(n, m)] for _ in range(24)] + [["reverse_complement"], ["length"]]}
    case.update(extra or {})
    add(case)
for _ in range(500):
    alpha = rnd.choice([DNA, PROT]); a_s, b_s = rs(alpha, 1, 14), rs(alpha, 1, 14)
    kind = rnd.choice(["str"] * 4 + ["seq", "record", "list"])
    try: al = PairwiseAligner(mode=rnd.choice(["global", "local"]), match_score=2, mismatch_score=-1, gap_score=-1).align(a_s, b_s, rnd.choice(["+", "+", "-"]))[0]
    except IndexError: continue
    getitem_case([wrap(a_s, kind), wrap(b_s, kind)], al.coordinates.tolist(), {"score": al.score} if rnd.random() < .5 else None)
for _ in range(400):
    n = rnd.choice([2, 3, 4]); coords, lens = multi(n, rnd.randint(1, 8))
    seqs = [rs(DNA, lens[i], lens[i]) for i in range(n)]
    kind = rnd.choice(["str", "str", "seq", "record"])
    mcols = sum(max(coords[i][k + 1] - coords[i][k] for i in range(n)) for k in range(len(coords[0]) - 1))
    extra = None
    if rnd.random() < .5: extra = {"colann": {"a": "".join(rnd.choice("xyz") for _ in range(mcols)), "b": [rnd.randint(0, 9) for _ in range(mcols)]}}
    getitem_case([wrap(x, kind) for x in seqs], coords, extra)
# addition and reverse complement
for _ in range(300):
    def piece():
        n = 2; coords, lens = multi(n, rnd.randint(1, 4))
        return [rs(DNA, lens[i], lens[i]) for i in range(n)], coords
    (s1, c1), (s2, c2) = piece(), piece()
    kind = rnd.choice(["str", "seq", "record"])
    def ann(extra_key):
        return {"annotations": {"a": 1, "b": "x", extra_key: [1]}}
    m1 = sum(max(c1[i][k + 1] - c1[i][k] for i in range(2)) for k in range(len(c1[0]) - 1))
    m2 = sum(max(c2[i][k + 1] - c2[i][k] for i in range(2)) for k in range(len(c2[0]) - 1))
    base = {"sequences": [wrap(x, kind) for x in s1], "coordinates": c1}
    other = {"sequences": [wrap(x, kind) for x in s2], "coordinates": c2}
    if rnd.random() < .5: base["colann"] = {"a": "x" * m1, "b": [1] * m1}; other["colann"] = {"a": "y" * m2, "c": [2] * m2}
    if rnd.random() < .5: base["annotations"] = {"a": 1, "b": "x"}; other["annotations"] = {"a": 1, "b": "z"}
    add({"kind": "alignment", **base, "others": [other, {"sequences": [wrap(s1[0], kind)], "coordinates": [c1[0]]}], "ops": [["add", 0], ["add", 1], ["reverse_complement"], ["annotations"]]})
add({"kind": "alignment", "sequences": ["ACGT", "ACGT"], "coordinates": [[0, 4], [0, 4]], "others": [{"sequences": ["TT", "TT"], "coordinates": [[0, 2], [0, 2]]}], "ops": [["add", 0], ["get", {"tuple": [{"slice": [None, None, None]}, {"list": [0, 1, 2]}]}]]})
# printed alignments
for _ in range(200):
    n = rnd.choice([1, 2, 3, 4]); w = rnd.randint(0, 12)
    lines = ["".join(rnd.choice("ACGT--" if rnd.random() < .7 else "ACGT") for _ in range(w)) for _ in range(n)]
    add({"kind": "alignment", "sequences": ["A"], "coordinates": None, "printed": [l for l in lines], "ops": [["parse_printed", lines]]})
report_skipped()
json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(len(crashed), "crashing ops dropped;", len(cases), "cases,", sum("exc" in c for c in cases), "raise ->", os.path.relpath(OUT))
