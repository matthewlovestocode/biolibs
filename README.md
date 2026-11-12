# biolibs

TypeScript libraries replacing common Python bioengineering tooling. The goal is full feature parity with each Python library, one at a time, verified against the real library. See [PARITY.md](PARITY.md) for progress. npm workspaces monorepo; each package is ESM with generated `.d.ts`.

| Package | Replaces | Contents |
|---|---|---|
| `@biolibs/core` | – | `SeqRecord`, `BioError` |
| `@biolibs/seq` | Biopython `Bio.Seq`, `Bio.Data.CodonTable`, `Bio.Data.IUPACData` | **At parity**: `Seq`, `MutableSeq`, all 27 genetic codes, IUPAC data (verified against Biopython 1.88) |
| `@biolibs/seqio` | `Bio.SeqIO` | FASTA, FASTQ, minimal GenBank |
| `@biolibs/align` | `pairwise2` / `PairwiseAligner` | global/local alignment, edit distance |
| `@biolibs/phylo` | `Bio.Phylo` | Newick parse/write, patristic distance |
| `@biolibs/seqtools` | `Bio.SeqUtils`, `Bio.Restriction` | GC, Tm, restriction sites and digests |

Full documentation (APIs, conventions, examples) is in [docs/](docs/README.md).

```bash
npm install
npm run build   # tsc -b
npm test        # vitest
```

Roadmap ideas: PDB/mmCIF structures, substitution matrices (BLOSUM), affine gaps, primer design, k-mer indexing, BAM/VCF parsing, NCBI Entrez client.
