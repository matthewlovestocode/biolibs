# @biolibs/core

Shared types, Python-style errors and warnings used by the other packages. No dependencies.

## Errors

All errors derive from `BioError`, so one `instanceof` check catches any biolibs input problem. The subclasses mirror Python's built-in exceptions, because Biopython raises these and ports reproduce its messages exactly.

| Class | Python equivalent | Typical cause |
|---|---|---|
| `BioError` | – | Base class; malformed biological input |
| `ValueError` | `ValueError` | Right type, bad value (empty separator, negative length, non-ASCII text, unknown codon table name) |
| `IndexError` | `IndexError` | Sequence index out of range |
| `KeyError` | `KeyError` | Missing lookup key (genetic code id, codon). `message` is the key itself |

`@biolibs/seq` adds `UndefinedSequenceError` (a `ValueError`) and `CodonTable.TranslationError`.

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

Small functions that let ports reproduce Biopython's behaviour and messages exactly: `pyInt` (Python's `int(str)`), `pyRepr` and `pyStr` (`repr`/`str` of `None`, bools, lists, dicts, and objects with `repr()`), `pyTypeName`/`pyClassRepr` (type names for error messages; `registerPythonClasses(module, names)` teaches it `<class 'Bio.X.Y'>`), `pyEquals` (`==` for plain data), `pyTruthy` and `pyContains` (`in`), `PyTuple` (an array that prints as a Python tuple), `pyPercent` (Python's `format % args`) and `PyFloat` (a float that holds a whole number), `pyFormatG` (`%g` / `format(x, "g")`), `pyTextwrapFill` (`textwrap.fill`: tab expansion, breaking after hyphens, `width`, indents and `breakLongWords`).

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

## `assert(cond, message)`

Throws `BioError(message)` unless `cond` is truthy; narrows types for TypeScript.
