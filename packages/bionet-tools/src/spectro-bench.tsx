"use client";

/**
 * A reading at the spectrophotometer: what the machine shows, and what somebody makes of it.
 *
 * This is the first tool on this bench that does not predict anything. Every other one works out
 * what a machine would do from the sequences and then offers to record it; a spectrophotometer is
 * handed a number that was read off a screen, and all it can do is say what that number means and
 * how far to trust it. So the shape of it is turned round: the reading is typed in, and everything
 * under it is inference, each piece saying what it rests on.
 *
 * The three things worth seeing here are the three the machine does not say. That a reading above
 * the linear range is lower than the truth and looks no different. That a culture's number is not
 * an absorbance at all, which is drawn: the light is scattered out of the beam rather than swallowed
 * by it. And that one number means nothing without the range it has to be in, which is why the last
 * view is the reading set on a scale with the window to act in marked on it.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { amountOf } from "@biolibs/bionet-panels";
import { Glossed } from "@biolibs/glossary-react";
import { proteinFacts } from "./protein.js";
import { spectroRun, spectroTubes } from "./run.js";
import { moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { LINEAR, SAMPLE_NAMES, SAMPLE_NM, density, moment, nucleicAcid, purity, scientific, trust, type Sample } from "./spectro.js";
import { spectroWorking } from "./spectro-working.js";
import { ShowWorking } from "./working.js";

/** The views of the spectrophotometer, by the names every instrument's stage uses. */
export type SpectroView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface SpectroStage {
  model: "spectrophotometer";
  name: string;
  view: SpectroView;
  onView: (view: SpectroView) => void;
  screen: { text: string; lit?: boolean }[];
  well?: { row: number; column: number };
  /** The light through the cuvette, for the view that looks at it. */
  beam?: { nm: number; through: number; what: string; scatters?: boolean };
  /** The reading on a scale, with the ranges that matter marked, for the last view. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
  /** What was read, for a tube of DNA, so the last view shows the molecule the number is about. */
  molecule?: DrawnMolecule;
}

const tidy = (value: number, places = 3): string => `${Math.round(value * 10 ** places) / 10 ** places}`;
const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/** What a tube is most likely to be read as, from what the lab says it holds. */
function likely(holds: { part?: { kind?: string; circular: boolean; length: number } | undefined; culture: boolean }): Sample {
  if (holds.culture) return "culture";
  if (holds.part?.kind === "protein") return "protein";
  return holds.part !== undefined && !holds.part.circular && holds.part.length <= 60 ? "oligo" : "dsDNA";
}

