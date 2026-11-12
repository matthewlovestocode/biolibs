# biolibs documentation

biolibs is a set of small, dependency-free TypeScript libraries for bioinformatics and bioengineering, modelled on well-known Python tools (mainly Biopython). All packages are ESM, ship `.d.ts` types, and run in Node 20+ and modern browsers.

## Packages

| Package | Purpose | Docs |
|---|---|---|
| `@biolibs/core` | Shared types and errors | [core.md](core.md) |
| `@biolibs/seq` | `Seq`/`MutableSeq`, all 27 genetic codes, IUPAC data. At parity with Biopython's `Bio.Seq` | [seq.md](seq.md) |
| `@biolibs/seqfeature` | Positions, locations, `SeqFeature`. At parity with Biopython's `Bio.SeqFeature` | [seqfeature.md](seqfeature.md) |
| `@biolibs/seqrecord` | `SeqRecord`: sequence + annotations + features. At parity with Biopython's `Bio.SeqRecord` | [seqrecord.md](seqrecord.md) |
| `@biolibs/seqio` | Sequence file formats. FASTA, FASTQ/QUAL, GenBank, EMBL, IMGT, tab, PIR and SwissProt done; more in progress | [seqio.md](seqio.md) |
| `@biolibs/align` | Pairwise alignment and edit distance | [align.md](align.md) |
| `@biolibs/phylo` | Newick phylogenetic trees | [phylo.md](phylo.md) |
| `@biolibs/seqtools` | GC content, melting temperature, restriction digests | [seqtools.md](seqtools.md) |

## Dependency graph

```
core  <-- seq  <-- seqio
            ^
            '---- seqfeature
  ^         ^
  |         '---- seqtools
  +---- align
  +---- phylo
```

Only `core` is depended on by every package; `seqio` and `seqtools` also use `seq`. External runtime dependencies: none.

## Conventions

- **Sequences:** `@biolibs/seq` provides Biopython's `Seq` and `MutableSeq` classes. Other packages that are still early scaffolds (`seqio`, `align`, `seqtools`) work on plain strings for now and will move to `Seq`/`SeqRecord` as they are brought to parity.
- **Coordinates are 0-based, half-open** (`[start, end)`), like JavaScript's `slice`. This differs from GenBank's 1-based inclusive coordinates.
- **Errors:** invalid input throws `BioError` (from `@biolibs/core`) with a descriptive message. Functions never silently drop bad characters, except where documented (ambiguous codons translate to `X`).
- **Mutation is explicit:** functions never modify their inputs. The only mutable objects are `MutableSeq` and methods taking `inplace = true`, as in Biopython.
- **Alphabets:** like Biopython, DNA and RNA complements are separate methods (`complement` vs `complementRna`); IUPAC ambiguity codes are supported throughout.

## Getting started

From the repo root:

```bash
npm install
npm run build   # compiles every package with tsc -b
npm test        # runs vitest across all packages
```

Using a package from another workspace package or app:

```ts
import { Seq } from "@biolibs/seq";
import { parseFasta } from "@biolibs/seqio";

const [rec] = parseFasta(">gene\nATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG\n");
const seq = new Seq(rec.sequence);
console.log(seq.translate({ toStop: true }).toString()); // "MAIVMGR"
console.log(seq.reverseComplement().toString());
```

Packages are not yet published to npm; inside this monorepo they resolve through npm workspaces (`node_modules/@biolibs/*` symlinks to `packages/*`). Run `npm run build` first so the `dist/` output exists.

## Development

- Each package lives in `packages/<name>/` with `src/index.ts` (public API) and `test/*.test.ts`.
- TypeScript project references (`tsconfig.json` in each package) give correct incremental build order.
- Tests import packages by name (`@biolibs/seq`); `vitest.config.ts` aliases these to `src`, so no build is needed to run tests.
- To add a package: copy an existing one, add it to the root `tsconfig.json` references and the alias list in `vitest.config.ts`.

## Python to TypeScript cheat sheet

| Biopython | biolibs |
|---|---|
| `Seq(s).reverse_complement()` | `new Seq(s).reverseComplement()` |
| `Seq(s).transcribe()` | `new Seq(s).transcribe()` |
| `Seq(s).translate(to_stop=True)` | `new Seq(s).translate({ toStop: true })` |
| `SeqIO.parse(f, "fasta")` | `parseFasta(text)` |
| `SeqIO.write(recs, f, "fastq")` | `writeFastq(recs)` |
| `pairwise2.align.globalms` | `globalAlign(a, b, { match, mismatch, gap })` |
| `Phylo.read(f, "newick")` | `parseNewick(text)` |
| `SeqUtils.gc_fraction(s)` | `gcContent(s)` |
| `SeqUtils.MeltingTemp.Tm_Wallace` | `meltingTemp(s)` (short oligos) |
| `Restriction.EcoRI.search(seq)` | `findSites(dna, "EcoRI")` |
