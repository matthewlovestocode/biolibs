/**
 * Counting cells under a microscope, which is how a lab answers "how many" without a machine.
 *
 * A haemocytometer is a thick slide with a grid etched into it and a coverslip held exactly a tenth
 * of a millimetre above it. Each large square of the grid is a millimetre on a side, so the liquid
 * over one is 0.1 mm³ — a ten-thousandth of a millilitre. Count what is in a square, multiply by
 * ten thousand and by whatever the sample was diluted, and that is cells in a millilitre.
 *
 * Two things the eyepiece cannot tell you.
 *
 * It cannot tell you whether you counted enough of them to mean it. Cells land in a square at
 * random, so counting is Poisson: the error in a count of N is about the square root of N, which is
 * a fifth of the answer at twenty-five cells and a tenth at a hundred. A number written in a
 * notebook looks exactly as confident either way, and the usual mistake is one square, one glance,
 * and four significant figures.
 *
 * And it cannot tell you whether what you counted is alive. A dead cell looks like a live one until
 * it is stained; trypan blue goes into the ones whose membranes have failed, so they are the blue
 * ones. This is the same hole in the other direction from a spectrophotometer, which measures what
 * scatters light and so counts debris as cells.
 */

/** The chamber a count is made in. */
export interface Chamber {
  /** What it is called. */
  name: string;
  /** How far the coverslip sits above the grid, in millimetres. */
  depth: number;
  /** How big a large square is, in millimetres. */
  square: number;
  /** How many large squares the grid has. */
  squares: number;
}

/** The chambers this bench has. */
export const CHAMBERS: readonly Chamber[] = [
  { name: "Neubauer improved", depth: 0.1, square: 1, squares: 9 },
  { name: "Disposable slide, 0.1 mm", depth: 0.1, square: 1, squares: 4 },
];

/** What a lens is for. */
export interface Objective {
  /** How many times it magnifies. */
  times: number;
  /** What it is used for. */
  what: string;
}

/** The objectives on this microscope. */
export const OBJECTIVES: readonly Objective[] = [
  { times: 4, what: "finding the grid and seeing whether the chamber filled evenly" },
  { times: 10, what: "counting: a large square fits in the field and the cells are still cells" },
  { times: 40, what: "looking at one cell — whether it is budding, whether it is contaminated" },
];

/** How few cells can be counted before the count is mostly chance. */
export const ENOUGH = 100;

/** How many cells in a large square make for an easy, honest count. */
export const PER_SQUARE = { fewest: 20, most: 50 } as const;

/**
 * The volume of liquid over one large square, in millilitres.
 *
 * @param chamber - The chamber.
 * @returns The volume, in millilitres.
 *
 * @example
 * ```ts
 * import { CHAMBERS, squareVolume } from "@biolibs/bionet-tools";
 *
 * squareVolume(CHAMBERS[0]!);    // 0.0001
 * ```
 */
export function squareVolume(chamber: Chamber): number {
  // A square millimetre by a tenth of a millimetre is 0.1 mm³, and a millilitre is 1000 mm³.
  return (chamber.square * chamber.square * chamber.depth) / 1000;
}

/**
 * Cells in a millilitre, from what was counted.
 *
 * @param counted - How many cells were counted, over all the squares counted.
 * @param squares - How many large squares that was.
 * @param dilution - How many times the sample was diluted before it went in: 2 for one part sample
 *   to one part trypan blue, 1 for neat.
 * @param chamber - The chamber. Defaults to the Neubauer.
 * @returns Cells in a millilitre.
 *
 * @example
 * ```ts
 * import { perMillilitre } from "@biolibs/bionet-tools";
 *
 * perMillilitre(120, 4, 2);    // 600000: thirty a square, times ten thousand, doubled for the stain
 * ```
 */
export function perMillilitre(counted: number, squares: number, dilution = 1,
                              chamber: Chamber = CHAMBERS[0]!): number {
  if (squares <= 0) return 0;
  return (counted / squares / squareVolume(chamber)) * dilution;
}

/**
 * How far out a count is likely to be, from the count alone.
 *
 * Cells land in a square at random, so a count of N carries an error of about √N. What that means
 * in practice: counting 25 cells and writing down a number to four figures is writing down three
 * figures of noise.
 *
 * @param counted - How many cells were counted.
 * @returns The error, as a fraction of the count.
 *
 * @example
 * ```ts
 * import { howSure } from "@biolibs/bionet-tools";
 *
 * Math.round(howSure(100) * 100);    // 10: a hundred cells is ten per cent
 * ```
 */
