# reference/: Biopython as the source of truth

Parity with Biopython is measured, not claimed. This directory runs the real Biopython and records what it does; the TypeScript tests replay the same calls and compare.

## One-time setup

```bash
python3 -m venv reference/.venv
reference/.venv/bin/pip install biopython
```

## Files

| File | Purpose |
|---|---|
| `inventory.py` → `inventory.json` | Introspects Biopython and lists every public class, method, function and format. |
| `gen_checklist.py` → `../PARITY.md` | Renders the inventory as a checklist. Progress comes from `status.json`. |
| `update_status.py` | Marks an item done only if the golden cases exercise it. |
| `gen_data.py` | Generates `packages/seq/src/data/*.ts` (IUPAC constants, all NCBI genetic codes) directly from Biopython. Never edit those by hand. |
| `golden/codec.py` | JSON encoding shared by Python and TypeScript so both build identical objects. |
| `golden/gen_seq_cases.py` | Runs ~22,000 `Bio.Seq` calls (results, exceptions with messages, warnings, state after mutation). |
| `golden/gen_codon_cases.py` | Dumps every codon table registry, ambiguous lookups, and IUPAC constants. |

## Regenerating

```bash
npm run golden        # regenerate data, golden JSON, and PARITY.md
npm test              # replay everything against the TypeScript implementation
```

Golden JSON files live in `packages/<pkg>/test/golden/` and are committed, so the TypeScript tests run without Python.

## What counts as "done"

An item in `PARITY.md` is `[x]` only when a golden case exercises it and the TypeScript output is identical to Biopython's: same result, same exception type and message, same warnings, same receiver state after mutation. Items that exist only because Python inherits them (`object.__eq__`, `BaseException.add_note`, ...) are marked `[-]`.

## Known, intentional divergences

- Python's duck typing raises `AttributeError` for wrong argument types; TypeScript throws `TypeError`. The comparison treats them as equivalent and ignores the message.
- `hash(seq)` values differ from CPython (`hashCode()` is a stable FNV-1a hash).
- `Seq({0: 5}, n)` (where `bytes(5)` silently makes five NUL bytes) throws instead.
- Python `list` vs `tuple` arguments to `startswith`/`endswith` are not distinguishable; both arrays are accepted.
