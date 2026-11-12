"""Golden cases for Bio.SeqUtils.

Output: packages/seqtools/test/golden/sequtils.json
Each case is {"fn": name, "args": [...]} (codec_feature-encoded) with "result" or "exc" and "warnings",
or {"kind": "cai", ...} for CodonAdaptationIndex.
"""
import json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
from Bio import SeqUtils as SU
from Bio.Data import CodonTable
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from codec import S, M, LST
from codec_feature import enc, dec, REC

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqtools", "test", "golden", "sequtils.json")
rnd = random.Random(61)
cases, seen = [], set()

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def run(c):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if c.get("kind") == "cai":
                seqs = [dec(x) for x in c["seqs"]]
                table = CodonTable.unambiguous_dna_by_id[c["table"]] if c.get("table") else None
                cai = SU.CodonAdaptationIndex(seqs, table) if table else SU.CodonAdaptationIndex(seqs)
                out["items"] = [[k, v] for k, v in cai.items()]
                out["str"] = str(cai)
                out["ops_out"] = []
                for op in c.get("ops", []):
                    try:
                        if op[0] == "calculate": r = cai.calculate(dec(op[1]))
                        else: r = enc(cai.optimize(dec(op[1]), *op[2:]))
                        out["ops_out"].append({"result": r})
                    except Exception as e:
                        out["ops_out"].append({"exc": {"type": tname(e), "msg": emsg(e)}})
            else:
                out["result"] = enc(getattr(SU, c["fn"])(*[dec(a) for a in c["args"]], **c.get("kw", {})))
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out

def add(c):
    k = json.dumps(c, sort_keys=True)
    if k in seen: return
    seen.add(k); c.update(run(c)); cases.append(c)

def dna(n, alpha="ACGT"): return "".join(rnd.choice(alpha) for _ in range(n))
AMB = "ACGTSWUBDHKMNRVXYacgtswubdhkmnrvxy"

# ---- gc_fraction
for _ in range(120):
    t = dna(rnd.randint(0, 60), rnd.choice(["ACGT", "acgt", "ACGTN", AMB, "ACGU", "ACGT-*?"]))
    for amb in ("remove", "ignore", "weighted"):
        add({"fn": "gc_fraction", "args": [t, amb]})
    add({"fn": "gc_fraction", "args": [S(t)]}); add({"fn": "gc_fraction", "args": [M(t)]}); add({"fn": "gc_fraction", "args": [t]})
for bad in ("", "bogus", "Remove", None, 1):
    add({"fn": "gc_fraction", "args": ["ACGT", bad]})
add({"fn": "gc_fraction", "args": [5]}); add({"fn": "gc_fraction", "args": [None]}); add({"fn": "gc_fraction", "args": [{"$": "Seq", "undef": 4}]}); add({"fn": "gc_fraction", "args": [""]})
add({"fn": "gc_fraction", "args": ["N" * 7, "weighted"]}); add({"fn": "gc_fraction", "args": ["BDHKMNRVXY" * 3 + "GC", "weighted"]})
# ---- GC123
for _ in range(80):
    t = dna(rnd.randint(0, 40), rnd.choice(["ACGT", "acgt", "ACGTN", "ACGTnx"]))
    add({"fn": "GC123", "args": [t]}); 
    if rnd.random() < .3: add({"fn": "GC123", "args": [S(t)]})
for t in ("", "N", "NNN", "ggggaaacccttt", "G", "GC", "GCGC", "xyz"): add({"fn": "GC123", "args": [t]})
add({"fn": "GC123", "args": [5]})
# ---- GC_skew
for _ in range(60):
    t = dna(rnd.randint(0, 80), rnd.choice(["ACGT", "acgt", "GC", "AT", "GCgcN"]))
    for w in (1, 2, 3, 7, 10, 100):
        add({"fn": "GC_skew", "args": [t, w]})
    add({"fn": "GC_skew", "args": [t]}); 
    if rnd.random() < .2: add({"fn": "GC_skew", "args": [S(t)]})
