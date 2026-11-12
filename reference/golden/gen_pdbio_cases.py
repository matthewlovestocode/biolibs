"""Golden cases for Bio.PDB.PDBIO and Bio.PDB.mmcifio -> packages/pdb/test/golden/pdbio.json

`pdb` and `mmcif` cases parse a PDB (or PQR) text, apply attribute mutations, pick what to hand to `set_structure`
(the structure or any entity below it, in place or as an orphan copy), choose a `Select`, and record the written text,
warnings and any exception. `dict` cases write an mmCIF dictionary directly and re-read the output with MMCIF2Dict.
"""
import io, json, os, random, warnings
import numpy as np
from Bio.PDB import PDBParser
from Bio.PDB.PDBIO import PDBIO, Select
from Bio.PDB.mmcifio import MMCIFIO
from Bio.PDB.MMCIF2Dict import MMCIF2Dict
from pdb_encode import tname, emsg

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "pdbio.json")
rnd = random.Random(44)
cases = []
SPECIAL = {"nan": float("nan"), "inf": float("inf"), "-inf": float("-inf")}

def unode(s, path):
    """Walk model, chain, residue, atom indices; residues and atoms come from the unpacked lists."""
    x = s
    for depth, i in enumerate(path):
        if depth < 2: x = x.child_list[i]
        else: x = x.get_unpacked_list()[i]
    return x

def val(v): return SPECIAL.get(v, v) if isinstance(v, str) else v

def apply_mut(s, m):
    kind, path, v = m
    x = unode(s, path)
    if kind in ("bfactor", "occupancy", "charge", "radius"):
        v = None if v is None else float(val(v))
        setattr(x, {"charge": "pqr_charge"}.get(kind, kind), v)
    elif kind == "coord": x.set_coord(np.array([float(val(c)) for c in v], dtype=np.float32))
    elif kind == "serial": x.serial_number = v
    elif kind == "element": x.element = v
    elif kind == "altloc": x.altloc = v
    elif kind == "fullname": x.fullname = v
    elif kind == "resname": x.resname = v
    elif kind == "segid": x.segid = v
    elif kind == "chain_id": x.id = v
    elif kind == "res_id": x.id = tuple(v)
    elif kind == "model_serial": x.serial_num = v

class SpecSelect(Select):
    """A Select driven by a JSON spec so the TypeScript test can rebuild the same one."""
    def __init__(self, spec): self.spec = spec
    def _ret(self, ok): return (1 if ok else 0) if self.spec.get("ret", "int") == "int" else (ok if self.spec["ret"] == "bool" else (1 if ok else None))
    def accept_model(self, m): return self._ret(self.spec.get("models") is None or m.serial_num in self.spec["models"])
    def accept_chain(self, c): return self._ret(self.spec.get("chains") is None or c.id in self.spec["chains"])
    def accept_residue(self, r):
        h = self.spec.get("het")
        return self._ret(h is None or (r.id[0] == " ") == (h == "no_het"))
    def accept_atom(self, a): return self._ret(self.spec.get("atoms") is None or a.name in self.spec["atoms"])

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if case["kind"] == "repr":
                out["written"] = repr(Select())
            elif case["kind"] == "dict":
                io_ = MMCIFIO()
                d = {k: v for k, v in case["dict"]}
                io_.set_dict(d)
                f = io.StringIO()
                io_.save(f)
                out["written"] = f.getvalue()
                try: out["reparsed"] = [[k, v] for k, v in MMCIF2Dict(io.StringIO(f.getvalue())).items()]
                except Exception as e: out["reparse_exc"] = {"type": tname(e), "msg": emsg(e)}
            else:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    s = PDBParser(PERMISSIVE=True, QUIET=True, is_pqr=case["pqr"]).get_structure("x", io.StringIO(case["text"]))
                for m in case["muts"]: apply_mut(s, m)
                target = unode(s, case["target"])
                if case["orphan"]: target = target.copy()
                sel = SpecSelect(case["select"])
                o = case["opts"]
                if case["kind"] == "pdb":
                    w_ = PDBIO(use_model_flag=o["use_model_flag"], is_pqr=case["pqr"])
                    w_.set_structure(target)
                    f = io.StringIO()
                    w_.save(f, sel, write_end=o["write_end"], preserve_atom_numbering=o["preserve"])
                else:
                    w_ = MMCIFIO()
                    w_.set_structure(target)
                    f = io.StringIO()
                    w_.save(f, sel, preserve_atom_numbering=o["preserve"])
                out["written"] = f.getvalue()
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
    res = run_isolated(c)
    if res is None: return
    c.update(res); cases.append(c)

# ---- PDB text generation ----
ATOMS = [(" N  ", "N"), (" CA ", "C"), (" C  ", "C"), (" O  ", "O"), (" CB ", "C"), (" SG ", "S"), ("ZN  ", "ZN"), ("HG21", "H"), ("1HB ", "H"), (" OD1", "O"), (" O5'", "O"), ("FE  ", "FE"), ("CL  ", "CL")]
RESN = ["ALA", "GLY", "SER", "LEU", "MET", "CYS", "HOH", "ZN", "NAG", "HEM", "A", "DT"]
HET = {"HOH", "ZN", "NAG", "HEM"}

