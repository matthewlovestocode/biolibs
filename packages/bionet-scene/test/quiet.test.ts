/**
 * Pieces that are there to hold something up.
 *
 * A scene of glowing edges spends its brightness on whatever has the most edges, not on whatever
 * matters most. Four bench legs are four thin boxes and forty-eight lines, so an unquietened row of
 * benches draws the eye to its legs rather than to what is standing on them, and the castors under
 * a freezer do the same for a cabinet.
 *
 * What is checked is the thing that actually matters, which is not a colour but whether the bloom
 * pass picks the edge up: below the threshold it is drawn as a line, above it the pass spreads it
 * into the pixels around it, and that spreading is what reads as glow.
 */
import { SKINS, fillAt, glows, paint, sceneView, shapeFor, skinTone } from "@biolibs/bionet-scene";
import { exampleLab } from "@biolibs/bionet-space";
import { readFileSync } from "node:fs";

const lab = exampleLab();
import { describe, expect, it } from "vitest";

/** Every instrument the scene can draw, read from where they are written. */
const MODELS = [...readFileSync(new URL("../src/shapes.ts", import.meta.url), "utf8")
  .matchAll(/^ {2}"?([a-z0-9-]+)"?: \{\n {4}body:/gm)].map((found) => found[1]!);

/** What a thing near the camera is drawn at, from `sceneView`; a bench is the quietest of them. */
const CLOSE = 0.6;
const edge = (part: { loud?: number }, picked: boolean): string =>
  `#${paint("yours", "dark", CLOSE * (picked ? 1 : part.loud ?? 1)).color.getHexString()}`;

/** Everything a lab stands its things on: legs under a bench, castors under a cabinet. */
const stands = ["bench", "freezer", "fridge"] as const;

describe.each(stands)("what a %s stands on", (kind) => {
  const shape = shapeFor({ kind })!;
  const quiet = shape.body.filter((part) => (part.loud ?? 1) < 1);
  const rest = shape.body.filter((part) => (part.loud ?? 1) === 1);

  it("is four pieces, and nothing else about it is quiet", () => {
    expect(quiet).toHaveLength(4);
    expect(rest.length).toBeGreaterThan(0);
  });

  it("is drawn as lines, while the rest of it is drawn as light", () => {
    for (const leg of quiet) expect(glows(edge(leg, false))).toBe(false);
    for (const part of rest) expect(glows(edge(part, false))).toBe(true);
  });

  it("comes up with the rest when it is the thing being looked at", () => {
    // Somebody who has walked up to a bench may well be looking at how it stands, so quiet is
    // about what is in the way of reading a room, not about a piece mattering less.
    for (const leg of quiet) expect(glows(edge(leg, true))).toBe(true);
  });

  it("recedes in its skin too, across the room, instead of standing there as a solid block", () => {
    // The mistake this catches, which was shipped once: quietening the edges alone. With skins on
    // across the room every piece fills to 0.92, so the legs stayed solid while losing the outline
    // that said what they were — four grey boxes under a slab, louder than the glow they replaced.
    const plain = SKINS["plain"]!;
    for (const leg of quiet) {
      const far = fillAt(plain, "on", 0, 0.04, leg.loud ?? 1);
      expect(far.fill).toBeLessThan(fillAt(plain, "on", 0, 0.04).fill);
      expect(far.hides).toBe(false);
    }
    // And the rest of the thing is as solid as it ever was, so it still reads as an object.
    for (const part of rest) expect(fillAt(plain, "on", 0, 0.04, part.loud ?? 1).fill).toBe(plain.far);
  });

  it("is left exactly as it was with skins off, whatever it says about being quiet", () => {
    const plain = SKINS["plain"]!;
    for (const part of [...quiet, ...rest]) expect(fillAt(plain, "off", 0, 0.04, part.loud ?? 1).fill).toBe(0.04);
  });
});

describe("every piece a shape is quiet about", () => {
  const shapes = [
    ...(["bench", "freezer", "fridge"] as const).map((kind) => [kind, shapeFor({ kind })!] as const),
    ...MODELS.map((model) => [model, shapeFor({ kind: "instrument", model })!] as const),
  ].filter(([, shape]) => shape !== null);

  it("covers every shape in the lab, so none is left glowing at its feet", () => {
    expect(shapes.length).toBeGreaterThan(12);
    const loud = shapes.flatMap(([name, shape]) =>
      shape.body.filter((part) => part.round === true && part.along === undefined && part.at[1] < -0.35 && (part.loud ?? 1) === 1)
        .map(() => name));
    // The computer's mouse is round and low and is not a foot; it is the only one left at full.
    expect(loud).toEqual(["computer"]);
  });

  it("is a piece that comes in a matching set, which is what a foot is", () => {
    // The mistake this catches, which I made: quietening by position and size alone, which took the
    // computer's mouse for a castor. A foot is never on its own — it is one of three or four of the
    // same thing under the same object — and a dial or a mouse never is one of a set.
    for (const [name, shape] of shapes) {
      const quiet = shape.body.filter((part) => (part.loud ?? 1) < 1);
      if (quiet.length === 0) continue;
      const sizes = new Set(quiet.map((part) => part.size.join("x")));
      expect(sizes.size, `${name} quietens pieces of differing sizes`).toBe(1);
      expect(quiet.length, `${name} quietens a piece that is not one of a set`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the bench under the machine you are standing at", () => {
  it("goes see-through without its legs coming back up to full", () => {
    // The mistake this catches, which I shipped once: one flag answering two questions. The bench
    // holding what you are at has to clear, or its skin is in the way of the machine — but it is
    // not the thing being looked at, and lighting its legs puts the glow back where it was worst.
    const at = sceneView(lab, { place: "thermocycler" });
    const bench = at.places.find((one) => one.kind === "bench" && one.id === "bench1");
    expect(bench).toBeDefined();
    expect(bench!.opened).toBe(true);
    expect(bench!.picked).toBe(false);
    // And the machine itself is both.
    const machine = at.places.find((one) => one.id === "thermocycler")!;
    expect(machine.opened).toBe(true);
    expect(machine.picked).toBe(true);
  });
});

describe("the box you press", () => {
  it("is drawn for a box of tubes and not for a thing that has a shape", () => {
    // Every place carries a full-size box so it can be pressed. For a box of tubes that box is the
    // box — its tint says how full it is. For anything drawn from a shape the thing is already
    // drawn, and tinting the press box too put a faint crate round every bench and every machine.
    expect(shapeFor({ kind: "box" })).toBe(null);
    expect(shapeFor({ kind: "bench" })).not.toBe(null);
    expect(shapeFor({ kind: "freezer" })).not.toBe(null);
    expect(shapeFor({ kind: "instrument", model: "electroporator" })).not.toBe(null);
    // A room is pressable and has no shape, but it is never tinted either: it has no fill.
    expect(shapeFor({ kind: "room" })).toBe(null);
    const view = sceneView(lab, { place: null });
    expect(view.places.find((one) => one.kind === "room")!.fill).toBe(0);
  });
});

describe("what a bench is made of", () => {
  const bench = SKINS["bench"]!;

  it("does not thin out when somebody walks up to it, because it has no inside", () => {
    // The mistake this catches: giving a bench the plain skin, which clears as you approach and so
    // puts its own shelves, legs and drawers in front of the machine you came to the bench to use.
    expect(bench.near).toBe(bench.far);
    for (const how of [0, 0.5, 1]) expect(fillAt(bench, "on", how, 0.04).fill).toBe(bench.far);
    expect(fillAt(bench, "on", 1, 0.04).hides).toBe(true);
    // And the plain skin still clears, since most things are worth seeing into.
    expect(fillAt(SKINS["plain"]!, "on", 1, 0.04).fill).toBeLessThan(SKINS["plain"]!.far);
  });

  it("is drawn as furniture, not in the colour of whose lab it is", () => {
    expect(skinTone(bench, "yours")).toBe("dim");
    expect(skinTone(SKINS["plain"]!, "yours")).toBe("yours");
  });

  it("gives its colour up the moment the lab has something to say about it", () => {
    // Material never outranks meaning: a bench holding a search match is drawn as the match.
    for (const tone of ["found", "attention", "held", "theirs", "good"] as const) {
      expect(skinTone(bench, tone)).toBe(tone);
    }
  });

  it("is still the drawing as it was with skins off", () => {
    for (const how of [0, 1]) expect(fillAt(bench, "off", how, 0.04).fill).toBe(0.04);
  });
});
