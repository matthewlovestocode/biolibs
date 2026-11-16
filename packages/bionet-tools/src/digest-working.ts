/**
 * A digest looked at closely: each cut in its real bases, each piece with its ends, and the working.
 *
 * `digest.ts` says where enzymes cut and how long the pieces are. This says what somebody at the
 * bench pictures and what somebody checking would ask: which bases the enzyme recognised, where it
 * cut each strand and what end that leaves, which cut made each end of each piece, and what is
 * marked on each piece. Like the PCR's working, each figure says whether it is exact or an estimate.
 */
import type { PartFeature } from "@biolibs/bionet";
import { bandPosition, type GelType } from "@biolibs/gel";
import { enzymes } from "@biolibs/restriction";
import type { Cutter, DigestPlan } from "./digest.js";
import type { Working } from "./pcr-working.js";
import { carryFeatures } from "./sequence-file.js";

const count = (value: number): string => value.toLocaleString("en-US");
const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G", N: "N", R: "Y", Y: "R", K: "M", M: "K", S: "S", W: "W", B: "V", V: "B", D: "H", H: "D" };
const IUPAC: Readonly<Record<string, string>> = { A: "A", C: "C", G: "G", T: "T", N: "[ACGT]", R: "[AG]", Y: "[CT]", K: "[GT]", M: "[AC]", S: "[CG]", W: "[AT]", B: "[CGT]", D: "[AGT]", H: "[ACT]", V: "[ACG]" };
const across = (bases: string): string => [...bases].map((base) => PAIR[base] ?? "N").join("");
const flipped = (bases: string): string => [...bases].reverse().map((base) => PAIR[base] ?? "N").join("");

/** One place an enzyme cuts, in the molecule's own bases. */
export interface CutSite {
  /** The enzyme. */
  enzyme: string;
  /** The sequence it recognises, as it is written for the enzyme. */
  recognises: string;
  /** Where the top strand is cut: the number of bases before the cut. */
  at: number;
  /** Where the bottom strand is cut, counted along the top strand in the same way. */
  bottom: number;
  /** How far the bottom strand's cut is to the right of the top strand's: positive for a 5′ overhang, negative for a 3′ one, 0 for blunt. */
  stagger: number;
  /** Where the recognised bases are, from the first to one past the last. On a circle the end may be past the origin. */
  site: { start: number; end: number };
  /** Whether the site reads along the bottom strand. Only an enzyme whose site is not its own mirror can. */
  backwards: boolean;
  /** What kind of end the cut leaves. */
  overhang: "5′" | "3′" | "blunt";
  /** The single-stranded bases of that end, as the top strand has them. Empty for a blunt cut. */
  bases: string;
  /**
   * The stretch around the cut, for drawing: both strands, the bottom written under the top, and
   * within them where the recognised bases are and how many bases precede each strand's cut.
   */
  around: { from: number; top: string; bottom: string; site: [number, number]; cutTop: number; cutBottom: number };
}

/**
 * Every place one enzyme cuts, with the bases it recognised there.
 *
 * The cut positions come from the restriction engine. This finds the site behind each one by
 * looking for the enzyme's sequence itself, on both strands, and keeps only sites whose cut the
 * engine also found, so each position is explained and none is invented.
 *
 * @param part - The molecule.
 * @param cutter - The enzyme and where it cuts, from `cutsOf`.
 * @returns The sites, in order along the molecule. A cut whose site cannot be found is left out.
 */
