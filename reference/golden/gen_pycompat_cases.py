"""Golden cases for @biolibs/core's Python compatibility layer -> packages/core/test/golden/pycompat.json

`py/` exists so that a port can reproduce Python's own answers and Python's own error messages, and until
now most of it had no direct test: it was exercised only through whichever package happened to call it.
That is a coverage figure that can vanish without anyone noticing, and it means CPython was never actually
asked what these functions should return.

So this records CPython's answers for each one. The expectations are not anybody's recollection of what
Python does -- they are what this interpreter did.

Covered here: `int()`, `float()`, `chr()`, `repr()` of a float, `round()`, `%` formatting, `repr()` and
`str()` of the values a port passes around, `==`, truthiness, `in`, the string predicates and strippers,
`textwrap.fill`, UTF-8 and ASCII decoding, and `hashlib.sha1` with `base64`.
"""
import base64 as b64mod
import hashlib
import json
import os
import textwrap

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "core", "test", "golden",
                   "pycompat.json")


def err(e):
    """One exception, as JSON. A KeyError's message is the key itself, as the port reproduces."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    return {"type": type(e).__name__, "msg": msg}


def guard(fn):
    """Run something, giving either its value or the error it raised."""
    try:
        return {"value": fn()}
    except Exception as e:
        return {"exc": err(e)}


def enc(v):
    """One Python value, tagged so the port can rebuild the same thing.

    JSON has one number type and one array type, so without a tag a tuple arrives as a list and 1.0 as 1.
    The port draws exactly those distinctions -- `PyTuple`, `PyFloat` -- because JavaScript cannot either,
    so an untagged case would be comparing the wrong values.
    """
    if v is None:
        return {"t": "none"}
    if isinstance(v, bool):
        return {"t": "bool", "v": v}
    if isinstance(v, int):
        return {"t": "int", "v": v}
    if isinstance(v, float):
        return {"t": "float", "v": repr(v)}
    if isinstance(v, str):
        return {"t": "str", "v": v}
    if isinstance(v, tuple):
        return {"t": "tuple", "v": [enc(x) for x in v]}
    if isinstance(v, list):
        return {"t": "list", "v": [enc(x) for x in v]}
    if isinstance(v, dict):
        return {"t": "dict", "v": [[enc(k), enc(x)] for k, x in v.items()]}
    raise TypeError(f"no encoding for {type(v).__name__}")


#: Text for `int()`: whitespace, signs, underscores, and everything it refuses.
INT_TEXTS = ["0", "7", "-7", "+7", " 12 ", "\t13\n", "1_000", "1__0", "_1", "1_", "", " ", "x", "1.5",
             "0x10", "007", "-0", "99999999999999999999", "٣", "½", "1 2", "- 7", "--7"]
#: Text for `float()`.
FLOAT_TEXTS = ["0", "1.5", "-1.5", "+1.5", " 2.5 ", "1e3", "1E-3", "1_000.5", ".5", "5.", "inf", "-inf",
               "Infinity", "nan", "NaN", "", " ", "x", "1.2.3", "1_", "_1", "0x1p3"]
#: Numbers for `chr()`, including what is out of range.
CHR_NUMBERS = [0, 65, 97, 127, 128, 255, 0x10FFFF, 0x110000, -1, 55296]
#: Values for `repr()` of a float, where Python's shortest-round-trip rules show.
FLOAT_REPRS = [0.0, -0.0, 1.0, 1.5, 0.1, 1e16, 1e17, 1e-5, 1e-4, 123456789012345678.0, 2.675,
               float("inf"), float("-inf"), float("nan"), 1 / 3, 5e-324, 1.7976931348623157e308]
#: `round(x)` and `round(x, n)`.
ROUND_CASES = [(0.5, None), (1.5, None), (2.5, None), (-0.5, None), (-1.5, None), (2.675, 2),
               (0.0625, 3), (0.1875, 3), (0.4165, 3), (0.0005, 3), (123.4565, 3), (1e-9, 3), (0.0, 3),
               (-0.0625, 3), (0.9995, 3)]
#: `fmt % args` -- the conversions, flags, widths and precisions the port claims to support.
PERCENT_CASES = [
    ("%d", [7]), ("%5d", [7]), ("%-5d|", [7]), ("%+d", [7]), ("% d", [7]), ("%05d", [7]),
    ("%i", [7]), ("%u", [7]), ("%d", [-7]),
    ("%f", [1.5]), ("%.2f", [1.5]), ("%10.2f", [1.5]), ("%-10.2f|", [1.5]), ("%F", [1.5]),
    ("%e", [1234.5]), ("%E", [1234.5]), ("%.1e", [1234.5]),
    ("%g", [1234.5]), ("%G", [1234.5]), ("%.3g", [1234.5]), ("%g", [0.0001]), ("%g", [1e-5]),
    ("%g", [100000.0]), ("%g", [1000000.0]), ("%#g", [1.0]),
    ("%s", ["ab"]), ("%10s", ["ab"]), ("%-10s|", ["ab"]), ("%.1s", ["ab"]),
    ("%r", ["ab"]), ("%a", ["ab"]), ("%c", [65]), ("%c", ["A"]), ("%%", []),
    ("%s and %s", ["a", "b"]), ("%d%%", [50]), ("no args", []),
    # the refusals
    ("%d", []), ("%d", [1, 2]), ("%d", ["x"]), ("%z", [1]), ("%", []),
]
#: Values whose `repr()` and `str()` a port has to reproduce.
REPR_VALUES = [None, True, False, 0, 1, -1, 1.5, "", "a", "a'b", 'a"b', "a\\b", "a\nb", "\t",
               "é", "\x00", [], [1, 2], ["a"], [None, True], {}, {"a": 1}, {"a": [1, 2]},
               (), (1,), (1, 2)]
#: Pairs for `==`, chosen where a loose comparison would get it wrong.
EQUALS_PAIRS = [(1, 1), (1, 1.0), (1, True), (0, False), (0, None), ("a", "a"), ("a", "b"),
                ([1, 2], [1, 2]), ([1, 2], [1, 3]), ([1], [1.0]), ({}, {}), ({"a": 1}, {"a": 1}),
                ({"a": 1}, {"a": 2}), (None, None), (None, False), ([], ()), ((1, 2), (1, 2))]
#: Values for truthiness.
TRUTHY_VALUES = [None, True, False, 0, 1, -1, 0.0, 0.5, "", "a", "0", [], [0], {}, {"a": 1}, (), (0,)]
#: `needle in haystack`.
CONTAINS_PAIRS = [("a", "abc"), ("d", "abc"), ("", "abc"), ("ab", "abc"), ("ba", "abc"),
                  (1, [1, 2]), (3, [1, 2]), ("a", ["a", "b"]), ("a", {"a": 1}), ("b", {"a": 1}),
                  (1, (1, 2))]
#: Strings for the predicates and strippers. Python's whitespace is wider than JavaScript's.
STR_VALUES = ["", " ", "  a  ", "\t\na\r\v\f ", "a", "A", "aA", "abc", "ABC", "a b", " a b ",
              "a b", " ", "é", "ÉÉ", "123", "a1", "", "a\x00b", "a\tb", "line one two",
              "  leading", "trailing  ", " a "]
#: `textwrap.fill` -- the options the port claims, including the hyphen and long-word rules.
WRAP_CASES = [
    ("the quick brown fox jumps over the lazy dog", {}),
    ("the quick brown fox jumps over the lazy dog", {"width": 20}),
    ("the quick brown fox jumps over the lazy dog", {"width": 10}),
    ("the quick brown fox", {"width": 20, "initial_indent": ">> "}),
    ("the quick brown fox", {"width": 20, "subsequent_indent": "   "}),
    ("the quick brown fox", {"width": 20, "initial_indent": "A ", "subsequent_indent": "B "}),
    ("supercalifragilisticexpialidocious", {"width": 10}),
    ("supercalifragilisticexpialidocious", {"width": 10, "break_long_words": False}),
    ("well-known hyphen-separated words here", {"width": 12}),
    ("a\tb\tc", {"width": 20}),
    ("", {"width": 20}),
    ("   ", {"width": 20}),
    ("one\n\ntwo", {"width": 20}),
    ("short", {"width": 1}),
    ("a b c d e f g h", {"width": 3}),
]
#: Byte strings for `repr(bytes)`, where the quote choice and the escapes both have rules.
BYTES_REPRS = [b"", b"A", b"ABIF", b"it's", b'say "hi"', b"""both ' and " """, b"a\\b",
               b"\x00\x01\xff", b"line\nbreak", b"tab\there", b"\x7f", b"\x1f", bytes(range(32, 48))]
