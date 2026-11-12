"""Golden cases for Bio.Align.substitution_matrices -> packages/align/test/golden/matrices.json

Case kinds:
  load      load(name) for every bundled matrix, with its text forms and key lists
  read      substitution_matrices.read(text, dtype)
  array     an Array built from a spec, then a list of operations on it
"""
import json, os, random, warnings
import numpy as np
import Bio
from Bio.Align import substitution_matrices as SM
from Bio.Align.substitution_matrices import Array

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "matrices.json")
rnd = random.Random(8)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e): return None if type(e).__name__ in ("AttributeError", "FileNotFoundError") else (str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e))

def enc(x):
    if isinstance(x, Array):
        return {"$": "arr", "alphabet": x.alphabet if isinstance(x.alphabet, str) else list(x.alphabet), "shape": list(x.shape), "int": bool(np.issubdtype(x.dtype, np.integer)),
                "v": np.asarray(x).ravel().tolist(), "header": getattr(x, "header", None)}
    if isinstance(x, tuple): return {"$": "tuple", "v": [enc(i) for i in x]}
    if isinstance(x, list): return [enc(i) for i in x]
    if isinstance(x, (np.floating, np.integer)): return x.item()
    return x

def key_in(k):
    if isinstance(k, list): return tuple(slice(None) if i is None else i for i in k)
    return slice(None) if k is None else k

def build(spec):
    if "entries" in spec:
        return Array(data={(tuple(k) if isinstance(k, list) else k): v for k, v in spec["entries"]}, dtype=int if spec.get("int") else float)
    a = spec.get("alphabet"); a = tuple(a) if isinstance(a, list) else a
    data = None if spec.get("data") is None else np.array(spec["data"], dtype=float)
    return Array(alphabet=a, dims=spec.get("dims"), data=data, dtype=int if spec.get("int") else float)

def apply(m, op):
    k = op[0]
    if k == "get": return m[key_in(op[1])]
    if k == "set": m[key_in(op[1])] = op[2]; return enc(m)
    if k == "getor": return m.get(key_in(op[1]), op[2])
    if k == "has": return key_in(op[1]) in m
    if k == "keys": return [list(x) if isinstance(x, tuple) else x for x in m.keys()]
    if k == "values": return list(m.values())
    if k == "items": return [[list(a) if isinstance(a, tuple) else a, b] for a, b in m.items()]
    if k == "update": m.update([(key_in(a), b) for a, b in op[1]]); return enc(m)
    if k == "select": return enc(m.select(tuple(op[1]) if op[2] else op[1]))
    if k == "format": return m.format(op[1])
    if k == "str": return str(m)
    raise ValueError(k)

def run(c):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if c["kind"] == "load":
                m = SM.load(c["name"])
                out["matrix"] = enc(m)
                out["text"] = str(m)
                out["forms"] = {f: m.format(f) for f in ("%d", "%.2f", "%5.1f", "%e", "%g", "%s", "%+.0f", "%-4i", "%04.1f")}
                out["keys"] = [list(x) if isinstance(x, tuple) else x for x in m.keys()][:60]
                out["items"] = [[list(a) if isinstance(a, tuple) else a, b] for a, b in list(m.items())[:60]]
                out["rows"] = {l: enc(m[l]) for l in list(m.alphabet)[:3]} if m.ndim == 2 else {}
            elif c["kind"] == "names":
                out["names"] = SM.load()
            elif c["kind"] == "read":
                out["matrix"] = enc(SM.read(__import__("io").StringIO(c["text"]), dtype=int if c.get("int") else float))
            elif c["kind"] == "array":
                m = build(c["spec"]); out["array"] = enc(m); res = []
                out["ops_out"] = res
                for op in c["ops"]:
                    try: res.append({"result": enc(apply(m, op))})
                    except Exception as e: res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
                out["final"] = enc(m)
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out

def add(c):
    c.update(run(c)); cases.append(c)

add({"kind": "names"})
for n in SM.load(): add({"kind": "load", "name": n})
for n in ("BLOSUM63", "Nonexistent", "BLOSUM"): add({"kind": "load", "name": n})

READ = ["#a\nA B\nA 1 2\nB 3 4\n", "A B\nA 1 2\nB 3 4\n", "A 1\nB 2\nC 3\n", "# only\n", "", "A B\nA 1 2\n", "A B\nA 1 x\nB 3 4\n", "A B\nB 1 2\nA 3 4\n", "AA B\nAA 1 2\nB 3 4\n", "A B C\nA 1 2\nB 3 4\nC 5 6 7\n",
        "#h1\n#  h2\n\nA B\nA 1 2\nB 3 4\n", "A B\r\nA 1 2\r\nB 3 4\r\n", "A 1\nB 2.5\n", "A 1\nAA 2\n", "A B\nA 1e1 -2\nB 7 4\n", "A B\nA 1 2 3\nB 3 4\n", "A\nA 1\n", "A 1\n", "X B\nX 1 2\nB 3 4\n"]
