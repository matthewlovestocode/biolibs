/**
 * A PCR as a lab does one: from tubes in its freezer to a record of the run.
 *
 * `pcr.ts` knows sequences. This knows the lab: which tubes could be the template and which the
 * primers, and what to ask the lab to record once somebody has chosen. It is plain data in and plain
 * data out, so the window that uses it decides nothing.
 */
import type { ItemState, PartFeature, PartState, PlaceState } from "@biolibs/bionet";
import { amountOf, whereWords } from "@biolibs/bionet-panels";
import { planDigest, type DigestPlan } from "./digest.js";
import { cutSites, digestPieces, type DigestPiece } from "./digest-working.js";
import { endBases, planLigation, type LigationPiece, type LigationPlan, type LigationProduct } from "./ligate.js";
import { ANNEAL_AT_LEAST, looksLikePrimer, planPcr, type PcrPlan } from "./pcr.js";
import { primerBinding, type PcrProgramme } from "./pcr-scene.js";
import { carryFeatures } from "./sequence-file.js";

/** As much of a lab as a tool reads. */
export interface ToolLab {
  parts: readonly PartState[];
  items: readonly ItemState[];
  places: readonly PlaceState[];
}

/** One tube that could be chosen. */
export interface TubeChoice {
  /** The tube. */
  item: string;
  /** What it is a tube of. */
  part: PartState;
  /** How to say it in a list: what it is, how much is left, where it is. */
  label: string;
}

/**
 * The tubes a PCR could be run from.
 *
 * Tubes that are retired or empty are left out. Short linear parts are offered as primers and the
 * rest as templates; if a lab has nothing short, everything is offered as a primer, since the lab
 * knows better than a length does.
 *
 * @param lab - The lab.
 * @returns The tubes to offer as a template, and as a primer.
 */
export function pcrTubes(lab: ToolLab): { templates: TubeChoice[]; primers: TubeChoice[] } {
  const all: TubeChoice[] = [];
  for (const item of lab.items) {
    const part = lab.parts.find((one) => one.checksum === item.part);
    if (part === undefined || item.retired || item.amount <= 0) continue;
    all.push({ item: item.item, part, label: `${part.name} · ${amountOf(item)} · ${whereWords(item, lab.places)}` });
  }
  const short = all.filter((one) => looksLikePrimer(one.part));
  const long = all.filter((one) => !looksLikePrimer(one.part));
  return { templates: long.length > 0 ? [...long, ...short] : all, primers: short.length > 0 ? short : all };
}

/** What somebody has chosen for a PCR. */
export interface PcrChoice {
  /** The tube of template, and the tubes of each primer. */
  template: string;
  forward: string;
  reverse: string;
  /** How much of each was used, in each tube's own unit. Whole numbers. */
  used?: { template?: number; forward?: number; reverse?: number };
  /** How many bases at each primer's 3′ end must bind. */
  annealAtLeast?: number;
  /** The thermocycler it was run on, if the lab has one. */
  instrument?: string | null;
  /** What to call the product, how much of it there is, and in what unit. */
  name?: string;
  amount?: number;
  unit?: string | null;
  /** Anything worth saying about the run. */
  note?: string | null;
  /** The programme the machine was set to, to be kept with the run. */
  programme?: PcrProgramme;
}

/** A PCR as chosen: what it would make, and what to ask the lab to record. */
export interface PcrRun {
  /** What the PCR would make, or `null` if a tube that was chosen is not one the lab has. */
  plan: PcrPlan | null;
  /** What is marked on the product: what the template had on the stretch copied, and the primers at its ends. */
  features: PartFeature[];
  /** What the product would be called. */
  name: string;
  /** What to hand to the lab's `recordRun` if it worked. `null` while there is not exactly one product. */
  worked: Record<string, unknown> | null;
  /** What to hand to the lab's `recordRun` if it was run and gave nothing. `null` if a tube is missing. */
  failed: Record<string, unknown> | null;
}

