/** Reading and loading substitution matrices (`substitution_matrices.read` and `load`). */

import { AssertionError, FileNotFoundError, IndexError, UnboundLocalError, ValueError } from "./py-errors.js";
import { pyInt } from "@biolibs/core";
import { SubstitutionArray, type Alphabet, type ArrayDtype } from "./array.js";
import { MATRIX_FILES, MATRIX_NAMES } from "./matrix-files.js";

/** Python `str.split()` on whitespace. */
const words = (s: string): string[] => s.split(/\s+/).filter((w) => w.length > 0);

/** Python `float(word)` for the forms matrix files use. @throws {@link ValueError} otherwise. */
function pyFloat(word: string): number {
  const t = word.trim();
  if (!/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?|inf(inity)?|nan)$/i.test(t)) throw new ValueError(`could not convert string to float: '${word}'`);
  return Number(t.replace(/^([+-]?)inf(inity)?$/i, "$1Infinity").replace(/^[+-]?nan$/i, "NaN"));
}

/** The alphabet of the keys: a string when every key is one letter, else a list. */
function alphabetOf(keys: string[]): Alphabet {
  return keys.some((k) => k.length > 1) ? keys : keys.join("");
}

/**
 * Parse the text of a matrix file: `#` header lines, then either two columns (a 1-D array) or a square table.
 *
 * @param text - File contents.
 * @param dtype - Element type; Biopython's default is float.
 * @throws {@link IndexError} for a file with no data rows; {@link ValueError} for a malformed number.
 */
export function readMatrix(text: string, dtype: ArrayDtype = "float"): SubstitutionArray {
  const lines = text.split(/(?<=\n)|(?<=\r)(?!\n)/).filter((l) => l !== "");
  if (lines.length === 0) throw new UnboundLocalError("cannot access local variable 'i' where it is not associated with a value");
  const header: string[] = [];
  let start = 0;
  // Python leaves `i` at the last line when every line is a comment.
  for (; start < lines.length; start++) {
    if (!lines[start]!.startsWith("#")) break;
    header.push(lines[start]!.slice(1).trim());
  }
  if (start === lines.length) start = Math.max(0, lines.length - 1);
  const rows = lines.slice(start).map(words);
  if (rows.length < 2) throw new IndexError("list index out of range");
  let matrix: SubstitutionArray;
  if (rows[0]!.length === 2 && rows[1]!.length === 2) {
    const alphabet = alphabetOf(rows.map((r) => r[0]!));
    matrix = new SubstitutionArray({ alphabet, dims: 1, dtype });
    // The words are assigned as strings: numpy parses them as floats, or (integer arrays) as `int(word)`.
    matrix.update(rows.map(([k, v]) => [k!, dtype === "int" ? pyInt(v!) : pyFloat(v!)]));
  } else {
    const alphabet = alphabetOf(rows.shift()!);
    matrix = new SubstitutionArray({ alphabet, dims: 2, dtype });
    [...alphabet].forEach((letter1, i) => {
      const row = rows[i];
      if (row === undefined) return;
      const letter = row.shift();
      if (letter1 !== letter) throw new AssertionError("");
      [...alphabet].forEach((letter2, j) => {
        if (row[j] !== undefined) matrix.set([letter1, letter2], pyFloat(row[j]!));
      });
    });
  }
  matrix.header = header;
  return matrix;
}

/**
 * Names of the bundled matrices (`load()`), sorted.
 */
export function loadNames(): string[] {
  return [...MATRIX_NAMES];
}

/**
 * Load a bundled substitution matrix, e.g. `"BLOSUM62"` or `"NUC.4.4"`.
 *
 * @throws {@link FileNotFoundError} for an unknown name.
 */
export function loadMatrix(name: string): SubstitutionArray {
  const text = Object.hasOwn(MATRIX_FILES, name) ? MATRIX_FILES[name]! : undefined;
  if (text === undefined) throw new FileNotFoundError(name);
  return readMatrix(text);
}
