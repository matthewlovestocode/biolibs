"""Golden cases for pydna.dseq.Dseq -> packages/dseq/test/golden/dseq.json

Every case builds a molecule and records the whole of it: the dscode string pydna holds internally, both
strands, the overhangs at each end, the blunt reading, the figure it prints, the parts it splits into, its
ends, its weight -- and then the same after each operation. Comparing the internal string as well as the
strands means a port cannot get the right answer from a different representation.
"""
import json, os
from pydna.dseq import Dseq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseq", "test", "golden", "dseq.json")


def snap(d):
    """Everything about one molecule, as JSON."""
    return {
        "data": d._data.decode("ascii"),
        "watson": d.watson,
        "crick": d.crick,
        "len": len(d),
        "ovhg": d.ovhg,
        "right_ovhg": d.right_ovhg,
        "str": str(d),
        "figure": repr(d),
        "parts": list(d.get_parts()),
        "five": list(d.five_prime_end()),
        "three": list(d.three_prime_end()),
        "blunt": d.isblunt(),
        # `mw` has no weight for an ambiguity code, a loop or a mismatch, so it raises for molecules the
        # rest of the snapshot handles perfectly well.
        "mw": mw(d),
        "circular": bool(d.circular),
    }


def mw(d):
    """The molecular weight, or the error it raised."""
    try:
        return d.mw()
    except Exception as e:
        return err(e)


