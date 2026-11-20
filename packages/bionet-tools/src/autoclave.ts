/**
 * Sterilising something, which everything that goes into a lab does on the way in and everything
 * alive does on the way out.
 *
 * An autoclave is a pressure vessel that holds steam at 121 °C. Steam at that temperature kills
 * everything, including the spores that boiling does not, and it does it at a rate that is known:
 * the number of survivors falls by a factor of ten every minute and a half, and ten degrees either
 * way multiplies or divides that rate by ten. So a cycle is not a length of time. It is an amount
 * of killing, and the arithmetic that turns one into the other is this.
 *
 * Two things the autoclave cannot tell you.
 *
 * It cannot tell you what temperature your load reached. The gauge is on the chamber, and the
 * chamber is steam; the middle of a litre of agar is a long way behind it and takes twenty minutes
 * or more to arrive. A cycle timed from when the chamber reached temperature gives a small flask
 * everything it needs and a large bottle a fraction of it, and both come out with the same tape on
 * them. This is why a liquid cycle is long and why the load, not the chamber, is what the time is
 * for.
 *
 * And it cannot tell you whether what came out is sterile. Autoclave tape turns black above about
 * 110 °C in seconds; it says "this has been in an autoclave" and nothing else. The only thing that
 * says the load was sterilised is something that dies at the same rate the spores do, which is a
 * vial of spores run through with it.
 */

/** How many degrees change the killing rate tenfold, for moist heat. */
export const Z = 10;

/** The temperature everything is counted against, in degrees Celsius. */
export const REFERENCE = 121.1;

/**
 * How many minutes at the reference temperature a load needs before it is called sterile.
 *
 * Twelve, because twelve is the number of tenfold reductions that takes a million spores to one
 * chance in a million, and a spore's decimal reduction time at this temperature is about a minute.
 *
 * It cannot be fifteen, which was the first thing written here. A lab's 121 °C is a tenth of a
 * degree under the reference, so fifteen minutes at it comes to 14.7 and the standard cycle would
 * have been marked as failing — the tool crying wolf over the one cycle that is run every day.
 */
export const STERILE = 12;

/**
 * How long the chamber takes to come up to temperature, in minutes.
 *
 * It matters because the load is warming the whole time it is happening — a box of tips is at
 * temperature before the hold even starts, and a litre of medium is nowhere near. Leaving the
 * come-up out made small loads look unsterilised, which is both wrong and the opposite of the
 * mistake this is for.
 */
export const COMING_UP = 10;

/** Something put through a cycle. */
export interface Load {
  /** What it is. */
  name: string;
  /** Whether it is liquid, which decides how the pressure comes off at the end. */
  liquid: boolean;
  /**
   * How long the middle of it takes to close most of the gap to the chamber, in minutes.
   *
   * Each is set from how long that load is known to take to arrive rather than guessed: a box of
   * tips is within a degree in about five minutes, a litre of medium in about twenty-eight. It is
   * the same lag as a tube in a water bath, and for the same reason.
   */
  constant: number;
  /** What it is for, and what goes wrong with it. */
  what: string;
}

/** What this bench puts through an autoclave. */
export const LOADS: readonly Load[] = [
  { name: "Tips, tubes, empty glass", liquid: false, constant: 1,
    what: "Dry goods, loosely packed so the steam reaches them. A sealed box comes out with dry air inside it and nothing sterilised." },
  { name: "Medium, 250 mL bottle", liquid: true, constant: 3,
    what: "Loosen the cap. A tight cap is a pressure vessel inside a pressure vessel, and it comes off on the way out." },
  { name: "Medium, 1 L bottle", liquid: true, constant: 6,
    what: "The one most often under-sterilised: the middle of a litre is twenty minutes behind the chamber, and a cycle timed on the chamber gives it a fraction of what it needs." },
  { name: "Agar, 1 L bottle", liquid: true, constant: 7,
    what: "Comes out molten and stays molten to about 50 °C. Longer than it needs browns the sugars and the plates come out amber." },
  { name: "Waste, a full bag", liquid: false, constant: 10,
    what: "Loosely closed and slit, or the steam never gets in and the middle of the bag leaves the lab alive. The longest cycle of the lot." },
];

