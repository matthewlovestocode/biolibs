/**
 * Reading a photograph of a gel.
 *
 * Every other tool on this bench works forwards: the sequences say what a gel should show, and the
 * gel station draws it. This one works backwards from the picture that came out of the imager, and
 * the arithmetic is the same arithmetic run the other way — where a band landed, into the size that
 * landed there, read against the ladder that ran beside it on the same gel.
 *
 * Three things are worth knowing before believing a picture of a gel.
 *
 * The exposure decides what is in it. Too short and a faint band is simply not there; too long and
 * the brightest bands run into the top of what the camera can record, so a strong band and a very
 * strong band come out identical and nothing can be compared. A saturated picture looks better —
 * brighter, more contrast — which is what makes it a trap. The picture does not say which it is.
 *
 * A band's brightness is its mass, not how many molecules are in it. The stain binds along the
 * DNA, so a band of 2,000 bp fragments is twice as bright as a band of 1,000 bp ones holding the
 * same number of molecules. An insert that looks faint beside its vector usually is not.
 *
 * And a size read outside the ladder's own range is an extrapolation. Above the top marker the gel
 * has stopped separating and everything large is bunched together near the wells; the number that
 * comes out of the arithmetic there is arithmetic and not a measurement.
 */
import { sizeFromLadder, type Band } from "@biolibs/gel";

/** Where the camera stops being able to tell one brightness from a greater one. */
export const SATURATED = 0.98;

/** How near the wells a band has to be before the gel has stopped separating, as a fraction of the lane. */
export const COMPRESSED = 0.1;

/** How far a read size may be from an expected one and still be taken as that one. */
export const MATCHES_WITHIN = 0.12;

/** One band as it was measured off the picture. */
export interface Measured {
  /** How far down the lane it is, from 0 at the wells to 1 at the front. */
  position: number;
  /** How bright it came out, from 0 to 1, as the camera recorded it. */
  brightness: number;
}

/** One band, read. */
export interface ReadBand extends Measured {
  /** The size it works out to, in base pairs. */
  size: number;
  /** The two markers it was read between. */
  between: readonly number[];
  /** Whether the size is an extrapolation past the end of the ladder rather than a reading inside it. */
  extrapolated: boolean;
  /** Whether it is so near the wells that the gel has stopped separating there. */
  compressed: boolean;
  /** Whether it is at the top of what the camera can record, so its brightness says nothing. */
  saturated: boolean;
  /** Its share of the molecules in the lane, from its brightness divided by its size. `null` where nothing can be said. */
  share: number | null;
}

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/**
 * Read every band in a lane against the ladder that ran beside it.
 *
 * @param measured - Where each band is and how bright it came out.
 * @param ladder - The ladder's bands as they ran on this gel.
 * @returns Each band with its size and what is wrong with reading it, in the order given.
 *
 * @example
 * ```ts
 * import { readLane } from "@biolibs/bionet-tools";
 * import { gelById, ladderBands, ladderById } from "@biolibs/gel";
 *
 * const ladder = ladderBands(ladderById("1kb").sizes, gelById("1.0"));
 * readLane([{ position: 0.4, brightness: 0.9 }], ladder)[0]?.size;
 * ```
 */
export function readLane(measured: readonly Measured[], ladder: readonly Pick<Band, "size" | "position">[]): ReadBand[] {
  const rungs = [...ladder].filter((one) => one.size > 0).sort((a, b) => a.position - b.position);
  // Brightness is mass, so the molecules in a band are its brightness over its length. The shares
  // are what each band is of the lane, which is the comparison people mean when they say "fainter".
  const read = measured.map((one) => {
    const place = Math.min(1, Math.max(0, one.position));
    const found = rungs.length >= 2 ? sizeFromLadder(place, rungs) : null;
    return {
      ...one, position: place,
      size: found === null ? 0 : Math.round(found.size),
      between: found?.between ?? [],
      extrapolated: found?.extrapolated ?? true,
      compressed: place < COMPRESSED,
      saturated: one.brightness >= SATURATED,
      share: null as number | null,
    };
  });
  const molecules = read.map((one) => (one.size > 0 ? one.brightness / one.size : 0));
  const total = molecules.reduce((sum, one) => sum + one, 0);
  return read.map((one, at) => ({ ...one, share: total > 0 && one.size > 0 ? round(molecules[at]! / total, 4) : null }));
}

/** What the exposure did to the picture. */
export interface Exposure {
  /** Whether anything can be compared in it. */
  ok: boolean;
  /** How many bands are at the top of what the camera records. */
  saturated: number;
  /** How many are so faint that they may be noise. */
  faint: number;
  /** What it says. */
  says: string;
}

/**
 * Whether the exposure left a picture anything can be read off.
 *
 * @param measured - The bands as they came out.
 * @returns What the exposure did, and what to do about it.
 *
 * @example
 * ```ts
 * import { exposure } from "@biolibs/bionet-tools";
 *
 * exposure([{ position: 0.3, brightness: 1 }, { position: 0.6, brightness: 1 }]).ok;    // false
 * ```
 */
