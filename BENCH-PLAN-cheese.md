# What can still be worked out without a bench — and what each bench result would mean

Written 18 November 2026. Everything here was computed from the nine constructs as they stand in The
Wren Lab, through the published biolibs packages. Nothing here is a measurement.

The question this answers: the designs are finished and nothing has been made. How much of what comes
*after* making it can be worked out in advance, so that the first person at a bench knows what to
look for and what each outcome would mean?

Quite a lot, it turns out. Four things that were open are now closed, and one real design gap fell out
of doing it.

---

## 1. Telling a correct build from a wrong one, before paying for sequencing

A digest only helps if the band that distinguishes a good build from a bad one is a band you can
actually read: inside the gel's range, and not hiding underneath another band. Bands that merely
co-migrate with *each other* are fine — nobody is measuring the vector's own big fragments.

Searched a 49-enzyme panel (singles and all pairs) against each construct **and against the empty
vector it came from**, which is what religation gives you back.

| Construct | Digest | Gel | Correct lane | Empty vector | The band that tells them apart |
|---|---|---|---|---|---|
| pPIC9K-alphaS1-secreted | BamHI + AvrII | 1.5% | 8985 / **866** | 8985 / 288 | 866 bp |
| pPIC9K-alphaS2-secreted | BamHI + AvrII | 1.5% | 8985 / **890** | 8985 / 288 | 890 bp |
| pPIC9K-bovine-casein-secreted | BamHI + AvrII | 1.5% | 8985 / **896** | 8985 / 288 | 896 bp |
| pPIC9K-kappa-secreted | BamHI + AvrII | 1.5% | 8985 / **776** | 8985 / 288 | 776 bp |
| pPIC9K-prochymosin-secreted | BamHI + AvrII | 1.0% | 8985 / **1364** | 8985 / 288 | 1364 bp |
| pPICZ-Fam20C-secreted | BclI | 1.5% | 2789 / **2082** | 2789 / 762 | 2082 vs 762 bp |
| pPICZ-Fam20A-secreted | PvuII | 1.0% | 3368 / **1551** | uncut, 3551 | 1551 bp |
| pJTFlag-bovine-S22E-Q38E | NcoI + XhoI | 1.5% | 5231 / **635** | 5231 / 68 | 635 bp |
| pJTFlag-humancasein-CK2-His | NcoI + XhoI | 0.8% | 5231 / **2523** | 5231 / 68 | 2523 bp |

The gel percentage is the one that puts the informative band nearest the middle of the lane, where it
is easiest to size against a ladder. A 1 kb ladder (10000 8000 6000 5000 4000 3000 2000 1500 1000 500)
covers all of these, but its lowest marker is 500 bp, so the 524–644 bp bands would be sized against
a single marker just below them. A 100 bp ladder (1500 … 100) in the next lane brackets them properly
and is worth the extra lane.

Three things worth knowing about this table:

- The five pPIC9K rows were recomputed on 19 November 2026, when the route changed from XhoI + AvrII
  to BamHI + AvrII — §6 says why, and the old route's diagnostic could not see what went wrong with
  it. The constructs themselves are unchanged.
- For all seven of these the **cloning pair itself is the diagnostic**. XhoI cuts pPIC9K twice
  and AvrII once, so the digest gives three fragments; the first two (4757, 4480) run together as one
  thick band and are the same in every lane. The third is the insert, and it is different for every
  gene. One digest, one gel, five distinguishable constructs.
- Nothing in the panel distinguishes the pPIC9K builds by a *single* enzyme well — the inserts are
  only 500–1100 bp in a 9.3 kb vector, so a single cut shifts a 7 kb band by 6%, which is not a call
  anyone can make off a photograph. The double digest is not optional.
- αS2 and β-casein come out 890 and 896 bp, six bases apart, and **cannot be told apart** by this
  digest any more than by the colony PCR in §2. Keep those two apart on the bench.
- Backup digests, for when an enzyme is out of stock: ClaI reads all four caseins (the insert lands in
  a 1660 bp vector fragment and pushes it to 2148–2268 bp), and HindIII does the same from 370 bp to
  1195–1783 bp. HindIII is the clearer read of the two.

## 2. Colony PCR: one primer pair per vector, and what each colony should give

Designed across the insert junction, then checked by predicting products against every construct *and*
the empty vector. Each pair gives exactly one product on each template. No warnings on any of the six
primers — all 59–60 °C, so one annealing temperature does all three reactions.

**pPIC9K family** — F `CAGTTTTATTCGCAGCATCCTCCG` (59.4 °C), R `AGGCTGATCAGGAGCAAGCTC` (59.3 °C)

| Template | Product |
|---|---|
| empty pPIC9K | 482 bp |
| alphaS1 | 1060 bp |
| alphaS2 | 1084 bp |
| β-casein | 1090 bp |
| kappa | 970 bp |
| prochymosin | 1558 bp |

αS2 and β-casein are 6 bp apart and **cannot be told apart this way**. If both are being built in the
same session, keep the plates separate or fall back on the digest.

**pJTFlag family** — F `GAAGCAGCCCAGTAGTAGGTTGAG` (59.5 °C), R `AAGCACTAAATCGGAACCCTAAAGGG` (59.4 °C)
— empty 781 bp, S22E-Q38E 1348 bp, casein+CK2 3236 bp.

**pPICZ family** — F `CTACAACAGAAGATGAAACGGCACAAATTC` (59.8 °C), R `CCACAAGATATTCATCAGCTGCGAGATAG` (59.8 °C)
— empty 528 bp, Fam20C 1848 bp, Fam20A 1896 bp. Those last two are 48 bp apart; same caution.

These pairs sit in vector sequence, so they also work as sequencing primers reading into the insert
from either side.

