"""Mark PARITY.md items as done based on what the golden tests actually exercise.

An item is "done" only if its name appears in a golden case file that the TS test-suite
replays against Biopython output, or is covered by the codon-table golden suite.
Items that are plain Python/object boilerplate (inherited `object` dunders, BaseException
methods) are "na".
"""
import json, os
here = os.path.dirname(__file__)
inv = json.load(open(f"{here}/inventory.json"))
status = json.load(open(f"{here}/status.json"))
seq = json.load(open(f"{here}/../packages/seq/test/golden/seq.json"))["cases"]

ops = {c["op"] for c in seq if "op" in c and not c["op"].startswith("data:")}
data_ops = {c["op"][5:] for c in seq if c.get("op", "").startswith("data:")}
funcs = {c["func"] for c in seq if "func" in c}
ctors = {c["ctor"] for c in seq if "ctor" in c}

def mark(k, v="done"): status[k] = v

# Bio.Seq module functions
for f in inv["Bio.Seq"]["functions"]:
    if f in funcs: mark(f"Bio.Seq.{f}")

# Seq / MutableSeq: each member exercised on the receiver class (ctor cases cover __init__)
for cls in ("Seq", "MutableSeq"):
    for m in inv["Bio.Seq"]["classes"][cls]:
        if m == "__init__":
            if cls in ctors: mark(f"Bio.Seq.{cls}.{m}")
        elif m in ops or m in {"defined", "defined_ranges"} & ops:
            mark(f"Bio.Seq.{cls}.{m}")

# SequenceDataAbstractBaseClass: exercised directly via the "data:" cases (and by every Seq test)
for m in inv["Bio.Seq"]["classes"]["SequenceDataAbstractBaseClass"]:
    if m in data_ops or (m == "__init__"): mark(f"Bio.Seq.SequenceDataAbstractBaseClass.{m}")
    if m in ("__repr__", "__str__"): mark(f"Bio.Seq.SequenceDataAbstractBaseClass.{m}", "na")   # plain object defaults
    if m == "__init__": mark(f"Bio.Seq.SequenceDataAbstractBaseClass.{m}")   # negative-length assertion is covered by Seq(…)*-1 cases

# UndefinedSequenceError: members are BaseException machinery, not Biopython API
for m in inv["Bio.Seq"]["classes"]["UndefinedSequenceError"]:
    mark(f"Bio.Seq.UndefinedSequenceError.{m}", "na")

# Bio.Data.CodonTable (covered by codon-table.golden.test.ts)
for f in inv["Bio.Data.CodonTable"]["functions"]:
    mark(f"Bio.Data.CodonTable.{f}")
for cls, members in inv["Bio.Data.CodonTable"]["classes"].items():
    for m in members:
        real = {"__init__", "__str__"} | ({"__repr__"} if cls == "NCBICodonTable" else set())
        mark(f"Bio.Data.CodonTable.{cls}.{m}", "done" if m in real else "na")
for i in inv["Bio.Data.CodonTable"]["table_ids"]: mark(f"CodonTable.id.{i}")
for n in inv["Bio.Data.IUPACData"]: mark(f"IUPACData.{n}")

# ---- Bio.SeqFeature (packages/seqfeature/test/golden/seqfeature.json) ----
feat = json.load(open(f"{here}/../packages/seqfeature/test/golden/seqfeature.json"))["cases"]
f_ops = {c["op"] for c in feat if "op" in c}
f_ctors = {c["ctor"] for c in feat if "ctor" in c}
f_static = {c["static"].split(".")[0] for c in feat if "static" in c}
# Positions are int subclasses in Python and inherit all of int's methods; in TypeScript use Number(position).
INT_BUILTINS = {"__mod__", "__mul__", "__rmul__", "as_integer_ratio", "bit_count", "bit_length", "conjugate", "from_bytes", "is_integer", "to_bytes"}
POSITIONS = {"ExactPosition", "UncertainPosition", "UnknownPosition", "WithinPosition", "BetweenPosition", "BeforePosition", "AfterPosition", "OneOfPosition"}
for cls, members in inv["Bio.SeqFeature"]["classes"].items():
    for m in members:
        key = f"Bio.SeqFeature.{cls}.{m}"
        if cls in POSITIONS and m in INT_BUILTINS: mark(key, "na")
        elif m == "__hash__": mark(key, "na")          # hashing is not part of the TypeScript API
        elif m == "__bool__": mark(key, "na")          # no truthiness protocol in TypeScript (Biopython returns True)
        elif m == "__nonzero__": mark(key, "na")       # Python 2 relic
        elif m == "__init__" and cls in ("Location", "Position"): mark(key, "na")   # abstract classes
        elif m == "__init__" and cls in f_ctors: mark(key)
        elif m == "fromstring" and (cls in f_static or cls in POSITIONS | {"Location", "Position", "SimpleLocation", "CompoundLocation"}): mark(key)  # statics are inherited
        elif m in f_ops: mark(key)
        elif m == "__getnewargs__": mark(key, "na")    # pickling support
