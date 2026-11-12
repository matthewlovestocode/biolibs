"""Golden cases for Bio.PDB.vectors (Vector, rotations, homogeneous matrices) -> packages/pdb/test/golden/vectors.json

Each case is one operation `[name, *args]` with its arguments in a small JSON encoding (`["v", [x, y, z]]` is a
Vector, `["m", rows]` a matrix, `"nan"`/`"inf"`/`"-inf"` special floats) and the encoded result or exception, plus warnings.
"""
import json, math, os, random, warnings
import numpy as np
from Bio.PDB import vectors as V
from Bio.PDB.vectors import Vector
from pdb_encode import tname, emsg

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "vectors.json")
rnd = random.Random(55)
cases = []
SPECIAL = {"nan": float("nan"), "inf": float("inf"), "-inf": float("-inf")}

def dec(a):
    if isinstance(a, str): return SPECIAL.get(a, a)
    if isinstance(a, list) and a and a[0] == "v" and len(a) == 2: return Vector(*[dec(x) for x in a[1]]) if len(a[1]) == 3 else Vector(a[1])
    if isinstance(a, list) and a and a[0] == "m" and len(a) == 2: return np.array([[dec(x) for x in row] for row in a[1]], dtype=float)
    if isinstance(a, list): return [dec(x) for x in a]
    return a

def enc(x):
    if isinstance(x, Vector): return {"vec": [enc(float(c)) for c in x._ar], "repr": repr(x)}
    if isinstance(x, np.ndarray): return {"arr": enc_nested(x.tolist())}
    if isinstance(x, (tuple, list)): return [enc(c) for c in x]
    if isinstance(x, (bool, np.bool_)): return bool(x)
    if isinstance(x, (float, np.floating)):
        x = float(x)
        return "nan" if math.isnan(x) else "inf" if x == math.inf else "-inf" if x == -math.inf else x
    if isinstance(x, (int, np.integer)): return int(x)
    return x
def enc_nested(r): return [enc_nested(c) if isinstance(c, list) else enc(c) for c in r]

def call(op, a):
    if op == "new": return Vector(*a)
    if op in ("repr",): return repr(a[0])
    if op == "neg": return -a[0]
    if op == "add": return a[0] + a[1]
    if op == "sub": return a[0] - a[1]
    if op == "dot": return a[0] * a[1]
    if op == "div": return a[0] / a[1]
    if op == "cross": return a[0] ** a[1]
    if op == "get": return a[0][a[1]]
    if op == "set":
        a[0][a[1]] = a[2]; return a[0]
    if op == "has": return a[1] in a[0]
    if op == "norm": return a[0].norm()
    if op == "normsq": return a[0].normsq()
    if op == "normalize":
        a[0].normalize(); return a[0]
    if op == "normalized": return a[0].normalized()
    if op == "angle": return a[0].angle(a[1])
    if op == "array": return a[0].get_array()
    if op == "lmul": return a[0].left_multiply(a[1])
    if op == "rmul": return a[0].right_multiply(a[1])
    if op == "copy": return a[0].copy()
    f = {"m2rotaxis": V.m2rotaxis, "vector_to_axis": V.vector_to_axis, "rotaxis2m": V.rotaxis2m, "refmat": V.refmat, "rotmat": V.rotmat, "calc_angle": V.calc_angle,
         "calc_dihedral": V.calc_dihedral, "homog_rot_mtx": V.homog_rot_mtx, "homog_trans_mtx": V.homog_trans_mtx, "homog_scale_mtx": V.homog_scale_mtx,
         "get_spherical_coordinates": lambda x: V.get_spherical_coordinates(np.array(x)), "multi_rot_Z": lambda x: V.multi_rot_Z(np.array(x)), "multi_rot_Y": lambda x: V.multi_rot_Y(np.array(x))}.get(op)
    if f: return f(*a)
    if op in ("set_Z_homog_rot_mtx", "set_Y_homog_rot_mtx", "set_X_homog_rot_mtx"):
        getattr(V, op)(a[0], a[1]); return a[1]
    if op == "set_homog_trans_mtx":
        V.set_homog_trans_mtx(*a); return a[3]
    if op == "coord_space": return V.coord_space(np.array(a[0]), np.array(a[1]), np.array(a[2]), a[3])
    if op == "multi_coord_space": return V.multi_coord_space(np.array(a[0]), a[1], a[2])
    raise ValueError(op)

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            a = [dec(x) for x in case["args"]]
            out["result"] = enc(call(case["op"], a))
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [[x.category.__name__, str(x.message)] for x in w]
    return out

def add(op, *args):
    c = {"op": op, "args": list(args)}
    c.update(run(c)); cases.append(c)

# ---- argument generators ----
def f():
    r = rnd.random()
    if r < 0.1: return rnd.choice([0.0, 1.0, -1.0, 0.5])
    if r < 0.2: return rnd.uniform(-1e-3, 1e-3)
    if r < 0.3: return rnd.uniform(-1e4, 1e4)
    return rnd.uniform(-20, 20)
def vec():
    r = rnd.random()
    if r < 0.08: return ["v", [0.0, 0.0, 0.0]]
    if r < 0.2: return ["v", rnd.choice([[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -2.5]])]
    return ["v", [f(), f(), f()]]
def pair():
    v = vec()
    r = rnd.random()
    if r < 0.12: return v, v
    if r < 0.2: return v, ["v", [-c for c in v[1]]]
    if r < 0.28: return v, ["v", [c * rnd.choice([2.0, 0.5, 3.0]) for c in v[1]]]
    return v, vec()