## 3. Every construct's reading frame, checked by machine

> Derived again through pydna's own open-reading-frame search on 19 November, which agrees with this
> exactly — see §9. What follows is unchanged.

Until now the designs had been read through by hand. Done properly this time: for each construct, find
the open reading frame that runs through the insert, translate it, and check it contains the intended
protein exactly.

All nine pass.

| Construct | Leader | Gene | Tail |
|---|---|---|---|
| pPIC9K × 4 caseins | 85 aa α-factor, ending …EEGVS**REKR** | 169–209 aa | none |
| pPIC9K-prochymosin | same 85 aa | 365 aa | none |
| pPICZ-Fam20C / Fam20A | 85 aa, ending …EEGVS**LEKR** | 492 / 508 aa | none |
| pJTFlag-bovine-S22E-Q38E | Met-Gly | 209 aa | LEHHHHHH |
| pJTFlag-humancasein-CK2-His | three ORFs: casein@5076, CK2α@5753, CK2β@6946 | 211 / 391 / 214 aa | GSHHHHHH on the casein |

Both leaders end in the Kex2 site **EKR**, so the secreted protein should begin at the gene's own first
residue with nothing left over. The Met-Gly on the *E. coli* constructs is the NcoI site and was
deliberate.

### The tag, which was missing and now is not

The plan for the co-expression construct already recorded the consequence of ending the operon in a
stop: *"Because the operon ends in a stop, nothing carries the vector's His tag."* That was correct and
the record was honest. What the frame check added was the force of it — the vector's `CTCGAG CAC…CAC`
sits **behind CK2β's own stop codon**, so it reaches nothing at all, not even the kinase. The one
protein in the project most worth purifying, casein that has been phosphorylated inside a cell, was
the one that could not go on a nickel column.

Fixed and refiled on 18 November 2026. Twenty-four bases go in before the casein's own stop codon,
giving **Gly-Ser-His6** at its C terminus. Gene order, the copied ribosome binding sites and both CK2
subunits are untouched, and **only the casein is tagged** — so nickel pulls down the substrate and
leaves the kinase behind, which is what the phosphorylation readout wants.

A glycine-serine linker rather than the vector's Leu-Glu scar, because `CTCGAG` would add a second
XhoI site; with this linker no enzyme in a thirty-enzyme panel changes its count, so the NcoI + XhoI
diagnostic still reads. The tag is at the C terminus and the phosphoserines CK2 is predicted to reach
(3, 6, 8, 9, 10) are at the N terminus, so it should not sit where the kinase works. The chain goes
from 213 to 221 residues, 24.0 to 25.0 kDa, and pI 5.33 to 5.96.

In the lab: new part `pJTFlag-humancasein-CK2-His` (7754 bp, `cdseguid=dPXCUWTr_AwEEjOtS_UDtStw9WE`)
and its insert `human β-casein with C-terminal His6, E. coli codons` (657 bp); plan `2ac13267…` filed
and plan `26aeda39…` set aside. The old 7730 bp part stays in the lab, as an append-only log requires —
what changed is which plan is open.

## 4. What the protein gel should look like

| Protein | Length | Mass | pI | N-glyc sequons | Recorded phosphosites | With phosphate |
|---|---|---|---|---|---|---|
| αS1-casein | 199 aa | 23.0 kDa | 4.91 | 0 | 8 | 23.6 kDa |
| αS2-casein | 207 aa | 24.3 kDa | **8.34** | 0 | 11 | 25.2 kDa |
| β-casein | 209 aa | 23.6 kDa | 5.13 | 0 | 5 | 24.0 kDa |
| κ-casein | 169 aa | 19.0 kDa | 5.93 | 0 | 1 | 19.1 kDa |
| prochymosin | 365 aa | 40.5 kDa | 4.82 | **2** | 0 | — |
| Fam20C | 492 aa | 56.4 kDa | 6.49 | **3** | 0 | — |
| Fam20A | 508 aa | 57.6 kDa | 7.71 | **5** | 0 | — |

Four things follow from this table that were not obvious before:

- **A phosphate is 80 Da.** Even fully phosphorylated, αS1 moves 23.0 → 23.6 kDa. **A protein gel
  cannot tell phosphorylated casein from unphosphorylated casein.** Any plan that reads "run a gel and
  see if it is phosphorylated" needs replacing — with a phosphate stain, a phosphatase-shift control,
  mass spectrometry, or the calcium-binding assay, which is the one that actually matters.
- **No casein carries a single N-glycosylation sequon.** The hyperglycosylation that Pichia is
  notorious for cannot happen to them on asparagine. κ-casein's O-glycosylation is invisible to a
  sequon search, but it is not invisible to UniProt — see §5, where it turns out to matter.
- **The kinase is the one at risk of hyperglycosylation**: 3 sequons on Fam20C, 5 on Fam20A, all on a
  protein being sent through the secretory pathway. If the kinase comes out as a smear well above
  57 kDa, that is why, and the fix is to mutate the sequons (N→Q) rather than to change the host.
- **αS2-casein has pI 8.34.** The other three are acidic. One ion-exchange condition will not capture
  all four caseins; αS2 needs its own.

---

## 5. What the record already knows — UniProt, read properly

Added 19 November 2026, after a fair challenge: the list of things that "cannot be known without a
bench" was too long. Several of them are not open questions at all; somebody has already measured
them, and `@biolibs/uniprot` had been used here only to pull phosphosites. Read properly it carries
subcellular locations, domain boundaries, binding and active sites, cofactors, and **experimentally
evidenced** modifications rather than predicted ones.

### The mature-chain boundaries are right, and now verified rather than assumed

