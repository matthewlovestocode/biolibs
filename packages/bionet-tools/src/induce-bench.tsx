"use client";

/**
 * An induction and its gel, at the shaking incubator.
 *
 * The incubator shows a temperature, a speed and a time. It shows nothing of what the cells are
 * doing, and nothing in this file pretends it does: the first three views are what is there to be
 * read off the machine, the fourth is the gene the operator has to picture being read, and the fifth
 * is the gel, which is where the answer actually comes from.
 *
 * The one place this tool differs from the others is the last step. A PCR's product is arithmetic,
 * so the bench can offer to keep it. A culture's product is not: the band is there or it is not, and
 * only the person holding the gel knows which. So both buttons record the run, and only one of them
 * goes on to put a protein in the freezer.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PROTEIN_GELS, PROTEIN_LADDERS } from "@biolibs/gel";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { Gel } from "./digest-tool.js";
import { INDUCTION, USUAL_PROTEIN_GEL, inductionChecks, inductionCultures, inductionGenes, inductionRun, inductionWorking, markerFor } from "./induce.js";
import { SequenceMap } from "./map.js";
import { Proposed, withPlan, type Plan } from "./plans.js";
import { useRunning } from "./running.js";
import { moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { ShowWorking } from "./working.js";

/** The views of the incubator, by the same names every instrument's stage uses. */
export type InductionView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface InductionStage {
  model: "shaking-incubator";
  name: string;
  view: InductionView;
  onView: (view: InductionView) => void;
  /** What the incubator's display says. */
  screen: { text: string; lit?: boolean }[];
  /** The clamp the flask is in. */
  well?: { row: number; column: number };
  /** The gene being expressed, with its coding sequence marked, for the view into the cells. */
  molecule?: DrawnMolecule;
  /** The gel once run: the marker and the sample, for the last view. */
  gel?: { lanes: { name: string; tone: "dim" | "held"; bands: { position: number; intensity: number; label: string }[] }[]; ran: number };
}

const count = (value: number): string => value.toLocaleString("en-US");
const whole = (text: string): number | undefined => (/^\d+$/.test(text.trim()) ? Number(text) : undefined);
const kda = (value: number): string => `${Math.round(value * 10) / 10} kDa`;