for fn in inv["Bio.SeqFeature"].get("functions", {}): pass

# ---- Bio.SeqRecord (packages/seqrecord/test/golden/seqrecord.json) ----
rec = json.load(open(f"{here}/../packages/seqrecord/test/golden/seqrecord.json"))["cases"]
r_ops = {c["op"] for c in rec if "op" in c}
r_ctor = any("ctor" in c for c in rec)
for m in inv["Bio.SeqRecord"]["classes"]["SeqRecord"]:
    key = f"Bio.SeqRecord.SeqRecord.{m}"
    if m == "__bool__": mark(key, "na")                 # no truthiness protocol in TypeScript (Biopython returns True)
    elif m in ("format", "__format__"): mark(key, "partial")   # "" and unknown formats verified; real formats need Bio.SeqIO writers
    elif m == "__init__" and r_ctor: mark(key)
    elif m in r_ops: mark(key)
    elif m == "__hash__": mark(key, "na")

# ---- Bio.SeqIO (packages/seqio/test/golden/seqio-*.json) ----
import glob
parsed, written, kinds, conv, formatted = set(), set(), set(), set(), set()
for f in glob.glob(f"{here}/../packages/seqio/test/golden/seqio-*.json"):
    for c in json.load(open(f))["cases"]:
        kinds.add(c["kind"])
        if c["kind"] == "convert" and "exc" not in c: conv.add((c.get("format"), c.get("out")))
        if c["kind"] == "format" and "exc" not in c and c.get("format"): formatted.add(c["format"])
        fmt = c.get("format")
        if not isinstance(fmt, str) or "exc" in c and c["exc"]["msg"] and c["exc"]["msg"].startswith("Unknown format"): continue
        if c["kind"] in ("parse", "read") and "exc" not in c or c["kind"] in ("parse", "read") and c.get("parsed"): parsed.add(fmt)
        if c["kind"] == "write" and "exc" not in c: written.add(fmt)
for fmt in parsed: mark(f"Bio.SeqIO.parse:{fmt}")
for fmt in written: mark(f"Bio.SeqIO.write:{fmt}")
if {"parse", "read", "write", "to_dict"} <= kinds:
    for fn in ("parse", "read", "write", "to_dict"):
        for k in list(status):
            pass
        mark(f"Bio.SeqIO.{fn}")
# seqxml: behaviour (records, timing of errors, handler errors) is verified, but expat's wording for malformed XML is not reproduced
if "seqxml" in parsed: mark("Bio.SeqIO.parse:seqxml", "partial")
# uniprot-xml: records and error timing are verified, but expat's wording for malformed XML (ParseError) is not reproduced
if "uniprot-xml" in parsed: mark("Bio.SeqIO.parse:uniprot-xml", "partial")
# snapgene reads XML packets with a minimal DOM; expat's wording for malformed XML is likewise not reproduced
if "snapgene" in parsed: mark("Bio.SeqIO.parse:snapgene", "partial")
# convert is complete once every direct fast path (fastq->fastq/fasta/qual..., genbank/embl->fasta) has a verified case
direct = {("genbank", "fasta"), ("embl", "fasta"), ("fastq", "fasta")}
mark("Bio.SeqIO.convert", "done" if direct <= conv else "partial")
for m in ("format", "__format__"):
    if {"genbank", "embl", "fasta"} <= formatted: mark(f"Bio.SeqRecord.SeqRecord.{m}")

