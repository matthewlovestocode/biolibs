# @biolibs/cloning

Molecular cloning in silico: restriction digests and ligation, and Gibson assembly with overlap primer design.

Biopython has no counterpart. `Bio.Restriction` says where enzymes cut and will hand back the fragments, but it has nothing about what the fragments' *ends* are, which of them will ligate, or what the product would be. This package builds on it and supplies the rest — all 1,088 REBASE enzymes are reachable, not a hand-written table of sixty, though only **754** of them can be simulated: for the other 334 REBASE does not say where the enzyme cuts, and `cutsIn` raises rather than guessing.

**102 unit tests**, with the cut coordinates and melting temperatures coming from the verified ports. See [the package README](../packages/cloning/README.md) for the API worked through one small plasmid, every example executed by `packages/cloning/test/readme.test.ts`.

```ts
import { assembleGibson, cloneProducts, designGibson, lookupEnzymes, piecesOf } from "@biolibs/cloning";

// Restriction cloning: cut a vector and an insert, and see what circles come out.
const result = cloneProducts(pUC19, myGene, ["EcoRI", "BamHI"]);
if (result.ok) console.log(result.products[0]!.description);
// "122 bp: vector 66 bp (BamHI to EcoRI) + myGene 56 bp (EcoRI to BamHI), as written"

// A digest on its own.
const { enzymes } = lookupEnzymes(["EcoRI"]);
piecesOf(pUC19, enzymes).map((p) => p.length);

// Gibson: fragments that already overlap, or primers to create the overlaps.
assembleGibson([{ name: "backbone", residues: a }, { name: "insert", residues: b }]);
designGibson([
  { name: "backbone", residues: backbone, amplify: false },
  { name: "insert", residues: insert },
]);
```

A record is taken to be circular when its `topology` annotation is `"circular"`, which is where GenBank and EMBL put it. Positions are 0-based half-open spans; `@biolibs/restriction` reports cuts 1-based as Biopython does, and `cuts.ts` converts in one place.

## Ends

A double-stranded end is described by the single-stranded overhang it leaves, read along the top strand. The two strands are cut at different places, and which sticks out decides the kind:

```
  5' overhang (EcoRI, G^AATTC)     3' overhang (PstI, CTGCA^G)     blunt (SmaI, CCC^GGG)
    5'-G      AATTC-3'               5'-CTGCA      G-3'             5'-CCC   GGG-3'
    3'-CTTAA      G-5'               3'-G      ACGTC-5'             3'-GGG   CCC-5'
```

Two ends ligate when they leave overhangs of the **same kind whose sequences, read along the top strand, are identical** — which is what it means for them to pair. BamHI (overhang `GATC`) and BglII (also `GATC`) therefore join though they are different enzymes, while two 5' overhangs of different sequence do not. Turning a fragment over exchanges its ends and reverse-complements each overhang; the kind is a property of the molecule and does not change.

Biopython's `ovhg` is the overhang length, negative for a 5' overhang, so `bottomCut = topCut - ovhg`: EcoRI, with `ovhg = -4`, cuts the bottom strand four bases past the top.

## Pieces

A piece's top strand runs from one cut to the next. Seen from the top strand, a piece that begins at a cut has its top strand starting just after it, and one that ends at a cut has its top strand ending at it, whatever the overhangs — so **the top strand of a ligation is simply the left piece's top strand followed by the right piece's**. That is why a piece is stored as the top strand between two cuts, with the ends recorded separately.

A linear record with `n` cuts gives `n + 1` pieces, the outer two keeping the ends the line already had (`enzyme: null`); a circular one gives `n` pieces, one spanning the origin, and gives **none** when uncut, since nothing has been cut. Each piece carries its own features, clipped by `@biolibs/seqedit`.

`religate` puts a digest back together, and a test checks the round trip: cutting a plasmid and re-ligating its pieces gives the plasmid back.

## Restriction cloning

`cloneProducts` cuts a vector (which must be circular) and an insert, then reports every circle where **both** junctions pair — the insert's left end with the vector's right, and the insert's right end with the vector's left. The insert is tried as written and turned over, since a fragment in a tube has no preferred orientation. Products come back largest vector fragment first, which is the construct a cloner is almost always after.

Only insert fragments with an enzyme-made end at **both** sides are offered: a piece with a natural end came from the uncut end of a line and cannot be ligated in a planned way. Failures explain themselves — unknown enzymes, a vector that is not cut, nothing freed from the insert, ends that do not pair.

## Gibson assembly

An exonuclease chews back each fragment's 5' ends, the overlaps anneal, and a polymerase and ligase fill and seal. In simulation: find which fragment ends share an overlap, find the ways to arrange every fragment in a ring, and write the ring with each overlap appearing once.

`assembleGibson` walks depth-first and only extends a chain when the next fragment's start overlaps the chain's end, which keeps it fast though the number of arrangements grows factorially. Products are deduplicated by the **molecule they are**, not the order the fragments were put in: a ring is the same ring whichever fragment you start at and whichever strand you read, so `canonicalCircular` (the alphabetically first rotation of the sequence or its reverse complement) collapses them. A two-fragment ring therefore appears once, not twice.

Note that a ring of two fragments needs an overlap at **both** junctions, not just one. Each junction reports its overlap's melting temperature, from `@biolibs/pcr`, which is what decides whether it anneals.

An overlap is never the whole of either fragment. A junction that swallowed one would leave it contributing nothing to the ring, and allowing it would make every sequence overlap itself end to end — a single fragment would then always "close" into a circle of nothing. A single fragment whose own two ends genuinely overlap does assemble, into a circle one overlap shorter than itself.

## Gibson design

Where `assembleGibson` searches for an arrangement that already works, `designGibson` *creates* the overlaps: for fragments in the order they are to go round, it designs the PCR primers whose 5' tails supply them. The forward primer carries the end of the fragment before it, the reverse primer the start of the fragment after (reverse-complemented, since a reverse primer reads the bottom strand).

Between two amplified fragments the overlap is shared half on each primer, which keeps both short. A fragment used **as it is** — a vector opened with an enzyme, say — cannot be given a tail, so its neighbour's primer carries the whole overlap; two unamplified neighbours are refused, since there is nowhere to put the overlap. `checkTailedPrimer` reports on the whole primer and its binding part separately, because an assembly primer is long by design and the binding part is what sets the annealing temperature.
