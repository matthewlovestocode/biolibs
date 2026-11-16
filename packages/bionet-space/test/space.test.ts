/**
 * A lab given a shape.
 *
 * What is checked is what a view of a lab relies on: that everything gets somewhere to stand, that
 * nothing arranged by default pokes out of what it is in or overlaps its neighbours, that a place
 * told where to stand is put exactly there, that turning a freezer turns everything in it, and that
 * a position in a box is where the lid says it is.
 */
import { DEFAULT_SIZE, UNNAMED_ROOM, arrange, boundsOf, exampleLab, firstFreeSlot, layoutFrom, levelOf, poseFor, search, slotCenter, slotFrom, slotName,
         type RecordedItem, type RecordedPlace,
         slotSize, storedWithin, type Arranged, type Layout, type Place } from "@biolibs/bionet-space";
import { describe, expect, it } from "vitest";

const near = (a: readonly number[], b: readonly number[]): void => a.forEach((value, at) => expect(value).toBeCloseTo(b[at]!, 6));
const low = (one: Arranged, axis: number): number => one.center[axis]! - one.size[axis]! / 2;
const high = (one: Arranged, axis: number): number => one.center[axis]! + one.size[axis]! / 2;
const within = (inner: Arranged, outer: Arranged): boolean =>
  [0, 1, 2].every((axis) => low(inner, axis) >= low(outer, axis) - 1e-9 && high(inner, axis) <= high(outer, axis) + 1e-9);
const overlap = (a: Arranged, b: Arranged): boolean => [0, 1, 2].every((axis) => low(a, axis) < high(b, axis) - 1e-9 && low(b, axis) < high(a, axis) - 1e-9);
const room = (more: Place[]): Layout => ({ places: [{ id: "r", kind: "room", name: "Room", parent: null }, ...more], stored: [] });

describe("the example lab", () => {
  const lab = exampleLab();
  const arranged = arrange(lab);
  const by = new Map(arranged.map((one) => [one.place.id, one]));

  it("is the same every time", () => {
    expect(exampleLab()).toEqual(lab);
    expect(lab.places.filter((place) => place.kind === "box")).toHaveLength(72);
    expect(lab.stored.length).toBeGreaterThan(1500);
    expect(new Set(lab.stored.map((one) => one.item)).size).toBe(lab.stored.length);
  });

  it("gives every place somewhere to stand, after the place it is in", () => {
    expect(arranged).toHaveLength(lab.places.length);
    arranged.forEach((one, at) => {
      if (one.place.parent !== null) expect(arranged.findIndex((each) => each.place.id === one.place.parent)).toBeLessThan(at);
      expect(one.path.at(-1)).toBe(one.place.id);
      expect(one.size.every((side) => side > 0)).toBe(true);
    });
  });

  it("keeps everything stored inside its unit, and stored things from overlapping", () => {
    for (const one of arranged) {
      const parent = one.place.parent === null ? undefined : by.get(one.place.parent);
      if (parent === undefined || one.place.kind === "instrument") continue;     // an instrument stands on its bench, not in it
      if (parent.place.kind === "room") continue;                                // placed by hand; the room is not a container to fit
      expect(within(one, parent), `${one.place.name} in ${parent.place.name}`).toBe(true);
    }
    const siblings = new Map<string, Arranged[]>();
    for (const one of arranged) if (one.place.parent !== null) siblings.set(one.place.parent, [...(siblings.get(one.place.parent) ?? []), one]);
    for (const group of siblings.values()) {
      for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
        expect(overlap(group[a]!, group[b]!), `${group[a]!.place.name} and ${group[b]!.place.name}`).toBe(false);
      }
    }
  });

  it("stands instruments on top of their bench", () => {
    const bench = by.get("bench1")!;
    for (const id of ["thermocycler", "gel", "centrifuge"]) {
      expect(low(by.get(id)!, 1)).toBeCloseTo(high(bench, 1), 6);
      expect(low(by.get(id)!, 0)).toBeGreaterThanOrEqual(low(bench, 0));
      expect(high(by.get(id)!, 0)).toBeLessThanOrEqual(high(bench, 0));
    }
  });

  it("says what was placed by hand and what by default", () => {
    expect(by.get("minus80")!.placed).toBe("by hand");
    expect(by.get("minus80-s1")!.placed).toBe("by default");
    expect(by.get("minus80-s1-A-1")!.path).toEqual(["main", "minus80", "minus80-s1", "minus80-s1-A", "minus80-s1-A-1"]);
  });

  it("finds what is stored in a place, however deep, and what a search turns up", () => {
    const inFreezer = storedWithin(lab, arranged, "minus80");
    const inFridge = storedWithin(lab, arranged, "fridge");
    expect(inFreezer.length + inFridge.length).toBe(lab.stored.length);
    expect(storedWithin(lab, arranged, "main")).toHaveLength(lab.stored.length);
    expect(storedWithin(lab, arranged, "bench1")).toEqual([]);
    const found = search(lab, "  PUC19 ");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((one) => one.name === "pUC19")).toBe(true);
    expect(search(lab, "gfp insert").every((one) => one.name === "GFP insert")).toBe(true);
    expect(search(lab, "")).toEqual([]);
    expect(search(lab, "no such part")).toEqual([]);
  });
});