#: Byte strings for `bytes.decode()`, where Python names either one byte or a range of them, and picks
#: between three reasons. A truncated sequence, an overlong one, a surrogate and a value above U+10FFFF
#: are all rejected at different bytes.
DECODE_BYTES = [b"", b"A", b"ABC", b"GATTACA", b"\xc3\xa9", b"\xe2\x82\xac", b"\xf0\x9f\x98\x80",
                b"A\xff", b"\xff", b"\x80", b"\xc0\xaf", b"\xc1\xbf", b"\xc2", b"\xc2A",
                b"\xe0\x80\x80", b"\xe0\xa0", b"\xe2\x82", b"\xe2\x28\xa1", b"\xed\xa0\x80",
                b"\xf0\x80\x80\x80", b"\xf4\x90\x80\x80", b"\xf5\x80\x80\x80",
                b"ok\xe2\x82\xacthen", b"\x7f", b"\x00", b"caf\xc3\xa9 \xff"]
#: Byte strings for SHA-1 and base64, which `seguid` and the checksums rest on.
HASH_INPUTS = ["", "a", "abc", "GATTACA", "a" * 1000, "\x00\x01\xff", "é", "the quick brown fox"]

cases = {
    "pyInt": [{"text": t, "result": guard(lambda t=t: int(t))} for t in INT_TEXTS],
    "pyFloat": [{"text": t, "result": guard(lambda t=t: repr(float(t)))} for t in FLOAT_TEXTS],
    "pyChr": [{"n": n, "result": guard(lambda n=n: chr(n))} for n in CHR_NUMBERS],
    # NaN does not survive JSON, so a float result is recorded as its repr and compared as text.
    "pyFloatRepr": [{"repr_of": repr(x), "result": repr(x)} for x in FLOAT_REPRS],
    "pyRound": [{"x": repr(x), "ndigits": n,
                 "result": guard(lambda x=x, n=n: repr(round(x) if n is None else round(x, n)))}
                for x, n in ROUND_CASES],
    # The single-value form, `fmt % value` with no tuple, which Python complains about differently: it
    # names no argument index. Biopython relies on both forms, so both are recorded.
    "pyPercentSingle": [{"fmt": f, "arg": enc(a[0]),
                         "result": guard(lambda f=f, a=a: f % a[0])}
                        for f, a in PERCENT_CASES if len(a) == 1],
    # `%#g` keeps the trailing zeros `%g` drops; recorded separately so the flag is pinned on its own.
    "pyPercentHashG": [{"fmt": f, "args": [enc(x) for x in a],
                        "result": guard(lambda f=f, a=a: f % tuple(a))}
                       for f, a in [("%#g", [1.0]), ("%#g", [0.5]), ("%#.3g", [1.0]),
                                    ("%#e", [1.0]), ("%#f", [1.0]), ("%#d", [7])]],
    "pyFormatG": [{"x": repr(x), "precision": p,
                   "result": guard(lambda x=x, p=p: format(x, f".{p}g"))}
                  for x in [1234.5, 0.0001, 1e-5, 100000.0, 1000000.0, 1.0, 0.0, -1.5]
                  for p in (6, 3, 1)],
    "pyFormatFixed": [{"x": repr(x), "digits": d,
                       "result": guard(lambda x=x, d=d: format(x, f".{d}f"))}
                      for x in [1.5, 2.675, 0.0625, -1.5, 0.0, 1e16]
                      for d in (0, 2, 5)],
    "pyPercent": [{"fmt": f, "args": [enc(x) for x in a],
                   "result": guard(lambda f=f, a=a: f % tuple(a))}
                  for f, a in PERCENT_CASES],
    "pyRepr": [{"value": enc(v), "result": repr(v)} for v in REPR_VALUES],
    "pyStr": [{"value": enc(v), "result": str(v)} for v in REPR_VALUES],
    "pyTypeName": [{"value": enc(v), "result": type(v).__name__} for v in REPR_VALUES],
    "pyClassRepr": [{"value": enc(v), "result": str(type(v))} for v in REPR_VALUES],
    "pyEquals": [{"a": enc(a), "b": enc(b), "result": a == b} for a, b in EQUALS_PAIRS],
    "pyTruthy": [{"value": enc(v), "result": bool(v)} for v in TRUTHY_VALUES],
    "pyContains": [{"needle": enc(n), "haystack": enc(h), "result": n in h}
                   for n, h in CONTAINS_PAIRS],
    "pyStrip": [{"s": s, "result": s.strip()} for s in STR_VALUES],
    "pyLstrip": [{"s": s, "result": s.lstrip()} for s in STR_VALUES],
    "pyRstrip": [{"s": s, "result": s.rstrip()} for s in STR_VALUES],
    "pySplit": [{"s": s, "result": s.split()} for s in STR_VALUES],
    "pyIsAscii": [{"s": s, "result": s.isascii()} for s in STR_VALUES],
    "pyIsLower": [{"s": s, "result": s.islower()} for s in STR_VALUES],
    "pyIsPrintable": [{"s": s, "result": s.isprintable()} for s in STR_VALUES],
    # `first word` is what a port needs for record ids: everything up to the first whitespace run.
    # Guarded, because `s.split()[0]` raises IndexError on text with no words at all.
    "pyFirstWord": [{"s": s, "result": guard(lambda s=s: s.split()[0])} for s in STR_VALUES],
    "pySum": [{"values": v, "result": repr(sum(v)), "is_float": isinstance(sum(v), float)}
              for v in ([], [1], [1, 2, 3], [0.1, 0.2], [1e16, 1.0, -1e16], [-1, 1])],
    "pyTextwrapFill": [{"text": t, "options": o, "result": textwrap.fill(t, **o)}
                       for t, o in WRAP_CASES],
    # latin-1 both ways, so every byte value survives the JSON as a string and comes back unchanged.
    "pyBytesRepr": [{"bytes": b.decode("latin-1"), "result": repr(b)} for b in BYTES_REPRS],
    # Both decoders, recorded with Python's own wording: `UnicodeDecodeError` is a `ValueError` there,
    # which is what the port raises, so the type recorded here is the one it has to match.
    "pyDecodeUtf8": [{"bytes": b.decode("latin-1"), "result": guard(lambda b=b: b.decode("utf-8"))}
                     for b in DECODE_BYTES],
    "pyDecodeAscii": [{"bytes": b.decode("latin-1"), "result": guard(lambda b=b: b.decode("ascii"))}
                      for b in DECODE_BYTES],
    # latin-1 so that every byte value can be written as a JSON string and read back unchanged.
    "sha1": [{"bytes": s, "hex": hashlib.sha1(s.encode("latin-1")).hexdigest(),
              "base64": b64mod.b64encode(hashlib.sha1(s.encode("latin-1")).digest()).decode("ascii")}
             for s in HASH_INPUTS],
    "base64": [{"bytes": s, "result": b64mod.b64encode(s.encode("latin-1")).decode("ascii")}
               for s in HASH_INPUTS],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"python": __import__("sys").version.split()[0], "cases": cases}, open(OUT, "w"),
          indent=0, allow_nan=False)
print(sum(len(v) for v in cases.values()), "cases over", len(cases), "functions ->",
      os.path.relpath(OUT))
