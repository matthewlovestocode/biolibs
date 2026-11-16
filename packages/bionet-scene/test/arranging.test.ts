/**
 * Arranging a room, checked as data.
 *
 * What matters is what the lab is told: that a move not yet made is drawn but not said, that
 * standing one place does not make the others shuffle, and that a place stood in another, or
 * through a wall, is drawn as needing attention and said in words.
 */
import { arrange, exampleLab, standingAt, standingOf, standingUp, type Layout, type Standing } from "@biolibs/bionet-space";
import { INSTRUMENTS, arranging, kindsFor, movableAt, nameFor, needsArranging, placeToAdd, roomsOf, toSay } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

/** The example lab, with what stands in its room left to stand where there is room. */
const lab: Layout = (() => {
  const example = exampleLab();
  return { ...example, places: example.places.map((place) => {
    if (place.parent !== "main") return place;
    const { standing: _standing, ...rest } = place;
    return rest;
  }) };
})();
const centreOf = (layout: Layout, id: string): [number, number, number] => arrange(layout).find((one) => one.place.id === id)!.center;

/** The lab after being told some standings, as a lab's log would apply them. */
const told = (layout: Layout, said: { place: string; standing: Standing }[]): Layout =>
  ({ ...layout, places: layout.places.map((place) => {
    const one = said.findLast((each) => each.place === place.id);
    return one === undefined ? place : { ...place, standing: one.standing };
  }) });

describe("a room being arranged", () => {
  it("lets what stands directly in the room be moved, and nothing deeper", () => {
    expect(roomsOf(lab)).toEqual([{ id: "main", name: "Main lab" }]);
    const now = arranging(lab, "main");
    expect(now.movable).toEqual(["minus80", "fridge", "bench1", "bench2"]);
    expect(now.problems).toEqual([]);
    expect(now.view.level).toBe("room");
    expect(now.layout).toBe(lab);
  });

  it("draws a move that has not been made without changing the lab", () => {
    const before = arranging(lab, "main");
    const room = centreOf(lab, "main");
    const tried = standingAt(before.arranged, "minus80", [room[0] + 1, room[2] + 1])!;
    const now = arranging(lab, "main", new Map([["minus80", tried]]));
    expect(now.arranged.find((one) => one.place.id === "minus80")!.center[0]).toBeCloseTo(room[0] + 1, 3);
    expect(lab.places.find((place) => place.id === "minus80")!.standing).toBeUndefined();
    // What is in the freezer goes with it.
    const shelf = (from: typeof now): number => from.arranged.find((one) => one.place.id === "minus80-s1")!.center[0];
    expect(shelf(now) - shelf(before)).toBeCloseTo(now.arranged.find((one) => one.place.id === "minus80")!.center[0] - centreOf(lab, "minus80")[0], 3);
  });

  it("says what has gone wrong, and draws it as needing attention", () => {
    // The example lab as it comes, with everything in the room already stood, so only one thing moves.
    const lab = exampleLab();
    const before = arranging(lab, "main");
    const onFridge = { ...standingOf(before.arranged, "minus80")!, position: standingOf(before.arranged, "fridge")!.position };
    const now = arranging(lab, "main", new Map([["minus80", onFridge]]), { labName: "The Wren Lab" });
    expect(now.problems).toEqual(["−80 freezer and 4 °C fridge are standing in each other."]);
    for (const id of ["minus80", "fridge"]) expect(now.view.places.find((one) => one.id === id)).toMatchObject({ tone: "attention", strength: 1 });
    expect(now.view.places.find((one) => one.id === "bench1")!.tone).toBe("yours");
    expect(now.view.crumbs[0]!.name).toBe("The Wren Lab");

    const through = { ...standingOf(before.arranged, "bench1")!, position: [40, 0, 0] as [number, number, number] };
    expect(arranging(lab, "main", new Map([["bench1", through]])).problems).toEqual(["Bench 1 is partly outside Main lab."]);
  });
});

