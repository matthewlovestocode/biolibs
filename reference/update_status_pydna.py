"""Mark a pydna checklist item done only if a golden case exercises it.

The same rule as `update_status.py` applies: a `[x]` means a case in `packages/*/test/golden/` compared the
port's answer with pydna's, not that the code looks right.
"""
import json, os

here = os.path.dirname(__file__)
sp = f"{here}/status-pydna.json"
status = json.load(open(sp)) if os.path.exists(sp) else {}


def mark(key, value="done"):
    """Record one item's status, never downgrading what another rule has already marked done."""
    if status.get(key) == "done" and value != "done":
        return
    status[key] = value


ds = json.load(open(f"{here}/../packages/dseq/test/golden/dseq.json"))
cuts = json.load(open(f"{here}/../packages/dseq/test/golden/dseq-cut.json"))
ends = json.load(open(f"{here}/../packages/dseq/test/golden/dseq-ends.json"))
rest = json.load(open(f"{here}/../packages/dseq/test/golden/dseq-rest.json"))
melts = json.load(open(f"{here}/../packages/dseq/test/golden/dseq-melt.json"))
built = [c for c in ds if "snap" in c]
ops = {op[0] for c in ds for op in c["ops"]}
kinds = {c["kind"] for c in ds}

#: Which checklist items each recorded snapshot field covers, since every case records all of them.
#: `__len__` is not here: `Dseq` inherits it from Biopython's `Seq`, where it is already measured.
SNAPSHOT = ("watson", "crick", "get_parts", "left_ovhg", "right_ovhg", "ovhg", "watson_ovhg",
            "five_prime_end", "three_prime_end", "isblunt", "__str__", "__bytes__", "to_blunt_string",
            "__repr__")
#: Which item each operation in the cases covers.
OPS = {"rc": ("rc", "reverse_complement"), "looped": ("looped",), "shifted": ("shifted",),
       "cast_to_ds": ("cast_to_ds",), "cast_to_ds_left": ("cast_to_ds_left",),
       "cast_to_ds_right": ("cast_to_ds_right",), "add": ("__add__",), "add_str": ("__add__",),
       "multiply": ("__mul__",), "equals": ("__eq__",)}
#: Which item each way of building a molecule covers.
KINDS = {"construct": ("__init__",), "quick": ("quick",),
         "full_and_overhangs": ("from_full_sequence_and_overhangs",), "representation": ("from_representation",)}

if built:
    for member in SNAPSHOT:
        mark(f"pydna.dseq.Dseq.{member}")
    # mw is recorded for every molecule, including the ones it refuses a weight for
    mark("pydna.dseq.Dseq.mw")
    # reading the strands off and finding the ends is all pydna.alphabet does here
    mark("pydna.alphabet.get_parts")
    mark("pydna.alphabet.representation_tuple")
    for field in ("sticky_left5", "sticky_left3", "middle", "sticky_right3", "sticky_right5",
                  "single_watson", "single_crick"):
        mark(f"pydna.alphabet.DseqParts.{field}")
for op in ops:
    for member in OPS.get(op, ()):
        mark(f"pydna.dseq.Dseq.{member}")
for kind in kinds:
    for member in KINDS.get(kind, ()):
        mark(f"pydna.dseq.Dseq.{member}")
# A molecule split in two is refused at construction, which is the one thing dsbreaks is for.
if any(c.get("exc", {}).get("msg", "").startswith("Molecule is internally split") for c in ds):
    mark("pydna.alphabet.dsbreaks")
# Every group of the encoding has a molecule that uses it.
data = {c["snap"]["data"] for c in built}
GROUPS = {"un_ambiguous_ds_dna": "GATC", "ds_rna": "UO", "ambiguous_ds_dna": "RYMKSWHBVDN",
          "single_stranded_dna_rna": "PEXIQFZJ$%", "loops_dna_rna": "0123456789",
          "mismatched_dna_rna": "!#{}&*()<>@:?[]_;", "gap": " "}
for group, letters in GROUPS.items():
    if any(any(ch in letters for ch in d) for d in data):
        mark(f"pydna.alphabet.codes.{group}")
# Cutting, which the dseq-cut.json cases cover: every case records the cut sites, how they pair up, the
# fragments, both ends as cut sites and the cutter counts, so one built case covers the lot.
if cuts["cuts"]:
    for member in ("cut", "apply_cut", "get_cutsites", "cutsite_is_valid", "get_cut_parameters",
                   "get_cutsite_pairs", "get_left_end_as_cutsite", "get_right_end_as_cutsite",
                   "left_end_position", "right_end_position", "cutters", "n_cutters", "no_cutters",
                   "unique_cutters", "twice_cutters", "once_cutters", "__getitem__"):
        mark(f"pydna.dseq.Dseq.{member}")
