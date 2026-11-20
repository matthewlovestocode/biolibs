/**
 * What a spectrophotometer reads, and what a person makes of it.
 *
 * The machine does one thing: it shines light of one wavelength through a cuvette and says how much
 * came out, as a number with no units. Everything else — how much DNA is in the tube, how clean it
 * is, how many cells are in the flask, whether it is time to induce — is inferred from that number
 * by a convention, and every convention here could have been another one. So each figure says what
 * it rests on, and the two that are not estimates at all say that too.
 *
 * Three of those conventions are worth knowing before trusting anything below.
 *
 * A reading is only linear over a range. Above it the light is so far gone that stray light in the
 * instrument is most of what reaches the detector, and the number comes back smaller than the truth
 * while still looking like a perfectly good number. The machine does not say so. This does.
 *
 * A culture's reading is not absorbance at all. Cells do not absorb 600 nm light; they scatter it
 * out of the beam. Beer's law does not hold for scattering, the factor from a reading to a cell
 * count depends on the shape of the instrument as much as on the cells, and a factor from somebody
 * else's machine is not a measurement of yours.
 *
 * And a 260/280 ratio is a weak test for protein. Nucleic acid absorbs so much more strongly at 260
 * than protein does at 280 that a sample which is a large fraction protein by weight still reads
 * near 1.8. A good ratio is not evidence of a clean sample; a bad one is evidence of a dirty one.
 */

/** What is in the cuvette. */
export type Sample = "dsDNA" | "ssDNA" | "RNA" | "oligo" | "protein" | "culture";

/** What each sample is called where it is shown. */
export const SAMPLE_NAMES: Readonly<Record<Sample, string>> = {
  dsDNA: "Double-stranded DNA", ssDNA: "Single-stranded DNA", RNA: "RNA", oligo: "An oligo",
  protein: "Protein", culture: "A culture",
};

/** The wavelength each sample is read at, in nanometres. */
export const SAMPLE_NM: Readonly<Record<Sample, number>> = {
  dsDNA: 260, ssDNA: 260, RNA: 260, oligo: 260, protein: 280, culture: 600,
};

/**
 * How many micrograms per millilitre a reading of 1.0 at 260 nm and a 1 cm path means.
 *
 * These are the conventional factors. They are averages over base composition: a sequence rich in
 * one base absorbs more or less than the average, so a figure from these is good to a few per cent
 * and no better.
 */
export const PER_A260: Readonly<Record<"dsDNA" | "ssDNA" | "RNA" | "oligo", number>> = {
  dsDNA: 50, ssDNA: 33, RNA: 40, oligo: 33,
};

/**
 * How many cells a millilitre of culture holds at a reading of 1.0 at 600 nm, by host.
 *
 * Every one of these is somebody else's machine. They are here so that a reading means something
 * rather than nothing, and they are marked as resting on that, which is what they do.
 */
export const CELLS_AT_OD1: readonly { host: RegExp; name: string; cells: number }[] = [
  { host: /escherichia|e\.? ?coli/i, name: "Escherichia coli", cells: 8e8 },
  { host: /komagataella|pichia/i, name: "Komagataella phaffii", cells: 5e7 },
  { host: /saccharomyces|cerevisiae/i, name: "Saccharomyces cerevisiae", cells: 3e7 },
  { host: /bacillus/i, name: "Bacillus subtilis", cells: 5e8 },
];

/** The range of readings an ordinary bench instrument is linear over. */
export const LINEAR = { low: 0.1, high: 1.0, scattering: 0.8 } as const;

/** One thing read off the machine: the number it showed, how the sample was prepared, and at what wavelength. */
export interface Reading {
  /** The wavelength, in nanometres. */
  nm: number;
  /** What the machine showed, with no units. */
  shown: number;
  /** How many times the sample was diluted before reading: 1 for neat, 10 for one part in ten. */
  dilution: number;
  /** The path the light took through it, in centimetres. A cuvette is 1; a drop on a pedestal is 0.1 or less. */
  path: number;
}

/** Whether a reading can be believed, and what to do if not. */
export interface Trust {
  /** Whether the reading is inside the range the instrument is linear over. */
  ok: boolean;
  /** What is wrong with it, or how it stands. */
  says: string;
  /** For a reading too high, how much to dilute by to bring it into range. */
  dilute?: number;
}

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/** A number in the form a lab writes it: 8.2 × 10⁸. */
export function scientific(value: number, places = 1): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const power = Math.floor(Math.log10(Math.abs(value)));
  const lead = round(value / 10 ** power, places);
  const digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const written = `${Math.abs(power)}`.split("").map((one) => digits[Number(one)]!).join("");
  return `${lead} × 10${power < 0 ? "⁻" : ""}${written}`;
}

