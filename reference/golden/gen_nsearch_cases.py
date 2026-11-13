"""Golden cases for Bio.PDB.kdtrees, Bio.PDB.NeighborSearch and Bio.PDB.Selection -> packages/pdb/test/golden/nsearch.json

`kdtree` cases run searches on a raw KDTree; `ns` cases build a NeighborSearch over atoms of a parsed PDB text.
Pair lists above atom level come out of a Python set (hash order, different on every run), so they are recorded sorted.
"""
import io, json, math, os, random, warnings
import numpy as np
from Bio.PDB import PDBParser
from Bio.PDB.kdtrees import KDTree, Point, Neighbor
import importlib
NS = importlib.import_module("Bio.PDB.NeighborSearch").NeighborSearch
from Bio.PDB.Selection import unfold_entities, get_unique_parents, uniqueify
from pdb_encode import tname, emsg
from pdb_text import gen_pdb
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "nsearch.json")
rnd = random.Random(99)
cases = []

def num(x):
    x = float(x)
    return "nan" if math.isnan(x) else x

def fid(e): return json.loads(json.dumps(e.get_full_id()))

def run_kd(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            t = KDTree(np.array(case["coords"], dtype="d"), case["bucket"])
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}; out["warnings"] = []; return out
        for op in case["ops"]:
            try:
                if op[0] == "search": r = [[p.index, num(p.radius)] for p in t.search(np.array(op[1], dtype="d"), op[2])]
                elif op[0] == "neighbor": r = [[n.index1, n.index2, num(n.radius)] for n in t.neighbor_search(op[1])]
                elif op[0] == "simple": r = [[n.index1, n.index2, num(n.radius)] for n in t.neighbor_simple_search(op[1])]
                elif op[0] == "repr":
                    ps = t.search(np.array(op[1], dtype="d"), op[2]); ns = t.neighbor_search(op[2]); r = [repr(p) for p in ps[:5]] + [repr(n) for n in ns[:5]]
                out["ops_out"].append({"result": r})
            except Exception as e:
                out["ops_out"].append({"exc": {"type": tname(e), "msg": emsg(e)}})
        out["warnings"] = [str(x.message) for x in w]
    return out

def parse(text):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(text))

def atom_list(s, mode, indices):
    """The atoms a case searches: all (wrappers included), all with alternatives unpacked, or a subset by index."""
    if mode == "unpacked": return [a for m in s for c in m for r in c.get_unpacked_list() for a in r.get_unpacked_list()]
    atoms = list(s.get_atoms())
    return atoms if mode == "all" else [atoms[i] for i in indices]

def run_ns(case):
    out = {"ops_out": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        s = parse(case["text"])
        try:
            ns = NS(atom_list(s, case["mode"], case.get("indices")), case["bucket"])
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}; out["warnings"] = []; return out
        for op in case["ops"]:
            try:
                if op[0] == "search":
                    r = [fid(e) for e in ns.search(np.array(op[1], dtype="d"), op[2], op[3])]
                else:
                    r = [[fid(a), fid(b)] for a, b in ns.search_all(op[1], op[2])]
                    if op[2] != "A": r = sorted(r, key=json.dumps)
                out["ops_out"].append({"result": r})
            except Exception as e:
                out["ops_out"].append({"exc": {"type": tname(e), "msg": emsg(e)}})
        out["warnings"] = [str(x.message) for x in w]
    return out

def node(s, path):
    x = s
    for i in path: x = x.child_list[i]
    return x

