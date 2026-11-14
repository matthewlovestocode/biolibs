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

json.dump(status, open(sp, "w"), indent=1, sort_keys=True)
print({s: sum(v == s for v in status.values()) for s in ("done", "partial", "na")})
