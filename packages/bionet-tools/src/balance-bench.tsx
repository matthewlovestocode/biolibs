"use client";

/**
 * Weighing something out at the balance.
 *
 * Nearly every protocol on this bench starts here, and the balance is the machine that is wrong
 * most often — because what it is asked for is never a mass. It is asked for a concentration in a
 * volume, and the mass is arithmetic somebody does between the bottle and the pan.
 *
 * The two things it cannot tell you are the two things this is built round.
 *
 * It cannot tell you whether the mass belongs to the bottle in your hand. Most salts on a shelf
 * are hydrates and the water is part of the mass, so a stock made from the heptahydrate using the
 * dry salt's weight is half strength, and nothing about the weighing goes wrong to say so.
 *
 * And it cannot tell you whether it is the right balance for the mass. Two decimal places is an
 * excellent balance and a terrible way to weigh twenty milligrams: the last digit is ten of them.
 * The mass and the readability together decide whether a weighing means anything, and only one of
 * the two is on the display.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { BALANCES, BY_PERCENT, REAGENTS, balanceFor, byDryMass, fromStock, leastWeighable,
         massFor, percentMass, waterIn, weighing, type Balance, type Reagent } from "./balance.js";
import { ShowWorking } from "./working.js";
import type { Working } from "./pcr-working.js";

/** The views of the balance, by the names every instrument's stage uses. */
export type BalanceView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface BalanceStage {
  model: "balance";
  name: string;
  view: BalanceView;
  onView: (view: BalanceView) => void;
  screen: { text: string; lit?: boolean }[];
  /** The mass against what this balance can say anything about. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
}

const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/** A mass written the way a balance shows it, with enough places to be worth reading. */
export const shown = (grams: number, balance: Balance): string => {
  const places = Math.max(0, Math.round(-Math.log10(balance.readability)));
  return `${grams.toFixed(places)} g`;
};

/** A number with no trailing noughts: 5.000 is 5, and 14.610 is 14.61. */
const plain = (value: number, places: number): string =>
  value.toFixed(places).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

/**
 * The same mass said the way somebody would say it.
 *
 * In grams down to a gram, in milligrams below that, and with no trailing noughts either way —
 * a balance reads to 0.01 g and nobody calls that ten point nought nought milligrams.
 */
export const said = (grams: number): string =>
  grams >= 1 ? `${plain(grams, grams >= 100 ? 1 : 3)} g`
    : grams >= 0.001 ? `${plain(grams * 1000, 1)} mg`
      : `${plain(grams * 1e6, 0)} µg`;

/**
 * How a concentration in a volume became a mass, which is the arithmetic the balance hides.
 *
 * @param reagent - What is being weighed, as the bottle has it.
 * @param molar - The concentration wanted, in moles a litre.
 * @param millilitres - How much of it.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { REAGENTS, massWorking } from "@biolibs/bionet-tools";
 *
 * massWorking(REAGENTS[0]!, 0.5, 1000).comes;    // "29.220 g"
 * ```
 */
export function massWorking(reagent: Reagent, molar: number, millilitres: number): Working {
  const litres = millilitres / 1000;
  const grams = massFor(molar, litres, reagent.mass);
  const dry = byDryMass(reagent);
  return {
    of: `What to weigh of ${reagent.name.toLowerCase()}`, comes: said(grams), kind: "exact",
    steps: [
      `${molar} mol in a litre, and ${millilitres} mL is ${litres} L, so ${molar} × ${litres} = ${(molar * litres).toPrecision(3)} mol.`,
      `A mole of ${reagent.formula} weighs ${reagent.mass} g.`,
      `${(molar * litres).toPrecision(3)} × ${reagent.mass} = ${said(grams)}.`,
      ...(dry === null ? [] : [
        `That is the bottle's mass, water and all. The dry salt is ${reagent.dry} g/mol, so weighing ${said(massFor(molar, litres, reagent.dry!))} instead would make this ${Math.round(dry * 100)}% of what the label says.`,
      ]),
    ],
  };
}

/**
 * Whether this balance can mean anything about a mass, and what to do when it cannot.
 *
 * @param balance - The balance.
 * @param grams - The mass.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { BALANCES, enoughWorking } from "@biolibs/bionet-tools";
 *
 * enoughWorking(BALANCES[0]!, 0.02).kind;    // "about"
 * ```
 */
export function enoughWorking(balance: Balance, grams: number): Working {
  const how = weighing(balance, grams);
  const least = leastWeighable(balance);
  return {
    of: "How much of this reading is the balance", comes: `${(how.error * 100).toPrecision(2)}%`, kind: "estimate",
    steps: [
      `The last digit of ${balance.name.toLowerCase()} is ${said(balance.readability)}, so a reading can be out by half of that, ${said(balance.readability / 2)}.`,
      `Against ${said(grams)}, that is ${(how.error * 100).toPrecision(2)}% of what you are weighing.`,
      `Holding that under a tenth of a per cent means not weighing less than ${said(least)} on this balance.`,
      ...(how.enough ? [`${said(grams)} is over that, so the reading means what it says.`]
        : [`${said(grams)} is under it. The answer is not a finer balance: it is to weigh a stock large and take a little of it.`]),
    ],
  };
}

/**
 * Weighing something out, at the balance it is weighed on.
 *
 * @param options - `start` says what to open on; `instrument` is the balance the lab has placed,
 *   if it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useBalanceBench } from "@biolibs/bionet-tools";
 *
 * const bench = useBalanceBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useBalanceBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, what is being weighed, and how much of it. */
  start?: { view?: BalanceView; reagent?: string; molar?: number; millilitres?: number };
} = {}): { stage: BalanceStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<BalanceView>(start?.view ?? "machine");
  const [how, setHow] = useState<"molar" | "percent">("molar");
  const [reagentName, setReagentName] = useState(start?.reagent ?? REAGENTS[0]!.name);
  const [molar, setMolar] = useState(start?.molar === undefined ? "" : `${start.molar}`);
  const [millilitres, setMillilitres] = useState(start?.millilitres === undefined ? "" : `${start.millilitres}`);
  const [percentName, setPercentName] = useState(BY_PERCENT[0]!.name);
  const [percent, setPercent] = useState("");
  const [into, setInto] = useState("");
  const [stock, setStock] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.reagent !== undefined) setReagentName(start.reagent);
    if (start.molar !== undefined) setMolar(`${start.molar}`);
    if (start.millilitres !== undefined) setMillilitres(`${start.millilitres}`);
  }, [start?.view, start?.reagent, start?.molar, start?.millilitres]);

  const reagent = REAGENTS.find((one) => one.name === reagentName) ?? REAGENTS[0]!;
  const byPercent = BY_PERCENT.find((one) => one.name === percentName) ?? BY_PERCENT[0]!;
  const theMolar = number(molar) ?? 0.5;
  const theVolume = number(millilitres) ?? 500;
  const thePercent = number(percent) ?? byPercent.percent;
  const theInto = number(into) ?? 100;

  const grams = how === "molar" ? massFor(theMolar, theVolume / 1000, reagent.mass) : percentMass(thePercent, theInto);
  const what = how === "molar" ? reagent.name : byPercent.name;
  const best = balanceFor(grams);
  const [balanceName, setBalanceName] = useState(BALANCES[0]!.name);
  const balance = BALANCES.find((one) => one.name === balanceName) ?? BALANCES[0]!;
  const said_ = weighing(balance, grams);
  const least = leastWeighable(balance);
  const theStock = number(stock);
  const take = how === "molar" && theStock !== undefined ? fromStock(theMolar * 1000, theVolume, theStock * 1000) : null;
  const dry = byDryMass(reagent);

  const top = Math.max(grams * 2, least * 2.5);
  const stage: BalanceStage = {
    model: "balance", name: instrument?.name ?? "Balance", view, onView: setView,
    screen: [
      { text: shown(said_.reads, balance), lit: true },
      { text: what.length > 22 ? `${what.slice(0, 21)}…` : what },
      ...(said_.enough ? [] : [{ text: "below this balance", lit: true }]),
    ],
    scale: {
      what: `the mass, against what ${balance.name.toLowerCase()} can say anything about`,
      from: 0, to: top, ticks: [0, least, grams, top].filter((one, at, all) => all.indexOf(one) === at).sort((a, b) => a - b),
      at: grams, label: said(grams),
      bands: [
        { from: least, to: top, label: "the reading means what it says", tone: "good" },
        { from: 0, to: least, label: "the last digit is most of the answer", tone: "attention" },
      ],
    },
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", {
      // Weighing uses up what is on the shelf and makes something the lab does not track as a part:
      // a bottle of buffer. What is worth keeping is what was made, from what, and on which balance.
      kind: "weigh", instrument: instrument?.id ?? null, inputs: [], outputs: [],
      outcome: said_.enough ? "worked" : "failed",
      settings: {
        what: what.slice(0, 200),
        ...(how === "molar"
          ? { molar: `${theMolar}`, millilitres: `${theVolume}`, formula: reagent.formula.slice(0, 100), grams_per_mole: `${reagent.mass}` }
          : { percent: `${thePercent}`, millilitres: `${theInto}` }),
        grams: grams.toPrecision(4), balance: balance.name.slice(0, 200),
        reads: shown(said_.reads, balance).slice(0, 40),
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setTold(answer.ok ? "Recorded." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const panel = (
    <div className="pcr balance">
      <section className="card">
        <div className="toolhead">
          <h2>Weigh out{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="stack">
          <label>How it is written
            <select value={how} onChange={(event) => setHow(event.target.value as "molar" | "percent")} aria-label="How it is written">
              <option value="molar">A concentration — so many moles a litre</option>
              <option value="percent">A percentage — grams in a hundred millilitres</option>
            </select>
          </label>
          {how === "molar" ? (
            <>
              <label>What is being weighed
                <select value={reagentName} onChange={(event) => setReagentName(event.target.value)} aria-label="What is being weighed">
                  {REAGENTS.map((one) => <option key={one.name} value={one.name}>{one.name} · {one.mass} g/mol</option>)}
                </select>
              </label>
              <div className="row tight">
                <label>Concentration, in moles a litre
                  <input type="number" min={0} step={0.01} value={molar} onChange={(event) => setMolar(event.target.value)} placeholder="0.5" aria-label="Concentration in moles a litre" />
                </label>
                <label>How much of it, in millilitres
                  <input type="number" min={0} step={10} value={millilitres} onChange={(event) => setMillilitres(event.target.value)} placeholder="500" aria-label="Volume in millilitres" />
                </label>
              </div>
            </>
          ) : (
            <>
              <label>What is being weighed
                <select value={percentName} onChange={(event) => { setPercentName(event.target.value); setPercent(""); }} aria-label="What is being weighed">
                  {BY_PERCENT.map((one) => <option key={one.name} value={one.name}>{one.name} · usually {one.percent}%</option>)}
                </select>
              </label>
              <div className="row tight">
                <label>Per cent, by mass in volume
                  <input type="number" min={0} step={0.1} value={percent} onChange={(event) => setPercent(event.target.value)} placeholder={`${byPercent.percent}`} aria-label="Per cent by mass in volume" />
                </label>
                <label>How much of it, in millilitres
                  <input type="number" min={0} step={10} value={into} onChange={(event) => setInto(event.target.value)} placeholder="100" aria-label="Volume in millilitres" />
                </label>
              </div>
            </>
          )}
        </fieldset>
        <p className="small" role="status">
          <strong>{said(grams)}</strong>
          <span className="dim"> of {what.toLowerCase()}</span>
          {/* The reading is only worth saying where it is not the mass: a balance that cannot show
              the last of it is the thing worth knowing, and saying so when it can reads as noise. */}
          {Math.abs(said_.reads - grams) > balance.readability / 100 &&
            <span className="dim"> · this balance shows {shown(said_.reads, balance)}</span>}
        </p>
        {!said_.enough && <p className="trouble">Too little for this balance to say anything about. The pan says what to do instead.</p>}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the balance</h2>
          <p className="small"><Glossed text="A balance weighs; a protocol asks for a concentration in a volume. The mass between the two is arithmetic nobody writes down." /></p>
          <p className="dim small">Two things it cannot tell you. Whether the mass belongs to the bottle in your hand — most salts on a shelf carry water, and the water is part of the weight. And whether it is the right balance for the mass, because the last digit of the display is a fixed size and the mass is not.</p>
          <p className="voice">Before anything</p>
          <p className="small">Tare with the boat or the vessel on the pan, not before. The balance subtracts what is already there, and the number after that is what you added.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The pan</h2>
          <p className="voice">The balance</p>
          <fieldset disabled={busy} className="stack">
            <label>Which one
              <select value={balanceName} onChange={(event) => setBalanceName(event.target.value)} aria-label="Which balance">
                {BALANCES.map((one) => <option key={one.name} value={one.name}>{one.name}</option>)}
              </select>
            </label>
          </fieldset>
          <p className="small">Reads to {shown(balance.readability, balance)}, holds up to {balance.capacity} g. Under {said(least)} the last digit is most of the answer.</p>
          <p className={said_.enough ? "small good" : "trouble"} role="status">
            {said_.enough
              ? `${said(grams)} on this balance is good to about ${(said_.error * 100).toPrecision(2)}%.`
              : `${said(grams)} is below what this balance can say anything about: the reading would be ${(said_.error * 100).toPrecision(2)}% balance.`}
          </p>
          {!said_.enough && best !== null && best.name !== balance.name && (
            <p className="small">{best.name} would do it, to about {(weighing(best, grams).error * 100).toPrecision(2)}%.</p>
          )}
          {!said_.enough && best === null && how === "molar" && (
            <>
              <p className="voice">Take it from a stock instead</p>
              <p className="small">Weigh a strong stock, where the mass is large enough to mean something, and take a little of it. Nothing on this bench weighs a few milligrams well.</p>
              <fieldset disabled={busy} className="stack">
                <label>The stock you have, or would make<input type="number" min={0} step={0.1} value={stock} onChange={(event) => setStock(event.target.value)} placeholder="1" /></label>
              </fieldset>
              {take !== null && (
                <p className="small good" role="status">
                  {take.stock.toPrecision(3)} mL of {theStock} M made up to {theVolume} mL with {take.diluent.toPrecision(3)} mL — a {take.fold.toPrecision(2)}-fold dilution.
                  {" "}The stock itself is {said(massFor(theStock!, 0.1, reagent.mass))} in 100 mL, which this balance can weigh.
                </p>
              )}
            </>
          )}
          <p className="voice">The working</p>
          <ShowWorking working={enoughWorking(balance, grams)} />
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The reading</h2>
          <p className="voice">The machine</p>
          <p className="small"><strong>{shown(said_.reads, balance)}</strong> <span className="dim">of {what.toLowerCase()}</span></p>
          {how === "molar" && (
            <>
              <p className="voice">The working</p>
              <ShowWorking working={massWorking(reagent, theMolar, theVolume)} />
            </>
          )}
          {how === "percent" && (
            <p className="small">{thePercent}% means {thePercent} g in 100 mL, so {theInto} mL takes {said(grams)}. There is no molecular weight here: {byPercent.name.toLowerCase()} is {byPercent.what}, and a percentage is the only way it is ever written.</p>
          )}
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the weighing boat</h2>
          <p className="voice">The bottle</p>
          <p className="small">{reagent.name} · {reagent.formula} · {reagent.mass} g/mol. {reagent.what[0]!.toUpperCase()}{reagent.what.slice(1)}.</p>
          {dry === null ? (
            <p className="dim small">No water of crystallisation: what the bottle weighs is what the salt weighs, and the mass on the label is the one to use.</p>
          ) : (
            <>
              <p className="voice">Most of this bottle is not the salt</p>
              <p className="small">
                {reagent.formula} is {reagent.mass} g/mol, of which {Math.round(waterIn(reagent)! * 100)}% is water. The dry salt is {reagent.dry} g/mol.
              </p>
              <p className="trouble" role="status">
                Weighing {said(massFor(theMolar, theVolume / 1000, reagent.dry!))} — the dry salt's mass — would make this {Math.round(dry * 100)}% of {theMolar} M, and nothing about the weighing would say so.
              </p>
              <p className="dim small">The balance is right, the salt dissolves, the label gets written, and everything made from it afterwards is quietly out by that much.</p>
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>The solution</h2>
          <p className="voice">What this makes</p>
          <ul className="plainlist small">
            <li>{how === "molar" ? `${theMolar} M ${reagent.name.toLowerCase()}, ${theVolume} mL` : `${thePercent}% ${byPercent.name.toLowerCase()}, ${theInto} mL`}</li>
            <li>{said(grams)} weighed{how === "molar" ? ` as ${reagent.formula}` : ""}</li>
            <li className={said_.enough ? "" : "warn"}>{balance.name} · reads {shown(said_.reads, balance)}{said_.enough ? "" : " · below what it can say"}</li>
            {dry !== null && <li>The hydrate's mass, not the dry salt's.</li>}
          </ul>
          <p className="dim small">Weighing makes nothing the lab tracks as a part: it makes a bottle of something. What is kept here is what was made, from what, and on which balance — so that a solution which turns out wrong can be traced back to the weighing rather than guessed at.</p>
          <fieldset disabled={busy} className="stack">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Which bottle, which shelf, anything worth remembering" maxLength={2000} /></label>
            <div className="row">
              <button type="button" onClick={() => void record()}>Record the weighing</button>
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
 * The balance on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the balance the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function BalanceTool(props: Parameters<typeof useBalanceBench>[0]) {
  const bench = useBalanceBench(props);
  const names: [BalanceView, string][] = [["machine", "The balance"], ["block", "The pan"], ["screen", "The reading"],
                                          ["tube", "In the weighing boat"], ["result", "The solution"]];
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
