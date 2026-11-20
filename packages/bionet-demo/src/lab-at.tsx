"use client";

/**
 * A lab, shown at one stop: the room, pointed somewhere, with whatever is in use drawn where it
 * stands and the tool for it beside the scene.
 *
 * It is one component for every stop, and that is the point of it. Nothing is swapped for anything
 * else as the stop changes, so the room is never built again: the camera travels from the far side
 * of it to inside a tube without a cut, and a tool left open at one stop is still open, where it
 * was left, when the view comes back to it. A walk is this given one stop after another. So is a
 * list of tools, and so is watching an adviser work: each is only somebody else saying where to be.
 */
import { useMemo, type ReactNode } from "react";
import { useLab } from "@biolibs/bionet-react";
import { InstrumentStage, LabView, type Focus } from "@biolibs/bionet-scene";
import { SequencesTool, instrumentFor, moleculeOf, type DrawnMolecule, useAssemblyBench, useCodonBench, useDigestBench, useFusionBench, useElectroBench, useInductionBench, useSpectroBench, useVerifyBench, useLigationBench, usePcrBench, usePrimerBench } from "@biolibs/bionet-tools";
import type { TourStop } from "./tour.js";

/**
 * Somewhere in a lab that something was done, as whoever did it reports it: a part read, a digest
 * worked out at the gel station. It is what `agentTools` in `@biolibs/bionet-agent` tells a host
 * of each use, with positions as people count them.
 */
export type ShownAt =
  | { at: "lab"; focus: { place: string | null; item?: string } }
  | { at: "sequences"; part: string }
  | { at: "primers"; part: string; from: number; to: number }
  | { at: "pcr"; start: { view: "result" | "tube"; template?: string; forward?: string; reverse?: string } }
  | { at: "digest"; start: { view: "result" | "tube"; tube: string; enzymes: string[] } }
  | { at: "ligation"; start: { view: "result" | "tube"; tubes: string[] } }
  | { at: "induction"; start: { view: "result" | "tube"; culture: string; gene: string; cds?: string } }
  | { at: "spectro"; start: { view: "result" | "tube"; tube: string; shown: number } }
  | { at: "electro"; start: { view: "result" | "tube"; construct: string; host?: string } };

/**
 * The stop to be at, to see what was done.
 *
 * @param shown - Where it was done.
 * @param lab - The lab, for finding the tube a part is in and how long a part is.
 * @returns The stop: the same place, with a part's tube looked at where the lab has put one.
 *
 * @example
 * ```ts
 * import { stopFor } from "@biolibs/bionet-demo";
 *
 * stopFor({ at: "primers", part: checksum, from: 101, to: 600 }, lab);
 * // { at: "primers", start: { part: checksum, stretch: { start: 100, end: 600 } } }
 * ```
 */
export function stopFor(shown: ShownAt, lab: { parts: readonly { checksum: string; length: number }[]; items: readonly { item: string; part: string | null; retired: boolean; where: { place: string } | null }[] }): TourStop {
  if (shown.at === "sequences") {
    const tube = lab.items.find((one) => one.part === shown.part && !one.retired && one.where !== null);
    return { at: "sequences", part: shown.part, ...(tube === undefined ? {} : { focus: { place: tube.where!.place, item: tube.item } }) };
  }
  if (shown.at === "primers") {
    const length = lab.parts.find((one) => one.checksum === shown.part)?.length ?? 0;
    // People count from 1 and include both ends; a stretch that runs through a circle's origin ends past its length.
    return { at: "primers", start: { part: shown.part, stretch: { start: shown.from - 1, end: shown.to < shown.from ? shown.to + length : shown.to } } };
  }
  return shown;
}

/**
 * The lab at one stop.
 *
 * Each tool is asked for at every stop and told what to show only at its own. A tool nobody is at
 * works nothing out afresh; the one being walked up to is already there to be looked at. A tool
 * whose machine the lab has not placed has nowhere in the room to go, and only then is its machine
 * shown standing alone; a lab that has drawn no room at all gets a desk tool by itself.
 *
 * @param props - `stop` is where to be and what to show there; `onPcr`, if given, lets a pair of
 *   primers that has been designed lead on to the PCR, and is told the three tubes.
 *
 * @example
 * ```tsx
 * import { LabAt } from "@biolibs/bionet-demo";
 *
 * // Inside a LabProvider. Changing `stop` moves the view; nothing is mounted again.
 * <LabAt stop={{ at: "digest", start: { view: "tube", tube, enzymes: ["EcoRI", "BamHI"] } }} />
 * ```
 */
