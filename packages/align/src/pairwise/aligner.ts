/**
 * `PairwiseAligner`: the settings of Biopython's pairwise aligner (modes, match and mismatch scores, substitution
 * matrix, and every gap-score property) and score-only alignment.
 */

import { ValueError, pyFormatFixed, pyTypeName, warn } from "@biolibs/core";
import { MutableSeq, Seq, reverseComplement } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SubstitutionArray, loadMatrix } from "../substitution-matrices/index.js";
import { GAP_PROPERTIES, RENAMED_PROPERTIES, type GapPropertySpec, type GapScoreAccessors, type GapScoreFunction } from "./gap-properties.js";
import { checkNotEmpty, convertSequence, prepareIndices, type SequenceInput } from "./sequences.js";
import { PairwiseAlignments } from "../alignment/index.js";
import { watermanSmithBeyerGlobalAlign, watermanSmithBeyerLocalAlign } from "./align-wsb.js";
import { fogsaaAlign, fogsaaScore } from "./fogsaa.js";
import { gotohGlobalAlign, gotohLocalAlign } from "./align-gotoh.js";
import { smithWatermanAlign, needlemanWunschAlign, type AlignResult } from "./align-linear.js";
import type { PathGeneratorBase } from "./path-generator.js";
import { gotohGlobalScore, gotohLocalScore } from "./score-gotoh.js";
import { needlemanWunschScore, smithWatermanScore, type AlignScore } from "./score-linear.js";
import { watermanSmithBeyerGlobalScore, watermanSmithBeyerLocalScore } from "./score-wsb.js";
import { GAP_SCORE_NAMES, chooseAlgorithm, type GapFunctions, type GapScores, type Mode } from "./state.js";

/** Settings accepted by the {@link PairwiseAligner} constructor: `scoring` and any property, by its camelCase name. */
export type AlignerOptions = { scoring?: string | null } & Partial<GapScoreAccessors> & {
  mode?: Mode;
  matchScore?: number;
  mismatchScore?: number;
  match?: number;
  mismatch?: number;
  substitutionMatrix?: SubstitutionArray | null;
  epsilon?: number;
  wildcard?: string | null;
};

/** What {@link PairwiseAligner.warnDefaultsChanged} says, word for word as Biopython says it. */
const DEFAULTS_CHANGED = "\nNote that the default value for the gap score parameter of a\n"
  + "PairwiseAligner object has changed.\n\n"
  + "In older versions of Biopython, the pairwise aligner was initialized\n"
  + "by default with a match score of +1, a mismatch score of 0, and a gap\n"
  + "score of 0.  This choice was made to be consistent with the pairwise\n"
  + "alignment code in Bio.pairwise2.\n\n"
  + "However, this scoring scheme tends to produce a large number of alignments\n"
  + "with only trivial difference between them.  In particular, a mismatch\n"
  + "between two letters, a single insertion followed by a deletion, and a\n"
  + "deletion followed by an insertion are all assigned the same score. For long\n"
  + "sequences, the number of alignments with such trivial differences can be\n"
  + "astronomical.\n\n"
  + "In Biopython 1.86, the default gap score was therefore changed to -1,\n"
  + "while the default match score remained +1 and the default mismatch score\n"
  + "remained 0.\n";

/**
 * Whether the gap-score warning has already been given.
 *
 * Biopython keeps this in its C module, not on the aligner, so the warning is given at most once in the lifetime of
 * the process however many aligners ask for it. {@link resetDefaultsWarning} puts it back for the parity tests,
 * which replay many cases in one process.
 */
let defaultsWarningGiven = false;

/** Forget that the gap-score warning was given, so that the next call warns again. For tests. */
export function resetDefaultsWarning(): void {
  defaultsWarningGiven = false;
}

/** Python `PyFloat_AsDouble`: numbers and booleans convert, anything else is a TypeError. */
function asDouble(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return Number(value);
  throw new TypeError(`must be real number, not ${pyTypeName(value)}`);
}

