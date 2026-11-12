"""Golden cases for Bio.PDB (PDBParser and the structure hierarchy) -> packages/pdb/test/golden/pdb.json

Each case is a PDB file's text plus parser options; the result is the full structure (every entity, atom and
disordered wrapper), the header dictionary, the trailer and the warnings, or the exception.
"""
import io, json, math, os, random, warnings
import Bio
from Bio.PDB import PDBParser
from Bio.PDB.Atom import Atom, DisorderedAtom
from Bio.PDB.Residue import Residue, DisorderedResidue

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "pdb.json")
rnd = random.Random(21)
cases = []

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e): return None if type(e).__name__ == "AttributeError" else (str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e))
def num(x): return None if x is None or (isinstance(x, float) and math.isnan(x)) else (float(x) if not isinstance(x, (int, bool)) else x)
def arr(a): return None if a is None else [float(v) for v in a]

def enc_atom(a):
    return {"name": a.name, "fullname": a.fullname, "coord": arr(a.coord), "bfactor": num(a.bfactor), "occupancy": num(a.occupancy), "altloc": a.altloc,
            "serial": a.serial_number, "element": a.element, "mass": num(a.mass), "dflag": a.disordered_flag, "anisou": arr(a.anisou_array), "siguij": arr(a.siguij_array),
            "sigatm": arr(a.sigatm_array), "charge": num(a.pqr_charge), "radius": num(a.radius), "full_id": json.loads(json.dumps(a.get_full_id()))}
def enc_child_atom(x):
    if isinstance(x, DisorderedAtom): return {"disordered": "atom", "id": x.id, "selected": x.selected_child.altloc, "children": [enc_atom(c) for c in x.disordered_get_list()]}
    return enc_atom(x)
def enc_res(r):
    return {"id": list(r.id), "resname": r.resname, "segid": r.segid, "disordered": r.disordered, "full_id": json.loads(json.dumps(r.get_full_id())), "atoms": [enc_child_atom(a) for a in r.child_list]}
def enc_child_res(x):
    if isinstance(x, DisorderedResidue): return {"disordered": "residue", "id": list(x.id), "selected": x.selected_child.resname, "children": [enc_res(c) for c in x.child_dict.values()]}
    return enc_res(x)
def enc_structure(s):
    return {"id": s.id, "full_id": list(s.get_full_id()), "models": [{"id": m.id, "serial": m.serial_num, "chains": [{"id": c.id, "residues": [enc_child_res(r) for r in c.child_list]} for c in m.child_list]} for m in s.child_list]}

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            p = PDBParser(PERMISSIVE=case.get("permissive", True), QUIET=case.get("quiet", False), is_pqr=case.get("pqr", False))
            s = p.get_structure(case.get("id", "x"), io.StringIO(case["text"]))
            out["structure"] = enc_structure(s)
            out["header"] = json.loads(json.dumps(p.get_header()))
            out["trailer"] = p.get_trailer()
            out["line_counter"] = p.line_counter
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out

def node(s, path):
    x = s
    for i in path: x = x.child_list[i]
    return x
def key_py(k): return tuple(k) if isinstance(k, list) else k
def apply_op(s, op):
    k = op[0]
    if k == "len": return len(node(s, op[1]))
    if k == "ids": return [json.loads(json.dumps(c.id)) for c in node(s, op[1]).child_list]
    if k == "get": return repr(node(s, op[1])[key_py(op[2])])
    if k == "contains": return key_py(op[2]) in node(s, op[1])
    if k == "repr": return repr(node(s, op[1]))
    if k == "unpacked": return [repr(a) for a in node(s, op[1]).get_unpacked_list()]
    if k == "dist": return float(node(s, op[1]) - node(s, op[2]))
    if k == "cmp":
        a, b = node(s, op[1]), node(s, op[2])
        return [a == b, a != b, a < b, a <= b, a > b, a >= b]
    if k == "setid":
        x = node(s, op[1]); x.id = key_py(op[2])
        return [json.loads(json.dumps(x.get_full_id())), [json.loads(json.dumps(c.get_full_id())) for c in x.child_list][:3]]
    if k == "detach":
        x = node(s, op[1]); x.detach_child(key_py(op[2])); return [len(x), [json.loads(json.dumps(c.id)) for c in x.child_list]]
    if k == "copy":
        x = node(s, op[1]); y = x.copy()
        return [x.strictly_equals(y), x.strictly_equals(y, True), len(y), y.parent is None, json.loads(json.dumps(y.get_full_id()))]
    if k == "strict": return node(s, op[1]).strictly_equals(node(s, op[2]))
    if k == "insert":
        x = node(s, op[1]); x.insert(op[2], node(s, op[3]).copy()); return [len(x), [json.loads(json.dumps(c.id)) for c in x.child_list]]
    if k == "atoms": return [repr(a) for a in node(s, op[1]).get_atoms()][:12]
    raise ValueError(k)
