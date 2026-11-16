"use client";

/**
 * A ligation at the heat block: what is shown beside it, and what the scene is told to draw.
 *
 * A heat block shows one number, the temperature, and nothing else. Everything that matters is in
 * the tube and invisible: which ends found each other, which way round a piece went in, and whether
 * anything closed into a circle. So the machine's views are short and the pictured ones carry it.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { amountOf } from "@biolibs/bionet-panels";
import { Glossed } from "@biolibs/glossary-react";
import { endBases, type LigationPiece, type LigationProduct } from "./ligate.js";
import { joinWorking, ligationChecks, ligationLengthWorking, ratioWorking } from "./ligate-working.js";
import { SequenceMap } from "./map.js";
import { Proposed, withPlan, type Plan } from "./plans.js";
import { ligationRun, ligationTubes } from "./run.js";
import { useRunning } from "./running.js";
import { moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { JoinBases, ShowWorking } from "./working.js";

/** The views of the heat block, by the names every instrument's stage uses. */
export type LigationView = "machine" | "block" | "screen" | "tube" | "result";

/** How each piece is coloured, in the theme's terms. The first is the one being cloned into. */
const TONES = ["yours", "theirs", "held", "good", "found"] as const;

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface LigationStage {
  model: "heat-block";
  name: string;
  view: LigationView;
  onView: (view: LigationView) => void;
  /** What the block's display says. */
  screen: { text: string; lit?: boolean }[];
  /** The well the tube is in. */
  well?: { row: number; column: number };
  /** The pieces being joined, for the view into the tube. */
  joining?: { pieces: { name: string; length: number; flipped: boolean; tone: (typeof TONES)[number] }[]; joins: { label: string }[]; circular: boolean; joined: number };
  /** What it makes, for the last view. */
  molecule?: DrawnMolecule & { marks: { at: number; label: string }[] };
}

const count = (value: number): string => value.toLocaleString("en-US");
const whole = (text: string): number | undefined => (/^\d+$/.test(text.trim()) ? Number(text) : undefined);

/** How a product is said in one line. */
const productWords = (product: LigationProduct): string =>
  `${count(product.length)} bp ${product.circular ? "circle" : "line"} · ${product.pieces.map((piece) => `${piece.name}${piece.flipped ? " ↺" : ""}`).join(" + ")}`;

