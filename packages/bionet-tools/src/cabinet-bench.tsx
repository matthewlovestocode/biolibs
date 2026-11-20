"use client";

/**
 * Working in the biosafety cabinet.
 *
 * It is the only machine in the lab whose job is to protect a person, and the only one whose
 * failures are completely silent: a cabinet with the sash too high and a rack on the front grille
 * looks, sounds and feels exactly like one that is working.
 *
 * The two things it cannot tell you are the two this is built round.
 *
 * It cannot tell you how fast the air is coming in. The blower moves the same volume whatever the
 * sash does, so the speed through the opening is that volume over the gap — open the sash to twice
 * its mark and the inflow halves. Below about four fifths of what it was certified at the curtain
 * stops holding, room air comes over the work, and what comes back out comes out at you. The only
 * thing that measures it is a meter, once a year.
 *
 * And it cannot tell you whether what went into it was clean. It protects the work from the room.
 * It does nothing about the bottle carried in, the gloves, or a sleeve passing over an open plate.
 */
import { useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { CABINETS, HOLDS_ABOVE, PURGE, curtain, inflowAt, onTheDeck, sashFor,
         type Cabinet, type Thing, type Where } from "./cabinet.js";
import { ShowWorking } from "./working.js";
import type { Working } from "./pcr-working.js";

/** The views of the cabinet, by the names every instrument's stage uses. */
export type HoodView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface HoodStage {
  model: "biosafety-cabinet";
  name: string;
  view: HoodView;
  onView: (view: HoodView) => void;
  screen: { text: string; lit?: boolean }[];
  /** The inflow, against what the cabinet was certified at. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
}

const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/** What goes on the deck, and where it has been put. */
const WHERES: readonly Where[] = ["front grille", "work zone", "rear grille"];

/**
 * How the sash height decided the inflow, which is the one calculation in the machine.
 *
 * @param cabinet - The cabinet.
 * @param sash - How high the sash is, in metres.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { CABINETS, inflowWorking } from "@biolibs/bionet-tools";
 *
 * inflowWorking(CABINETS[0]!, 0.4).comes;    // "0.25 m/s"
 * ```
 */
export function inflowWorking(cabinet: Cabinet, sash: number): Working {
  const at = inflowAt(cabinet, sash);
  const volume = cabinet.inflow * cabinet.width * cabinet.sash;
  return {
    of: "Air coming in under the sash", comes: `${at.toFixed(2)} m/s`, kind: "estimate",
    steps: [
      `Certified at ${cabinet.inflow} m/s through an opening ${cabinet.width} m by ${cabinet.sash} m, which is ${volume.toFixed(2)} m³ a second going in.`,
      "The blower moves about that same volume whatever the sash is doing: it is a fan against a filter, not a thermostat.",
      `At ${sash.toFixed(2)} m the opening is ${(cabinet.width * sash).toFixed(2)} m², so the air crosses it at ${volume.toFixed(2)} ÷ ${(cabinet.width * sash).toFixed(2)} = ${at.toFixed(2)} m/s.`,
      `The curtain holds down to about ${(cabinet.inflow * HOLDS_ABOVE).toFixed(2)} m/s, which is a sash of ${sashFor(cabinet, cabinet.inflow * HOLDS_ABOVE).toFixed(2)} m.`,
    ],
    rests: "It assumes the blower holds its volume as the opening changes, which is close enough over the range a sash moves and not true at the extremes. A cabinet with a failing filter moves less at every height, and only a meter shows that.",
  };
}

/**
 * Working in the cabinet it is done in.
 *
 * @param options - `start` says what to open on; `instrument` is the cabinet the lab has placed, if
 *   it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useHoodBench } from "@biolibs/bionet-tools";
 *
 * const bench = useHoodBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useHoodBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, and how high the sash is. */
  start?: { view?: HoodView; sash?: number };
} = {}): { stage: HoodStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<HoodView>(start?.view ?? "machine");
  const [cabinetName, setCabinetName] = useState(CABINETS[0]!.name);
  const [sash, setSash] = useState(`${start?.sash ?? CABINETS[0]!.sash}`);
  const [ran, setRan] = useState(false);
  const [things, setThings] = useState<Thing[]>([
    { name: "Tube rack", where: "work zone", open: false },
    { name: "Plate", where: "work zone", open: true },
  ]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState<string | null>(null);

  const cabinet = CABINETS.find((one) => one.name === cabinetName) ?? CABINETS[0]!;
  const theSash = number(sash) ?? cabinet.sash;
  const air = curtain(cabinet, theSash);
  const wrong = onTheDeck(things);
  const broken = wrong.some((one) => one.breaks);
  const ready = air.holds && !broken && ran;

  const top = cabinet.inflow * 2;
  const stage: HoodStage = {
    model: "biosafety-cabinet", name: instrument?.name ?? "Biosafety cabinet", view, onView: setView,
    screen: [
      { text: `${air.inflow.toFixed(2)} m/s`, lit: true },
      { text: `sash ${theSash.toFixed(2)} m` },
      ...(ready ? [] : [{ text: broken ? "grille blocked" : !air.holds ? "sash too high" : "not purged", lit: true }]),
    ],
    scale: {
      what: "air coming in, against what this cabinet was certified at",
      from: 0, to: top, ticks: [0, cabinet.inflow * HOLDS_ABOVE, cabinet.inflow, top],
      at: air.inflow, label: `${air.inflow.toFixed(2)} m/s`,
      bands: [
        { from: cabinet.inflow * HOLDS_ABOVE, to: top, label: "the curtain holds", tone: "good" },
        { from: 0, to: cabinet.inflow * HOLDS_ABOVE, label: "room air comes over the work", tone: "attention" },
      ],
    },
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", {
      // Working in a cabinet makes nothing and uses nothing up. What is worth keeping is the state
      // it was in, because a contamination a week later is otherwise argued about rather than read.
      kind: "aseptic", instrument: instrument?.id ?? null, inputs: [], outputs: [],
      outcome: ready ? "worked" : "failed",
      settings: {
        cabinet: cabinet.name.slice(0, 200), sash_m: theSash.toFixed(2), inflow_ms: air.inflow.toFixed(2),
        of_certified: `${Math.round(air.of * 100)}%`, purged: ran ? "yes" : "no",
        deck: things.map((one) => `${one.name} on the ${one.where}`).join("; ").slice(0, 200),
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setTold(answer.ok ? "Recorded." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const move = (at: number, where: Where): void =>
    setThings((was) => was.map((one, which) => (which === at ? { ...one, where } : one)));

  const panel = (
    <div className="pcr hood">
      <section className="card">
        <div className="toolhead">
          <h2>Work in it{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="stack">
          <label>The cabinet
            <select value={cabinetName} onChange={(event) => { setCabinetName(event.target.value); setSash(`${CABINETS.find((one) => one.name === event.target.value)?.sash ?? 0.2}`); }} aria-label="The cabinet">
              {CABINETS.map((one) => <option key={one.name} value={one.name}>{one.name}</option>)}
            </select>
          </label>
          <label>How high the sash is, in metres
            <input type="number" min={0.05} max={0.6} step={0.05} value={sash} onChange={(event) => setSash(event.target.value)}
                   aria-label="How high the sash is, in metres" />
          </label>
          <label className="check small">
            <input type="checkbox" checked={ran} onChange={(event) => setRan(event.target.checked)} /> It has been running {PURGE} minutes
          </label>
        </fieldset>
        <p className={ready ? "small good" : "trouble"} role="status">
          <strong>{air.inflow.toFixed(2)} m/s</strong> coming in · {Math.round(air.of * 100)}% of certified
          {ready ? " · the curtain holds and the deck is clear" : broken ? " · a grille is blocked" : !air.holds ? " · the curtain does not hold" : " · let it run first"}
        </p>
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the cabinet</h2>
          <p className="small"><Glossed text="A Class II cabinet pulls room air in under the sash and down through a grille, and blows filtered air straight down over the work, so that nothing from the room crosses in and nothing from the work crosses out." /></p>
          <p className="dim small">Two things it cannot tell you. How fast the air is moving — the sash decides it and nothing here shows it. And whether what you put in was clean: it protects the work from the room, not from the bottle you carried in.</p>
          <p className="voice">What it is not</p>
          <p className="small">It is not a fume hood: the air it blows at the work has been through a filter, and a filter does nothing to a solvent. It is not a clean bench either — one of those protects the work by blowing air out at whoever is sitting there, which is the opposite of this.</p>
          <p className="voice">The lamp</p>
          <p className="small">The ultraviolet lamp is close to useless and should be off. It does not reach into a shadow, it weakens as it ages with nothing to say so, and it burns the eyes of anybody in the room. Wiping the deck down does the job it is imagined to do.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The deck</h2>
          <p className="voice">Where things are</p>
          <fieldset disabled={busy} className="stack">
            {things.map((one, at) => (
              <label key={one.name}>{one.name}
                <select value={one.where} onChange={(event) => move(at, event.target.value as Where)} aria-label={`Where the ${one.name.toLowerCase()} is`}>
                  {WHERES.map((where) => <option key={where} value={where}>{where}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
          {wrong.length === 0
            ? <p className="small good" role="status">Nothing on either grille. The air goes in at the front, down over the work and out at the back, which is the whole arrangement.</p>
            : wrong.map((one) => <p key={one.says} className={one.breaks ? "trouble" : "small dim"} role="status">{one.says}</p>)}
          <p className="dim small">Work at least a hand's width in from the front grille, and move in and out slowly: a sleeve pulled out quickly drags room air in behind it, which is the one way to break the curtain without touching the sash.</p>
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The sash</h2>
          <p className="small"><strong>{air.inflow.toFixed(2)} m/s</strong> <span className="dim">at a sash of {theSash.toFixed(2)} m, certified at {cabinet.inflow} m/s at {cabinet.sash} m</span></p>
          <p className={air.holds ? "small good" : "trouble"} role="status">{air.says}</p>
          <p className="small">Highest the sash can go and still hold: <strong>{air.most.toFixed(2)} m</strong>.</p>
          <p className="voice">The working</p>
          <ShowWorking working={inflowWorking(cabinet, theSash)} />
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>What it does not protect</h2>
          <p className="voice">What came in with you</p>
          <p className="small">The cabinet protects the work from the room. Everything on the deck arrived from the room: the bottle, the rack, the pipette, the gloves. Most of what goes wrong in a cabinet came in through the front of it in somebody's hand, and the curtain does nothing about that.</p>
          <p className="voice">What that leaves</p>
          <p className="small">Wipe what goes in. Keep what is open under the downflow and keep nothing above it — an arm over an open plate is the shadow the air cannot reach. Take out what is finished with rather than parking it at the back.</p>
          <p className="dim small">It also does not make a tube sterile. A cabinet holds a state; it does not create one. What goes in contaminated comes out contaminated, under perfectly clean air.</p>
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>How it was set up</h2>
          <ul className="plainlist small">
            <li>{cabinet.name}</li>
            <li className={air.holds ? "" : "warn"}>Sash {theSash.toFixed(2)} m · {air.inflow.toFixed(2)} m/s · {Math.round(air.of * 100)}% of certified{air.holds ? "" : " · does not hold"}</li>
            <li className={ran ? "" : "warn"}>{ran ? `Ran ${PURGE} min before starting` : "Not left to run before starting"}</li>
            {things.map((one) => <li key={one.name} className={one.where === "work zone" ? "" : "warn"}>{one.name} on the {one.where}</li>)}
          </ul>
          <p className="dim small">A cabinet makes nothing and uses nothing up, so what is kept is the state it was in. It is the only record that can answer why one week's plates came up contaminated and the next week's did not.</p>
          <fieldset disabled={busy} className="stack">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was being done in it" maxLength={2000} /></label>
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
 * The cabinet on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the cabinet the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function HoodTool(props: Parameters<typeof useHoodBench>[0]) {
  const bench = useHoodBench(props);
  const names: [HoodView, string][] = [["machine", "The cabinet"], ["block", "The deck"], ["screen", "The sash"],
                                       ["tube", "What it does not protect"], ["result", "How it was set up"]];
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
