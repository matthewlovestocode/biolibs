# @biolibs/restriction

A TypeScript port of Biopython's `Bio.Restriction`: 1,088 restriction enzymes (REBASE data, as shipped
with Biopython 1.88), where they cut, digests, batches of enzymes, and `Analysis` with its text layouts.
All **491 items** are at parity, verified against Biopython on **5,387 cases**
(`packages/restriction/test/golden/restriction.json`, built by `reference/golden/gen_restriction_cases.py`)
— 1,088 of which dump one enzyme each, so every enzyme in the set is checked whole rather than sampled.
See [the package README](../packages/restriction/README.md) for the API with worked examples.

```ts
import { Seq } from "@biolibs/seq";
import { Analysis, AllEnzymes, CommOnly, RestrictionBatch, enzymes } from "@biolibs/restriction";

const { EcoRI, SmaI } = enzymes;                 // Python: Restriction.EcoRI
const dna = new Seq("GAATTCAAACCCGGGTTTGAATTC");
EcoRI.search(dna);                               // [2, 20]   (the base after each cut, from 1)
EcoRI.search(dna, false);                        // circular
EcoRI.catalyse(dna);                             // fragments as Seq
EcoRI.elucidate();                               // "G^AATT_C"
EcoRI.isoschizomers();  EcoRI.compatibleEnd();

const batch = new RestrictionBatch([EcoRI, "SmaI"]);   // enzymes or their names
batch.search(dna);                               // Map of enzyme -> positions
const a = new Analysis(batch, dna);
a.withSites();  a.between(1, 12);
console.log(a.formatOutput());                   // a.printAs("map" | "number" | "list")
```

## From Python

Biopython builds one *class* per enzyme out of mixins (`Palindromic`, `OneCut`, `Ov5`, `Defined`, ...). Here each enzyme is a `RestrictionType` *object* that knows its mixins (`kinds`, `isA("Blunt")`), so `issubclass(enzyme, Blunt)` becomes `enzyme.isA("Blunt")` and `RestrictionBatch.split` takes kind names. Enzymes live in the `enzymes` record (`Restriction.EcoRI` is `enzymes.EcoRI`), and in `AllEnzymes`, `CommOnly` and `NonComm`.

| Python | TypeScript |
|---|---|
| `EcoRI.search(seq, linear)`, `EcoRI.catalyse(seq)` (alias `catalyze`) | same names; `EcoRI / seq` is `div(seq)`, `EcoRI // seq` is `floordiv(seq)` |
| `a != b`, `a >> b`, `a % b`, `a < b`, `a + b` | `a.ne(b)`, `a.rshift(b)`, `a.mod(b)`, `a.lt(b)`, `a.add(b)` (`a == b` is `a === b`) |
| `is_blunt()`, `is_5overhang()`, `cut_once()`, `elucidate()`, ... | `isBlunt()`, `is5overhang()`, `cutOnce()`, `elucidate()`, ... |
| `batch + enzyme`, `batch += enzyme` | `batch.plus(enzyme)`, `batch.iadd(enzyme)` |
| `e in batch`, `len(batch)` | `batch.has(e)`, `batch.size` |

Things kept exactly as in Biopython, including the odd ones:

- Enzymes keep the state of their last search (`dna`, `results`, `onMinus`), shared by everyone who uses that enzyme.
- `a.ne(b)` compares cut characteristics, so it is not the negation of `===`; `isEquischizomer` is `!ne`. `a.lt(b)` orders by site length, then name.
- Cut positions are 1-based: the position of the base after the cut, with the Watson-strand cut (`fst5`) for palindromic enzymes and the sorted union of both strands for non-palindromic ones. Linear searches drop cuts outside the sequence; circular ones wrap them.
- `addNocheck` puts whatever it is given into the batch, as Biopython does, so a batch can hold a string or a number. `elements`, `asString` and the batch's `toString`/`repr` name such a member by its own string form, while `search` and `split` throw as Biopython's attribute access and `issubclass` do.
- `RestrictionBatch.split` and `lambdasplit` return an **empty** batch (the selection sits in its `_data` map), because the Python code assigns a private attribute instead of filling the set. `a + b` for an enzyme and a *batch* adds in place and returns `null`.
- A batch's `search` accepts `Seq` and `FormattedSeq` but refuses `MutableSeq`, although its message says "Seq or MutableSeq". An enzyme's `search` takes both.
- `equischizomers` and `isoschizomers` throw `ValueError("list.index(x): x not in list")` when the enzyme is not in the batch you pass; `compatibleEnd` always looks at *all* enzymes, ignoring its batch argument (and an enzyme of unknown cut takes none at all).
- `PrintFormat.linesize` stays 70 whatever `change(NameWidth=...)` does; `change` raises for `Cmodulo`/`PrefWidth`.
- Biopython's batches are Python `set`s, whose iteration order is arbitrary. Here a batch iterates in insertion order. Results are unaffected except in the map layout, which lists enzymes that cut at the same position in iteration order; the golden cases avoid such positions.
- `suppliers()`, `allSuppliers()`, `showCodes()` and `printThat()` print with `console.log`, exactly as Biopython prints them; the golden cases capture that output and compare it. Biopython inherits `all_suppliers` into all seventeen enzyme classes, where this port has one static on `RestrictionType`.
- `batch.plus(e)` (`b + e`) keeps the receiver's class, as Biopython's `self.__class__(self)` does, so adding to an `Analysis` gives an `Analysis` whose sequence is empty — not a plain batch.

- `FormattedSeq` has `repr()` and no `toString()`, as Biopython has `__repr__` and no `__str__` for it, so `String(fs)` gives `[object Object]`.
- A `RestrictionBatch` built with a name it does not know raises `ValueError("<class 'str'> is not a RestrictionType")` — Biopython names the *type*, not the name it could not find.

Source layout: `restriction-dictionary.ts` (generated by `reference/gen_data.py`), `formatted-seq.ts`, `restriction-type.ts`, `batch.ts`, `print-format.ts`, `analysis.ts`, `enzymes.ts`, `registry.ts` (late binding between enzymes and batches).
