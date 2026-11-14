"""Golden cases for pydna.seqrecord -> packages/dseqrecord/test/golden/pydna-seqrecord.json

pydna's `SeqRecord` is the layer `Dseqrecord` and the assembly stack are built on. What it adds to
Biopython's record is the vocabulary of someone holding a construct: GenBank's three fields under the names
a GenBank file uses, marking a region as a feature by position or by its sequence, a table of what is
annotated, mapping a sequencing read on, and a checksum stamped into the comment.

Three things here are deliberately not recorded as behaviour, and are marked in `status-pydna.json` instead
of being measured:

* `__hash__` hashes a string built from the instance's `__dict__`, and Python's string hashing depends on
  the interpreter's hash seed, so the number changes from run to run. There is nothing reproducible to
  compare.
* `dump` writes a Python pickle. A TypeScript port cannot produce one, and a format that exists to be read
  back by Python is not something to imitate.
* `express` and `startcodon` are measured, but note what they do: pydna passes the organism in and then
  calls the sequence without it, so the answer is always the default organism's. The cases record both
  organisms to pin that down rather than to show a difference.

`stamp` is given a fixed `now` so that the comment it writes is the same every run.
"""
import json, os, re, warnings
from pydna.seqrecord import ProteinSeqRecord, SeqRecord
from pydna.utils import identifier_from_string

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseqrecord", "test", "golden",
                   "pydna-seqrecord.json")

#: The seguid package lists unknown symbols in Python set order, which is not reproducible; see
#: gen_pydnaseq_cases.py, where the same normalisation is applied.
UNKNOWN_SYMBOLS = re.compile(r"Detected symbols '([^']*)' not in the 'alphabet'")


def err(e):
    """One exception, as JSON, with any hash-ordered symbol list sorted."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    found = UNKNOWN_SYMBOLS.fullmatch(msg)
    if found:
        msg = "Detected symbols '%s' not in the 'alphabet'" % " ".join(sorted(found.group(1).split()))
    return {"type": type(e).__name__, "msg": msg}


def guard(fn):
    """Run something, giving its value or the error it raised, with any warnings it emitted."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            out = {"value": fn()}
        except Exception as e:
            out = {"exc": err(e)}
    if caught:
        out["warnings"] = [[type(w.message).__name__, str(w.message)] for w in caught]
    return out


def feat(sf):
    """One feature, in the shape the port records it."""
    loc = sf.location
    return {"str": str(loc) if loc is not None else None,
            "start": int(loc.start) if loc is not None else None,
            "end": int(loc.end) if loc is not None else None,
            "strand": loc.strand if loc is not None else None,
            "type": sf.type,
            "len": len(sf),
            "qualifiers": {k: v for k, v in sorted(sf.qualifiers.items())}}


def snap(r):
    """Enough of a record to pin it down."""
    return {"seq": str(r.seq), "id": r.id, "name": r.name, "description": r.description,
            "dbxrefs": list(r.dbxrefs), "annotations": {k: v for k, v in sorted(r.annotations.items())},
            "features": [feat(f) for f in r.features], "len": len(r),
            "seq_class": type(r.seq).__name__}


#: Sequences to build records from, each for something it tests.
DNA = ["atgtaa", "ATGTAA", "atgaaa", "atttaa", "at g\ntaa", "", "a", "atgtaataa", "CGACGG",
       "atggcctttaaatttgggtgctga", "GGATCC", "CCCCC", "gattaca", "aa"]
#: Positions to mark as features, including the ones that are refused.
SPANS = [(2, 4), (0, 6), (None, None), (3, 4), (5, 2), (0, 2)]
#: Sequences to locate instead of positions.
FINDS = ["gt", "ATG", "zzz", ""]
#: Things to map onto a record with `lcs`.
OTHERS = ["GGATCC", "GATC", "gatc", "CCCCC", ""]

