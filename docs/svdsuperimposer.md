# @biolibs/svdsuperimposer

A TypeScript port of Biopython's `Bio.SVDSuperimposer`: the rotation and translation that put one set of 3D points on another with the least squared distance (the Kabsch algorithm, via a singular value decomposition). All **7 items** are at parity, verified against Biopython 1.88 on **520 cases**
(`packages/svdsuperimposer/test/golden/svd.json`, built by `reference/golden/gen_svd_cases.py`): point
sets from 1 to 50 points, in both precisions, the degenerate ones included. See
[the package README](../packages/svdsuperimposer/README.md) for the API with worked examples.

```ts
import { SVDSuperimposer } from "@biolibs/svdsuperimposer";

const sup = new SVDSuperimposer();
sup.set(reference, moving);        // Nx3 rows; `moving` will be put on `reference`
sup.run();
const [rot, tran] = sup.getRotran();   // right-multiplying: moved = moving · rot + tran
sup.getRms();  sup.getInitRms();  sup.getTransformed();
```

Points are arrays of rows. Rows that are `Float32Array`s make the computation and the results single precision, as NumPy's `'f'` arrays do; anything else is double precision. Misuse raises Biopython's bare `Exception` (`PythonException`, whose `name` is `"Exception"`): mismatched
sizes, a missing `set` or `run`. An empty set gives `ZeroDivisionError` from `run` itself, before any
getter is reached. The rotation **right-multiplies** — `moved = moving · rot + tran` — and `set` takes the
reference first, which is the opposite order to how it is usually said aloud.

NumPy calls LAPACK for the SVD. This port uses one-sided Jacobi rotations on the 3x3 covariance matrix (`svd3`), which agrees to about 1e-8 in double precision. For rank-deficient input (one point, or three points that are collinear) the singular vectors for zero singular values are arbitrary in any implementation; a zero matrix gives identity factors, as LAPACK does, and otherwise the determinant correction makes a proper rotation, but exactly collinear sets are not guaranteed to match.

The atom-level wrapper `Superimposer` lives in `@biolibs/pdb`.
