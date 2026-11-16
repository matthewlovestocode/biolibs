/**
 * Arranging a room, checked as data.
 *
 * What matters is what the lab is told: that a move not yet made is drawn but not said, that
 * standing one place does not make the others shuffle, and that a place stood in another, or
 * through a wall, is drawn as needing attention and said in words.
 */
import { arrange, exampleLab, standingAt, standingOf, type Layout, type Standing } from "@biolibs/bionet-space";
import { arranging, roomsOf, toSay } from "@biolibs/bionet-scene";
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