cases = []
for data in DNA:
    case = {"data": data, "snap": guard(lambda: snap(SeqRecord(data)))}
    if "exc" in case["snap"]:
        cases.append(case)
        continue
    r = SeqRecord(data)
    case["aliases"] = guard(lambda: [r.locus, r.accession, r.definition])
    case["isorf"] = {str(t): guard(lambda t=t: r.isorf(table=t)) for t in (1, 2, 11)}
    case["seguid"] = guard(lambda: r.seguid())
    case["gc"] = guard(lambda: r.gc())
    case["bool"] = guard(lambda: bool(r))
    case["str"] = guard(lambda: str(r))
    case["repr"] = guard(lambda: repr(r))
    case["translate"] = guard(lambda: [str(r.translate().seq), type(r.translate()).__name__])
    case["rc"] = guard(lambda: snap(r.rc()))
    case["formats"] = {f: guard(lambda f=f: format(r, f)) for f in ("fasta", "primer", "pydnafasta")}
    case["by_organism"] = {o: {"cai": guard(lambda o=o: r.cai(o)),
                               "rarecodons": guard(lambda o=o: [feat(f) for f in r.rarecodons(o)]),
                               "startcodon": guard(lambda o=o: r.startcodon(o)),
                               "stopcodon": guard(lambda o=o: r.stopcodon(o)),
                               "express": guard(lambda o=o: [[None if isinstance(v, float) and v != v
                                                              else v for v in row]
                                                             for row in r.express(o).lol()])}
                         for o in ("sce", "eco")}
    # Features: each span on a fresh record, so one refusal does not colour the next.
    case["add_feature"] = []
    for x, y in SPANS:
        def add_span(x=x, y=y):
            q = SeqRecord(data)
            q.add_feature(x, y)
            return snap(q)
        case["add_feature"].append({"x": x, "y": y, "result": guard(add_span)})
    case["add_feature_seq"] = []
    for found in FINDS:
        def add_found(found=found):
            q = SeqRecord(data)
            q.add_feature(seq=found)
            return snap(q)
        case["add_feature_seq"].append({"seq": found, "result": guard(add_found)})

    # A record with two features, for the table, the extraction, the ordering and the colours.
    def two_features():
        q = SeqRecord(data)
        q.add_feature(0, 2)
        q.add_feature(2, 4)
        return q
    case["two_features"] = guard(lambda: snap(two_features()))
    case["list_features"] = guard(lambda: [[str(c) for c in row] for row in two_features().list_features().lol()])
    case["extract_feature"] = guard(lambda: [snap(two_features().extract_feature(i)) for i in (0, 1)])
    case["extract_feature_bad"] = guard(lambda: snap(two_features().extract_feature(5)))

    def sorted_desc():
        q = SeqRecord(data)
        q.add_feature(3, 4)
        q.add_feature(2, 4)
        return [feat(f) for f in q.sorted_features()]
    case["sorted_features"] = guard(sorted_desc)

    def coloured():
        q = two_features()
        q.add_colors_to_features_for_ape()
        return [[f.qualifiers.get("ApEinfo_fwdcolor"), f.qualifiers.get("ApEinfo_revcolor")]
                for f in q.features]
    case["colors"] = guard(coloured)

    # Slicing names the piece after what is annotated there.
    case["slices"] = []
    for start, stop in [(0, 1), (0, 5), (1, 3), (0, None), (2, 4)]:
        def cut(start=start, stop=stop):
            q = two_features()
            return snap(q[start:stop])
        case["slices"].append({"start": start, "stop": stop, "result": guard(cut)})

    case["comment"] = guard(lambda: (lambda q: [q.comment(), q.comment("hello"), q.comment(),
                                                q.comment("again")])(SeqRecord(data)))
    case["stamp"] = guard(lambda: (lambda q: [q.stamp(now=lambda: "NOW"), q.annotations.get("comment"),
                                              q.stamp(now=lambda: "NOW")])(SeqRecord(data)))

    def stamp_changed():
        q = SeqRecord(data)
        q.annotations["comment"] = "lsseguid=" + "x" * 27
        return [q.stamp(now=lambda: "NOW"), q.annotations["comment"]]
    case["stamp_changed"] = guard(stamp_changed)

    case["lcs"] = []
    for other in OTHERS:
        for limit in (4, 6, 25):
            case["lcs"].append({"other": other, "limit": limit,
                                "result": guard(lambda o=other, lm=limit: feat(r.lcs(o, limit=lm)))})
    # Against a record, which names the feature after the other record's name.
    case["lcs_record"] = guard(lambda: feat(r.lcs(SeqRecord("GATC", name="theread"), limit=4)))
    case["lcs_type"] = guard(lambda: feat(r.lcs("GATC", limit=4, type="mapped", label="mylabel")))

    case["add"] = guard(lambda: snap(SeqRecord(data) + SeqRecord("tt")))
    case["eq"] = guard(lambda: [SeqRecord(data) == SeqRecord(data), SeqRecord(data) == SeqRecord("tt"),
                                SeqRecord(data) != SeqRecord(data), SeqRecord(data) == data])
    case["order"] = guard(lambda: [SeqRecord(data) < SeqRecord("tt"), SeqRecord(data) > SeqRecord("tt"),
                                   SeqRecord(data).__lt__("tt") is NotImplemented])
    case["copy"] = guard(lambda: snap(SeqRecord(data).copy()))

    def adopt():
        from Bio.SeqRecord import SeqRecord as BioSR
        from Bio.Seq import Seq as BioSeq
        return snap(SeqRecord.from_Bio_SeqRecord(BioSR(BioSeq(data), id="bio", name="bioname",
                                                       description="biodesc")))
    case["from_bio"] = guard(adopt)

    def truncated_locus():
        q = SeqRecord(data)
        q.locus = "x" * 20
        return [q.locus, q.name]
    case["locus_long"] = guard(truncated_locus)

    def set_aliases():
        q = SeqRecord(data)
        q.accession = "ACC1"
        q.definition = "a definition"
        q.locus = "short"
        return snap(q)
    case["set_aliases"] = guard(set_aliases)
    cases.append(case)

proteins = []
for data in ["MAFK", "M", "", "MAFKFGC*"]:
    p = ProteinSeqRecord(data)
    entry = {"data": data, "snap": guard(lambda: snap(p)),
             "format": guard(lambda: format(p, "fasta")),
             "seguid": guard(lambda: p.seguid()),
             "refusals": {}}
    for name in ("reverse_complement", "rc", "isorf", "gc", "cai", "rarecodons", "startcodon",
                 "stopcodon", "express"):
        entry["refusals"][name] = guard(lambda n=name: str(getattr(p, n)()))
    proteins.append(entry)

#: Labels for identifier_from_string, which `__getitem__` names a piece with.
LABELS = ["hello", " a b ", "a-b", "ab-cd", "1abc", "class", "match", "", "x!y", "a_b", "---",
          "  spaced  out  ", "_private", "True", "None", "ünïcode", "a" * 30]
identifiers = {label: guard(lambda l=label: identifier_from_string(l)) for label in LABELS}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"pydna": __import__("pydna").__version__, "cases": cases, "proteins": proteins,
           "identifiers": identifiers}, open(OUT, "w"), indent=0, allow_nan=False)
print(len(cases), "records,", len(proteins), "proteins,", len(identifiers), "labels ->",
      os.path.relpath(OUT))
