/**
 * A spin in a centrifuge: how hard, for how long, and whether the rotor is balanced.
 *
 * A centrifuge separates things by how dense they are: what is denser than the liquid goes to the
 * bottom and what is not stays up. Which of those two you keep is the whole point of the spin, and
 * it is different every time — cells are the pellet, a cleared lysate is the liquid, a precipitated
 * plasmid is the pellet again, and throwing away the wrong one throws away the experiment.
 *
 * Two things here the machine cannot tell you.
 *
 * It shows a speed, and what the tubes feel is a force. The force is the speed squared times the
 * radius of the rotor, so the same speed in a rotor of another size is a different force — the same
 * shape of mistake as a voltage carried between cuvettes with different gaps, and just as common,
 * because protocols are written in rpm and rpm belongs to the machine it was written on.
 *
 * And a rotor has to be balanced. It does not know whether it is; it finds out at full speed, and
 * what happens then is the one way to destroy a centrifuge and anybody standing near it. Balance is
 * arithmetic over what is in which position, which is a thing software can do and a tired person at
 * the end of a long day cannot.
 */

/** The constant that turns a speed and a radius into a force, with the radius in centimetres. */
export const RCF_CONSTANT = 1.118e-5;

/** One rotor a lab has, and how far its positions sit from the axis. */
export interface Rotor {
  /** What it is called. */
  name: string;
  /** How far a position's middle is from the axis, in centimetres. */
  radius: number;
  /** How many positions it has. */
  positions: number;
  /** The fastest it is rated for, in revolutions a minute. */
  fastest: number;
}

/** The rotors a lab of this size has. */
export const ROTORS: readonly Rotor[] = [
  { name: "Microcentrifuge, 24 × 1.5 mL", radius: 8.5, positions: 24, fastest: 15_000 },
  { name: "Benchtop, 8 × 50 mL swinging", radius: 17.5, positions: 8, fastest: 5_000 },
  { name: "Benchtop, 6 × 250 mL fixed", radius: 12.5, positions: 6, fastest: 10_000 },
];

/** What a spin is usually for, and what it usually takes. */
export interface Spin {
  /** What is being spun. */
  what: string;
  /** How hard, in multiples of gravity. */
  force: number;
  /** For how long, in minutes. */
  minutes: number;
  /** At what temperature, in degrees Celsius, or `null` where it does not matter. */
  celsius: number | null;
  /** Which of the two is kept. */
  keep: "pellet" | "liquid";
  /** What the other one is, so that throwing it away is a decision rather than a habit. */
  other: string;
}

/** The spins that come up between the other steps on this bench. */
export const SPINS: readonly Spin[] = [
  { what: "Cells out of a culture", force: 4_000, minutes: 5, celsius: 4, keep: "pellet",
    other: "the spent medium, which is thrown away unless the protein was secreted into it — in which case it is the half that matters and the cells are not" },
  { what: "Cells out of 1.5 mL, in a microfuge", force: 13_000, minutes: 1, celsius: null, keep: "pellet",
    other: "the medium, poured off" },
  { what: "A plasmid precipitated with alcohol", force: 16_000, minutes: 20, celsius: 4, keep: "pellet",
    other: "the alcohol, poured off carefully — the pellet is small, glassy and easy to lose with it" },
  { what: "Debris out of a lysate", force: 20_000, minutes: 20, celsius: 4, keep: "liquid",
    other: "the pellet of broken cells, which is the part thrown away" },
  { what: "A column, washed or eluted", force: 13_000, minutes: 1, celsius: null, keep: "liquid",
    other: "nothing: the column is kept or thrown away depending on which step it is" },
];

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/**
 * The force a spin puts on the tubes.
 *
 * @param rpm - The speed, in revolutions a minute.
 * @param radius - How far the tubes sit from the axis, in centimetres.
 * @returns Multiples of gravity.
 *
 * @example
 * ```ts
 * import { force } from "@biolibs/bionet-tools";
 *
 * Math.round(force(13_000, 8.5));    // 16060
 * ```
 */
export function force(rpm: number, radius: number): number {
  return RCF_CONSTANT * radius * rpm * rpm;
}

/**
 * The speed that gives a force, in a rotor of a given size.
 *
 * This is the direction that matters. A protocol says a speed because that is what the machine it
 * was written on showed; another machine's rotor is another size, and the speed to set on it is
 * this one.
 *
 * @param rcf - The force wanted, in multiples of gravity.
 * @param radius - How far the tubes sit from the axis, in centimetres.
 * @returns The speed, in revolutions a minute.
 *
 * @example
 * ```ts
 * import { speedFor } from "@biolibs/bionet-tools";
 *
 * Math.round(speedFor(16_000, 17.5));    // 9059: far slower, for the same force
 * ```
 */
export function speedFor(rcf: number, radius: number): number {
  if (radius <= 0 || rcf <= 0) return 0;
  return Math.sqrt(rcf / (RCF_CONSTANT * radius));
}

/** How a rotor is loaded, and whether it will run. */
export interface Balance {
  /** How many positions are filled. */
  filled: number;
  /** How far the middle of what is loaded sits from the axis, as a fraction of the rotor's radius. */
  offset: number;
  /** Whether it is balanced well enough to run. */
  ok: boolean;
  /** The positions that would balance it, counting from 0, if it is not balanced already. */
  put: number[];
  /** What it says. */
  says: string;
}

