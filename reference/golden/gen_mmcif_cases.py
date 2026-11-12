"""Golden cases for Bio.PDB.MMCIF2Dict, MMCIFParser and FastMMCIFParser -> packages/pdb/test/golden/mmcif.json

`dict` cases give a text and the dictionary (or exception) MMCIF2Dict returns; `parse` cases give a text, parser
class and options, and the structure, header and warnings (or exception).
"""
import io, json, os, random, warnings
from Bio.PDB.MMCIF2Dict import MMCIF2Dict
from Bio.PDB.MMCIFParser import MMCIFParser, FastMMCIFParser
from pdb_encode import tname, emsg, enc_structure

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdb", "test", "golden", "mmcif.json")
rnd = random.Random(33)
cases = []

def run(case):
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if case["kind"] == "dict":
                d = MMCIF2Dict(io.StringIO(case["text"]))
                out["dict"] = [[k, v] for k, v in d.items()]
            else:
                o = case["opts"]
                if case["parser"] == "fast":
                    p = FastMMCIFParser(auth_chains=o["auth_chains"], auth_residues=o["auth_residues"], QUIET=o["quiet"])
                else:
                    p = MMCIFParser(auth_chains=o["auth_chains"], auth_residues=o["auth_residues"], QUIET=o["quiet"], PERMISSIVE=o["permissive"])
                s = p.get_structure("x", io.StringIO(case["text"]))
                out["structure"] = enc_structure(s)
                if case["parser"] != "fast": out["header"] = json.loads(json.dumps(p.header))
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

# ---- file generation ----
RES = ["ALA", "GLY", "SER", "LEU", "MET", "CYS", "HOH", "ZN", "NAG", "HEM"]
NAMES = ["N", "CA", "C", "O", "CB", "CG", "SG", "OD1", "NE", "ZN", "O5'", 'C1"']
ELEMS = ["N", "C", "C", "O", "C", "C", "S", "O", "N", "ZN", "O", "C"]

def q(v):
    """Quote a value the way mmCIF needs it."""
    v = str(v)
    if v == "": return "''"
    if any(c in v for c in " \t") or v[0] in "'\"#_;$[]" or v.lower().startswith(("data_", "loop_", "save_", "global_", "stop_")):
        if "'" not in v: return "'" + v + "'"
        if '"' not in v: return '"' + v + '"'
    return v

def gen_atoms():
    atoms = []
    n_models = rnd.choice([1, 1, 1, 2, 3])
    serial = 1
    for m in range(1, n_models + 1):
        for chain in rnd.sample(["A", "B", "C", "H"], rnd.randint(1, 2)):
            seq = rnd.randint(1, 5)
            for _ in range(rnd.randint(1, 5)):
                resname = rnd.choice(RES)
                het = "HETATM" if resname in ("HOH", "ZN", "NAG", "HEM") else "ATOM"
                icode = rnd.choice(["A", "."]) if rnd.random() < 0.15 else "?"
                for _ in range(rnd.randint(1, 5)):
                    k = rnd.randrange(len(NAMES))
                    alt = rnd.choice([".", ".", ".", ".", "A", "B"])
                    atoms.append(dict(group=het, id=str(serial), elem=ELEMS[k], name=NAMES[k], alt=alt, resname=resname, asym=chain.lower() + chain,
                                      label_seq="." if het == "HETATM" and resname in ("HOH", "ZN") else str(seq), icode=icode,
                                      x="%.3f" % rnd.uniform(-50, 50), y="%.3f" % rnd.uniform(-50, 50), z="%.3f" % rnd.uniform(-50, 50),
                                      occ=rnd.choice(["1.00", "0.50", "0.30"]), b="%.2f" % rnd.uniform(0, 80), auth_seq=str(seq + rnd.choice([0, 0, 100])),
                                      auth_asym=chain, model=str(m)))
                    serial += 1
                seq += rnd.choice([1, 1, 2])
    return atoms

COLS = [("group_PDB", "group"), ("id", "id"), ("type_symbol", "elem"), ("label_atom_id", "name"), ("label_alt_id", "alt"), ("label_comp_id", "resname"),
        ("label_asym_id", "asym"), ("label_seq_id", "label_seq"), ("pdbx_PDB_ins_code", "icode"), ("Cartn_x", "x"), ("Cartn_y", "y"), ("Cartn_z", "z"),
        ("occupancy", "occ"), ("B_iso_or_equiv", "b"), ("auth_seq_id", "auth_seq"), ("auth_asym_id", "auth_asym"), ("pdbx_PDB_model_num", "model")]

def loop(prefix, cols, rows):
    lines = ["loop_"] + [f"{prefix}.{c}" for c, _ in cols]
    for r in rows: lines.append(" ".join(q(r[k]) for _, k in cols))
    return "\n".join(lines)

