/**
 * A PCR as a person at the machine meets it: what the machine shows, and what they have to picture.
 *
 * A thermocycler shows a programme, a temperature and a cycle count. It says nothing about DNA. What
 * is happening in the tube — strands parting, primers finding their places, copies being made, and
 * which of those copies are the product — the operator has to picture. This works both out as plain
 * data, so a scene can draw them and a test can check them:
 *
 * - the **programme**, as the machine shows it, suggested from the reaction;
 * - the **checks** a careful operator would make of it, each about this run and each able to be wrong;
 * - where each **primer binds**, on which strand;
 * - what is **in the tube** at each step of each cycle.
 */

/** The three things a cycle does. */
export type PcrStepName = "denature" | "anneal" | "extend";

/** One step of a programme: how hot, and for how long. */
export interface PcrStep {
  /** Which step it is. */
  name: PcrStepName;
  /** The block's temperature, in whole degrees Celsius. */
  celsius: number;
  /** How long it is held, in whole seconds. */
  seconds: number;
}

/** A thermocycler's programme. */
export interface PcrProgramme {
  /** The first, longer melt before cycling starts. */
  initial: { celsius: number; seconds: number };
  /** The three steps of a cycle, in order. */
  steps: [PcrStep, PcrStep, PcrStep];
  /** How many times the cycle is run. */
  cycles: number;
  /** The last, longer extension after cycling ends. */
  final: { celsius: number; seconds: number };
}

/** What the tool knows of a reaction when it suggests or checks a programme. */
export interface PcrReaction {
  /** How long the product is, in bases. */
  length: number;
  /** Each primer's name and rough melting temperature, in degrees Celsius. */
  primers: { name: string; tm: number }[];
}

const clamp = (value: number, least: number, most: number): number => Math.min(Math.max(value, least), most);

/** How long a polymerase is usually given: a minute for every thousand bases. */
export const SECONDS_PER_KB = 60;

/**
 * A programme that suits a reaction, to start from.
 *
 * The annealing step is five degrees under the cooler primer, and the extension allows a minute for
 * every thousand bases. Both are conventions, and the operator may know better.
 *
 * @param reaction - The product's length and the primers' melting temperatures.
 * @returns The programme.
 *
 * @example
 * ```ts
 * import { suggestProgramme } from "@biolibs/bionet-tools";
 *
 * const programme = suggestProgramme({ length: 1500, primers: [{ name: "fwd", tm: 60 }, { name: "rev", tm: 58 }] });
 * programme.steps[1];    // { name: "anneal", celsius: 53, seconds: 30 }
 * programme.steps[2];    // { name: "extend", celsius: 72, seconds: 90 }
 * ```
 */
export function suggestProgramme(reaction: PcrReaction): PcrProgramme {
  const coolest = reaction.primers.length === 0 ? 60 : Math.min(...reaction.primers.map((one) => one.tm));
  const extend = Math.max(15, Math.ceil(((reaction.length / 1000) * SECONDS_PER_KB) / 5) * 5);
  return {
    initial: { celsius: 95, seconds: 120 },
    steps: [
      { name: "denature", celsius: 95, seconds: 30 },
      { name: "anneal", celsius: clamp(Math.round(coolest) - 5, 45, 72), seconds: 30 },
      { name: "extend", celsius: 72, seconds: extend },
    ],
    cycles: 30,
    final: { celsius: 72, seconds: 300 },
  };
}

/** A length of time as a machine writes it: minutes and seconds. */
const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** One line of a thermocycler's screen. */
export interface ScreenLine {
  /** What it says. */
  text: string;
  /** The step of the cycle it is, if it is one. */
  step?: PcrStepName;
}

/**
 * A programme as a thermocycler's screen shows it.
 *
 * @param programme - The programme.
 * @returns The lines, top to bottom.
 */
export function screenOf(programme: PcrProgramme): ScreenLine[] {
  const row = (label: string, at: { celsius: number; seconds: number }): string => `${label.padEnd(9)}${String(at.celsius).padStart(3)} °C  ${clock(at.seconds).padStart(5)}`;
  return [
    { text: row("Start", programme.initial) },
    { text: `${programme.cycles} cycles of` },
    ...programme.steps.map((step) => ({ text: row(`  ${step.name[0]!.toUpperCase()}${step.name.slice(1)}`, step), step: step.name })),
    { text: row("Finish", programme.final) },
    { text: `About ${clock(runSeconds(programme))} in all` },
  ];
}

