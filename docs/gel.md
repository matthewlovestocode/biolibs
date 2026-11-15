# @biolibs/gel

A virtual agarose gel: where DNA fragments of a given size would run, and which of them a gel would tell apart. There is no Biopython counterpart — this is the data behind the gel photograph that a tool such as SnapGene draws beside a digest, so it is checked against its own invariants rather than against a reference implementation.

**41 unit tests** over those invariants: every fragment loaded appears in exactly one band, a larger fragment never runs further than a smaller one, merging is anchored so near-neighbours cannot chain, and both ends of the resolving range behave the same way. See [the package README](../packages/gel/README.md) for the API with worked examples, every one executed by `packages/gel/test/readme.test.ts`.

```ts
import { bandsOf, fragmentSizes, gelById, ladderBands, ladderById } from "@biolibs/gel";

const gel = gelById("1.0");                                // 1% agarose, resolves 250–10,000 bp
const sizes = fragmentSizes(2686, "circular", [395, 1230]); // pUC19 cut twice -> [1851, 835]

for (const band of bandsOf(sizes, gel)) {
  console.log(`${band.size} bp at ${(band.position * 100).toFixed(0)}% down the lane`);
}
const markers = ladderBands(ladderById("1kb").sizes, gel);
```

## The model

Over the range a gel separates, the distance a fragment migrates is very nearly a straight line in the logarithm of its length — the standard first approximation, and the reason a gel photograph is read against a log scale. `bandPosition` interpolates in `log10(size)` between the gel's largest and smallest resolved fragment, giving `0` at the wells and `1` at the running front. Fragments outside that range clamp to one end, because the gel does not separate them.

The four concentrations in `GELS` (0.8, 1.0, 1.5 and 2.0%) and their ranges are the conventional working figures for agarose in TAE, as printed in supplier guides. **They describe which fragments would be distinguishable, and are not measurements**: a real gel depends on buffer, voltage, run time and dye.

## Bands

`bandsOf` merges fragments that fall within a tolerance of each other (3% by default) into a single band, since two fragments of nearly the same size cannot be told apart by eye, and records how many fragments the band holds. The comparison is against the band's **representative** — its largest fragment — rather than the previous fragment, so a run of near-neighbours cannot chain into one unbounded band.

Fragments the gel does not separate are merged whatever the tolerance, and **both ends of the range behave the same way**: everything below it piles up at the front, everything above it stays bunched at the wells, and either band carries `unresolved: true`. A ladder is the exception — its bands are known sizes, so `ladderBands` flags them but never merges them.

Each band's `intensity` is its share of the lane's base pairs, scaled so the heaviest band is 1 — a band holding more DNA stains more brightly. That is mass rather than fluorescence: there is no dye binding, saturation or background in the model.

Every fragment loaded appears in exactly one band, which is checked by a test.

## Fragment sizes

`fragmentSizes(length, topology, cuts)` turns cut positions into fragment lengths without pulling in an enzyme library, so a digest from any source can be loaded. Cuts are **0-based boundaries**: a cut at `n` separates the base at index `n - 1` from the base at index `n`. `@biolibs/restriction` reports cuts 1-based, as Biopython does, so subtract one from each; `@biolibs/cloning`'s `cutsIn` does that conversion for you.

A linear sequence with `n` cuts gives `n + 1` pieces including the two uncut ends; a circular one gives `n` pieces, one spanning the origin, and stays whole when uncut. Duplicate positions count once, since two enzymes cutting the same bond make one break.
