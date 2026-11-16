/**
 * A lab to look at: one room, a −80 freezer full of boxes, a fridge, two benches and their
 * instruments.
 *
 * It is here so that anything that draws a lab has one to draw before a real one exists, and so that
 * tests have something of a realistic size. The room, the freezer, the fridge and the benches say
 * where they stand; the shelves, racks and boxes do not, and are arranged for them — which is the
 * mix a real lab will have.
 *
 * It is the same every time it is made. The tubes are scattered by a fixed sequence, not by chance.
 */
import type { Layout, Place, Stored } from "./model.js";

/** What the example freezer is stocked with. The first seven are the parts the Wren Lab publishes. */
const PARTS = ["f1", "f2", "acceptor", "part1", "part2", "template", "backbone", "pUC19", "pET-28a", "pBR322", "pGEX-4T-1",
               "GFP insert", "mCherry insert", "lacZα", "T7 promoter", "Cas9", "sgRNA scaffold", "AmpR cassette", "KanR cassette",
               "pSB1C3", "RFP reporter"];

/** A sequence of numbers between 0 and 1 that is the same every time. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Make the example lab.
 *
 * @returns Its places and what is stored in them.
 *
 * @example
 * ```ts
 * import { arrange, exampleLab, search } from "@biolibs/bionet-space";
 *
 * const lab = exampleLab();
 * lab.places.filter((place) => place.kind === "box").length;   // 72
 * search(lab, "puc19").length > 0;                              // true
 * arrange(lab).length === lab.places.length;                    // true: everything has somewhere to stand
 * ```
 */
export function exampleLab(): Layout {
  const next = sequence(20261115);
  const places: Place[] = [
    { id: "main", kind: "room", name: "Main lab", parent: null, standing: { position: [0, 0, 0], size: [7, 2.8, 5] } },
    { id: "minus80", kind: "freezer", name: "−80 freezer", parent: "main", standing: { position: [-2.7, 0, -1.975], size: [0.9, 2.0, 0.85] } },
    { id: "fridge", kind: "fridge", name: "4 °C fridge", parent: "main", standing: { position: [-1.6, 0, -2.05], size: [0.7, 1.8, 0.7] } },
    { id: "bench1", kind: "bench", name: "Bench 1", parent: "main", standing: { position: [0.7, 0, -2.0], size: [2.4, 0.9, 0.75] } },
    { id: "bench2", kind: "bench", name: "Bench 2", parent: "main", standing: { position: [3.0, 0, 0.3], size: [2.2, 0.9, 0.75], turn: 90 } },
    { id: "thermocycler", kind: "instrument", model: "thermocycler", name: "Thermocycler", parent: "bench1" },
    { id: "gel", kind: "instrument", model: "gel-station", name: "Gel station", parent: "bench1" },
    { id: "centrifuge", kind: "instrument", model: "centrifuge", name: "Centrifuge", parent: "bench1" },
    { id: "computer", kind: "instrument", model: "computer", name: "Computer", parent: "bench2" },
    { id: "microscope", kind: "instrument", model: "microscope", name: "Microscope", parent: "bench2" },
  ];
  const stored: Stored[] = [];
  let tubes = 0;

  /** Add a box, and scatter tubes in it. */
  const box = (id: string, name: string, parent: string, rows: number, columns: number, fullness: number): void => {
    places.push({ id, kind: "box", name, parent, grid: { rows, columns } });
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (next() >= fullness) continue;
        const part = PARTS[Math.floor(next() * PARTS.length)]!;
        tubes++;
        stored.push({ item: `tube-${String(tubes).padStart(4, "0")}`, place: id, slot: { row, column }, part: `example:${part}`, name: part,
                      amount: 5 + Math.floor(next() * 46), unit: "µL", ...(next() < 0.012 ? { needsRecount: true } : {}) });
      }
    }
  };

  // The freezer: four shelves, three racks on each, five boxes of 81 in each rack.
  for (let shelf = 1; shelf <= 4; shelf++) {
    places.push({ id: `minus80-s${shelf}`, kind: "shelf", name: `Shelf ${shelf}`, parent: "minus80" });
    for (const rack of ["A", "B", "C"]) {
      const rackId = `minus80-s${shelf}-${rack}`;
      places.push({ id: rackId, kind: "rack", name: `Rack ${shelf}${rack}`, parent: `minus80-s${shelf}` });
      for (let at = 1; at <= 5; at++) {
        // Some boxes are nearly full, some nearly empty, and a few have nothing in them yet.
        const fullness = next() < 0.15 ? 0 : 0.15 + next() * 0.8;
        box(`${rackId}-${at}`, `Box ${shelf}${rack}${at}`, rackId, 9, 9, fullness);
      }
    }
  }
  // The fridge: three shelves with four boxes of 25 standing on each.
  for (let shelf = 1; shelf <= 3; shelf++) {
    places.push({ id: `fridge-s${shelf}`, kind: "shelf", name: `Shelf ${shelf}`, parent: "fridge" });
    for (let at = 1; at <= 4; at++) box(`fridge-s${shelf}-${at}`, `Box F${shelf}-${at}`, `fridge-s${shelf}`, 5, 5, 0.2 + next() * 0.6);
  }
  return { places, stored };
}
