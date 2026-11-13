# @biolibs/pdb

A TypeScript port of the first slice of Biopython's `Bio.PDB`: the structure hierarchy, the PDB and mmCIF parsers the PDB, PQR and mmCIF writers and the vector/rotation geometry of `Bio.PDB.vectors`. Verified against Biopython 1.88 on 1,804 PDB cases (`packages/pdb/test/golden/pdb.json`, built by `reference/golden/gen_pdb_cases.py`), 1,430 mmCIF cases (`mmcif.json`, `gen_mmcif_cases.py`) 3,100 writer cases (`pdbio.json`, `gen_pdbio_cases.py`) 5,298 geometry cases (`vectors.json`, `gen_vector_cases.py`) 1,400 entity-operation cases (`pdbops.json`, `gen_pdbops_cases.py`) 1,718 polypeptide cases (`polypeptide.json`, `gen_poly_cases.py`) 388 superimposer cases (`superimposer.json`, `gen_svd_cases.py`) 1,713 neighbor-search cases (`nsearch.json`, `gen_nsearch_cases.py`) and 505 surface-area cases (`sasa.json`, `gen_sasa_cases.py`).

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

## Writing

```ts
import { MMCIFIO, PDBIO, Select } from "@biolibs/pdb";

const io = new PDBIO({ isPqr: false, useModelFlag: false });
io.setStructure(structure);                 // or a Model, Chain, Residue or Atom
const text = io.save(new Select(), true, false);   // select, writeEnd, preserveAtomNumbering

const cif = new MMCIFIO();
cif.setStructure(structure);
const cifText = cif.save();                 // or cif.setDict(map) to write an MMCIF2Dict-style Map
```

`save` returns the text instead of writing to a file or handle (no file system access); where Python deletes the file or truncates the handle on failure, a failed `save` here just throws and returns nothing. Subclass `Select` and override `acceptModel`, `acceptChain`, `acceptResidue` and `acceptAtom` to write a subset; return values are tested for truthiness, like Python's `1`/`0`.

Kept faithful to Biopython:

- `setStructure` with anything below a structure copies it into a new structure, rebuilding the missing levels (chain `A`, model 0, a dummy residue `DUM` for a bare atom) and keeping the original chain id.
- `PDBIO` raises `PDBIOException` for chain ids longer than one character, residue numbers above 9999, and any atom that cannot be formatted; the message names the atom by its `full_id` as captured when it was attached to its residue. B-factors are fitted to six columns (dropping decimals, then truncating to 999999 with a `PDBIOWarning`); missing occupancy, charge or radius are written blank with a warning.
- Python's `%c` rules apply: an altloc or insertion code that is not exactly one character fails with Python's `TypeError` text, and a string serial number with `preserveAtomNumbering` fails unwrapped after the atom is written.
- `MMCIFIO` orders `_atom_site` columns as Biopython does, sorts unknown columns alphabetically, quotes values the way CIF needs (`'...'`, `"..."` or a semicolon text field), and raises `ValueError` for keys that are not `category.item` or lists of unequal length, `IndexError` for an empty value, and `UnboundLocalError` when the `data_` key is missing.
- JavaScript numbers do not distinguish `1` from `1.0`, so occupancy and B-factor are written as Python floats (`1.0`).

## Vectors and rotations

```ts
import { Vector, calcDihedral, rotaxis2m, rotmat } from "@biolibs/pdb";

const v = new Vector(1, 2, 3);
v.add(new Vector(1, 1, 1)).repr();        // "<Vector 2.00, 3.00, 4.00>"
v.dot(v);  v.cross(w);  v.angle(w);        // Python's v * w, v ** w
v.leftMultiply(rotaxis2m(Math.PI, new Vector(1, 0, 0)));
```