const ALPHABET_WARNING = "The alphabet property is deprecated. The current implementation stores the alphabet, but does not use it.";

const camel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The twelve gap scores of a fresh aligner are all -1 (Biopython 1.86 changed the default from 0). */
function defaultGaps(): GapScores & GapFunctions {
  const g = {} as Record<string, number | null>;
  for (const name of GAP_SCORE_NAMES) g[name] = -1.0;
  return { ...(g as unknown as GapScores), insertionScoreFunction: null, deletionScoreFunction: null };
}

/**
 * Pairwise sequence aligner. Matches Biopython's `PairwiseAligner`: it picks Needleman-Wunsch, Smith-Waterman,
 * Gotoh or Waterman-Smith-Beyer from the gap scores and mode. {@link PairwiseAligner.score} is ported for all of
 * them; {@link PairwiseAligner.align} too (FOGSAA finds a single alignment).
 *
 * @example
 * ```ts
 * const aligner = new PairwiseAligner({ mode: "global", matchScore: 2, mismatchScore: -1 });
 * aligner.score("TACCG", "ACG");   // 2 for the shortest-gap alignment: see Biopython's docs
 * ```
 */
export class PairwiseAligner {
  /** @internal The twelve gap scores and the optional gap functions. */
  gaps: GapScores & GapFunctions = defaultGaps();
  private modeValue: Mode = "global";
  private match_ = 1.0;
  private mismatch_ = 0.0;
  private matrix: SubstitutionArray | null = null;
  private epsilon_ = 1e-6;
  private wildcardCode = -1;
  private alphabetValue: unknown = null;
  private alphabetAssigned = false;
  /** @internal Attributes assigned through a renamed name that has no real counterpart. */
  extras = new Map<string, unknown>();
  /** @internal Which of the twelve base gap scores have been assigned, for {@link PairwiseAligner.warnDefaultsChanged}. */
  assignedGaps = new Set<string>();

  /**
   * Warn that the default gap score changed in Biopython 1.86, unless every gap score was set explicitly.
   *
   * The twelve base gap scores must all have been assigned for the warning to be skipped, which one setting can do
   * (`gapScore`) or two together (`openGapScore` and `extendGapScore`, or `internalGapScore` and `endGapScore`).
   * Biopython keeps the "already warned" flag in its C module rather than on the aligner, so the warning is given
   * at most once per process no matter how many aligners ask; {@link resetDefaultsWarning} clears it.
   *
   * @returns Nothing. Biopython's docstring claims a boolean, but the function returns `None`.
   * @example
   * ```ts
   * new PairwiseAligner().warnDefaultsChanged();          // warns
   * const a = new PairwiseAligner({ gapScore: -1 });
   * a.warnDefaultsChanged();                              // says nothing
   * ```
   */
  warnDefaultsChanged(): void {
    if (this.assignedGaps.size >= GAP_SCORE_NAMES.length) return;
    if (defaultsWarningGiven) return;
    defaultsWarningGiven = true;
    warn(DEFAULTS_CHANGED, "UserWarning");
  }

  /**
   * @param options - `scoring` (`"blastn"`, `"megablast"`, `"blastp"` or null) and any property by name.
   * @throws {@link ValueError} for an unknown scoring scheme.
   */
  constructor(options: AlignerOptions = {}) {
    const { scoring = null, ...rest } = options;
    if (scoring === null || scoring === undefined) { /* defaults */ }
    else if (scoring === "blastn") { this.substitutionMatrix = loadMatrix("BLASTN"); this.openGapScore = -7.0; this.extendGapScore = -2.0; }
    else if (scoring === "megablast") { this.substitutionMatrix = loadMatrix("MEGABLAST"); this.openGapScore = -2.5; this.extendGapScore = -2.5; }
    else if (scoring === "blastp") { this.substitutionMatrix = loadMatrix("BLASTP"); this.openGapScore = -12.0; this.extendGapScore = -1.0; }
    else throw new ValueError(`Unknown scoring scheme '${scoring}'`);
    for (const [name, value] of Object.entries(rest)) {
      if (!(name in this) && name !== "alphabet") throw new TypeError(`'PairwiseAligner' object has no attribute '${name}'`);
      (this as unknown as Record<string, unknown>)[name] = value;
    }
  }

