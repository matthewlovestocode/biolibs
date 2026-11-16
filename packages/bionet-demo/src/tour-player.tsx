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
import { InstrumentStage, LabView, type RecordedLab } from "@biolibs/bionet-scene";
import { SequencesTool, moleculeOf, useDigestBench, useLigationBench, usePcrBench } from "@biolibs/bionet-tools";
import { demoLab, type DemoLab } from "./lab.js";
import { demoTour, type TourStep, type TourStop } from "./tour.js";

/** How long a stop is held when the tour plays itself, in seconds. */
export const STOP_SECONDS = 11;

/** The lab's scene, pointed where the step says. */
function AtTheLab({ stop }: { stop: Extract<TourStop, { at: "lab" }> }) {
  const lab = useLab()?.lab;
  if (lab === null || lab === undefined) return null;
  return (
    <div className="scene">
      <LabView lab={lab} name={lab.name ?? "Lab"} {...(stop.focus === undefined ? {} : { focus: stop.focus })}
               molecule={(item) => {
                 const part = lab.parts.find((one) => one.checksum === lab.items.find((each) => each.item === item)?.part);
                 return part === undefined ? null : moleculeOf(part);
               }} />
    </div>
  );
}

/** A tool at its instrument. Each has its own component because each has its own hook. */
function AtThePcr({ stop, instrument, inLab }: { stop: Extract<TourStop, { at: "pcr" }>; instrument: { id: string; name: string } | null; inLab: InLab }) {
  const bench = usePcrBench({ instrument, ...(stop.start === undefined ? {} : { start: stop.start }) });
  return <div className="scene"><InstrumentStage {...bench.stage} inLab={inLab}>{bench.panel}</InstrumentStage></div>;
}

function AtTheGel({ stop, instrument, inLab }: { stop: Extract<TourStop, { at: "digest" }>; instrument: { id: string; name: string } | null; inLab: InLab }) {
  const bench = useDigestBench({ instrument, ...(stop.start === undefined ? {} : { start: stop.start }) });
  return <div className="scene"><InstrumentStage {...bench.stage} inLab={inLab}>{bench.panel}</InstrumentStage></div>;
}

function AtTheBlock({ stop, instrument, inLab }: { stop: Extract<TourStop, { at: "ligation" }>; instrument: { id: string; name: string } | null; inLab: InLab }) {
  const bench = useLigationBench({ instrument, ...(stop.start === undefined ? {} : { start: stop.start }) });
  return <div className="scene"><InstrumentStage {...bench.stage} inLab={inLab}>{bench.panel}</InstrumentStage></div>;
}

/** What a tool is told so that it draws itself in the room instead of on a stage of its own. */
interface InLab { lab: RecordedLab; labName: string; place: string }

/** What one stop shows. It is keyed by its step, so moving on sets the next tool up from the start. */
function Stop({ stop, demo, lab }: { stop: TourStop; demo: DemoLab; lab: LabHeld }) {
  const named = (id: string, name: string): { id: string; name: string } => ({ id, name });
  // Every tool is shown where its machine stands, so going to one is the camera moving in.
  const where = (place: string): InLab => ({ lab, labName: lab.name ?? "Lab", place });
  switch (stop.at) {
    case "lab": return <AtTheLab stop={stop} />;
    case "sequences": return <div className="bionet demoscroll"><SequencesTool {...(stop.part === undefined ? {} : { part: stop.part })} /></div>;
    case "pcr": return <AtThePcr stop={stop} instrument={named(demo.instruments.pcr, "Thermocycler")} inLab={where(demo.instruments.pcr)} />;
    case "digest": return <AtTheGel stop={stop} instrument={named(demo.instruments.digest, "Gel station")} inLab={where(demo.instruments.digest)} />;
    case "ligation": return <AtTheBlock stop={stop} instrument={named(demo.instruments.ligation, "Heat block")} inLab={where(demo.instruments.ligation)} />;
  }
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
        {/* Keyed by what is being shown and not by which stop, so that going from one stop to the
            next in the same place keeps the scene it is already in and moves the camera through it,
            rather than building the room again at the new spot. */}
        {state !== null && state !== undefined && <Stop key={stop.at} stop={stop} demo={demo} lab={state} />}
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
