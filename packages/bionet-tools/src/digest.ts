/**
 * A restriction digest, and the gel it would give, worked out before either is run.
 *
 * Given a molecule and some enzymes this says where they cut, how long the pieces are, and where
 * each piece would run on a gel beside a ladder. Like `pcr.ts` it knows sequences and nothing of
 * the lab.
 */
import { bandsOf, fragmentSizes, gelById, ladderBands, ladderById, type Band } from "@biolibs/gel";
import { enzymes } from "@biolibs/restriction";
import { Seq } from "@biolibs/seq";

/** The enzymes offered first: the ones most often on a lab's shelf. Any other may be named. */
export const COMMON_ENZYMES: readonly string[] = [
  "EcoRI", "BamHI", "HindIII", "XhoI", "NotI", "XbaI", "SpeI", "PstI", "NcoI", "NdeI", "KpnI", "SacI",
  "SalI", "EcoRV", "SmaI", "BglII", "NheI", "AgeI", "ApaI", "ClaI", "MluI", "BsaI", "BsmBI", "DpnI",
];

/** The gel a digest is run on unless somebody says otherwise: 1% agarose. */
export const USUAL_GEL = "1.0";

/** The ladder run beside it unless somebody says otherwise. */
export const USUAL_LADDER = "1kb";

/** One enzyme and where it cuts a molecule. */
export interface Cutter {
  /** The enzyme's name. */
  name: string;
  /** The sequence it recognises. */
  site: string;
  /** Where it cuts, counted from the start of the molecule, in order. */
  positions: number[];
}

/** What a digest would give. */
export interface DigestPlan {
  /** Each enzyme asked for that is a real one, and where it cuts. */
  cutters: Cutter[];
  /** How long each piece is, longest first. */
  fragments: number[];
  /** The bands the pieces would show. */
  bands: Band[];
  /** The bands of the ladder beside them. */
  ladder: Band[];
  /** The gel and the ladder it was worked out for. */
  gel: string;
  ladderName: string;
  /** Why there is nothing to look at, said for a person, or `null` if there is. */
  problem: string | null;
}

const clean = (text: string): string => text.replace(/\s+/g, "").toUpperCase();

/**
 * Find an enzyme whatever case its name was typed in.
 *
 * @param name - Something like `ecori`.
 * @returns Its name as it is written, or `null` if there is no such enzyme.
 */
export function enzymeNamed(name: string): string | null {
  const typed = name.trim();
  if (typed === "") return null;
  if (Object.hasOwn(enzymes, typed)) return typed;
  const lower = typed.toLowerCase();
  return Object.keys(enzymes).find((one) => one.toLowerCase() === lower) ?? null;
}

/**
 * One enzyme's recognition sequence.
 *
 * @param name - The enzyme, by name, in any case.
 * @returns The bases it recognises, in IUPAC letters, or `null` if there is no such enzyme.
 *
 * @example
 * ```ts
 * import { siteOf } from "@biolibs/bionet-tools";
 *
 * siteOf("EcoRI");    // "GAATTC"
 * ```
 */
export function siteOf(name: string): string | null {
  const found = enzymeNamed(name);
  const enzyme = found === null || !Object.hasOwn(enzymes, found) ? undefined : enzymes[found];
  return enzyme === undefined ? null : String(enzyme.site).toUpperCase();
}

/**
 * Where one enzyme cuts a molecule.
 *
 * @param part - The molecule.
 * @param name - The enzyme, by its name as written.
 * @returns The enzyme and its cuts, or `null` if there is no such enzyme or the molecule is not a sequence.
 */
export function cutsOf(part: { sequence: string; circular: boolean }, name: string): Cutter | null {
  const enzyme = Object.hasOwn(enzymes, name) ? enzymes[name] : undefined;
  if (enzyme === undefined) return null;
  const bases = clean(part.sequence);
  try {
    // The engine counts from 1 and gives the base after the cut.
    const found = enzyme.search(new Seq(bases), !part.circular).map((at) => (at - 1 + bases.length) % bases.length);
    return { name, site: String(enzyme.site), positions: [...new Set(found)].sort((a, b) => a - b) };
  } catch {
    return null;
  }
}

/**
 * The enzymes, of those usually on a shelf, that cut a molecule.
 *
 * @param part - The molecule.
 * @param names - The enzymes to try.
 * @returns Those that cut it, the ones that cut fewest times first, since one or two cuts is what a
 *   check digest wants.
 */
export function cutters(part: { sequence: string; circular: boolean }, names: readonly string[] = COMMON_ENZYMES): Cutter[] {
  return names.map((name) => cutsOf(part, name)).filter((one): one is Cutter => one !== null && one.positions.length > 0)
    .sort((a, b) => a.positions.length - b.positions.length || a.name.localeCompare(b.name));
}

/**
 * Work out a digest and the gel it would give.
 *
 * @param part - The molecule.
 * @param names - The enzymes, by name.
 * @param options - `gel` is the agarose concentration's ID and `ladder` the ladder's, from `@biolibs/gel`.
 * @returns The cuts, the pieces, the bands, and what is wrong if there is nothing to look at.
 *
 * @example
 * ```ts
 * import { planDigest } from "@biolibs/bionet-tools";
 *
 * const plan = planDigest({ sequence: "AAAAAAAAAAGAATTCAAAAAAAAAAAAAAAAAAAAGGATCCAAAAAAAAAA", circular: true }, ["EcoRI", "BamHI"]);
 * plan.fragments;    // [ 26, 26 ]
 * plan.problem;      // null
 * ```
 */
export function planDigest(part: { sequence: string; circular: boolean }, names: readonly string[],
                           options: { gel?: string; ladder?: string } = {}): DigestPlan {
  let gel = gelById(USUAL_GEL);
  let ladder = ladderById(USUAL_LADDER);
  try { gel = gelById(options.gel ?? USUAL_GEL); } catch { /* an unknown gel is run as the usual one */ }
  try { ladder = ladderById(options.ladder ?? USUAL_LADDER); } catch { /* and an unknown ladder likewise */ }
  const length = clean(part.sequence).length;
  const found = [...new Set(names)].map((name) => cutsOf(part, name)).filter((one): one is Cutter => one !== null);
  const empty = { cutters: found, fragments: [], bands: [], ladder: ladderBands(ladder.sizes, gel), gel: gel.id, ladderName: ladder.name };
  if (names.length === 0) return { ...empty, problem: "Choose at least one enzyme." };
  if (found.length === 0) return { ...empty, problem: "None of those is an enzyme this knows." };
  const cuts = [...new Set(found.flatMap((one) => one.positions))];
  if (cuts.length === 0) return { ...empty, problem: `${found.map((one) => one.name).join(" and ")} ${found.length === 1 ? "does" : "do"} not cut this.` };
  try {
    const fragments = fragmentSizes(length, part.circular ? "circular" : "linear", cuts).sort((a, b) => b - a);
    return { ...empty, fragments, bands: bandsOf(fragments, gel), problem: null };
  } catch {
    return { ...empty, problem: "That could not be cut into pieces." };
  }
}
