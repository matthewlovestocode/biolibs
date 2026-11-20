/**
 * Giving every place somewhere to stand.
 *
 * A place that says where it stands is put there. One that does not is arranged by what it is:
 * shelves split a freezer's height between them, racks share a shelf side by side, boxes stack in a
 * rack. So a lab that has only ever said what is inside what still has a shape that can be drawn,
 * and one that has been measured is drawn as measured.
 *
 * The result is in the lab's own coordinates, with turning already worked in. Every place comes out
 * as a box with its sides along the axes, because places turn only by quarter turns — which is what
 * keeps this arithmetic and not geometry.
 */
import type { Arranged, Layout, Place, Slot, Standing, Turn } from "./model.js";

/** How big something is when nobody has said, by kind, in metres: wide, tall, deep. */
export const DEFAULT_SIZE: Readonly<Record<string, readonly [number, number, number]>> = {
  // A room a lab of this size actually works in. The kit alone is fifteen metres of wall, and a
  // room that only just holds it is a room nobody can move a trolley through: this leaves the back
  // and one side for the benches and the cold storage, with the middle of the floor clear.
  room: [12, 3, 9],
  freezer: [0.9, 2.0, 0.85],
  fridge: [0.7, 1.8, 0.7],
  bench: [1.8, 0.9, 0.75],
  instrument: [0.4, 0.3, 0.4],
  box: [0.134, 0.052, 0.134],
};

/** How big an instrument is by model, where that differs from the default. */
export const INSTRUMENT_SIZE: Readonly<Record<string, readonly [number, number, number]>> = {
  thermocycler: [0.35, 0.25, 0.45],
  "gel-station": [0.45, 0.18, 0.3],
  "heat-block": [0.2, 0.12, 0.2],
  "shaking-incubator": [0.6, 0.45, 0.55],
  centrifuge: [0.4, 0.3, 0.45],
  computer: [0.5, 0.4, 0.25],
  microscope: [0.3, 0.45, 0.4],
  spectrophotometer: [0.45, 0.3, 0.4],
  electroporator: [0.3, 0.18, 0.3],
  "water-bath": [0.45, 0.25, 0.35],
  balance: [0.25, 0.3, 0.35],
  vortex: [0.16, 0.14, 0.2],
  "gel-imager": [0.5, 0.55, 0.45],
  // The three that stand on the floor rather than on a bench.
  incubator: [0.6, 0.9, 0.6],
  "biosafety-cabinet": [1.3, 1.5, 0.8],
  autoclave: [0.7, 1.2, 0.8],
};

/** The smallest room this would ever ask for, in metres: a room somebody can work in at all. */
const SMALLEST_ROOM: readonly [number, number] = [5, 4];

/**
 * How big a room has to be to hold these things round its walls, with room to spare.
 *
 * A room is laid out round its walls, so what it needs is wall rather than floor: the widths of
 * what stands in it, the gaps between them, and a corner at each end of each wall that nothing can
 * use. This works back from that to a room that holds them twice over, because a room that holds
 * its contents exactly is a room laid out in a single unbroken ring with nowhere to stand.
 *
 * @param sizes - What stands on the floor: how wide, tall and deep each one is, in metres.
 * @param tall - How high to make it, in metres.
 * @returns A room size, as wide, tall and deep, three parts wide to four deep.
 *
 * @example
 * ```ts
 * import { roomFor } from "@biolibs/bionet-space";
 *
 * // Four benches, a freezer, a fridge and three floor units: about twelve metres by nine.
 * roomFor([[1.8, 0.9, 0.75], [0.9, 2, 0.85]]);
 * ```
 */
