"use client";

/**
 * Sterilising something, at the autoclave it goes through.
 *
 * Everything that goes into the lab sterile goes through here, and everything that leaves it alive
 * goes back through. It is the one machine the whole lab depends on and the one whose result is
 * never looked at: a cycle runs, the tape turns black, and the bottle goes on the shelf.
 *
 * The two things it cannot tell you are the two this is built round.
 *
 * It cannot tell you what temperature your load reached. The gauge is on the chamber, which is
 * steam; the middle of a litre of medium is nearly half an hour behind it. A twenty-minute cycle
 * gives a box of tips everything it needs and that bottle a quarter of it, and both come out with
 * the same black stripes on them.
 *
 * And it cannot tell you whether what came out is sterile. Tape turns at about 110 °C in seconds:
 * it says "this has been in an autoclave". The only thing that says the load was sterilised is
 * something that dies at the rate the spores do, run through with it.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { COMING_UP, CYCLES, LOADS, REFERENCE, STERILE, Z, killing, middleOf, sterilising, trouble,
         type Cycle, type Load } from "./autoclave.js";
import { ShowWorking } from "./working.js";
import type { Working } from "./pcr-working.js";

/** The views of the autoclave, by the names every instrument's stage uses. */
export type SterileView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface SterileStage {
  model: "autoclave";
  name: string;
  view: SterileView;
  onView: (view: SterileView) => void;
  screen: { text: string; lit?: boolean }[];
  /** The killing the load got, against what it needs. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
}

const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/**
 * How a cycle's time and temperature became an amount of killing.
 *
 * @param cycle - The cycle.
 * @param load - What is in there.
 * @param from - What it went in at.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { CYCLES, LOADS, f0Working } from "@biolibs/bionet-tools";
 *
 * f0Working(CYCLES[1]!, LOADS[0]!, 20).of;    // "The killing this load got"
 * ```
 */
export function f0Working(cycle: Cycle, load: Load, from: number): Working {
  const done = sterilising(cycle, load, from);
  return {
    of: "The killing this load got", comes: `F₀ ${done.f0.toFixed(1)} min`, kind: "estimate",
    steps: [
      `Spores die ten times faster for every ${Z} degrees, counted against ${REFERENCE} °C. A minute at ${REFERENCE} °C is one minute of killing; a minute at ${REFERENCE - Z} °C is a tenth of one.`,
      `The chamber comes up over about ${COMING_UP} min and then holds at ${cycle.celsius} °C for ${cycle.minutes} min.`,
      `${load.name} closes most of the gap to the chamber every ${load.constant} min, so the middle of it is within a degree after about ${Math.round(done.arriving)} min and ends at ${done.reached.toFixed(0)} °C.`,
      `Adding up the killing at the temperature the middle was at, moment by moment, comes to F₀ ${done.f0.toFixed(1)} min against the ${STERILE} this needs.`,
    ],
    rests: `${STERILE} min is twelve tenfold reductions at a spore's decimal reduction time of about a minute: a million spores to one chance in a million. The lag is for a load in flowing steam, which is what a slit bag and a loosened cap are for.`,
  };
}

/**
 * Sterilising something, at the autoclave it goes through.
 *
 * @param options - `start` says what to open on; `instrument` is the autoclave the lab has placed,
 *   if it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useSterileBench } from "@biolibs/bionet-tools";
 *
 * const bench = useSterileBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useSterileBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, what is in there, and which cycle. */
  start?: { view?: SterileView; load?: string; cycle?: string };
} = {}): { stage: SterileStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<SterileView>(start?.view ?? "machine");
  const [loadName, setLoadName] = useState(start?.load ?? LOADS[2]!.name);
  const [cycleName, setCycleName] = useState(start?.cycle ?? CYCLES[1]!.name);
  const [from, setFrom] = useState("20");
  const [indicator, setIndicator] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.load !== undefined) setLoadName(start.load);
    if (start.cycle !== undefined) setCycleName(start.cycle);
  }, [start?.view, start?.load, start?.cycle]);

  const load = LOADS.find((one) => one.name === loadName) ?? LOADS[0]!;
  const cycle = CYCLES.find((one) => one.name === cycleName) ?? CYCLES[0]!;
  const theFrom = number(from) ?? 20;
  const done = sterilising(cycle, load, theFrom);
  const wrong = trouble(cycle, load);
  const ruined = wrong.some((one) => one.ruins);

  const top = Math.max(STERILE * 2, done.f0 * 1.2);
  const stage: SterileStage = {
    model: "autoclave", name: instrument?.name ?? "Autoclave", view, onView: setView,
    screen: [
      { text: `${cycle.celsius} °C`, lit: true },
      { text: `${cycle.minutes} min${cycle.slow ? " · slow" : ""}` },
      ...(done.sterile && !ruined ? [] : [{ text: ruined ? "wrong cycle" : `F₀ ${done.f0.toFixed(1)}`, lit: true }]),
    ],
    scale: {
      what: "the killing the middle of the load got, against what sterile means",
      from: 0, to: top, ticks: [0, STERILE, top], at: done.f0, label: `F₀ ${done.f0.toFixed(1)} min`,
      bands: [
        { from: STERILE, to: top, label: "sterile", tone: "good" },
        { from: 0, to: STERILE, label: "not sterile, whatever the tape says", tone: "attention" },
      ],
    },
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", {
      // A cycle makes nothing and uses nothing up. What is worth keeping is what the load got and
      // whether anything was in there that would say so, because a bottle on a shelf says neither.
      kind: "sterilise", instrument: instrument?.id ?? null, inputs: [], outputs: [],
      outcome: done.sterile && !ruined ? "worked" : "failed",
      settings: {
        load: load.name.slice(0, 200), cycle: cycle.name.slice(0, 200),
        celsius: `${cycle.celsius}`, minutes: `${cycle.minutes}`,
        f0: done.f0.toFixed(1), reached: done.reached.toFixed(0), from: `${theFrom}`,
        indicator: indicator ? "spore vial" : "tape only",
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setTold(answer.ok ? "Recorded." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const panel = (
    <div className="pcr sterile">
      <section className="card">
        <div className="toolhead">
          <h2>Sterilise{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="stack">
          <label>What is going in
            <select value={loadName} onChange={(event) => setLoadName(event.target.value)} aria-label="What is going in">
              {LOADS.map((one) => <option key={one.name} value={one.name}>{one.name}</option>)}
            </select>
          </label>
          <label>The cycle
            <select value={cycleName} onChange={(event) => setCycleName(event.target.value)} aria-label="The cycle">
              {CYCLES.map((one) => <option key={one.name} value={one.name}>{one.name}</option>)}
            </select>
          </label>
          <label>What it goes in at, in °C
            <input type="number" step={1} value={from} onChange={(event) => setFrom(event.target.value)}
                   placeholder="20" aria-label="What it goes in at" />
          </label>
        </fieldset>
        <p className={done.sterile && !ruined ? "small good" : "trouble"} role="status">
          <strong>F₀ {done.f0.toFixed(1)} min</strong> · {done.sterile ? "sterile" : "not sterile"}
          <span className="dim"> · the middle reached {done.reached.toFixed(0)} °C</span>
        </p>
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the autoclave</h2>
          <p className="small"><Glossed text="An autoclave holds steam at 121 °C, which kills the spores that boiling does not. A cycle is not a length of time: it is an amount of killing, and the time is one of the two things that decide it." /></p>
          <p className="dim small">Two things it cannot tell you. What temperature your load reached — the gauge is on the chamber, and the middle of a litre is nearly half an hour behind it. And whether what came out is sterile: tape turns black at about 110 °C in seconds, and says only that the thing has been in an autoclave.</p>
          <p className="voice">This load</p>
          <p className="small">{load.what}</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The load</h2>
          <p className="voice">How it warms</p>
          <p className="small">{load.name} closes most of the gap to the chamber every {load.constant} min, so from {theFrom} °C the middle of it is within a degree of {cycle.celsius} °C after about {Math.round(done.arriving)} min — counting from when the chamber started coming up, not from when it got there.</p>
          <ul className="plainlist small">
            {[COMING_UP, COMING_UP + cycle.minutes / 2, COMING_UP + cycle.minutes].map((at) => (
              <li key={at}>{Math.round(at)} min in · middle at {middleOf(cycle.celsius, theFrom, at, load).toFixed(0)} °C · killing at {killing(middleOf(cycle.celsius, theFrom, at, load)).toFixed(2)}× the reference rate</li>
            ))}
          </ul>
          {wrong.length > 0 && (
            <>
              <p className="voice">This load on this cycle</p>
              {wrong.map((one) => <p key={one.says} className={one.ruins ? "trouble" : "small dim"} role="status">{one.says}</p>)}
            </>
          )}
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The cycle</h2>
          <p className="small"><strong>{cycle.celsius} °C for {cycle.minutes} min</strong> <span className="dim">{cycle.slow ? "with the pressure brought off slowly" : "with a fast exhaust"}</span></p>
          <p className={done.sterile ? "small good" : "trouble"} role="status">{done.says}</p>
          <p className="voice">The working</p>
          <ShowWorking working={f0Working(cycle, load, theFrom)} />
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>What says it worked</h2>
          <fieldset disabled={busy} className="stack">
            <label className="check small">
              <input type="checkbox" checked={indicator} onChange={(event) => setIndicator(event.target.checked)} /> A spore vial went in with it
            </label>
          </fieldset>
          {indicator ? (
            <p className="small good">Then there is something to read. The vial holds spores of the organism this is all measured against; incubate it afterwards and nothing grows if the load got what this says it got.</p>
          ) : (
            <p className="trouble" role="status">Then only the tape, which turns black at about 110 °C in seconds. It says this has been in an autoclave. It does not say the middle of the load reached temperature, and on this cycle the middle of it {done.sterile ? "did" : "did not"}.</p>
          )}
          <p className="dim small">The tape is not useless: it tells somebody unloading a trolley which bottles have been through and which have not, which is a real job. It is only that nobody should read it as more than that.</p>
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What came out</h2>
          <ul className="plainlist small">
            <li>{load.name} · {cycle.name}</li>
            <li className={done.sterile ? "" : "warn"}>F₀ {done.f0.toFixed(1)} min against {STERILE}{done.sterile ? "" : " · not sterile"}</li>
            <li>The middle reached {done.reached.toFixed(0)} °C, about {Math.round(done.arriving)} min in</li>
            <li className={indicator ? "" : "warn"}>{indicator ? "A spore vial went in with it" : "Tape only — nothing in the load says it worked"}</li>
            {ruined && <li className="warn">{wrong.find((one) => one.ruins)!.says}</li>}
          </ul>
          <p className="dim small">What is kept is the cycle, the load and what the load got — so that a plate which comes up contaminated a week later can be read back to the bottle and the bottle to the cycle, instead of being blamed on whoever poured it.</p>
          <fieldset disabled={busy} className="stack">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was in the load, who ran it" maxLength={2000} /></label>
            <div className="row">
              <button type="button" onClick={() => void record()}>Record the cycle</button>
            </div>
          </fieldset>
          {told !== null && <p className="small" role="status">{told}</p>}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * The autoclave on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the autoclave the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function SterileTool(props: Parameters<typeof useSterileBench>[0]) {
  const bench = useSterileBench(props);
  const names: [SterileView, string][] = [["machine", "The autoclave"], ["block", "The load"], ["screen", "The cycle"],
                                          ["tube", "What says it worked"], ["result", "What came out"]];
  return (
    <div className="pcr">
      <div className="row tight pick" role="tablist" aria-label={`Views of ${bench.stage.name}`}>
        {names.map(([one, text]) => (
          <button key={one} type="button" role="tab" aria-selected={one === bench.stage.view} className={one === bench.stage.view ? "" : "quiet"}
                  onClick={() => bench.stage.onView(one)}>{text}</button>
        ))}
      </div>
      {bench.panel}
    </div>
  );
}
