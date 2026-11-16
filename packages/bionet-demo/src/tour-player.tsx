"use client";

/**
 * The walk through the demo lab, drawn and played.
 *
 * Each stop mounts the real thing: the lab's own scene, or a tool in front of its own instrument,
 * opened on what the step is about. Nothing is a screenshot and nothing is a mock-up, so what a
 * person sees here is exactly what they get when they open the app themselves — and they can take
 * the controls at any stop, since the tools are the tools.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LabView as LabHeld } from "@biolibs/bionet-client";

import { LabProvider, useLab } from "@biolibs/bionet-react";
import { LabView, type Focus } from "@biolibs/bionet-scene";
import { SequencesTool, moleculeOf, useDigestBench, useLigationBench, usePcrBench, usePrimerBench } from "@biolibs/bionet-tools";
import { demoLab, type DemoLab } from "./lab.js";
import { demoTour, type TourStep, type TourStop } from "./tour.js";

/** How long a stop is held when the tour plays itself, in seconds. */
export const STOP_SECONDS = 11;

/**
 * The whole walk, in one scene.
 *
 * Every stop is this: the lab's own room, pointed somewhere, with whatever is in use drawn where it
 * stands and the tool for it beside the scene. Nothing is swapped for anything else as the walk
 * goes on, which is the point — the room is never built again, so the camera travels from the far
 * side of it to inside a tube without a single cut, and a tool left open at one stop is still open,
 * where it was left, when the walk comes back to it.
 */
function Walk({ stop, demo, lab }: { stop: TourStop; demo: DemoLab; lab: LabHeld }) {
  const at = useMemo(() => ({
    pcr: { id: demo.instruments.pcr, name: "Thermocycler" },
    digest: { id: demo.instruments.digest, name: "Gel station" },
    ligation: { id: demo.instruments.ligation, name: "Heat block" },
  }), [demo]);
  // Each tool is asked for at every stop and told what to show only at its own. A tool nobody is at
  // works nothing out afresh; the one being walked up to is already there to be looked at.
  const pcr = usePcrBench({ instrument: at.pcr, ...(stop.at === "pcr" && stop.start !== undefined ? { start: stop.start } : {}) });
  const digest = useDigestBench({ instrument: at.digest, ...(stop.at === "digest" && stop.start !== undefined ? { start: stop.start } : {}) });
  const ligation = useLigationBench({ instrument: at.ligation, ...(stop.at === "ligation" && stop.start !== undefined ? { start: stop.start } : {}) });

  // Primers are designed at a desk, so that tool has no machine to stand at: it is beside the room,
  // and what it hands over is the template's tube to look at and the pair drawn on its molecule.
  const primers = usePrimerBench(stop.at === "primers" && stop.start !== undefined ? { start: stop.start } : {});
  const desk = stop.at === "primers" ? primers.desk : null;

  const worked = stop.at === "pcr" ? { place: at.pcr.id, bench: pcr }
               : stop.at === "digest" ? { place: at.digest.id, bench: digest }
               : stop.at === "ligation" ? { place: at.ligation.id, bench: ligation }
               : null;
  const focus: Focus = worked !== null ? { place: worked.place }
                     : stop.at === "lab" || stop.at === "sequences" ? stop.focus ?? { place: null }
                     : desk !== null ? desk.focus ?? { place: null }
                     : { place: null };
  return (
    <div className="scene">
      <LabView lab={lab} name={lab.name ?? "Lab"} focus={focus}
               molecule={(item) => {
                 if (desk !== null && desk.focus?.item === item && desk.molecule !== null) return desk.molecule;
                 const part = lab.parts.find((one) => one.checksum === lab.items.find((each) => each.item === item)?.part);
                 return part === undefined ? null : moleculeOf(part);
               }}
               {...(worked === null ? {} : { using: { place: worked.place, ...worked.bench.stage, panel: worked.bench.panel } })}
               {...(stop.at !== "primers" ? {} : { wide: true, beside: primers.panel })}
               {...(stop.at !== "sequences" ? {} : {
                 wide: true,
                 beside: <div className="bionet"><SequencesTool {...(stop.part === undefined ? {} : { part: stop.part })} /></div>,
               })} />
    </div>
  );
}

/**
 * The tour, over a demo lab that has already been opened.
 *
 * @param props - `demo` is the lab; `onDone` is told when the last stop is passed.
 */
