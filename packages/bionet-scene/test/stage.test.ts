/**
 * An instrument in use, as data.
 *
 * The shapes, the camera's place for each view and where each strand is drawn are plain numbers, so
 * they are checked as numbers: a shape stays inside the instrument it is a shape of, each view looks
 * at the part it is named for, and a strand's place along the template can be compared across rows.
 */
import { BaseLens, STAGE_VIEWS, STAGE_VIEW_NAMES, STEP_SECONDS, TUBE_SPACE, lensFrame, lidOpen, pairsOf, placeStrands, polymerasesOf, sceneView, shapeOf,
         stagePose, type Part, type StageLens } from "@biolibs/bionet-scene";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { exampleLab } from "@biolibs/bionet-space";
import { describe, expect, it } from "vitest";

const SIZE: [number, number, number] = [0.35, 0.25, 0.45];

describe("what an instrument is made of", () => {
  it("is known for a thermocycler and a gel station, and is a plain box for anything else", () => {
    expect(shapeOf("thermocycler")).toMatchObject({ block: { rows: 8, columns: 12 } });
    expect(shapeOf("gel-station")?.screen).toBeDefined();
    for (const not of ["centrifuge", "no such instrument", "constructor", undefined]) expect(shapeOf(not)).toBeNull();
  });

  it("keeps every part inside the instrument when its lid is shut, with the block under the lid", () => {
    for (const model of ["thermocycler", "gel-station"]) {
      const shape = shapeOf(model)!;
      const parts: Part[] = [...shape.body, ...(shape.lid === undefined ? [] : [shape.lid.part])];
      for (const part of parts) {
        for (const axis of [0, 1, 2] as const) {
          expect(Math.abs(part.at[axis]) + part.size[axis] / 2).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(part.size[axis]).toBeGreaterThan(0);
        }
      }
      const { block, lid } = shape;
      expect(Math.abs(block!.at[0] - lid!.part.at[0])).toBeLessThan(lid!.part.size[0] / 2);
      expect(block!.at[1]).toBeLessThan(lid!.part.at[1]);
      expect(lid!.opens).toBeGreaterThan(45);
    }
  });

  it("is carried by the lab scene, so an instrument is drawn as itself there too", () => {
    const view = sceneView(exampleLab(), { place: null });
    const cycler = view.places.find((one) => one.id === "thermocycler")!;
    expect(cycler).toMatchObject({ kind: "instrument", model: "thermocycler" });
    expect(typeof cycler.turn).toBe("number");
    expect(view.places.find((one) => one.id === "minus80")!.model).toBeUndefined();
  });
});

describe("the views of an instrument in use", () => {
  it("are what it shows and then what its operator pictures, each with a name", () => {
    expect(STAGE_VIEWS).toEqual(["machine", "block", "screen", "tube", "result"]);
    for (const view of STAGE_VIEWS) expect(STAGE_VIEW_NAMES[view].length).toBeGreaterThan(5);
    expect(STAGE_VIEWS.map(lidOpen)).toEqual([0, 1, 0, 1, 0]);      // the lid is up for looking under it
  });

  it("each look at the part they are named for, from outside the instrument", () => {
    const shape = shapeOf("thermocycler")!;
    const at = (part: readonly [number, number, number]): number[] => [part[0] * SIZE[0], SIZE[1] / 2 + part[1] * SIZE[1], part[2] * SIZE[2]];
    const block = stagePose("block", SIZE, shape);
    block.target.forEach((value, axis) => expect(value).toBeCloseTo(at(shape.block!.at)[axis]!, 6));
    expect(block.position[1]).toBeGreaterThan(SIZE[1]);                // from above
    const screen = stagePose("screen", SIZE, shape);
    screen.target.forEach((value, axis) => expect(value).toBeCloseTo(at(shape.screen!.at)[axis]!, 6));
    expect(screen.position[2]).toBeGreaterThan(screen.target[2]);       // from in front
    const tube = stagePose("tube", SIZE, shape);
    expect(tube.target[1]).toBeGreaterThan(SIZE[1]);                    // above the instrument
    expect(tube.position[0]).toBe(0);                                   // square on, so rows can be compared
    expect(stagePose("machine", SIZE, shape)).toEqual(stagePose("result", SIZE, shape));
    for (const view of STAGE_VIEWS) {
      const pose = stagePose(view, SIZE, shape);
      expect(Math.hypot(...pose.position.map((value, axis) => value - pose.target[axis]!))).toBeGreaterThan(0.2);
      expect(pose.fov).toBeGreaterThan(10);
    }
    // An instrument drawn as a plain box has no block or screen to look at, and is seen whole.
    expect(stagePose("block", SIZE, null)).toEqual(stagePose("machine", SIZE, null));
  });
});

