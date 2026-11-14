# reference/: Biopython as the source of truth

Parity with Biopython is measured, not claimed. This directory runs the real Biopython and records what it does; the TypeScript tests replay the same calls and compare.

## One-time setup

```bash
python3 -m venv reference/.venv
reference/.venv/bin/pip install biopython scipy pydna seguid
```

`scipy` is only needed by `Bio.Align.analysis`'s YN00 and ML methods, which import `scipy.linalg.expm` and
`scipy.optimize.minimize`; without it those generators cannot run.

One optional dependency is deliberately **not** installed: `cai2`, which `pydna.utils.cai` imports. Two
members of `pydna.seq` need it — `cai` itself and `express`, which calls it — so both raise
`ModuleNotFoundError` here and are left unverified in `docs/parity-pydna/` rather than having that recorded
as pydna's behaviour. Installing it would make them measurable; `express` would still need a port of the
third-party `prettytable` layout its return value is rendered by.

`pydna` and `seguid` are the second and third upstream libraries this repo ports, for `@biolibs/dseq` and
`@biolibs/seguid`. Each has its own inventory and status file — `inventory_<library>.py`,
`status-<library>.json`, `update_status_<library>.py` — and `gen_checklist_lib.py <library>` renders them
into `docs/parity-<library>/`, so that Biopython's progress count stays a number about Biopython.
Installing them does not change the pinned Biopython, which the golden files depend on; check with
`pip list` if in doubt.

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

A regeneration must reproduce the committed files, and four of them did not. Each generator seeds its own
`random.Random`, so the cases it builds are fixed; what varied was the answers, for three separate reasons, all of
them now closed. Any new golden file should be checked against them, because none announces itself:

**A set of strings decides something.** Python randomises string hashing per process, so a set iterates differently
on every run. `gen_seqio_cases.py` picked the tag to rename out of `list(set(...))`, which is why the seqxml,
snapgene and uniprot-xml files — all three of which mutate XML through the same helper — were different every time.
Sorting the set fixed it. `gen_seguid_cases.py` had the same bug in the symbols it reported as unknown. The way to
catch this one is to run the generator twice under different `PYTHONHASHSEED` values.

**A set of objects decides something.** This one survives that check, which is why `consensus.json` took longest to
explain: `Bio.Phylo.Consensus._sub_clade` builds a clade's children out of sets of `Clade` objects, and those hash
by *identity*. `PYTHONHASHSEED` has no effect on identity hashes, so both seeds agreed and the answer still moved
whenever the objects were allocated somewhere else — which a different Biopython, Python or machine is enough to do.
Probing it by perturbing allocation works but only samples; the generator now detects the branch structurally and
drops every case that reaches it.

**A case died and was dropped.** `motifs.json` was none of the above, and the cause turned out to be `fork` itself.
One of its cases dies of SIGSEGV or SIGABRT on *every* attempt in about one run in three, and comes through untouched
in the others; the case was then dropped and the file came out a case shorter. The case is innocent — on its own in
a fresh interpreter it survives two hundred forks out of two hundred — and so is every one of its operations. What
kills it is the state three thousand earlier cases have left in the parent, which `fork` hands to the child whole.
Retrying cannot help, since all ten attempts inherit the same thing, and nor can excluding the case: with it gone the
failure rate fell from a third of runs to a twelfth, which is the next unlucky case taking its place.

So `golden/isolate.py` gained a last resort that leaves the parent out of it. A generator calls `eval_entrypoint`
once, after its runners are defined, and passes `fresh_eval=<runner name>` to `run_isolated`; when every fork has
died, the case is tried once more in a new interpreter started on the generator's own file, which has run nothing
and inherits nothing. Fifteen runs of `gen_motif_cases.py` then produced the same file fifteen times, where before
four runs in fourteen could not finish. Only that generator needs it so far: for the ones whose inputs really do
crash Biopython a fresh interpreter would crash too, and they would pay a subprocess for each of the 120 cases
it cannot save.

Two things back that up. `isolate.py` now *raises* when every attempt at a case dies, unless the generator passed
`expect_death=True` — which only the generators built on the FOGSAA aligner do — so a run that cannot measure what
the last run measured stops rather than writing a smaller file. And `gen_alignment_cases.py` pins the number of
cases it cannot build at all, which is none: two used to be, and they were flakes as well, written off after three
attempts where ten are now allowed.

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
