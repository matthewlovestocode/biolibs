"""Dump the public API of the pydna modules we are porting.

pydna is the second upstream library this repo ports, after Biopython. Its checklist is kept apart
(`reference/status-pydna.json` -> `docs/parity-pydna/`) so that Biopython's own progress stays a number
of its own.

`Dseq` subclasses pydna's `Seq`, which subclasses Biopython's, so only what each class defines itself is
listed: the inherited `Bio.Seq` API is already measured under `docs/parity/Bio.Seq.md`.
"""
import inspect, json
import pydna
from pydna import alphabet, common_sub_strings, dseq, seq as pydna_seq

#: Dunder members a port has to provide even though their names are private.
DUNDERS = ("__init__", "__len__", "__getitem__", "__setitem__", "__iter__", "__next__", "__str__",
           "__repr__", "__eq__", "__hash__", "__add__", "__radd__", "__mul__", "__rmul__",
           "__contains__", "__bytes__", "__new__")


def sig(value):
    """@returns The signature of a callable as text, or `"property"` for anything else."""
    target = value.fget if isinstance(value, property) else value
    if isinstance(value, (classmethod, staticmethod)):
        target = value.__func__
    try:
        return str(inspect.signature(target))
    except (TypeError, ValueError):
        return "property"


def members(cls):
    """@returns What this class defines itself, by name, leaving what it inherits to its base's checklist."""
    out = {}
    # A dataclass keeps its fields in the annotations rather than in the class body.
    for name in sorted(getattr(cls, "__annotations__", {})):
        if not name.startswith("_"):
            out[name] = "property"
    for name, value in sorted(vars(cls).items()):
        if name.startswith("_") and name not in DUNDERS:
            continue
        out[name] = sig(value)
    return out


def funcs(mod):
    """@returns The module's own public functions, by name."""
    out = {}
    for name, value in sorted(inspect.getmembers(mod, inspect.isfunction)):
        if name.startswith("_") or value.__module__ != mod.__name__:
            continue
        out[name] = str(inspect.signature(value))
    return out


inv = {
    "version": pydna.__version__,
    "pydna.alphabet": {
        "functions": funcs(alphabet),
        "classes": {"DseqParts": members(alphabet.DseqParts)},
        # The encoding itself: one letter per base pair, which everything else is built on.
        "codes": {group: sorted("".join(pair) for pair in pairs) for group, pairs in alphabet.codes.items()},
    },
    "pydna.dseq": {
        "functions": funcs(dseq),
        "classes": {"Dseq": members(dseq.Dseq), "CircularBytes": members(dseq.CircularBytes)},
    },
    # The matcher every homology-based assembly starts from. The module's own `Match` is a type alias
    # rather than a class, so there is nothing to list for it beyond the two functions.
    "pydna.common_sub_strings": {
        "functions": funcs(common_sub_strings),
    },
    # The sequence `Dseqrecord` and the assembly stack are built on. Only what these two classes define
    # themselves is listed; the Biopython `Seq` behaviour underneath is measured under docs/parity/.
    "pydna.seq": {
        "functions": funcs(pydna_seq),
        "classes": {"Seq": members(pydna_seq.Seq), "ProteinSeq": members(pydna_seq.ProteinSeq)},
    },
}

print(json.dumps(inv, indent=1))