| | UniProt chain | Our construct | |
|---|---|---|---|
| FAM20C (Q8IXL6) | 93–584, 492 aa | 492 aa | ✓ |
| FAM20A (Q96MK3) | 34–541, 508 aa | 508 aa | ✓ |
| κ-casein (P02668) | 22–190, 169 aa | 169 aa | ✓ |

FAM20C has **no cleavable signal peptide** — its keywords are Signal-anchor, Transmembrane,
Transmembrane helix, Membrane. It is a type-II membrane protein whose ectodomain is released. Using
the mature chain behind the α-factor leader was therefore the right call, and that is now checked
against the record instead of taken on trust.

### The whole catalytic apparatus is inside what we are making

Kinase domain 354–565, active site 458, binding sites 269, 285, 306, 389–392, 463, 478. Every one is
downstream of residue 93, so in our 492-residue chain they sit at 262–473, 366, and 177 / 193 / 214 /
297–300 / 371 / 386. Nothing catalytic was truncated.

**FAM20C needs manganese.** Keywords: Manganese, Calcium, ATP-binding. That is a buffer condition, and
it matters for the in-vitro fallback in step C — phosphorylating purified casein with purified kinase
will not work in a plain magnesium buffer.

### The glycosylation risk is observed, not predicted — and the exact residues are known

| | Evidenced N-glycosylation sites, in our chain's numbering |
|---|---|
| FAM20C | 9, 243, 378 |
| FAM20A | 37, 112, 254, 355, 505 |

Three and five, exactly matching the sequon counts in §4 — but these are recorded observations. So the
risk of Pichia hyperglycosylating the kinase is real rather than hypothetical, and if it has to be
fixed, those are the asparagines to change.

### The finding that matters most: κ-casein's O-glycosylation is downstream of the rennet cut

UniProt records seven evidenced O-GalNAc sites on κ-casein, at chain positions **121, 131, 132, 133,
136, 142, 149** (alternating with a phosphoserine) and **165**, plus phosphosites at 127, 145, 149 and
166. A sequon search sees none of these, which is why §4 could say nothing about them.

Chymosin cuts κ-casein between **Phe105 and Met106** — checked, and both residues are present at
exactly those positions in our construct (…LS**FM**AIPP…).

**Every O-glycosylation site lies downstream of the cut.** The 64 residues chymosin releases as the
caseinomacropeptide carry all of them. So if Pichia O-glycosylates κ-casein — which it has been
reported to do — it decorates the piece that gets cut off anyway, and there is no reason from the
sequence to expect it to block clotting. That was on the "cannot be known" list. It is now a reasoned
expectation with a residue number behind it.

### Which blanks actually moved

- **Will it curdle** — moved. Not answered, but the specific worry that glycosylation would block the
  rennet cut is addressed above, and the cut site is confirmed present.
- **Will the kinase and the casein meet** — narrowed. FAM20C is recorded in the ER, the Golgi and as
  secreted; the caseins are recorded as secreted. The pathways overlap, and everything the kinase
  needs to work is present in what we are making. Still a bet, but no longer a bet in the dark.
- **Will anything express** — not moved by this. Still not computable.
- **Will it form micelles** — not moved by this, but it should not have been called unknowable either:
  it is a measurement people have published. `@biolibs/europepmc` finds the papers, including
  "Food-relevant functional properties of the four major bovine casein fractions" (2026, open access,
  PMID 43022366), **not yet read** — Europe PMC was returning 503s. That is the next thing to read.
- **Taste** — genuinely nothing.

### Still unused, and worth using

*All five were used the next day — see §6.*

- **`@biolibs/opencloning` / `@biolibs/assembly2` / `@biolibs/dseq`** — replay each build as a plan and
  see whether the stated route actually yields the product. Hand-splicing proved the sequence, never
  the procedure, and `dseq` ends refuse to ligate when they do not fit, which would catch an
  orientation error.
- **`@biolibs/features`** — check the vector's own working parts are intact in each construct: the AOX1
  promoter, the terminator, the selection marker. Needs a reference library assembling first.
- **`@biolibs/motifs`** — the FAM20C rule is applied here as a regex. A scored position-weight matrix
  built from the recorded sites would rank every serine rather than answering yes or no, and the same
  for CK2, which is what the 97%-against-54% comparison really rests on.
- **`@biolibs/align`** — transfer bovine phosphosite positions onto the human chain properly, instead
  of trusting that the numbering lines up.
- **`@biolibs/seqio`** — export the constructs as annotated GenBank, which is what a synthesis vendor
  and a collaborating lab both actually want to receive.

---

## 6. The five libraries that had not been used

Added 19 November 2026. Each of these was listed at the end of §5 as worth using. They were used.
Two of them found things that change what should be done.

### The stated route for five of the nine constructs would give the wrong plasmid half the time

`@biolibs/dseq` cuts a molecule and ligates the pieces with pydna's own rules, which refuse ends that
do not fit. Cutting each designed construct with its own cloning pair, then putting the pieces back
together every way the ends allow, answers a question the sequence alone never could: **is there more
than one circle this ligation can make?**

| Construct family | Route | Fragments | Circles of the right size it can make |
|---|---|---|---|
| pPIC9K × 5 | XhoI + AvrII | 3 | **2** |
| pJTFlag × 2 | NcoI + XhoI | 2 | 1 |

All seven reproduce the intended design — the sequences and the ends are right. But XhoI cuts pPIC9K
**twice**, at 4475 and 9232, so the digest gives three fragments and the largest, 4761 bp, carries the
same `tcga` overhang on *both* ends:

```
4761 [tcga | tcga]     618 [tcga | ctag]     4484 [ctag | tcga]
```