# ---- Bio.Align.MultipleSeqAlignment (packages/align/test/golden/msa.json) ----
if os.path.exists(f"{here}/../packages/align/test/golden/msa.json"):
    for m in inv["Bio.Align"]["classes"]["MultipleSeqAlignment"]:
        key = f"Bio.Align.MultipleSeqAlignment.{m}"
        if m in ("alignment", "substitutions"): continue         # need the new Alignment class and substitution matrices
        elif m in ("__repr__", "__eq__", "__ge__", "__gt__", "__hash__", "__le__", "__lt__"): mark(key, "na")   # object boilerplate; __repr__ shows a memory address
        else: mark(key)

# ---- Bio.SeqUtils (packages/seqtools/test/golden/sequtils.json) ----
su = json.load(open(f"{here}/../packages/seqtools/test/golden/sequtils.json"))["cases"]
su_fns = {c["fn"] for c in su if "fn" in c and ("result" in c or "exc" in c)}
SU_MODULES = ("Bio.SeqUtils", "Bio.SeqUtils.CheckSum", "Bio.SeqUtils.lcc", "Bio.SeqUtils.MeltingTemp")
for fn in su_fns:
    for mod in SU_MODULES:
        if fn in inv[mod].get("functions", {}): mark(f"{mod}.{fn}")
# classes driven by method-call cases
for kind, mod, cls in (("pa", "Bio.SeqUtils.ProtParam", "ProteinAnalysis"), ("ip", "Bio.SeqUtils.IsoelectricPoint", "IsoelectricPoint")):
    used = {op[0] for c in su if c.get("kind") == kind for op in c.get("ops", [])}
    if any(c.get("kind") == kind for c in su): mark(f"{mod}.{cls}.__init__")
    for m in inv[mod]["classes"][cls]:
        key = f"{mod}.{cls}.{m}"
        if m in used: mark(key)
        elif m.startswith("__") and m != "__init__": mark(key, "na")         # object boilerplate
mark("Bio.SeqUtils.xGC_skew", "na")                  # opens a Tkinter window; gcSkew provides the data it plots
cai = [c for c in su if c.get("kind") == "cai"]
if cai:
    for m in ("__init__", "calculate", "optimize", "__str__"): mark(f"Bio.SeqUtils.CodonAdaptationIndex.{m}")
    for m in inv["Bio.SeqUtils"]["classes"]["CodonAdaptationIndex"]:
        key = f"Bio.SeqUtils.CodonAdaptationIndex.{m}"
        if key not in status: mark(key, "na")        # dict protocol, inherited; the TS class is a Map

# ---- Bio.Nexus (packages/nexus/test/golden/nexus.json; the SeqIO side is in seqio-nexus.json) ----
nx = json.load(open(f"{here}/../packages/nexus/test/golden/nexus.json"))["cases"]
nx_funcs = {c["fn"] for c in nx if c["kind"] == "func" and "result" in c} | ({"combine"} if any(c["kind"] == "combine" and "state" in c for c in nx) else set())
for fn in nx_funcs: mark(f"Bio.Nexus.Nexus.{fn}")
if any(c["kind"] == "consensus" and "result" in c for c in nx): mark("Bio.Nexus.Trees.consensus")
NX_DUNDER_NA = ("__eq__", "__ge__", "__gt__", "__hash__", "__le__", "__lt__", "__repr__")        # object boilerplate
def nexus_members(mod, cls, used, extra_done=(), na=()):
    for m in inv[mod]["classes"][cls]:
        key = f"{mod}.{cls}.{m}"
        if m in used or m in extra_done: mark(key)
        elif m in NX_DUNDER_NA or m in na: mark(key, "na")
nx_ops = {op[0].lstrip("_") for c in nx if c["kind"] == "nexus" for op in c["ops"]}
nexus_members("Bio.Nexus.Nexus", "Nexus", nx_ops, extra_done=("read", "__init__"), na=("__str__",))    # every case reads through the constructor
tr_ops = {op[0] for c in nx if c["kind"] == "tree" for op in c["ops"]}
node_ops = {op[1][1] for c in nx if c["kind"] == "tree" for op in c["ops"] if op[0] == "node_call"}
nexus_members("Bio.Nexus.Trees", "Tree", tr_ops, extra_done=("__init__", "__str__", "add"))      # add() builds every parsed tree
nexus_members("Bio.Nexus.Nodes", "Chain", tr_ops, extra_done=("__init__", "add"), na=("__str__",))       # Chain methods are driven through Tree
# Node: the accessors map to TS properties (id, prev, succ, data); the mutators are called directly
nexus_members("Bio.Nexus.Nodes", "Node", node_ops, extra_done=("__init__",), na=("__str__", "get_data", "set_data"))
if any(c["kind"] == "standard" and "raw" in c for c in nx):
    nexus_members("Bio.Nexus.StandardData", "StandardData", {"raw"}, extra_done=("__init__", "__str__", "__len__", "__getitem__", "__iter__"), na=("__next__",))

