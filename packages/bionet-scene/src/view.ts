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
  /**
   * What it is made of, for how solid it is drawn, or `null` for something that is never filled.
   *
   * A room is never filled, because you are inside it; nor is a shelf or a rack, which are frames
   * rather than objects. Everything that is a thing standing in a lab is.
   */
  skin: string | null;
  /**
   * Whether it is the thing being looked at, and so stays see-through however far off it is.
   *
   * Walking up to a freezer is walking up to the shelves in it. Its own skin is between the camera
   * and them, and letting the distance alone decide would leave a solid box over the thing it was
   * opened to show.
   */
  opened: boolean;
  /**
   * Whether this is the thing being looked at itself, which brings its quiet pieces up to full.
   *
   * It is not the same question as `opened`. Standing at a thermocycler, the bench under it is
   * opened — its skin is between you and the machine — but it is not what you are looking at, and
   * bringing its legs back up to full would put the glow back exactly where it was least wanted.
   */
  picked: boolean;
  /** Whether pressing it should look at it. */
  focusable: boolean;
  /** Whether to write its name beside it. */
  labelled: boolean;
  /** How far it is turned in all, in degrees, for something that is not the same from every side. */
  turn: number;
  /** For an instrument: which one, so that it can be drawn to look like it. */
  model?: string;
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
  /** The camera's vertical field of view, in degrees. Narrow for a box, so its tubes are seen straight. */
  fov: number;
  /** How many items are in what is being looked at, however deep. */
  holding: number;
}

/** What `sceneView` can be told beyond the lab and the focus. */
export interface ViewOptions {
  /** Items a search has matched. Their boxes and tubes are drawn as found. */
  matches?: ReadonlySet<string>;
  /** Places to draw as needing attention, whatever else they are: standing in each other, or through a wall. */
  attention?: ReadonlySet<string>;
  /** What to call the whole lab in the crumbs. */
  labName?: string;
  /** The camera's vertical field of view, in degrees. */
  fov?: number;
}

/** The field of view for looking around, in degrees. */
export const ROOM_FOV = 45;

/** The narrower field of view for looking down into a box, in degrees. */
export const BOX_FOV = 18;

/** Something written on screen: where its middle is, how big it is, and how much it matters. */
export interface Written {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Lower matters more. Among equals, the earlier one is kept. */
  rank: number;
}

/**
 * Which of the things written on screen to show, so that none sits on another.
 *
 * The ones that matter most are kept first; one that would overlap something already kept is left
 * out. A label nobody can read is worse than no label, and the place can still be pressed.
 *
 * @param written - Everything that could be written.
 * @param gap - How much clear space to leave around each, in pixels.
 * @returns For each, in the order given, whether to show it.
 */
export function legible(written: readonly Written[], gap = 2): boolean[] {
  const order = written.map((_, at) => at).sort((a, b) => written[a]!.rank - written[b]!.rank || a - b);
  const kept: Written[] = [];
  const shown = written.map(() => false);
  for (const at of order) {
    const one = written[at]!;
    const clear = kept.every((other) => Math.abs(one.x - other.x) >= (one.width + other.width) / 2 + gap
                                     || Math.abs(one.y - other.y) >= (one.height + other.height) / 2 + gap);
    if (clear) { kept.push(one); shown[at] = true; }
  }
  return shown;
}

/** A tube's height, in metres. */
const TUBE_HEIGHT = 0.04;

