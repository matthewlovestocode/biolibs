/**
 * An instrument in use, as data.
 *
 * The shapes, the camera's place for each view and where each strand is drawn are plain numbers, so
 * they are checked as numbers: a shape stays inside the instrument it is a shape of, each view looks
 * at the part it is named for, and a strand's place along the template can be compared across rows.
 */
import { placeGel, placeJoining, stageViewName, measureLine, MOLECULE_RADIUS, moleculeCentre, placeMolecule, BaseLens, STAGE_VIEWS, STAGE_VIEW_NAMES, STEP_SECONDS, TUBE_SPACE, lensFrame, lidOpen, pairsOf, placeStrands, polymerasesOf, sceneView, shapeOf,
         stagePose, shapeFor, roundScale, type Part, type StageLens } from "@biolibs/bionet-scene";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INSTRUMENT_SIZE, VIEWED_FROM, exampleLab } from "@biolibs/bionet-space";
import { describe, expect, it } from "vitest";

const SIZE: [number, number, number] = [0.35, 0.25, 0.45];

describe("what an instrument is made of", () => {
  it("is known for every instrument a lab can place, and is a plain box for anything else", () => {
    expect(shapeOf("thermocycler")).toMatchObject({ block: { rows: 8, columns: 12 } });
    expect(shapeOf("gel-station")?.screen).toBeDefined();
    // A microscope has nothing to say and nothing to open: it is a shape and no more.
    const microscope = shapeOf("microscope")!;
    expect(microscope.body.length).toBeGreaterThan(1);
    expect([microscope.screen, microscope.lid, microscope.block]).toEqual([undefined, undefined, undefined]);
    for (const not of ["no such instrument", "constructor", undefined]) expect(shapeOf(not)).toBeNull();
  });

  it("keeps every part inside the instrument when its lid is shut, with the block under the lid", () => {
    for (const model of ["thermocycler", "gel-station"]) {
      const shape = shapeOf(model)!;
      const parts: Part[] = [...shape.body, ...(shape.lid === undefined ? [] : shape.lid.parts)];
      for (const part of parts) {
        for (const axis of [0, 1, 2] as const) {
          expect(Math.abs(part.at[axis]) + part.size[axis] / 2).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(part.size[axis]).toBeGreaterThan(0);
        }
      }
      const { block, lid } = shape;
      // The first piece of a lid is the lid itself; the rest are its handle and such.
      const cover = lid!.parts[0]!;
      expect(Math.abs(block!.at[0] - cover.at[0])).toBeLessThan(cover.size[0] / 2);
      expect(block!.at[1]).toBeLessThan(cover.at[1]);
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

describe("a molecule drawn in the scene", () => {
  const ring = { name: "p", length: 4000, circular: true, features: [
    { start: 0, end: 1000, strand: 1 as const, tone: "yours" as const, label: "a" },
    { start: 500, end: 1500, strand: -1 as const, tone: "held" as const, label: "b" },
    { start: 2000, end: 3000, strand: 0 as const, tone: "found" as const, label: "c" },
  ] };
  const far = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

  it("draws a circle as a ring that closes, read from the top and clockwise", () => {
    const placed = placeMolecule(ring, [0, 1, 0], [0, 1, 5], 0.2);
    expect(far(placed.backbone[0]!, placed.backbone.at(-1)!)).toBeCloseTo(0, 6);
    for (const point of placed.backbone) expect(far(point, [0, 1, 0])).toBeCloseTo(0.2, 6);
    // The origin is at the top, and a quarter of the way round is to the right of whoever is looking.
    expect(placed.backbone[0]![1]).toBeCloseTo(1.2, 6);
    expect(placed.features[0]!.points.at(-1)![0]).toBeCloseTo(0.2, 6);
  });

  it("lies flat on to whoever is looking, from the side or from above", () => {
    for (const from of [[0, 1, 5], [4, 3, 2], [0, 9, 0]] as const) {
      const placed = placeMolecule(ring, [0, 1, 0], from, 0.2);
      const facing = [from[0] - 0, from[1] - 1, from[2] - 0];
      for (const point of placed.backbone) expect((point[0] - 0) * facing[0]! + (point[1] - 1) * facing[1]! + (point[2] - 0) * facing[2]!).toBeCloseTo(0, 6);
    }
  });

  it("puts stretches that overlap in different lanes, the second inside the first", () => {
    const placed = placeMolecule(ring, [0, 0, 0], [0, 0, 5], 0.2);
    const reach = placed.features.map((one) => far(one.points[0]!, [0, 0, 0]));
    expect(reach[0]).toBeCloseTo(0.2, 6);
    expect(reach[1]).toBeLessThan(0.2);
    expect(reach[2]).toBeCloseTo(0.2, 6);
  });

  it("gives a stretch a barb only if it points", () => {
    const placed = placeMolecule(ring, [0, 0, 0], [0, 0, 5], 0.2);
    expect(placed.features.map((one) => one.barb !== null)).toEqual([true, true, false]);
  });

  it("draws anything else as a bar, with what is marked above it and its name below", () => {
    const placed = placeMolecule({ ...ring, circular: false }, [0, 1, 0], [0, 1, 5], 0.2);
    expect(placed.backbone).toEqual([[-0.2, 1, 0], [0.2, 1, 0]]);
    expect(placed.features[0]!.points[0]![1]).toBeGreaterThan(1);
    expect(placed.middle[1]).toBeLessThan(1);
    expect(placed.size).toBe("4,000 bp");
  });

  it("makes room for it in the result view", () => {
    const size = [0.3, 0.25, 0.4] as const;
    const [plain, roomy] = [stagePose("result", size, null), stagePose("result", size, null, true)];
    expect(roomy.target[1]).toBeGreaterThan(plain.target[1]);
    expect(moleculeCentre(size)[1]).toBeGreaterThan(size[1] + MOLECULE_RADIUS);
  });
});

describe("a length marked off under the strands", () => {
  it("stands under the bases it is measured between", () => {
    const size = [0.3, 0.25, 0.4] as const;
    const { points, at } = measureLine({ from: 250, to: 750, label: "500" }, 1000, size);
    expect(points[0]![0]).toBeCloseTo(-TUBE_SPACE.width / 4, 6);
    expect(points.at(-1)![0]).toBeCloseTo(TUBE_SPACE.width / 4, 6);
    expect(at[0]).toBeCloseTo(0, 6);
    // Below the lowest strand, and above the machine.
    expect(points[2]![1]).toBeLessThan(size[1] + TUBE_SPACE.above);
    expect(points[2]![1]).toBeGreaterThan(size[1]);
  });

  it("puts a second one under the first", () => {
    const size = [0.3, 0.25, 0.4] as const;
    expect(measureLine({ from: 0, to: 10, label: "" }, 100, size, 1).at[1]).toBeLessThan(measureLine({ from: 0, to: 10, label: "" }, 100, size, 0).at[1]);
  });
});

describe("a gel that has been run, drawn", () => {
  const gel = { lanes: [
    { name: "ladder", tone: "dim" as const, bands: [{ position: 0, intensity: 1, label: "10,000" }, { position: 1, intensity: 1, label: "250" }] },
    { name: "digest", tone: "held" as const, bands: [{ position: 0.5, intensity: 0.5, label: "1,581" }] },
  ] };

  it("has the wells at the top and the small pieces at the bottom", () => {
    const placed = placeGel(gel, [0, 1, 0], [0, 1, 5], [0.4, 0.4]);
    const [large, small, mid] = placed.bands.map((band) => band.points[0]![1]);
    expect(large!).toBeGreaterThan(mid!);
    expect(mid!).toBeGreaterThan(small!);
    expect(placed.wells[0]![0]![1]).toBeGreaterThan(large!);
    expect(placed.names.map((one) => one.name)).toEqual(["ladder", "digest"]);
    // Every band is inside the slab.
    for (const band of placed.bands) for (const point of band.points) { expect(Math.abs(point[0])).toBeLessThan(0.2); expect(Math.abs(point[1] - 1)).toBeLessThan(0.2); }
  });

  it("writes the ladder's sizes to its left and the sample's to its right", () => {
    const placed = placeGel(gel, [0, 1, 0], [0, 1, 5], [0.4, 0.4]);
    expect(placed.bands[0]!.at[0]).toBeLessThan(placed.bands[0]!.points[0]![0]);
    expect(placed.bands[2]!.at[0]).toBeGreaterThan(placed.bands[2]!.points[1]![0]);
  });

  it("starts every band at the well and draws them apart as it runs", () => {
    const start = placeGel({ ...gel, ran: 0 }, [0, 1, 0], [0, 1, 5], [0.4, 0.4]).bands.map((band) => band.points[0]![1]);
    expect(new Set(start.map((y) => y.toFixed(6))).size).toBe(1);
    const half = placeGel({ ...gel, ran: 0.5 }, [0, 1, 0], [0, 1, 5], [0.4, 0.4]).bands.map((band) => band.points[0]![1]);
    const done = placeGel(gel, [0, 1, 0], [0, 1, 5], [0.4, 0.4]).bands.map((band) => band.points[0]![1]);
    expect(half[1]!).toBeGreaterThan(done[1]!);
    expect(half[1]!).toBeLessThan(start[1]!);
  });

  it("calls the views by what the machine is", () => {
    expect(stageViewName("gel-station", "block")).toBe("The gel");
    expect(stageViewName("gel-station", "result")).toBe("The gel, run");
    expect(stageViewName("thermocycler", "block")).toBe("The block");
    expect(stageViewName("something else", "screen")).toBe("The screen");
  });

  it("marks a place on a molecule across its backbone, named outside it", () => {
    const placed = placeMolecule({ name: "p", length: 4000, circular: true, features: [], marks: [{ at: 1000, label: "EcoRI" }, { at: 9000, label: "past the end" }] }, [0, 0, 0], [0, 0, 5], 0.2);
    expect(placed.marks.map((one) => one.label)).toEqual(["EcoRI"]);
    const [inner, outer] = placed.marks[0]!.points;
    expect(Math.hypot(...inner!)).toBeLessThan(0.2);
    expect(Math.hypot(...outer!)).toBeGreaterThan(0.2);
    expect(Math.hypot(...placed.marks[0]!.at)).toBeGreaterThan(Math.hypot(...outer!));
    // A quarter of the way round is to the right.
    expect(placed.marks[0]!.at[0]).toBeGreaterThan(0.2);
  });
});

describe("pieces being joined, drawn", () => {
  const joining = { circular: true, pieces: [
    { name: "vector", length: 300, flipped: false, tone: "yours" as const },
    { name: "insert", length: 100, flipped: true, tone: "theirs" as const },
  ], joins: [{ label: "GATC" }, { label: "AATT" }] };

  it("gives each piece a share of the whole in proportion to its length", () => {
    const placed = placeJoining({ ...joining, joined: 1 }, [0, 0, 0], [0, 0, 5], 0.2);
    const round = (piece: { points: [number, number, number][] }): number => {
      // How far round the circle it goes, from the angle its two ends subtend.
      const angle = (at: [number, number, number]): number => Math.atan2(at[0], at[1]);
      return ((angle(piece.points.at(-1)!) - angle(piece.points[0]!) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
    };
    expect(round(placed.pieces[0]!)).toBeCloseTo(0.75, 2);
    expect(round(placed.pieces[1]!)).toBeCloseTo(0.25, 2);
    for (const piece of placed.pieces) for (const point of piece.points) expect(Math.hypot(point[0], point[1])).toBeCloseTo(0.2, 6);
  });

  it("says which piece went in the other way round", () => {
    const placed = placeJoining(joining, [0, 0, 0], [0, 0, 5], 0.2);
    expect(placed.pieces.map((one) => one.label)).toEqual(["vector", "insert ↺"]);
    expect(placed.joins.map((one) => one.label)).toEqual(["GATC", "AATT"]);
  });

  it("leaves a gap at every join while the pieces are apart, and none once they are joined", () => {
    const apart = placeJoining({ ...joining, joined: 0 }, [0, 0, 0], [0, 0, 5], 0.2);
    const done = placeJoining({ ...joining, joined: 1 }, [0, 0, 0], [0, 0, 5], 0.2);
    const gap = (placed: typeof apart): number => Math.hypot(placed.pieces[0]!.points.at(-1)![0] - placed.pieces[1]!.points[0]![0],
                                                             placed.pieces[0]!.points.at(-1)![1] - placed.pieces[1]!.points[0]![1]);
    expect(gap(apart)).toBeGreaterThan(gap(done));
    expect(gap(done)).toBeCloseTo(0, 6);
    expect(apart.joins.every((join) => join.closed === 0)).toBe(true);
    expect(done.joins.every((join) => join.closed === 1)).toBe(true);
  });

  it("lays pieces that do not close along a line, with one join fewer", () => {
    const placed = placeJoining({ ...joining, circular: false, joins: [{ label: "GATC" }] }, [0, 1, 0], [0, 1, 5], 0.2);
    expect(placed.joins.length).toBe(1);
    expect(placed.pieces[0]!.points[0]).toEqual([-0.2, 1, 0]);
    expect(placed.pieces.at(-1)!.points.at(-1)![0]).toBeCloseTo(0.2, 6);
  });

  it("calls a heat block's views by what they are", () => {
    expect(stageViewName("heat-block", "machine")).toBe("The heat block");
    expect(stageViewName("heat-block", "result")).toBe("What it makes");
    expect(shapeOf("heat-block")?.block?.rows).toBe(2);
  });
});

describe("walking up to a machine and then being at it", () => {
  it("looks from the same side both times", () => {
    // The room looks at a place inside it from one direction; a machine on its own has to be seen
    // from that same direction, or the cut between the two is two pictures of two machines.
    const size = [0.35, 0.25, 0.45] as const;
    const pose = stagePose("machine", size, shapeOf("thermocycler"));
    const unit = (at: readonly number[]): number[] => {
      const length = Math.hypot(at[0]!, at[1]!, at[2]!);
      return at.map((one) => Math.round((one / length) * 1000) / 1000);
    };
    const looking = unit([pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]]);
    expect(looking).toEqual(unit(VIEWED_FROM.inside));
    // And from in front of it, far enough out that the whole machine is in the picture.
    expect(pose.position[2]).toBeGreaterThan(Math.max(...size));
  });
});

/**
 * What a lab's instruments are made of.
 *
 * A model with a size but no shape is drawn as a featureless box, which is the one thing a scene of
 * a real lab should never show: a person cannot walk up to a box. And a part written in fractions
 * is easy to put outside the instrument it belongs to without anybody noticing from one angle.
 */
describe("every instrument a lab can place", () => {
  const models = Object.keys(INSTRUMENT_SIZE);

  it("is made of something, rather than being drawn as a plain box", () => {
    const bare = models.filter((model) => shapeOf(model) === null);
    expect(bare).toEqual([]);
  });

  it("keeps every part of itself inside itself", () => {
    const outside: string[] = [];
    for (const model of models) {
      const shape = shapeOf(model);
      if (shape === null) continue;
      const parts = [...shape.body, ...(shape.lid === undefined ? [] : shape.lid.parts)];
      for (const [at, part] of parts.entries()) {
        for (const axis of [0, 1, 2] as const) {
          const low = part.at[axis] - part.size[axis] / 2;
          const high = part.at[axis] + part.size[axis] / 2;
          if (low < -0.5001 || high > 0.5001) outside.push(`${model} part ${at + 1} on axis ${axis}`);
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it("puts its block and its screen on itself, not beside it", () => {
    const astray: string[] = [];
    for (const model of models) {
      const shape = shapeOf(model);
      if (shape === null) continue;
      for (const [what, at] of [["screen", shape.screen?.at], ["block", shape.block?.at]] as const) {
        if (at === undefined) continue;
        if (at.some((one) => one < -0.5001 || one > 0.5001)) astray.push(`${model} ${what}`);
      }
    }
    expect(astray).toEqual([]);
  });

  it("gives a block at least one well, since a block with none is not a block", () => {
    for (const model of models) {
      const block = shapeOf(model)?.block;
      if (block === undefined) continue;
      expect(block.rows * block.columns, model).toBeGreaterThan(0);
    }
  });
});

describe("what each machine calls its own views", () => {
  it("names them for every model a tool is used at, rather than calling them all the block", () => {
    // The mistake this catches: a machine wired into the lab scene without its own names, so the
    // same view is "The cuvette" in the tool's own tabs and "The block" where it stands in the room.
    for (const model of ["thermocycler", "gel-station", "heat-block", "shaking-incubator", "spectrophotometer", "electroporator"]) {
      const named = STAGE_VIEWS.map((view) => stageViewName(model, view));
      expect(new Set(named).size, model).toBe(STAGE_VIEWS.length);
      // A thermocycler is the one that keeps the plain names, since they were written for it.
      if (model !== "thermocycler") {
        expect(named.join("|"), model).not.toBe(STAGE_VIEWS.map((view) => STAGE_VIEW_NAMES[view]).join("|"));
      }
    }
  });
});

/**
 * The three things a lab is mostly made of.
 *
 * A bench, a freezer and a fridge are shaped by what kind of thing they are rather than by a model,
 * since a lab has a bench and not a bench of a particular make. The checks are the same ones every
 * instrument gets — every piece inside the thing it is a piece of — plus the one that matters for a
 * bench: whatever stands on it stands on its worktop, so the worktop has to be at the top.
 */
describe("a bench, a freezer and a fridge", () => {
  const KINDS = ["bench", "freezer", "fridge"] as const;

  it("are made of pieces rather than drawn as plain boxes", () => {
    for (const kind of KINDS) expect(shapeFor({ kind })?.body.length, kind).toBeGreaterThan(4);
  });

  it("keep every piece inside themselves", () => {
    for (const kind of KINDS) {
      const shape = shapeFor({ kind })!;
      for (const [at, part] of shape.body.entries()) {
        for (const axis of [0, 1, 2] as const) {
          expect(Math.abs(part.at[axis]) + part.size[axis] / 2, `${kind} piece ${at + 1} on axis ${axis}`).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(part.size[axis], `${kind} piece ${at + 1}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("put a bench's worktop at the top of it, since that is what things stand on", () => {
    const bench = shapeFor({ kind: "bench" })!;
    const wide = bench.body.filter((one) => one.size[0] >= 0.9 && one.size[2] >= 0.9);
    expect(wide.length).toBeGreaterThan(0);
    const worktop = wide.sort((a, b) => b.at[1] - a.at[1])[0]!;
    expect(worktop.at[1] + worktop.size[1] / 2).toBeGreaterThan(0.4);
  });

  it("put a cold cabinet's door on its front, where somebody opens it", () => {
    for (const kind of ["freezer", "fridge"] as const) {
      const shape = shapeFor({ kind })!;
      const door = shape.body.filter((one) => one.size[0] > 0.9 && one.size[1] > 0.6 && one.size[2] < 0.1)[0];
      expect(door, kind).toBeDefined();
      expect(door!.at[2], kind).toBeGreaterThan(0.3);
    }
  });

  it("still draw as a plain box the kinds that have no shape", () => {
    for (const kind of ["room", "shelf", "rack", "box", "something a lab invented"]) {
      expect(shapeFor({ kind }), kind).toBeNull();
    }
  });

  it("take an instrument by its model, the way they always did", () => {
    expect(shapeFor({ kind: "instrument", model: "thermocycler" })).toBe(shapeOf("thermocycler"));
    expect(shapeFor({ kind: "instrument", model: "no such machine" })).toBeNull();
  });
});

/**
 * A round piece drawn round.
 *
 * A piece is written as fractions of the instrument and the instrument is scaled unevenly to its
 * own size in metres, so a disc written as a circle of fractions comes out an ellipse of metres
 * unless something undoes that. The autoclave's door was drawn 792 mm one way and 462 mm the other.
 */
describe("a round piece of an instrument", () => {
  /** The two world extents of a round piece's cross-section, in metres, as it ends up drawn. */
  const across = (part: Part, within: [number, number, number]): [number, number] => {
    const scale = roundScale(part, within);
    const along = part.along ?? "y";
    // The cylinder is modelled across its own x and z; those map to world axes by how it is turned.
    const [first, second] = along === "y" ? [0, 2] as const : along === "x" ? [1, 2] as const : [0, 1] as const;
    return [scale[0] * within[first], scale[2] * within[second]];
  };

  it("comes out the same width in both directions, whatever the instrument's shape", () => {
    const within: [number, number, number] = [0.7, 1.2, 0.8];
    for (const along of ["x", "y", "z"] as const) {
      const [one, two] = across({ at: [0, 0, 0], size: [0.66, 0.66, 0.66], round: true, along }, within);
      expect(one, along).toBeCloseTo(two, 9);
    }
  });

  it("takes the smaller of the two it was written with, so it stays inside its own box", () => {
    // The autoclave's door: 0.66 of 0.7 m is 462 mm, 0.66 of 1.2 m is 792 mm. It is the smaller.
    const [one] = across({ at: [0, 0, 0.44], size: [0.66, 0.66, 0.06], round: true, along: "z" }, [0.7, 1.2, 0.8]);
    expect(one).toBeCloseTo(0.462, 6);
  });

  it("leaves the length alone, which is the axis it runs along", () => {
    expect(roundScale({ at: [0, 0, 0], size: [0.2, 0.9, 0.2], round: true }, [1, 1, 1])[1]).toBe(0.9);
    expect(roundScale({ at: [0, 0, 0], size: [0.9, 0.2, 0.2], round: true, along: "x" }, [1, 1, 1])[1]).toBe(0.9);
    expect(roundScale({ at: [0, 0, 0], size: [0.2, 0.2, 0.9], round: true, along: "z" }, [1, 1, 1])[1]).toBe(0.9);
  });

  it("changes nothing for an instrument that is a cube, where there was never a problem", () => {
    const part: Part = { at: [0, 0, 0], size: [0.4, 0.5, 0.4], round: true };
    expect(roundScale(part, [1, 1, 1])).toEqual([0.4, 0.5, 0.4]);
  });

  it("answers with nothing rather than infinity for an instrument of no size", () => {
    expect(roundScale({ at: [0, 0, 0], size: [0.4, 0.5, 0.4], round: true }, [0, 0, 0])).toEqual([0, 0.5, 0]);
  });

  it("holds for every round piece of every instrument a lab can place", () => {
    for (const model of Object.keys(INSTRUMENT_SIZE)) {
      const shape = shapeOf(model);
      if (shape === null) continue;
      const within = [...INSTRUMENT_SIZE[model]!] as [number, number, number];
      const parts = [...shape.body, ...(shape.lid === undefined ? [] : shape.lid.parts)];
      for (const [at, part] of parts.entries()) {
        if (part.round !== true) continue;
        const [one, two] = across(part, within);
        expect(one, `${model} piece ${at + 1}`).toBeCloseTo(two, 9);
      }
    }
  });
});
