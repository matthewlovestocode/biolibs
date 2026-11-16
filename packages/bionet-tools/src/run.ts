/**
 * A PCR as a lab does one: from tubes in its freezer to a record of the run.
 *
 * `pcr.ts` knows sequences. This knows the lab: which tubes could be the template and which the
 * primers, and what to ask the lab to record once somebody has chosen. It is plain data in and plain
 * data out, so the window that uses it decides nothing.
 */
import type { ItemState, PartState, PlaceState } from "@biolibs/bionet";
import { amountOf, whereWords } from "@biolibs/bionet-panels";
import { planDigest, type DigestPlan } from "./digest.js";
import { ANNEAL_AT_LEAST, looksLikePrimer, planPcr, type PcrPlan } from "./pcr.js";

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
}

/** A PCR as chosen: what it would make, and what to ask the lab to record. */
export interface PcrRun {
  /** What the PCR would make, or `null` if a tube that was chosen is not one the lab has. */
  plan: PcrPlan | null;
  /** What the product would be called. */
  name: string;
  /** What to hand to the lab's `recordRun` if it worked. `null` while there is not exactly one product. */
  worked: Record<string, unknown> | null;
  /** What to hand to the lab's `recordRun` if it was run and gave nothing. `null` if a tube is missing. */
  failed: Record<string, unknown> | null;
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
  if (template === undefined || forward === undefined || reverse === undefined) return { plan: null, name: typed, worked: null, failed: null };
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
    settings: { anneal_at_least: least },
    note: choice.note ?? null,
  };
  const product = plan.problem === null ? plan.products[0]! : null;
  return {
    plan, name,
    worked: product === null ? null : {
      ...record, outcome: "worked",
      outputs: [{ sequence: product.sequence, circular: false, name, amount: whole(choice.amount, 50), unit: choice.unit === undefined ? "µL" : choice.unit }],
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
  /** The gel station it was run at, if the lab has one. */
  instrument?: string | null;
  /** Anything worth saying about it. */
  note?: string | null;
}

/** A digest as chosen: what it would give, and what to ask the lab to record. */
export interface DigestRun {
  /** What the digest would give, or `null` if the tube is not one the lab has. */
  plan: DigestPlan | null;
  /** What to hand to the lab's `recordRun` if the gel matched. `null` while there is nothing to match. */
  matched: Record<string, unknown> | null;
  /** What to hand to it if the gel was run and did not match. `null` likewise. */
  differed: Record<string, unknown> | null;
}

/**
 * Work a choice of tube and enzymes out into a run.
 *
 * A digest here is a check: it uses some of a tube and makes nothing. What is recorded is which
 * enzymes, what pieces were expected, and whether the gel showed them. Keeping a piece as a tube is
 * not offered, because a part cannot yet say what ends it has, and a cut piece is defined by its ends.
 *
 * @param lab - The lab.
 * @param choice - The tube, the enzymes, and how much was used.
 * @returns What it would give, and what to record either way.
 */
export function digestRun(lab: ToolLab, choice: DigestChoice): DigestRun {
  const item = lab.items.find((one) => one.item === choice.tube);
  const part = item === undefined ? undefined : lab.parts.find((one) => one.checksum === item.part);
  if (part === undefined) return { plan: null, matched: null, differed: null };
  const plan = planDigest(part, choice.enzymes, { ...(choice.gel === undefined ? {} : { gel: choice.gel }), ...(choice.ladder === undefined ? {} : { ladder: choice.ladder }) });
  if (plan.problem !== null) return { plan, matched: null, differed: null };
  const used = choice.used === undefined || !Number.isSafeInteger(choice.used) || choice.used < 0 ? 1 : choice.used;
  const record = {
    kind: "digest", instrument: choice.instrument ?? null,
    inputs: [{ item: choice.tube, amount: used, role: "cut" }],
    outputs: [],
    // Settings are short text, so a digest into very many pieces records as many as fit.
    settings: { enzymes: plan.cutters.map((one) => one.name).join("+").slice(0, 200), expected: plan.fragments.join(",").slice(0, 200), gel: plan.gel },
    note: choice.note ?? null,
  };
  return { plan, matched: { ...record, outcome: "worked" }, differed: { ...record, outcome: "failed" } };
}

/** The tools there are. */
export type ToolName = "pcr" | "digest";

/** The model of instrument each tool is used at. */
export const TOOL_AT: Readonly<Record<ToolName, string>> = { pcr: "thermocycler", digest: "gel-station" };

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
