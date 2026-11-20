/**
 * Light through a cuvette, as numbers.
 *
 * The whole of what a spectrophotometer does is that less light comes out than went in, so what is
 * checked is exactly that: the beam is at full strength before the cuvette, at the transmittance
 * after it, and falls across it — and that a sample which scatters is drawn scattering, because
 * that is the difference between a reading that is an absorbance and one that is not.
 */
import { placeBeam } from "@biolibs/bionet-scene";
import { describe, expect, it } from "vitest";

const centre = [0, 1, 0] as const;
const camera = [0, 1, 2] as const;
const beam = (through: number, scatters = false) =>
  placeBeam({ nm: 600, through, what: "the culture", ...(scatters ? { scatters: true } : {}) }, centre, camera, [0.5, 0.3]);

describe("light through a cuvette", () => {
  it("leaves the lamp whole and arrives at the detector at the transmittance", () => {
    const placed = beam(0.25);
    expect(placed.pieces[0]!.strength).toBe(1);
    expect(placed.pieces.at(-1)!.strength).toBeCloseTo(0.25, 6);
  });

  it("never gets brighter on the way", () => {
    const placed = beam(0.25);
    for (const [at, piece] of placed.pieces.entries()) {
      if (at === 0) continue;
      expect(piece.strength).toBeLessThanOrEqual(placed.pieces[at - 1]!.strength + 1e-9);
    }
  });

  it("falls across the cuvette and nowhere else", () => {
    const placed = beam(0.25);
    const changing = placed.pieces.filter((one, at) => at > 0 && one.strength < placed.pieces[at - 1]!.strength - 1e-9);
    // Some pieces are before the cuvette and some after, so not all of them fall.
    expect(changing.length).toBeGreaterThan(3);
    expect(changing.length).toBeLessThan(placed.pieces.length - 2);
  });

  it("draws a clear sample as a beam that hardly dims, and a dense one as one that nearly stops", () => {
    expect(beam(0.98).pieces.at(-1)!.strength).toBeGreaterThan(0.9);
    expect(beam(0.02).pieces.at(-1)!.strength).toBeLessThan(0.05);
  });

  it("throws light sideways only for something that scatters", () => {
    expect(beam(0.25).scattered).toEqual([]);
    expect(beam(0.25, true).scattered.length).toBeGreaterThan(0);
  });

  it("says the wavelength, what is in it, and how much came out", () => {
    const said = beam(0.25).labels;
    expect(said.map((one) => one.key).sort()).toEqual(["lamp", "through", "what"]);
    expect(said.find((one) => one.key === "through")!.text).toBe("25% through");
    expect(said.find((one) => one.key === "lamp")!.text).toBe("600 nm");
  });

  it("keeps a reading of nothing and a reading of everything inside the picture", () => {
    for (const through of [0, 1, -1, 2]) {
      for (const piece of beam(through).pieces) {
        expect(piece.strength).toBeGreaterThanOrEqual(0);
        expect(piece.strength).toBeLessThanOrEqual(1);
      }
    }
  });
});