A fragment with two identical ends goes in either way round. Both arrangements close into a 9851 bp
circle; one of them has a 4761 bp block inverted, taking the AOX1 promoter region with it. And the
two cannot be separated on a gel beforehand, because the digest needs both large pieces and they are
only 277 bp apart in size — so the three-piece ligation is forced, not chosen.

**The §1 diagnostic cannot see it.** Both circles give *the same* XhoI + AvrII pattern:

| | XhoI + AvrII |
|---|---|
| the design | 4757 / 4480 / 614 |
| the inverted one | 4757 / 4480 / 614 |

Ten enzymes out of forty tell them apart. The clearest is **EcoRV**: the design gives 5077 / 4774,
which co-migrate as one thick band near 5 kb, while the inverted circle gives 7598 / 2253 — two
obviously different bands. One band against two, which is as easy a read as a gel offers.

**A route that cannot do this exists.** Replacing XhoI with a single-cutting enzyme upstream makes the
ligation two-piece and directional, and then there is exactly one product:

| Route | Fragments | Products | Cost |
|---|---|---|---|
| XhoI + AvrII | 3 | 2 | as filed |
| **BamHI + AvrII** | 2 | **1** | insert grows to 870 bp; it must carry the α-factor leader |
| PsiI + AvrII | 2 | **1** | insert grows to 664 bp, leader stays in the vector; blunt ligation |
| SacI + AvrII | 2 | **1** | insert grows to 1604 bp |

BamHI is in every freezer and leaves a sticky end at both ends. PsiI needs only 59 extra bases of
synthesis, keeps the α-factor leader in the vector where a mistake cannot be ours, and is still
directional — a blunt end can only pair with the other blunt end — but blunt ligations are less
efficient. Neither BamHI nor PsiI cuts inside any of the five inserts.

**Refiled on BamHI + AvrII**, 19 November 2026. Each of the five now has a two-fragment, directional
ligation, checked in silico to give exactly one product, and that product is the design — the
constructs are byte-for-byte unchanged, only the route and the fragment to be ordered are different.
The lab holds five new cassette parts with their sticky ends recorded:

| Cassette | Length | Ends |
|---|---|---|
| αS1-casein cassette for BamHI/AvrII | 870 bp | 4 / 4 |
| αS2-casein cassette for BamHI/AvrII | 894 bp | 4 / 4 |
| β-casein cassette for BamHI/AvrII | 900 bp | 4 / 4 |
| κ-casein cassette for BamHI/AvrII | 780 bp | 4 / 4 |
| prochymosin cassette for BamHI/AvrII | 1368 bp | 4 / 4 |

In each case the backbone the construct is cut into is byte-identical to the fragment the empty vector
itself gives, which is what makes this that route and not a lookalike. The five old plans are set
aside. §1's table is recomputed for the new digest. EcoRV is no longer needed: with two fragments and
different overhangs there is no orientation left to get wrong.

One thing the refile does not settle: the synthetic fragment now reaches from the BamHI site at 8980,
so it carries the end of the α-factor leader as well as the gene. A mistake in that stretch would be
ours rather than the vector's, and it is worth reading before anything is ordered.

### And the products are circles now

Every pPIC9K plan, through five rounds of refiling, had recorded its product as a **linear** molecule.
A ligation makes a ring. Fixed the same day, and the slip turned out to start at the root: the empty
vector itself was in the lab as a 9,273-base line, when pPIC9K is a plasmid.

Each of the five was re-verified on the new topology before anything was filed — cut as a circle,
re-ligated every way the ends allow, one product each, and that product the intended ring. So the
sequences never changed; what changed is that the lab now says what kind of molecule they are.

| | |
|---|---|
| open plans whose product is a circle | **9 of 9** |
| pPIC9K (Z46234.1), as a plasmid | `cdseguid=WKWneuTMjLY7SR1eVkY4OA8lZBo` |
| pPIC9K-alphaS1-secreted | `cdseguid=Fj20eGLjoodknuqJDdBMVYONNeQ` |
| pPIC9K-alphaS2-secreted | `cdseguid=eY7Q7rBW4fcQE44HGVmIZB7_FuY` |
| pPIC9K-bovine-casein-secreted | `cdseguid=WXneHcyxeIH6DpyIixvqmTD45QE` |
| pPIC9K-kappa-secreted | `cdseguid=IltDLrAwB0pzMWyNqg5LxC9p7Go` |
| pPIC9K-prochymosin-secreted | `cdseguid=04eELpqPv21bzezwejkrItx9j9M` |

Plans `f317ad4a…`, `b2f25824…`, `6ae0d9d7…`, `bafa7c22…` and `0424768d…` are the open ones. The six
lines they replace are still in the log, as an append-only log requires, each now carrying a
`superseded` field saying why — the freezer shows two parts under one name and the field is what tells
them apart.

**A changed checksum is a changed identity**, which is the point of counting them this way: the same
bases as a ring and as a line are two different molecules. Linearising for integration into the AOX1
locus is a real step and still has to happen — it is simply a later step, and deserves a plan of its
own rather than being folded into the product of a ligation.

### Republishing it found one more thing

The method was published again so that it would name the circles. Reading its steps afterwards showed
it was not yet coherent: the **transformation** plans had never been refiled, so six of them still
named molecules the lab had set aside — five linear pPIC9K constructs, and the casein-and-CK2 plasmid
in the version whose casein carried no tag. The assembly steps made one set of plasmids and the
transformation steps took another.

Worth noting how that was missed. `takeMethod` had already reported **18 steps proposed, 0 missing**,
and it was right to: it reports a molecule as missing only when the taking lab has never heard of it,
and a method that writes out its sequences tells the lab about everything in it, coherent or not. A
clean round trip says the document can be read, not that it makes sense. So the check now also asks
the question the round trip cannot: **is every molecule a step uses either made by an earlier step or
named in what the method asks a lab to start from?**

