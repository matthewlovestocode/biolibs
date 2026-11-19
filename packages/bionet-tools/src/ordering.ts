/**
 * The order a lab's open proposals have to be carried out in, worked out from what each one makes
 * and what each one needs.
 *
 * A proposal is one run. Nothing in the log says that eleven of them are one piece of work, or which
 * comes first, and until now nothing read them as anything but eleven unrelated cards. But the order
 * is not missing from the data — it is simply never followed. A plan says what it `expects` to make,
 * each thing with the checksum that would be its identity; another plan says what it needs, and may
 * name a part there is no tube of yet by that same checksum. Where one plan expects what another
 * needs, the first has to happen first. That is a fact about the molecules, not a declaration
 * somebody made, and it is true whether or not anybody wrote it down.
 *
 * So this derives the order rather than adding a way to assert one. No new kind of entry, nothing an
 * older device has to understand, and no way for the stated order and the real one to disagree.
 *
 * **Where the chain stops, and why.** It stops at a transformation. What a transformation makes is
 * alive, so it has no checksum to point at: a strain is this lab's own, known by an ID, and the
 * culture that would be an induction's input does not exist until somebody has grown it. A plan
 * cannot name a tube that is not there. So the work up to and including putting a construct into a
 * host can be proposed as one chain, and what follows it has to be proposed afresh once there is
 * something growing. That is a real limit and it is said here rather than hidden: a plan that
 * claimed to run past it would be claiming to name something nothing can name yet.
 */
import type { ExpectationState, ItemState, PlanState, ProspectState } from "@biolibs/bionet";

/** As much of a lab as the ordering reads. */
export interface OrderingLab {
  plans: readonly PlanState[];
  items: readonly ItemState[];
  /** Things the lab means to have and has not made, so a chain can run on past a transformation. */
  prospects?: readonly ProspectState[];
  /** What the lab expects to see of its plans, so work can say what has been left pointing at nothing. */
  expectations?: readonly ExpectationState[];
}

/** Why a step cannot be carried out yet, or `null` if it can. */
export type Holding =
  | { why: "a step before it"; steps: string[] }
  | { why: "something nobody is making"; parts: string[] }
  | { why: "a tube that has run short"; tubes: string[] };

/** One step: a proposal, where it sits in the order, and what stands in its way. */
export interface Step {
  /** The proposal itself. */
  plan: PlanState;
  /** The plans that have to be carried out before it, by ID. */
  after: string[];
  /** How deep it is: 0 for a step with nothing before it. */
  depth: number;
  /** What stands in its way, or `null` if it could be done now. */
  held: Holding | null;
  /** The checksums it would make. */
  makes: string[];
}

/** The field a plan is filed under, unless a lab uses another word for it. */
export const FILED_UNDER = "project";

/** What a piece of work with no project is called. */
export const UNFILED = "Not filed";

/** One chain of steps that leads to one thing. */
export interface Thread {
  /** What to call it: what it ends by making. */
  name: string;
  /** Its steps, in an order that can be carried out. */
  steps: Step[];
  /** What it ends with: what it makes that nothing else in it consumes. */
  ends: { checksum: string; name: string }[];
  /** Whether every step of it could be carried out as things stand. */
  clear: boolean;
}

/** Everything on in one project. */
export interface Project {
  /** What it is called, as somebody filed it. */
  name: string;
  /** Whether anybody actually filed it, or it is the heap of what nobody did. */
  filed: boolean;
  /** Its chains. */
  threads: Thread[];
  /** Its steps, in one order that works. */
  order: Step[];
  /** The ones that could be carried out now. */
  ready: Step[];
}

