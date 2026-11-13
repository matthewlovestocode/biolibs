/** `DistanceCalculator`: a distance matrix from an alignment. */

import { Alignment, MultipleSeqAlignment, substitutionMatrices as SM } from "@biolibs/align";
import { ValueError } from "@biolibs/core";
import { SeqRecord } from "@biolibs/seqrecord";
import { DistanceMatrix } from "./matrix.js";
import { fl, type PyNum } from "./num.js";

const PROTEIN_ALPHABET = new Set("ABCDEFGHIKLMNPQRSTVWXYZ");

/** The models, in Biopython's order: `identity`, the nucleotide matrices, then the protein matrices. */
let modelList: string[] | null = null;
function models(): string[] {
  if (modelList === null) {
    const dna: string[] = [], protein: string[] = [];
    for (const name of SM.loadNames()) {
      const alphabet = new Set(Array.from(SM.loadMatrix(name).alphabet as string | string[]));
      const model = name === "NUC.4.4" ? "blastn" : name.toLowerCase();
      if ([...PROTEIN_ALPHABET].every((c) => alphabet.has(c))) protein.push(model); else dna.push(model);
    }
    modelList = ["identity", ...dna, ...protein];
  }
  return modelList;
}

/** Calculates the distance matrix of a DNA or protein alignment with a named model. */
export class DistanceCalculator {
  /** The skipped letters (gaps and stop codons for the matrix models, none for identity). */
  skipLetters: string[];
  /** The scoring matrix, or null for the identity model. */
  scoringMatrix: SM.SubstitutionArray | null;

  /** The model names. */
  static get models(): string[] { return [...models()]; }

  /**
   * @param model - `"identity"` (default) or a name from {@link DistanceCalculator.models}.
   * @param skipLetters - Letters to leave out (default: none for identity, `-` and `*` otherwise).
   * @throws ValueError for an unknown model.
   */
  constructor(model = "identity", skipLetters: string[] | string | null = null) {
    if (skipLetters !== null && skipLetters.length > 0) this.skipLetters = Array.from(skipLetters);
    else if (model === "identity") this.skipLetters = [];
    else this.skipLetters = ["-", "*"];
    if (model === "identity") this.scoringMatrix = null;
    else if (models().includes(model)) this.scoringMatrix = SM.loadMatrix(model === "blastn" ? "NUC.4.4" : model.toUpperCase());
    else throw new ValueError("Model not supported. Available models: " + models().join(", "));
  }

  /** The distance of two sequences, 0 (identical) to 1 (different, or empty). @param id1 - Names for error messages. */
  pairwise(seq1: string, seq2: string, ids: [string | null, string | null] = [null, null]): PyNum {
    const a = Array.from(seq1), b = Array.from(seq2);
    let score = 0, maxScore: number;
    const m = this.scoringMatrix;
    if (m === null) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (!this.skipLetters.includes(a[i]!) && !this.skipLetters.includes(b[i]!) && a[i] === b[i]) score += 1;
      }
      maxScore = a.length;
    } else {
      let max1 = 0, max2 = 0;
      for (let i = 0; i < a.length; i++) {
        const l1 = a[i]!, l2 = b[i]!;
        if (l2 === undefined) throw new RangeError("string index out of range");
        if (this.skipLetters.includes(l1) || this.skipLetters.includes(l2)) continue;
        const entry = (l: string, id: string | null): number => {
          try { return m.get([l, l]) as number; } catch (e) {
            if (e instanceof Error && e.name === "IndexError") {
              if (id === null) throw new TypeError("'str' object has no attribute 'id'");
              throw new ValueError(`Bad letter '${l}' in sequence '${id}' at position '${i}'`);
            }
            throw e;
          }
        };
        max1 += entry(l1, ids[0]);
        max2 += entry(l2, ids[1]);
        score += m.get([l1, l2]) as number;
      }
      maxScore = Math.max(max1, max2);
    }
    if (maxScore === 0) return 1;
    return fl(1 - score / maxScore);
  }

  /**
   * The distance matrix of an alignment.
   *
   * @param msa - An `Alignment` or a `MultipleSeqAlignment`.
   * @throws TypeError for anything else.
   */
  getDistance(msa: unknown): DistanceMatrix {
    if (msa instanceof Alignment) {
      const names = msa.sequences.map((s) => {
        if (!(s instanceof SeqRecord)) throw new TypeError("object has no attribute 'id'");
        return s.id as string;
      });
      const dm = new DistanceMatrix(names);
      for (let i1 = 0; i1 < names.length; i1++) {
        for (let i2 = 0; i2 < i1; i2++) dm.set([names[i1]!, names[i2]!], this.pairwise(msa.get(i1) as string, msa.get(i2) as string));
      }
      return dm;
    }
    if (msa instanceof MultipleSeqAlignment) {
      const records = [...msa];
      const dm = new DistanceMatrix(records.map((s) => s.id));
      for (let i = 0; i < records.length; i++) {
        for (let j = i + 1; j < records.length; j++) {
          const r1 = records[i]!, r2 = records[j]!;
          dm.set([r1.id as string, r2.id as string], this.pairwise(String(r1.seq), String(r2.seq), [r1.id, r2.id]));
        }
      }
      return dm;
    }
    throw new TypeError("Must provide an Alignment object or a MultipleSeqAlignment object.");
  }
}