describe("arranging by default", () => {
  it("lines up what stands in a room along the back wall, at its own size", () => {
    const arranged = arrange(room([{ id: "a", kind: "freezer", name: "A", parent: "r" }, { id: "b", kind: "fridge", name: "B", parent: "r" }]));
    const [r, a, b] = arranged as [Arranged, Arranged, Arranged];
    near(r.size, DEFAULT_SIZE["room"]!);
    near(a.size, DEFAULT_SIZE["freezer"]!);
    expect(high(a, 0)).toBeLessThan(low(b, 0));
    expect(low(a, 2)).toBeCloseTo(low(r, 2) + 0.1, 6);
    expect(low(a, 1)).toBeCloseTo(0, 6);
  });

  it("splits a freezer's height between its shelves, the first at the top", () => {
    const shelves: Place[] = [1, 2, 3].map((n) => ({ id: `s${n}`, kind: "shelf", name: `S${n}`, parent: "f" }));
    const arranged = arrange(room([{ id: "f", kind: "freezer", name: "F", parent: "r" }, ...shelves]));
    const [s1, s2, s3] = ["s1", "s2", "s3"].map((id) => arranged.find((one) => one.place.id === id)!) as [Arranged, Arranged, Arranged];
    expect(low(s1, 1)).toBeGreaterThan(high(s2, 1));
    expect(low(s2, 1)).toBeGreaterThan(high(s3, 1));
    expect(s1.size[1]).toBeCloseTo(s2.size[1], 6);
  });

  it("stacks boxes upwards, then across, then towards the back", () => {
    const boxes: Place[] = Array.from({ length: 80 }, (_, at) => ({ id: `b${at}`, kind: "box", name: `B${at}`, parent: "s" }));
    const arranged = arrange(room([{ id: "f", kind: "fridge", name: "F", parent: "r" }, { id: "s", kind: "shelf", name: "S", parent: "f" }, ...boxes]));
    const at = (n: number): Arranged => arranged.find((one) => one.place.id === `b${n}`)!;
    expect(at(1).center[1]).toBeGreaterThan(at(0).center[1]);
    expect(at(1).center[0]).toBeCloseTo(at(0).center[0], 6);
    const column = arranged.filter((one) => one.place.kind === "box" && Math.abs(one.center[0] - at(0).center[0]) < 1e-9 && Math.abs(one.center[2] - at(0).center[2]) < 1e-9).length;
    expect(at(column).center[0]).toBeGreaterThan(at(0).center[0]);
    expect(arranged.some((one) => one.place.kind === "box" && one.center[2] < at(0).center[2] - 1e-9)).toBe(true);
    near(at(0).size, DEFAULT_SIZE["box"]!);
  });

  it("puts rooms in a row, and shares a place it has no rule for side by side", () => {
    const arranged = arrange({ stored: [], places: [
      { id: "one", kind: "room", name: "One", parent: null }, { id: "two", kind: "room", name: "Two", parent: null },
      { id: "dewar", kind: "dewar", name: "Dewar", parent: "one" },
      { id: "c1", kind: "cane", name: "Cane 1", parent: "dewar" }, { id: "c2", kind: "cane", name: "Cane 2", parent: "dewar" },
    ] });
    const by = new Map(arranged.map((one) => [one.place.id, one]));
    expect(low(by.get("two")!, 0)).toBeGreaterThan(high(by.get("one")!, 0));
    near(by.get("dewar")!.size, [0.5, 0.5, 0.5]);
    expect(high(by.get("c1")!, 0)).toBeLessThan(low(by.get("c2")!, 0));
    expect(within(by.get("c1")!, by.get("dewar")!)).toBe(true);
    expect(by.get("one")!.placed).toBe("by default");
  });

  it("leaves out a place whose parent does not exist, and copes with nothing at all", () => {
    expect(arrange({ places: [{ id: "lost", kind: "box", name: "Lost", parent: "nowhere" }] })).toEqual([]);
    expect(arrange({ places: [] })).toEqual([]);
  });
});

