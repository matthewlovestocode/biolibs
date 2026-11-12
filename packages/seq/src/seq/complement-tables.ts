/** Byte tables used to complement DNA and RNA. */

import * as IUPAC from "../data/iupac-data.js";
import * as pb from "../pybytes/index.js";

/** Complement table from a Python mapping, covering upper and lower case (Biopython's `_maketrans`). */
function maketransFromMapping(mapping: Record<string, string>): Uint8Array {
  const keys = pb.encodeAscii(Object.keys(mapping).join(""));
  const values = pb.encodeAscii(Object.values(mapping).join(""));
  return pb.maketrans(pb.concat(keys, pb.lower(keys)), pb.concat(values, pb.lower(values)));
}

/** 256-entry byte table complementing DNA (IUPAC aware, both cases). `U` complements to `A`, as in Biopython. */
export const dnaComplementTable = maketransFromMapping({ ...IUPAC.ambiguousDnaComplement, U: IUPAC.ambiguousDnaComplement["T"]! });

/** 256-entry byte table complementing RNA. `T` complements to `A`, as in Biopython. */
export const rnaComplementTable = maketransFromMapping({ ...IUPAC.ambiguousRnaComplement, T: IUPAC.ambiguousRnaComplement["U"]! });