export function DemoTour({ demo, onDone, onAgain }: { demo: DemoLab; onDone?: () => void; onAgain?: () => void }) {
  const steps = useMemo(() => demoTour(demo), [demo]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [left, setLeft] = useState(STOP_SECONDS);
  const snapshot = useLab();
  const step = steps[Math.min(at, steps.length - 1)]!;
  const doing = useRef<Set<number>>(new Set());

  // A step that does something to the lab does it on arriving, once.
  useEffect(() => {
    const does = step.does;
    if (does === undefined || doing.current.has(at)) return;
    doing.current.add(at);
    const state = demo.lab.snapshot().lab;
    if (state !== null && state !== undefined) void does(demo, state);
  }, [at, step, demo]);

  const go = useCallback((to: number): void => {
    setLeft(STOP_SECONDS);
    if (to >= steps.length) { setPlaying(false); onDone?.(); return; }
    setAt(Math.max(0, to));
  }, [steps.length, onDone]);

  // Playing holds each stop for a while, and counts down so that the wait is not a mystery.
  useEffect(() => {
    if (!playing) return;
    const tick = setInterval(() => setLeft((was) => (was <= 1 ? STOP_SECONDS : was - 1)), 1000);
    const hold = setTimeout(() => go(at + 1), STOP_SECONDS * 1000);
    return () => { clearInterval(tick); clearTimeout(hold); };
  }, [playing, at, go]);

  const state: LabHeld | null | undefined = snapshot?.lab;
  const stop = useMemo(() => (state === null || state === undefined ? { at: "lab" as const } : step.show(state)), [step, state]);
  const last = at === steps.length - 1;
  return (
    <div className="demo">
      {/* The strip comes first, so the walk reads top to bottom and the thing itself gets the rest. */}
      <aside className="demosay" title="Every stop is the real tool on a real lab held in this window. Take the controls whenever you like; nothing here is a recording.">
        <div className="demohead">
          <p className="demowhere">{at + 1} of {steps.length}</p>
          <h2>{step.title}</h2>
          <div className="row tight">
            <button type="button" className="quiet" onClick={() => go(at - 1)} disabled={at === 0}>Back</button>
            <button type="button" onClick={() => { setPlaying(!playing); setLeft(STOP_SECONDS); }}>{playing ? "Pause" : "Play"}</button>
            <button type="button" className="quiet" onClick={() => go(at + 1)} disabled={last}>Next</button>
            {playing && <span className="dim small">{left}s</span>}
            {onAgain !== undefined && <button type="button" className="quiet" onClick={onAgain}>Start again</button>}
            <label className="demopick">
              <span className="dim small">Go to</span>
              <select value={at} onChange={(event) => go(Number(event.target.value))} aria-label="Which stop">
                {steps.map((one, index) => <option key={one.title} value={index}>{index + 1}. {one.title}</option>)}
              </select>
            </label>
          </div>
        </div>
        <p className="demoprose">{step.says}</p>
      </aside>
      <div className="demoshow">
        {/* One scene for the whole walk, never keyed and never swapped, so that every stop is the
            camera moving through the room it is already in rather than a new room being built. */}
        {state !== null && state !== undefined && <Walk stop={stop} demo={demo} lab={state} />}
      </div>
    </div>
  );
}

/**
 * The whole demo: a lab opened in this window, and the walk through it.
 *
 * @param props - `person` and `name` say whose device it is and what the lab is called; `onDone` is
 *   told when the last stop is passed.
 *
 * @example
 * ```tsx
 * import "@biolibs/bionet-theme/theme.css";
 * import "@biolibs/bionet-demo/demo.css";
 * import { Demo } from "@biolibs/bionet-demo";
 *
 * <Demo />
 * ```
 */
export function Demo({ person, name, onDone }: { person?: string; name?: string; onDone?: () => void }) {
  const [demo, setDemo] = useState<DemoLab | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    let dropped = false;
    setDemo(null);
    demoLab({ ...(person === undefined ? {} : { person }), ...(name === undefined ? {} : { name }) })
      .then((made) => { if (!dropped) setDemo(made); })
      .catch((cause: unknown) => { if (!dropped) setTrouble(cause instanceof Error ? cause.message : String(cause)); });
    return () => { dropped = true; };
  }, [person, name, again]);

  if (trouble !== null) return <p className="bionet trouble" role="alert">The demo lab could not be opened: {trouble}</p>;
  if (demo === null) return <p className="bionet dim">Opening a lab…</p>;
  return (
    <LabProvider source={demo.source}>
      <DemoTour key={again} demo={demo} onAgain={() => setAgain(again + 1)} {...(onDone === undefined ? {} : { onDone })} />
    </LabProvider>
  );
}
