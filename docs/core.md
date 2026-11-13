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

Small functions that let ports reproduce Biopython's behaviour and messages exactly: `pyInt` (Python's `int(str)`), `pyRepr` and `pyStr` (`repr`/`str` of `None`, bools, lists, dicts, and objects with `repr()`), `pyTypeName`/`pyClassRepr` (type names for error messages; `registerPythonClasses(module, names)` teaches it `<class 'Bio.X.Y'>`), `pyEquals` (`==` for plain data), `pyTruthy` and `pyContains` (`in`), `PyTuple` (an array that prints as a Python tuple), `pyFormatG` (`%g` / `format(x, "g")`), `pyTextwrapFill` (`textwrap.fill`: tab expansion, breaking after hyphens, `width`, indents and `breakLongWords`).

## `assert(cond, message)`

Throws `BioError(message)` unless `cond` is truthy; narrows types for TypeScript.