export function roomFor(sizes: readonly (readonly [number, number, number])[], tall = 3): [number, number, number] {
  // A room with nothing in it is a small room. The floor is not the default room, which is the
  // size the kit needs: a lab that has a bench and nothing else should not be given a hall.
  if (sizes.length === 0) return [SMALLEST_ROOM[0], tall, SMALLEST_ROOM[1]];
  const run = sizes.reduce((sum, size) => sum + size[0], 0) + ROOM_GAP * (sizes.length - 1);
  const deepest = Math.max(...sizes.map((size) => size[2]));
  // A room three parts wide to four deep, whose walls come to twice the run that has to go on them.
  // The corners are the eight ends of the four walls, each costing the depth of the deepest thing.
  const DEEP = 0.75;
  const wide = (2 * run + 8 * deepest) / (2 * (1 - 2 * INSET) * (1 + DEEP));
  const round = (value: number): number => Math.max(1, Math.ceil(value * 2) / 2);
  return [Math.max(SMALLEST_ROOM[0], round(wide)), tall, Math.max(SMALLEST_ROOM[1], round(wide * DEEP))];
}

/** How much of a place's inside is kept clear of its walls, as a fraction of each side. */
const INSET = 0.06;
/** The gap left between things arranged side by side, in metres. */
const GAP = 0.02;
/** The gap between two things standing side by side on a room's floor, in metres. */
const ROOM_GAP = 0.4;
/** How far off a wall a thing standing against it is, in metres. */
const WALL = 0.1;

const sizeOf = (place: Place): [number, number, number] => {
  if (place.standing !== undefined) return [...place.standing.size];
  const size = (place.kind === "instrument" && place.model !== undefined ? INSTRUMENT_SIZE[place.model] : undefined)
            ?? DEFAULT_SIZE[place.kind] ?? [0.5, 0.5, 0.5];
  return [...size];
};

/** Turn an offset measured in a turned place into the lab's directions. */
function turned([x, y, z]: [number, number, number], turn: Turn): [number, number, number] {
  switch (turn) {
    case 90: return [-z, y, x];
    case 180: return [-x, y, -z];
    case 270: return [z, y, -x];
    default: return [x, y, z];
  }
}

/** A size as it lies once turned: a quarter turn swaps wide and deep. */
const lying = ([w, h, d]: [number, number, number], turn: Turn): [number, number, number] =>
  (turn === 90 || turn === 270 ? [d, h, w] : [w, h, d]);

/**
 * Where each child stands inside a parent that has not been told, measured from the centre of the
 * parent's base, with the parent facing front.
 *
 * @param parent - The size of the parent: wide, tall, deep.
 * @param kind - What the parent is.
 * @param children - The children with no standing of their own, in order.
 * @returns A standing for each, in the same order.
 */
