/**
 * Moving a feature's location around a circle.
 *
 * These are the four helpers from `pydna.utils` that the record layer rests on. `shiftLocation` is the one
 * that matters: every time a circular molecule's origin moves — and it moves whenever one is cut open,
 * rotated or re-closed — every feature on it has to be rewritten, and a feature that spans the origin has
 * to be split in two or joined back into one. Getting that wrong does not fail loudly; it quietly moves
 * annotations onto the wrong bases, which is why it is measured on its own rather than only through the
 * record methods that call it.
 */

import { AssertionError, ValueError } from "@biolibs/core";
import { CompoundLocation, type Location, SeqFeature, SimpleLocation } from "@biolibs/seqfeature";

/** Python's `sys.maxsize` on a 64-bit build, which is the limit `shiftLocation` uses when given none. */
const MAXSIZE = 9223372036854775807;

/**
 * Where a location begins and ends in reading order.
 *
 * The *first* part's start and the *last* part's end — reversed for the minus strand, whose parts are
 * written in reading order and so run from high to low. This is not the lowest and highest base the
 * location covers: for a feature that spans the origin, written as two parts, the pair comes back the
 * "wrong" way round, with the beginning numerically after the end. Callers use that: `apply_cut` and the
 * circular slice both test `boundaries[0] < boundaries[1]` precisely to find the features that wrap.
 *
 * @param loc - A location.
 * @returns `[begin, end]` in reading order, which for an origin-spanning location has begin > end.
 */
export function locationBoundaries(loc: Location): [number, number] {
  const parts = loc.parts;
  return loc.strand === -1
    ? [Number(parts.at(-1)!.start), Number(parts[0]!.end)]
    : [Number(parts[0]!.start), Number(parts.at(-1)!.end)];
}

/**
 * Flatten nested arrays into one list, as `pydna.utils.flatten` does.
 *
 * It stops at anything that is not an array — a string, a sequence, a record — so a list of records comes
 * back as a list of records rather than being taken apart into letters.
 *
 * @param args - Values, arrays of values, arrays of arrays.
 * @returns One flat list.
 */
export function flatten(...args: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const arg of args) {
    if (Array.isArray(arg)) out.push(...flatten(...arg));
    else out.push(arg);
  }
  return out;
}

/**
 * The same location read from a new origin.
 *
 * `shift` moves every base along by that much, and `lim` is the length to wrap around — the length of the
 * circle. A part that would run off the end is split in two, and two parts that end up adjacent are joined
 * back into one, which is how a feature that spanned the old origin becomes a single stretch under the new
 * one and the other way round.
 *
 * @param original - The location to move.
 * @param shift - How far to move it; may be negative.
 * @param lim - The length to wrap around, or null for a linear sequence, where nothing wraps and a shift
 *   below zero is refused instead.
 * @returns The moved location: a {@link SimpleLocation} when one part came out, a
 *   {@link CompoundLocation} when more did.
 * @throws ValueError when a linear location would move below zero, since without a length there is nowhere
 *   for it to wrap to.
 */
export function shiftLocation(original: Location, shift: number, lim: number | null): Location {
  const newparts: SimpleLocation[] = [];
  const strand = original.strand;
  let limit = lim;
  if (limit === null) {
    // `min(location)` is the lowest base it covers, which for a reverse-strand part is not its start.
    // A location of no bases has nothing to take the minimum of, and Python's `min` says so.
    const bases = [...original];
    if (bases.length === 0) throw new ValueError("min() iterable argument is empty");
    if (Math.min(...bases) + shift < 0) {
      throw new ValueError(
        "Shift moves location below zero, use a `lim` to loop around if sequence is circular.");
    }
    limit = MAXSIZE;
  }

  for (const part of original.parts) {
    let start = mod(Number(part.start) + shift, limit);
    // `or lim`: an end that lands exactly on the origin means the end of the circle, not the start of it.
    let end = mod(Number(part.end) + shift, limit) || limit;
    const previous = newparts.at(-1);
    const oldStart = previous === undefined ? null : Number(previous.start);
    const oldEnd = previous === undefined ? null : Number(previous.end);

    // A zero-length part marks a position rather than a stretch, and simply moves.
    if (part.length === 0) {
      newparts.push(new SimpleLocation(start, start, strand));
      continue;
    }
    // Joining with the part before: a feature written as several parts because it spanned the old origin
    // has parts with no bases between them, and under the new origin they are one stretch again. Which
    // end meets which depends on the direction the parts are written in.
    if (strand !== -1 && oldEnd === start) {
      const joined = newparts.pop()!;
      start = Number(joined.start);
    } else if (strand === -1 && oldStart === end) {
      const joined = newparts.pop()!;
      end = Number(joined.end);
    }
    if (start < end) {
      newparts.push(new SimpleLocation(start, end, strand));
    } else {
      // The part now runs off the end of the circle, so it becomes two: up to the end, and from zero.
      // On the reverse strand they are written in the other order, because that is the reading direction.
      const pair = [new SimpleLocation(start, limit, strand), new SimpleLocation(0, end, strand)];
      newparts.push(...(strand !== -1 ? pair : pair.reverse()));
    }
  }

  // One part is a plain location; Biopython's CompoundLocation refuses to hold fewer than two.
  const moved: Location = newparts.length > 1 ? new CompoundLocation(newparts) : newparts[0]!;
  // pydna asserts this, so a shift that changed the number of bases covered raises rather than returning
  // a mangled feature. It happens more often than one might expect -- any limit shorter than the location
  // itself wraps it onto itself -- and a bare `assert` carries no message, so neither does this.
  if (moved.length !== original.length) throw new AssertionError("");
  return moved;
}

/**
 * The same feature with its location moved, as {@link shiftLocation} moves it.
 *
 * @param feature - The feature. @param shift - How far. @param lim - The length to wrap around.
 * @returns A copy of the feature at the new location; the original is left alone.
 */
export function shiftFeature(feature: SeqFeature, shift: number, lim: number | null): SeqFeature {
  const moved = new SeqFeature(
    shiftLocation(feature.location!, shift, lim) as SimpleLocation | CompoundLocation,
    feature.type,
    feature.id,
    new Map(feature.qualifiers),
  );
  return moved;
}

/**
 * Python's `%`, which for a negative left-hand side gives a non-negative answer where JavaScript's does not.
 *
 * The non-negative case returns `a % b` without the `+ b` round-trip, which is not merely shorter: the
 * modulus here is `sys.maxsize` whenever the sequence is linear, and at that magnitude a double's
 * neighbours are two thousand apart, so `(5 % max) + max` is just `max` again and the value is lost. Every
 * number reaching this with a linear sequence is non-negative — `shiftLocation` has already refused the
 * ones that would go below zero — so this path is the only one that modulus ever takes.
 *
 * @param a - The value. @param b - The modulus.
 * @returns `a` reduced into `[0, b)`.
 */
const mod = (a: number, b: number): number => (a >= 0 ? a % b : ((a % b) + b) % b);
