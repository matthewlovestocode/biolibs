# @biolibs/core

Python's answers, in TypeScript: the Python-style errors and warnings, the compatibility helpers that let
a port reproduce `int()`, `repr()`, `round()`, `%` and `random`, a zlib inflate *and* deflate, and SHA-1
with base64. No dependencies, no I/O, no global state beyond the warning handler.

Everything with a Python counterpart is **measured** rather than recalled: `reference/golden/
gen_pycompat_cases.py` runs CPython and records the value, or the exception type *and* message, that each
function has to reproduce — 656 cases over 32 functions, plus 227 for `random` and 370 for `zlib`. See
[the package README](../packages/core/README.md) for the API with examples.

## Errors

All errors derive from `BioError`, so one `instanceof` check catches any biolibs input problem. The subclasses mirror Python's built-in exceptions, because Biopython raises these and ports reproduce its messages exactly.

| Class | Python equivalent | Typical cause |
|---|---|---|
| `BioError` | – | Base class; malformed biological input |
| `ValueError` | `ValueError` | Right type, bad value (empty separator, negative length, non-ASCII text, unknown codon table name) |
| `IndexError` | `IndexError` | Sequence index out of range |
| `KeyError` | `KeyError` | Missing lookup key (genetic code id, codon). `message` is the key itself |
| `AttributeError` | `AttributeError` | A name the object does not have, worded as Python words it: `'<class>' object has no attribute '<name>'` |
| `OverflowError` | `OverflowError` | A value the operation cannot hold — `cannot convert float infinity to integer`, NumPy's unsigned conversions |
| `RuntimeError` | `RuntimeError` | A state the format or algorithm forbids; used in 18 packages' parsers |
| `AssertionError` | `AssertionError` | Where Biopython's own `assert` fires, message and all — including the bare `assert`, whose message is empty |
| `NotImplementedError` | `NotImplementedError` | An abstract method, or a path Biopython leaves unwritten (`Method not implemented!`) |
| `ZeroDivisionError` | `ZeroDivisionError` | `division by zero` reached through ported arithmetic |
| `PySystemError` | `SystemError` | Prefixed because `SystemError` is not a JavaScript builtin to collide with; `name` is still `"SystemError"`. Raised by `KDTree`'s `repr`, which fails in Biopython too |
| `UnboundLocalError` | `UnboundLocalError` | A variable Biopython reads before assigning: `cannot access local variable 'x' where it is not associated with a value` |
| `MemoryError` | `MemoryError` | An allocation too large to attempt; `Bio.SeqIO`'s 2bit reader is where this surfaces |
| `ZlibError` | `zlib.error` | Data that is not a valid zlib stream. A `ValueError` here, with zlib's own wording |
| `PyIndexError` | `IndexError` | `random.choice` on an empty sequence, which Python reports as an `IndexError` |

The `name` matters as much as the class: that is what a parity case compares against Python's exception
type, which is why `PySystemError` reports `"SystemError"`. `@biolibs/seq` adds `UndefinedSequenceError`
(a `ValueError`) and `CodonTable.TranslationError`.

```ts
try {
  new Seq("é");
} catch (e) {
  if (e instanceof ValueError) console.error(e.message); // 'ascii' codec can't encode character '\xe9' in position 0: ...
  else throw e;
}
```

Wrong argument *types* are programming errors and throw the built-in `TypeError`, not a `BioError`.

## Warnings

Biopython uses Python's `warnings` module for recoverable problems (for example a partial codon during translation). The equivalent here:

| Function | Purpose |
|---|---|
| `warn(message, category?)` | Emit a warning. Category defaults to `"BiopythonWarning"` |
| `setWarningHandler(handler)` | Replace the global handler (default: `console.warn`). Returns the previous handler |
| `captureWarnings(fn)` | Run `fn`; returns `{ result?, error?, warnings }` and prints nothing |

```ts
const { result, warnings } = captureWarnings(() => new Seq("ATGA").translate());
warnings[0].message; // "Partial codon, len(sequence) not a multiple of three. ..."
```

`captureWarnings` is also how the golden tests compare warnings against Biopython's.

## Python-compatible helpers (`py/`)