/**
 * How far off the axis a load sits, as a fraction of the rotor's radius.
 *
 * Each filled position is taken to hold the same mass, at its own angle round the rotor. Where
 * those add up to is where the rotor pulls; a balanced one pulls nowhere.
 *
 * @param loaded - The positions with a tube in them.
 * @param positions - How many positions the rotor has.
 * @returns 0 for a balanced load, 1 for everything on one side.
 */
function offsetOf(loaded: readonly number[], positions: number): number {
  if (loaded.length === 0) return 0;
  const angle = (at: number): number => (at / positions) * Math.PI * 2;
  const x = loaded.reduce((sum, at) => sum + Math.cos(angle(at)), 0);
  const y = loaded.reduce((sum, at) => sum + Math.sin(angle(at)), 0);
  return round(Math.hypot(x, y) / loaded.length, 4);
}

/** How far off centre a loaded rotor may be before it is worth stopping. */
export const OFF_CENTRE = 0.02;

/**
 * Whether a rotor is balanced, and where to put a tube if it is not.
 *
 * Every position is taken to hold the same mass, which is what a balanced load means in practice:
 * tubes are made up to the same weight, and the question is which holes they are in.
 *
 * @param loaded - The positions that have a tube in them, counting from 0 round the rotor.
 * @param positions - How many positions the rotor has.
 * @returns How far off centre it is, and what would fix it.
 *
 * @example
 * ```ts
 * import { balance } from "@biolibs/bionet-tools";
 *
 * balance([0], 24).ok;          // false: one tube on its own
 * balance([0, 12], 24).ok;      // true: opposite each other
 * ```
 */
export function balance(loaded: readonly number[], positions: number): Balance {
  const clean = [...new Set(loaded.filter((one) => Number.isInteger(one) && one >= 0 && one < positions))];
  if (positions <= 0) return { filled: 0, offset: 0, ok: false, put: [], says: "A rotor with no positions holds nothing." };
  if (clean.length === 0) return { filled: 0, offset: 0, ok: true, put: [], says: "Nothing is in it, which is balanced." };
  const offset = offsetOf(clean, positions);
  if (offset <= OFF_CENTRE) {
    return { filled: clean.length, offset, ok: true, put: [],
             says: `${clean.length} ${clean.length === 1 ? "tube" : "tubes"}, and what they pull adds up to nothing. It is balanced.` };
  }
  // One more tube somewhere free, if any one of them would do it. A tube is only suggested when
  // adding it really does balance the rotor: two tubes side by side cannot be fixed by a third
  // anywhere, and telling somebody to put one in and run it would be telling them something false.
  const free = Array.from({ length: positions }, (_, at) => at).filter((at) => !clean.includes(at));
  const fixes = free
    .map((at) => ({ at, offset: offsetOf([...clean, at], positions) }))
    .filter((one) => one.offset <= OFF_CENTRE)
    .sort((a, b) => a.offset - b.offset);
  const best = fixes[0];
  const how = best !== undefined
    ? `Put a tube of the same weight in position ${best.at + 1}.`
    : free.length === 0
      ? "There is no free position left to balance it with; take one out instead."
      : "No one tube anywhere in it would balance this. Move what is in there until the tubes are "
        + "opposite each other, or evenly spaced round the rotor, or add a counterweight to each.";
  return {
    filled: clean.length, offset, ok: false, put: best === undefined ? [] : [best.at],
    says: `${clean.length} ${clean.length === 1 ? "tube" : "tubes"}, and what they pull does not add up to nothing: the load sits `
      + `${Math.round(offset * 100)}% of the way out from the axis. ${how} `
      + "A rotor that is out at full speed is the one way to destroy a centrifuge.",
  };
}

/** How a spin that was set compares with what it is usually given. */
export interface SpinAgainst {
  /** The force set, in multiples of gravity. */
  force: number;
  /** The spin it is being compared with. */
  spin: Spin;
  /** The force set as a fraction of the usual one. */
  of: number;
  /** What it says. */
  says: string;
}

/**
 * A spin against what this kind of thing is usually given.
 *
 * @param rcf - The force set, in multiples of gravity.
 * @param minutes - How long it is set for.
 * @param spin - What is being spun.
 * @returns How it compares.
 *
 * @example
 * ```ts
 * import { spinAgainst, SPINS } from "@biolibs/bionet-tools";
 *
 * spinAgainst(1_000, 5, SPINS[0]!).says;
 * ```
 */
export function spinAgainst(rcf: number, minutes: number, spin: Spin): SpinAgainst {
  const of = spin.force <= 0 ? 0 : round(rcf / spin.force, 2);
  const said: string[] = [];
  if (of < 0.5) said.push(`${Math.round(rcf).toLocaleString("en-US")} × g is under half the ${spin.force.toLocaleString("en-US")} × g this usually takes. Not everything will have come down, and what is left up top is lost with the liquid.`);
  else if (of > 2) said.push(`${Math.round(rcf).toLocaleString("en-US")} × g is more than twice the ${spin.force.toLocaleString("en-US")} × g this usually takes. ${spin.keep === "pellet" ? "A pellet spun too hard packs so tightly it will not go back into solution." : "Spinning harder than the tube is rated for is how a tube splits."}`);
  else said.push(`${Math.round(rcf).toLocaleString("en-US")} × g is about the ${spin.force.toLocaleString("en-US")} × g this usually takes.`);
  if (minutes > 0 && minutes < spin.minutes / 2) said.push(`${minutes} min is well under the usual ${spin.minutes}.`);
  if (spin.celsius !== null) said.push(`It is usually done at ${spin.celsius} °C.`);
  said.push(`What is kept is the ${spin.keep}. The other half is ${spin.other}.`);
  return { force: rcf, spin, of, says: said.join(" ") };
}