function byDefault(parent: [number, number, number], kind: string, children: Place[]): Standing[] {
  const [W, H, D] = parent;
  const inside: [number, number, number] = [W * (1 - 2 * INSET), H * (1 - 2 * INSET), D * (1 - 2 * INSET)];
  const floor = H * INSET;
  const count = children.length;
  const sample = children[0]!.kind;

  if (sample === "shelf") {
    // Shelves split the height between them, the first at the top.
    const each = inside[1] / count;
    return children.map((_, at) => ({ position: [0, floor + (count - 1 - at) * each, 0], size: [inside[0], each - GAP, inside[2]] }));
  }
  if (sample === "box") {
    // Boxes keep their own size and stack: upwards first, then across, then towards the back.
    const [w, h, d] = sizeOf(children[0]!);
    const high = Math.max(1, Math.floor((inside[1] + GAP) / (h + GAP)));
    const across = Math.max(1, Math.floor((inside[0] + GAP) / (w + GAP)));
    return children.map((_, at) => {
      const level = at % high;
      const column = Math.floor(at / high) % across;
      const back = Math.floor(at / (high * across));
      return {
        position: [-inside[0] / 2 + w / 2 + column * (w + GAP), floor + level * (h + GAP), inside[2] / 2 - d / 2 - back * (d + GAP)],
        size: [w, h, d],
      };
    });
  }
  if (kind === "room") {
    // A room is laid out round its walls, starting at the back and going on round, so the middle of
    // it stays clear. That is how a lab is arranged and why: the floor in the middle is where people
    // and trolleys go. Rows marching forward from the back wall fill a room the way a warehouse is
    // filled and leave nowhere to stand. Whatever will not go round the walls stands in the middle
    // after all, as an island, which is also what a lab does once its walls are full.
    const sizes = children.map(sizeOf);
    // The corners are left out of every wall's run, so two walls do not put something in the same
    // corner. It costs the depth of the deepest thing at each end, which is what a corner is.
    const deepest = Math.max(...sizes.map((size) => size[2]));
    const runs: { turn: Turn; across: 0 | 2; room: number; of: number[] }[] = [
      { turn: 0, across: 0, room: inside[0], of: [] }, { turn: 90, across: 2, room: inside[2], of: [] },
      { turn: 180, across: 0, room: inside[0], of: [] }, { turn: 270, across: 2, room: inside[2], of: [] },
    ];
    const island: number[] = [];
    let wall = 0;
    let along = 0;
    for (const [at, size] of sizes.entries()) {
      // What this wall would come to with it on the end. Starting the next wall starts that sum
      // again, so a thing that would not fit on the end of one wall is first along the next.
      let taken = along === 0 ? size[0] : along + ROOM_GAP + size[0];
      while (wall < runs.length && taken > runs[wall]!.room - 2 * deepest + 1e-9) { wall++; along = 0; taken = size[0]; }
      if (wall >= runs.length) { island.push(at); continue; }
      runs[wall]!.of.push(at);
      along = taken;
    }
    const standings: Standing[] = new Array(count);
    for (const run of runs) {
      // Each wall's run is centred on it, so a wall with one thing against it has it in the middle
      // and a wall filling up stays balanced rather than crowding into one corner.
      const width = run.of.reduce((sum, at) => sum + sizes[at]![0], 0) + ROOM_GAP * Math.max(0, run.of.length - 1);
      let u = -width / 2;
      for (const at of run.of) {
        const size = sizes[at]!;
        const middle = u + size[0] / 2;
        const off = (run.across === 0 ? D : W) / 2 - WALL - size[2] / 2;
        standings[at] = {
          position: run.turn === 0 ? [middle, 0, -off] : run.turn === 90 ? [off, 0, middle]
                  : run.turn === 180 ? [-middle, 0, off] : [-off, 0, -middle],
          size, turn: run.turn,
        };
        u += size[0] + ROOM_GAP;
      }
    }
    // The island: rows down the middle, kept inside the room however much is left over.
    let back = -(island.length === 0 ? 0 : deepest);
    let x = 0;
    let widest = 0;
    for (const at of island) {
      const size = sizes[at]!;
      if (x > 0 && x + ROOM_GAP + size[0] > inside[0]) { back += widest + ROOM_GAP; x = 0; widest = 0; }
      const here = Math.min(back, D / 2 - WALL - deepest - size[2]);
      standings[at] = { position: [-inside[0] / 2 + x + size[0] / 2, 0, here + size[2] / 2], size };
      x += (x === 0 ? 0 : ROOM_GAP) + size[0];
      widest = Math.max(widest, size[2]);
    }
    return standings;
  }
  if (kind === "bench") {
    // Things on a bench stand on its top, spread along it.
    const sizes = children.map(sizeOf);
    const step = W / count;
    return sizes.map((size, at) => ({ position: [-W / 2 + step * (at + 0.5), H, 0], size }));
  }
  // Anything else shares the width side by side: racks on a shelf, or whatever a lab has invented.
  const each = (inside[0] - GAP * (count - 1)) / count;
  return children.map((_, at) => ({ position: [-inside[0] / 2 + each / 2 + at * (each + GAP), floor, 0], size: [each, inside[1], inside[2]] }));
}

/** Whether two standings in the same place share space. Ones that only touch do not. */
function sharing(a: Standing, b: Standing): boolean {
  const [as, bs] = [lying([...a.size], a.turn ?? 0), lying([...b.size], b.turn ?? 0)];
  const apart = (axis: 0 | 2): boolean => Math.abs(a.position[axis] - b.position[axis]) >= (as[axis] + bs[axis]) / 2 - 0.001;
  const above = a.position[1] >= b.position[1] + bs[1] - 0.001 || b.position[1] >= a.position[1] + as[1] - 0.001;
  return !apart(0) && !apart(2) && !above;
}