def rotation():
    axis = V.Vector(*[rnd.uniform(-1, 1) for _ in range(3)])
    theta = rnd.choice([0.0, math.pi, math.pi / 2, rnd.uniform(-math.pi, math.pi), 1e-9, math.pi - 1e-9, rnd.uniform(0, 7)])
    if rnd.random() < 0.1: axis = V.Vector(*rnd.choice([[1, 0, 0], [0, 1, 0], [0, 0, 1]]))
    return V.rotaxis2m(theta, axis).tolist()
def mat3():
    r = rnd.random()
    if r < 0.5: return ["m", rotation()]
    if r < 0.6: return ["m", np.eye(3).tolist()]
    if r < 0.7: return ["m", np.diag(rnd.choice([[1, -1, -1], [-1, 1, -1], [-1, -1, 1], [1, 1, 1], [-1, -1, -1]])).astype(float).tolist()]
    if r < 0.8: return ["m", [[rnd.uniform(-1, 1) for _ in range(3)] for _ in range(3)]]
    m = np.array(rotation()) + np.array([[rnd.uniform(-1, 1) * 1e-6 for _ in range(3)] for _ in range(3)])
    return ["m", m.tolist()]
def hpoint():
    return [f(), f(), f(), 1.0]

N = 90
for _ in range(N): add("new", rnd.choice([f(), "nan"]), f(), f())
for x in ([1, 2, 3], [1.5, 2, 3], [1, 2], [1, 2, 3, 4], [], 5):
    add("new", x)
add("new", 1, 2); add("new", 1, None, 3); add("new", [1.0, 2.0, 3.0], None, None)
for _ in range(N):
    v = vec()
    add("repr", v); add("neg", v); add("norm", v); add("normsq", v); add("normalize", v); add("normalized", v); add("array", v); add("copy", v)
    a, b = pair()
    add("add", a, b); add("sub", a, b); add("dot", a, b); add("cross", a, b); add("angle", a, b)
    add("add", a, f()); add("sub", a, [f(), f(), f()]); add("add", a, [f()]); add("cross", a, f()); add("cross", a, [f(), f(), f()])
    add("div", a, rnd.choice([f(), 2.0, 0.0, -4.0])); add("div", a, [f(), rnd.choice([0.0, 1.0]), f()])
    add("get", a, rnd.choice([0, 1, 2, -1, -3, 3, -4])); add("set", a, rnd.choice([0, 2, -1, 5]), f())
    add("has", a, rnd.choice([0.0, 1.0, a[1][0], f()]))
    add("lmul", a, mat3()); add("rmul", a, mat3())
add("lmul", ["v", [1, 2, 3]], ["m", [[1, 2], [3, 4]]]); add("lmul", ["v", [1, 2, 3]], ["m", [[1, 2, 3, 4]]]); add("rmul", ["v", [1, 2, 3]], ["m", [[1, 2], [3, 4]]])
add("dot", ["v", [1, 2, 3]], 5); add("add", ["v", [1, 2, 3]], [1, 2]); add("div", ["v", [1, 2, 3]], [1, 2])
for _ in range(2 * N):
    m = mat3(); add("m2rotaxis", m)
    a, b = pair(); add("vector_to_axis", a, b); add("refmat", a, b); add("rotmat", a, b)
    add("rotaxis2m", rnd.choice([f(), 0.0, math.pi, 2 * math.pi]), vec())
    c, d = pair(); add("calc_angle", a, b, c); add("calc_dihedral", a, b, c, d)
    add("calc_dihedral", ["v", [f() for _ in range(3)]], ["v", [0.0, 0.0, 0.0]], ["v", [1.0, 0.0, 0.0]], ["v", [f() for _ in range(3)]])
# non-orthogonal matrices that drive the pi branch into sqrt of a negative number
for _ in range(60): add("m2rotaxis", ["m", [[rnd.uniform(-2, 2) for _ in range(3)] for _ in range(3)]])
add("m2rotaxis", ["m", [[-1, 0, 0], [0, -1, 0], [0, 0, 1]]]); add("m2rotaxis", ["m", [[1, 0, 0], [0, -1, 0], [0, 0, -1]]]); add("m2rotaxis", ["m", [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]])

for _ in range(N):
    ang = rnd.choice([f(), 0.0, math.pi])
    for ax in ("x", "y", "z", "q"): add("homog_rot_mtx", ang, ax)
    add("homog_trans_mtx", f(), f(), f()); add("homog_scale_mtx", f())
    add("set_Z_homog_rot_mtx", ang, ["m", V.homog_rot_mtx(f(), "x").tolist()])
    add("set_Y_homog_rot_mtx", ang, ["m", V.homog_rot_mtx(f(), "x").tolist()])
    add("set_X_homog_rot_mtx", ang, ["m", V.homog_rot_mtx(f(), "z").tolist()])
    add("set_homog_trans_mtx", f(), f(), f(), ["m", V.homog_trans_mtx(1, 2, 3).tolist()])
    add("get_spherical_coordinates", rnd.choice([[f(), f(), f()], [0.0, 0.0, 0.0], [0.0, f(), f()], [f(), 0.0, f()], [-1.0, 0.0, 0.0], [0.0, -3.0, 2.0], [f(), f(), f(), 0.0]]))
for _ in range(3 * N):
    a0, a1, a2 = hpoint(), hpoint(), hpoint()
    if rnd.random() < 0.1: a2 = list(a1)
    add("coord_space", a0, a1, a2, rnd.random() < 0.5)
for _ in range(60):
    n = rnd.randint(1, 5)
    a3 = [[hpoint() for _ in range(3)] for _ in range(n)]
    add("multi_coord_space", a3, n, rnd.random() < 0.5)
    add("multi_rot_Z", [f() for _ in range(n)]); add("multi_rot_Y", [f() for _ in range(n)])

json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases,", sum(1 for c in cases if "exc" in c), "raise ->", OUT)