/** A cycle an autoclave can be set to. */
export interface Cycle {
  /** What it is called. */
  name: string;
  /** What the chamber is held at, in degrees Celsius. */
  celsius: number;
  /** How long it is held for, in minutes. */
  minutes: number;
  /** Whether the pressure comes off slowly, which liquids need and dry goods do not. */
  slow: boolean;
}

/** The cycles on this machine. */
export const CYCLES: readonly Cycle[] = [
  { name: "Dry goods, 121 °C for 15 min", celsius: 121, minutes: 15, slow: false },
  { name: "Liquids, 121 °C for 20 min", celsius: 121, minutes: 20, slow: true },
  { name: "Liquids, 121 °C for 30 min", celsius: 121, minutes: 30, slow: true },
  { name: "Waste, 121 °C for 45 min", celsius: 121, minutes: 45, slow: false },
  { name: "Quick, 134 °C for 5 min", celsius: 134, minutes: 5, slow: false },
];

/**
 * How fast things are dying at a temperature, against the rate at 121.1 °C.
 *
 * Ten degrees hotter kills ten times as fast; ten degrees cooler, a tenth as fast. That one line is
 * what makes a cycle's length and its temperature the same question.
 *
 * @param celsius - The temperature.
 * @returns The rate, where 1 is the rate at the reference temperature.
 *
 * @example
 * ```ts
 * import { killing } from "@biolibs/bionet-tools";
 *
 * Math.round(killing(111.1) * 1000) / 1000;    // 0.1: ten degrees cooler, a tenth the rate
 * ```
 */
export function killing(celsius: number): number {
  return 10 ** ((celsius - REFERENCE) / Z);
}

/**
 * How warm the middle of a load is, after a while at temperature.
 *
 * @param chamber - What the chamber is at.
 * @param from - What the load went in at.
 * @param minutes - How long the chamber has been at temperature.
 * @param load - What is in there.
 * @returns The temperature in the middle of the load.
 *
 * @example
 * ```ts
 * import { LOADS, middleOf } from "@biolibs/bionet-tools";
 *
 * Math.round(middleOf(121, 20, 14, LOADS[2]!));    // 84: a litre is a long way behind
 * ```
 */
export function middleOf(chamber: number, from: number, minutes: number, load: Load): number {
  if (minutes <= 0 || load.constant <= 0) return from;
  return chamber - (chamber - from) * Math.exp(-minutes / load.constant);
}

/** What a cycle did to a load. */
export interface Sterilising {
  /** The minutes at the reference temperature the load actually got. */
  f0: number;
  /** The highest the middle of it reached, in degrees Celsius. */
  reached: number;
  /** How long it took the middle to come within a degree of the chamber, in minutes. */
  arriving: number;
  /** Whether that is enough to call it sterile. */
  sterile: boolean;
  /** How long the cycle would have to be held for, to be. */
  needs: number;
  /** What to do about it, said plainly. */
  says: string;
}

/**
 * What a cycle actually did, counting the warming up as the partial killing it is.
 *
 * The time the middle of a load spends on its way to 121 °C is not wasted — it is killing, just
 * more slowly, and a tenth as fast ten degrees down. So the honest figure is the killing added up
 * over the whole cycle rather than the minutes at the end of it, and that is what F₀ is. The
 * come-up counts for the same reason: a small load is at temperature before the hold begins.
 *
 * @param cycle - The cycle.
 * @param load - What is in there.
 * @param from - What the load went in at. Defaults to a warm room.
 * @param steps - How finely to add it up over the whole cycle. Defaults to a step a second.
 * @returns What the cycle came to.
 *
 * @example
 * ```ts
 * import { CYCLES, LOADS, sterilising } from "@biolibs/bionet-tools";
 *
 * sterilising(CYCLES[1]!, LOADS[0]!).sterile;    // true: tips in a twenty-minute cycle
 * ```
 */
