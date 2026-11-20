/**
 * What a scene says it is drawing.
 *
 * The point of this is to be trusted when a scene looks wrong, so each case is a thing that could
 * be got wrong quietly: a size that ignores the parent's scale, a colour read off the wrong object,
 * something hidden still being reported as drawn.
 */
import { BoxGeometry, Group, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene } from "three";
import { describe, expect, it } from "vitest";
import { describeScene, pointOnScreen, reportScene } from "../src/inspect.js";

const box = (name: string, colour: number, size: [number, number, number]): Mesh => {
  const mesh = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial({ color: colour }));
  mesh.name = name;
  return mesh;
};

describe("what a scene is drawing", () => {
  it("gives each drawn thing its name, colour and size in metres", () => {
    const scene = new Scene();
    scene.add(box("thermocycler lid", 0x22d3ee, [0.3, 0.1, 0.3]));
    const things = reportScene(scene);
    expect(things).toHaveLength(1);
    expect(things[0]!.name).toBe("thermocycler lid");
    expect(things[0]!.colour).toBe("#22d3ee");
    expect(things[0]!.size).toEqual([0.3, 0.1, 0.3]);
  });

  it("measures a thing as it ends up, not as it was written", () => {
    // The mistake this catches: an instrument's parts are written as fractions and scaled by the
    // group they are in, so anything reading the geometry alone reports the wrong size.
    const scene = new Scene();
    const instrument = new Group();
    instrument.scale.set(0.35, 0.25, 0.45);
    instrument.position.set(1.75, 0.9, -2);
    instrument.add(box("screen", 0xf472b6, [0.5, 0.16, 0]));
    scene.add(instrument);
    const [screen] = reportScene(scene);
    expect(screen!.size[0]).toBeCloseTo(0.175, 3);
    expect(screen!.size[1]).toBeCloseTo(0.04, 3);
    expect(screen!.at).toEqual([1.75, 0.9, -2]);
  });

  it("says when something is hidden, rather than leaving it out", () => {
    const scene = new Scene();
    const under = new Group();
    under.visible = false;
    under.add(box("lid", 0x22d3ee, [1, 1, 1]));
    scene.add(under);
    expect(reportScene(scene)[0]!.shown).toBe(false);
  });

  it("keeps lines as well as meshes, since most of this scene is lines", () => {
    const scene = new Scene();
    scene.add(new LineSegments(new BoxGeometry(2, 2, 2), new MeshBasicMaterial({ color: 0x39ffff })));
    scene.add(new Group());
    const things = reportScene(scene);
    expect(things.map((one) => one.kind)).toEqual(["LineSegments"]);
  });

  it("finds a thing by its colour, which is how a scene is argued with", () => {
    const scene = new Scene();
    scene.add(box("screen", 0xf472b6, [0.2, 0.05, 0.06]));
    scene.add(box("body", 0x22d3ee, [1, 1, 1]));
    expect(reportScene(scene, "f472b6").map((one) => one.name)).toEqual(["screen"]);
    expect(reportScene(scene, "BODY").map((one) => one.name)).toEqual(["body"]);
  });

  it("puts the biggest first, so whatever is covering something is near the top", () => {
    const scene = new Scene();
    scene.add(box("small", 0x111111, [0.1, 0.1, 0.1]));
    scene.add(box("large", 0x222222, [1, 1, 1]));
    expect(reportScene(scene).map((one) => one.name)).toEqual(["large", "small"]);
  });

  it("reports a thing with no geometry as nothing wide, rather than as infinite", () => {
    const scene = new Scene();
    const empty = new Mesh(new PlaneGeometry(0, 0), new MeshBasicMaterial({ color: 0x000000 }));
    empty.name = "nothing";
    empty.geometry.boundingBox = null;
    scene.add(empty);
    const [one] = reportScene(scene);
    expect(one!.size.every(Number.isFinite)).toBe(true);
  });

  it("writes a line a person can read", () => {
    const scene = new Scene();
    const screen = box("Thermocycler screen", 0xf472b6, [0.175, 0.019, 0.064]);
    (screen.material as MeshBasicMaterial).transparent = true;
    (screen.material as MeshBasicMaterial).opacity = 0.9;
    scene.add(screen);
    expect(describeScene(reportScene(scene))[0]).toBe("Thermocycler screen  #f472b6 @0.90 solid  at 0,0,0  175×19×64 mm");
  });
});

