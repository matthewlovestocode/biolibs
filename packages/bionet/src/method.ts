/**
 * Writing a lab's plan out so that another lab can carry it out, signing one, and reading one a
 * stranger published.
 *
 * A lab's own inventory says what it *holds*. This says what it *did*, which is the other half of
 * what one lab has to give another and the half that was missing: a lab could publish that it had a
 * molecule, and could not publish how to make one.
 *
 * The whole of the difficulty is in one translation. Inside a lab a plan points at tubes — "use
 * 1 µL of tube abc123" — and a tube's ID means something only in the lab that holds it. Published,
 * every tube is replaced by the checksum of what is in it, which is the one name two labs that have
 * never spoken already agree on: the same molecule gives the same checksum whichever strand it was
 * written from and, for a circle, wherever it was cut open. So a method says "use the molecule whose
 * checksum is this", and the lab reading it looks in its own freezer, or asks the network who has
 * one with `whoHas`.
 *
 * Two things cannot make that crossing, and both are said rather than hidden.
 *
 * **Anything alive.** A strain is the lab's own — the same plasmid in the same published host twice
 * is two strains, deliberately — so a culture has no checksum to travel under. A step that uses one
 * says what it would have to be a culture *of*, and whoever follows the method makes their own.
 *
 * **A starting material's sequence, unless the publisher gives it.** What a method's steps make is
 * written out in full, because a later step has to be able to name it. What it *starts* from is
 * named by checksum, and carries its sequence only if the publisher said to share it. A method
 * without those sequences is still worth having — it tells somebody holding the same molecules
 * exactly what to do with them — but it will not tell somebody who holds none of them what to order.
 */
import { signUnder, verifyUnder, type SignatureCheck, type SignOptions, type SigningKey } from "@biolibs/opencloning";
import { METHOD_VERSION, type LabModel, type MethodDocument, type MethodInput, type MethodStep,
         type SignedMethod } from "./model.js";
import type { LabState, PlanState } from "./merge.js";
import type { PartEnds } from "./log.js";

/** What the bytes of a signed method are for. */
export const METHOD_DOMAIN = "biolibs/bionet signed method v1";

/** How many steps one method may have. */
export const MOST_STEPS = 500;

/** The longest a method may be, as text. */
export const LONGEST_METHOD = 4_000_000;

/** What `publicMethod` needs to know that the plans cannot say. */
export interface MethodOptions {
  /** Which plans to publish, by ID. Without it, every plan still open. */
  plans?: readonly string[];
  /** Only the plans filed under this project. */
  project?: string;
  /** What to call it. Without it, the project, or what it ends by making. */
  name?: string;
  /** Anything to say about it as a whole. */
  note?: string | null;
  /**
   * Whether to write out the sequence of what the method starts from, as well as of what it makes.
   *
   * On unless a lab says otherwise. Off, the method says which molecules are needed, by checksum,
   * and not what they are: somebody holding the same ones can follow it, and somebody holding none
   * of them learns only that they are missing something.
   */
  sequences?: boolean;
  /** When to say it was published. Defaults to now. */
  publishedAt?: string;
}

/** The field a plan is filed under. */
const PROJECT = "project";

/**
 * Write a lab's plan out as a method another lab could carry out.
 *
 * The order is worked out the same way it is worked out at home: a step that needs what another
 * step makes comes after it. Nothing is asserted that the plans do not already say.
 *
 * @param state - The lab, merged.
 * @param lab - Who is publishing, as an inventory says it.
 * @param options - Which plans, what to call it, and whether to write the starting sequences out.
 * @returns The method, ready to be signed.
 * @throws If no plan was chosen, or there are more steps than one method may carry.
 *
 * @example
 * ```ts
 * import { publicMethod, signMethod } from "@biolibs/bionet";
 *
 * const method = publicMethod(lab, { name: "The Wren Lab", origin: "https://wrenlab.example", contact: null, note: null },
 *                             { project: "Real Vegan Cheese" });
 * const published = await signMethod(method, adasKey, { signer: "Ada" });
 * ```
 */
