/**
 * A pulse through a cuvette: what an electroporator is set to, and what the cells get.
 *
 * Electroporation puts DNA into a cell by breaking it open for a moment. A high voltage across a
 * narrow gap makes pores in the membrane that close again, and DNA in the liquid goes in through
 * them while they are open. The cells that survive it and took something up grow into colonies;
 * the rest do not.
 *
 * What a protocol writes down is a voltage. What the cells feel is a field, which is that voltage
 * divided by the gap, and that is the number this works in. Copying 1.8 kV out of a protocol
 * written for a 1 mm cuvette into a 2 mm cuvette halves the field and the transformation quietly
 * fails, with every setting on the machine looking exactly as the protocol said. It is the
 * commonest way to get nothing, and the machine cannot tell you: it does not know which cuvette
 * is in it.
 *
 * The machine does say one thing afterwards that is worth reading. The time constant — how long the
 * pulse took to decay — should come out near the resistance times the capacitance. A sample that
 * conducts too well, because the cells were not washed free of salt or the DNA came in buffer,
 * drops it, and at the extreme the thing arcs and everything in the cuvette dies. A short time
 * constant is the only warning there is.
 */

/** The cuvettes a lab has, by the gap between their electrodes, in millimetres. */
export const GAPS = [1, 2, 4] as const;

/** One of them. */
export type Gap = (typeof GAPS)[number];

/** What a pulse is set to. */
export interface Pulse {
  /** The voltage, in volts. */
  volts: number;
  /** The capacitance, in microfarads. */
  microfarads: number;
  /** The resistance in parallel with the sample, in ohms. */
  ohms: number;
  /** The gap between the cuvette's electrodes, in millimetres. */
  gap: Gap;
}

/** The settings a host is usually given, and where they come from. */
export interface Published {
  /** The pattern that matches how a lab writes the host. */
  host: RegExp;
  /** The organism, as this names it. */
  name: string;
  /** The pulse. */
  pulse: Pulse;
  /** Where the settings come from. */
  from: string;
  /** Roughly how many colonies a microgram gives, for what kind of DNA. */
  expect: { perMicrogram: number; of: string };
}

/**
 * The settings each host is usually given.
 *
 * These are the published ones, named. A lab's own cells, washed its own way, will want something
 * near them and not exactly them, which is what the field below is for: it is the number to keep,
 * whatever cuvette is to hand.
 */
export const PUBLISHED: readonly Published[] = [
  {
    host: /escherichia|e\.? ?coli/i, name: "Escherichia coli",
    pulse: { volts: 2_500, microfarads: 25, ohms: 200, gap: 2 }, from: "Bio-Rad's bacterial protocol, 2 mm cuvette",
    expect: { perMicrogram: 1e9, of: "a small supercoiled plasmid into freshly made cells" },
  },
  {
    host: /komagataella|pichia/i, name: "Komagataella phaffii",
    pulse: { volts: 1_500, microfarads: 25, ohms: 200, gap: 2 }, from: "the EasySelect Pichia manual",
    expect: { perMicrogram: 3e3, of: "linearised DNA that has to find its place in the genome" },
  },
  {
    host: /saccharomyces|cerevisiae/i, name: "Saccharomyces cerevisiae",
    pulse: { volts: 1_500, microfarads: 25, ohms: 200, gap: 2 }, from: "the usual yeast protocol, 2 mm cuvette",
    expect: { perMicrogram: 1e5, of: "a plasmid with a yeast origin on it" },
  },
];

/** How far a measured time constant may fall below the set one before it is worth saying so. */
export const TIME_CONSTANT = { close: 0.9, low: 0.7, arced: 0.4 } as const;

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/**
 * The field the cells are in, which is the number that matters.
 *
 * @param pulse - What the machine is set to, and which cuvette is in it.
 * @returns Kilovolts per centimetre.
 *
 * @example
 * ```ts
 * import { fieldStrength } from "@biolibs/bionet-tools";
 *
 * fieldStrength({ volts: 1500, microfarads: 25, ohms: 200, gap: 2 });    // 7.5
 * ```
 */
export function fieldStrength(pulse: Pick<Pulse, "volts" | "gap">): number {
  // A gap in millimetres is a tenth of a centimetre, and a volt a thousandth of a kilovolt.
  return round((pulse.volts / 1000) / (pulse.gap / 10), 2);
}

