/**
 * What to draw, worked out as plain data.
 *
 * A scene of a lab is the same lab seen from different distances: the whole room, one freezer, one
 * box, one tube. What changes with distance is what is worth drawing and how strongly. That is
 * decided here, by a function from the lab and what is being looked at to a list of things to draw,
 * and nothing in this file knows how to draw anything.
 *
 * Keeping it apart is what makes the scene checkable. Whether a search match lights up its box, or
 * a tube needing a count is flagged, is a question about data and is tested as one. The part that
 * turns the list into lines and cylinders is left with nothing to decide.
 *
 * Colours are given as meanings from `@biolibs/bionet-theme`, never as colours: `yours` for the
 * lab's own structure, `held` for a box or tube with something in it, `found` for a search match,
 * `attention` for something that needs a person. The scene looks the colour up for whichever theme
 * is showing.
 */
import { arrange, firstFreeSlot, levelOf, poseFor, slotCenter, slotName, slotSize, type Arranged, type Layout, type Level,
         type Pose, type Slot, type Stored } from "@biolibs/bionet-space";
import type { Meaning } from "@biolibs/bionet-theme";

/** What is being looked at: a place, or the whole lab, and perhaps one item in it. */
export interface Focus {
  /** The place, or `null` for the whole lab. */
  place: string | null;
  /** One item singled out, if any. */
  item?: string | null;
}

/** One place to draw, as a box. */
export interface DrawnPlace {
  id: string;
  kind: string;
  name: string;
  /** The centre of the box, in metres. */
  center: [number, number, number];
  /** How wide, tall and deep it is. */
  size: [number, number, number];
  /** What its colour means. */
  tone: Meaning;
  /** How strongly to draw its edges, from 0 to 1. */
  strength: number;
  /** How solid its faces are, from 0 (edges only) to 1. */
  fill: number;
  /** Whether pressing it should look at it. */
  focusable: boolean;
  /** Whether to write its name beside it. */
  labelled: boolean;
}

/** One tube to draw, standing in its position. */
export interface DrawnTube {
  item: string;
  /** The box it is in. */
  place: string;
  /** The centre of the tube. */
  center: [number, number, number];
  radius: number;
  height: number;
  tone: Meaning;
  /** Whether it is the one singled out. */
  selected: boolean;
  /** What the part is called. */
  name: string;
  /** How much there is, with its unit. */
  amount: string;
  /** Its position, as a lid names it, like `C4`. */
  position: string;
}

/** One empty position to draw. */
export interface DrawnSlot {
  center: [number, number, number];
  radius: number;
}

/** One step of the way from the whole lab to what is being looked at. */
export interface Crumb {
  /** The place, or `null` for the whole lab. */
  id: string | null;
  name: string;
}

/** Everything to draw for one look at a lab. */
export interface SceneView {
  /** Every place worth drawing. */
  places: DrawnPlace[];
  /** The tubes of the box being looked at. */
  tubes: DrawnTube[];
  /** The empty positions of that box. */
  empty: DrawnSlot[];
  /** Where the camera should stand. */
  pose: Pose;
  /** The way here, from the whole lab. */
  crumbs: Crumb[];
  /** How close this look is. */
  level: Level;
  /** How many items are in what is being looked at, however deep. */
  holding: number;
}

/** What `sceneView` can be told beyond the lab and the focus. */
export interface ViewOptions {
  /** Items a search has matched. Their boxes and tubes are drawn as found. */
  matches?: ReadonlySet<string>;
  /** What to call the whole lab in the crumbs. */
  labName?: string;
  /** The camera's vertical field of view, in degrees. */
  fov?: number;
}

/** A tube's height, in metres. */
const TUBE_HEIGHT = 0.04;

/**
 * Work out what to draw.
 *
 * @param layout - The lab: its places and what is stored in them.
 * @param focus - What is being looked at.
 * @param options - Search matches, the lab's name, the camera's field of view.
 * @returns Everything to draw, and where to draw it from.
 *
 * @example
 * ```ts
 * import { exampleLab } from "@biolibs/bionet-space";
 * import { sceneView } from "@biolibs/bionet-scene";
 *
 * const lab = exampleLab();
 * sceneView(lab, { place: null }).tubes.length;                    // 0: from across the room, no tube is worth drawing
 * sceneView(lab, { place: "fridge-s1-1" }).level;                  // "box"
 * sceneView(lab, { place: "fridge-s1-1" }).crumbs.map((c) => c.name);
 * // [ "Lab", "Main lab", "4 °C fridge", "Shelf 1", "Box F1-1" ]
 * ```
 */