Python operators become methods: `+` `add`, `-` `sub`, `*` `dot`, `**` `cross` (or component-wise product with a scalar or list), `/` `div`, `v[i]` `get`/`set`, `in` `has`. Matrices are `number[][]` (a NumPy array's rows); homogeneous 4x4 helpers (`homogRotMtx`, `coordSpace`, `multiCoordSpace`, ...) live in `homog.ts`.

## Internal coordinates (`internal-coords/`)

A protein described by bond lengths, bond angles and dihedral angles rather than by Cartesian coordinates
(Biopython's `Bio.PDB.internal_coords`). Ported so far: `ic-data.ts` holds the tables (generated by `reference/gen_data.py` from `Bio.PDB.ic_data`),
`atom-key.ts` holds `AtomKey` — the type that names an atom across a chain (residue position, insertion code,
residue name, atom name, altloc, occupancy) and whose ordering puts a residue's atoms into a canonical sequence —
`edron.ts` holds `Edron`, `Hedron` and `Dihedron`, the angles themselves — three bonded atoms with two lengths
and an angle, or four with the angle between two planes — `ic-residue.ts` holds `IC_Residue` — which atoms a residue keeps, the keys it
keeps them under, and the hedra and dihedra it builds from the tables and from its neighbours — and `ic-chain.ts` holds `IC_Chain`, which
decides which of a chain's residues can be built and owns the coordinate array. Verified against Biopython on 875 cases
(`packages/pdb/test/golden/ickey.json`, built by `reference/golden/gen_ickey_cases.py`). The geometry the rest of
the port will rest on is already here, in `homog.ts`, ported with `Bio.PDB.vectors`.

A di/hedron's *values* are not kept on it: Biopython stores every hedron's two lengths and angle in arrays on the
chain and reaches them by index, so that a whole chain can be recomputed with array arithmetic. Until a chain holds
them a hedron reads 0 for all three, while a dihedron reads **360** — Biopython's "no value" for that angle — and a
dihedron cannot be printed at all, because its repr reads the residue that only `IC_Residue` sets. The
`EdronArrays` interface is the contract `IC_Chain` will satisfy.

Building a di/hedron classifies it: `eClass` is the atom names alone (`NCAC`), `reClass` adds the residue at each
position, and `creClass` the covalent-radius classes — which is how Biopython gathers statistics over many
structures. An atom whose covalent class is unknown (`CD1` in a glycine, say) makes construction *fail*, because
Biopython builds that string with `+=` and concatenating `None` raises.

`new AtomKey(args)` takes the argument *list*, because TypeScript cannot tell `AtomKey(*fields)` from
`AtomKey(fields)`: a string or a whole key is `new AtomKey("52_G_CA")`, ordered fields are
`new AtomKey(["52", null, "G", "CA"])`, and a single list or object of fields is nested,
`new AtomKey([[52, null, "G", "CA"]])`. Ordering lives in `compare`, which returns Biopython's **pair of ranks**
rather than a sign, because the two are not interchangeable: ranking two atom names that appear in none of its
tables falls through to `int()` of the names and raises `ValueError`, and comparing a one-letter residue name with a
three-letter one raises from `ord()`. Both are reproduced.

Reading a residue's internal coordinates **changes the structure**: `O'` and `O''` are renamed to `O` and `OXT` on
the atoms themselves, as Biopython does it. Only atoms named in `acceptAtoms` are kept at all, which is how the
waters, ligands and oddities of a PDB file are ignored, and a residue that is neither one of the twenty amino acids
nor named in `acceptResnames` keeps nothing. `icSettings` holds the switches Biopython keeps as class attributes on
`IC_Residue` (`noAltloc`, `glyCbeta`), in a module of their own so that `AtomKey` and `IC_Residue` can both consult
them without importing one another.

`splitAkl` makes a generic list of atoms specific to a residue and expands it over alternative locations, which is
what gives a disordered residue one set of angles per altloc. Biopython iterates a `set` of altlocs there, so the
**order** of the lists it returns depends on the interpreter's hash seed and changes between runs; this port sorts
them, and the golden cases compare them sorted — with the generated file proven byte-identical across runs under
`PYTHONHASHSEED=random`.

An attribute Biopython only ever assigns in one place is unset until that place runs, and reading it raises. The
port models two of those rather than returning a default: `NCaCKey`, which `linkDihedra` sets and a residue whose
atoms were all rejected therefore never gets, and `Dihedron.ric`. `icSettings.glyCbeta` is refused for now, since
adding a C-beta to a glycine needs `Dihedron._set_hedra`, which comes with the rest of the chain.

`new IC_Chain(chain)` picks the residues: a residue counts when it is not a hetero residue or is named in
`acceptResnames`, and two consecutive ones are linked when the distance from the previous C to this N is under 1.4 Å
— the chain breaks otherwise, and a residue with N, CA and C becomes somewhere to restart from, which is what
`initNCaCs` holds. A disordered atom at either end makes any close pair of locations enough.

`buildAtomArray` then lays the atoms out, four numbers to a row (`x, y, z, 1`) in atom-key order, and **the
structure's own coordinates become views into it**: `atom.coord` is a window onto its row, so writing the row moves
the atom, and an atom whose coordinates were 32-bit widens to the array's 64. That is Biopython's behaviour and the
point of the array — a whole chain is recomputed by writing rows.

Still to come: the arrays of angle values (`init_edra`, `build_edraArrays`), the assembly that places atoms from
them (`init_atom_coords`, `assemble_residues`) and the `atom_to_internal_coordinates` /
`internal_to_atom_coordinates` entry points on Chain, Model and Structure, which are the six parity items this
module exists for.

Numerical notes: the cross product reproduces NumPy's `det` (LU factorisation then `exp(sum(log))`), and NumPy's `RuntimeWarning`s (division by zero, invalid value, sqrt of a negative) are emitted through `warn` with category `RuntimeWarning`. NumPy's SIMD `sin`/`cos`/`exp` can differ from JavaScript's in the last bit, so the golden test compares floats to 1e-9 (1e-6 after an `arccos`, which amplifies such differences near 0 and π; a dihedral of ±π counts as equal either way). Cases the golden set avoids because NumPy's own output is undefined: `multiCoordSpace` where the second and third points coincide (uninitialised memory), and `coordSpace` with the first point equal to the second (the result is rounding noise).

## Polypeptides

```ts
import { CaPPBuilder, PPBuilder, isAa } from "@biolibs/pdb";

for (const pp of new PPBuilder().buildPeptides(structure)) {      // first model; a Model or Chain also works
  console.log(String(pp.getSequence()), pp.getPhiPsiList());
}
new PPBuilder().buildPeptides(chain, 0);                          // aaOnly = 0 also takes modified residues (and warns for unknown ones with a CA)
```

`PPBuilder` joins residues whose C and N atoms are within 1.8 Å (checking every alternative location and selecting the bonded ones), `CaPPBuilder` uses CA-CA within 4.3 Å. A `Polypeptide` is an array of residues with `getCaList`, `getPhiPsiList`, `getTauList`, `getThetaList` (the angles also land in each residue's `xtra`), `getSequence` and `repr`. `isAa`/`isNucleic` take a residue or a name (residue names are padded to three characters first, which is why `"A  "` is a nucleotide); `indexToOne`, `oneToIndex`, `indexToThree` and `threeToIndex` use the 20 standard amino acids sorted by one-letter code. The residue-name tables (`pdb-data.ts`, generated from `Bio.Data.PDBData`) live in this package; `@biolibs/seqio` imports them from here.

## Neighbor search

```ts
import { NeighborSearch } from "@biolibs/pdb";

const ns = new NeighborSearch([...structure.getAtoms()], 10);   // atoms, bucket size (> 1)
ns.search(atom.getCoord(), 5.0, "R");   // residues with an atom within 5 Å; levels A, R, C, M, S
ns.searchAll(4.0, "A");                  // pairs of atoms within 4 Å of each other
```

`KDTree` is a port of Biopython's C extension: the same tree (median split by cycling axes, leaf buckets), the same traversal, so `search` and `neighborSearch` return points in the order the C code does. Two things differ in principle from running the C code on your platform. First, the C code sorts with `qsort`, whose treatment of equal coordinates is platform-dependent; here the sort is stable, so results are identical whenever no two points share a coordinate value (the golden cases are chosen that way). Second, above atom level Biopython's `search_all` deduplicates pairs through a Python `set`, so its order changes from run to run; here the pairs come in first-appearance order, and the tests compare them sorted. `unfoldEntities` (going up a level keeps first-appearance order) is deterministic in both. `Point.repr()` and `Neighbor.repr()` follow the C source's `%g` format, but the Python 3.15 build used for the goldens raises `SystemError` on them, so they are not golden-verified.

## Solvent accessible surface area

```ts
import { ShrakeRupley } from "@biolibs/pdb";

const sr = new ShrakeRupley(1.4, 100);          // probe radius (Å), points per atom, optional radii by element
sr.compute(structure, "R");                      // levels A, R, C, M, S (not above the entity's own level)
structure.childList[0]!.childList[0]!.childList[0]!.sasa;
```

Every atom gets a `sasa` property, and so does every entity of the chosen level (the sum over its atoms). Elements missing from `ATOMIC_RADII` get 2.0 Å and are added to `radiiDict`, as Python's `defaultdict` does. The sphere points are the golden spiral in single precision and the KD tree is the one above, so the counts match Biopython's exactly; the sums are compared to 1e-9 because the order of additions differs from NumPy's.

## Superimposing

```ts
import { Superimposer } from "@biolibs/pdb";

const sup = new Superimposer();
sup.setAtoms(fixedAtoms, movingAtoms);   // same length; coordinates are read in double precision
sup.rms;  sup.rotran;
sup.apply(movingAtoms);                   // or any atoms, e.g. a whole chain's: rotation and translation in single precision
```

`setAtoms` throws `PDBException` for lists of different length and `apply` throws one before a transformation exists. The SVD itself is in `@biolibs/svdsuperimposer`.

## Moving and measuring structures

`entity.transform(rot, tran)` applies `coord @ rot + tran` to every atom below, `atom.getVector()` returns the coordinates as a `Vector`, and `entity.centerOfMass(geometric?)` gives the center of mass (or of geometry) as a float32 array. NumPy's dtype rules carry over: coordinates stay `Float32Array` only when `rot` (as `Float32Array` rows) and `tran` (a `Float32Array`) are single precision too; any `number[]`/`Float64Array` operand makes the result `Float64Array`, as a float64 NumPy array does. A transform with a 3xN matrix gives N-component coordinates, as in NumPy. On a `DisorderedAtom`, `transform` moves every alternative, whereas on a `DisorderedResidue` it reaches only the selected residue (Python forwards the call), and `centerOfMass` follows Biopython's own queue so a stray child in a disordered wrapper fails the same way.

## Hierarchy

`Structure` > `Model` > `Chain` > `Residue` > `Atom`, all built on `Entity` (`get`, `has`, `delete`, `add`, `insert`, `detachChild`, `fullId`, `equals`/`compare`, `copy`, `strictlyEquals`). Alternative locations are `DisorderedAtom` (altlocs) and `DisorderedResidue` (point mutations); both forward unknown properties to the selected child, as Python's `__getattr__` does.

Details kept faithful to Biopython:

- Coordinates are `Float32Array`; `atom.minus(other)` computes the distance in single precision.
- A chain's comparisons are not an ordering, so they live in `Chain.compareOp(other, op)` rather than `compare`: Biopython special-cases the blank id and returns the **integers** 0 and 1 there, the same value whichever operator was asked for, so `blank < other` and `blank > other` are both `0`.
- Changing an id to one already used by a sibling warns, and `detachChild(3)` on a `Chain` raises `KeyError` after the child has been detached, because Python deletes the untranslated id.
- `Atom.strictlyEquals` raises `TypeError` when a B-factor or occupancy is missing (`np.isclose(None, None)`).
- Ordering of entities of different kinds raises `TypeError`, as Python's `NotImplemented` does.
- A disordered wrapper compares, and is indexed, through its selected child: `length`, `get` and `has` delegate, so every one of them throws on a `DisorderedAtom` (an `Atom` is not a container) while a `DisorderedResidue` reports its residue. With a wrapper on the *right*, Biopython reaches the answer by reflection — the mirrored operator is retried on the wrapper, which delegates it — so the comparison that happens is the mirror of the one asked for, and its `TypeError` names the operands in that mirrored order. `compareThroughWrapper` models exactly that.

## Not yet ported

Internal coordinates (`internal_coords`, `ic_data`, `ic_rebuild`), DSSP and NACCESS (which run external programs), `HSExposure`, `ResidueDepth`, `FragmentMapper`, `StructureAlignment`/`cealign`, `PDBList`, `PDBMLParser`, `PICIO`, `SCADIO`, `binary_cif`/MMTF and `alphafold_db`. The SeqIO formats `pdb-atom`, `cif-atom` and `cif-seqres` are in `@biolibs/seqio`.