/**
 * What is marked on a PCR's product.
 *
 * A feature of the template that lies on the stretch copied is carried over, moved to where it now
 * is; one that is only partly copied is carried as the part that was, and named as a part. Each
 * primer is marked at the end it became. If the template is a circle and the stretch copied runs
 * through its origin, only the primers are marked.
 *
 * @param template - The template, with what is marked on it.
 * @param forward - One primer, by name and bases.
 * @param reverse - The other.
 * @param least - How many bases at each primer's 3′ end must bind.
 * @returns The features, placed on the product. Empty if either primer does not bind in one place.
 */
export function pcrFeatures(template: Pick<PartState, "sequence" | "features">, forward: { name: string; sequence: string },
                            reverse: { name: string; sequence: string }, least = ANNEAL_AT_LEAST): PartFeature[] {
  const found = [forward, reverse].map((primer) => ({ primer, binding: primerBinding(template.sequence, primer.sequence, least) }));
  const top = found.find((one) => one.binding?.reads === "top");
  const bottom = found.find((one) => one.binding?.reads === "bottom");
  if (top?.binding == null || bottom?.binding == null) return [];
  const [from, to] = [top.binding.start, bottom.binding.end];
  const straight = to > from;
  const copied = straight ? to - from : template.sequence.replace(/\s+/g, "").length - from + to;
  const length = top.binding.tail + copied + bottom.binding.tail;
  const primers: PartFeature[] = [
    { type: "primer_bind", label: top.primer.name, strand: 1, parts: [{ start: 0, end: Math.min(length, top.primer.sequence.length) }] },
    { type: "primer_bind", label: bottom.primer.name, strand: -1, parts: [{ start: Math.max(0, length - bottom.primer.sequence.length), end: length }] },
  ];
  return [...(straight ? carryFeatures(template.features, from, to, top.binding.tail) : []), ...primers];
}

/**
 * Work a choice of tubes out into a run.
 *
 * @param lab - The lab.
 * @param choice - The tubes, how much of each, and what to call the product.
 * @returns What it would make, and what to record either way.
 *
 * @example
 * ```ts
 * import { pcrRun, pcrTubes } from "@biolibs/bionet-tools";
 *
 * const { templates, primers } = pcrTubes(lab);
 * const run = pcrRun(lab, { template: templates[0].item, forward: primers[0].item, reverse: primers[1].item });
 * if (run.worked !== null) await act("recordRun", run.worked);
 * ```
 */
export function pcrRun(lab: ToolLab, choice: PcrChoice): PcrRun {
  const partOf = (id: string): PartState | undefined => {
    const item = lab.items.find((one) => one.item === id);
    return item === undefined ? undefined : lab.parts.find((one) => one.checksum === item.part);
  };
  const [template, forward, reverse] = [partOf(choice.template), partOf(choice.forward), partOf(choice.reverse)];
  const typed = choice.name?.trim() ?? "";
  if (template === undefined || forward === undefined || reverse === undefined) return { plan: null, name: typed, features: [], worked: null, failed: null };
  const least = choice.annealAtLeast ?? ANNEAL_AT_LEAST;
  const plan = planPcr(template, forward.sequence, reverse.sequence, { annealAtLeast: least });
  const name = typed !== "" ? typed : `${template.name} × ${forward.name} + ${reverse.name}`.slice(0, 200);
  const whole = (value: number | undefined, usual: number): number => (value === undefined || !Number.isSafeInteger(value) || value < 0 ? usual : value);
  const record = {
    kind: "pcr", instrument: choice.instrument ?? null,
    inputs: [
      { item: choice.template, amount: whole(choice.used?.template, 1), role: "template" },
      { item: choice.forward, amount: whole(choice.used?.forward, 1), role: "forward primer" },
      { item: choice.reverse, amount: whole(choice.used?.reverse, 1), role: "reverse primer" },
    ],
    // What the operator set is part of what was done, and is what somebody repeating the run needs.
    settings: { anneal_at_least: least, ...(choice.programme === undefined ? {} : {
      denature_c: choice.programme.steps[0].celsius, anneal_c: choice.programme.steps[1].celsius, anneal_s: choice.programme.steps[1].seconds,
      extend_c: choice.programme.steps[2].celsius, extend_s: choice.programme.steps[2].seconds, cycles: choice.programme.cycles,
    }) },
    note: choice.note ?? null,
  };
  const product = plan.problem === null ? plan.products[0]! : null;
  // Only marked if they land on the product the engine made: the two are worked out separately.
  const marked = product === null ? [] : pcrFeatures(template, forward, reverse, least);
  const features = marked.every((one) => one.parts.every((piece) => piece.end <= product!.length)) ? marked : [];
  return {
    plan, name, features,
    worked: product === null ? null : {
      ...record, outcome: "worked",
      outputs: [{ sequence: product.sequence, circular: false, name, features, amount: whole(choice.amount, 50), unit: choice.unit === undefined ? "µL" : choice.unit }],
    },
    failed: { ...record, outcome: "failed", outputs: [] },
  };
}