/**
 * A standing moved, if it has to be, to the first spot on the same floor that is clear of others.
 *
 * It looks along the back first and works forwards, a tenth of a metre at a time, staying inside
 * the parent. If nowhere is clear it is left where it was: a full room is for a person to sort out.
 */
function clearOf(standing: Standing, others: readonly Standing[], parent: [number, number, number]): Standing {
  if (!others.some((other) => sharing(standing, other))) return standing;
  const [w, , d] = lying([...standing.size], standing.turn ?? 0);
  const [reachX, reachZ] = [(parent[0] - w) / 2, (parent[2] - d) / 2];
  if (reachX < 0 || reachZ < 0) return standing;
  const step = 0.1;
  for (let z = -reachZ; z <= reachZ + 1e-9; z += step) {
    for (let x = -reachX; x <= reachX + 1e-9; x += step) {
      const tried: Standing = { ...standing, position: [Math.round(x * 1000) / 1000, standing.position[1], Math.round(z * 1000) / 1000] };
      if (!others.some((other) => sharing(tried, other))) return tried;
    }
  }
  return standing;
}

/**
 * Give every place somewhere to stand.
 *
 * @param layout - The lab. Only its places are used.
 * @returns Every place, with the space it takes up in the lab's coordinates, in an order where a
 *   place always comes after the place it is in. A place whose parent does not exist is left out.
 *
 * @example
 * ```ts
 * import { arrange, exampleLab } from "@biolibs/bionet-space";
 *
 * const arranged = arrange(exampleLab());
 * arranged.find((one) => one.place.kind === "freezer")?.size;   // [ 0.9, 2, 0.85 ]
 * ```
 */