def run_ops(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            s = PDBParser().get_structure("x", io.StringIO(case["text"]))
            res = []; out["ops_out"] = res
            for op in case["ops"]:
                try: res.append({"result": apply_op(s, op)})
                except Exception as e: res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out

def run_isolated(case):
    r, w = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        try: os.write(w, json.dumps(run(case)).encode())
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

def add(c):
    if c["kind"] == "ops":
        c.update(run_ops(c)); cases.append(c); return
    res = run_isolated(c)
    if res is None: return
    c.update(res); cases.append(c)

AA = ["ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE", "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL"]
NAMES = [" N  ", " CA ", " C  ", " O  ", " CB ", " CG ", " CD ", " NE ", " CZ ", "1HB ", "2HB ", " SG ", "CA  ", "FE  ", " ZN ", "N", "CA", " X1 ", " 1H ", "  CA", "HG21"]
ELEMS = ["N", "C", "O", "S", "H", "FE", "ZN", "", "X", "CA", "n"]
def put(cols, start, text):
    for i, ch in enumerate(text): cols[start + i] = ch
def atom_line(rec="ATOM  ", serial=1, name=" CA ", altloc=" ", resname="ALA", chain="A", resseq=1, icode=" ", xyz=(1.0, 2.0, 3.0), occ="  1.00", b=" 10.00", segid="    ", element=" C", pqr=False):
    cols = [" "] * 80
    put(cols, 0, rec); put(cols, 6, f"{serial:5d}"); put(cols, 12, name); put(cols, 16, altloc); put(cols, 17, f"{resname:>3}"); put(cols, 21, chain)
    put(cols, 22, f"{resseq:4d}"); put(cols, 26, icode); put(cols, 30, f"{xyz[0]:8.3f}{xyz[1]:8.3f}{xyz[2]:8.3f}")
    if pqr: put(cols, 54, occ + b)
    else: put(cols, 54, occ); put(cols, 60, b)
    put(cols, 72, segid); put(cols, 76, f"{element:>2}")
    return "".join(cols).rstrip() + "\n"

def header_block(rnd):
    pid = "".join(rnd.choice("123456789ABCDEFGHIJ") for _ in range(4))
    lines = [f"HEADER    {rnd.choice(['HYDROLASE', 'TRANSFERASE/DNA', 'OXIDOREDUCTASE'])}".ljust(50) + f"{rnd.randint(1, 28):02d}-{rnd.choice(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'])}-{rnd.randint(0, 99):02d}   {pid}\n"]
    if rnd.random() < .8: lines.append("TITLE     CRYSTAL STRUCTURE OF A TEST PROTEIN\n"); lines.append("TITLE    2 AT HIGH RESOLUTION\n") if rnd.random() < .5 else None
    if rnd.random() < .7: lines += ["COMPND    MOL_ID: 1;\n", "COMPND   2 MOLECULE: TEST PROTEIN;\n", "COMPND   3 EC: 3.4.21.4;\n", "COMPND   4 CHAIN: A, B;\n"] + (["COMPND    MOL_ID: 2;\n", "COMPND   2 MOLECULE: INHIBITOR;\n"] if rnd.random() < .4 else [])
    if rnd.random() < .6: lines += ["SOURCE    MOL_ID: 1;\n", "SOURCE   2 ORGANISM_SCIENTIFIC: BOS TAURUS;\n", "SOURCE   3 ORGANISM_TAXID: 9913\n"]
    if rnd.random() < .5: lines.append("KEYWDS    SERINE PROTEASE, HYDROLASE\n")
    if rnd.random() < .6: lines.append(rnd.choice(["EXPDTA    X-RAY DIFFRACTION\n", "EXPDTA    SOLUTION NMR\n", "EXPDTA    ELECTRON MICROSCOPY\n"]))
    if rnd.random() < .5: lines.append("AUTHOR    A.B.SMITH,C.D.JONES\n")
    if rnd.random() < .5: lines.append(f"REVDAT   1   {rnd.randint(1, 28):02d}-JAN-{rnd.randint(0, 99):02d} {pid}    0\n")
    if rnd.random() < .5: lines.append(rnd.choice(["REMARK   2 RESOLUTION.    1.80 ANGSTROMS.\n", "REMARK   2 RESOLUTION. NOT APPLICABLE.\n", "REMARK   2 RESOLUTION.    0.00 ANGSTROMS.\n"]))
    if rnd.random() < .4: lines += ["REMARK   1 REFERENCE 1\n", "REMARK   1  AUTH   A.SMITH\n", "REMARK   1  TITL   A TEST\n"]
    if rnd.random() < .4: lines += ["JRNL        AUTH   A.SMITH,B.JONES\n", "JRNL        TITL   SOMETHING\n", "JRNL        REF    J.MOL.BIOL.\n"]
    if rnd.random() < .4: lines += ["REMARK 465\n", "REMARK 465 MISSING RESIDUES\n", "REMARK 465   M RES C SSSEQI\n", "REMARK 465     MET A     1\n", "REMARK 465     GLY A    22A\n", "REMARK 465     1 ALA B     5\n"]
    if rnd.random() < .3: lines += ["REMARK 350\n", "REMARK 350 BIOMOLECULE: 1\n", "REMARK 350 APPLY THE FOLLOWING TO CHAINS: A, B\n", "REMARK 350   BIOMT1   1  1.000000  0.000000  0.000000        0.00000\n", "REMARK 350   BIOMT2   1  0.000000  1.000000  0.000000        0.00000\n", "REMARK 350   BIOMT3   1  0.000000  0.000000  1.000000        0.00000\n"]
    if rnd.random() < .2: lines.append("REMARK  99 ASTRAL SCOP-sccs: a.1.1.1\n")
    return lines

def coords_block(rnd, pqr=False):
    out = []; serial = 1
    nmodels = rnd.choice([0, 0, 0, 2, 3])
    def one_chain(chain, nres):
        nonlocal serial
        lines = []
        for r in range(1, nres + 1):
            resname = rnd.choice(AA) if rnd.random() < .95 else rnd.choice(["HOH", "WAT", "ZN", "MSE", "NAG"])
            rec = "ATOM  " if resname in AA else "HETATM"
            icode = " " if rnd.random() < .9 else rnd.choice("ABC")
            atoms = rnd.sample(NAMES[:12], rnd.randint(1, 6)) if resname in AA else [rnd.choice([" O  ", "ZN  ", " C1 "])]
            for nm in atoms:
                alts = [" "]
                if rnd.random() < .1: alts = ["A", "B"] if rnd.random() < .7 else ["A", " "]
                for alt in alts:
                    xyz = (rnd.uniform(-50, 50), rnd.uniform(-50, 50), rnd.uniform(-50, 50))
                    occ = rnd.choice(["  1.00", "  0.50", "  0.30", "  0.70", "  1.00", "  0.25", "  1.00", "  0.80", "  0.60", "  1.00", "  1.00", "      ", "  -0.5"] + ["  1.00"] * 14) if not pqr else rnd.choice([" -0.3000", "  0.5000", "        "])
                    b = rnd.choice([" 10.00", " 25.37", " 10.00", "100.00", " 33.10", " 10.00", " 12.50", " 10.00", "      ", " xx.xx"] + [" 10.00"] * 12) if not pqr else rnd.choice(["  1.9000", "  1.5000", "        ", " -1.0000"])
                    el = rnd.choice(ELEMS)
                    lines.append(atom_line(rec, serial, nm, alt, resname, chain, r, icode, xyz, occ, b, rnd.choice(["    ", "SEG1"]), el, pqr))
                    serial += 1
                    if rnd.random() < .05: lines.append("ANISOU" + lines[-1][6:28] + "".join(f"{rnd.randint(-999, 9999):7d}" for _ in range(6)) + "\n")
            if rnd.random() < .05: lines.append(atom_line(rec, serial, atoms[0], " ", rnd.choice(AA), chain, r, icode))  # a duplicate residue id
        lines.append(f"TER   {serial:5d}      ALA {chain}{nres:4d}\n")
        return lines
    chains = rnd.sample("ABCD ", rnd.randint(1, 3))
    if nmodels == 0:
        for c in chains: out += one_chain(c, rnd.randint(1, 6))
    else:
        for m in range(1, nmodels + 1):
            out.append(f"MODEL     {m:4d}\n")
            for c in chains[:2]: out += one_chain(c, rnd.randint(1, 4))
            out.append("ENDMDL\n")
    if rnd.random() < .3: out.append("CONECT    1    2\n")
    if rnd.random() < .3: out.append("MASTER       12    0    0    1    0    0    0    6    0    0    0    0\n")
    if rnd.random() < .3: out.append("END\n")
    return out

def mutate(t, rnd):
    lines = t.split("\n")
    if not lines: return t
    k = rnd.choice(["delete", "dup", "trunc", "garble", "swap", "blank", "chars", "insert", "shortline"]); i = rnd.randrange(len(lines))
    if k == "delete": del lines[i]
    elif k == "dup": lines.insert(i, lines[i])
    elif k == "trunc": return t[:rnd.randrange(len(t) + 1)]
    elif k == "garble": lines[i] = "".join(rnd.choice("ABC /=\"()<>.,;:0123456789 \t*-") for _ in range(rnd.randint(0, 60)))
    elif k == "swap" and len(lines) > 1: j = rnd.randrange(len(lines)); lines[i], lines[j] = lines[j], lines[i]
    elif k == "blank": lines[i] = ""
    elif k == "chars" and lines[i]:
        l = list(lines[i]); 
        for _ in range(rnd.randint(1, 4)): l[rnd.randrange(len(l))] = rnd.choice("X 9-.A")
        lines[i] = "".join(l)
    elif k == "insert": lines.insert(i, rnd.choice(["REMARK   3 SOMETHING", "FOOBAR", "HETATM", "ATOM  ", "MODEL ", "ENDMDL", "TER", "SIGATM", "SIGUIJ", "ANISOU", "XXXXXX"]))
    elif k == "shortline": lines[i] = lines[i][:rnd.randint(0, 30)]
    return "\n".join(lines)

base = []
for _ in range(220):
    h = header_block(rnd) if rnd.random() < .85 else []
    pqr = rnd.random() < .12
    base.append(("".join(h) + "".join(coords_block(rnd, pqr)), pqr))
base += [("", False), ("\n", False), ("HEADER\n", False), ("REMARK   1\n", False), (atom_line() , False), (atom_line() + atom_line(serial=2, name=" CB "), False), ("ATOM  \n", False), ("MODEL \n", False)]
allc = list(base)
for t, pqr in base[:220]:
    for _ in range(4): allc.append((mutate(t, rnd), pqr))
for t, pqr in allc:
    add({"kind": "parse", "text": t, "pqr": pqr})
    if rnd.random() < .3: add({"kind": "parse", "text": t, "pqr": pqr, "permissive": False})
    if rnd.random() < .15: add({"kind": "parse", "text": t, "pqr": pqr, "quiet": True})
# operations on parsed structures
def rand_path(depth_max=4):
    return [rnd.randint(0, 2) for _ in range(rnd.randint(0, depth_max))]
def rand_key(level):
    r = rnd.random()
    if level == 0: return rnd.choice([0, 1, 2, 5])
    if level == 1: return rnd.choice(list("ABCD ") + [0, 1, 2])
    if level == 2: return rnd.choice([1, 2, 3, "1", [" ", 1, " "], ["H_ZN", 1, " "], ["W", 2, " "], [" ", 99, " "], 99, "A", " "])
    return rnd.choice(["CA", "N", " CA ", "CB", "O", "XX", 0, "C"])
for t, pqr in base[:220]:
    if pqr: continue
    ops = []
    for _ in range(14):
        k = rnd.choice(["len", "ids", "get", "contains", "repr", "unpacked", "dist", "cmp", "setid", "detach", "copy", "strict", "insert", "atoms"])
        path = rand_path()
        if k in ("get", "contains", "detach"): ops.append([k, path, rand_key(len(path))])
        elif k in ("dist", "cmp", "strict"): ops.append([k, path, rand_path()])
        elif k == "setid": ops.append([k, path, rnd.choice(["Z", "A", 7, [" ", 5, " "], "NEW"])])
        elif k == "insert": ops.append([k, path, rnd.randint(0, 2), rand_path()])
        else: ops.append([k, path])
    add({"kind": "ops", "text": t, "ops": ops})
json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(len(cases), "cases,", sum("exc" in c for c in cases), "raise ->", os.path.relpath(OUT))
