"""Golden cases for melting a pydna Dseq -> packages/dseq/test/golden/dseq-melt.json

`melt` sheds the single strands that would come away at a given temperature and then breaks what is left
at every double-stranded stretch short enough to let go. Each case records the sites both searches find,
what shedding leaves, how the melting cuts are widened, and every piece the molecule falls into, over a
range of lengths -- including the length at which the whole molecule comes apart.
"""
import json, os
from pydna.dseq import Dseq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseq", "test", "golden", "dseq-melt.json")


def snap(d):
    """Enough of a molecule to pin it down."""
    return {"data": d._data.decode("ascii"), "watson": d.watson, "crick": d.crick, "len": len(d),
            "ovhg": d.ovhg, "right_ovhg": d.right_ovhg, "str": str(d), "circular": bool(d.circular)}


def err(e):
    """One exception, as JSON."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    return {"type": type(e).__name__, "msg": msg}


def guard(fn):
    """Run something, giving either its value or the error it raised."""
    try:
        return {"value": fn()}
    except Exception as e:
        return {"exc": err(e)}


def enc_cut(cut):
    """A cut site as JSON."""
    if cut is None:
        return None
    (watson, ovhg), enzyme = cut
    return {"watson": watson, "ovhg": ovhg, "enzyme": None if enzyme is None else str(enzyme)}


#: Molecules with stretches of different lengths between their single-stranded runs.
MOLECULES = [
    "GAATTC",
    "PPPPGAATTCQQQQ",
    "QQQQGAATTCPPPP",
    "GATCQQQQGATC",          # two duplexes either side of a lower-strand run
    "GATCPPPPGATC",
    "PPPPGATCPPPP",
    "QQQQGATCQQQQ",
    "GAEEGaGJJJg",           # the shape pydna's own comment calls out
    "AGEEGaGJJJg",
    "GATCQQQQGATCPPPPGATC",
    "PEXIGATCQFZJ",
    "GGGGGGGGGGGGGGGG",
    "PPGGGGGGGGGGGGGGQQ",
    "UUGGAAUU",
    "G",
    "",
]
#: The lengths to melt at: none, one base, enough to take a short duplex, and enough to take everything.
LENGTHS = [0, 1, 2, 4, 6, 8, 16, 40]

out = []
for data in MOLECULES:
    for circular in (False, True):
        case = {"data": data, "circular": circular, "lengths": LENGTHS}
        try:
            d = Dseq(data, circular=circular)
        except Exception as e:
            case["exc"] = err(e)
            out.append(case)
            continue
        case["snap"] = snap(d)
        rounds = []
        case["rounds"] = rounds
        for length in LENGTHS:
            got = {"length": length}
            got["ss_sites"] = guard(lambda: [[list(p) for p in side] for side in d.get_ss_meltsites(length)])
            got["ds_sites"] = guard(lambda: [enc_cut(c) for c in d.get_ds_meltsites(length)])
            got["shed"] = guard(lambda: {"rest": snap(d.melt_ss_dna(length)[0]),
                                         "strands": [snap(s) for s in d.melt_ss_dna(length)[1]]})
            # the pairs as melt itself widens them
            def pairs(length=length):
                rest, _ = d.melt_ss_dna(length)
                sites = rest.get_ds_meltsites(length)
                widened = d.shift_melt_cutsite_pairs(d.get_cutsite_pairs(sites))
                return [[enc_cut(a), enc_cut(b)] for a, b in widened]
            got["pairs"] = guard(pairs)
            got["melted"] = guard(lambda: [snap(p) for p in d.melt(length)])
            rounds.append(got)
        out.append(case)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), indent=0)
print(len(out), "melt cases over", len(LENGTHS), "lengths;",
      sum("exc" in c for c in out), "refused at construction ->", os.path.relpath(OUT))
