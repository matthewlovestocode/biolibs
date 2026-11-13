"""Golden cases for Bio.Align.CodonAligner -> packages/align/test/golden/codonaligner.json

Each case builds a CodonAligner (optional genetic code and settings) and records score / align / str / repr results for a protein
and a nucleotide sequence given as str, Seq, MutableSeq or SeqRecord, or the result of setting and getting an attribute.
"""
import json, os, random
import Bio
from Bio import Align
from Bio.Align import CodonAligner
from Bio.Data import CodonTable
from Bio.Seq import Seq, MutableSeq, translate
from Bio.SeqRecord import SeqRecord
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "codonaligner.json")
rnd = random.Random(31)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e): return None if type(e).__name__ == "AttributeError" else (str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e))

def mk(kind, text):
    if kind == "str": return text
    if kind == "seq": return Seq(text)
    if kind == "mut": return MutableSeq(text)
    if kind == "rec": return SeqRecord(Seq(text), id="x")
    if kind == "list": return list(text)
    if kind == "int": return 5
    raise ValueError(kind)

def build(case):
    table = case.get("table")
    if table == "bad": return CodonAligner("not a table")
    aligner = CodonAligner(None if table is None else CodonTable.generic_by_id[table])
    for name, value in case.get("settings", []):
        setattr(aligner, name, value)
    return aligner

def run(case):
    out = {}
    try:
        aligner = build(case)
        k = case["kind"]
        if k == "score": out["result"] = aligner.score(mk(*case["a"]), mk(*case["b"]))
        elif k == "align":
            al = aligner.align(mk(*case["a"]), mk(*case["b"]))
            n = len(al)
            res = {"score": al.score, "n": n, "paths": []}
            for i, a in enumerate(al):
                if i >= 60: break
                res["paths"].append(a.coordinates.tolist())
            out["result"] = res
        elif k == "str": out["result"] = [str(aligner), repr(aligner)]
        elif k == "get": out["result"] = [getattr(aligner, n) if not isinstance(getattr(aligner, n), type(None)) else None for n in case["names"]]
    except Exception as e:
        out["exc"] = {"type": tname(e), "msg": emsg(e)}
    return out


unrunnable, undefined = [], []
def add(c):
    res = run_isolated(run, c)
    if res is None: unrunnable.append(c); return          # the child died every time; `isolate` has named it
    r = res.get("result")
    # In rare cases Biopython's path generator keeps producing (undefined) paths beyond the number it counted: leave those out.
    if c["kind"] == "align" and isinstance(r, dict) and r["n"] < 60 and len(r["paths"]) != r["n"]: undefined.append(c); return
    cases.append(dict(c, **res))

