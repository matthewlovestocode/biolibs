/**
 * The arithmetic of arranging a lab by hand.
 *
 * `arrange` goes from what a lab says to where things are. Arranging goes the other way: somebody
 * drags a freezer across a floor, and that has to become something the lab can say — a position
 * measured from the place the freezer is in, in that place's own facing. This is that inverse, with
 * the checks a person arranging wants: has it left the room, is it standing in something else.
 *
 * Nothing here moves anything. It works out what would be said, and a caller says it.
 */
import type { Arranged, Standing, Turn } from "./model.js";

/** How finely a dragged place settles, in metres. */
export const SNAP = 0.05;

/** How far two places may sink into each other before it counts, in metres. */
const SLACK = 0.001;

const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * A length settled onto a grid.
 *
 * @param value - The length, in metres.
 * @param step - The grid, in metres.
 * @returns The nearest multiple of the step, to the millimetre.
 */
export function snapped(value: number, step: number = SNAP): number {
  return step <= 0 ? round(value) : round(Math.round(value / step) * step);
}

/** Undo a turn: an offset in the lab's directions, as measured inside a place turned that far. */
function unturned([x, y, z]: [number, number, number], turn: Turn): [number, number, number] {
  switch (turn) {
    case 90: return [z, y, -x];
    case 180: return [-x, y, -z];
    case 270: return [-z, y, x];
    default: return [x, y, z];
  }
}

const base = (one: Arranged): [number, number, number] => [one.center[0], one.center[1] - one.size[1] / 2, one.center[2]];

/** The place something is in, arranged, or `null` for one that is in nothing. */
const parentOf = (arranged: readonly Arranged[], one: Arranged): Arranged | null => {
  const id = one.path.at(-2);
  return id === undefined ? null : arranged.find((each) => each.place.id === id) ?? null;
};

/**
 * Where a place stands, as the lab would say it: measured from the place it is in.
 *
 * It is the inverse of `arrange`, so it gives an answer for a place nobody has stood anywhere too:
 * the standing that would leave it exactly where it is now.
 *
 * @param arranged - The lab, arranged.
 * @param id - The place.
 * @returns Its standing, or `null` if the lab has no such place.
 *
 * @example
 * ```ts
 * import { arrange, exampleLab, standingOf } from "@biolibs/bionet-space";
 *
 * const arranged = arrange(exampleLab());
 * standingOf(arranged, "minus80")?.size;   // [ 0.9, 2, 0.85 ]
 * ```
 */
export function standingOf(arranged: readonly Arranged[], id: string): Standing | null {
  const one = arranged.find((each) => each.place.id === id);
  if (one === undefined) return null;
  const parent = parentOf(arranged, one);
  const from: [number, number, number] = parent === null ? [0, 0, 0] : base(parent);
  const at = base(one);
  const inside = parent?.turn ?? 0;
  const position = unturned([at[0] - from[0], at[1] - from[1], at[2] - from[2]], inside);
  const [w, h, d] = one.size;
  return {
    position: [round(position[0]), round(position[1]), round(position[2])],
    // The space it takes up was worked out after turning, so a quarter turn is undone here.
    size: one.turn === 90 || one.turn === 270 ? [round(d), round(h), round(w)] : [round(w), round(h), round(d)],
    turn: ((one.turn - inside + 360) % 360) as Turn,
  };
}

/**
 * The standing a place would have if the centre of its base were moved to a point on the floor.
 *
 * The point is settled onto a grid and kept inside the place it is in, so a freezer cannot be
 * dragged through a wall. Its height off the floor, its size and its turn stay as they are.
 *
 * @param arranged - The lab, arranged.
 * @param id - The place being moved.
 * @param to - Where the centre of its base should go, across and towards the front, in the lab's coordinates.
 * @param options - `snap` is the grid to settle on, in metres; 0 for none.
 * @returns The standing, or `null` if the lab has no such place.
 */
export function standingAt(arranged: readonly Arranged[], id: string, to: readonly [number, number], options: { snap?: number } = {}): Standing | null {
  const one = arranged.find((each) => each.place.id === id);
  const now = standingOf(arranged, id);
  if (one === undefined || now === null) return null;
  const parent = parentOf(arranged, one);
  const from: [number, number, number] = parent === null ? [0, 0, 0] : base(parent);
  const [x, , z] = unturned([to[0] - from[0], 0, to[1] - from[2]], parent?.turn ?? 0);
  let across = snapped(x, options.snap ?? SNAP);
  let forward = snapped(z, options.snap ?? SNAP);
  if (parent !== null) {
    // How much room there is either side, in the parent's own facing.
    const [pw, pd] = parent.turn === 90 || parent.turn === 270 ? [parent.size[2], parent.size[0]] : [parent.size[0], parent.size[2]];
    const quarter = now.turn === 90 || now.turn === 270;
    const [w, d] = quarter ? [now.size[2], now.size[0]] : [now.size[0], now.size[2]];
    const within = (value: number, room: number, taken: number): number => (taken >= room ? 0 : Math.min(Math.max(value, -(room - taken) / 2), (room - taken) / 2));
    across = round(within(across, pw, w));
    forward = round(within(forward, pd, d));
  }
  return { ...now, position: [across, now.position[1], forward] };
}

/**
 * A standing turned a quarter turn further.
 *
 * @param standing - The standing.
 * @returns The same place, facing the next way round.
 */
export function quarterTurned(standing: Standing): Standing {
  return { ...standing, turn: ((((standing.turn ?? 0) + 90) % 360) as Turn) };
}

/**
 * Places that are standing in each other.
 *
 * Only places in the same place are compared: a box is supposed to be inside its freezer. Two that
 * touch are fine; two that share space are not, and both are named.
 *
 * @param arranged - The lab, arranged.
 * @returns Each pair that shares space, once.
 */
export function overlapping(arranged: readonly Arranged[]): [string, string][] {
  const pairs: [string, string][] = [];
  const apart = (a: Arranged, b: Arranged, axis: 0 | 1 | 2): boolean =>
    Math.abs(a.center[axis] - b.center[axis]) >= (a.size[axis] + b.size[axis]) / 2 - SLACK;
  for (let first = 0; first < arranged.length; first++) {
    for (let second = first + 1; second < arranged.length; second++) {
      const [a, b] = [arranged[first]!, arranged[second]!];
      if (a.place.parent !== b.place.parent) continue;
      if (!apart(a, b, 0) && !apart(a, b, 1) && !apart(a, b, 2)) pairs.push([a.place.id, b.place.id]);
    }
  }
  return pairs;
}

/**
 * Places somebody has stood partly outside the place they are in.
 *
 * Only places stood by hand are named. One that was never stood anywhere is where `arrange` put it,
 * and if that is outside, the fault is not the lab's.
 *
 * @param arranged - The lab, arranged.
 * @returns The ID of each such place.
 */
export function sticking(arranged: readonly Arranged[]): string[] {
  return arranged.filter((one) => {
    const parent = parentOf(arranged, one);
    if (parent === null || one.placed !== "by hand") return false;
    return ([0, 1, 2] as const).some((axis) =>
      Math.abs(one.center[axis] - parent.center[axis]) > (parent.size[axis] - one.size[axis]) / 2 + SLACK);
  }).map((one) => one.place.id);
}
