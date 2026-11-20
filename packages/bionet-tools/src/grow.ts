/**
 * A plate in an incubator: how long to leave it, and what is on it when you come back.
 *
 * An incubator holds one temperature and shows that temperature. Everything else about it is time,
 * and time is the one thing none of the other machines on this bench model: a PCR is over in an
 * hour whatever you do, and a plate is ready when it is ready.
 *
 * What is worth working out is how long that is, because "overnight" and "two days" are not
 * conventions — they fall out of the doubling time. A colony you can see is about a hundred million
 * cells, which is twenty-seven doublings from one. Twenty-seven lots of twenty minutes is nine
 * hours, which is why E. coli is left overnight; twenty-seven lots of two hours is two and a half
 * days, which is why Pichia is not.
 *
 * And two things about what is on the plate afterwards are not what they look like.
 *
 * A colony is a clone — every cell in it came from one cell — which is the whole reason for
 * plating. Once colonies touch, the one you pick is not one colony, and nothing about it looks
 * different.
 *
 * On ampicillin, the cells that grow destroy the drug around themselves, because the resistance is
 * an enzyme they secrete. Leave the plate long enough and untransformed cells grow in the cleared
 * ring as small satellite colonies. They are not transformants. On kanamycin, chloramphenicol or
 * zeocin the resistance stays inside the cell, nothing is cleared, and there are no satellites.
 */

/** How many cells are in a colony you can see with your eye. */
export const VISIBLE_CELLS = 1e8;

/** How long a cell takes to start growing after being plated, in hours. */
export const LAG_HOURS = 1;

/** How much longer than it takes to see them a plate can be left before they run together. */
export const OVERGROWN_AT = 2.5;

/** A host a lab grows, and how fast. */
export interface Host {
  /** The pattern that matches how a lab writes it. */
  matches: RegExp;
  /** The organism, as this names it. */
  name: string;
  /** How long it takes to double at its best temperature, in minutes. */
  doubling: number;
  /** That temperature, in degrees Celsius. */
  best: number;
  /** The coldest it is worth growing at. Below this it is still growing, just not usefully. */
  coldest: number;
}

/**
 * The hosts this lab grows.
 *
 * The doubling times are in rich medium at the temperature beside them. A lab's own strain, in its
 * own medium, carrying something it is being made to express, will be slower than this — often much
 * slower, which is the point of knowing what the figure is for.
 */
export const HOSTS: readonly Host[] = [
  { matches: /escherichia|e\.? ?coli/i, name: "Escherichia coli", doubling: 20, best: 37, coldest: 18 },
  { matches: /komagataella|pichia/i, name: "Komagataella phaffii", doubling: 120, best: 30, coldest: 18 },
  { matches: /saccharomyces|cerevisiae/i, name: "Saccharomyces cerevisiae", doubling: 90, best: 30, coldest: 18 },
  { matches: /bacillus/i, name: "Bacillus subtilis", doubling: 25, best: 37, coldest: 20 },
];

/** Something a plate selects on, and what it does to what grows. */
export interface Selection {
  /** What it is called. */
  name: string;
  /** Whether the resistance is an enzyme the cell lets out, which clears the drug round a colony. */
  cleared: boolean;
  /** What it is worth knowing about it. */
  note: string;
}

/** What a plate is usually selected on. */
export const SELECTIONS: readonly Selection[] = [
  { name: "Ampicillin", cleared: true,
    note: "The resistance is a β-lactamase the cell secretes, so a colony destroys the ampicillin around itself. "
      + "Left long enough, untransformed cells grow in that cleared ring as satellites." },
  { name: "Kanamycin", cleared: false,
    note: "The resistance is an enzyme that stays inside the cell, so nothing is cleared and there are no satellites." },
  { name: "Chloramphenicol", cleared: false,
    note: "The resistance stays inside the cell. Colonies come up slowly on it, which is the drug and not the plate." },
  { name: "Zeocin", cleared: false,
    note: "The resistance protein binds the drug one molecule at a time rather than destroying it, so there are no "
      + "satellites — and the plates have to be low-salt or the drug does not work, and kept out of the light." },
  { name: "Nothing", cleared: false,
    note: "Everything that was plated grows. What comes up says the cells were alive, and nothing about what went into them." },
];

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/** What this knows of a host. */
export function hostFor(host: string): Host | null {
  return HOSTS.find((one) => one.matches.test(host)) ?? null;
}

