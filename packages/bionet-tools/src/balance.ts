/**
 * Weighing something out, which is where nearly every protocol on this bench starts.
 *
 * A balance is the simplest machine in the lab and the one that is wrong most often, because what
 * it is asked for is never a mass. It is asked for a concentration in a volume, and the mass is
 * arithmetic done in somebody's head between the bottle and the pan.
 *
 * Two things the machine cannot tell you.
 *
 * It cannot tell you whether the number you worked out belongs to the bottle in your hand. Most
 * salts on a shelf are hydrates, and the water is part of the mass: magnesium sulfate heptahydrate
 * is 246.47 g/mol and the anhydrous salt is 120.37, so a litre of 1 M made from the heptahydrate
 * using the anhydrous mass is half strength. Nothing about the weighing goes wrong. The balance
 * reads what it was given, the solution dissolves, the label says 1 M, and everything downstream
 * is quietly out by a factor of two.
 *
 * And it cannot tell you whether it is the right balance for the mass. A balance reading to two
 * decimal places is an excellent balance and a terrible way to weigh 20 mg: the last digit is
 * 10 mg, so the answer is somewhere in a ±50% range and reads as a confident 0.02 g. The mass and
 * the readability together decide whether a weighing means anything, and only one of them is on
 * the display.
 */

/** A balance a lab of this size has. */
export interface Balance {
  /** What it is called. */
  name: string;
  /** The smallest difference it shows, in grams: the last digit of the display. */
  readability: number;
  /** The most it will weigh, in grams. */
  capacity: number;
}

/** The balances on this bench. */
export const BALANCES: readonly Balance[] = [
  { name: "Bench balance, 2 decimal places", readability: 0.01, capacity: 2200 },
  { name: "Analytical balance, 4 decimal places", readability: 0.0001, capacity: 220 },
];

/** Something weighed out, as the bottle on the shelf has it. */
export interface Reagent {
  /** What the bottle says. */
  name: string;
  /** Its formula, including any water of crystallisation. */
  formula: string;
  /** What a mole of what is in the bottle weighs, in grams: the hydrate's mass where it is one. */
  mass: number;
  /** What a mole of the dry salt weighs, where the bottle holds a hydrate. */
  dry?: number;
  /** What it is for, said in a few words. */
  what: string;
}

/**
 * What this bench weighs out.
 *
 * The hydrates are here on purpose, with both masses, because the gap between them is the mistake
 * this tool exists to catch.
 */
export const REAGENTS: readonly Reagent[] = [
  { name: "Sodium chloride", formula: "NaCl", mass: 58.44, what: "salt, in nearly every buffer and in LB" },
  { name: "Tris base", formula: "C₄H₁₁NO₃", mass: 121.14, what: "the buffer in TAE, TE and most gels" },
  { name: "EDTA, disodium dihydrate", formula: "C₁₀H₁₄N₂Na₂O₈·2H₂O", mass: 372.24, dry: 336.21,
    what: "takes the magnesium a nuclease needs, so DNA keeps" },
  { name: "Magnesium sulfate heptahydrate", formula: "MgSO₄·7H₂O", mass: 246.47, dry: 120.37,
    what: "magnesium for media and for competent cells" },
  { name: "Magnesium chloride hexahydrate", formula: "MgCl₂·6H₂O", mass: 203.30, dry: 95.21,
    what: "magnesium for a PCR, where the amount decides whether it works" },
  { name: "Calcium chloride dihydrate", formula: "CaCl₂·2H₂O", mass: 147.01, dry: 110.98,
    what: "what makes cells competent, the old way" },
  { name: "Glucose, anhydrous", formula: "C₆H₁₂O₆", mass: 180.16, what: "what the cells eat" },
  { name: "Sodium phosphate dibasic heptahydrate", formula: "Na₂HPO₄·7H₂O", mass: 268.07, dry: 141.96,
    what: "the other half of a phosphate buffer" },
  { name: "Potassium phosphate monobasic", formula: "KH₂PO₄", mass: 136.09, what: "the acid half of a phosphate buffer" },
  { name: "Glycine", formula: "C₂H₅NO₂", mass: 75.07, what: "the running buffer for a protein gel" },
  { name: "Sodium dodecyl sulfate", formula: "C₁₂H₂₅NaO₄S", mass: 288.38, what: "what unfolds a protein and carries its charge" },
  { name: "Ampicillin, sodium salt", formula: "C₁₆H₁₈N₃NaO₄S", mass: 371.39, what: "what only the cells that took the plasmid survive" },
];

