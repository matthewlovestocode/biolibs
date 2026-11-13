/**
 * What a reference library is made of.
 *
 * No library ships with this package, and that is deliberate: the collections of annotated parts that would fill one
 * carry their own licences, and several of the obvious sources (Addgene's site content, for one) are limited to
 * non-commercial use, which would not sit inside an MIT package. {@link detectFeatures} therefore takes the library
 * as an argument, so a caller supplies pieces under whatever terms apply to them — cut out of records they already
 * hold, read from a file, or published separately with their own notice.
 */

import { ValueError } from "@biolibs/core";

/** One piece to look for: a promoter, a resistance gene, an origin, a tag. */
export interface ReferencePiece {
  /** What to call the feature when it is found, e.g. `"AmpR"`. */
  name: string;
  /** The feature type to give it, as GenBank spells them, e.g. `"CDS"`, `"promoter"`, `"rep_origin"`. */
  type: string;
  /** The piece's own sequence, 5' to 3', unambiguous DNA. */
  sequence: string;
  /**
   * How many mismatched bases are tolerated as a fraction of the piece's length. Leave it unset to use the search's
   * own default, which is stricter for short pieces (see {@link DEFAULT_DETECT}).
   */
  tolerance?: number;
  /** Anything worth recording on the feature, such as where the piece was taken from. Becomes a `/note`. */
  note?: string;
}

/** Unambiguous DNA. */
const BASES = /^[ACGT]+$/;

/**
 * Check a library and say what is wrong with it.
 *
 * @param library - The pieces to check.
 * @returns A list of problems, empty when the library is usable.
 * @example
 * ```ts
 * libraryProblems([{ name: "x", type: "CDS", sequence: "ACGN" }]);
 * // ["piece 'x': the sequence may only contain A, C, G and T"]
 * ```
 */
export function libraryProblems(library: readonly ReferencePiece[]): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const piece of library) {
    const where = `piece '${piece.name}'`;
    if (piece.name === "") problems.push("a piece has no name");
    else if (names.has(piece.name)) problems.push(`${where}: two pieces share this name`);
    names.add(piece.name);
    if (piece.sequence === "") problems.push(`${where}: the sequence is empty`);
    else if (!BASES.test(piece.sequence)) problems.push(`${where}: the sequence may only contain A, C, G and T`);
    if (piece.tolerance !== undefined && (!Number.isFinite(piece.tolerance) || piece.tolerance < 0 || piece.tolerance > 1)) {
      problems.push(`${where}: the tolerance must be between 0 and 1`);
    }
  }
  return problems;
}

/**
 * Throw unless a library is usable.
 *
 * @param library - The pieces to check.
 * @throws {@link ValueError} listing every problem {@link libraryProblems} found.
 */
export function requireLibrary(library: readonly ReferencePiece[]): void {
  const problems = libraryProblems(library);
  if (problems.length > 0) throw new ValueError(`the reference library is not usable: ${problems.join("; ")}`);
}