/** How fast something doubles at a temperature, and whether that figure is worth having. */
export interface Doubling {
  /** How long it takes to double, in minutes. */
  minutes: number;
  /** The host, as this knows it. */
  host: Host;
  /** Whether the temperature is one the rule holds over. */
  ok: boolean;
  /** What it says. */
  says: string;
}

/**
 * How long something takes to double at a temperature.
 *
 * Within the range a cell grows over, its rate roughly doubles for every ten degrees — so ten
 * degrees below its best, it takes twice as long. Above its best it does not keep speeding up: it
 * slows, and then stops, and where that happens is a property of the strain rather than a rule.
 *
 * @param host - What is growing, as a lab writes it.
 * @param celsius - The temperature the incubator is set to.
 * @returns How long a doubling takes, or `null` for a host this knows nothing about.
 *
 * @example
 * ```ts
 * import { doublingAt } from "@biolibs/bionet-tools";
 *
 * doublingAt("E. coli", 37)?.minutes;    // 20
 * doublingAt("E. coli", 27)?.minutes;    // 40: ten degrees colder is twice as long
 * ```
 */
export function doublingAt(host: string, celsius: number): Doubling | null {
  const known = hostFor(host);
  if (known === null) return null;
  if (celsius > known.best) {
    return { minutes: known.doubling, host: known, ok: false,
             says: `${celsius} °C is above the ${known.best} °C ${known.name} grows best at. Past its best it does not go faster; `
               + `it slows, and somewhere above here it stops. Nothing here will tell you where, because that is the strain and not a rule.` };
  }
  // Ten degrees colder, twice as long. It is a rule of thumb and holds over the middle of the range.
  const minutes = round(known.doubling * 2 ** ((known.best - celsius) / 10), 1);
  if (celsius < known.coldest) {
    return { minutes, host: known, ok: false,
             says: `${celsius} °C is below the ${known.coldest} °C this rule is worth applying at. It is still growing, `
               + `just slowly enough that what the plate does over a weekend is anybody's guess.` };
  }
  return { minutes, host: known, ok: true,
           says: celsius === known.best
             ? `${minutes} minutes a doubling, which is ${known.name} at its best.`
             : `${minutes} minutes a doubling: ${known.best - celsius} °C under its best, so ${round(minutes / known.doubling, 2)}× as long as the ${known.doubling} it takes there.` };
}

/** When a plate is worth looking at. */
export interface Ready {
  /** How long until a colony can be seen, in hours. */
  hours: number;
  /** How that is said: "overnight", "two days". */
  said: string;
  /** How many doublings that is. */
  doublings: number;
  /** When what is on it starts running together, in hours. */
  overgrown: number;
  /** What the figure is and is not. */
  says: string;
}

/**
 * How long a plate takes before there is anything to see on it.
 *
 * @param host - What is growing.
 * @param celsius - The temperature.
 * @returns When to look, or `null` for a host this knows nothing about.
 *
 * @example
 * ```ts
 * import { readyAfter } from "@biolibs/bionet-tools";
 *
 * readyAfter("E. coli", 37)?.said;           // "overnight"
 * readyAfter("Pichia pastoris", 30)?.said;   // "two to three days"
 * ```
 */
