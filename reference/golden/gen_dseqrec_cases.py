"""Golden cases for pydna.dseqrecord's molecule layer -> packages/dseqrecord/test/golden/dseqrecord.json

`Dseqrecord` is where pydna's two halves meet: `Dseq` knows what is opposite every base, and `SeqRecord`
knows what the molecule is called and what is annotated on it. What makes it more than the sum of the two is
that every operation has to carry the features along -- closing a molecule shortens it by its overhangs,
moving the origin renumbers everything, and a feature that no longer fits has to go. That bookkeeping is
what these cases are mostly about, so nearly every one of them is run on a record with features on it.

Not covered here, and not marked: cutting with restriction enzymes, `synced`, and the output formats come
in the next slices; `history`, `source`, `validate_history`, `normalize_history` and `is_amplicon` need
pydna's OpenCloning models; `copy_gb_to_clipboard`, `copy_fasta_to_clipboard` and `map_trace_files` need a
clipboard or files on disk.

`upper` and `lower` are worth watching in the output: they lose circularity, because `Dseq.upper` builds a
fresh sequence that knows nothing of pydna's flag and pydna does not put it back.
"""
import json, os, warnings
from Bio.Seq import Seq as BioSeq
from Bio.SeqRecord import SeqRecord as BioSeqRecord
from pydna.dseq import Dseq
from pydna.dseqrecord import Dseqrecord

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseqrecord", "test", "golden",
                   "dseqrecord.json")


