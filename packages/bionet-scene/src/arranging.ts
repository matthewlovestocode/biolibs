/**
 * Arranging a room, as plain data.
 *
 * The builder lets somebody drag what is in a place — a room, a freezer, a shelf, a bench — turn it
 * and say how big it is. Everything
 * it decides is decided here, with nothing drawn: which places may be moved, what the room looks
 * like with a move not yet made, what has gone wrong, and what the lab has to be told.
 */
import { INSTRUMENT_SIZE, UNNAMED_ROOM, arrange, overlapping, standingOf, sticking, type Arranged, type Layout, type Standing } from "@biolibs/bionet-space";
import { sceneView, type SceneView } from "./view.js";

/** A room being arranged. */
export interface Arranging {
  /** The lab as it would be with the moves not yet made. */
  layout: Layout;
  /** That lab, arranged. */
  arranged: Arranged[];
  /** What to draw. */
  view: SceneView;
  /** The places that may be moved: whatever is directly in the place being arranged. */
  movable: string[];
  /** Those of them that move up and down, not across: shelves. */
  upright: string[];
  /** The way back: every place the one being arranged is inside, outermost first, ending with itself. */
  path: { id: string; name: string }[];
  /** What has gone wrong, in words, for a person to read. */
  problems: string[];
}

/**
 * The rooms of a lab: the places that are in nothing.
 *
 * @param layout - The lab.
 * @returns Them, in the lab's order.
 */
export function roomsOf(layout: Pick<Layout, "places">): { id: string; name: string }[] {
  return layout.places.filter((place) => place.parent === null).map((place) => ({ id: place.id, name: place.name }));
}

/**
 * Work out a place as what is in it is being arranged: a room, a freezer, a shelf, a bench.
 *
 * @param layout - The lab.
 * @param inside - The place whose contents are being arranged.
 * @param draft - Standings tried but not yet said, by place.
 * @param options - `labName` is what to call the lab.
 * @returns What to draw, what may be moved, and what has gone wrong.
 */
export function arranging(layout: Layout, inside: string, draft: ReadonlyMap<string, Standing> = new Map(), options: { labName?: string } = {}): Arranging {
  const tried: Layout = draft.size === 0 ? layout
    : { ...layout, places: layout.places.map((place) => (draft.has(place.id) ? { ...place, standing: draft.get(place.id)! } : place)) };
  const arranged = arrange(tried);
  const name = (id: string): string => tried.places.find((place) => place.id === id)?.name ?? "a place";
  // Only what is wrong among the things being arranged is said here; the rest of the lab has its own turn.
  const here = (id: string): boolean => tried.places.find((place) => place.id === id)?.parent === inside;
  const pairs = overlapping(arranged).filter(([a]) => here(a));
  const out = sticking(arranged).filter(here);
  const attention = new Set([...pairs.flat(), ...out]);
  const children = tried.places.filter((place) => place.parent === inside);
  return {
    layout: tried,
    arranged,
    view: sceneView(tried, { place: inside }, { attention, ...(options.labName === undefined ? {} : { labName: options.labName }) }),
    movable: children.map((place) => place.id),
    upright: children.filter((place) => place.kind === "shelf").map((place) => place.id),
    path: (arranged.find((one) => one.place.id === inside)?.path ?? []).map((id) => ({ id, name: name(id) })),
    problems: [...pairs.map(([a, b]) => `${name(a)} and ${name(b)} are standing in each other.`),
               ...out.map((id) => `${name(id)} is partly outside ${name(inside)}.`)],
  };
}

/**
 * Which of the places being arranged a press was meant for.
 *
 * A press lands on the smallest thing under the pointer, which inside a freezer is a box. What is
 * being arranged is the shelf the box is on, so the press is given to that.
 *
 * @param now - The place being arranged.
 * @param pressed - The place that was pressed.
 * @returns The movable place it is, or is inside, or `null` if it is neither.
 */
export function movableAt(now: Pick<Arranging, "arranged" | "movable">, pressed: string): string | null {
  const path = now.arranged.find((one) => one.place.id === pressed)?.path ?? [];
  return path.find((id) => now.movable.includes(id)) ?? null;
}

/**
 * What the lab has to be told for one place to be stood somewhere.
 *
 * A place nobody has stood anywhere is put where there is room, and that changes when one beside it
 * is stood by hand. So standing one place first pins the others beside it where they are: arranging
 * a room must not make the rest of it shuffle.
 *
 * @param arranged - The lab, arranged, before the move.
 * @param place - The place being stood.
 * @param standing - Where.
 * @returns Every standing to say, the pins first and the move last.
 */