# The circular byte string, exercised directly.
circular_ops = {op[0] for c in cuts["circular"] for op in c["ops"]}
CIRCULAR = {"shifted": ("shifted",), "slice": ("__getitem__",), "at": ("__getitem__",),
            "cutaround": ("cutaround",), "find": ("find",), "replace_with": ("replace_with",)}
for op in circular_ops:
    for member in CIRCULAR.get(op, ()):
        mark(f"pydna.dseq.CircularBytes.{member}")
if cuts["circular"]:
    mark("pydna.dseq.CircularBytes.__new__")
# The end-modifying enzymes: every case in dseq-ends.json runs all of them over one molecule.
end_ops = {op[0] for c in ends for op in c["ops"]}
for op in end_ops:
    mark(f"pydna.dseq.Dseq.{op}")
# Melting: every case records both searches, the shedding, the widened cuts and the pieces, at eight
# lengths including the one that makes the pattern itself impossible.
if any("rounds" in c for c in melts):
    for member in ("melt", "melt_ss_dna", "get_ss_meltsites", "get_ds_meltsites", "shed_ss_dna",
                   "shift_melt_cutsite", "shift_melt_cutsite_pairs"):
        mark(f"pydna.dseq.Dseq.{member}")
    mark("pydna.alphabet.regex_ss_melt_factory")
    mark("pydna.alphabet.regex_ds_melt_factory")
# The checksum, searching, joining, the parts record's own behaviour and whether two strands anneal.
built_rest = [c for c in rest["cases"] if "snap" in c]
if built_rest:
    for member in ("seguid", "find", "__contains__"):
        mark(f"pydna.dseq.Dseq.{member}")
    for member in ("__repr__", "__iter__", "__getitem__", "__eq__", "__init__"):
        mark(f"pydna.alphabet.DseqParts.{member}")
    # Python sets `__hash__` to None on both classes because `__eq__` is defined without it, so neither
    # can be hashed; JavaScript has no hashing protocol for a port to provide.
    mark("pydna.dseq.Dseq.__hash__", "na")
    mark("pydna.alphabet.DseqParts.__hash__", "na")
if rest["joins"]:
    mark("pydna.dseq.Dseq.join")
if rest["anneals"]:
    mark("pydna.alphabet.anneal_strands")

# The common-substring matcher: every case records both functions' answers, including the refusals, so one
# case that was not refused covers both. Upstream these are a call into pydivsufsort, so what the cases
# compare is that library's output rather than anything written in Python.
subs = json.load(open(f"{here}/../packages/assembly/test/golden/substrings.json"))
if any("value" in c["css"] for c in subs["cases"]):
    mark("pydna.common_sub_strings.common_sub_strings")
if any("value" in c["terminal"] for c in subs["cases"]):
    mark("pydna.common_sub_strings.terminal_overlap")

# pydna's own Seq and ProteinSeq. Every case records every method at every organism, so one sequence that
# was built covers the lot. `express` is marked on its cells: what it returns is a prettytable table, and
# that library's rendering is not pydna's, so the layout is neither ported nor claimed.
pseq = json.load(open(f"{here}/../packages/dseq/test/golden/pydna-seq.json"))
if pseq["cases"]:
    for member in ("gc", "orfs", "orfs2", "rarecodons", "rc", "reverse_complement", "seguid",
                   "startcodon", "stopcodon", "transcribe", "translate"):
        mark(f"pydna.seq.Seq.{member}")
    if any("cai" in c["by_organism"]["sce"] for c in pseq["cases"]):
        mark("pydna.seq.Seq.cai")
    if any("express" in c["by_organism"]["sce"] for c in pseq["cases"]):
        mark("pydna.seq.Seq.express")

