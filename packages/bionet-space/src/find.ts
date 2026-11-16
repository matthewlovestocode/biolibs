/**
 * Finding your way around an arranged lab: what is inside what, what a search turns up, and where a
 * camera should look to see a place.
 */
import type { Arranged, Layout, Stored } from "./model.js";

/** How close a place is to the things in it: a room, something standing in one, or a box of positions. */
export type Level = "lab" | "room" | "unit" | "inside" | "box";

/**
 * How close a look at a place is.
 *
 * @param arranged - The place, or `null` for the whole lab.
 * @returns `lab` for everything, `room` for a room, `unit` for whatever stands in a room (a freezer, a
 *   bench, an instrument), `box` for a place with positions, and `inside` for anything between.
 */
export function levelOf(arranged: Arranged | null): Level {
  if (arranged === null) return "lab";
  if (arranged.place.grid !== undefined) return "box";
  if (arranged.path.length === 1) return "room";
  if (arranged.path.length === 2) return "unit";
  return "inside";
}

/** A box that everything fits in. */
export interface Bounds {
  center: [number, number, number];
  size: [number, number, number];
}

/**
 * The space some places take up together.
 *
 * @param places - The places.
 * @returns The smallest box around all of them, or `null` if there are none.
 */
export function boundsOf(places: readonly Pick<Arranged, "center" | "size">[]): Bounds | null {
  if (places.length === 0) return null;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const { center, size } of places) {
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis]!, center[axis]! - size[axis]! / 2);
      high[axis] = Math.max(high[axis]!, center[axis]! + size[axis]! / 2);
    }
  }
  return {
    center: [(low[0]! + high[0]!) / 2, (low[1]! + high[1]!) / 2, (low[2]! + high[2]!) / 2],
    size: [high[0]! - low[0]!, high[1]! - low[1]!, high[2]! - low[2]!],
  };
}

/** Where a camera stands and what it looks at. */
export interface Pose {
  /** Where the camera is. */
  position: [number, number, number];
  /** What it looks at. */
  target: [number, number, number];
}

/** Which way to look from, by level, for something facing front: across, up, towards the viewer. */
/**
 * Which way each level is looked at from: across, up, and towards the viewer.
 *
 * It is exported because a view of one instrument on its own has to start from the same direction
 * the room was looking from, or walking up to a machine and then being at it is two pictures of two
 * different machines. `stagePose` in `@biolibs/bionet-scene` uses `inside` for exactly that.
 */
export const VIEWED_FROM: Readonly<Record<Level, readonly [number, number, number]>> = {
  lab: [0.45, 0.62, 1],
  room: [0.4, 0.6, 1],
  unit: [0.42, 0.28, 1],
  inside: [0.3, 0.2, 1],
  box: [0, 1, 0.42],
};

/**
 * Where a camera should stand to see a place whole.
 *
 * It looks from in front and a little above, closer the smaller the thing is, and from nearly
 * straight above for a box, since a box is read like a page. A place that is turned is looked at
 * from its own front.
 *
 * @param arranged - Every place, arranged.
 * @param id - The place to look at, or `null` for the whole lab.
 * @param fov - The camera's vertical field of view, in degrees.
 * @returns Where to stand and what to look at.
 */
export function poseFor(arranged: readonly Arranged[], id: string | null, fov = 45): Pose {
  const one = id === null ? null : arranged.find((each) => each.place.id === id) ?? null;
  const bounds = one ?? boundsOf(arranged.filter((each) => each.place.parent === null)) ?? { center: [0, 0, 0], size: [4, 3, 4] };
  const level = levelOf(one);
  const [x, y, z] = VIEWED_FROM[level];
  // Turn the direction with the place, so a freezer facing a side wall is still seen from its front.
  const turn = one?.turn ?? 0;
  const [dx, dz] = turn === 90 ? [-z, x] : turn === 180 ? [-x, -z] : turn === 270 ? [z, -x] : [x, z];
  const length = Math.hypot(dx, y, dz);
  const reach = Math.max(bounds.size[0], bounds.size[1], bounds.size[2]);
  const distance = (reach * (level === "lab" || level === "room" ? 0.68 : level === "box" ? 1.25 : 1.0)) / Math.tan((fov * Math.PI) / 360);
  return {
    target: [...bounds.center] as [number, number, number],
    position: [bounds.center[0] + (dx / length) * distance, bounds.center[1] + (y / length) * distance, bounds.center[2] + (dz / length) * distance],
  };
}

/**
 * Everything stored in a place or in anything inside it.
 *
 * @param layout - The lab.
 * @param arranged - Its places, arranged.
 * @param id - The place.
 * @returns What is stored there, however deep.
 */
export function storedWithin(layout: Pick<Layout, "stored">, arranged: readonly Arranged[], id: string): Stored[] {
  const inside = new Set(arranged.filter((one) => one.path.includes(id)).map((one) => one.place.id));
  return layout.stored.filter((one) => inside.has(one.place));
}

/**
 * Search what is stored, by the name of the part.
 *
 * @param layout - The lab.
 * @param words - What was typed. Case does not matter, and every word has to appear.
 * @returns What matched, in the order it is stored. Nothing, if nothing was typed.
 */
export function search(layout: Pick<Layout, "stored">, words: string): Stored[] {
  const wanted = words.toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (wanted.length === 0) return [];
  return layout.stored.filter((one) => wanted.every((word) => one.name.toLowerCase().includes(word)));
}
