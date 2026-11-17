"use client";

/**
 * Writing a gene in a host's codons, at a desk.
 *
 * The whole of this tool turns on one thing being visible: where the host's preferences came from.
 * There is no table built in and none is asserted. You choose which of the lab's own sequences are
 * the host's genes, they are counted here, and the counts are on the screen beside the result. A
 * table counted over three genes says so; a figure nobody can check is worse than no figure.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { COMMON_ENZYMES, siteOf } from "./digest.js";
import { CODON, codonWorking, countCodonUsage, optimiseCodons } from "./codons.js";
import { ShowWorking } from "./working.js";

const count = (value: number): string => value.toLocaleString("en-US");
const share = (value: number): string => `${Math.round(value * 100)}%`;

/** What a host is handed to draw beside the panel. */
export interface CodonDesk {
  /** The tube of the gene being rewritten, to look at, if the lab has one that has been put somewhere. */
  focus: { place: string; item: string } | null;
  /** The rewritten sequence, once there is one. */
  sequence: string | null;
}

/**
 * Rewriting one of the lab's genes in a host's codons.
 *
 * @param options - `start` says what to open on, for a tour or a link.
 * @returns `panel`, the tool itself, and `desk`, what a scene beside it should look at.
 *
 * @example
 * ```tsx
 * import { useCodonBench } from "@biolibs/bionet-tools";
 *
 * const bench = useCodonBench();
 * <LabView lab={lab} wide beside={bench.panel} />
 * ```
 */
