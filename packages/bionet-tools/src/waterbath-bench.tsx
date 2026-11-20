"use client";

/**
 * Holding something at a temperature, at the bath it is held in.
 *
 * The bath sits between two steps that fail often and quietly: the heat shock that gets a plasmid
 * into chemically competent cells, and the heat that stops an enzyme once it has worked. Both are
 * timed, and the timing is about the tube rather than the water.
 *
 * The two things the bath cannot tell you are the two this is built round.
 *
 * It cannot tell you what temperature the tube is. A heat shock is forty-five seconds; a microfuge
 * tube out of ice takes fifteen of them to arrive, so a third of the step is spent warming up and
 * the cells get thirty. In a conical the shock is over before the tube is warm, which is why nobody
 * does it in one — and why that is worth saying rather than assuming.
 *
 * And it cannot tell you what is in the water. It is the warmest, wettest thing in the lab, held at
 * a temperature chosen for growing things.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { SOAKS, VESSELS, arrives, holding, leaveFor, warmth, type Soak, type Vessel } from "./waterbath.js";
import { ShowWorking } from "./working.js";
import type { Working } from "./pcr-working.js";

/** The views of the water bath, by the names every instrument's stage uses. */
export type SoakView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface SoakStage {
  model: "water-bath";
  name: string;
  view: SoakView;
  onView: (view: SoakView) => void;
  screen: { text: string; lit?: boolean }[];
  /** How long the tube was at the temperature, against how long the step asks for. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
}

const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/** A time said the way somebody would say it: seconds up to two minutes, then minutes. */
export const clock = (seconds: number): string =>
  seconds < 120 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;

/**
 * How much of a soak the tube actually got, which is the arithmetic the timer hides.
 *
 * @param soak - What is being done.
 * @param seconds - How long the tube is in for.
 * @param vessel - What it is in.
 * @param from - What it was at going in.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { SOAKS, VESSELS, soakWorking } from "@biolibs/bionet-tools";
 *
 * soakWorking(SOAKS[0]!, 45, VESSELS[0]!, 0).comes;    // "30 s"
 * ```
 */
export function soakWorking(soak: Soak, seconds: number, vessel: Vessel, from: number): Working {
  const got = holding(soak, seconds, vessel, from);
  return {
    of: `Time actually at ${soak.celsius} °C`, comes: clock(got.held), kind: "estimate",
    steps: [
      `The tube goes in at ${from} °C and the bath is at ${soak.celsius} °C, a gap of ${Math.abs(soak.celsius - from)} degrees.`,
      `${vessel.name} closes most of that gap every ${vessel.constant} s, so it is within a degree after about ${clock(arrives(soak.celsius, from, vessel))}.`,
      `Of the ${clock(seconds)} in the bath, ${clock(got.arriving)} goes on warming up and ${clock(got.held)} is at temperature.`,
      ...(got.warming < 0.05 ? ["For a step this long the warming up is noise."]
        : [`That is ${Math.round(got.warming * 100)}% of the step spent arriving, which is why the timer and the tube disagree.`]),
    ],
    rests: "The time constant is for a tube in still water, as a bath is. Swirling it or holding it down shortens the arrival; a rack that keeps the tube out of the water lengthens it.",
  };
}

/**
 * Holding something at a temperature, at the bath it is held in.
 *
 * @param options - `start` says what to open on; `instrument` is the bath the lab has placed, if it
 *   has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useSoakBench } from "@biolibs/bionet-tools";
 *
 * const bench = useSoakBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useSoakBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, which step, in what, and for how long. */
  start?: { view?: SoakView; what?: string; vessel?: string; seconds?: number };
} = {}): { stage: SoakStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<SoakView>(start?.view ?? "machine");
  const [what, setWhat] = useState(start?.what ?? SOAKS[0]!.what);
  const [vesselName, setVesselName] = useState(start?.vessel ?? VESSELS[0]!.name);
  const [seconds, setSeconds] = useState(start?.seconds === undefined ? "" : `${start.seconds}`);
  const [from, setFrom] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.what !== undefined) setWhat(start.what);
    if (start.vessel !== undefined) setVesselName(start.vessel);
    if (start.seconds !== undefined) setSeconds(`${start.seconds}`);
  }, [start?.view, start?.what, start?.vessel, start?.seconds]);

  const soak = SOAKS.find((one) => one.what === what) ?? SOAKS[0]!;
  const vessel = VESSELS.find((one) => one.name === vesselName) ?? VESSELS[0]!;
  const theFrom = number(from) ?? 0;
  // Until somebody sets a time, the bath shows the one that gives this step what it asks for.
  const theSeconds = number(seconds) ?? Math.round(leaveFor(soak, vessel, theFrom));
  const got = holding(soak, theSeconds, vessel, theFrom);
  const onIce = soak.celsius <= 4;

  const top = Math.max(soak.seconds * 2, got.held * 1.2, 30);
  const stage: SoakStage = {
    model: "water-bath", name: instrument?.name ?? "Water bath", view, onView: setView,
    screen: [
      { text: `${soak.celsius} °C`, lit: true },
      { text: clock(theSeconds) },
      ...(got.enough ? [] : [{ text: onIce ? "not a bath" : "not what it asks", lit: true }]),
    ],
    scale: {
      what: `time at ${soak.celsius} °C, against what this step asks for`,
      from: 0, to: top, ticks: [0, soak.seconds, top], at: got.held, label: clock(got.held),
      bands: soak.within === null
        ? [{ from: soak.seconds, to: top, label: "long enough", tone: "good" },
           { from: 0, to: soak.seconds, label: "cut short", tone: "attention" }]
        : [{ from: soak.seconds - soak.within, to: soak.seconds + soak.within, label: "the window", tone: "good" },
           { from: 0, to: soak.seconds - soak.within, label: "too short to work", tone: "attention" },
           { from: soak.seconds + soak.within, to: top, label: "long enough to kill them", tone: "attention" }],
    },
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", {
      // A soak makes nothing and uses nothing up. What is worth keeping is what the tube got,
      // which is not what the timer was set to, and which nothing else in the lab records.
      kind: "soak", instrument: instrument?.id ?? null, inputs: [], outputs: [],
      outcome: got.enough ? "worked" : "failed",
      settings: {
        what: soak.what.slice(0, 200), celsius: `${soak.celsius}`, vessel: vessel.name.slice(0, 200),
        in_for: `${Math.round(theSeconds)}`, at_temperature: `${Math.round(got.held)}`,
        warming_up: `${Math.round(got.arriving)}`, from: `${theFrom}`,
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setTold(answer.ok ? "Recorded." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const panel = (
    <div className="pcr soak">
      <section className="card">
        <div className="toolhead">
          <h2>Hold{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="stack">
          <label>What is being done
            <select value={what} onChange={(event) => { setWhat(event.target.value); setSeconds(""); }} aria-label="What is being done">
              {SOAKS.map((one) => <option key={one.what} value={one.what}>{one.what} · {one.celsius} °C</option>)}
            </select>
          </label>
          <label>In what
            <select value={vesselName} onChange={(event) => { setVesselName(event.target.value); setSeconds(""); }} aria-label="In what">
              {VESSELS.map((one) => <option key={one.name} value={one.name}>{one.name}</option>)}
            </select>
          </label>
          <div className="row tight">
            <label>How long it is in, in seconds
              <input type="number" min={0} step={5} value={seconds} onChange={(event) => setSeconds(event.target.value)}
                     placeholder={`${Math.round(leaveFor(soak, vessel, theFrom))}`} aria-label="How long it is in, in seconds" />
            </label>
            <label>What it was at going in, in °C
              <input type="number" step={1} value={from} onChange={(event) => setFrom(event.target.value)}
                     placeholder="0" aria-label="What it was at going in" />
            </label>
          </div>
        </fieldset>
        {onIce ? (
          <p className="trouble" role="status">On ice, not in the bath. {soak.why}</p>
        ) : (
          <p className="small" role="status">
            <strong>{clock(got.held)} at {soak.celsius} °C</strong>
            <span className="dim"> · {clock(got.arriving)} of the {clock(theSeconds)} went on warming up</span>
          </p>
        )}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the bath</h2>
          <p className="small"><Glossed text="A water bath holds water at a temperature. What is held at that temperature is the water; a tube in it arrives later, and how much later depends on the vessel." /></p>
          <p className="dim small">Two things it cannot tell you. What temperature the tube is — which for a forty-five second heat shock is most of the question. And what is in the water: it is the warmest, wettest thing in the lab, held at a temperature chosen for growing things, and a tube pushed under the line comes out with the bath on its cap.</p>
          <p className="voice">This step</p>
          <p className="small">{soak.why}</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>In the rack</h2>
          <p className="voice">The vessel</p>
          <p className="small">{vessel.name} · closes most of the gap to the bath every {vessel.constant} s, so from {theFrom} °C it is within a degree of {soak.celsius} °C after about {clock(arrives(soak.celsius, theFrom, vessel))}.</p>
          <p className="voice">How it warms</p>
          <ul className="plainlist small">
            {[0.25, 0.5, 1, 2].map((part) => {
              const at = Math.round(theSeconds * part);
              return <li key={part}>{clock(at)} in · {warmth(soak.celsius, theFrom, at, vessel).toFixed(1)} °C</li>;
            })}
          </ul>
          <p className="dim small">Hold the tube down in the water rather than letting the rack keep it out of it: the numbers above are for a tube that is actually in the bath.</p>
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>What it is set to</h2>
          <p className="small"><strong>{soak.celsius} °C</strong> <span className="dim">for {clock(theSeconds)}</span></p>
          <p className={got.enough ? "small good" : "trouble"} role="status">{got.says}</p>
          {!onIce && (
            <p className="small">Set the timer to <strong>{clock(leaveFor(soak, vessel, theFrom))}</strong> and the tube gets the {clock(soak.seconds)} this step asks for.</p>
          )}
          <p className="voice">The working</p>
          <ShowWorking working={soakWorking(soak, theSeconds, vessel, theFrom)} />
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the tube</h2>
          <p className="voice">What is happening</p>
          <p className="small">{soak.why}</p>
          <p className="voice">What the tube sees</p>
          <p className="small">It goes in at {theFrom} °C and is at {warmth(soak.celsius, theFrom, theSeconds, vessel).toFixed(1)} °C when it comes out, having been within a degree of the bath for {clock(got.held)} of the {clock(theSeconds)}.</p>
          <p className="dim small">Straight back onto ice afterwards where the step says so. The tube keeps the bath's heat for as long again as it took to pick it up, and a heat shock that carries on in the rack is a heat shock of unknown length.</p>
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What it got</h2>
          <ul className="plainlist small">
            <li>{soak.what}</li>
            <li>{soak.celsius} °C for {clock(theSeconds)} in {vessel.name.toLowerCase()}</li>
            <li className={got.enough ? "" : "warn"}>{clock(got.held)} at temperature{got.enough ? "" : " · not what the step asks for"}</li>
            <li>{clock(got.arriving)} warming up, from {theFrom} °C</li>
          </ul>
          <p className="dim small">A soak makes nothing and uses nothing up. What is kept is what the tube got rather than what the timer was set to, which is the one thing nobody writes down and the first thing worth knowing when a transformation comes back empty.</p>
          <fieldset disabled={busy} className="stack">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Which tube, what it was for" maxLength={2000} /></label>
            <div className="row">
              <button type="button" onClick={() => void record()}>Record it</button>
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
 * The water bath on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the bath the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function SoakTool(props: Parameters<typeof useSoakBench>[0]) {
  const bench = useSoakBench(props);
  const names: [SoakView, string][] = [["machine", "The bath"], ["block", "In the rack"], ["screen", "What it is set to"],
                                       ["tube", "In the tube"], ["result", "What it got"]];
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