describe("the strands in the tube", () => {
  const tube = { length: 1000, strands: [
    { from: 0, to: 1000, row: 0, kind: "template", points: "right" }, { from: 100, to: 120, row: 1, kind: "primer", points: "right" },
    { from: 100, to: 900, row: 2, kind: "product", points: "left" }, { from: 0, to: 1000, row: 3, kind: "template", points: "left" },
  ] } as const;

  it("are spread across a fixed width, so a place along the template lines up between rows", () => {
    const placed = placeStrands(tube, SIZE);
    expect(placed[0]!.start[0]).toBeCloseTo(-TUBE_SPACE.width / 2, 6);
    expect(placed[0]!.end[0]).toBeCloseTo(TUBE_SPACE.width / 2, 6);
    expect(placed[1]!.start[0]).toBeCloseTo(placed[2]!.start[0], 6);     // the primer starts where the product does
    expect(placed[2]!.end[0]).toBeCloseTo((0.9 - 0.5) * TUBE_SPACE.width, 6);
  });

  it("are stacked in rows above the instrument, top row first", () => {
    const placed = placeStrands(tube, SIZE);
    const heights = placed.map((one) => one.start[1]);
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
    expect(heights[0]).toBeCloseTo(SIZE[1] + TUBE_SPACE.above + TUBE_SPACE.height, 6);
    expect(heights[3]).toBeCloseTo(SIZE[1] + TUBE_SPACE.above, 6);
    for (const one of placed) expect(one.start[1]).toBe(one.end[1]);
    expect(placeStrands({ length: 0, strands: [{ from: 0, to: 0, row: 0, kind: "template", points: "right" }] }, SIZE)[0]!.start[0]).toBe(0);
    expect(placeStrands({ length: 10, strands: [] }, SIZE)).toEqual([]);
  });
});

