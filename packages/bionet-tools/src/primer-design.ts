/**
 * A pair of primers designed for a stretch of a part, with everything that was weighed on the way.
 *
 * The choosing is `@biolibs/pcr`'s: the forward primer starts at the first base of the stretch and
 * the reverse primer ends at its last, so the only freedom is how long each is, and every length in
 * range is measured and scored. Nothing here chooses differently. What this adds is what a person
 * designing primers wants beside the answer: every candidate that was considered, each with the
 * score that ranked it, so the winner can be seen to have won; the checks a careful person makes of
 * a pair, not just of each primer; and the stretch said the way a lab says it, including one that
 * runs through the origin of a plasmid.
 *
 * It is plain data in and plain data out, so a window can draw it and a test can check it.
 */
import type { PartFeature } from "@biolibs/bionet";
import { DEFAULT_DESIGN, PRIMER_LIMITS, bestCandidate, primerCandidates, reverseComplement, tmDifference,
         type PrimerLimits, type PrimerReport } from "@biolibs/pcr";

/** A stretch of a template to amplify. On a circle, `end` at or before `start` means it runs through the origin. */
export interface Stretch {
  /** How many bases come before it. */
  start: number;
  /** One past its last base. */
  end: number;
}

/** What somebody asks of a design. */
export interface DesignAsk {
  /** The melting temperature aimed for, in °C. 60 unless said. */
  targetTm?: number;
  /** The shortest and longest primer to consider. 18 and 30 unless said. */
  minLength?: number;
  maxLength?: number;
  /** A length to use for either primer in place of the one that scored best. */
  forwardLength?: number;
  reverseLength?: number;
}

/** One candidate primer, and the score that ranked it. Lower is better. */
export interface ScoredCandidate {
  /** What was measured of it. */
  report: PrimerReport;
  /** How far its melting temperature is from the one aimed for, in °C. */
  offTarget: number;
  /** What it loses for not ending in G or C: 2, or 0. */
  clamp: number;
  /** What it loses for its GC content being off the middle of the band: twice the distance, as a fraction. */
  gc: number;
  /** The three added up. */
  score: number;
}

/** One end of a design: the candidates, the one that scored best, and the one in use. */
export interface DesignedPrimer {
  /** Which primer it is. */
  which: "forward" | "reverse";
  /** Every length considered, shortest first. */
  candidates: ScoredCandidate[];
  /** The one that scored best. */
  best: ScoredCandidate;
  /** The one in use: the best, unless a length was asked for. */
  chosen: ScoredCandidate;
  /** Where it lies on the template: the bases before it, and one past its last. Past the template's length if it runs through the origin. */
  start: number;
  end: number;
  /** Why the best one won, in a sentence. */
  why: string;
}

/** Something a careful person would stop at. `stop` is likely to spoil the PCR; `look` is worth a second look. */
export interface DesignWarning {
  weight: "stop" | "look";
  /** Which primer it is about, or `pair` for something about the two together. */
  about: "forward" | "reverse" | "pair";
  /** What is wrong, in a sentence. */
  says: string;
}

/** A designed pair. */
export interface PrimerDesign {
  /** The stretch asked for. */
  stretch: Stretch;
  /** Whether it runs through a circle's origin. */
  wraps: boolean;
  /** How long the product is, in base pairs. */
  length: number;
  /** The melting temperature aimed for. */
  targetTm: number;
  forward: DesignedPrimer;
  reverse: DesignedPrimer;
  /** How far apart the two melting temperatures are, in °C. */
  tmApart: number;
  /** Everything worth warning about, the worst first. */
  warnings: DesignWarning[];
}

const upper = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const count = (value: number): string => value.toLocaleString("en-US");

/**
 * How long a stretch is.
 *
 * @param stretch - The stretch.
 * @param template - How long the template is, and whether it is a circle.
 * @returns Its length in bases, or 0 if it is not a stretch of that template.
 */
export function stretchLength(stretch: Stretch, template: { length: number; circular: boolean }): number {
  const { start, end } = stretch;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0 || start >= template.length || end > template.length) return 0;
  if (end > start) return end - start;
  return template.circular ? template.length - start + end : 0;
}