for t in READ:
    add({"kind": "read", "text": t}); add({"kind": "read", "text": t, "int": True})

AL = ["ABC", "AB", "ACGT", "ACDEFGHIKLMNPQRSTVWY", ["AA", "BB", "C"], ["X"], "", "A"]
def rand_ops(rnd, alpha, dims):
    letters = list(alpha) if alpha else ["A"]
    def key():
        r = rnd.random()
        if r < .4: return rnd.choice(letters)
        if r < .6: return rnd.randint(-len(letters) - 2, len(letters) + 2)
        if r < .7: return "Z"
        if r < .8: return None
        if r < .9: return "".join(letters[:2]) if isinstance(alpha, str) else "AB"
        return rnd.choice(letters)
    ops = []
    for _ in range(rnd.randint(4, 10)):
        t = rnd.choice(["get", "get", "get2", "set", "set2", "getor", "has", "keys", "values", "items", "select", "format", "str", "update", "setrow"])
        if t == "get": ops.append(["get", key()])
        elif t == "get2": ops.append(["get", [key(), key()]])
        elif t == "set": ops.append(["set", key(), rnd.choice([1, 2.5, -3.7, 0, 100])])
        elif t == "set2": ops.append(["set", [key(), key()], rnd.choice([1, 2.5, -3.7, 0, 100])])
        elif t == "setrow": ops.append(["set", key(), [rnd.randint(0, 5) for _ in range(rnd.choice([len(letters), len(letters), 1, 2]))]])
        elif t == "getor": ops.append(["getor", key() if dims == 1 else [key(), key()], -99])
        elif t == "has": ops.append(["has", rnd.choice(letters) if dims == 1 else [rnd.choice(letters), rnd.choice(letters)]])
        elif t in ("keys", "values", "items", "str"): ops.append([t])
        elif t == "select":
            sub = rnd.sample(letters, rnd.randint(0, len(letters))) + rnd.choice([[], ["Q"]])
            ops.append(["select", "".join(sub) if isinstance(alpha, str) else sub, not isinstance(alpha, str)])
        elif t == "format": ops.append(["format", rnd.choice(["", "%d", "%.3f", "%5.1f", "%s", "%e", "%g", "%i", "%x", "%y", "%", "abc", "%d %d", "%%", "%5%", "% d", "%+d", "%08.2f"])])
        elif t == "update": ops.append(["update", [[key() if dims == 1 else [key(), key()], rnd.randint(0, 9)] for _ in range(rnd.randint(0, 3))]])
    return ops
for alpha in AL:
    for dims in (1, 2, None, 3, 0):
        for isint in (False, True):
            for with_data in (False, True):
                n = len(alpha)
                spec = {"alphabet": alpha, "dims": dims, "int": isint}
                if with_data:
                    d = dims or 1
                    spec["data"] = [rnd.randint(-5, 9) + rnd.choice([0, .5]) for _ in range(n)] if d == 1 else [[rnd.randint(-5, 9) + rnd.choice([0, .5]) for _ in range(n)] for _ in range(n)]
                    if rnd.random() < .2: spec["data"] = spec["data"][:-1] if d == 1 else spec["data"][:-1]
                add({"kind": "array", "spec": spec, "ops": rand_ops(rnd, alpha, dims if dims in (1, 2) else 1)})
add({"kind": "array", "spec": {"alphabet": None, "dims": 1}, "ops": [["get", "A"], ["get", "Z"], ["keys"]]})
add({"kind": "array", "spec": {"alphabet": 5, "dims": 1}, "ops": []})
for ent in ([[["A", "B"], 1], [["B", "A"], 2]], [[["A", "A"], 3]], [[["AA", "B"], 1]], [["A", 1]], [], [[["A"], 1]], [[["A", "B", "C"], 1]], [[["A", "B"], 1], ["A", 2]], [[["B", "A"], 1.5]]):
    for isint in (False, True): add({"kind": "array", "spec": {"entries": ent, "int": isint}, "ops": rand_ops(rnd, "AB", 2) if ent and isinstance(ent[0][0], list) else []})
add({"kind": "array", "spec": {"entries": [[["A", "B"], 1]], "alphabet": "AB"}, "ops": []})
# real matrices: indexing sweeps
for n in ("BLOSUM62", "NUC.4.4", "PAM250"):
    m = SM.load(n); a = list(m.alphabet)
    add({"kind": "array", "spec": {"alphabet": "".join(a), "dims": 2, "data": np.asarray(m).tolist()}, "ops": [["get", [x, y]] for x in a[:4] for y in a[:4]] + [["get", "A"], ["get", -1], ["format", "%d"], ["select", "ARND", False]]})
json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(len(cases), "cases ->", os.path.relpath(OUT))