def pdb_line(rec, serial, fullname, alt, resname, chain, seq, icode, xyz, occ, b, segid, elem, pqr):
    head = "%-6s%5d %s%s%3s %s%4d%s   %8.3f%8.3f%8.3f" % (rec, serial, fullname, alt, resname, chain, seq, icode, *xyz)
    if pqr: return head + "%8.4f%8.4f" % (occ, b) + "\n"
    return head + "%6.2f%6.2f      %-4s%2s\n" % (occ, b, segid, elem)

def gen_pdb(pqr=False):
    lines = []
    nmodels = rnd.choice([1, 1, 1, 2, 3])
    for m in range(nmodels):
        if nmodels > 1 or rnd.random() < 0.1: lines.append("MODEL     %4d\n" % (m + 1))
        serial = 1
        for chain in rnd.sample(["A", "B", "C", "H", " ", "1"], rnd.randint(1, 3)):
            seq = rnd.choice([1, 1, 5, 9990, -3])
            for _ in range(rnd.randint(1, 4)):
                resname = rnd.choice(RESN)
                rec = "HETATM" if resname in HET else "ATOM"
                icode = rnd.choice([" ", " ", " ", "A"])
                alts = [" "] if rnd.random() < 0.8 else [" ", "A", "B"]
                for fullname, elem in rnd.sample(ATOMS, rnd.randint(1, 5)):
                    for alt in (alts if rnd.random() < 0.3 else alts[:1]):
                        xyz = [rnd.uniform(-90, 90) for _ in range(3)]
                        if rnd.random() < 0.05: xyz[0] = rnd.choice([0.0005, 0.0625, -0.0005, 1234.5675])
                        occ = rnd.choice([1.0, 0.5, 0.33, 0.0])
                        b = rnd.choice([rnd.uniform(0, 99), rnd.uniform(0, 99), 999.99, 0.0, 12.5]) if not pqr else rnd.uniform(0.5, 2.5)
                        occ_or_charge = occ if not pqr else rnd.uniform(-1, 1)
                        lines.append(pdb_line(rec, serial, fullname, alt, resname, chain, seq, icode, xyz, occ_or_charge, b,
                                              rnd.choice(["    ", "SEG1", "S"]), elem if rnd.random() > 0.05 else rnd.choice(["", "XX", "X", "Q", "zn", "Fe"]), pqr))
                        serial += 1
                seq += rnd.choice([1, 1, 2])
        if nmodels > 1 or lines[0].startswith("MODEL"): lines.append("ENDMDL\n")
    if rnd.random() < 0.3: lines.append("END\n")
    return "".join(lines)

def struct_shape(text, pqr):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return PDBParser(PERMISSIVE=True, QUIET=True, is_pqr=pqr).get_structure("x", io.StringIO(text))

def random_path(s, max_depth=None):
    """A random path of indices to a model, chain, residue or atom (residues and atoms from the unpacked lists)."""
    depth = rnd.randint(0, 4) if max_depth is None else max_depth
    path, x = [], s
    for d in range(depth):
        kids = x.child_list if d < 2 else x.get_unpacked_list()
        if not kids: break
        i = rnd.randrange(len(kids)); path.append(i); x = kids[i]
    return path

def gen_muts(s, pqr):
    muts = []
    for _ in range(rnd.choice([0, 0, 1, 2, 3])):
        p = random_path(s, 4)
        if len(p) < 4: continue
        k = rnd.choice(["bfactor", "occupancy", "coord", "serial", "element", "altloc", "fullname", "resname", "segid", "chain_id", "res_id", "model_serial", "charge", "radius"])
        if k == "bfactor": v = rnd.choice([None, 0.0, 5.5, 99.999, 123.456, 999.99, 999.995, 1000.0, 5000.55, 9999.95, 10000.0, 54321.9, 999999.0, 1e7, -5.0, -99999.5, "nan", "inf", "-inf"])
        elif k == "occupancy": v = rnd.choice([None, 1.0, 0.125, 0.5, 1.005, -1.0, 12345.678, "nan", "inf"])
        elif k == "coord": v = rnd.choice([[0.0, -0.0, 1.0], [99999.999, -9999.9995, 0.0005], ["nan", 1.0, "inf"], [12345678.5, 0.0, 0.0]])
        elif k == "serial": v = rnd.choice([100000, 99999, "12", "abc", None, 7, -4, "1_0", " 5 ", 5.7, "nan"])
        elif k == "element": v = rnd.choice(["", "C", " c ", "ZN", "Zn", "XX", "X", "Q", "Hg", "HGG", "  "])
        elif k == "altloc": v = rnd.choice(["A", " ", "", "AB", "é"])
        elif k == "fullname": v = rnd.choice(["", " CA ", "CA", "1HB", "HG21", "   X", "ÉCA", "ABCDEFG"])
        elif k == "resname": v = rnd.choice(["", "A", "LONGNAME", "ALA", "é"])
        elif k == "segid": v = rnd.choice(["", "SEGMENT", "S", "é"])
        elif k == "chain_id": v = rnd.choice(["AB", "", "Z", "é", "1"]); p = p[:2]
        elif k == "res_id": v = rnd.choice([[" ", 10000, " "], [" ", 9999, "AB"], ["H_X", 5, " "], [" ", 3, ""]]); p = p[:3]
        elif k == "model_serial": v = rnd.choice([0, 7, -1]); p = p[:1]
        elif k == "charge": v = rnd.choice([None, 0.5, -1.00005, "nan"])
        else: v = rnd.choice([None, 1.5, 0.00005, "inf"])
        muts.append([k, p, v])
    return muts

