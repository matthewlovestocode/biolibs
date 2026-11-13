"""Golden cases for @biolibs/seqedit, measured against Biopython.

Output: packages/seqedit/test/golden/seqedit.json

@biolibs/seqedit has no Biopython counterpart as a whole: Biopython cannot "replace these bases and
move the annotations". But three of its operations do have an authority in Biopython, and those are
what this file records, so the places the port claims parity are measured rather than asserted:

  slice   record[a:b]            vs extractRegion(record, a, b, {edgeFeatures: "drop"})
                                    Only `seq` and `features` are compared: Biopython's slicing drops
                                    annotations and dbxrefs and keeps molecule_type, while extractRegion
                                    keeps annotations and rewrites id and topology on purpose. The claim
                                    under test is that the surviving features and the sequence agree.
  rc      record.reverse_complement(everything=True)
                                 vs reverseComplementRecord(record)
                                    Compared in full, metadata included.
  shift   location + offset      vs shiftLocation(location, offset)
                                    Compared in full.

Cases cover features that fall wholly inside a slice, wholly outside it, and across each edge; both
strands; CompoundLocation joins, including joins only partly inside; fuzzy positions; features with no
location; per-letter annotations; and empty and whole-length slices.
"""
import json, os, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
from Bio import SeqFeature as SF
import Bio
from codec import S
from codec_feature import enc, dec, X, SL as LOC, CL, FEAT, REC
from codec_feature import pos as POS

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqedit", "test", "golden", "seqedit.json")

# ---------------------------------------------------------------- the records

# A 60-base sequence with features in every relationship to the slices below.
SEQ60 = "ATGAAAGGGCCCTTTATGCGTACGTTAGCCATGGCATTAGCATCGATCGGATCCATTAGC"

FEATURES = [
    FEAT(LOC(0, 10, 1), "gene", "whole-left", (("gene", "left"),)),
    FEAT(LOC(20, 30, 1), "gene", "inside", (("gene", "middle"),)),
    FEAT(LOC(50, 60, -1), "gene", "whole-right", (("gene", "right"),)),
    FEAT(LOC(5, 25, 1), "CDS", "across-start", (("product", "p1"),)),
    FEAT(LOC(35, 55, -1), "CDS", "across-end", (("product", "p2"),)),
    FEAT(LOC(0, 60, 1), "source", "source-whole", (("organism", "synthetic"),)),
    FEAT(LOC(22, 24, None), "misc_feature", "tiny-nostrand", ()),
    FEAT(CL([LOC(5, 15, 1), LOC(25, 35, 1)]), "mRNA", "join-across", (("note", "two exons"),)),
    FEAT(CL([LOC(21, 23, 1), LOC(27, 29, 1)]), "mRNA", "join-inside", ()),
    FEAT(CL([LOC(45, 50, -1), LOC(55, 58, -1)]), "mRNA", "join-right", ()),
    FEAT(LOC(POS("BeforePosition", 18), X(28), 1), "gene", "fuzzy-before", ()),
    FEAT(LOC(X(32), POS("AfterPosition", 44), -1), "gene", "fuzzy-after", ()),
    FEAT(LOC(POS("WithinPosition", 20, 20, 24), X(30), 1), "gene", "fuzzy-within", ()),
]

RECORDS = {
    "plain": REC(S(SEQ60), "demo", "DEMO", "a demonstration record",
                 ("GeneID:1",), FEATURES, (("molecule_type", "DNA"), ("topology", "linear"))),
    "withletters": REC(S(SEQ60[:20]), "letters", "LETTERS", "with per-letter annotations",
                       (), (FEAT(LOC(2, 8, 1), "gene", "g", ()), FEAT(LOC(15, 20, -1), "gene", "h", ())),
                       (("molecule_type", "DNA"),),
                       (("phred_quality", {"$": "list", "v": list(range(20))}), ("secondary_structure", "H" * 20))),
    "nofeatures": REC(S(SEQ60), "bare", "BARE", "no features", (), (), (("molecule_type", "DNA"),)),
    # A feature with no location: Biopython's slicing reads `feature.location.ref` and so raises
    # AttributeError. Recorded so the divergence is measured and not merely claimed; seqedit keeps
    # such a feature, since there is nothing in it to move.
    "nolocation": REC(S(SEQ60[:20]), "noloc", "NOLOC", "a feature with no location", (),
                      (FEAT(LOC(2, 8, 1), "gene", "g", ()), FEAT(None, "assembly_gap", "no-location", (("note", "unplaced"),))),
                      (("molecule_type", "DNA"),)),
}