/**
 * The tubes a digest could be run on: every tube with something in it, the longer molecules first,
 * since those are what is usually checked.
 *
 * @param lab - The lab.
 * @returns The tubes to offer.
 */
export function digestTubes(lab: ToolLab): TubeChoice[] {
  return pcrTubes(lab).templates;
}

/** What somebody has chosen for a digest. */
export interface DigestChoice {
  /** The tube being cut. */
  tube: string;
  /** The enzymes, by name. */
  enzymes: readonly string[];
  /** How much of the tube was used, in its own unit. A whole number. */
  used?: number;
  /** The gel's agarose concentration and the ladder beside it, by their IDs in `@biolibs/gel`. */
  gel?: string;
  ladder?: string;
  /**
   * The pieces to keep as tubes, each by where it starts on the molecule. Cutting a band out of a
   * gel and cleaning it up gives a tube of that piece, with the ends the enzymes left.
   */
  keep?: readonly { from: number; name?: string; amount?: number; unit?: string | null }[];
  /** What the power supply was set to: volts, and minutes run. Whole numbers. */
  volts?: number;
  minutes?: number;
  /** The gel station it was run at, if the lab has one. */
  instrument?: string | null;
  /** Anything worth saying about it. */
  note?: string | null;
}

/** A digest as chosen: what it would give, and what to ask the lab to record. */
export interface DigestRun {
  /** What the digest would give, or `null` if the tube is not one the lab has. */
  plan: DigestPlan | null;
  /** The pieces, each with its ends and what it carries. */
  pieces: DigestPiece[];
  /** What to hand to the lab's `recordRun` if the gel matched. `null` while there is nothing to match. */
  matched: Record<string, unknown> | null;
  /** What to hand to it if the gel was run and did not match. `null` likewise. */
  differed: Record<string, unknown> | null;
}

/**
 * Work a choice of tube and enzymes out into a run.
 *
 * A digest is first a check: it uses some of a tube, and what is recorded is which enzymes, what
 * pieces were expected, and whether the gel showed them. Pieces may also be kept. Each kept piece
 * becomes a tube of a part with the ends the enzymes left, since a cut piece is defined by its ends.
 *
 * @param lab - The lab.
 * @param choice - The tube, the enzymes, and how much was used.
 * @returns What it would give, and what to record either way.
 */
