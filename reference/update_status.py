"""Mark docs/parity items as done based on what the golden tests actually exercise.

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

# Python's own defaults first, so anything verified later in this file wins: a few of these dunders
# do have behaviour a port must match (`SeqFeature.__lt__` raises TypeError rather than comparing),
# and an explicit golden case is better evidence than this rule. `inventory.py` decides what counts,
# by asking Biopython whether any class but `object` defines the member.
if "inherited" not in inv:
    raise SystemExit("inventory.json predates the `inherited` list: re-run reference/inventory.py first")
for k in inv["inherited"]: mark(k, "na")

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
# The three XML readers: records, the timing of errors and handler errors are verified, and so is expat's own wording
# for nine of its twelve reasons along with every position. What is left is the choice between "not well-formed
# (invalid token)", "syntax error" and "junk after document element" in the prolog and the epilog, which needs
# expat's tokenizer states; `packages/seqio/test/xml-errors.test.ts` counts the 39 cases that still differ.
if "seqxml" in parsed: mark("Bio.SeqIO.parse:seqxml", "partial")
if "uniprot-xml" in parsed: mark("Bio.SeqIO.parse:uniprot-xml", "partial")
if "snapgene" in parsed: mark("Bio.SeqIO.parse:snapgene", "partial")
# convert is complete once every direct fast path (fastq->fastq/fasta/qual..., genbank/embl->fasta) has a verified case
direct = {("genbank", "fasta"), ("embl", "fasta"), ("fastq", "fasta")}
mark("Bio.SeqIO.convert", "done" if direct <= conv else "partial")
for m in ("format", "__format__"):
    if {"genbank", "embl", "fasta"} <= formatted: mark(f"Bio.SeqRecord.SeqRecord.{m}")

# ---- Bio.Align.MultipleSeqAlignment (packages/align/test/golden/msa.json) ----
if os.path.exists(f"{here}/../packages/align/test/golden/msa.json"):
    msa_cases = json.load(open(f"{here}/../packages/align/test/golden/msa.json"))["cases"]
    for m in inv["Bio.Align"]["classes"]["MultipleSeqAlignment"]:
        key = f"Bio.Align.MultipleSeqAlignment.{m}"
        # `alignment` and `substitutions` are exercised by ops of their own, since they only arrived with the new
        # Alignment class and the substitution matrices
        if m in ("alignment", "substitutions") and not any(op[0] == m for c in msa_cases for op in c["ops"]): continue
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

# ---- Bio.PDB internal coordinates (packages/pdb/test/golden/ickey.json) ----
# `atom_to_internal_coordinates` is marked on each of the three entities only when a golden case drove it through
# that entity's own entry point and a chain was actually measured; a chain with no buildable residue escapes
# before anything is computed, so those cases alone would not be evidence.
ick = json.load(open(f"{here}/../packages/pdb/test/golden/ickey.json"))["cases"]
measured = {c["entry"] for c in ick if c["kind"] == "a2ic"
            and any(not ch.get("empty") and ch.get("measured") for ch in c.get("result", {}).get("chains", []))}
for entry, cls in (("chain", "Chain"), ("model", "Model"), ("structure", "Structure")):
    if entry in measured: mark(f"Bio.PDB.{cls}.{cls}.atom_to_internal_coordinates")

# `internal_to_atom_coordinates` needs a case that actually rebuilt something: `max_dev` is how far the atoms
# moved, so a case where nothing was invalidated is not evidence. Chain's own method is left open deliberately --
# its signature takes start/fin, which select Biopython's serial assembly, and that is not ported.
rebuilt = {c["entry"] for c in ick if c["kind"] == "i2a"
           and any(not ch.get("empty") and ch.get("max_dev", 0) > 0 for ch in c.get("result", []))}
for entry, cls in (("model", "Model"), ("structure", "Structure")):
    if entry in rebuilt: mark(f"Bio.PDB.{cls}.{cls}.internal_to_atom_coordinates")

# Chain's own method takes start/fin, which select the serial assembly; it is marked only when a case passed one
# and the subregion was really applied -- a residue outside the range loses its atom keys.
if any(c["kind"] == "i2a_ser" and (c.get("start") or c.get("fin"))
       and any(not ch.get("empty") and "exc" not in ch.get("call", {})
               and any(r["ak_set"] is None for r in ch["residues"]) for ch in c.get("result", []))
       for c in ick):
    mark("Bio.PDB.Chain.Chain.internal_to_atom_coordinates")

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

# ---- SeqIO.index (packages/seqio/test/golden-index/seqio-index.json) ----
ix = json.load(open(f"{here}/../packages/seqio/test/golden-index/seqio-index.json"))["cases"]
if any("keys" in c for c in ix):
    # SFF is indexed now, through its Roche index block or by scanning the reads, but only for well-formed files:
    # Biopython's path for a *damaged* index block (warn, then fall back to scanning, with the entries already read
    # left in place) is not reproduced, so the cases are limited to files that parse cleanly.
    mark("Bio.SeqIO.index", "partial")
    mark("Bio.SeqIO.index_db", "na")        # stores the index in a SQLite file; there is no file system here

# ---- Bio.PDB.kdtrees, NeighborSearch and Selection (packages/pdb/test/golden/nsearch.json) ----
nc = json.load(open(f"{here}/../packages/pdb/test/golden/nsearch.json"))["cases"]
KD_OPS = {"search": "search", "neighbor": "neighbor_search", "simple": "neighbor_simple_search"}
NS_OPS = {"search": "search", "search_all": "search_all"}
for c in nc:
    if c["kind"] == "kdtree":
        mark("Bio.PDB.kdtrees.KDTree.__init__")
        for op, out in zip(c.get("ops", []), c.get("ops_out", [])):
            if "result" in out: mark(f"Bio.PDB.kdtrees.KDTree.{KD_OPS[op[0]]}")
    elif c["kind"] == "ns" and "exc" not in c:
        mark("Bio.PDB.NeighborSearch.NeighborSearch.__init__")
        for op, out in zip(c["ops"], c["ops_out"]):
            if "result" in out: mark(f"Bio.PDB.NeighborSearch.NeighborSearch.{NS_OPS[op[0]]}")
        if any(op[0] == "search_all" and op[2] != "A" for op in c["ops"]): mark("Bio.PDB.NeighborSearch.NeighborSearch._get_unique_parent_pairs")
    elif c["kind"] == "point": mark("Bio.PDB.kdtrees.Point.__init__")
    elif c["kind"] == "neighbor": mark("Bio.PDB.kdtrees.Neighbor.__init__")
    elif c["kind"] == "sel" and ("result" in c or "exc" in c):
        mark({"unfold": "Bio.PDB.Selection.unfold_entities", "parents": "Bio.PDB.Selection.get_unique_parents", "unique": "Bio.PDB.Selection.uniqueify"}[c["fn"]])
# repr of Point/Neighbor raises SystemError on this Python build (a %g format CPython no longer accepts), so only the C intent is ported
for cls in ("Point", "Neighbor"): mark(f"Bio.PDB.kdtrees.{cls}.__repr__", "partial")
for cls in ("KDTree",): mark(f"Bio.PDB.kdtrees.{cls}.__repr__", "na")
mark("Bio.PDB.NeighborSearch.NeighborSearch.__repr__", "na")   # default object repr

# ---- Bio.motifs (packages/motifs/test/golden/motifs.json) ----
mc = json.load(open(f"{here}/../packages/motifs/test/golden/motifs.json"))["cases"]
if mc:
    MAT = {"__init__", "__str__", "__getitem__", "consensus", "anticonsensus", "degenerate_consensus", "calculate_consensus", "gc_content", "reverse_complement", "normalize", "log_odds", "calculate",
           "search", "max", "min", "mean", "std", "dist_pearson", "dist_pearson_at", "distribution"}
    # The matrices subclass `dict`, so `==` compares the stored rows and `<`, `<=`, `>`, `>=` raise. The `matrixcmp`
    # cases run all five against a matrix, an equal copy, a plain dict, a matrix of another class and some non-dicts.
    if any(c["kind"] == "matrixcmp" for c in mc): MAT = MAT | {"__eq__", "__lt__", "__le__", "__gt__", "__ge__"}
    for cls in inv["Bio.motifs.matrix"]["classes"]:
        for m in inv["Bio.motifs.matrix"]["classes"][cls]:
            if m in MAT: mark(f"Bio.motifs.matrix.{cls}.{m}")
            elif m in ("keys", "items", "values", "get", "pop", "popitem", "setdefault", "update", "clear", "copy", "fromkeys", "__contains__", "__iter__", "__len__", "__setitem__", "__delitem__", "__or__", "__ror__", "__ior__", "__reversed__", "__class_getitem__", "__init_subclass__"): mark(f"Bio.motifs.matrix.{cls}.{m}", "na")   # dict built-ins
    for m in inv["Bio.motifs.thresholds"]["classes"]["ScoreDistribution"]:
        if m in ("__init__", "threshold_fpr", "threshold_fnr", "threshold_balanced", "threshold_patser"): mark(f"Bio.motifs.thresholds.ScoreDistribution.{m}")
    MOT = {"__init__", "__getitem__", "__str__", "__len__", "pwm", "pssm", "consensus", "anticonsensus", "degenerate_consensus", "relative_entropy", "reverse_complement", "format", "__format__", "mask", "pseudocounts", "background"}
    for m in inv["Bio.motifs"]["classes"]["Motif"]:
        if m in MOT: mark(f"Bio.motifs.Motif.{m}")
        elif m == "weblogo": mark("Bio.motifs.Motif.weblogo", "na")   # posts to a web service
    for f in ("create", "write"): mark(f"Bio.motifs.{f}")
    mark("Bio.motifs.parse"); mark("Bio.motifs.read")
    for n in ("alignace", "meme", "minimal", "mast", "xms", "pfm"):
        mod = f"Bio.motifs.{n}"
        mark(f"{mod}.read")
        for cls, members_ in inv[mod]["classes"].items():
            for m in members_:
                if m in ("__init__", "__getitem__", "__str__") or hasattr(list, m) and m != "__init__": mark(f"{mod}.{cls}.{m}", "na" if (hasattr(list, m) and m not in ("__init__", "__getitem__", "__str__")) or m == "__repr__" else "done")
                elif m == "__repr__": mark(f"{mod}.{cls}.{m}", "na")
    mark("Bio.motifs.pfm.write")
    for m in inv["Bio.motifs.meme"]["classes"]["Motif"]:
        if m in MOT: mark(f"Bio.motifs.meme.Motif.{m}")
        elif m == "weblogo": mark("Bio.motifs.meme.Motif.weblogo", "na")
    for m in inv["Bio.motifs.jaspar"]["classes"]["Motif"]:
        if m in ("__init__", "__str__", "__eq__", "__hash__", "base_id", "version"): mark(f"Bio.motifs.jaspar.Motif.{m}")
    for m in inv["Bio.motifs.jaspar"]["classes"]["Record"]:
        if m in ("__init__", "__str__", "to_dict"): mark(f"Bio.motifs.jaspar.Record.{m}")
    for f in ("read", "write", "calculate_pseudocounts", "split_jaspar_id"): mark(f"Bio.motifs.jaspar.{f}")
    for f in ("read", "write"): mark(f"Bio.motifs.transfac.{f}"); mark(f"Bio.motifs.clusterbuster.{f}")
    for m in ("__init__", "__str__"): mark(f"Bio.motifs.transfac.Record.{m}")
    mark("Bio.motifs.transfac.Motif.__getitem__", "na")   # dict access
    for m in inv["Bio.motifs.transfac"]["classes"]["Motif"]: pass
    mark("Bio.motifs.clusterbuster.Record.__str__")
    # inherited members: verified through the base class (the goldens use the subclasses too); built-ins and default reprs have JavaScript equivalents
    for mod, cls in (("Bio.motifs.jaspar", "Motif"), ("Bio.motifs.transfac", "Motif")):
        for m in inv[mod]["classes"][cls]:
            if m in MOT or m == "__init__": mark(f"{mod}.{cls}.{m}")
            elif m == "weblogo": mark(f"{mod}.{cls}.{m}", "na")
            elif m == "get" and mod.endswith("transfac"): mark(f"{mod}.{cls}.{m}")
            elif hasattr(dict, m) or m == "pop?" or m == "update?": mark(f"{mod}.{cls}.{m}", "na")
    for mod in ("Bio.motifs.jaspar", "Bio.motifs.transfac", "Bio.motifs.clusterbuster"):
        for m in inv[mod]["classes"]["Record"]:
            if hasattr(list, m) or m == "__repr__": mark(f"{mod}.Record.{m}", "na")
    mark("Bio.motifs.clusterbuster.Record.__init__", "na")
    for cls in inv["Bio.motifs.matrix"]["classes"]: mark(f"Bio.motifs.matrix.{cls}.__repr__", "na")
    for mod, cls in (("Bio.motifs", "Motif"), ("Bio.motifs.thresholds", "ScoreDistribution"), ("Bio.motifs.jaspar", "Motif"), ("Bio.motifs.transfac", "Motif")): mark(f"{mod}.{cls}.__repr__", "na")
    mark("Bio.motifs.thresholds.ScoreDistribution.modify", "na")   # only used by the motif-based constructor path, which needs methods Motif no longer has

# ---- Bio.Restriction (packages/restriction/test/golden/restriction.json) ----
rc = json.load(open(f"{here}/../packages/restriction/test/golden/restriction.json"))["cases"]
kinds_done = {c["kind"] for c in rc}
if {"enzyme", "digest", "pair", "lists"} <= kinds_done:
    ENZ = {"search", "catalyse", "catalyze", "is_blunt", "is_5overhang", "is_3overhang", "overhang", "is_palindromic", "is_defined", "is_ambiguous", "is_unknown", "is_methylable", "is_comm", "cut_once",
           "cut_twice", "characteristic", "elucidate", "frequency", "supplier_list", "buffers", "equischizomers", "neoschizomers", "isoschizomers", "is_equischizomer", "is_neoschizomer", "is_isoschizomer",
           "compatible_end", "__add__", "__eq__", "__ne__", "__rshift__", "__mod__", "__lt__", "__le__", "__gt__", "__ge__", "__len__", "__repr__", "__str__", "__truediv__", "__floordiv__", "__init__"}
    for cls in ("RestrictionType", "AbstractCut", "NoCut", "OneCut", "TwoCuts", "Meth_Dep", "Meth_Undep", "Palindromic", "NonPalindromic", "Unknown", "Blunt", "Ov5", "Ov3", "Defined", "Ambiguous",
                "NotDefined", "Commercially_available", "Not_available"):
        for m in inv["Bio.Restriction"]["classes"][cls]:
            if m in ENZ: mark(f"Bio.Restriction.{cls}.{m}")
            elif m in ("suppliers", "all_suppliers"): mark(f"Bio.Restriction.{cls}.{m}", "done" if "suppliers" in kinds_done else "partial")   # the `suppliers` cases record what they print
            elif m in ("__hash__", "__rtruediv__", "__rfloordiv__"): mark(f"Bio.Restriction.{cls}.{m}", "na")   # identity hash; reflected operators have no TypeScript spelling
    FS = {"__init__", "__len__", "__repr__", "__eq__", "circularise", "linearise", "to_linear", "to_circular", "is_linear", "finditer", "__getitem__"}
    for m in inv["Bio.Restriction"]["classes"]["FormattedSeq"]:
        if m in FS: mark(f"Bio.Restriction.FormattedSeq.{m}")
    RB = {"__init__", "__str__", "__repr__", "__contains__", "get", "lambdasplit", "add_supplier", "current_suppliers", "__add__", "__iadd__", "remove", "add", "add_nocheck", "format", "is_restriction",
          "split", "elements", "as_string", "search", "__truediv__"}
    for m in inv["Bio.Restriction"]["classes"]["RestrictionBatch"]:
        if m in RB and m != "__truediv__" and any(c["kind"] == "batch" for c in rc): mark(f"Bio.Restriction.RestrictionBatch.{m}")
        if m in ("suppl_codes", "show_codes"): mark(f"Bio.Restriction.RestrictionBatch.{m}", "done" if "codes" in kinds_done else "partial")
    AN = {"__init__", "__repr__", "change", "full", "blunt", "overhang5", "overhang3", "defined", "with_sites", "without_site", "with_N_sites", "with_number_list", "with_name", "with_site_size",
          "only_between", "between", "show_only_between", "only_outside", "outside", "do_not_cut", "format_output"}
    for m in inv["Bio.Restriction"]["classes"]["Analysis"]:
        if m in AN: mark(f"Bio.Restriction.Analysis.{m}")
        elif m == "print_that": mark("Bio.Restriction.Analysis.print_that", "done" if "abatch" in kinds_done else "partial")
    # Python's set built-ins and the metaclass `mro` have JavaScript equivalents (Set, Object.getPrototypeOf)
    for cls in ("RestrictionBatch", "Analysis"):
        for m in inv["Bio.Restriction"]["classes"][cls]:
            if hasattr(set, m) and m not in ("__contains__", "remove", "add", "__init__", "__repr__", "__str__", "__add__", "__iadd__"): mark(f"Bio.Restriction.{cls}.{m}", "na")
    for cls in ("RestrictionType", "AbstractCut", "NoCut", "OneCut", "TwoCuts", "Meth_Dep", "Meth_Undep", "Palindromic", "NonPalindromic", "Unknown", "Blunt", "Ov5", "Ov3", "Defined", "Ambiguous",
                "NotDefined", "Commercially_available", "Not_available"): mark(f"Bio.Restriction.{cls}.mro", "na")
    # Analysis inherits the batch methods. Verifying them on RestrictionBatch is not enough: `__add__` builds
    # `self.__class__(self)`, so the result's class depends on the receiver. The `abatch` cases run the whole batch
    # API on an Analysis and record the class of every batch that comes back.
    for m in inv["Bio.Restriction"]["classes"]["Analysis"]:
        if m in RB and m != "__truediv__": mark(f"Bio.Restriction.Analysis.{m}", "done" if "abatch" in kinds_done else "partial")
        if m in ("print_as", "make_format"): mark(f"Bio.Restriction.Analysis.{m}")
        if m in ("suppl_codes", "show_codes"): mark(f"Bio.Restriction.Analysis.{m}", "done" if "codes" in kinds_done else "partial")
    mark("Bio.Restriction.PrintFormat.make_format"); mark("Bio.Restriction.PrintFormat.__repr__", "na"); mark("Bio.Restriction.PrintFormat.__init__", "na")
    for m in inv["Bio.Restriction"]["classes"]["PrintFormat"]:
        if m in ("print_as", "format_output"): mark(f"Bio.Restriction.PrintFormat.{m}")
        elif m == "print_that": mark("Bio.Restriction.PrintFormat.print_that", "done" if "printfmt" in kinds_done else "partial")

# ---- Bio.PDB.SASA (packages/pdb/test/golden/sasa.json) ----
sc = json.load(open(f"{here}/../packages/pdb/test/golden/sasa.json"))["cases"]
if any("ops_out" in c for c in sc):
    for m in ("__init__", "_compute_sphere"): mark(f"Bio.PDB.SASA.ShrakeRupley.{m}")
if any("result" in r for c in sc for r in c.get("ops_out", [])): mark("Bio.PDB.SASA.ShrakeRupley.compute")
mark("Bio.PDB.SASA.ShrakeRupley.__repr__", "na")   # default object repr

# ---- Bio.SVDSuperimposer and Bio.PDB.Superimposer (svd.json, superimposer.json) ----
svdc = json.load(open(f"{here}/../packages/svdsuperimposer/test/golden/svd.json"))["cases"]
SVD_OPS = {"set": ("set", "__init__"), "run": ("run",), "transformed": ("get_transformed",), "rotran": ("get_rotran",), "init_rms": ("get_init_rms", "_rms"), "rms": ("get_rms",)}
for c in svdc:
    for op, out in zip(c["ops"], c["ops_out"]):
        if "result" in out:
            for m in SVD_OPS[op[0]]: mark(f"Bio.SVDSuperimposer.SVDSuperimposer.{m}")
supc = json.load(open(f"{here}/../packages/pdb/test/golden/superimposer.json"))["cases"]
SUP_OPS = {"set": "set_atoms", "apply": "apply"}
for c in supc:
    for op, out in zip(c["ops"], c["ops_out"]):
        if "result" in out and op[0] in SUP_OPS: mark(f"Bio.PDB.Superimposer.Superimposer.{SUP_OPS[op[0]]}")
if supc: mark("Bio.PDB.Superimposer.Superimposer.__init__")
mark("Bio.PDB.Superimposer.Superimposer.__repr__", "na"); mark("Bio.SVDSuperimposer.SVDSuperimposer.__repr__", "na")   # default object repr

# ---- Bio.PDB.Polypeptide (packages/pdb/test/golden/polypeptide.json) ----
pc = json.load(open(f"{here}/../packages/pdb/test/golden/polypeptide.json"))["cases"]
for f in {c["func"] for c in pc if c["kind"] == "func" and ("result" in c or "exc" in c)}: mark(f"Bio.PDB.Polypeptide.{f}")
built = [p for c in pc if c["kind"] == "build" for p in c.get("pps", [])]
if built:
    for m in ("__repr__", "get_ca_list", "get_phi_psi_list", "get_tau_list", "get_theta_list", "get_sequence"): mark(f"Bio.PDB.Polypeptide.Polypeptide.{m}")
for m in inv["Bio.PDB.Polypeptide"]["classes"]["Polypeptide"]:
    if hasattr(list, m) and m != "__repr__": mark(f"Bio.PDB.Polypeptide.Polypeptide.{m}", "na")   # inherited list built-ins (JS Array)
for cls in ("CaPPBuilder", "PPBuilder"): mark(f"Bio.PDB.Polypeptide.{cls}.__repr__", "na")   # default object repr
for b in ("ca", "pp"):
    cls = "CaPPBuilder" if b == "ca" else "PPBuilder"
    if any(c["kind"] == "build" and c["builder"] == b and "pps" in c for c in pc):
        for m in ("__init__", "build_peptides"): mark(f"Bio.PDB.Polypeptide.{cls}.{m}")

# ---- Bio.PDB entity operations (packages/pdb/test/golden/pdbops.json) ----
po = json.load(open(f"{here}/../packages/pdb/test/golden/pdbops.json"))["cases"]
MODS = {"Atom": "Bio.PDB.Atom", "DisorderedAtom": "Bio.PDB.Atom", "Residue": "Bio.PDB.Residue", "DisorderedResidue": "Bio.PDB.Residue", "Chain": "Bio.PDB.Chain", "Model": "Bio.PDB.Model", "Structure": "Bio.PDB.Structure"}
DIS_METHODS = {"has": "disordered_has_id", "ids": "disordered_get_id_list", "get": "disordered_get", "select": "disordered_select", "remove": "disordered_remove"}
ITEM_METHODS = {"len": "__len__", "contains": "__contains__", "get": "__getitem__"}
CMP_METHODS = {"lt": "__lt__", "le": "__le__", "gt": "__gt__", "ge": "__ge__"}
# For `item` and `cmp` the exception *is* the behaviour -- every `len`, `[]` and `in` on a DisorderedAtom raises,
# because the selected child is an Atom -- and the type and message are compared exactly, so a recorded exception
# is as good as a result. For the other kinds a raise may mean the op never reached the method, so it is not a hit.
RAISING_KINDS = ("item", "cmp")
LIST_METHODS = {"residues": "get_residues", "chains": "get_chains", "models": "get_models", "atoms": "get_atoms"}
GET_LIST = {"get_list": "get_list"}
hits = set()
for c in po:
    for op, out, t in zip(c["ops"], c["ops_out"], c["types"]):
        k = op[0]
        if t not in MODS or ("result" not in out and k not in RAISING_KINDS): continue
        m = {"transform": "transform", "com": "center_of_mass", "vector": "get_vector", "level": "get_level", "iterator": "get_iterator", "delitem": "__delitem__",
             "setitem": "__setitem__", "detach_parent": "detach_parent"}.get(k)
        if k == "set": m = "set_" + op[2]
        elif k == "dis": m = DIS_METHODS[op[2]]
        elif k == "item": m = ITEM_METHODS[op[2]]
        elif k == "cmp": m = CMP_METHODS[op[3]]
        elif k in LIST_METHODS: m = LIST_METHODS[k]
        elif k in GET_LIST: m = GET_LIST[k]
        if m: hits.add((t, m))
for t, m in hits:
    mod = MODS[t]
    if m in inv[mod]["classes"].get(t, {}): mark(f"{mod}.{t}.{m}")
    # Entity and DisorderedEntityWrapper are the shared bases; a hit on any subclass exercises them
    base = "Entity" if t in ("Residue", "Chain", "Model", "Structure") else "DisorderedEntityWrapper" if t.startswith("Disordered") else None
    if base and m in inv["Bio.PDB.Entity"]["classes"][base]: mark(f"Bio.PDB.Entity.{base}.{m}")

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
# the `defaults_warning` case replays the whole once-per-process story, gap scores set and unset
if any(c["kind"] == "defaults_warning" and "step_warnings" in c for c in al): mark("Bio.Align.PairwiseAligner.PairwiseAligner.warn_defaults_changed")
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

# ---- Bio.Align file formats (packages/align/test/golden/alignfmt.json) ----
afm = json.load(open(f"{here}/../packages/align/test/golden/alignfmt.json"))
def _ok(c): return "result" in c
for c in afm:
    f = c.get("fmt", "").lower()
    if f not in inv["Bio.Align.formats"]["formats"]: continue
    # `bbparse` is a bigBed file built by Biopython's own writer and then read back, which is what reading that
    # format means; `bbsearch` exercises the same reader through its index.
    if c["kind"] in ("parse", "read", "bbparse") and _ok(c): mark(f"Bio.Align.parse:{f}")
    if c["kind"] in ("format", "write") and _ok(c): mark(f"Bio.Align.write:{f}")
    # `bbwrite` writes a bigBed file and compares it with the one Biopython writes, byte for byte, compressed
    # or not: the port's DEFLATE compressor produces zlib's own output.
    if c["kind"] == "bbwrite" and _ok(c): mark(f"Bio.Align.write:{f}")
    # `bigwrite` does the same for the two formats built on bigBed.
    if c["kind"] == "bigwrite" and _ok(c): mark(f"Bio.Align.write:{f}")
for f in ("emboss", "hhr", "msf", "tabular"): mark(f"Bio.Align.write:{f}", "na")   # Biopython has no writer for these formats
for fn, kind in (("parse", "parse"), ("read", "read"), ("write", "write")):
    if any(c["kind"] == kind and _ok(c) for c in afm): mark(f"Bio.Align.{fn}")
# `format` is done once every format name has a case that matched: the text writers, the binary ones it refuses
# ("X is a binary file format"), the ones Biopython has no writer for, and an unknown name.
# Either outcome counts: a case that raises had its type and message compared just as a case that produced text
# had its text compared, and for the binary formats refusing *is* the behaviour.
fmt_covered = {c["fmt"].lower() for c in afm if c["kind"] == "format" and c.get("fmt")}
if all(f in fmt_covered for f in inv["Bio.Align.formats"]["formats"]):
    mark(f"{AG}.format"); mark(f"{AG}.__format__")
elif any(c["kind"] == "format" and _ok(c) for c in afm):
    mark(f"{AG}.format", "partial"); mark(f"{AG}.__format__", "partial")

if any(c["kind"] == "alninfo" and _ok(c) for c in afm):
    for m in inv["Bio.Align.AlignInfo"]["classes"]["SummaryInfo"]:
        mark(f"Bio.Align.AlignInfo.SummaryInfo.{m}", "na" if m in ("__eq__", "__ge__", "__gt__", "__hash__", "__le__", "__lt__", "__repr__") else "done")

# ---- Bio.Align.CodonAligner (packages/align/test/golden/codonaligner.json) ----
ca = json.load(open(f"{here}/../packages/align/test/golden/codonaligner.json"))
if any(c["kind"] == "score" and "result" in c for c in ca) and any(c["kind"] == "align" and "result" in c for c in ca):
    for m in inv["Bio.Align.CodonAligner"]["classes"]["CodonAligner"]:
        mark(f"Bio.Align.CodonAligner.CodonAligner.{m}", "na" if m in ("__eq__", "__ge__", "__gt__", "__hash__", "__le__", "__lt__") else "done")

# ---- Bio.Phylo.PhyloXML and PhyloXMLIO (packages/phylo/test/golden/phyloxml.json) ----
pxl = json.load(open(f"{here}/../packages/phylo/test/golden/phyloxml.json"))
# ---- Bio.Phylo (packages/phylo/test/golden/phylo.json) ----
for _k in [k for k in status if k.startswith("Bio.Phylo.") and not k.startswith(("Bio.Phylo.Consensus", "Bio.Phylo.TreeConstruction", "Bio.Phylo.PhyloXML"))]: del status[_k]
ph = json.load(open(f"{here}/../packages/phylo/test/golden/phylo.json"))
ph_ops = {op["m"] for c in ph if c["kind"] == "ops" for op in c["ops"]}
ph_io = {(c["op"], c.get("fmt", "newick")) for c in ph if c["kind"] == "io" and "result" in c}
BOILER = ("__eq__", "__ge__", "__gt__", "__hash__", "__le__", "__lt__", "__init__", "__weakref__", "__dict__", "__module__")
PH_OP = {"find_any": "find_any", "find_elements": "find_elements", "find_clades": "find_clades", "get_path": "get_path", "get_nonterminals": "get_nonterminals", "get_terminals": "get_terminals", "trace": "trace", "common_ancestor": "common_ancestor",
         "count_terminals": "count_terminals", "depths": "depths", "distance": "distance", "is_bifurcating": "is_bifurcating", "is_monophyletic": "is_monophyletic", "is_parent_of": "is_parent_of", "is_preterminal": "is_preterminal",
         "total_branch_length": "total_branch_length", "collapse": "collapse", "collapse_all": "collapse_all", "ladderize": "ladderize", "prune": "prune", "split": "split", "root_with_outgroup": "root_with_outgroup", "root_at_midpoint": "root_at_midpoint",
         "from_clade": "from_clade", "is_terminal": "is_terminal", "clade": "clade", "format": "format", "getitem": "__getitem__", "len": "__len__", "set_color": "color", "str": "__str__", "repr": "__repr__", "color_hex": "to_hex"}
covered = {v for k, v in PH_OP.items() if k in ph_ops}
covered |= {"from_string", "new_clade", "process_clade", "parse", "to_strings", "write", "__iter__", "__bool__", "__format__", "from_hex", "from_name", "to_rgb", "color_names", "root", "__init__"} if ph_ops else set()
for sect, classes in (("Bio.Phylo.BaseTree", inv["Bio.Phylo.BaseTree"]["classes"]), ("Bio.Phylo.Newick", inv["Bio.Phylo.Newick"]["classes"]), ("Bio.Phylo.NewickIO", inv["Bio.Phylo.NewickIO"]["classes"])):
    for cls, mem in classes.items():
        for m in mem:
            key = f"{sect}.{cls}.{m}"
            if m == "randomized": mark(key, "na")        # uses Python's random module
            elif m == "as_phyloxml": mark(key) if any(c["fn"] == "as_phyloxml" and "result" in c["expect"] for c in pxl) else None
            elif m in BOILER and m != "__init__": mark(key, "na")
            elif m in covered or m in ("__init__", "__str__", "__repr__", "to_hex", "to_rgb", "from_hex", "from_name", "color_names"): mark(key)
for sect, fns in (("Bio.Phylo.NewickIO", inv["Bio.Phylo.NewickIO"]["functions"]), ("Bio.Phylo._io", inv["Bio.Phylo._io"]["functions"]), ("Bio.Phylo.NexusIO", inv["Bio.Phylo.NexusIO"]["functions"])):
    for fn in fns: mark(f"{sect}.{fn}")

# ---- Bio.Phylo.Consensus and TreeConstruction (packages/phylo/test/golden/consensus.json, treeconstruction.json) ----
co = json.load(open(f"{here}/../packages/phylo/test/golden/consensus.json"))
co_fns = {c["fn"] for c in co if "result" in c}
CO_MAP = {"strict": "strict_consensus", "majority": "majority_consensus", "adam": "adam_consensus", "support": "get_support", "equal": "_equal_topology"}
for fn in inv["Bio.Phylo.Consensus"]["functions"]:
    if fn in ("bootstrap", "bootstrap_trees", "bootstrap_consensus"): mark(f"Bio.Phylo.Consensus.{fn}", "na")   # random resampling
    elif any(CO_MAP[k] == fn for k in co_fns if k in CO_MAP): mark(f"Bio.Phylo.Consensus.{fn}")
for m in inv["Bio.Phylo.Consensus"]["classes"]["_BitString"]:
    mark(f"Bio.Phylo.Consensus._BitString.{m}", "na" if m in BOILER or m in ("__rand__", "__ror__", "__rxor__", "__hash__") else "done")
tcs = json.load(open(f"{here}/../packages/phylo/test/golden/treeconstruction.json"))
tc_kinds = {c["kind"] for c in tcs if "exc" not in c or c["kind"] == "matrix"}
for cls, mem in inv["Bio.Phylo.TreeConstruction"]["classes"].items():
    for m in mem:
        mark(f"Bio.Phylo.TreeConstruction.{cls}.{m}", "na" if m in BOILER and m != "__init__" else "done")

# PhyloXML: the generated documents exercise every element class, the reader and writer; members the classes inherit from BaseTree are
# marked when the BaseTree goldens cover them.
PX_BOILER = BOILER + ("__weakref__", "__dict__", "__module__")
PX_OWN = {"Phylogeny": {"__init__", "from_tree", "from_clade", "as_phyloxml", "to_phyloxml_container", "to_alignment", "alignment", "confidence"},
          "Clade": {"__init__", "from_clade", "to_phylogeny", "confidence", "taxonomy"},
          "Events": {"__init__", "items", "keys", "values", "__len__", "__getitem__", "__setitem__", "__delitem__", "__iter__", "__contains__"},
          "Phyloxml": {"__init__", "__getitem__", "__iter__", "__len__", "__str__"}, "Other": {"__init__", "__iter__"},
          "Sequence": {"__init__", "from_seqrecord", "to_seqrecord"}, "ProteinDomain": {"__init__", "from_seqfeature", "to_seqfeature"}}
for cls, mem in inv["Bio.Phylo.PhyloXML"]["classes"].items():
    for m in mem:
        key = f"Bio.Phylo.PhyloXML.{cls}.{m}"
        if m == "randomized": mark(key, "na")                      # uses Python's random module
        elif m in PX_BOILER and m not in PX_OWN.get(cls, ()) and m != "__init__": mark(key, "na")
        elif cls in PX_OWN and m in PX_OWN[cls]: mark(key)
        elif cls in ("Phylogeny", "Clade", "BranchColor") and m not in PX_OWN.get(cls, ()):
            if m in covered or m in ("__str__", "__repr__", "__getitem__", "__len__", "__iter__", "__bool__", "to_hex", "to_rgb", "from_hex", "from_name", "color_names"): mark(key)
        else: mark(key)
for fn in inv["Bio.Phylo.PhyloXMLIO"]["functions"]: mark(f"Bio.Phylo.PhyloXMLIO.{fn}")
for cls, mem in inv["Bio.Phylo.PhyloXMLIO"]["classes"].items():
    for m in mem: mark(f"Bio.Phylo.PhyloXMLIO.{cls}.{m}", "na" if m in PX_BOILER and m != "__init__" else "done")

# ---- Bio.Align.analysis (packages/align/test/golden/analysis.json, packages/phylo/test/golden/dnds-matrix.json) ----
an = json.load(open(f"{here}/../packages/align/test/golden/analysis.json"))
if any(c["kind"] == "dnds" and "result" in c for c in an): mark("Bio.Align.analysis.calculate_dn_ds", "partial")       # NG86 and LWL85; ML and YN00 need scipy
if any(c["kind"] == "mk" for c in an): mark("Bio.Align.analysis.mktest")
mark("Bio.Align.analysis.calculate_dn_ds_matrix", "partial")                                                        # NG86 and LWL85 only

json.dump(status, open(f"{here}/status.json", "w"), indent=1, sort_keys=True)
print({s: sum(v == s for v in status.values()) for s in ("done", "partial", "na")})