describe("a step, played out", () => {
  const tube = { length: 1000, strands: [
    { from: 0, to: 1000, row: 0, kind: "template", points: "right", moves: "parts" }, { from: 0, to: 1000, row: 3, kind: "template", points: "left", moves: "parts" },
    { from: 100, to: 120, row: 2, kind: "primer", points: "right", moves: "lands" }, { from: 880, to: 900, row: 1, kind: "primer", points: "left", moves: "lands" },
    { from: 100, to: 1000, row: 2, kind: "long", points: "right", moves: "grows" }, { from: 0, to: 900, row: 1, kind: "long", points: "left", moves: "grows" },
    { from: 0, to: 1000, row: 0, kind: "template", points: "right" },
  ] } as const;
  const at = (through: number) => placeStrands(tube, SIZE, through);

  it("ends where a still picture of the step would be", () => {
    const still = placeStrands({ ...tube, strands: tube.strands.map(({ moves: _moves, ...rest }) => rest) }, SIZE);
    at(1).forEach((one, index) => {
      for (const axis of [0, 1, 2]) {
        expect(one.start[axis]).toBeCloseTo(still[index]!.start[axis]!, 9);
        expect(one.end[axis]).toBeCloseTo(still[index]!.end[axis]!, 9);
      }
      expect(one.presence).toBe(1);
    });
    expect(placeStrands(tube, SIZE)).toEqual(at(1));
    expect(STEP_SECONDS.slow).toBeGreaterThan(STEP_SECONDS.usual * 2);
  });

  it("starts two strands touching, and parts them steadily to their rows", () => {
    const [top, bottom] = [at(0)[0]!, at(0)[1]!];
    expect(top.start[1] - bottom.start[1]).toBeCloseTo(0.008, 6);
    const gaps = [0, 0.25, 0.5, 0.75, 1].map((through) => at(through)[0]!.start[1] - at(through)[1]!.start[1]);
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    expect(gaps.at(-1)).toBeCloseTo(TUBE_SPACE.height, 6);
    // Parting does not slide them along: a base stays above the base it was paired with.
    for (const through of [0, 0.5, 1]) expect(at(through)[0]!.start[0]).toBe(at(through)[1]!.start[0]);
  });

  it("brings a primer in from its 5′ side, fading up, to rest exactly on its place", () => {
    const [forward, reverse] = [2, 3].map((index) => [0, 0.5, 1].map((through) => at(through)[index]!));
    expect(forward![0]!.start[0]).toBeLessThan(forward![2]!.start[0]);      // the forward primer arrives from the left
    expect(reverse![0]!.start[0]).toBeGreaterThan(reverse![2]!.start[0]);   // the reverse from the right
    expect(forward!.map((one) => one.presence)).toEqual([0, 0.8, 1]);
    expect(forward![2]!.start[0]).toBeCloseTo((0.1 - 0.5) * TUBE_SPACE.width, 6);
    // Its length does not change on the way.
    for (const one of forward!) expect(one.end[0] - one.start[0]).toBeCloseTo(0.02 * TUBE_SPACE.width, 6);
  });

  it("grows a copy from its 5′ end towards the way it points, and shows nothing of it before it starts", () => {
    const right = [0, 0.5, 1].map((through) => at(through)[4]!);
    expect(right.map((one) => one.start[0])).toEqual([right[0]!.start[0], right[0]!.start[0], right[0]!.start[0]]);
    expect(right[1]!.end[0]).toBeCloseTo((right[0]!.start[0] + right[2]!.end[0]) / 2, 6);
    expect(right.map((one) => one.presence)).toEqual([0, 1, 1]);
    const left = [0, 0.5, 1].map((through) => at(through)[5]!);
    expect(left.map((one) => one.end[0])).toEqual([left[0]!.end[0], left[0]!.end[0], left[0]!.end[0]]);
    expect(left[1]!.start[0]).toBeGreaterThan(left[2]!.start[0]);
    // A strand that does nothing is where it is throughout, and time outside the step is the nearer end of it.
    expect(at(0)[6]).toEqual(at(1)[6]);
    expect(at(-2)).toEqual(at(0));
    expect(at(7)).toEqual(at(1));
  });
});

describe("what a step shows beyond the strands", () => {
  const tube = { length: 1000, strands: [
    { from: 0, to: 1000, row: 0, kind: "template", points: "right" }, { from: 0, to: 1000, row: 3, kind: "template", points: "left" },
    { from: 0, to: 900, row: 1, kind: "long", points: "left", moves: "grows" }, { from: 100, to: 1000, row: 2, kind: "long", points: "right", moves: "grows" },
  ] } as const;
  const parting = { length: 1000, strands: [
    { from: 0, to: 1000, row: 0, kind: "template", points: "right", moves: "parts" }, { from: 0, to: 1000, row: 3, kind: "template", points: "left", moves: "parts" },
  ] } as const;
  const landing = { length: 1000, strands: [
    { from: 0, to: 1000, row: 0, kind: "template", points: "right" }, { from: 880, to: 900, row: 1, kind: "primer", points: "left", moves: "lands" },
  ] } as const;

  it("joins two strands while they are together, and not once they have parted", () => {
    const pairs = (through: number) => pairsOf(placeStrands(parting, SIZE, through));
    expect(pairs(0).length).toBeGreaterThan(30);
    expect(pairs(0).every((one) => one.presence > 0.85)).toBe(true);
    const fading = [0, 0.15, 0.3].map((through) => pairs(through)[0]?.presence ?? 0);
    expect(fading).toEqual([...fading].sort((a, b) => b - a));
    expect(pairs(1)).toEqual([]);
    for (const one of pairs(0.1)) expect(one.top).toBeGreaterThan(one.bottom);
  });

  it("pairs a primer with its strand only as it settles, and a copy only as far as it has grown", () => {
    expect(pairsOf(placeStrands(landing, SIZE, 0.2))).toEqual([]);
    const settled = pairsOf(placeStrands(landing, SIZE, 1));
    expect(settled.length).toBeGreaterThan(0);
    for (const one of settled) expect(one.x).toBeGreaterThan((0.87 - 0.5) * TUBE_SPACE.width);
    const counts = [0.1, 0.5, 1].map((through) => pairsOf(placeStrands(tube, SIZE, through)).length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[0]).toBeLessThan(counts[2]!);
    // A pair stays where it is along the template as the copy grows past it.
    const marks = (through: number) => new Set(pairsOf(placeStrands(tube, SIZE, through)).map((one) => `${one.x.toFixed(4)} ${one.top.toFixed(4)}`));
    for (const one of marks(0.5)) expect(marks(1).has(one)).toBe(true);
  });

  it("puts a polymerase at the growing end of each copy, and nowhere before it starts or after it ends", () => {
    expect(polymerasesOf(placeStrands(tube, SIZE, 0))).toEqual([]);
    expect(polymerasesOf(placeStrands(tube, SIZE, 1))).toEqual([]);
    const placed = placeStrands(tube, SIZE, 0.5);
    expect(polymerasesOf(placed)).toEqual([placed[2]!.start, placed[3]!.end]);      // a strand pointing left grows at its left end
    expect(polymerasesOf(placeStrands(parting, SIZE, 0.5))).toEqual([]);
    expect(STEP_SECONDS.fast).toBeLessThan(STEP_SECONDS.usual);
    expect(STEP_SECONDS.usual).toBeLessThan(3);      // quick enough not to be waited for
  });
});