/**
 * An induction and the gel that checks it, at the shaking incubator.
 *
 * @param options - `start` says what to open on, for a tour or a link; `instrument` is the incubator
 *   it is grown in, if the lab has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to
 *   put inside it.
 *
 * @example
 * ```tsx
 * import { useInductionBench } from "@biolibs/bionet-tools";
 *
 * const bench = useInductionBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useInductionBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, the culture and gene chosen, how far the gel starts. Followed whenever it changes. */
  start?: { view?: InductionView; culture?: string; gene?: string; cds?: string; ran?: number };
} = {}): { stage: InductionStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<InductionView>(start?.view ?? "machine");
  const [culture, setCulture] = useState(start?.culture ?? "");
  const [gene, setGene] = useState(start?.gene ?? "");
  const [cds, setCds] = useState(start?.cds ?? "");
  const [cutSignal, setCutSignal] = useState(false);
  const [inducer, setInducer] = useState("IPTG");
  const [concentration, setConcentration] = useState("0.5 mM");
  const [celsius, setCelsius] = useState("30");
  const [rpm, setRpm] = useState("220");
  const [hours, setHours] = useState("4");
  const [used, setUsed] = useState("1");
  const [gel, setGel] = useState(USUAL_PROTEIN_GEL);
  // Empty means "whichever suits the gel", which is what a person does until they want another.
  const [ladder, setLadder] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  // A host driving the bench — a tour, or a link — says what to show by changing `start`.
  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.culture !== undefined) setCulture(start.culture);
    if (start.gene !== undefined) setGene(start.gene);
    if (start.cds !== undefined) setCds(start.cds);
  }, [asked]);

  const cultures = useMemo(() => (lab === null || lab === undefined ? [] : inductionCultures(lab)), [lab]);
  const genes = useMemo(() => (lab === null || lab === undefined || culture === "" ? [] : inductionGenes(lab, culture)), [lab, culture]);
  const chosen = genes.find((one) => one.part.checksum === gene);
  // Arriving at the gel finds it running, because that is what a gel does.
  const [ran, setRan, running] = useRunning(view === "result" && culture !== "" && gene !== "", start?.ran ?? 0);
  const run = useMemo(() => (lab === null || lab === undefined ? null : inductionRun(lab, {
    culture, gene, gel, ladder, instrument: instrument?.id ?? null, note, inducer, concentration,
    ...(cds === "" ? {} : { cds }), ...(cutSignal ? { cutSignal: true } : {}), ...(name === "" ? {} : { name }),
    ...(whole(used) === undefined ? {} : { used: whole(used)! }), ...(whole(amount) === undefined ? {} : { amount: whole(amount)! }),
    ...(whole(celsius) === undefined ? {} : { celsius: whole(celsius)! }),
    ...(whole(rpm) === undefined ? {} : { rpm: whole(rpm)! }),
    ...(whole(hours) === undefined ? {} : { hours: whole(hours)! }),
  })), [lab, culture, gene, cds, cutSignal, gel, ladder, instrument, note, inducer, concentration, celsius, rpm, hours, used, amount, name]);
  const plan = run?.plan ?? null;
  const good = plan !== null && plan.problem === null && plan.kilodaltons !== null ? plan : null;
  const checks = plan === null || plan.problem !== null ? [] : inductionChecks(plan);
  const working = useMemo(() => (good === null ? [] : inductionWorking(good)), [good]);
  // A protein the lab already holds is not added again: it is the same molecule, by the same checksum.
  const already = good?.checksum == null ? undefined : lab?.parts.find((one) => one.checksum === good.checksum);

  const stage: InductionStage = {
    model: "shaking-incubator", name: instrument?.name ?? "Shaking incubator", view, onView: setView,
    screen: [{ text: `${whole(celsius) ?? "—"} °C  ${whole(rpm) ?? "—"} rpm`, lit: true }, { text: `${whole(hours) ?? "—"}:00 h` }],
    ...(culture === "" ? {} : { well: { row: 0, column: 1 } }),
    ...(chosen === undefined || view !== "tube" ? {} : { molecule: (() => {
      const drawn = moleculeOf(chosen.part);
      // The stretch being read is drawn on the gene, since that is the part of it that matters here.
      const marked = cds === "" ? undefined : chosen.part.features.find((one) => one.label === cds)?.parts[0];
      return marked === undefined ? drawn : {
        ...drawn,
        features: [{ start: marked.start, end: marked.end, strand: 0 as const, tone: "found" as const, label: `read · ${cds}` }, ...drawn.features],
      };
    })() }),
    ...(good === null ? {} : { gel: { ran: ran / 100, lanes: [
      // Bands the gel does not separate pile up in the well as one, and are named as the range they
      // are. Labels that still crowd are the scene's to thin out, which it does by rank.
      { name: "marker", tone: "dim" as const, bands: good.ladder.map((band) => ({
          position: band.position, intensity: 0.6,
          label: band.sizes.length > 1 ? `${band.sizes.at(-1)}–${band.sizes[0]}` : `${band.size}` })) },
      { name: "induced", tone: "held" as const, bands: good.bands.map((band) => ({ position: band.position, intensity: band.intensity, label: kda(band.size) })) },
    ] } }),
  };

  /** Set the bench up as a plan says: its culture, and the gene it names. */
  const setUp = (plan: Plan): void => {
    setCulture(plan.inputs.find((one) => one.role === "culture")?.item ?? "");
    setGene(typeof plan.settings["gene_part"] === "string" ? plan.settings["gene_part"] : "");
    setCds(typeof plan.settings["cds"] === "string" ? plan.settings["cds"] : "");
    setCutSignal(plan.settings["signal_cut"] === "yes");
    if (typeof plan.settings["inducer"] === "string") setInducer(plan.settings["inducer"]);
    if (typeof plan.settings["at"] === "string") setConcentration(plan.settings["at"]);
    setSaid(null); setView("result");
  };

  /**
   * Record the run, and — if the band was there — keep the protein.
   *
   * The order is the order it happened in: the run, then the part, then the tube of it. Each is its
   * own entry, so a device that cannot read one still reads the others; and if the part is one the
   * lab already holds, only a tube is added, because two labs that made the same protein made the
   * same protein.
   */
  const record = async (showed: boolean): Promise<void> => {
    const what = showed ? run?.showed ?? null : run?.nothing ?? null;
    const keep = run?.keep ?? null;
    if (what === null) return;
    setBusy(true);
    const answer = await act("recordRun", withPlan(lab, what));
    if (!answer.ok) { setBusy(false); setSaid(answer.error); return; }
    if (!showed || keep === null) {
      setBusy(false); setNote("");
      setSaid("Recorded: it was grown and induced, and nothing was at that mass.");
      return;
    }
    if (already === undefined) {
      const added = await act("addPart", { name: keep.name, sequence: keep.sequence, kind: "protein" });
      if (!added.ok) { setBusy(false); setSaid(added.error); return; }
    }
    const tube = await act("addItem", { part: keep.checksum, amount: keep.amount, unit: keep.unit });
    setBusy(false);
    setNote("");
    setSaid(tube.ok
      ? `Recorded: the band is there, and ${keep.name} is in the freezer — ${keep.amount} ${keep.unit ?? ""}`.trim() + "."
      : tube.error);
  };

  const here = lab === null || lab === undefined ? [] : lab.runs.filter((one) => one.kind === INDUCTION && (instrument === null || one.instrument === instrument.id)).slice(-5).reverse();
  const strainName = (item: string | undefined): string => {
    const held = lab?.items.find((one) => one.item === item);
    return lab?.strains.find((one) => one.strain === held?.strain)?.name ?? "a culture";
  };
  const checked = checks.length === 0 ? <p className="small good">Nothing about this induction looks wrong for this gel.</p>
    : <ul className="checks">{checks.map((check) => <li key={check.says} className={check.weight}>{check.says} <code className="because">{check.because}</code></li>)}</ul>;

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet benchpanel">
      <section className="card">
        <div className="toolhead">
          <h2>Induction and gel</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {cultures.length === 0 ? <p className="empty">There are no cultures to grow. A culture is of a strain: add a strain and a culture of it on the Strains tab, once something has been put into a host.</p> : (
          <fieldset disabled={busy} className="stack">
            <label>Culture
              <select value={culture} onChange={(event) => { setCulture(event.target.value); setGene(""); setCds(""); setSaid(null); }} aria-label="Culture">
                <option value="">Choose a culture…</option>
                {cultures.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
              </select>
            </label>
            {culture !== "" && (
              <label>Express
                <select value={gene} onChange={(event) => { setGene(event.target.value); setCds(""); setSaid(null); }} aria-label="What to express">
                  <option value="">Choose what it carries…</option>
                  {genes.map((one) => <option key={one.part.checksum} value={one.part.checksum}>{one.part.name} · {count(one.part.length)} bp</option>)}
                </select>
              </label>
            )}
            {chosen !== undefined && chosen.coding.length > 0 && (
              <label>Read which coding sequence
                <select value={cds} onChange={(event) => { setCds(event.target.value); setSaid(null); }} aria-label="The coding sequence">
                  <option value="">the whole part</option>
                  {chosen.coding.map((one) => <option key={one} value={one}>{one}</option>)}
                </select>
              </label>
            )}
            {chosen !== undefined && (
              <label className="check">
                <input type="checkbox" checked={cutSignal} onChange={(event) => { setCutSignal(event.target.checked); setSaid(null); }} />
                Take off a signal peptide, if one is marked
              </label>
            )}
          </fieldset>
        )}
        {plan !== null && plan.problem !== null && culture !== "" && <p className="trouble" role="status">{plan.problem}</p>}
      </section>

      <Proposed kind={INDUCTION} now={run?.showed ?? null} onSetUp={setUp} />

      {view === "machine" && (
        <section className="card">
          <h2>At the incubator</h2>
          <p className="small"><Glossed text="Induction turns a promoter on, so that the cells carrying a gene start making the protein it codes for. A few hours later the protein is run on a polyacrylamide gel, which sorts proteins by mass." /></p>
          <p className="dim small">An incubator shows a temperature, a speed and a time, and nothing of what the cells are doing. The first three views are what is there to see. The fourth is the gene you have to picture being read. The fifth is the gel, which is where the answer comes from.</p>
          <p className="dim small">Nothing here predicts a yield. What the cells make depends on the host, the promoter, the temperature and the protein itself, and no sequence tells you it. What is worked out is the protein the gene codes for and the mass its band should run at; whether that band is there is yours to read.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The flasks</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label>Induce with<input value={inducer} onChange={(event) => setInducer(event.target.value)} maxLength={200} aria-label="The inducer" /></label>
            <label>at<input value={concentration} onChange={(event) => setConcentration(event.target.value)} maxLength={200} aria-label="How much of it" /></label>
          </fieldset>
          <p className="small"><Glossed text="A flask of medium clamped to a platform that shakes, so that air is mixed in and the cells stay suspended." /></p>
          <p className="voice">This run</p>
          <p className="small">
            {plan?.strain == null ? "Nothing is growing yet. Choose a culture above." : <>A flask of {plan.strain.name} — {plan.strain.host} — is in the second clamp.</>}
            {plan?.gene != null && <> It carries {plan.gene.name}{cds === "" ? "" : `, and ${cds} is what is being read`}.</>}
          </p>
          <p className="dim small">What the inducer is and how much of it was used are kept with the run as they are written here. Nothing works out whether that concentration is right for this promoter: that is in the literature, and in what this lab has found before.</p>
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The display</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label>Grow at<input type="number" min={4} max={60} step={1} value={celsius} onChange={(event) => setCelsius(event.target.value)} /> °C</label>
            <label>shaking at<input type="number" min={0} max={400} step={10} value={rpm} onChange={(event) => setRpm(event.target.value)} /> rpm</label>
            <label>for<input type="number" min={1} max={96} step={1} value={hours} onChange={(event) => setHours(event.target.value)} /> h</label>
          </fieldset>
          <p className="voice">What is going on</p>
          <p className="small">The inducer lets the polymerase onto the promoter, so the gene behind it is read into messenger RNA and that is translated into protein. The cells go on growing and dividing while they do it, which is why the temperature and the shaking matter as much as the inducer.</p>
          <p className="dim small">Growing cooler and for longer often gives less protein that is better folded, and warmer and briefly gives more of it stuck together in inclusion bodies. Nothing here works out which this will be. What is set is kept with the run, so that the next person can set it up the same way or deliberately differently.</p>
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the cells</h2>
          {chosen === undefined || plan === null ? <p className="dim small">Choose a culture and what it carries to see the gene being read.</p> : (
            <>
              <SequenceMap name={chosen.part.name} length={chosen.part.length} circular={chosen.part.circular} features={chosen.part.features}
                           {...(cds === "" ? {} : { spans: chosen.part.features.filter((one) => one.label === cds).flatMap((one) => one.parts.map((piece) => ({ start: piece.start, end: piece.end, label: "read", strand: 0 as const }))) })} />
              {plan.made === null ? <p className="dim small">{plan.problem ?? "There is nothing here that reads as a gene."}</p> : (
                <>
                  <p className="voice">This run</p>
                  <p>
                    <strong>{count(plan.made.length)} amino acids</strong>
                    {plan.kilodaltons !== null && <span className="dim"> · {kda(plan.kilodaltons)}</span>}
                    {plan.made.signal !== null && <span className="dim"> · {plan.made.signal.label} cut off</span>}
                  </p>
                  <p className="small"><code className="seq">{plan.made.protein.slice(0, 120)}{plan.made.protein.length > 120 ? "…" : ""}</code></p>
                  {plan.facts !== null && (
                    <p className="small">
                      It carries no net charge at pH {plan.facts.isoelectric.toFixed(2)}, which is the pH it would come out of solution at.
                      {plan.facts.extinction.reduced > 0
                        ? <> It absorbs at 280 nm with {count(plan.facts.extinction.reduced)} M⁻¹cm⁻¹, which is how its concentration is read off.</>
                        : <> It has no tryptophan, tyrosine or cystine, so it does not absorb at 280 nm at all and its concentration cannot be read there: use a dye-based assay instead.</>}
                    </p>
                  )}
                  <p className="small"><Glossed text="A signal peptide is the first stretch of a protein the cell means to let out, and is cut off on the way: what is collected from the medium is what is left." /></p>
                  <p className="voice">Checks</p>
                  {checked}
                </>
              )}
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>The gel</h2>
          {good === null ? <p className="dim small">{plan?.problem ?? "Choose a culture and a gene that codes for a protein to see the gel it should give."}</p> : (
            <>
              <p className="voice">The machine</p>
              <fieldset disabled={busy} className="programme">
                <label>Gel<select value={gel} onChange={(event) => setGel(event.target.value)}>{PROTEIN_GELS.map((one) => <option key={one.id} value={one.id}>{one.percent}% acrylamide</option>)}</select></label>
                <label>Marker<select value={ladder} onChange={(event) => setLadder(event.target.value)}>
                  <option value="">{markerFor(good.gel).name} · the one for this gel</option>
                  {PROTEIN_LADDERS.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
                </select></label>
              </fieldset>
              <p className="voice">This run</p>
              <Gel ladder={good.ladder} bands={good.bands} name="induced" unit="kilodaltons" marker="marker"
                   says={`A protein gel: a broad-range marker beside the induced culture, with one band to look for at ${kda(good.kilodaltons!)}`} />
              <p className="small">The band to look for is at <strong>{kda(good.kilodaltons!)}</strong>, between the marker&rsquo;s {good.ladder.filter((one) => one.size >= good.kilodaltons!).at(-1)?.size ?? good.gel.largest} and {good.ladder.filter((one) => one.size <= good.kilodaltons!)[0]?.size ?? good.gel.smallest} kDa bands. This gel separates {good.gel.largest} down to {good.gel.smallest} kDa.</p>
              <label className="small">How far it has run{running ? " · running" : ""}
                <input type="range" min={0} max={100} step={1} value={Math.round(ran)} onChange={(event) => setRan(Number(event.target.value))} aria-label="How far the gel has run" />
              </label>
              <p className="dim small">A lane of the same culture before it was induced, beside this one, is what makes a band mean anything: the protein is the band that is in one and not the other.</p>
              <p className="voice">Checks</p>
              {checked}
              <p className="voice">The working</p>
              {working.map((one) => <ShowWorking key={one.of} working={one} />)}
              <fieldset disabled={busy} className="stack">
                <label>Call the protein<input value={name} onChange={(event) => setName(event.target.value)} maxLength={200}
                                               placeholder={run?.keep?.name ?? "a name for it"} aria-label="What to call the protein" /></label>
                <label>Used, from the culture<input type="number" min={0} step={1} value={used} onChange={(event) => setUsed(event.target.value)} aria-label="Amount used" /></label>
                <label>How much came out, in mL<input type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="How much protein came out" /></label>
                <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering about this induction" maxLength={2000} /></label>
                {already !== undefined && <p className="small">The lab already holds this protein, as {already.name}. Only a tube of it will be added: it is the same molecule.</p>}
                <div className="row">
                  <button type="button" onClick={() => void record(true)}>The band is there</button>
                  <button type="button" className="quiet" onClick={() => void record(false)}>Nothing at that mass</button>
                </div>
                <p className="dim small">Either way the run is recorded and the culture is used. Only the first puts a protein in the freezer, and it is named in the run&rsquo;s settings by the checksum it will have, so the two can be put back together afterwards.</p>
              </fieldset>
              {said !== null && <p className="small" role="status">{said}</p>}
            </>
          )}
        </section>
      )}

      {here.length > 0 && view === "result" && (
        <section className="card">
          <h2>Recent inductions{instrument === null ? "" : " here"}</h2>
          <table>
            <thead><tr><th>Culture</th><th>Gene</th><th>Induced with</th><th>Expected</th><th>Gel</th></tr></thead>
            <tbody>
              {here.map((one) => (
                <tr key={one.run}>
                  <td>{strainName(one.inputs[0]?.item)}</td>
                  <td>{String(one.settings["gene"] ?? "—")}</td>
                  <td className="dim">{[one.settings["inducer"], one.settings["at"]].filter((each) => each !== undefined).join(" ") || "—"}</td>
                  <td className="dim">{one.settings["expected_kda"] === undefined ? "—" : `${String(one.settings["expected_kda"])} kDa`}</td>
                  <td>{one.outcome === "worked" ? "band there" : <span className="badge">nothing</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * The induction tool on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the incubator it is grown in, if the lab has one; `start` says what
 *   to open on; `onDone` adds a way to leave.
 */
export function InductionTool(props: Parameters<typeof useInductionBench>[0]) {
  const bench = useInductionBench(props);
  const names: [InductionView, string][] = [["machine", "The incubator"], ["block", "The flasks"], ["screen", "The display"], ["tube", "In the cells"], ["result", "The gel"]];
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