for w in (0, -1, -5, 2.5, "3", None, True): add({"fn": "GC_skew", "args": ["ACGTGC", w]})
add({"fn": "GC_skew", "args": [""]}); add({"fn": "GC_skew", "args": [7]})
# ---- nt_search
CODES = "GATCRYWSMKHBVDN"
for _ in range(120):
    s = dna(rnd.randint(0, 60), "ACGT"); sub = "".join(rnd.choice(CODES) for _ in range(rnd.randint(1, 5)))
    add({"fn": "nt_search", "args": [s, sub]})
    if rnd.random() < .3: add({"fn": "nt_search", "args": [s, S(sub)]})
for s, sub in (("ACGTGGAGAGATGAT", "GRG"), ("AAAA", "AA"), ("ACGT", "Z"), ("ACGT", "a"), ("acgt", "ACGT"), ("", "A"), ("ACGT", "N"), ("ACGT", "ACGTACGTAC")):
    add({"fn": "nt_search", "args": [s, sub]})
add({"fn": "nt_search", "args": [S("ACGT"), "AC"]}); add({"fn": "nt_search", "args": [5, "AC"]}); add({"fn": "nt_search", "args": ["ACGT", 5]})
# ---- seq1 / seq3
P1 = "ACDEFGHIKLMNPQRSTVWYBXZJUO*-?acdefghiklmnpqrstvwy"
THREE = ["Ala", "Cys", "Asp", "Glu", "Phe", "Gly", "His", "Ile", "Lys", "Leu", "Met", "Asn", "Pro", "Gln", "Arg", "Ser", "Thr", "Val", "Trp", "Tyr", "Asx", "Xaa", "Glx", "Xle", "Sec", "Pyl", "Ter", "ALA", "ala", "aLa", "Xyz", "Un"]
for _ in range(80):
    t = dna(rnd.randint(0, 25), P1)
    add({"fn": "seq3", "args": [t]}); add({"fn": "seq3", "args": [S(t)]}); add({"fn": "seq3", "args": [t, {"$": "dict", "v": [["*", "STOP"], ["X", "Any"]]}, "???"]})
    u = "".join(rnd.choice(THREE) for _ in range(rnd.randint(0, 10))) + dna(rnd.choice([0, 0, 1, 2]), "AC")
    add({"fn": "seq1", "args": [u]}); add({"fn": "seq1", "args": [S(u)]}); add({"fn": "seq1", "args": [u, {"$": "dict", "v": [["Ter", "#"], ["Foo", "F"], ["ala", "z"]]}, "?"]})
add({"fn": "seq3", "args": [""]}); add({"fn": "seq1", "args": [""]}); add({"fn": "seq3", "args": ["M*", {"$": "dict", "v": []}]}); add({"fn": "seq1", "args": ["MetTer", {"$": "dict", "v": []}]})
add({"fn": "seq3", "args": [5]}); add({"fn": "seq1", "args": [5]}); add({"fn": "seq3", "args": ["AB", None, ""]})
# ---- molecular_weight
for _ in range(100):
    st = rnd.choice(["DNA", "RNA", "protein"])
    alpha = {"DNA": "ACGT", "RNA": "ACGU", "protein": "ACDEFGHIKLMNPQRSTVWY"}[st]
    t = dna(rnd.randint(0, 40), alpha)
    for kw in ({}, {"double_stranded": True}, {"circular": True}, {"monoisotopic": True}, {"double_stranded": True, "circular": True, "monoisotopic": True}):
        add({"fn": "molecular_weight", "args": [t, st], "kw": kw})
    if rnd.random() < .3: add({"fn": "molecular_weight", "args": [S(t), st]})
    if rnd.random() < .3: add({"fn": "molecular_weight", "args": [t.lower(), st]})
    if rnd.random() < .3: add({"fn": "molecular_weight", "args": [" ".join(t[i:i+3] for i in range(0, len(t), 3)) + "\n", st]})
for a in (["ACGU", "DNA"], ["ACGT", "RNA"], ["ACGN", "DNA"], ["ACGX", "protein"], ["", "DNA"], ["", "protein"], ["ACGT", "dna"], ["ACGT", "other"], ["ACGT", None], ["MKV", "protein"], [None], [5], ["AC GT", "DNA"], ["BZ", "protein"]):
    add({"fn": "molecular_weight", "args": a})