| | before refiling the transformations | after |
|---|---|---|
| steps proposed in a lab founded from nothing | 18 of 18 | 18 of 18 |
| molecules used that nothing makes or asks for | **6** | **0** |
| superseded molecules named anywhere in it | 6 | 0 |
| circular against linear references | 32 / 32 | 30 / 22 |

The six transformations are refiled; all nine now take the plasmids the assembly steps make. The
method in `~/Downloads/method.json` is the corrected one, and the one published on the 18th is kept
beside it as `method-2026-11-18.json` rather than overwritten, since a lab may be holding it.

Two parts, `pPIC9K-Fam20C-secreted` and `pPIC9K-Fam20A-secreted`, are still lines. They are leftovers
from plans the pPICZ versions superseded, so nothing open points at them, and they were left alone.

### The vector deletes its own tag, in both families

`@biolibs/features` was given each vector's annotated parts, taken straight from its GenBank record
through `@biolibs/entrez` and `@biolibs/seqio`, and asked which survive in each construct.

- **pPIC9K**: all seven annotated elements present in all five constructs. Nothing lost.
- **pJTFlag**: the constructs lose the multiple cloning site, as they must — and **the FLAG tag**,
  which sits inside the NcoI–XhoI stuffer at 5112. A vector called pJTFlag delivers no FLAG tag here.
  That is an independent confirmation of yesterday's fix, found a different way.
- **pPICZ**: the constructs lose the MCS and the annotation covering "alpha factor secretion
  signal/UV-Tag/6×His". The α-factor signal itself survives — it is separately annotated and is
  found — so what is gone is the **vector's own 6×His**, and §3 agrees: both kinase constructs end with
  no tail at all. **Neither kinase is tagged.**

For the in-cell experiment that does not matter. For step C's fallback — purified kinase on purified
casein — it does, because there is no handle on the kinase either. The same decision as yesterday,
now for FAM20C and FAM20A.

### A scored motif, and an honest measure of how well it does

`@biolibs/motifs` builds a position-specific scoring matrix over a protein alphabet quite happily;
`pssm.calculate` refuses one, because it is a faithful port of Bio.motifs, whose scanner is DNA-only
("Use only with DNA motifs"), so the window is summed off the matrix instead. The background is the
caseins' own residue composition, not a flat alphabet — these proteins are already unusually rich in
glutamate and serine, and a flat background would credit the motif for what is merely casein.

First, the two rules re-derived from UniProt rather than by hand, over all 31 recorded phosphosites in
the four bovine caseins:

| | matches |
|---|---|
| FAM20C, S-x-E | **26 of 31** |
| CK2, S/T-x-x-D/E | **12 of 31** |
| neither | 4 |

These supersede the 27/31 and 14/31 quoted earlier, which were counted by hand. The shape of the
argument is unchanged and slightly strengthened.

Then the matrix. Scored against the 104 serines and threonines in the four chains, the top twenty
scores are all recorded sites, and all 31 fall in the top 50. That figure is **circular** — the matrix
was built from those same sites. Leaving each site out and rebuilding the matrix from the other 30
gives the honest number:

| | |
|---|---|
| recorded sites in the top 31 of 104 | **18 of 31** |
| median rank of a recorded site | **21 of 104** |

Useful, not decisive. And informative in where it fails: the worst-ranked are β 35S (rank 62), αS1 41S
(55), and **all four κ-casein sites** (47, 53, 53 and one more). The matrix has learnt the clustered
acidic sites — the `SSSEE` kind — and misses the isolated ones. κ-casein's sites are all isolated,
which is one more way in which κ is the odd one out: it binds no calcium, its sites sit in the piece
rennet cuts off, and now its sites are the ones no motif predicts.

### The numbering did line up, but not for the reason assumed

`@biolibs/align` on the two mature chains, BLOSUM62, global:

| bovine | → human |
|---|---|
| 15S | 6S |
| 17S | 8S |
| 18S | 9S |
| 19S | 10S |
| **35S** | **26H — a histidine** |

So the clusters are homologous after all; a nine-residue deletion in the human chain accounts for the
offset, and transferring bovine numbers directly would have been wrong by nine. Three things follow:

- **Bovine β-casein and human β-casein are only 58% identical** (115 identities over 199 aligned
  residues). These are not interchangeable proteins.
- **The bovine fifth site has no human counterpart.** Bovine S35 aligns to a histidine. So even a
  complete success repeating Thurmond 1997 on the human chain would say nothing about bovine S35 —
  and S35 (`KFQSEEQ`) matches the FAM20C rule and **not** the CK2 rule. The site CK2 cannot reach is
  precisely the one the human experiment cannot test.
- **Human site 3 is a phosphothreonine, not a phosphoserine.** The plan's note says "all five
  phosphoserines UniProt records on the human chain (3, 6, 8, 9, 10)". The positions are right; site 3
  is T. CK2 phosphorylates threonine, so the prediction survives, but the wording is wrong.

### The constructs, as files a collaborator can open

`@biolibs/seqio` writes all nine out as annotated GenBank, each carrying the vector's own elements
found by `features` plus our CDSs with their translations, in `cheese-constructs/`. All nine read back
byte-identical in sequence and still circular. This is what a synthesis vendor or another lab wants to
receive, rather than a bare string.

---

## 7. All forty-two, counted

Added 19 November 2026. Twice now this project has recorded something as impossible to know when the
answer was in a package nobody had opened. Once is a mistake; twice is a habit, and a habit is not
fixed by resolving to read the documentation. So here is the list, and from now on a claim that
something cannot be known has to be made against it rather than against memory.

### Used, and what for

