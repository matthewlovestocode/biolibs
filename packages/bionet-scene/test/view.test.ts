/**
 * What a scene draws at each distance.
 *
 * Nothing here draws. These check the decisions the scene is built on: that from across the room no
 * tube is drawn and from inside a box every one is, that a search lights up the box holding a match,
 * that a tube needing a count is flagged, and that the way back to the whole lab is always there.
 */
import { exampleLab, search, type Layout } from "@biolibs/bionet-space";
import { SKINS, fillAt, focusOn, sceneView, BOX_FOV, ROOM_FOV, legible, type Written } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

const lab = exampleLab();
const drawn = (view: ReturnType<typeof sceneView>, id: string) => view.places.find((one) => one.id === id);
const BOX = "minus80-s1-A-1";

describe("from across the room", () => {
  const view = sceneView(lab, { place: null }, { labName: "The Wren Lab" });

  it("draws the room, what stands in it and the boxes, and no tubes", () => {
    expect(view.level).toBe("lab");
    expect(view.tubes).toEqual([]);
    expect(view.empty).toEqual([]);
    expect(drawn(view, "main")).toMatchObject({ tone: "dim", focusable: true, labelled: true });
    expect(drawn(view, "minus80")).toMatchObject({ tone: "yours", focusable: true, labelled: true });
    expect(drawn(view, "thermocycler")).toMatchObject({ tone: "yours", labelled: true });
    expect(view.places.filter((one) => one.kind === "box")).toHaveLength(72);
  });

  it("draws a room where nothing is picked out, since nothing has been picked", () => {
    // The mistake this catches, which was shipped: counting "nothing is focused" as "everything is
    // near", so the whole lab was drawn at the strength one thing gets once you have walked up to
    // it. Everything lit equally at full is a room where nothing stands out, and picking something
    // then has nowhere to go.
    const things = view.places.filter((one) => one.skin !== null);
    expect(things.length).toBeGreaterThan(0);
    for (const one of things) expect(one.strength).toBeLessThan(1);
    const looked = sceneView(lab, { place: "minus80" });
    expect(drawn(looked, "minus80")!.strength).toBeGreaterThan(drawn(view, "minus80")!.strength);
  });

  it("pushes the rest of the room down when one thing is looked at", () => {
    const looked = sceneView(lab, { place: "minus80" });
    const other = looked.places.find((one) => one.kind === "bench")!;
    expect(other.strength).toBeLessThan(drawn(view, other.id)!.strength);
  });

  it("leaves shelves and racks out, and boxes unpressable, until a freezer is looked into", () => {
    expect(drawn(view, "minus80-s1")).toBeUndefined();
    expect(drawn(view, "minus80-s1-A")).toBeUndefined();
    expect(drawn(view, BOX)!.focusable).toBe(false);
  });

  it("says where it is and how much the lab holds", () => {
    expect(view.crumbs).toEqual([{ id: null, name: "The Wren Lab" }]);
    expect(view.holding).toBe(lab.stored.length);
    expect(sceneView(lab, { place: null }).crumbs[0]!.name).toBe("Lab");
  });
});

describe("looking into a freezer", () => {
  const view = sceneView(lab, { place: "minus80" });

  it("brings out its shelves, racks and boxes, and quietens everything else", () => {
    expect(view.level).toBe("unit");
    expect(drawn(view, "minus80-s1")).toMatchObject({ tone: "yours", focusable: true, labelled: true });
    expect(drawn(view, "minus80-s1-A")).toMatchObject({ focusable: true, labelled: false });
    expect(drawn(view, BOX)!.focusable).toBe(true);
    expect(drawn(view, "fridge")!.strength).toBeLessThan(drawn(view, "minus80")!.strength);
    expect(drawn(view, "fridge-s1")).toBeUndefined();
    expect(drawn(view, "fridge-s1-1")!.focusable).toBe(false);
    expect(drawn(view, "main")!.strength).toBeLessThan(sceneView(lab, { place: null }).places[0]!.strength);
  });

  it("colours a box by what is in it", () => {
    const boxes = view.places.filter((one) => one.kind === "box" && one.id.startsWith("minus80"));
    const empty = boxes.filter((one) => !lab.stored.some((item) => item.place === one.id));
    expect(empty.length).toBeGreaterThan(0);
    for (const box of empty) expect(box).toMatchObject({ tone: "dim", fill: 0 });
    const flagged = new Set(lab.stored.filter((item) => item.needsRecount === true).map((item) => item.place));
    expect(flagged.size).toBeGreaterThan(0);
    for (const box of boxes) {
      if (flagged.has(box.id)) expect(box.tone).toBe("attention");
      else if (!empty.includes(box)) expect(box).toMatchObject({ tone: "held", fill: 0.14 });
    }
  });

  it("counts what is inside, however deep", () => {
    expect(view.holding).toBe(lab.stored.filter((item) => item.place.startsWith("minus80")).length);
    expect(view.crumbs.map((crumb) => crumb.name)).toEqual(["Lab", "Main lab", "−80 freezer"]);
  });

  it("keeps a bench's instruments bright when the bench is looked at", () => {
    const bench = sceneView(lab, { place: "bench1" });
    expect(drawn(bench, "thermocycler")).toMatchObject({ strength: 1, labelled: true });
    expect(drawn(bench, "computer")!.strength).toBe(0.25);
    expect(drawn(bench, "bench1")!.strength).toBe(0.6);
  });
});