# pydna's record layer. Every case records every method over fourteen sequences, so one record that was
# built covers the lot, with three exceptions marked rather than measured:
#
#   __hash__ hashes a string built from the instance dictionary, and Python's string hashing moves with the
#   interpreter's hash seed, so the number is different every run and there is nothing to agree with.
#   dump writes a Python pickle, which exists to be read back by Python; a TypeScript port has no business
#   producing one.
#   datefunction reads the clock. The port has it, so `stamp`'s default works, but its answer is whenever
#   it was called.
psr = json.load(open(f"{here}/../packages/dseqrecord/test/golden/pydna-seqrecord.json"))
built_sr = [c for c in psr["cases"] if "value" in c["snap"]]
if built_sr:
    for member in ("__init__", "__add__", "__eq__", "__ne__", "__lt__", "__gt__", "__bool__",
                   "__format__", "__getitem__", "__repr__", "__str__", "accession", "definition",
                   "locus", "add_colors_to_features_for_ape", "add_feature", "cai", "comment", "copy",
                   "express", "extract_feature", "from_Bio_SeqRecord", "gc", "isorf", "lcs",
                   "list_features", "rarecodons", "rc", "reverse_complement", "seguid",
                   "sorted_features", "stamp", "startcodon", "stopcodon", "translate"):
        mark(f"pydna.seqrecord.SeqRecord.{member}")
    mark("pydna.seqrecord.SeqRecord.__hash__", "na")
    mark("pydna.seqrecord.SeqRecord.dump", "na")
    mark("pydna.seqrecord.SeqRecord.datefunction", "na")
if psr["proteins"]:
    for member in ("cai", "express", "gc", "isorf", "rarecodons", "rc", "reverse_complement",
                   "startcodon", "stopcodon", "__format__"):
        mark(f"pydna.seqrecord.ProteinSeqRecord.{member}")
if psr["identifiers"]:
    mark("pydna.utils.identifier_from_string")

# The location helpers Dseqrecord's feature handling rests on. `shift_location` is measured over every
# shape that makes it decide -- parts landing on the origin, parts that split, adjacent parts that join,
# zero-length parts -- because a mistake there does not raise, it moves annotations onto the wrong bases.
ploc = json.load(open(f"{here}/../packages/dseqrecord/test/golden/pydna-locations.json"))
if any("value" in c["after"] for c in ploc["cases"]):
    mark("pydna.utils.shift_location")
if any("value" in c["boundaries"] for c in ploc["cases"]):
    mark("pydna.utils.location_boundaries")
if any("value" in c["result"] for c in ploc["features"]):
    mark("pydna.utils.shift_feature")
if ploc["flatten"]:
    mark("pydna.utils.flatten")

# Dseqrecord's molecule layer. Every case is run on a record carrying features, because that is where the
# difficulty is: closing a molecule shortens it by its overhangs, moving the origin renumbers everything,
# and a feature that no longer fits has to go.
#
# `write` is the one member left unmarked, and deliberately: it takes a *file name*. Nothing in this
# repository touches a file system, and the format it would have written is what `format` returns.
#
# Marked `na` rather than measured:
#   __hash__ hashes a string built from the instance dictionary, so it moves with the interpreter's hash
#   seed, exactly as pydna.seqrecord's does.
#   history, source, validate_history, normalize_history and is_amplicon need pydna.opencloning_models,
#   1,421 lines of pydantic describing a provenance interchange format: a port of its own, not of the
#   molecule. Note that __eq__ deletes `source` from both sides before comparing, so carrying it unset
#   changes nothing observable.
#   copy_gb_to_clipboard and copy_fasta_to_clipboard need a clipboard; map_trace_files reads ABI files
#   off disk.
pdr = json.load(open(f"{here}/../packages/dseqrecord/test/golden/dseqrecord.json"))
built_dr = [c for c in pdr["cases"] if "value" in c["snap"]]
if built_dr:
    for member in ("__init__", "__add__", "__contains__", "__eq__", "__ne__", "__getitem__", "__mul__",
                   "__repr__", "__str__", "add_feature", "apply_cut", "circular", "extract_feature",
                   "find", "find_aa", "find_aminoacids", "join", "looped", "lower", "m",
                   "orfs", "orfs_to_features", "rc", "reverse_complement", "seguid", "shifted",
                   "terminal_transferase", "tolinear", "upper"):
        mark(f"pydna.dseqrecord.Dseqrecord.{member}")
    # `format` is pydna's own override -- the `dscode` modifier, the stripped name, `topology`, and the
    # trailing newline taken off -- and `figure` draws the molecule with one feature's parts highlighted.
    # Both are marked only where a case compared every variant, including the ones that raise.
    if all(k in built_dr[0].get("formats", {}) for k in ("gb", "fasta-2line dscode", " gb ", "nope")):
        mark("pydna.dseqrecord.Dseqrecord.format")
    if all(k in built_dr[0].get("figure", {}) for k in ("default", "plain", "second", "negative")):
        mark("pydna.dseqrecord.Dseqrecord.figure")
    mark("pydna.dseqrecord.Dseqrecord.__hash__", "na")
    for member in ("history", "source", "validate_history", "normalize_history", "is_amplicon"):
        mark(f"pydna.dseqrecord.Dseqrecord.{member}", "na")
    for member in ("copy_gb_to_clipboard", "copy_fasta_to_clipboard", "map_trace_files"):
        mark(f"pydna.dseqrecord.Dseqrecord.{member}", "na")
    # Every snapshot reads the molecule off `seq`: its code, both strands and the overhang.
    mark("pydna.dseqrecord.Dseqrecord.seq")