  /** Alignment mode: `"global"`, `"local"` or `"fogsaa"`. @throws {@link ValueError} for any other value. */
  get mode(): Mode {
    return this.modeValue;
  }
  set mode(value: Mode) {
    if (value !== "global" && value !== "local" && value !== "fogsaa") throw new ValueError("invalid mode (expected 'global', 'local', or 'fogsaa'");
    this.modeValue = value;
  }

  /** Score for identical letters; `null` while a substitution matrix is set. */
  get matchScore(): number | null {
    return this.matrix ? null : this.match_;
  }
  set matchScore(value: number) {
    let v: number;
    try { v = asDouble(value); } catch { throw new ValueError("invalid match score"); }
    this.matrix = null;
    this.match_ = v;
  }
  /** Score for different letters; `null` while a substitution matrix is set. */
  get mismatchScore(): number | null {
    return this.matrix ? null : this.mismatch_;
  }
  set mismatchScore(value: number) {
    let v: number;
    try { v = asDouble(value); } catch { throw new ValueError("invalid mismatch score"); }
    this.matrix = null;
    this.mismatch_ = v;
  }
  /** Synonym of {@link PairwiseAligner.matchScore}. */
  get match(): number | null { return this.matchScore; }
  set match(value: number) { this.matchScore = value; }
  /** Synonym of {@link PairwiseAligner.mismatchScore}. */
  get mismatch(): number | null { return this.mismatchScore; }
  set mismatch(value: number) { this.mismatchScore = value; }

  /** The substitution matrix, or null. Setting `null` clears it. @throws {@link ValueError} for anything but a square float matrix. */
  get substitutionMatrix(): SubstitutionArray | null {
    return this.matrix;
  }
  set substitutionMatrix(value: SubstitutionArray | null) {
    if (value === null) { this.matrix = null; return; }
    if (!(value instanceof SubstitutionArray)) throw new ValueError("expected a matrix");
    if (value.ndim !== 2) throw new ValueError(`substitution matrix has incorrect rank (${value.ndim} expected 2)`);
    if (value.data.length === 0) throw new ValueError("substitution matrix has zero size");
    if (value.dtype !== "float") throw new ValueError("substitution matrix should contain float values");
    if (value.shape[0] !== value.shape[1]) throw new ValueError(`substitution matrix should be square (found a ${value.shape[0]} x ${value.shape[1]} matrix)`);
    this.matrix = value;
  }

  /** Roundoff tolerance used when comparing scores while tracing alignments. */
  get epsilon(): number { return this.epsilon_; }
  set epsilon(value: number) { this.epsilon_ = asDouble(value); }

  /** Letter that scores 0 against anything (used only without a substitution matrix), or null. */
  get wildcard(): string | null {
    return this.wildcardCode === -1 ? null : String.fromCodePoint(this.wildcardCode);
  }
  set wildcard(value: string | null) {
    if (value === null) { this.wildcardCode = -1; return; }
    if (typeof value !== "string") throw new TypeError("wildcard should be a single character, or None");
    const chars = Array.from(value);
    if (chars.length !== 1) throw new ValueError("wildcard should be a single character, or None");
    this.wildcardCode = chars[0]!.codePointAt(0)!;
  }

  /** Deprecated: stored but never used. Reading it before it was set warns and gives null; once set it is a plain attribute. */
  get alphabet(): unknown {
    if (!this.alphabetAssigned) warn(ALPHABET_WARNING, "BiopythonDeprecationWarning");
    return this.alphabetValue;
  }
  set alphabet(value: unknown) {
    warn(ALPHABET_WARNING, "BiopythonDeprecationWarning");
    this.alphabetValue = value;
    this.alphabetAssigned = true;
  }

