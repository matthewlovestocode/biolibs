"""Golden cases for Bio.PDB.Polypeptide -> packages/pdb/test/golden/polypeptide.json

`build` cases give a PDB text with synthetic backbones (chosen so some peptide bonds are intact, some stretched, some
with alternative locations) and a builder; the result lists every polypeptide with its sequence, angles and the
`xtra` values and altloc selections the call leaves behind. `func` cases call the module's lookup functions.
"""
import io, json, math, os, random, warnings
import numpy as np
from Bio.PDB import PDBParser
from Bio.PDB import Polypeptide as PP
from Bio.PDB.Polypeptide import PPBuilder, CaPPBuilder
from pdb_encode import tname, emsg
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "polypeptide.json")
rnd = random.Random(77)
cases = []

def num(x):
    if x is None: return None
    x = float(x)
    return "nan" if math.isnan(x) else "inf" if x == math.inf else "-inf" if x == -math.inf else x

def enc_xtra(r): return {k: num(v) for k, v in sorted(r.xtra.items())}
def sel(r):
    out = []
    for a in r.get_list():
        out.append(a.selected_child.altloc if a.is_disordered() == 2 else None)
    return out

def enc_pp(pp):
    out = {"len": len(pp), "ids": [list(r.id) for r in pp], "names": [r.get_resname() for r in pp], "seq": str(pp.get_sequence())}
    try: out["repr"] = repr(pp)
    except Exception as e: out["repr_exc"] = tname(e)
    for k, f in (("ca", lambda: [repr(a) for a in pp.get_ca_list()]), ("phipsi", lambda: [[num(a), num(b)] for a, b in pp.get_phi_psi_list()]),
                 ("tau", lambda: [num(v) for v in pp.get_tau_list()]), ("theta", lambda: [num(v) for v in pp.get_theta_list()])):
        try: out[k] = f()
        except Exception as e: out[k + "_exc"] = {"type": tname(e), "msg": emsg(e)}
    out["xtra"] = [enc_xtra(r) for r in pp]
    out["sel"] = [sel(r) for r in pp]
    return out

def node(s, path):
    x = s
    for i in path: x = x.child_list[i]
    return x

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if case["kind"] == "func":
                f = getattr(PP, case["func"]); args = case["args"]
                r = f(*args)
                out["result"] = r if not isinstance(r, tuple) else list(r)
            else:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(case["text"]))
                b = (CaPPBuilder if case["builder"] == "ca" else PPBuilder)(*([case["radius"]] if case["radius"] is not None else []))
                target = node(s, case["path"])
                pps = b.build_peptides(target, case["aa_only"])
                out["pps"] = [enc_pp(pp) for pp in pps]
                out["after"] = [[enc_xtra(r), sel(r)] for m in s.child_list for c in m.child_list for r in c.child_list]
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out


def add(c):
    res = run_isolated(run, c)
    if res is None: return
    c.update(res); cases.append(c)

# ---- synthetic backbones ----
AA = ["ALA", "GLY", "SER", "LEU", "MET", "CYS", "VAL", "PRO", "ASP", "LYS", "TRP", "TYR"]
OTHER = ["MSE", "FME", "HOH", "ZN", "UNK", "DA", "A", "DT", "NAG"]

def unit():
    v = np.array([rnd.gauss(0, 1) for _ in range(3)]); return v / np.linalg.norm(v)

def atom_line(rec, serial, name, alt, resname, chain, seq, icode, xyz, occ, elem):
    full = (" " + name).ljust(4) if len(elem) == 1 else name.ljust(4)
    return "%-6s%5d %s%s%3s %s%4d%s   %8.3f%8.3f%8.3f%6.2f%6.2f          %2s\n" % (rec, serial, full, alt, resname, chain, seq, icode, *xyz, occ, 10.0, elem)

