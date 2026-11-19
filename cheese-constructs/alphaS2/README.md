# Alpha-S2-casein in Pichia: the casein most likely to survive

Generated from the lab's published method, 2026-11-19. 5 steps.
Every sequence here is one of the method's `needs` — everything a step uses that no step makes.

| | |
|---|---|
| **DNA to come from somewhere** | 1 fragment, 912 bases |
| **plasmid** | pPIC9K (Z46234.1) — published, so a repository or the lab that made it |
| **strain** | *Komagataella phaffii* GS115 — alive, so never in a method |
| **steps** | 5 |

[to-synthesise.fasta](to-synthesise.fasta) has the fragment. It is blunt, carries whole BamHI and
AvrII sites, and is cut with those two on arrival. **On a 2% gel that digest shows one band** — the
flanking pieces are 13 and 9 bases.

## Why this casein first

Of the four caseins this is the one most likely to survive being secreted. Caseins are deliberately
shapeless proteins and the cell’s own proteases chew shapeless things; this one is the least
shapeless of the four, carrying one internal disulfide stitch and the least proline:

| | disulfides | proline | order-breaking residues |
|---|---|---|---|
| prochymosin (rennet, for comparison) | 3 | 4.4% | 21.9% |
| **αS2-casein** | **1** | **4.8%** | **36.2%** |
| αS1-casein | 0 | 8.5% | 36.2% |
| κ-casein | 1 | 11.8% | 32.0% |
| β-casein | 0 | 16.7% | 38.8% |

Rennet is a different class of molecule, which is why it is a fair test of the method and no test at
all of the hard question. This arm is the fairest first test of the hard question.

**It carries a repair, and the variant matters.** The native bovine chain has Lys-Arg at 113/114. The
α-factor signal used here is released by Kex2, which cuts after Lys-Arg, so the native protein would
have been cut roughly in half on its way out of the cell. Arg114 is Gln here. **Order the fragment as
written and do not substitute a native αS2 gene**, or the protein will be cut in half.

**What to expect of the protein.** Intact, the chain is 24,320 daltons before any phosphate or sugar.
Three weak dibasic sites remain, so if the cell has cut it you will see a pair of bands instead of or
beside the intact one: 15,800 and 8,600; or 17,300 and 7,100; or 19,300 and 5,100. Measure intact
protein, not total protein — a band at one of those sizes is proteolysis at a named site and worth
recording, while an empty lane is the only outcome that says nothing at all.

## What cannot be sent

- something the publishing lab had not made: a strain

Anything alive is absent from a published method by design. The host strain has to be got separately,
and the strain the transformation produces is for whoever follows this to make.

## The ask, mechanically

Every molecule here is named by the checksum of its sequence, so a lab that holds one can say so
without any discussion of what to call it:

```
ldseguid=13VC6crtW0upqrNCHNmfdnCKw80
cdseguid=WKWneuTMjLY7SR1eVkY4OA8lZBo
```

`methodNeeds` and `whoHas` in `@biolibs/bionet` turn this method into exactly that question.
