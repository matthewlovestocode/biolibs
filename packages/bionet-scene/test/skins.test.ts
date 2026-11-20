/**
 * How solid a thing is drawn.
 *
 * The rule has one job: a lab is a room of objects until you walk up to one, and then it is a
 * mechanism. So what is checked is that the fill really does fall as you approach, that a solid
 * thing really does hide what is behind it and a clear one does not, and that the two things which
 * must stay see-through whatever the setting says do.
 */
import { FAR, HIDES_ABOVE, NEAR, SKINS, fillAt, nearness, skinAt, staysClear } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

const plain = SKINS["plain"]!;

describe("how near the camera is", () => {
  it("is nothing across the room and everything at arm's length", () => {
    expect(nearness(2 * FAR, 2)).toBe(0);
    expect(nearness(2 * NEAR * 0.5, 2)).toBe(1);
  });

  it("is measured in the thing's own size, so a tube and a freezer clear at the same point", () => {
    // Half way through the range, whatever the thing is.
    const half = (size: number): number => nearness(size * (NEAR + FAR) / 2, size);
    expect(half(0.01)).toBeCloseTo(half(2), 6);
  });

  it("falls all the way through the range without jumping", () => {
    const steps = Array.from({ length: 30 }, (_, at) => nearness(2 * (NEAR + ((FAR - NEAR) * at) / 29), 2));
    for (const [at, one] of steps.entries()) if (at > 0) expect(one).toBeLessThanOrEqual(steps[at - 1]! + 1e-9);
    expect(steps[0]).toBeCloseTo(1, 6);
    expect(steps.at(-1)).toBeCloseTo(0, 6);
  });

  it("says you are at a thing of no size, rather than dividing by it", () => {
    expect(nearness(5, 0)).toBe(1);
  });
});

describe("how solid a piece is drawn", () => {
  it("is nearly solid across the room and nearly clear at it", () => {
    expect(skinAt(plain, 0, "on").fill).toBeCloseTo(plain.far, 6);
    expect(skinAt(plain, 1, "on").fill).toBeCloseTo(plain.near, 6);
  });

  it("hides what is behind it when solid and not when clear, which is the point of it", () => {
    expect(skinAt(plain, 0, "on").hides).toBe(true);
    expect(skinAt(plain, 1, "on").hides).toBe(false);
    // And the two agree: it hides exactly when the fill is over the line.
    for (const how of [0, 0.25, 0.5, 0.75, 1]) {
      const drawn = skinAt(plain, how, "on");
      expect(drawn.hides, `${how}`).toBe(drawn.fill >= HIDES_ABOVE);
    }
  });

  it("darkens as it fills, so a solid thing is an object with a lit edge and not a glowing block", () => {
    expect(skinAt(plain, 0, "on").darkened).toBeGreaterThan(skinAt(plain, 1, "on").darkened);
    expect(skinAt(plain, 0, "on").darkened).toBeLessThanOrEqual(1);
  });

  it("is the wireframe as it was with skins off: the same faint fill at every distance", () => {
    for (const how of [0, 0.5, 1]) {
      expect(skinAt(plain, how, "off")).toEqual({ fill: plain.near, hides: false, darkened: 0, dulled: 0 });
    }
  });

  it("hides nothing at all with skins off, whatever the distance", () => {
    for (const how of [0, 0.5, 1]) expect(skinAt(plain, how, "off").hides).toBe(false);
  });

  it("takes a nearness outside the range without drawing something impossible", () => {
    for (const how of [-1, 2, Number.NaN]) {
      const drawn = skinAt(plain, Number.isNaN(how) ? 0 : how, "on");
      expect(drawn.fill).toBeGreaterThanOrEqual(0);
      expect(drawn.fill).toBeLessThanOrEqual(1);
    }
  });
});

describe("what stays see-through whatever", () => {
  it("leaves the machine you are at clear", () => {
    expect(staysClear({ inUse: true })).toBe(true);
  });

  it("leaves a search match clear, because seeing it through a wall is what a search is for", () => {
    expect(staysClear({ tone: "found" })).toBe(true);
    expect(staysClear({ tone: "attention" })).toBe(true);
  });

  it("lets everything else go solid", () => {
    for (const tone of ["yours", "theirs", "held", "dim", "ink"]) expect(staysClear({ tone }), tone).toBe(false);
    expect(staysClear({})).toBe(false);
  });
});

describe("one fill, with no scene around it", () => {

  it("leaves a piece with nothing to be made of at the fill it was drawn with", () => {
    for (const setting of ["on", "off"] as const) {
      expect(fillAt(null, setting, 0, 0.04)).toEqual({ fill: 0.04, hides: false, darkened: 0, dulled: 0 });
      expect(fillAt(null, setting, 1, 0.04)).toEqual({ fill: 0.04, hides: false, darkened: 0, dulled: 0 });
    }
  });

  it("puts back the piece's own fill when skins go off, rather than something close to it", () => {
    // The mistake this catches: turning the setting off and leaving every fill at one shared value,
    // so that a lid and a body that were drawn differently come back the same.
    expect(fillAt(plain, "off", 0, 0.03).fill).toBe(0.03);
    expect(fillAt(plain, "off", 0, 0.04).fill).toBe(0.04);
  });

  it("fills a piece from across the room and clears it at the glass, with skins on", () => {
    expect(fillAt(plain, "on", 0, 0.04).fill).toBe(plain.far);
    expect(fillAt(plain, "on", 0, 0.04).hides).toBe(true);
    expect(fillAt(plain, "on", 1, 0.04).fill).toBeCloseTo(plain.near, 10);
    expect(fillAt(plain, "on", 1, 0.04).hides).toBe(false);
  });
});

describe("what stays see-through whatever the distance", () => {
  it("keeps the thing that was opened clear, because its own skin is in the way of what is in it", () => {
    // The mistake this catches: walking up to a freezer to see the shelves in it and being shown a
    // solid box, because the distance alone decided and a freezer is big enough to still be far off.
    expect(staysClear({ opened: true })).toBe(true);
    expect(staysClear({ tone: "yours", opened: false })).toBe(false);
  });
});