export function cutSites(part: { sequence: string; circular: boolean }, cutter: Cutter): CutSite[] {
  const enzyme = Object.hasOwn(enzymes, cutter.name) ? enzymes[cutter.name] : undefined;
  const bases = clean(part.sequence);
  const length = bases.length;
  if (enzyme === undefined || enzyme.fst5 === null || enzyme.ovhg === null || length === 0) return [];
  const [size, fst5, ovhg] = [enzyme.size, enzyme.fst5, enzyme.ovhg];
  const site = clean(String(enzyme.site));
  // A circle is searched once round and a little further, so a site across the origin is found.
  const searched = part.circular ? bases + bases.slice(0, size - 1) : bases;
  const wrap = (value: number): number => ((value % length) + length) % length;
  const base = (place: number): string => (part.circular ? bases[wrap(place)]! : bases[place] ?? "");
  const found: CutSite[] = [];
  const look = (pattern: string, backwards: boolean): void => {
    const matcher = new RegExp(`(?=(${[...pattern].map((one) => IUPAC[one] ?? one).join("")}))`, "g");
    for (const match of searched.matchAll(matcher)) {
      const start = match.index;
      // Forwards, the top strand is cut `fst5` into the site. Backwards the enzyme sits the other way
      // up, so that is where it cuts the bottom strand, and the top is cut across from its other cut.
      const [top, under] = backwards ? [start + size - fst5 + ovhg, start + size - fst5] : [start + fst5, start + fst5 - ovhg];
      const at = part.circular ? wrap(top) : top;
      if (!cutter.positions.includes(at) || found.some((one) => one.at === at)) continue;
      const [low, high] = [Math.min(top, under), Math.max(top, under)];
      const from = Math.min(start, low) - 4;
      const to = Math.max(start + size, high) + 4;
      const shown = Array.from({ length: to - from }, (_, index) => base(from + index)).join("");
      found.push({
        enzyme: cutter.name, recognises: site, at, bottom: part.circular ? wrap(under) : under, stagger: under - top, site: { start, end: start + size }, backwards,
        overhang: ovhg === 0 ? "blunt" : top < under ? "5′" : "3′",
        bases: Array.from({ length: high - low }, (_, index) => base(low + index)).join(""),
        around: { from, top: shown, bottom: across(shown), site: [start - from, start + size - from], cutTop: top - from, cutBottom: under - from },
      });
    }
  };
  look(site, false);
  if (flipped(site) !== site) look(flipped(site), true);
  return found.sort((a, b) => a.at - b.at);
}

/** One end of a piece: what made it. */
export interface PieceEnd {
  /** The enzyme that cut here, or `null` if this is the molecule's own end. */
  enzyme: string | null;
  /** What kind of end it is. */
  overhang: "5′" | "3′" | "blunt" | "end";
  /** Its single-stranded bases, as the top strand has them. */
  bases: string;
}

/** One piece of a digest. */
export interface DigestPiece {
  /** Where it starts and stops on the molecule. On a circle a piece may run through the origin, so `to` can be the smaller. */
  from: number;
  to: number;
  /** How long it is. */
  length: number;
  /** Its two ends. */
  left: PieceEnd;
  right: PieceEnd;
  /** What is marked on it, placed on the piece's own sequence. Something cut through is kept as far as it is on the piece. */
  features: PartFeature[];
  /** Every base either of its strands has, read along the top strand: the piece as a molecule of its own. */
  sequence: string;
  /** How many of those bases at each end are on one strand only: positive for a 5′ overhang, negative for a 3′ one. */
  ends: { left: number; right: number };
}

/**
 * The pieces a digest gives, each with what made its ends and what it carries.
 *
 * @param part - The molecule, with what is marked on it.
 * @param sites - Every cut, from `cutSites` for each enzyme.
 * @returns The pieces, longest first. Nothing if there are no cuts.
 */
export function digestPieces(part: { sequence: string; circular: boolean; features?: readonly PartFeature[] }, sites: readonly CutSite[]): DigestPiece[] {
  const length = clean(part.sequence).length;
  const cuts = [...new Map(sites.map((one) => [one.at, one])).values()].sort((a, b) => a.at - b.at);
  if (cuts.length === 0) return [];
  const end = (site: CutSite | undefined): PieceEnd => (site === undefined ? { enzyme: null, overhang: "end", bases: "" } : { enzyme: site.enzyme, overhang: site.overhang, bases: site.bases });
  const features = part.features ?? [];
  const bases = clean(part.sequence);
  const piece = (from: number, to: number, left: CutSite | undefined, right: CutSite | undefined): DigestPiece => {
    const span = to > from ? to - from : length - from + to;
    // A strand cut further out than the other gives the piece bases beyond the top strand's cut.
    const [before, after] = [Math.max(0, -(left?.stagger ?? 0)), Math.max(0, right?.stagger ?? 0)];
    const read = (start: number, many: number): string => Array.from({ length: many }, (_, index) => bases[(((start + index) % length) + length) % length]!).join("");
    return {
      from, to, left: end(left), right: end(right), length: span,
      sequence: read(from - before, before + span + after), ends: { left: left?.stagger ?? 0, right: right?.stagger ?? 0 },
      // Through the origin, what is carried is what lies before it and then what lies after.
      features: to > from ? carryFeatures(features, from, to, before) : [...carryFeatures(features, from, length, before), ...carryFeatures(features, 0, to, length - from + before)],
    };
  };
  const pieces: DigestPiece[] = [];
  if (part.circular) {
    cuts.forEach((cut, index) => { const next = cuts[(index + 1) % cuts.length]!; pieces.push(piece(cut.at, next.at, cut, next)); });
    // One cut opens a circle into a single piece: it runs from the cut right round to the cut again.
  } else {
    const edges = [0, ...cuts.map((one) => one.at), length];
    for (let index = 0; index + 1 < edges.length; index++) {
      if (edges[index + 1]! > edges[index]!) pieces.push(piece(edges[index]!, edges[index + 1]!, cuts[index - 1], cuts[index]));
    }
  }
  return pieces.sort((a, b) => b.length - a.length);
}

