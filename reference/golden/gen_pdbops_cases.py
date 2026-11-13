"""Golden cases for Bio.PDB entity operations on parsed structures: transform, center_of_mass, get_vector, setters,
iterators, item access and the DisorderedAtom/DisorderedResidue methods -> packages/pdb/test/golden/pdbops.json

A case is a PDB text and a list of operations `[name, path, ...]`; `path` indexes `child_list` from the structure.
Each operation records its result or exception; `transform` returns every atom's coordinates and dtype afterwards.
"""
import io, json, math, os, random, warnings
import numpy as np
from Bio.PDB import PDBParser
from pdb_encode import tname, emsg
from pdb_text import gen_pdb
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "pdbops.json")
rnd = random.Random(66)
cases = []
SPECIAL = {"nan": float("nan"), "inf": float("inf"), "-inf": float("-inf")}

def num(x):
    x = float(x)
    return "nan" if math.isnan(x) else "inf" if x == math.inf else "-inf" if x == -math.inf else x
def arr(a): return {"dtype": str(a.dtype), "arr": [num(v) for v in a]}
def key_py(k): return tuple(k) if isinstance(k, list) else k
def val(v): return SPECIAL.get(v, v) if isinstance(v, str) else v

def node(s, path):
    x = s
    for i in path: x = x.child_list[i]
    return x

def atoms_state(s):
    out = []
    for m in s.child_list:
        for c in m.child_list:
            for r in c.get_unpacked_list():
                for a in r.get_unpacked_list(): out.append(arr(np.asarray(a.coord)))
    return out

def dtype_arr(spec, kind):
    dt = np.float32 if spec[-1] == "f" else np.float64
    return np.array([[val(x) for x in row] for row in spec[1]] if kind == "m" else [val(x) for x in spec[1]], dtype=dt)

def apply(s, op):
    k, x = op[0], node(s, op[1])
    if k == "transform":
        x.transform(dtype_arr(op[2], "m"), dtype_arr(op[3], "t")); return atoms_state(s)
    if k == "com":
        r = x.center_of_mass() if op[2] == "disordered" else x.center_of_mass(op[2]); return arr(r)
    if k == "vector":
        v = x.get_vector(); return [repr(v), [num(c) for c in v.get_array()]]
    if k == "set":
        name, v = op[2], val(op[3])
        if name == "coord": v = np.array([val(c) for c in v], dtype=np.float32)
        getattr(x, "set_" + name)(v)
        g = {"altloc": x.get_altloc, "bfactor": x.get_bfactor, "occupancy": x.get_occupancy, "charge": x.get_charge, "radius": x.get_radius,
             "serial_number": x.get_serial_number, "coord": x.get_coord}[name]()
        return arr(g) if name == "coord" else (num(g) if isinstance(g, float) else g)
    if k == "level": return x.get_level()
    if k == "iterator": return [repr(c) for c in x.get_iterator()][:15]
    if k in ("residues", "chains", "models", "atoms"):
        return [repr(c) for c in getattr(x, "get_" + k)()][:15]
    if k == "setitem":
        x[key_py(op[2])] = node(s, op[3]).copy()
        return [repr(x.selected_child), sorted(repr(k) for k in x.child_dict)]
    if k == "delitem":
        del x[key_py(op[2])]; return state(x)
    if k == "dis":
        m, arg = op[2], op[3]
        if m == "select": x.disordered_select(arg)
        elif m == "has": return x.disordered_has_id(arg)
        elif m == "ids": return [list(k) if isinstance(k, tuple) else k for k in x.disordered_get_id_list()]
        elif m == "get": return repr(x.disordered_get(arg))
        elif m == "remove": x.disordered_remove(arg)
        return [repr(x.selected_child), [list(k) if isinstance(k, tuple) else k for k in x.disordered_get_id_list()]]
    if k == "item":
        m, key = op[2], key_py(op[3])
        if m == "len": return len(x)
        if m == "contains": return key in x
        return repr(x[key])
    if k == "get_list":
        return [repr(c) for c in x.get_list()][:15]
    if k == "cmp":
        # A wrapper compares as its selected child, so the TypeError for an operand that cannot be compared names
        # the child's class. The right-hand side is another node, or a literal of some other type.
        other = node(s, op[2]) if isinstance(op[2], list) else val(op[2])
        return {"lt": lambda: x < other, "le": lambda: x <= other, "gt": lambda: x > other, "ge": lambda: x >= other}[op[3]]()
    if k == "detach_parent":
        x.detach_parent(); return x.get_parent() is None
    raise ValueError(k)

