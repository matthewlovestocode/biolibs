"""Golden cases for Bio.PDB.internal_coords.AtomKey -> packages/pdb/test/golden/ickey.json

Case kinds:
  key   - build a key from one of the accepted input forms and record its fields, id, atom name, backbone flag and
          covalent-radius class.
  pair  - two keys: their `_cmp` ranks, the four ordering operators, equality and `altloc_match`.
  sort  - a list of keys sorted, which is what puts a residue's atoms in a canonical order.

`_cmp` returns a pair of ranks rather than a sign, and for two atom names in none of its tables it falls through to
`int()` of the names and raises; both are recorded as they come.
"""
import json, os, random
from Bio.PDB.internal_coords import AtomKey
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "ickey.json")
rnd = random.Random(907)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def attempt(f):
    try: return {"result": f()}
    except Exception as e: return {"exc": {"type": tname(e), "msg": emsg(e)}}

def build(spec):
    """Build a key the way the spec says: a whole string, ordered fields, a list, or named fields."""
    how, value = spec["how"], spec["value"]
    if how == "string": return AtomKey(value)
    if how == "args": return AtomKey(*value)
    if how == "list": return AtomKey(value)
    if how == "dict": return AtomKey({k: v for k, v in value})
    if how == "kwargs": return AtomKey(**{k: v for k, v in value})
    raise ValueError(how)

def run_key(case):
    def one():
        k = build(case["spec"])
        return {"akl": list(k.akl), "id": k.id, "repr": repr(k), "atm": attempt(k.atm),
                "is_backbone": k.is_backbone(), "cr_class": attempt(k.cr_class)}
    out = attempt(one)
    out["warnings"] = []
    return out

def run_pair(case):
    def one():
        a, b = build(case["a"]), build(case["b"])
        return {"cmp": attempt(lambda: list(a._cmp(b))),
                "lt": attempt(lambda: a < b), "le": attempt(lambda: a <= b),
                "gt": attempt(lambda: a > b), "ge": attempt(lambda: a >= b),
                "eq": a == b, "ne": a != b, "altloc_match": a.altloc_match(b)}
    out = attempt(one)
    out["warnings"] = []
    return out

def run_sort(case):
    def one():
        keys = [AtomKey(s) for s in case["keys"]]
        return [k.id for k in sorted(keys)]
    out = attempt(one)
    out["warnings"] = []
    return out

# ---------------- the input forms ----------------
STRINGS = ["52_G_CA", "52B_G_CA", "52_G_CA_0.33", "52_G_CA_B_0.33", "-3_ALA_N", "1_W_OXT", "7_K_HZ3",
           "12_F_CZ_A", "0_X_UNK", "99A_PRO_CD", "52_G_CA_B", "4_C_SG"]
for s in STRINGS:
    cases.append({"kind": "key", "spec": {"how": "string", "value": s}})
# ordered arguments, lists, dicts and keyword arguments of the same fields
FIELD_SETS = [
    [52, None, "G", "CA", None, None],
    [52, "B", "G", "CA", None, None],
    [52, None, "G", "CA", "B", "0.33"],
    [-7, None, "ALA", "HB2", None, None],
    [3, None, "W", "OXT", None, None],
]
for fields in FIELD_SETS:
    cases.append({"kind": "key", "spec": {"how": "list", "value": fields}})
    cases.append({"kind": "key", "spec": {"how": "args", "value": [str(f) if f is not None else None for f in fields[:4]]}})
    named = [[n, (str(v) if v is not None else None)] for n, v in zip(AtomKey.fieldNames, fields)]
    cases.append({"kind": "key", "spec": {"how": "dict", "value": named}})
    cases.append({"kind": "key", "spec": {"how": "kwargs", "value": [p for p in named if p[1] is not None]}})
# a whole key that is not the first argument is refused
cases.append({"kind": "key", "spec": {"how": "args", "value": ["52", "52_G_CA"]}})
# atoms whose covalent class comes from the residue rather than the shared table, and ones in neither
for s in ["4_C_SG", "9_H_ND1", "2_R_NH1", "5_Y_OH", "6_M_SD", "8_P_CD", "3_G_ZZ", "3_G_HG"]:
    cases.append({"kind": "key", "spec": {"how": "string", "value": s}})

# ---------------- ordering ----------------
# every pair from a pool that covers backbone, side chain, hydrogens, altlocs, occupancies and insertion codes
POOL = ["52_G_N", "52_G_CA", "52_G_C", "52_G_O", "52_G_CB", "52_G_CG", "52_G_CG1", "52_G_CG2", "52_G_CD1",
        "52_G_CE2", "52_G_CZ", "52_G_NH1", "52_G_OXT", "52_G_H", "52_G_HA", "52_G_HB2", "52_G_HB3",
        "52_G_HG11", "52_G_HG12", "52_G_HZ", "52_G_HZ2", "52_G_ZZ", "52_G_XX",
        "52A_G_CA", "52B_G_CA", "53_G_CA", "51_G_CA", "-1_G_CA",
        "52_G_CA_A", "52_G_CA_B", "52_G_CA_A_0.50", "52_G_CA_B_0.50", "52_G_CA_0.33", "52_A_CA", "52_ALA_CA"]
for i, a in enumerate(POOL):
    for b in POOL[i:]:
        cases.append({"kind": "pair", "a": {"how": "string", "value": a}, "b": {"how": "string", "value": b}})

# sorting whole groups, which is how a residue's atoms are ordered
GROUPS = [
    ["52_G_O", "52_G_N", "52_G_CA", "52_G_C"],
    ["52_G_CB", "52_G_N", "52_G_HB2", "52_G_CA", "52_G_H"],
    ["52_G_CD1", "52_G_CG", "52_G_CB", "52_G_CZ", "52_G_CE2", "52_G_OH"],
    ["52_G_HG12", "52_G_HG11", "52_G_HB3", "52_G_HB2", "52_G_HA"],
    ["52_G_CA_B_0.50", "52_G_CA_A_0.50", "52_G_CA"],
    ["53_G_N", "52B_G_CA", "52_G_CA", "52A_G_CA", "-1_G_CA"],
    ["52_G_HZ3", "52_G_HZ2", "52_G_HZ", "52_G_NZ"],
]
for keys in GROUPS:
    for _ in range(3):
        shuffled = list(keys)
        rnd.shuffle(shuffled)
        cases.append({"kind": "sort", "keys": shuffled})

RUNNERS = {"key": run_key, "pair": run_pair, "sort": run_sort}
kept = []
for c in cases:
    res = run_isolated(RUNNERS[c["kind"]], c)
    if res is None: continue
    c.update(res); kept.append(c)

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": kept}, open(OUT, "w"))
print(len(kept), "cases ->", OUT)