describe("standing where it is told", () => {
  it("puts a place exactly there", () => {
    const [, bench] = arrange(room([{ id: "b", kind: "bench", name: "B", parent: "r", standing: { position: [1, 0, -2], size: [2, 0.9, 0.7] } }]));
    near(bench!.center, [1 + 3, 0.45, -2]);        // the default room's base centre is at x = 3
    near(bench!.size, [2, 0.9, 0.7]);
    expect(bench!.placed).toBe("by hand");
  });

  it("turns everything inside a turned place with it", () => {
    const places = (turn: 0 | 90 | 180 | 270): Place[] => [
      { id: "r", kind: "room", name: "R", parent: null, standing: { position: [0, 0, 0], size: [6, 3, 6] } },
      { id: "b", kind: "bench", name: "B", parent: "r", standing: { position: [0, 0, 0], size: [2, 1, 0.6], turn } },
      { id: "i", kind: "instrument", name: "I", parent: "b", standing: { position: [0.8, 1, 0.1], size: [0.2, 0.3, 0.4] } },
    ];
    const at = (turn: 0 | 90 | 180 | 270): Arranged[] => arrange({ places: places(turn) });
    near(at(0)[1]!.size, [2, 1, 0.6]);
    near(at(90)[1]!.size, [0.6, 1, 2]);              // a quarter turn swaps wide and deep
    near(at(0)[2]!.center, [0.8, 1.15, 0.1]);
    near(at(90)[2]!.center, [-0.1, 1.15, 0.8]);
    near(at(180)[2]!.center, [-0.8, 1.15, -0.1]);
    near(at(270)[2]!.center, [0.1, 1.15, -0.8]);
    near(at(90)[2]!.size, [0.4, 0.3, 0.2]);
    expect(at(270)[2]!.turn).toBe(270);
  });
});