def state(x): return [len(x), [repr(c) for c in x.child_list][:15], sorted(repr(k) for k in x.child_dict)[:15]]

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
        res = []
        types = []
        for op in case["ops"]:
            try: types.append(type(node(s, op[1])).__name__)
            except Exception: types.append(None)
            try: res.append({"result": apply(s, op)})
            except Exception as e: res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
        out["ops_out"] = res
        out["types"] = types
    out["warnings"] = [str(x.message) for x in w]
    return out


def all_paths(s):
    """Every path in child_list order, wrappers included."""
    out, stack = [[]], [([], s)]
    while stack:
        p, x = stack.pop()
        for i, c in enumerate(getattr(x, "child_list", [])):
            out.append(p + [i]); stack.append((p + [i], c))
    return out

def rot_spec():
    r = rnd.random()
    if r < 0.15: rows = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    elif r < 0.25: rows = [[1, 0], [0, 1]]
    elif r < 0.3: rows = [[1, 0, 0, 0]] * 3
    else:
        th = rnd.uniform(-3, 3); c, sn = math.cos(th), math.sin(th)
        rows = [[c, -sn, 0], [sn, c, 0], [0, 0, 1]] if rnd.random() < 0.5 else [[rnd.uniform(-1, 1) for _ in range(3)] for _ in range(3)]
    return ["m", rows, rnd.choice(["f", "d"])]
def tran_spec():
    n = rnd.choice([3, 3, 3, 3, 1, 2])
    return ["t", [rnd.choice([rnd.uniform(-50, 50), 0.0, 1.0]) for _ in range(n)], rnd.choice(["f", "d"])]

def gen_ops(s):
    paths = all_paths(s)
    by_type = {}
    for q in paths: by_type.setdefault(type(node(s, q)).__name__, []).append(q)
    def pick(*types):
        """A path whose node has one of the types, or None if there is none."""
        pool = [q for t in types for q in by_type.get(t, [])]
        return rnd.choice(pool) if pool else None
    ENT = ("Structure", "Model", "Chain", "Residue")
    ops = []
    for _ in range(rnd.randint(3, 7)):
        k = rnd.choice(["transform", "com", "com", "vector", "set", "level", "iterator", "list", "get_list", "setitem", "delitem", "delitem", "dis", "item", "item", "cmp", "cmp", "detach_parent"])
        p = {"vector": pick("Atom"), "set": pick("Atom"), "iterator": pick(*ENT), "list": pick(*ENT), "setitem": pick("DisorderedAtom", "DisorderedResidue"), "delitem": pick(*ENT),
             "dis": pick("DisorderedAtom", "DisorderedResidue"), "item": pick(*ENT, "DisorderedResidue", "DisorderedAtom", "DisorderedAtom"),
             "cmp": pick("DisorderedAtom", "DisorderedResidue", "Atom", *ENT), "get_list": pick(*ENT), "com": pick(*ENT, "DisorderedAtom")}.get(k)
        if p is None:
            if k in ("dis", "setitem"): continue
            p = rnd.choice(paths)
        x = node(s, p); lvl = type(x).__name__
        if k == "transform": ops.append(["transform", p, rot_spec(), tran_spec()])
        elif k == "com": ops.append(["com", p, "disordered" if lvl == "DisorderedAtom" else rnd.random() < 0.5])
        elif k == "vector": ops.append(["vector", p])
        elif k == "set":
            name = rnd.choice(["altloc", "bfactor", "occupancy", "charge", "radius", "serial_number", "coord"])
            v = {"altloc": rnd.choice(["A", " ", "B"]), "bfactor": rnd.choice([1.5, None, 99.0]), "occupancy": rnd.choice([0.5, None]), "charge": rnd.choice([-1.0, None]),
                 "radius": rnd.choice([1.7, None]), "serial_number": rnd.choice([5, "7", None]), "coord": [1.0, rnd.uniform(-9, 9), "nan"]}[name]
            ops.append(["set", p, name, v])
        elif k == "level": ops.append(["level", p])
        elif k == "get_list": ops.append(["get_list", p])
        elif k == "iterator": ops.append(["iterator", p])
        elif k == "list": ops.append([rnd.choice(["residues", "chains", "models", "atoms"]), p])
        elif k == "setitem": ops.append(["setitem", p, rnd.choice([" ", "A", "Q", 3, ["H_X", 5, " "]]), rnd.choice(paths)])
        elif k == "delitem":
            # Half the time, a key the node really has: the fixed list above almost never matches a model's integer
            # id, so `Structure.__delitem__` never actually deleted anything.
            own = [c.id for c in getattr(x, "child_list", [])]
            key = rnd.choice(own) if own and rnd.random() < 0.5 else rnd.choice([" ", "A", "CA", 1, 3, [" ", 1, " "], "N"])
            ops.append(["delitem", p, list(key) if isinstance(key, tuple) else key])
        elif k == "dis":
            m = rnd.choice(["select", "has", "ids", "get", "remove"])
            arg = rnd.choice([" ", "A", "B", "ALA", "GLY", None]) if m in ("select", "has", "get", "remove") else None
            ops.append(["dis", p, m, arg])
        elif k == "item": ops.append(["item", p, rnd.choice(["len", "contains", "get"]), rnd.choice([" ", "A", "CA", "N", 1, [" ", 1, " "]])])
        elif k == "cmp":
            # against another node of any kind, and against values no entity can be compared with
            right = rnd.choice([rnd.choice(paths), rnd.choice(paths), pick("DisorderedAtom", "DisorderedResidue") or rnd.choice(paths), 3, "x", None])
            ops.append(["cmp", p, right, rnd.choice(["lt", "le", "gt", "ge"])])
        else: ops.append(["detach_parent", p])
    return ops