export function LabAt({ stop, onPcr }: { stop: TourStop; onPcr?: (tubes: { template: string; forward: string; reverse: string }) => void }): ReactNode {
  const lab = useLab()?.lab;
  const found = { pcr: lab ? instrumentFor(lab, "pcr") : null, digest: lab ? instrumentFor(lab, "digest") : null,
                  ligation: lab ? instrumentFor(lab, "ligation") : null, induction: lab ? instrumentFor(lab, "induction") : null,
                  spectro: lab ? instrumentFor(lab, "spectro") : null, electro: lab ? instrumentFor(lab, "electro") : null };
  // Kept the same from one draw to the next, so that a tool is not set working again by being looked at.
  const at = useMemo(() => found, [found.pcr?.id, found.pcr?.name, found.digest?.id, found.digest?.name, found.ligation?.id, found.ligation?.name,
                                   found.induction?.id, found.induction?.name, found.spectro?.id, found.spectro?.name, found.electro?.id, found.electro?.name]);
  const pcr = usePcrBench({ instrument: at.pcr, ...(stop.at === "pcr" && stop.start !== undefined ? { start: stop.start } : {}) });
  const digest = useDigestBench({ instrument: at.digest, ...(stop.at === "digest" && stop.start !== undefined ? { start: stop.start } : {}) });
  const ligation = useLigationBench({ instrument: at.ligation, ...(stop.at === "ligation" && stop.start !== undefined ? { start: stop.start } : {}) });
  // The one tool that is not about a molecule: it grows what is already alive, and weighs what came out.
  const induction = useInductionBench({ instrument: at.induction, ...(stop.at === "induction" && stop.start !== undefined ? { start: stop.start } : {}) });
  // The one tool that is handed a number rather than working one out: a reading, and what it means.
  const spectro = useSpectroBench({ instrument: at.spectro, ...(stop.at === "spectro" && stop.start !== undefined ? { start: stop.start } : {}) });
  // The step the rest of it runs towards: what this one makes is alive, and is a strain, not a part.
  const electro = useElectroBench({ instrument: at.electro, ...(stop.at === "electro" && stop.start !== undefined ? { start: stop.start } : {}) });
  // Primers are designed at a desk, so that tool has no machine to stand at: it is beside the room,
  // and what it hands over is the template's tube to look at and the pair drawn on its molecule.
  const primers = usePrimerBench({ ...(stop.at === "primers" && stop.start !== undefined ? { start: stop.start } : {}), ...(onPcr === undefined ? {} : { onPcr }) });
  // Building a ring is a desk too: there is no machine to walk to, and what it pictures is the ring.
  const assembly = useAssemblyBench(stop.at === "assembly" && stop.start !== undefined ? { start: stop.start } : {});
  // Putting a construct together is a desk too: what it pictures is the construct it would make.
  const construct = useFusionBench(stop.at === "construct" && stop.start !== undefined ? { start: stop.start } : {});
  const codons = useCodonBench(stop.at === "codons" && stop.start !== undefined ? { start: stop.start } : {});
  const verify = useVerifyBench(stop.at === "verify" && stop.start !== undefined ? { start: stop.start } : {});
  if (lab === null || lab === undefined) return null;

  const bench = stop.at === "pcr" ? pcr : stop.at === "digest" ? digest : stop.at === "ligation" ? ligation : stop.at === "induction" ? induction
              : stop.at === "spectro" ? spectro : stop.at === "electro" ? electro : null;
  const desk = stop.at === "primers" ? primers.desk : stop.at === "assembly" ? assembly.desk : stop.at === "construct" ? construct.desk
             : stop.at === "codons" ? codons.desk : stop.at === "verify" ? verify.desk : null;
  const beside = stop.at === "primers" ? primers.panel : stop.at === "assembly" ? assembly.panel : stop.at === "construct" ? construct.panel
               : stop.at === "codons" ? codons.panel : stop.at === "verify" ? verify.panel : null;
  const stood = stop.at === "pcr" || stop.at === "digest" || stop.at === "ligation" || stop.at === "induction" || stop.at === "spectro" || stop.at === "electro" ? at[stop.at] : null;
  if (bench !== null && stood === null) return <div className="scene"><InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage></div>;
  const sequences = stop.at === "sequences" ? <div className="bionet"><SequencesTool {...(stop.part === undefined ? {} : { part: stop.part })} /></div> : null;
  if (!lab.places.some((one) => !one.retired) && (stop.at === "primers" || stop.at === "assembly" || stop.at === "construct" || stop.at === "codons" || stop.at === "verify" || stop.at === "sequences")) return beside === null ? sequences : <>{beside}</>;

  const focus: Focus = bench !== null && stood !== null ? { place: stood.id }
                     : stop.at === "lab" || stop.at === "sequences" ? stop.focus ?? { place: null }
                     : desk?.focus ?? { place: null };
  return (
    <div className="scene">
      <LabView lab={lab} name={lab.name ?? "Lab"} focus={focus}
               molecule={(item) => {
                 // Two of the desks picture a molecule over the tube they are looking at. The
                 // codon and checking desks picture none: what they say is not something a map shows.
                 const pictured: DrawnMolecule | null = stop.at === "primers" ? primers.desk.molecule
                   : stop.at === "assembly" ? assembly.desk.molecule : stop.at === "construct" ? construct.desk.molecule : null;
                 if (desk !== null && desk.focus?.item === item && pictured !== null) return pictured;
                 const part = lab.parts.find((one) => one.checksum === lab.items.find((each) => each.item === item)?.part);
                 return part === undefined ? null : moleculeOf(part);
               }}
               {...(bench === null || stood === null ? {} : { using: { place: stood.id, ...bench.stage, panel: bench.panel } })}
               {...(desk === null || beside === null ? {} : { wide: true, beside })}
               {...(sequences === null ? {} : { wide: true, beside: sequences })} />
    </div>
  );
}