/** The open proposals, read as work to be done. */
export interface PlanOfWork {
  /**
   * What is on, by project.
   *
   * A chain is not a project and cannot be: four caseins are four chains in one project, and two
   * unrelated projects are also chains. Which work belongs together is a thing people decide, so it
   * is filed rather than derived, and a plan nobody filed is in `Not filed` rather than silently
   * lumped in with somebody else's.
   */
  projects: Project[];
  /** The chains, each leading to one thing. A lab building four proteins has four. */
  threads: Thread[];
  /** Every open step, in one order that works. */
  order: Step[];
  /** The steps that could be carried out now. */
  ready: Step[];
  /** The steps that could not, and what each is waiting on. */
  held: Step[];
  /**
   * Plans that need something nothing makes and no tube holds: what has to be ordered or
   * synthesised before any of this can start, by checksum.
   */
  toGet: { checksum: string; name: string; forSteps: string[] }[];
  /**
   * Things somebody expected to see that are on steps now set aside. Refiling a plan makes a new
   * one, and what was expected of the old one does not follow it; nobody will answer these.
   */
  adrift: { expect: string; kind: string; says: string }[];
  /** Plans that somehow depend on each other in a circle, by ID. Empty, unless something is wrong. */
  tangled: string[];
}

/** Whether the lab holds a tube of a part that has anything in it. */
const holds = (lab: OrderingLab, checksum: string): boolean =>
  lab.items.some((one) => one.part === checksum && !one.retired && one.amount > 0);

/**
 * The open proposals, read as work: what order they go in, what can start now, what is waiting.
 *
 * @param lab - The lab, with its plans and its tubes.
 * @returns The work, in threads and in one order.
 *
 * @example
 * ```ts
 * import { planOfWork } from "@biolibs/bionet-tools";
 *
 * const work = planOfWork(lab);
 * work.ready.map((one) => one.plan.kind);    // what somebody could go and do now
 * work.toGet;                                // what has to be ordered before any of it
 * ```
 */