/**
 * The bases of a stretch, read along the top strand.
 *
 * @param template - The template.
 * @param stretch - The stretch.
 * @returns Its bases, running on through the origin if the stretch does. Empty if it is not a stretch of that template.
 */
export function stretchBases(template: { sequence: string; circular: boolean }, stretch: Stretch): string {
  const top = upper(template.sequence);
  if (stretchLength(stretch, { length: top.length, circular: template.circular }) === 0) return "";
  return stretch.end > stretch.start ? top.slice(stretch.start, stretch.end) : top.slice(stretch.start) + top.slice(0, stretch.end);
}

/**
 * The score a candidate is ranked by, term by term.
 *
 * This is the rule `@biolibs/pcr` chooses by, written out so that it can be shown: distance from the
 * melting temperature aimed for, in degrees; 2 for a 3′ end that is not G or C; and twice the
 * distance of the GC fraction from the middle of the band. The lowest wins, and of equals the shortest.
 *
 * @param report - A candidate.
 * @param targetTm - The melting temperature aimed for.
 * @param limits - The band GC content should be in.
 * @returns The terms and their sum.
 */
export function scoreCandidate(report: PrimerReport, targetTm: number = DEFAULT_DESIGN.targetTm, limits: PrimerLimits = PRIMER_LIMITS): ScoredCandidate {
  const offTarget = Math.abs(report.tm - targetTm);
  const clamp = report.gcClamp ? 0 : 2;
  const gc = Math.abs(report.gc - (limits.minGc + limits.maxGc) / 2) * 2;
  return { report, offTarget, clamp, gc, score: offTarget + clamp + gc };
}

/** A place a primer's 3′ end matches a template. */
export interface BindingPlace {
  /** The bases before the matched bases, and one past them. Past the template's length if it runs through the origin. */
  start: number;
  end: number;
  /** `top` if the primer reads as the top strand there, and so is copied rightwards; `bottom` the other way. */
  reads: "top" | "bottom";
}

/**
 * Every place the bases at a primer's 3′ end match a template, on either strand.
 *
 * `primerBinding` answers only when there is exactly one. This lists them all, since a second place
 * is exactly what a designer needs to hear about, and looks through a circle's origin as well.
 *
 * @param template - The template.
 * @param primer - The primer, 5′ to 3′.
 * @param least - How many bases at its 3′ end to look for.
 * @returns Each place, in order along the template.
 */
export function bindingPlaces(template: { sequence: string; circular: boolean }, primer: string, least = 18): BindingPlace[] {
  const top = upper(template.sequence);
  const bases = upper(primer);
  if (least < 1 || bases.length < least || top.length < least) return [];
  // A circle is read on past its origin by as much as a match could overhang it.
  const read = template.circular ? top + top.slice(0, least - 1) : top;
  const end3 = bases.slice(-least);
  const found: BindingPlace[] = [];
  const look = (needle: string, reads: "top" | "bottom"): void => {
    for (let at = read.indexOf(needle); at !== -1; at = read.indexOf(needle, at + 1)) found.push({ start: at, end: at + least, reads });
  };
  look(end3, "top");
  look(reverseComplement(end3), "bottom");
  return found.sort((a, b) => a.start - b.start);
}

/** Two strands laid antiparallel, as they would pair: one written 5′ to 3′, the other under it 3′ to 5′. */
export interface PairedStrands {
  /** The upper strand, 5′ to 3′. */
  upper: string;
  /** The lower strand, written 3′ to 5′, so that each base is under the one it would pair with. */
  lower: string;
  /** Which column of the upper strand the lower strand's first written base sits under, for the longest run. It may be negative. */
  shift: number;
  /** The longest run of bases that pair, as the column it starts at and how many there are. */
  from: number;
  length: number;
  /** The longest run that takes in a 3′ end of either strand, where pairing gives the polymerase something to extend. */
  endShift: number;
  endFrom: number;
  endLength: number;
}