/**
 * A ligation, at the heat block it is left in.
 *
 * @param options - `start` says what to open on, for a tour or a link; `instrument` is the block it is set up at, if the lab has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useLigationBench } from "@biolibs/bionet-tools";
 *
 * // `InstrumentStage` is the scene package's: it is handed what this gives and draws it.
 * const bench = useLigationBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useLigationBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, the pieces in the tube, and how far along to be. Followed whenever it changes. */
  start?: { view?: LigationView; tubes?: readonly string[]; joined?: number };
} = {}): { stage: LigationStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<LigationView>(start?.view ?? "machine");
  const [tubes, setTubes] = useState<string[]>([...(start?.tubes ?? [])]);
  const [blunt, setBlunt] = useState(false);
  const [linear, setLinear] = useState(false);
  const [chosen, setChosen] = useState(0);
  const [celsius, setCelsius] = useState("16");
  const [hours, setHours] = useState("16");
  const [ratio, setRatio] = useState("3");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("20");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  // A host driving the bench — a tour, or a link — says what to show by changing `start`. Following
  // it rather than being mounted afresh is what lets the scene stay put and the camera travel.
  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.tubes !== undefined) setTubes([...start.tubes]);
  }, [asked]);

  const offered = useMemo(() => (lab === null || lab === undefined ? [] : ligationTubes(lab)), [lab]);
  // Arriving at the tube finds the pieces closing, which is the whole of what is happening in it.
  const [joined, setJoined, closing] = useRunning(view === "tube" && tubes.length > 0, start?.joined ?? 0);
  const run = useMemo(() => (lab === null || lab === undefined ? null : ligationRun(lab, {
    tubes, blunt, linear, chosen, instrument: instrument?.id ?? null, name, note, ...(whole(amount) === undefined ? {} : { amount: whole(amount)! }),
  })), [lab, tubes, blunt, linear, chosen, instrument, name, note, amount]);
  const plan = run?.plan ?? null;
  const product = run?.product ?? null;
  const pieces: LigationPiece[] = run?.pieces ?? [];
  // A piece made by a PCR has no phosphate at its ends, which the log already knows from the run that made it.
  const fromPcr = useMemo(() => pieces.filter((piece) => {
    const made = lab?.items.find((one) => one.item === piece.id)?.from;
    return made !== undefined && lab?.runs.find((one) => one.run === made)?.kind === "pcr";
  }).map((piece) => piece.id), [pieces, lab]);
  const checks = plan === null ? [] : ligationChecks(pieces, plan, { fromPcr });
  const toneOf = (id: string): (typeof TONES)[number] => TONES[Math.max(0, pieces.findIndex((piece) => piece.id === id)) % TONES.length]!;

  const stage: LigationStage = {
    model: "heat-block", name: instrument?.name ?? "Heat block", view, onView: setView,
    screen: [{ text: `${whole(celsius) ?? "—"} °C`, lit: true }, { text: `${whole(hours) ?? "—"} h` }],
    ...(pieces.length === 0 ? {} : { well: { row: 0, column: 1 } }),
    ...(product === null || view !== "tube" ? {} : { joining: {
      circular: product.circular, joined: joined / 100,
      pieces: product.pieces.map((piece) => ({ name: piece.name, length: piece.length, flipped: piece.flipped, tone: toneOf(piece.id) })),
      joins: product.joins.map((join) => ({ label: join.kind === "blunt" ? "blunt" : join.bases })),
    } }),
    ...(product === null || view !== "result" ? {} : { molecule: {
      ...moleculeOf({ name: run?.name ?? "product", length: product.length, circular: product.circular, features: product.features }),
      marks: product.joins.map((join) => ({ at: join.at, label: join.kind === "blunt" ? "blunt" : join.bases })),
    } }),
  };

  /** Set the bench up as a plan says: the pieces it names, in the tube. */
  const setUp = (plan: Plan): void => {
    setTubes(plan.inputs.flatMap((one) => (one.item === undefined ? [] : [one.item])));
    setChosen(0); setSaid(null); setView("result");
  };
  const pick = (item: string): void => {
    setTubes(tubes.includes(item) ? tubes.filter((one) => one !== item) : [...tubes, item]);
    setChosen(0);
    setSaid(null);
  };
  const record = async (what: Record<string, unknown> | null, done: string): Promise<void> => {
    if (what === null) return;
    setBusy(true);
    const answer = await act("recordRun", withPlan(lab, what));
    setBusy(false);
    if (answer.ok) { setSaid(done); setNote(""); setName(""); setTubes([]); }
  };

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet benchpanel">
      <section className="card">
        <div className="toolhead">
          <h2>Ligation</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {offered.length === 0 ? <p className="empty">There are no cut pieces to join. Cut something at the gel station and keep a piece, or add a linear part on the Freezer tab.</p> : (
          <fieldset disabled={busy} className="stack">
            <p className="label">Pieces in the tube</p>
            <div className="enzymes">
              {offered.map((one) => {
                const ends = endBases({ id: one.item, name: one.part.name, sequence: one.part.sequence, ends: one.part.ends ?? { left: 0, right: 0 } });
                return (
                  <label key={one.item} className="check" title={one.label}>
                    <input type="checkbox" checked={tubes.includes(one.item)} onChange={() => pick(one.item)} /> {one.part.name}
                    <span className="dim small"> {count(one.part.length)} bp · {ends.left.kind === "blunt" ? "blunt" : ends.left.bases} … {ends.right.kind === "blunt" ? "blunt" : ends.right.bases}</span>
                  </label>
                );
              })}
            </div>
            <div className="row tight">
              <label className="check small"><input type="checkbox" checked={blunt} onChange={(event) => { setBlunt(event.target.checked); setChosen(0); }} /> Let blunt ends join</label>
              <label className="check small"><input type="checkbox" checked={linear} onChange={(event) => { setLinear(event.target.checked); setChosen(0); }} /> Show what does not close</label>
            </div>
          </fieldset>
        )}
        {plan !== null && plan.problem !== null && tubes.length > 0 && <p className="trouble" role="status">{plan.problem}</p>}
        {plan !== null && plan.products.length > 1 && (
          <label>What is being made
            <select value={chosen} onChange={(event) => setChosen(Number(event.target.value))} aria-label="What is being made">
              {plan.products.map((one, at) => <option key={at} value={at}>{productWords(one)}</option>)}
            </select>
          </label>
        )}
      </section>

      <Proposed kind="ligation" now={run?.worked ?? null} onSetUp={setUp} />

      {view === "machine" && (
        <section className="card">
          <h2>At the block</h2>
          <p className="small"><Glossed text="Ligase joins the backbone of two pieces of DNA whose ends are held together, which is how cut pieces are made into one molecule again." /></p>
          <p className="dim small">A heat block holds the tube at one temperature and shows that temperature. It shows nothing else: whether anything joined is found out days later, by what grows. The last two views are what you are picturing while it sits there.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The wells</h2>
          <p className="voice">The machine</p>
          <p className="small">A metal block with holes for tubes, held at the temperature below. The tube is in the second hole.</p>
          <p className="voice">This run</p>
          {pieces.length === 0 ? <p className="dim small">Nothing is in the tube yet. Choose the pieces above.</p> : (
            <ul className="plainlist small">
              {pieces.map((piece) => {
                const held = lab.items.find((one) => one.item === piece.id);
                return <li key={piece.id}>{piece.name} · {count(piece.sequence.length)} bp{held === undefined ? "" : ` · ${amountOf(held)} in the tube it came from`}</li>;
              })}
              <li className="dim">and ligase, with the buffer that carries the ATP it needs</li>
            </ul>
          )}
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The temperature</h2>
          <p className="voice">The machine</p>
          <fieldset disabled={busy} className="programme">
            <label>Hold at<input type="number" min={0} max={40} step={1} value={celsius} onChange={(event) => setCelsius(event.target.value)} /> °C</label>
            <label>for<input type="number" min={1} max={72} step={1} value={hours} onChange={(event) => setHours(event.target.value)} /> h</label>
          </fieldset>
          <p className="voice">What is going on</p>
          <p className="small">Two things are wanted at once and they want opposite temperatures. The ends have to stay stuck together long enough to be sealed, which is warmer the longer the overhang and colder the shorter it is; and ligase works faster the warmer it is. Sixteen degrees overnight is the usual answer to that, and an hour at room temperature often does for a sticky join.</p>
          <p className="dim small">Nothing here works out what a given temperature and time will give. What is set is kept with the run.</p>
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the tube</h2>
          {product === null ? <p className="dim small">{tubes.length === 0 ? "Choose the pieces to join." : "These pieces do not join into anything."}</p> : (
            <>
              <p className="voice">This run</p>
              <p><strong>{product.pieces.length} {product.pieces.length === 1 ? "piece" : "pieces"}</strong> <span className="dim">{product.circular ? "closing into a circle" : "end to end"}</span></p>
              <label className="small">How far along{closing ? " · closing" : ""}
                <input type="range" min={0} max={100} step={1} value={Math.round(joined)} onChange={(event) => setJoined(Number(event.target.value))} aria-label="How far along the joining is" />
              </label>
              <p className="dim small">Drag it back to see the pieces apart, and forward to close them. Nothing in the tube can be seen while this is going on; this is the picture of it.</p>
              <p className="small"><Glossed text="A sticky end holds to the end whose unpaired bases pair with it, and ligase seals the backbone on each strand. A blunt end has nothing to hold to, so the two ends must meet by chance." /></p>
              <p className="voice">The working</p>
              {product.joins.map((join) => {
                const from = pieces.find((piece) => piece.id === join.from)!;
                const to = pieces.find((piece) => piece.id === join.to)!;
                const placedFrom = product.pieces.find((piece) => piece.id === join.from)!;
                const placedTo = product.pieces.find((piece) => piece.id === join.to)!;
                const out = placedFrom.flipped ? endBases(from).left : endBases(from).right;
                const into = placedTo.flipped ? endBases(to).right : endBases(to).left;
                const working = joinWorking({ name: placedFrom.name, end: out }, { name: placedTo.name, end: into });
                return <ShowWorking key={`${join.from} ${join.to} ${join.at}`} working={working}><JoinBases bases={working.bases} /></ShowWorking>;
              })}
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What it makes</h2>
          {product === null ? <p className="dim small">Choose pieces that join into something.</p> : (
            <>
              <p className="voice">This run</p>
              <p><strong>{count(product.length)} bp</strong> <span className="dim">{product.circular ? "circular" : "linear"}</span></p>
              <SequenceMap name={run?.name ?? "product"} length={product.length} circular={product.circular} features={product.features}
                           marks={product.joins.map((join) => ({ at: join.at, label: join.kind === "blunt" ? "blunt" : join.bases }))} />
              <p className="dim small">{product.features.length === 0 ? "Nothing was marked on the pieces, so nothing is marked on this." : "What was marked on each piece is marked where that piece now is."}</p>
              <p className="voice">Checks</p>
              {checks.length === 0 ? <p className="small good">Nothing about this ligation looks wrong.</p>
                : <ul className="checks">{checks.map((check) => <li key={check.says} className={check.weight}>{check.says} <code className="because">{check.because}</code></li>)}</ul>}
              <p className="voice">The working</p>
              <ShowWorking working={ligationLengthWorking(product, pieces)} />
              {product.pieces.length > 1 && (() => {
                const longest = [...product.pieces].sort((a, b) => b.length - a.length)[0]!;
                const other = product.pieces.find((piece) => piece.id !== longest.id)!;
                return <ShowWorking working={ratioWorking({ name: longest.name, length: longest.length }, { name: other.name, length: other.length }, { ratio: whole(ratio) ?? 3 })}>
                  <label className="small">Molecules of insert to each of vector<input type="number" min={1} max={20} step={1} value={ratio} onChange={(event) => setRatio(event.target.value)} aria-label="Molar ratio" /></label>
                </ShowWorking>;
              })()}
              <fieldset disabled={busy} className="stack">
                <label>Call it<input value={name} onChange={(event) => setName(event.target.value)} placeholder={run?.name ?? ""} maxLength={200} /></label>
                <label>Amount, in µL<input type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering" maxLength={2000} /></label>
                <div className="row">
                  <button type="button" onClick={() => void record(run?.worked ?? null, "Recorded: the ligation is in the freezer.")}>It worked</button>
                  <button type="button" className="quiet" onClick={() => void record(run?.failed ?? null, "Recorded: it gave nothing.")}>It gave nothing</button>
                </div>
              </fieldset>
              {said !== null && <p className="small" role="status">{said}</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * A ligation on its own, for a lab that has not drawn its room.
 *
 * It is the same thing without the scene, so it carries its own way of moving between the views.
 *
 * @param props - `instrument` is the block it is set up at, if the lab has one; `onDone` adds a way to leave.
 */
export function LigationTool({ instrument = null, onDone }: { instrument?: { id: string; name: string } | null; onDone?: () => void }) {
  const bench = useLigationBench({ instrument, ...(onDone === undefined ? {} : { onDone }) });
  const names: [LigationView, string][] = [["machine", "The heat block"], ["block", "The wells"], ["screen", "The temperature"], ["tube", "In the tube"], ["result", "What it makes"]];
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