export function publicMethod(state: LabState, lab: LabModel, options: MethodOptions = {}): MethodDocument {
  // A step that only applies if a reading comes out a certain way is left out, because a method
  // has nowhere to carry the condition: published, it would be numbered among the steps and read
  // as one to carry out. A lab would induce at 20 °C because a gel somewhere else might have been
  // bad. Leaving it out says less than the truth; publishing it says something untrue.
  //
  // The condition cannot travel until an expectation can, since it is an answer to one, and an
  // expectation has nowhere to go in a method either. When it does, these belong in the method
  // with their condition beside them, and this goes.
  const wanted = (one: (typeof state.plans)[number]): boolean => {
    if (one.settled !== null) return false;
    if (options.plans !== undefined) return options.plans.includes(one.plan);
    if (options.project !== undefined) return one.fields[PROJECT] === options.project;
    return true;
  };
  const conditional = state.plans.filter((one) => wanted(one) && one.follows != null).length;
  const chosen = state.plans.filter((one) => wanted(one) && one.follows == null);
  if (chosen.length === 0 && conditional > 0) {
    throw new Error(`Every one of those ${conditional} open plans answers a reading, and a method cannot carry what a step is conditional on.`);
  }
  if (chosen.length === 0) throw new Error("There are no open plans to publish.");
  if (chosen.length > MOST_STEPS) throw new Error(`A method carries at most ${MOST_STEPS} steps; that is ${chosen.length}.`);
  const withSequences = options.sequences !== false;

  /** What a tube is of, said the way it has to be said to travel. */
  const whatIsIn = (item: string): { part: string | null; name: string; unit: string | null; alive?: MethodInput["alive"] } => {
    const held = state.items.find((one) => one.item === item);
    if (held === undefined) return { part: null, name: "something the lab no longer holds", unit: null };
    if (held.part !== null) {
      const part = state.parts.find((one) => one.checksum === held.part);
      return { part: held.part, name: part?.name ?? "a part", unit: held.unit };
    }
    // A tube of something nobody has identified. It has no checksum for the same reason a culture
    // has none — there is no sequence to take one of — so it cannot travel either, and saying what
    // this lab calls it is the most that can honestly be said.
    // What a lab writes on a tube it cannot name is a private note to itself — "the one from the
    // back of the -80" — and says nothing another lab could use. So the step says only that there
    // was something unidentified here, which is the whole of what is honestly known about it.
    if (held.specimen !== null) return { part: null, name: "something the publishing lab had not identified", unit: held.unit };
    // A culture. It has no checksum, so what travels is what it would have to be a culture of.
    const strain = state.strains.find((one) => one.strain === held.strain);
    return { part: null, name: strain?.name ?? "a culture", unit: held.unit,
             alive: { carries: [...(strain?.carries ?? [])], host: strain?.host ?? null } };
  };

  // Which step makes what, so that a step using it can point at the step rather than at a freezer.
  const madeBy = new Map<string, string>();
  for (const plan of chosen) for (const made of plan.expects) if (!madeBy.has(made.checksum)) madeBy.set(made.checksum, plan.plan);

  /** Which plans each waits on, by ID. */
  const after = new Map<string, string[]>();
  for (const plan of chosen) {
    const waits = plan.inputs.flatMap((input) => {
      const checksum = input.part ?? (input.item === undefined ? null : whatIsIn(input.item).part);
      const maker = checksum === null ? undefined : madeBy.get(checksum);
      return maker === undefined || maker === plan.plan ? [] : [maker];
    });
    after.set(plan.plan, [...new Set(waits)]);
  }

  // The order: everything a step waits on comes before it. A circle, which nothing in a lab should
  // make, is published in the order the plans were proposed rather than refused.
  const left = new Set(chosen.map((one) => one.plan));
  const order: PlanState[] = [];
  for (let guard = 0; left.size > 0 && guard <= chosen.length; guard += 1) {
    const free = chosen.filter((one) => left.has(one.plan) && (after.get(one.plan) ?? []).every((before) => !left.has(before)));
    if (free.length === 0) break;
    for (const one of free) { order.push(one); left.delete(one.plan); }
  }
  for (const one of chosen) if (left.has(one.plan)) order.push(one);
  const numberOf = new Map(order.map((one, at) => [one.plan, at + 1]));

  // A sequence on its own is not an identity: the same bases as a ring and as a line are two
  // different molecules with two different checksums. So whatever is written out goes with the
  // shape it was written out as, or a lab taking it rebuilds a ring as a line and matches nothing.
  const moleculeOf = (checksum: string): { sequence: string; circular: boolean; ends?: PartEnds } | undefined => {
    if (!withSequences) return undefined;
    const part = state.parts.find((one) => one.checksum === checksum);
    if (part === undefined) return undefined;
    return { sequence: part.sequence, circular: part.circular,
             ...(part.ends.left === 0 && part.ends.right === 0 ? {} : { ends: part.ends }) };
  };

  const steps: MethodStep[] = order.map((plan, at) => ({
    step: at + 1,
    kind: plan.kind,
    uses: plan.inputs.map((input): MethodInput => {
      // A prospect has no checksum, for the same reason a culture and a specimen have none: there
      // is no sequence to count one over. So it cannot travel either. What is honest to say is that
      // the step rests on something nobody had made, and what kind of thing that was — a taking lab
      // can then see where the method stops being something it can follow.
      const what = input.prospect !== undefined
        ? { part: null, name: `something the publishing lab had not made: a ${state.prospects.find((one) => one.prospect === input.prospect)?.kind ?? "thing"}`, unit: null }
        : input.item === undefined
        ? { part: input.part!, name: state.parts.find((one) => one.checksum === input.part)?.name ?? "a part", unit: null }
        : whatIsIn(input.item);
      const maker = what.part === null ? undefined : madeBy.get(what.part);
      return {
        part: what.part, name: what.name, amount: input.amount, unit: what.unit, role: input.role,
        ...(maker === undefined || maker === plan.plan ? {} : { from: numberOf.get(maker)! }),
        ...(what.alive === undefined ? {} : { alive: what.alive }),
      };
    }),
    makes: plan.expects.map((made) => ({
      name: made.name, circular: made.circular, ends: made.ends, length: made.length, checksum: made.checksum,
      // What a step makes is always written out: a later step has to be able to name it, and
      // somebody checking their own product against this has nothing to check without it.
      sequence: made.sequence,
    })),
    settings: { ...plan.settings },
    note: plan.note,
    after: (after.get(plan.plan) ?? []).map((one) => numberOf.get(one)!).sort((a, b) => a - b),
  }));

  // What a lab has to have before it starts: everything used that no step here makes.
  const needs = new Map<string, MethodInput>();
  for (const step of steps) {
    for (const used of step.uses) {
      if (used.from !== undefined) continue;
      const key = used.part ?? `alive:${used.name}`;
      if (needs.has(key)) continue;
      const molecule = used.part === null ? undefined : moleculeOf(used.part);
      needs.set(key, { ...used, ...(molecule === undefined ? {} : molecule) });
    }
  }
  const made = new Set(steps.flatMap((one) => one.makes.map((each) => each.checksum)));
  const used = new Set(steps.flatMap((one) => one.uses.flatMap((each) => (each.part === null ? [] : [each.part]))));
  const ends = [...made].filter((checksum) => !used.has(checksum));

  const names = ends.map((checksum) => steps.flatMap((one) => one.makes).find((each) => each.checksum === checksum)!);
  return {
    bionet_method_version: METHOD_VERSION,
    lab,
    name: options.name?.trim() || options.project
      || names.map((one) => one.name).join(" and ")
      || `${steps.length} ${steps.length === 1 ? "step" : "steps"}`,
    makes: names.map((one) => ({ name: one.name, checksum: one.checksum })),
    needs: [...needs.values()],
    steps,
    note: options.note?.trim() || null,
    published_at: options.publishedAt ?? new Date().toISOString(),
  };
}

