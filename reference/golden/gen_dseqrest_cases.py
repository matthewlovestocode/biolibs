"""Golden cases for what was left of pydna's Dseq -> packages/dseq/test/golden/dseq-rest.json

`seguid`, `join`, `find` and `in`, the parts record's own behaviour, and whether two strands anneal. With
these the class is covered apart from `__hash__`, which Python sets to None because `__eq__` is defined
without it, so a Dseq cannot be hashed at all -- recorded here as the refusal it is.
"""
import json, os
from pydna.alphabet import anneal_strands
from pydna.dseq import Dseq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseq", "test", "golden", "dseq-rest.json")


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


def snap(d):
    """Enough of a molecule to pin it down."""
    return {"data": d._data.decode("ascii"), "watson": d.watson, "crick": d.crick, "len": len(d),
            "ovhg": d.ovhg, "str": str(d), "circular": bool(d.circular)}


#: Molecules to take the checksum of, and to search.
MOLECULES = ["GAATTC", "gaattc", "PPGAATTCQQ", "QQGAATTCPP", "PPPPGAATTC", "GAATTCQQQQ",
             "GAATTCGGGGAAAATTTT", "ATGCGCAT", "AAAATTTT", "PEXI", "QFZJ", "G", "", "UUGGAAUU",
             "RYMKSWHBVDN"]
#: What to look for in them.
NEEDLES = ["GAATTC", "ATT", "", "GGG", "PP", "QQ", "gaattc", "TTTTTTT"]
#: Pieces to join, by the dscode they are written in.
JOINABLE = [["GG", ["AA", "TT", "CC"]], ["GG", ["AA"]], ["GG", []], ["PPGG", ["AAQQ", "TTQQ"]],
            ["", ["AA", "TT"]], ["GG", ["PEXI", "QFZJ"]], ["QQGG", ["AAPP"]]]

cases = []
for data in MOLECULES:
    for circular in (False, True):
        case = {"data": data, "circular": circular, "needles": NEEDLES}
        try:
            d = Dseq(data, circular=circular)
        except Exception as e:
            case["exc"] = err(e)
            cases.append(case)
            continue
        case["snap"] = snap(d)
        case["seguid"] = guard(lambda: d.seguid())
        case["find"] = [guard(lambda n=n: d.find(n)) for n in NEEDLES]
        case["contains"] = [guard(lambda n=n: bool(n in d)) for n in NEEDLES]
        case["hash"] = guard(lambda: hash(d))
        parts = d.get_parts()
        case["parts"] = {"repr": repr(parts), "list": list(parts),
                         "items": [guard(lambda i=i: parts[i]) for i in (0, 2, 6, -1, 7)],
                         "eq_self": parts == d.get_parts(),
                         "eq_other": parts == Dseq("GAATTC").get_parts()}
        cases.append(case)

joins = []
for separator, fragments in JOINABLE:
    def run(separator=separator, fragments=fragments):
        result = Dseq(separator).join([Dseq(f) for f in fragments])
        return snap(result) if isinstance(result, Dseq) else {"raw": str(result)}
    joins.append({"separator": separator, "fragments": fragments, "result": guard(run)})

anneals = []
for a, b in [("GATC", "GATC"), ("GATC", "AAAA"), ("PEXI", "QFZJ"), ("GATC", "GAT"), ("", ""),
             ("GATC", ""), ("UUUU", "AAAA"), ("RYMK", "RYMK")]:
    anneals.append({"a": a, "b": b, "result": guard(lambda a=a, b=b: anneal_strands(a, b))})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"cases": cases, "joins": joins, "anneals": anneals}, open(OUT, "w"), indent=0)
print(len(cases), "cases,", len(joins), "joins,", len(anneals), "anneals ->", os.path.relpath(OUT))
