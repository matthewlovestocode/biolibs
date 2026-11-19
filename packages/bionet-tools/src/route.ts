/**
 * Whether a route has one answer.
 *
 * A design can be right and the route to it still be wrong. Checking the sequence says the molecule
 * is the molecule; it says nothing about whether the cut and the ligation that are supposed to make
 * it could just as easily make something else. They can, and the way they do it is quiet: a piece
 * with the same overhang at both ends goes in either way round, and both ways close into a plasmid
 * of exactly the right length. A check digest with the enzymes the route used gives the same bands
 * for both, so the wrong one looks right.
 *
 * So this cuts the finished design with the enzymes the route names, puts the pieces back together
 * every way their ends allow, and counts the circles that come out. One is a route with one answer.
 * Two is a coin toss nobody told the bench about.
 *
 * It is here and not in the protocol on purpose. The enumeration takes tens of milliseconds for a
 * plasmid, and a lab's log is merged on every change and every sync; a check that costs a third of a
 * second across a project's plans does not belong in the merge. It is asked for, like a digest.
 *
 * The joining is `planLigation`'s, which is `@biolibs/assembly2`'s underneath. What this adds is the
 * question: not what a ligation makes, but how many different things it could make.
 */
import { partChecksum } from "@biolibs/bionet";
import { lookupEnzymes, parseEnzymeNames } from "@biolibs/cloning";
import { Dseq, cut } from "@biolibs/dseq";
import { planLigation, type LigationPiece, type LigationProduct } from "./ligate.js";

/** Most pieces a route may be checked over. Putting pieces back together every way round grows fast. */
export const MOST_PIECES = 6;

/** One circle a route could close into. */
export interface RouteProduct {
  /** What it would be, as the lab counts identity. */
  checksum: string;
  /** How long it is. */
  length: number;
  /** Whether this is the one the design says it should be. */
  intended: boolean;
  /** The pieces, in the order they go round it, and which of them went in the other way round. */
  pieces: { name: string; flipped: boolean }[];
}

/** What a route would make, and whether that is one thing. */
export interface RouteCheck {
  /** The enzymes asked for that are real ones, as they are written. */
  enzymes: string[];
  /** The pieces the cut gives: how long each is, and the unpaired bases at each end. */
  pieces: { name: string; length: number; left: string; right: string }[];
  /** Every circle the pieces could close into, the intended one first if it is among them. */
  products: RouteProduct[];
  /** Whether the route makes what the design says. A route that does not is a route for something else. */
  makesIt: boolean;
  /**
   * The circles it could make instead of the intended one. Each of these is a plasmid somebody could
   * carry away from the bench believing it was the design.
   */
  instead: RouteProduct[];
  /** Why there is nothing to say, said for a person, or `null` if there is. */
  problem: string | null;
}

const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();

/**
 * The enzymes a plan says to cut with.
 *
 * A plan has no field for its enzymes, so they live in its settings as the words somebody wrote,
 * such as `BamHI and AvrII`. That is a convention rather than a promise, which is why this is a
 * reading and not a lookup: it returns what it could make of the words, and nothing for words that
 * are not enzymes.
 *
 * @param plan - A plan, or anything with settings.
 * @param field - Which setting holds them. `cut_with` by default.
 * @returns The names it found, in the order written.
 *
 * @example
 * ```ts
 * routeOf({ settings: { cut_with: "BamHI and AvrII" } }); // ["BamHI", "AvrII"]
 * ```
 */
export function routeOf(plan: { settings?: Record<string, string | number> }, field = "cut_with"): string[] {
  const said = plan.settings?.[field];
  if (typeof said !== "string") return [];
  // "and" is how a person writes it and is not an enzyme; everything else is left for the lookup.
  return parseEnzymeNames(said.replace(/\band\b/gi, " ")).filter((one) => one.length > 0);
}

/**
 * Cut a design with the enzymes a route names, and see how many circles the pieces could close into.
 *
 * @param design - The molecule the route is meant to make, and whether it is a circle.
 * @param enzymes - The enzyme names the route cuts with, as {@link routeOf} reads them.
 * @returns What the route would make. `problem` says why where it could not be worked out.
 *
 * @example
 * ```ts
 * const checked = checkRoute({ sequence: plasmid, circular: true }, ["BamHI", "AvrII"]);
 * checked.makesIt;          // true  — the route does make the design
 * checked.instead.length;   // 0     — and it cannot make anything else
 * ```
 */
