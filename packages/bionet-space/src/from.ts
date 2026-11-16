/**
 * A layout made from a lab's own record of itself.
 *
 * A lab's signed log says what places it has, which is inside which, and where each item was put.
 * This turns that into a `Layout`. It asks for the lab structurally, by the few fields it reads, so
 * this package still depends on nothing: `@biolibs/bionet`'s lab state fits, and so does anything
 * else shaped like it.
 */
import type { Layout, Place, Stored, Turn } from "./model.js";

/** A place, as a lab records it. Lengths are whole millimetres. */
export interface RecordedPlace {
  place: string;
  kind: string;
  name: string;
  parent: string | null;
  grid: { rows: number; columns: number } | null;
  standing: { at: readonly number[]; size: readonly number[]; turn: number } | null;
  retired: boolean;
  fields?: Readonly<Record<string, string | number | null>>;
}

/** An item, as a lab records it. */
export interface RecordedItem {
  item: string;
  part: string;
  unit: string | null;
  amount: number;
  retired: boolean;
  needsRecount: boolean;
  where: { place: string; slot: { row: number; column: number } | null } | null;
}

/** As much of a lab as a layout is made from. */
export interface RecordedLab {
  places: readonly RecordedPlace[];
  items: readonly RecordedItem[];
  parts: readonly { checksum: string; name: string }[];
}

/** The ID of the room that is made up when a lab has places standing in no room. */
export const UNNAMED_ROOM = "~room";

const metres = (list: readonly number[]): [number, number, number] => [list[0]! / 1000, list[1]! / 1000, list[2]! / 1000];

/**
 * Make a layout from a lab.
 *
 * Retired places are left out, with everything in them. Items that have been retired, or that
 * nobody has put anywhere, are left out too: a layout is of what can be found. A place that stands
 * in no room is put in one made up for the purpose, so that a lab which has only said "there is a
 * freezer" can still be drawn.
 *
 * @param lab - The lab's places, items and parts.
 * @param options - `room` is what to call the room that is made up if one is needed.
 * @returns The layout.
 *
 * @example
 * ```ts
 * import { layoutFrom } from "@biolibs/bionet-space";
 *
 * const layout = layoutFrom({
 *   places: [{ place: "f", kind: "freezer", name: "−80", parent: null, grid: null, standing: null, retired: false }],
 *   items: [], parts: [],
 * });
 * layout.places.map((one) => [one.id, one.parent]);   // [ [ "~room", null ], [ "f", "~room" ] ]
 * ```
 */
export function layoutFrom(lab: RecordedLab, options: { room?: string } = {}): Layout {
  const byId = new Map(lab.places.map((one) => [one.place, one]));
  /** Whether a place, and everything it is inside, is still in use. */
  const kept = (id: string): boolean => {
    const passed = new Set<string>();
    for (let at: string | null = id; at !== null; at = byId.get(at)!.parent) {
      const one = byId.get(at);
      if (one === undefined || one.retired || passed.has(at)) return false;
      passed.add(at);
    }
    return true;
  };

  const loose = lab.places.some((one) => one.parent === null && one.kind !== "room" && kept(one.place));
  const places: Place[] = loose ? [{ id: UNNAMED_ROOM, kind: "room", name: options.room ?? "Lab", parent: null }] : [];
  for (const one of lab.places) {
    if (!kept(one.place)) continue;
    const model = one.fields?.["model"];
    places.push({
      id: one.place, kind: one.kind, name: one.name,
      parent: one.parent ?? (one.kind === "room" ? null : UNNAMED_ROOM),
      ...(one.standing === null ? {} : { standing: { position: metres(one.standing.at), size: metres(one.standing.size), turn: one.standing.turn as Turn } }),
      ...(one.grid === null ? {} : { grid: { rows: one.grid.rows, columns: one.grid.columns } }),
      ...(typeof model === "string" ? { model } : {}),
    });
  }

  const names = new Map(lab.parts.map((part) => [part.checksum, part.name]));
  const stored: Stored[] = [];
  for (const item of lab.items) {
    if (item.retired || item.where === null || !byId.has(item.where.place) || !kept(item.where.place)) continue;
    stored.push({ item: item.item, place: item.where.place, slot: item.where.slot, part: item.part,
                  name: names.get(item.part) ?? "A part the lab no longer lists", amount: item.amount, unit: item.unit,
                  needsRecount: item.needsRecount });
  }
  return { places, stored };
}