export function sterilising(cycle: Cycle, load: Load, from = 20, steps = 0): Sterilising {
  const whole = COMING_UP + cycle.minutes;
  const every = steps > 0 ? whole / steps : 1 / 60;
  // The chamber climbs over the come-up and then holds; the load follows it with its own lag, so
  // both are walked forward together rather than worked out in closed form.
  let load_ = from;
  let f0 = 0;
  let arriving: number | null = null;
  for (let at = 0; at < whole; at += every) {
    const chamber = at >= COMING_UP ? cycle.celsius : from + (cycle.celsius - from) * (at / COMING_UP);
    load_ += ((chamber - load_) / load.constant) * every;
    f0 += killing(load_) * every;
    if (arriving === null && cycle.celsius - load_ <= 1) arriving = at;
  }
  const reached = load_;
  const sterile = f0 >= STERILE;
  // What the hold would have to be: the killing it is short by, at the rate it ends up running at.
  const rate = killing(reached);
  const needs = sterile ? cycle.minutes : cycle.minutes + (STERILE - f0) / Math.max(rate, 1e-6);
  // What went wrong is when the load arrived, not where it ended up: a litre that reaches 119 °C
  // with two minutes of the hold left has been at temperature for two minutes, however good the
  // last reading looks. Keying this off the final temperature said nothing about either.
  const late = (arriving ?? whole) - COMING_UP > cycle.minutes / 2;
  const says = sterile
    ? `F₀ of ${f0.toFixed(1)} min, past the ${STERILE} this needs. The middle of it reached ${reached.toFixed(0)} °C.`
    : late
      ? `F₀ of ${f0.toFixed(1)} min, against the ${STERILE} this needs: the chamber was at temperature and the load was not, for most of the cycle. Hold it for about ${Math.round(needs)} min, or split it into smaller vessels.`
      : `F₀ of ${f0.toFixed(1)} min, against the ${STERILE} this needs. Hold it for about ${Math.round(needs)} min.`;
  return { f0, reached, arriving: arriving ?? whole, sterile, needs, says };
}

/** What a cycle got wrong, apart from the killing. */
export interface Trouble {
  /** What is wrong. */
  says: string;
  /** Whether it makes the cycle useless rather than merely untidy. */
  ruins: boolean;
}

/**
 * What else is wrong with running this load on this cycle.
 *
 * None of it is about temperature. A liquid on a fast exhaust boils over as the pressure drops; a
 * sealed vessel does not let steam in and does not sterilise; and dry goods on a slow exhaust are
 * only slow.
 *
 * @param cycle - The cycle.
 * @param load - What is in there.
 * @returns What is wrong, in the order it matters.
 *
 * @example
 * ```ts
 * import { CYCLES, LOADS, trouble } from "@biolibs/bionet-tools";
 *
 * trouble(CYCLES[0]!, LOADS[2]!)[0]!.ruins;    // true: a litre of medium on a fast exhaust
 * ```
 */
export function trouble(cycle: Cycle, load: Load): Trouble[] {
  const found: Trouble[] = [];
  if (load.liquid && !cycle.slow) {
    found.push({ ruins: true, says: "A liquid on a fast exhaust boils as the pressure drops: the bottle comes out half empty, the shelf is covered, and what is left is not what the label says. Liquids need the pressure brought off slowly." });
  }
  if (!load.liquid && cycle.slow) {
    found.push({ ruins: false, says: "Dry goods do not need a slow exhaust. It does no harm beyond the half hour it adds." });
  }
  if (cycle.celsius >= 130 && load.liquid) {
    found.push({ ruins: true, says: "134 °C is for instruments, not for medium. Sugars caramelise and the medium comes out brown and no longer what it was." });
  }
  return found;
}
