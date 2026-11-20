"use client";

/**
 * A spin at the centrifuge: how hard, for how long, and which half is kept.
 *
 * A centrifuge comes between almost every other step on this bench, and almost nothing is recorded
 * about it. The two things it cannot tell you are the two things this is built round.
 *
 * It shows a speed and the tubes feel a force, and the force is the speed squared times the radius
 * of the rotor — so a speed carried over from a protocol written on another machine is a different
 * force on this one. It is the same shape of mistake as a voltage carried between cuvettes of
 * different gaps, and it is in every protocol written in rpm.
 *
 * And a rotor has to be balanced. The machine does not know whether it is; it finds out at full
 * speed. Which positions are loaded is arithmetic — unit masses round a circle — and the rotor
 * drawn from above with a line to where the load pulls answers it before the arithmetic does.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { amountOf } from "@biolibs/bionet-panels";
import { Glossed } from "@biolibs/glossary-react";
import { pcrTubes } from "./run.js";
import { ROTORS, SPINS, balance, force, speedFor, spinAgainst, type Rotor, type Spin } from "./spin.js";
import { ShowWorking } from "./working.js";
import type { Working } from "./pcr-working.js";

/** The views of the centrifuge, by the names every instrument's stage uses. */
export type SpinView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface SpinStage {
  model: "centrifuge";
  name: string;
  view: SpinView;
  onView: (view: SpinView) => void;
  screen: { text: string; lit?: boolean }[];
  /** The rotor from above, for the view that looks at it. */
  rotor?: { positions: number; loaded: number[]; put: number[]; offset: number; what: string };
  /** The force on a scale, against what this kind of spin usually takes. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
}

const count = (value: number): string => value.toLocaleString("en-US");
const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/**
 * How a speed became a force, which is the one piece of arithmetic a centrifuge hides.
 *
 * @param rpm - The speed set.
 * @param rotor - The rotor in the machine.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { forceWorking, ROTORS } from "@biolibs/bionet-tools";
 *
 * forceWorking(13_000, ROTORS[0]!).comes;    // "16,060 × g"
 * ```
 */
export function forceWorking(rpm: number, rotor: Rotor): Working {
  const rcf = force(rpm, rotor.radius);
  const other = ROTORS.find((one) => one.name !== rotor.name);
  return {
    of: "The force on the tubes", comes: `${count(Math.round(rcf))} × g`, kind: "exact",
    steps: [
      `The machine is set to ${count(rpm)} rpm.`,
      `${rotor.name} holds its tubes ${rotor.radius} cm from the axis.`,
      `The force is 1.118 × 10⁻⁵ × ${rotor.radius} × ${count(rpm)}², which is ${count(Math.round(rcf))} × g.`,
      ...(other === undefined ? [] : [`The same ${count(rpm)} rpm in ${other.name} would be ${count(Math.round(force(rpm, other.radius)))} × g, because its tubes sit ${other.radius} cm out instead.`]),
      "A protocol written in rpm is written for one rotor. Carry the force over, not the speed.",
    ],
  };
}

/**
 * A spin, at the centrifuge it is done in.
 *
 * @param options - `start` says what to open on; `instrument` is the centrifuge the lab has placed,
 *   if it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useSpinBench } from "@biolibs/bionet-tools";
 *
 * const bench = useSpinBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useSpinBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, which rotor, what is being spun, and what it is set to. */
  start?: { view?: SpinView; rotor?: string; what?: string; rpm?: number; loaded?: readonly number[] };
} = {}): { stage: SpinStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<SpinView>(start?.view ?? "machine");
  const [rotorName, setRotorName] = useState(start?.rotor ?? ROTORS[0]!.name);
  const [what, setWhat] = useState(start?.what ?? SPINS[0]!.what);
  const [rpm, setRpm] = useState(start?.rpm === undefined ? "" : `${start.rpm}`);
  const [loaded, setLoaded] = useState<number[]>([...(start?.loaded ?? [])]);
  const [minutes, setMinutes] = useState("");
  const [celsius, setCelsius] = useState("");
  const [tube, setTube] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.rotor !== undefined) setRotorName(start.rotor);
    if (start.what !== undefined) setWhat(start.what);
    if (start.rpm !== undefined) setRpm(`${start.rpm}`);
    if (start.loaded !== undefined) setLoaded([...start.loaded]);
  }, [start?.view, start?.rotor, start?.what, start?.rpm, start?.loaded?.join(",")]);

  const rotor = ROTORS.find((one) => one.name === rotorName) ?? ROTORS[0]!;
  const spin: Spin = SPINS.find((one) => one.what === what) ?? SPINS[0]!;
  // Until somebody sets a speed, the machine shows the one that gives this spin its usual force.
  const theRpm = number(rpm) ?? Math.round(speedFor(spin.force, rotor.radius));
  const rcf = force(theRpm, rotor.radius);
  const theMinutes = number(minutes) ?? spin.minutes;
  const how = balance(loaded, rotor.positions);
  const against = spinAgainst(rcf, theMinutes, spin);
  const tooFast = theRpm > rotor.fastest;
  const offered = useMemo(() => (lab === null || lab === undefined ? [] : pcrTubes(lab).templates), [lab]);

  const top = Math.max(spin.force * 2.4, rcf * 1.15, 1_000);
  const stage: SpinStage = {
    model: "centrifuge", name: instrument?.name ?? "Centrifuge", view, onView: setView,
    screen: [
      { text: `${count(theRpm)} rpm`, lit: true },
      { text: `${count(Math.round(rcf))} × g` },
      { text: `${theMinutes} min${celsius.trim() === "" ? "" : `   ${celsius.trim()} °C`}` },
      ...(how.ok ? [] : [{ text: "unbalanced", lit: true }]),
    ],
    rotor: { positions: rotor.positions, loaded, put: how.put, offset: how.offset, what: rotor.name },
    scale: {
      what: `the force, against what ${spin.what.toLowerCase()} usually takes`,
      from: 0, to: top, ticks: [0, spin.force, spin.force * 2, top],
      at: rcf, label: `${count(Math.round(rcf))} × g`,
      bands: [
        { from: spin.force * 0.5, to: spin.force * 2, label: "about right", tone: "good" },
        { from: 0, to: spin.force * 0.5, label: "not everything comes down", tone: "dim" },
        { from: spin.force * 2, to: top, label: spin.keep === "pellet" ? "packs too hard" : "splits tubes", tone: "attention" },
      ],
    },
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", {
      kind: "spin", instrument: instrument?.id ?? null,
      // A spin uses nothing up: it moves what is in the tube into two halves and one is thrown away.
      inputs: tube === "" ? [] : [{ item: tube, amount: 0, role: "spun" }],
      outputs: [], outcome: how.ok && !tooFast ? "worked" : "failed",
      settings: {
        what: spin.what.slice(0, 200), rotor: rotor.name.slice(0, 200), rpm: `${theRpm}`,
        force_g: `${Math.round(rcf)}`, minutes: `${theMinutes}`, kept: spin.keep,
        ...(celsius.trim() === "" ? {} : { celsius: celsius.trim().slice(0, 10) }),
        ...(loaded.length === 0 ? {} : { loaded: loaded.map((one) => one + 1).join(",").slice(0, 200) }),
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setSaid(answer.ok ? "Recorded." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const toggle = (at: number): void =>
    setLoaded((was) => (was.includes(at) ? was.filter((one) => one !== at) : [...was, at].sort((a, b) => a - b)));

  const panel = (
    <div className="pcr spin">
      <section className="card">
        <div className="toolhead">
          <h2>Spin{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="stack">
          <label>What is being spun
            <select value={what} onChange={(event) => { setWhat(event.target.value); setRpm(""); setMinutes(""); }} aria-label="What is being spun">
              {SPINS.map((one) => <option key={one.what} value={one.what}>{one.what}</option>)}
            </select>
          </label>
          <label>Rotor
            <select value={rotorName} onChange={(event) => { setRotorName(event.target.value); setLoaded([]); setRpm(""); }} aria-label="Rotor">
              {ROTORS.map((one) => <option key={one.name} value={one.name}>{one.name} · {one.radius} cm</option>)}
            </select>
          </label>
          <label>The tube, if the lab has one
            <select value={tube} onChange={(event) => setTube(event.target.value)} aria-label="The tube">
              <option value="">Not one the lab is keeping…</option>
              {offered.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
            </select>
          </label>
        </fieldset>
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the machine</h2>
          <p className="small"><Glossed text="A centrifuge separates things by how dense they are: what is denser than the liquid goes to the bottom and what is not stays up." /></p>
          <p className="dim small">It shows a speed. The tubes feel a force, which is that speed squared times how far out they sit — so the same speed in another rotor is another force, and a protocol written in rpm is written for one machine.</p>
          <p className="voice">Before anything</p>
          <p className="small">The rotor has to be balanced. It does not know whether it is; it finds out at full speed, and what happens then is the one way to destroy a centrifuge and hurt whoever is beside it. Tubes are made up to the same weight and put opposite each other.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The rotor</h2>
          <p className="voice">The machine</p>
          <p className="small">{rotor.name}, {rotor.positions} positions, {rotor.radius} cm from the axis to a tube, rated to {count(rotor.fastest)} rpm.</p>
          <p className="voice">What is in it</p>
          <fieldset disabled={busy} className="enzymes">
            {Array.from({ length: rotor.positions }, (_, at) => (
              <label key={at} className="check small">
                <input type="checkbox" checked={loaded.includes(at)} onChange={() => toggle(at)} /> {at + 1}
              </label>
            ))}
          </fieldset>
          <p className={how.ok ? "small good" : "trouble"} role="status">{how.says}</p>
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The speed</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label><input type="number" min={0} step={100} value={rpm} onChange={(event) => setRpm(event.target.value)}
                          placeholder={`${Math.round(speedFor(spin.force, rotor.radius))}`} /> rpm</label>
            <label><input type="number" min={0} step={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder={`${spin.minutes}`} /> min</label>
            <label><input type="number" step={1} value={celsius} onChange={(event) => setCelsius(event.target.value)} placeholder={spin.celsius === null ? "any" : `${spin.celsius}`} /> °C</label>
          </fieldset>
          <p className="small"><strong>{count(Math.round(rcf))} × g</strong> <span className="dim">in {rotor.name}</span></p>
          {tooFast && <p className="trouble" role="status">{count(theRpm)} rpm is past the {count(rotor.fastest)} rpm this rotor is rated for. A rotor run past its rating is a rotor that comes apart.</p>}
          <p className={against.of >= 0.5 && against.of <= 2 ? "small good" : "trouble"} role="status">{against.says}</p>
          <p className="voice">The working</p>
          <ShowWorking working={forceWorking(theRpm, rotor)} />
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>What separates</h2>
          <p className="voice">What is happening</p>
          <p className="small">Everything in the tube is pulled outwards at {count(Math.round(rcf))} times its own weight. What is denser than the liquid round it travels to the bottom and collects there; what is not stays where it is. After {theMinutes} minutes the tube holds two things that were one.</p>
          <p className="voice">Which half is kept</p>
          <p className="small"><strong>The {spin.keep}.</strong> The other half is {spin.other}.</p>
          <p className="dim small">This is the step at which an experiment is most often thrown down the sink. Nothing about the tube says which half matters; it depends entirely on what was being spun, and the two look the same whichever it is.</p>
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What it leaves</h2>
          <p className="voice">This spin</p>
          <ul className="plainlist small">
            <li>{spin.what} · {count(Math.round(rcf))} × g for {theMinutes} min{celsius.trim() === "" ? "" : ` at ${celsius.trim()} °C`}</li>
            <li>{rotor.name} at {count(theRpm)} rpm{loaded.length === 0 ? "" : `, positions ${loaded.map((one) => one + 1).join(", ")}`}</li>
            <li className={how.ok ? "" : "warn"}>{how.ok ? "Balanced." : "Not balanced."}</li>
            {tube !== "" && <li>{offered.find((one) => one.item === tube)?.part.name ?? "a tube"}{(() => { const held = lab.items.find((one) => one.item === tube); return held === undefined ? "" : ` · ${amountOf(held)}`; })()}</li>}
            <li>Kept: the {spin.keep}.</li>
          </ul>
          <p className="dim small">A spin uses nothing up and makes no new part: it leaves the same tube holding one of two halves, and which one is what is recorded here.</p>
          <fieldset disabled={busy} className="stack">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering" maxLength={2000} /></label>
            <div className="row">
              <button type="button" onClick={() => void record()}>Record the spin</button>
            </div>
          </fieldset>
          {said !== null && <p className="small" role="status">{said}</p>}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * A spin on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the centrifuge the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function SpinTool(props: Parameters<typeof useSpinBench>[0]) {
  const bench = useSpinBench(props);
  const names: [SpinView, string][] = [["machine", "The machine"], ["block", "The rotor"], ["screen", "The speed"],
                                       ["tube", "What separates"], ["result", "What it leaves"]];
  return (
    <div className="pcr">
      <div className="row tight pick" role="tablist" aria-label={`Views of ${bench.stage.name}`}>
        {names.map(([one, said]) => (
          <button key={one} type="button" role="tab" aria-selected={one === bench.stage.view} className={one === bench.stage.view ? "" : "quiet"}
                  onClick={() => bench.stage.onView(one)}>{said}</button>
        ))}
      </div>
      {bench.panel}
    </div>
  );
}
