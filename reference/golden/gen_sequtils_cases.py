"""Golden cases for Bio.SeqUtils.

Output: packages/seqtools/test/golden/sequtils.json
Each case is {"fn": name, "args": [...]} (codec_feature-encoded) with "result" or "exc" and "warnings",
or {"kind": "cai", ...} for CodonAdaptationIndex.
"""
import json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
from Bio import SeqUtils as SU
from Bio.SeqUtils import CheckSum, lcc, ProtParam, ProtParamData, IsoelectricPoint, MeltingTemp
import contextlib, io
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
            if c.get("kind") in ("pa", "ip"):
                err = io.StringIO()
                with contextlib.redirect_stderr(err):
                    try:
                        if c["kind"] == "pa": obj = ProtParam.ProteinAnalysis(dec(c["seq"]), *c.get("args", []))
                        else: obj = IsoelectricPoint.IsoelectricPoint(dec(c["seq"]), *[dec(a) for a in c.get("args", [])])
                        out["ctor"] = "ok"
                    except Exception as e:
                        obj = None; out["ctor"] = {"type": tname(e), "msg": emsg(e)}
                    out["ops_out"] = []
                    for op in c.get("ops", []) if obj is not None else []:
                        before = err.tell()
                        try:
                            args = [getattr(ProtParamData, a["$scale"]) if isinstance(a, dict) and "$scale" in a else dec(a) for a in op[1:]]
                            if op[0] == "amino_acids_percent": r = obj.amino_acids_percent
                            else: r = getattr(obj, op[0])(*args)
                            out["ops_out"].append({"result": enc(r), "stderr": err.getvalue()[before:]})
                        except Exception as e:
                            out["ops_out"].append({"exc": {"type": tname(e), "msg": emsg(e)}, "stderr": err.getvalue()[before:]})
            elif c.get("kind") == "cai":
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
                def arg(a):
                    if isinstance(a, dict) and "$table" in a: return getattr(MeltingTemp, a["$table"])
                    if isinstance(a, dict) and a.get("$") == "dict" and c["fn"] in ("Tm_NN", "Tm_GC", "make_table"):     # table dicts hold tuples
                        return {k: tuple(v) for k, v in dec(a).items()}
                    return dec(a)
                kw = {k: arg(v) for k, v in c.get("kw", {}).items()}
                out["result"] = enc(next(getattr(m, c["fn"]) for m in (SU, CheckSum, lcc, MeltingTemp) if hasattr(m, c["fn"]))(*[arg(a) for a in c["args"]], **kw))
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
# ---- CheckSum
from codec import B
for _ in range(60):
    t = dna(rnd.randint(0, 150), rnd.choice(["ACGT", "acgt", "ACGTN-*", "ACGTacgtéß日"]))
    for fn in ("crc32", "crc64", "gcg", "seguid"):
        add({"fn": fn, "args": [t]})
        if not t.isascii(): continue      # Seq objects hold ASCII only
        add({"fn": fn, "args": [S(t)]})
        if rnd.random() < .3: add({"fn": fn, "args": [M(t)]})
        if rnd.random() < .3: add({"fn": fn, "args": [B(t)]})
for fn in ("crc32", "crc64", "gcg", "seguid"):
    for a in ("", "A", "ACGT" * 15, "a" * 57, "a" * 58, "a" * 114, "ß", "ǆ", 5, 0, -1, None, 1.5, LST(65, 66), LST(300), LST("a")):
        add({"fn": fn, "args": [a]})
    add({"fn": fn, "args": [B("")]}); add({"fn": fn, "args": [B("ACGT")]}); add({"fn": fn, "args": [{"$": "Seq", "undef": 3}]})
# ---- lcc
for _ in range(60):
    t = dna(rnd.randint(0, 120), rnd.choice(["ACGT", "acgt", "ACGTN", "AC", "A"]))
    add({"fn": "lcc_simp", "args": [t]}); add({"fn": "lcc_simp", "args": [S(t)]})
    for w in (1, 2, 3, 5, 10, 25):
        add({"fn": "lcc_mult", "args": [t, w]})
    if rnd.random() < .2: add({"fn": "lcc_mult", "args": [S(t), 4]})