export function toSay(arranged: readonly Arranged[], place: string, standing: Standing): { place: string; standing: Standing }[] {
  const moving = arranged.find((one) => one.place.id === place);
  if (moving === undefined) return [];
  const pins = arranged
    .filter((one) => one.place.parent === moving.place.parent && one.place.id !== place && one.placed === "by default")
    .map((one) => ({ place: one.place.id, standing: standingOf(arranged, one.place.id)! }));
  return [...pins, { place, standing }];
}

/**
 * What in a lab needs arranging: places somebody stood in each other, or partly outside what they are in.
 *
 * A pair is only named if somebody stood at least one of them. Two places that were never stood
 * anywhere are where `arrange` put them, and that is not for the lab to fix.
 *
 * @param layout - The lab.
 * @returns The places to draw as needing attention, and what is wrong, in words.
 */
export function needsArranging(layout: Layout): { attention: Set<string>; problems: string[] } {
  const arranged = arrange(layout);
  const byHand = new Set(arranged.filter((one) => one.placed === "by hand").map((one) => one.place.id));
  const name = (id: string): string => layout.places.find((place) => place.id === id)?.name ?? "a place";
  const pairs = overlapping(arranged).filter(([a, b]) => byHand.has(a) || byHand.has(b));
  const out = sticking(arranged);
  return {
    attention: new Set([...pairs.flat(), ...out]),
    problems: [...pairs.map(([a, b]) => `${name(a)} and ${name(b)} are standing in each other.`),
               ...out.map((id) => `${name(id)} is partly outside ${name(layout.places.find((place) => place.id === id)!.parent!)}.`)],
  };
}

/** A place to be added. */
export interface NewPlace {
  /** What kind of place it is. */
  kind: string;
  /** What to call it. */
  name: string;
  /** The place it is in, or `null` for one that is in nothing. */
  parent: string | null;
  /** For a box: its rows and columns of positions. */
  grid?: { rows: number; columns: number };
  /** For an instrument: which one, such as `thermocycler`. */
  model?: string;
}

/** The instruments the scene knows the size of. */
export const INSTRUMENTS: readonly string[] = Object.keys(INSTRUMENT_SIZE);

/** What a new box has for positions unless somebody says otherwise: the common 9 × 9. */
export const USUAL_GRID = { rows: 9, columns: 9 } as const;

/**
 * The kinds of place usually kept in a kind of place, likeliest first.
 *
 * It is a suggestion for a form and no rule: a lab may keep anything in anything, and the log lets it.
 *
 * @param kind - What the place being added to is, or `null` for the lab itself.
 * @returns The kinds to offer.
 */
export function kindsFor(kind: string | null): string[] {
  switch (kind) {
    case null: return ["room"];
    case "room": return ["freezer", "fridge", "bench", "shelf"];
    case "freezer": case "fridge": return ["shelf", "rack", "box"];
    case "shelf": return ["rack", "box"];
    case "rack": return ["box"];
    case "bench": return ["instrument", "box"];
    case "box": case "instrument": return [];
    default: return ["shelf", "rack", "box"];
  }
}

/**
 * A name for a new place: its kind, and the next number not taken among the places beside it.
 *
 * @param layout - The lab.
 * @param kind - What is being added, or for an instrument its model.
 * @param parent - The place it is being added to.
 * @returns Something like `Shelf 3`.
 */
export function nameFor(layout: Pick<Layout, "places">, kind: string, parent: string | null): string {
  const word = kind.charAt(0).toUpperCase() + kind.slice(1).replace(/-/g, " ");
  const taken = new Set(layout.places.filter((place) => place.parent === parent).map((place) => place.name));
  if (kind !== "room" && !taken.has(word) && !/^(shelf|rack|box|freezer|fridge|bench)$/.test(kind)) return word;
  for (let at = 1; ; at++) if (!taken.has(`${word} ${at}`)) return `${word} ${at}`;
}

/**
 * What to ask the lab for, to add a place of a kind to a place.
 *
 * @param layout - The lab.
 * @param inside - The place to add to, or `null` for the lab itself.
 * @param kind - What to add.
 * @param more - A name to use in place of the usual one, a box's positions, an instrument's model.
 * @returns The place to add. A place added to the room made up for the drawing is added to nothing,
 *   since the lab has no such room.
 */
export function placeToAdd(layout: Pick<Layout, "places">, inside: string | null, kind: string,
                           more: { name?: string; grid?: { rows: number; columns: number }; model?: string } = {}): NewPlace {
  const parent = inside === UNNAMED_ROOM ? null : inside;
  const name = more.name !== undefined && more.name.trim() !== "" ? more.name.trim() : nameFor(layout, kind === "instrument" && more.model !== undefined ? more.model : kind, inside);
  return {
    kind, name, parent,
    ...(kind === "box" ? { grid: more.grid ?? { ...USUAL_GRID } } : {}),
    ...(kind === "instrument" && more.model !== undefined ? { model: more.model } : {}),
  };
}