def gen_select():
    spec = {}
    r = rnd.random()
    if r < 0.4: return spec
    if rnd.random() < 0.3: spec["models"] = rnd.sample([0, 1, 2, 3, 4], rnd.randint(0, 3))
    if rnd.random() < 0.4: spec["chains"] = rnd.sample(["A", "B", "C", "H", " ", "1"], rnd.randint(0, 3))
    if rnd.random() < 0.3: spec["het"] = rnd.choice(["no_het", "only_het"])
    if rnd.random() < 0.4: spec["atoms"] = rnd.sample([a.strip() for a, _ in ATOMS], rnd.randint(0, 6))
    spec["ret"] = rnd.choice(["int", "int", "bool", "none"])
    return spec

def gen_case(kind):
    pqr = kind == "pdb" and rnd.random() < 0.25
    text = gen_pdb(pqr)
    s = struct_shape(text, pqr)
    target = random_path(s) if rnd.random() < 0.35 else []
    # Residues and atoms have no model above them in the path semantics of set_structure, but any depth is valid.
    case = {"kind": kind, "pqr": pqr, "text": text, "muts": gen_muts(s, pqr), "target": target, "orphan": rnd.random() < 0.3 and bool(target),
            "select": gen_select(), "opts": {"use_model_flag": rnd.choice([0, 0, 1]), "write_end": rnd.random() < 0.8, "preserve": rnd.random() < 0.25}}
    return case

def gen_ok(kind):
    """Generate until the text parses (PQR files with altlocs can't be read by Biopython)."""
    while True:
        try: return gen_case(kind)
        except Exception: continue

for _ in range(1500): add(gen_ok("pdb"))
for _ in range(900): add(gen_ok("mmcif"))

# ---- mmCIF dictionary cases ----
VALUES = ["1", "ABC", "x y", "it's", 'say "hi"', "a' b\" c", "a' b", 'a" b', "_under", "#hash", "$dollar", "[br", "]br", ";semi", "data_x", "save_y", "loop_", "stop_", "global_",
          "multi\nline", "", "é ü", "?", ".", "1.234", "long value with several words in it", "data_", "x'y", "a b'"]
COLS_KNOWN = ["group_PDB", "id", "type_symbol", "label_atom_id", "Cartn_x", "B_iso_or_equiv", "pdbx_PDB_model_num", "extra_b", "extra_a", "occupancy"]

def pick_value(): return rnd.choice(VALUES) if rnd.random() < 0.97 else ""

def gen_dict():
    d = []
    if rnd.random() < 0.9: d.append(["data_", rnd.choice(["1ABC", "", "test", "x y"])])
    for _ in range(rnd.randint(0, 3)):
        cat = rnd.choice(["_atom_site", "_entry", "_cell", "_struct", "_x"])
        n = rnd.choice([0, 1, 1, 2, 3, 5]) if rnd.random() > 0.2 else None
        cols = rnd.sample(COLS_KNOWN if cat == "_atom_site" else ["id", "title", "a", "b", "length_a"], rnd.randint(1, 4))
        for c in cols:
            if n is None: v = pick_value()
            else: v = [pick_value() for _ in range(n)]
            d.append([f"{cat}.{c}", v])
    if rnd.random() < 0.1: d.append([rnd.choice(["nodot", "_a.b.c", "a."]), "v"])
    if rnd.random() < 0.1 and len(d) > 2:
        j = rnd.randrange(1, len(d))
        if isinstance(d[j][1], list): d[j][1] = d[j][1][:-1] if d[j][1] else d[j][1] + ["extra"]
        else: d[j][1] = [d[j][1], "extra"]
    if rnd.random() < 0.1 and len(d) > 2:
        j = rnd.randrange(1, len(d))
        d[j][1] = d[j][1][0] if isinstance(d[j][1], list) and d[j][1] else d[j][1]
    rnd.shuffle(d) if rnd.random() < 0.5 else None
    return d

for _ in range(700): add({"kind": "dict", "dict": gen_dict()})

add({"kind": "repr"})

json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases,", sum(1 for c in cases if "exc" in c), "raise ->", OUT)
