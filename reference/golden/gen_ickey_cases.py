"""Golden cases for Bio.PDB.internal_coords.AtomKey -> packages/pdb/test/golden/ickey.json

Case kinds:
  key   - build a key from one of the accepted input forms and record its fields, id, atom name, backbone flag and
          covalent-radius class.
  pair  - two keys: their `_cmp` ranks, the four ordering operators, equality and `altloc_match`.
  sort  - a list of keys sorted, which is what puts a residue's atoms in a canonical order.
  edron - build an Edron, Hedron or Dihedron and record its identity, classification and fields.
  epair - two di/hedra: the ordering operators and the pair of keys `_cmp` reports.
  residue - IC_Residue over the residues of a parsed PDB file: what it keeps and under which keys.
  split   - split_akl: a generic list of atom keys made specific to a residue and expanded over its altlocs.
  edra_build - _create_edra: the hedra and dihedra a residue builds from the tables and its neighbours.

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

# ---------------- Edron, Hedron and Dihedron ----------------
# Their lengths and angle values live on IC_Chain, which is not ported yet; without a chain Biopython reads 0.0 for
# a hedron and raises for a dihedron's repr, and both are recorded as they come.
def build_edron(spec):
    from Bio.PDB.internal_coords import Edron, Hedron, Dihedron
    cls = {"edron": Edron, "hedron": Hedron, "dihedron": Dihedron}[spec["cls"]]
    how = spec["how"]
    if how == "list": return cls([AtomKey(k) for k in spec["keys"]])
    if how == "args": return cls(*[AtomKey(k) for k in spec["keys"]])
    if how == "kwargs": return cls(**{n: k for n, k in zip(("a1", "a2", "a3", "a4"), spec["keys"])})
    raise ValueError(how)

def run_edron(case):
    def one():
        e = build_edron(case["spec"])
        out = {"id": e.id, "e_class": e.e_class, "re_class": e.re_class, "cre_class": e.cre_class, "rc": e.rc,
               "is_backbone": e.is_backbone(), "repr": attempt(lambda: repr(e)), "needs_update": e.needs_update,
               "keys": [k.id for k in e.atomkeys], "contains": e.atomkeys[0] in e,
               "gen_key": Edron.gen_key(list(e.atomkeys)),
               "gen_tuple": [k.id for k in Edron.gen_tuple(e.id)]}
        if case["spec"]["cls"] == "hedron":
            out["xrh_class"] = getattr(e, "xrh_class", None)
            out["values"] = [attempt(lambda: e.len12), attempt(lambda: e.angle), attempt(lambda: e.len23)]
        if case["spec"]["cls"] == "dihedron":
            out["id3"] = [k.id for k in e.id3]
            out["id32"] = [k.id for k in e.id32]
            out["primary"] = e.primary
            out["pclass"] = getattr(e, "pclass", None)
            out["altCB_class"] = getattr(e, "altCB_class", None)
            out["reverse"] = e.reverse
            out["angle"] = attempt(lambda: e.angle)
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

def run_epair(case):
    def one():
        a, b = build_edron(case["a"]), build_edron(case["b"])
        return {"lt": attempt(lambda: a < b), "le": attempt(lambda: a <= b), "gt": attempt(lambda: a > b),
                "ge": attempt(lambda: a >= b), "eq": a == b, "ne": a != b,
                "cmp": attempt(lambda: [k.id for k in a._cmp(b)] if a._cmp(b) else False)}
    out = attempt(one)
    out["warnings"] = []
    return out

from Bio.PDB.internal_coords import Edron
HEDRA = ["52_G_N:52_G_CA:52_G_C", "52_G_CA:52_G_C:52_G_O", "52_G_C:53_P_N:53_P_CA", "52_G_CA:52_G_C:53_P_N",
         "52_G_N:52_G_CA:52_G_CB", "52_G_CB:52_G_CG:52_G_CD1", "52A_G_C:52B_G_N:52B_G_CA", "7_K_CE:7_K_NZ:7_K_HZ1"]
DIHEDRA = ["52_G_N:52_G_CA:52_G_C:53_P_N", "52_G_CA:52_G_C:53_P_N:53_P_CA", "52_G_C:53_P_N:53_P_CA:53_P_C",
           "52_G_C:53_P_N:53_P_CA:53_P_CB", "52_G_N:52_G_CA:52_G_CB:52_G_CG", "52_G_CA:52_G_CB:52_G_CG:52_G_CD",
           "52_G_CB:52_G_CG:52_G_CD:52_G_CE", "7_K_CG:7_K_CD:7_K_CE:7_K_NZ", "52_G_O:52_G_C:52_G_CA:52_G_CB"]
for spec_keys, cls in [(HEDRA, "hedron"), (DIHEDRA, "dihedron"), (HEDRA, "edron"), (DIHEDRA, "edron")]:
    for idstr in spec_keys:
        keys = idstr.split(":")
        for how in ("list", "args", "kwargs"):
            cases.append({"kind": "edron", "spec": {"cls": cls, "how": how, "keys": keys}})
# every pair of hedra and of dihedra, which is how a residue's angles are ordered
for pool, cls in ((HEDRA, "hedron"), (DIHEDRA, "dihedron")):
    for i, a in enumerate(pool):
        for b in pool[i:]:
            cases.append({"kind": "epair", "a": {"cls": cls, "how": "list", "keys": a.split(":")},
                          "b": {"cls": cls, "how": "list", "keys": b.split(":")}})

# ---------------- IC_Residue over parsed structures ----------------
# Which atoms a residue keeps, the keys it keeps them under, and the identity it takes from the residue. The hedra
# and dihedra are not built yet, so nothing here needs a chain.
def run_residue(case):
    import io, warnings as w2
    from Bio.PDB import PDBParser
    from Bio.PDB.internal_coords import IC_Residue
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
        out = []
        for res in list(s.get_residues())[:12]:
            ric = IC_Residue(res)
            out.append({
                "rbase": [str(x) if x is not None else None for x in ric.rbase],
                "lc": ric.lc, "is20AA": ric.is20AA, "isAccept": ric.isAccept,
                "repr": repr(ric), "pretty_str": ric.pretty_str(),
                "ak_set": sorted(k.id for k in ric.ak_set),
                "akc": sorted(f"{k if isinstance(k, str) else k.name}={v.id}" for k, v in ric.akc.items()),
                "rak_CA": attempt(lambda ric=ric: ric.rak("CA").id),
                "rak_missing": attempt(lambda ric=ric: [ric.rak("ZZ").id, ric.rak("ZZ").missing]),
                "contains": [attempt(lambda ric=ric, k=k: k in ric) for k in sorted(ric.ak_set)[:4]],
                "alt_ids": ric.alt_ids,
            })
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

# A handful of structures with disorder, point mutations, hetero residues and terminal oxygens
from pdb_text import gen_pdb
TEXTS = []
for _ in range(14):
    TEXTS.append(gen_pdb(rnd, False))
TEXTS.append("".join([
    "ATOM      1  N   ALA A   1      11.000  11.000  11.000  1.00  0.00           N\n",
    "ATOM      2  CA  ALA A   1      12.000  11.000  11.000  1.00  0.00           C\n",
    "ATOM      3  C   ALA A   1      13.000  11.000  11.000  1.00  0.00           C\n",
    "ATOM      4  O'  ALA A   1      14.000  11.000  11.000  1.00  0.00           O\n",
    "ATOM      5  O'' ALA A   1      15.000  11.000  11.000  1.00  0.00           O\n",
    "ATOM      6  ZZ  ALA A   1      16.000  11.000  11.000  1.00  0.00           C\n",
    "ATOM      7  N  AGLY A   2      17.000  11.000  11.000  0.60  0.00           N\n",
    "ATOM      8  N  BGLY A   2      17.500  11.000  11.000  0.40  0.00           N\n",
    "HETATM    9  C1  UNK A   3      18.000  11.000  11.000  1.00  0.00           C\n",
    "HETATM   10  O   HOH A   4      19.000  11.000  11.000  1.00  0.00           O\n",
    "END\n",
]))
for text in TEXTS:
    cases.append({"kind": "residue", "text": text})

# ---------------- building a residue's angles ----------------
# `_create_edra` walks the ic_data tables and the residue's neighbours to build its hedra and dihedra. The residues
# are wired to their neighbours here, in both languages, rather than by IC_Chain, which is not ported yet: this
# measures the table walking, not the chain's choice of which residues are peptide-bonded.
def run_edra_build(case):
    """Build a real IC_Chain: it picks the residues, links them and notes the chain breaks itself."""
    import io, warnings as w2
    from Bio.PDB import PDBParser
    from Bio.PDB.internal_coords import IC_Chain
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
        out = []
        for chain in list(s.get_chains())[:2]:
            cic = IC_Chain(chain)
            built = [attempt(lambda ric=ric: ric._create_edra()) for ric in cic.ordered_aa_ic_list]
            arr = attempt(lambda: cic.build_atomArray())
            out.append({
                "residues": [ric.pretty_str() for ric in cic.ordered_aa_ic_list],
                "initNCaCs": sorted([k.id for k in t] for t in cic.initNCaCs),
                "akset": sorted(k.id for k in cic.akset),
                "built": built,
                "chain_hedra": sorted(h.id for h in cic.hedra.values()),
                "chain_dihedra": sorted(d.id for d in cic.dihedra.values()),
                "per_residue": [{
                    "pretty": ric.pretty_str(),
                    "hedra": sorted(h.id for h in ric.hedra.values()),
                    "dihedra": sorted(d.id for d in ric.dihedra.values()),
                    "primary": sorted(d.id for d in ric.dihedra.values() if d.primary),
                    "NCaCKey": attempt(lambda ric=ric: sorted([k.id for k in t] for t in ric.NCaCKey)),
                    "rprev": [r.pretty_str() for r in ric.rprev],
                    "rnext": [r.pretty_str() for r in ric.rnext],
                } for ric in cic.ordered_aa_ic_list],
                "atom_array": arr,
                "AAsiz": cic.AAsiz,
                "aktuple": [k.id for k in cic.aktuple],
                "atomArrayIndex": sorted(f"{k.id}={v}" for k, v in cic.atomArrayIndex.items()),
                "atomArrayValid": [bool(v) for v in cic.atomArrayValid],
                "coords": [[round(float(x), 6) for x in row] for row in cic.atomArray],
                # the atoms now look into the array: writing a row moves the atom
                "atom_views": [None if a is None else [round(float(x), 6) for x in a.coord] for a in cic.bpAtomArray],
                "dtypes": sorted({str(a.coord.dtype) for a in cic.bpAtomArray if a is not None}),
            })
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

def run_split(case):
    import io, warnings as w2
    from Bio.PDB import PDBParser
    from Bio.PDB.internal_coords import IC_Residue
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
        out = []
        for res in list(s.get_residues())[:8]:
            ric = IC_Residue(res)
            if not ric.isAccept: continue
            for names in (("N", "CA", "C"), ("N", "CA", "CB"), ("CA", "C", "O"), ("N", "CA", "C", "O"), ("ZZ", "CA", "C")):
                keys = tuple(ric.rak(n) for n in names)
                for missingOK in (False, True):
                    # sorted: the order of the lists follows a Python set and is not reproducible between runs
                    out.append({"res": ric.pretty_str(), "ask": list(names), "missingOK": missingOK,
                                "got": attempt(lambda ric=ric, keys=keys, m=missingOK: sorted([k.id for k in t] for t in ric.split_akl(keys, m)))})
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

def protein_pdb(seq, altloc_at=None, drop=()):
    """A small protein with every standard atom of each residue, so the tables have something to walk.

    The coordinates are made up and spread out: this slice builds the hedra and dihedra but computes no values, so
    only which atoms exist matters. `altloc_at` gives one residue's CA two locations; `drop` leaves atoms out.
    """
    from Bio.Data.PDBData import protein_letters_1to3
    import Bio.PDB.ic_data as icd
    lines, serial = [], 1
    for i, lc in enumerate(seq, start=1):
        name3 = protein_letters_1to3[lc].upper()
        atoms = ["N", "CA", "C", "O"]
        for edra in icd.ic_data_sidechains.get(lc, []):
            for atm in edra[:4]:
                if atm.startswith("chi") or atm.startswith("H") or atm in atoms: continue
                atoms.append(atm)
        for atm in atoms:
            if (i, atm) in drop: continue
            altlocs = ["A", "B"] if altloc_at == (i, atm) else [" "]
            for alt in altlocs:
                occ = 0.5 if alt != " " else 1.0
                x, y, z = 10.0 + serial, 20.0 + (serial % 7), 30.0 + (serial % 5)
                element = atm[0]
                lines.append(f"ATOM  {serial:5d} {atm:<4s}{alt}{name3} A{i:4d}    {x:8.3f}{y:8.3f}{z:8.3f}{occ:6.2f}  0.00          {element:>2s}\n")
                serial += 1
    lines.append("END\n")
    return "".join(lines)

PROTEINS = [
    protein_pdb("AG"),                                  # alanine and glycine, which has no C-beta
    protein_pdb("AGSV"),
    protein_pdb("LIKFW"),                               # long side chains, including the aromatics
    protein_pdb("CMPTY"),
    protein_pdb("AG", altloc_at=(1, "CA")),             # a disordered alpha carbon, which splits the angles
    protein_pdb("AGS", altloc_at=(2, "N")),
    protein_pdb("AGS", drop=((2, "O"),)),               # no O, which sends C-beta down its alternative path
    protein_pdb("AGS", drop=((2, "CA"),)),              # a hole in the backbone
    protein_pdb("A"),                                   # one residue: no neighbours either side
]
for text in TEXTS + PROTEINS:
    cases.append({"kind": "edra_build", "text": text})
    cases.append({"kind": "split", "text": text})

RUNNERS = {"key": run_key, "pair": run_pair, "sort": run_sort, "edron": run_edron, "epair": run_epair,
           "residue": run_residue, "edra_build": run_edra_build, "split": run_split}
kept = []
for c in cases:
    res = run_isolated(RUNNERS[c["kind"]], c)
    if res is None: continue
    c.update(res); kept.append(c)

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": kept}, open(OUT, "w"))
print(len(kept), "cases ->", OUT)
