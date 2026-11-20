/**
 * Working in a biosafety cabinet, which is the only machine in the lab that protects a person.
 *
 * A Class II cabinet pulls room air in through the gap under the sash and down through a grille, so
 * that nothing from the room crosses into the work and nothing from the work crosses out. Over the
 * work surface it blows filtered air straight down. Those two streams together are why the same
 * box protects three different things at once: what you are doing, you, and the room.
 *
 * The air curtain is the whole machine. Everything here is about whether it is still there.
 *
 * Two things the cabinet cannot tell you.
 *
 * It cannot tell you how fast the air is moving. The blower delivers roughly the same volume
 * whatever the sash is doing, so the speed through the opening is that volume divided by the gap:
 * open the sash to twice its marked height and the inflow halves. Below about four fifths of what
 * it was certified at, the curtain stops holding and room air walks in over the work — and nothing
 * about the cabinet looks or sounds any different. The only thing that measures it is a meter, once
 * a year.
 *
 * And it cannot tell you whether what you put in it was clean. It protects the work from the room.
 * It does nothing about the bottle you carried in, your gloves, or your sleeve passing over an open
 * plate — and most of what goes wrong in a cabinet came in with the person using it.
 */

/** A cabinet the lab might have. */
export interface Cabinet {
  /** What it is called. */
  name: string;
  /** How wide the opening is, in metres. */
  width: number;
  /** The sash height it was certified at, in metres. */
  sash: number;
  /** The inflow velocity at that height, in metres a second. */
  inflow: number;
  /** How fast the filtered air comes down over the work, in metres a second. */
  downflow: number;
}

/** The cabinets this bench knows. */
export const CABINETS: readonly Cabinet[] = [
  { name: "Class II A2, 1.2 m", width: 1.2, sash: 0.2, inflow: 0.5, downflow: 0.32 },
  { name: "Class II A2, 1.8 m", width: 1.8, sash: 0.2, inflow: 0.5, downflow: 0.32 },
];

/**
 * The fraction of the certified inflow below which the curtain stops holding.
 *
 * Four fifths: a cabinet certified at half a metre a second is doing its job down to about 0.4, and
 * below that room air starts coming over the work rather than under it.
 */
export const HOLDS_ABOVE = 0.8;

/** How long to let a cabinet run before working in it and after finishing, in minutes. */
export const PURGE = 5;

/** Where something sits on the work surface. */
export type Where = "front grille" | "work zone" | "rear grille";

/** Something that gets put in the cabinet. */
export interface Thing {
  /** What it is. */
  name: string;
  /** Where it has been put. */
  where: Where;
  /** Whether it is the thing being kept sterile, rather than something being worked with. */
  open: boolean;
}

/**
 * How fast air comes in through the opening, at a sash height.
 *
 * The blower moves about the same volume whatever the sash does, so the speed is that volume over
 * the area of the gap. It is the one piece of arithmetic in the machine and it is not written on it.
 *
 * @param cabinet - The cabinet.
 * @param sash - How high the sash is, in metres.
 * @returns The inflow velocity, in metres a second.
 *
 * @example
 * ```ts
 * import { CABINETS, inflowAt } from "@biolibs/bionet-tools";
 *
 * inflowAt(CABINETS[0]!, 0.4);    // 0.25: twice the height, half the speed
 * ```
 */
export function inflowAt(cabinet: Cabinet, sash: number): number {
  if (sash <= 0) return Infinity;
  return (cabinet.inflow * cabinet.sash) / sash;
}

/**
 * The sash height that gives a velocity.
 *
 * @param cabinet - The cabinet.
 * @param velocity - The inflow wanted, in metres a second.
 * @returns The height, in metres.
 *
 * @example
 * ```ts
 * import { CABINETS, sashFor } from "@biolibs/bionet-tools";
 *
 * sashFor(CABINETS[0]!, 0.4);    // 0.25
 * ```
 */
export function sashFor(cabinet: Cabinet, velocity: number): number {
  if (velocity <= 0) return Infinity;
  return (cabinet.inflow * cabinet.sash) / velocity;
}

/** What the curtain is doing at a sash height. */
export interface Curtain {
  /** How fast air is coming in, in metres a second. */
  inflow: number;
  /** That, as a fraction of what it was certified at. */
  of: number;
  /** Whether the curtain is still doing its job. */
  holds: boolean;
  /** How high the sash can go and still hold, in metres. */
  most: number;
  /** What is happening, said plainly. */
  says: string;
}

/**
 * Whether the air curtain holds, at a sash height.
 *
 * @param cabinet - The cabinet.
 * @param sash - How high the sash is, in metres.
 * @returns What the curtain is doing.
 *
 * @example
 * ```ts
 * import { CABINETS, curtain } from "@biolibs/bionet-tools";
 *
 * curtain(CABINETS[0]!, 0.3).holds;    // false
 * ```
 */
export function curtain(cabinet: Cabinet, sash: number): Curtain {
  const inflow = inflowAt(cabinet, sash);
  const of = inflow / cabinet.inflow;
  const holds = of >= HOLDS_ABOVE;
  const most = sashFor(cabinet, cabinet.inflow * HOLDS_ABOVE);
  const says = sash <= cabinet.sash
    ? `${inflow.toFixed(2)} m/s coming in, at or under the ${cabinet.sash} m this was certified at.`
    : holds
      ? `${inflow.toFixed(2)} m/s coming in, ${Math.round(of * 100)}% of what it was certified at. Still holding, but the sash is above its mark.`
      : `${inflow.toFixed(2)} m/s coming in, ${Math.round(of * 100)}% of what it was certified at. The curtain does not hold below ${Math.round(HOLDS_ABOVE * 100)}%: room air is coming over the work, and you are standing in what comes back out. Bring the sash down to ${most.toFixed(2)} m.`;
  return { inflow, of, holds, most, says };
}

/** Something wrong with how the cabinet is being used. */
export interface Wrong {
  /** What is wrong. */
  says: string;
  /** Whether it stops the cabinet doing its job, rather than making it work harder. */
  breaks: boolean;
}

/**
 * What is wrong with what has been put in the cabinet.
 *
 * None of it is about the machine. The grilles are the air's way in and out, and something sitting
 * on one is a hole in the curtain whatever the sash is doing.
 *
 * @param things - What is on the work surface.
 * @returns What is wrong, worst first.
 *
 * @example
 * ```ts
 * import { onTheDeck } from "@biolibs/bionet-tools";
 *
 * onTheDeck([{ name: "Rack", where: "front grille", open: false }])[0]!.breaks;    // true
 * ```
 */
export function onTheDeck(things: readonly Thing[]): Wrong[] {
  const found: Wrong[] = [];
  const front = things.filter((one) => one.where === "front grille");
  const rear = things.filter((one) => one.where === "rear grille");
  if (front.length > 0) {
    found.push({ breaks: true, says: `${front.map((one) => one.name).join(", ")} on the front grille. That grille is where the room air goes down, and anything standing on it sends that air over the work instead of under it. It is the commonest way a cabinet is made useless while it is running.` });
  }
  if (rear.length > 0) {
    found.push({ breaks: true, says: `${rear.map((one) => one.name).join(", ")} on the rear grille. The downflow leaves through it; blocked, the air rolls forward over the work and out at you.` });
  }
  const open = things.filter((one) => one.open && one.where === "work zone");
  if (open.length > 1) {
    found.push({ breaks: false, says: `${open.length} open things in the work zone. Each is only protected by air coming straight down on it, so nothing should pass over one — which is harder the more of them there are.` });
  }
  return found;
}
