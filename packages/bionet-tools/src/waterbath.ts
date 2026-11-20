/**
 * Holding something at a temperature, which is most of what a protocol's timings are about.
 *
 * A water bath is a tank of water with a heater and a thermostat. It is the simplest machine on the
 * bench and it is in the middle of the two steps that fail most often: the heat shock that gets a
 * plasmid into chemically competent cells, and the heat that stops an enzyme once it has done its
 * work.
 *
 * Two things the bath cannot tell you.
 *
 * It cannot tell you what temperature the tube is. The thermostat holds the water; the contents of
 * a tube lag behind it, and how far behind depends on the vessel and how much is in it. For a heat
 * shock that matters more than anywhere else, because the whole step is forty-five seconds long: a
 * tube that takes fifteen of them to arrive has spent a third of the shock warming up. The usual
 * failure is not the bath being wrong, it is the shock being shorter than it reads.
 *
 * And it cannot tell you what is in the water. It is the warmest, wettest thing in the lab, held at
 * a temperature chosen for growing things, and nothing about it is sterile. A tube pushed under the
 * water line comes out with the bath on its cap and goes into the culture with it.
 */

/** A vessel something is heated in, and how fast what is in it follows the bath. */
export interface Vessel {
  /** What it is called. */
  name: string;
  /** How much is usually in it, in millilitres. */
  millilitres: number;
  /**
   * How long it takes to close most of the gap to the bath, in seconds.
   *
   * It is the time constant of a thing warming up: after one of them the gap is down to a bit over
   * a third, after two to an eighth, after three to a twentieth. Thin walls and a small volume make
   * it short; a thick-walled bottle of medium makes it long.
   */
  constant: number;
}

/** The vessels this bench puts in a bath. */
export const VESSELS: readonly Vessel[] = [
  { name: "Microfuge tube, 100 µL in it", millilitres: 0.1, constant: 4 },
  { name: "Microfuge tube, 1 mL in it", millilitres: 1, constant: 12 },
  { name: "Conical, 5 mL in it", millilitres: 5, constant: 45 },
  { name: "Conical, 25 mL in it", millilitres: 25, constant: 120 },
  { name: "Bottle, 200 mL in it", millilitres: 200, constant: 600 },
];

/** Something a bath is used for. */
export interface Soak {
  /** What it is. */
  what: string;
  /** What the bath is set to, in degrees Celsius. */
  celsius: number;
  /** How long it is held for, in seconds. */
  seconds: number;
  /** How much either way still works, in seconds, or `null` where longer does no harm. */
  within: number | null;
  /** Why the timing is what it is. */
  why: string;
}

/** What this bench does in a bath. */
export const SOAKS: readonly Soak[] = [
  { what: "Heat shock, chemically competent cells", celsius: 42, seconds: 45, within: 15,
    why: "The shock opens the membrane long enough for the plasmid to go in. Too short and nothing goes in; too long and the cells die of it, and both look the same the next morning — an empty plate." },
  { what: "Heat inactivation, a restriction enzyme", celsius: 65, seconds: 1200, within: null,
    why: "Most enzymes are dead in twenty minutes at 65 °C, which stops a digest without a column. Some are not killed by heat at all, and for those this step does nothing and the enzyme carries on into the ligation." },
  { what: "Heat inactivation, a ligase", celsius: 65, seconds: 600, within: null,
    why: "Ten minutes is enough, and it matters before a transformation because a ligase left working will keep cutting and joining in the tube." },
  { what: "Melting agarose that has set", celsius: 65, seconds: 1800, within: null,
    why: "Agarose that has set in the bottle melts again, slowly and without boiling over, which a microwave does not do." },
  { what: "Thawing competent cells", celsius: 4, seconds: 600, within: null,
    why: "On ice, not in a bath — this is here to say so. Competent cells thawed warm are not competent, and nothing about the tube shows it." },
];

/**
 * How warm something is after a while in the bath.
 *
 * A thing warming up closes the gap to its surroundings by the same fraction every time constant,
 * which is the usual exponential approach rather than anything about biology.
 *
 * @param bath - What the bath is set to, in degrees Celsius.
 * @param from - What the tube was at going in, in degrees Celsius.
 * @param seconds - How long it has been in.
 * @param vessel - What it is in.
 * @returns The temperature of the contents, in degrees Celsius.
 *
 * @example
 * ```ts
 * import { VESSELS, warmth } from "@biolibs/bionet-tools";
 *
 * Math.round(warmth(42, 0, 4, VESSELS[0]!));    // 27: one time constant, most of the way
 * ```
 */