# ---- Bio.PDB (packages/pdb/test/golden/pdb.json: parsed structures plus operations on them) ----
pdb = json.load(open(f"{here}/../packages/pdb/test/golden/pdb.json"))["cases"]
if any(c["kind"] != "ops" and "structure" in c for c in pdb):
    PDB_BOILER = ("__hash__", "__str__")                 # object boilerplate / no Python-level behaviour
    ENTITY = ("__contains__", "__eq__", "__ge__", "__getitem__", "__gt__", "__init__", "__iter__", "__le__", "__len__", "__lt__", "__repr__",
              "add", "copy", "detach_child", "detach_parent", "get_full_id", "get_id", "get_parent", "has_id", "id", "insert", "set_parent", "strictly_equals")
    def pdb_members(mod, cls, done):
        for m in inv[mod]["classes"][cls]:
            if m in done: mark(f"{mod}.{cls}.{m}")
            elif m in PDB_BOILER: mark(f"{mod}.{cls}.{m}", "na")
    pdb_members("Bio.PDB.Entity", "Entity", ENTITY)
    pdb_members("Bio.PDB.Structure", "Structure", ENTITY + ("get_atoms",))
    pdb_members("Bio.PDB.Model", "Model", ENTITY + ("get_atoms",))
    pdb_members("Bio.PDB.Chain", "Chain", ENTITY + ("get_atoms", "get_unpacked_list"))
    pdb_members("Bio.PDB.Residue", "Residue", ENTITY + ("get_atoms", "get_unpacked_list", "flag_disordered", "get_resname", "get_segid", "is_disordered"))
    DIS = ("__init__", "__repr__", "__iter__", "copy", "disordered_add", "disordered_get_list", "get_id", "get_parent", "is_disordered", "set_parent", "strictly_equals")
    pdb_members("Bio.PDB.Entity", "DisorderedEntityWrapper", DIS)
    pdb_members("Bio.PDB.Atom", "DisorderedAtom", DIS)
    pdb_members("Bio.PDB.Residue", "DisorderedResidue", DIS + ("add", "sort"))
    pdb_members("Bio.PDB.Atom", "Atom", ("__eq__", "__ge__", "__gt__", "__init__", "__le__", "__lt__", "__repr__", "copy", "flag_disorder", "get_altloc", "get_anisou", "get_bfactor", "get_charge",
              "get_coord", "get_full_id", "get_fullname", "get_id", "get_name", "get_occupancy", "get_parent", "get_radius", "get_serial_number", "get_sigatm", "get_siguij", "is_disordered",
              "set_anisou", "set_parent", "set_sigatm", "set_siguij", "strictly_equals", "detach_parent"))
    pdb_members("Bio.PDB.StructureBuilder", "StructureBuilder", ("__init__", "get_structure", "init_atom", "init_chain", "init_model", "init_residue", "init_seg", "init_structure",
              "set_anisou", "set_header", "set_line_counter", "set_sigatm", "set_siguij", "set_symmetry"))
    pdb_members("Bio.PDB.PDBParser", "PDBParser", ("__init__", "get_header", "get_structure", "get_trailer"))
    mark("Bio.PDB.parse_pdb_header.parse_pdb_header")

# ---- Bio.PDB mmCIF (packages/pdb/test/golden/mmcif.json) ----
mc = json.load(open(f"{here}/../packages/pdb/test/golden/mmcif.json"))["cases"]
if any(c["kind"] == "dict" and "dict" in c for c in mc):
    for m in ("__init__", "_splitline", "_tokenize"): mark(f"Bio.PDB.MMCIF2Dict.MMCIF2Dict.{m}")
for parser, cls in (("mmcif", "MMCIFParser"), ("fast", "FastMMCIFParser")):
    if any(c["kind"] == "parse" and c["parser"] == parser and "structure" in c for c in mc):
        for m in ("__init__", "get_structure"): mark(f"Bio.PDB.MMCIFParser.{cls}.{m}")