describe("looking into a box", () => {
  const items = lab.stored.filter((item) => item.place === BOX);
  const view = sceneView(lab, { place: BOX, item: items[0]!.item });

  it("stands every tube in its position and marks the empty ones", () => {
    expect(view.level).toBe("box");
    expect(view.tubes).toHaveLength(items.length);
    expect(view.tubes.length + view.empty.length).toBe(81);
    const box = drawn(view, BOX)!;
    for (const tube of view.tubes) {
      for (const axis of [0, 2]) expect(Math.abs(tube.center[axis]! - box.center[axis]!)).toBeLessThanOrEqual(box.size[axis]! / 2);
      expect(tube.center[1] - tube.height / 2).toBeCloseTo(box.center[1] - box.size[1] / 2, 6);
      expect(tube.height).toBeLessThanOrEqual(box.size[1]);
    }
    const spots = new Set([...view.tubes, ...view.empty].map((one) => `${one.center[0].toFixed(4)},${one.center[2].toFixed(4)}`));
    expect(spots.size).toBe(81);
  });

  it("says what each tube is, and singles one out", () => {
    const first = view.tubes.find((tube) => tube.item === items[0]!.item)!;
    expect(first).toMatchObject({ selected: true, name: items[0]!.name, amount: `${items[0]!.amount} µL`, tone: "held", place: BOX });
    expect(first.position).toMatch(/^[A-I][1-9]$/);
    expect(view.tubes.filter((tube) => tube.selected)).toHaveLength(1);
    expect(sceneView(lab, { place: BOX }).tubes.some((tube) => tube.selected)).toBe(false);
  });

  it("draws the focused box open, and names the way back", () => {
    expect(drawn(view, BOX)).toMatchObject({ strength: 1, fill: 0.05, labelled: false });
    expect(view.crumbs.map((crumb) => crumb.id)).toEqual([null, "main", "minus80", "minus80-s1", "minus80-s1-A", BOX]);
    expect(view.holding).toBe(items.length);
  });

  it("flags a tube that needs counting", () => {
    const flagged = lab.stored.find((item) => item.needsRecount === true)!;
    const there = sceneView(lab, { place: flagged.place });
    expect(there.tubes.find((tube) => tube.item === flagged.item)!.tone).toBe("attention");
  });

  it("stands an item with no position of its own in the first free one, and stops when the box is full", () => {
    const small: Layout = {
      places: [{ id: "r", kind: "room", name: "R", parent: null }, { id: "f", kind: "fridge", name: "F", parent: "r" },
               { id: "b", kind: "box", name: "B", parent: "f", grid: { rows: 1, columns: 2 } }],
      stored: [
        { item: "one", place: "b", slot: { row: 0, column: 1 }, part: "p", name: "one", amount: 1, unit: null },
        { item: "two", place: "b", part: "p", name: "two", amount: 2, unit: "tubes" },
        { item: "three", place: "b", slot: null, part: "p", name: "three", amount: 3, unit: null },
        { item: "off", place: "b", slot: { row: 5, column: 5 }, part: "p", name: "off the grid", amount: 1, unit: null },
      ],
    };
    const there = sceneView(small, { place: "b" });
    expect(there.tubes.map((tube) => [tube.item, tube.position, tube.amount])).toEqual([["one", "A2", "1"], ["two", "A1", "2 tubes"]]);
    expect(there.empty).toEqual([]);
  });
});

