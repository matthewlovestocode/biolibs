"""Shared JSON codec for golden tests.

Values are encoded so that Python and TypeScript can build identical objects
from the same JSON, and compare results structurally:

  None/bool/int/float/str -> native JSON
  bytes/bytearray         -> {"$":"bytes","v":<latin-1 text>}
  Seq / MutableSeq        -> {"$":"Seq"|"MutableSeq","v":<latin-1 text>}            (defined)
                             {"$":"Seq","undef":<length>}                           (undefined)
                             {"$":"Seq","length":n,"segs":[[start,<text>],...]}     (partial)
  list/tuple              -> {"$":"list","v":[...]}
  slice                   -> {"$":"slice","v":[start,stop,step]}
  dict                    -> {"$":"dict","v":[[k,v],...]}
  CodonTable              -> {"$":"table","id":<ncbi id>,"kind":<registry>}
"""
import datetime
from Bio.Seq import Seq, MutableSeq, _UndefinedSequenceData, _PartiallyDefinedSequenceData, SequenceDataAbstractBaseClass
from Bio.Data import CodonTable

REGISTRIES = {
    "unambiguous_dna": CodonTable.unambiguous_dna_by_id,
    "unambiguous_rna": CodonTable.unambiguous_rna_by_id,
    "generic": CodonTable.generic_by_id,
    "ambiguous_dna": CodonTable.ambiguous_dna_by_id,
    "ambiguous_rna": CodonTable.ambiguous_rna_by_id,
    "ambiguous_generic": CodonTable.ambiguous_generic_by_id,
}

def l1(b):
    return bytes(b).decode("latin-1")

def enc(x):
    if isinstance(x, float) and (x != x or x in (float("inf"), float("-inf"))):
        return {"$": "float", "v": "nan" if x != x else ("inf" if x > 0 else "-inf")}   # JSON has no NaN/Infinity
    if isinstance(x, datetime.datetime):
        return {"$": "datetime", "v": x.isoformat()}
    if x is None or isinstance(x, (bool, int, float, str)):
        return x
    if isinstance(x, (bytes, bytearray)):
        return {"$": "bytes", "v": l1(x)}
    if isinstance(x, SequenceDataAbstractBaseClass):
        return enc(Seq(x))          # providers are reported as the Seq that wraps them
    if isinstance(x, (Seq, MutableSeq)):
        cls = type(x).__name__
        d = x._data
        if isinstance(d, _UndefinedSequenceData):
            return {"$": cls, "undef": len(d)}
        if isinstance(d, _PartiallyDefinedSequenceData):
            return {"$": cls, "length": len(d), "segs": [[k, l1(v)] for k, v in d._data.items()]}
        return {"$": cls, "v": l1(d)}
    if isinstance(x, (list, tuple)):
        return {"$": "list", "v": [enc(i) for i in x]}
    if isinstance(x, slice):
        return {"$": "slice", "v": [x.start, x.stop, x.step]}
    if isinstance(x, dict):
        return {"$": "dict", "v": [[enc(k), enc(v)] for k, v in x.items()]}
    if isinstance(x, CodonTable.CodonTable):
        for kind, reg in REGISTRIES.items():
            for i, t in reg.items():
                if t is x:
                    return {"$": "table", "id": i, "kind": kind}
    raise TypeError(f"cannot encode {type(x)}")

def b1(s):
    return s.encode("latin-1")

def dec(x):
    if not isinstance(x, dict):
        return x
    t = x["$"]
    if t == "bytes":
        return b1(x["v"])
    if t in ("Seq", "MutableSeq"):
        cls = Seq if t == "Seq" else MutableSeq
        if "undef" in x:
            return Seq(None, length=x["undef"])
        if "segs" in x:
            return Seq({k: b1(v) for k, v in x["segs"]}, length=x["length"])
        return cls(b1(x["v"]))
    if t == "list":
        return [dec(i) for i in x["v"]]
    if t == "tuple":
        return tuple(dec(i) for i in x["v"])
    if t == "slice":
        return slice(*x["v"])
    if t == "dict":
        return {dec(k): dec(v) for k, v in x["v"]}
    if t == "table":
        return REGISTRIES[x["kind"]][x["id"]]
    raise ValueError(t)

def S(s):  return {"$": "Seq", "v": s}
def M(s):  return {"$": "MutableSeq", "v": s}
def U(n):  return {"$": "Seq", "undef": n}
def P(n, segs): return {"$": "Seq", "length": n, "segs": [[k, v] for k, v in segs]}
def B(s):  return {"$": "bytes", "v": s}
def SL(a=None, b=None, c=None): return {"$": "slice", "v": [a, b, c]}
def LST(*xs): return {"$": "list", "v": list(xs)}

def TUP(*xs): return {"$": "tuple", "v": list(xs)}