  /** Name of the algorithm the current settings select, e.g. `"Needleman-Wunsch"`. */
  get algorithm(): string {
    const a = chooseAlgorithm(this.gaps, this.modeValue);
    const local = this.modeValue === "local";
    switch (a) {
      case "NeedlemanWunschSmithWaterman": return local ? "Smith-Waterman" : "Needleman-Wunsch";
      case "Gotoh": return `Gotoh ${local ? "local" : "global"} alignment algorithm`;
      case "WatermanSmithBeyer": return `Waterman-Smith-Beyer ${local ? "local" : "global"} alignment algorithm`;
      default: return "Fast Optimal Global Sequence Alignment Algorithm";
    }
  }

  /** Best and worst letter scores for FOGSAA's bounds: match and mismatch, or the largest and smallest matrix entries. */
  private fogsaaBounds(): [number, number] {
    const m = this.matrix;
    if (!m) return [this.match_, this.mismatch_];
    let match = m.data[0]!;
    let mismatch = m.data[0]!;
    for (const v of m.data) {
      if (v > match) match = v;
      else if (v < mismatch) mismatch = v;
    }
    return [match, mismatch];
  }

  /** Scorer for a pair of letter indices: the matrix entry, or match/mismatch/wildcard. */
  private alignScore(): AlignScore {
    const m = this.matrix;
    if (m) {
      const n = m.shape[0]!;
      const data = m.data;
      return (kA, kB) => data[kA * n + kB]!;
    }
    const { match_: match, mismatch_: mismatch, wildcardCode: wildcard } = this;
    return (kA, kB) => (kA === wildcard || kB === wildcard ? 0 : kA === kB ? match : mismatch);
  }

  /**
   * The alignment score of two sequences.
   *
   * @param seqA - Target: a string, `Seq`, `MutableSeq`, `SeqRecord`, bytes, `Int32Array` of indices, or a list of items.
   * @param seqB - Query: the same kinds.
   * @param strand - `"+"` or `"-"` (the query's reverse complement is aligned).
   * @throws {@link ValueError} for an empty sequence, a bad strand, or letters the substitution matrix lacks.
     */
  score(seqA: SequenceInput, seqB: SequenceInput, strand: string = "+"): number {
    const built: unknown[] = [];
    const a = convertSequence(seqA, this.matrix, built);
    let queryInput: unknown = seqB;
    if (strand === "-") queryInput = reverseComplementOf(seqB);
    const b = convertSequence(queryInput, this.matrix, built);
    checkNotEmpty(a);
    checkNotEmpty(b);
    if (strand !== "+" && strand !== "-") throw new ValueError("strand must be '+' or '-'");
    if (this.matrix) prepareIndices(this.matrix, a, b);
    const align = this.alignScore();
    const algorithm = chooseAlgorithm(this.gaps, this.modeValue);
    const local = this.modeValue === "local";
    switch (algorithm) {
      case "NeedlemanWunschSmithWaterman":
        return local ? smithWatermanScore(this.gaps, a, b, align) : needlemanWunschScore(this.gaps, a, b, strand, align);
      case "Gotoh":
        return local ? gotohLocalScore(this.gaps, a, b, align) : gotohGlobalScore(this.gaps, a, b, strand, align);
      case "WatermanSmithBeyer":
        return local ? watermanSmithBeyerLocalScore(this.gaps, a, b, strand, align) : watermanSmithBeyerGlobalScore(this.gaps, a, b, strand, align);
      default: {
        // FOGSAA bounds its search with the best and worst letter scores (the extreme matrix entries when a matrix is set).
        const [match, mismatch] = this.fogsaaBounds();
        return fogsaaScore(this.gaps, this.epsilon_, a, b, strand, align, match, mismatch);
      }
    }
  }