# A helper for showing a molecule in a Jupyter notebook, which has no counterpart here.
mark("pydna.dseqrecord.display_html", "na")
if any("value" in b["result"] for b in pdr["builds"]):
    mark("pydna.dseqrecord.Dseqrecord.from_string")
    mark("pydna.dseqrecord.Dseqrecord.from_SeqRecord")

# Cutting a record, which is cutting a molecule and then deciding which fragment each feature belongs to.
# The cases put features deliberately across the cut sites, including through the origin of a circle.
pdc = json.load(open(f"{here}/../packages/dseqrecord/test/golden/dseqrecord-cut.json"))
built_cut = [c for c in pdc["cases"] if "value" in c["built"]]
if built_cut:
    for member in ("cut", "linearize", "number_of_cuts", "cutters", "no_cutters", "n_cutters",
                   "once_cutters", "twice_cutters", "unique_cutters"):
        mark(f"pydna.dseqrecord.Dseqrecord.{member}")
if any("value" in c["result"] for c in pdc["synced"]):
    mark("pydna.dseqrecord.Dseqrecord.synced")
if pseq["proteins"]:
    for member in ("__getitem__", "back_transcribe", "complement", "complement_rna", "instability_index",
                   "molecular_weight", "pI", "rc", "reverse_complement", "reverse_complement_rna",
                   "seguid", "transcribe", "translate"):
        mark(f"pydna.seq.ProteinSeq.{member}")

# The assembly engine. A function or method is done when the golden cases call it and the port's answer
# matched pydna's, down to the order the products come back in. The cases are grouped by what they drive,
# so each group ticks off what driving it exercises.
asm = json.load(open(f"{here}/../packages/assembly2/test/golden/assembly2.json"))
ran = {c["fn"] for c in asm["utils"] if "fn" in c}
finders = {key.split(":")[0] for c in asm["algorithms"] for key in c.get("runs", {})}

#: What each group of cases exercises, where every case in the group goes through all of it.
COVERED = {
    "algorithms": [f"pydna.assembly2.{fn}" for fn in finders] + ["pydna.assembly2.restriction_ligation_overlap",
                   "pydna.assembly2.primer_template_overlap"],
    # Building the graph, walking it, checking the walks, and turning them into molecules.
    "assembly": ["pydna.assembly2.Assembly." + m for m in (
        "__init__", "__repr__", "add_edges_from_match", "assembly_is_valid", "format_assembly_edge",
        "get_linear_assemblies", "get_circular_assemblies", "get_insertion_assemblies", "assemble_linear",
        "assemble_circular", "assemble_insertion", "get_locations_on_fragments", "node_path2assembly_list",
        "assembly_uses_only_adjacent_edges", "get_possible_assembly_number", "get_unique_linear_paths",
        "format_insertion_assembly", "format_insertion_assembly_edge_case")] + [
        "pydna.assembly2." + f for f in (
        "assemble", "assembly_is_circular", "get_assembly_subfragments", "extract_subfragment",
        "edge_representation2subfragment_representation", "remove_subassemblies",
        "reverse_complement_assembly", "filter_linear_subassemblies")],
    "pcr": ["pydna.assembly2.PCRAssembly." + m for m in (
        "__init__", "assemble_linear", "get_linear_assemblies", "get_circular_assemblies",
        "get_insertion_assemblies")] + ["pydna.assembly2.pcr_assembly",
        "pydna.assembly2.annotate_primer_binding_sites"],
    "single": ["pydna.assembly2.SingleFragmentAssembly." + m for m in (
        "__init__", "get_circular_assemblies", "get_insertion_assemblies", "get_inversion_assemblies",
        "get_linear_assemblies", "assemble_inversion")],
    "methods": ["pydna.assembly2." + f for f in (
        "gibson_assembly", "in_fusion_assembly", "fusion_pcr_assembly", "in_vivo_assembly",
        "ligation_assembly", "restriction_ligation_assembly", "golden_gate_assembly",
        "common_function_assembly_products", "partially_digested_seqs_in_restriction_ligation_assembly",
        "combine_algorithms")],
    "primer": ["pydna.primer.Primer." + m for m in (
        "__init__", "__repr__", "__radd__", "__getitem__", "footprint", "tail", "reverse_complement")],
}
for group, keys in COVERED.items():
    if any("value" in json.dumps(c) for c in asm[group]):
        for key in keys:
            mark(key)

