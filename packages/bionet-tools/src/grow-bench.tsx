"use client";

/**
 * A plate in the incubator: how long to leave it, and what is on it when you come back.
 *
 * This is the step between putting something into a host and having a strain to grow, and it is
 * the only one on this bench that is made of time. An incubator holds one temperature and shows
 * that temperature; everything else about it is waiting, and how long to wait is not a convention.
 * Twenty-seven doublings of twenty minutes is nine hours, which is why E. coli goes in overnight;
 * twenty-seven of two hours is two and a half days, which is why Pichia does not.
 *
 * The two things the plate itself will not tell you are drawn rather than asserted. A satellite is
 * a small colony in the ring a real one has cleared around itself on ampicillin, and it took
 * nothing up. And a colony touching another is not one colony, which matters because the whole
 * reason for plating is that a colony is a clone.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { HOSTS, LAG_HOURS, SELECTIONS, VISIBLE_CELLS, cellsAfter, doublingAt, hostFor, plateAfter, readyAfter,
         type Selection } from "./grow.js";
import { ShowWorking } from "./working.js";
import type { Working } from "./pcr-working.js";

/** The views of the incubator, by the names every instrument's stage uses. */
export type GrowView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface GrowStage {
  model: "incubator";
  name: string;
  view: GrowView;
  onView: (view: GrowView) => void;
  screen: { text: string; lit?: boolean }[];
  /** One colony's growth over the time the plate is in, for the view that sets the temperature. */
  trace?: { what: string; along: number[]; ceiling: number; marks: { at: number; label: string; saturated: boolean }[] };
  /** The plate as it would be at this moment. */
  plate?: { what: string; colonies: { at: readonly [number, number]; size: number; satellite: boolean }[]; overgrown: boolean };
}