for a in ([ "", 4], ["ACGT", 0], ["ACGT", -1], ["ACGT", 4], ["ACGT", 5], ["ACGT", 1.5], ["ACGT", None], ["ACGT", "3"], ["ACGTN", 2], ["NNNN", 2], ["ANAN", 2], ["AAAAC", 3], ["ACGTACGTAC", 3], [5, 2], [None, 2]):
    add({"fn": "lcc_mult", "args": a})
for t in ("", "A", "AAAA", "ACGT", "acgt", "NNNN", "ACGTN"): add({"fn": "lcc_simp", "args": [t]})
add({"fn": "lcc_simp", "args": [5]}); add({"fn": "lcc_simp", "args": [None]})
# ---- MeltingTemp
NN_NAMES = ["DNA_NN1", "DNA_NN2", "DNA_NN3", "DNA_NN4", "RNA_NN1", "RNA_NN2", "RNA_NN3", "R_DNA_NN1"]
def mseq(n, alpha="ACGT"): return dna(n, alpha)
for _ in range(80):
    t = mseq(rnd.randint(0, 40), rnd.choice(["ACGT", "ACGT", "acgt", "ACGU", "ACGTN", "ACGTBDHKMNRVYWS", "AC GT\n", "ACGTX"]))
    for kw in ({}, {"check": False}, {"strict": False}):
        add({"fn": "Tm_Wallace", "args": [t], "kw": kw})
    if rnd.random() < .3: add({"fn": "Tm_Wallace", "args": [S(t)]})
for _ in range(120):
    t = mseq(rnd.randint(0, 50), rnd.choice(["ACGT", "ACGT", "acgt", "ACGU", "ACGTX", "ACGTN", "ACGTBDHKMNRVYWS"]))
    kw = {}
    if rnd.random() < .5: kw["strict"] = rnd.random() < .5
    if rnd.random() < .5: kw["valueset"] = rnd.choice([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1])
    if rnd.random() < .2: kw["userset"] = rnd.choice([LST(80.0, 0.4, 600, 1), LST(1, 2, 3), LST(1, 2, 3, 4, 5), LST()])
    if rnd.random() < .5: kw["Na"] = rnd.choice([0, 20, 50, 100.5])
    if rnd.random() < .3: kw["K"] = rnd.choice([0, 10, 50])
    if rnd.random() < .3: kw["Tris"] = rnd.choice([0, 10, 20])
    if rnd.random() < .3: kw["Mg"] = rnd.choice([0, 1.5, 2, 5])
    if rnd.random() < .3: kw["dNTPs"] = rnd.choice([0, 0.2, 0.8, 3])
    if rnd.random() < .5: kw["saltcorr"] = rnd.choice([0, 1, 2, 3, 4, 5, 6, 7, 8])
    if rnd.random() < .3: kw["mismatch"] = False
    if rnd.random() < .1: kw["check"] = False
    add({"fn": "Tm_GC", "args": [t], "kw": kw})