describe("where a drawn thing is on screen", () => {
  const canvas = { left: 100, top: 50, width: 800, height: 400 };

  it("puts a thing in front of the camera in the middle of the canvas", () => {
    const scene = new Scene();
    scene.add(box("Thermocycler", 0x22d3ee, [0.3, 0.2, 0.3]));
    const camera = new PerspectiveCamera(45, 2, 0.01, 100);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(pointOnScreen(scene, camera, canvas, "thermocycler")).toEqual([500, 250]);
  });

  it("takes the biggest of several matches, not a screw on it", () => {
    const scene = new Scene();
    const whole = box("Thermocycler body", 0x22d3ee, [0.4, 0.4, 0.4]);
    const bit = box("Thermocycler screen", 0xf472b6, [0.02, 0.02, 0.02]);
    bit.position.set(0.5, 0, 0);
    scene.add(whole, bit);
    const camera = new PerspectiveCamera(45, 2, 0.01, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(pointOnScreen(scene, camera, canvas, "thermocycler")).toEqual([500, 250]);
    // And naming the small one finds the small one, off to the right.
    expect(pointOnScreen(scene, camera, canvas, "screen")![0]).toBeGreaterThan(500);
  });

  it("answers with nothing for a name nothing has", () => {
    const camera = new PerspectiveCamera(45, 2, 0.01, 100);
    camera.updateMatrixWorld(true);
    expect(pointOnScreen(new Scene(), camera, canvas, "freezer")).toBeNull();
  });

  it("answers with nothing for something behind the camera", () => {
    const scene = new Scene();
    const behind = box("Freezer", 0x22d3ee, [0.4, 0.4, 0.4]);
    behind.position.set(0, 0, 4);
    scene.add(behind);
    const camera = new PerspectiveCamera(45, 2, 0.01, 100);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(pointOnScreen(scene, camera, canvas, "freezer")).toBeNull();
  });
});

describe("whether a see-through thing hides what is behind it", () => {
  it("says so, because an opacity on its own does not", () => {
    // The mistake this catches: a skin filled to look solid but left out of the depth buffer, so
    // the mechanism it should be covering shows through it, or the other way round.
    const scene = new Scene();
    const covering = box("freezer body", 0x22d3ee, [0.6, 1.8, 0.7]);
    (covering.material as MeshBasicMaterial).transparent = true;
    (covering.material as MeshBasicMaterial).opacity = 0.92;
    const clear = box("freezer shelf", 0x22d3ee, [0.5, 0.02, 0.6]);
    (clear.material as MeshBasicMaterial).transparent = true;
    (clear.material as MeshBasicMaterial).opacity = 0.05;
    (clear.material as MeshBasicMaterial).depthWrite = false;
    scene.add(covering, clear);
    const seen = new Map(reportScene(scene).map((one) => [one.name, one]));
    expect(seen.get("freezer body")!.hides).toBe(true);
    expect(seen.get("freezer shelf")!.hides).toBe(false);
    expect(describeScene([seen.get("freezer body")!])[0]).toContain("@0.92 solid");
    expect(describeScene([seen.get("freezer shelf")!])[0]).toContain("@0.05");
    expect(describeScene([seen.get("freezer shelf")!])[0]).not.toContain("solid");
  });
});

describe("a thing drawn opaque, which is what hiding now means", () => {
  it("is still said to be solid, rather than going quiet because it has no opacity to report", () => {
    // The report reads a see-through thing's opacity and calls anything that writes depth solid.
    // A fill that hides is now drawn opaque, which has no opacity at all, so without this the one
    // thing that genuinely hides would be the one thing the report said nothing about.
    const scene = new Scene();
    const door = new Mesh(new BoxGeometry(0.9, 1.8, 0.05), new MeshBasicMaterial({ color: 0x0d616e }));
    door.name = "freezer door";
    door.material.transparent = false;
    door.material.depthWrite = true;
    scene.add(door);
    expect(describeScene(reportScene(scene))[0]).toContain("@1.00 solid");
  });
});