add({"fn": "molecular_weight", "args": ["MKV", "protein"], "kw": {"double_stranded": True}}); add({"fn": "molecular_weight", "args": ["ACGU", "RNA"], "kw": {"double_stranded": True}})
add({"fn": "molecular_weight", "args": [REC(S("ACGT"), "r")]}); add({"fn": "molecular_weight", "args": [REC(None, "r")]}); add({"fn": "molecular_weight", "args": [REC(S("MKV"), "r"), "protein"]})
# ---- six_frame_translations
for _ in range(60):
    t = dna(rnd.choice([0, 1, 2, 5, 8, 15, 20, 21, 30, 59, 60, 61, 90, 125, 200]), rnd.choice(["ACGT", "ACGT", "acgt", "ACGU", "ACGTN"]))
    for code in (1, 11, 2):
        add({"fn": "six_frame_translations", "args": [t, code]})
    add({"fn": "six_frame_translations", "args": [t]})
    if rnd.random() < .2: add({"fn": "six_frame_translations", "args": [S(t)]})
for code in ("Standard", "Vertebrate Mitochondrial", 99, "bogus", None, 0): add({"fn": "six_frame_translations", "args": ["ATGGCCATTGTAATGGGCCGC", code]})
add({"fn": "six_frame_translations", "args": [5]}); add({"fn": "six_frame_translations", "args": ["ATGXYZ"]}); add({"fn": "six_frame_translations", "args": ["AUGGCCAUU"]}); add({"fn": "six_frame_translations", "args": ["ATGU"]})
# ---- CodonAdaptationIndex
CODONS = [a + b + c for a in "ACGT" for b in "ACGT" for c in "ACGT"]
SENSE = [c for c in CODONS if c not in ("TAA", "TAG", "TGA")]
for _ in range(40):
    genes = []
    for g in range(rnd.randint(1, 4)):
        body = "ATG" + "".join(rnd.choice(SENSE if rnd.random() < .95 else CODONS) for _ in range(rnd.randint(1, 30)))
        genes.append(rnd.choice([body, S(body), REC(S(body), "g%d" % g), body.lower()]))
    ops = [["calculate", g] for g in genes[:2]] + [["optimize", genes[0]], ["optimize", genes[0], "DNA", False], ["optimize", "MKV*", "protein", False], ["optimize", genes[0], "RNA"], ["calculate", "ATGTGGTAA"]]
    add({"kind": "cai", "seqs": genes, "table": rnd.choice([None, 1, 11, 2, 4]), "ops": ops})
big = [S("ATG" + "".join(rnd.choice(SENSE) for _ in range(900)) + "TAA") for _ in range(3)]
add({"kind": "cai", "seqs": big, "ops": [["calculate", big[0]], ["optimize", big[0], "DNA", False], ["optimize", "MKVLAAGIVG*", "protein", False], ["optimize", "MKVLAAGIVGB", "protein", False], ["optimize", "", "protein"]]})
add({"kind": "cai", "seqs": [], "ops": [["calculate", "ATG"], ["calculate", "AC"], ["optimize", "ATG", "other"]]})
add({"kind": "cai", "seqs": ["ATGAC"], "ops": []}); add({"kind": "cai", "seqs": [REC(S("ATGNNN"), "bad")], "ops": []}); add({"kind": "cai", "seqs": [REC(None, "bad")], "ops": []}); add({"kind": "cai", "seqs": [5], "ops": []})
add({"kind": "cai", "seqs": ["ATGGCCGCC", "ATGGCCGCT", "ATGGCCGCC"], "ops": [["optimize", "AAA", "protein", False], ["optimize", "ATGGCC"], ["calculate", "GCCGCT"], ["calculate", "GC"], ["calculate", "TAA"]]})

json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(f"{len(cases)} cases, {sum('exc' in c for c in cases)} raise -> {os.path.relpath(OUT)}")