/**
 * How long a programme takes, not counting the time the block spends changing temperature.
 *
 * @param programme - The programme.
 * @returns Seconds.
 */
export function runSeconds(programme: PcrProgramme): number {
  return programme.initial.seconds + programme.cycles * programme.steps.reduce((sum, step) => sum + step.seconds, 0) + programme.final.seconds;
}

/** Something a careful operator would stop and ask about a programme. */
export interface PcrCheck {
  /** The part of the programme it is about. */
  about: PcrStepName | "cycles";
  /** `stop` if the run is unlikely to work as set, `look` if it is only worth a second glance. */
  weight: "stop" | "look";
  /** What to ask, said for a person. */
  says: string;
}

/**
 * What a careful operator would ask of a programme, given the reaction it is for.
 *
 * Each is about this run and may be wrong: an operator who knows their polymerase extends at fifteen
 * seconds a thousand bases can ignore what is said about extension. None of them stops a run.
 *
 * @param programme - The programme as set.
 * @param reaction - The product's length and the primers' melting temperatures.
 * @returns The checks that apply, the ones most likely to matter first.
 */
export function programmeChecks(programme: PcrProgramme, reaction: PcrReaction): PcrCheck[] {
  const checks: PcrCheck[] = [];
  const [denature, anneal, extend] = programme.steps;
  const sorted = [...reaction.primers].sort((a, b) => a.tm - b.tm);
  const coolest = sorted[0];
  const warmest = sorted.at(-1);
  if (coolest !== undefined && anneal.celsius > coolest.tm) {
    checks.push({ about: "anneal", weight: "stop", says: `Annealing at ${anneal.celsius} °C is above ${coolest.name}'s melting temperature, about ${Math.round(coolest.tm)} °C. It may not bind.` });
  } else if (coolest !== undefined && anneal.celsius < coolest.tm - 10) {
    checks.push({ about: "anneal", weight: "look", says: `Annealing at ${anneal.celsius} °C is more than ten degrees under the primers' melting temperatures. They may bind in places they should not.` });
  }
  if (coolest !== undefined && warmest !== undefined && warmest.tm - coolest.tm > 5) {
    checks.push({ about: "anneal", weight: "look", says: `${warmest.name} melts about ${Math.round(warmest.tm - coolest.tm)} degrees above ${coolest.name}. No one annealing temperature suits both well.` });
  }
  const wanted = (reaction.length / 1000) * SECONDS_PER_KB;
  if (extend.seconds < wanted / 2) {
    checks.push({ about: "extend", weight: "stop", says: `${extend.seconds} seconds is short for a ${reaction.length.toLocaleString("en-US")} base product. Allow about a minute for every thousand bases unless the polymerase is a fast one.` });
  } else if (extend.seconds < wanted) {
    checks.push({ about: "extend", weight: "look", says: `${extend.seconds} seconds is under a minute per thousand bases for a ${reaction.length.toLocaleString("en-US")} base product. Fine for a fast polymerase.` });
  }
  if (denature.celsius < 90) checks.push({ about: "denature", weight: "stop", says: `${denature.celsius} °C may not separate the strands. It is usually 94 to 98 °C.` });
  if (programme.cycles > 40) checks.push({ about: "cycles", weight: "look", says: `${programme.cycles} cycles is a lot. Past about 35, wrong products build up faster than the right one.` });
  if (programme.cycles < 15) checks.push({ about: "cycles", weight: "look", says: `${programme.cycles} cycles may not make enough to see on a gel.` });
  return checks.sort((a, b) => Number(b.weight === "stop") - Number(a.weight === "stop"));
}

/** Where a primer binds a template. Positions count bases from the start of the template's top strand. */
export interface Binding {
  /** The first base it covers. */
  start: number;
  /** One past the last base it covers. */
  end: number;
  /** `top` if it has the top strand's sequence, and so binds the bottom strand and is copied rightwards; `bottom` the other way. */
  reads: "top" | "bottom";
  /** How many bases at its 5′ end do not bind: a tail it carries onto the product. */
  tail: number;
}

