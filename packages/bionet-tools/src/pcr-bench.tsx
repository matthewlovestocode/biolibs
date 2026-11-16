"use client";

/**
 * A PCR at the machine: everything beside the scene, and what the scene is told to show.
 *
 * It knows nothing of three dimensions. It holds what has been chosen and which view is showing,
 * works out what the machine would show and what is in the tube, and hands those to whatever draws
 * the instrument as plain data. The scene package's `InstrumentStage` takes them as they are.
 *
 * What is beside the scene keeps four things apart: what the **machine** shows, what is true of this
 * **run**, the **checks** a careful operator would make, and, for somebody new, what is going on.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { bandsOf, gelById, ladderBands, ladderById } from "@biolibs/gel";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { Gel } from "./digest-tool.js";
import { SequenceMap } from "./map.js";
import { bindingWorking, carriedWorking, countsWorking, lengthWorking, programmeWorking, tmWorking } from "./pcr-working.js";
import { FacedBases, ShowWorking } from "./working.js";
import { moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { primerTm } from "./pcr.js";
import { primerBinding, programmeChecks, screenOf, strandCounts, suggestProgramme, tubeLens, tubeView,
         type PcrProgramme, type PcrStepName, type TubeLens, type TubeStrand } from "./pcr-scene.js";
import { pcrRun, pcrTubes, type TubeChoice } from "./run.js";

/** The views of the machine, in the order a person meets them. */
export type BenchView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface BenchStage {
  model: "thermocycler";
  name: string;
  view: BenchView;
  onView: (view: BenchView) => void;
  screen: { text: string; lit?: boolean }[];
  well?: { row: number; column: number };
  tube?: { length: number; strands: TubeStrand[] };
  /** Lengths marked off under the strands, each with the subtraction that gives it. */
  measures?: { from: number; to: number; label: string }[];
  /** What the run makes, to be drawn above the machine in the result view. */
  molecule?: DrawnMolecule;
  /** The real bases at the primer being looked at, for any moment of the step showing. */
  lens?: (through: number) => (TubeLens & { rows: [number, number] }) | null;
  legend: Partial<Record<TubeStrand["kind"], string>>;
  /** How long the step showing should take to play, when the bench is setting the pace. */
  seconds?: number;
  /** Called when the step showing has finished playing. */
  onPlayed: () => void;
}

/**
 * A cycle's temperatures as a line, with a mark on the step it is at.
 *
 * @param props - `programme` is the programme; `step` is the step it is on.
 */
export function TemperatureTrace({ programme, step }: { programme: PcrProgramme; step: PcrStepName }) {
  const total = programme.steps.reduce((sum, one) => sum + one.seconds, 0);
  const y = (celsius: number): number => 58 - ((celsius - 40) / 60) * 50;
  let x = 8;
  const spans = programme.steps.map((one) => { const from = x; x += (one.seconds / total) * 204; return { one, from, to: x }; });
  const line = spans.flatMap(({ one, from, to }) => [`${from},${y(one.celsius)}`, `${to},${y(one.celsius)}`]).join(" ");
  const now = spans.find(({ one }) => one.name === step)!;
  return (
    <svg className="trace" viewBox="0 0 220 70" role="img"
         aria-label={`One cycle: ${programme.steps.map((one) => `${one.name} at ${one.celsius} degrees for ${one.seconds} seconds`).join(", ")}. It is on ${step}.`}>
      <polyline points={line} fill="none" className="line" />
      <rect x={now.from} y={4} width={now.to - now.from} height={60} className="now" />
      {spans.map(({ one, from, to }) => <text key={one.name} x={(from + to) / 2} y={y(one.celsius) - 5} textAnchor="middle" className={one.name === step ? "on" : undefined}>{one.celsius}°</text>)}
    </svg>
  );
}

/**
 * How many strands of each kind there are, as bars.
 *
 * The bars are on a doubling scale, since the product doubles: each step along is twice as many.
 *
 * @param props - `counts` is how many there are; `cycles` is how many cycles the programme runs,
 *   which sets how long a full bar is.
 */
