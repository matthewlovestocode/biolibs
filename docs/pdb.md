# @biolibs/pdb

A TypeScript port of the first slice of Biopython's `Bio.PDB`: the structure hierarchy and the PDB and mmCIF parsers. Verified against Biopython 1.88 on 1,804 PDB cases (`packages/pdb/test/golden/pdb.json`, built by `reference/golden/gen_pdb_cases.py`) and 1,430 mmCIF cases (`mmcif.json`, `gen_mmcif_cases.py`).

## Parsing

```ts
import { PDBParser } from "@biolibs/pdb";

const parser = new PDBParser({ permissive: true, quiet: false, isPqr: false });
const structure = parser.getStructure("1abc", pdbText);   // text, or any object with readLines()
for (const atom of structure.getAtoms()) console.log(atom.fullname, atom.coord);
parser.getHeader();    // dict from parsePdbHeader (name, head, idcode, deposition_date, resolution, ...)
parser.getTrailer();   // lines after the last model
```

`getStructure` takes text rather than a file name (no file system access). Warnings (`PDBConstructionWarning`) go through `@biolibs/core`'s `warn`; use `captureWarnings` or `setWarningHandler`. `quiet: true` suppresses them as in Biopython. In non-permissive mode a construction problem throws `PDBConstructionException`.

## mmCIF

```ts
import { FastMMCIFParser, MMCIF2Dict, MMCIFParser } from "@biolibs/pdb";

const d = new MMCIF2Dict(cifText);        // Map: "_atom_site.id" -> ["1", "2", ...]; "data_" -> the block name
const parser = new MMCIFParser({ authChains: true, authResidues: true, permissive: false, quiet: false });
const structure = parser.getStructure("1abc", cifText);
parser.header;                            // { name, head, idcode, deposition_date, structure_method, resolution }
new FastMMCIFParser().getStructure("1abc", cifText);   // reads only _atom_site / _atom_site_anisotrop
```

`MMCIF2Dict` follows Biopython's tokenizer, including its quirks: `#` starts a comment only outside a token, a quote closes only before whitespace, `;` text blocks, and a `loop_` whose first token is not a key raises `ZeroDivisionError`. `MMCIFParser` is not permissive by default (unlike `PDBParser`); a model-number column is needed to get more than one model. Missing columns raise `KeyError`, bad numbers `ValueError`, and atom serial numbers that are not integers are kept as strings with a warning. Like `PDBParser`, these take text, not a file name.

## Hierarchy

`Structure` > `Model` > `Chain` > `Residue` > `Atom`, all built on `Entity` (`get`, `has`, `delete`, `add`, `insert`, `detachChild`, `fullId`, `equals`/`compare`, `copy`, `strictlyEquals`). Alternative locations are `DisorderedAtom` (altlocs) and `DisorderedResidue` (point mutations); both forward unknown properties to the selected child, as Python's `__getattr__` does.

Details kept faithful to Biopython:

- Coordinates are `Float32Array`; `atom.minus(other)` computes the distance in single precision.
- A blank chain id sorts oddly (`Chain.gt` and friends), exactly as in Python.
- Changing an id to one already used by a sibling warns, and `detachChild(3)` on a `Chain` raises `KeyError` after the child has been detached, because Python deletes the untranslated id.
- `Atom.strictlyEquals` raises `TypeError` when a B-factor or occupancy is missing (`np.isclose(None, None)`).
- Ordering of entities of different kinds raises `TypeError`, as Python's `NotImplemented` does.

## Not yet ported

`MMCIFIO`, `PDBIO`, `Polypeptide`, vectors and `Superimposer`, `NeighborSearch`, `transform`/`center_of_mass`, internal coordinates, DSSP/SASA, and the SeqIO formats `pdb-atom`, `cif-atom`, `cif-seqres`.