describe("positions in a box", () => {
  const boxAt = (turn: 0 | 90 = 0): Arranged => arrange({ places: [
    { id: "r", kind: "room", name: "R", parent: null, standing: { position: [0, 0, 0], size: [4, 3, 4] } },
    { id: "x", kind: "box", name: "X", parent: "r", grid: { rows: 2, columns: 4 }, standing: { position: [0, 1, 0], size: [0.4, 0.05, 0.2], turn } },
  ] })[1]!;

  it("runs rows from the back and columns from the left", () => {
    const box = boxAt();
    near(slotCenter(box, { row: 0, column: 0 })!, [-0.15, 1, -0.05]);
    near(slotCenter(box, { row: 1, column: 3 })!, [0.15, 1, 0.05]);
    expect(slotSize(box)).toBeCloseTo(0.1, 6);
    expect(slotCenter(box, { row: 2, column: 0 })).toBeNull();
    expect(slotCenter(box, { row: 0, column: -1 })).toBeNull();
  });

  it("turns with the box", () => {
    near(slotCenter(boxAt(90), { row: 0, column: 0 })!, [0.05, 1, -0.15]);
    expect(slotSize(boxAt(90))).toBeCloseTo(0.1, 6);
  });

  it("has none in a place that is not a box", () => {
    const shelf = arrange(room([{ id: "s", kind: "shelf", name: "S", parent: "r" }]))[1]!;
    expect(slotCenter(shelf, { row: 0, column: 0 })).toBeNull();
    expect(slotSize(shelf)).toBe(0);
    expect(firstFreeSlot(shelf.place, [])).toBeNull();
  });

  it("finds the first free one, and names them as a lid does", () => {
    const box = boxAt().place;
    expect(firstFreeSlot(box, [])).toEqual({ row: 0, column: 0 });
    expect(firstFreeSlot(box, [{ row: 0, column: 0 }, { row: 0, column: 1 }])).toEqual({ row: 0, column: 2 });
    const all = [0, 1].flatMap((row) => [0, 1, 2, 3].map((column) => ({ row, column })));
    expect(firstFreeSlot(box, all)).toBeNull();
    expect(firstFreeSlot(box, all.slice(0, 4))).toEqual({ row: 1, column: 0 });
    expect([slotName({ row: 0, column: 0 }), slotName({ row: 2, column: 3 }), slotName({ row: 25, column: 9 }), slotName({ row: 26, column: 0 })])
      .toEqual(["A1", "C4", "Z10", "AA1"]);
  });
});

describe("looking at a place", () => {
  const arranged = arrange(exampleLab());

  it("knows how close a look is", () => {
    const of = (id: string) => levelOf(arranged.find((one) => one.place.id === id)!);
    expect(levelOf(null)).toBe("lab");
    expect([of("main"), of("minus80"), of("minus80-s1"), of("minus80-s1-A"), of("minus80-s1-A-1")]).toEqual(["room", "unit", "inside", "inside", "box"]);
  });

  it("stands back far enough to see it whole, closer for smaller things", () => {
    const distance = (id: string | null): number => {
      const pose = poseFor(arranged, id);
      return Math.hypot(...pose.position.map((value, at) => value - pose.target[at]!));
    };
    expect(distance(null)).toBeGreaterThan(distance("minus80"));
    expect(distance("minus80")).toBeGreaterThan(distance("minus80-s1-A"));
    expect(distance("minus80-s1-A")).toBeGreaterThan(distance("minus80-s1-A-1"));
    near(poseFor(arranged, "minus80").target, arranged.find((one) => one.place.id === "minus80")!.center);
  });

  it("looks at a box from above, and at a turned bench from its own front", () => {
    const box = poseFor(arranged, "minus80-s1-A-1");
    expect(box.position[1] - box.target[1]).toBeGreaterThan(Math.abs(box.position[2] - box.target[2]));
    const facing = poseFor(arranged, "bench1");
    expect(facing.position[2]).toBeGreaterThan(facing.target[2]);          // bench 1 faces the front
    const side = poseFor(arranged, "bench2");
    expect(side.position[0]).toBeLessThan(side.target[0]);                 // bench 2 is turned to face into the room
  });

  it("looks at the whole lab when asked for nothing, or for a place that is not there", () => {
    expect(poseFor(arranged, null)).toEqual(poseFor(arranged, "no such place"));
    expect(poseFor([], null).target).toEqual([0, 0, 0]);
    expect(boundsOf([])).toBeNull();
    const all = boundsOf(arranged.filter((one) => one.place.parent === null))!;
    near(all.size, [7, 2.8, 5]);
  });
});