AA = "ACDEFGHIKLMNPQRSTVWY"
def rand_dna(n): return "".join(rnd.choice("ACGT") for _ in range(n))
def pair():
    dna = rand_dna(rnd.randint(3, 12) * 3)
    pro = translate(dna[: len(dna) // 3 * 3])
    # mutate the protein a little
    pro = "".join(rnd.choice(AA) if rnd.random() < 0.1 else c for c in pro).replace("*", "X")
    q = dna
    r = rnd.random()
    if r < 0.4 and len(q) > 4:
        i = rnd.randrange(len(q)); q = q[:i] + q[i + rnd.randint(1, 2):]
    elif r < 0.7:
        i = rnd.randrange(len(q) + 1); q = q[:i] + rand_dna(rnd.randint(1, 2)) + q[i:]
    return pro, q

SETTINGS = [[], [("frameshift_score", -1.0)], [("frameshift_score", -3.0), ("mismatch_score", -1.0)], [("match_score", 2.0), ("frameshift_minus_one_score", -2.0), ("frameshift_plus_two_score", -1.0)],
            [("wildcard", "N")], [("epsilon", 1e-9)], [("frameshift_score", 0.0), ("mismatch", 0.0)]]
for _ in range(120):
    pro, dna = pair()
    st = rnd.choice(SETTINGS)
    ka, kb = rnd.choice([("str", "str"), ("seq", "seq"), ("mut", "mut"), ("rec", "rec"), ("seq", "str"), ("str", "seq"), ("rec", "seq")])
    if rnd.random() < 0.2: dna = dna.replace("T", "U"); kb = kb
    add({"kind": "score", "a": [ka, pro], "b": [kb, dna], "settings": st})
    add({"kind": "align", "a": [ka, pro], "b": [kb, dna], "settings": st})
for pro, dna in [("MSR", "ATGTCTCGT"), ("MLGSNESRVCPKLSPS", "ATGCTGGGCTCGAACGAGTCCGTGTATGCCCTAAGCTGAGCCCGTCG"), ("FKKKKF", "TTTAAAAAAAAAAATTT"), ("", ""), ("", "ATG"), ("M", ""), ("M", "A"), ("M", "AT"), ("M", "ATG"), ("MM", "ATGATG"),
                 ("MX", "ATGNNN"), ("M", "ATGATGATG"), ("MMMM", "ATG"), ("K", "AAAA"), ("M*", "ATGTAA"), ("L", "CTN"), ("M", "atg"), ("A", "GCTGC")]:
    for st in SETTINGS[:3]:
        add({"kind": "score", "a": ["str", pro], "b": ["str", dna], "settings": st})
        add({"kind": "align", "a": ["str", pro], "b": ["str", dna], "settings": st})
        add({"kind": "align", "a": ["seq", pro], "b": ["seq", dna], "settings": st})
for table in (1, 2, 11, 5, 6):
    pro, dna = pair()
    add({"kind": "score", "a": ["str", pro], "b": ["str", dna], "table": table})
    add({"kind": "align", "a": ["seq", pro], "b": ["seq", dna], "table": table})
add({"kind": "score", "a": ["str", "M"], "b": ["str", "ATG"], "table": "bad"})
for ka, kb in [("list", "str"), ("int", "str"), ("str", "list"), ("str", "int"), ("seq", "list"), ("seq", "int"), ("list", "seq")]:
    add({"kind": "score", "a": [ka, "MSR"], "b": [kb, "ATGTCTCGT"]})
    add({"kind": "align", "a": [ka, "MSR"], "b": [kb, "ATGTCTCGT"]})
add({"kind": "score", "a": ["str", "MSR"], "b": ["str", "ATGTCTXGT"]})
add({"kind": "score", "a": ["str", "MSR"], "b": ["str", "ATGTCTCG"]})
add({"kind": "score", "a": ["seq", "MSR"], "b": ["seq", "ATGTCTRGT"]})
add({"kind": "str"})
add({"kind": "str", "settings": [("frameshift_score", -2.0), ("wildcard", "N"), ("match", 3.0)]})
for name, val in [("match_score", "x"), ("mismatch_score", None), ("wildcard", "NN"), ("wildcard", 5), ("wildcard", "é"), ("wildcard", "Ā"), ("wildcard", ""), ("epsilon", "x"), ("frameshift_score", "x"), ("frameshift_one_score", 1), ("frameshift_two_score", -1.5),
                  ("frameshift_minus_score", -2.0), ("frameshift_plus_score", -4.0)]:
    add({"kind": "get", "settings": [(name, val)], "names": ["match_score", "mismatch_score", "epsilon", "wildcard", "frameshift_minus_two_score", "frameshift_minus_one_score", "frameshift_plus_one_score", "frameshift_plus_two_score"]})
for sets in ([("frameshift_minus_one_score", -1.0)], [("frameshift_plus_two_score", -5.0)], [("frameshift_minus_two_score", -2.0)], [("frameshift_plus_one_score", -7.0)]):
    for g in ("frameshift_one_score", "frameshift_two_score", "frameshift_minus_score", "frameshift_plus_score", "frameshift_score"):
        add({"kind": "get", "settings": sets, "names": [g]})
for g in ("match", "mismatch", "frameshift_one_score", "frameshift_two_score", "frameshift_minus_score", "frameshift_plus_score", "frameshift_score", "wildcard", "epsilon"):
    add({"kind": "get", "names": [g]})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
report_skipped()
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "cases;", len(unrunnable), "crashed Python and", len(undefined), "returned undefined paths; both were left out")
