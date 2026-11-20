/**
 * The working behind what the spectrophotometer tool says.
 *
 * Every figure this instrument gives is a reading times a convention, so every one of them is an
 * estimate and says what it rests on. The two things that are not estimates — the dilution and the
 * path length — say that, because knowing which of the numbers on the screen are arithmetic and
 * which are somebody's rule of thumb is the whole difference between reading an instrument and
 * believing one.
 */
import { LINEAR, density, nucleicAcid, proteinAmount, scientific, type Reading, type Sample } from "./spectro.js";
import type { Working } from "./pcr-working.js";

const count = (value: number): string => value.toLocaleString("en-US");
const tidy = (value: number, places = 3): string => `${Math.round(value * 10 ** places) / 10 ** places}`;

/**
 * How the reading on the screen became the reading a figure is worked from.
 *
 * @param reading - What was read.
 * @returns The working: the number, the dilution and the path, and nothing else.
 *
 * @example
 * ```ts
 * import { correctedWorking } from "@biolibs/bionet-tools";
 *
 * correctedWorking({ nm: 260, shown: 0.42, dilution: 10, path: 1 }).comes;    // "4.2"
 * ```
 */
export function correctedWorking(reading: Reading): Working {
  const corrected = (reading.shown * reading.dilution) / reading.path;
  return {
    of: `The reading at ${reading.nm} nm, corrected`, comes: tidy(corrected, 4), kind: "exact",
    steps: [
      `The machine showed ${tidy(reading.shown, 4)}.`,
      reading.dilution === 1 ? "It was read neat, so the dilution changes nothing."
        : `It was diluted ${reading.dilution}-fold, so the neat sample would read ${tidy(reading.shown, 4)} × ${reading.dilution} = ${tidy(reading.shown * reading.dilution, 4)}.`,
      reading.path === 1 ? "The light went through 1 cm, which is what every factor below is for."
        : `The light went through ${reading.path} cm rather than 1, so that figure is divided by ${reading.path}: ${tidy(corrected, 4)}.`,
    ],
  };
}

/**
 * How a reading at 260 nm became a concentration.
 *
 * @param reading - What was read.
 * @param sample - Which kind of nucleic acid.
 * @returns The working.
 */
export function nucleicWorking(reading: Reading, sample: "dsDNA" | "ssDNA" | "RNA" | "oligo"): Working {
  const amount = nucleicAcid(reading, sample);
  return {
    of: "How much is in the tube", comes: `${tidy(amount.ngPerUl, 1)} ng/µL`, kind: "estimate",
    steps: [
      `The corrected reading is ${tidy(amount.corrected, 4)}.`,
      `A reading of 1.0 through 1 cm is taken to be ${amount.factor} µg/mL for ${sample === "dsDNA" ? "double-stranded DNA" : sample === "ssDNA" ? "single-stranded DNA" : sample === "RNA" ? "RNA" : "a short single strand"}.`,
      `${tidy(amount.corrected, 4)} × ${amount.factor} = ${tidy(amount.corrected * amount.factor, 2)} µg/mL, which is the same number in ng/µL.`,
    ],
    rests: sample === "oligo"
      ? "The 33 µg/mL figure is an average over base composition and is poor for a short oligo, where "
        + "the actual coefficient depends on which bases sit next to which. For an oligo that matters, "
        + "use the coefficient its supplier gives."
      : `The ${amount.factor} µg/mL figure is an average over base composition. A sequence far from even in its bases absorbs more or less than that, so this is good to a few per cent and no better.`,
  };
}

/**
 * How a reading at 600 nm became a number of cells.
 *
 * @param reading - What was read.
 * @param host - What is growing.
 * @returns The working, or `null` for a host there is no factor for.
 */
export function densityWorking(reading: Reading, host: string): Working | null {
  const grown = density(reading, host);
  if (grown === null) {
    return {
      of: "How many cells", comes: "not known", kind: "estimate",
      steps: [`Nothing here has a factor for ${host}.`, "The reading is still a reading; what it means in cells is not known."],
      rests: "A factor can only come from counting cells on this host on this machine, which is the honest way to get one anyway.",
    };
  }
  return {
    of: "How many cells", comes: `${scientific(grown.perMl)} per mL`, kind: "estimate",
    steps: [
      `The corrected reading is ${tidy(grown.od, 3)}.`,
      `${grown.host} is taken to be ${scientific(grown.factor)} cells per mL at a reading of 1.0.`,
      `${tidy(grown.od, 3)} × ${scientific(grown.factor)} = ${scientific(grown.perMl)} cells per mL, or ${count(grown.perMl)}.`,
    ],
    rests: "This is the shakiest figure on the bench. A culture's reading is not absorbance: cells scatter "
      + "600 nm light out of the beam rather than absorbing it, so the factor depends on how far the "
      + "detector sits from the cuvette as much as on the cells. The figure here came from somebody "
      + "else's machine. To have one for this lab's, count cells against a reading once and use that.",
  };
}