SLICES = [(0, 60), (0, 30), (10, 50), (20, 30), (25, 26), (0, 0), (30, 30), (59, 60), (0, 1), (5, 55), (21, 29)]

# ---------------------------------------------------------------- case builders

def feature_only(record):
    """Just the sequence and the features, for the slice comparison (see the module docstring)."""
    full = enc(record)
    return {"seq": full["seq"], "features": full["features"]}


def cases():
    """Cases with the record spelled out in `recv`; `main` swaps in a `recref` before writing."""
    out = []
    for name in ("plain", "withletters", "nofeatures", "nolocation"):
        length = len(dec(RECORDS[name]))
        # Biopython reads `feature.location.ref` while slicing and reverse-complementing, so a feature with no
        # location makes it raise. seqedit keeps such a feature untouched, there being nothing in it to move. The
        # cases are kept so the divergence is measured rather than merely claimed; the port must succeed where
        # Biopython raises, and the test asserts exactly that.
        diverges = {"divergence": "no-location feature: Biopython raises AttributeError, seqedit keeps the feature"} if name == "nolocation" else {}
        for a, b in SLICES:
            if b > length:
                continue
            out.append({"op": "slice", "recv": RECORDS[name], "_rec": name, "args": [a, b], **diverges})
        out.append({"op": "rc", "recv": RECORDS[name], "_rec": name, **diverges})

    # Location shifting, against Biopython's `location + offset`.
    locations = [
        LOC(10, 20, 1), LOC(10, 20, -1), LOC(10, 20, None), LOC(0, 1, 1),
        CL([LOC(5, 15, 1), LOC(25, 35, 1)]),
        CL([LOC(5, 15, -1), LOC(25, 35, -1)], "order"),
        LOC(POS("BeforePosition", 5), X(15), 1),
        LOC(X(5), POS("AfterPosition", 15), -1),
    ]
    for loc in locations:
        for offset in (0, 7, 100, -3):
            out.append({"op": "shift", "args": [loc, offset]})
    return out


def apply(case, args):
    op = case["op"]
    if op == "slice":
        record = dec(case["recv"])
        return feature_only(record[args[0]:args[1]])
    if op == "rc":
        record = dec(case["recv"])
        return enc(record.reverse_complement(
            id=True, name=True, description=True, dbxrefs=True,
            features=True, annotations=True, letter_annotations=True))
    if op == "shift":
        return enc(args[0] + args[1])
    raise AssertionError(op)


def run(case):
    args = [dec(a) if isinstance(a, dict) else a for a in case.get("args", [])]
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            out["result"] = apply(case, args)
        except Exception as e:
            out["exc"] = {"type": type(e).__name__, "msg": str(e.args[0]) if e.args else str(e)}
    out["warnings"] = [str(x.message) for x in w]
    return {**case, **out}


def main():
    built = []
    for case in cases():
        done = run(case)
        # The record goes in the file once, in `records`; each case points at it by name.
        name = done.pop("_rec", None)
        if name is not None:
            done["recv"] = {"$": "recref", "name": name}
        built.append(done)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump({"biopython": Bio.__version__, "records": RECORDS, "cases": built}, fh, indent=1)
        fh.write("\n")
    kinds = {}
    for c in built:
        kinds[c["op"]] = kinds.get(c["op"], 0) + 1
    print(f"wrote {len(built)} cases to {os.path.relpath(OUT)}: " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())))


if __name__ == "__main__":
    main()
