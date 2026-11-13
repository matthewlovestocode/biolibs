"""Golden cases for Bio.Phylo.TreeConstruction -> packages/phylo/test/golden/treeconstruction.json

Kinds: matrix (operations on _Matrix / DistanceMatrix), calc (DistanceCalculator), build (UPGMA / NJ from a matrix or an alignment),
score (ParsimonyScorer), search (NNI neighbours and search), constructor (ParsimonyTreeConstructor).
"""
import io, json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from Bio import Phylo, Align
from Bio.Align import Alignment, MultipleSeqAlignment
from Bio.Phylo import TreeConstruction as TC
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from phylo_codec import enc_tree, tname, emsg

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "phylo", "test", "golden", "treeconstruction.json")
rnd = random.Random(515)
cases = []

def tag(v):
    if isinstance(v, bool): return ["i", int(v)]
    if isinstance(v, (int, np.integer)): return ["i", int(v)]
    return ["f", float(v)]
def enc_matrix(m): return {"cls": type(m).__name__, "names": list(m.names), "matrix": [[tag(v) for v in row] for row in m.matrix]}
def dec(v): return int(v[1]) if v[0] == "i" else float(v[1])
def dec_matrix(spec): return None if spec is None else [[dec(v) for v in row] for row in spec]

def tree(text): return Phylo.read(io.StringIO(text), "newick")

def make_msa(spec, kind):
    if kind == "msa": return MultipleSeqAlignment([SeqRecord(Seq(r), id=i) for r, i in zip(spec["rows"], spec["ids"])])
    seqs, coords = Alignment.parse_printed_alignment([r.encode() for r in spec["rows"]])
    return Alignment([SeqRecord(Seq(bytes(s).decode()), id=i) for s, i in zip(seqs, spec["ids"])], coords)

def val(x): return fx_val(x)
def fx_val(x):
    if isinstance(x, (float, np.floating)):
        x = float(x)
        if x != x or x in (float("inf"), float("-inf")): return {"f": repr(x)}
        return x
    if isinstance(x, (int, np.integer)): return int(x)
    return x

def run(case):
    k = case["kind"]
    try:
        if k == "matrix":
            cls = getattr(TC, case["cls"])
            m = cls(case["names"], dec_matrix(case.get("matrix")))
            initial = enc_matrix(m)
            out = []
            for op in case["ops"]:
                o = {}
                try:
                    name = op["m"]; args = op.get("args", [])
                    idx = (tuple(args[0]) if isinstance(args[0], list) else args[0]) if args else None
                    if name == "get": o["result"] = [tag(v) for v in m[idx]] if isinstance(m[idx], list) else tag(m[idx])
                    elif name == "set":
                        v = args[1]; v = [dec(x) for x in v["list"]] if isinstance(v, dict) and "list" in v else dec(v) if isinstance(v, list) else v
                        m[idx] = v; o["result"] = None
                    elif name == "del": del m[idx]; o["result"] = None
                    elif name == "insert":
                        m.insert(args[0], [dec(x) for x in args[1]], *(args[2:])); o["result"] = None
                    elif name == "repr": o["result"] = repr(m)
                    elif name == "str": o["result"] = str(m)
                    elif name == "len": o["result"] = len(m)
                    elif name == "phylip":
                        b = io.StringIO(); m.format_phylip(b); o["result"] = b.getvalue()
                except Exception as e:
                    o["exc"] = {"type": tname(e), "msg": emsg(e)}
                o["after"] = enc_matrix(m)
                out.append(o)
            return {"results": out, "initial": initial}
        if k == "calc":
            calc = TC.DistanceCalculator(case.get("model", "identity"), case.get("skip"))
            msa = make_msa(case["aln"], case["akind"]) if case.get("akind") in ("msa", "aln") else case.get("bad")
            dm = calc.get_distance(msa)
            return {"result": {"m": enc_matrix(dm), "str": str(dm)}}
        if k == "models": return {"result": TC.DistanceCalculator.models}
        if k == "build":
            if "matrix" in case:
                dm = TC.DistanceMatrix(case["names"], dec_matrix(case["matrix"]))
                c = TC.DistanceTreeConstructor(None, case.get("method", "nj"))
                t = c.upgma(dm) if case["method"] == "upgma" else c.nj(dm)
            elif case.get("bad"): 
                c = TC.DistanceTreeConstructor(); t = getattr(c, case["method"])(case["bad"])
            else:
                c = TC.DistanceTreeConstructor(TC.DistanceCalculator(case.get("model", "identity")), case["method"])
                t = c.build_tree(make_msa(case["aln"], case["akind"]))
            return {"result": {"tree": enc_tree(t), "str": str(t)}}
        if k == "ctor":
            return {"result": [type(TC.DistanceTreeConstructor(*case["args"])).__name__]}
        if k == "score":
            t = tree(case["newick"])
            msa = make_msa(case["aln"], case["akind"])
            scorer = TC.ParsimonyScorer(None if "matrix" not in case else TC._Matrix(case["names"], dec_matrix(case["matrix"])))
            s = scorer.get_score(t, msa)
            return {"result": {"score": val(s), "tree": enc_tree(t), "ids": [r.id for r in (msa if case["akind"] == "msa" else msa.sequences)]}}
        if k == "neighbors":
            t = tree(case["newick"])
            ns = TC.NNITreeSearcher(TC.ParsimonyScorer())._get_neighbors(t)
            return {"result": [enc_tree(x) for x in ns], "tree": enc_tree(t)}
        if k == "search":
            t = tree(case["newick"]); msa = make_msa(case["aln"], case["akind"])
            scorer = TC.ParsimonyScorer(None if "matrix" not in case else TC._Matrix(case["names"], dec_matrix(case["matrix"])))
            r = TC.NNITreeSearcher(scorer).search(t, msa)
            return {"result": enc_tree(r)}
        if k == "constructor":
            msa = make_msa(case["aln"], case["akind"])
            start = tree(case["newick"]) if case.get("newick") else None
            pc = TC.ParsimonyTreeConstructor(TC.NNITreeSearcher(TC.ParsimonyScorer()), start)
            return {"result": enc_tree(pc.build_tree(msa))}
        if k == "base":
            if case["what"] == "tc": TC.TreeConstructor().build_tree(None)
            if case["what"] == "scorer": TC.Scorer().get_score(None, None)
            if case["what"] == "searcher": TC.TreeSearcher().search(None, None)
            if case["what"] == "nni": TC.NNITreeSearcher("x")
            if case["what"] == "ps": TC.ParsimonyScorer("x")
    except BaseException as e:
        return {"exc": {"type": tname(e), "msg": emsg(e)}}

