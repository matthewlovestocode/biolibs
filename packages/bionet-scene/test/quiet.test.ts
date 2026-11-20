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

/** Every shape the lab draws, by name: the kinds it stands in a room, and every instrument. */
const shapes = [
  ...(["bench", "freezer", "fridge"] as const).map((kind) => [kind, shapeFor({ kind })!] as const),
  ...MODELS.map((model) => [model, shapeFor({ kind: "instrument", model })!] as const),
].filter(([, shape]) => shape !== null);

describe("every piece a shape is quiet about", () => {
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
  const bench = SKINS["furniture"]!;

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

describe("a piece made of something the rest of the thing is not", () => {
  const glass = SKINS["glass"]!;

  it("never hides what is behind it, which is the whole reason it is there", () => {
    // The mistake this catches: giving a window the skin of the door it is set in, so that across
    // the room the fridge is a solid slab and the point of having a window in it is gone.
    for (const how of [0, 0.5, 1]) expect(fillAt(glass, "on", how, 0.04).hides).toBe(false);
    expect(glass.far).toBeLessThan(SKINS["plain"]!.far);
    // The door around it still goes solid, or the window would not read as a window.
    expect(fillAt(SKINS["plain"]!, "on", 0, 0.04).hides).toBe(true);
  });

  it("is on the pieces that are there because they are see-through, and nowhere else", () => {
    const glazed: string[] = [];
    for (const [name, shape] of shapes) {
      const parts = [...shape.body, ...(shape.lid?.parts ?? [])];
      for (const part of parts) if (part.skin === "glass") glazed.push(name);
    }
    // A window in a door, a cabinet's sash, the tank and lid you watch a gel run in, a balance's
    // draft shield, a microscope's optics, and the lit surface a gel is photographed on.
    expect([...new Set(glazed)].sort()).toEqual([
      "balance", "biosafety-cabinet", "fridge", "gel-imager", "gel-station", "incubator", "microscope",
    ]);
    // A freezer has no window: what is in it is found by opening it, not by looking through it.
    // It has a handle and hinges like any cabinet, so this is about glass and not about skins.
    const freezer = shapeFor({ kind: "freezer" })!;
    expect(freezer.body.some((part) => part.skin === "glass")).toBe(false);
    expect(freezer.body.filter((part) => part.skin === "metal").length).toBeGreaterThan(0);
  });

  it("names a skin that exists, or it would quietly fall back to the thing's own", () => {
    for (const [name, shape] of shapes) {
      for (const part of [...shape.body, ...(shape.lid?.parts ?? [])]) {
        if (part.skin === undefined) continue;
        expect(Object.hasOwn(SKINS, part.skin), `${name} names a skin that is not there`).toBe(true);
      }
    }
  });
});

describe("a casting, which has nothing inside it to find", () => {
  const metal = SKINS["metal"]!;

  it("stays as solid up close as it was from across the room", () => {
    // The mistake this catches: letting a milled block or a cast base clear as somebody walks up.
    // Thinning a thing says there is something behind it worth seeing, and in a casting there is
    // not — so it reads as a hole in the machine rather than as the machine.
    expect(metal.near).toBe(metal.far);
    for (const how of [0, 0.5, 1]) expect(fillAt(metal, "on", how, 0.04).hides).toBe(true);
  });

  it("keeps the colour of whose it is, unlike furniture", () => {
    // This is the whole difference between the two: both stay solid, but a bench is not a thing
    // the work is about and a machine in use is.
    expect(metal.tone).toBeUndefined();
    expect(skinTone(metal, "yours")).toBe("yours");
    expect(skinTone(SKINS["furniture"]!, "yours")).toBe("dim");
  });

  it("is still the drawing as it was with skins off", () => {
    for (const how of [0, 1]) expect(fillAt(metal, "off", how, 0.04).fill).toBe(0.04);
  });
});

describe("a hood, which is opaque on purpose", () => {
  const hood = SKINS["hood"]!;

  it("is the most solid thing in the lab, and dark with it", () => {
    // A gel is imaged in the dark. A hood you can see through is not doing its job, and being at
    // it is exactly when it matters that it is shut.
    expect(hood.near).toBe(hood.far);
    expect(hood.far).toBeGreaterThan(SKINS["metal"]!.far);
    expect(hood.tone).toBe("dim");
    for (const how of [0, 1]) expect(fillAt(hood, "on", how, 0.04).hides).toBe(true);
  });

  it("is on the walls and the roof, and not on the front, so the working still shows", () => {
    // The mistake this catches: hooding the whole box. Then the imager has no mechanism at all —
    // from any distance it is a closed crate, and the surface and camera inside it are gone.
    const imager = shapeFor({ kind: "instrument", model: "gel-imager" })!;
    const hooded = imager.body.filter((part) => part.skin === "hood");
    expect(hooded.length).toBe(4);
    // The front panel is the way in: it is left to clear as somebody comes to it.
    const front = imager.body.find((part) => part.at[2] > 0.4 && part.size[0] > 0.8);
    expect(front?.skin).toBeUndefined();
    // And what is under the hood is the lit surface and the camera looking down at it.
    expect(imager.body.some((part) => part.skin === "glass")).toBe(true);
    expect(imager.body.some((part) => part.skin === "metal")).toBe(true);
  });
});

describe("a skin that never clears, wherever it is put", () => {
  const SOLID = ["furniture", "metal", "hood"];

  it("is never on a lid, because a lid is the thing that opens", () => {
    // The mistake this catches: calling a heated lid or a tank lid metal, which it is. A lid that
    // stays solid when you are at the machine hides the one thing opening it was for.
    for (const [name, shape] of shapes) {
      for (const part of shape.lid?.parts ?? []) {
        expect(SOLID.includes(part.skin ?? ""), `${name}'s lid never clears`).toBe(false);
      }
    }
  });

  it("is never on the box a block of wells sits in", () => {
    // Same mistake one level down: a case is a casting, but the case of a thing with wells in it
    // is the case you look into. The fittings on it — the fascia, the knob, the hinges — are not.
    for (const [name, shape] of shapes) {
      if (shape.block === undefined) continue;
      expect(SOLID.includes(shape.body[0]?.skin ?? ""), `${name} is looked into`).toBe(false);
      expect(shape.body.some((part) => part.skin === "metal"), `${name} has fittings too`).toBe(true);
    }
  });

  it("is on a cabinet's door furniture, and never on the door or the shelves", () => {
    // A door clears as you walk up because that is how you see the racks; a shelf clears because
    // what you are looking for is a box on the shelf under it. The handle, the hinges, the panel
    // the reading is on and the compressor are none of those.
    for (const kind of ["freezer", "fridge"] as const) {
      const shape = shapeFor({ kind })!;
      expect(shape.body[0]?.skin, `${kind}'s case`).toBeUndefined();
      expect(shape.body[1]?.skin, `${kind}'s door`).toBeUndefined();
      expect(shape.body.filter((part) => part.skin === "metal").length).toBeGreaterThan(2);
    }
    // The fridge's shelves, which are the three plates across the inside of it.
    const fridge = shapeFor({ kind: "fridge" })!;
    const shelves = fridge.body.filter((part) => part.size[1] < 0.05 && part.size[0] > 0.8 && part.at[2] < 0);
    expect(shelves.length).toBe(3);
    for (const shelf of shelves) expect(shelf.skin).toBeUndefined();
  });

  it("is on what a machine is mostly made of, now that it is on anything", () => {
    // A sweep that skinned three parts and stopped would leave the lab half one drawing and half
    // another. This says the rule was carried through, without pinning which parts it reached.
    const reached = [...shapes].filter(([, shape]) => shape.body.some((part) => part.skin === "metal"));
    expect(reached.length).toBeGreaterThan(shapes.length / 2);
  });
});

describe("a screen, which is set into a face or lies back on one", () => {
  it("is upright or a console, and never a few degrees off a flat face", () => {
    // The mistake this catches, which was shipped: a monitor leaning 6 degrees. A part is an
    // axis-aligned box, so a small lean does not tilt the case — it rotates the glass inside it,
    // sinking the top edge into the slab and pushing the bottom edge out in front of it. With the
    // slab solid, the buried part of the screen shows or does not as the camera moves, which reads
    // as the screen changing height. Either the screen lies flat in the face it is set into, or it
    // lies well back as a console on a top face, where it is meant to stand away from the box.
    for (const [name, shape] of shapes) {
      const leans = shape.screen?.leans;
      if (leans === undefined) continue;
      expect(leans === 0 || leans >= 45, `${name}'s screen leans ${leans}`).toBe(true);
    }
  });

  it("stands clear of the face it is on, so the two never fight over a pixel", () => {
    // The standoff is in the renderer, not here; what is checked is that nothing is authored
    // behind the face it belongs to, which no offset can rescue.
    const computer = shapeFor({ kind: "instrument", model: "computer" })!;
    const panel = computer.body[3]!;
    const screen = computer.screen!;
    expect(screen.at[2]).toBeGreaterThan(panel.at[2] + panel.size[2] / 2);
  });
});
