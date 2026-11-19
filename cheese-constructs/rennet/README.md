# The smallest thing worth doing

Generated from `Vegan rennet in Pichia: one gene, one plasmid, one strain`, published 2026-11-19. 5 steps.

The full project needs 11 DNA fragments, 11,001 bases, three plasmids and two host strains, and none
of it can be bought right now. The arms are independent, though, so none of that has to happen at
once. This is one arm, complete:

| | |
|---|---|
| **DNA to come from somewhere** | 1 fragment, 1,386 bases |
| **plasmid** | pPIC9K (Z46234.1) — published, so a repository or the lab that made it |
| **strain** | *Komagataella phaffii* GS115 — alive, so never in a method |
| **steps** | 5 |

[to-synthesise.fasta](to-synthesise.fasta) has the fragment. It is blunt, carries whole BamHI and
AvrII sites, and is cut with those two on arrival. **On a 2% gel that digest shows one band** — the
flanking pieces are 13 and 9 bases.

## Why this arm and not another

Chymosin is the only part of this project with industrial precedent: it is already produced
recombinantly at scale. Three things follow.

- **It needs no kinase.** Prochymosin carries no `SxE` motif — zero, against six and seven in the
  alpha-caseins — so the project's central unknown, whether a kinase and a casein ever meet inside a
  cell, is not on the path at all.
- **The readout needs no instrument.** Whether it worked is whether milk clots.
- **It is the positive control for everything else.** A host that will not secrete prochymosin was
  never going to secrete a casein, so a negative here is worth as much as a positive and tells you
  the problem is the host, the media or the hands rather than the biology of caseins.

And on its own it is still a result: rennet.

## The other arms, for comparison

Each is independent, and each needs one fragment and one plasmid.

| arm | DNA | steps |
|---|---|---|
| bovine β-casein S22E Q38E, in *E. coli* | 627 bp | 2 |
| κ-casein, secreted | 798 bp | 4 |
| αS1-casein, secreted | 888 bp | 4 |
| αS2-casein R114Q, secreted | 912 bp | 4 |
| β-casein, secreted | 918 bp | 4 |
| **prochymosin, secreted** | **1,386 bp** | **5** |
| Fam20C kinase | 1,476 bp | 3 |
| Fam20A kinase | 1,524 bp | 3 |
| human β-casein with CK2 | 2,472 bp | 2 |

The cheapest is the 627 bp β-casein phosphomimetic in *E. coli* — two steps, no secretion, no
Pichia. It is the fastest thing on the list and it sidesteps the kinase by building the phosphate
mimicry into the sequence, which is the project's own hedge. It tests less, for a third of the DNA.

## If nothing can be bought at all

Then the ask is this page. One fragment of 1,386 bases is the kind of thing that fits in another
lab's synthesis order as a favour, which 11,001 bases is not. pPIC9K and GS115 are standard and a
community lab may well hold both already.

Every molecule here is named by the checksum of its sequence, so a lab that holds one can say so
without any discussion of what to call it — which is what `whoHas` in `@biolibs/bionet` is for.
