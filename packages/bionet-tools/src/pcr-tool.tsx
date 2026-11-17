"use client";

/**
 * Running a PCR from the freezer.
 *
 * It holds only what has been chosen. The tubes come from the lab, what the PCR would make comes
 * from `planPcr`, and recording it is one thing asked of the lab. It is drawn with the panels'
 * styles, so it belongs inside a `LabWindow`.
 */
import { useMemo, useState } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { primerTm } from "./pcr.js";
import { pcrRun, pcrTubes, type TubeChoice } from "./run.js";

const whole = (text: string): number | undefined => (text.trim() === "" ? undefined : Number(text));

function Tube({ label, name, choices, value, onChange, used, onUsed }: {
  label: string; name: string; choices: TubeChoice[]; value: string; onChange: (item: string) => void; used: string; onUsed: (amount: string) => void;
}) {
  const chosen = choices.find((one) => one.item === value);
  const tm = chosen !== undefined && name !== "template" ? primerTm(chosen.part.sequence) : null;
  return (
    <div className="tube">
      <label>{label}
        <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
          <option value="">Choose a tube…</option>
          {choices.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
        </select>
      </label>
      <label className="used">used<input type="number" min={0} step={1} value={used} onChange={(event) => onUsed(event.target.value)} aria-label={`${label}, amount used`} /></label>
      {chosen !== undefined && (
        <p className="dim small">{chosen.part.length} {chosen.part.length === 1 ? "base" : "bases"}{chosen.part.circular ? " · circular" : ""}{tm === null ? "" : ` · about ${Math.round(tm)} °C`}</p>
      )}
    </div>
  );
}

/**
 * Run a PCR in silico from tubes the lab holds, and record it.
 *
 * Choose a template and two primers. If they make one product it is shown, and the run can be
 * recorded: each tube drops by what was used and the product becomes a new tube. A run that gave
 * nothing at the bench can be recorded too, since the tubes were used all the same.
 *
 * @param props - `instrument` is the thermocycler it is run on, if the lab has one; `onDone` adds a
 *   way to leave.
 */
export function PcrTool({ instrument = null, onDone }: { instrument?: { id: string; name: string } | null; onDone?: () => void }) {
  const lab = useLab()?.lab;
  const act = useAct();
  const [template, setTemplate] = useState("");
  const [forward, setForward] = useState("");
  const [reverse, setReverse] = useState("");
  const [used, setUsed] = useState({ template: "1", forward: "1", reverse: "1" });
  const [least, setLeast] = useState("18");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("50");
  const [unit, setUnit] = useState("µL");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const tubes = useMemo(() => (lab === null || lab === undefined ? { templates: [], primers: [] } : pcrTubes(lab)), [lab]);
  const run = useMemo(() => (lab === null || lab === undefined ? null : pcrRun(lab, {
    template, forward, reverse, instrument: instrument?.id ?? null, name, note,
    used: { template: whole(used.template), forward: whole(used.forward), reverse: whole(used.reverse) },
    annealAtLeast: whole(least), amount: whole(amount), unit: unit.trim() === "" ? null : unit.trim(),
  } as Parameters<typeof pcrRun>[1])), [lab, template, forward, reverse, instrument, name, note, used, least, amount, unit]);
  if (lab === null || lab === undefined || run === null) return null;

  const record = async (what: Record<string, unknown> | null, done: string): Promise<void> => {
    if (what === null) return;
    setBusy(true);
    const answer = await act("recordRun", what);
    setBusy(false);
    if (!answer.ok) return;
    setSaid(done);
    setName("");
    setNote("");
  };
  const product = run.plan !== null && run.plan.problem === null ? run.plan.products[0]! : null;
  const here = lab.runs.filter((one) => one.kind === "pcr" && (instrument === null || one.instrument === instrument.id)).slice(-5).reverse();
  const partName = (checksum: string): string => lab.parts.find((part) => part.checksum === checksum)?.name ?? "a part";

  return (
    <div className="pcr">
      <section className="card">
        <div className="toolhead">
          <div>
            <h2>PCR{instrument === null ? "" : ` · ${instrument.name}`}</h2>
            <p className="dim small"><Glossed text="PCR copies the stretch of a template that lies between two primers. Choose tubes from the freezer. The product is worked out from their sequences, and recording the run takes what was used from each." /></p>
          </div>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {tubes.templates.length === 0 ? <p className="empty">There are no tubes to run a PCR from. Add a part and a tube of it on the Freezer tab.</p> : (
          <fieldset disabled={busy} className="choose">
            <Tube label="Template" name="template" choices={tubes.templates} value={template} onChange={(item) => { setTemplate(item); setSaid(null); }}
                  used={used.template} onUsed={(value) => setUsed({ ...used, template: value })} />
            <Tube label="Forward primer" name="forward" choices={tubes.primers} value={forward} onChange={(item) => { setForward(item); setSaid(null); }}
                  used={used.forward} onUsed={(value) => setUsed({ ...used, forward: value })} />
            <Tube label="Reverse primer" name="reverse" choices={tubes.primers} value={reverse} onChange={(item) => { setReverse(item); setSaid(null); }}
                  used={used.reverse} onUsed={(value) => setUsed({ ...used, reverse: value })} />
            <label className="least">Bases at each primer's 3′ end that must bind
              <input type="number" min={8} max={60} step={1} value={least} onChange={(event) => setLeast(event.target.value)} />
            </label>
          </fieldset>
        )}
      </section>

      {run.plan !== null && (
        <section className="card">
          <h2>What it makes</h2>
          {product === null ? <p className="trouble" role="status">{run.plan.problem}</p> : (
            <>
              <p><strong>{product.length} bp</strong> <span className="dim">linear</span></p>
              <code className="wrap">{product.length <= 120 ? product.sequence : `${product.sequence.slice(0, 60)} … ${product.sequence.slice(-60)}`}</code>
            </>
          )}
          <fieldset disabled={busy} className="stack">
            {product !== null && (
              <div className="row tight">
                <label>Call the product<input value={name} onChange={(event) => setName(event.target.value)} placeholder={run.name} maxLength={200} /></label>
                <label>Amount<input type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} className="num" /></label>
                <label>Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} className="num" /></label>
              </div>
            )}
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering about this run" maxLength={2000} /></label>
            <div className="row">
              {product !== null && <button type="button" onClick={() => void record(run.worked, `Recorded. There is a new tube of ${run.name}, not yet put anywhere.`)}>Record the run</button>}
              <button type="button" className="quiet" onClick={() => void record(run.failed, "Recorded as a run that gave nothing. The tubes were used all the same.")}>It was run and gave nothing</button>
            </div>
          </fieldset>
          {said !== null && <p className="small" role="status">{said}</p>}
        </section>
      )}

      {here.length > 0 && (
        <section className="card">
          <h2>Recent runs{instrument === null ? "" : " here"}</h2>
          <table>
            <thead><tr><th>Template</th><th>Made</th><th>Note</th></tr></thead>
            <tbody>
              {here.map((one) => {
                const from = lab.items.find((item) => item.item === one.inputs.find((input) => input.role === "template")?.item);
                return (
                  <tr key={one.run}>
                    <td>{from === undefined || from.part === null ? "a tube" : partName(from.part)}</td>
                    <td>{one.outcome === "worked" ? one.outputs.map((made) => partName(made.part)).join(", ") : <span className="badge">gave nothing</span>}</td>
                    <td className="dim">{one.note ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
