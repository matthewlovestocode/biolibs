"""Golden cases for the seguid package -> packages/seguid/test/golden/seguid.json

The five checksums are what pydna uses to identify a construct, so they have to agree digit for digit.
These cases cover each variant over linear and circular, single- and double-stranded sequences, every
named alphabet, the rotation a circular checksum is taken from, and the refusals: an empty sequence, a
symbol outside the alphabet, strands of unequal length or that do not pair, and a single-stranded
alphabet handed to a double-stranded checksum.
"""
import json, os, random, re
from seguid import cdseguid, csseguid, ldseguid, lsseguid, seguid
from seguid._manip import rotate, rotate_to_min
from seguid._config import _min_rotation
from seguid._tables import tablefactory

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seguid", "test", "golden", "seguid.json")

FUNCS = {"seguid": seguid, "lsseguid": lsseguid, "csseguid": csseguid}
DUPLEX = {"ldseguid": ldseguid, "cdseguid": cdseguid}


def err(e):
    """One exception, as JSON. An assertion carries no message of its own worth comparing.

    The complaint about unknown symbols lists them in the order a Python set iterates them, which depends
    on the hash seed and so is not the same from one run to the next. The symbols are sorted here, and the
    port sorts them the same way before comparing, so that the case records something reproducible.
    """
    if isinstance(e, AssertionError):
        return {"type": "AssertionError", "msg": str(e)}
    msg = str(e)
    m = re.fullmatch(r"Detected symbols '(.*)' not in the 'alphabet'", msg)
    if m:
        msg = "Detected symbols '%s' not in the 'alphabet'" % " ".join(sorted(m.group(1).split(" ")))
    return {"type": type(e).__name__, "msg": msg}


def guard(fn):
    """Run something, giving either its value or the error it raised."""
    try:
        value = fn()
        return {"value": list(value) if isinstance(value, tuple) else value}
    except Exception as e:
        return {"exc": err(e)}


rnd = random.Random(7)
cases = []

#: Single-stranded cases: the sequence, the alphabet, and the form asked for.
SINGLE = [("GATTACA", "{DNA}"), ("gattaca", "{DNA}"), ("A", "{DNA}"), ("", "{DNA}"),
          ("GAATTC", "{DNA}"), ("AAAA", "{DNA}"), ("ACGTACGT", "{DNA}"),
          ("GAUUACA", "{RNA}"), ("RYMKSWHBVDN", "{DNA-extended}"), ("MKVLATWY", "{protein}"),
          ("MKVLATWYBJXZ", "{protein-extended}"), ("GATTACA", "{RNA}"), ("GATTACAX", "{DNA}"),
          ("TTTTTTTT", "{DNA}"), ("ACGTACGTACGTACGT", "{DNA}")]
for seq, alphabet in SINGLE:
    for form in ("long", "short", "both"):
        for name in FUNCS:
            cases.append({"kind": name, "args": [seq, alphabet, form]})

#: Double-stranded cases: the two strands, as they would be written one over the other.
DOUBLE = [("GATTACA", "TGTAATC", "{DNA}"),
          ("GAATTC", "GAATTC", "{DNA}"),
          ("AAAA", "TTTT", "{DNA}"),
          ("ACGTACGT", "ACGTACGT", "{DNA}"),
          ("GATTACA", "TGTAATCA", "{DNA}"),           # different lengths
          ("GATTACA", "TGTAATG", "{DNA}"),            # not complementary
          ("GATTACA", "TGTAATC", "{protein}"),        # a single-stranded alphabet
          ("-ATTACA", "TGTAAT-", "{DNA}"),            # gaps, as a sticky end is written
          ("--TTACA", "TGTAA--", "{DNA}"),
          ("GAUUACA", "UGUAAUC", "{RNA}"),
          ("RYMKSWHBVDN", "NHBVDWSMKRY", "{RNA-extended}"),
          ("RYMKSWHBVDN", "NHBVDWSMKRY", "{DNA-extended}"),
          ("", "TGTAATC", "{DNA}"),
          ("GATTACA", "", "{DNA}"),
          ("GGGGGGGG", "CCCCCCCC", "{DNA}")]
for watson, crick, alphabet in DOUBLE:
    for form in ("long", "short", "both"):
        for name in DUPLEX:
            cases.append({"kind": name, "args": [watson, crick, alphabet, form]})

# the alphabet with the gap and separator pydna's own call adds
for watson, crick in (("GATTACA", "TGTAATC"), ("-ATTACA", "TGTAAT-")):
    cases.append({"kind": "ldseguid", "args": [watson, crick, "{DNA-extended},AU", "long"]})
    cases.append({"kind": "cdseguid", "args": [watson, crick, "{DNA-extended}", "long"]})

# a few longer random molecules, so the rotation has something to chew on
for _ in range(6):
    n = rnd.randint(8, 40)
    watson = "".join(rnd.choice("GATC") for _ in range(n))
    crick = watson.translate(str.maketrans("GATC", "CTAG"))[::-1]
    cases.append({"kind": "lsseguid", "args": [watson, "{DNA}", "long"]})
    cases.append({"kind": "csseguid", "args": [watson, "{DNA}", "long"]})
    cases.append({"kind": "ldseguid", "args": [watson, crick, "{DNA}", "long"]})
    cases.append({"kind": "cdseguid", "args": [watson, crick, "{DNA}", "long"]})

# the rotation itself, and the tables
ROTATIONS = ["", "A", "AA", "GATTACA", "TACAGAT", "ACAGATT", "AAAA", "ABABAB", "BABABA", "CBA",
             "ACGTACGTACGT", "TTTTTTTTA", "ATTTTTTTT", "ZZZAAA", "aAaA"]
TABLES = ["{DNA}", "{RNA}", "{DNA-extended}", "{RNA-extended}", "{protein}", "{protein-extended}", "{DNA},--,;;",
          "{DNA-extended},AU", "GC,AT", "A,C,G,T", "GCA"]

out = []
for case in cases:
    got = dict(case)
    fn = {**FUNCS, **DUPLEX}[case["kind"]]
    got.update(guard(lambda: fn(*case["args"])))
    out.append(got)

rotations = []
for seq in ROTATIONS:
    rotations.append({"seq": seq,
                      "min_rotation": guard(lambda s=seq: _min_rotation(s)),
                      "rotate_to_min": guard(lambda s=seq: rotate_to_min(s)),
                      "rotations": [guard(lambda s=seq, a=a: rotate(s, a)) for a in (0, 1, 3, -1, 7)]})

tables = [{"spec": spec, "table": guard(lambda s=spec: [[k, v] for k, v in tablefactory(s).items()])}
          for spec in TABLES]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"checksums": out, "rotations": rotations, "tables": tables}, open(OUT, "w"), indent=0)
print(len(out), "checksum cases,", len(rotations), "rotation cases,", len(tables), "tables;",
      sum("exc" in c for c in out), "raise ->", os.path.relpath(OUT))