def gen_text():
    lines, serial = [], 1
    for chain in rnd.sample(["A", "B", "C"], rnd.randint(1, 2)):
        pos = np.array([rnd.uniform(-20, 20) for _ in range(3)])
        seq = rnd.choice([1, 10, 100])
        for _ in range(rnd.randint(1, 9)):
            kind = rnd.random()
            resname = rnd.choice(AA) if kind < 0.8 else rnd.choice(OTHER)
            rec = "HETATM" if resname in ("MSE", "FME", "HOH", "ZN", "NAG", "UNK") else "ATOM"
            if resname == "UNK" and rnd.random() < 0.5: rec = "ATOM"
            n = pos
            ca = n + unit() * 1.46
            c = ca + unit() * 1.52
            atoms = {}
            if resname not in ("HOH", "ZN"):
                if rnd.random() < 0.92: atoms["N"] = (n, "N")
                if resname in ("UNK",) and rnd.random() < 0.3: pass
                elif rnd.random() < 0.97: atoms["CA"] = (ca, "C")
                if rnd.random() < 0.92: atoms["C"] = (c, "C")
                atoms["O"] = (c + unit() * 1.2, "O")
            else:
                atoms["O" if resname == "HOH" else "ZN"] = (pos, "O" if resname == "HOH" else "ZN")
            icode = rnd.choice([" "] * 5 + ["A"])
            for name, (xyz, elem) in atoms.items():
                if name in ("N", "C", "CA") and rnd.random() < 0.12:
                    # alternative locations: the parser needs letters and occupancies
                    for alt, occ in (("A", rnd.choice([0.6, 0.5])), ("B", 0.4)):
                        lines.append(atom_line(rec, serial, name, alt, resname, chain, seq, icode, xyz + np.array([unit()[i] * rnd.choice([0.1, 0.8]) for i in range(3)]), occ, elem)); serial += 1
                else:
                    lines.append(atom_line(rec, serial, name, " ", resname, chain, seq, icode, xyz, 1.0, elem)); serial += 1
            # the next residue starts a bond length (or a gap) after this C
            gap = rnd.choice([1.33, 1.33, 1.33, 1.6, 1.79, 1.81, 2.5, 6.0])
            pos = c + unit() * gap
            seq += rnd.choice([1, 1, 1, 2])
    return "".join(lines)

for _ in range(1500):
    text = gen_text()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            s = PDBParser(PERMISSIVE=True, QUIET=True).get_structure("x", io.StringIO(text))
    except Exception: continue
    path = rnd.choice([[], [0], [0, 0]] + [[0, i] for i in range(len(s[0].child_list))])
    add({"kind": "build", "text": text, "builder": rnd.choice(["pp", "pp", "ca"]), "radius": rnd.choice([None, None, 1.5, 2.0, 4.0, 3.0]),
         "aa_only": rnd.choice([1, 0, True, False]), "path": path})
# entity levels that are not allowed
for _ in range(20):
    text = gen_text()
    add({"kind": "build", "text": text, "builder": "pp", "radius": None, "aa_only": 1, "path": rnd.choice([[0, 0, 0], [0, 0, 0, 0]])})

# lookup functions
for i in list(range(-1, 22)): 
    add({"kind": "func", "func": "index_to_one", "args": [i]}); add({"kind": "func", "func": "index_to_three", "args": [i]})
for l in "ACDEFGHIKLMNPQRSTVWY" + "BJOUXZa1":
    add({"kind": "func", "func": "one_to_index", "args": [l]})
for t in sorted(PP.standard_aa_names) + ["MSE", "ala", "XYZ", ""]:
    add({"kind": "func", "func": "three_to_index", "args": [t]})
NAMES = ["ALA", "ala", "MSE", "FME", "A  ", "A", "DA ", "DA", "A2L", "HOH", "UNK", "G  ", "U  ", "TYR", "tyr", "T  ", "N  ", "", "XYZ", "MET", "SEC", "PYL", "DT ", "DU ", "ASX"]
for n in NAMES:
    for std in (False, True):
        add({"kind": "func", "func": "is_aa", "args": [n, std]}); add({"kind": "func", "func": "is_nucleic", "args": [n, std]})

report_skipped()
json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases,", sum(1 for c in cases if "exc" in c), "raise ->", OUT)
