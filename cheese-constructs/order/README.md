# The order

Generated from the lab's published method, not written by hand: `Four caseins and rennet, for a lab that wants to try cheese`, published
2026-11-19. Every sequence below is one of the method's `needs` — everything a
step uses that no step makes — so this list cannot drift from the plans without the method drifting
too.

## Synthesise — 11 fragments, 11,001 bp

In [to-synthesise.fasta](to-synthesise.fasta). All blunt double-stranded DNA. A linear-fragment
product is enough; nothing needs to arrive in a vector.

| fragment | bp | on arrival |
|---|---|---|
| bovine β-casein S22E Q38E, E. coli codons | 627 | use as supplied |
| Fam20C (Q8IXL6) mature chain, Pichia codons | 1476 | use as supplied |
| Fam20A (Q96MK3) mature chain, Pichia codons | 1524 | use as supplied |
| human β-casein with C-terminal His6, E. coli codons | 657 | use as supplied |
| human CK2α, E. coli codons | 1173 | use as supplied |
| human CK2β, E. coli codons | 642 | use as supplied |
| αS1-casein cassette, orderable | 888 | cut on arrival, step 5 |
| αS2-casein cassette, orderable | 912 | cut on arrival, step 6 |
| β-casein cassette, orderable | 918 | cut on arrival, step 7 |
| κ-casein cassette, orderable | 798 | cut on arrival, step 8 |
| prochymosin cassette, orderable | 1386 | cut on arrival, step 9 |

**Five of these are cut before use, and that is not a detail to skip.** The lab records each casein
and prochymosin cassette as a BamHI/AvrII digest leaves it — a duplex with a four-base 5′ overhang at
each end. Nothing can be bought in that state, so what is ordered is eighteen bases longer: the single
base each cut removed put back so both sites are whole, inside eight bases of flanking DNA so the
enzymes have somewhere to sit. Cut each with BamHI and AvrII and you hold exactly the molecule the
method names, by checksum. **On a 2% gel that digest shows one visible band** — the two flanking
pieces are 13 and 9 bases and will not be seen — so a single band is the digest working, not failing.

## Obtain — 3 plasmids

Published, with accessions, so a repository or the original lab rather than a synthesiser.

| plasmid | bp |
|---|---|
| pJTFlag (MN534898.1) | 5299 |
| pPICZalphaH6E (KM035419.1) | 3551 |
| pPIC9K (Z46234.1) | 9273 |

## Cannot be sent — 1

- something the publishing lab had not made: a strain

Anything alive is absent from a published method by design, so the two host strains have to be got
separately: **Komagataella phaffii GS115** and **E. coli BL21(DE3)**. The entry above is a prospect —
a thing named so the work after it could be written down, which nobody has made. It is not missing
from this order; it is what the order exists to produce.