def run_isolated(case):
    r, w = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        try: os.write(w, json.dumps(run(case)).encode())
        finally: os._exit(0)
    os.close(w)
    chunks = []
    while True:
        b = os.read(r, 1 << 20)
        if not b: break
        chunks.append(b)
    os.close(r)
    _, st = os.waitpid(pid, 0)
    return json.loads(b"".join(chunks)) if st == 0 and chunks else None
def add(c):
    res = run_isolated(c)
    if res is not None: cases.append(dict(c, **res))

def T(i): return ["i", i]
def Fl(x): return ["f", x]
# ---- matrices ----
M1 = [[T(0)], [T(1), T(0)], [T(2), T(3), T(0)], [T(4), T(5), T(6), T(0)]]
M2 = [[Fl(0.0)], [Fl(0.5), Fl(0.0)], [Fl(1.0), Fl(0.25), Fl(0.0)]]
MOPS = [{"m": "repr"}, {"m": "str"}, {"m": "len"}, {"m": "phylip"}, {"m": "get", "args": [0]}, {"m": "get", "args": ["B"]}, {"m": "get", "args": [[1, 2]]}, {"m": "get", "args": [["A", "C"]]}, {"m": "get", "args": [[1, "C"]]}, {"m": "get", "args": [9]},
        {"m": "get", "args": ["nosuch"]}, {"m": "get", "args": [[9, 0]]}, {"m": "get", "args": [-1]}, {"m": "get", "args": [[-1, 0]]}, {"m": "get", "args": [[0, 1, 2]]},
        {"m": "set", "args": [[1, 0], T(7)]}, {"m": "set", "args": [[0, 0], T(5)]}, {"m": "set", "args": [["A", "B"], Fl(0.75)]}, {"m": "set", "args": [1, {"list": [T(1), T(2), T(3)]}]}, {"m": "set", "args": [1, {"list": [T(1)]}]},
        {"m": "set", "args": [1, 5]}, {"m": "set", "args": [[1, 0], "x"]}, {"m": "set", "args": ["B", {"list": [T(9), T(8), T(7)]}]}, {"m": "str"}, {"m": "repr"},
        {"m": "insert", "args": ["Z", [T(1), T(2), T(3), T(4)], 1]}, {"m": "insert", "args": ["Y", [T(1), T(2), T(3), T(4), T(5)]]}, {"m": "insert", "args": ["Y", [T(1)]]}, {"m": "insert", "args": [5, [T(1)]]}, {"m": "str"},
        {"m": "del", "args": ["Z"]}, {"m": "del", "args": [0]}, {"m": "del", "args": ["nosuch"]}, {"m": "del", "args": [1.5]}, {"m": "repr"}, {"m": "phylip"}]