describe("what the lab is told", () => {
  it("pins the places beside the one being stood, so that nothing else shuffles", () => {
    const before = arrange(lab);
    const room = centreOf(lab, "main");
    const move = standingAt(before, "minus80", [room[0] + 1.5, room[2] + 1])!;
    const said = toSay(before, "minus80", move);
    expect(said.map((one) => one.place)).toEqual(["fridge", "bench1", "bench2", "minus80"]);
    expect(said.at(-1)!.standing).toEqual(move);

    const after = told(lab, said);
    for (const id of ["fridge", "bench1", "bench2"]) {
      centreOf(after, id).forEach((value, axis) => expect(value).toBeCloseTo(centreOf(lab, id)[axis]!, 3));
    }
    expect(centreOf(after, "minus80")[0]).toBeCloseTo(room[0] + 1.5, 3);
    // Without the pins the others would have closed up the gap.
    expect(centreOf(told(lab, [said.at(-1)!]), "fridge")[0]).not.toBeCloseTo(centreOf(lab, "fridge")[0], 2);

    // Once everything is stood, a second move says only itself.
    expect(toSay(arrange(after), "fridge", standingOf(arrange(after), "fridge")!).map((one) => one.place)).toEqual(["fridge"]);
    expect(toSay(before, "no such place", move)).toEqual([]);
  });
});

describe("what needs arranging, seen from anywhere", () => {
  it("names places stood in each other or through a wall, and says nothing of a lab nobody arranged", () => {
    expect(needsArranging(lab)).toEqual({ attention: new Set(), problems: [] });
    const stood = exampleLab();
    expect(needsArranging(stood).problems).toEqual([]);
    const arranged = arrange(stood);
    const onFridge = { ...standingOf(arranged, "minus80")!, position: standingOf(arranged, "fridge")!.position };
    const wrong = needsArranging(told(stood, [{ place: "minus80", standing: onFridge }]));
    expect(wrong.problems).toEqual(["−80 freezer and 4 °C fridge are standing in each other."]);
    expect([...wrong.attention]).toEqual(["minus80", "fridge"]);
    const through = needsArranging(told(stood, [{ place: "bench1", standing: { ...standingOf(arranged, "bench1")!, position: [40, 0, 0] } }]));
    expect(through.problems).toEqual(["Bench 1 is partly outside Main lab."]);
  });
});

describe("arranging inside a place", () => {
  const stood = exampleLab();

  it("moves what is directly in a freezer, with its shelves going up and down", () => {
    const now = arranging(stood, "minus80", new Map(), { labName: "The Wren Lab" });
    expect(now.movable).toEqual(["minus80-s1", "minus80-s2", "minus80-s3", "minus80-s4"]);
    expect(now.upright).toEqual(now.movable);
    expect(now.path).toEqual([{ id: "main", name: "Main lab" }, { id: "minus80", name: "−80 freezer" }]);
    expect(now.view.level).toBe("unit");
    expect(arranging(stood, "main").upright).toEqual([]);
    expect(arranging(stood, "bench1").movable).toEqual(["thermocycler", "gel", "centrifuge"]);
    expect(arranging(stood, "minus80-s1").path.map((one) => one.name)).toEqual(["Main lab", "−80 freezer", "Shelf 1"]);
  });

  it("gives a press on a box to the shelf it is on, and ignores a press elsewhere", () => {
    const now = arranging(stood, "minus80");
    expect(movableAt(now, "minus80-s3-B-4")).toBe("minus80-s3");
    expect(movableAt(now, "minus80-s3")).toBe("minus80-s3");
    expect(movableAt(now, "fridge")).toBeNull();
    expect(movableAt(now, "minus80")).toBeNull();
    expect(movableAt(now, "no such place")).toBeNull();
  });

  it("moves a shelf up and down, between the floor and the ceiling of its freezer, taking what is on it", () => {
    const now = arranging(stood, "minus80");
    const freezer = now.arranged.find((one) => one.place.id === "minus80")!;
    const floor = freezer.center[1] - freezer.size[1] / 2;
    const before = standingOf(now.arranged, "minus80-s4")!;
    const raised = standingUp(now.arranged, "minus80-s4", floor + 0.523)!;
    expect(raised.position).toEqual([before.position[0], 0.5, before.position[2]]);
    expect(raised.size).toEqual(before.size);
    expect(standingUp(now.arranged, "minus80-s4", floor - 3)!.position[1]).toBe(0);
    expect(standingUp(now.arranged, "minus80-s4", floor + 30)!.position[1]).toBeCloseTo(freezer.size[1] - before.size[1], 3);
    expect(standingUp(now.arranged, "minus80-s4", floor + 0.523, { snap: 0 })!.position[1]).toBeCloseTo(0.523, 3);
    expect(standingUp(now.arranged, "no such place", 1)).toBeNull();

    const tried = arranging(stood, "minus80", new Map([["minus80-s4", raised]]));
    const box = (from: typeof tried): number => from.arranged.find((one) => one.place.id === "minus80-s4-A-1")!.center[1];
    expect(box(tried) - box(now)).toBeCloseTo(0.5 - before.position[1], 3);
    // Raised into the shelf above, the two are said to be standing in each other.
    expect(tried.problems.some((problem) => /Shelf 4.*standing in each other|standing in each other.*Shelf 4/.test(problem))).toBe(true);
  });
});