export function planOfWork(lab: OrderingLab): PlanOfWork {
  const open = lab.plans.filter((one) => one.settled === null);
  const byId = new Map(open.map((one) => [one.plan, one]));

  // What each open plan would make, and who would make each thing.
  const makers = new Map<string, string[]>();
  for (const plan of open) {
    for (const expected of plan.expects) makers.set(expected.checksum, [...(makers.get(expected.checksum) ?? []), plan.plan]);
    // And what it would bring into existence that has no checksum: a strain, a culture, a curd.
    // Named as a prospect, these join the chain the same way a molecule does, which is what lets it
    // carry on past a transformation instead of stopping there.
    for (const made of plan.makes ?? []) makers.set(made, [...(makers.get(made) ?? []), plan.plan]);
  }
  const nameOf = (checksum: string): string =>
    open.flatMap((one) => one.expects).find((one) => one.checksum === checksum)?.name ?? checksum.slice(0, 12);

  /** What each plan waits on, and what it needs that nothing is making. */
  const after = new Map<string, string[]>();
  const missing = new Map<string, string[]>();
  for (const plan of open) {
    const waits: string[] = [];
    const nowhere: string[] = [];
    for (const input of plan.inputs) {
      // A prospect is something nobody has made. If another plan would bring it into existence, this
      // one waits for that; if it has already been made, it is not waiting on anything any more.
      if (input.prospect !== undefined) {
        const already = (lab.prospects ?? []).find((one) => one.prospect === input.prospect)?.became ?? null;
        if (already !== null) continue;
        const made = (makers.get(input.prospect) ?? []).filter((one) => one !== plan.plan);
        if (made.length > 0) waits.push(...made);
        else nowhere.push(input.prospect);
        continue;
      }
      if (input.part === undefined) continue;
      // A plan names a part rather than a tube when there was no tube of it when it was proposed.
      // There may be one now, and that is a fact about the lab, not about the plan.
      if (holds(lab, input.part)) continue;
      const made = (makers.get(input.part) ?? []).filter((one) => one !== plan.plan);
      if (made.length > 0) waits.push(...made);
      else nowhere.push(input.part);
    }
    after.set(plan.plan, [...new Set(waits)]);
    missing.set(plan.plan, [...new Set(nowhere)]);
  }

  // The order: a step comes after everything it waits on. Kahn's algorithm, which also finds a
  // circle if the proposals somehow make one.
  const left = new Set(open.map((one) => one.plan));
  const depth = new Map<string, number>();
  const order: string[] = [];
  for (let guard = 0; left.size > 0 && guard <= open.length; guard += 1) {
    const free = [...left].filter((id) => (after.get(id) ?? []).every((before) => !left.has(before)));
    if (free.length === 0) break;
    // In the order they were proposed, so that two steps that could both go now keep their order.
    free.sort((a, b) => open.findIndex((one) => one.plan === a) - open.findIndex((one) => one.plan === b));
    for (const id of free) {
      depth.set(id, Math.max(0, ...(after.get(id) ?? []).map((before) => (depth.get(before) ?? 0) + 1)));
      order.push(id);
      left.delete(id);
    }
  }
  const tangled = [...left];

  const stepOf = (id: string): Step => {
    const plan = byId.get(id)!;
    const waits = (after.get(id) ?? []).filter((one) => byId.has(one));
    const nowhere = missing.get(id) ?? [];
    const held: Holding | null =
      waits.length > 0 ? { why: "a step before it", steps: waits }
      : nowhere.length > 0 ? { why: "something nobody is making", parts: nowhere }
      : plan.wanting.length > 0 ? { why: "a tube that has run short", tubes: [...plan.wanting] }
      : null;
    return { plan, after: waits, depth: depth.get(id) ?? 0, held, makes: plan.expects.map((one) => one.checksum) };
  };
  const steps = order.map(stepOf);
  const tangledSteps = tangled.map(stepOf);

  // A thread is a set of steps joined by what they make and need: a lab building four proteins has
  // four of them, and they are four separate pieces of work however they were proposed.
  const where = new Map<string, number>();
  const threads: Step[][] = [];
  const join = (id: string, into: number): void => {
    const was = where.get(id);
    if (was === into) return;
    if (was === undefined) { where.set(id, into); return; }
    // Two threads met, so they were one thread: everything in the older joins the newer.
    for (const [each, at] of where) if (at === was) where.set(each, into);
  };
  for (const step of steps) {
    const joined = [step.plan.plan, ...step.after].map((id) => where.get(id)).find((at) => at !== undefined);
    const at = joined ?? threads.push([]) - 1;
    join(step.plan.plan, at);
    for (const before of step.after) join(before, at);
  }
  for (const step of steps) threads[where.get(step.plan.plan)!]!.push(step);

  const made = new Set(steps.flatMap((one) => one.makes));
  const woven: Thread[] = threads.filter((one) => one.length > 0).map((one) => {
    const inside = new Set(one.flatMap((step) => step.makes));
    const needed = new Set(one.flatMap((step) => step.plan.inputs.flatMap((input) => (input.part === undefined ? [] : [input.part]))));
    // What it ends with is what it makes that nothing in it then uses.
    let ends = [...inside].filter((checksum) => !needed.has(checksum)).map((checksum) => ({ checksum, name: nameOf(checksum) }));
    // Unless there is no such thing, which happens whenever a chain finishes with a transformation:
    // every molecule it made went into the host, and what came out is alive and has no checksum to
    // be named by. The last thing that can be named is then what the chain is known by.
    if (ends.length === 0) {
      const last = [...one].reverse().find((step) => step.makes.length > 0);
      ends = (last?.makes ?? []).map((checksum) => ({ checksum, name: nameOf(checksum) }));
    }
    return {
      // A chain is known by what it is for, which is the last thing it makes.
      name: ends.map((each) => each.name).join(" and ") || `${one.length} ${one.length === 1 ? "step" : "steps"}`,
      steps: one, ends, clear: one.every((step) => step.held === null || step.held.why === "a step before it"),
    };
  });

  const toGet = new Map<string, string[]>();
  for (const step of [...steps, ...tangledSteps]) {
    for (const checksum of missing.get(step.plan.plan) ?? []) toGet.set(checksum, [...(toGet.get(checksum) ?? []), step.plan.plan]);
  }

  // Filed, not derived: which chains belong to one project is somebody's decision.
  const filedAs = (step: Step): string => {
    const said = step.plan.fields[FILED_UNDER];
    return typeof said === "string" && said.trim() !== "" ? said.trim() : UNFILED;
  };
  const byProject = new Map<string, Step[]>();
  for (const step of steps) byProject.set(filedAs(step), [...(byProject.get(filedAs(step)) ?? []), step]);
  const projects: Project[] = [...byProject].map(([name, own]) => ({
    name, filed: name !== UNFILED,
    // A chain belongs to a project if any of its steps was filed under it. A chain whose steps were
    // filed differently is shown under each, since the steps really are in both and saying
    // otherwise would hide work from one of them.
    threads: woven.filter((thread) => thread.steps.some((step) => filedAs(step) === name)),
    order: own, ready: own.filter((step) => step.held === null),
  // What nobody filed goes last: it is a heap, not a project.
  })).sort((a, b) => Number(a.name === UNFILED) - Number(b.name === UNFILED) || a.name.localeCompare(b.name));

  return {
    projects, threads: woven, order: steps,
    ready: steps.filter((one) => one.held === null),
    held: steps.filter((one) => one.held !== null),
    toGet: [...toGet].map(([checksum, forSteps]) => ({ checksum, name: made.has(checksum) ? nameOf(checksum) : checksum.slice(0, 12), forSteps })),
    adrift: (lab.expectations ?? []).filter((one) => one.adrift)
      .map((one) => ({ expect: one.expect, kind: one.kind, says: one.says })),
    tangled,
  };
}