def add_point_mutations(text):
    """Duplicate some residues under another name (same id), which the parser turns into DisorderedResidues."""
    lines = text.splitlines(keepends=True)
    out, i = [], 0
    while i < len(lines):
        j = i
        key = lines[i][17:27] if lines[i].startswith(("ATOM", "HETATM")) else None
        while key is not None and j < len(lines) and lines[j].startswith(("ATOM", "HETATM")) and lines[j][17:27] == key: j += 1
        if key is None: out.append(lines[i]); i += 1; continue
        block = lines[i:j]
        if rnd.random() < 0.4 and lines[i].startswith("ATOM"):
            # The parser needs altloc letters on both versions of a point-mutated residue.
            newname = rnd.choice(["ALA", "GLY", "SER", "LEU", "MET"])
            out += [l[:16] + "A" + l[17:] for l in block]
            out += [l[:16] + "B" + newname.rjust(3) + l[20:] for l in block if rnd.random() < 0.8]
        else: out += block
        i = j
    return "".join(out)

for _ in range(1400):
    text = gen_pdb(rnd, False)
    if rnd.random() < 0.5: text = add_point_mutations(text)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(text))
    except Exception: continue
    c = {"text": text, "ops": gen_ops(s)}
    res = run_isolated(run, c)
    if res is None: continue
    c.update(res); cases.append(c)

report_skipped()
# `disordered_remove` on a DisorderedResidue, with an id the wrapper really holds: the random argument pool almost
# never matches a residue name, so this is pinned down on its own rather than left to chance.
found = False
for _ in range(40):
    if found: break
    text = add_point_mutations(gen_pdb(rnd, False))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        probe = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(text))
    for path in all_paths(probe):
        node_here = node(probe, path)
        if type(node_here).__name__ != "DisorderedResidue": continue
        ids = [list(i) if isinstance(i, tuple) else i for i in node_here.disordered_get_id_list()]
        if len(ids) < 2: continue
        c = {"text": text, "ops": [["dis", path, "ids", None], ["dis", path, "remove", ids[0]], ["dis", path, "ids", None],
                                   ["dis", path, "get", ids[-1]], ["get_list", path[:-1]]]}
        res = run_isolated(run, c)
        if res is not None:
            c.update(res); cases.append(c); found = True
        break

json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