Small functions that let ports reproduce Biopython's behaviour and messages exactly. Numbers: `pyInt`
(Python's `int(str)`, which takes underscores, surrounding whitespace and any Unicode decimal digit, and
refuses anything past 2^53 rather than rounding), `pyFloat` and `pyFloatRepr` (`float(str)` and the
shortest round-trip `repr`), `pySum`, `pyChr`, `pyFormatFixed` (`format(x, ".Nf")`). Strings: `pyStrip`,
`pyLstrip`, `pyRstrip` and `pySplit` (Python's wider whitespace, and the no-argument `split` that
collapses runs), `pyFirstWord`, the `pyIsAscii`/`pyIsLower`/`pyIsPrintable` predicates. Bytes and text:
`pyBytesRepr`, `pyDecodeUtf8` and `pyDecodeAscii` (strict, with Python's own `UnicodeDecodeError` wording,
raised as the `ValueError` it is a subclass of; `utf8Fault` and `utf8ErrorMessage` expose the parts).
And: `pyIter` (iterating a dict gives its keys), `pyRepr` and `pyStr` (`repr`/`str` of `None`, bools, lists, dicts, and objects with `repr()`), `pyTypeName`/`pyClassRepr` (type names for error messages; `registerPythonClasses(module, names)` teaches it `<class 'Bio.X.Y'>`), `pyEquals` (`==` for plain data), `pyTruthy` and `pyContains` (`in`), `PyTuple` (an array that prints as a Python tuple), `pyPercent` (Python's `format % args`) and `PyFloat` (a float that holds a whole number), `pyFormatG` (`%g` / `format(x, "g")`), `pyTextwrapFill` (`textwrap.fill`: tab expansion, breaking after hyphens, `width`, indents and `breakLongWords`), `pyRound` (`round(x)`) and `pyRoundTo` (`round(x, ndigits)`).

`pyRoundTo` is worth a note, because `Math.round(x * 10 ** n) / 10 ** n` gets ties wrong twice over: Python rounds a tie to the nearest *even* digit, and it decides what a tie is from the double's exact decimal value rather than from the scaled-up one. `round(0.0625, 3)` is 0.062 for the first reason and `round(0.4165, 3)` is 0.416 for the second — as a double, 0.4165 sits just below the midpoint.

## Python's `random` (`py/random.ts`)

`PyRandom` is MT19937 and the `Random` methods Biopython draws from, ported from `Modules/_randommodule.c`
and `random.py`: `seed` (an integer, split into 32-bit words and fed to `init_by_array`, or `null` for
system randomness as Python's own default does), `random`, `getrandbits` (and `getrandbitsBig` for more
than the 53 bits a double holds), `randbelow` with its rejection loop, `choice`, `shuffle`, `randrange`,
`randint` and `gauss`, which keeps the second value of each pair for the next call exactly as Python does.
`pyRandom` is the one shared instance that Python's module-level `random.choice` and friends use, so
seeding it is what makes `Bio.Nexus`'s `Tree.randomize` and `Nexus.bootstrap` reproducible. The stream
matches Python's bit for bit; only `gauss` can differ in the last bit, because its `sin` and `cos` come
from the engine rather than the platform's C library.

## DEFLATE (`zlib/`)

`inflate(bytes)` is Python's `zlib.decompress` and `inflateRaw(bytes)` its `wbits=-15` form; `deflate(bytes,
level)` is `zlib.compress` and `deflateRaw` its raw form, with `adler32` for the checksum a zlib stream ends
with and `ZlibError` (Python's `zlib.error`, whose name is `error`) for data that is not valid. Written out here
rather than taken from the host, so that the readers and writers that need it work the same under Node, a
browser and a bundler; `Bio.Align.bigbed` is the first of them.

The compressor is **zlib 1.2.12's own algorithm, not merely a valid one**: the hash chains and their blind spot
at position zero (zlib's `NIL` is `0`, so it never matches the first byte of the input), the lazy matching of
`deflate_slow`, the configuration table that gives each level its search limits, where the blocks end, how the
three block types are costed and how ties between them are broken, and the Huffman trees down to the order the
code-length tree is sent in. The point of all that is that the bytes come out the same, which is what lets a
written file be compared with Biopython's: 370 golden cases hold Python's own `zlib.compress` output at every
level from 0 to 9, over payloads chosen to reach the awkward paths — longer than the 32 KiB window, deeply
overlapping, incompressible, a Huffman tree deep enough to need capping, matches at the very edge of the window,
and lengths either side of the symbol-buffer boundary.

One thing is not reproduced: how zlib splits the stored blocks of a **level 0** stream longer than 64 KiB. It
fits each block to whatever output buffer the caller gave it, so the split points are a property of Python's
buffering rather than of the format, and those streams are only checked for being valid.

## Hashes (`hash/`)

`sha1(bytes)` and `base64(bytes)`, written out here rather than taken from `node:crypto` so the same code
runs in a browser bundle. They are what `@biolibs/seguid` and `@biolibs/seqtools`' checksums rest on, and
both are recorded against `hashlib` and `base64.b64encode`.

## `assert(cond, message)`

Throws `BioError(message)` unless `cond` is truthy; narrows types for TypeScript.