describe("adding a place", () => {
  const stood = exampleLab();

  it("offers what is usually kept in a kind of place, and nothing in a box", () => {
    expect(kindsFor(null)).toEqual(["room"]);
    expect(kindsFor("room")[0]).toBe("freezer");
    expect(kindsFor("freezer")).toEqual(kindsFor("fridge"));
    expect(kindsFor("shelf")).toEqual(["rack", "box"]);
    expect(kindsFor("rack")).toEqual(["box"]);
    expect(kindsFor("bench")).toContain("instrument");
    expect(kindsFor("box")).toEqual([]);
    expect(kindsFor("instrument")).toEqual([]);
    expect(kindsFor("dewar")).toContain("box");
    expect(INSTRUMENTS).toContain("thermocycler");
  });

  it("names a new place by its kind and the next number free beside it", () => {
    expect(nameFor(stood, "shelf", "minus80")).toBe("Shelf 5");
    expect(nameFor(stood, "shelf", "bench1")).toBe("Shelf 1");
    expect(nameFor(stood, "room", null)).toBe("Room 1");
    expect(nameFor(stood, "gel-station", "bench2")).toBe("Gel station");
    expect(nameFor({ places: [{ id: "a", kind: "instrument", name: "Centrifuge", parent: "b" }] }, "centrifuge", "b")).toBe("Centrifuge 1");
  });

  it("says what to ask the lab for", () => {
    expect(placeToAdd(stood, "minus80", "shelf")).toEqual({ kind: "shelf", name: "Shelf 5", parent: "minus80" });
    expect(placeToAdd(stood, "minus80-s1", "box")).toMatchObject({ kind: "box", parent: "minus80-s1", grid: { rows: 9, columns: 9 } });
    expect(placeToAdd(stood, "minus80-s1", "box", { name: " Glycerol stocks ", grid: { rows: 10, columns: 10 } }))
      .toEqual({ kind: "box", name: "Glycerol stocks", parent: "minus80-s1", grid: { rows: 10, columns: 10 } });
    expect(placeToAdd(stood, "bench1", "instrument", { model: "microscope", name: "" })).toEqual({ kind: "instrument", name: "Microscope", parent: "bench1", model: "microscope" });
    expect(placeToAdd(stood, null, "room")).toEqual({ kind: "room", name: "Room 1", parent: null });
    // The made-up room is not in the lab's record, so what is added to it is added to nothing.
    expect(placeToAdd({ places: [] }, "~room", "freezer")).toEqual({ kind: "freezer", name: "Freezer 1", parent: null });
  });
});
