/**
 * A lab to show Bionet with: a made-up freezer that is nevertheless a real one.
 *
 * Nothing here is a mock-up. It opens a real lab on a key held in memory, founds it, and writes the
 * same signed entries a person's app writes, so the tools, the scene and the history all work on it
 * for real. When the tour runs a PCR on this lab, a run really is recorded and a tube really
 * appears in the freezer. Closing the window forgets the lot, which is what a demo should do.
 */
import { Lab, memoryKeys, memoryStore, sourceOf, type LabSource } from "@biolibs/bionet-client";
import { demoMolecules, type DemoMolecules } from "./molecules.js";

/** The demo lab, and the pieces of it the tour needs to name. */
export interface DemoLab {
  /** The lab itself. */
  lab: Lab;
  /** It as a React source, for `LabProvider`. */
  source: LabSource;
  /** The molecules it holds. */
  molecules: DemoMolecules;
  /** The tubes, by what they are of. */
  tubes: { pGene: string; backbone: string; forward: string; reverse: string };
  /** The instruments, by the tool used at each. */
  instruments: { pcr: string; digest: string; ligation: string };
  /** The box the tubes are in, and the room. */
  places: { room: string; bench: string; freezer: string; box: string };
}

/**
 * Open the demo lab and fill it.
 *
 * @param options - `person` is whose device it is, and `name` what the lab is called.
 * @returns The lab, a source for React, and what is in it.
 *
 * @example
 * ```tsx
 * import { demoLab } from "@biolibs/bionet-demo";
 * import { LabProvider } from "@biolibs/bionet-react";
 *
 * const demo = await demoLab();
 * <LabProvider source={demo.source}>{…}</LabProvider>
 * ```
 */
export async function demoLab({ person = "Ada", name = "The Wren Lab" }: { person?: string; name?: string } = {}): Promise<DemoLab> {
  const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
  await lab.setPerson(person);
  await lab.found({ name });
  const molecules = demoMolecules();

  const room = await lab.addPlace({ kind: "room", name: "Main lab" });
  const bench = await lab.addPlace({ kind: "bench", name: "The bench", parent: room });
  const freezer = await lab.addPlace({ kind: "freezer", name: "−80", parent: room });
  const box = await lab.addPlace({ kind: "box", name: "Box 1", parent: freezer, grid: { rows: 9, columns: 9 } });
  const instruments = {
    pcr: await lab.addPlace({ kind: "instrument", name: "Thermocycler", parent: bench, model: "thermocycler" }),
    digest: await lab.addPlace({ kind: "instrument", name: "Gel station", parent: bench, model: "gel-station" }),
    ligation: await lab.addPlace({ kind: "instrument", name: "Heat block", parent: bench, model: "heat-block" }),
  };

  /** Add a molecule and a tube of it, and put the tube in the box. @returns The tube's ID. */
  const stock = async (what: (typeof molecules)["pGene"], amount: number, at: { row: number; column: number }): Promise<string> => {
    await lab.addPart({ name: what.name, sequence: what.sequence, circular: what.circular, features: what.features,
                        ...(what.ends === undefined ? {} : { ends: what.ends }) });
    const part = lab.snapshot().lab?.parts.find((one) => one.name === what.name);
    if (part === undefined) throw new Error(`The demo lab would not take ${what.name}.`);
    const tube = await lab.addItem({ part: part.checksum, amount, unit: "µL" });
    await lab.putItem({ item: tube, place: box, slot: at });
    return tube;
  };
  const tubes = {
    pGene: await stock(molecules.pGene, 30, { row: 1, column: 1 }),
    backbone: await stock(molecules.backbone, 20, { row: 1, column: 2 }),
    forward: await stock(molecules.forward, 100, { row: 3, column: 0 }),
    reverse: await stock(molecules.reverse, 100, { row: 3, column: 1 }),
  };
  return { lab, source: sourceOf(lab), molecules, tubes, instruments, places: { room, bench, freezer, box } };
}