/** Things weighed as a fraction of the volume rather than as a concentration. */
export const BY_PERCENT: readonly { name: string; percent: number; what: string }[] = [
  { name: "Agarose", percent: 1, what: "a gel that separates from about 0.5 to 10 kb" },
  { name: "Agarose, for small fragments", percent: 2, what: "a gel that separates below about 1 kb" },
  { name: "Yeast extract", percent: 0.5, what: "LB" },
  { name: "Tryptone", percent: 1, what: "LB" },
  { name: "Agar", percent: 1.5, what: "what makes LB a plate rather than a broth" },
];

/**
 * What to weigh out for a concentration in a volume.
 *
 * @param molar - The concentration wanted, in moles a litre.
 * @param litres - How much of it, in litres.
 * @param gramsPerMole - What a mole of the bottle's contents weighs.
 * @returns The mass, in grams.
 *
 * @example
 * ```ts
 * import { massFor } from "@biolibs/bionet-tools";
 *
 * massFor(0.5, 1, 58.44);    // 29.22: half a mole of salt in a litre
 * ```
 */
export function massFor(molar: number, litres: number, gramsPerMole: number): number {
  return molar * litres * gramsPerMole;
}

/**
 * What a mass in a volume comes to, which is the same arithmetic read backwards.
 *
 * @param grams - What was weighed.
 * @param litres - What it was made up to.
 * @param gramsPerMole - What a mole of it weighs.
 * @returns The concentration, in moles a litre.
 *
 * @example
 * ```ts
 * import { molarityOf } from "@biolibs/bionet-tools";
 *
 * molarityOf(29.22, 1, 58.44);    // 0.5
 * ```
 */
export function molarityOf(grams: number, litres: number, gramsPerMole: number): number {
  if (litres <= 0 || gramsPerMole <= 0) return 0;
  return grams / (litres * gramsPerMole);
}

/**
 * What to weigh out for a percentage, which means grams in a hundred millilitres.
 *
 * Agarose, agar, yeast extract and tryptone are all weighed this way, and none of them has a
 * molecular weight worth using: they are mixtures, or polymers of no fixed length.
 *
 * @param percent - The percentage wanted, by mass in volume.
 * @param millilitres - How much of it.
 * @returns The mass, in grams.
 *
 * @example
 * ```ts
 * import { percentMass } from "@biolibs/bionet-tools";
 *
 * percentMass(1, 50);    // 0.5: a 1% gel in 50 mL
 * ```
 */
export function percentMass(percent: number, millilitres: number): number {
  return (percent / 100) * millilitres;
}

/** How much of a stock to take, and what to make it up with. */
export interface FromStock {
  /** How much stock, in millilitres. */
  stock: number;
  /** How much to add to it, in millilitres. */
  diluent: number;
  /** How many times it is being diluted. */
  fold: number;
}

/**
 * How much of a stock makes a volume of a working solution.
 *
 * Nothing is weighed here — it is the other half of the same job, and the reason a stock is made
 * at all. Weighing 50 mM of something into 10 mL is weighing a few milligrams, which is below what
 * a bench balance can say anything about; weighing a 1 M stock and taking a little is not.
 *
 * @param want - The concentration wanted, in any unit.
 * @param volume - How much of it, in millilitres.
 * @param stock - What the stock is, in the same unit as `want`.
 * @returns How much stock and how much diluent, or `null` if the stock is too weak.
 *
 * @example
 * ```ts
 * import { fromStock } from "@biolibs/bionet-tools";
 *
 * fromStock(50, 500, 1000)!.stock;    // 25: 25 mL of 1 M into 500 mL of 50 mM
 * ```
 */
export function fromStock(want: number, volume: number, stock: number): FromStock | null {
  if (want <= 0 || volume <= 0 || stock <= 0 || want > stock) return null;
  const take = (want * volume) / stock;
  return { stock: take, diluent: volume - take, fold: stock / want };
}

