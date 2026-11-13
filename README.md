# biolibs

TypeScript libraries replacing common Python bioengineering tooling. The goal is full feature parity with each Python library, one at a time, verified against the real library. See [PARITY.md](PARITY.md) for progress. npm workspaces monorepo; each package is ESM with generated `.d.ts`.

Most packages are ports. The six listed under [Bioengineering packages](#bioengineering-packages) are not: they do things Biopython has no equivalent of, and are built on the ports rather than translated.

## Ports

| Package | Replaces | Contents |
|---|---|---|
| `@biolibs/core` | – | `SeqRecord`, `BioError` |
| `@biolibs/seq` | Biopython `Bio.Seq`, `Bio.Data.CodonTable`, `Bio.Data.IUPACData` | **At parity**: `Seq`, `MutableSeq`, all 27 genetic codes, IUPAC data (verified against Biopython 1.88) |
| `@biolibs/seqfeature` | Biopython `Bio.SeqFeature` | **At parity**: positions, `SimpleLocation`, `CompoundLocation`, `Location.fromstring`, `SeqFeature`, `Reference` |
| `@biolibs/seqrecord` | Biopython `Bio.SeqRecord` | **At parity**: `SeqRecord`, slicing, `+`, `reverseComplement`, `translate`, per-letter annotations |
| `@biolibs/seqio` | `Bio.SeqIO` | FASTA, FASTQ/QUAL, GenBank, EMBL, IMGT, tab, PIR, SwissProt, PHD, IntelliGenetics, seqXML, the binary formats, the alignment formats, PDB and mmCIF sequences (SEQRES and atoms), GFA, UniProt XML and ACE done; `SeqIO.index` done except for SFF files; `index_db` not ported |
| `@biolibs/nexus` | `Bio.Nexus` | NEXUS `Nexus` class (read, edit, write), `Tree`, `Node`, `Chain`, `StandardData`, `StepMatrix`, `combine`, `consensus` done; `bootstrap`, `randomize`, `display`, file-name based `export_*` not ported |
| `@biolibs/svdsuperimposer` | `Bio.SVDSuperimposer` | `SVDSuperimposer` (least-squares superposition by SVD) done |
| `@biolibs/pdb` | `Bio.PDB` (first slice) | Structure hierarchy with disorder, `StructureBuilder`, `PDBParser`, header parsing, `MMCIF2Dict`, `MMCIFParser`, `PDBIO`, `MMCIFIO`, `Vector` and the rotation helpers, `Polypeptide`/`PPBuilder`, `Superimposer`, `NeighborSearch`/`KDTree`, `ShrakeRupley` (SASA) done; internal coordinates, DSSP not ported |
| `@biolibs/align` | `Bio.Align` | `MultipleSeqAlignment`, the substitution matrices and `PairwiseAligner` scoring and alignment done; the `Alignment` file formats `fasta`, `a2m`, `clustal`, `phylip`, `nexus`, `msf`, `emboss`, `tabular`, `stockholm`, `psl`, `bed`, `chain`, `sam`, `maf`, `mauve`, `hhr` and `exonerate` done, plus `CodonAligner`, the rest not yet ported |
| `@biolibs/motifs` | `Bio.motifs` | `Motif`, position matrices, scoring, thresholds, JASPAR/TRANSFAC/Cluster-Buster and the MEME, MAST, AlignACE, XMS and PFM readers done |
| `@biolibs/restriction` | `Bio.Restriction` | 1,088 enzymes: `search`, `catalyse`, `RestrictionBatch`, `Analysis` and its text layouts done |
| `@biolibs/phylo` | `Bio.Phylo` | `Tree`/`Clade` with the full search and editing API, Newick, Nexus and PhyloXML I/O, consensus trees, tree construction; NeXML and CDAO not yet ported |
| `@biolibs/seqtools` | `Bio.SeqUtils` | `gc_fraction`, `GC123`, `GC_skew`, `nt_search`, `seq1`/`seq3`, `molecular_weight`, `six_frame_translations`, `CodonAdaptationIndex`, `CheckSum`, `lcc`, `ProtParam`, `IsoelectricPoint`, `MeltingTemp` done |

## Bioengineering packages

Not ports — Biopython has no equivalent of these, so they add nothing to `docs/parity/` and are tested against invariants, round trips and published figures instead of against a reference implementation. Where behaviour *does* overlap Biopython, it is still measured: see [docs/README.md](docs/README.md#testing-without-a-reference-implementation).

| Package | Contents |
|---|---|
| `@biolibs/seqedit` | Edit a `SeqRecord` keeping its features true: replace, insert, delete, extract a region (across a circular origin too), rotate, reverse complement, with every location moved, stretched or clipped. Golden-tested against Biopython's slicing, reverse complement and location arithmetic |
| `@biolibs/pcr` | Primer quality and warnings, binding sites with mismatch tolerance, predicted products, primer design, 5' tails. Melting temperatures delegate to `@biolibs/seqtools` |
| `@biolibs/cloning` | DNA ends and which ligate, digests into pieces, ligation and re-ligation, restriction cloning products; Gibson assembly and overlap primer design. Built on `@biolibs/restriction`, so all 1,088 enzymes are available |
| `@biolibs/features` | Find known elements against a library of reference pieces, both strands, mismatch-tolerant, across a circular origin; turn hits into `SeqFeature`s and skip what is already annotated. No library is bundled — see [docs/features.md](docs/features.md) |
| `@biolibs/gel` | Virtual agarose gel: log-linear migration, four concentrations, ladders, band merging, fragment sizes from cut positions |
| `@biolibs/seqmap` | Plasmid and linear map geometry: positions on a circle or line, feature arcs and arrows as SVG paths, round tick intervals, lane packing, label de-collision |

Full documentation (APIs, conventions, examples) is in [docs/](docs/README.md).

```bash
npm install
npm run build   # tsc -b
npm test        # vitest
```

Roadmap ideas: k-mer indexing, BAM/VCF parsing, NCBI Entrez client, Golden Gate and Gateway cloning, sequencing-trace (AB1) display, SBOL import and export.