def err(e):
    """One exception, as JSON. A KeyError's message is its key, not the key with Python's quotes on."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    return {"type": type(e).__name__, "msg": msg}


def build(case):
    """The molecule a case describes."""
    kind = case["kind"]
    if kind == "construct":
        watson, crick, ovhg, circular = case["args"]
        return Dseq(watson, crick, ovhg, circular)
    if kind == "quick":
        return Dseq.quick(case["args"][0].encode("ascii"), circular=case["args"][1])
    if kind == "full_and_overhangs":
        return Dseq.from_full_sequence_and_overhangs(*case["args"])
    if kind == "representation":
        return Dseq.from_representation(case["args"][0])
    raise KeyError(kind)


def run_op(d, name, args):
    """One operation on a molecule, giving the molecule it returns (or a value)."""
    if name == "rc":
        return d.reverse_complement()
    if name == "looped":
        return d.looped()
    if name == "shifted":
        return d.shifted(args[0])
    if name == "cast_to_ds":
        return d.cast_to_ds()
    if name == "cast_to_ds_left":
        return d.cast_to_ds_left()
    if name == "cast_to_ds_right":
        return d.cast_to_ds_right()
    if name == "slice":
        return d[args[0]:args[1]]
    if name == "add":
        return d + build(args[0])
    if name == "add_str":
        return d + args[0]
    if name == "multiply":
        return d * args[0]
    if name == "equals":
        return bool(d == build(args[0]))
    raise KeyError(name)


cases = []


def add(kind, args, ops=()):
    cases.append({"kind": kind, "args": list(args), "ops": [list(op) for op in ops]})


COMMON_OPS = [["rc", []], ["cast_to_ds", []], ["cast_to_ds_left", []], ["cast_to_ds_right", []],
              ["looped", []], ["multiply", [2]], ["multiply", [1]], ["multiply", [0]],
              ["slice", [0, 3]], ["slice", [1, None]], ["slice", [None, -1]]]

# molecules written straight in dscode: ds letters, 5' overhangs (P E X I), 3' overhangs (Q F Z J)
for data in ("", "G", "GATC", "GAATTC", "gaattc", "GaAtTc", "AATTCGATC", "PGATC", "GATCQ", "QGATCP",
             "PPPGAATTCQQQ", "QQGAATTCPP", "XXXGATC", "GATCFFF", "PEXI", "QFZJ", "UUGGAAUU", "OUGC",
             "RYMKSWHBVDN", "GATCGATCGATCGATCGATCGATCGATCGATCGATCGATC", "GATC GATC",
             "PPPPPPPPPPPPGAATTCQQQQQQQQQQQQ", "GATC0GATC", "GATC!GATC"):
    add("construct", [data, None, None, False], COMMON_OPS)
# the same shapes, circular where that is allowed
for data in ("GATC", "GAATTCGGGG", "GATCGATCGATCGATCGATCGATCGATCGATCGATCGATC"):
    add("construct", [data, None, None, True],
        [["rc", []], ["shifted", [0]], ["shifted", [1]], ["shifted", [3]], ["shifted", [-2]],
         ["shifted", [41]], ["looped", []], ["multiply", [2]], ["add_str", ["GG"]]])
# two strands, annealed with an explicit overhang and with an inferred one
for watson, crick, ovhg in (("GATC", "GATC", 0), ("AAAGATC", "GATCTTT", 0), ("GAATTC", "GAATTC", -4),
                            ("GAATTC", "GAATTC", 4), ("AAA", "TTT", 0), ("AAA", "TTT", 1), ("AAA", "TTT", -1),
                            ("GGGGAATTCCCC", "GGGGAATTCCCC", 0), ("ATGCATGCATGC", "GCATGCATGCAT", -1)):
    add("construct", [watson, crick, ovhg, False], COMMON_OPS)
for watson, crick in (("GGGGAATTCCCC", "GGGGAATTCCCC"), ("ATGCATGCATGCAA", "TTGCATGCATGCAT"),
                      ("AAAAAAAAAAAA", "TTTTTTTTTTTT"), ("ACGT", "ACGT"), ("GATCGATCGATC", "GATCGATCGATC")):
    add("construct", [watson, crick, None, False], COMMON_OPS)
# the other constructors
for data, circular in (("GATC", False), ("PGATCQ", False), ("GAATTC", True)):
    add("quick", [data, circular], [["rc", []], ["multiply", [2]]])
for full, crick_ovhg, watson_ovhg in (("GAATTC", 0, 0), ("GAATTC", 2, 0), ("GAATTC", 0, 2), ("GAATTC", -2, 0),
                                      ("GAATTC", 0, -2), ("GAATTC", 2, 2), ("GAATTC", -2, -2),
                                      ("AAAGAATTCTTT", 3, -3)):
    add("full_and_overhangs", [full, crick_ovhg, watson_ovhg], COMMON_OPS)
for text in ("GAATTC\nCTTAAG", "  ATT\nCTTAAG", "GAATTC\n  TAA", "GGATCC\nCCTAGG"):
    add("representation", [text], COMMON_OPS)
# ligation, including the pairs that refuse
PIECES = [["construct", ["GATC", None, None, False], []],
          ["construct", ["PGATC", None, None, False], []],
          ["construct", ["GATCQ", None, None, False], []],
          ["construct", ["QGATC", None, None, False], []],
          ["construct", ["GATCP", None, None, False], []],
          ["construct", ["AATTCGGG", None, None, False], []],
          ["construct", ["", None, None, False], []]]
for left in PIECES:
    spec = {"kind": left[0], "args": left[1], "ops": left[2]}
    add(left[0], left[1], [["add", [{"kind": right[0], "args": right[1]}]] for right in PIECES]
        + [["add_str", ["GGG"]], ["add_str", [""]], ["equals", [spec]]])
# the refusals
add("construct", ["GATC", None, 1, False])
add("construct", ["AAA", "GGG", None, False])
add("construct", ["ATATATAT", "ATATATAT", None, False])
add("construct", ["", "A", None, False])
add("construct", ["GATC", "GATC", 99, False])
add("construct", ["GATCQQPPGATC", None, None, False])
add("construct", ["PPGATCQQ", None, None, True])

out = []
for case in cases:
    got = dict(case)
    try:
        d = build(case)
        got["snap"] = snap(d)
        results = []
        got["ops_out"] = results
        for name, args in case["ops"]:
            try:
                value = run_op(d, name, args)
                if isinstance(value, bool):
                    results.append({"value": value})
                elif isinstance(value, str):
                    # `Dseq("") + "GGG"` hands the string straight back, because pydna returns a copy of
                    # the other operand without looking at what it is.
                    results.append({"raw": value})
                else:
                    results.append({"snap": snap(value)})
            except Exception as e:
                results.append({"exc": err(e)})
    except Exception as e:
        got["exc"] = err(e)
    out.append(got)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), indent=0)
print(len(out), "Dseq cases;", sum("exc" in c for c in out), "raise ->", os.path.relpath(OUT))