def gen_file():
    atoms = gen_atoms()
    cols = list(COLS)
    parts = ["data_" + rnd.choice(["1ABC", "test", "x"])]
    if rnd.random() < 0.8: parts.append("_entry.id " + rnd.choice(["1ABC", "?", "."]))
    if rnd.random() < 0.7: parts.append("_struct.title " + rnd.choice(["'A test structure'", "?", "'Title with \"quotes\"'", "plain"]))
    if rnd.random() < 0.5: parts.append("_struct_keywords.pdbx_keywords " + rnd.choice(["HYDROLASE", "?"]))
    if rnd.random() < 0.4: parts.append("_pdbx_database_status.recvd_initial_deposition_date 2012-01-08")
    if rnd.random() < 0.5: parts.append("_exptl.method " + rnd.choice(["'X-RAY DIFFRACTION'", "'SOLUTION NMR'", "."]))
    if rnd.random() < 0.6: parts.append("_refine.ls_d_res_high " + rnd.choice(["2.10", "?", "abc", "1.5"]))
    elif rnd.random() < 0.3: parts.append("_em_3d_reconstruction.resolution 3.4")
    if rnd.random() < 0.4:
        parts += ["_cell.length_a 10.0", "_cell.length_b 20.0", "_cell.length_c 30.0", "_cell.angle_alpha 90", "_cell.angle_beta 90", "_cell.angle_gamma 120", "_symmetry.space_group_name_H-M 'P 1'"]
    if rnd.random() < 0.3:
        drop = rnd.choice(["type_symbol", "pdbx_PDB_model_num", "auth_seq_id", "label_seq_id", "pdbx_PDB_ins_code", "occupancy", "auth_asym_id"])
        cols = [(c, k) for c, k in cols if c != drop]
    if rnd.random() < 0.08 and atoms:
        a = rnd.choice(atoms); k = rnd.choice(["x", "b", "occ", "id", "model", "auth_seq", "label_seq", "elem"])
        a[k] = rnd.choice(["?", ".", "abc", "1x", "", "2.5"]) if k != "elem" else "n"
    if rnd.random() < 0.1 and atoms:
        for a in rnd.sample(atoms, min(len(atoms), 3)): a["alt"] = rnd.choice(["A", "B", "."])
    parts.append("#")
    parts.append(loop("_atom_site", cols, atoms))
    parts.append("#")
    if rnd.random() < 0.3:
        acols = [(f"U[{i}][{j}]", f"u{i}{j}") for i, j in ((1, 1), (1, 2), (1, 3), (2, 2), (2, 3), (3, 3))]
        rows = [{k: "%.4f" % rnd.uniform(0, 0.1) for _, k in acols} for _ in atoms[: rnd.randint(0, len(atoms))]]
        if rnd.random() < 0.15 and rows: rows[0]["u11"] = "bad"
        parts.append(loop("_atom_site_anisotrop", acols, rows))
        parts.append("#")
    text = "\n".join(parts) + "\n"
    if rnd.random() < 0.1: text = text.replace("\n", "\r\n")
    return text

def mutate(text):
    lines = text.split("\n")
    r = rnd.random()
    if r < 0.15 and len(lines) > 3: del lines[rnd.randrange(1, len(lines) - 1)]
    elif r < 0.3: lines.insert(rnd.randrange(len(lines)), rnd.choice(["# comment", "_x.y 'unterminated", ";", "loop_", "_a.b", "stop_", "  # indented comment", "_k.v #notcomment", "\t_t.v  value"]))
    elif r < 0.4: lines = lines[: rnd.randrange(1, len(lines))]
    elif r < 0.5 and lines[0].startswith("data_"): lines[0] = rnd.choice(["", "foo", "DATA_X", "data_"])
    return "\n".join(lines)

# ---- dict cases: tokenizer and loop quirks ----
SNIPPETS = [
    "data_x\n_a.b value\n_a.c 'quoted value'\n_a.d \"double\"\n",
    "data_x\n_a.b 'it's here'\n_a.c x\n",
    "data_x\n_a.b 'it' s'\n",
    "data_x\n_a.b # comment\n_a.c d#e\n_a.d 'f # g'\n",
    "data_x\n_a.b\n;multi\n  line\n;\n_a.c z\n",
    "data_x\n_a.b\n;multi\n;x\n_a.c z\n",
    "data_x\n_a.b\n;never closed\n",
    "data_x\nloop_\n_a.b\n_a.c\n1 2\n3 4\n",
    "data_x\nloop_\n_a.b\n_a.c\n1 _2\n3 _4\n",
    "data_x\nloop_\n_a.b\n_a.c\n1 2\n3\n_d.e v\n",
    "data_x\nloop_\n1 2\n",
    "data_x\nLOOP_\n_a.b\n1\n2\n_c.d x\n",
    "data_x\nloop_\n_a.b\n_a.b\n1 2\n",
    "data_x\n_a.b 1\n_a.b 2\n",
    "data_x\n_a.b\n",
    "data_x\n_a.b 'unterminated\n",
    "data_x\n_a.b 'a' 'b'\n_c.d x\n",
    "data_x\n_a.b \"a'b\"\n",
    "data_x\n_a.b a'b\n",
    "data_x\n_a.b é ü 'ñ ö'\n",
    "data_foo bar\n_a.b 1\n",
    "",
    "\n",
    "# only comment\n",
    "_a.b 1\n",
    "data_x\nloop_\n_a.b\n_a.c\n;text\nblock\n; 'q'\n",
    "data_x\nloop_\n_a.b\n_a.c\n1 2\n#\nloop_\n_d.e\n5\n",
    "data_x\n  _a.b   spaced\t\ttab  \n",
    "data_x\n_a.b 'x'y\n",
    "data_x\n_a.b ''\n_a.c \"\"\n",
]
for t in SNIPPETS: add({"kind": "dict", "text": t})
for _ in range(500):
    t = gen_file()
    if rnd.random() < 0.5: t = mutate(t)
    add({"kind": "dict", "text": t})

# ---- parse cases ----
for _ in range(900):
    t = gen_file()
    if rnd.random() < 0.3: t = mutate(t)
    parser = rnd.choice(["mmcif", "mmcif", "fast"])
    opts = {"auth_chains": rnd.random() < 0.7, "auth_residues": rnd.random() < 0.7, "quiet": rnd.random() < 0.2, "permissive": rnd.random() < 0.5}
    add({"kind": "parse", "text": t, "parser": parser, "opts": opts})

json.dump({"biopython": __import__("Bio").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases,", sum(1 for c in cases if "exc" in c), "raise ->", OUT)