export function warmth(bath: number, from: number, seconds: number, vessel: Vessel): number {
  if (seconds <= 0 || vessel.constant <= 0) return from;
  return bath - (bath - from) * Math.exp(-seconds / vessel.constant);
}

/**
 * How long until the contents are as warm as they are going to get.
 *
 * @param bath - What the bath is set to.
 * @param from - What the tube was at going in.
 * @param vessel - What it is in.
 * @param within - How close counts as arrived, in degrees. Defaults to one.
 * @returns The time, in seconds.
 *
 * @example
 * ```ts
 * import { VESSELS, arrives } from "@biolibs/bionet-tools";
 *
 * Math.round(arrives(42, 0, VESSELS[0]!));    // 15
 * ```
 */
export function arrives(bath: number, from: number, vessel: Vessel, within = 1): number {
  const gap = Math.abs(bath - from);
  if (gap <= within || within <= 0) return 0;
  return vessel.constant * Math.log(gap / within);
}

/** What a soak actually gave the tube. */
export interface Held {
  /** How long the tube was in, in seconds. */
  seconds: number;
  /** How long it took to arrive, in seconds. */
  arriving: number;
  /** How long it was actually at the temperature, in seconds. */
  held: number;
  /** What fraction of the time in the bath was spent warming up. */
  warming: number;
  /** Whether what it got is what the step asks for. */
  enough: boolean;
  /** What to do about it, said plainly. */
  says: string;
}

/**
 * What a tube in the bath for a given time actually got.
 *
 * This is the whole of the first thing the bath cannot tell you. For a twenty-minute inactivation
 * the lag is nothing; for a forty-five second heat shock in a conical it is most of the step.
 *
 * @param soak - What is being done.
 * @param seconds - How long the tube is in for.
 * @param vessel - What it is in.
 * @param from - What it was at going in. Defaults to ice.
 * @returns What it got.
 *
 * @example
 * ```ts
 * import { SOAKS, VESSELS, holding } from "@biolibs/bionet-tools";
 *
 * holding(SOAKS[0]!, 45, VESSELS[0]!).enough;    // true
 * ```
 */
export function holding(soak: Soak, seconds: number, vessel: Vessel, from = 0): Held {
  const arriving = Math.min(seconds, arrives(soak.celsius, from, vessel));
  const held = Math.max(0, seconds - arriving);
  const warming = seconds <= 0 ? 1 : arriving / seconds;
  const wanted = soak.seconds;
  const slack = soak.within;
  const enough = slack === null ? held >= wanted : Math.abs(held - wanted) <= slack;
  const says = slack === null
    ? held >= wanted
      ? `${Math.round(held)} s at ${soak.celsius} °C, which is the ${Math.round(wanted)} s this needs.`
      : `Only ${Math.round(held)} s at ${soak.celsius} °C of the ${Math.round(wanted)} s this needs: ${Math.round(arriving)} s of the ${Math.round(seconds)} went on warming up.`
    : held < wanted - slack
      ? `${Math.round(held)} s at ${soak.celsius} °C, against ${wanted} s. ${Math.round(arriving)} s went on the tube reaching the bath, so the shock is shorter than the timer says — leave it in ${Math.round(wanted + arriving - seconds)} s longer.`
      : held > wanted + slack
        ? `${Math.round(held)} s at ${soak.celsius} °C, against ${wanted} s. Past about ${wanted + slack} s the cells start dying of the shock rather than taking up the plasmid.`
        // Inside the window, which is not the same as being the time asked for: saying "30 s,
        // which is the 45 s this wants" is the tool telling the same lie the timer does.
        : `${Math.round(held)} s at ${soak.celsius} °C, inside the ${wanted - slack}–${wanted + slack} s this works over${arriving < 1 ? "" : `, after ${Math.round(arriving)} s warming up`}.`;
  return { seconds, arriving, held, warming, enough, says };
}

/**
 * How long to leave something in, so that it gets the time the step asks for.
 *
 * @param soak - What is being done.
 * @param vessel - What it is in.
 * @param from - What it was at going in. Defaults to ice.
 * @returns The time on the timer, in seconds.
 *
 * @example
 * ```ts
 * import { SOAKS, VESSELS, leaveFor } from "@biolibs/bionet-tools";
 *
 * Math.round(leaveFor(SOAKS[0]!, VESSELS[0]!));    // 60: forty-five seconds plus the warming up
 * ```
 */
export function leaveFor(soak: Soak, vessel: Vessel, from = 0): number {
  return soak.seconds + arrives(soak.celsius, from, vessel);
}