| | |
|---|---|
| `bionet` | the protocol: the signed log, parts, tubes, plans, checksums |
| `bionet-client`, `bionet-react`, `bionet-panels`, `bionet-tools`, `bionet-scene`, `bionet-space`, `bionet-theme` | the lab on this device, and the window onto it |
| `seq` | translation, every reading-frame check in §3 |
| `seqtools` | GC content, melting temperatures, molecular weights |
| `seguid` | the checksum that is a molecule's identity |
| `restriction` | all 1,088 enzymes; the panel searched in §1 |
| `cloning` | where they cut, and the pieces |
| `gel` | the bands each digest would show, and which a gel resolves |
| `pcr` | the colony-PCR pairs in §2, and what they would amplify |
| `dseq`, `dseqrecord` | sticky ends that refuse to fit — the route check in §6 |
| `assembly2` | the ligation engine under it |
| `opencloning` | the signing keys the log is written with |
| `entrez` | the three vectors' GenBank records |
| `uniprot` | chains, modified residues, cofactors, structures — §5 |
| `europepmc` | the literature, searched rather than remembered |
| `features` | the vector's own elements, found in each construct rather than assumed |
| `motifs` | the scored FAM20C matrix, and its leave-one-out test |
| `align` | bovine casein against human, and the phosphosites between them |
| `seqio`, `seqrecord`, `seqfeature` | the nine annotated GenBank files |
| `core` | Python's semantics, under all of it |
| **`pdb`, `pdblist`** | **new today — see below** |

### Not applicable, and why

- `phylo`, `nexus` — trees and the files that carry them. Nothing here asks a tree question; which
  species' casein to make was settled by wanting cheese.
- `bionet-peer` — the server side. `lab-wren` runs it; this project is a client of it.
- `bionet-demo`, `glossary`, `glossary-react` — a made-up lab and the words, for somebody learning
  the app rather than using it.

### Unused, applicable, and still worth doing

- **`seqmap`** — the geometry behind a plasmid map. The figure generator for the BioCurious document
  was lost with a scratchpad, and this is what would rebuild it properly rather than by hand.
- **`seqedit`** — edits a record while keeping its features true, moving every location. Adding the
  His tag was done by slicing strings, which is how the features were left behind.
- **`bionet-agent`** — an adviser with no hands, which may add parts and propose runs and nothing
  else. Every proposal in this lab was written by a person at a keyboard; this is the thing that
  could have written them.
- `assembly`, `svdsuperimposer` — the common-substring matcher and least-squares superposition. Both
  marginal here: the routes are restriction-based, and superposition wants two structures to compare.

So: 28 used, 5 that genuinely do not apply, 4 that apply and have not been used. Not one of those 4
is a blocker — they are work not yet done, which is a different thing and should be said differently.

**Three of the four were used the same day; §8 says what each found.** Superposition is the one left,
and it stays marginal until there is a second structure worth comparing against.

### What the two new ones found

`uniprot` lists one structure for FAM20C and four for FAM20A, and **5YH3 is both of them together**:
chains A and B are FAM20A 63–529, chains C and D are FAM20C 141–578. FAM20A is a pseudokinase that
binds FAM20C, and the two are being co-expressed here on the strength of that. Whether the stretch of
each protein that touches the other is inside what these constructs actually make is not a question a
sequence can answer.

`pdblist` fetches it and `pdb` reads it, so it was asked. Every residue of one chain with an atom
within 4 Å of the other:

| | our construct | contact residues | spanning | outside our construct |
|---|---|---|---|---|
| FAM20C | 93–584 | 19 | 297–413 | **none** |
| FAM20A | 34–541 | 18 | 214–365 | **none** |

The whole interface is inside both constructs, with room either side. So the mature-chain boundaries
taken from UniProt in §5 are not merely the right chains — they keep the surface by which these two
proteins recognise each other. That does not say the complex will form in a yeast secretory pathway,
which remains the project's central bet. It does say the parts needed for it to form are being made.

---

## 8. The three that were left, used

Added 19 November 2026, straight after §7 listed them. Each took under an hour, which is itself the
finding: none of these was a hard thing waiting on a decision.

### `seqedit` — the tag, put in properly

The His tag was added by slicing strings. `insertBases` does it on a record and moves every feature
after the cut, so the same edit was done again as a check: insert 24 bases at 5709 of the untagged
construct.

```
before   casein 5076..5709   CK2α 5729..6902   CK2β 6922..7564
after    casein 5076..5709   CK2α 5753..6926   CK2β 6946..7588
```

The molecule that comes out is `cdseguid=dPXCUWTr_AwEEjOtS_UDtStw9WE` — the one the lab plans to
make, so the string surgery was right.

**But look at the casein.** Both subunits moved by exactly 24 and the casein did not grow. That is
not a bug: an insertion exactly at a feature's end is ambiguous, and `seqedit` resolves it by leaving
the feature alone. Checked on a bare case — a feature at 10..20, three bases inserted:

| inserted at | the feature becomes |
|---|---|
| 9, before it | 13..23 — moved |
| 15, inside it | 10..23 — grown |
| 20, its end | 10..20 — **unchanged** |
| 21, after it | 10..20 — unchanged |

So **a C-terminal tag added this way sits outside the coding sequence it belongs to** unless somebody
extends the feature deliberately. The exported GenBank in `cheese-constructs/` has it right, because
those features are found by matching parts rather than carried through an edit. Anyone editing a
record by hand should know this.

### `seqmap` — the maps that were lost

The figure generator for the BioCurious document went with a cleared scratchpad, and the document has
been waiting on it. `seqmap` is the geometry: `ringPath` for a feature's arc, `packLanes` to stack
what sits inside something else, `tickStep` and `tickPositions` for the scale.

