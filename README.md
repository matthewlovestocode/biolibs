# biolibs

TypeScript ports of Python bioengineering libraries, verified case by case against the originals — plus a
few packages that have no Python equivalent.

- **23 packages**, npm workspaces, ESM only, Node 20 or later, generated `.d.ts`
- **2,662 API items at parity** across three upstream libraries, of 2,693 applicable
- **17,556 tests**, replaying answers recorded from the real Python libraries

> **Not published to npm yet.** Clone and build; see [Building](#building).

## What "parity" means here

Not "we think it behaves the same". A generator in [`reference/`](reference/README.md) drives the real
Python library and records what it does — the return value, the exception type *and message*, the warnings,
the order of evaluation — into a JSON file. The TypeScript tests replay those recordings. A case passes
only if every one of those matches.

So an item is ticked when a recorded case proves it, and the checklists below are generated from those
cases rather than maintained by hand.

| Upstream | Verified | Checklist |
|---|---|---|
| Biopython 1.88 | **2,417 / 2,448** | [docs/parity/](docs/parity/README.md) |
| pydna 5.5.16 | **222 / 225** | [docs/parity-pydna/](docs/parity-pydna/README.md) |
| seguid | **23 / 23** | [docs/parity-seguid/](docs/parity-seguid/README.md) |

The three unverified pydna items are `Dseqrecord.format`, `write` and `figure`. Items that exist only
because Python inherits them, and behaviour that is genuinely undefined upstream — where Biopython reads
uninitialised memory, say — are marked rather than claimed; each checklist says which and why.

The 31 outstanding items are all in `Bio.PDB.internal_coords`, which was added to the inventory last and
is the one module not finished: 72 of its 103 applicable items are verified. What is missing is listed in
[`@biolibs/pdb`](packages/pdb#what-is-verified) — chiefly `IC_Residue`'s per-angle accessors and
`IC_Chain`'s distance-plot functions.

## Ports of Biopython

| Package | Replaces | At parity | Notes |
|---|---|---|---|
| [`@biolibs/seq`](packages/seq) | `Bio.Seq`, `Bio.Data.CodonTable`, `Bio.Data.IUPACData` | 219 | `Seq`, `MutableSeq`, all 27 genetic codes, the IUPAC tables, undefined and partially defined content. [README](packages/seq/README.md) |
| [`@biolibs/seqfeature`](packages/seqfeature) | `Bio.SeqFeature` | 163 | eight kinds of fuzzy position, `SimpleLocation`, `CompoundLocation`, the GenBank/EMBL location grammar both ways, `SeqFeature`, `Reference`. [README](packages/seqfeature/README.md) |
| [`@biolibs/seqrecord`](packages/seqrecord) | `Bio.SeqRecord` | 25 | slicing and concatenation that carry features and per-letter annotations, `reverseComplement`, `translate`, 26 output formats. [README](packages/seqrecord/README.md) |
| [`@biolibs/seqio`](packages/seqio) | `Bio.SeqIO` | 81 | 49 formats in and 26 out — text, binary and XML — plus `index`. `index_db` is not ported: its index lives in an SQLite file. [README](packages/seqio/README.md) |
| [`@biolibs/align`](packages/align) | `Bio.Align` | 175 | `PairwiseAligner` with scoring and alignment, `Alignment`, `MultipleSeqAlignment`, the substitution matrices, `CodonAligner`, dN/dS, and every alignment file format Biopython reads or writes. [README](packages/align/README.md) |
| [`@biolibs/phylo`](packages/phylo) | `Bio.Phylo` | 489 | `Tree`/`Clade` with search and editing, Newick, NEXUS and phyloXML both ways, consensus, UPGMA, neighbour joining, parsimony. NeXML, CDAO and drawing are not ported. [README](packages/phylo/README.md) |
| [`@biolibs/pdb`](packages/pdb) | `Bio.PDB` | 471 | the structure hierarchy with disorder, `PDBParser`, `MMCIFParser`, `PDBIO`, `MMCIFIO`, header parsing, `Vector`, `Polypeptide`, `Superimposer`, `NeighborSearch`/`KDTree`, SASA — plus internal coordinates both ways. DSSP needs an external program. [README](packages/pdb/README.md) |
| [`@biolibs/restriction`](packages/restriction) | `Bio.Restriction` | 491 | 1,088 enzymes: `search`, `catalyse`, `RestrictionBatch`, `Analysis` and its text layouts |
| [`@biolibs/motifs`](packages/motifs) | `Bio.motifs` | 173 | `Motif`, position matrices, scoring, thresholds, and the JASPAR, TRANSFAC, Cluster-Buster, MEME, MAST, AlignACE, XMS and PFM readers |
| [`@biolibs/nexus`](packages/nexus) | `Bio.Nexus` | 84 | the `Nexus` class, `Tree`, `Node`, `StandardData`, `StepMatrix`, `combine`, `consensus` — and `bootstrap`, `randomize` and `display`, which need Python's own random number generator |
| [`@biolibs/seqtools`](packages/seqtools) | `Bio.SeqUtils` | 39 | GC content and skew, `nt_search`, `seq1`/`seq3`, molecular weight, six-frame translations, codon adaptation, checksums, `lcc`, `ProtParam`, `IsoelectricPoint`, `MeltingTemp` |
| [`@biolibs/svdsuperimposer`](packages/svdsuperimposer) | `Bio.SVDSuperimposer` | 7 | least-squares superposition by SVD |

## Ports of pydna and seguid

| Package | Replaces | At parity | Notes |
|---|---|---|---|
| [`@biolibs/dseq`](packages/dseq) | `pydna.dseq`, `pydna.alphabet`, `pydna.seq` | 128 | double-stranded DNA whose sticky ends, nicks and circularity are part of the molecule, one letter per base *pair*; plus pydna's own `Seq` and `ProteinSeq` |
| [`@biolibs/dseqrecord`](packages/dseqrecord) | `pydna.seqrecord`, `pydna.dseqrecord`, part of `pydna.utils` | 92 / 95 | that molecule with a name, features and annotations; cutting, joining, rotating — every operation carrying the features with it |
| [`@biolibs/assembly`](packages/assembly) | `pydna.common_sub_strings` | 2 | the shared-homology matcher Gibson assembly and homologous recombination both start from |
| [`@biolibs/seguid`](packages/seguid) | [seguid](https://github.com/seguid/seguid-python) | 23 | SEGUID v2 checksums: one identifier for a sequence however it is rotated, and whichever strand you call watson |

`pydna.assembly2` itself is not ported yet — it needs `pydna.contig` and a provenance model built on
pydantic. See [docs/dseqrecord.md](docs/dseqrecord.md) for what remains.

## Not ports

Biopython has no equivalent of these, so they add nothing to the checklists. They are tested against
invariants, round trips and published figures instead — and where their behaviour *does* overlap
Biopython's, that part is still recorded and replayed. See
[docs/README.md](docs/README.md#testing-without-a-reference-implementation).

| Package | What it does |
|---|---|
| [`@biolibs/seqedit`](packages/seqedit) | Edit a record and keep its features true: replace, insert, delete, extract, rotate, reverse complement — across a circular origin too, with every location moved, stretched or clipped |
| [`@biolibs/pcr`](packages/pcr) | Primer quality and warnings, binding sites with mismatch tolerance, predicted products, primer design, 5' tails |
| [`@biolibs/cloning`](packages/cloning) | DNA ends and which of them ligate, digests, ligation and re-ligation, restriction cloning products, Gibson assembly and overlap primer design |
| [`@biolibs/features`](packages/features) | Find known elements against a library of reference pieces, both strands, mismatch-tolerant, across a circular origin; turn hits into features and skip what is already annotated. No library is bundled |
| [`@biolibs/gel`](packages/gel) | A virtual agarose gel: log-linear migration, four concentrations, ladders, band merging, fragment sizes from cut positions |
| [`@biolibs/seqmap`](packages/seqmap) | Plasmid and linear map geometry: positions on a circle or line, feature arcs and arrows as SVG paths, round tick intervals, lane packing, label de-collision |

[`@biolibs/core`](packages/core) underpins all of them: Python-style errors and warnings, the
compatibility helpers that let a port reproduce Python's `int()`, `repr()`, `round()`, `%` and `random`, a
zlib inflate *and* deflate that matches zlib's own bytes, and SHA-1 with base64. It is not on the
Biopython checklist, because it is a port of CPython itself: 1,253 recorded cases say so.
[README](packages/core/README.md)

## Building

```bash
npm install
npm run build      # tsc -b
npm test           # vitest — 17,556 tests
npm run coverage   # per-file coverage
```

Re-recording the parity cases needs Python and the real libraries:

```bash
python3 -m venv reference/.venv
reference/.venv/bin/pip install biopython scipy pydna seguid cai2
npm run golden     # re-record every case, then regenerate the checklists
```

A regeneration must reproduce the committed files byte for byte; one that does not is treated as a bug in
the generator. [`reference/README.md`](reference/README.md) explains the three ways that has gone wrong and
how each is now caught.

## Documentation

Per-package reference, conventions and examples: [docs/](docs/README.md).

## Licence

MIT — see [LICENSE](LICENSE).