describe("the real bases, magnified", () => {
  const cell = (base: string, state: "paired" | "single" | "fresh" = "paired") => ({ base, state });
  const lens: StageLens = {
    from: 100, to: 106, rows: [2, 3], polymerase: 4, beyond: 890,
    upper: { label: "fwd-1, and the copy", cells: [cell("G", "single"), cell("A"), cell("T"), cell("C", "fresh"), cell("", "single"), cell("", "single")] },
    lower: { label: "template, bottom strand", cells: [cell("T", "single"), cell("T"), cell("A"), cell("G"), cell("C", "single"), cell("A", "single")] },
    joined: [false, true, true, true, false, false],
  };

  it("is written as letters, each over its partner, and says in words what it shows", () => {
    const drawn = renderToStaticMarkup(h(BaseLens, { lens }));
    expect(drawn).toContain('aria-label="Bases 101 to 106 of the template. fwd-1, and the copy: GATC--. template, bottom strand: TTAGCA. 3 of 6 places are paired."');
    expect(drawn.match(/class="base pair"/g)).toHaveLength(3);
    expect(drawn).toContain('class="base base-c fresh">C<');
    expect(drawn).toContain('class="base none single next">·<');       // where the polymerase will add the next base
    expect(drawn).toContain("890 more to copy");
    expect(drawn.indexOf("5′")).toBeLessThan(drawn.indexOf("3′"));       // the upper strand reads 5′ to 3′
    expect(renderToStaticMarkup(h(BaseLens, { lens: { ...lens, beyond: 0 } }))).toContain("bases 101–106");
  });

  it("is outlined on the strands it is a closer look at, wide enough to see", () => {
    const frame = lensFrame(lens, 1000, SIZE);
    expect(frame).toHaveLength(5);
    expect(frame[0]).toEqual(frame[4]);
    expect(frame[1]![0] - frame[0]![0]).toBeGreaterThanOrEqual(0.024 - 1e-9);         // six bases of a thousand would be invisible
    expect((frame[0]![0] + frame[1]![0]) / 2).toBeCloseTo((0.103 - 0.5) * TUBE_SPACE.width, 6);
    const rows = placeStrands({ length: 1000, strands: [0, 1, 2, 3].map((row) => ({ from: 0, to: 1000, row, kind: "template", points: "right" } as const)) }, SIZE);
    expect(frame[0]![1]).toBeGreaterThan(rows[2]!.start[1]);                            // it encloses rows 2 and 3
    expect(frame[2]![1]).toBeLessThan(rows[3]!.start[1]);
    expect(frame[0]![1]).toBeLessThan(rows[1]!.start[1]);                               // and not row 1
    const wide = lensFrame({ from: 0, to: 1000, rows: [0, 3] }, 1000, SIZE);
    expect(wide[1]![0] - wide[0]![0]).toBeCloseTo(TUBE_SPACE.width, 6);
  });
});
