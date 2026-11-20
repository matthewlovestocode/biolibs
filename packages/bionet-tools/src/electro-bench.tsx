"use client";

/**
 * A transformation at the electroporator: a pulse across a gap, and whatever grows.
 *
 * This is the step the rest of the bench runs towards. Everything before it is DNA being cut, joined
 * and copied in a tube; this is where the DNA stops being a sequence and becomes something alive,
 * and what it makes has no checksum — it is a strain, which is why the run is recorded and the
 * strain is added afterwards saying which run made it.
 *
 * The machine shows the settings before and one number after: how long the pulse took to decay.
 * That number is the only warning there is that the sample was too salty, and it is in the right
 * place to be ignored. So the views are arranged round the two things the machine cannot tell you —
 * which cuvette is in it, and therefore what field the cells are actually in; and whether the pulse
 * went across the cells or round them.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { amountOf } from "@biolibs/bionet-panels";
import { Glossed } from "@biolibs/glossary-react";
import { GAPS, against, decay, efficiency, fieldStrength, loading, publishedFor, timeConstant, voltsFor,
         type Gap, type Pulse } from "./electro.js";
import { efficiencyWorking, electroWorking } from "./electro-working.js";
import { Proposed, withPlan, type Plan } from "./plans.js";
import { electroRun, electroTubes } from "./run.js";
import { ShowWorking } from "./working.js";

/** The views of the electroporator, by the names every instrument's stage uses. */
export type ElectroView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface ElectroStage {
  model: "electroporator";
  name: string;
  view: ElectroView;
  onView: (view: ElectroView) => void;
  screen: { text: string; lit?: boolean }[];
  well?: { row: number; column: number };
  /** The field inside the cuvette, for the view into it. */
  field?: { gap: number; strength: number; usual: number | null; cells: number; taken: number };
  /** The time constant on a scale, for the last view. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
}

const count = (value: number): string => value.toLocaleString("en-US");
const tidy = (value: number, places = 2): string => `${Math.round(value * 10 ** places) / 10 ** places}`;
const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/**
 * A transformation, at the electroporator it is done on.
 *
 * @param options - `start` says what to open on, for a tour or a link; `instrument` is the machine
 *   the lab has placed, if it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useElectroBench } from "@biolibs/bionet-tools";
 *
 * const bench = useElectroBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useElectroBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, what goes into what, and the settings. Followed whenever it changes. */
  start?: { view?: ElectroView; construct?: string; cells?: string; host?: string; volts?: number; gap?: Gap };
} = {}): { stage: ElectroStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<ElectroView>(start?.view ?? "machine");
  const [construct, setConstruct] = useState(start?.construct ?? "");
  const [cells, setCells] = useState(start?.cells ?? "");
  const [host, setHost] = useState(start?.host ?? "");
  const [volts, setVolts] = useState(start?.volts === undefined ? "" : `${start.volts}`);
  const [gap, setGap] = useState<Gap>(start?.gap ?? 2);
  const [microfarads, setMicrofarads] = useState("25");
  const [ohms, setOhms] = useState("200");
  const [dna, setDna] = useState("2");
  const [suspension, setSuspension] = useState("40");
  const [measured, setMeasured] = useState("");
  const [colonies, setColonies] = useState("");
  const [recovered, setRecovered] = useState("1000");
  const [plated, setPlated] = useState("100");
  const [selection, setSelection] = useState("");
  const [name, setName] = useState("");
  const [used, setUsed] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.construct !== undefined) setConstruct(start.construct);
    if (start.cells !== undefined) setCells(start.cells);
    if (start.host !== undefined) setHost(start.host);
    if (start.volts !== undefined) setVolts(`${start.volts}`);
    if (start.gap !== undefined) setGap(start.gap);
  }, [start?.view, start?.construct, start?.cells, start?.host, start?.volts, start?.gap]);

  const offered = useMemo(() => (lab === null || lab === undefined ? { constructs: [], cells: [] } : electroTubes(lab)), [lab]);
  const chosenCells = offered.cells.find((one) => one.item === cells);
  // The host comes from the culture where there is one, and is typed where the cells are not a
  // culture the lab holds — which is usual, since competent cells are made and used the same day.
  const theHost = host.trim() !== "" ? host.trim() : chosenCells?.strain.host ?? "";
  const published = publishedFor(theHost);
  // Until somebody sets a voltage, the machine shows the one this host is usually given in this cuvette.
  const theVolts = number(volts) ?? (published === null ? 0 : voltsFor(fieldStrength(published.pulse), gap));
  const pulse: Pulse = { volts: theVolts, microfarads: number(microfarads) ?? 25, ohms: number(ohms) ?? 200, gap };
  const strength = fieldStrength(pulse);
  const set = timeConstant(pulse);
  const how = against(pulse, theHost);
  const took = number(measured);
  const went = took === undefined ? null : decay(pulse, took);
  const loaded = loading(number(dna) ?? 0, number(suspension) ?? 0);
  const grown = number(colonies);
  const counted = grown === undefined ? null : { colonies: grown, recovered: number(recovered) ?? 1_000, plated: number(plated) ?? 100 };
  const chosen = offered.constructs.find((one) => one.item === construct);
  const well = chosen === undefined ? null
    : efficiency({ colonies: grown ?? 0, nanograms: 100, recovered: counted?.recovered ?? 1_000, plated: counted?.plated ?? 100 }, theHost);

  const run = useMemo(() => (lab === null || lab === undefined || construct === "" ? null
    : electroRun(lab, {
        construct, cells: cells === "" ? null : cells, host: theHost, pulse,
        dna: number(dna) ?? 0, suspension: number(suspension) ?? 0, measured: took ?? null, counted,
        selection, name, used: Number.isSafeInteger(number(used)) ? number(used)! : 1,
        instrument: instrument?.id ?? null, note,
      })),
    [lab, construct, cells, theHost, pulse.volts, pulse.microfarads, pulse.ohms, pulse.gap, dna, suspension, took, grown,
     counted?.recovered, counted?.plated, selection, name, used, note, instrument]);

  const screen: { text: string; lit?: boolean }[] = theVolts <= 0
    ? [{ text: "Set a voltage" }, { text: `${pulse.microfarads} µF   ${pulse.ohms} Ω` }]
    : [{ text: `${count(pulse.volts)} V   ${pulse.gap} mm`, lit: true },
       { text: `${pulse.microfarads} µF   ${pulse.ohms} Ω` },
       ...(took === undefined ? [{ text: `τ ${set} ms expected` }] : [{ text: `τ ${took} ms`, lit: true }])];

  // How many cells to draw, and how many of them took something up — at the scale of the picture,
  // not of the flask: a transformation that works turns over a tiny fraction of what is in there.
  const drawn = 18;
  const taken = grown === undefined || grown <= 0 ? 0 : Math.max(1, Math.min(3, Math.round(Math.log10(grown + 1))));

  const top = Math.max(set * 1.3, (took ?? 0) * 1.1, 1);
  const stage: ElectroStage = {
    model: "electroporator", name: instrument?.name ?? "Electroporator", view, onView: setView, screen,
    ...(construct === "" ? {} : { well: { row: 0, column: 0 } }),
    ...(theVolts <= 0 ? {} : {
      field: { gap, strength, usual: how?.usual ?? null, cells: drawn, taken },
    }),
    ...(took === undefined ? {} : {
      scale: {
        what: "the time constant, as the machine showed it",
        from: 0, to: top, ticks: [0, set / 2, set, top],
        at: took, label: `${took} ms`,
        bands: [
          { from: set * 0.9, to: top, label: "washed", tone: "good" },
          { from: set * 0.7, to: set * 0.9, label: "a little salty", tone: "dim" },
          { from: 0, to: set * 0.7, label: "conducting", tone: "attention" },
        ],
      },
    }),
  };

  /** Set the bench up as a plan says: the construct it names, and the host it is going into. */
  const setUp = (plan: Plan): void => {
    // A plan may name a part nobody has a tube of, or a prospect nobody has made; only a tube can
    // be put in a cuvette, so only that is taken, and the rest of the plan is left to be read.
    const input = plan.inputs.find((one) => one.role === "construct") ?? plan.inputs[0];
    if (input?.item !== undefined) setConstruct(input.item);
    const wanted = plan.inputs.find((one) => one.role === "host");
    if (wanted?.item !== undefined) setCells(wanted.item);
    const saidHost = plan.settings["host"];
    if (typeof saidHost === "string") setHost(saidHost);
  };

  const record = async (): Promise<void> => {
    if (run?.record == null) return;
    setBusy(true);
    const answer = await act("recordRun", withPlan(lab ?? null, run.record));
    if (!answer.ok) { setBusy(false); setSaid(answer.error); return; }
    // What a transformation makes is alive and has no checksum, so it is not an output of the run
    // the way a cut piece is: the strain is added afterwards, saying which run made it.
    const made = (answer.result as { run?: string } | null)?.run;
    if (run.strain === null || typeof made !== "string") {
      setBusy(false);
      setSaid(run.strain === null ? "Recorded: nothing grew." : "Recorded, but the run came back without an ID, so no strain was added.");
      return;
    }
    const added = await act("addStrain", { ...run.strain, from: made });
    setBusy(false);
    setSaid(added.ok ? `Recorded, and ${run.strain.name} is in the lab.` : `The run was recorded. The strain was not: ${added.error}`);
    if (added.ok) { setName(""); setNote(""); }
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const panel = (
    <div className="pcr electro">
      <section className="card">
        <div className="toolhead">
          <h2>Transformation{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {offered.constructs.length === 0 ? <p className="empty">There is no DNA to put into anything. Make something at the bench, or add a part on the Freezer tab.</p> : (
          <fieldset disabled={busy} className="stack">
            <label>What is going in
              <select value={construct} onChange={(event) => setConstruct(event.target.value)} aria-label="What is going in">
                <option value="">Choose a tube…</option>
                {offered.constructs.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
              </select>
            </label>
            <label>Into
              <select value={cells} onChange={(event) => setCells(event.target.value)} aria-label="Into">
                <option value="">Cells the lab is not keeping as a culture…</option>
                {offered.cells.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
              </select>
            </label>
            {cells === "" && (
              <label>The host<input value={host} onChange={(event) => setHost(event.target.value)} placeholder="Escherichia coli DH10B" maxLength={200} /></label>
            )}
          </fieldset>
        )}
        {chosen !== undefined && !chosen.part.circular && (
          <p className="small">This is a line, not a circle. Linear DNA does not stay in a cell on its own: it either finds a place in the genome or is lost, which is what makes this kind of transformation so much rarer than putting a plasmid in.</p>
        )}
      </section>

      <Proposed kind="transformation" now={run?.record ?? null} onSetUp={setUp} />

      {view === "machine" && (
        <section className="card">
          <h2>At the machine</h2>
          <p className="small"><Glossed text="Electroporation puts DNA into a cell by breaking it open for a moment: a high voltage across a narrow gap makes pores that close again, and DNA in the liquid goes in through them." /></p>
          <p className="dim small">The machine shows what it is set to, and afterwards one number: how long the pulse took to decay. It does not know which cuvette is in it, so it cannot tell you what field the cells are actually in — and the field, not the voltage, is what opens them.</p>
          <p className="voice">Before anything</p>
          <p className="small">Everything is ice-cold, the cells have been washed until there is no salt left in them, and the DNA goes in at a small fraction of the volume. All three are about the same thing: anything that conducts takes the pulse through the liquid instead of across the cells.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The cuvette</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="row tight">
            <label>Gap
              <select value={gap} onChange={(event) => setGap(Number(event.target.value) as Gap)} aria-label="Gap">
                {GAPS.map((one) => <option key={one} value={one}>{one} mm</option>)}
              </select>
            </label>
            <label>Cells<input type="number" min={0} step="any" value={suspension} onChange={(event) => setSuspension(event.target.value)} /> µL</label>
            <label>DNA<input type="number" min={0} step="any" value={dna} onChange={(event) => setDna(event.target.value)} /> µL</label>
          </fieldset>
          <p className={loaded.ok ? "small good" : "trouble"} role="status">{loaded.says}</p>
          <p className="voice">What it is for</p>
          <p className="small">The gap is the whole reason a voltage means nothing by itself. A cuvette is two metal walls that far apart; the field between them is the voltage divided by the gap, so {count(pulse.volts || 1_500)} V is {fieldStrength({ volts: pulse.volts || 1_500, gap })} kV/cm here and {fieldStrength({ volts: pulse.volts || 1_500, gap: gap === 1 ? 2 : 1 })} kV/cm in a {gap === 1 ? 2 : 1} mm one.</p>
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The pulse</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label><input type="number" min={0} step={25} value={volts} onChange={(event) => setVolts(event.target.value)}
                          placeholder={published === null ? "" : `${voltsFor(fieldStrength(published.pulse), gap)}`} /> V</label>
            <label><input type="number" min={0} step="any" value={microfarads} onChange={(event) => setMicrofarads(event.target.value)} /> µF</label>
            <label><input type="number" min={0} step={25} value={ohms} onChange={(event) => setOhms(event.target.value)} /> Ω</label>
          </fieldset>
          <p className="small"><strong>{strength} kV/cm</strong> <span className="dim">across the {gap} mm gap · τ {set} ms expected</span></p>
          {how !== null && <p className={how.of >= 0.9 && how.of <= 1.1 ? "small good" : "trouble"} role="status">{how.says}</p>}
          {how === null && theHost !== "" && <p className="dim small">Nothing here has published settings for {theHost}.</p>}
          <p className="voice">After it</p>
          <fieldset disabled={busy} className="row tight">
            <label>It showed τ<input type="number" min={0} step="any" value={measured} onChange={(event) => setMeasured(event.target.value)} placeholder={`${set}`} /> ms</label>
          </fieldset>
          {went !== null && <p className={went.ok ? "small good" : "trouble"} role="status">{went.says}</p>}
          <p className="voice">The working</p>
          {electroWorking(pulse, theHost, { measured: took ?? null }).map((working) => <ShowWorking key={working.of} working={working} />)}
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the cuvette</h2>
          {theVolts <= 0 ? <p className="dim small">Set a voltage and this draws the field it makes.</p> : (
            <>
              <p className="voice">What is happening</p>
              <p className="small">For about {set} ms the cells are in {strength} kV/cm. That is enough to push the membrane past what it can hold, and it opens in places. DNA in the liquid is pulled through those places by the same field. When it stops, the ones that are going to live close up again with the DNA inside them.</p>
              <p className="small">Almost none of them do both. A good transformation turns over a vanishing fraction of what is in the cuvette, which is why the number worth having is colonies for each microgram and not a percentage.</p>
              {how !== null && (
                <p className="dim small">The field is drawn against the {how.usual} kV/cm {how.published.name} is usually given, so a weak one is drawn weakly.</p>
              )}
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What grew</h2>
          <p className="voice">Only you can say</p>
          <fieldset disabled={busy} className="stack">
            <div className="row tight">
              <label>Colonies<input type="number" min={0} step={1} value={colonies} onChange={(event) => setColonies(event.target.value)} placeholder="0" /></label>
              <label>Plated<input type="number" min={0} step="any" value={plated} onChange={(event) => setPlated(event.target.value)} /> µL</label>
              <label>of<input type="number" min={0} step="any" value={recovered} onChange={(event) => setRecovered(event.target.value)} /> µL</label>
            </div>
            <label>Selected on<input value={selection} onChange={(event) => setSelection(event.target.value)} placeholder="Zeocin 100 µg/mL" maxLength={200} /></label>
          </fieldset>
          {grown !== undefined && grown > 0 && chosen !== undefined && (
            <>
              <p className="voice">This run</p>
              <p className="dim small">How many colonies a microgram gives depends on how much DNA went in, which is not something this lab has written down for that tube. Read it on the spectrophotometer and put the figure in the note; the working below assumes 100 ng.</p>
              <ShowWorking working={efficiencyWorking({ colonies: grown, nanograms: 100, recovered: counted?.recovered ?? 1_000, plated: counted?.plated ?? 100 }, theHost)} />
              {well !== null && well.expected !== null && <p className="small">{well.says}</p>}
            </>
          )}
          {grown !== undefined && grown === 0 && (
            <p className="small">Nothing grew. The three things that most often account for it: the field was wrong for the cuvette in the machine, the sample was conducting and the pulse went round the cells, or the DNA was not what it was thought to be. The first two are on the screen; the third is on the gel.</p>
          )}
          <fieldset disabled={busy} className="stack">
            <label>Call the strain<input value={name} onChange={(event) => setName(event.target.value)} placeholder={run?.strain?.name ?? ""} maxLength={200} /></label>
            <label>Used, in µL<input type="number" min={0} step={1} value={used} onChange={(event) => setUsed(event.target.value)} /></label>
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering" maxLength={2000} /></label>
            <div className="row">
              <button type="button" disabled={run?.record == null} onClick={() => void record()}>
                {run?.strain === null ? "Record that nothing grew" : "Record it"}
              </button>
            </div>
          </fieldset>
          {run?.strain === null && grown !== undefined && grown > 0 && theHost === "" && (
            <p className="trouble" role="status">Say what the host is, or nothing can be added to the lab: a strain is an organism with something in it, and this has no organism.</p>
          )}
          {said !== null && <p className="small" role="status">{said}</p>}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * A transformation on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the machine the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function ElectroTool(props: Parameters<typeof useElectroBench>[0]) {
  const bench = useElectroBench(props);
  const names: [ElectroView, string][] = [["machine", "The machine"], ["block", "The cuvette"], ["screen", "The pulse"],
                                          ["tube", "In the cuvette"], ["result", "What grew"]];
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
