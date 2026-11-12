"""Golden cases for Bio.Align.MultipleSeqAlignment.

Output: packages/align/test/golden/msa.json
A case builds an alignment from records (and optional annotations) and applies a list of operations in order;
every operation's outcome (result or exception) and the final state are recorded.
"""
import json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import Bio
from Bio.Align import MultipleSeqAlignment as MSA
from Bio.SeqRecord import SeqRecord
from codec import S, M, U, LST
from codec_feature import enc, dec, REC

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "msa.json")
rnd = random.Random(101)

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def enc_msa(a):
    col = a._per_col_annotations
    return {"$": "msa", "records": [enc(r) for r in a], "annotations": enc(a.annotations),
            "column": None if col is None else [[k, enc(v)] for k, v in col.items()]}

def enc_any(x):
    if isinstance(x, MSA): return enc_msa(x)
    return enc(x)

def spec(s):
    if s[0] == "i": return s[1]
    return slice(*s[1:])

def apply(a, op):
    k = op[0]
    if k == "len": return len(a)
    if k == "align_len": return a.get_alignment_length()
    if k == "str": return str(a)
    if k == "ids": return [r.id for r in a]
    if k == "get": return a[spec(op[1])]
    if k == "get2": return a[spec(op[1]), spec(op[2])]
    if k == "append": a.append(dec(op[1])); return None
    if k == "extend": a.extend([dec(r) for r in op[1]]); return None
    if k == "extend_gen": a.extend(iter([dec(r) for r in op[1]])); return None
    if k == "add": return a + MSA([dec(r) for r in op[1]], annotations={x: y for x, y in op[2]} if len(op) > 2 else None)
    if k == "add_other": return a + op[1]
    if k == "delete": del a[spec(op[1])]; return None
    if k == "sort": a.sort(*[(lambda r: len(r.description)) if op[1] == "desc" else None][:1], reverse=op[2]) if op[1] else a.sort(reverse=op[2]); return None
    if k == "set_column": a.column_annotations = {x: dec(y) for x, y in op[1]}; return None
    if k == "col_set": a.column_annotations[op[1]] = dec(op[2]); return None
    if k == "format": return format(a, op[1])
    raise ValueError(k)

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            kw = {}
            if "annotations" in case: kw["annotations"] = {x: dec(y) for x, y in case["annotations"]} if case["annotations"] is not None else None
            if "column_annotations" in case: kw["column_annotations"] = {x: dec(y) for x, y in case["column_annotations"]}
            if case.get("annotations_bad"): kw["annotations"] = [1]
            records = [dec(r) for r in case["records"]] if case.get("kind") != "gen" else iter([dec(r) for r in case["records"]])
            a = MSA(records, **kw)
        except Exception as e:
            out["ctor_exc"] = {"type": tname(e), "msg": emsg(e)}
            out["warnings"] = [str(x.message) for x in w]
            return out
        out["ops_out"] = []
        for op in case["ops"]:
            try:
                r = apply(a, op)
                out["ops_out"].append({"result": enc_any(r) if r is not None or op[0] not in ("append", "extend", "delete", "sort", "set_column", "col_set", "extend_gen") else None})
            except Exception as e:
                out["ops_out"].append({"exc": {"type": tname(e), "msg": emsg(e)}})
        out["state"] = enc_msa(a)
    out["warnings"] = [str(x.message) for x in w]
    return out

cases, seen = [], set()
def add(c):
    k = json.dumps(c, sort_keys=True)
    if k in seen: return
    seen.add(k); c.update(run(c)); cases.append(c)

def R(i, L, seq=None, id=None, ann=(), letter=None):
    return REC(S(seq if seq is not None else "".join(rnd.choice("ACGT-") for _ in range(L))), id or "r%d" % i, "n%d" % i, "d%d" % i, annotations=[list(x) for x in ann], letter=letter)