for cls in ("_Matrix", "DistanceMatrix"):
    add({"kind": "matrix", "cls": cls, "names": ["A", "B", "C"], "matrix": M2, "ops": MOPS})
    add({"kind": "matrix", "cls": cls, "names": ["A", "B", "C", "D"], "matrix": M1, "ops": MOPS})
    add({"kind": "matrix", "cls": cls, "names": ["A", "B", "C"], "matrix": None, "ops": MOPS})
    add({"kind": "matrix", "cls": cls, "names": ["A", "B", "C", "D"], "matrix": [[T(5)], [T(1), T(5)], [T(2), T(3), T(5)], [T(4), T(5), T(6), T(5)]], "ops": [{"m": "repr"}]})
    add({"kind": "matrix", "cls": cls, "names": ["A", "A"], "matrix": None, "ops": []})
    add({"kind": "matrix", "cls": cls, "names": ["A", 5], "matrix": None, "ops": []})
    add({"kind": "matrix", "cls": cls, "names": "AB", "matrix": None, "ops": []})
    add({"kind": "matrix", "cls": cls, "names": ["A", "B"], "matrix": [[T(0)]], "ops": []})
    add({"kind": "matrix", "cls": cls, "names": ["A", "B"], "matrix": [[T(0), T(1)], [T(1)]], "ops": []})
    add({"kind": "matrix", "cls": cls, "names": ["A", "B"], "matrix": [[T(0)], [T(1)]], "ops": []})
    add({"kind": "matrix", "cls": cls, "names": ["A", "B"], "matrix": [[T(0)], [T(1), T(0)], [T(1)]], "ops": []})
    add({"kind": "matrix", "cls": cls, "names": [], "matrix": None, "ops": [{"m": "len"}, {"m": "str"}, {"m": "repr"}]})
    add({"kind": "matrix", "cls": cls, "names": ["Averylongname_exceeding_twelve", "B"], "matrix": [[Fl(0.0)], [Fl(0.123456789), Fl(0.0)]], "ops": [{"m": "phylip"}, {"m": "str"}]})

# ---- distance calculator ----
def rand_aln(n, w, gaps=True, alpha="ACGT"):
    rows = ["".join(rnd.choice(alpha + ("-" if gaps and rnd.random() < 0.1 else "")) for _ in range(w)) for _ in range(n)]
    for c in range(w):
        if all(r[c] == "-" for r in rows): rows[0] = rows[0][:c] + alpha[0] + rows[0][c + 1:]
    return {"ids": ["S%d" % i for i in range(n)], "rows": rows}
print_models = TC.DistanceCalculator.models
add({"kind": "models"})
for model in ["identity"] + print_models[:6] + ["blosum62", "pam250", "blastn", "nuc.4.4", "bogus", "IDENTITY"]:
    for akind in ("msa", "aln"):
        add({"kind": "calc", "model": model, "akind": akind, "aln": rand_aln(4, 12)})
        add({"kind": "calc", "model": model, "akind": akind, "aln": rand_aln(5, 10, alpha="ACDEFGHIKLMNPQRSTVWY")})
add({"kind": "calc", "model": "blosum62", "akind": "msa", "aln": {"ids": ["a", "b"], "rows": ["ACJ", "AC*"]}})
add({"kind": "calc", "model": "blosum62", "akind": "aln", "aln": {"ids": ["a", "b"], "rows": ["ACJ", "ACB"]}})
add({"kind": "calc", "model": "blosum62", "akind": "msa", "aln": {"ids": ["a", "b"], "rows": ["ACj", "ACB"]}})
add({"kind": "calc", "model": "identity", "skip": ["-"], "akind": "msa", "aln": {"ids": ["a", "b"], "rows": ["AC-G", "ACTG"]}})
add({"kind": "calc", "model": "identity", "akind": "msa", "aln": {"ids": ["a", "b"], "rows": ["----", "----"]}})
add({"kind": "calc", "model": "blosum62", "akind": "msa", "aln": {"ids": ["a", "b"], "rows": ["----", "----"]}})
add({"kind": "calc", "model": "identity", "akind": "msa", "aln": {"ids": ["a", "b", "c"], "rows": ["ACGT", "ACGA", "TTTT"]}})
add({"kind": "calc", "model": "identity", "akind": "none", "bad": "not an alignment"})

# ---- tree building ----
def rand_dm(n, ints=False):
    names = ["T%d" % i for i in range(n)]
    m = []
    for i in range(n):
        row = []
        for j in range(i):
            row.append(T(rnd.randint(1, 9)) if ints else Fl(round(rnd.random() * 2, 3)))
        row.append(T(0)); m.append(row)
    return names, m
