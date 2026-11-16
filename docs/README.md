# biolibs documentation

biolibs is a set of small, dependency-free TypeScript libraries for bioinformatics and bioengineering, modelled on well-known Python tools (mainly Biopython). All packages are ESM, ship `.d.ts` types, and run in Node 20+ and modern browsers.

## Packages

| Package | Purpose | Docs |
|---|---|---|
| `@biolibs/core` | Shared types and errors | [core.md](core.md) |
| `@biolibs/seq` | `Seq`/`MutableSeq`, all 27 genetic codes, IUPAC data. At parity with Biopython's `Bio.Seq` | [seq.md](seq.md) |
| `@biolibs/seqfeature` | Positions, locations, `SeqFeature`. At parity with Biopython's `Bio.SeqFeature` | [seqfeature.md](seqfeature.md) |
| `@biolibs/seqrecord` | `SeqRecord`: sequence + annotations + features. At parity with Biopython's `Bio.SeqRecord` | [seqrecord.md](seqrecord.md) |
| `@biolibs/seqio` | Sequence file formats. FASTA, FASTQ/QUAL, GenBank, EMBL, IMGT, tab, PIR, SwissProt, PHD, IntelliGenetics, seqXML, the binary formats, the alignment formats, PDB and mmCIF sequences (SEQRES and atoms), GFA, UniProt XML and ACE done; `SeqIO.index` done except for SFF files; `index_db` not ported | [seqio.md](seqio.md) |
| `@biolibs/align` | `Bio.Align`: `MultipleSeqAlignment`, the 30 substitution matrices and `PairwiseAligner` with scoring and alignment and `Alignment` (printing, indexing, counts, mapping and more; `fasta`, `a2m`, `clustal`, `phylip`, `nexus`, `msf`, `emboss`, `tabular`, `stockholm`, `psl`, `bed`, `chain`, `sam`, `maf`, `mauve`, `hhr` and `exonerate` file formats (only the binary `big*` formats remain) and `CodonAligner`) | [align.md](align.md) |
| `@biolibs/nexus` | `Bio.Nexus`: NEXUS reader/writer and editor, `Tree`/`Node`/`Chain`, `StandardData`, `StepMatrix`, `combine`, `consensus`. Powers the `nexus` format in `seqio` | [nexus.md](nexus.md) |
| `@biolibs/svdsuperimposer` | `Bio.SVDSuperimposer`: least-squares superposition of two point sets | [svdsuperimposer.md](svdsuperimposer.md) |
| `@biolibs/entrez` | `Bio.Entrez`: the eight NCBI E-utilities, with the requests, rate limit and retries Biopython uses. Fetches text for `seqio` to parse; `read` and `parse` not ported | [entrez.md](entrez.md) |
| `@biolibs/opencloning` | `pydna.opencloning_models`: a cloning plan in the OpenCloning data model — written, sent, and checked by replaying every step. Steps it cannot run are carried as data | [opencloning.md](opencloning.md) |
| `@biolibs/assembly2` | `pydna.assembly2`, `pydna.primer`: the assembly engine — Gibson, In-Fusion, fusion PCR, in-vivo assembly, ligation, Golden Gate and PCR, with the provenance each product carries. Recombination is not ported | [assembly2.md](assembly2.md) |
| `@biolibs/pdblist` | `Bio.PDB.PDBList`: structure and assembly files fetched from the Protein Data Bank and unpacked, and the archive's lists of entries. Returns files for `pdb` to parse; the methods that keep a copy on disk are not applicable | [pdblist.md](pdblist.md) |
| `@biolibs/pdb` | `Bio.PDB` first slice: `Structure`/`Model`/`Chain`/`Residue`/`Atom` (with disorder), `StructureBuilder`, PDB and mmCIF parsers (`PDBParser`, `MMCIFParser`, `MMCIF2Dict`), PDB header parsing, the `PDBIO`/`MMCIFIO` writers, `Vector`/rotation geometry, polypeptide building, superposition, neighbor search and surface areas | [pdb.md](pdb.md) |
| `@biolibs/motifs` | `Bio.motifs`: motifs, position matrices, scoring and thresholds, JASPAR, TRANSFAC and Cluster-Buster formats | [motifs.md](motifs.md) |
| `@biolibs/restriction` | `Bio.Restriction`: 1,088 enzymes, cut sites, digests, `RestrictionBatch` and `Analysis` | [restriction.md](restriction.md) |
| `@biolibs/phylo` | `Bio.Phylo`: `Tree`, `Clade`, `BranchColor` with the full search and editing API, Newick, Nexus and PhyloXML reading and writing, consensus trees and tree construction (UPGMA, neighbour joining, parsimony); NeXML and CDAO not yet ported | [phylo.md](phylo.md) |
| `@biolibs/seqtools` | Bio.SeqUtils: GC, molecular weight, codon adaptation index, checksums, protein analysis, melting temperature | [seqtools.md](seqtools.md) |