const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G", U: "A", N: "N" };
const reversed = (bases: string): string => [...bases].reverse().map((base) => PAIR[base] ?? "N").join("");

/**
 * Where one primer binds a template, if it does.
 *
 * It is looked for by the bases at its 3′ end, which are the ones that have to match, on either
 * strand. Its match is then followed back towards its 5′ end for as long as it holds.
 *
 * @param template - The template's top strand.
 * @param primer - The primer, 5′ to 3′.
 * @param least - How many bases at its 3′ end must match.
 * @returns Where it binds, or `null` if it does not or binds in more than one place.
 */
export function primerBinding(template: string, primer: string, least = 18): Binding | null {
  const top = template.replace(/\s+/g, "").toUpperCase();
  const bases = primer.replace(/\s+/g, "").toUpperCase();
  if (bases.length < least || least < 1) return null;
  const found: Binding[] = [];
  // Reading as the top strand: its 3′ end is its right-hand end.
  const end3 = bases.slice(-least);
  for (let at = top.indexOf(end3); at !== -1; at = top.indexOf(end3, at + 1)) {
    let matched = least;
    while (matched < bases.length && at - (matched - least) - 1 >= 0 && top[at - (matched - least) - 1] === bases[bases.length - matched - 1]) matched++;
    found.push({ start: at - (matched - least), end: at + least, reads: "top", tail: bases.length - matched });
  }
  // Reading as the bottom strand: reversed, its 3′ end is its left-hand end.
  const flipped = reversed(bases);
  const start3 = flipped.slice(0, least);
  for (let at = top.indexOf(start3); at !== -1; at = top.indexOf(start3, at + 1)) {
    let matched = least;
    while (matched < flipped.length && at + matched < top.length && top[at + matched] === flipped[matched]) matched++;
    found.push({ start: at, end: at + matched, reads: "bottom", tail: bases.length - matched });
  }
  return found.length === 1 ? found[0]! : null;
}

/** One line drawn in the tube: a strand, or a primer on one. */
export interface TubeStrand {
  /** Where it starts and ends, in bases along the template. */
  from: number;
  to: number;
  /** Which of the four rows it is drawn on, from the top: 0 and 3 are the template's strands, 1 and 2 what lies between them. */
  row: 0 | 1 | 2 | 3;
  /** What it is. */
  kind: "template" | "primer" | "growing" | "long" | "product";
  /** Whether its 3′ end is at `to` (it points right) or at `from`. */
  points: "right" | "left";
  /**
   * What it does during the step, if it does anything: `parts` from the strand it was paired with,
   * `lands` on the strand it matches, or `grows` from its primer towards its 3′ end.
   */
  moves?: "parts" | "lands" | "grows";
}

/** What is in the tube at one step of one cycle. */
export interface TubeView {
  /** What to draw. */
  strands: TubeStrand[];
  /** How many strands of each kind there are after this cycle, starting from one double-stranded template. */
  counts: { template: number; long: number; product: number };
  /** What is happening, in a sentence. */
  says: string;
}

/**
 * How many strands of each kind a tube holds after some cycles, from one double-stranded template.
 *
 * The template's two strands are never made more of. Each cycle copies them once more into strands
 * that start at a primer and run on past the other one: there are two more of those every cycle.
 * Everything else is the product, cut to length at both ends, and it doubles.
 *
 * @param cycles - How many cycles have finished.
 * @returns The counts. They add up to twice two to the power of the cycles.
 */
export function strandCounts(cycles: number): { template: number; long: number; product: number } {
  const done = Math.max(0, Math.floor(cycles));
  return { template: 2, long: 2 * done, product: Math.max(0, 2 ** (done + 1) - 2 * done - 2) };
}

/**
 * What is in the tube at one step of one cycle.
 *
 * It draws the one thing each early cycle adds, since that is what is hard to picture: the first
 * cycle makes strands that run on past the far primer, the second makes the first strands of exactly
 * the product's length, and from the third the product is double-stranded and takes over.
 *
 * @param length - How long the template is, in bases.
 * @param forward - Where the primer that reads as the top strand binds.
 * @param reverse - Where the primer that reads as the bottom strand binds.
 * @param step - Which step of the cycle.
 * @param cycle - Which cycle, counting from 1.
 * @returns What to draw, how many strands of each kind there are once the cycle ends, and a sentence.
 */