def err(e):
    """One exception, as JSON."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    return {"type": type(e).__name__, "msg": msg}


def guard(fn):
    """Run something, giving its value or the error it raised, with any warnings."""
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
            # `is not None`, not truthiness: a zero-length location is falsy in Python, and what is
            # wanted here is whether there is a location at all.
            "parts": None if loc is None else [[int(p.start), int(p.end), p.strand] for p in loc.parts],
            "type": sf.type, "len": len(sf),
            "qualifiers": {k: v for k, v in sorted(sf.qualifiers.items())}}


def snap(r):
    """Enough of a record to pin it down."""
    return {"code": r.seq._data.decode("ascii"), "watson": r.seq.watson, "crick": r.seq.crick,
            "circular": bool(r.circular), "len": len(r), "ovhg": r.seq.ovhg,
            "id": r.id, "name": r.name, "description": r.description,
            "annotations": {k: v for k, v in sorted(r.annotations.items())},
            "features": [feat(f) for f in r.features], "n": r.n, "repr": repr(r)}


def with_features(data, circular=False):
    """A record with three features on it: inside, at the start, and spanning the origin if circular."""
    r = Dseqrecord(data, circular=circular)
    if len(r) >= 4:
        r.add_feature(1, 3, type_="misc", label=["inner"])
        r.add_feature(0, 2, type_="gene", label=["head"])
    if circular and len(r) >= 4:
        r.add_feature(len(r) - 1, 1, type_="misc", label=["wraps"])
    return r


#: The molecules to build records from, by the dscode they are written in.
MOLECULES = ["atgtaa", "ATGTAA", "aAa", "gaattc", "PPgaattcQQ", "QQgaattcPP", "atggcctttaaatttgggtgctga",
             "atgtacgatcgtatgctggttatattttag", "a", "", "aaaa", "GGATCC", "PEXI"]

cases = []
for data in MOLECULES:
    for circular in (False, True):
        case = {"data": data, "circular": circular}
        case["snap"] = guard(lambda: snap(with_features(data, circular)))
        if "exc" in case["snap"]:
            cases.append(case)
            continue
        r = with_features(data, circular)
        case["m"] = guard(lambda: r.m())
        case["seguid"] = guard(lambda: r.seguid())
        case["str"] = guard(lambda: str(r))
        case["repr"] = guard(lambda: repr(r))
        case["looped"] = guard(lambda: snap(r.looped()))
        case["tolinear"] = guard(lambda: snap(r.tolinear()))
        case["rc"] = guard(lambda: snap(r.rc()))
        case["upper"] = guard(lambda: snap(r.upper()))
        case["lower"] = guard(lambda: snap(r.lower()))
        case["terminal_transferase"] = {
            n: guard(lambda n=n: snap(r.terminal_transferase(n))) for n in ("a", "gg", "")}
        # `format` is pydna's own override: a deep copy, a `dscode` modifier that writes the encoding
        # itself instead of the watson strand, a stripped format name, `topology` set for GenBank, and
        # the trailing newline taken off. `figure` draws both strands with one feature highlighted --
        # and puts the highlight pair in emptily when there are no features at all.
        case["formats"] = {f: guard(lambda f=f: r.format(f))
                           for f in ("gb", "genbank", " gb ", "fasta", "fasta-2line",
                                     "fasta-2line dscode", "gb dscode", "embl", "nope")}
        case["format_leaks_topology"] = guard(
            lambda: (r.format("gb"), r.annotations.get("topology", "unset"))[1])
        case["figure"] = {name: guard(lambda a=a: r.figure(*a)) for name, a in
                          (("default", ()), ("first", (0,)), ("plain", (0, "<", ">")),
                           ("second", (1,)), ("negative", (-1,)))}
        case["shifted"] = {str(sh): guard(lambda sh=sh: snap(r.shifted(sh)))
                           for sh in (0, 1, 2, -1, 5, 100)}
        case["orfs"] = {str(ms): guard(lambda ms=ms: [snap(o) for o in r.orfs(minsize=ms)])
                        for ms in (1, 3, 300)}
        case["orfs_to_features"] = {str(ms): guard(lambda ms=ms: [feat(f) for f in
                                                                  r.orfs_to_features(minsize=ms)])
                                    for ms in (1, 300)}
        case["find"] = {o: guard(lambda o=o: r.find(Dseqrecord(o)))
                        for o in ("atg", "taa", "zzz", "aatgt", "")}
        case["contains"] = {o: guard(lambda o=o: bool(o in r))
                            for o in ("atg", "ATG", "M", "MYD", "RML", "zzz", "")}
        case["find_aa"] = {o: guard(lambda o=o: (lambda s: [s.start, s.stop] if s else None)(r.find_aa(o)))
                           for o in ("M", "MYD", "RML", "zzz")}
        case["add"] = guard(lambda: snap(Dseqrecord(data) + Dseqrecord("tt")))
        # Adding two records that disagree about what they are called: Biopython keeps an identifier
        # only where both agree, so this is where pydna's own defaults come back in.
        case["add_named"] = guard(lambda: snap(Dseqrecord(data, id="one", name="first", description="d1")
                                               + Dseqrecord("tt", id="two", name="second", description="d2")))
        case["add_same_name"] = guard(lambda: snap(Dseqrecord(data, id="one", name="first", description="d1")
                                                   + Dseqrecord("tt", id="one", name="first", description="d1")))
        case["add_text_named"] = guard(lambda: snap(Dseqrecord(data, id="one", name="first") + "tt"))
        case["mul"] = {str(k): guard(lambda k=k: snap(r * k)) for k in (0, 1, 2, 3, -1)}
        case["mul_bad"] = guard(lambda: snap(r * 1.5))
        case["join"] = guard(lambda: snap(Dseqrecord("a").join([Dseqrecord("A"), Dseqrecord("B"),
                                                                Dseqrecord("C")])))
        # Fresh records on both sides: comparing the `r` that the calls above have been through would
        # measure whatever state they left on it rather than what __eq__ does.
        case["eq"] = guard(lambda: [with_features(data, circular) == with_features(data, circular),
                                    with_features(data, circular) == Dseqrecord("tt"),
                                    with_features(data, circular) != with_features(data, circular)])
        case["slices"] = []
        for start, stop in [(0, 2), (1, 3), (0, None), (2, 2), (3, 1), (0, 0), (None, None), (1, 100)]:
            case["slices"].append({"start": start, "stop": stop,
                                   "result": guard(lambda a=start, b=stop: snap(r[a:b]))})
        case["add_feature_wrap"] = []
        for x, y in [(4, 2), (1, 0), (0, 2), (2, 4), (5, 1)]:
            def wrap(x=x, y=y):
                q = Dseqrecord(data, circular=circular)
                q.add_feature(x, y)
                return [feat(f) for f in q.features]
            case["add_feature_wrap"].append({"x": x, "y": y, "result": guard(wrap)})
        cases.append(case)

#: Each of the four shapes the constructor accepts, plus one it refuses.
builds = []
for label, make in [
    ("str", lambda: Dseqrecord("gaattc")),
    ("str circular", lambda: Dseqrecord("gaattc", circular=True)),
    ("dseq", lambda: Dseqrecord(Dseq("gaattc"))),
    ("dseq circular true", lambda: Dseqrecord(Dseq("gaattc"), circular=True)),
    ("dseq circular false", lambda: Dseqrecord(Dseq("gaattc", circular=True), circular=False)),
    ("bioseq", lambda: Dseqrecord(BioSeq("gaattc"))),
    ("bioseq circular", lambda: Dseqrecord(BioSeq("gaattc"), circular=True)),
    ("biorecord", lambda: Dseqrecord(BioSeqRecord(BioSeq("gaattc"), id="bio", name="bn",
                                                  description="bd"))),
    ("dseqrecord", lambda: Dseqrecord(Dseqrecord("gaattc", circular=True))),
    ("refused int", lambda: Dseqrecord(7)),
    ("refused none", lambda: Dseqrecord(None)),
    ("from_string", lambda: Dseqrecord.from_string("gaattc")),
    ("from_string circular", lambda: Dseqrecord.from_string("gaattc", circular=True)),
    ("from_SeqRecord", lambda: Dseqrecord.from_SeqRecord(BioSeqRecord(BioSeq("gaattc"), id="x"))),
    ("from_SeqRecord topology", lambda: Dseqrecord.from_SeqRecord(
        BioSeqRecord(BioSeq("gaattc"), id="x", annotations={"topology": "circular",
                                                            "molecule_type": "DNA"}))),
]:
    builds.append({"label": label, "result": guard(lambda m=make: snap(m()))})

# Joining two records: Biopython keeps an annotation only where both agree on it, takes the union of the
# cross-references, and pydna then turns whatever is left into text. The three together decide what the
# joined record writes into a GenBank file, which is what a cloning plan carries.
joins = []
for label, left_ann, left_db, right_ann, right_db in [
    ("same", {"keywords": [""], "note": "x"}, ["A:1"], {"keywords": [""], "note": "x"}, ["A:1"]),
    ("different keywords", {"keywords": ["a"], "note": "x"}, [], {"keywords": ["b"], "note": "x"}, []),
    ("keywords list vs text", {"keywords": [""]}, [], {"keywords": "['']"}, []),
    ("one has none", {"keywords": [""]}, ["A:1"], {}, ["B:2"]),
    ("different dbxrefs", {}, ["A:1", "B:2"], {}, ["B:2", "C:3"]),
]:
    def join(left_ann=left_ann, left_db=left_db, right_ann=right_ann, right_db=right_db):
        """Join two records that disagree, and say what the result carries."""
        a = Dseqrecord("aaaa", id="one", name="first", annotations=dict(left_ann), dbxrefs=list(left_db))
        b = Dseqrecord("tttt", id="one", name="first", annotations=dict(right_ann), dbxrefs=list(right_db))
        joined = a + b
        return {"annotations": {k: str(v) for k, v in sorted(joined.annotations.items())},
                "dbxrefs": list(joined.dbxrefs),
                "genbank": [line for line in joined.format("genbank").split("\n")
                            if line.startswith("KEYWORDS") or line.startswith("DBLINK")]}
    joins.append({"label": label, "result": guard(join)})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"pydna": __import__("pydna").__version__, "cases": cases, "builds": builds, "joins": joins},
          open(OUT, "w"), indent=0, allow_nan=False)
print(len(cases), "records,", len(builds), "builds ->", os.path.relpath(OUT))
