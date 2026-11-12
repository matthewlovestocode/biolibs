"""Golden cases for Bio.SVDSuperimposer and Bio.PDB.Superimposer
-> packages/svdsuperimposer/test/golden/svd.json and packages/pdb/test/golden/superimposer.json

`svd` cases call a sequence of SVDSuperimposer methods on random point sets (single or double precision); `atoms`
cases build two lists of atoms from parsed PDB text, call Superimposer.set_atoms / apply and report the atoms' coordinates.
"""
import io, json, math, os, random, warnings
import numpy as np
from Bio.SVDSuperimposer import SVDSuperimposer
from Bio.PDB import PDBParser
from Bio.PDB.Superimposer import Superimposer
from pdb_encode import tname, emsg
from pdb_text import gen_pdb

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "packages")
OUT_SVD = os.path.join(ROOT, "svdsuperimposer", "test", "golden", "svd.json")
OUT_SUP = os.path.join(ROOT, "pdb", "test", "golden", "superimposer.json")
rnd = random.Random(88)
svd_cases, sup_cases = [], []

def num(x):
    x = float(x)
    return "nan" if math.isnan(x) else "inf" if x == math.inf else "-inf" if x == -math.inf else x
def arr(a):
    a = np.asarray(a)
    return {"dtype": str(a.dtype), "arr": np.vectorize(num)(a).tolist() if a.size else a.tolist()}

def isolated(fn, case):
    r, w = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        try: os.write(w, json.dumps(fn(case)).encode())
        finally: os._exit(0)
    os.close(w)
    chunks = []
    while True:
        b = os.read(r, 1 << 20)
        if not b: break
        chunks.append(b)
    os.close(r)
    _, status = os.waitpid(pid, 0)
    return None if status != 0 or not chunks else json.loads(b"".join(chunks))

# ---- SVDSuperimposer ----
def run_svd(case):
    out = {"ops_out": []}
    sup = SVDSuperimposer()
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        for op in case["ops"]:
            try:
                k = op[0]
                if k == "set":
                    dt = np.float32 if op[3] == "f" else np.float64
                    sup.set(np.array(op[1], dtype=dt), np.array(op[2], dtype=dt)); r = None
                elif k == "run": sup.run(); r = None
                elif k == "transformed": r = arr(sup.get_transformed())
                elif k == "rotran": rot, tran = sup.get_rotran(); r = [arr(rot), arr(tran)]
                elif k == "init_rms": r = arr(sup.get_init_rms())
                elif k == "rms": r = arr(sup.get_rms())
                out["ops_out"].append({"result": r})
            except Exception as e:
                out["ops_out"].append({"exc": {"type": tname(e), "msg": emsg(e)}})
    out["warnings"] = [str(x.message) for x in w]
    return out

def rot_matrix():
    q = np.array([rnd.gauss(0, 1) for _ in range(4)]); q /= np.linalg.norm(q)
    a, b, c, d = q
    return np.array([[a*a+b*b-c*c-d*d, 2*(b*c-a*d), 2*(b*d+a*c)], [2*(b*c+a*d), a*a-b*b+c*c-d*d, 2*(c*d-a*b)], [2*(b*d-a*c), 2*(c*d+a*b), a*a-b*b-c*c+d*d]])

def points(n):
    return [[rnd.uniform(-30, 30) for _ in range(3)] for _ in range(n)]