export function tubeView(length: number, forward: Binding, reverse: Binding, step: PcrStepName, cycle: number): TubeView {
  const at = Math.max(1, Math.floor(cycle));
  const template: TubeStrand[] = [
    { from: 0, to: length, row: 0, kind: "template", points: "right" },
    { from: 0, to: length, row: 3, kind: "template", points: "left" },
  ];
  const primers: TubeStrand[] = [
    { from: reverse.start, to: reverse.end, row: 1, kind: "primer", points: "left" },
    { from: forward.start, to: forward.end, row: 2, kind: "primer", points: "right" },
  ];
  // What each strand is copied into depends on what it is copied from, which changes over the first cycles.
  const made = (kind: TubeStrand["kind"]): TubeStrand[] => (at === 1
    ? [{ from: 0, to: reverse.end, row: 1, kind, points: "left" }, { from: forward.start, to: length, row: 2, kind, points: "right" }]
    : [{ from: forward.start, to: reverse.end, row: 1, kind, points: "left" }, { from: forward.start, to: reverse.end, row: 2, kind, points: "right" }]);
  const templates: TubeStrand[] = at === 1 ? template
    : at === 2 ? [{ from: forward.start, to: length, row: 0, kind: "long", points: "right" }, { from: 0, to: reverse.end, row: 3, kind: "long", points: "left" }]
    : [{ from: forward.start, to: reverse.end, row: 0, kind: "product", points: "right" }, { from: forward.start, to: reverse.end, row: 3, kind: "product", points: "left" }];
  const counts = strandCounts(step === "extend" ? at : at - 1);
  if (step === "denature") {
    return { strands: templates.map((one) => ({ ...one, moves: "parts" as const })), counts, says: at === 1
      ? "Heat pulls the template's two strands apart. Nothing can be copied until they are single."
      : at === 2 ? "The strands made in the first cycle part from the template. Each starts at a primer and runs on past the other."
      : "Every double strand parts, including the product made so far." };
  }
  if (step === "anneal") {
    return { strands: [...templates, ...primers.map((one) => ({ ...one, moves: "lands" as const }))], counts, says: "Cooler, the primers find the one place each matches and bind. A primer always points along the strand towards the other primer." };
  }
  return {
    strands: [...templates, ...made(at === 1 ? "long" : "product").map((one) => ({ ...one, moves: "grows" as const }))], counts,
    says: at === 1 ? "The polymerase copies from each primer to the end of the template. These first copies start in the right place and run on too far."
      : at === 2 ? "Copied from a strand that already starts at a primer, the new strand stops where that one began. These are the first strands of exactly the product's length."
      : "From the third cycle the product is copied from the product. It doubles each cycle, and the over-long strands are left behind.",
  };
}

/** One base in the magnified view, and what it is doing. */
export interface LensCell {
  /** The base, or `""` where the strand has none at this place. */
  base: string;
  /** `paired` with the base opposite, `single`, or `fresh`: just added by the polymerase, and paired. */
  state: "paired" | "single" | "fresh";
}

/** The real bases around one primer's site, at one moment of one step. */
export interface TubeLens {
  /** The stretch of the template it shows, in bases from the start of the top strand. */
  from: number;
  to: number;
  /** The upper strand, written 5′ to 3′ from the left, one cell for each place on the template. */
  upper: { label: string; cells: LensCell[] };
  /** The lower strand, written 3′ to 5′ from the left, so that each base is under the one it pairs with. */
  lower: { label: string; cells: LensCell[] };
  /** For each place, whether the base above is paired with the base below. */
  joined: boolean[];
  /** The place the polymerase is at, counted from the left of the view, if it is copying. */
  polymerase: number | null;
  /** How many more bases the copy has to go beyond what is shown, when it is being made. */
  beyond: number;
}