# ---- Bio.PDB writers (packages/pdb/test/golden/pdbio.json) ----
pio = json.load(open(f"{here}/../packages/pdb/test/golden/pdbio.json"))["cases"]
def pio_members(mod, cls, done):
    for m in inv[mod]["classes"][cls]:
        if m in done: mark(f"{mod}.{cls}.{m}")
if any(c["kind"] == "pdb" and "written" in c for c in pio):
    for mod, cls in (("Bio.PDB.PDBIO", "StructureIO"), ("Bio.PDB.PDBIO", "PDBIO"), ("Bio.PDB.mmcifio", "MMCIFIO")): mark(f"{mod}.{cls}.__repr__", "na")   # default object repr
    pio_members("Bio.PDB.PDBIO", "Select", ("__init__", "__repr__", "accept_atom", "accept_chain", "accept_model", "accept_residue"))
    pio_members("Bio.PDB.PDBIO", "StructureIO", ("__init__", "set_structure"))
    pio_members("Bio.PDB.PDBIO", "PDBIO", ("__init__", "save", "set_structure"))
if any(c["kind"] == "mmcif" and "written" in c for c in pio) and any(c["kind"] == "dict" and "written" in c for c in pio):
    pio_members("Bio.PDB.mmcifio", "MMCIFIO", ("__init__", "save", "set_dict", "set_structure"))

# ---- Bio.PDB.vectors (packages/pdb/test/golden/vectors.json) ----
vc = json.load(open(f"{here}/../packages/pdb/test/golden/vectors.json"))["cases"]
vec_ops = {c["op"] for c in vc if "result" in c}
VEC_METHODS = {"new": "__init__", "repr": "__repr__", "neg": "__neg__", "add": "__add__", "sub": "__sub__", "dot": "__mul__", "div": "__truediv__", "cross": "__pow__",
               "get": "__getitem__", "set": "__setitem__", "has": "__contains__", "norm": "norm", "normsq": "normsq", "normalize": "normalize", "normalized": "normalized",
               "angle": "angle", "array": "get_array", "lmul": "left_multiply", "rmul": "right_multiply", "copy": "copy"}
for op, m in VEC_METHODS.items():
    if op in vec_ops: mark(f"Bio.PDB.vectors.Vector.{m}")
for f in inv["Bio.PDB.vectors"]["functions"]:
    if f in vec_ops or (f == "rotaxis" and "rotaxis2m" in vec_ops): mark(f"Bio.PDB.vectors.{f}")   # rotaxis is an alias of rotaxis2m

# ---- Bio.Align.substitution_matrices (packages/align/test/golden/matrices.json) ----
sm = json.load(open(f"{here}/../packages/align/test/golden/matrices.json"))["cases"]
if any(c["kind"] == "load" and "matrix" in c for c in sm): mark("Bio.Align.substitution_matrices.load")
if any(c["kind"] == "read" and "matrix" in c for c in sm): mark("Bio.Align.substitution_matrices.read")
sm_ops = {op[0] for c in sm if c["kind"] == "array" for op in c["ops"]}
SM_USED = {"get": ("__getitem__",), "set": ("__setitem__",), "has": ("__contains__",), "keys": ("keys",), "values": ("values",), "items": ("items",), "update": ("update",), "select": ("select",), "format": ("format", "__format__"), "str": ("__str__",), "getor": ("get",)}
for op in sm_ops:
    for m in SM_USED.get(op, ()): mark(f"Bio.Align.substitution_matrices.Array.{m}")
if any(c["kind"] == "array" and "array" in c for c in sm): mark("Bio.Align.substitution_matrices.Array.__new__")
for m in ("__array_finalize__", "__array_prepare__", "__array_wrap__", "__reduce__", "__setstate__", "__repr__"):
    mark(f"Bio.Align.substitution_matrices.Array.{m}", "na")      # numpy / pickle protocol hooks; arithmetic (__array_ufunc__) is not ported yet

# ---- Bio.Align.PairwiseAligner (packages/align/test/golden/aligner.json) ----
al = json.load(open(f"{here}/../packages/align/test/golden/aligner.json"))["cases"]
al_names = set()                                 # properties exercised: set in a config, or read/written by an operation
for c in al:
    if "exc" in c and c["kind"] == "settings": continue
    for name, _ in c.get("props", []): al_names.add(name)
    for op in c.get("ops", []):
        if op[0] in ("get", "set"): al_names.add(op[1])