/**
 * How a reading at 280 nm became a protein concentration.
 *
 * Named for the wavelength because `proteinWorking` in `protein.ts` is a different thing: that one
 * is the working behind a translation, and this one is the working behind a measurement of it.
 *
 * @param reading - What was read.
 * @param protein - Its name, molar extinction coefficient and weight.
 * @returns The working.
 */
export function proteinAt280Working(reading: Reading, protein: { name: string; extinction: number; weight: number }): Working {
  const read = proteinAmount(reading, protein);
  if (read === null) {
    return {
      of: "How much protein", comes: "cannot be read here", kind: "exact",
      steps: [
        `${protein.name} has no tryptophan, tyrosine or cystine in it.`,
        "Those residues are what a protein absorbs 280 nm light with. Without them its coefficient is zero.",
        "No reading at 280 nm can say how much of this protein is in the tube.",
      ],
      rests: "Read it another way: a dye-binding assay, or a gel against a standard of known amount.",
    };
  }
  return {
    of: "How much protein", comes: `${tidy(read.mgPerMl, 3)} mg/mL`, kind: "estimate",
    steps: [
      `The corrected reading is ${tidy(read.corrected, 4)}.`,
      `${protein.name} absorbs at 280 nm with a coefficient of ${count(protein.extinction)} M⁻¹cm⁻¹, counted from its tryptophans and tyrosines.`,
      `A = εcl, so c = ${tidy(read.corrected, 4)} ÷ ${count(protein.extinction)} = ${(read.corrected / protein.extinction).toExponential(2)} M.`,
      `Times its weight, ${count(Math.round(protein.weight))} Da, that is ${tidy(read.mgPerMl, 3)} g/L — the same number in mg/mL.`,
    ],
    rests: "The coefficient is computed from the sequence, so this assumes the tube holds that protein and "
      + "little else that absorbs at 280. Anything else aromatic in there — another protein, nucleic acid "
      + "carried over — is counted as this one.",
  };
}

/**
 * Why a reading can or cannot be believed, as working rather than as a warning.
 *
 * @param reading - What was read.
 * @returns The working.
 */
export function rangeWorking(reading: Reading): Working {
  const scattering = reading.nm >= 550;
  const high = scattering ? LINEAR.scattering : LINEAR.high;
  return {
    of: "Whether the number can be believed", comes: reading.shown > high ? "no, it reads low" : reading.shown < LINEAR.low ? "no, it is mostly noise" : "yes", kind: "estimate",
    steps: [
      `The machine showed ${tidy(reading.shown, 4)}.`,
      `An ordinary bench instrument is linear from about ${LINEAR.low} to about ${high}${scattering ? " for a scattering sample, which goes off sooner than a clear one" : ""}.`,
      reading.shown > high
        ? "Above that, most of what reaches the detector is light that got round the sample rather than through it, so the number comes back lower than the truth."
        : reading.shown < LINEAR.low
          ? "Below that, the difference between the sample and the blank is the size of the instrument's own noise."
          : "This one is inside that range.",
      "Nothing on the machine says which of these is the case. It shows the same kind of number either way.",
    ],
    rests: `Where linearity gives out depends on the instrument: a good one with stray-light correction holds to 2 or more, a cheap one gives up before ${high}. Read a dilution series once and find out where yours goes.`,
  };
}

/** Every figure a reading gives, with its working, in the order they are read. */
export function spectroWorking(reading: Reading, sample: Sample,
                               about: { host?: string; protein?: { name: string; extinction: number; weight: number } } = {}): Working[] {
  const working: Working[] = [rangeWorking(reading), correctedWorking(reading)];
  if (sample === "culture") {
    const grown = densityWorking(reading, about.host ?? "");
    if (grown !== null) working.push(grown);
  } else if (sample === "protein") {
    if (about.protein !== undefined) working.push(proteinAt280Working(reading, about.protein));
  } else {
    working.push(nucleicWorking(reading, sample));
  }
  return working;
}