/**
 * The real bases at a primer's site, at one moment of one step.
 *
 * The strands in the tube are thousands of bases long and are drawn as lines. This is the same
 * moment magnified at the one place worth reading: where a primer binds. Heat unzips the template
 * there base by base; the primer lands and pairs, A with T and G with C, leaving any tail it carries
 * unpaired; and the polymerase adds the next bases one at a time, each the partner of the base
 * opposite. Every letter is from the lab's own sequences.
 *
 * @param template - The template's top strand.
 * @param primer - The primer, 5′ to 3′.
 * @param binding - Where it binds, from `primerBinding`.
 * @param step - Which step of the cycle.
 * @param through - How far through the step it is, from 0 to 1.
 * @param names - What to call the primer and the template.
 * @returns The two rows of bases, which are paired, and where the polymerase is.
 */
export function tubeLens(template: string, primer: string, binding: Binding, step: PcrStepName, through: number,
                         names: { primer?: string; template?: string } = {}): TubeLens {
  const top = template.replace(/\s+/g, "").toUpperCase();
  const bases = primer.replace(/\s+/g, "").toUpperCase();
  const at = Math.min(Math.max(through, 0), 1);
  const rightward = binding.reads === "top";
  const [ahead, behind] = [22, 3];
  // Room for the primer and its tail, a little behind it, and the first bases copied ahead of it.
  const from = Math.max(0, rightward ? binding.start - binding.tail - behind : binding.start - ahead);
  const to = Math.min(top.length, rightward ? binding.end + ahead : binding.end + binding.tail + behind);
  const places = Array.from({ length: to - from }, (_, index) => from + index);
  const templateName = names.template ?? "template";
  const primerName = names.primer ?? "primer";

  if (step === "denature") {
    // The two strands come apart from one end of the view to the other.
    const joined = places.map((_, index) => (index + 0.5) / places.length > at * 1.2);
    const cell = (base: string, index: number): LensCell => ({ base, state: joined[index]! ? "paired" : "single" });
    return {
      from, to, joined, polymerase: null, beyond: 0,
      upper: { label: `${templateName}, top strand`, cells: places.map((place, index) => cell(top[place]!, index)) },
      lower: { label: `${templateName}, bottom strand`, cells: places.map((place, index) => cell(PAIR[top[place]!] ?? "N", index)) },
    };
  }

  // The primer, laid where it binds: left to right 5′→3′ if it reads as the top strand, 3′→5′ if not.
  const laid = rightward ? bases : [...bases].reverse().join("");
  const first = rightward ? binding.start - binding.tail : binding.start;
  const primerBase = (place: number): string => (place >= first && place < first + laid.length ? laid[place - first]! : "");
  const binds = (place: number): boolean => place >= binding.start && place < binding.end;
  const width = binding.end - binding.start;
  // Pairs form along the primer from its 5′ end to its 3′ end, in the second half of the step.
  const zipped = (place: number): boolean => {
    const along = rightward ? place - binding.start : binding.end - 1 - place;
    return step === "extend" || (along + 0.5) / width < (at - 0.45) / 0.5;
  };
  // How many bases the polymerase has added, of those the view has room for.
  const room = rightward ? to - binding.end : binding.start - from;
  const added = step === "extend" ? Math.min(room, Math.floor(at * (room + 1))) : 0;
  const copied = (place: number): boolean => (rightward ? place >= binding.end && place < binding.end + added : place < binding.start && place >= binding.start - added);
  const joined = places.map((place) => (binds(place) && zipped(place)) || copied(place));
  const strand = places.map((place, index): LensCell => {
    if (copied(place)) return { base: rightward ? top[place]! : PAIR[top[place]!] ?? "N", state: "fresh" };
    const base = primerBase(place);
    return { base, state: base !== "" && joined[index]! ? "paired" : "single" };
  });
  const other = places.map((place, index): LensCell => ({ base: rightward ? PAIR[top[place]!] ?? "N" : top[place]!, state: joined[index]! ? "paired" : "single" }));
  const length = rightward ? top.length - binding.end : binding.start;
  return {
    from, to, joined,
    polymerase: step === "extend" && added < room ? (rightward ? binding.end + added : binding.start - added - 1) - from : null,
    beyond: step === "extend" ? Math.max(0, length - added) : 0,
    upper: rightward ? { label: step === "extend" ? `${primerName}, and the copy` : primerName, cells: strand } : { label: `${templateName}, top strand`, cells: other },
    lower: rightward ? { label: `${templateName}, bottom strand`, cells: other } : { label: step === "extend" ? `${primerName}, and the copy` : primerName, cells: strand },
  };
}
