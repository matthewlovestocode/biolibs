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
| `inventory.py` → `inventory.json` | Introspects Biopython and lists every public class, method, function and format. Also lists, under `inherited`, the members no class but `object` defines, which is what makes them `[-]` below. |
| `gen_checklist.py` → `../PARITY.md` | Renders the inventory as a checklist. Progress comes from `status.json`. |
| `update_status.py` | Marks an item done only if the golden cases exercise it. |
| `gen_data.py` | Generates `packages/seq/src/data/*.ts` (IUPAC constants, all NCBI genetic codes) directly from Biopython. Never edit those by hand. |
| `golden/codec.py` | JSON encoding shared by Python and TypeScript so both build identical objects. |
| `golden/isolate.py` | Runs each case in a forked child, so a segfault in Biopython's C code cannot take the run with it. A child that dies without answering is retried, a child whose code raised stops the generator with its traceback, and a case that cannot be run at all is printed. |
| `golden/gen_seq_cases.py` | Runs ~22,000 `Bio.Seq` calls (results, exceptions with messages, warnings, state after mutation). |
| `golden/gen_codon_cases.py` | Dumps every codon table registry, ambiguous lookups, and IUPAC constants. |

## Regenerating

```bash
npm run golden        # regenerate data, golden JSON, and PARITY.md
npm test              # replay everything against the TypeScript implementation
```

Golden JSON files live in `packages/<pkg>/test/golden/` and are committed, so the TypeScript tests run without Python.

A regeneration must reproduce the committed files. Each generator seeds its own `random.Random`, so the cases it builds
are fixed; what used to vary was which of them survived, because a case was dropped in silence whenever its forked
child died — from a crash, or from the case's own code raising where nothing caught it. `golden/isolate.py` now retries
a child that died without answering, raises a generator's own error instead of swallowing it, and prints any case it
still cannot run, so a run that loses coverage says so rather than quietly committing a smaller suite.

## What counts as "done"

Every mark is derived from the golden cases on each run, so `status.json` can be deleted and rebuilt: the count it
produces is the count the cases earn. `gen_checklist.py` drops any entry the checklist does not ask about, which is
what keeps that true -- six items had been marked done by hand under keys no rule maintained, and nothing would have
noticed. It also reports how many marks landed on keys nothing asks about, each of which is a rule aiming at nothing.

An item in `PARITY.md` is `[x]` only when a golden case exercises it and the TypeScript output is identical to Biopython's: same result, same exception type and message, same warnings, same receiver state after mutation. Items that exist only because Python inherits them (`object.__eq__`, `BaseException.add_note`, ...) are marked `[-]`. For the comparison, hash and string dunders that is derived, not asserted: `inventory.py` walks each class's MRO and `update_status.py` marks what it finds before anything else, so the count stays right when Biopython changes and no one has to maintain hundreds of entries by hand. A golden case still wins — a few of these have behaviour worth pinning down, such as `SeqFeature.__lt__` raising `TypeError` rather than comparing.

## Known, intentional divergences

- Python's duck typing raises `AttributeError` for wrong argument types; TypeScript throws `TypeError`. The comparison treats them as equivalent and ignores the message.
- `hash(seq)` values differ from CPython (`hashCode()` is a stable FNV-1a hash).
- `Seq({0: 5}, n)` (where `bytes(5)` silently makes five NUL bytes) throws instead.
- Python `list` vs `tuple` arguments to `startswith`/`endswith` are not distinguishable; both arrays are accepted.