/**
 * How well two primers pair with each other: the longest run of bases that would.
 *
 * One is slid along the other, antiparallel, and at each place the runs of pairing bases are
 * counted. Given the same primer twice it measures what the engine's `selfComplementarity` measures,
 * and also says where the run is, so that it can be written out. It counts pairing bases; it is not
 * a folding energy.
 *
 * @param first - One primer, 5′ to 3′.
 * @param second - The other, 5′ to 3′. The same primer again for how it pairs with itself.
 * @returns The two strands as they pair best, the longest run, and the longest run that reaches a 3′ end.
 */
export function pairedStrands(first: string, second: string): PairedStrands {
  const a = upper(first);
  const b = upper(second);
  // The second strand written backwards is 3′ to 5′; a base pairs with the one whose complement it is.
  const lower = [...b].reverse().join("");
  const pairs = (x: string, y: string): boolean => reverseComplement(x) === y && "ACGT".includes(x);
  let best = { shift: 0, from: 0, length: 0 };
  let end = { shift: 0, from: 0, length: 0 };
  for (let shift = -(lower.length - 1); shift < a.length; shift++) {
    let run = 0;
    for (let column = Math.max(0, shift); column < Math.min(a.length, shift + lower.length); column++) {
      run = pairs(a[column]!, lower[column - shift]!) ? run + 1 : 0;
      if (run === 0) continue;
      const from = column - run + 1;
      if (run > best.length) best = { shift, from, length: run };
      // The upper strand's 3′ end is its last column; the lower strand's, written backwards, is its first.
      const reachesEnd = column === a.length - 1 || from - shift === 0;
      if (reachesEnd && run > end.length) end = { shift, from, length: run };
    }
  }
  return { upper: a, lower, shift: best.shift, from: best.from, length: best.length, endShift: end.shift, endFrom: end.from, endLength: end.length };
}

/** The stretches of a part that somebody might want to amplify: what is marked on it. */
export interface FeatureStretch extends Stretch {
  /** What the feature is called and what kind of thing it is. */
  label: string;
  type: string;
  /** How long it is. */
  length: number;
}

/**
 * The features of a part that could be amplified whole, each as a stretch.
 *
 * A feature in several pieces is taken from the start of its first to the end of its last, since
 * that is what amplifying it means. Primer sites and anything too short to hold two primers are left out.
 *
 * @param part - The part.
 * @param least - The shortest stretch worth offering.
 * @returns The stretches, in the order the features are marked.
 */
export function featureStretches(part: { length: number; circular: boolean; features: readonly PartFeature[] }, least = 2 * DEFAULT_DESIGN.minLength): FeatureStretch[] {
  return part.features.flatMap((feature) => {
    const first = feature.parts[0];
    const last = feature.parts.at(-1);
    if (first === undefined || last === undefined || feature.type === "primer_bind") return [];
    const stretch = { start: first.start, end: last.end };
    const length = stretchLength(stretch, part);
    return length < least ? [] : [{ ...stretch, label: feature.label, type: feature.type, length }];
  });
}

/** Why the best candidate won, said for a person. */
function whyBest(best: ScoredCandidate, candidates: readonly ScoredCandidate[], targetTm: number): string {
  const next = [...candidates].filter((one) => one !== best).sort((a, b) => a.score - b.score)[0];
  const tm = `${best.report.tm.toFixed(1)} °C is ${best.offTarget.toFixed(1)} from the ${targetTm} °C aimed for`;
  const clamp = best.report.gcClamp ? `it ends in ${best.report.sequence.at(-1)}` : "it does not end in G or C, which costs it 2";
  const head = `${best.report.length} bases scores lowest, at ${best.score.toFixed(2)}: ${tm}, ${clamp}, and its GC content is ${(best.report.gc * 100).toFixed(0)}%.`;
  if (next === undefined) return `${head} It was the only length that could be used.`;
  const tie = next.score === best.score ? ` ${next.report.length} bases scores the same, and the shorter is taken.` : ` The next best is ${next.report.length} bases, at ${next.score.toFixed(2)}.`;
  return head + tie;
}