export function digestRun(lab: ToolLab, choice: DigestChoice): DigestRun {
  const item = lab.items.find((one) => one.item === choice.tube);
  const part = item === undefined ? undefined : lab.parts.find((one) => one.checksum === item.part);
  if (part === undefined) return { plan: null, pieces: [], matched: null, differed: null };
  const plan = planDigest(part, choice.enzymes, { ...(choice.gel === undefined ? {} : { gel: choice.gel }), ...(choice.ladder === undefined ? {} : { ladder: choice.ladder }) });
  if (plan.problem !== null) return { plan, pieces: [], matched: null, differed: null };
  const pieces = digestPieces(part, plan.cutters.flatMap((one) => cutSites(part, one)));
  const enzymesUsed = plan.cutters.filter((one) => one.positions.length > 0).map((one) => one.name).join("+");
  const kept = (choice.keep ?? []).flatMap((wanted) => {
    const piece = pieces.find((one) => one.from === wanted.from);
    if (piece === undefined) return [];
    const amount = wanted.amount === undefined || !Number.isSafeInteger(wanted.amount) || wanted.amount < 0 ? 20 : wanted.amount;
    const typed = wanted.name?.trim() ?? "";
    return [{ sequence: piece.sequence, circular: false, ends: piece.ends, features: piece.features, amount, unit: wanted.unit === undefined ? "µL" : wanted.unit,
              name: (typed !== "" ? typed : `${part.name} ${enzymesUsed} ${piece.length} bp`).slice(0, 200) }];
  });
  const used = choice.used === undefined || !Number.isSafeInteger(choice.used) || choice.used < 0 ? 1 : choice.used;
  const record = {
    kind: "digest", instrument: choice.instrument ?? null,
    inputs: [{ item: choice.tube, amount: used, role: "cut" }],
    outputs: [],
    // Settings are short text, so a digest into very many pieces records as many as fit.
    settings: { enzymes: plan.cutters.map((one) => one.name).join("+").slice(0, 200), expected: plan.fragments.join(",").slice(0, 200), gel: plan.gel,
                ...(Number.isSafeInteger(choice.volts) ? { volts: choice.volts } : {}), ...(Number.isSafeInteger(choice.minutes) ? { minutes: choice.minutes } : {}) },
    note: choice.note ?? null,
  };
  // Pieces can only be kept from a gel that showed them.
  return { plan, pieces, matched: { ...record, outputs: kept, outcome: "worked", ...(kept.length === 0 ? {} : { settings: { ...record.settings, kept: kept.length } }) },
           differed: { ...record, outcome: "failed" } };
}

/**
 * The tubes a ligation could be set up from: every tube of a linear molecule with something in it.
 *
 * A circle has no ends to join, so it is left out until somebody cuts it.
 *
 * @param lab - The lab.
 * @returns The tubes to offer, the ones with sticky ends first, since those are the ones that were cut.
 */
export function ligationTubes(lab: ToolLab): TubeChoice[] {
  return pcrTubes(lab).templates.filter((one) => !one.part.circular)
    .sort((a, b) => Number(sticky(b.part)) - Number(sticky(a.part)) || b.part.length - a.part.length);
}

/** Whether a part has an end with unpaired bases. */
const sticky = (part: PartState): boolean => (part.ends?.left ?? 0) !== 0 || (part.ends?.right ?? 0) !== 0;

/** What somebody has chosen for a ligation. */
export interface LigationChoice {
  /** The tubes to join, by item ID. */
  tubes: readonly string[];
  /** How much of each was used, in its own unit. Whole numbers, by item ID. */
  used?: Readonly<Record<string, number>>;
  /** Whether two blunt ends may be joined, and whether to keep the products that do not close. */
  blunt?: boolean;
  linear?: boolean;
  /** Which product is being made, by its place in the plan. The first by default. */
  chosen?: number;
  /** The heat block or water bath it was set up at, if the lab has one. */
  instrument?: string | null;
  /** What to call the product, how much of it there is, and in what unit. */
  name?: string;
  amount?: number;
  unit?: string | null;
  /** Anything worth saying about it. */
  note?: string | null;
}

/** A ligation as chosen: what it would make, and what to ask the lab to record. */
export interface LigationRun {
  /** What it would make, or `null` if a tube that was chosen is not one the lab has. */
  plan: LigationPlan | null;
  /** The pieces, as the sequence layer needs them. */
  pieces: LigationPiece[];
  /** The product being made, or `null` if there is nothing to make. */
  product: LigationProduct | null;
  /** What it would be called. */
  name: string;
  /** What to hand to the lab's `recordRun` if it worked. `null` while there is nothing to make. */
  worked: Record<string, unknown> | null;
  /** What to hand to it if it was set up and gave nothing. `null` if a tube is missing. */
  failed: Record<string, unknown> | null;
}

/**
 * Work a choice of tubes out into a ligation.
 *
 * What comes out is one molecule, and it is a part like any other: a circle if the pieces closed,
 * and otherwise a line with the outer ends the pieces brought. It carries what the pieces carried.
 *
 * @param lab - The lab.
 * @param choice - The tubes, how much of each, and what to call what comes out.
 * @returns What it would make, and what to record either way.
 */