### Ports of other libraries

| Package | Purpose | Docs |
|---|---|---|
| `@biolibs/dseq` | [pydna](https://github.com/BjornFJohansson/pydna)'s `Dseq`: double-stranded DNA whose sticky ends, nicks and circularity are part of the molecule. `pydna.dseq` and `pydna.alphabet` are at parity — see [docs/parity-pydna/](parity-pydna/README.md) | [dseq.md](dseq.md) |
| `@biolibs/seguid` | [SEGUID v2](https://github.com/seguid/seguid-python) checksums: stable identifiers for a sequence, single- or double-stranded, linear or circular. At parity — see [docs/parity-seguid/](parity-seguid/README.md) | [seguid.md](seguid.md) |
| `@biolibs/dseqrecord` | pydna's record layer: a sequence with a name, features and annotations, and the methods pydna adds to it. At parity — see [docs/parity-pydna/](parity-pydna/README.md) | [dseqrecord.md](dseqrecord.md) |
| `@biolibs/assembly` | Joining DNA fragments by shared homology. `pydna.common_sub_strings`, the matcher Gibson assembly and homologous recombination both start from, is at parity; `Assembly` itself waits on pydna's record layer | [assembly.md](assembly.md) |

### Bioengineering packages (no Biopython counterpart)

These are not ports. Biopython has no equivalent of any of them, so they are built on the ported packages rather than translated, and `docs/parity/` has nothing to check off for them — see [Testing without a reference implementation](#testing-without-a-reference-implementation) below.

| Package | Purpose | Docs |
|---|---|---|
| `@biolibs/seqedit` | Edit a `SeqRecord` while keeping its features true: replace, insert and delete bases with every location moved, stretched or clipped. Verified against Biopython where the two overlap (slicing, reverse complement, location arithmetic) | [seqedit.md](seqedit.md) |
| `@biolibs/pcr` | Primer quality, where a primer binds, what a pair amplifies, primer design. Melting temperatures come from `seqtools` | [pcr.md](pcr.md) |
| `@biolibs/cloning` | Restriction digests, ligation and ends that pair; Gibson assembly and overlap primer design. Built on `restriction` | [cloning.md](cloning.md) |
| `@biolibs/features` | Find known elements in a sequence against a library of reference pieces, on both strands, tolerating mismatches | [features.md](features.md) |
| `@biolibs/gel` | Virtual agarose gel: where fragments run, ladders, which bands a gel resolves | [gel.md](gel.md) |
| `@biolibs/seqmap` | Geometry for plasmid and linear maps: positions on a circle or line, feature arcs, ticks, lane packing, label de-collision | [seqmap.md](seqmap.md) |

### Bionet

Labs keeping a freezer together and sharing what they hold, with no server in charge. `bionet` is the protocol; the rest are the layers an application is composed from, so that an application owns no colour, component or rule of its own. The design is in [`design/bionet-labs.md`](../design/bionet-labs.md).

| Package | Purpose | Docs |
|---|---|---|
| `@biolibs/bionet` | The protocol: a lab's signed logs and how they merge, signed inventories at a lab's own address, finding labs by walking, and what a signature does not establish | [bionet.md](bionet.md) |
| `@biolibs/bionet-client` | One device in one lab: its key, its copy of the log, every action, and the connection to the lab's web peer. Storage, keys and sockets are plugged in | [bionet-client.md](bionet-client.md) |
| `@biolibs/bionet-peer` | A lab's web peer: a member that holds no key, which stores and forwards the log and serves the published inventory | [bionet-peer.md](bionet-peer.md) |
| `@biolibs/bionet-theme` | Each colour's meaning with a value for a light theme and a dark one, and the Bionet mark and logo | [bionet-theme.md](bionet-theme.md) |
| `@biolibs/bionet-react` | React hooks with no appearance of their own, and the mark and logo as components | [bionet-react.md](bionet-react.md) |
| `@biolibs/bionet-panels` | The parts of a lab application, a whole window, and a lab's public page | [bionet-panels.md](bionet-panels.md) |
| `@biolibs/bionet-space` | Where things are in a lab: a tree of places, the positions inside a box, and where a camera should look. Plain data | [bionet-space.md](bionet-space.md) |
| `@biolibs/bionet-tools` | The tools a lab uses at the bench, tied to its freezer: PCR from the tubes it holds, recorded as a run | [bionet-tools.md](bionet-tools.md) |
| `@biolibs/bionet-scene` | A lab in three dimensions, from the whole room down to one position in a box | [bionet-scene.md](bionet-scene.md) |

## Dependency graph

```
core  <-- seq  <-- nexus  <-- seqio
            ^
            '---- seqfeature
  ^         ^
  |         '---- seqtools
  +---- align
  +---- phylo
  +---- svdsuperimposer  <-- pdb  <-- seqio (pdb-atom, cif-atom, cif-seqres)
  +---- restriction  (also uses seq)
  +---- motifs  (also uses seq, align)
  +---- gel
  +---- seqmap
  +---- entrez  <-- pdblist
```

The bioengineering packages sit on top of the ports:

```
seqtools  <-- pcr  <-- cloning
seqrecord <-- seqedit  <-- cloning
seqfeature <-- features
restriction  <-- cloning
gel, seqmap   (core only)
seq, restriction, seguid  <-- dseq
core  <-- seguid

seq, dseq, dseqrecord, assembly  <-- assembly2  <-- opencloning  (also uses seqio, restriction)
```

Bionet sits on top of those, in layers that each depend only on the ones before:

```
dseqrecord, opencloning  <-- bionet  <-- bionet-peer
                               ^
                               '------ bionet-client  <-- bionet-react  <-- bionet-panels
bionet-theme  (nothing)  <------------------------------------'               (and as a peer)
bionet-space  (nothing)  <-- bionet-scene  (also uses bionet-theme, three.js)
assembly2, seqtools, bionet-panels  <-- bionet-tools
```

Only `core` is depended on by every package; `seqio` and `seqtools` also use `seq`. External runtime dependencies: none. Only `entrez` and `pdblist` touch the network, each through one function that can be replaced (`settings.transport`, and the `fetcher` a `PDBList` is given); no other package does any I/O.

## Conventions

- **Sequences:** `@biolibs/seq` provides Biopython's `Seq` and `MutableSeq` classes. Other packages that are still early scaffolds (`seqio`, `align`, `seqtools`) work on plain strings for now and will move to `Seq`/`SeqRecord` as they are brought to parity.
- **Coordinates are 0-based, half-open** (`[start, end)`), like JavaScript's `slice`. This differs from GenBank's 1-based inclusive coordinates.
- **Errors:** invalid input throws `BioError` (from `@biolibs/core`) with a descriptive message. Functions never silently drop bad characters, except where documented (ambiguous codons translate to `X`).
- **Mutation is explicit:** functions never modify their inputs. The only mutable objects are `MutableSeq` and methods taking `inplace = true`, as in Biopython.
- **Alphabets:** like Biopython, DNA and RNA complements are separate methods (`complement` vs `complementRna`); IUPAC ambiguity codes are supported throughout.
- **Topology:** a record is circular when its `topology` annotation is `"circular"`, which is where GenBank and EMBL put it and what `seqio` writes. `seqedit`, `cloning` and `features` all read it from there rather than inventing a flag.

## Testing without a reference implementation

The ported packages are measured: `reference/.venv` runs real Biopython, generates golden JSON, and the TypeScript tests replay it, so a `docs/parity/` item is `[x]` only when a golden case exercises it. `@biolibs/dseq` and `@biolibs/seguid` are measured the same way against pydna and the seguid package, each with a checklist and a progress count of its own in `docs/parity-<library>/`, because parity with one library says nothing about parity with another.

The six bioengineering packages have no Biopython counterpart, so there is nothing to generate golden data from and they add no parity items. They are held to a different standard instead:

- **Against Biopython wherever the behaviour does overlap.** `seqedit` is golden-tested on 62 cases against `record[a:b]`, `record.reverse_complement()` and `location + offset`, and its one deliberate divergence (a feature with no location, which makes Biopython raise) is recorded in the golden file and asserted, so it cannot quietly spread.
- **Against published figures.** `pcr`'s melting temperatures are `seqtools`' `Tm_NN`, already verified against Biopython; `cloning` is checked against the real cut coordinates and overhangs of EcoRI, PstI, SmaI, BamHI, BglII and HindIII from the REBASE data in `restriction`.
- **Against invariants and round trips.** Cutting a plasmid and re-ligating its pieces gives the plasmid back; flipping a fragment twice restores it; a Gibson ring is the molecule its fragments spell; every fragment loaded onto a gel appears in exactly one band; a feature library finds each piece at its own position in its own source sequence.
- **Against the error paths.** Every refusal has a test, since a cloning tool that silently returns the wrong construct is worse than one that explains itself.

## Getting started

From the repo root:

```bash
npm install
npm run build   # compiles every package with tsc -b
npm test        # runs vitest across all packages
```

Using a package from another workspace package or app:

```ts
import { parse } from "@biolibs/seqio";

const [rec] = parse(">gene\nATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG\n", "fasta");
console.log(rec.seq!.translate({ toStop: true }).toString()); // "MAIVMGR"
console.log(rec.seq!.reverseComplement().toString());
```

Packages are not yet published to npm; inside this monorepo they resolve through npm workspaces (`node_modules/@biolibs/*` symlinks to `packages/*`). Run `npm run build` first so the `dist/` output exists.

## Development

- Each package lives in `packages/<name>/` with `src/index.ts` (public API) and `test/*.test.ts`.
- TypeScript project references (`tsconfig.json` in each package) give correct incremental build order.
- Tests import packages by name (`@biolibs/seq`); `vitest.config.ts` aliases these to `src`, so no build is needed to run tests.
- To add a package: copy an existing one, add it to the root `tsconfig.json` references and the alias list in `vitest.config.ts`, then run `npm install` so the `node_modules/@biolibs/<name>` symlink is created (without it, imports from other packages will not resolve).

## Python to TypeScript cheat sheet

| Biopython | biolibs |
|---|---|
| `Seq(s).reverse_complement()` | `new Seq(s).reverseComplement()` |
| `Seq(s).transcribe()` | `new Seq(s).transcribe()` |
| `Seq(s).translate(to_stop=True)` | `new Seq(s).translate({ toStop: true })` |
| `SeqIO.parse(f, "fasta")` | `parse(text, "fasta")` |
| `SeqIO.write(recs, f, "fastq")` | `write(recs, out, "fastq")` |
| `pairwise2.align.globalms` | superseded by `PairwiseAligner` in `@biolibs/align` |
| `Phylo.read(f, "newick")` | `parseNewick(text)` |
| `SeqUtils.gc_fraction(s)` | `gcFraction(s)` |
| `SeqUtils.MeltingTemp.Tm_Wallace` | `tmWallace(s)` |
| `SeqUtils.MeltingTemp.Tm_NN` | `tmNN(s)`, or `primerTm(s, conditions)` in `@biolibs/pcr` |
| `Restriction.EcoRI.search(seq)` | `enzymes.EcoRI.search(seq)` |
| `Restriction.EcoRI.catalyse(seq)` | `enzymes.EcoRI.catalyse(seq)`, or `piecesOf(record, [EcoRI])` for ends and features |
| `record[a:b]` | `record.slice(a, b)`, or `extractRegion(record, a, b)` to keep edge-crossing features |
| `location + offset` | `shiftLocation(location, offset)` |
| *(no equivalent)* | `applyEdit`, `cloneProducts`, `assembleGibson`, `designPrimers`, `detectFeatures`, `bandsOf`, `ringPath` |
