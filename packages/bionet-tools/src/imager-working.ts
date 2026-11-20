/**
 * The working behind what the gel imager tool says.
 *
 * Reading a size off a gel is interpolation between two markers, done in the logarithm, and it says
 * so. Reading how much is in a band is that reading divided by its length, and it says that too —
 * because the thing people get wrong here is not the arithmetic, it is forgetting that brightness
 * is mass and not molecules.
 */
import { COMPRESSED, type ReadBand } from "./imager.js";
import type { Working } from "./pcr-working.js";

const count = (value: number): string => value.toLocaleString("en-US");
const tidy = (value: number, places = 3): string => `${Math.round(value * 10 ** places) / 10 ** places}`;

/**
 * How a place on the gel became a size.
 *
 * @param band - The band, read.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { sizeWorking } from "@biolibs/bionet-tools";
 *
 * sizeWorking(read[0]!).comes;    // "2,806 bp"
 * ```
 */
export function sizeWorking(band: ReadBand): Working {
  const [above, below] = [band.between[0], band.between[1]];
  return {
    of: "What size ran there", comes: `${count(band.size)} bp`, kind: "estimate",
    steps: [
      `The band is ${Math.round(band.position * 100)}% of the way from the wells to the front.`,
      above === undefined || below === undefined
        ? "There were not two markers to read it between."
        : `It sits between the ${count(above)} bp and ${count(below)} bp markers of the ladder that ran beside it.`,
      "Size against distance is straight in the logarithm over the range a gel separates, so the reading is done there rather than on the sizes themselves.",
      ...(band.extrapolated ? ["It is outside the ladder's own range, so this is carried on past the end of the markers rather than read between two of them."] : []),
      ...(band.compressed ? [`It is in the top ${Math.round(COMPRESSED * 100)}% of the lane, where the gel has stopped separating and everything large is bunched together.`] : []),
    ],
    rests: band.extrapolated
      ? "Past the end of a ladder the number is arithmetic and not a measurement. Run it again on a gel "
        + "whose ladder brackets it, or on a different percentage of agarose, and read it there."
      : "A gel is read to a few per cent at best: how evenly it ran, how square the picture is and where "
        + "the middle of a fat band is taken to be all move this more than the arithmetic does.",
  };
}

/**
 * How bright a band is, into how much is in it.
 *
 * @param bands - Every band in the lane, read.
 * @returns The working.
 */
export function moleculesWorking(bands: readonly ReadBand[]): Working {
  const usable = bands.filter((one) => one.size > 0 && one.share !== null);
  const saturated = bands.filter((one) => one.saturated);
  return {
    of: "How much is in each band", comes: usable.length === 0 ? "not known" : `${usable.map((one) => `${Math.round((one.share ?? 0) * 100)}%`).join(" · ")}`,
    kind: "estimate",
    steps: [
      "The stain binds along the DNA, so a band's brightness is the mass in it, not the number of molecules.",
      ...usable.map((one) => `${count(one.size)} bp at ${tidy(one.brightness, 2)} brightness: ${tidy(one.brightness, 2)} ÷ ${count(one.size)} is what that is in molecules.`),
      usable.length === 0 ? "Nothing in this lane can be divided." : "Each of those as a share of them all is what is above.",
      ...(saturated.length > 0 ? [`${saturated.length} of them ${saturated.length === 1 ? "is" : "are"} at the top of what the camera records, so ${saturated.length === 1 ? "its brightness is" : "their brightnesses are"} a floor and not a figure.`] : []),
    ],
    rests: "This assumes one stain, evenly through the gel, and a camera whose brightness rises with what "
      + "is there. It is good enough to say which band holds more and poor enough that a number from it "
      + "should not be put in a method.",
  };
}

/** Both of them, for a lane. */
export function imagerWorking(bands: readonly ReadBand[]): Working[] {
  return [...bands.map((one) => sizeWorking(one)), moleculesWorking(bands)];
}