export function sceneView(layout: Layout, focus: Focus, options: ViewOptions = {}): SceneView {
  const arranged = arrange(layout);
  const by = new Map(arranged.map((one) => [one.place.id, one]));
  const focused = focus.place === null ? null : by.get(focus.place) ?? null;
  const level = levelOf(focused);
  const matches = options.matches ?? new Set<string>();

  // What each place holds, itself and everything inside it.
  const direct = new Map<string, Stored[]>();
  for (const one of layout.stored) direct.set(one.place, [...(direct.get(one.place) ?? []), one]);
  const within = new Map<string, Stored[]>();
  for (const one of arranged) {
    for (const item of direct.get(one.place.id) ?? []) {
      for (const id of one.path) within.set(id, [...(within.get(id) ?? []), item]);
    }
  }

  /** Whether a place is what is looked at, something it is inside, or something inside it. */
  const near = (one: Arranged): boolean =>
    focused === null || focused.path.includes(one.place.id) || one.path.includes(focused.place.id);
  /** The thing standing in a room that a place belongs to: its freezer, its bench. */
  const unitOf = (one: Arranged): string | undefined => one.path[1];
  const focusedUnit = focused === null ? undefined : unitOf(focused);

  const places: DrawnPlace[] = [];
  for (const one of arranged) {
    const { place } = one;
    const held = within.get(place.id) ?? [];
    const base = { id: place.id, kind: place.kind, name: place.name, center: one.center, size: one.size };
    const depth = one.path.length;
    const isFocus = focused !== null && place.id === focused.place.id;
    const childOfFocus = focused !== null && place.parent === focused.place.id;

    if (focused !== null && focused.place.grid !== undefined && !isFocus) {
      // A box is looked into as if it had been taken out: what it was standing in is left as a faint
      // outline to say where it came from, and nothing else is drawn, since all of it would be in the way.
      if (focused.path.includes(place.id)) places.push({ ...base, tone: depth === 1 ? "dim" : "yours", strength: 0.1, fill: 0, focusable: false, labelled: false });
    } else if (depth === 1) {
      // A room is the frame everything else stands in, and is drawn quietly.
      places.push({ ...base, tone: "dim", strength: level === "lab" || level === "room" ? 0.55 : 0.28, fill: 0,
                    focusable: level === "lab", labelled: level === "lab" });
    } else if (depth === 2 || place.kind === "instrument") {
      // What stands in a room, and what stands on a bench.
      const close = near(one) || (place.kind === "instrument" && focusedUnit === unitOf(one));
      places.push({ ...base, tone: "yours", strength: close ? (place.kind === "bench" ? 0.6 : 1) : 0.25, fill: close ? 0.035 : 0,
                    focusable: true, labelled: isFocus || childOfFocus || level === "lab" || level === "room" });
    } else if (place.grid !== undefined) {
      // A box. From across the room it is a small slab that says whether anything is in it.
      const inUnit = focusedUnit !== undefined && unitOf(one) === focusedUnit;
      const found = held.some((item) => matches.has(item.item));
      const tone: Meaning = found ? "found" : held.some((item) => item.needsRecount === true) ? "attention" : held.length > 0 ? "held" : "dim";
      places.push({ ...base, tone, strength: found || isFocus ? 1 : inUnit ? (near(one) ? 0.85 : 0.5) : 0.3,
                    fill: held.length === 0 ? 0 : isFocus ? 0.05 : 0.14, focusable: inUnit, labelled: isFocus || childOfFocus });
    } else if (focusedUnit !== undefined && unitOf(one) === focusedUnit) {
      // A shelf or a rack, drawn only once its freezer is being looked into.
      places.push({ ...base, tone: "yours", strength: near(one) ? 0.55 : 0.25, fill: 0, focusable: true, labelled: isFocus || childOfFocus });
    }
  }

  // The tubes and empty positions of the box being looked at.
  const tubes: DrawnTube[] = [];
  const empty: DrawnSlot[] = [];
  if (focused !== null && focused.place.grid !== undefined) {
    const side = slotSize(focused);
    const height = Math.min(TUBE_HEIGHT, focused.size[1] * 0.8);
    const taken: Slot[] = [];
    const items = direct.get(focused.place.id) ?? [];
    // An item with no position of its own is stood in the first free one, so it can still be seen.
    const placed = items.filter((item) => item.slot !== undefined && item.slot !== null && slotCenter(focused, item.slot) !== null);
    for (const item of placed) taken.push(item.slot!);
    const stand = (item: Stored, slot: Slot): void => {
      const at = slotCenter(focused, slot)!;
      tubes.push({
        item: item.item, place: focused.place.id, center: [at[0], at[1] + height / 2, at[2]], radius: side * 0.36, height,
        tone: matches.has(item.item) ? "found" : item.needsRecount === true ? "attention" : "held",
        selected: focus.item === item.item, name: item.name,
        amount: `${item.amount}${item.unit === null ? "" : ` ${item.unit}`}`, position: slotName(slot),
      });
    };
    for (const item of placed) stand(item, item.slot!);
    for (const item of items.filter((one) => !placed.includes(one))) {
      const free = firstFreeSlot(focused.place, taken);
      if (free === null) break;
      taken.push(free);
      stand(item, free);
    }
    const used = new Set(taken.map((slot) => `${slot.row},${slot.column}`));
    for (let row = 0; row < focused.place.grid.rows; row++) {
      for (let column = 0; column < focused.place.grid.columns; column++) {
        if (used.has(`${row},${column}`)) continue;
        empty.push({ center: slotCenter(focused, { row, column })!, radius: side * 0.3 });
      }
    }
  }

  return {
    places,
    tubes,
    empty,
    pose: poseFor(arranged, focused === null ? null : focused.place.id, options.fov ?? 45),
    crumbs: [{ id: null, name: options.labName ?? "Lab" }, ...(focused?.path ?? []).map((id) => ({ id, name: by.get(id)!.place.name }))],
    level,
    holding: focused === null ? layout.stored.length : (within.get(focused.place.id) ?? []).length,
  };
}

/**
 * Where to look to see one item: its box, with the item singled out.
 *
 * @param layout - The lab.
 * @param item - The item's ID.
 * @returns The focus that shows it, or `null` if there is no such item.
 */
export function focusOn(layout: Pick<Layout, "stored">, item: string): Focus | null {
  const found = layout.stored.find((one) => one.item === item);
  return found === undefined ? null : { place: found.place, item };
}