for _ in range(220):
    n = rnd.randint(2, 40)
    t = mseq(n, rnd.choice(["ACGT", "ACGT", "ACGT", "acgt", "ACGU", "ACGTI", "ACGTN", "ACGTX"]))
    tab = rnd.choice(NN_NAMES)
    kw = {"nn_table": {"$table": tab}} if rnd.random() < .7 else {}
    if rnd.random() < .3:
        comp = list(t.translate(str.maketrans("ACGTacgtU", "TGCAtgcaA")))
        for _ in range(rnd.randint(0, 3)):
            if comp: comp[rnd.randrange(len(comp))] = rnd.choice("ACGT")
        if rnd.random() < .3: comp = comp[rnd.randint(0, 3):]
        kw["c_seq"] = "".join(comp)
    if rnd.random() < .3: kw["shift"] = rnd.choice([-2, -1, 1, 2, 3, 0, 1.5])
    if rnd.random() < .3: kw["strict"] = False
    if rnd.random() < .2: kw["selfcomp"] = True
    if rnd.random() < .3: kw["dnac1"] = rnd.choice([25, 50, 250, 0, 12.5])
    if rnd.random() < .3: kw["dnac2"] = rnd.choice([25, 0, 50, 100])
    if rnd.random() < .4: kw["saltcorr"] = rnd.choice([0, 1, 2, 3, 4, 5, 6, 7, 8])
    if rnd.random() < .4: kw["Na"] = rnd.choice([0, 20, 50, 150])
    if rnd.random() < .3: kw["K"] = rnd.choice([0, 20, 50])
    if rnd.random() < .3: kw["Tris"] = rnd.choice([0, 10, 20])
    if rnd.random() < .3: kw["Mg"] = rnd.choice([0, 1.5, 2, 5])
    if rnd.random() < .3: kw["dNTPs"] = rnd.choice([0, 0.2, 0.8])
    if rnd.random() < .2: kw["check"] = False
    if rnd.random() < .15: kw["tmm_table"] = {"$table": "DNA_TMM1"}
    if rnd.random() < .15: kw["imm_table"] = {"$table": "DNA_IMM1"}
    if rnd.random() < .15: kw["de_table"] = {"$table": "RNA_DE1"}
    add({"fn": "Tm_NN", "args": [t], "kw": kw})
for t, kw in (("CGTTCCAAAGATGTGGGCATGAGCTTAC", {}), ("CGTTCCAAAGATGTGGGCATGAGCTTAC", {"c_seq": "GCAAGGTTTCTACACCCGTACTCGAATG"}), ("ACGT", {"nn_table": {"$": "dict", "v": []}}), ("ACGT", {"nn_table": {"$": "dict", "v": [["AC/TG", LST(1, 2)]]}}),
              ("ACGT", {"nn_table": {"$": "dict", "v": [["init", LST(0, 0)]]}, "strict": False}), ("", {}), ("A", {}), ("AAAAAAAA", {}), ("TTTTTTTT", {}), ("ACGTACGT", {"shift": 100}), ("ACGT", {"c_seq": ""}), ("ACGT", {"c_seq": S("TGCA")}), (S("ACGTAC"), {})):
    add({"fn": "Tm_NN", "args": [t], "kw": kw})
for _ in range(150):
    kw = {}
    for k, vals in (("Na", [0, 20, 50, 150]), ("K", [0, 10, 50]), ("Tris", [0, 10, 20]), ("Mg", [0, 1.5, 5]), ("dNTPs", [0, 0.2, 0.8, 8])):
        if rnd.random() < .5: kw[k] = rnd.choice(vals)
    kw["method"] = rnd.choice([0, 1, 2, 3, 4, 5, 6, 7, 8, 2.5])
    if rnd.random() < .8: kw["seq"] = mseq(rnd.randint(0, 40))
    add({"fn": "salt_correction", "args": [], "kw": kw})
for _ in range(60):
    add({"fn": "chem_correction", "args": [rnd.choice([50.0, 62.5, 70, -5])], "kw": {k: v for k, v in (("DMSO", rnd.choice([0, 3, 10])), ("fmd", rnd.choice([0, 5, 20])), ("fmdmethod", rnd.choice([1, 2, 3])), ("GC", rnd.choice([None, 40, 60.5, -1])), ("DMSOfactor", rnd.choice([0.75, 0.6])), ("fmdfactor", rnd.choice([0.65, 0.5]))) if rnd.random() < .6}})
