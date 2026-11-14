"""Golden cases for pydna's end-modifying enzymes -> packages/dseq/test/golden/dseq-ends.json

`fill_in`, `T4`, `mung`, the four nibbles, `terminal_transferase` and `user` each change what a molecule's
ends look like, which is what a protocol does between a digest and a ligation. Every case runs all of them
over one molecule and records the whole result, so a method that quietly leaves an end single stranded is
caught by the dscode string as well as by the strands.
"""
import json, os
from pydna.dseq import Dseq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseq", "test", "golden", "dseq-ends.json")


def snap(d):
    """Enough of a molecule to pin it down."""
    return {"data": d._data.decode("ascii"), "watson": d.watson, "crick": d.crick, "len": len(d),
            "ovhg": d.ovhg, "right_ovhg": d.right_ovhg, "str": str(d), "circular": bool(d.circular),
            "five": list(d.five_prime_end()), "three": list(d.three_prime_end()), "blunt": d.isblunt()}


def err(e):
    """One exception, as JSON."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    return {"type": type(e).__name__, "msg": msg}


def guard(fn):
    """Run something, giving either the molecule it made or the error it raised."""
    try:
        return {"snap": snap(fn())}
    except Exception as e:
        return {"exc": err(e)}


#: Every operation each molecule is put through, by name and arguments.
OPS = [["fill_in", []], ["fill_in", ["G"]], ["fill_in", ["GA"]], ["fill_in", ["gatc"]], ["fill_in", [""]],
       ["klenow", []],
       ["T4", []], ["T4", ["G"]], ["T4", ["GA"]], ["T4", ["GATC"]], ["t4", []],
       ["mung", []], ["nibble_to_blunt", []],
       ["nibble_five_prime_left", [1]], ["nibble_five_prime_left", [2]], ["nibble_five_prime_left", [0]],
       ["nibble_five_prime_right", [1]], ["nibble_five_prime_right", [3]],
       ["nibble_three_prime_left", [1]], ["nibble_three_prime_left", [2]],
       ["nibble_three_prime_right", [1]], ["nibble_three_prime_right", [3]],
       ["exo1_front", [2]], ["exo1_end", [2]],
       ["terminal_transferase", []], ["terminal_transferase", ["aa"]], ["terminal_transferase", ["g"]],
       ["user", []]]

#: The molecules, written in dscode: blunt, each kind of overhang, RNA, lower case, single strands.
MOLECULES = [
    "GAATTC",
    "gaattc",
    "PPPPGAATTCQQQQ",          # 5' overhang at each end
    "QQQQGAATTCPPPP",          # 3' overhang at each end
    "PPPPGAATTC",              # 5' on the left only
    "GAATTCQQQQ",              # 5' on the right only
    "QQQQGAATTC",              # 3' on the left only
    "GAATTCPPPP",              # 3' on the right only
    "XXGAATTCFF",              # a T on the left, an A on the right
    "IIGAATTCZZ",
    "UUGGAAUU",                # RNA
    "OUGCAAUGC",
    "GAATTCUUU",               # uracils for USER to find
    "UUUGAATTC",
    "OOOGAATTC",
    "PEXI",                    # upper strand only
    "QFZJ",                    # lower strand only
    "G",
    "",
]

out = []
for data in MOLECULES:
    for circular in (False, True):
        case = {"data": data, "circular": circular, "ops": [list(op) for op in OPS]}
        try:
            d = Dseq(data, circular=circular)
        except Exception as e:
            case["exc"] = err(e)
            out.append(case)
            continue
        case["snap"] = snap(d)
        case["ops_out"] = [guard(lambda n=name, a=args: getattr(d, n)(*a)) for name, args in OPS]
        out.append(case)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), indent=0)
print(len(out), "end cases;", sum("exc" in c for c in out), "refused at construction ->", os.path.relpath(OUT))