#: The helpers that have cases of their own, by the name the case goes under.
BY_CASE = {
    "ends_from_cutsite": ["pydna.assembly2.ends_from_cutsite"],
    "zip_match": ["pydna.assembly2.zip_match_leftwards", "pydna.assembly2.zip_match_rightwards",
                  "pydna.assembly2.seqrecord2_uppercase_DNA_string"],
    "is_sublist": ["pydna.assembly2.is_sublist"],
    "circular_permutation_min_abs": ["pydna.assembly2.circular_permutation_min_abs"],
    "gather_overlapping_locations": ["pydna.assembly2.gather_overlapping_locations"],
    "assembly_strings": ["pydna.assembly2.assembly2str", "pydna.assembly2.assembly2str_tuple",
                         "pydna.assembly2.assembly_has_mismatches",
                         "pydna.assembly2.subfragment_representation2edge_representation"],
    "create_location": ["pydna.utils.create_location"],
    "cuts_overlap": ["pydna.utils.cuts_overlap"],
    "cutsite_to_location": ["pydna.utils.cutsite_to_location"],
    "deduplicate": ["pydna.utils.deduplicate"],
    "limit_iterator": ["pydna.utils.limit_iterator"],
    "location_overlap": ["pydna.utils.location_overlap", "pydna.utils.locations_overlap"],
    "sum_is_sticky": ["pydna.utils.sum_is_sticky"],
}
for case_name, keys in BY_CASE.items():
    if case_name in ran:
        for key in keys:
            mark(key)

# Writing a cloning plan down and running it again. A case is a whole plan — document, read-back,
# replay and normalisation — so one that came out right exercises all of it at once.
plans = json.load(open(f"{here}/../packages/opencloning/test/golden/opencloning.json"))
if any("value" in p["result"] for p in plans["plans"]):
    for member in ("add_dseqrecord", "add_primer", "from_dseqrecords", "get_ids_of_sequences_that_are_inputs",
                   "get_ids_of_sequences_that_are_not_inputs", "model_dump", "model_dump_json", "normalize",
                   "primers", "reassign_ids", "to_dseqrecords", "validate"):
        mark(f"pydna.opencloning_models.CloningStrategy.{member}")
    for member in ("validate", "normalize", "history_string", "add_to_history_graph", "input", "database_id",
                   "to_unserialized_dict", "to_pydantic_model", "from_pydantic_model", "serialize_input"):
        mark(f"pydna.opencloning_models.Source.{member}")
    for member in ("circular", "input", "validate", "normalize", "from_subfragment_representation"):
        mark(f"pydna.opencloning_models.AssemblySource.{member}")
    mark("pydna.opencloning_models.TextFileSequence.from_dseqrecord")
    mark("pydna.opencloning_models.PrimerModel.from_primer")
    for member in ("sequence", "to_pydantic_model"):
        mark(f"pydna.opencloning_models.SourceInput.{member}")
    for member in ("left_location", "right_location", "reverse_complemented", "from_biopython_location",
                   "to_pydantic_model"):
        mark(f"pydna.opencloning_models.AssemblyFragment.{member}")
    mark("pydna.opencloning_models.read_dseqrecord_from_text_file_sequence")
if any("value" in one.get("text", {}) for one in plans["locations"]):
    for member in ("from_biopython_location", "to_biopython_location", "field_validator", "from_start_and_end"):
        mark(f"pydna.opencloning_models.SequenceLocationStr.{member}")

# Pydantic's own plumbing, and Python's object identity, have nothing to be ported to: a port has no
# `id()` to number sequences by, so it always works the way `id_mode(use_python_internal_id=False)` does.
for key in ("pydna.opencloning_models.get_id", "pydna.opencloning_models.id_mode",
            "pydna.opencloning_models.CloningStrategy.model_config",
            "pydna.opencloning_models.Source.model_config", "pydna.opencloning_models.Source.TARGET_MODEL",
            "pydna.opencloning_models.AssemblySource.model_config",
            "pydna.opencloning_models.AssemblySource.TARGET_MODEL",
            "pydna.opencloning_models.TextFileSequence.model_config",
            "pydna.opencloning_models.PrimerModel.model_config",
            "pydna.opencloning_models.SourceInput.model_config",
            "pydna.opencloning_models.AssemblyFragment.model_config"):
    mark(key, "na")

json.dump(status, open(sp, "w"), indent=1, sort_keys=True)
print({s: sum(v == s for v in status.values()) for s in ("done", "partial", "na")})
