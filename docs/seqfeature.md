# @biolibs/seqfeature

A TypeScript port of Biopython's `Bio.SeqFeature`: positions, locations, features and references. Verified against Biopython 1.88 with about 5,900 recorded calls (results, exception types and messages, warnings and state after mutation); see [PARITY.md](../PARITY.md).

```ts
import { Seq } from "@biolibs/seq";
import { Location, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";

const gene = new SeqFeature(new SimpleLocation(0, 9, 1), "CDS", undefined, { gene: ["demo"] });
const parent = new Seq("ATGAAATAGCCC");
gene.extract(parent).toString();    // "ATGAAATAG"
gene.translate(parent).toString();  // "MK"

Location.fromstring("complement(join(1..10,20..30))").toString(); // "join{[19:30](-), [0:10](-)}"
```

Coordinates are **zero-based and end-exclusive** (like a JavaScript `slice`). The GenBank text form is one-based and inclusive; `Location.fromstring` converts.

## Naming: Python to TypeScript

| Python | TypeScript |
|---|---|
| `len(loc)`, `len(feature)` | `loc.length`, `feature.length` |
| `value in loc` | `loc.contains(value)` |
| `for i in loc` | `for (const i of loc)` |
| `a + b`, `loc + 3`, `3 + loc`, `loc - 3` | `a.add(b)`, `loc.add(3)`, `loc.radd(3)`, `loc.sub(3)` (`SimpleLocation` only) |
| `a == b` | `a.equals(b)` |
| `str(x)`, `repr(x)` | `x.toString()`, `x.repr()` |
| `loc.ref_db` | `loc.refDb` |
| `reference.medline_id`, `.pubmed_id` | `reference.medlineId`, `.pubmedId` |
| `loc._shift(n)`, `loc._flip(len)` | `loc.shift(n)`, `loc.flip(len)` (internal) |
| `feature.qualifiers` (dict) | `feature.qualifiers` (a `Map`) |
| `int(position)` | `Number(position)` or `position.valueOf()` |

## Positions

Positions are `int` subclasses in Biopython. Here they have `valueOf()`, so `<`, `>=`, `Math.min` and `Number(pos)` work, but **use `pos.equals(other)` for equality**, not `===`. Equality is by integer value, as in Python: `ExactPosition(5)` equals `BeforePosition(5)` and `5`.

| Class | GenBank text | Notes |
|---|---|---|
| `ExactPosition(5)` | `6` | exactly known (text is one-based) |
| `UncertainPosition(5)` | `?6` | |
| `BeforePosition(5)` / `AfterPosition(5)` | `<6` / `>6` | `flip` swaps them |
| `WithinPosition(5, left=3, right=5)` | `(4.6)` | `position` must be one of the bounds |
| `BetweenPosition(5, left=5, right=6)` | `(5^6)` | |
| `OneOfPosition(5, choices)` | `one-of(6,8)` | |
| `UnknownPosition()` | `?` | no integer value |

Each has `repr()`, `toString()`, `add(offset)` and `flip(length)`. `Position.fromstring(text, offset)` parses GenBank text (`offset` is `-1` for start positions, `0` for end positions).

## Locations

- **`SimpleLocation(start, end, strand?, ref?, refDb?)`**: one range. `start`/`end` are numbers or positions. `strand` is `1`, `-1`, `0` or `null`. `parts` is `[this]`. `extract(parent, references?)` returns the sub-sequence, reverse-complemented for strand `-1`; a `ref` makes it read from `references` instead.
- **`CompoundLocation(parts, operator = "join")`**: two or more simple locations (`join`, `order` or `bond`). `strand` is the common strand or `null`; assigning sets every part. `start`/`end` are the lowest start and highest end.
- **`Location.fromstring(text, length?, circular?, stranded?)`**: parses GenBank/EMBL text: `1..10`, `complement(...)`, `join(...)`, `order(...)`, `bond(...)`, `<5..>10`, `(3.5)..9`, `one-of(3,4)..9`, `5^6`, `NC_1.1:5..10`. With `length` and `circular`, a feature wrapping the origin (`1000..10` on a 1010-base circle) is repaired into a two-part join with a `BiopythonParserWarning`; without `circular` it is an error. Malformed text throws `LocationParserError`.

`SimpleLocation + SimpleLocation` gives a `CompoundLocation`; `+ number` shifts. `FeatureLocation` is the older name for `SimpleLocation`.

## SeqFeature

`new SeqFeature(location, type = "", id = "<unknown id>", qualifiers?)`. `qualifiers` is a `Map` (a plain object or pairs are accepted by the constructor).

- `extract(parent, references?)`: the feature's sequence.
- `translate(parent, table?, startOffset?, stopSymbol?, toStop?, cds?, gap?)`: translates the feature, using the `codon_start` and `transl_table` qualifiers when present and `cds = true` automatically for `type === "CDS"`. The parent must be a `Seq`/`MutableSeq`; a plain string raises `TypeError`, exactly as in Biopython.
- `length`, `contains(i)`, iteration, `equals`, `repr()`, `toString()`.

## Reference

`new Reference()` with fields `location`, `authors`, `consrtm`, `title`, `journal`, `medlineId`, `pubmedId`, `comment`; `toString()`, `repr()`, `equals()`.

## Intentional differences from Python

- Positions are not numbers. Use `Number(pos)`; Python's inherited `int` methods (`bit_length`, `to_bytes`, ...) are not provided.
- `bool(location)` and `hash(...)` have no equivalent. (In Python a zero-length `SimpleLocation` is falsy; check `length` instead.)
- Python `float` values that are whole numbers (`5.0`) are indistinguishable from integers in JavaScript.
- `int()` of non-ASCII Unicode digits is not supported when parsing location text.
- Where Python raises `AttributeError` for a wrong argument type, TypeScript throws `TypeError`.

## Source layout

```
packages/seqfeature/src/
  position/   base, exact, unknown, range (within/between), before-after, one-of, parse, index
  location/   base, simple, compound, patterns (regexes), parse, extract-util, index
  py/         Python-compatible int(), repr() and type names (internal)
  seq-feature.ts  reference.ts  errors.ts  index.ts
```

`Position.fromstring`, `Location.fromstring` and `SimpleLocation.fromstring` are installed in each directory's `index.ts`, because parsing needs the concrete classes that themselves extend the abstract ones (assigning at the end avoids a circular import).
