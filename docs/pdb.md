# @biolibs/pdb

A TypeScript port of the first slice of Biopython's `Bio.PDB`: the structure hierarchy and the PDB-format parser. Verified against Biopython 1.88 on 1,804 generated cases (`packages/pdb/test/golden/pdb.json`, built by `reference/golden/gen_pdb_cases.py`).

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

## Hierarchy

`Structure` > `Model` > `Chain` > `Residue` > `Atom`, all built on `Entity` (`get`, `has`, `delete`, `add`, `insert`, `detachChild`, `fullId`, `equals`/`compare`, `copy`, `strictlyEquals`). Alternative locations are `DisorderedAtom` (altlocs) and `DisorderedResidue` (point mutations); both forward unknown properties to the selected child, as Python's `__getattr__` does.

Details kept faithful to Biopython:

- Coordinates are `Float32Array`; `atom.minus(other)` computes the distance in single precision.
- A blank chain id sorts oddly (`Chain.gt` and friends), exactly as in Python.
- Changing an id to one already used by a sibling warns, and `detachChild(3)` on a `Chain` raises `KeyError` after the child has been detached, because Python deletes the untranslated id.
- `Atom.strictlyEquals` raises `TypeError` when a B-factor or occupancy is missing (`np.isclose(None, None)`).
- Ordering of entities of different kinds raises `TypeError`, as Python's `NotImplemented` does.

## Not yet ported

`MMCIFParser`/`MMCIF2Dict`, `PDBIO`, `Polypeptide`, vectors and `Superimposer`, `NeighborSearch`, `transform`/`center_of_mass`, internal coordinates, DSSP/SASA, and the SeqIO formats `pdb-atom`, `cif-atom`, `cif-seqres`.