SPECS = [("i", 0), ("i", -1), ("i", 5), ("i", -9), ("s", None, None, None), ("s", 1, 3, None), ("s", None, None, -1), ("s", 0, 2, 2), ("s", -2, None, None), ("s", 5, 1, None)]
COLS = [("i", 0), ("i", -1), ("i", 99), ("s", None, None, None), ("s", 1, 4, None), ("s", None, None, -1), ("s", 2, 100, 2)]
for _ in range(60):
    n = rnd.randint(0, 5); L = rnd.randint(1, 12)
    recs = [R(i, L, letter=[["q", LST(*range(L))]] if rnd.random() < .3 else None) for i in range(n)]
    ops = [["len"], ["align_len"], ["str"], ["ids"]]
    ops += [["get", list(s)] for s in rnd.sample(SPECS, 4)]
    ops += [["get2", list(rnd.choice(SPECS)), list(rnd.choice(COLS))] for _ in range(6)]
    ops += [["append", R(9, L)], ["append", R(8, L + 1)], ["append", 5], ["extend", [R(7, L), R(6, L)]], ["extend", [R(5, L), R(4, L + 2)]], ["extend_gen", [R(3, L)]],
            ["add", [R(1, 3) for _ in range(len(recs))]], ["add", [R(1, 3)]], ["add_other", 5], ["delete", ["i", 0]], ["delete", ["s", None, None, 2]], ["sort", None, False], ["sort", None, True], ["sort", "desc", False], ["ids"], ["align_len"], ["format", ""], ["str"]]
    kw = {}
    if rnd.random() < .3: kw["annotations"] = [["name", "aln"], ["n", n]]
    add(dict({"records": recs, "ops": ops}, **kw))
# annotations, column annotations and errors
base = [R(0, 6, "ACGT-A"), R(1, 6, "AC-TTA")]
add({"records": base, "annotations": [["a", 1], ["b", "x"]], "ops": [["add", [R(2, 2, "GG"), R(3, 2, "TT")], [["a", 1], ["b", "y"], ["c", 2]]], ["col_set", "cons", "ABCDEF"], ["col_set", "bad", "AB"], ["get2", ["s", None, None, None], ["s", 1, 4, None]], ["get", ["s", 0, 1, None]], ["add", [R(2, 2, "GG"), R(3, 2, "TT")]], ["state"]] if False else [["col_set", "cons", "ABCDEF"], ["col_set", "bad", "AB"], ["get2", ["s", None, None, None], ["s", 1, 4, None]], ["get", ["s", 0, 1, None]], ["get", ["s", None, None, None]], ["add", [R(2, 2, "GG"), R(3, 2, "TT")]]]})
add({"records": base, "column_annotations": [["cons", "ABCDEF"]], "ops": [["add", [R(2, 2, "GG"), R(3, 2, "TT")]], ["get2", ["s", None, None, None], ["s", 1, 4, None]], ["str"]]})
add({"records": base, "column_annotations": [["cons", "AB"]], "ops": []})
add({"records": [], "column_annotations": [["cons", "AB"]], "ops": []})
add({"records": [], "ops": [["len"], ["align_len"], ["str"], ["append", R(0, 4)], ["len"], ["extend", []], ["set_column", [["x", "ABCD"]]], ["set_column", [["x", "AB"]]]]})
add({"records": [R(0, 4), R(1, 5)], "ops": []})
add({"records": [5], "ops": []})
add({"records": ["ACGT"], "ops": []})
add({"records": [R(0, 4)], "annotations_bad": True, "ops": []})
add({"records": [R(0, 4), R(1, 4)], "kind": "gen", "ops": [["len"]]})
add({"records": [REC(None, "none", "n", "d")], "ops": [["len"], ["align_len"], ["str"]]})
add({"records": [R(0, 4), REC(None, "none", "n", "d")], "ops": [["align_len"]]})
add({"records": [R(0, 60, "ACGT" * 15), R(1, 60, "ACGT" * 15, "x" * 5)], "ops": [["str"]]})
add({"records": [R(i, 4, "ACGT") for i in range(25)], "ops": [["str"], ["len"], ["get", ["s", 3, 20, 4]], ["delete", ["s", 0, 24, None]], ["len"]]})
add({"records": [R(0, 4, "ACGT", "b"), R(1, 4, "ACGT", "a"), R(2, 4, "ACGT", "c")], "ops": [["sort", None, False], ["ids"], ["sort", None, True], ["ids"], ["sort", "desc", True], ["ids"]]})

json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(f"{len(cases)} cases -> {os.path.relpath(OUT)}")