export function readyAfter(host: string, celsius: number): Ready | null {
  const how = doublingAt(host, celsius);
  if (how === null) return null;
  const doublings = Math.log2(VISIBLE_CELLS);
  const hours = round(LAG_HOURS + (doublings * how.minutes) / 60, 1);
  const said = hours <= 6 ? "in an afternoon"
    : hours <= 18 ? "overnight"
    : hours <= 30 ? "a day"
    : hours <= 56 ? "two days"
    : hours <= 80 ? "two to three days"
    : "the best part of a week";
  return {
    hours, said, doublings: round(doublings, 1), overgrown: round(hours * OVERGROWN_AT, 1),
    // This is the soonest and not the usual, and the difference is worth saying out loud: the
    // doubling times above are for rich medium and a strain carrying nothing. A plate on selection,
    // holding a construct it is being made to keep, is slower — which is why a protocol for this
    // host says two to three days where the arithmetic says fifty-four hours.
    says: `About ${hours} h — ${said} — and that is the soonest. It is ${round(doublings, 1)} doublings of ${how.minutes} minutes, `
      + `at the rate ${how.host.name} manages in rich medium carrying nothing. On selection, carrying something, it is slower.`,
  };
}

/** What is on a plate after a while. */
export interface Plate {
  /** Whether there is anything to see yet. */
  showing: boolean;
  /** How far through to anything showing, from 0 to 1 and beyond. */
  through: number;
  /** Whether what is on it has started running together. */
  overgrown: boolean;
  /** Whether satellites will have come up round the colonies. */
  satellites: boolean;
  /** What it says, worst first. */
  says: string[];
}

/**
 * What is on a plate after a given time.
 *
 * @param hours - How long it has been in.
 * @param host - What is growing.
 * @param celsius - The temperature.
 * @param selection - What it is selected on.
 * @returns What is on it, or `null` for a host this knows nothing about.
 *
 * @example
 * ```ts
 * import { plateAfter, SELECTIONS } from "@biolibs/bionet-tools";
 *
 * plateAfter(36, "E. coli", 37, SELECTIONS[0]!).satellites;    // true: ampicillin, left too long
 * ```
 */
export function plateAfter(hours: number, host: string, celsius: number, selection: Selection): Plate | null {
  const when = readyAfter(host, celsius);
  if (when === null) return null;
  const through = when.hours <= 0 ? 0 : round(hours / when.hours, 2);
  const showing = through >= 1;
  const overgrown = hours >= when.overgrown;
  // Satellites need the real colonies to have been there a while clearing the drug around them.
  const satellites = selection.cleared && through >= 1.6;
  const says: string[] = [];
  if (overgrown) {
    says.push(`At ${hours} h this is past the ${when.overgrown} h where colonies start running together. `
      + `A colony is a clone, and once two are touching the one you pick is not one colony — which nothing about it will show.`);
  }
  if (satellites) {
    says.push(`On ${selection.name.toLowerCase()}, by now there will be satellites: small colonies in the ring each real one has cleared. `
      + `They took nothing up. Pick a large, well-separated one and streak it out.`);
  }
  if (!showing) {
    says.push(`At ${hours} h there is ${through < 0.5 ? "nothing" : "not much"} to see: this takes about ${when.hours} h, which is ${when.said}. `
      + `A plate looked at too early is not a plate with nothing on it.`);
  }
  if (says.length === 0) says.push(`At ${hours} h there are colonies and they are still separate, which is when to pick one.`);
  return { showing, through, overgrown, satellites, says };
}

/**
 * How many cells a colony holds after a while, for drawing the growth of it.
 *
 * @param hours - How long it has been growing.
 * @param host - What is growing.
 * @param celsius - The temperature.
 * @returns The cells in one colony, which stops rising once a colony has eaten what is under it.
 */
export function cellsAfter(hours: number, host: string, celsius: number): number {
  const how = doublingAt(host, celsius);
  if (how === null || hours <= LAG_HOURS) return 1;
  const doublings = ((hours - LAG_HOURS) * 60) / how.minutes;
  // A colony runs out of what is under it: past about a thousand times visible it stops.
  return Math.min(VISIBLE_CELLS * 1e3, 2 ** doublings);
}
