"use client";

/** Getting to a tool: from the instrument it is used at, or from a list of them all. */
import { useState } from "react";
import { useLab } from "@biolibs/bionet-react";
import { DigestTool } from "./digest-tool.js";
import { PcrTool } from "./pcr-tool.js";
import { instrumentFor, toolFor, type ToolName } from "./run.js";

/** What each tool is called. */
export const TOOL_NAMES: Readonly<Record<ToolName, string>> = { pcr: "PCR", digest: "Digest and gel" };

function Tool({ tool, instrument, onDone }: { tool: ToolName; instrument: { id: string; name: string } | null; onDone?: (() => void) | undefined }) {
  const more = onDone === undefined ? {} : { onDone };
  return tool === "pcr" ? <PcrTool instrument={instrument} {...more} /> : <DigestTool instrument={instrument} {...more} />;
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
          <p className="dim">There is no tool for this yet. A thermocycler opens PCR, and a gel station opens digest and gel.</p>
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
 * @param props - `tool` is which to open on.
 */
export function Tools({ tool: first = "pcr" }: { tool?: ToolName }) {
  const lab = useLab()?.lab;
  const [tool, setTool] = useState<ToolName>(first);
  if (lab === null || lab === undefined) return null;
  return (
    <div className="tools">
      <div className="row tight pick" role="tablist" aria-label="Tools">
        {(Object.keys(TOOL_NAMES) as ToolName[]).map((one) => (
          <button key={one} type="button" role="tab" aria-selected={one === tool} className={one === tool ? "" : "quiet"} onClick={() => setTool(one)}>{TOOL_NAMES[one]}</button>
        ))}
      </div>
      <Tool key={tool} tool={tool} instrument={instrumentFor(lab, tool)} />
    </div>
  );
}