def run_sel(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        s = parse(case["text"])
        ents = [node(s, p) for p in case["paths"]]
        try:
            if case["fn"] == "unfold":
                arg = ents[0] if case["single"] else ents
                r = [fid(e) for e in unfold_entities(arg, case["level"])]
            elif case["fn"] == "parents":
                r = sorted((fid(e) for e in get_unique_parents(ents)), key=json.dumps)
            else:
                r = sorted((fid(e) for e in uniqueify(ents + ents)), key=json.dumps)
            out["result"] = r
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
        out["warnings"] = [str(x.message) for x in w]
    return out


def add(fn, c):
    res = run_isolated(fn, c)
    if res is None: return
    c.update(res); cases.append(c)

# ---- raw KDTree ----
for _ in range(500):
    n = rnd.choice([1, 2, 3, 5, 8, 15, 30, 60, 120])
    scale = rnd.choice([5, 20, 50])
    coords = [[round(rnd.uniform(-scale, scale), 7) for _ in range(3)] for _ in range(n)]
    ops = []
    for _ in range(rnd.randint(2, 6)):
        k = rnd.choice(["search", "search", "neighbor", "simple"])
        r = rnd.choice([0.5, 2.0, 5.0, 10.0, 25.0, 100.0, 0.0, -1.0]) if rnd.random() < 0.95 else rnd.choice([1e-9, 1e7])
        if k == "search": ops.append(["search", rnd.choice([rnd.choice(coords), [rnd.uniform(-scale, scale) for _ in range(3)], [0.0, 0.0, 0.0]]), r])
        else: ops.append([k, r])
    add(run_kd, {"kind": "kdtree", "coords": coords, "bucket": rnd.choice([1, 2, 3, 5, 10, 20]), "ops": ops})
# Point and Neighbor objects built directly (their repr raises SystemError on this Python build, so it is not recorded)
for args in ([3], [3, 1.5], [0, 0.0], [7, 2.25]):
    cases.append({"kind": "point", "args": args, "result": [Point(*args).index, Point(*args).radius]})
for args in ([1, 2], [1, 2, 3.5], [9, 4, 0.5]):
    cases.append({"kind": "neighbor", "args": args, "result": [Neighbor(*args).index1, Neighbor(*args).index2, Neighbor(*args).radius]})
# bad construction and queries
add(run_kd, {"kind": "kdtree", "coords": [[0, 0, 0], [1, 1, 1]], "bucket": 0, "ops": []})
add(run_kd, {"kind": "kdtree", "coords": [[0, 0, 0], [1e6, 1, 1]], "bucket": 2, "ops": []})
add(run_kd, {"kind": "kdtree", "coords": [[0, 0, 0], [-1e6, 1, 1]], "bucket": 2, "ops": []})
add(run_kd, {"kind": "kdtree", "coords": [[0, 0, 0], [999999.5, 1, -999999.5]], "bucket": 1, "ops": [["search", [0, 0, 0], 1e6], ["neighbor", 2e6]]})
add(run_kd, {"kind": "kdtree", "coords": [[0, 0, 0], [1, 1, 1]], "bucket": 1, "ops": [["search", [0, 0], 1.0], ["search", [0, 0, 0, 0], 1.0]]})

# ---- NeighborSearch ----
def has_ties(atoms):
    c = np.array([a.get_coord() for a in atoms], dtype="d")
    return any(len(set(c[:, d])) != len(c) for d in range(3))

n_ns = 0
while n_ns < 800:
    text = gen_pdb(rnd, False)
    s = parse(text)
    mode = rnd.choice(["all", "unpacked", "subset"])
    total = len(list(s.get_atoms()))
    indices = sorted(rnd.sample(range(total), min(total, rnd.randint(2, 40)))) if mode == "subset" else None
    atoms = atom_list(s, mode, indices)
    if len(atoms) < 2 or has_ties(atoms): continue
    ctr = [a.get_coord().tolist() for a in atoms]
    ops = []
    for _ in range(rnd.randint(2, 6)):
        lvl = rnd.choice(["A", "A", "R", "C", "M", "S"])
        rad = rnd.choice([1.0, 5.0, 12.0, 30.0, 80.0])
        if rnd.random() < 0.5: ops.append(["search", rnd.choice([rnd.choice(ctr), [rnd.uniform(-90, 90) for _ in range(3)]]), rad, lvl])
        else: ops.append(["search_all", rad, lvl])
    n_ns += 1
    add(run_ns, {"kind": "ns", "text": text, "mode": mode, "indices": indices, "bucket": rnd.choice([2, 3, 5, 10]), "ops": ops})

# ---- Selection functions ----
for _ in range(400):
    text = gen_pdb(rnd, False)
    s = parse(text)
    depth = rnd.choice([0, 1, 2, 3, 4])
    pool = []
    stack = [([], s)]
    while stack:
        p, x = stack.pop()
        if len(p) == depth: pool.append(p)
        elif hasattr(x, "child_list"):
            for i, c in enumerate(x.child_list): stack.append((p + [i], c))
    if not pool: continue
    paths = rnd.sample(pool, min(len(pool), rnd.randint(1, 6)))
    if rnd.random() < 0.1: paths.append(rnd.choice([[], [0], [0, 0]]))   # mix levels
    fn = rnd.choice(["unfold", "unfold", "unfold", "parents", "unique"])
    add(run_sel, {"kind": "sel", "text": text, "fn": fn, "paths": paths, "single": len(paths) == 1 and rnd.random() < 0.5, "level": rnd.choice(["A", "R", "C", "M", "S", "X", "", "a"])})
add(run_sel, {"kind": "sel", "text": gen_pdb(rnd, False), "fn": "unfold", "paths": [], "single": False, "level": "A"})

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
