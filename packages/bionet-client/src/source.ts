/**
 * The narrow way a window reaches a lab.
 *
 * A window does not always share a process with the lab it shows. In a desktop app the lab lives
 * where the key and the files are, and the window is deliberately given neither. So anything that
 * draws a lab asks for it through this: the lab as plain data, to be told when it changes, and one
 * of a fixed list of things to be done. A `Lab` is one of these directly (`sourceOf`), and so is a
 * bridge to a lab somewhere else.
 */
import type { Lab, LabSnapshot } from "./lab.js";

/** Everything a window may ask a lab to do. Nothing outside this list can be asked for. */
export const ACTIONS = ["setPerson", "found", "join", "setPeer", "setOrigin", "addMember", "addPart", "addItem",
                        "adjust", "recount", "retire", "offer", "setField", "publish", "backUp", "restore",
                        "addPlace", "movePlace", "standPlace", "retirePlace", "putItem", "recordRun", "exportLab", "importLab", "annotatePart"] as const;

/** One thing a window may ask for. */
export type Action = (typeof ACTIONS)[number];

/** How asking went: what came back, or why it could not be done, said for a person. */
export type Answer = { ok: true; result: unknown } | { ok: false; error: string };

/** A lab, as a window reaches it. */
export interface LabSource {
  /** Be told when the lab changes. Returns a function that stops the telling. */
  subscribe(listener: () => void): () => void;
  /** The lab as it stands, or `null` while it is still being opened. The same object until it changes. */
  snapshot(): LabSnapshot | null;
  /** Ask for one thing to be done. It never throws: a refusal comes back as an answer. */
  act(action: Action, payload?: unknown): Promise<Answer>;
}

/**
 * Do one of the things a window may ask for.
 *
 * This is the door between a window and a lab, and it is deliberately the only one: an action that
 * is not on the list is refused whatever it is called, so a window that has been tricked can still
 * only do what a person at it could.
 *
 * @param lab - The lab.
 * @param action - What to do.
 * @param payload - What to do it with.
 * @returns What came back, or why it could not be done.
 */
export async function perform(lab: Lab, action: string, payload?: unknown): Promise<Answer> {
  if (!(ACTIONS as readonly string[]).includes(action)) return { ok: false, error: "That is not something this app does." };
  try {
    const method = (lab as unknown as Record<string, (given?: unknown) => Promise<unknown>>)[action]!;
    return { ok: true, result: await method.call(lab, payload) };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

/**
 * A lab in this process, as a window reaches it.
 *
 * @param lab - The lab, opened.
 * @returns The source.
 */
export function sourceOf(lab: Lab): LabSource {
  return { subscribe: lab.subscribe, snapshot: lab.snapshot, act: (action, payload) => perform(lab, action, payload) };
}
