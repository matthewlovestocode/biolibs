"""Golden cases for Bio.PDB.SASA (ShrakeRupley) -> packages/pdb/test/golden/sasa.json

Each case is a (dense) PDB text, constructor arguments, and a list of `compute(entity, level)` calls on entities given by
child_list paths; the result is every `sasa` attribute set on atoms and entities, or the exception.
"""
import io, json, math, os, random, warnings
from Bio.PDB import PDBParser
from Bio.PDB.SASA import ShrakeRupley
from pdb_encode import tname, emsg
from pdb_text import gen_pdb
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "sasa.json")
rnd = random.Random(111)
cases = []

def num(x):
    x = float(x)
    return "nan" if math.isnan(x) else x

def node(s, path):
    x = s
    for i in path: x = x.child_list[i]
    return x

def collect(s):
    """Every sasa attribute set anywhere: [kind, full id, value]."""
    out = []
    def visit(x, kind):
        if "sasa" in x.__dict__: out.append([kind, json.loads(json.dumps(x.get_full_id())), num(x.__dict__["sasa"])])
    visit(s, "S")
    for m in s.child_list:
        visit(m, "M")
        for c in m.child_list:
            visit(c, "C")
            for r in c.child_list:
                visit(r, "R")
                for a in r.child_list: visit(a, "A")
    return out

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
        try:
            sr = ShrakeRupley(**case["kwargs"])
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}; out["warnings"] = []; return out
        res = []
        for op in case["ops"]:
            try:
                sr.compute(node(s, op[0]), op[1]); res.append({"result": collect(s)})
            except Exception as e:
                res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
        out["ops_out"] = res
        out["radii"] = sorted([k, v] for k, v in sr.radii_dict.items())
        out["warnings"] = [str(x.message) for x in w]
    return out


def all_paths(s):
    out, stack = [[]], [([], s)]
    while stack:
        p, x = stack.pop()
        for i, c in enumerate(getattr(x, "child_list", [])):
            out.append(p + [i]); stack.append((p + [i], c))
    return out

for _ in range(500):
    text = gen_pdb(rnd, False, box=rnd.choice([5, 8, 12, 25, 90]))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(text))
    paths = all_paths(s)
    kwargs = {}
    if rnd.random() < 0.5: kwargs["n_points"] = rnd.choice([1, 5, 20, 50, 100, 200])
    if rnd.random() < 0.4: kwargs["probe_radius"] = rnd.choice([0.5, 1.0, 1.4, 2.25, 3.5])
    if rnd.random() < 0.3: kwargs["radii_dict"] = rnd.choice([{"O": 3.1415}, {"C": 1.0, "S": 2.5}, {"ZN": 0.5, "XX": 1.1}, {}])
    ops = []
    for _ in range(rnd.randint(1, 3)):
        ents = [q for q in paths if type(node(s, q)).__name__ in ("Structure", "Model", "Chain", "Residue", "DisorderedResidue")]
        p = rnd.choice(paths) if rnd.random() < 0.05 else rnd.choice(ents)
        ops.append([p, rnd.choice(["A", "R", "C", "M", "S", "A", "R", "X"])])
    case = {"text": text, "kwargs": kwargs, "ops": ops}
    res = run_isolated(run, case)
    if res is not None: case.update(res); cases.append(case)
# invalid constructor arguments (non-integer floats, so Python's repr matches)
for kw in ({"probe_radius": -1.5}, {"probe_radius": -0.25}, {"n_points": 0}, {"n_points": -4}, {"probe_radius": -2.5, "n_points": 0}):
    case = {"text": gen_pdb(rnd, False, box=10), "kwargs": kw, "ops": [[[0], "A"]]}
    res = run_isolated(run, case)
    if res is not None: case.update(res); cases.append(case)

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases,", sum(1 for c in cases if "exc" in c), "constructor errors ->", OUT)