/**
 * Whether a reading is inside the range the instrument is linear over.
 *
 * @param reading - What was read.
 * @returns Whether it can be believed, and by how much to dilute if it cannot.
 *
 * @example
 * ```ts
 * import { trust } from "@biolibs/bionet-tools";
 *
 * trust({ nm: 260, shown: 1.84, dilution: 1, path: 1 }).dilute;    // 5
 * ```
 */
export function trust(reading: Reading): Trust {
  const scattering = reading.nm >= 550;
  const high = scattering ? LINEAR.scattering : LINEAR.high;
  if (reading.shown > high) {
    // Enough to land comfortably inside the range rather than on its edge.
    const needed = Math.ceil(reading.shown / (high * 0.6));
    return {
      ok: false, dilute: Math.max(2, needed),
      says: `${round(reading.shown, 3)} is above ${high}, where this reading stops being linear. `
        + `What it shows is lower than the truth, and it does not say so. Dilute ${Math.max(2, needed)}-fold and read again.`,
    };
  }
  if (reading.shown < LINEAR.low) {
    return {
      ok: false,
      says: `${round(reading.shown, 3)} is below ${LINEAR.low}, where the noise of the instrument is a large part of the number. `
        + `Read it neat, or read more of it, or take it as "there is very little here" and no more.`,
    };
  }
  return { ok: true, says: `${round(reading.shown, 3)} is inside ${LINEAR.low}–${high}, which is where this reading is linear.` };
}

/** How much nucleic acid a reading means. */
export interface Amount {
  /** Nanograms in each microlitre. */
  ngPerUl: number;
  /** The factor it was worked out with: micrograms per millilitre at a reading of 1.0. */
  factor: number;
  /** The reading corrected for the dilution and the path, which is the figure the factor applies to. */
  corrected: number;
}

/**
 * How much nucleic acid is in a tube, from its reading at 260 nm.
 *
 * @param reading - What was read.
 * @param sample - Which kind of nucleic acid, which decides the factor.
 * @returns The concentration, the factor used, and the corrected reading.
 *
 * @example
 * ```ts
 * import { nucleicAcid } from "@biolibs/bionet-tools";
 *
 * nucleicAcid({ nm: 260, shown: 0.42, dilution: 10, path: 1 }, "dsDNA").ngPerUl;    // 210
 * ```
 */
export function nucleicAcid(reading: Reading, sample: "dsDNA" | "ssDNA" | "RNA" | "oligo"): Amount {
  const corrected = (reading.shown * reading.dilution) / reading.path;
  const factor = PER_A260[sample];
  // Micrograms per millilitre and nanograms per microlitre are the same number.
  return { ngPerUl: round(corrected * factor, 2), factor, corrected: round(corrected, 4) };
}

/** What the ratios say about what else is in the tube. */
export interface Purity {
  /** The 260/280 ratio, or `null` if 280 was not read or is zero. */
  byProtein: number | null;
  /** The 260/230 ratio, likewise. */
  bySalt: number | null;
  /** What each says, in a line, worst first. */
  says: string[];
}

/**
 * What a sample's ratios say about what else is in it.
 *
 * @param readings - What was shown at 260, 280 and 230 nm, each already corrected or not — only the
 *   ratios matter, and a dilution divides out of both.
 * @param sample - Which kind of nucleic acid, which decides what the 260/280 ratio should be.
 * @returns The two ratios and what they say.
 *
 * @example
 * ```ts
 * import { purity } from "@biolibs/bionet-tools";
 *
 * purity({ a260: 0.42, a280: 0.21 }, "dsDNA").byProtein;    // 2
 * ```
 */
export function purity(readings: { a260: number; a280?: number; a230?: number }, sample: "dsDNA" | "ssDNA" | "RNA" | "oligo"): Purity {
  const ratio = (other: number | undefined): number | null =>
    other === undefined || other === 0 ? null : round(readings.a260 / other, 2);
  const byProtein = ratio(readings.a280);
  const bySalt = ratio(readings.a230);
  const want = sample === "RNA" ? 2 : 1.8;
  const says: string[] = [];
  if (byProtein !== null) {
    if (byProtein < want - 0.1) {
      says.push(`260/280 is ${byProtein}, under the ${want} this kind reads clean at: something absorbing at 280 is in there, `
        + `which is protein, or phenol left from the extraction.`);
    } else if (byProtein > want + 0.3) {
      says.push(`260/280 is ${byProtein}, over ${want}: read at too high a pH, or RNA in a DNA preparation.`);
    } else {
      says.push(`260/280 is ${byProtein}, which is what this kind reads clean at — but it is a weak test. `
        + `Nucleic acid absorbs so much harder at 260 than protein does at 280 that a sample well short of clean still reads near ${want}.`);
    }
  }
  if (bySalt !== null) {
    if (bySalt < 1.8) {
      says.push(`260/230 is ${bySalt}, under the 2.0–2.2 of a clean sample: guanidine, phenol, EDTA or carbohydrate carried over. `
        + `It is the ratio that catches a bad prep, and the one most often ignored.`);
    } else if (bySalt > 2.4) {
      says.push(`260/230 is ${bySalt}, over 2.2, which usually means the blank was wrong rather than the sample unusually clean.`);
    } else {
      says.push(`260/230 is ${bySalt}, inside the 2.0–2.2 of a clean sample.`);
    }
  }
  return { byProtein, bySalt, says: says.sort((a, b) => Number(/under|over/.test(b)) - Number(/under|over/.test(a))) };
}