for n in (1, 2, 3, 4, 5, 6, 8, 10):
    for ints in (False, True):
        names, m = rand_dm(n, ints)
        for method in ("upgma", "nj"):
            add({"kind": "build", "method": method, "names": names, "matrix": m})
for method in ("upgma", "nj"):
    add({"kind": "build", "method": method, "names": [], "matrix": []})
    add({"kind": "build", "method": method, "bad": "x"})
    add({"kind": "build", "method": method, "bad": [[0]]})
    add({"kind": "build", "method": method, "names": ["A", "B", "C"], "matrix": [[T(0)], [T(0), T(0)], [T(0), T(0), T(0)]]})
    add({"kind": "build", "method": method, "names": ["A", "B", "C", "D"], "matrix": [[Fl(0.0)], [Fl(1.0), Fl(0.0)], [Fl(1.0), Fl(1.0), Fl(0.0)], [Fl(1.0), Fl(1.0), Fl(1.0), Fl(0.0)]]})
    for akind in ("msa", "aln"):
        for n in (3, 4, 6):
            add({"kind": "build", "method": method, "akind": akind, "aln": rand_aln(n, 14, gaps=False)})
        add({"kind": "build", "method": method, "akind": akind, "model": "blosum62", "aln": rand_aln(4, 10, alpha="ACDEFGHIKL")})
for args in ([None, "nj"], [None, "upgma"], [None, "bogus"], ["x", "nj"], [None]):
    add({"kind": "ctor", "args": args})
add({"kind": "build", "method": "nj", "akind": "msa", "aln": rand_aln(3, 5), "model": "identity", "no_calc": True})
for what in ("tc", "scorer", "searcher", "nni", "ps"): add({"kind": "base", "what": what})

# ---- parsimony ----
def newick_for(ids):
    ids = list(ids); rnd.shuffle(ids)
    def b(x):
        if len(x) == 1: return x[0] + ":%s" % round(rnd.random() + 0.1, 2)
        c = rnd.randint(1, len(x) - 1); return "(" + b(x[:c]) + "," + b(x[c:]) + "):%s" % round(rnd.random() + 0.1, 2)
    return b(ids) + ";"
for n in (3, 4, 5, 6, 7):
    for akind in ("msa", "aln"):
        for rep in range(3):
            aln = rand_aln(n, 12, gaps=False)
            nw = newick_for(aln["ids"])
            add({"kind": "score", "newick": nw, "aln": aln, "akind": akind})
            add({"kind": "neighbors", "newick": nw})
            add({"kind": "search", "newick": nw, "aln": aln, "akind": akind})
            add({"kind": "constructor", "newick": nw, "aln": aln, "akind": akind})
            add({"kind": "constructor", "aln": aln, "akind": akind})
            names = list("ACGT"); mat = [[T(0)], [T(1), T(0)], [T(2), T(1), T(0)], [T(1), T(2), T(1), T(0)]]
            add({"kind": "score", "newick": nw, "aln": aln, "akind": akind, "names": names, "matrix": mat})
            add({"kind": "search", "newick": nw, "aln": aln, "akind": akind, "names": names, "matrix": mat})
            mat2 = [[Fl(0.0)], [Fl(1.5), Fl(0.0)], [Fl(2.5), Fl(1.0), Fl(0.0)], [Fl(1.0), Fl(2.0), Fl(1.0), Fl(0.0)]]
            add({"kind": "score", "newick": nw, "aln": aln, "akind": akind, "names": names, "matrix": mat2})
aln = rand_aln(4, 8, gaps=False)
for nw in ["((S0:1,S1:1):1,(S2:1,S3:1):1);", "(S0:1,S1:1,(S2:1,S3:1):1);", "((S0,S1),(S2,S9));", "((S0:1,S1:1):1,(S2:1,S3:1):1):0;", "(S0:1,(S1:1,(S2:1,S3:1):1):1);"]:
    for akind in ("msa", "aln"):
        add({"kind": "score", "newick": nw, "aln": aln, "akind": akind})
        add({"kind": "neighbors", "newick": nw})
add({"kind": "score", "newick": "((S0:1,S1:1):1,(S2:1,S3:1):1);", "aln": {"ids": ["S0", "S1", "S2", "S3"], "rows": ["AAAA", "AAAC", "CCCC", "CCCA"]}, "akind": "msa", "names": ["A", "C"], "matrix": [[T(0)], [T(1), T(0)]]})
add({"kind": "score", "newick": "((S0:1,S1:1):1,(S2:1,S3:1):1);", "aln": {"ids": ["S0", "S1", "S2", "S3"], "rows": ["AAAA", "AAAC", "CCCC", "CCCA"]}, "akind": "msa", "names": ["A"], "matrix": [[T(0)]]})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "cases")
