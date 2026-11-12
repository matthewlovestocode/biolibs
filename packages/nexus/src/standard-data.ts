/** Multi-state coding data (Biopython's `Bio.Nexus.StandardData`). */

import { IndexError } from "@biolibs/core";
import { NexusError } from "./errors.js";

/** One coded position: its kind (`std`, `multi` for `(AB)`, `uncer` for `{AB}`) and its state characters. */
export interface Coding {
  t: "std" | "multi" | "uncer";
  d: string[];
}

/**
 * A sequence of morphological characters, where a position can be one state, a set of states in parentheses
 * (polymorphism) or in braces (uncertainty).
 *
 * @example
 * ```ts
 * String(new StandardData("01(12){34}"));   // "01(12){34}"
 * ```
 * @throws {@link NexusError} for a stray `)` or `}`.
 */
export class StandardData implements Iterable<Coding> {
  private data: Coding[] = [];

  /** @param data - The coding text. */
  constructor(data: string) {
    if (typeof data !== "string") throw new NexusError("The coding data given to a StandardData object should be a string");
    let multi = false;
    let uncertain = false;
    let current: Coding = { t: "std", d: [] };
    let pos = -1;
    for (const coding of data) {
      pos += 1;
      if (multi) {
        if (coding === ")") multi = false;
        else {
          current.d.push(coding);
          continue;
        }
      } else if (uncertain) {
        if (coding === "}") uncertain = false;
        else {
          current.d.push(coding);
          continue;
        }
      } else if (coding === "(") {
        multi = true;
        current.t = "multi";
        continue;
      } else if (coding === "{") {
        uncertain = true;
        current.t = "uncer";
        continue;
      } else if (coding === ")" || coding === "}") {
        throw new NexusError(`Improper character ${coding} at position ${pos} of a coding sequence.`);
      } else {
        current.d.push(coding);
      }
      this.data.push({ t: current.t, d: [...current.d] });
      current = { t: "std", d: [] };
    }
  }

  /** Number of positions. */
  get length(): number {
    return this.data.length;
  }

  /** The coding at a position. */
  at(index: number): Coding {
    const c = this.data[index < 0 ? this.data.length + index : index];
    if (c === undefined) throw new IndexError("list index out of range");
    return c;
  }

  [Symbol.iterator](): Iterator<Coding> {
    return this.data[Symbol.iterator]();
  }

  /** The underlying list of codings. */
  raw(): Coding[] {
    return this.data;
  }

  /** The coding text again. */
  toString(): string {
    let out = "";
    for (const coding of this.data) {
      if (coding.t === "multi") out += "(" + coding.d.join("") + ")";
      else if (coding.t === "uncer") out += "{" + coding.d.join("") + "}";
      else out += coding.d[0];
    }
    return out;
  }
}