/**
 * Design a pair of primers for a stretch of a template, keeping everything that was considered.
 *
 * @param template - The template, and whether it is a circle.
 * @param stretch - The stretch to amplify.
 * @param ask - The melting temperature aimed for, the lengths to consider, and any length to use instead of the best.
 * @returns The design, or `null` if the stretch is not one of that template or no length in range gives a usable primer at one of its ends.
 *
 * @example
 * ```ts
 * import { designPair } from "@biolibs/bionet-tools";
 *
 * const design = designPair({ sequence: plasmid, circular: true }, { start: 306, end: 1086 });
 * design?.forward.chosen.report.sequence;    // the forward primer, 5′ to 3′
 * design?.forward.why;                       // why that length won
 * design?.warnings;                          // what a careful person would stop at
 * ```
 */
export function designPair(template: { sequence: string; circular: boolean }, stretch: Stretch, ask: DesignAsk = {}): PrimerDesign | null {
  const top = upper(template.sequence);
  const within = { length: top.length, circular: template.circular };
  const length = stretchLength(stretch, within);
  const bases = stretchBases(template, stretch);
  if (length === 0) return null;
  const targetTm = ask.targetTm ?? DEFAULT_DESIGN.targetTm;
  const minLength = Math.max(8, Math.floor(ask.minLength ?? DEFAULT_DESIGN.minLength));
  const maxLength = Math.max(minLength, Math.floor(ask.maxLength ?? DEFAULT_DESIGN.maxLength));
  const options = { targetTm, minLength, maxLength };
  const wraps = stretch.end <= stretch.start;

  const one = (which: "forward" | "reverse", anchored: string, wanted: number | undefined): DesignedPrimer | null => {
    const reports = primerCandidates(anchored, options);
    const picked = bestCandidate(reports, options);
    if (picked === null) return null;
    const candidates = reports.map((report) => scoreCandidate(report, targetTm));
    const best = candidates.find((each) => each.report === picked)!;
    const chosen = candidates.find((each) => each.report.length === wanted) ?? best;
    const far = stretch.start + length;
    const [start, end] = which === "forward" ? [stretch.start, stretch.start + chosen.report.length] : [far - chosen.report.length, far];
    return { which, candidates, best, chosen, start, end, why: whyBest(best, candidates, targetTm) };
  };
  const forward = one("forward", bases, ask.forwardLength);
  const reverse = one("reverse", reverseComplement(bases), ask.reverseLength);
  if (forward === null || reverse === null) return null;
  const tmApart = tmDifference(forward.chosen.report, reverse.chosen.report);
  const design = { stretch, wraps, length, targetTm, forward, reverse, tmApart };
  return { ...design, warnings: designWarnings(template, design) };
}

/** How far apart two primers' melting temperatures may be before it is worth saying. */
export const TM_APART_LOOK = 3;
/** How far apart they may be before one annealing temperature will not suit both. */
export const TM_APART_STOP = 5;
/** The shortest 3′ end worth looking for a second binding place with. */
export const SECOND_PLACE_BASES = 12;

/**
 * What a careful person would stop at in a design.
 *
 * Each primer's own warnings are the engine's. Added to them are the ones that are about the pair or
 * about this template: melting temperatures too far apart, the two primers pairing with each other,
 * a primer whose 3′ end is found in more than one place, and primers that overlap because the
 * stretch is short.
 *
 * @param template - The template.
 * @param design - The design, without its warnings.
 * @param limits - The thresholds.
 * @returns The warnings, the worst first.
 */
