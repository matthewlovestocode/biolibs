# @biolibs/features

Find known elements in a DNA sequence by comparing it with a library of reference pieces. This is the "find features" button of a plasmid editor: given a sequence and a collection of known parts, say which are in it and where.

Biopython has nothing equivalent — `Bio.Align` would align two sequences and `Bio.motifs` would score a position matrix, but neither answers "which of these 400 standard parts is in my plasmid".

```ts
import { asFeature, bestHits, detectFeatures, newHits } from "@biolibs/features";

const library = [
  { name: "T7 promoter", type: "promoter", sequence: "TAATACGACTCACTATAG" },
  { name: "AmpR", type: "CDS", sequence: ampR, note: "from pUC19, L09137" },
];

const hits = bestHits(detectFeatures(residues, "circular", library));
for (const hit of newHits(hits, record.features)) {
  record.features.push(asFeature(hit, { length: residues.length }));
}
```

## No library ships with this package

That is deliberate, and it is a licensing matter rather than an oversight. The collections of annotated parts that would fill a library carry their own terms, and several of the obvious sources are unsuitable for bundling inside an MIT package: Addgene's site content is limited to non-commercial use, and the iGEM Registry's terms would need confirming and would carry ShareAlike obligations onto whatever bundled them.

So the library is an **argument**. A caller supplies pieces under whatever terms apply to them — cut out of records they already hold, read from a file, or published as a separate package with its own notice. `libraryProblems` and `requireLibrary` check a library before it is used.

## Matching

A piece matches where the sequence agrees with it base for base over the piece's whole length, allowing a few **substitutions and no indels**. That is the right model here: the variants of a standard part that turn up in real plasmids (the AmpR of pUC19 against that of pBR322) differ by scattered substitutions, while a part with bases inserted into it is a different part and should be found by alignment, not by this.

Short pieces are held to a stricter standard than long ones, because a 20-base promoter with one base different is a different promoter while a 900-base gene with nine bases different is the same gene. By default pieces of 30 bases or fewer must match exactly (`exactBelow`), and longer ones tolerate 5% mismatches (`tolerance`); a piece may set its own `tolerance`, though it cannot escape the exact-match rule for short pieces. `mismatchBudget` exposes the arithmetic.

Both strands are searched, and a circular sequence is searched across its origin — so a part straddling the origin of a plasmid is found, exactly once. Anything that is not an unambiguous base never matches, so a run of Ns is never a hit.

## Picking the best hits

`bestHits` keeps the best hit where several overlap, taking them in order of bases covered then mismatches. The overlap is measured as a fraction of the **longer** of the two hits, which is what distinguishes the two cases that matter: a short promoter inside a long gene covers little of the gene and is kept, while two variants of the same gene at the same place cover all of each other and only the better survives.

## Annotating

Nothing here changes a record. `asFeature` builds a `SeqFeature` and `newHits` says which hits are not already annotated, leaving the caller to decide what to add — an automatic detector that silently rewrote a curated annotation would be worse than useless.

A built feature gets the piece's name in `/label`, and in `/gene` as well for a gene or CDS, so the name survives a round trip through GenBank; the piece's own `note` is kept alongside a note recording the identity. A hit that wraps the origin becomes a two-part join, which is how GenBank writes such a feature, and needs the sequence `length` to be written at all.

`alreadyAnnotated` counts a hit as annotated when an existing feature has the same name (in `/gene`, `/label`, `/product`, `/standard_name` or the feature's id), or when a feature **of the same type** covers at least `minCover` of the hit — the second test is what catches a curated annotation under a different name.

Positions are 0-based half-open spans, as elsewhere in biolibs.
