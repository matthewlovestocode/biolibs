# biolibs

TypeScript libraries replacing common Python bioengineering tooling. The goal is full feature parity with each Python library, one at a time, verified against the real library. See [PARITY.md](PARITY.md) for progress. npm workspaces monorepo; each package is ESM with generated `.d.ts`.

| Package | Replaces | Contents |
|---|---|---|
| `@biolibs/core` | – | `SeqRecord`, `BioError` |
| `@biolibs/seq` | Biopython `Bio.Seq`, `Bio.Data.CodonTable`, `Bio.Data.IUPACData` | **At parity**: `Seq`, `MutableSeq`, all 27 genetic codes, IUPAC data (verified against Biopython 1.88) |
| `@biolibs/seqfeature` | Biopython `Bio.SeqFeature` | **At parity**: positions, `SimpleLocation`, `CompoundLocation`, `Location.fromstring`, `SeqFeature`, `Reference` |
| `@biolibs/seqrecord` | Biopython `Bio.SeqRecord` | **At parity**: `SeqRecord`, slicing, `+`, `reverseComplement`, `translate`, per-letter annotations |
| `@biolibs/seqio` | `Bio.SeqIO` | FASTA, FASTQ/QUAL, GenBank, EMBL, IMGT, tab, PIR, SwissProt, PHD, IntelliGenetics, seqXML and the binary formats and the alignment formats (all but nexus) done; the rest in progress |
| `@biolibs/align` | `Bio.Align` | `MultipleSeqAlignment` done; the pairwise aligner is not yet ported |
| `@biolibs/phylo` | `Bio.Phylo` | Newick parse/write, patristic distance |
| `@biolibs/seqtools` | `Bio.SeqUtils` | `gc_fraction`, `GC123`, `GC_skew`, `nt_search`, `seq1`/`seq3`, `molecular_weight`, `six_frame_translations`, `CodonAdaptationIndex`, `CheckSum`, `lcc`, `ProtParam`, `IsoelectricPoint`, `MeltingTemp` done |

Full documentation (APIs, conventions, examples) is in [docs/](docs/README.md).

```bash
npm install
npm run build   # tsc -b
npm test        # vitest
```

Roadmap ideas: PDB/mmCIF structures, substitution matrices (BLOSUM), affine gaps, primer design, k-mer indexing, BAM/VCF parsing, NCBI Entrez client.
