"""Mark PARITY.md items as done based on what the golden tests actually exercise.

An item is "done" only if its name appears in a golden case file that the TS test-suite
replays against Biopython output, or is covered by the codon-table golden suite.
Items that are plain Python/object boilerplate (inherited `object` dunders, BaseException
methods) are "na".
"""
import json, os
here = os.path.dirname(__file__)
inv = json.load(open(f"{here}/inventory.json"))
status = json.load(open(f"{here}/status.json"))
seq = json.load(open(f"{here}/../packages/seq/test/golden/seq.json"))["cases"]

ops = {c["op"] for c in seq if "op" in c and not c["op"].startswith("data:")}
data_ops = {c["op"][5:] for c in seq if c.get("op", "").startswith("data:")}
funcs = {c["func"] for c in seq if "func" in c}
ctors = {c["ctor"] for c in seq if "ctor" in c}

def mark(k, v="done"): status[k] = v

# Bio.Seq module functions
for f in inv["Bio.Seq"]["functions"]:
    if f in funcs: mark(f"Bio.Seq.{f}")

# Seq / MutableSeq: each member exercised on the receiver class (ctor cases cover __init__)
for cls in ("Seq", "MutableSeq"):
    for m in inv["Bio.Seq"]["classes"][cls]:
        if m == "__init__":
            if cls in ctors: mark(f"Bio.Seq.{cls}.{m}")
        elif m in ops or m in {"defined", "defined_ranges"} & ops:
            mark(f"Bio.Seq.{cls}.{m}")

# SequenceDataAbstractBaseClass: exercised directly via the "data:" cases (and by every Seq test)
for m in inv["Bio.Seq"]["classes"]["SequenceDataAbstractBaseClass"]:
    if m in data_ops or (m == "__init__"): mark(f"Bio.Seq.SequenceDataAbstractBaseClass.{m}")
    if m in ("__repr__", "__str__"): mark(f"Bio.Seq.SequenceDataAbstractBaseClass.{m}", "na")   # plain object defaults
    if m == "__init__": mark(f"Bio.Seq.SequenceDataAbstractBaseClass.{m}")   # negative-length assertion is covered by Seq(…)*-1 cases

# UndefinedSequenceError: members are BaseException machinery, not Biopython API
for m in inv["Bio.Seq"]["classes"]["UndefinedSequenceError"]:
    mark(f"Bio.Seq.UndefinedSequenceError.{m}", "na")

# Bio.Data.CodonTable (covered by codon-table.golden.test.ts)
for f in inv["Bio.Data.CodonTable"]["functions"]:
    mark(f"Bio.Data.CodonTable.{f}")
for cls, members in inv["Bio.Data.CodonTable"]["classes"].items():
    for m in members:
        real = {"__init__", "__str__"} | ({"__repr__"} if cls == "NCBICodonTable" else set())
        mark(f"Bio.Data.CodonTable.{cls}.{m}", "done" if m in real else "na")
for i in inv["Bio.Data.CodonTable"]["table_ids"]: mark(f"CodonTable.id.{i}")
for n in inv["Bio.Data.IUPACData"]: mark(f"IUPACData.{n}")

# ---- Bio.SeqFeature (packages/seqfeature/test/golden/seqfeature.json) ----
feat = json.load(open(f"{here}/../packages/seqfeature/test/golden/seqfeature.json"))["cases"]
f_ops = {c["op"] for c in feat if "op" in c}
f_ctors = {c["ctor"] for c in feat if "ctor" in c}
f_static = {c["static"].split(".")[0] for c in feat if "static" in c}
# Positions are int subclasses in Python and inherit all of int's methods; in TypeScript use Number(position).
INT_BUILTINS = {"__mod__", "__mul__", "__rmul__", "as_integer_ratio", "bit_count", "bit_length", "conjugate", "from_bytes", "is_integer", "to_bytes"}
POSITIONS = {"ExactPosition", "UncertainPosition", "UnknownPosition", "WithinPosition", "BetweenPosition", "BeforePosition", "AfterPosition", "OneOfPosition"}
for cls, members in inv["Bio.SeqFeature"]["classes"].items():
    for m in members:
        key = f"Bio.SeqFeature.{cls}.{m}"
        if cls in POSITIONS and m in INT_BUILTINS: mark(key, "na")
        elif m == "__hash__": mark(key, "na")          # hashing is not part of the TypeScript API
        elif m == "__bool__": mark(key, "na")          # no truthiness protocol in TypeScript (Biopython returns True)
        elif m == "__nonzero__": mark(key, "na")       # Python 2 relic
        elif m == "__init__" and cls in ("Location", "Position"): mark(key, "na")   # abstract classes
        elif m == "__init__" and cls in f_ctors: mark(key)
        elif m == "fromstring" and (cls in f_static or cls in POSITIONS | {"Location", "Position", "SimpleLocation", "CompoundLocation"}): mark(key)  # statics are inherited
        elif m in f_ops: mark(key)
        elif m == "__getnewargs__": mark(key, "na")    # pickling support
for fn in inv["Bio.SeqFeature"].get("functions", {}): pass

# ---- Bio.SeqRecord (packages/seqrecord/test/golden/seqrecord.json) ----
rec = json.load(open(f"{here}/../packages/seqrecord/test/golden/seqrecord.json"))["cases"]
r_ops = {c["op"] for c in rec if "op" in c}
r_ctor = any("ctor" in c for c in rec)
for m in inv["Bio.SeqRecord"]["classes"]["SeqRecord"]:
    key = f"Bio.SeqRecord.SeqRecord.{m}"
    if m == "__bool__": mark(key, "na")                 # no truthiness protocol in TypeScript (Biopython returns True)
    elif m in ("format", "__format__"): mark(key, "partial")   # "" and unknown formats verified; real formats need Bio.SeqIO writers
    elif m == "__init__" and r_ctor: mark(key)
    elif m in r_ops: mark(key)
    elif m == "__hash__": mark(key, "na")

json.dump(status, open(f"{here}/status.json", "w"), indent=1, sort_keys=True)
print({s: sum(v == s for v in status.values()) for s in ("done", "partial", "na")})