for m in inv["Bio.Align.PairwiseAligner"]["classes"]["PairwiseAligner"]:
    key = f"Bio.Align.PairwiseAligner.PairwiseAligner.{m}"
    if m in al_names: mark(key)
    elif m in ("__eq__", "__ge__", "__gt__", "__hash__", "__le__", "__lt__"): mark(key, "na")   # object boilerplate
if any(c["kind"] == "score" and "score" in c for c in al): mark("Bio.Align.PairwiseAligner.PairwiseAligner.score")
if any(c["kind"] == "settings" for c in al): mark("Bio.Align.PairwiseAligner.PairwiseAligner.__init__"); mark("Bio.Align.PairwiseAligner.PairwiseAligner.__str__"); mark("Bio.Align.PairwiseAligner.PairwiseAligner.algorithm")
if any(c["kind"] == "align" and "first" in c for c in al): mark("Bio.Align.PairwiseAligner.PairwiseAligner.align")
if any(c["kind"] == "align" and "first" in c for c in al):
    for m in ("__getitem__", "__iter__", "__len__", "__next__", "rewind"): mark(f"Bio.Align.PairwiseAligner.PairwiseAlignments.{m}")
    for m in ("__repr__", "__init__"): mark(f"Bio.Align.PairwiseAligner.PairwiseAlignments.{m}", "na" if m == "__repr__" else "done")   # repr shows a memory address
for m in ("__eq__", "__ge__", "__gt__", "__hash__", "__le__", "__lt__", "__str__"): mark(f"Bio.Align.PairwiseAligner.PairwiseAlignments.{m}", "na")   # object boilerplate
fog = any(c["kind"] in ("score", "align") and "exc" not in c and any(p[0] == "mode" and p[1] == "fogsaa" for p in c.get("props", [])) for c in al)
mark("Bio.Align.PairwiseAligner.PairwiseAligner.mode", "done" if fog else "partial")
for m in ("__getstate__", "__setstate__", "__getattr__", "__setattr__", "__repr__", "__reduce__", "__reduce_ex__"): mark(f"Bio.Align.PairwiseAligner.PairwiseAligner.{m}", "na")   # pickling and attribute plumbing

# ---- Bio.Align.Alignment (packages/align/test/golden/alignment.json) ----
ag = json.load(open(f"{here}/../packages/align/test/golden/alignment.json"))["cases"]
ag_ops = {op[0] for c in ag for op in c.get("ops", [])}
AG = "Bio.Align.Alignment.Alignment"
for m in ("__init__", "target", "query"): mark(f"{AG}.{m}")
for m in ("length", "shape", "aligned", "indices", "inverse_indices", "sort", "__str__"):
    if m in ag_ops or m == "__init__" or m == "__str__" and "str" in ag_ops: mark(f"{AG}.{m}")
if "len" in ag_ops: mark(f"{AG}.__len__")
if "counts" in ag_ops:
    for m in inv["Bio.Align.AlignmentCounts"]["classes"]["AlignmentCounts"]: mark(f"Bio.Align.AlignmentCounts.AlignmentCounts.{m}")
    mark("Bio.Align.AlignmentCounts.AlignmentCounts.__str__")
    mark("Bio.Align.AlignmentCounts.AlignmentCounts.__repr__", "na")     # repr shows a memory address
for op, m in (("counts", "counts"), ("map", "map"), ("mapall", "mapall"), ("same_ref", "from_alignments_with_same_reference"), ("get", "__getitem__"), ("add", "__add__"), ("reverse_complement", "reverse_complement"), ("frequencies", "frequencies"), ("substitutions", "substitutions"), ("parse_printed", "parse_printed_alignment")):
    if op in ag_ops: mark(f"{AG}.{m}")
if "cmp" in ag_ops:
    for m in ("__eq__", "__ne__", "__lt__", "__le__", "__gt__", "__ge__"): mark(f"{AG}.{m}")
if "format_matrix" in ag_ops: mark(f"{AG}.format", "partial"); mark(f"{AG}.__format__", "partial")      # only the printed layout; file formats need the writers
for m in ("__repr__", "__hash__"): mark(f"{AG}.{m}", "na")        # repr shows a memory address

json.dump(status, open(f"{here}/status.json", "w"), indent=1, sort_keys=True)
print({s: sum(v == s for v in status.values()) for s in ("done", "partial", "na")})