describe("searching", () => {
  const found = search(lab, "puc19");
  const matches = new Set(found.map((item) => item.item));

  it("lights up every box holding a match, from any distance", () => {
    const view = sceneView(lab, { place: null }, { matches });
    const holding = new Set(found.map((item) => item.place));
    for (const box of view.places.filter((one) => one.kind === "box")) {
      if (holding.has(box.id)) expect(box).toMatchObject({ tone: "found", strength: 1 });
      else expect(box.tone).not.toBe("found");
    }
  });

  it("marks the matching tubes in a box, and finds the way to one", () => {
    const one = found[0]!;
    const focus = focusOn(lab, one.item)!;
    expect(focus).toEqual({ place: one.place, item: one.item });
    const view = sceneView(lab, focus, { matches });
    expect(view.tubes.find((tube) => tube.item === one.item)).toMatchObject({ tone: "found", selected: true });
    expect(view.tubes.filter((tube) => tube.tone === "found")).toHaveLength(found.filter((item) => item.place === one.place).length);
    expect(focusOn(lab, "no-such-item")).toBeNull();
  });
});

describe("a focus that leads nowhere", () => {
  it("looks at the whole lab", () => {
    const view = sceneView(lab, { place: "no such place" });
    expect(view.level).toBe("lab");
    expect(view.pose).toEqual(sceneView(lab, { place: null }).pose);
    expect(sceneView({ places: [], stored: [] }, { place: null })).toMatchObject({ places: [], tubes: [], holding: 0 });
  });
});

describe("a box, looked into", () => {
  it("is drawn as if taken out: itself, a faint outline of what it stood in, and nothing else", () => {
    const view = sceneView(lab, { place: "minus80-s3-B-4" });
    expect(view.level).toBe("box");
    expect(view.places.map((one) => one.id)).toEqual(["main", "minus80", "minus80-s3", "minus80-s3-B", "minus80-s3-B-4"]);
    for (const around of view.places.slice(0, -1)) expect(around).toMatchObject({ strength: 0.1, fill: 0, focusable: false, labelled: false });
    expect(view.places.at(-1)).toMatchObject({ strength: 1, labelled: false });
    expect(view.tubes.length + view.empty.length).toBe(81);
  });
});

describe("the lens", () => {
  it("is long for a box, so its tubes are seen straight, and stands further back to match", () => {
    const room = sceneView(lab, { place: "minus80" });
    const box = sceneView(lab, { place: "minus80-s3-B-4" });
    expect([room.fov, box.fov]).toEqual([ROOM_FOV, BOX_FOV]);
    const far = (view: typeof box): number => Math.hypot(...view.pose.position.map((value, axis) => value - view.pose.target[axis]!));
    expect(far(box)).toBeGreaterThan(far(sceneView(lab, { place: "minus80-s3-B-4" }, { fov: ROOM_FOV })) * 2);
    expect(sceneView(lab, { place: null }, { fov: 30 }).fov).toBe(30);
  });
});

describe("what is written over the scene", () => {
  const at = (x: number, y: number, rank: number): Written => ({ x, y, width: 80, height: 20, rank });
  it("shows what matters most where two would sit on each other, and everything that is clear", () => {
    expect(legible([at(100, 100, 2), at(130, 105, 1), at(300, 100, 2)])).toEqual([false, true, true]);
    expect(legible([at(100, 100, 2), at(130, 105, 2)])).toEqual([true, false]);            // equals: the earlier
    expect(legible([at(100, 100, 2), at(100, 130, 2), at(190, 100, 2)])).toEqual([true, true, true]);
    expect(legible([at(100, 100, 2), at(181, 100, 2)])).toEqual([true, false]);            // closer than the gap
    expect(legible([at(100, 100, 2), at(181, 100, 2)], 0)).toEqual([true, true]);
    expect(legible([])).toEqual([]);
  });
});

describe("what the skins are told about each place", () => {
  it("gives a thing standing in a lab something to be made of, and the room walls and a floor", () => {
    const view = sceneView(lab, { place: null }, { labName: "The Wren Lab" });
    expect(drawn(view, "minus80")!.skin).toBe("plain");
    // This used to say a room is made of nothing, on the grounds that filling it would put a skin
    // between you and everything in it. That is true of a room drawn like a box and false of one
    // drawn from within: only its far side is ever there, which is the floor and the far walls.
    expect(drawn(view, "main")!.skin).toBe("room");
    expect(SKINS["room"]!.inside).toBe(true);
    // And it is still nothing with the setting off, which is the drawing this scene has always had.
    expect(drawn(view, "main")!.fill).toBe(0);
    expect(fillAt(SKINS["room"]!, "off", 0, 0).fill).toBe(0);
  });

  it("marks the freezer being looked into as opened, and the rest of the room as not", () => {
    const view = sceneView(lab, { place: "minus80" });
    expect(drawn(view, "minus80")!.opened).toBe(true);
    for (const place of view.places) {
      if (place.id !== "minus80" && place.skin !== null) expect(place.opened).toBe(false);
    }
  });

  it("opens nothing when the whole room is being looked at", () => {
    const view = sceneView(lab, { place: null });
    expect(view.places.every((place) => !place.opened)).toBe(true);
  });
});