describe("a layout from a lab's own record", () => {
  const place = (id: string, kind: string, parent: string | null, more: Partial<RecordedPlace> = {}): RecordedPlace =>
    ({ place: id, kind, name: id, parent, grid: null, standing: null, retired: false, ...more });
  const item = (id: string, where: RecordedItem["where"], more: Partial<RecordedItem> = {}): RecordedItem =>
    ({ item: id, part: "p1", unit: "µL", amount: 5, retired: false, needsRecount: false, where, ...more });

  it("keeps rooms as they are, converts millimetres, and carries an instrument's model", () => {
    const layout = layoutFrom({
      places: [place("room", "room", null, { standing: { at: [0, 0, 0], size: [6000, 3000, 4000], turn: 0 } }),
               place("pcr", "instrument", "room", { fields: { model: "thermocycler", note: 3 } }),
               place("box", "box", "room", { grid: { rows: 9, columns: 9 } })],
      items: [item("t1", { place: "box", slot: { row: 1, column: 1 } }), item("t2", { place: "box", slot: null }, { part: "gone" })],
      parts: [{ checksum: "p1", name: "pWren-402" }],
    });
    expect(layout.places).toEqual([
      { id: "room", kind: "room", name: "room", parent: null, standing: { position: [0, 0, 0], size: [6, 3, 4], turn: 0 } },
      { id: "pcr", kind: "instrument", name: "pcr", parent: "room", model: "thermocycler" },
      { id: "box", kind: "box", name: "box", parent: "room", grid: { rows: 9, columns: 9 } },
    ]);
    expect(layout.stored.map((one) => [one.item, one.name, one.slot])).toEqual([
      ["t1", "pWren-402", { row: 1, column: 1 }], ["t2", "A part the lab no longer lists", null]]);
    expect(arrange(layout)).toHaveLength(3);
  });

  it("makes up a room for places that stand in none, and names it as asked", () => {
    const lab = { places: [place("f", "freezer", null)], items: [], parts: [] };
    expect(layoutFrom(lab).places[0]).toEqual({ id: UNNAMED_ROOM, kind: "room", name: "Lab", parent: null });
    expect(layoutFrom(lab, { room: "The Wren Lab" }).places.map((one) => [one.name, one.parent])).toEqual([["The Wren Lab", null], ["f", UNNAMED_ROOM]]);
    expect(layoutFrom({ places: [], items: [], parts: [] })).toEqual({ places: [], stored: [] });
  });

  it("leaves out what cannot be found: retired places and all in them, retired or unplaced items", () => {
    const layout = layoutFrom({
      places: [place("room", "room", null), place("old", "freezer", "room", { retired: true }), place("in-old", "box", "old"),
               place("lost", "box", "nowhere"), place("a", "shelf", "b"), place("b", "shelf", "a"), place("kept", "box", "room")],
      items: [item("1", { place: "in-old", slot: null }), item("2", { place: "kept", slot: null }, { retired: true }), item("3", null),
              item("4", { place: "no such place", slot: null }), item("5", { place: "kept", slot: null }, { needsRecount: true })],
      parts: [],
    });
    expect(layout.places.map((one) => one.id)).toEqual(["room", "kept"]);
    expect(layout.stored.map((one) => [one.item, one.needsRecount])).toEqual([["5", true]]);
  });
});

describe("a position, as written on a lid", () => {
  it("is read back from its name", () => {
    expect(slotFrom("C4")).toEqual({ row: 2, column: 3 });
    expect(slotFrom(" a1 ")).toEqual({ row: 0, column: 0 });
    for (const slot of [{ row: 0, column: 0 }, { row: 25, column: 98 }, { row: 26, column: 0 }, { row: 99, column: 99 }]) {
      expect(slotFrom(slotName(slot))).toEqual(slot);
    }
    for (const not of ["4C", "", "A0", "A", "7", "ABC1", "A1000"]) expect(slotFrom(not)).toBeNull();
  });
});
