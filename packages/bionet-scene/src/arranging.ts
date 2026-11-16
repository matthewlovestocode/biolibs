/**
 * Arranging a room, as plain data.
 *
 * The builder lets somebody drag what stands in a room, turn it and say how big it is. Everything
 * it decides is decided here, with nothing drawn: which places may be moved, what the room looks
 * like with a move not yet made, what has gone wrong, and what the lab has to be told.
 */
import { arrange, overlapping, standingOf, sticking, type Arranged, type Layout, type Standing } from "@biolibs/bionet-space";
import { sceneView, type SceneView } from "./view.js";

/** A room being arranged. */
export interface Arranging {
  /** The lab as it would be with the moves not yet made. */
  layout: Layout;
  /** That lab, arranged. */
  arranged: Arranged[];
  /** What to draw. */
  view: SceneView;
  /** The places that may be moved: whatever stands directly in the room. */
  movable: string[];
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
 * Work out a room as it is being arranged.
 *
 * @param layout - The lab.
 * @param room - The room being arranged.
 * @param draft - Standings tried but not yet said, by place.
 * @param options - `labName` is what to call the lab.
 * @returns What to draw, what may be moved, and what has gone wrong.
 */
export function arranging(layout: Layout, room: string, draft: ReadonlyMap<string, Standing> = new Map(), options: { labName?: string } = {}): Arranging {
  const tried: Layout = draft.size === 0 ? layout
    : { ...layout, places: layout.places.map((place) => (draft.has(place.id) ? { ...place, standing: draft.get(place.id)! } : place)) };
  const arranged = arrange(tried);
  const name = (id: string): string => tried.places.find((place) => place.id === id)?.name ?? "a place";
  const inRoom = (id: string): boolean => arranged.find((one) => one.place.id === id)?.path[0] === room;
  const pairs = overlapping(arranged).filter(([a]) => inRoom(a));
  const out = sticking(arranged).filter(inRoom);
  const attention = new Set([...pairs.flat(), ...out]);
  return {
    layout: tried,
    arranged,
    view: sceneView(tried, { place: room }, { attention, ...(options.labName === undefined ? {} : { labName: options.labName }) }),
    movable: tried.places.filter((place) => place.parent === room).map((place) => place.id),
    problems: [...pairs.map(([a, b]) => `${name(a)} and ${name(b)} are standing in each other.`),
               ...out.map((id) => `${name(id)} is partly outside ${name(tried.places.find((place) => place.id === id)!.parent!)}.`)],
  };
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