export function exposure(measured: readonly Measured[]): Exposure {
  const saturated = measured.filter((one) => one.brightness >= SATURATED).length;
  const faint = measured.filter((one) => one.brightness > 0 && one.brightness < 0.08).length;
  if (measured.length === 0) return { ok: false, saturated: 0, faint: 0, says: "Nothing has been measured off the picture yet." };
  if (saturated > 1) {
    return { ok: false, saturated, faint,
             says: `${saturated} bands are at the top of what the camera records. Above that it cannot tell one brightness from a greater one, `
               + `so those bands are all as bright as each other whatever is in them, and nothing in this picture can be compared with anything else. `
               + `Take it again with a shorter exposure — the picture will look worse and say more.` };
  }
  if (saturated === 1) {
    return { ok: true, saturated, faint,
             says: `One band is at the top of what the camera records. Its size can still be read; how much is in it cannot. `
               + `A shorter exposure would give both.` };
  }
  if (faint > 0) {
    return { ok: true, saturated, faint,
             says: `${faint} ${faint === 1 ? "band is" : "bands are"} barely above nothing. A longer exposure would say whether ${faint === 1 ? "it is" : "they are"} real, `
               + `and a band that is not in the picture is not the same as a band that is not in the tube.` };
  }
  return { ok: true, saturated, faint, says: "Nothing is at the top of what the camera records and nothing is at the bottom, so the brightnesses in this picture can be compared." };
}

/** What a read lane came to, against what was expected of it. */
export interface LaneAgainst {
  /** Each expected size, and the band read as it, if one was. */
  expected: { size: number; seen: ReadBand | null }[];
  /** Bands read that nothing expected. */
  extra: ReadBand[];
  /** Expected sizes nothing was read as. */
  missing: number[];
  /** What it says, worst first. */
  says: string[];
}

/**
 * A lane read against what was expected of it.
 *
 * Named for the lane because `against` in `electro.ts` is a different comparison: that one is a
 * pulse against the settings a host is published at.
 *
 * @param read - The bands as read.
 * @param expected - The sizes the plan said to expect, in base pairs.
 * @param within - How far a read size may be from an expected one and still be it, as a fraction.
 * @returns Which band is which, what is missing, what is there that should not be.
 *
 * @example
 * ```ts
 * import { laneAgainst } from "@biolibs/bionet-tools";
 *
 * laneAgainst(read, [2806, 2206]).missing;    // the ones nothing was read as
 * ```
 */
export function laneAgainst(read: readonly ReadBand[], expected: readonly number[], within = MATCHES_WITHIN): LaneAgainst {
  const spare = [...read];
  const matched = [...expected].sort((a, b) => b - a).map((size) => {
    // The nearest unclaimed band, where it is near enough to be that one at all.
    let best = -1;
    let off = Infinity;
    for (const [at, band] of spare.entries()) {
      const apart = Math.abs(band.size - size) / size;
      if (apart <= within && apart < off) { best = at; off = apart; }
    }
    return { size, seen: best === -1 ? null : spare.splice(best, 1)[0]! };
  });
  const missing = matched.filter((one) => one.seen === null).map((one) => one.size);
  const says: string[] = [];
  if (missing.length > 0) {
    says.push(`Nothing ran where ${missing.map((one) => `${one.toLocaleString("en-US")} bp`).join(" or ")} should have. `
      + `Either it is not in the tube, or it is under what this exposure shows, or the thing in the tube is not what it was thought to be.`);
  }
  if (spare.length > 0) {
    says.push(`${spare.length} ${spare.length === 1 ? "band" : "bands"} nothing expected: `
      + `${spare.map((one) => `${one.size.toLocaleString("en-US")} bp`).join(", ")}. `
      + `A partial cut leaves the uncut piece and the pieces either side of one site; a second thing in the tube leaves its own bands.`);
  }
  if (says.length === 0) says.push("Every band expected is there and there is nothing else, which is what this gel was run to find out.");
  return { expected: matched, extra: spare, missing, says };
}

/**
 * Why one band looks fainter than another, when it may not hold less.
 *
 * @param faint - The band that looks fainter.
 * @param bright - The one it is being compared with.
 * @returns What to make of it, or `null` where there is nothing to say.
 *
 * @example
 * ```ts
 * import { whyFainter } from "@biolibs/bionet-tools";
 *
 * whyFainter({ size: 500, brightness: 0.3 }, { size: 3000, brightness: 0.9 });
 * ```
 */
export function whyFainter(faint: Pick<ReadBand, "size" | "brightness">, bright: Pick<ReadBand, "size" | "brightness">): string | null {
  if (faint.size <= 0 || bright.size <= 0 || faint.brightness >= bright.brightness) return null;
  const sizes = round(bright.size / faint.size, 2);
  const looks = round(bright.brightness / faint.brightness, 2);
  const molecules = round(sizes / looks, 2);
  if (molecules >= 1.15) {
    return `The ${faint.size.toLocaleString("en-US")} bp band looks ${looks}× fainter, but it is ${sizes}× shorter, and the stain binds along the DNA. `
      + `There are about ${molecules}× as many molecules in it as in the ${bright.size.toLocaleString("en-US")} bp one, not fewer.`;
  }
  if (molecules <= 0.85) {
    return `The ${faint.size.toLocaleString("en-US")} bp band is ${looks}× fainter and only ${sizes}× shorter, so after allowing for its length `
      + `there are about ${molecules}× as many molecules in it as in the ${bright.size.toLocaleString("en-US")} bp one — there really is less of it.`;
  }
  return `The ${faint.size.toLocaleString("en-US")} bp band looks ${looks}× fainter, which is about what being ${sizes}× shorter would do on its own: `
    + `the two hold roughly the same number of molecules.`;
}
