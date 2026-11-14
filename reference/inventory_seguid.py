"""Dump the public API of the seguid package.

SEGUID v2 is the checksum pydna uses to identify a construct, so it is ported for `@biolibs/seguid` and
measured against the reference the same way: its own inventory, status file and checklist.
"""
import inspect, json
import seguid
import seguid._asserts as asserts
import seguid._chksum as chksum
import seguid._manip as manip
import seguid._tables as tables


def funcs(mod):
    """@returns The module's own public functions, by name and signature."""
    out = {}
    for name, value in sorted(inspect.getmembers(mod, inspect.isfunction)):
        if name.startswith("_") or value.__module__ != mod.__name__:
            continue
        out[name] = str(inspect.signature(value))
    return out


inv = {
    "version": getattr(seguid, "__version__", "0.2.1"),
    "seguid": {"functions": {n: str(inspect.signature(getattr(seguid, n)))
                             for n in ("seguid", "lsseguid", "csseguid", "ldseguid", "cdseguid")}},
    "seguid._manip": {"functions": funcs(manip)},
    "seguid._tables": {"functions": funcs(tables), "alphabets": sorted(tables.alphabets)},
    "seguid._asserts": {"functions": funcs(asserts)},
    "seguid._chksum": {"functions": funcs(chksum)},
}

print(json.dumps(inv, indent=1))