/**
 * How long the pulse should take to decay, from the settings alone.
 *
 * @param pulse - What the machine is set to.
 * @returns Milliseconds.
 *
 * @example
 * ```ts
 * import { timeConstant } from "@biolibs/bionet-tools";
 *
 * timeConstant({ ohms: 200, microfarads: 25 });    // 5
 * ```
 */
export function timeConstant(pulse: Pick<Pulse, "ohms" | "microfarads">): number {
  // Ohms times microfarads is microseconds; a thousand of those is a millisecond.
  return round((pulse.ohms * pulse.microfarads) / 1000, 3);
}

/** What the voltage would have to be to give a field, in a given cuvette. */
export function voltsFor(strength: number, gap: Gap): number {
  return Math.round(strength * (gap / 10) * 1000);
}

/** What the settings a host is usually given are, if this knows any. */
export function publishedFor(host: string): Published | null {
  return PUBLISHED.find((one) => one.host.test(host)) ?? null;
}

/** How the field set compares with the one the host is usually given. */
export interface Against {
  /** The field set, in kV/cm. */
  strength: number;
  /** The field the host is usually given. */
  usual: number;
  /** What the published settings are, and where they come from. */
  published: Published;
  /** How far off it is, as a fraction: 1 is exactly it, 0.5 is half of it. */
  of: number;
  /** What that means, in a line. */
  says: string;
}

/**
 * The field set, against the one the host is usually given.
 *
 * @param pulse - What the machine is set to.
 * @param host - What is in the cuvette.
 * @returns How it compares, or `null` for a host there are no published settings here for.
 *
 * @example
 * ```ts
 * import { against } from "@biolibs/bionet-tools";
 *
 * // 1.8 kV is right for E. coli in a 1 mm cuvette, and half the field in a 2 mm one.
 * against({ volts: 1800, microfarads: 25, ohms: 200, gap: 2 }, "E. coli")?.of;    // 0.72
 * ```
 */
export function against(pulse: Pulse, host: string): Against | null {
  const published = publishedFor(host);
  if (published === null) return null;
  const strength = fieldStrength(pulse);
  const usual = fieldStrength(published.pulse);
  const of = round(strength / usual, 2);
  if (of >= 0.9 && of <= 1.1) {
    return { strength, usual, published, of, says: `${strength} kV/cm, which is what ${published.name} is usually given.` };
  }
  // Whatever is wrong, the useful thing to say is the voltage that gives the usual field in the
  // cuvette that is actually in the machine — because the machine does not know which one that is,
  // and a voltage carried over from a protocol written for another gap is the commonest way here.
  const fix = `${voltsFor(usual, pulse.gap)} V gives the ${usual} kV/cm in the ${pulse.gap} mm cuvette.`;
  const carried = pulse.gap === published.pulse.gap ? ""
    : ` Those settings are written for a ${published.pulse.gap} mm cuvette.`;
  const says = `${strength} kV/cm, against the ${usual} kV/cm ${published.name} is usually given — ${Math.round(of * 100)}% of it. `
    + (of < 0.9 ? "Too weak a field makes no pores, and nothing goes in. " : "Too strong a field kills the cells it opens. ")
    + fix + carried;
  return { strength, usual, published, of, says };
}

/** What a measured time constant says about the sample. */
export interface Decay {
  /** What the settings alone give. */
  set: number;
  /** What the machine showed. */
  measured: number;
  /** The measured one as a fraction of the set one. */
  of: number;
  /** Whether it is near enough to believe the pulse went in. */
  ok: boolean;
  /** What it says, in a line. */
  says: string;
}

/**
 * What the time constant the machine showed says about what was in the cuvette.
 *
 * @param pulse - What the machine was set to.
 * @param measured - What it showed afterwards, in milliseconds, or `null` if nobody looked.
 * @returns What it means, or `null` if nobody looked.
 *
 * @example
 * ```ts
 * import { decay } from "@biolibs/bionet-tools";
 *
 * decay({ volts: 1500, microfarads: 25, ohms: 200, gap: 2 }, 2.1).ok;    // false: salt
 * ```
 */