/**
 * Sign a method, or add a signature to one already signed.
 *
 * @param method - The method, or one already signed.
 * @param key - The key to sign with.
 * @param options - What to say about the signer.
 * @returns The method with the signature beside it.
 */
export async function signMethod(method: MethodDocument | SignedMethod, key: SigningKey,
                                 options: SignOptions = {}): Promise<SignedMethod> {
  const held = isSignedMethod(method) ? method.method : method;
  const already = isSignedMethod(method) ? method.signatures : [];
  return { method: held, signatures: [...already, await signUnder(METHOD_DOMAIN, held, key, options)] };
}

/**
 * Check every signature on a method.
 *
 * @param signed - The signed method.
 * @returns One check per signature, in the same order. Never throws over a bad one.
 */
export function verifyMethod(signed: SignedMethod): Promise<SignatureCheck[]> {
  return verifyUnder(METHOD_DOMAIN, signed.method, signed.signatures);
}

/** Whether something is shaped like a signed method. */
export function isSignedMethod(value: unknown): value is SignedMethod {
  const held = value as Partial<SignedMethod> | null;
  return typeof held === "object" && held !== null && typeof held.method === "object" && held.method !== null && Array.isArray(held.signatures);
}

const words = (value: unknown, most: number): boolean => typeof value === "string" && value.length <= most;
const whole = (value: unknown): boolean => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * Read a method somebody published, checking its shape before anything else looks at it.
 *
 * What arrives is a file from somewhere else, so this says plainly what is wrong when it is wrong
 * and believes nothing about whose it is: checking the signatures is `verifyMethod`'s, and deciding
 * whether to trust the key is the reader's.
 *
 * @param value - What arrived, parsed from JSON.
 * @returns The signed method.
 * @throws If it is not one, with what is wrong.
 *
 * @example
 * ```ts
 * import { readMethod, verifyMethod } from "@biolibs/bionet";
 *
 * const method = readMethod(JSON.parse(text));
 * (await verifyMethod(method)).every((one) => one.ok);
 * ```
 */