export function StrandBars({ counts, cycles }: { counts: { template: number; long: number; product: number }; cycles: number }) {
  const rows: [string, number, string][] = [["Template", counts.template, "template"], ["Too long", counts.long, "long"], ["Product", counts.product, "product"]];
  return (
    <div className="bars" role="img" aria-label={rows.map(([label, count]) => `${label}: ${count.toLocaleString("en-US")} strands`).join(". ")}>
      {rows.map(([label, count, kind]) => (
        <div key={kind} className="bar">
          <span>{label}</span>
          <span className="track"><span className={`fill ${kind}`} style={{ width: `${Math.min(100, (Math.log2(count + 1) / (cycles + 1)) * 100)}%` }} /></span>
          <span className="count">{count.toLocaleString("en-US")}</span>
        </div>
      ))}
    </div>
  );
}

const STEPS: readonly PcrStepName[] = ["denature", "anneal", "extend"];
const whole = (text: string): number | undefined => (text.trim() === "" || !Number.isFinite(Number(text)) ? undefined : Math.round(Number(text)));

function Pick({ label, choices, value, onChange }: { label: string; choices: TubeChoice[]; value: string; onChange: (item: string) => void }) {
  return (
    <label>{label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        <option value="">Choose a tube…</option>
        {choices.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
      </select>
    </label>
  );
}

/**
 * A PCR at the machine.
 *
 * @param options - `start` says what to open on, for a tour or a link; `instrument` is the thermocycler it is run on, if the lab has placed one;
 *   `onDone` adds a way to leave.
 * @returns `stage`, to spread onto whatever draws the instrument, and `panel`, to put beside it.
 *
 * @example
 * ```tsx
 * import { usePcrBench } from "@biolibs/bionet-tools";
 *
 * const bench = usePcrBench({ instrument });
 * // InstrumentStage is the scene package's; anything that draws an instrument from this data will do.
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function usePcrBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, the tubes chosen, and where in the programme to be. Followed whenever it changes. */
  start?: { view?: BenchView; template?: string; forward?: string; reverse?: string; step?: PcrStepName; cycle?: number };
} = {}): { stage: BenchStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<BenchView>(start?.view ?? "machine");
  const [template, setTemplate] = useState(start?.template ?? "");
  const [forward, setForward] = useState(start?.forward ?? "");
  const [reverse, setReverse] = useState(start?.reverse ?? "");
  const [least, setLeast] = useState("18");
  const [set, setSet] = useState<PcrProgramme | null>(null);
  const [step, setStep] = useState<PcrStepName>(start?.step ?? "denature");
  const [cycle, setCycle] = useState(start?.cycle ?? 1);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [site, setSite] = useState<"top" | "bottom">("top");

  // A host driving the bench — a tour, or a link — says what to show by changing `start`. Following
  // it rather than being mounted afresh is what lets the scene stay put and the camera travel.
  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.template !== undefined) setTemplate(start.template);
    if (start.forward !== undefined) setForward(start.forward);
    if (start.reverse !== undefined) setReverse(start.reverse);
    if (start.step !== undefined) setStep(start.step);
    if (start.cycle !== undefined) setCycle(start.cycle);
  }, [asked]);

  const tubes = useMemo(() => (lab === null || lab === undefined ? { templates: [], primers: [] } : pcrTubes(lab)), [lab]);
  const partOf = (item: string) => [...tubes.templates, ...tubes.primers].find((one) => one.item === item)?.part;
  const [templatePart, forwardPart, reversePart] = [partOf(template), partOf(forward), partOf(reverse)];
  const annealAtLeast = whole(least) ?? 18;

  // What is true of this run: what the engine says the primers make, and where each binds.
  const drafted = useMemo(() => (lab === null || lab === undefined ? null : pcrRun(lab, { template, forward, reverse, annealAtLeast })), [lab, template, forward, reverse, annealAtLeast]);
  const product = drafted?.plan?.problem === null ? drafted.plan.products[0]! : null;
  const bindings = useMemo(() => {
    if (templatePart === undefined || forwardPart === undefined || reversePart === undefined) return null;
    const found = [primerBinding(templatePart.sequence, forwardPart.sequence, annealAtLeast), primerBinding(templatePart.sequence, reversePart.sequence, annealAtLeast)];
    const top = found.find((one) => one?.reads === "top");
    const bottom = found.find((one) => one?.reads === "bottom");
    return top === undefined || top === null || bottom === undefined || bottom === null ? null : { top, bottom };
  }, [templatePart, forwardPart, reversePart, annealAtLeast]);
  const reaction = useMemo(() => ({
    length: product?.length ?? 0,
    primers: [forwardPart, reversePart].flatMap((part) => (part === undefined ? [] : [{ name: part.name, tm: primerTm(part.sequence) ?? 60 }])),
  }), [product, forwardPart, reversePart]);
  const suggested = useMemo(() => suggestProgramme(reaction), [reaction]);
  // A new choice of tubes is a new reaction, so what was set for the last one is let go.
  useEffect(() => { setSet(null); setSaid(null); }, [template, forward, reverse]);
  const programme = set ?? suggested;
  const checks = product === null ? [] : programmeChecks(programme, reaction);
  const run = useMemo(() => (lab === null || lab === undefined ? null : pcrRun(lab, {
    template, forward, reverse, annealAtLeast, instrument: instrument?.id ?? null, name, note, programme, ...(whole(amount) === undefined ? {} : { amount: whole(amount)! }),
  })), [lab, template, forward, reverse, annealAtLeast, instrument, name, note, programme, amount]);

  // The real bases, at whichever primer is being looked at.
  const lens = useMemo(() => {
    if (bindings === null || templatePart === undefined || forwardPart === undefined || reversePart === undefined) return undefined;
    const binding = bindings[site];
    const primer = [forwardPart, reversePart].find((part) => primerBinding(templatePart.sequence, part.sequence, annealAtLeast)?.reads === site)!;
    // Heating parts the template's own two strands; after that a primer is with the strand beside it.
    const rows: [number, number] = step === "denature" ? [0, 3] : site === "top" ? [2, 3] : [0, 1];
    return (through: number) => ({ ...tubeLens(templatePart.sequence, primer.sequence, binding, step, through, { primer: primer.name, template: templatePart.name }), rows });
  }, [bindings, templatePart, forwardPart, reversePart, annealAtLeast, site, step]);
  // The working for the primer being looked at, and for the counts.
  const bound = useMemo(() => {
    if (bindings === null || templatePart === undefined) return null;
    const primer = [forwardPart, reversePart].find((part) => part !== undefined && primerBinding(templatePart.sequence, part.sequence, annealAtLeast)?.reads === site);
    return primer === undefined ? null : { ...bindingWorking(templatePart.sequence, primer, bindings[site], annealAtLeast), name: primer.name };
  }, [bindings, templatePart, forwardPart, reversePart, annealAtLeast, site]);
  const counted = useMemo(() => countsWorking(programme.cycles), [programme.cycles]);
  const inTube = bindings === null || templatePart === undefined ? undefined : tubeView(templatePart.length, bindings.top, bindings.bottom, step, cycle);
  // Running the programme: each step plays into the next, and each cycle into the next, as the
  // machine would. The first three cycles are played at the pace chosen, since each shows something
  // new. After that every cycle looks alike, so they go by quickly and the counts are what to watch.
  const onward = (): void => {
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next !== undefined) { setStep(next); return; }
    if (cycle >= programme.cycles) { setRunning(false); return; }
    setCycle(cycle + 1);
    setStep("denature");
  };
  const played = (): void => { if (running) onward(); };
  const onMachine = (line: { text: string; step?: PcrStepName }, at: number): { text: string; lit?: boolean } =>
    (at === 1 ? { text: `Cycle ${Math.min(cycle, programme.cycles)} of ${programme.cycles}`, ...(running ? { lit: true } : {}) }
      : { text: line.text, ...(line.step === step ? { lit: true } : {}) });
  const stage: BenchStage = {
    model: "thermocycler", name: instrument?.name ?? "Thermocycler", view, onView: (to) => { setView(to); if (to !== "tube") setRunning(false); },
    onPlayed: played, ...(running && cycle > 3 ? { seconds: 0.22 } : {}),
    screen: product === null ? [{ text: "No programme" }] : screenOf(programme).map(onMachine),
    ...(templatePart === undefined ? {} : { well: { row: 0, column: 0 } }),
    ...(inTube === undefined || templatePart === undefined ? {} : { tube: { length: templatePart.length, strands: inTube.strands } }),
    ...(lens === undefined || cycle > 3 ? {} : { lens }),
    // The product's length, shown as what it is: the distance between where the two primers reach.
    ...(bindings === null || bindings.bottom.end <= bindings.top.start ? {} : { measures: [{ from: bindings.top.start, to: bindings.bottom.end,
      label: `${bindings.bottom.end.toLocaleString("en-US")} − ${(bindings.top.start + 1).toLocaleString("en-US")} + 1 = ${(bindings.bottom.end - bindings.top.start).toLocaleString("en-US")} bases copied` }] }),
    ...(product === null || run === null || view !== "result" ? {} : { molecule: moleculeOf({ name: run.name, length: product.length, circular: false, features: run.features }) }),
    legend: { template: "the template's two strands", primer: "a primer", long: "a copy that runs on too far", product: "the product, at its exact length" },
  };

  const change = (edit: (programme: PcrProgramme) => void): void => { const next = structuredClone(programme); edit(next); setSet(next); };
  const record = async (what: Record<string, unknown> | null, done: string): Promise<void> => {
    if (what === null) return;
    setBusy(true);
    const answer = await act("recordRun", what);
    setBusy(false);
    if (answer.ok) { setSaid(done); setName(""); setNote(""); }
  };
  const chosen = templatePart !== undefined && forwardPart !== undefined && reversePart !== undefined;

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet benchpanel">
      <section className="card">
        <div className="toolhead">
          <h2>PCR</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {tubes.templates.length === 0 ? <p className="empty">There are no tubes to run a PCR from. Add a part and a tube of it on the Freezer tab.</p> : (
          <fieldset disabled={busy} className="stack">
            <Pick label="Template" choices={tubes.templates} value={template} onChange={setTemplate} />
            <Pick label="Forward primer" choices={tubes.primers} value={forward} onChange={setForward} />
            <Pick label="Reverse primer" choices={tubes.primers} value={reverse} onChange={setReverse} />
          </fieldset>
        )}
        {chosen && drafted?.plan?.problem !== null && drafted?.plan !== null && <p className="trouble" role="status">{drafted?.plan?.problem}</p>}
        {templatePart !== undefined && (
          <SequenceMap name={templatePart.name} length={templatePart.length} circular={templatePart.circular} features={templatePart.features}
                       spans={bindings === null ? [] : [
                         // What is copied: from one primer's far end to the other's.
                         ...(product !== null && bindings.bottom.end > bindings.top.start ? [{ start: bindings.top.start, end: bindings.bottom.end, label: `${product.length.toLocaleString("en-US")} bp`, strand: 0 as const }] : []),
                         ...[forwardPart, reversePart].flatMap((part) => {
                           const binding = part === undefined ? null : primerBinding(templatePart.sequence, part.sequence, annealAtLeast);
                           return binding === null || part === undefined ? [] : [{ start: binding.start, end: binding.end, label: part.name, strand: binding.reads === "top" ? (1 as const) : (-1 as const) }];
                         }),
                       ]} />
        )}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the machine</h2>
          <p className="small"><Glossed text="PCR copies the stretch of a template that lies between two primers, over and over, by heating and cooling it." /></p>
          <p className="dim small">A thermocycler shows its programme, the block's temperature and which cycle it is on. It shows nothing of the DNA. The first three views are what it shows; the last two are what you have to picture.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The block</h2>
          <p className="voice">The machine</p>
          <p className="small">96 wells under a heated lid, which presses on the tubes so nothing condenses on their caps.</p>
          <p className="voice">This run</p>
          <p className="small">{templatePart === undefined ? "No tube is in the block yet. Choose a template above." : "Your reaction is in well A1, at the back left."}</p>
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The programme</h2>
          {product === null ? <p className="dim small">Choose tubes that make one product and a programme is suggested for it.</p> : (
            <>
              <p className="voice">The machine</p>
              <fieldset disabled={busy} className="programme">
                <label>Anneal at<input type="number" min={30} max={80} step={1} value={programme.steps[1].celsius} onChange={(event) => change((p) => { p.steps[1].celsius = whole(event.target.value) ?? p.steps[1].celsius; })} /> °C</label>
                <label>Extend for<input type="number" min={5} max={1800} step={5} value={programme.steps[2].seconds} onChange={(event) => change((p) => { p.steps[2].seconds = whole(event.target.value) ?? p.steps[2].seconds; })} /> s</label>
                <label>Cycles<input type="number" min={1} max={60} step={1} value={programme.cycles} onChange={(event) => change((p) => { p.cycles = whole(event.target.value) ?? p.cycles; })} /></label>
                {set !== null && <button type="button" className="plain" onClick={() => setSet(null)}>back to what was suggested</button>}
              </fieldset>
              <p className="voice">This run</p>
              <p className="small">
                {reaction.primers.map((one) => `${one.name} melts near ${Math.round(one.tm)} °C`).join("; ")}. The product is {product.length.toLocaleString("en-US")} bases.
              </p>
              <p className="voice">Checks</p>
              {checks.length === 0 ? <p className="small good">Nothing in this programme looks wrong for this reaction.</p> : (
                <ul className="checks">{checks.map((check) => <li key={check.says} className={check.weight}>{check.says} <code className="because">{check.because}</code></li>)}</ul>
              )}
              <p className="voice">The working</p>
              {[forwardPart, reversePart].map((part) => { const working = part === undefined ? null : tmWorking(part.name, part.sequence); return working === null ? null : <ShowWorking key={part!.checksum} working={working} />; })}
              {programmeWorking(reaction, suggested).map((working) => <ShowWorking key={working.of} working={working} />)}
            </>
          )}
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the tube</h2>
          {inTube === undefined ? <p className="dim small">{chosen ? "These primers do not each bind this template in one place, so there is nothing to draw." : "Choose a template and two primers to see what happens to them."}</p> : (
            <>
              <div className="row tight pick" role="group" aria-label="Step of the cycle">
                {STEPS.map((one) => <button key={one} type="button" aria-pressed={one === step} className={one === step ? "" : "quiet"} onClick={() => setStep(one)}>{one[0]!.toUpperCase()}{one.slice(1)}</button>)}
              </div>
              <div className="row tight pick" role="group" aria-label="Cycle">
                <span className="dim small">Cycle</span>
                {[1, 2, 3].map((one) => <button key={one} type="button" aria-pressed={one === cycle} className={one === cycle ? "" : "quiet"} onClick={() => { setRunning(false); setCycle(one); }}>{one}</button>)}
                {cycle > 3 && <span className="small">{cycle} of {programme.cycles}</span>}
              </div>
              <div className="row tight pick" role="group" aria-label="Which primer to read the bases at">
                <span className="dim small">Read the bases at</span>
                {(["top", "bottom"] as const).map((one) => {
                  const part = [forwardPart, reversePart].find((each) => each !== undefined && templatePart !== undefined && primerBinding(templatePart.sequence, each.sequence, annealAtLeast)?.reads === one);
                  return <button key={one} type="button" aria-pressed={one === site} className={one === site ? "" : "quiet"} onClick={() => setSite(one)}>{part?.name ?? one}</button>;
                })}
              </div>
              <div className="row tight pick">
                <button type="button" onClick={() => {
                  if (running) { setRunning(false); return; }
                  setRunning(true);
                  // The step showing has usually finished playing, so a run starts by moving on from it.
                  if (cycle >= programme.cycles && step === "extend") { setCycle(1); setStep("denature"); } else onward();
                }}>
                  {running ? "Stop" : cycle >= programme.cycles && step === "extend" ? "Run it again" : "Run the programme"}
                </button>
                <span className="dim small">{running ? "Each step plays into the next." : "Or press a step to see it alone."}</span>
              </div>
              <p className="voice">The machine</p>
              <p className="small"><code>{screenOf(programme).find((line) => line.step === step)?.text.trim()}</code> · cycle {Math.min(cycle, programme.cycles)} of {programme.cycles}</p>
              <TemperatureTrace programme={programme} step={step} />
              <p className="voice">What is going on</p>
              <p className="small"><Glossed text={inTube.says} /></p>
              <p className="voice">This run</p>
              <StrandBars counts={inTube.counts} cycles={programme.cycles} />
              <p className="dim small">
                Strands in the tube now, from one double-stranded template. Each step along a bar is twice as many. The copies that run on too far
                grow by two a cycle; the product doubles, and after {programme.cycles} cycles there are {strandCounts(programme.cycles).product.toLocaleString("en-US")}.
              </p>
              <p className="voice">The working</p>
              {bound !== null && <ShowWorking working={bound}><FacedBases working={bound} name={bound.name} /></ShowWorking>}
              <ShowWorking working={counted}>
                <table className="counts">
                  <thead><tr><th>After cycle</th><th>Template</th><th>Too long</th><th>Product</th><th>In all</th></tr></thead>
                  <tbody>{counted.rows.map((row) => <tr key={row.cycle}><td>{row.cycle}</td><td>{row.template}</td><td>{row.long}</td><td>{row.product.toLocaleString("en-US")}</td><td>{row.total.toLocaleString("en-US")}</td></tr>)}</tbody>
                </table>
              </ShowWorking>
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>The result</h2>
          {product === null ? <p className="dim small">Choose tubes that make one product.</p> : (
            <>
              <p className="voice">This run</p>
              <p><strong>{product.length.toLocaleString("en-US")} bp</strong> <span className="dim">linear</span></p>
              <SequenceMap name={run?.name ?? "product"} length={product.length} circular={false} features={run?.features ?? []} />
              {bindings !== null && templatePart !== undefined && (
                <>
                  <p className="voice">The working</p>
                  <ShowWorking working={lengthWorking(bindings.top, bindings.bottom, templatePart, product.length)} />
                  {bindings.bottom.end > bindings.top.start && carriedWorking(templatePart.features, bindings.top.start, bindings.bottom.end, bindings.top.tail).length > 0 && (
                    <ShowWorking working={{ of: "what is marked on the product", comes: `${carriedWorking(templatePart.features, bindings.top.start, bindings.bottom.end, bindings.top.tail).length} carried from the template`, kind: "exact",
                                           steps: carriedWorking(templatePart.features, bindings.top.start, bindings.bottom.end, bindings.top.tail) }} />
                  )}
                </>
              )}
              <p className="dim small">{(run?.features.length ?? 0) > 2 ? "What the template had marked on this stretch is marked on the product, and is kept with it when the run is recorded." : "The primers are marked at the ends they became."}</p>
              <code className="wrap">{product.length <= 96 ? product.sequence : `${product.sequence.slice(0, 44)} … ${product.sequence.slice(-44)}`}</code>
              <Gel ladder={ladderBands(ladderById(product.length < 1500 ? "100bp" : "1kb").sizes, gelById(product.length < 1500 ? "1.5" : "1.0"))}
                   bands={bandsOf([product.length], gelById(product.length < 1500 ? "1.5" : "1.0"))} name={run?.name ?? "product"} />
              {checks.length > 0 && (
                <>
                  <p className="voice">Checks</p>
                  <ul className="checks">{checks.map((check) => <li key={check.says} className={check.weight}>{check.says}</li>)}</ul>
                </>
              )}
              <fieldset disabled={busy} className="stack">
                <label>Call the product<input value={name} onChange={(event) => setName(event.target.value)} placeholder={run?.name ?? ""} maxLength={200} /></label>
                <label>Amount, in µL<input type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></label>
                <div className="row">
                  <button type="button" onClick={() => void record(run?.worked ?? null, `Recorded. There is a new tube of ${run?.name ?? "the product"}, not yet put anywhere.`)}>Record the run</button>
                  <button type="button" className="quiet" onClick={() => void record(run?.failed ?? null, "Recorded as a run that gave nothing. The tubes were used all the same.")}>It gave nothing</button>
                </div>
              </fieldset>
            </>
          )}
          {said !== null && <p className="small" role="status">{said}</p>}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}