/** How many cells a culture's reading means. */
export interface Density {
  /** The reading corrected for the dilution and the path. */
  od: number;
  /** Cells in each millilitre. */
  perMl: number;
  /** The host the factor is for, as this knows it. */
  host: string;
  /** The factor: cells per millilitre at a reading of 1.0. */
  factor: number;
}

/**
 * How dense a culture is, from its reading at 600 nm.
 *
 * @param reading - What was read.
 * @param host - What is growing, as the lab names its strain's host.
 * @returns The corrected reading, the cells it means and the factor used, or `null` for a host with
 *   no factor here — in which case the reading is still a reading and the cell count is not known.
 *
 * @example
 * ```ts
 * import { density } from "@biolibs/bionet-tools";
 *
 * density({ nm: 600, shown: 0.6, dilution: 1, path: 1 }, "Escherichia coli")?.perMl;   // 480000000
 * ```
 */
export function density(reading: Reading, host: string): Density | null {
  const known = CELLS_AT_OD1.find((one) => one.host.test(host));
  if (known === undefined) return null;
  const od = round((reading.shown * reading.dilution) / reading.path, 3);
  return { od, perMl: Math.round(od * known.cells), host: known.name, factor: known.cells };
}

/** What to do with a culture at this density, for the host it is. */
export interface Moment {
  /** What the reading says to do now. */
  says: string;
  /** Whether this is the window to induce in. */
  ready: boolean;
}

/**
 * Whether a culture is at the density its host is induced at.
 *
 * @param od - The corrected reading at 600 nm.
 * @param host - What is growing.
 * @returns What to do, or `null` for a host with no rule here.
 *
 * @example
 * ```ts
 * import { moment } from "@biolibs/bionet-tools";
 *
 * moment(0.6, "Escherichia coli")?.ready;    // true
 * ```
 */
export function moment(od: number, host: string): Moment | null {
  if (/escherichia|e\.? ?coli/i.test(host)) {
    if (od < 0.4) return { ready: false, says: `At ${od} it is still early. The usual window to induce in is 0.4–0.8; carry on growing it.`, };
    if (od > 0.8) return { ready: false, says: `At ${od} it is past the usual 0.4–0.8 window. Induce anyway and expect less soluble protein, or dilute back and grow it up again.` };
    return { ready: true, says: `At ${od} it is in the usual 0.4–0.8 window to induce in.` };
  }
  if (/komagataella|pichia/i.test(host)) {
    if (od < 2) return { ready: false, says: `At ${od} there are not enough cells yet. The glycerol phase is usually grown to 2–6 before the switch to methanol.` };
    if (od > 6) return { ready: false, says: `At ${od} it is past the usual 2–6. Spin it down and resuspend in the methanol medium now rather than growing it further.` };
    return { ready: true, says: `At ${od} the glycerol phase is done. Spin it down and resuspend in the methanol medium, usually to a reading of 1.0.` };
  }
  return null;
}

/**
 * How much protein is in a tube, from its reading at 280 nm.
 *
 * A protein's absorbance at 280 nm comes almost entirely from its tryptophans and tyrosines, so
 * this needs the molar extinction coefficient worked out from the sequence, which `proteinFacts`
 * gives from the ProtParam port. A protein with none of those residues absorbs nothing there, and
 * no reading at 280 will say how much of it is in the tube.
 *
 * @param reading - What was read at 280 nm.
 * @param protein - The molar extinction coefficient, in M⁻¹cm⁻¹, and the weight in daltons.
 * @returns Milligrams per millilitre, or `null` if the protein does not absorb at 280 at all.
 *
 * @example
 * ```ts
 * import { proteinAmount } from "@biolibs/bionet-tools";
 *
 * proteinAmount({ nm: 280, shown: 0.5, dilution: 1, path: 1 }, { extinction: 43_000, weight: 24_320 });
 * ```
 */
export function proteinAmount(reading: Reading, protein: { extinction: number; weight: number }): { mgPerMl: number; corrected: number } | null {
  if (protein.extinction <= 0 || protein.weight <= 0) return null;
  const corrected = (reading.shown * reading.dilution) / reading.path;
  // A = ε c l with c in moles per litre; times the weight in daltons gives grams per litre, which
  // is milligrams per millilitre.
  return { mgPerMl: round((corrected / protein.extinction) * protein.weight, 3), corrected: round(corrected, 4) };
}
