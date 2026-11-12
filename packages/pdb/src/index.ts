/**
 * @packageDocumentation
 * `@biolibs/pdb`: a TypeScript port of Biopython's `Bio.PDB`, starting with the structure hierarchy and the PDB parser.
 *
 * - `exceptions.ts`: `PDBConstructionException` and friends
 * - `geometry.ts`: `transformCoord`, `centerOfMass`, `averageCoords`
 * - `entity.ts`: `Entity`, `DisorderedEntityWrapper`
 * - `atom.ts`: `Atom`, `DisorderedAtom`
 * - `residue.ts`: `Residue`, `DisorderedResidue`
 * - `chain.ts`: `Chain`, `Model`, `Structure`
 * - `structure-builder.ts`: `StructureBuilder`
 * - `header.ts`: `parsePdbHeader`, `parsePdbHeaderList`, `parseRemark465`
 * - `pdb-parser.ts`: `PDBParser`
 * - `mmcif2dict.ts`: `MMCIF2Dict`, `tokenize`, `splitLine`
 * - `mmcif-parser.ts`: `MMCIFParser`, `FastMMCIFParser`
 * - `pyformat.ts`: Python `%`-format helpers and exception classes the writers use
 * - `structure-io.ts`: `Select`, `StructureIO`
 * - `pdbio.ts`: `PDBIO`, `formatBFactor`
 * - `pdb-data.ts`: residue-name tables (generated from `Bio.Data.PDBData`)
 * - `aa-codes.ts`: `isAa`, `isNucleic`, index/name lookups
 * - `polypeptide.ts`: `Polypeptide`, `PPBuilder`, `CaPPBuilder`
 * - `mmcifio.ts`: `MMCIFIO`
 * - `vectors.ts`: `Vector`
 * - `rotations.ts`: `rotaxis2m`, `rotmat`, `refmat`, `m2rotaxis`, `calcAngle`, `calcDihedral`, `vectorToAxis`
 * - `homog.ts`: homogeneous 4x4 matrices, `coordSpace`, `multiCoordSpace`
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