  /**
   * The optimal alignments of two sequences.
   *
   * @param seqA - Target (any kind accepted by {@link PairwiseAligner.score}).
   * @param seqB - Query.
   * @param strand - `"+"` or `"-"`: with `"-"` the reverse complement of the query is aligned, and the query
   *   coordinates of the alignments run backwards.
   * @returns The alignments (generated lazily), each carrying the optimal score.
   * @throws {@link ValueError} as {@link PairwiseAligner.score} does.
     */
  align(seqA: SequenceInput, seqB: SequenceInput, strand: string = "+"): PairwiseAlignments {
    const built: unknown[] = [];
    const a = convertSequence(seqA, this.matrix, built);
    const queryInput: unknown = strand === "-" ? reverseComplementOf(seqB) : seqB;
    const b = convertSequence(queryInput, this.matrix, built);
    checkNotEmpty(a);
    checkNotEmpty(b);
    if (strand !== "+" && strand !== "-") throw new ValueError("strand must be '+' or '-'");
    if (this.matrix) prepareIndices(this.matrix, a, b);
    const align = this.alignScore();
    const algorithm = chooseAlgorithm(this.gaps, this.modeValue);
    const local = this.modeValue === "local";
    let result: AlignResult<PathGeneratorBase>;
    switch (algorithm) {
      case "NeedlemanWunschSmithWaterman":
        result = local ? smithWatermanAlign(this.gaps, this.epsilon_, a, b, strand, align) : needlemanWunschAlign(this.gaps, this.epsilon_, a, b, strand, align);
        break;
      case "Gotoh":
        result = local ? gotohLocalAlign(this.gaps, this.epsilon_, a, b, strand, align) : gotohGlobalAlign(this.gaps, this.epsilon_, a, b, strand, align);
        break;
      case "WatermanSmithBeyer":
        result = local ? watermanSmithBeyerLocalAlign(this.gaps, this.epsilon_, a, b, strand, align) : watermanSmithBeyerGlobalAlign(this.gaps, this.epsilon_, a, b, strand, align);
        break;
      default: {
        const [match, mismatch] = this.fogsaaBounds();
        result = fogsaaAlign(this.gaps, this.epsilon_, a, b, strand, align, match, mismatch);
      }
    }
    return new PairwiseAlignments(seqA, seqB, result.score, result.paths);
  }

  /** The text Biopython prints for the aligner (`str(aligner)`). */
  toString(): string {
    const f = (x: number): string => pyFormatFixed(x, 6);
    const g = this.gaps;
    let s = "Pairwise sequence aligner with parameters\n";
    if (this.matrix) s += "  substitution_matrix: <Array object>\n";
    else {
      s += `  wildcard: ${this.wildcard === null ? "None" : `'${this.wildcard}'`}\n`;
      s += `  match_score: ${f(this.match_)}\n  mismatch_score: ${f(this.mismatch_)}\n`;
    }
    const side = (kind: "insertion" | "deletion", fn: GapScoreFunction | null): string => {
      if (fn) return `  ${kind}_score_function: <function ${fn.name}>\n`;
      const K = kind === "insertion" ? "Insertion" : "Deletion";
      return ["Internal", "Left", "Right"].map((where) => `  open_${where.toLowerCase()}_${kind}_score: ${f(g[`open${where}${K}Score` as keyof GapScores])}\n  extend_${where.toLowerCase()}_${kind}_score: ${f(g[`extend${where}${K}Score` as keyof GapScores])}\n`).join("");
    };
    return s + side("insertion", g.insertionScoreFunction) + side("deletion", g.deletionScoreFunction) + `  mode: ${this.modeValue}\n`;
  }
}

/** Reverse complement of a query for the minus strand. @throws TypeError for kinds Biopython cannot reverse-complement. */
function reverseComplementOf(seq: unknown): unknown {
  if (typeof seq === "string") return reverseComplement(seq);
  if (seq instanceof Seq || seq instanceof MutableSeq) return reverseComplement(seq);
  if (seq instanceof SeqRecord && seq.seq) return reverseComplement(seq.seq);
  throw new TypeError("'object' has no attribute 'encode'");
}

