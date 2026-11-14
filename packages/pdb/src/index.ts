/**
 * @packageDocumentation
 * `@biolibs/pdb`: a TypeScript port of Biopython's `Bio.PDB` — **495 of 502** applicable items across
 * twenty-one modules, verified against Biopython 1.88 by 18,661 recorded cases (58 MB of golden files,
 * the largest corpus in this repository).
 *
 * The parsers take a file's *text*, not its name, and `PDBIO.save()` returns the text rather than writing
 * a file: there is no file-system access here.
 *
 * `Bio.PDB.internal_coords` is the one module not finished: 96 of its 103 applicable items are verified
 * by 1,303 of those cases. The 7 outstanding are `IC_Chain`'s distance-plot work and four of its
 * housekeeping methods.
 *
 * Not ported at all: `ic_rebuild` and the PIC format, `PICIO`, `SCADIO`, `HSExposure`, `ResidueDepth`,
 * `FragmentMapper`, `cealign`, `PDBMLParser`, `binary_cif`/MMTF, and the four that need an external
 * program or the internet (`DSSP`, `NACCESS`, `PDBList`, `alphafold_db`).
 *
 * - `exceptions.ts`: `PDBConstructionException` and friends
 * - `entity.ts`, `atom.ts`, `residue.ts`, `chain.ts`: the hierarchy — `Entity`, `Atom`, `Residue`,
 *   `Chain`, `Model`, `Structure` — with disorder as Biopython models it, a wrapper that delegates to
 *   its selected child rather than a flag
 * - `structure-builder.ts`: `StructureBuilder`, which the parsers drive
 * - `pdb-parser.ts`, `header.ts`: `PDBParser` (PQR too) and `parsePdbHeader`
 * - `mmcif2dict.ts`, `mmcif-parser.ts`: `MMCIF2Dict`, `MMCIFParser`, `FastMMCIFParser`
 * - `structure-io.ts`, `pdbio.ts`, `mmcifio.ts`: `Select`, `PDBIO`, `MMCIFIO`
 * - `vectors.ts`, `rotations.ts`, `homog.ts`, `geometry.ts`: `Vector`, the rotation matrices,
 *   `calcAngle`, `calcDihedral`, the homogeneous 4x4 matrices, `centerOfMass`
 * - `polypeptide.ts`: `Polypeptide`, `PPBuilder`, `CaPPBuilder`
 * - `superimposer.ts`, `kdtrees.ts`, `neighbor-search.ts`, `selection.ts`, `sasa.ts`: `Superimposer`,
 *   `KDTree`, `NeighborSearch`, `unfoldEntities`, `ShrakeRupley`
 * - `pdb-data.ts`, `aa-codes.ts`: the residue-name tables (generated from `Bio.Data.PDBData`) and
 *   `isAa` / `isNucleic`
 * - `pyformat.ts`: the Python `%`-format helpers the writers need to line up their columns
 * - `internal-coords/`: a chain as bond lengths, angles and dihedrals, and back again
 *
 * Coordinates are `Float32Array`, as Biopython's NumPy arrays are, so `3.700` reads back as
 * `3.700000047683716` in both libraries.
 */

export * from "./exceptions.js";
export * from "./util.js";
export * from "./geometry.js";
export * from "./entity.js";
export * from "./atom.js";
export * from "./residue.js";
export * from "./chain.js";
export * from "./structure-builder.js";
export * from "./header.js";
export * from "./pdb-parser.js";
export * from "./mmcif2dict.js";
export * from "./mmcif-parser.js";
export * from "./pyformat.js";
export * from "./structure-io.js";
export * from "./pdbio.js";
export * from "./mmcifio.js";
export * from "./vectors.js";
export * from "./rotations.js";
export * from "./homog.js";
export * from "./pdb-data.js";
export * from "./aa-codes.js";
export * from "./polypeptide.js";
export * from "./superimposer.js";
export * from "./kdtrees.js";
export * from "./selection.js";
export * from "./neighbor-search.js";
export * from "./sasa.js";
export * from "./internal-coords/index.js";