export function checkRoute(design: { sequence: string; circular?: boolean }, enzymes: readonly string[]): RouteCheck {
  const bases = clean(design.sequence);
  const circular = design.circular === true;
  const { enzymes: found } = lookupEnzymes([...new Set(enzymes)]);
  const names = found.map((one) => one.name);
  const empty = { enzymes: names, pieces: [], products: [], makesIt: false, instead: [] };
  if (enzymes.length === 0) return { ...empty, problem: "The plan does not say what to cut with." };
  if (found.length === 0) return { ...empty, problem: "None of those is an enzyme this knows." };
  if (bases.length === 0) return { ...empty, problem: "There is nothing to cut." };

  let bits;
  try { bits = cut(Dseq.quick(bases, circular), found); } catch { return { ...empty, problem: "That could not be cut." }; }
  if (bits.length < 2) return { ...empty, problem: `${names.join(" and ")} ${names.length === 1 ? "does" : "do"} not cut this into pieces.` };
  if (bits.length > MOST_PIECES) return { ...empty, problem: `That cuts into ${bits.length} pieces, too many to put back together every way round.` };

  const pieces: LigationPiece[] = bits.map((bit, at) => ({
    id: `piece-${at}`, name: `${bit.length} bp`, sequence: bit.toBluntString().toUpperCase(),
    ends: { left: -(bit.ovhg ?? 0), right: -(bit.watsonOvhg ?? 0) },
  }));
  const shown = pieces.map((piece, at) => ({
    name: piece.name, length: bits[at]!.length,
    left: piece.sequence.slice(0, Math.abs(piece.ends.left)), right: piece.sequence.slice(piece.sequence.length - Math.abs(piece.ends.right)),
  }));

  const plan = planLigation(pieces);
  if (plan.problem !== null) return { ...empty, pieces: shown, problem: plan.problem };

  const wanted = partChecksum({ sequence: bases, circular });
  // Only the circles of the right length are in the running. A route that also makes a shorter
  // circle out of some of the pieces is a separate matter, and a gel tells those apart anyway.
  const seen = new Map<string, RouteProduct>();
  for (const made of plan.products as readonly LigationProduct[]) {
    if (!made.circular || made.length !== bases.length) continue;
    let checksum;
    try { checksum = partChecksum({ sequence: made.sequence, circular: true }); } catch { continue; }
    if (seen.has(checksum)) continue;
    seen.set(checksum, { checksum, length: made.length, intended: checksum === wanted,
                         pieces: made.pieces.map((one) => ({ name: one.name, flipped: one.flipped })) });
  }
  const products = [...seen.values()].sort((one, two) => Number(two.intended) - Number(one.intended));
  const instead = products.filter((one) => !one.intended);
  return { enzymes: names, pieces: shown, products, makesIt: products.some((one) => one.intended), instead, problem: null };
}

/**
 * What to tell somebody about a route, in a line.
 *
 * @param checked - A route, checked.
 * @returns The sentence, or `null` where there is nothing worth saying — a route with one answer
 *   needs no remark.
 *
 * @example
 * ```ts
 * saysRoute(checkRoute(design, ["XhoI", "AvrII"]));
 * // "Those cuts could also make 1 other plasmid of the same length, which a digest with them
 * //  would not tell apart. One of the pieces goes in either way round."
 * ```
 */
export function saysRoute(checked: RouteCheck): string | null {
  if (checked.problem !== null) return checked.problem;
  if (!checked.makesIt) return "Those cuts do not make what this is expected to make.";
  if (checked.instead.length === 0) return null;
  const flips = checked.instead.some((one) => one.pieces.some((piece) => piece.flipped));
  return `Those cuts could also make ${checked.instead.length} other plasmid${checked.instead.length === 1 ? "" : "s"} ` +
         `of the same length, which a digest with them would not tell apart.` +
         (flips ? " One of the pieces goes in either way round." : "");
}