Nine plasmid maps are in `cheese-constructs/maps/`, drawn from each construct's GenBank features —
every feature an arc pointing the way it is read, labelled around the ring, with the nested ones in
lanes above their parent, the scale ticked, and the length and topology in the middle. Each says
*designed, not yet made* on its face, because every one of them is.

### `bionet-agent` — what an adviser can already do

Opened against a copy of the real lab, with nothing reaching outside it, an adviser is handed **41
tools, 10 of which write**. Among the ones that only read:

| | |
|---|---|
| `design_the_construct` | "Put a promoter, a signal, a gene and a tag together… and check that the protein survives it" |
| `design_assembly` | design a ring from several pieces, through the ligation engine |
| `work_out_digest`, `work_out_ligation`, `work_out_pcr` | the benches, without a bench |
| `check_read` | a sequencing read against the design |
| `write_out_the_method`, `write_out_the_protocol` | the method, and the sheet to carry |
| `count_codon_usage`, `optimise_codons`, `translate_gene` | the codon work |

Run on the casein, `design_the_construct` gives back the assembled sequence, the protein, each piece
marked with where it lies, the junctions between them, and weighted checks — on the bare gene it says
"The translated stretch does not begin with methionine" and "There is no stop codon at the end",
both true of it and both answered by the vector.

**This is the sharpest thing in the audit.** The construct designer that checks the protein survives
the assembly already existed, and every construct in this project was put together by hand instead,
including the one where the tag went missing. That is not a limitation of the software. It is a tool
that was there and was not picked up.

The ten that write are how a key with no hands proposes work: `propose_assembly`, `propose_pcr`,
`propose_digest`, `propose_ligation`, `propose_transformation`, `propose_induction`, `add_part`,
`keep_from_ncbi`, `file_the_work`, `withdraw_proposal`. Everything in this lab was proposed by a
person at a keyboard. Nothing says it had to be.

---

## 9. Where this was hand-rolled over a port, and what happened when it was not

Added 19 November 2026, on a standing instruction: **where biolibs carries a port of something the
bio community already supports, use the port.** Not because the port is faster to reach for, but
because a result that came out of it is one anybody working in Biopython or pydna can check against
the upstream they already trust. A result from five lines written here is a claim rather than a
property.

Three places in this document were derived by hand. They were gone back over.

### The reading frames — a genuine violation, now fixed

§3 said every construct's frame had been "checked by machine". The machine was an open-reading-frame
walk written here, a loop over codons. pydna has one — `threeFrameOrfs`, ported in `@biolibs/dseq`
along with the surprising way pydna turns a length limit into a codon count. So §3 was derived again
through it, over each ring read twice so a frame may wrap the origin:

| | start | frame | leader | gene | tail |
|---|---|---|---|---|---|
| pPIC9K × 4 caseins | 8990 | 2 | 85 | 169–209 | 0 |
| pPIC9K-prochymosin | 8990 | 2 | 85 | 365 | 0 |
| pPICZ-Fam20C / Fam20A | 940 | 1 | 85 | 492 / 508 | 0 |
| pJTFlag-bovine-S22E-Q38E | 5070 | 0 | 2 | 209 | 8 |

**It agrees with the hand-written search exactly** — the same starts, the same leaders, the same
genes, the same tails. So §3's claim stands, and now stands on something somebody else can check.

### The junction — not a violation, and worth saying why

The other hand-written piece finds where a construct stops matching the vector it came from: a common
prefix and a common suffix. `Bio.Align` is a port and looks like the tool for it, so it was tried.

It is the wrong tool, and the reason is instructive. An aligner optimises a score, so with ordinary
gap penalties it finds five blocks rather than two — eleven bases of the gene happen to match eleven
bases of the vector, and matching them beats opening a gap. With a gap penalty stiff enough to stop
that, it settles on two blocks and describes pPIC9K-alphaS1 as **578 bases inserted at 9264, with the
vector losing nothing**, where the prefix-and-suffix walk says **600 bases replacing 22, from 9245**.

Both describe the same molecule. The difference is that the alignment's blocks are ungapped but not
identical: that first block of 9,264 bases carries **12 mismatches**, and the 9-base block after the
insert carries 2 more. Fourteen bases the aligner calls aligned are bases that differ.

That is the right answer to "what is the best alignment of these two" and the wrong answer to "which
bases are identical". The second question is exact and has no Biopython counterpart, so the short
exact function is correct here. The rule is to use the port where one exists for the question being
asked — not to force the nearest port and quietly change the question.

### What stays hand-written, and why

- **The insert span**, as above.
- **Scanning a protein with a position-weight matrix** (§6). `@biolibs/motifs` builds the matrix over
  a protein alphabet quite happily; its `calculate` refuses one, because `Bio.motifs` scanning is
  DNA-only and the port is faithful to that. The matrix is the port's; only the summing is not.
- **The S-x-E and S/T-x-x-D/E tests** (§6) and the N-glycosylation sequon search (§4). These are
  rules read out of the literature, not algorithms with an upstream.
- **Band comparison** (§1) and the **virtual gel** it rests on. `@biolibs/gel` says plainly it has no
  Biopython counterpart; there is nothing to defer to.

Everything else in this document went through a port: translation and the genetic codes through
`seq`, enzymes through `restriction`, cutting and ligation through `cloning`, `dseq` and `assembly2`,
primers and products through `pcr`, alignment through `align`, matrices through `motifs`, files
through `seqio`, structures through `pdb` and `pdblist`, and the records themselves through `uniprot`
and `entrez`.

---

# The conditional: what to do about each outcome

Each step says what is being asked, what the answers can be, and where each answer leads. Nothing
below depends on a result nobody has yet.

### A. Build the plasmids

**Colony PCR (§2), then the diagnostic digest (§1) on two colonies.**