/**
 * A reading, at the spectrophotometer it is taken on.
 *
 * @param options - `start` says what to open on, for a tour or a link; `instrument` is the machine
 *   the lab has placed, if it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useSpectroBench } from "@biolibs/bionet-tools";
 *
 * const bench = useSpectroBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useSpectroBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, the tube, what is in it and what was read. Followed whenever it changes. */
  start?: { view?: SpectroView; tube?: string; sample?: Sample; shown?: number; dilution?: number };
} = {}): { stage: SpectroStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<SpectroView>(start?.view ?? "machine");
  const [tube, setTube] = useState(start?.tube ?? "");
  const [sample, setSample] = useState<Sample | "">(start?.sample ?? "");
  const [shown, setShown] = useState(start?.shown === undefined ? "" : `${start.shown}`);
  const [dilution, setDilution] = useState(start?.dilution === undefined ? "1" : `${start.dilution}`);
  const [path, setPath] = useState("1");
  const [a280, setA280] = useState("");
  const [a230, setA230] = useState("");
  const [used, setUsed] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.tube !== undefined) setTube(start.tube);
    if (start.sample !== undefined) setSample(start.sample);
    if (start.shown !== undefined) setShown(`${start.shown}`);
    if (start.dilution !== undefined) setDilution(`${start.dilution}`);
  }, [start?.view, start?.tube, start?.sample, start?.shown, start?.dilution]);

  const offered = useMemo(() => (lab === null || lab === undefined ? [] : spectroTubes(lab)), [lab]);
  const item = lab?.items.find((one) => one.item === tube);
  const part = item === undefined || item.part === null ? undefined : lab?.parts.find((one) => one.checksum === item.part);
  const strain = item === undefined || item.part !== null ? undefined : lab?.strains.find((one) => one.strain === item.strain);
  const kind: Sample | "" = sample !== "" ? sample
    : item === undefined ? "" : likely({ part, culture: strain !== undefined });
  const nm = kind === "" ? 600 : SAMPLE_NM[kind];
  const read = number(shown);
  const reading = { nm, shown: read ?? 0, dilution: number(dilution) ?? 1, path: number(path) ?? 1 };
  const how = read === undefined ? null : trust(reading);
  const grown = kind === "culture" && read !== undefined && strain !== undefined ? density(reading, strain.host) : null;
  const when = grown === null || strain === undefined ? null : moment(grown.od, strain.host);
  const amount = kind !== "" && kind !== "culture" && kind !== "protein" && read !== undefined ? nucleicAcid(reading, kind) : null;
  const clean = amount === null || read === undefined ? null
    : purity({ a260: reading.shown, ...(number(a280) === undefined ? {} : { a280: number(a280)! }), ...(number(a230) === undefined ? {} : { a230: number(a230)! }) }, kind as "dsDNA");
  const facts = kind === "protein" && part !== undefined ? proteinFacts(part.sequence) : null;

  const run = useMemo(() => (lab === null || lab === undefined || tube === "" || kind === "" || read === undefined ? null
    : spectroRun(lab, { tube, sample: kind, shown: read, dilution: reading.dilution, path: reading.path, instrument: instrument?.id ?? null,
                        ...(number(a280) === undefined ? {} : { a280: number(a280)! }), ...(number(a230) === undefined ? {} : { a230: number(a230)! }),
                        used: Number.isSafeInteger(number(used)) ? number(used)! : 1, note })),
    [lab, tube, kind, read, reading.dilution, reading.path, a280, a230, used, note, instrument]);

  const what = part?.name ?? strain?.name ?? "the sample";
  // What the machine itself shows: the wavelength it is set to and the number it read. Nothing else.
  const screen: { text: string; lit?: boolean }[] = read === undefined
    ? [{ text: `${nm} nm   ----` }, { text: "Blank first" }]
    : [{ text: `${nm} nm   ${tidy(reading.shown, 4).padStart(6, " ")}`, lit: true },
       ...(reading.dilution === 1 ? [] : [{ text: `× ${reading.dilution} dilution` }]),
       ...(number(a280) === undefined ? [] : [{ text: `280 nm   ${tidy(number(a280)!, 4)}` }]),
       ...(number(a230) === undefined ? [] : [{ text: `230 nm   ${tidy(number(a230)!, 4)}` }])];

  const top = nm >= 550 ? LINEAR.scattering : LINEAR.high;
  const scale: SpectroStage["scale"] | undefined = read === undefined ? undefined : {
    what: `${nm} nm, as the machine reads it`,
    from: 0, to: Math.max(top * 1.4, reading.shown * 1.1), ticks: [0, top / 2, top, Math.max(top * 1.4, reading.shown * 1.1)],
    at: reading.shown, label: tidy(reading.shown, 3),
    bands: [
      { from: LINEAR.low, to: top, label: "linear", tone: "good" },
      { from: 0, to: LINEAR.low, label: "noise", tone: "dim" },
      { from: top, to: Math.max(top * 1.4, reading.shown * 1.1), label: "reads low", tone: "attention" },
    ],
  };
  // For a culture there is a second thing the number has to be inside, and it is not the same thing.
  const window_ = when === null || grown === null ? null : when;

  const stage: SpectroStage = {
    model: "spectrophotometer", name: instrument?.name ?? "Spectrophotometer", view, onView: setView, screen,
    ...(tube === "" ? {} : { well: { row: 0, column: 0 } }),
    ...(read === undefined ? {} : {
      beam: { nm, through: 10 ** -reading.shown, what, ...(kind === "culture" ? { scatters: true } : {}) },
    }),
    ...(scale === undefined ? {} : { scale }),
    ...(part === undefined || view !== "result" || kind === "culture" ? {} : { molecule: moleculeOf(part) }),
  };

  const record = async (): Promise<void> => {
    if (run?.record == null) return;
    setBusy(true);
    try {
      await act("recordRun", run.record);
      setSaid(how?.ok === true ? "Recorded." : "Recorded, and marked as a reading outside the range.");
    } catch (trouble) {
      setSaid(trouble instanceof Error ? trouble.message : "It would not record.");
    } finally {
      setBusy(false);
    }
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const panel = (
    <div className="pcr spectro">
      <section className="card">
        <div className="toolhead">
          <h2>Spectrophotometer{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {offered.length === 0 ? <p className="empty">There is nothing to read. Add a part on the Freezer tab, or a culture on the Strains tab.</p> : (
          <fieldset disabled={busy} className="stack">
            <label>Tube
              <select value={tube} onChange={(event) => { setTube(event.target.value); setSample(""); }} aria-label="Tube">
                <option value="">Choose a tube…</option>
                {offered.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
              </select>
            </label>
            <label>Read as
              <select value={kind} onChange={(event) => setSample(event.target.value as Sample)} aria-label="Read as" disabled={tube === ""}>
                {(Object.keys(SAMPLE_NAMES) as Sample[]).map((one) => <option key={one} value={one}>{SAMPLE_NAMES[one]} · {SAMPLE_NM[one]} nm</option>)}
              </select>
            </label>
            <div className="row tight">
              <label>What it showed<input type="number" min={0} step="any" value={shown} onChange={(event) => setShown(event.target.value)} placeholder="0.000" /></label>
              <label>Diluted<input type="number" min={1} step="any" value={dilution} onChange={(event) => setDilution(event.target.value)} />-fold</label>
              <label>Path<input type="number" min={0} step="any" value={path} onChange={(event) => setPath(event.target.value)} /> cm</label>
            </div>
          </fieldset>
        )}
        {how !== null && <p className={how.ok ? "small good" : "trouble"} role="status">{how.says}</p>}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the machine</h2>
          <p className="small"><Glossed text="A spectrophotometer shines light of one wavelength through a sample and says how much came out the other side." /></p>
          <p className="dim small">It says one number and no more. How much DNA is in the tube, how clean it is, how many cells are in the flask, whether it is time to induce — all of that is inferred from that one number by a convention, and every convention could have been another one. The first three views are what it shows; the last two are what you make of it.</p>
          <p className="voice">Before anything</p>
          <p className="small">It is blanked on whatever the sample is dissolved in — the buffer, the medium — and the blank is subtracted from everything after. A reading against the wrong blank is wrong by however much that liquid absorbs, and nothing on the machine will say so.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The cuvette well</h2>
          <p className="voice">The machine</p>
          <p className="small">One well, because one cuvette goes in at a time. The light crosses it from side to side, so the cuvette's clear faces go across the beam and its frosted ones are what you hold it by.</p>
          <p className="voice">This reading</p>
          {tube === "" ? <p className="dim small">Nothing is in it. Choose a tube above.</p> : (
            <ul className="plainlist small">
              <li>{what}{item === undefined ? "" : ` · ${amountOf(item)}`}</li>
              <li className="dim">{reading.path === 1 ? "A 1 cm cuvette, which is what every factor here is for." : `A path of ${reading.path} cm, which is divided out before anything is worked from it.`}</li>
            </ul>
          )}
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The reading</h2>
          <p className="voice">The machine</p>
          <p className="small">It is set to {nm} nm{kind === "" ? "" : `, which is where ${kind === "culture" ? "a culture is read" : kind === "protein" ? "protein absorbs" : "nucleic acid absorbs"}`}.</p>
          {kind !== "" && kind !== "culture" && kind !== "protein" && (
            <fieldset disabled={busy} className="row tight">
              <label>280 nm<input type="number" min={0} step="any" value={a280} onChange={(event) => setA280(event.target.value)} placeholder="optional" /></label>
              <label>230 nm<input type="number" min={0} step="any" value={a230} onChange={(event) => setA230(event.target.value)} placeholder="optional" /></label>
            </fieldset>
          )}
          <p className="voice">What it does not say</p>
          <p className="small">Whether the number is inside the range it is linear over. Above about {top} the light is so far gone that most of what reaches the detector got round the sample rather than through it, and the reading comes back lower than the truth — looking exactly like a good reading.</p>
          {how !== null && <ShowWorking working={spectroWorking(reading, kind === "" ? "dsDNA" : kind)[0]!} />}
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>The light through it</h2>
          {read === undefined ? <p className="dim small">Type in what the machine showed and this draws it.</p> : (
            <>
              <p className="voice">What is happening</p>
              <p className="small">{Math.round(10 ** -reading.shown * 100)}% of the light got through. A reading of {tidy(reading.shown, 3)} means that: the number is the logarithm of how much was stopped, so 1.0 is a tenth getting through and 2.0 is a hundredth.</p>
              {kind === "culture" ? (
                <p className="small"><strong>Nothing here is absorbing it.</strong> Cells do not take up 600 nm light; they scatter it out of the beam, which is drawn as the light leaving sideways. That is why this number is called an optical density rather than an absorbance, why Beer's law does not hold for it, and why the factor from it to a cell count belongs to the machine as much as to the cells.</p>
              ) : (
                <p className="small">The bases{kind === "protein" ? " — the tryptophans and tyrosines —" : ""} absorb it: the light is taken up, not deflected. That is what makes this a reading Beer's law applies to, and what makes a concentration from it arithmetic rather than a guess.</p>
              )}
              <ShowWorking working={spectroWorking(reading, kind === "" ? "dsDNA" : kind)[1]!} />
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What it means</h2>
          {read === undefined || kind === "" ? <p className="dim small">Choose a tube and type in what the machine showed.</p> : (
            <>
              {how !== null && !how.ok && (
                // Everything under this is the reading times a convention, so a reading that cannot be
                // believed makes all of it not to be believed either. Printing the figures plainly
                // under a warning nobody reads is how a number that is wrong gets written down.
                <p className="trouble" role="status">
                  {how.dilute === undefined
                    ? "This reading is mostly the instrument's own noise, so nothing worked out from it below means anything. Read more of it, or neat."
                    : `This reading is above the range the machine is linear over, so everything below is worked out from a number that is lower than the truth — which makes every figure under it lower than the truth too. Dilute ${how.dilute}-fold, read again, and use that.`}
                </p>
              )}
              <div className={how !== null && !how.ok ? "doubted" : undefined}>
              {amount !== null && (
                <>
                  <p className="voice">This reading</p>
                  <p><strong>{tidy(amount.ngPerUl, 1)} ng/µL</strong> <span className="dim">of {SAMPLE_NAMES[kind]}</span>
                    {item === undefined ? null : <span className="dim"> · {tidy((amount.ngPerUl * item.amount) / 1000, 2)} µg in the {amountOf(item)} the tube holds</span>}</p>
                  {clean !== null && clean.says.length > 0 && (
                    <>
                      <p className="voice">What else is in there</p>
                      <ul className="checks">{clean.says.map((one) => <li key={one} className={/under|over/.test(one) ? "warn" : "fine"}>{one}</li>)}</ul>
                    </>
                  )}
                </>
              )}
              {grown !== null && (
                <>
                  <p className="voice">This reading</p>
                  <p><strong>{scientific(grown.perMl)} cells/mL</strong> <span className="dim">of {grown.host}, at a reading of {tidy(grown.od, 3)}</span></p>
                  {window_ !== null && <p className={window_.ready ? "small good" : "small"}>{window_.says}</p>}
                </>
              )}
              {kind === "culture" && grown === null && (
                <p className="small">The reading is {tidy((reading.shown * reading.dilution) / reading.path, 3)}. {strain === undefined ? "This tube is not a culture of a strain the lab knows." : `Nothing here has a cells-per-mL factor for ${strain.host}, so the reading is a reading and the cell count is not known.`}</p>
              )}
              {kind === "protein" && (
                facts === null ? <p className="small">This tube is not a protein this can read a sequence for.</p>
                  : <p><strong>{(() => { const working = spectroWorking(reading, "protein", { protein: { name: part?.name ?? "it", extinction: facts.extinction.reduced, weight: facts.weight } }); return working.at(-1)?.comes ?? "—"; })()}</strong></p>
              )}
              <p className="voice">The working</p>
              {spectroWorking(reading, kind, {
                ...(strain === undefined ? {} : { host: strain.host }),
                ...(facts === null || part === undefined ? {} : { protein: { name: part.name, extinction: facts.extinction.reduced, weight: facts.weight } }),
              }).map((working) => <ShowWorking key={working.of} working={working} />)}
              <fieldset disabled={busy} className="stack">
                <label>Used, in µL<input type="number" min={0} step={1} value={used} onChange={(event) => setUsed(event.target.value)} /></label>
                <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering" maxLength={2000} /></label>
                <div className="row">
                  <button type="button" disabled={run?.record == null} onClick={() => void record()}>Record the reading</button>
                </div>
              </fieldset>
              {said !== null && <p className="small" role="status">{said}</p>}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * A reading on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the machine the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function SpectroTool(props: Parameters<typeof useSpectroBench>[0]) {
  const bench = useSpectroBench(props);
  const names: [SpectroView, string][] = [["machine", "The machine"], ["block", "The cuvette well"], ["screen", "The reading"],
                                          ["tube", "The light through it"], ["result", "What it means"]];
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
