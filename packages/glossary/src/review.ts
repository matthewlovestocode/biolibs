/**
 * A place for a biologist to put their name to a term.
 *
 * The words and pictures here were written by people building software. They may be wrong, and a
 * reader who is learning cannot tell. So each term can carry a review: who checked the definition
 * and the picture, in what capacity, and when. It is optional, and a term without one says so.
 *
 * A review is of exactly what was looked at. Each term has a fingerprint made from its words and
 * its picture, and a review records the fingerprint it was given. If either the words or the
 * picture change afterwards, the fingerprint no longer matches and the review is shown as being of
 * an earlier version, never as covering what it did not see.
 */
import { sha1 } from "@biolibs/core";
import type { GlossaryEntry } from "./terms.js";

/** Somebody's name put to a term. */
export interface Review {
  /** The term's slug. */
  slug: string;
  /** Who reviewed it. */
  by: string;
  /** In what capacity: a degree, a post, a field. Whatever lets a reader weigh the name. */
  as: string;
  /** The day it was reviewed, as `YYYY-MM-DD`. */
  on: string;
  /** The fingerprint of what was reviewed, from `termFingerprint`. */
  of: string;
  /** Anything the reviewer wanted said. */
  note?: string;
}

/**
 * Every review there is. It starts empty: nothing here has been signed off by anybody, and the
 * package says so until somebody does.
 *
 * To record one, a biologist reads the term and its picture on the review sheet in
 * `@biolibs/glossary-react`, which shows the fingerprint to copy, and an entry is added here.
 */
export const REVIEWS: readonly Review[] = [];

/**
 * The fingerprint of a term as it stands: its words, and its picture.
 *
 * @param entry - The term.
 * @param picture - The picture as drawn, as text: the SVG a reader is shown.
 * @returns Twelve characters that change if the definition, the detail, the reason or the picture does.
 *
 * @example
 * ```ts
 * import { getEntry, termFingerprint } from "@biolibs/glossary";
 *
 * termFingerprint(getEntry("pcr")!, "<svg>…</svg>").length;    // 12
 * ```
 */
export function termFingerprint(entry: Pick<GlossaryEntry, "slug" | "term" | "definition" | "detail" | "why">, picture: string): string {
  const said = [entry.slug, entry.term, entry.definition, entry.detail, entry.why, picture].join("\u0000");
  return [...sha1(new TextEncoder().encode(said))].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/** Where a term stands with reviewers. */
export interface ReviewState {
  /** `current` if somebody reviewed it as it stands, `earlier` if only an earlier version, `none` if nobody has. */
  state: "current" | "earlier" | "none";
  /** The reviews of it as it stands. */
  current: Review[];
  /** The reviews of versions that have since changed. */
  earlier: Review[];
}

/**
 * Where a term stands with reviewers.
 *
 * @param slug - The term.
 * @param fingerprint - Its fingerprint as it stands, from `termFingerprint`.
 * @param reviews - The reviews to look in.
 * @returns Whether it has been reviewed as it stands, only as it was, or not at all.
 */
export function reviewOf(slug: string, fingerprint: string, reviews: readonly Review[] = REVIEWS): ReviewState {
  const mine = reviews.filter((one) => one.slug === slug);
  const current = mine.filter((one) => one.of === fingerprint);
  const earlier = mine.filter((one) => one.of !== fingerprint);
  return { state: current.length > 0 ? "current" : earlier.length > 0 ? "earlier" : "none", current, earlier };
}

/**
 * A review's state, in the words a reader is shown.
 *
 * @param state - From `reviewOf`.
 * @returns One line.
 */
export function reviewWords(state: ReviewState): string {
  const who = (reviews: readonly Review[]): string => reviews.map((one) => `${one.by}, ${one.as} (${one.on})`).join("; ");
  if (state.state === "current") return `Reviewed by ${who(state.current)}`;
  if (state.state === "earlier") return `Changed since it was reviewed by ${who(state.earlier)}`;
  return "Not yet reviewed by a biologist";
}