/**
 * One cut, said as steps that can be checked against the bases.
 *
 * @param site - The cut, from `cutSites`.
 * @returns The working.
 */
export function siteWorking(site: CutSite): Working {
  const wide = Math.abs(site.at - site.bottom);
  return {
    of: `${site.enzyme} at base ${count(site.at)}`, kind: "exact",
    comes: site.overhang === "blunt" ? "a blunt end" : `a ${wide}-base ${site.overhang} overhang, ${site.bases}`,
    steps: [
      `${site.enzyme} recognises ${site.recognises}. Those bases are at ${count(site.site.start + 1)} to ${count(site.site.end)}${site.backwards ? ", reading along the bottom strand" : ""}.`,
      `It cuts the top strand after base ${count(site.at)} and the bottom strand after base ${count(site.bottom)}.`,
      site.overhang === "blunt" ? "Both strands are cut at the same place, so the ends are blunt."
        : `The cuts are ${wide} bases apart, so each piece is left with ${wide} unpaired bases at its ${site.overhang} end: ${site.bases} on one piece and its partner on the other.`,
    ],
  };
}

/**
 * How long the pieces are, as differences between the cuts, with the check that they add up.
 *
 * @param part - How long the molecule is, and whether it is a circle.
 * @param sites - Every cut.
 * @param plan - The digest as the gel engine worked it out, to compare with.
 * @returns The working.
 */