const count = (value: number): string => value.toLocaleString("en-US");
const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/** A sequence of numbers between 0 and 1 that is the same every time, so a plate does not reshuffle. */
function scatter(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How a doubling time became a night or two days.
 *
 * @param host - What is growing.
 * @param celsius - The temperature.
 * @returns The working, or `null` for a host nothing is known about.
 *
 * @example
 * ```ts
 * import { readyWorking } from "@biolibs/bionet-tools";
 *
 * readyWorking("E. coli", 37)?.comes;    // "about 9.9 h"
 * ```
 */
export function readyWorking(host: string, celsius: number): Working | null {
  const how = doublingAt(host, celsius);
  const when = readyAfter(host, celsius);
  if (how === null || when === null) return null;
  return {
    of: "How long before there is anything to see", comes: `about ${when.hours} h`, kind: "estimate",
    steps: [
      `A colony you can see with your eye is about ${VISIBLE_CELLS.toExponential(0)} cells.`,
      `From one cell that is ${when.doublings} doublings, because each one doubles what is there.`,
      how.says,
      `${when.doublings} × ${how.minutes} minutes is ${Math.round((when.doublings * how.minutes) / 60 * 10) / 10} h, and about ${LAG_HOURS} h before it starts at all.`,
      `So ${when.hours} h — ${when.said}.`,
    ],
    rests: when.says,
  };
}

/**
 * A plate, in the incubator it is left in.
 *
 * @param options - `start` says what to open on; `instrument` is the incubator the lab has placed,
 *   if it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useGrowBench } from "@biolibs/bionet-tools";
 *
 * const bench = useGrowBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useGrowBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, what is growing, how warm, how long and what it is selected on. */
  start?: { view?: GrowView; host?: string; celsius?: number; hours?: number; selection?: string };
} = {}): { stage: GrowStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<GrowView>(start?.view ?? "machine");
  const [strain, setStrain] = useState("");
  const [host, setHost] = useState(start?.host ?? "");
  const [celsius, setCelsius] = useState(start?.celsius === undefined ? "" : `${start.celsius}`);
  const [hours, setHours] = useState(start?.hours === undefined ? "" : `${start.hours}`);
  const [selected, setSelected] = useState(start?.selection ?? SELECTIONS[0]!.name);
  const [colonies, setColonies] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.host !== undefined) setHost(start.host);
    if (start.celsius !== undefined) setCelsius(`${start.celsius}`);
    if (start.hours !== undefined) setHours(`${start.hours}`);
    if (start.selection !== undefined) setSelected(start.selection);
  }, [start?.view, start?.host, start?.celsius, start?.hours, start?.selection]);

  // A strain the lab holds names its own host; anything else is typed.
  const strains = lab?.strains ?? [];
  const chosen = strains.find((one) => one.strain === strain);
  const theHost = host.trim() !== "" ? host.trim() : chosen?.host ?? "";
  const known = hostFor(theHost);
  const selection: Selection = SELECTIONS.find((one) => one.name === selected) ?? SELECTIONS[0]!;
  const warm = number(celsius) ?? known?.best ?? 37;
  const when = readyAfter(theHost, warm);
  const waited = number(hours) ?? when?.hours ?? 16;
  const how = plateAfter(waited, theHost, warm, selection);
  const grown = number(colonies);

  // The colonies to draw: a fixed scatter, so looking at the same plate twice is the same plate.
  const drawn = useMemo(() => {
    if (how === null || !how.showing) return [];
    const many = Math.max(1, Math.min(40, Math.round(grown ?? 12)));
    const next = scatter(20_261_120);
    const real = Array.from({ length: many }, () => {
      const at = [next() * 2 - 1, next() * 2 - 1] as const;
      // They go on growing after they can first be seen, and run into each other in the end.
      return { at, size: Math.min(0.17, 0.05 * Math.min(3.2, how.through)), satellite: false };
    });
    // A satellite sits in the ring its own colony has cleared, which is where it is drawn.
    const satellites = !how.satellites ? [] : real.flatMap((one) => Array.from({ length: 3 }, () => ({
      at: [one.at[0] + (next() - 0.5) * 0.22, one.at[1] + (next() - 0.5) * 0.22] as const,
      size: 0.022, satellite: true,
    })));
    return [...real, ...satellites];
  }, [how?.showing, how?.through, how?.satellites, grown]);

  const stage: GrowStage = {
    model: "incubator", name: instrument?.name ?? "Incubator", view, onView: setView,
    screen: [
      { text: `${warm} °C`, lit: true },
      ...(when === null ? [{ text: "—" }] : [{ text: `${waited} h in` }]),
      ...(how === null ? [] : how.overgrown ? [{ text: "left too long", lit: true }] : how.showing ? [{ text: "colonies" }] : [{ text: "nothing yet" }]),
    ],
    ...(when === null ? {} : {
      trace: {
        what: `one colony, over ${Math.round(when.overgrown)} h at ${warm} °C`,
        // Cells over time, as a share of what the eye can see, so the line crosses 1 when they show.
        along: Array.from({ length: 80 }, (_, at) => {
          const atHour = (at / 79) * when.overgrown;
          return Math.min(1.4, cellsAfter(atHour, theHost, warm) / VISIBLE_CELLS) / 1.4;
        }),
        ceiling: 1 / 1.4,
        marks: [
          { at: Math.min(1, when.hours / when.overgrown), label: `${when.hours} h`, saturated: false },
          { at: Math.min(1, waited / when.overgrown), label: "now", saturated: how?.overgrown === true },
        ],
      },
    }),
    ...(drawn.length === 0 ? {} : {
      plate: { what: `on ${selection.name.toLowerCase()}, ${waited} h in`, colonies: drawn, overgrown: how?.overgrown === true },
    }),
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", {
      kind: "incubation", instrument: instrument?.id ?? null, inputs: [], outputs: [],
      outcome: grown !== undefined && grown > 0 ? "worked" : "failed",
      settings: {
        host: theHost.slice(0, 200), celsius: `${warm}`, hours: `${waited}`, selection: selection.name,
        ...(grown === undefined ? {} : { colonies: `${grown}` }),
        ...(how?.satellites === true ? { satellites: "yes" } : {}),
        ...(how?.overgrown === true ? { overgrown: "yes" } : {}),
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setSaid(answer.ok ? "Recorded: what went in, how warm, how long, and what came up." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const panel = (
    <div className="pcr grow">
      <section className="card">
        <div className="toolhead">
          <h2>Grow a plate{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="stack">
          <label>What was plated
            <select value={strain} onChange={(event) => { setStrain(event.target.value); setHost(""); }} aria-label="What was plated">
              <option value="">Not a strain the lab is keeping…</option>
              {strains.map((one) => <option key={one.strain} value={one.strain}>{one.name} · {one.host}</option>)}
            </select>
          </label>
          {strain === "" && (
            <label>The host<input value={host} onChange={(event) => setHost(event.target.value)} placeholder="Escherichia coli DH10B" maxLength={200} /></label>
          )}
          <label>Selected on
            <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Selected on">
              {SELECTIONS.map((one) => <option key={one.name} value={one.name}>{one.name}</option>)}
            </select>
          </label>
        </fieldset>
        {known === null && theHost !== "" && <p className="trouble" role="status">Nothing here knows how fast {theHost} grows, so none of the times below mean anything.</p>}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the machine</h2>
          <p className="small"><Glossed text="An incubator holds one temperature. Plates go in after a transformation and come out with colonies on them." /></p>
          <p className="dim small">It shows that temperature and nothing else. Everything else about it is time: how long to leave a plate is not a house rule, it falls out of how fast the cells double, and this works it out rather than repeating "overnight".</p>
          <p className="voice">Why a plate at all</p>
          <p className="small">A colony is a clone: every cell in it came from one cell that landed there. That is the whole reason for spreading cells out and letting them grow apart — so that one of them can be picked and everything that comes after is one thing rather than a mixture.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The shelves</h2>
          <p className="voice">The machine</p>
          <p className="small">Shelves at one temperature, plates upside down so the condensation falls on the lid rather than on the agar. Nothing in it is doing anything you can watch.</p>
          <p className="voice">What is in it</p>
          <ul className="plainlist small">
            <li>{theHost === "" ? "Nothing named yet" : theHost}{chosen === undefined ? "" : ` · ${chosen.name}`}</li>
            <li>on {selection.name.toLowerCase()}</li>
            <li className="dim">{selection.note}</li>
          </ul>
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The temperature</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label><input type="number" min={0} max={60} step={1} value={celsius} onChange={(event) => setCelsius(event.target.value)} placeholder={`${known?.best ?? 37}`} /> °C</label>
            <label>for<input type="number" min={0} step={1} value={hours} onChange={(event) => setHours(event.target.value)} placeholder={when === null ? "16" : `${when.hours}`} /> h</label>
          </fieldset>
          {when !== null && (
            <>
              <p className="small"><strong>{when.hours} h</strong> <span className="dim">— {when.said} — before there is anything to see</span></p>
              <p className="dim small">{when.says}</p>
              <p className="voice">The working</p>
              {(() => { const working = readyWorking(theHost, warm); return working === null ? null : <ShowWorking working={working} />; })()}
            </>
          )}
          {known !== null && warm > known.best && (
            <p className="trouble" role="status">{doublingAt(theHost, warm)!.says}</p>
          )}
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>On the plate</h2>
          {how === null ? <p className="dim small">Say what was plated and this draws what would be on it.</p> : (
            <>
              <p className="voice">At {waited} h</p>
              <ul className="checks">
                {how.says.map((one) => <li key={one} className={/when to pick one/.test(one) ? "fine" : "warn"}>{one}</li>)}
              </ul>
              {how.showing && (
                <p className="dim small">Drawn as it would be: {how.satellites ? "the small faint ones are satellites, which took nothing up; " : ""}
                  anything touching another is drawn as something to be careful of, because it is no longer one colony.</p>
              )}
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What came up</h2>
          <p className="voice">Only you can say</p>
          <fieldset disabled={busy} className="stack">
            <label>Colonies counted<input type="number" min={0} step={1} value={colonies} onChange={(event) => setColonies(event.target.value)} placeholder="0" /></label>
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering" maxLength={2000} /></label>
          </fieldset>
          {grown !== undefined && grown > 0 && how !== null && (
            <>
              <p className="voice">What to do with them</p>
              <p className="small">
                {how.satellites
                  ? `Pick a large, well-separated one — not one of the small ones clustered round it — and streak it out on a fresh plate. `
                  : `Pick a well-separated one and streak it out on a fresh plate. `}
                The streak is what makes a clone out of a colony that may have had a neighbour touching it.
              </p>
              <p className="dim small">The count goes with the transformation that made these, where it becomes colonies for each microgram. This records the plate itself: how warm, how long, and what grew.</p>
            </>
          )}
          {grown === 0 && (
            <p className="small">Nothing came up. Before concluding the transformation failed: was it left long enough for this host at this temperature — {when === null ? "which nothing here can say" : `about ${when.hours} h`} — and was the selection one these cells can survive at all?</p>
          )}
          <fieldset disabled={busy} className="stack">
            <div className="row">
              <button type="button" onClick={() => void record()}>Record the plate</button>
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
 * A plate on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the incubator the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function GrowTool(props: Parameters<typeof useGrowBench>[0]) {
  const bench = useGrowBench(props);
  const names: [GrowView, string][] = [["machine", "The machine"], ["block", "The shelves"], ["screen", "The temperature"],
                                       ["tube", "On the plate"], ["result", "What came up"]];
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
