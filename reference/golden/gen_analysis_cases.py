"""Golden cases for Bio.Align.analysis (dN/dS with NG86, LWL85, YN00 and ML, the dN/dS matrices, mktest)
-> packages/align/test/golden/analysis.json, packages/phylo/test/golden/dnds-matrix.json

mktest's Prim step depends on set iteration order, so its cases are evaluated in six processes with
different hash seeds and kept only where they all agree. The dN/dS cases go through dictionaries and
counters rather than sets, so two seeds are enough to show they do not depend on the order, which matters
here because YN00 and ML exponentiate a 61 by 61 matrix for every round of their iterations.
"""
import json, os, random, subprocess, sys
import numpy as np
from Bio import Align
from Bio.Align import Alignment, analysis
from Bio.Data import CodonTable
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "..", "packages", "align", "test", "golden", "analysis.json")
OUT2 = os.path.join(HERE, "..", "..", "packages", "phylo", "test", "golden", "dnds-matrix.json")

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e): return None if type(e).__name__ == "AttributeError" else (str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e))

def build(spec):
    recs = [SeqRecord(Seq(s), id=i) for s, i in zip(spec["seqs"], spec["ids"])]
    if spec.get("plain"): recs = [r.seq if True else r for r in recs]
    return Alignment(recs, np.array(spec["coords"], dtype=np.intp))

def fx(x):
    x = float(x) if isinstance(x, (float, np.floating)) else x
    if isinstance(x, float) and (x != x or x in (float("inf"), float("-inf"))): return {"f": repr(x)}
    return x

def tag(v): return ["i", int(v)] if isinstance(v, (int, np.integer)) and not isinstance(v, bool) else ["f", float(v)]

def run(case):
    k = case["kind"]
    try:
        table = None if case.get("table") is None else CodonTable.generic_by_id[case["table"]]
        if k == "dnds":
            kw = {}
            if case.get("k") is not None: kw["k"] = case["k"]
            if "cfreq" in case: kw["cfreq"] = case["cfreq"]
            dn, ds = analysis.calculate_dn_ds(build(case["aln"]), method=case["method"], codon_table=table, **kw)
            return {"result": [fx(dn), fx(ds)], "types": [type(dn).__name__, type(ds).__name__]}
        if k == "matrix":
            dn, ds = analysis.calculate_dn_ds_matrix(build(case["aln"]), method=case["method"], codon_table=table)
            enc = lambda m: {"names": list(m.names), "matrix": [[tag(v) for v in row] for row in m.matrix], "str": str(m)}
            return {"result": [enc(dn), enc(ds)]}
        if k == "mk":
            return {"result": fx(analysis.mktest(build(case["aln"]), case["species"], table))}
    except BaseException as e:
        return {"exc": {"type": tname(e), "msg": emsg(e)}}

if os.environ.get("EVAL_CASES"):
    json.dump([run(c) for c in json.load(sys.stdin)], sys.stdout)
    sys.exit(0)

rnd = random.Random(88)
SENSE = [a + b + c for a in "ACGT" for b in "ACGT" for c in "ACGT" if a + b + c not in ("TAA", "TAG", "TGA")]
def rand_coding(n): return "".join(rnd.choice(SENSE) for _ in range(n))
def mutate(s, rate):
    out = list(s)
    for i in range(len(out)):
        if rnd.random() < rate: out[i] = rnd.choice("ACGT")
    # avoid stop codons
    t = "".join(out)
    codons = [t[i:i + 3] for i in range(0, len(t), 3)]
    return "".join(c if c not in ("TAA", "TAG", "TGA") else "CCC" for c in codons)

def pair_spec(ncod, rate, gapped=False):
    a = rand_coding(ncod); b = mutate(a, rate)
    if not gapped:
        return {"ids": ["t", "q"], "seqs": [a, b], "coords": [[0, 3 * ncod], [0, 3 * ncod]]}
    # an insertion of a few codons in the query splits the alignment
    cut = rnd.randint(1, ncod - 1); ins = rand_coding(rnd.randint(1, 2))
    b2 = b[:3 * cut] + ins + b[3 * cut:]
    L = len(ins)
    return {"ids": ["t", "q"], "seqs": [a, b2], "coords": [[0, 3 * cut, 3 * cut, 3 * ncod], [0, 3 * cut, 3 * cut + L, 3 * ncod + L]]}

cases, mcases = [], []
for ncod in (3, 5, 8, 12, 20):
    for rate in (0.0, 0.05, 0.15, 0.3, 0.6, 0.9):
        for gapped in (False, True):
            if gapped and ncod < 3: continue
            sp = pair_spec(ncod, rate, gapped)
            for method in ("NG86", "LWL85", "YN00"):
                cases.append({"kind": "dnds", "method": method, "aln": sp})
            cases.append({"kind": "dnds", "method": "NG86", "aln": sp, "k": 2.5})
            cases.append({"kind": "dnds", "method": "NG86", "aln": sp, "table": 2})
            cases.append({"kind": "dnds", "method": "LWL85", "aln": sp, "table": 11})
            cases.append({"kind": "dnds", "method": "YN00", "aln": sp, "table": 2})