add({"fn": "make_table", "args": []}); add({"fn": "make_table", "args": [{"$table": "DNA_NN3"}]}); add({"fn": "make_table", "args": [None, {"$": "dict", "v": [["AA/TT", LST(-1, -2)], ["new", LST(3, 4)]]}]})
add({"fn": "make_table", "args": [{"$table": "DNA_NN3"}, {"$": "dict", "v": [["init", LST(9, 9)]]}]}); add({"fn": "make_table", "args": [None, {"$": "dict", "v": []}]})
# ---- ProteinAnalysis / IsoelectricPoint
PROT = "ACDEFGHIKLMNPQRSTVWY"
PALL = PROT + "BXZUO*-"
def pops():
    return [["count_amino_acids"], ["amino_acids_percent"], ["molecular_weight"], ["aromaticity"], ["instability_index"], ["flexibility"], ["gravy"], ["gravy", "Jones"], ["gravy", "Bogus"],
            ["protein_scale", {"$scale": "kd"}, 9], ["protein_scale", {"$scale": "kd"}, 5, 0.4], ["protein_scale", {"$scale": "hw"}, 7, 0.25], ["protein_scale", {"$scale": "kd"}, 1], ["protein_scale", {"$scale": "kd"}, 0],
            ["protein_scale", {"$scale": "kd"}, 2.5], ["protein_scale", {"$scale": "kd"}, 4], ["isoelectric_point"], ["charge_at_pH", 7.0], ["charge_at_pH", 2], ["charge_at_pH", 14.5], ["charge_at_pH", 400], ["charge_at_pH", -400],
            ["secondary_structure_fraction"], ["molar_extinction_coefficient"]]
for _ in range(70):
    t = dna(rnd.randint(0, 120), rnd.choice([PROT, PROT, PROT.lower(), PALL]))
    add({"kind": "pa", "seq": t, "ops": pops()})
    if rnd.random() < .3: add({"kind": "pa", "seq": S(t), "args": [True], "ops": pops()})
for t in ("", "A", "AC", "MKVL", "ACDEFGHIKLMNPQRSTVWY" * 3, "MAEGEITTFTALTEKFNLPPGNYKKPKLLYCSNGGHFLRILPDGTVDGTRDRSDQHIQLQLSAESVGEVYIKSTETGQYLAMDTDGLLYGSQTPNEECLFLERLEENHYNTYISKKHAEKNWFVGLKKNGSCKRGPRTHYGQKAILFLPLPVSSD", "KKKKKKKK", "DDDDEEEE", "CCCCYYYY"):
    add({"kind": "pa", "seq": t, "ops": pops()}); add({"kind": "pa", "seq": t, "args": [True], "ops": pops()})
add({"kind": "pa", "seq": 5, "ops": []}); add({"kind": "pa", "seq": None, "ops": []})
add({"kind": "pa", "seq": "MKVLAAGIVGLLAGKKDE", "ops": [["protein_scale", {"$": "dict", "v": [["M", 1.0], ["K", 2.0]]}, 3], ["protein_scale", {"$": "dict", "v": []}, 3, 0.5]]})
for _ in range(60):
    t = dna(rnd.randint(0, 80), rnd.choice([PROT, PROT.lower(), PALL]))
    ops = [["charge_at_pH", 7.0], ["charge_at_pH", 1], ["charge_at_pH", 13], ["charge_at_pH", 400], ["pi"], ["pi", 5.0], ["pi", 7.775, 3.0, 9.0], ["pi", 7.775, 4.05, 4.06], ["pi", 8, 4, 12]]
    add({"kind": "ip", "seq": t, "ops": ops})
    if rnd.random() < .3: add({"kind": "ip", "seq": S(t), "ops": ops[:5]})
    cont = {"$": "dict", "v": [[aa, rnd.randint(0, 5)] for aa in PROT]}
    add({"kind": "ip", "seq": t, "args": [cont], "ops": ops[:5]})
add({"kind": "ip", "seq": "ACDK", "args": [{"$": "dict", "v": [["K", 1]]}], "ops": []}); add({"kind": "ip", "seq": "", "ops": []}); add({"kind": "ip", "seq": "ACD", "args": [{"$": "dict", "v": []}], "ops": [["pi"]]})
add({"kind": "ip", "seq": "MKVLAAGIVG", "args": [None], "ops": [["pi"]]}); add({"kind": "ip", "seq": 5, "ops": []})
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