export function decay(pulse: Pulse, measured: number): Decay {
  const set = timeConstant(pulse);
  const of = set === 0 ? 0 : round(measured / set, 2);
  if (of >= TIME_CONSTANT.close) {
    return { set, measured, of, ok: true,
             says: `${measured} ms against the ${set} ms the settings give, which is what a sample with the salt washed out of it does.` };
  }
  if (of >= TIME_CONSTANT.low) {
    return { set, measured, of, ok: true,
             says: `${measured} ms against the ${set} ms the settings give. A little short: there is some salt in there, and it worked anyway. `
               + `Another wash of the cells, or the DNA in water rather than buffer, would bring it back.` };
  }
  if (of >= TIME_CONSTANT.arced) {
    return { set, measured, of, ok: false,
             says: `${measured} ms against the ${set} ms the settings give — far short. The sample is conducting, so most of the pulse went through the liquid rather than across the cells. `
               + `Wash the cells again in ice-cold water or sorbitol, and put the DNA in at a tenth of the cell volume or less.` };
  }
  return { set, measured, of, ok: false,
           says: `${measured} ms against the ${set} ms the settings give. That is an arc: the cuvette shorted, and what was in it is dead. `
             + `Start again with washed cells, salt-free DNA, everything ice-cold, and no bubbles in the cuvette.` };
}

/** How much DNA went in against how much liquid it went into. */
export interface Loading {
  /** The DNA's share of what is in the cuvette, as a fraction. */
  share: number;
  /** Whether it is small enough not to put salt in. */
  ok: boolean;
  /** What it says. */
  says: string;
}

/**
 * Whether the DNA added is a small enough part of what is in the cuvette.
 *
 * @param dna - How much DNA solution went in, in microlitres.
 * @param cells - How much cell suspension it went into, in microlitres.
 * @returns What that means.
 */
export function loading(dna: number, cells: number): Loading {
  const total = dna + cells;
  const share = total <= 0 ? 0 : round(dna / total, 3);
  if (share <= 0.05) return { share, ok: true, says: `The DNA is ${Math.round(share * 100)}% of what is in the cuvette, which is little enough to carry no salt in with it.` };
  if (share <= 0.1) return { share, ok: true, says: `The DNA is ${Math.round(share * 100)}% of what is in the cuvette. That is the usual limit; below a twentieth is safer.` };
  return { share, ok: false,
           says: `The DNA is ${Math.round(share * 100)}% of what is in the cuvette, which is more than the tenth usually allowed. `
             + `Whatever it is dissolved in is now a tenth of the sample, and if that is buffer rather than water it will shorten the pulse or arc it.` };
}

/** How well a transformation went, counted off a plate. */
export interface Efficiency {
  /** Colonies for each microgram of DNA. */
  perMicrogram: number;
  /** How much DNA ended up on the plate counted, in micrograms. */
  onThePlate: number;
  /** What was expected for this host, if anything is known. */
  expected: number | null;
  /** What it says. */
  says: string;
}

/**
 * How well it went, from the colonies on a plate.
 *
 * @param counted - The colonies counted, the nanograms of DNA that went into the cuvette, how much
 *   was recovered in total and how much of that went on the plate, both in microlitres.
 * @param host - What it went into, for what to expect.
 * @returns Colonies per microgram, and how that stands.
 *
 * @example
 * ```ts
 * import { efficiency } from "@biolibs/bionet-tools";
 *
 * efficiency({ colonies: 120, nanograms: 100, recovered: 1000, plated: 100 }, "E. coli").perMicrogram;
 * ```
 */
export function efficiency(counted: { colonies: number; nanograms: number; recovered: number; plated: number }, host: string): Efficiency {
  const share = counted.recovered <= 0 ? 0 : Math.min(1, counted.plated / counted.recovered);
  const onThePlate = round((counted.nanograms * share) / 1000, 6);
  const perMicrogram = onThePlate <= 0 ? 0 : Math.round(counted.colonies / onThePlate);
  const published = publishedFor(host);
  const expected = published?.expect.perMicrogram ?? null;
  const says = expected === null
    ? `${perMicrogram.toLocaleString("en-US")} colonies per µg. Nothing here says what to expect for ${host}.`
    : perMicrogram >= expected / 10
      ? `${perMicrogram.toLocaleString("en-US")} colonies per µg, against the ${expected.toExponential(0)} or so expected for ${published!.expect.of}.`
      : `${perMicrogram.toLocaleString("en-US")} colonies per µg, well under the ${expected.toExponential(0)} or so expected for ${published!.expect.of}. `
        + `Either the cells were not as competent as that, or the pulse did not go in, or the DNA was not what it was thought to be.`;
  return { perMicrogram, onThePlate, expected, says };
}