- *Right size on both* → sequence across the junction with the §2 primers, then **B**.
- *Only the empty-vector size* → the vector religated. The insert was absent or the ends were wrong.
  Re-cut, gel-purify the large fragment away from the 36 bp stuffer, and raise the insert:vector ratio.
- *Right size but the sequence is wrong at the junction* → an end filled in or chewed back. Check
  which; a single-base slip at the Kex2 junction destroys the whole cassette, and §3 is the check that
  catches it.
- *No product at all, from any colony* → the PCR, not the build. The §2 primers give one product on
  the empty vector too, so the empty-vector lane is the positive control. If that is blank, fix the
  reaction before concluding anything about the plasmids.

### B. Get Pichia to secrete *something*

**Transform, select on zeocin or G418, induce on methanol, run the supernatant on a 12% protein gel
against the broad ladder.**

- *A band near the predicted mass (§4)* → **C**.
- *Nothing in the supernatant, something in the cells* → the α-factor leader did not get it out, or it
  is stuck in the periplasm. This was reported for κ-casein in Pichia, so expect it there first. Try a
  different leader before trying a different host.
- *A smear above the predicted mass* → hyperglycosylation. For the caseins this cannot be N-linked
  (§4), so look at O-linked. For the kinase it is almost certainly the sequons, and the fix is in the
  sequence.
- *A band well below the predicted mass* → proteolysis. Caseins are intrinsically disordered — 16.7%
  proline in β-casein against 4.6% in chymosin — so this is the expected failure mode for all four,
  not a surprise for κ alone. Protease-deficient strain, lower temperature, shorter induction, or
  harvest earlier.
- *Nothing anywhere* → check copy number before changing the design. A zeocin gradient sorts
  multi-copy integrants from single-copy ones, and five copies gave 4.5× the protein in the
  literature. Also check the integration actually happened: the §2 primers amplify from genomic DNA.

### C. Find out whether it is phosphorylated

This is the one that decides whether the project works, and §4 says a plain gel cannot answer it.

- Run the casein **with and without** co-expressed Fam20C, side by side.
- Read it by phosphate-specific stain, or by treating half the sample with a phosphatase and looking
  for a shift, or by mass spectrometry if anyone has access.
- *Phosphorylated* → **D**.
- *Not phosphorylated, with the kinase co-expressed* → the ordering question. Is the kinase being made
  at all (its own band, §4)? Is it reaching the same compartment as the casein? Fam20C works in the
  Golgi; both proteins are going through the secretory pathway, which is the reason for this design,
  but it has not been shown to work. If the kinase is present and the casein is not phosphorylated,
  the next thing to try is phosphorylating purified casein *in vitro* with purified kinase, which
  separates "the kinase does not work" from "the two never meet".
- *Phosphorylated without the kinase* → something endogenous is doing it. Worth knowing; Fam20C has
  no yeast homologue, so this would be a genuinely new observation.

### D. Does it behave like casein?

- **Calcium binding.** The whole point of the phosphate. αS1 carries 52% of the binding capacity of
  the four, so test that one first. κ-casein binds no calcium at all and is not a useful readout here.
- **Micelle formation**, at the published 38:10:40:12 ratio of αS1:αS2:β:κ, with calcium and phosphate.
- **Rennet cut.** Chymosin cuts κ-casein at Phe105-Met106. A cut that happens, in a micelle, is the
  thing that turns the mixture into curd. This is the end of the road and the first result that looks
  like cheese.

Failures here are not failures of the molecules — they are the recipe, and they are where someone who
has made cheese is worth more than someone who has read about it.

---

# What cannot be simulated, honestly

Said plainly, because the list above might suggest more than it should.

- **Whether anything expresses.** Codon usage, GC content and the absence of cryptic signals say a gene
  is not obviously broken. They do not predict yield, and nothing does. (§5 revises the rest of this
  list: several items once on it were not unknowable, only unlooked-up.)
- **Whether a protein folds.** Caseins are meant not to; chymosin and the kinase are meant to.
- **Whether the kinase and its substrate meet in the same compartment.** This is the project's central
  bet and it is not computable. §7 narrows it a little further: the surface by which FAM20A and
  FAM20C recognise each other is inside both constructs, so the parts are being made.
- **Secretion efficiency, proteolysis, glycosylation extent, integration copy number.** All host
  behaviour.
- **Micelle formation and curd.** Colloid chemistry at a scale no sequence tool touches.
- **Taste.**

The simulation's job is to make sure that when a result does come in, it means something — that the
gel was the right gel, the band was the right band, and the next step was decided before the result
arrived rather than after.

---

# Software this turned up

Things the application should do that it cannot:

- **A digest-and-gel tool.** `@biolibs/cloning` and `@biolibs/gel` do all the work above; nothing in the
  desktop app exposes it. A construct in the lab should be able to show "cut it with this, expect
  these bands, and here is the empty-vector lane beside it".
- **A plan should be told when its route has more than one answer.** §6 found a route that makes two
  different plasmids, and the lab accepted it without complaint: a plan records what it expects, and
  nothing checks whether the inputs and the stated cuts could also give something else. `@biolibs/dseq`
  answers this in a dozen lines. It is the strongest candidate for the next tool, because it catches a
  class of mistake no amount of reading the sequence will.
- **Annotated export.** `@biolibs/seqio` writes GenBank; the app can only hand over a sequence. A
  construct should leave the lab as a file with its features on it.
- **A plan should be able to carry its own check.** The digest and the colony PCR in §1 and §2 belong
  attached to the plan they verify, so that whoever runs it knows what to look for. There is no place
  to put them.
- **An expectation is not a result.** Everything above is a prediction about a tube that does not
  exist. The protocol has no way to record one, and no way to record later that it was met or missed —
  which is exactly the record this project most needs to keep.