# YN00 only reaches its numeric answer for longer sequences: with a handful of codons the two fold-class
# dictionaries hold different bases and Biopython's own zip over them raises before any distance is computed.
for ncod in (30, 50, 80):
    for rate in (0.02, 0.05, 0.1, 0.2, 0.3):
        sp = pair_spec(ncod, rate)
        cases.append({"kind": "dnds", "method": "YN00", "aln": sp})
        cases.append({"kind": "dnds", "method": "YN00", "aln": sp, "table": 2})
        cases.append({"kind": "dnds", "method": "YN00", "aln": pair_spec(ncod, rate, True)})

# ML: one fit of three parameters and one of two, each an L-BFGS-B run over a 61-codon matrix exponential,
# so these are the slowest cases here and there are only a few of them.
for ncod, rate in ((5, 0.1), (8, 0.05), (8, 0.3), (12, 0.15)):
    mlsp = pair_spec(ncod, rate)
    cases.append({"kind": "dnds", "method": "ML", "aln": mlsp})
    cases.append({"kind": "dnds", "method": "ML", "aln": mlsp, "cfreq": "F3x4"})
cases.append({"kind": "dnds", "method": "ML", "aln": pair_spec(6, 0.2, True)})
cases.append({"kind": "dnds", "method": "ML", "aln": pair_spec(6, 0.2), "table": 2})
cases.append({"kind": "dnds", "method": "ML", "aln": pair_spec(6, 0.2), "cfreq": "F1x4"})
cases.append({"kind": "dnds", "method": "ML", "aln": pair_spec(6, 0.2), "cfreq": "F61"})
cases.append({"kind": "dnds", "method": "ML", "aln": {"ids": ["t", "q"], "seqs": ["ATGAAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}})

sp = pair_spec(6, 0.1)
cases += [{"kind": "dnds", "method": "bogus", "aln": sp}, {"kind": "dnds", "method": "NG86", "aln": sp, "cfreq": "F1x4"}, {"kind": "dnds", "method": "ML", "aln": sp, "cfreq": "F2x"},
          {"kind": "dnds", "method": "YN00", "aln": sp, "k": 2.5},
          {"kind": "dnds", "method": "YN00", "aln": sp, "cfreq": "F1x4"},
          {"kind": "dnds", "method": "NG86", "aln": {"ids": ["t", "q"], "seqs": ["ATGNAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "YN00", "aln": {"ids": ["t", "q"], "seqs": ["ATGNAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "YN00", "aln": {"ids": ["t", "q"], "seqs": ["ATGTAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "YN00", "aln": {"ids": ["t", "q"], "seqs": ["ATGAAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "YN00", "aln": {"ids": ["t", "q"], "seqs": ["AAAAAA", "TTTTTT"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "YN00", "aln": {"ids": ["t", "q"], "seqs": ["AUGAAA", "AUGAAG"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "NG86", "aln": {"ids": ["t", "q"], "seqs": ["ATGTAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "LWL85", "aln": {"ids": ["t", "q"], "seqs": ["ATGTAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "NG86", "aln": {"ids": ["t", "q"], "seqs": ["ATGAAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "LWL85", "aln": {"ids": ["t", "q"], "seqs": ["ATGAAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "NG86", "aln": {"ids": ["t", "q"], "seqs": ["AAAAAA", "TTTTTT"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "LWL85", "aln": {"ids": ["t", "q"], "seqs": ["AAAAAA", "TTTTTT"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "NG86", "aln": {"ids": ["t", "q"], "seqs": ["AUGAAA", "AUGAAG"], "coords": [[0, 6], [0, 6]]}},
          {"kind": "dnds", "method": "NG86", "aln": {"ids": ["t", "q"], "seqs": ["ATGAAAGG", "ATGAAAGG"], "coords": [[0, 8], [0, 8]]}}]
# matrices
for n in (2, 3, 4, 5):
    base = rand_coding(6)
    seqs = [mutate(base, 0.05 * (i + 1)) for i in range(n)]
    spec = {"ids": ["s%d" % i for i in range(n)], "seqs": seqs, "coords": [[0, 18]] * n}
    for method in ("NG86", "LWL85"):
        mcases.append({"kind": "matrix", "method": method, "aln": spec})
    mcases.append({"kind": "matrix", "method": "NG86", "aln": spec, "table": 2})
mcases.append({"kind": "matrix", "method": "NG86", "aln": {"ids": ["a", "b"], "seqs": ["AAAAAA", "TTTTTT"], "coords": [[0, 6], [0, 6]]}})
mcases.append({"kind": "matrix", "method": "bogus", "aln": {"ids": ["a", "b"], "seqs": ["AAAAAA", "TTTTTT"], "coords": [[0, 6], [0, 6]]}})
mcases.append({"kind": "matrix", "method": "NG86", "aln": {"ids": ["a"], "seqs": ["AAAAAA"], "coords": [[0, 6]]}})
# YN00 and ML matrices. YN00 needs the longer sequences to reach a number at all; the ML matrix is kept to
# one pair because each pair is two L-BFGS-B runs over a matrix exponential.
long_base = rand_coding(40)
long_spec = {"ids": ["s%d" % i for i in range(3)], "seqs": [mutate(long_base, 0.05 * (i + 1)) for i in range(3)],
             "coords": [[0, 120]] * 3}
mcases.append({"kind": "matrix", "method": "YN00", "aln": long_spec})
mcases.append({"kind": "matrix", "method": "YN00", "aln": {"ids": ["a", "b"], "seqs": ["ATGAAA", "ATGAAG"], "coords": [[0, 6], [0, 6]]}})
# The one pair YN00 is known to settle on, so that the matrix has numbers in it and not only an exception.
# The matrix walks j < i and calls calculate_dn_ds(sequences[i], sequences[j]), so the pair reaches YN00 the
# other way round from the order it is written in here -- and YN00 raises in that direction, which is why
# this spec holds the two sequences the way it does.
mcases.append({"kind": "matrix", "method": "YN00",
               "aln": {"ids": ["b", "a"], "seqs": ["GGTTTGCTACTTATGTGGGCGTTCGATCGGAAACCGCGT", "GGTTTGATTATGTGGGCATTCGCTCGGAAACCTCGT"],
                       "coords": [[0, 6, 9, 39], [0, 6, 6, 36]]}})
mcases.append({"kind": "matrix", "method": "ML", "aln": {"ids": ["a", "b"], "seqs": ["ATGAAACCCTTTGGG", "ATGAAGCCATTTGGC"], "coords": [[0, 15], [0, 15]]}})
# McDonald-Kreitman
for nsp in (2, 3):
    for per in (2, 3):
        for rate in (0.05, 0.2, 0.4):
            base = rand_coding(10)
            seqs = []; species = []
            for s in range(nsp):
                anc = mutate(base, rate)
                for _ in range(per): seqs.append(mutate(anc, 0.03)); species.append("sp%d" % s)
            spec = {"ids": ["x%d" % i for i in range(len(seqs))], "seqs": seqs, "coords": [[0, 30]] * len(seqs)}
            cases.append({"kind": "mk", "aln": spec, "species": species})
            cases.append({"kind": "mk", "aln": spec, "species": species, "table": 2})
            cases.append({"kind": "mk", "aln": spec, "species": [i % 2 for i in range(len(seqs))]})
cases += [{"kind": "mk", "aln": {"ids": ["a", "b"], "seqs": ["ATGAAA", "ATGAAA"], "coords": [[0, 6], [0, 6]]}, "species": ["x", "y"]},
          {"kind": "mk", "aln": {"ids": ["a", "b"], "seqs": ["ATGAAA", "ATGAAG"], "coords": [[0, 6], [0, 6]]}, "species": ["x", "y"]},
          {"kind": "mk", "aln": {"ids": ["a", "b"], "seqs": ["ATGAAA", "ATGAAG"], "coords": [[0, 6], [0, 6]]}, "species": None},
          {"kind": "mk", "aln": {"ids": ["a", "b"], "seqs": ["ATGAAA", "ATGTAA"], "coords": [[0, 6], [0, 6]]}, "species": ["x", "y"]},
          {"kind": "mk", "aln": {"ids": ["a", "b"], "seqs": ["ATGAAA", "ATGANA"], "coords": [[0, 6], [0, 6]]}, "species": ["x", "y"]}]

def evaluate(items, seed):
    env = dict(os.environ, PYTHONHASHSEED=str(seed), EVAL_CASES="1")
    p = subprocess.run([sys.executable, __file__], input=json.dumps(items), env=env, capture_output=True, text=True, check=True)
    return json.loads(p.stdout)
def keep(items, seeds=(1, 2, 3, 4, 5, 6)):
    runs = [evaluate(items, seed) for seed in seeds]
    return [dict(c, **res[0]) for c, *res in zip(items, *runs) if all(r == res[0] for r in res)]

k1 = keep([c for c in cases if c["kind"] != "mk"], (1, 2)) + keep([c for c in cases if c["kind"] == "mk"])
k2 = keep(mcases, (1, 2))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(k1, open(OUT, "w"), indent=0); json.dump(k2, open(OUT2, "w"), indent=0)
print(len(k1), "of", len(cases), "analysis cases;", len(k2), "of", len(mcases), "matrix cases")