// Generated gap-score properties (and the deprecated names that forward to them) on the prototype.
for (const spec of GAP_PROPERTIES) Object.defineProperty(PairwiseAligner.prototype, camel(spec.name), { get: makeGetter(spec), set: makeSetter(spec), configurable: true });
for (const [oldName, newName] of Object.entries(RENAMED_PROPERTIES)) {
  const message = `The attribute '${oldName}' was renamed to '${newName}'. This was done to be consistent with the\nAlignmentCounts object returned by the .counts method of an Alignment object.`;
  const key = camel(newName);
  // The two gap-function names point at attributes Biopython's C object does not expose: assigning stores a plain
  // instance attribute that nothing reads, and reading before assigning is an AttributeError.
  const real = Object.hasOwn(PairwiseAligner.prototype, key);
  Object.defineProperty(PairwiseAligner.prototype, camel(oldName), {
    get(this: PairwiseAligner) {
      warn(message, "BiopythonDeprecationWarning");
      if (real) return (this as unknown as Record<string, unknown>)[key];
      if (!this.extras.has(key)) throw new TypeError(`'PairwiseAligner' object has no attribute '${newName}'`);
      return this.extras.get(key);
    },
    set(this: PairwiseAligner, value: unknown) {
      warn(message, "BiopythonDeprecationWarning");
      if (real) (this as unknown as Record<string, unknown>)[key] = value;
      else this.extras.set(key, value);
    },
    configurable: true,
  });
}

/** Typed accessors for the gap-score properties. */
export interface PairwiseAligner extends GapScoreAccessors {}

function makeGetter(spec: GapPropertySpec): (this: PairwiseAligner) => unknown {
  return function (this: PairwiseAligner) {
    const g = this.gaps as unknown as Record<string, number | GapScoreFunction | null>;
    const first = g[spec.fields[0]!] as number;
    const equal = (): void => {
      for (const f of spec.fields) if (first !== g[f]) throw new ValueError("gap scores are different");
    };
    const ins = this.gaps.insertionScoreFunction;
    const del = this.gaps.deletionScoreFunction;
    if (spec.name === "gap_score") {
      if (ins || del) {
        if (ins !== del) throw new ValueError("gap scores are different");
        return ins;
      }
      equal();
      return first;
    }
    if (spec.name === "insertion_score" || spec.name === "deletion_score") {
      const fn = spec.name === "insertion_score" ? ins : del;
      if (fn) return fn;
      equal();
      return first;
    }
    const fnSet = spec.side === "both" ? ins || del : spec.side === "insertion" ? ins : del;
    if (fnSet) throw new ValueError("using a gap score function");
    if (spec.fields.length > 1) equal();
    return first;
  };
}

function makeSetter(spec: GapPropertySpec): (this: PairwiseAligner, value: unknown) => void {
  return function (this: PairwiseAligner, value: unknown) {
    const gaps = this.gaps;
    if (spec.callable && typeof value === "function") {
      if (spec.side !== "deletion") gaps.insertionScoreFunction = value as GapScoreFunction;
      if (spec.side !== "insertion") gaps.deletionScoreFunction = value as GapScoreFunction;
      return;
    }
    let score: number;
    try {
      score = asDouble(value);
    } catch (e) {
      if (spec.name === "insertion_score" || spec.name === "deletion_score") throw new ValueError("gap score should be numerical or callable");
      throw e;
    }
    if (spec.side !== "deletion") gaps.insertionScoreFunction = null;
    if (spec.side !== "insertion") gaps.deletionScoreFunction = null;
    for (const f of spec.fields) {
      (gaps as unknown as Record<string, number>)[f] = score;
      this.assignedGaps.add(f);
    }
  };
}
