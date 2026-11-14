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
if pseq["proteins"]:
    for member in ("__getitem__", "back_transcribe", "complement", "complement_rna", "instability_index",
                   "molecular_weight", "pI", "rc", "reverse_complement", "reverse_complement_rna",
                   "seguid", "transcribe", "translate"):
        mark(f"pydna.seq.ProteinSeq.{member}")

json.dump(status, open(sp, "w"), indent=1, sort_keys=True)
print({s: sum(v == s for v in status.values()) for s in ("done", "partial", "na")})
