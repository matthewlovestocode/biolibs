"use client";

/**
 * A lab's sequences: bringing them in from the files it already has, and reading one as a map.
 *
 * This is the part of a sequence editor most people use most: open a construct, see what is on it,
 * see where the enzymes cut. Here the construct is a part in the lab's freezer, so what is being
 * looked at is something the lab holds, and what is brought in is added to what it holds.
 */
import { useMemo, useState } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { endsWords } from "@biolibs/bionet-panels";
import { cutters } from "./digest.js";
import { SequenceMap } from "./map.js";
import { featureTone, readSequenceFile } from "./sequence-file.js";

const count = (value: number): string => value.toLocaleString("en-US");

/**
 * Bring sequences in from files, and look at any part the lab has as a map.
 *
 * Choosing files adds each as a part, with the name, the shape and the features the file gives it.
 * SnapGene's own files, GenBank, EMBL and FASTA are read. A part is known by its sequence, so
 * bringing in one the lab already has adds nothing but what is marked on it.
 *
 * @param props - `part` is the checksum of the part to open on.
 */
export function SequencesTool({ part: first }: { part?: string }) {
  const lab = useLab()?.lab;
  const act = useAct();
  const [chosen, setChosen] = useState<string | null>(first ?? null);
  const [said, setSaid] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [once, setOnce] = useState(true);
  const part = lab?.parts.find((one) => one.checksum === chosen) ?? lab?.parts[0];
  const cuts = useMemo(() => (part === undefined ? [] : cutters(part)), [part]);
  if (lab === null || lab === undefined) return null;
  // On a map, the enzymes worth naming are the ones that cut once or twice: those are the ones to cut with.
  const shown = cuts.filter((one) => one.positions.length <= (once ? 1 : 2));
  const tubes = part === undefined ? 0 : lab.items.filter((item) => item.part === part.checksum && !item.retired).length;

  const bring = async (files: FileList | null): Promise<void> => {
    if (files === null || files.length === 0) return;
    setBusy(true);
    const lines: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const read = readSequenceFile(file.name, new Uint8Array(await file.arrayBuffer()));
        const answer = await act("addPart", { name: read.name, sequence: read.sequence, circular: read.circular, features: read.features });
        lines.push(answer.ok ? `${read.name}: ${count(read.sequence.length)} bp, ${read.circular ? "circular" : "linear"}, ${read.features.length} ${read.features.length === 1 ? "feature" : "features"}, from ${read.format}`
                             : `${file.name}: ${answer.error}`);
      } catch (cause) {
        lines.push(`${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    setSaid(lines);
    setBusy(false);
  };

  return (
    <div className="pcr sequences">
      <section className="card">
        <h2>Bring sequences in</h2>
        <p className="dim small">Choose SnapGene (.dna), GenBank (.gb), EMBL or FASTA files. Each becomes a part in the freezer, with what the file marks on it. Add a tube of it on the Freezer tab when there is one.</p>
        <input type="file" multiple disabled={busy} accept=".dna,.gb,.gbk,.gbff,.genbank,.embl,.fa,.fasta,.fna" aria-label="Sequence files" onChange={(event) => { void bring(event.target.files); event.target.value = ""; }} />
        {said.length > 0 && <ul className="plainlist small" role="status">{said.map((line) => <li key={line}>{line}</li>)}</ul>}
      </section>

      {part === undefined ? <p className="empty">The lab has no parts yet.</p> : (
        <section className="card">
          <div className="toolhead">
            <label>Part
              <select value={part.checksum} onChange={(event) => setChosen(event.target.value)} aria-label="Part">
                {lab.parts.map((one) => <option key={one.checksum} value={one.checksum}>{one.name} · {count(one.length)} {one.kind === "protein" ? "aa" : "bp"}{one.circular ? " · circular" : ""}</option>)}
              </select>
            </label>
            {endsWords(part) !== null && <span className="small">ends <code>{endsWords(part)}</code></span>}
            <span className="dim small">{tubes === 0 ? "no tubes of it" : `${tubes} ${tubes === 1 ? "tube" : "tubes"} of it`}</span>
          </div>
          <div className="mapped">
            <SequenceMap name={part.name} length={part.length} circular={part.circular} features={part.features}
                         marks={shown.flatMap((one) => one.positions.map((at) => ({ at, label: one.name })))} />
            <div>
              <table>
                <thead><tr><th>Feature</th><th>Type</th><th>Where</th><th>Strand</th></tr></thead>
                <tbody>
                  {part.features.map((feature, at) => (
                    <tr key={at}>
                      <td><span className={`swatch tone-${featureTone(feature.type)}`} />{feature.label}</td>
                      <td className="dim">{feature.type}</td>
                      <td><code>{feature.parts.map((piece) => `${count(piece.start + 1)}..${count(piece.end)}`).join(", ")}</code></td>
                      <td className="dim">{feature.strand === 1 ? "forward" : feature.strand === -1 ? "reverse" : "—"}</td>
                    </tr>
                  ))}
                  {part.features.length === 0 && <tr><td colSpan={4} className="dim">Nothing is marked on this part. A part brought in from a SnapGene or GenBank file keeps what the file marks.</td></tr>}
                </tbody>
              </table>
              <p className="small">
                <strong>Cuts once:</strong> {cuts.filter((one) => one.positions.length === 1).map((one) => one.name).join(", ") || "none of the usual enzymes"}
                {cuts.some((one) => one.positions.length === 2) && <> · <strong>twice:</strong> {cuts.filter((one) => one.positions.length === 2).map((one) => one.name).join(", ")}</>}
              </p>
              <label className="check small"><input type="checkbox" checked={!once} onChange={(event) => setOnce(!event.target.checked)} /> Mark the ones that cut twice as well</label>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
