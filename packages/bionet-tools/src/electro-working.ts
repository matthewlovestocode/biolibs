/**
 * The working behind what the electroporator tool says.
 *
 * Two of these are arithmetic and say so: the field is a voltage over a gap, and the time constant
 * is a resistance times a capacitance. The rest are judgements about a number against a published
 * one, and they say what they rest on — which is that somebody else's cells, washed somebody else's
 * way, did this on somebody else's machine.
 */
import { against, decay, efficiency, fieldStrength, publishedFor, timeConstant, type Pulse } from "./electro.js";
import type { Working } from "./pcr-working.js";

const count = (value: number): string => value.toLocaleString("en-US");

/**
 * How the voltage became the field the cells are in.
 *
 * @param pulse - What the machine is set to, and which cuvette is in it.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { fieldWorking } from "@biolibs/bionet-tools";
 *
 * fieldWorking({ volts: 1500, microfarads: 25, ohms: 200, gap: 2 }).comes;    // "7.5 kV/cm"
 * ```
 */
export function fieldWorking(pulse: Pulse): Working {
  const strength = fieldStrength(pulse);
  return {
    of: "The field the cells are in", comes: `${strength} kV/cm`, kind: "exact",
    steps: [
      `The machine is set to ${count(pulse.volts)} V, which is ${pulse.volts / 1000} kV.`,
      `The cuvette in it has a ${pulse.gap} mm gap, which is ${pulse.gap / 10} cm.`,
      `${pulse.volts / 1000} ÷ ${pulse.gap / 10} = ${strength} kV/cm.`,
      "The cells feel that, not the voltage. The same voltage in a cuvette twice as wide is half the field.",
    ],
  };
}

/**
 * How the settings became the time constant to expect, and what the one that came back says.
 *
 * @param pulse - What the machine was set to.
 * @param measured - What it showed afterwards, in milliseconds, or `null` if nobody looked.
 * @returns The working.
 */
export function decayWorking(pulse: Pulse, measured: number | null): Working {
  const set = timeConstant(pulse);
  if (measured === null) {
    return {
      of: "How long the pulse should last", comes: `${set} ms`, kind: "exact",
      steps: [
        `${count(pulse.ohms)} Ω across ${pulse.microfarads} µF.`,
        `${count(pulse.ohms)} × ${pulse.microfarads} = ${count(pulse.ohms * pulse.microfarads)} µs, which is ${set} ms.`,
        "The machine shows what it actually was. It is worth reading: a sample that conducts shortens it.",
      ],
    };
  }
  const how = decay(pulse, measured);
  return {
    of: "What the time constant says", comes: how.ok ? "the pulse went in" : "it did not go in properly", kind: "estimate",
    steps: [
      `The settings give ${set} ms: ${count(pulse.ohms)} Ω × ${pulse.microfarads} µF.`,
      `The machine showed ${measured} ms, which is ${Math.round(how.of * 100)}% of it.`,
      "The sample sits in parallel with the resistor, so anything that conducts — salt in the cells, buffer carried in with the DNA — takes current away from the cells and shortens the pulse.",
      how.says,
    ],
    rests: "Where the line falls between a little salty and an arc is not sharp, and a machine of another make "
      + "reports the constant differently. What is solid is the direction: shorter means more conductive, always.",
  };
}

/**
 * How the settings compare with the ones the host is usually given.
 *
 * @param pulse - What the machine is set to.
 * @param host - What is in the cuvette.
 * @returns The working, or one saying nothing is known for this host.
 */
export function settingsWorking(pulse: Pulse, host: string): Working {
  const how = against(pulse, host);
  if (how === null) {
    return {
      of: "The settings for this host", comes: "not known", kind: "estimate",
      steps: [`Nothing here has published settings for ${host === "" ? "a host nobody has named" : host}.`,
              `The field set is ${fieldStrength(pulse)} kV/cm, which is still the number to write down.`],
      rests: "Settings for a new host are found by trying a range of fields on the same cells and counting what grows.",
    };
  }
  return {
    of: "The field against the usual one", comes: `${Math.round(how.of * 100)}% of it`, kind: "estimate",
    steps: [
      `${how.published.name} is usually given ${how.usual} kV/cm — ${count(how.published.pulse.volts)} V across a ${how.published.pulse.gap} mm gap, from ${how.published.from}.`,
      `This is set to ${how.strength} kV/cm.`,
      how.says,
    ],
    rests: "Those settings are for somebody else's cells, made competent their way. A lab's own will want "
      + "something near them and not exactly them; the field is the number to carry over, not the voltage.",
  };
}

/**
 * How the colonies on a plate became a number of colonies per microgram.
 *
 * @param counted - What was counted and what was plated.
 * @param host - What it went into.
 * @returns The working.
 */
export function efficiencyWorking(counted: { colonies: number; nanograms: number; recovered: number; plated: number }, host: string): Working {
  const how = efficiency(counted, host);
  const published = publishedFor(host);
  return {
    of: "Colonies for each microgram", comes: count(how.perMicrogram), kind: "exact",
    steps: [
      `${count(counted.nanograms)} ng of DNA went into the cuvette.`,
      `${count(counted.plated)} µL of the ${count(counted.recovered)} µL recovered went on the plate, which is ${Math.round((Math.min(1, counted.plated / (counted.recovered || 1))) * 100)}% of it.`,
      `So ${how.onThePlate} µg of that DNA reached the plate counted.`,
      `${count(counted.colonies)} colonies ÷ ${how.onThePlate} µg = ${count(how.perMicrogram)} per µg.`,
      ...(published === null ? [] : [how.says]),
    ],
    rests: published === null ? undefined
      : "The figure to compare it with is for freshly made cells and that kind of DNA. Efficiency falls off "
        + "sharply with the size of what is going in, and linear DNA that has to find a place in the genome "
        + "is orders of magnitude below a plasmid that only has to stay in the cell.",
  };
}

/** Every figure a pulse gives, with its working, in the order they come up. */
export function electroWorking(pulse: Pulse, host: string, about: { measured?: number | null } = {}): Working[] {
  return [fieldWorking(pulse), settingsWorking(pulse, host), decayWorking(pulse, about.measured ?? null)];
}