export function piecesWorking(part: { length: number; circular: boolean }, sites: readonly CutSite[], plan?: Pick<DigestPlan, "fragments">): Working {
  const cuts = [...new Set(sites.map((one) => one.at))].sort((a, b) => a - b);
  const sizes: number[] = [];
  const steps: string[] = [`The cuts, in order along the molecule: after base ${cuts.map(count).join(", ")}.`];
  if (part.circular) {
    cuts.forEach((cut, index) => {
      const next = cuts[(index + 1) % cuts.length]!;
      const size = cuts.length === 1 ? part.length : next > cut ? next - cut : part.length - cut + next;
      sizes.push(size);
      steps.push(cuts.length === 1 ? `One cut opens the circle into one piece, the whole ${count(part.length)}.`
        : next > cut ? `From ${count(cut)} to ${count(next)}: ${count(next)} − ${count(cut)} = ${count(size)}.`
        : `From ${count(cut)} through the origin to ${count(next)}: ${count(part.length)} − ${count(cut)} + ${count(next)} = ${count(size)}.`);
    });
  } else {
    const edges = [0, ...cuts, part.length];
    for (let index = 0; index + 1 < edges.length; index++) {
      const size = edges[index + 1]! - edges[index]!;
      if (size <= 0) continue;
      sizes.push(size);
      steps.push(`From ${index === 0 ? "the start" : count(edges[index]!)} to ${index + 2 === edges.length ? "the end" : count(edges[index + 1]!)}: ${count(edges[index + 1]!)} − ${count(edges[index]!)} = ${count(size)}.`);
    }
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  steps.push(`They add up to the whole molecule: ${sizes.map(count).join(" + ")} = ${count(total)}${total === part.length ? "." : `, which is not its ${count(part.length)}. Something is wrong.`}`);
  if (plan !== undefined) {
    const same = [...sizes].sort((a, b) => b - a).join(",") === [...plan.fragments].sort((a, b) => b - a).join(",");
    steps.push(same ? "The gel engine, working the pieces out its own way, gives the same lengths." : `The gel engine gives ${plan.fragments.map(count).join(", ")}, which does not agree. Trust neither until that is understood.`);
  }
  return { of: "the pieces", comes: `${[...sizes].sort((a, b) => b - a).map(count).join(", ")} bp`, kind: "exact", steps };
}

/**
 * Where a piece runs to on a gel, with the rule behind it.
 *
 * @param size - How long the piece is.
 * @param gel - The gel.
 * @returns The working. It is an estimate: the rule is a straight line that real gels only roughly follow.
 */
export function migrationWorking(size: number, gel: GelType): Working {
  const [high, low, own] = [Math.log10(gel.largest), Math.log10(gel.smallest), Math.log10(size)];
  const round = (value: number): string => String(Math.round(value * 100) / 100);
  const position = bandPosition(size, gel);
  const inside = size <= gel.largest && size >= gel.smallest;
  return {
    of: `how far ${count(size)} bp runs on ${gel.percent}% agarose`, comes: `${Math.round(position * 100)}% of the way down`, kind: "estimate",
    steps: [
      `This gel separates pieces from ${count(gel.largest)} bp, which barely leave the wells, down to ${count(gel.smallest)} bp, which reach the front.`,
      `Distance goes with the logarithm of length: log₁₀ ${count(gel.largest)} = ${round(high)}, log₁₀ ${count(gel.smallest)} = ${round(low)}, log₁₀ ${count(size)} = ${round(own)}.`,
      inside ? `(${round(high)} − ${round(own)}) ÷ (${round(high)} − ${round(low)}) = ${round(position)} of the way from the wells to the front.`
        : `${count(size)} bp is ${size > gel.largest ? "longer" : "shorter"} than this gel separates, so it is drawn at the ${size > gel.largest ? "wells" : "front"}, with anything else of that kind.`,
    ],
    rests: "Small pieces thread through agarose faster than large ones, and over a gel's working range the distance is close to a straight line against the logarithm of length. Real distance also depends on voltage, time, buffer and the shape of the DNA, so read a piece's size against the ladder beside it, never off the distance alone.",
  };
}

/** Something a careful operator would stop and ask about a digest before running the gel. */
export interface DigestCheck {
  /** `stop` if the gel is unlikely to show what is hoped, `look` if it is only worth a second glance. */
  weight: "stop" | "look";
  /** What to ask, said for a person. */
  says: string;
  /** The comparison that raised it, so it can be checked. */
  because: string;
}

/**
 * What a careful operator would ask of a digest, given the gel it is to be run on.
 *
 * Each may be wrong for a particular bench, and none stops a run.
 *
 * @param part - The molecule.
 * @param plan - The digest, from `planDigest`.
 * @param gel - The gel.
 * @returns The checks that apply, the ones most likely to matter first.
 */
export function digestChecks(part: { length: number; circular: boolean }, plan: Pick<DigestPlan, "cutters" | "fragments" | "bands">, gel: GelType): DigestCheck[] {
  const checks: DigestCheck[] = [];
  for (const one of plan.cutters.filter((cutter) => cutter.positions.length === 0)) {
    checks.push({ weight: "look", says: `${one.name} does not cut this. It is in the tube and does nothing.`, because: `${one.site} is not in the sequence` });
  }
  for (const band of plan.bands.filter((one) => one.sizes.length > 1 && !one.unresolved)) {
    checks.push({ weight: "stop", says: `${band.sizes.map(count).join(" and ")} bp are too close in size to tell apart. They will look like one band.`, because: `${count(band.sizes[0]! - band.sizes.at(-1)!)} bp apart, under 3% of ${count(band.sizes[0]!)}` });
  }
  const small = plan.fragments.filter((size) => size < gel.smallest);
  if (small.length > 0) checks.push({ weight: "stop", says: `${small.map(count).join(", ")} bp ${small.length === 1 ? "is" : "are"} smaller than ${gel.percent}% agarose separates. ${small.length === 1 ? "It" : "They"} may run off the gel or be too faint to see. A higher percentage would hold ${small.length === 1 ? "it" : "them"}.`, because: `${count(Math.max(...small))} < ${count(gel.smallest)} bp` });
  const large = plan.fragments.filter((size) => size > gel.largest);
  if (large.length > 0) checks.push({ weight: "look", says: `${large.map(count).join(", ")} bp ${large.length === 1 ? "is" : "are"} larger than ${gel.percent}% agarose separates, and will stay near the wells. A lower percentage would spread ${large.length === 1 ? "it" : "them"}.`, because: `${count(Math.min(...large))} > ${count(gel.largest)} bp` });
  if (part.circular && plan.fragments.length === 1) {
    checks.push({ weight: "look", says: "One cut opens the circle into one piece of its full length. The gel shows that it cut and how long the plasmid is, and nothing about what is where on it. Two cuts say more.", because: "1 cut, 1 piece" });
  }
  if (plan.cutters.some((one) => one.name === "DpnI" && one.positions.length > 0)) {
    checks.push({ weight: "look", says: "DpnI only cuts DNA that is methylated, as it is when grown in most lab strains of E. coli. It will not cut a PCR product.", because: "DpnI needs methylated GATC" });
  }
  return checks.sort((a, b) => Number(b.weight === "stop") - Number(a.weight === "stop"));
}