export function arrange(layout: Pick<Layout, "places">): Arranged[] {
  const children = new Map<string | null, Place[]>();
  for (const place of layout.places) children.set(place.parent, [...(children.get(place.parent) ?? []), place]);
  const out: Arranged[] = [];

  /**
   * Put `places` inside a parent whose base is centred at `base`, with size `size` and turn `turn`.
   * `given` holds standings already chosen for places that did not say where they stand.
   */
  const settle = (places: Place[], base: [number, number, number], size: [number, number, number], kind: string, turn: Turn,
                  path: string[], given: Map<Place, Standing> = new Map()): void => {
    const chosen = new Map(given);
    const unplaced = places.filter((place) => place.standing === undefined && !chosen.has(place));
    // Shelves and boxes each have a rule of their own. Everything else in the same place is arranged
    // together, so a freezer and a fridge in one room stand side by side and not on top of each other.
    const sort = (place: Place): string => (place.kind === "shelf" || place.kind === "box" ? place.kind : "other");
    for (const which of new Set(unplaced.map(sort))) {
      const group = unplaced.filter((place) => sort(place) === which);
      byDefault(size, kind, group).forEach((standing, at) => chosen.set(group[at]!, standing));
      // Somebody may already have stood things where the usual arrangement would put these. A new
      // freezer should appear beside the bench, not in it, so each is moved to the first clear spot.
      if (which !== "other") continue;
      const fixed = places.filter((place) => place.standing !== undefined).map((place) => place.standing!);
      for (const place of group) {
        const clear = clearOf(chosen.get(place)!, fixed, size);
        chosen.set(place, clear);
        fixed.push(clear);
      }
    }
    for (const place of places) {
      const standing = place.standing ?? chosen.get(place)!;
      const whole = ((turn + (standing.turn ?? 0)) % 360) as Turn;
      const offset = turned(standing.position, turn);
      const at: [number, number, number] = [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
      const space = lying([...standing.size], whole);
      const here = [...path, place.id];
      out.push({ place, center: [at[0], at[1] + space[1] / 2, at[2]], size: space, turn: whole, path: here,
                 placed: place.standing === undefined ? "by default" : "by hand" });
      const inside = children.get(place.id);
      if (inside !== undefined) settle(inside, at, [...standing.size], place.kind, whole, here);
    }
  };

  // Rooms that have not been told where to stand line up in a row, a little apart.
  const rooms = children.get(null) ?? [];
  const row = new Map<Place, Standing>();
  let x = 0;
  for (const room of rooms) {
    if (room.standing !== undefined) continue;
    const size = sizeOf(room);
    row.set(room, { position: [x + size[0] / 2, 0, 0], size });
    x += size[0] + 1.5;
  }
  settle(rooms, [0, 0, 0], [0, 0, 0], "lab", 0, [], row);
  return out;
}

/**
 * Where one position in a box is, in the lab's coordinates.
 *
 * @param box - The box, arranged.
 * @param slot - Which position.
 * @returns The centre of that position on the floor of the box, or `null` if the box has no such position.
 */
export function slotCenter(box: Arranged, slot: Slot): [number, number, number] | null {
  const grid = box.place.grid;
  if (grid === undefined || slot.row < 0 || slot.column < 0 || slot.row >= grid.rows || slot.column >= grid.columns) return null;
  // Rows run from the back to the front and columns from left to right, in the box's own facing.
  const [w, , d] = lying([...box.size], box.turn);       // undo the turn to get the box's own wide and deep
  const across = -w / 2 + (w / grid.columns) * (slot.column + 0.5);
  const forward = -d / 2 + (d / grid.rows) * (slot.row + 0.5);
  const offset = turned([across, 0, forward], box.turn);
  return [box.center[0] + offset[0], box.center[1] - box.size[1] / 2, box.center[2] + offset[2]];
}

/**
 * How big one position in a box is.
 *
 * @param box - The box, arranged.
 * @returns The side of the square each position gets, in metres, or 0 if the box has no positions.
 */
export function slotSize(box: Arranged): number {
  const grid = box.place.grid;
  if (grid === undefined) return 0;
  const [w, , d] = lying([...box.size], box.turn);
  return Math.min(w / grid.columns, d / grid.rows);
}

/**
 * The first position in a box that nothing is stored in.
 *
 * @param box - The box.
 * @param taken - The positions already used.
 * @returns A free position, row by row from the back left, or `null` if the box is full or has none.
 */
export function firstFreeSlot(box: Place, taken: readonly Slot[]): Slot | null {
  if (box.grid === undefined) return null;
  const used = new Set(taken.map((slot) => `${slot.row},${slot.column}`));
  for (let row = 0; row < box.grid.rows; row++) {
    for (let column = 0; column < box.grid.columns; column++) {
      if (!used.has(`${row},${column}`)) return { row, column };
    }
  }
  return null;
}

/**
 * What a position is called, the way it is written on a box lid: a letter for the row, a number for
 * the column.
 *
 * @param slot - The position.
 * @returns Something like `C4`.
 */
export function slotName(slot: Slot): string {
  let row = "";
  for (let at = slot.row; at >= 0; at = Math.floor(at / 26) - 1) row = String.fromCharCode(65 + (at % 26)) + row;
  return `${row}${slot.column + 1}`;
}

/**
 * Read a position the way it is written on a box lid.
 *
 * @param name - Something like `C4` or `c4`.
 * @returns The position, or `null` if that is not how one is written.
 *
 * @example
 * ```ts
 * import { slotFrom, slotName } from "@biolibs/bionet-space";
 *
 * slotFrom("C4");                    // { row: 2, column: 3 }
 * slotName(slotFrom("AB12")!);       // "AB12"
 * slotFrom("4C");                    // null
 * ```
 */
export function slotFrom(name: string): Slot | null {
  const found = /^([A-Za-z]{1,2})([1-9][0-9]{0,2})$/.exec(name.trim());
  if (found === null) return null;
  const row = [...found[1]!.toUpperCase()].reduce((sum, letter) => sum * 26 + (letter.charCodeAt(0) - 64), 0) - 1;
  return { row, column: Number(found[2]) - 1 };
}