export function useCodonBench({ start }: {
  /** What to show: the gene, the host's genes, and sites to keep out. Followed whenever it changes. */
  start?: { gene?: string; hostGenes?: readonly string[]; avoid?: readonly string[] };
} = {}): { panel: ReactNode; desk: CodonDesk } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [gene, setGene] = useState(start?.gene ?? "");
  const [hostGenes, setHostGenes] = useState<string[]>([...(start?.hostGenes ?? [])]);
  const [avoid, setAvoid] = useState<string[]>([...(start?.avoid ?? [])]);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.gene !== undefined) setGene(start.gene);
    if (start.hostGenes !== undefined) setHostGenes([...start.hostGenes]);
    if (start.avoid !== undefined) setAvoid([...start.avoid]);
  }, [asked]);

  // Anything that is a whole number of codons could be a coding sequence; nothing else can.
  const coding = useMemo(() => (lab?.parts ?? []).filter((one) => one.kind !== "protein" && !one.circular && one.length >= CODON && one.length % CODON === 0), [lab?.parts]);
  const usage = useMemo(() => {
    const chosen = coding.filter((one) => hostGenes.includes(one.checksum));
    return chosen.length === 0 ? null : countCodonUsage(chosen.map((one) => one.sequence), {
      from: `${chosen.length} ${chosen.length === 1 ? "sequence" : "sequences"} this lab holds: ${chosen.map((one) => one.name).join(", ")}`,
    });
  }, [coding, hostGenes]);
  const part = coding.find((one) => one.checksum === gene);
  // Only the enzymes whose site is actually known can be kept out; the rest are not offered.
  const sites = useMemo(() => avoid.flatMap((name) => { const site = siteOf(name); return site === null ? [] : [{ name, site }]; }), [avoid]);
  const done = useMemo(() => {
    if (part === undefined || usage === null) return null;
    return optimiseCodons(part.sequence, usage, { avoid: sites });
  }, [part, usage, sites]);
  const working = useMemo(() => (done === null || done.problem !== null || usage === null ? [] : codonWorking(done, usage)), [done, usage]);

  const tube = lab?.items.find((one) => one.part === gene && !one.retired && one.where !== null);
  const desk: CodonDesk = {
    focus: tube?.where == null ? null : { place: tube.where.place, item: tube.item },
    sequence: done?.problem === null ? done.sequence : null,
  };

  const keep = async (): Promise<void> => {
    if (done === null || done.problem !== null || part === undefined) return;
    setBusy(true);
    const answer = await act("addPart", { name: `${part.name} (codon optimised)`, sequence: done.sequence });
    setBusy(false);
    setSaid(answer.ok ? "Kept as a part. There is no tube of it: it has to be ordered or made." : answer.error);
  };

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet codons">
      <section className="card">
        <h2>Write a gene for a host</h2>
        <p className="small"><Glossed text="Most amino acids have more than one codon, and an organism uses them unevenly: a gene written in another organism's codons is read slowly." /></p>
        <p className="dim small">There is no table of codon usage built into this. Choose which of the lab's sequences are the host's own genes and the preferences are counted from them, here, where you can check them. A handful of the host's genes, brought in on the Sequences tab, is what this wants.</p>
        {coding.length === 0 ? <p className="empty">The lab has no sequence that is a whole number of codons. Bring a coding sequence in on the Sequences tab.</p> : (
          <fieldset disabled={busy} className="stack">
            <label>The gene to rewrite
              <select value={gene} onChange={(event) => { setGene(event.target.value); setSaid(null); }} aria-label="The gene to rewrite">
                <option value="">Choose a sequence…</option>
                {coding.map((one) => <option key={one.checksum} value={one.checksum}>{one.name} · {count(one.length / CODON)} codons</option>)}
              </select>
            </label>
            <label>The host&apos;s own genes
              <select multiple size={Math.min(6, Math.max(3, coding.length))} value={hostGenes} aria-label="The host's own genes"
                      onChange={(event) => { setHostGenes(Array.from(event.target.selectedOptions, (one) => one.value)); setSaid(null); }}>
                {coding.map((one) => <option key={one.checksum} value={one.checksum}>{one.name}</option>)}
              </select>
            </label>
            <div className="row tight pick" role="group" aria-label="Sites to keep out">
              <span className="dim small">Keep out</span>
              {COMMON_ENZYMES.filter((one) => siteOf(one) !== null).slice(0, 6).map((one) => (
                <button key={one} type="button" aria-pressed={avoid.includes(one)} className={avoid.includes(one) ? "" : "quiet"}
                        onClick={() => { setAvoid(avoid.includes(one) ? avoid.filter((each) => each !== one) : [...avoid, one]); setSaid(null); }}>{one}</button>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      {usage !== null && (
        <section className="card">
          <h2>What this host prefers</h2>
          <p className="voice">Counted here</p>
          <p className="small">{count(usage.codons)} codons over {usage.genes} {usage.genes === 1 ? "gene" : "genes"}.</p>
          {usage.warnings.length > 0 && <ul className="checks">{usage.warnings.map((one) => <li key={one} className="look">{one}</li>)}</ul>}
          <p className="dim small">This is not a published table. It is what those genes do, and it is worth what they are worth as a sample of the host.</p>
        </section>
      )}

      {done !== null && done.problem !== null && <p className="trouble" role="status">{done.problem}</p>}

      {done !== null && done.problem === null && (
        <>
          <section className="card">
            <h2>The rewrite</h2>
            <p className="voice">This gene</p>
            <p><strong>{count(done.changes.length)}</strong> of {count(done.codons)} codons changed · GC {share(done.gcBefore)} → {share(done.gcAfter)}</p>
            <p className="small good">The protein is the same: it was translated before and after and compared.</p>
            {done.avoided.length > 0 && <p className="small">Kept out: {done.avoided.join(", ")}.</p>}
            {done.changes.length > 0 && (
              <table>
                <thead><tr><th>Codon</th><th>For</th><th>Was</th><th>Is</th><th>Why</th></tr></thead>
                <tbody>
                  {done.changes.slice(0, 12).map((one) => (
                    <tr key={one.at}>
                      <td>{one.at}</td>
                      <td>{one.aminoAcid}</td>
                      <td><code>{one.from}</code> <span className="dim">{share(one.fromShare)}</span></td>
                      <td><code>{one.to}</code> <span className="dim">{share(one.toShare)}</span></td>
                      <td className="dim small">{one.instead ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {done.changes.length > 12 && <p className="dim small">and {count(done.changes.length - 12)} more.</p>}
            {done.warnings.length > 0 && <ul className="checks">{done.warnings.map((one) => <li key={one} className="look">{one}</li>)}</ul>}
            <code className="wrap">{done.sequence.length <= 240 ? done.sequence : `${done.sequence.slice(0, 120)} … ${done.sequence.slice(-120)}`}</code>
            <fieldset disabled={busy} className="row">
              <button type="button" onClick={() => void keep()}>Keep it as a part</button>
              <span className="dim small">No tube: it has to be ordered or made.</span>
            </fieldset>
            {said !== null && <p className="small" role="status">{said}</p>}
          </section>

          <section className="card">
            <h2>The working</h2>
            {working.map((one) => <ShowWorking key={one.of} working={one} />)}
          </section>
        </>
      )}
    </div>
  );
  return { panel, desk };
}

/**
 * The codon tool on its own, for a lab that has not drawn its room.
 *
 * @param props - `start` says what to open on.
 */
export function CodonTool(props: Parameters<typeof useCodonBench>[0]) {
  return <>{useCodonBench(props).panel}</>;
}