export function ligationRun(lab: ToolLab, choice: LigationChoice): LigationRun {
  const pieces: LigationPiece[] = [];
  for (const item of choice.tubes) {
    const held = lab.items.find((one) => one.item === item);
    const part = held === undefined ? undefined : lab.parts.find((one) => one.checksum === held.part);
    if (part === undefined || part.circular) return { plan: null, pieces: [], product: null, name: "", worked: null, failed: null };
    pieces.push({ id: item, name: part.name, sequence: part.sequence, ends: part.ends ?? { left: 0, right: 0 }, features: part.features });
  }
  const plan = planLigation(pieces, { blunt: choice.blunt === true, linear: choice.linear === true });
  const product = plan.products[Math.max(0, Math.min(choice.chosen ?? 0, plan.products.length - 1))] ?? null;
  const typed = choice.name?.trim() ?? "";
  const name = (typed !== "" ? typed : pieces.map((piece) => piece.name).join(" + ")).slice(0, 200);
  const whole = (value: number | undefined, usual: number): number => (value === undefined || !Number.isSafeInteger(value) || value < 0 ? usual : value);
  const record = {
    kind: "ligation", instrument: choice.instrument ?? null,
    inputs: pieces.map((piece) => ({ item: piece.id, amount: whole(choice.used?.[piece.id], 1), role: "piece" })),
    settings: { pieces: pieces.length, ...(product === null ? {} : { joins: product.joins.length, made: product.circular ? "circle" : "line" }),
                ...(choice.blunt === true ? { blunt: "allowed" } : {}) },
    note: choice.note ?? null,
  };
  if (product === null) return { plan, pieces, product, name, worked: null, failed: { ...record, outcome: "failed", outputs: [] } };
  // A circle has no ends. A line keeps the outer ends of the pieces at each of its own ends.
  const first = product.pieces[0]!;
  const last = product.pieces.at(-1)!;
  const endsOf = (placed: typeof first, which: "left" | "right"): number => {
    const piece = pieces.find((one) => one.id === placed.id)!;
    const own = placed.flipped ? { left: -piece.ends.right, right: -piece.ends.left } : piece.ends;
    return own[which];
  };
  const ends = product.circular ? undefined : { left: endsOf(first, "left"), right: endsOf(last, "right") };
  return {
    plan, pieces, product, name,
    worked: { ...record, outcome: "worked",
              outputs: [{ sequence: product.sequence, circular: product.circular, name, features: product.features,
                          amount: whole(choice.amount, 20), unit: choice.unit === undefined ? "µL" : choice.unit,
                          ...(ends === undefined || (ends.left === 0 && ends.right === 0) ? {} : { ends }) }] },
    failed: { ...record, outcome: "failed", outputs: [] },
  };
}

/** The tools there are. */
export type ToolName = "pcr" | "digest" | "ligation";

/** The model of instrument each tool is used at. */
export const TOOL_AT: Readonly<Record<ToolName, string>> = { pcr: "thermocycler", digest: "gel-station", ligation: "heat-block" };

/**
 * Which tool an instrument opens.
 *
 * @param place - The place, as the lab records it.
 * @returns The tool's name, or `null` if there is none for it yet.
 */
export function toolFor(place: Pick<PlaceState, "kind" | "fields"> | undefined): ToolName | null {
  if (place?.kind !== "instrument") return null;
  return (Object.keys(TOOL_AT) as ToolName[]).find((tool) => TOOL_AT[tool] === place.fields["model"]) ?? null;
}

/**
 * The instrument a tool would be used at, if the lab has placed one.
 *
 * @param lab - The lab.
 * @param tool - The tool.
 * @returns The first such instrument still in use, or `null`.
 */
export function instrumentFor(lab: Pick<ToolLab, "places">, tool: ToolName): { id: string; name: string } | null {
  const found = lab.places.find((place) => !place.retired && toolFor(place) === tool);
  return found === undefined ? null : { id: found.place, name: found.name };
}