/** How a weighing on a particular balance turns out. */
export interface Weighing {
  /** The mass asked for, in grams. */
  grams: number;
  /** What the display can show, rounded to the balance's last digit. */
  reads: number;
  /** How far out the reading can be, as a fraction of the mass. */
  error: number;
  /** Whether this balance can say anything useful about a mass this size. */
  enough: boolean;
}

/** How far out a weighing may be before it is not worth doing on that balance. */
export const WITHIN = 0.001;

/**
 * The smallest mass a balance can weigh and still mean it.
 *
 * Half the last digit is the most a reading can be out by, so the smallest honest mass is that
 * half-digit divided by the error you are willing to carry.
 *
 * @param balance - The balance.
 * @param within - The error allowed, as a fraction. Defaults to {@link WITHIN}, a tenth of a per cent.
 * @returns The mass, in grams.
 *
 * @example
 * ```ts
 * import { BALANCES, leastWeighable } from "@biolibs/bionet-tools";
 *
 * leastWeighable(BALANCES[0]!);    // 5: a two-place balance means nothing under five grams
 * ```
 */
export function leastWeighable(balance: Balance, within: number = WITHIN): number {
  if (within <= 0) return Infinity;
  return balance.readability / 2 / within;
}

/**
 * What a balance makes of a mass: what it shows, and how much of that is the balance.
 *
 * @param balance - The balance.
 * @param grams - The mass wanted.
 * @param within - The error allowed, as a fraction.
 * @returns What the weighing comes to.
 *
 * @example
 * ```ts
 * import { BALANCES, weighing } from "@biolibs/bionet-tools";
 *
 * weighing(BALANCES[0]!, 0.02).enough;    // false: 20 mg on a two-place balance
 * ```
 */
export function weighing(balance: Balance, grams: number, within: number = WITHIN): Weighing {
  const steps = Math.round(grams / balance.readability);
  const reads = steps * balance.readability;
  const error = grams <= 0 ? Infinity : balance.readability / 2 / grams;
  return { grams, reads, error, enough: grams >= leastWeighable(balance, within) && grams <= balance.capacity };
}

/**
 * Which balance to use for a mass: the one that can say something about it.
 *
 * @param grams - The mass.
 * @param balances - The balances to choose between. Defaults to {@link BALANCES}.
 * @returns The coarsest balance that still means it, or `null` where none does.
 *
 * @example
 * ```ts
 * import { balanceFor } from "@biolibs/bionet-tools";
 *
 * balanceFor(0.02)?.readability;    // 0.0001: too little for the bench balance
 * ```
 */
export function balanceFor(grams: number, balances: readonly Balance[] = BALANCES): Balance | null {
  const able = balances.filter((one) => weighing(one, grams).enough);
  return able.length === 0 ? null : able.reduce((worst, one) => (one.readability > worst.readability ? one : worst));
}

/**
 * How far out a solution is when a hydrate is weighed by the dry salt's mass.
 *
 * This is the mistake the tool is built round. It never shows up in the weighing: the balance is
 * right, the salt dissolves, the label is written, and the solution is weak by the fraction of the
 * bottle's mass that is water.
 *
 * @param reagent - The reagent, as the bottle has it.
 * @returns How strong the solution would come out, as a fraction of what the label says, or `null`
 *   where the bottle holds no water.
 *
 * @example
 * ```ts
 * import { REAGENTS, byDryMass } from "@biolibs/bionet-tools";
 *
 * const magnesium = REAGENTS.find((one) => one.name.startsWith("Magnesium sulfate"))!;
 * Math.round(byDryMass(magnesium)! * 100);    // 49: a 1 M stock that is half strength
 * ```
 */
export function byDryMass(reagent: Reagent): number | null {
  if (reagent.dry === undefined || reagent.dry <= 0) return null;
  return reagent.dry / reagent.mass;
}

/** How much of a hydrate's mass is water, as a fraction. */
export function waterIn(reagent: Reagent): number | null {
  const strength = byDryMass(reagent);
  return strength === null ? null : 1 - strength;
}
