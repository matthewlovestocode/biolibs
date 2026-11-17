"use client";

/** Getting to a tool: from the instrument it is used at, or from a list of them all. */
import { useEffect, useState, type ReactNode } from "react";
import { useLab } from "@biolibs/bionet-react";
import { DigestTool } from "./digest-tool.js";
import { InductionTool } from "./induce-bench.js";
import { PcrTool } from "./pcr-tool.js";
import { instrumentFor, toolFor, type ToolName } from "./run.js";
import { LigationTool } from "./ligate-bench.js";
import { AssemblyTool } from "./assembly-bench.js";
import { CodonTool } from "./codon-bench.js";
import { VerifyTool } from "./verify-bench.js";
import { PrimerTool } from "./primer-bench.js";
import { SequencesTool } from "./sequences-tool.js";

/** The tools used at a desk and not at an instrument: the lab's sequences, and designing primers. */
export type DeskTool = "sequences" | "primers" | "codons" | "assembly" | "verify";

/** What each tool is called. */
export const TOOL_NAMES: Readonly<Record<ToolName, string>> = { pcr: "PCR", digest: "Digest and gel", ligation: "Ligation", induction: "Induction" };

function Tool({ tool, instrument, onDone }: { tool: ToolName; instrument: { id: string; name: string } | null; onDone?: (() => void) | undefined }) {
  const more = onDone === undefined ? {} : { onDone };
  return tool === "pcr" ? <PcrTool instrument={instrument} {...more} />
    : tool === "ligation" ? <LigationTool instrument={instrument} {...more} />
    : tool === "induction" ? <InductionTool instrument={instrument} {...more} />
    : <DigestTool instrument={instrument} {...more} />;
}

/**
 * The tool an instrument opens.
 *
 * @param props - `place` is the instrument's ID; `onDone` adds a way to leave.
 */
export function InstrumentTool({ place, onDone }: { place: string; onDone?: () => void }) {
  const lab = useLab()?.lab;
  if (lab === null || lab === undefined) return null;
  const found = lab.places.find((one) => one.place === place);
  const tool = toolFor(found);
  if (tool !== null) return <Tool tool={tool} instrument={{ id: place, name: found!.name }} onDone={onDone} />;
  return (
    <section className="card">
      <div className="toolhead">
        <div>
          <h2>{found?.name ?? "This place"}</h2>
          <p className="dim">There is no tool for this yet. A thermocycler opens PCR, a gel station opens digest and gel, and a shaking incubator opens induction.</p>
        </div>
        {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
      </div>
    </section>
  );
}

/**
 * Every tool, for a lab that has not drawn its room, or for getting to one without walking there.
 *
 * A run is still recorded as done at the instrument for that tool, if the lab has placed one.
 *
 * @param props - `tool` is which to open on, `sequences` being the lab's sequences and their maps and `primers` designing a pair; `views` lets a host show a tool its own way, such as
 *   at its instrument in a scene, in place of the plain form. A host that gives every tool the same kind of view keeps that
 *   view across a change of tool, which is what lets one scene carry on and its camera travel from one machine to the next.
 *   A view may be a function, which is handed a way to go to another tool: designing primers leads on to the PCR.
 */
export function Tools({ tool: first = "pcr", views = {} }: { tool?: ToolName | DeskTool; views?: Partial<Record<ToolName | DeskTool, ReactNode | ((go: (tool: ToolName | DeskTool) => void) => ReactNode)>> }) {
  const lab = useLab()?.lab;
  const [tool, setTool] = useState<ToolName | DeskTool>(first);
  // Followed rather than read once, so that something elsewhere in the window — a list of the work
  // to be done, say — can send somebody to the tool that would carry a step out.
  useEffect(() => { setTool(first); }, [first]);
  if (lab === null || lab === undefined) return null;
  const shown = views[tool];
  const names: [ToolName | DeskTool, string][] = [["sequences", "Sequences"], ["primers", "Primers"], ["codons", "Codons"], ["assembly", "Assembly"], ["verify", "Check"], ...(Object.keys(TOOL_NAMES) as ToolName[]).map((one): [ToolName, string] => [one, TOOL_NAMES[one]])];
  return (
    <div className="tools">
      <div className="row tight pick" role="tablist" aria-label="Tools">
        {names.map(([one, name]) => (
          <button key={one} type="button" role="tab" aria-selected={one === tool} className={one === tool ? "" : "quiet"} onClick={() => setTool(one)}>{name}</button>
        ))}
      </div>
      {(typeof shown === "function" ? shown(setTool) : shown) ?? (tool === "sequences" ? <SequencesTool /> : tool === "assembly" ? <AssemblyTool /> : tool === "codons" ? <CodonTool /> : tool === "verify" ? <VerifyTool />
        : tool === "primers" ? <PrimerTool onPcr={() => setTool("pcr")} />
        : <Tool key={tool} tool={tool} instrument={instrumentFor(lab, tool)} />)}
    </div>
  );
}
