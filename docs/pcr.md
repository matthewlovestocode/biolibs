# @biolibs/pcr

PCR in silico: primer quality, where a primer binds a template, what a pair amplifies, and primer design. Biopython has no counterpart — the usual Python answer is `primer3-py`, a wrapper round a C library.

**Melting temperatures are not reimplemented here.** They come from `@biolibs/seqtools`, which is Biopython's `MeltingTemp` ported in full and verified against it, so every nearest-neighbour table and salt correction Biopython offers is reachable through `Conditions`. The M13 primers' values are pinned to Biopython's answers in the tests, so a change in the thermodynamics fails there.

**94 unit tests** cover the rest. See [the package README](../packages/pcr/README.md) for the API worked through one 200-base template, every example executed by `packages/pcr/test/readme.test.ts`.

```ts
import { checkPrimer, designPrimers, predictProducts, productWithTails, withTail } from "@biolibs/pcr";

// Check a primer somebody ordered.
const report = checkPrimer("GTAAAACGACGGCCAGT");   // the M13 forward primer
report.tm;        // 52.77 — Bio.SeqUtils.MeltingTemp.Tm_NN at 50 mM Na, 250 nM primer
report.gcClamp;   // false
report.warnings;  // ["the primer is 17 bases, shorter than 18", ...]

// Design a pair to amplify bases 100 to 600, then see what they would make.
const pair = designPrimers(template, 100, 600);   // the product is exactly 100..600
const products = predictProducts(template, "circular", [
  { name: "F", sequence: pair!.forward.sequence },
  { name: "R", sequence: pair!.reverse.sequence },
]);
products[0]!.length; // 500, for a template where neither primer binds anywhere else

// A cloning primer carrying a 5' tail.
productWithTails(template, products[0]!, withTail("GGAATTC", pair!.forward.sequence), pair!.reverse.sequence);
```

## What counts as a primer

Unambiguous DNA — A, C, G and T only — between 8 and 200 bases. Ambiguity codes and gaps are rejected rather than guessed at, because a primer with an N in it has no single melting temperature and no single binding site. `cleanPrimer` tidies typed or pasted text (upper case, U read as T, whitespace and position numbers dropped, since sequences are so often pasted with line numbers); `primerProblem` says what is wrong with the result, for an error message.

## Quality

`checkPrimer` measures length, GC fraction, melting temperature, the longest run of one base, self-complementarity (whole primer and 3'-end only), and the GC clamp, then lists advisory warnings against `PRIMER_LIMITS` — 18–30 bases, 40–60% GC, 55–65 °C, no run over 4. The limits are an argument, so they can be tightened or relaxed without reimplementing the checks. **They are advisory**: a primer that trips a warning often works, and one that trips none can still fail.

`selfComplementarity` slides the primer against its own reverse complement at every offset and takes the longest run of paired bases. That measures self-complementarity, not the free energy of the structure it would form — a real hairpin prediction needs a folding algorithm.

## Binding and products

`findBindingSites` matches base for base over the primer's whole length, allowing a few substitutions and no indels, since indels in a primer–template duplex are not what limits PCR specificity. Mismatches **near the 3' end** are counted separately and refused by default, because that is where the polymerase extends from; `endWindow` sets how many bases count as the 3' end (5 by default). A circular template is searched across its origin, and a site is found exactly once.

`predictProducts` pairs every forward site with every reverse site that it faces, including a primer with itself, and measures the product from the forward primer's 5' end to the reverse primer's 5' end — both primers in full, because each is copied into the product whole. That is why `productWithTails` differs from `productSequence` when a primer carries a non-matching 5' tail, which is the point of an assembly or cloning primer.

One forward site plus one reverse site gives exactly **one** product, on a circle as on a line: a primer extends in one direction only. A product wraps the origin when the reverse site comes before the forward one.

## Design

`designPrimers` anchors the forward primer at the first base of the stretch and the reverse primer at the last, so the product is exactly the stretch asked for; the only freedom left is length, so the design is a search over lengths. The score prefers a melting temperature near the target, then a G or C at the 3' end, then GC content near the middle of the band — the order primer-design guides advise. A caller wanting a different trade-off can score `primerCandidates` itself.

Positions are 0-based half-open spans, as elsewhere in biolibs.