/**
 * Work out what to draw.
 *
 * @param layout - The lab: its places and what is stored in them.
 * @param focus - What is being looked at.
 * @param options - Search matches, the lab's name, places needing attention, and a field of view to use in place of its own.
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
  // Looked at from close and above with a wide lens, the tubes at a box's edges lean outwards. A
  // long lens from further off sees them all nearly straight down.
  const fov = options.fov ?? (level === "box" ? BOX_FOV : ROOM_FOV);

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
    focused !== null && (focused.path.includes(one.place.id) || one.path.includes(focused.place.id));
  /**
   * Nothing is being looked at: the room at rest.
   *
   * This used to count as everything being near, which drew the whole lab at the strength one
   * thing gets when you have walked up to it — a room where everything is picked out, which is a
   * room where nothing is. At rest it is drawn evenly and below that, so that picking something
   * still has somewhere to go.
   */
  const resting = focused === null;
  /** The thing standing in a room that a place belongs to: its freezer, its bench. */
  const unitOf = (one: Arranged): string | undefined => one.path[1];
  const focusedUnit = focused === null ? undefined : unitOf(focused);

  const places: DrawnPlace[] = [];
  for (const one of arranged) {
    const { place } = one;
    const held = within.get(place.id) ?? [];
    const base = { id: place.id, kind: place.kind, name: place.name, center: one.center, size: one.size, turn: one.turn,
                   ...(place.model === undefined ? {} : { model: place.model }) };
    const depth = one.path.length;
    const isFocus = focused !== null && place.id === focused.place.id;
    const childOfFocus = focused !== null && place.parent === focused.place.id;

    if (focused !== null && focused.place.grid !== undefined && !isFocus) {
      // A box is looked into as if it had been taken out: what it was standing in is left as a faint
      // outline to say where it came from, and nothing else is drawn, since all of it would be in the way.
      if (focused.path.includes(place.id)) places.push({ ...base, tone: depth === 1 ? "dim" : "yours", strength: 0.1, fill: 0, skin: null, opened: false, picked: false, focusable: false, labelled: false });
    } else if (depth === 1) {
      // A room is the frame everything else stands in, and is drawn quietly.
      // Its walls and floor are drawn from within, so they stand behind the lab rather than in
      // front of it. The fill stays nothing, because that is what the wireframe has always drawn
      // here: the room comes up only when skins are on, and goes back to an outline when they go.
      places.push({ ...base, tone: "dim", strength: level === "lab" || level === "room" ? 0.55 : 0.28, fill: 0,
                    // At every level, not only when the lab is what is being looked at: the walls
                    // decide for themselves, by whether the camera is in the room, and being at a
                    // bench is exactly when you are.
                    skin: "room",
                    opened: false, picked: false, focusable: level === "lab", labelled: level === "lab" });
    } else if (depth === 2 || place.kind === "instrument") {
      // What stands in a room, and what stands on a bench.
      const close = near(one) || (place.kind === "instrument" && focusedUnit === unitOf(one));
      const loudness = resting ? (place.kind === "bench" ? 0.35 : 0.5) : close ? (place.kind === "bench" ? 0.6 : 1) : 0.25;
      places.push({ ...base, tone: "yours", strength: loudness, fill: resting || close ? 0.035 : 0,
                    // A bench and the computer on it are what the work stands on rather than what it
                    // is about, so they are drawn as furniture and everything else as a machine.
                    skin: place.kind === "bench" || place.model === "computer" ? "furniture" : "plain",
                    opened: isFocus || focusedUnit === place.id, picked: isFocus, focusable: true, labelled: isFocus || childOfFocus || level === "lab" || level === "room" });
    } else if (place.grid !== undefined) {
      // A box. From across the room it is a small slab that says whether anything is in it.
      const inUnit = focusedUnit !== undefined && unitOf(one) === focusedUnit;
      const found = held.some((item) => matches.has(item.item));
      const tone: Meaning = found ? "found" : held.some((item) => item.needsRecount === true) ? "attention" : held.length > 0 ? "held" : "dim";
      places.push({ ...base, tone, strength: found || isFocus ? 1 : inUnit ? (near(one) ? 0.85 : 0.5) : 0.3,
                    fill: held.length === 0 ? 0 : isFocus ? 0.05 : 0.14, skin: "plain", opened: isFocus, picked: isFocus, focusable: inUnit,
                    // A box being looked into is named in the way back. Written over it, the name would cover its tubes.
                    labelled: childOfFocus });
    } else if (focusedUnit !== undefined && unitOf(one) === focusedUnit) {
      // A shelf or a rack, drawn only once its freezer is being looked into.
      places.push({ ...base, tone: "yours", strength: near(one) ? 0.55 : 0.25, fill: 0, skin: null, opened: false, picked: false, focusable: true, labelled: isFocus || childOfFocus });
    }
  }

  if (options.attention !== undefined) {
    for (const drawn of places) if (options.attention.has(drawn.id)) Object.assign(drawn, { tone: "attention", strength: 1 });
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
    pose: poseFor(arranged, focused === null ? null : focused.place.id, fov),
    fov,
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