export function readMethod(value: unknown): SignedMethod {
  if (typeof value === "string") {
    if (value.length > LONGEST_METHOD) throw new Error("That method is longer than one is allowed to be.");
    try { value = JSON.parse(value); } catch { throw new Error("That is not a method: it is not JSON."); }
  }
  if (!isSignedMethod(value)) throw new Error("That is not a method: it has no method and signatures.");
  const method = value.method as Partial<MethodDocument>;
  if (method.bionet_method_version !== METHOD_VERSION) throw new Error(`That method says it is version ${String(method.bionet_method_version)}; this reads version ${METHOD_VERSION}.`);
  const lab = method.lab as Partial<LabModel> | undefined;
  if (typeof lab !== "object" || lab === null || !words(lab.name, 200) || !words(lab.origin, 2_000)) throw new Error("That method does not say which lab published it.");
  if (!words(method.name, 200) || method.name!.trim() === "") throw new Error("That method has no name.");
  if (!words(method.published_at, 40)) throw new Error("That method does not say when it was published.");
  if (!Array.isArray(method.steps) || method.steps.length === 0) throw new Error("That method has no steps.");
  if (method.steps.length > MOST_STEPS) throw new Error(`That method has ${method.steps.length} steps, which is more than one may carry.`);
  for (const [at, step] of (method.steps as Partial<MethodStep>[]).entries()) {
    if (step.step !== at + 1) throw new Error(`Its steps are not numbered from 1 in order: step ${at + 1} says it is ${String(step.step)}.`);
    if (!words(step.kind, 80) || !Array.isArray(step.uses) || !Array.isArray(step.makes) || !Array.isArray(step.after)) {
      throw new Error(`Step ${at + 1} does not say what kind of run it is, what it uses and what it makes.`);
    }
    for (const before of step.after as unknown[]) {
      // A step may only wait on one before it, or the order it claims is not an order.
      if (!whole(before) || (before as number) < 1 || (before as number) > at) throw new Error(`Step ${at + 1} says it comes after step ${String(before)}, which is not a step before it.`);
    }
    for (const used of step.uses as Partial<MethodInput>[]) {
      if (!(used.part === null || words(used.part, 120)) || !words(used.name, 200) || !whole(used.amount) || !words(used.role, 80)) {
        throw new Error(`Step ${at + 1} does not say properly what it uses.`);
      }
      if (used.from !== undefined && (!whole(used.from) || used.from < 1 || used.from > at)) {
        throw new Error(`Step ${at + 1} says something comes from step ${String(used.from)}, which is not a step before it.`);
      }
    }
  }
  if (!Array.isArray(method.needs) || !Array.isArray(method.makes)) throw new Error("That method does not say what it needs and what it makes.");
  return value;
}