def gen_svd():
    n = rnd.choice([3, 4, 5, 8, 12, 30])
    ref = np.array(points(n))
    style = rnd.random()
    if style < 0.4: mov = ref @ rot_matrix() + np.array([rnd.uniform(-20, 20) for _ in range(3)]) + np.random.RandomState(rnd.randrange(10**6)).normal(0, rnd.choice([0, 0.01, 0.5]), ref.shape)
    elif style < 0.5: mov = np.array(points(n))
    elif style < 0.6: mov = ref * np.array([1, 1, -1])   # a reflection: forces the determinant fix
    else: mov = ref @ rot_matrix() + 5
    ref, mov = ref.tolist(), mov.tolist()
    dt = rnd.choice(["f", "d"])
    ops = [["set", ref, mov, dt], ["run"], ["transformed"], ["rotran"], ["init_rms"], ["rms"]]
    r = rnd.random()
    if r < 0.15: ops = [["run"]] + ops
    elif r < 0.25: ops = [["rms"], ["transformed"], ["rotran"], ["init_rms"]] + ops
    elif r < 0.3: ops = [["set", ref, mov[:-1], dt]] + ops
    elif r < 0.35: ops = [["set", [p[:2] for p in ref], [p[:2] for p in mov], dt]] + ops
    elif r < 0.4: ops = [["set", ref, mov, dt], ["init_rms"], ["run"], ["init_rms"], ["set", mov, ref, dt], ["rotran"], ["run"], ["rms"]]
    return {"kind": "svd", "ops": ops}

for _ in range(500):
    c = gen_svd(); res = isolated(run_svd, c)
    if res is not None: c.update(res); svd_cases.append(c)
# the 1- and 3-point sets: rank-deficient matrices
for n in (1, 3):
    for _ in range(10):
        ref = points(n)
        c = {"kind": "svd", "ops": [["set", ref, (np.array(ref) @ rot_matrix() + 1).tolist(), "d"], ["run"], ["rms"], ["rotran"]]}
        res = isolated(run_svd, c)
        if res is not None: c.update(res); svd_cases.append(c)

# ---- Superimposer on atoms ----
def parse(text):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(text))

def run_sup(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        s1, s2 = parse(case["text"]), parse(case["text"])
        if case["rigid"]:
            R = np.array(case["rigid"][0]); t = np.array(case["rigid"][1])
            s2.transform(R.astype("f"), t.astype("f"))
        a1 = list(s1.get_atoms()); a2 = list(s2.get_atoms())
        pick = lambda atoms, idx: [atoms[i] for i in idx]
        sup = Superimposer()
        res = []
        for op in case["ops"]:
            try:
                if op[0] == "apply_early": sup.apply(pick(a2, op[1])); r = None
                elif op[0] == "set":
                    sup.set_atoms(pick(a1, op[1]), pick(a2, op[2])); r = [arr(sup.rms), [arr(sup.rotran[0]), arr(sup.rotran[1])]]
                elif op[0] == "apply": sup.apply(pick(a2, op[1])); r = None
                elif op[0] == "coords": r = [arr(a.get_coord()) for a in pick(a2, op[1])]
                res.append({"result": r})
            except Exception as e:
                res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
        out["ops_out"] = res
    out["warnings"] = [str(x.message) for x in w]
    return out

for _ in range(400):
    text = gen_pdb(rnd, False)
    try: s = parse(text)
    except Exception: continue
    n = len(list(s.get_atoms()))
    if n < 4: continue
    k = rnd.randint(3, min(n, 12))
    idx = rnd.sample(range(n), k)
    rigid = [rot_matrix().tolist(), [rnd.uniform(-20, 20) for _ in range(3)]] if rnd.random() < 0.6 else None
    idx2 = idx if rigid else rnd.sample(range(n), k)
    ops = [["set", idx, idx2], ["coords", idx2], ["apply", idx2], ["coords", idx2], ["apply", list(range(min(n, 6)))], ["coords", list(range(min(n, 6)))]]
    r = rnd.random()
    if r < 0.1: ops = [["apply_early", idx2]] + ops
    elif r < 0.2: ops = [["set", idx, idx2[:-1]]] + ops
    c = {"text": text, "rigid": rigid, "ops": ops}
    res = isolated(run_sup, c)
    if res is not None: c.update(res); sup_cases.append(c)

json.dump({"biopython": __import__("Bio").__version__, "cases": svd_cases}, open(OUT_SVD, "w"))
json.dump({"biopython": __import__("Bio").__version__, "cases": sup_cases}, open(OUT_SUP, "w"))
print(len(svd_cases), "svd cases,", len(sup_cases), "superimposer cases")
