"use client";

/**
 * A digest and its gel at the gel station: what is shown beside the instrument, and what the scene
 * is told to draw.
 *
 * A gel box and its power supply show a voltage, a current and a time. They show nothing of the
 * DNA: where it was cut, how many pieces there are, how far each has run. That is pictured, and
 * then read off the gel against a ladder. So the views run the same way as a PCR's: the rig, the
 * gel in it, what the power supply says, then what is in the tube, and the gel once it has run.
 */
import { useMemo, useState, type ReactNode } from "react";
import { GELS, LADDERS, gelById } from "@biolibs/gel";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { cutters, enzymeNamed } from "./digest.js";
import { Gel } from "./digest-tool.js";
import { cutSites, digestChecks, digestPieces, migrationWorking, piecesWorking, siteWorking, type PieceEnd } from "./digest-working.js";
import { SequenceMap } from "./map.js";
import { digestRun, digestTubes } from "./run.js";
import { moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { CutBases, ShowWorking } from "./working.js";

/** The views of the gel station, by the same names every instrument's stage uses. */
export type DigestView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface DigestStage {
  model: "gel-station";
  name: string;
  view: DigestView;
  onView: (view: DigestView) => void;
  /** What the power supply's display says. */
  screen: { text: string; lit?: boolean }[];
  /** The lane the digest is loaded in. */
  well?: { row: number; column: number };
  /** The molecule being cut, with the cuts marked, for the view into the tube. */
  molecule?: DrawnMolecule & { marks: { at: number; label: string }[] };
  /** The gel once run: the ladder and the digest, for the last view. */
  gel?: { lanes: { name: string; tone: "dim" | "held"; bands: { position: number; intensity: number; label: string }[] }[]; ran: number };
}

const count = (value: number): string => value.toLocaleString("en-US");
const whole = (text: string): number | undefined => (/^\d+$/.test(text.trim()) ? Number(text) : undefined);
const endWords = (end: PieceEnd): ReactNode => (end.enzyme === null ? <span className="dim">the molecule's end</span>
  : <>{end.enzyme} <span className="dim">{end.overhang === "blunt" ? "blunt" : `${end.overhang} `}</span>{end.overhang !== "blunt" && <code>{end.bases}</code>}</>);

/**
 * A digest and its gel, at the gel station.
 *
 * @param options - `start` says what to open on, for a tour or a link; `instrument` is the gel station it is run at, if the lab has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useDigestBench } from "@biolibs/bionet-tools";
 *
 * // `InstrumentStage` is the scene package's: it is handed what this gives and draws it.
 * const bench = useDigestBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useDigestBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to open on: the view, the tube and enzymes already chosen, the pieces to keep. Read once. */
  start?: { view?: DigestView; tube?: string; enzymes?: readonly string[]; keep?: readonly number[]; ran?: number };
} = {}): { stage: DigestStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<DigestView>(start?.view ?? "machine");
  const [tube, setTube] = useState(start?.tube ?? "");
  const [chosen, setChosen] = useState<string[]>([...(start?.enzymes ?? [])]);
  const [other, setOther] = useState("");
  const [unknown, setUnknown] = useState<string | null>(null);
  const [used, setUsed] = useState("1");
  const [gel, setGel] = useState("1.0");
  const [ladder, setLadder] = useState("1kb");
  const [volts, setVolts] = useState("100");
  const [minutes, setMinutes] = useState("45");
  const [ran, setRan] = useState(start?.ran ?? 100);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [keep, setKeep] = useState<number[]>([...(start?.keep ?? [])]);
  const [amount, setAmount] = useState("20");

  const tubes = useMemo(() => (lab === null || lab === undefined ? [] : digestTubes(lab)), [lab]);
  const part = tubes.find((one) => one.item === tube)?.part;
  const offered = useMemo(() => (part === undefined ? [] : cutters(part)), [part]);
  const run = useMemo(() => (lab === null || lab === undefined ? null : digestRun(lab, {
    tube, enzymes: chosen, gel, ladder, instrument: instrument?.id ?? null, note, ...(whole(used) === undefined ? {} : { used: whole(used)! }),
    ...(whole(volts) === undefined ? {} : { volts: whole(volts)! }), ...(whole(minutes) === undefined ? {} : { minutes: whole(minutes)! }),
    keep: keep.map((from) => ({ from, ...(whole(amount) === undefined ? {} : { amount: whole(amount)! }) })),
  })), [lab, tube, chosen, gel, ladder, instrument, note, used, volts, minutes, keep, amount]);
  const plan = run?.plan ?? null;
  const good = plan !== null && plan.problem === null ? plan : null;
  const sites = useMemo(() => (part === undefined || plan === null ? [] : plan.cutters.flatMap((one) => cutSites(part, one)).sort((a, b) => a.at - b.at)), [part, plan]);
  const pieces = useMemo(() => (part === undefined ? [] : digestPieces(part, sites)), [part, sites]);
  // A piece is known by where it starts, so a change of enzymes lets go of pieces that are no longer there.
  const kept = pieces.filter((piece) => keep.includes(piece.from));
  const gelType = useMemo(() => { try { return gelById(gel); } catch { return gelById("1.0"); } }, [gel]);
  const checks = part === undefined || good === null ? [] : digestChecks(part, good, gelType);

  const stage: DigestStage = {
    model: "gel-station", name: instrument?.name ?? "Gel station", view, onView: setView,
    screen: [{ text: `${whole(volts) ?? "—"} V`, lit: true }, { text: `${whole(minutes) ?? "—"}:00 min` }],
    ...(part === undefined ? {} : { well: { row: 0, column: 1 } }),
    ...(part === undefined || view !== "tube" ? {} : { molecule: (() => {
      const drawn = moleculeOf(part);
      // A piece being kept is drawn on the molecule, so what is taken can be seen against what is left.
      const taken = kept.flatMap((piece) => (piece.to > piece.from ? [[piece.from, piece.to]] : [[piece.from, part.length], [0, piece.to]]).filter(([start, end]) => end! > start!)
        .map(([start, end]) => ({ start: start!, end: end!, strand: 0 as const, tone: "found" as const, label: `kept · ${count(piece.length)} bp` })));
      return { ...drawn, features: [...taken, ...drawn.features], marks: sites.map((one) => ({ at: one.at, label: one.enzyme })) };
    })() }),
    ...(good === null ? {} : { gel: { ran: ran / 100, lanes: [
      { name: "ladder", tone: "dim" as const, bands: good.ladder.map((band) => ({ position: band.position, intensity: 0.6, label: count(band.size) })) },
      { name: part?.name ?? "digest", tone: "held" as const, bands: good.bands.map((band) => ({ position: band.position, intensity: band.intensity,
          label: `${band.sizes.map(count).join(" + ")}${kept.some((piece) => band.sizes.includes(piece.length)) ? " · kept" : ""}` })) },
    ] } }),
  };

  const toggle = (name: string): void => { setChosen(chosen.includes(name) ? chosen.filter((one) => one !== name) : [...chosen, name]); setSaid(null); setKeep([]); };
  const record = async (what: Record<string, unknown> | null, done: string): Promise<void> => {
    if (what === null) return;
    setBusy(true);
    const answer = await act("recordRun", what);
    setBusy(false);
    if (answer.ok) { setSaid(done); setNote(""); setKeep([]); }
  };
  const here = lab === null || lab === undefined ? [] : lab.runs.filter((one) => one.kind === "digest" && (instrument === null || one.instrument === instrument.id)).slice(-5).reverse();
  const partName = (item: string | undefined): string => lab?.parts.find((one) => one.checksum === lab.items.find((each) => each.item === item)?.part)?.name ?? "a tube";
  const checked = checks.length === 0 ? <p className="small good">Nothing about this digest looks wrong for this gel.</p>
    : <ul className="checks">{checks.map((check) => <li key={check.says} className={check.weight}>{check.says} <code className="because">{check.because}</code></li>)}</ul>;

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet benchpanel">
      <section className="card">
        <div className="toolhead">
          <h2>Digest and gel</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {tubes.length === 0 ? <p className="empty">There are no tubes to digest. Add a part and a tube of it on the Freezer tab.</p> : (
          <fieldset disabled={busy} className="stack">
            <label>Tube
              <select value={tube} onChange={(event) => { setTube(event.target.value); setChosen([]); setSaid(null); setKeep([]); }} aria-label="Tube">
                <option value="">Choose a tube…</option>
                {tubes.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
              </select>
            </label>
            {part !== undefined && (
              <>
                <p className="label">Enzymes{offered.length === 0 ? " · none of the usual ones cut this" : ""}</p>
                <div className="enzymes">
                  {offered.map((one) => (
                    <label key={one.name} className="check" title={`${one.site} · cuts ${one.positions.length === 1 ? "once" : `${one.positions.length} times`}`}>
                      <input type="checkbox" checked={chosen.includes(one.name)} onChange={() => toggle(one.name)} /> {one.name} <span className="dim small">×{one.positions.length}</span>
                    </label>
                  ))}
                  {chosen.filter((name) => !offered.some((one) => one.name === name)).map((name) => (
                    <label key={name} className="check"><input type="checkbox" checked onChange={() => toggle(name)} /> {name}</label>
                  ))}
                </div>
                <form className="row tight" onSubmit={(event) => {
                  event.preventDefault();
                  const name = enzymeNamed(other);
                  setUnknown(name === null && other.trim() !== "" ? other.trim() : null);
                  if (name !== null && !chosen.includes(name)) setChosen([...chosen, name]);
                  if (name !== null) setOther("");
                }}>
                  <input value={other} onChange={(event) => setOther(event.target.value)} placeholder="Another enzyme, by name" aria-label="Another enzyme" maxLength={40} spellCheck={false} />
                  <button type="submit" className="quiet">Add</button>
                </form>
                {unknown !== null && <p className="trouble small" role="status">There is no enzyme called {unknown} here.</p>}
              </>
            )}
          </fieldset>
        )}
        {plan !== null && chosen.length > 0 && plan.problem !== null && <p className="trouble" role="status">{plan.problem}</p>}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the gel box</h2>
          <p className="small"><Glossed text="A restriction enzyme cuts DNA wherever its site occurs, and gel electrophoresis sorts the pieces by size. A check digest cuts a plasmid with enzymes whose sites are known, to see that the pieces come out the lengths they should." /></p>
          <p className="dim small">A gel box and its power supply show volts, current and time. They show nothing of the DNA. The first three views are what is there to see; the last two are what you picture, and then read off the gel.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The gel</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label>Gel<select value={gel} onChange={(event) => setGel(event.target.value)}>{GELS.map((one) => <option key={one.id} value={one.id}>{one.percent}% agarose</option>)}</select></label>
            <label>Ladder<select value={ladder} onChange={(event) => setLadder(event.target.value)}>{LADDERS.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}</select></label>
          </fieldset>
          <p className="small"><Glossed text="A slab of agarose in buffer, with a row of wells at one end. The wells go at the negative end, since DNA runs towards the positive one." /></p>
          <p className="voice">This run</p>
          <p className="small">{part === undefined ? "Nothing is loaded yet. Choose a tube above." : `The ladder is in the first lane and ${part.name} in the second.`} This gel separates pieces from {count(gelType.largest)} down to {count(gelType.smallest)} bp.</p>
          {good !== null && <><p className="voice">Checks</p>{checked}</>}
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The power supply</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label>Run at<input type="number" min={10} max={300} step={5} value={volts} onChange={(event) => setVolts(event.target.value)} /> V</label>
            <label>for<input type="number" min={1} max={600} step={5} value={minutes} onChange={(event) => setMinutes(event.target.value)} /> min</label>
          </fieldset>
          <p className="voice">What is going on</p>
          <p className="small">DNA carries a negative charge all along its backbone, so in a field every piece is pulled towards the positive electrode. The agarose holds long pieces back more than short ones, and that is what sorts them.</p>
          <p className="dim small">Nothing here works out how far a given voltage and time move the bands: that depends on the box, the buffer and the gel. What is set is kept with the run, and the gel is drawn as run until the smallest pieces it separates near the far end.</p>
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the tube</h2>
          {part === undefined || good === null ? <p className="dim small">{part === undefined ? "Choose a tube and its enzymes to see where it is cut." : "Choose enzymes that cut this to see the pieces."}</p> : (
            <>
              <SequenceMap name={part.name} length={part.length} circular={part.circular} features={part.features} marks={sites.map((one) => ({ at: one.at, label: one.enzyme }))} />
              <p className="voice">This run</p>
              <p><strong>{pieces.length} {pieces.length === 1 ? "piece" : "pieces"}</strong> <span className="dim">from {sites.length} {sites.length === 1 ? "cut" : "cuts"}</span></p>
              <table className="pieces">
                <thead><tr><th>Keep</th><th>Length</th><th>From</th><th>One end</th><th>Other end</th><th>Carries</th></tr></thead>
                <tbody>
                  {pieces.map((piece) => (
                    <tr key={`${piece.from} ${piece.to}`}>
                      <td><input type="checkbox" checked={keep.includes(piece.from)} aria-label={`Keep the ${count(piece.length)} bp piece`}
                                 onChange={() => setKeep(keep.includes(piece.from) ? keep.filter((one) => one !== piece.from) : [...keep, piece.from])} /></td>
                      <td><strong>{count(piece.length)}</strong></td>
                      <td><code>{count(piece.from + 1)}..{count(piece.to)}</code></td>
                      <td>{endWords(piece.left)}</td>
                      <td>{endWords(piece.right)}</td>
                      <td className="dim">{piece.features.map((one) => one.label).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small"><Glossed text="An end with unpaired bases is a sticky end, and will only join to an end whose unpaired bases pair with it. A blunt end has none." /></p>
              <p className="dim small">Tick a piece to keep it. Cutting its band out of the gel and cleaning it up gives a tube of that piece, with these ends, once the gel has matched.</p>
              <p className="voice">The working</p>
              {sites.map((site) => <ShowWorking key={`${site.enzyme} ${site.at}`} working={siteWorking(site)}><CutBases site={site} /></ShowWorking>)}
              <ShowWorking working={piecesWorking(part, sites, good)} />
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>The gel, run</h2>
          {part === undefined || good === null ? <p className="dim small">Choose a tube and enzymes that cut it to see the gel it should give.</p> : (
            <>
              <p className="voice">This run</p>
              <Gel ladder={good.ladder} bands={good.bands} name={part.name} />
              <label className="small">How far it has run
                <input type="range" min={0} max={100} step={1} value={ran} onChange={(event) => setRan(Number(event.target.value))} aria-label="How far the gel has run" />
              </label>
              <p className="dim small">Drag it back to see the pieces start together in the well and draw apart as they run. The scene follows.</p>
              {good.bands.some((band) => band.unresolved) && <p className="dim small">* outside what this gel separates.</p>}
              <p className="voice">Checks</p>
              {checked}
              <p className="voice">The working</p>
              {[...new Set(good.fragments)].map((size) => <ShowWorking key={size} working={migrationWorking(size, gelType)} />)}
              <fieldset disabled={busy} className="stack">
                <label>Used, from the tube<input type="number" min={0} step={1} value={used} onChange={(event) => setUsed(event.target.value)} aria-label="Amount used" /></label>
                <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering about this gel" maxLength={2000} /></label>
                {kept.length > 0 && (
                  <>
                    <p className="small">Keeping {kept.map((piece) => `${count(piece.length)} bp`).join(" and ")}: {kept.length === 1 ? "a new tube" : `${kept.length} new tubes`}, each a part with the ends the enzymes left.</p>
                    <label>Amount of each, in µL<input type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Amount of each kept piece" /></label>
                  </>
                )}
                <div className="row">
                  <button type="button" onClick={() => void record(run?.matched ?? null, kept.length === 0 ? "Recorded: the gel showed what was expected." : `Recorded: the gel matched, and ${kept.length === 1 ? "the piece is" : `${kept.length} pieces are`} in the freezer.`)}>
                    {kept.length === 0 ? "The gel matched" : `The gel matched · keep ${kept.length === 1 ? "the piece" : `${kept.length} pieces`}`}
                  </button>
                  <button type="button" className="quiet" onClick={() => void record(run?.differed ?? null, "Recorded: the gel did not show what was expected.")}>The gel did not match</button>
                </div>
              </fieldset>
              {said !== null && <p className="small" role="status">{said}</p>}
            </>
          )}
        </section>
      )}

      {here.length > 0 && view === "result" && (
        <section className="card">
          <h2>Recent digests{instrument === null ? "" : " here"}</h2>
          <table>
            <thead><tr><th>Tube</th><th>Enzymes</th><th>Expected</th><th>Gel</th></tr></thead>
            <tbody>
              {here.map((one) => (
                <tr key={one.run}>
                  <td>{partName(one.inputs[0]?.item)}</td>
                  <td>{String(one.settings["enzymes"] ?? "").replace(/\+/g, " + ")}</td>
                  <td className="dim">{String(one.settings["expected"] ?? "")}</td>
                  <td>{one.outcome === "worked" ? "matched" : <span className="badge">did not match</span>}</td>
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