export function designWarnings(template: { sequence: string; circular: boolean }, design: Omit<PrimerDesign, "warnings">, limits: PrimerLimits = PRIMER_LIMITS): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  const ends = [design.forward, design.reverse];
  const size = upper(template.sequence).length;
  if (design.tmApart > TM_APART_LOOK) {
    const [cool, warm] = [...ends].sort((a, b) => a.chosen.report.tm - b.chosen.report.tm);
    warnings.push({ about: "pair", weight: design.tmApart > TM_APART_STOP ? "stop" : "look",
      says: `The melting temperatures are ${design.tmApart.toFixed(1)} °C apart: the ${cool!.which} primer at ${cool!.chosen.report.tm.toFixed(1)} °C and the ${warm!.which} at ${warm!.chosen.report.tm.toFixed(1)} °C. `
        + (design.tmApart > TM_APART_STOP ? "No one annealing temperature suits both. Try another length for one of them." : "They will anneal together, but a closer pair is more forgiving.") });
  }
  const cross = pairedStrands(design.forward.chosen.report.sequence, design.reverse.chosen.report.sequence);
  if (cross.endLength > limits.maxEndSelfComplement) {
    warnings.push({ about: "pair", weight: "stop", says: `${cross.endLength} bases at a 3′ end pair with the other primer. The polymerase can extend that, making a primer dimer in place of the product.` });
  } else if (cross.length > limits.maxSelfComplement) {
    warnings.push({ about: "pair", weight: "look", says: `${cross.length} bases of one primer pair with the other, so some of each will be tied up as a dimer.` });
  }
  if (design.forward.chosen.report.length + design.reverse.chosen.report.length > design.length) {
    warnings.push({ about: "pair", weight: "stop", says: `The stretch is ${count(design.length)} bases and the two primers come to ${design.forward.chosen.report.length + design.reverse.chosen.report.length}, so they overlap and would pair with each other. Choose a longer stretch.` });
  }
  for (const end of ends) {
    const primer = end.chosen.report.sequence;
    const sure = bindingPlaces(template, primer, Math.min(18, primer.length));
    const loose = bindingPlaces(template, primer, Math.min(SECOND_PLACE_BASES, primer.length));
    if (sure.length > 1) {
      warnings.push({ about: end.which, weight: "stop", says: `The ${end.which} primer's last ${Math.min(18, primer.length)} bases are found in ${sure.length} places on this template, at ${sure.map((place) => count(place.start + 1)).join(" and ")}. It would make more than one product.` });
    } else if (loose.length > 1) {
      // Its own place is where its 3′ end lies in the design; anywhere else is the second place.
      const own = (end.which === "forward" ? end.end - SECOND_PLACE_BASES : end.start) % size;
      const others = loose.filter((place) => place.start % size !== own);
      warnings.push({ about: end.which, weight: "look", says: `The ${end.which} primer's last ${SECOND_PLACE_BASES} bases are also found at base ${others.map((place) => count(place.start + 1)).join(" and ")}. At a low annealing temperature it could start there too.` });
    }
    for (const says of end.chosen.report.warnings) {
      const grave = says.includes("3' end are self-complementary") || says.includes("melting temperature");
      warnings.push({ about: end.which, weight: grave ? "stop" : "look", says: `The ${end.which} primer: ${says.replace(/3' end/g, "3′ end")}.` });
    }
  }
  return warnings.sort((a, b) => Number(b.weight === "stop") - Number(a.weight === "stop"));
}

/** What to ask the lab to hold for a designed pair: two parts, and what to call them. */
export interface PrimerOrder {
  /** Each primer as a part to add: its name, its bases 5′ to 3′, and that it is a line. */
  parts: [{ name: string; sequence: string; circular: false }, { name: string; sequence: string; circular: false }];
  /** The pair as lines to send to whoever makes them: a name, a tab, and the bases 5′ to 3′. */
  lines: [string, string];
}

/**
 * A designed pair, as what the lab is asked to hold and what is sent to be made.
 *
 * Primers are ordered, not made at the bench. So this is two parts, known by their sequences like
 * any other, and nothing here is a run: a tube of one that is added later is a tube that arrived.
 *
 * @param design - The design.
 * @param names - What to call the two primers. Named after `base` with -F and -R if not given.
 * @returns The parts to add, and the lines of an order.
 */
export function primerOrder(design: PrimerDesign, names: { base?: string; forward?: string; reverse?: string } = {}): PrimerOrder {
  const base = (names.base ?? "").trim() || "primer";
  const called = (typed: string | undefined, usual: string): string => ((typed ?? "").trim() || usual).slice(0, 200);
  const forward = { name: called(names.forward, `${base}-F`), sequence: design.forward.chosen.report.sequence, circular: false as const };
  const reverse = { name: called(names.reverse, `${base}-R`), sequence: design.reverse.chosen.report.sequence, circular: false as const };
  return { parts: [forward, reverse], lines: [`${forward.name}\t${forward.sequence}`, `${reverse.name}\t${reverse.sequence}`] };
}