/**
 * The work said in a sentence or two, for somebody who wants to know where things stand.
 *
 * @param work - What `planOfWork` gave.
 * @returns A line for each thing worth saying. Empty if nothing is proposed.
 *
 * @example
 * ```ts
 * import { planOfWork, saysWork } from "@biolibs/bionet-tools";
 *
 * saysWork(planOfWork(lab));
 * // ["Eleven steps are proposed, in four pieces of work.", "Three could be done now.", …]
 * ```
 */
export function saysWork(work: PlanOfWork): string[] {
  if (work.order.length === 0 && work.tangled.length === 0) return [];
  const count = (many: number, one: string, more: string): string => `${many} ${many === 1 ? one : more}`;
  const filed = work.projects.filter((one) => one.filed);
  const said: string[] = [
    `${count(work.order.length, "step is", "steps are")} proposed, in ${count(work.threads.length, "piece", "pieces")} of work`
      + (filed.length === 0 ? "." : `, across ${count(filed.length, "project", "projects")}: ${filed.map((one) => one.name).join(", ")}.`),
  ];
  const loose = work.projects.find((one) => !one.filed);
  if (loose !== undefined && filed.length > 0) {
    said.push(`${count(loose.order.length, "step is", "steps are")} filed under no project.`);
  }
  if (work.adrift.length > 0) {
    // Not a count of work, but of something somebody meant to look for and now nobody will: the step
    // it was written on has been set aside, most often by being refiled.
    said.push(`${count(work.adrift.length, "thing somebody expected to see is", "things somebody expected to see are")} on a step that was set aside, so nobody will answer ${work.adrift.length === 1 ? "it" : "them"}.`);
  }
  if (work.ready.length > 0) said.push(`${count(work.ready.length, "step", "steps")} could be carried out now.`);
  else if (work.order.length > 0) said.push("Nothing can be carried out yet.");
  const waiting = work.held.filter((one) => one.held?.why === "a step before it").length;
  if (waiting > 0) said.push(`${count(waiting, "step is", "steps are")} waiting on a step before it.`);
  if (work.toGet.length > 0) {
    said.push(`${count(work.toGet.length, "part has", "parts have")} to be ordered or made first: nothing proposed makes ${work.toGet.length === 1 ? "it" : "them"}, and there is no tube.`);
  }
  const short = work.held.filter((one) => one.held?.why === "a tube that has run short").length;
  if (short > 0) said.push(`${count(short, "step counts", "steps count")} on a tube that has been retired or run short.`);
  if (work.tangled.length > 0) said.push(`${count(work.tangled.length, "step", "steps")} depend on each other in a circle and cannot be ordered.`);
  return said;
}
