/**
 * What a lab has in it before anybody has written anything down.
 *
 * A lab is not a bare room that grows a thermocycler the first time somebody needs one. It is a
 * room with the usual machines already standing in it, and the work is to find out what is in the
 * freezer. So founding a lab writes the usual kit, and a lab that has not got one of these retires
 * it — which is a thing to record, and quicker than typing in seven machines before a first PCR.
 *
 * Every instrument here is one the scene knows how to draw and the tools know how to use. Nothing
 * here is a guess at what a particular lab owns; it is what a lab of this kind has, offered so that
 * it can be corrected.
 */

/** One thing the kit puts in a lab. `at` is the name of the place it stands in, or `null` for the room. */
export interface KitPlace {
  /** What it is: `room`, `bench`, `freezer`, `fridge`, `box` or `instrument`. */
  kind: string;
  /** What it is called. */
  name: string;
  /** The name of the place it stands in, or `null` for the lab itself. */
  at: string | null;
  /** Which model of instrument, for the shape it is drawn as and the tool it opens. */
  model?: string;
  /** For a box, how many rows and columns of positions it has. */
  grid?: { rows: number; columns: number };
}

/**
 * The usual kit, in the order it is written.
 *
 * A place is named before anything that stands in it, so that each can be written as soon as it is
 * reached. The four instruments the tools are used at come first on the first bench, since those are
 * the ones a lab reaches for; the rest are what makes a room a lab rather than a diagram of one.
 */
export const STANDARD_KIT: readonly KitPlace[] = [
  { kind: "room", name: "Main lab", at: null },
  { kind: "bench", name: "Bench 1", at: "Main lab" },
  { kind: "bench", name: "Bench 2", at: "Main lab" },
  { kind: "freezer", name: "−80 freezer", at: "Main lab" },
  { kind: "fridge", name: "4 °C fridge", at: "Main lab" },
  // The four a tool opens at.
  { kind: "instrument", name: "Thermocycler", at: "Bench 1", model: "thermocycler" },
  { kind: "instrument", name: "Gel station", at: "Bench 1", model: "gel-station" },
  { kind: "instrument", name: "Heat block", at: "Bench 1", model: "heat-block" },
  { kind: "instrument", name: "Shaking incubator", at: "Bench 1", model: "shaking-incubator" },
  // The rest of what stands in a lab. No tool opens at these yet; they are where they are because
  // a room without them does not look like the room the work happens in.
  { kind: "instrument", name: "Centrifuge", at: "Bench 2", model: "centrifuge" },
  { kind: "instrument", name: "Microscope", at: "Bench 2", model: "microscope" },
  { kind: "instrument", name: "Computer", at: "Bench 2", model: "computer" },
  // Somewhere to put a tube the moment there is one.
  { kind: "box", name: "Box 1", at: "−80 freezer", grid: { rows: 9, columns: 9 } },
  { kind: "box", name: "Box F1", at: "4 °C fridge", grid: { rows: 5, columns: 5 } },
];
