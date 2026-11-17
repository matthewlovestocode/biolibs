/**
 * What a lab is made of, as far as finding things goes: places, and what is stored in them.
 *
 * A lab is a tree of places. A room holds a freezer, which holds shelves, which hold racks, which
 * hold boxes. Nothing here says a tree must have those levels: a place has a kind and a parent, and
 * that is all a place has to have. A liquid nitrogen dewar with canes in it is as much a lab as a
 * freezer with racks.
 *
 * **Where a place is in the tree is required. Where it stands in the room is not.** A lab can say
 * "this tube is in box 3, rack B, the −80" without anybody drawing a floor plan, and `arrange` will
 * give every place somewhere sensible to stand. A place that does say where it stands is put there.
 *
 * Everything is plain data, so it can be made from signed entries, sent to another process, or
 * written by hand.
 */

/**
 * The kinds of place this package knows how to arrange. Any other string is allowed and is treated
 * as a plain container.
 */
export type PlaceKind = "room" | "freezer" | "fridge" | "bench" | "instrument" | "shelf" | "rack" | "box";

/** A quarter turn clockwise, seen from above. */
export type Turn = 0 | 90 | 180 | 270;

/** Where a place stands and how big it is, in metres. */
export interface Standing {
  /**
   * The centre of its base, measured from the centre of its parent's base: across (x), up (y) and
   * towards the front (z). A room has no parent and is measured from the lab's origin.
   */
  position: [number, number, number];
  /** How wide (x), tall (y) and deep (z) it is, before it is turned. */
  size: [number, number, number];
  /** How far it is turned. Its front faces +z when it is not turned at all. */
  turn?: Turn;
}

/** One place. */
export interface Place {
  /** Its ID, which never changes. */
  id: string;
  /** What kind of place it is. One of `PlaceKind`, or anything else. */
  kind: string;
  /** What the lab calls it. */
  name: string;
  /** The place it is in, or `null` for a room. */
  parent: string | null;
  /** Where it stands, if anybody has said. Otherwise `arrange` decides. */
  standing?: Standing;
  /** For a box: how many rows and columns of positions it has. */
  grid?: { rows: number; columns: number };
  /** For an instrument: which one, like `thermocycler`. */
  model?: string;
}

/** One position in a box. Rows and columns count from 0, from the back left. */
export interface Slot {
  row: number;
  column: number;
}

/** One physical item, and where it is. */
export interface Stored {
  /** The item's ID. */
  item: string;
  /** The place it is in. */
  place: string;
  /** Its position there, if the place has positions and somebody said which. */
  slot?: Slot | null;
  /** The checksum of the part it is an item of. */
  part: string | null;
  /** What the part is called. */
  name: string;
  /** How much there is. */
  amount: number;
  /** What one of that is. */
  unit: string | null;
  /** Whether the log has lost track of it and it needs counting. */
  needsRecount?: boolean;
}

/** A lab, as far as finding things goes. */
export interface Layout {
  /** Every place. */
  places: Place[];
  /** Everything stored, and where. */
  stored: Stored[];
}

/** A place with somewhere to stand worked out, in the lab's own coordinates. */
export interface Arranged {
  /** The place. */
  place: Place;
  /** The centre of the space it takes up, in metres from the lab's origin. */
  center: [number, number, number];
  /** How wide (x), tall (y) and deep (z) that space is, after any turning. */
  size: [number, number, number];
  /** How far it is turned in all, counting everything it is inside. */
  turn: Turn;
  /** Every place it is inside, outermost first, ending with itself. */
  path: string[];
  /** Whether anybody said where it stands, or `arrange` chose. */
  placed: "by hand" | "by default";
}
