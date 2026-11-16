# biolibs

TypeScript ports of Python bioengineering libraries, verified case by case against the originals — plus
packages that have no Python equivalent, and [Bionet](#bionet): labs keeping a freezer together and
sharing what they hold, with no server in charge.

- **35 packages**, npm workspaces, ESM only, Node 20 or later, generated `.d.ts`
- **2,837 API items at parity** across three upstream libraries, of 2,859 applicable
- **19,269 tests**, most of them replaying answers recorded from the real Python libraries

## Install

Every package is published on npm under the [`@biolibs`](https://www.npmjs.com/org/biolibs) scope, so take
only the ones you need:

```bash
npm install @biolibs/seq          # sequences and translation
npm install @biolibs/seqio        # reading and writing 40-odd file formats
npm install @biolibs/cloning      # digests, ligation, Gibson assembly
```

ESM only, Node 20 or later, TypeScript declarations included, and each package ships its source so
breakpoints land in the TypeScript rather than the build output. Each package's own README has its API
with worked examples; the table below links them.

## What "parity" means here

Not "we think it behaves the same". A generator in [`reference/`](reference/README.md) drives the real
Python library and records what it does — the return value, the exception type *and message*, the warnings,
the order of evaluation — into a JSON file. The TypeScript tests replay those recordings. A case passes
only if every one of those matches.

So an item is ticked when a recorded case proves it, and the checklists below are generated from those
cases rather than maintained by hand.

| Upstream | Verified | Checklist |
|---|---|---|
| Biopython 1.88 | **2,465 / 2,467** | [docs/parity/](docs/parity/README.md) |
| pydna 5.5.16 | **349 / 369** | [docs/parity-pydna/](docs/parity-pydna/README.md) |
| seguid | **23 / 23** | [docs/parity-seguid/](docs/parity-seguid/README.md) |

The two unverified Biopython items are `Entrez.read` and `Entrez.parse`, which turn NCBI's XML replies
into objects by interpreting its DTD files; the requests themselves are ported and
[`@biolibs/entrez`](packages/entrez) says exactly where that line falls. The one unverified pydna item is `Dseqrecord.write`, which takes a file name: nothing here touches a
file system, and what it would have written is what `format` returns. Items that exist only
because Python inherits them, and behaviour that is genuinely undefined upstream — where Biopython reads
uninitialised memory, say — are marked rather than claimed; each checklist says which and why.

`Bio.PDB.internal_coords` was the last module to be finished, and the last to be *counted*: it was
absent from the inventory the checklists are generated from until this was noticed while writing
[`@biolibs/pdb`](packages/pdb#what-is-verified)'s README.

## Ports of Biopython

| Package | Replaces | At parity | Notes |
|---|---|---|---|
| [`@biolibs/seq`](packages/seq) | `Bio.Seq`, `Bio.Data.CodonTable`, `Bio.Data.IUPACData` | 219 | `Seq`, `MutableSeq`, all 27 genetic codes, the IUPAC tables, undefined and partially defined content. [README](packages/seq/README.md) |
| [`@biolibs/seqfeature`](packages/seqfeature) | `Bio.SeqFeature` | 163 | eight kinds of fuzzy position, `SimpleLocation`, `CompoundLocation`, the GenBank/EMBL location grammar both ways, `SeqFeature`, `Reference`. [README](packages/seqfeature/README.md) |
| [`@biolibs/seqrecord`](packages/seqrecord) | `Bio.SeqRecord` | 25 | slicing and concatenation that carry features and per-letter annotations, `reverseComplement`, `translate`, 26 output formats. [README](packages/seqrecord/README.md) |
| [`@biolibs/seqio`](packages/seqio) | `Bio.SeqIO` | 81 | 49 formats in and 26 out — text, binary and XML — plus `index`. `index_db` is not ported: its index lives in an SQLite file. [README](packages/seqio/README.md) |
| [`@biolibs/align`](packages/align) | `Bio.Align` | 175 | `PairwiseAligner` with scoring and alignment, `Alignment`, `MultipleSeqAlignment`, the substitution matrices, `CodonAligner`, dN/dS, and every alignment file format Biopython reads or writes. [README](packages/align/README.md) |
| [`@biolibs/phylo`](packages/phylo) | `Bio.Phylo` | 489 | `Tree`/`Clade` with search and editing, Newick, NEXUS and phyloXML both ways, consensus, UPGMA, neighbour joining, parsimony. NeXML, CDAO and drawing are not ported. [README](packages/phylo/README.md) |
| [`@biolibs/pdb`](packages/pdb) | `Bio.PDB` | 502 | the structure hierarchy with disorder, `PDBParser`, `MMCIFParser`, `PDBIO`, `MMCIFIO`, header parsing, `Vector`, `Polypeptide`, `Superimposer`, `NeighborSearch`/`KDTree`, SASA — plus internal coordinates both ways. DSSP needs an external program. [README](packages/pdb/README.md) |
| [`@biolibs/restriction`](packages/restriction) | `Bio.Restriction` | 491 | all 1,088 REBASE enzymes: `search`, `catalyse` linear or circular, `RestrictionBatch`, `Analysis` and its three text layouts. [README](packages/restriction/README.md) |
| [`@biolibs/motifs`](packages/motifs) | `Bio.motifs` | 173 | `Motif`, the four position matrices, scanning both strands, score thresholds, eleven formats in and four out. [README](packages/motifs/README.md) |
| [`@biolibs/nexus`](packages/nexus) | `Bio.Nexus` | 84 | the `Nexus` class with every block, `Tree`, `Node`, `StandardData`, `StepMatrix`, `combine`, `consensus` — `bootstrap` and `randomize` included, on `@biolibs/core`'s Mersenne Twister. [README](packages/nexus/README.md) |
| [`@biolibs/seqtools`](packages/seqtools) | `Bio.SeqUtils` | 39 | GC content and skew, `nt_search`, `seq1`/`seq3`, molecular weight, six-frame translations, codon adaptation, checksums, `lcc`, `ProtParam`, `IsoelectricPoint`, `MeltingTemp`. [README](packages/seqtools/README.md) |
| [`@biolibs/svdsuperimposer`](packages/svdsuperimposer) | `Bio.SVDSuperimposer` | 7 | least-squares superposition by SVD, in single or double precision, with no dependencies. [README](packages/svdsuperimposer/README.md) |
| [`@biolibs/entrez`](packages/entrez) | `Bio.Entrez` | 8 / 10 | the eight NCBI E-utilities — `efetch`, `esearch`, `esummary`, `elink`, `epost`, `einfo`, `espell`, `ecitmatch` — building the same requests, with the same rate limit and retries. One of the two packages that touch the network, through a single replaceable function. `Entrez.read` and `parse` are not ported. [README](packages/entrez/README.md) |
| [`@biolibs/pdblist`](packages/pdblist) | `Bio.PDB.PDBList` | 9 | structure files in five formats and biological assemblies, fetched from the Protein Data Bank and unpacked; the lists of entries, withdrawn entries, weekly changes and assemblies. Returns files, not paths; the methods that keep a copy on disk are not applicable. [README](packages/pdblist/README.md) |

## Ports of pydna and seguid

| Package | Replaces | At parity | Notes |
|---|---|---|---|
| [`@biolibs/dseq`](packages/dseq) | `pydna.dseq`, `pydna.alphabet`, `pydna.seq` | 128 | double-stranded DNA whose sticky ends, nicks and circularity are part of the molecule, one letter per base *pair*, so a bad ligation is refused rather than joined; plus pydna's own `Seq` and `ProteinSeq`. [README](packages/dseq/README.md) |
| [`@biolibs/dseqrecord`](packages/dseqrecord) | `pydna.seqrecord`, `pydna.dseqrecord`, part of `pydna.utils` | 94 / 95 | that molecule with a name, features and annotations; cutting, joining, rotating — every operation carrying the features with it. [README](packages/dseqrecord/README.md) |
| [`@biolibs/opencloning`](packages/opencloning) | `pydna.opencloning_models` | 41 / 44 | a cloning plan written down in the OpenCloning data model, sent, and **checked by running every step again**: the molecules, the primers, and for each product the step that made it. [README](packages/opencloning/README.md) |
| [`@biolibs/assembly2`](packages/assembly2) | `pydna.assembly2`, `pydna.primer`, more of `pydna.utils` | 89 / 105 | the assembly engine: Gibson, In-Fusion, fusion PCR, in-vivo assembly, ligation, Golden Gate and PCR, each product carrying a record of how it was made. Recombination — Gateway, Cre-lox, recombinases, CRISPR — is not ported. [README](packages/assembly2/README.md) |
| [`@biolibs/assembly`](packages/assembly) | `pydna.common_sub_strings` | 2 | the shared-homology matcher Gibson assembly and homologous recombination both start from, with no dependencies. [README](packages/assembly/README.md) |
| [`@biolibs/seguid`](packages/seguid) | [seguid](https://github.com/seguid/seguid-python) | 23 | SEGUID v2 checksums: one identifier for a sequence however it is rotated, and whichever strand you call watson |

The twenty unverified pydna items are `Dseqrecord.write`, which takes a file name; the sixteen
functions of `pydna.assembly2` that join DNA by recombination rather than by homology or by ligation —
Gateway, Cre-lox, the recombinases, CRISPR and the integration helpers they share; and three display
helpers of the cloning-plan model. [`@biolibs/assembly2`](packages/assembly2) and
[`@biolibs/opencloning`](packages/opencloning) say exactly where those lines fall.

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

## Bionet

A lab's freezer, kept by the people in the lab and shared with other labs, with nothing in the middle
that has to be trusted. Each member's device signs its own changes into its own log; what the lab holds
is worked out from all the logs together, the same on every machine, so people work offline and agree
when they meet. A lab publishes what it has, signed, at its own web address, and another lab finds it by
following pointers from a lab it already knows.

| Package | What it does |
|---|---|
| [`@biolibs/bionet`](packages/bionet) | The protocol. A lab's signed logs and how they merge; inventories named by checksum, signed and published at the lab's own address; finding labs by walking from ones you know; what a signature does and does *not* establish |
| [`@biolibs/bionet-client`](packages/bionet-client) | One device in one lab: its key, its copy of the log, everything a member can do, and the connection to the lab's web peer. Works offline, syncs when it can. Storage, key keeping and sockets are plugged in |
| [`@biolibs/bionet-peer`](packages/bionet-peer) | A lab's web peer: a member that holds no key. It keeps a copy of the log, passes changes between members who are never online together, and serves the published inventory |
| [`@biolibs/bionet-theme`](packages/bionet-theme) | The look, in one place: each colour's meaning with a value for a light theme and a dark one, and the Bionet mark and logo |
| [`@biolibs/bionet-react`](packages/bionet-react) | React hooks with no appearance of their own: the lab as it stands, asking for a change, hearing why it was refused |
| [`@biolibs/bionet-panels`](packages/bionet-panels) | The parts of a lab application, ready to place: freezer, people, history, sharing, a whole window, and a lab's public page |
| [`@biolibs/bionet-space`](packages/bionet-space) | Where things are in a lab: a tree of places, where each stands, the positions inside a box, and where a camera should look. Plain data, nothing drawn |
| [`@biolibs/bionet-scene`](packages/bionet-scene) | A lab in three dimensions: rooms, freezers, boxes and tubes in the Bionet theme, from the whole lab down to one position in a box |

They are layered so that an application owns nothing: no colour, no component and no rule of its own.
Three things are built on them:

- [bionet-desktop](https://github.com/matthewlovestocode/bionet-desktop), a desktop app whose own code is
  the keychain, the window and the door between them.
- Two example labs, each a web page and a web peer at its own address:
  [lab-wren.onrender.com](https://lab-wren.onrender.com) and
  [lab-thistle.onrender.com](https://lab-thistle.onrender.com).
- The last section of the [recipe page](https://biolibs-site.onrender.com/examples/recipe), which walks
  from one lab to the other to find who has the parts a plan starts from.

Why it is built this way, what was decided and what is still open:
[design/bionet-labs.md](design/bionet-labs.md).

## Building

```bash
npm install
npm run build      # tsc -b
npm test           # vitest — 19,269 tests
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

Per-package reference, conventions and examples: [docs/](docs/README.md). The design of Bionet's labs:
[design/](design/bionet-labs.md).

## Licence

MIT — see [LICENSE](LICENSE).