export function howSure(counted: number): number {
  if (counted <= 0) return Infinity;
  return Math.sqrt(counted) / counted;
}

/**
 * How much to dilute a sample so that a square holds a number worth counting.
 *
 * Too many and they overlap and are counted once; too few and the count is chance. Twenty to fifty
 * in a large square is the range where neither is true.
 *
 * @param guess - What the culture is thought to be, in cells a millilitre.
 * @param chamber - The chamber. Defaults to the Neubauer.
 * @returns How many times to dilute it, rounded to something a person would actually pipette.
 *
 * @example
 * ```ts
 * import { dilutionFor } from "@biolibs/bionet-tools";
 *
 * dilutionFor(1e8);    // 200
 * ```
 */
export function dilutionFor(guess: number, chamber: Chamber = CHAMBERS[0]!): number {
  const middle = (PER_SQUARE.fewest + PER_SQUARE.most) / 2;
  const wanted = guess <= 0 ? 1 : guess / (middle / squareVolume(chamber));
  if (wanted <= 1) return 1;
  // Rounded to 1, 2, 5, 10, 20, 50 and so on: the dilutions somebody can make in one step.
  const power = 10 ** Math.floor(Math.log10(wanted));
  const within = wanted / power;
  return (within <= 1.5 ? 1 : within <= 3.5 ? 2 : within <= 7.5 ? 5 : 10) * power;
}

/** What a stained count says about how much of the culture is alive. */
export interface Alive {
  /** How many were counted in all. */
  counted: number;
  /** What fraction of them took no stain. */
  fraction: number;
  /** Whether enough were counted for that fraction to mean anything. */
  enough: boolean;
}

/**
 * How much of what was counted is alive, by what did not take up the stain.
 *
 * @param live - How many were clear.
 * @param dead - How many were blue.
 * @returns The viability.
 *
 * @example
 * ```ts
 * import { alive } from "@biolibs/bionet-tools";
 *
 * Math.round(alive(90, 10).fraction * 100);    // 90
 * ```
 */
export function alive(live: number, dead: number): Alive {
  const counted = live + dead;
  return { counted, fraction: counted <= 0 ? 0 : live / counted, enough: counted >= ENOUGH };
}

/** What a count comes to, and whether it is worth writing down. */
export interface Counted {
  /** Cells in a millilitre. */
  perMl: number;
  /** How many were counted in all. */
  counted: number;
  /** How many that is a square, which decides whether the chamber was loaded well. */
  perSquare: number;
  /** How far out the figure is likely to be, as a fraction. */
  error: number;
  /** Whether enough cells were counted for the figure to mean what it says. */
  enough: boolean;
  /** Whether the squares held a number that can be counted honestly. */
  loaded: "about right" | "too few" | "too many";
  /** What to do about it, said plainly. */
  says: string;
}

/**
 * A count, and what it is worth.
 *
 * @param counted - How many cells were counted.
 * @param squares - Over how many large squares.
 * @param dilution - How many times the sample was diluted.
 * @param chamber - The chamber. Defaults to the Neubauer.
 * @returns What it comes to.
 *
 * @example
 * ```ts
 * import { counting } from "@biolibs/bionet-tools";
 *
 * counting(120, 4, 2).enough;    // true
 * ```
 */
export function counting(counted: number, squares: number, dilution = 1,
                         chamber: Chamber = CHAMBERS[0]!): Counted {
  const perMl = perMillilitre(counted, squares, dilution, chamber);
  const perSquare = squares <= 0 ? 0 : counted / squares;
  const error = howSure(counted);
  const enough = counted >= ENOUGH;
  const loaded = perSquare < PER_SQUARE.fewest ? "too few" : perSquare > PER_SQUARE.most ? "too many" : "about right";
  const says = loaded === "too many"
    ? `About ${Math.round(perSquare)} in a square. They overlap at that density and two touching cells are counted as one, so the figure comes out low. Dilute it further and count again.`
    : !enough
      ? `${counted} cells is an error of about ${Math.round(error * 100)}%. Count more squares until there are ${ENOUGH}, or the figure is mostly chance.`
      : loaded === "too few"
        ? `${counted} cells over ${squares} squares is enough to mean it, though the chamber is thin: a less dilute sample would take fewer squares.`
        : `${counted} cells, about ${Math.round(perSquare)} a square, an error of about ${Math.round(error * 100)}%.`;
  return { perMl, counted, perSquare, error, enough, loaded, says };
}
