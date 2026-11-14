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
  i2a   - internal_to_atom_coordinates: the atoms rebuilt from the angle values, with part of the chain
          invalidated first so that there is something to rebuild.
  i2a_ser - the serial assembly: internal_to_atom_coordinates over a start/fin subregion, or with
          ParallelAssembleResidues turned off, which drops the residues outside the range.
  a2ic  - atom_to_internal_coordinates: the index maps init_edra and build_edraArrays lay down, and the bond
          lengths, bond angles and dihedral angles measured from the atom coordinates.

`_cmp` returns a pair of ranks rather than a sign, and for two atom names in none of its tables it falls through to
`int()` of the names and raises; both are recorded as they come.
"""
import json, os, random
from Bio.PDB.internal_coords import AtomKey, Edron
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
# Their lengths and angle values live on IC_Chain, so an edron built on its own has no chain to read them from:
# Biopython reports 0.0 for a hedron and raises for a dihedron's repr, and both are recorded as they come.
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

# ---------------- measuring the angles ----------------
# `atom_to_internal_coordinates` allocates the chain's value arrays (`init_edra`), builds the index maps between
# them and the atom array (`build_edraArrays`), then measures every hedron with the law of cosines and every
# dihedron as the azimuth of its fourth atom in the coordinate space of its first three.
def enc6(x):
    """Round to six places, with the strings the other PDB cases use for the values JSON has no syntax for."""
    import math
    x = float(x)
    if math.isnan(x): return "nan"
    if math.isinf(x): return "inf" if x > 0 else "-inf"
    return round(x, 6)

def run_a2ic(case):
    """Measure a parsed chain and record the maps and the values, through the entry point under test."""
    import io, warnings as w2
    from Bio.PDB import PDBParser
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
        out = []
        entry = case["entry"]
        with w2.catch_warnings(record=True) as rec:
            w2.simplefilter("always")
            if entry == "structure": s.atom_to_internal_coordinates()
            elif entry == "model": [m.atom_to_internal_coordinates() for m in s.get_models()]
            else: [c.atom_to_internal_coordinates() for c in s.get_chains()]
        warned = [f"{w.category.__name__}: {w.message}" for w in rec]
        for chain in list(s.get_chains())[:2]:
            cic = chain.internal_coord
            if cic is None or not hasattr(cic, "hedraLen"):
                # No buildable residue, so atom_to_internal_coordinates escaped before allocating anything.
                out.append({"empty": True, "residues": [ric.pretty_str() for ric in cic.ordered_aa_ic_list]
                            if cic is not None else None})
                continue
            r6 = lambda a: [enc6(x) for x in a]
            # With no dihedron the measurement returns right after init_edra, leaving the value arrays as
            # `np.empty` gave them: uninitialized memory, which is not a thing to record.
            measured = len(cic.dihedra) > 0
            vals = lambda a: r6(a) if measured else None
            out.append({
                "hedraLen": cic.hedraLen, "dihedraLen": cic.dihedraLen,
                "hedraNdx": [f"{Edron.gen_key(k)}={v}" for k, v in cic.hedraNdx.items()],
                "dihedraNdx": [f"{Edron.gen_key(k)}={v}" for k, v in cic.dihedraNdx.items()],
                "measured": measured,
                "hedraL12": vals(cic.hedraL12), "hedraL23": vals(cic.hedraL23), "hedraAngle": vals(cic.hedraAngle),
                "dihedraAngle": vals(cic.dihedraAngle), "dihedraAngleRads": vals(cic.dihedraAngleRads),
                "a2ha_map": [int(x) for x in cic.a2ha_map], "a2da_map": [int(x) for x in cic.a2da_map],
                "a2h_map": [[int(x) for x in row] for row in cic.a2h_map],
                "h2aa": [[int(x) for x in row] for row in cic.h2aa],
                "a2d_map": [[[int(x) for x in half] for half in pair] for pair in cic.a2d_map],
                "dRev": [bool(x) for x in cic.dRev], "dFwd": [bool(x) for x in cic.dFwd],
                "dH1ndx": [int(x) for x in cic.dH1ndx], "dH2ndx": [int(x) for x in cic.dH2ndx],
                "h1d_map": [[int(x) for x in row] for row in cic.h1d_map],
                "id3_dh_index": [f"{Edron.gen_key(k)}=" + ",".join(Edron.gen_key(d) for d in v)
                                 for k, v in cic.id3_dh_index.items()],
                "id32_dh_index": [f"{Edron.gen_key(k)}=" + ",".join(Edron.gen_key(d) for d in v)
                                  for k, v in cic.id32_dh_index.items()],
                "dcsValid": [bool(x) for x in cic.dcsValid],
                "dAtoms_needs_update": [bool(x) for x in cic.dAtoms_needs_update],
                "hAtoms_needs_update": [bool(x) for x in cic.hAtoms_needs_update],
                "dCoordSpace": [[[r6(row) for row in m] for m in half] for half in cic.dCoordSpace]
                                if measured else None,
                # the di/hedra now read their values out of the chain's arrays
                "hedra": sorted([h.id] + ([enc6(h.len12), enc6(h.angle), enc6(h.len23)] if measured else [])
                                for h in cic.hedra.values()),
                "dihedra": sorted([d.id] + ([enc6(d.angle)] if measured else []) + [bool(d.reverse),
                                   d.h1key is None and "" or Edron.gen_key(d.h1key),
                                   Edron.gen_key(d.h2key)] for d in cic.dihedra.values()),
                # a second pass must not change anything: init_edra's guards hold
                "again": attempt(lambda chain=chain: [enc6(x) for x in
                                                      chain.atom_to_internal_coordinates() or chain.internal_coord.dihedraAngle])
                         if measured else None,
            })
        return {"chains": out, "warnings_seen": warned}
    out = attempt(one)
    out["warnings"] = []
    return out

# Jittered coordinates, so the angles are not the degenerate 180 degrees a lattice gives.
jrnd = random.Random(5151)
def jitter(text):
    lines = []
    for line in text.splitlines(True):
        if line.startswith(("ATOM", "HETATM")):
            x, y, z = (float(line[30:38]) + jrnd.uniform(-1.4, 1.4) for _ in range(3))
            line = f"{line[:30]}{x:8.3f}{y:8.3f}{z:8.3f}{line[54:]}"
        lines.append(line)
    return "".join(lines)

GEOM = [jitter(t) for t in PROTEINS]
# The lattice coordinates of PROTEINS put every atom of a residue on one line, and a dihedral angle measured
# across collinear atoms is pure rounding noise -- NumPy reads 1.8e-15 where the exact answer is zero, so the
# azimuth comes out as a right angle rather than nothing. Only the jittered copies are measured here.
for i, text in enumerate(TEXTS + GEOM):
    cases.append({"kind": "a2ic", "text": text, "entry": ("chain", "model", "structure")[i % 3]})

# ---------------- rebuilding the atoms ----------------
# `internal_to_atom_coordinates` is the other direction: `propagate_changes` marks the atoms that depend on one
# already invalid, `init_atom_coords` places each di/hedron's atoms in its own coordinate space from the measured
# values, and `assemble_residues` transforms them into the chain's. Something has to be invalid for any of it to
# do work, so each case says what to invalidate first.
def run_i2a(case):
    """Measure a chain, invalidate part of it, rebuild, and record everything the rebuild touched."""
    import io, warnings as w2, numpy as np
    from Bio.PDB import PDBParser
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
            for c in s.get_chains(): c.atom_to_internal_coordinates()
        out = []
        for chain in list(s.get_chains())[:2]:
            cic = chain.internal_coord
            if cic is None or not hasattr(cic, "dAtoms_needs_update"):
                out.append({"empty": True})
                continue
            before = [[enc6(x) for x in row] for row in cic.atomArray]
            beforeNums = cic.atomArray.copy()
            how = case["how"]
            # Invalidate: nothing, everything, the last atom, the N of a middle residue, or change one angle.
            if how == "all": cic.atomArrayValid[:] = False
            elif how == "last": cic.atomArrayValid[-1] = False
            elif how == "mid_n":
                for ndx, ak in enumerate(cic.aktuple):
                    if ak.akl[AtomKey.fields.atm] == "N" and ndx > 0:
                        cic.atomArrayValid[ndx] = False
                        break
            elif how == "angle" and cic.dihedraLen > 0:
                k = cic.dihedraLen // 2
                cic.dihedraAngle[k] = (cic.dihedraAngle[k] + 30.0 + 180.0) % 360.0 - 180.0
                cic.dihedraAngleRads[k] = np.deg2rad(cic.dihedraAngle[k])
                cic.dAtoms_needs_update[k] = True
                cic.atomArrayValid[cic.a2da_map.reshape(-1, 4)[k][3]] = False
            with w2.catch_warnings(record=True) as rec:
                w2.simplefilter("always")
                entry = case["entry"]
                if entry == "structure": s.internal_to_atom_coordinates()
                elif entry == "model": [m.internal_to_atom_coordinates() for m in s.get_models()]
                else: [c.internal_to_atom_coordinates() for c in s.get_chains()]
                if case.get("twice"):
                    chain.internal_to_atom_coordinates()
            r6 = lambda a: [enc6(x) for x in a]
            out.append({
                "before": before,
                "coords": [[enc6(x) for x in row] for row in cic.atomArray],
                "valid": [bool(v) for v in cic.atomArrayValid],
                # how far the rebuilt chain moved: the whole chain is rebuilt in its first hedron's frame when
                # the start was invalidated, so this is large by design in that case
                # rounded coarsely on purpose: this is a maximum over every atom, so its last digits are the
                # noise of whichever difference happened to be largest, and only its size is meaningful
                "max_dev": round(float(np.max(np.abs(cic.atomArray[:, 0:3] - beforeNums[:, 0:3]))), 3)
                           if cic.AAsiz else 0.0,
                "hAtoms": [[r6(a) for a in h] for h in cic.hAtoms],
                "hAtomsR": [[r6(a) for a in h] for h in cic.hAtomsR],
                "dAtoms": [[r6(a) for a in d] for d in cic.dAtoms],
                "a4_pre_rotation": [r6(a) for a in cic.a4_pre_rotation],
                "hAtoms_needs_update": [bool(v) for v in cic.hAtoms_needs_update],
                "dAtoms_needs_update": [bool(v) for v in cic.dAtoms_needs_update],
                "dcsValid": [bool(v) for v in cic.dcsValid],
                "dSetValid": [[bool(v) for v in row] for row in cic.dSetValid],
                "dSet": [[r6(a) for a in d] for d in cic.dSet],
                "atom_views": [None if a is None else r6(a.coord) for a in cic.bpAtomArray],
                "warnings_seen": [f"{w.category.__name__}: {w.message}" for w in rec],
                # measuring the rebuilt atoms must give the angles back
                "remeasured": attempt(lambda chain=chain: [enc6(x) for x in
                                                           (chain.atom_to_internal_coordinates(), cic.dihedraAngle)[1]]),
            })
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

# A chain with no internal coordinates raises a bare Exception from the entity entry point.
def run_i2a_unset(case):
    import io, warnings as w2
    from Bio.PDB import PDBParser
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
        return [attempt(lambda c=c: c.internal_to_atom_coordinates()) for c in list(s.get_chains())[:2]]
    out = attempt(one)
    out["warnings"] = []
    return out

for i, text in enumerate(GEOM):
    for how in ("none", "all", "last", "mid_n", "angle"):
        cases.append({"kind": "i2a", "text": text, "how": how, "entry": ("chain", "model", "structure")[i % 3],
                      "twice": how in ("angle", "all")})
for text in GEOM[:2] + TEXTS[:2]:
    cases.append({"kind": "i2a_unset", "text": text})

# ---------------- the serial assembly ----------------
# A start or fin sequence position (or ParallelAssembleResidues = False) sends the rebuild through
# `assemble_residues_ser` and `IC_Residue.assemble`, which walks each residue's hedra from its N-CA-C outwards.
# The residues outside the range lose their atom keys *and* their atoms.
def run_i2a_ser(case):
    """Rebuild through the serial path and record the atoms, the keys each residue kept and the transforms."""
    import io, warnings as w2
    from Bio.PDB import PDBParser
    from Bio.PDB.internal_coords import IC_Chain
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
            for c in s.get_chains(): c.atom_to_internal_coordinates()
        if case.get("serial_flag"): IC_Chain.ParallelAssembleResidues = False
        out = []
        for chain in list(s.get_chains())[:2]:
            cic = chain.internal_coord
            if cic is None or not hasattr(cic, "dAtoms_needs_update"):
                out.append({"empty": True})
                continue
            if case["how"] == "all": cic.atomArrayValid[:] = False
            with w2.catch_warnings(record=True) as rec:
                w2.simplefilter("always")
                exc = attempt(lambda chain=chain: chain.internal_to_atom_coordinates(
                    False, case.get("start"), case.get("fin")))
            r6 = lambda a: [enc6(x) for x in a]
            out.append({
                "call": exc,
                "coords": [r6(row) for row in cic.atomArray],
                "valid": [bool(v) for v in cic.atomArrayValid],
                "dcsValid": [bool(v) for v in cic.dcsValid],
                "residues": [{
                    "pretty": ric.pretty_str(),
                    "ak_set": None if ric.ak_set is None else sorted(k.id for k in ric.ak_set),
                    "akc": None if ric.akc is None else sorted(
                        f"{k if isinstance(k, str) else k.name}={v.id}" for k, v in ric.akc.items()),
                    "atoms": [a.get_name() for a in ric.residue.get_unpacked_list()],
                    "nchild": len(ric.residue.child_list),
                } for ric in cic.ordered_aa_ic_list],
                # each dihedron keeps its own pair of transforms here, and the chain's array is left stale
                "transforms": sorted([d.id, [r6(row) for row in d.cst], [r6(row) for row in d.rcst]]
                                     for d in cic.dihedra.values()),
                "dCoordSpace0": [[r6(row) for row in m] for m in cic.dCoordSpace[0]],
                "structure_atoms": sorted(a.get_full_id()[3][0] + ":" + a.get_name() for a in s.get_atoms()),
                "warnings_seen": [f"{w.category.__name__}: {w.message}" for w in rec],
            })
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

# `IC_Residue.assemble` on its own, including resetLocation, which builds in the dihedron's own frame.
def run_assemble(case):
    import io, warnings as w2
    from Bio.PDB import PDBParser
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
            for c in s.get_chains(): c.atom_to_internal_coordinates()
        out = []
        for chain in list(s.get_chains())[:1]:
            cic = chain.internal_coord
            if cic is None or not hasattr(cic, "dAtoms_needs_update"): continue
            if case["how"] == "all": cic.atomArrayValid[:] = False
            elif case["how"] == "ncac2":
                # Only the second residue's backbone, so that residue has no valid N-CA-C of its own to build
                # from while the chain start still has: the fallback to the dihedra's own coordinates.
                for ric in cic.ordered_aa_ic_list[1:2]:
                    for nm in ("N", "CA", "C"):
                        ak = ric.akc.get(nm)
                        if ak is not None: cic.atomArrayValid[cic.atomArrayIndex[ak]] = False
            # `assemble` reads the di/hedra's local coordinates, which `init_atom_coords` is what fills in;
            # before that they are `np.empty`'s uninitialised memory, so there would be nothing to compare.
            cic.init_atom_coords()
            # `init_atom_coords` seeds the chain start, so invalidating after it is what leaves the first
            # residue with no valid N-CA-C and sends `_get_startpos` to the dihedra's own coordinates.
            if case["how"] == "all_after": cic.atomArrayValid[:] = False
            for ric in cic.ordered_aa_ic_list:
                got = attempt(lambda ric=ric: sorted(
                    [k.id, [enc6(x) for x in v]] for k, v in (ric.assemble(case["reset"]) or {}).items()))
                out.append({"res": ric.pretty_str(), "got": got,
                            "start": attempt(lambda ric=ric: sorted(k.id for k in ric._get_startpos())),
                            "default": attempt(lambda ric=ric: sorted(k.id for k in ric._default_startpos()))})
            out.append({"coords": [[enc6(x) for x in row] for row in cic.atomArray],
                        "valid": [bool(v) for v in cic.atomArrayValid]})
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

for i, text in enumerate(GEOM):
    for how, kw in (("none", {}), ("all", {}), ("all", {"start": 2}), ("all", {"fin": 2}),
                    ("all", {"start": 2, "fin": 3}), ("all", {"start": 0}), ("all", {"serial_flag": True})):
        cases.append({"kind": "i2a_ser", "text": text, "how": how, **kw})
    for how in ("none", "all", "ncac2", "all_after"):
        for reset in (False, True):
            cases.append({"kind": "assemble", "text": text, "how": how, "reset": reset})


# ---------------- the free functions and the angle statistics ----------------
# `set_accuracy_95` is `float(f"{num:9.5f}")`, so it is as much a test of the format as of the rounding;
# the three angle statistics are circular, which is the whole reason they exist rather than a plain mean.
def run_accuracy(case):
    from Bio.PDB.internal_coords import set_accuracy_95
    out = attempt(lambda: enc6(set_accuracy_95(case["num"])))
    out["warnings"] = []
    return out

def run_angle_stat(case):
    from Bio.PDB.internal_coords import Dihedron
    def one():
        if case["fn"] == "angle_dif": return enc6(Dihedron.angle_dif(case["a"], case["b"]))
        if case["fn"] == "angle_avg":
            return enc6(Dihedron.angle_avg(case["angles"], in_rads=case.get("in_rads", False),
                                           out_rads=case.get("out_rads", False)))
        # `angle_pop_sd` only works on an ndarray: it passes the whole list to `angle_dif`, which adds it to
        # a float, so a plain Python list raises `float + list`. The array form is the one a port can mean.
        import numpy as np
        return enc6(Dihedron.angle_pop_sd(np.array(case["angles"]), case["avg"]))
    out = attempt(one)
    out["warnings"] = []
    return out

for num in (0.0, 1.0, -1.0, 0.123456789, -0.123456789, 1.5, 2.5, 0.000005, 0.0000049, 1234.567891,
            -1234.567891, 99999.999999, 1e-9, -1e-9, 180.0, -180.0, 123.456785, 123.456775):
    cases.append({"kind": "accuracy", "num": num})
ANGLE_PAIRS = [(0.0, 0.0), (10.0, 20.0), (20.0, 10.0), (-170.0, 170.0), (170.0, -170.0), (180.0, -180.0),
               (0.0, 180.0), (0.0, -180.0), (90.0, -90.0), (-90.0, 90.0), (359.0, 1.0), (1.0, 359.0),
               (45.5, -44.5), (-179.9, 179.9)]
for a, b in ANGLE_PAIRS:
    cases.append({"kind": "angle_stat", "fn": "angle_dif", "a": a, "b": b})
ANGLE_LISTS = [[0.0], [180.0], [-180.0], [0.0, 90.0], [10.0, -10.0], [170.0, -170.0], [179.0, -179.0],
               [0.0, 120.0, -120.0], [90.0, 90.0, 90.0], [-60.0, -62.0, -58.0], [0.0, 180.0],
               [45.0, 135.0, -135.0, -45.0]]
for angles in ANGLE_LISTS:
    for in_rads, out_rads in ((False, False), (False, True), (True, False), (True, True)):
        cases.append({"kind": "angle_stat", "fn": "angle_avg", "angles": angles,
                      "in_rads": in_rads, "out_rads": out_rads})
    for avg in (0.0, 90.0, -90.0, 180.0):
        cases.append({"kind": "angle_stat", "fn": "angle_pop_sd", "angles": angles, "avg": avg})

# ---------------- bond lengths, dihedral differences and the pic_flags bits ----------------
# These need a measured chain: `get_length` reads the chain's L12/L23 arrays, `bits` asks the dihedron's own
# residue which chi it is, and `difference` compares two measured angles.
def run_edra_access(case):
    import io, warnings as w2
    from Bio.PDB import PDBParser
    from Bio.PDB.internal_coords import Edron, IC_Residue
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
            s.atom_to_internal_coordinates()
        chain = next(s.get_chains())
        cic = chain.internal_coord
        hedra = [cic.hedra[k] for k in sorted(cic.hedra, key=lambda t: Edron.gen_key(list(t)))]
        dihedra = [cic.dihedra[k] for k in sorted(cic.dihedra, key=lambda t: Edron.gen_key(list(t)))]
        out = {}
        # get_length over every pair of the hedron's own keys, plus a pair from another hedron and a short tuple.
        if case["what"] == "lengths":
            rows = []
            for h in hedra[:6]:
                ak = list(h.atomkeys)
                probes = [(ak[0], ak[1]), (ak[1], ak[0]), (ak[1], ak[2]), (ak[2], ak[1]), (ak[0], ak[2]),
                          (ak[0],), (), (ak[0], ak[1], ak[2])]
                rows.append({"id": h.id,
                             "get": [attempt(lambda p=p: enc6(h.get_length(p))
                                             if h.get_length(p) is not None else None) for p in probes],
                             "set12": attempt(lambda h=h, ak=ak: (h.set_length((ak[0], ak[1]), 1.75),
                                                                  enc6(h.len12), h.needs_update)[1:]),
                             "set23": attempt(lambda h=h, ak=ak: (h.set_length((ak[1], ak[2]), 1.25),
                                                                  enc6(h.len23), h.needs_update)[1:]),
                             "set_bad": attempt(lambda h=h, ak=ak: h.set_length((ak[0],), 1.0)),
                             # The complaint quotes the hedron's repr, which carries its *measured* angle at
                             # full precision -- a number the two implementations agree on to about twelve
                             # places, not to the last bit. The angle is pinned first so the message is about
                             # the message.
                             "set_absent": attempt(lambda h=h: (
                                 cic.hedraAngle.__setitem__(h.ndx, 100.5),
                                 h.set_length((hedra[-1].atomkeys[0], hedra[-1].atomkeys[2]), 1.0))[1])})
            out["hedra"] = rows
        # bits() and difference() over the dihedra, and the flag table they are compared against.
        if case["what"] == "bits":
            out["flags"] = dict(IC_Residue.picFlagsDict)
            out["dihedra"] = [{"id": d.id, "bits": attempt(lambda d=d: d.bits()),
                               "angle": attempt(lambda d=d: enc6(d.angle))} for d in dihedra]
            out["difference"] = [attempt(lambda a=a, b=b: enc6(a.difference(b)))
                                 for a, b in zip(dihedra, dihedra[1:] + dihedra[:1])]
        # Python's hash() of an edron is its atomkeys tuple's, so what a *set* of them does is the behaviour
        # a port has to match: how many survive, and which.
        if case["what"] == "hash":
            out["hedra_set"] = sorted(h.id for h in set(hedra + hedra))
            out["dihedra_set"] = sorted(d.id for d in set(dihedra + dihedra))
            out["mixed_set_len"] = len(set(hedra + dihedra))
            out["dict_round_trip"] = sorted(k.id for k in {h: h.id for h in hedra})
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

for text in GEOM[:3]:
    for what in ("lengths", "bits", "hash"):
        cases.append({"kind": "edra_access", "text": text, "what": what})


# ---------------- IC_Residue's angle and length accessors ----------------
# `pick_angle` is the keystone: every one of `get_angle`, `set_angle`, `bond_rotate` and `bond_set` goes
# through it, and its key grammar is five different things (a tuple, an atom-name string, a relative-position
# string, a named backbone angle, a chiN). Where an angle lives matters too: a residue's phi and omega, and
# the hedra under them, are kept on the *previous* residue, so picking them has to look there.
ANGLE_KEYS = ["psi", "phi", "omg", "omega", "tau", "chi1", "chi2", "chi3", "chi4", "chi5",
              "N:CA:C", "N:CA:C:1N", "-1C:N:CA:C", "-1CA:-1C:N:CA", "0N:0CA:0C", "CA:CB:CG:CD",
              "N:CA:CB", "1N:1CA", "-1C:N", "nonsense", "chi9", "chi", "N:CA:C:1N:1CA"]
LENGTH_KEYS = ["N:CA", "CA:C", "C:O", "CA:CB", "0C:1N", "-1C:N", "N:CA:C", "nonsense", "N"]

def run_residue_access(case):
    import io, warnings as w2
    from Bio.PDB import PDBParser
    from Bio.PDB.internal_coords import IC_Residue, AtomKey
    import numpy as np
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
            s.atom_to_internal_coordinates()
        chain = next(s.get_chains())
        cic = chain.internal_coord
        rics = cic.ordered_aa_ic_list
        if not rics: return {"empty": True}
        what = case["what"]
        out = {}
        if what == "pick":
            rows = []
            for ric in rics[:3]:
                row = {"res": ric.pretty_str(), "pick": [], "get": []}
                for k in ANGLE_KEYS:
                    row["pick"].append(attempt(lambda ric=ric, k=k: (lambda e: None if e is None else e.id)(
                        ric.pick_angle(k))))
                    row["get"].append(attempt(lambda ric=ric, k=k: (lambda v: None if v is None else enc6(v))(
                        ric.get_angle(k))))
                # a tuple of AtomKeys, which is the only way to reach a disordered angle
                aks = tuple(sorted(ric.ak_set))[:4]
                for n in (3, 4, 2):
                    row["pick"].append(attempt(lambda ric=ric, t=tuple(aks[:n]): (
                        lambda e: None if e is None else e.id)(ric.pick_angle(t))))
                rows.append(row)
            out["residues"] = rows
        if what == "set":
            rows = []
            for ric in rics[:3]:
                row = {"res": ric.pretty_str()}
                for k, overlap in (("chi1", True), ("chi1", False), ("psi", True), ("psi", False),
                                   ("tau", True), ("phi", True), ("nonsense", True)):
                    # Each set runs on a chain of its own so the changes cannot pile up.
                    with w2.catch_warnings():
                        w2.simplefilter("ignore")
                        s2 = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("y", io.StringIO(case["text"]))
                        s2.atom_to_internal_coordinates()
                    c2 = next(s2.get_chains()).internal_coord
                    r2 = c2.ordered_aa_ic_list[rics.index(ric)]
                    before = {d.id: enc6(d.angle) for d in sorted(c2.dihedra.values(), key=lambda d: d.id)}
                    err = attempt(lambda r2=r2, k=k, overlap=overlap: r2.set_angle(k, 42.5, overlap=overlap))
                    after = {d.id: enc6(d.angle) for d in sorted(c2.dihedra.values(), key=lambda d: d.id)}
                    row[f"{k}-{overlap}"] = {"exc": err.get("exc"),
                                             "changed": {kk: [before[kk], after[kk]]
                                                         for kk in before if before[kk] != after[kk]}}
                rows.append(row)
            out["residues"] = rows
        if what == "rotate":
            rows = []
            for ric in rics[:3]:
                row = {"res": ric.pretty_str()}
                for fn, k, v in (("bond_rotate", "chi1", 15.0), ("bond_rotate", "psi", -30.0),
                                 ("bond_set", "chi1", 60.0), ("bond_set", "psi", 170.0),
                                 ("bond_rotate", "nonsense", 10.0), ("bond_rotate", "tau", 5.0)):
                    with w2.catch_warnings():
                        w2.simplefilter("ignore")
                        s2 = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("y", io.StringIO(case["text"]))
                        s2.atom_to_internal_coordinates()
                    c2 = next(s2.get_chains()).internal_coord
                    r2 = c2.ordered_aa_ic_list[rics.index(ric)]
                    before = {d.id: enc6(d.angle) for d in sorted(c2.dihedra.values(), key=lambda d: d.id)}
                    err = attempt(lambda r2=r2, fn=fn, k=k, v=v: getattr(r2, fn)(k, v))
                    after = {d.id: enc6(d.angle) for d in sorted(c2.dihedra.values(), key=lambda d: d.id)}
                    row[f"{fn}-{k}"] = {"exc": err.get("exc"),
                                        "changed": {kk: [before[kk], after[kk]]
                                                    for kk in before if before[kk] != after[kk]}}
                rows.append(row)
            out["residues"] = rows
        if what == "lengths":
            rows = []
            for ric in rics[:3]:
                row = {"res": ric.pretty_str(), "pick": [], "get": []}
                for k in LENGTH_KEYS:
                    row["pick"].append(attempt(lambda ric=ric, k=k: (lambda r: (
                        None if r[0] is None else sorted(h.id for h in r[0]),
                        None if r[1] is None else [a.id for a in r[1]]))(ric.pick_length(k))))
                    row["get"].append(attempt(lambda ric=ric, k=k: (lambda v: None if v is None else enc6(v))(
                        ric.get_length(k))))
                # set_length, then read it back through get_length
                row["set"] = []
                for k in ("N:CA", "CA:C", "0C:1N", "nonsense"):
                    with w2.catch_warnings():
                        w2.simplefilter("ignore")
                        s2 = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("y", io.StringIO(case["text"]))
                        s2.atom_to_internal_coordinates()
                    c2 = next(s2.get_chains()).internal_coord
                    r2 = c2.ordered_aa_ic_list[rics.index(ric)]
                    err = attempt(lambda r2=r2, k=k: r2.set_length(k, 1.6))
                    row["set"].append({"key": k, "exc": err.get("exc"),
                                       "back": attempt(lambda r2=r2, k=k: (lambda v: None if v is None
                                                                           else enc6(v))(r2.get_length(k)))})
                rows.append(row)
            out["residues"] = rows
        if what == "misc":
            ric = rics[0]
            # applyMtx over a known transform: a scale, which shows up in every coordinate of that residue.
            mtx = np.array([[2.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0],
                            [0.0, 0.0, 0.0, 1.0]])
            before = [[enc6(x) for x in cic.atomArray[cic.atomArrayIndex[ak]]] for ak in sorted(ric.ak_set)]
            out["applyMtx"] = {"exc": attempt(lambda: ric.applyMtx(mtx)).get("exc"), "before": before,
                               "after": [[enc6(x) for x in cic.atomArray[cic.atomArrayIndex[ak]]]
                                         for ak in sorted(ric.ak_set)]}
            out["clear_transforms"] = {
                "before": [bool(x) for x in cic.dcsValid],
                "exc": attempt(lambda: rics[0].clear_transforms()).get("exc"),
                "after": [bool(x) for x in cic.dcsValid]}
            # The OpenSCAD markers, which are plain attributes the writer reads later.
            for fn, flags in (("set_flexible", ("flex_female_1", "flex_female_2", "flex_male_1",
                                                "flex_male_2", "skinny_1")),
                              ("set_hbond", ("hbond_1", "hbond_2"))):
                for r2 in rics: getattr(r2, fn)()
                out[fn] = sorted(
                    [h.id] + [f for f in flags if getattr(h, f, False)]
                    for h in cic.hedra.values() if any(getattr(h, f, False) for f in flags))
            out["pdb_residue_string"] = [attempt(lambda r2=r2: r2.pdb_residue_string()) for r2 in rics[:3]]
            # with the class-level overrides set, which change the serial number and the chain id
            IC_Residue.atom_sernum, IC_Residue.atom_chain = 500, "Z"
            out["pdb_residue_string_override"] = attempt(lambda: rics[0].pdb_residue_string())
            IC_Residue.atom_sernum, IC_Residue.atom_chain = None, None
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

# Jittered fixtures only. `protein_pdb`'s invented coordinates put whole runs of atoms on a line, and a
# dihedral through three collinear atoms is undefined: both libraries then read it off a cross product that
# is zero to within rounding, so numpy lands on exactly 0.0 and this port on atan2 of two values near 1e-15
# -- which is 56 degrees. Nothing to reconcile there, so the cases use geometry that is not degenerate.
for text in [GEOM[1], GEOM[2], GEOM[0], jitter(protein_pdb("CMPTY"))]:
    for what in ("pick", "set", "rotate", "lengths", "misc"):
        cases.append({"kind": "residue_access", "text": text, "what": what})


# ---------------- IC_Chain from distances, and the housekeeping ----------------
# The round trip that matters: measure a chain, take a distance plot of its atoms, throw the angles away
# and recover them from the distances alone. A plot cannot tell a structure from its mirror image, so the
# chirality signs travel separately -- without them every dihedral comes back positive.
def run_chain_dist(case):
    import io, warnings as w2
    import numpy as np
    from Bio.PDB import PDBParser
    from Bio.PDB.internal_coords import AtomKey
    def one():
        with w2.catch_warnings():
            w2.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
            s.atom_to_internal_coordinates()
        chain = next(s.get_chains())
        cic = chain.internal_coord
        out = {}
        if case["what"] == "plot":
            plot = cic.distance_plot()
            out["shape"] = list(plot.shape)
            out["plot"] = [[enc6(x) for x in row] for row in plot]
            # the classic C-alpha plot, by the filter the docstring recommends
            atmNdx = AtomKey.fields.atm
            ca = [cic.atomArrayIndex[k] for k in cic.atomArrayIndex if k.akl[atmNdx] == "CA"]
            out["ca_filter"] = ca
            out["ca_plot"] = [[enc6(x) for x in row] for row in cic.distance_plot(ca)]
            out["signs"] = [enc6(x) for x in cic.dihedral_signs()]
        if case["what"] == "round_trip":
            plot = cic.distance_plot()
            signs = cic.dihedral_signs()
            before = {"hedra": [enc6(x) for x in cic.hedraAngle],
                      "dihedra": [enc6(x) for x in cic.dihedraAngle]}
            cic.distplot_to_dh_arrays(plot, signs)
            out["arrays"] = {"L12": [enc6(x) for x in cic.hedraL12], "L23": [enc6(x) for x in cic.hedraL23],
                             "L13": [enc6(x) for x in cic.hedraL13],
                             "L14": [enc6(x) for x in cic.dihedraL14]}
            cic.distance_to_internal_coordinates(resetAtoms=case.get("reset", True))
            out["before"] = before
            out["after"] = {"hedra": [enc6(x) for x in cic.hedraAngle],
                            "dihedra": [enc6(x) for x in cic.dihedraAngle]}
            out["valid"] = [bool(x) for x in cic.atomArrayValid]
            out["needs_update"] = {"h": [bool(x) for x in cic.hAtoms_needs_update],
                                   "d": [bool(x) for x in cic.dAtoms_needs_update]}
            # Without the signs, every angle comes back positive -- recorded so the port cannot skip them.
            cic.distplot_to_dh_arrays(plot, np.ones(len(signs)))
            cic.distance_to_internal_coordinates()
            out["unsigned"] = [enc6(x) for x in cic.dihedraAngle]
        if case["what"] == "copy_extend":
            with w2.catch_warnings():
                w2.simplefilter("ignore")
                s2 = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("y", io.StringIO(case["text"]))
                s2.atom_to_internal_coordinates()
            c2 = next(s2.get_chains()).internal_coord
            c2.atomArray[:] = 0.0
            c2.atomArrayValid[:] = False
            c2.copy_initNCaCs(cic)
            out["initNCaCs"] = [[ak.id for ak in t] for t in sorted(cic.initNCaCs, key=lambda t: [a.id for a in t])]
            out["copied"] = [[enc6(x) for x in c2.atomArray[cic.atomArrayIndex[ak]]]
                             for iN in sorted(cic.initNCaCs, key=lambda t: [a.id for a in t]) for ak in iN]
            out["valid_after_copy"] = [bool(x) for x in c2.atomArrayValid]
            # make_extended, which is set_angle("psi") and set_angle("phi") over every residue
            cic.make_extended()
            out["extended"] = {"psi": [attempt(lambda r=r: (lambda v: None if v is None else enc6(v))(
                                   r.get_angle("psi"))) for r in cic.ordered_aa_ic_list],
                               "phi": [attempt(lambda r=r: (lambda v: None if v is None else enc6(v))(
                                   r.get_angle("phi"))) for r in cic.ordered_aa_ic_list]}
            # and clear_ic, which drops every residue's internal_coord
            cic.clear_ic()
            out["cleared"] = [r.internal_coord is None for r in chain.get_residues()]
        return out
    out = attempt(one)
    out["warnings"] = []
    return out

for text in [GEOM[0], GEOM[1], GEOM[2], jitter(protein_pdb("AGS", drop=((2, "CA"),)))]:
    for what in ("plot", "round_trip", "copy_extend"):
        cases.append({"kind": "chain_dist", "text": text, "what": what})
cases.append({"kind": "chain_dist", "text": GEOM[1], "what": "round_trip", "reset": False})

RUNNERS = {"key": run_key, "pair": run_pair, "sort": run_sort, "edron": run_edron, "epair": run_epair,
           "residue": run_residue, "edra_build": run_edra_build, "split": run_split, "a2ic": run_a2ic, "i2a": run_i2a, "i2a_unset": run_i2a_unset, "i2a_ser": run_i2a_ser, "assemble": run_assemble,
           "accuracy": run_accuracy, "angle_stat": run_angle_stat, "edra_access": run_edra_access, "residue_access": run_residue_access, "chain_dist": run_chain_dist}
kept = []
for c in cases:
    res = run_isolated(RUNNERS[c["kind"]], c)
    if res is None: continue
    c.update(res); kept.append(c)

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": kept}, open(OUT, "w"))
print(len(kept), "cases ->", OUT)
