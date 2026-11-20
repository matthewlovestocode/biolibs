/**
 * The glossary's diagrams. Wherever a picture shows something the libraries can compute (a
 * complement, a translation, a cut site, where a band runs) it is computed by them when the page is
 * built, so a diagram cannot disagree with the code.
 *
 * `TermDiagram` picks the diagram for a glossary slug.
 */
import { bandsOf, gelById, ladderBands, ladderById, type Band } from "@biolibs/gel";
import { enzymes } from "@biolibs/restriction";
import { Seq } from "@biolibs/seq";
import { gcFraction, seq3 } from "@biolibs/seqtools";
import {
  AminoAcidDiagram,
  CellDiagram,
  DnaRnaDiagram,
  EnzymeDiagram,
  GenomeSizeDiagram,
  NucleotideDiagram,
  PipelineDiagram,
  ProteinFoldDiagram,
  SplicingDiagram,
  UnitsDiagram,
  ZoomDiagram,
} from "./basics.js";
import {
  GibsonDiagram,
  HomologyDiagram,
  IdentityDiagram,
  MatrixDiagram,
  RmsdDiagram,
  SecondaryStructureDiagram,
  SequencingDiagram,
  InductionDiagram,
  SignalPeptideDiagram,
  TransformationDiagram,
  VectorInsertDiagram,
} from "./more.js";
import { Arrow, CELL, FeatureArrow, Figure, Letters, MONO, Note, Pill, baseColor, type FigureOptions } from "./primitives.js";

const GENE = "ATGGCCATTGTAATGGGCCGCTGA";

/** Three-letter names for a protein string, with the stop symbol spelled out. */
function aminoNames(protein: string): string[] {
  return [...protein].map((letter) => (letter === "*" ? "stop" : seq3(letter)));
}

// --- Two strands ----------------------------------------------------------------------------------

/** Both strands of a duplex, drawn from `x`. Shared by several diagrams. */
function Duplex({
  dna,
  x,
  top = 46,
  bottom = 88,
  rungs = true,
  backbones = true,
  highlight,
}: {
  dna: string;
  x: number;
  top?: number;
  bottom?: number;
  rungs?: boolean;
  backbones?: boolean;
  highlight?: { column: number; rows: "both" | "top" };
}) {
  const partner = new Seq(dna).complement().toString();
  const width = dna.length * CELL;
  return (
    <g>
      {highlight && (
        <rect
          x={x + highlight.column * CELL + 1}
          y={top - 17}
          width={CELL - 2}
          height={highlight.rows === "both" ? bottom - top + 23 : 23}
          rx={5}
          fill="var(--accent-soft)"
          stroke="var(--accent)"
        />
      )}
      {backbones && (
        <>
          <Arrow from={[x, top - 24]} to={[x + width, top - 24]} />
          <Arrow from={[x + width, bottom + 14]} to={[x, bottom + 14]} />
        </>
      )}
      {rungs &&
        [...dna].map((_, i) => (
          <line key={i} x1={x + i * CELL + CELL / 2} x2={x + i * CELL + CELL / 2} y1={top + 7} y2={bottom - 16} stroke="var(--line)" strokeWidth={2} />
        ))}
      <Letters x={x} y={top} text={dna} />
      <Letters x={x} y={bottom} text={partner} />
      <Note x={x - 8} y={top - 1} anchor="end">5′</Note>
      <Note x={x + width + 8} y={top - 1}>3′</Note>
      <Note x={x - 8} y={bottom - 1} anchor="end">3′</Note>
      <Note x={x + width + 8} y={bottom - 1}>5′</Note>
    </g>
  );
}

export function DuplexDiagram({ highlight, ...options }: FigureOptions & { highlight?: "base" | "pair" }) {
  const dna = "ATGGCCATTGTA";
  const description =
    highlight === "base"
      ? "Double-stranded DNA drawn as two rows of letters. One letter in the top row is outlined: a single base."
      : highlight === "pair"
        ? "Double-stranded DNA drawn as two rows of letters. One column is outlined: a G on the top strand paired with a C on the bottom strand."
        : "Double-stranded DNA drawn as two rows of letters. The top strand runs 5′ to 3′ from left to right; the bottom strand runs 5′ to 3′ from right to left.";
  const caption =
    highlight === "base"
      ? "One base is outlined. A always sits opposite T, and G opposite C."
      : highlight === "pair"
        ? "One base pair is outlined. This stretch is 12 base pairs long."
        : "The arrows show each strand's 5′ to 3′ direction. The two strands point opposite ways.";
  return (
    <Figure width={dna.length * CELL + 96} height={118} description={description} caption={caption} {...options}>
      <Duplex dna={dna} x={48} highlight={highlight ? { column: 3, rows: highlight === "pair" ? "both" : "top" } : undefined} />
    </Figure>
  );
}

export function ReverseComplementDiagram(options: FigureOptions) {
  const dna = "ATGGCCATT";
  const seq = new Seq(dna);
  const rows = [
    { label: "Start", hint: "one strand", text: dna, left: "5′", right: "3′" },
    { label: "Complement", hint: "swap A↔T and C↔G", text: seq.complement().toString(), left: "3′", right: "5′" },
    { label: "Reverse complement", hint: "then read right to left", text: seq.reverseComplement().toString(), left: "5′", right: "3′" },
  ];
  const x = 176;
  return (
    <Figure
      width={x + dna.length * CELL + 40}
      height={136}
      description={`Three rows. The starting strand ${dna}; its complement ${rows[1].text}, which runs 3′ to 5′; and its reverse complement ${rows[2].text}, which is the complement written 5′ to 3′.`}
      caption="The complement is the partner strand as it sits beneath the original. The reverse complement is that same strand written in the conventional 5′ to 3′ direction."
      {...options}
    >
      {rows.map((row, i) => {
        const y = 30 + i * 42;
        return (
          <g key={row.label}>
            <Note x={12} y={y - 4} size={12} bold fill="var(--ink)">{row.label}</Note>
            <Note x={12} y={y + 10} size={10}>{row.hint}</Note>
            <Note x={x - 8} y={y - 1} anchor="end">{row.left}</Note>
            <Letters x={x} y={y} text={row.text} />
            <Note x={x + dna.length * CELL + 8} y={y - 1}>{row.right}</Note>
          </g>
        );
      })}
    </Figure>
  );
}

export function MeltingDiagram(options: FigureOptions) {
  const dna = "ATGGCC";
  return (
    <Figure
      width={480}
      height={132}
      description="On the left, two paired strands. An arrow labelled heat points to the right, where the same two strands have come apart."
      caption="Below the melting temperature the strands stay paired. Above it, they separate. G–C pairs hold more strongly than A–T pairs, so GC-rich DNA melts at a higher temperature."
      {...options}
    >
      <Duplex dna={dna} x={40} backbones={false} />
      <Note x={106} y={124} anchor="middle">below the melting temperature</Note>
      <Arrow from={[212, 62]} to={[266, 62]} color="var(--base-t)" width={2} />
      <Note x={239} y={52} anchor="middle" fill="var(--base-t)" bold>heat</Note>
      <Duplex dna={dna} x={312} top={34} bottom={100} rungs={false} backbones={false} />
      <Note x={378} y={124} anchor="middle">above it</Note>
    </Figure>
  );
}

export function GcDiagram(options: FigureOptions) {
  const cell = 20;
  const isGc = (base: string) => base === "G" || base === "C";
  const count = [...GENE].filter(isGc).length;
  const fraction = gcFraction(GENE);
  const width = GENE.length * cell;
  return (
    <Figure
      width={width + 32}
      height={98}
      description={`A sequence of ${GENE.length} bases with every G and C picked out. ${count} of the ${GENE.length} are G or C, a GC content of ${(fraction * 100).toFixed(0)}%.`}
      caption={`Count the G and C bases and divide by the length: ${count} of ${GENE.length}, or ${(fraction * 100).toFixed(0)}%.`}
      {...options}
    >
      {[...GENE].map((base, i) => isGc(base) && <rect key={i} x={16 + i * cell + 1} y={18} width={cell - 2} height={24} rx={4} fill="var(--accent-soft)" />)}
      <Letters x={16} y={36} text={GENE} cell={cell} size={14} opacity={(i) => (isGc(GENE[i]) ? 1 : 0.35)} />
      <rect x={16} y={56} width={width} height={10} rx={5} fill="var(--line)" />
      <rect x={16} y={56} width={width * fraction} height={10} rx={5} fill="var(--accent)" />
      <Note x={16} y={86}>G or C: {count} of {GENE.length}</Note>
      <Note x={16 + width} y={86} anchor="end" bold fill="var(--ink)">{(fraction * 100).toFixed(0)}%</Note>
    </Figure>
  );
}

// --- Reading a gene -------------------------------------------------------------------------------

const CODON_STEP = 60;

/** A row of boxed codons. Each box is centred on `x + i * CODON_STEP + 27`. */
function CodonRow({
  x,
  y,
  codons,
  changed,
  tone,
}: {
  x: number;
  y: number;
  codons: string[];
  changed?: (codon: number, base: number) => boolean;
  /** Outline colour for a codon that needs picking out, or "dim" to fade one that is not part of the point. */
  tone?: (codon: number) => string | undefined;
}) {
  return (
    <g>
      {codons.map((codon, i) => (
        <g key={i} opacity={tone?.(i) === "dim" ? 0.4 : 1}>
          <rect
            x={x + i * CODON_STEP}
            y={y - 17}
            width={54}
            height={25}
            rx={5}
            fill="none"
            stroke={tone?.(i) && tone(i) !== "dim" ? tone(i) : "var(--line)"}
            strokeWidth={tone?.(i) && tone(i) !== "dim" ? 2 : 1}
          />
          {[0, 1, 2].map((b) => changed?.(i, b) && <circle key={b} cx={x + i * CODON_STEP + 11 + b * 16} cy={y - 5} r={9} fill="var(--accent-soft)" stroke="var(--accent)" />)}
          <Letters x={x + i * CODON_STEP + 3} y={y} text={codon} cell={16} size={13} />
        </g>
      ))}
    </g>
  );
}

function AminoRow({ x, y, protein }: { x: number; y: number; protein: string }) {
  return (
    <g>
      {aminoNames(protein).map((name, i) => (
        <Pill key={i} x={x + i * CODON_STEP + 5} y={y - 16} width={44} text={name} />
      ))}
    </g>
  );
}

export function CodonDiagram(options: FigureOptions) {
  const codons = GENE.match(/.{3}/g) ?? [];
  const protein = new Seq(GENE).translate().toString();
  const x = 16;
  return (
    <Figure
      width={x * 2 + codons.length * CODON_STEP - 6}
      height={108}
      description={`The sequence ${GENE} divided into ${codons.length} codons of three bases. Under each codon is the amino acid it specifies: ${aminoNames(protein).join(", ")}.`}
      caption="Each box is one codon. ATG starts the protein and codes for methionine (Met); TGA is one of the three stop codons."
      {...options}
    >
      <CodonRow x={x} y={34} codons={codons} />
      {codons.map((_, i) => (
        <Arrow key={i} from={[x + i * CODON_STEP + 27, 46]} to={[x + i * CODON_STEP + 27, 64]} head={4} />
      ))}
      <AminoRow x={x} y={86} protein={protein} />
    </Figure>
  );
}

export function OrfDiagram(options: FigureOptions) {
  const codons = ["TTC", "ATG", "GCC", "ATT", "GTA", "GGC", "CGC", "TGA", "CCA"];
  const start = codons.indexOf("ATG");
  const protein = new Seq(codons.slice(start).join("")).translate({ toStop: true }).toString();
  const stop = start + protein.length;
  const x = 16;
  const left = x + start * CODON_STEP;
  const right = x + stop * CODON_STEP + 54;
  return (
    <Figure
      width={x * 2 + codons.length * CODON_STEP - 6}
      height={136}
      description={`Nine codons. The second, ATG, is marked start and the eighth, ${codons[stop]}, is marked stop. A bracket labelled open reading frame spans from the start codon to the stop codon. Under the codons between them are the amino acids ${aminoNames(protein).join(", ")}.`}
      caption="Translation begins at the start codon, ATG, and runs until the first stop codon. That stretch is an open reading frame. The stop codon adds no amino acid, and the codons either side are not translated."
      {...options}
    >
      <path d={`M${left},26 v-8 H${right} v8`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      <Note x={(left + right) / 2} y={12} anchor="middle" fill="var(--accent)" bold>open reading frame</Note>
      <CodonRow x={x} y={50} codons={codons} tone={(i) => (i === start ? "var(--accent)" : i === stop ? "var(--base-t)" : i < start || i > stop ? "dim" : undefined)} />
      <Note x={left + 27} y={76} anchor="middle" bold fill="var(--accent)">start</Note>
      <Note x={x + stop * CODON_STEP + 27} y={76} anchor="middle" bold fill="var(--base-t)">stop</Note>
      <AminoRow x={left} y={112} protein={protein} />
    </Figure>
  );
}

export function GeneticCodeDiagram(options: FigureOptions) {
  const dna = "ATGTGAATAAGA";
  const codons = dna.match(/.{3}/g) ?? [];
  const seq = new Seq(dna);
  const rows = [
    { label: "Standard code", hint: "table 1", protein: seq.translate({ table: 1 }).toString() },
    { label: "Vertebrate mitochondria", hint: "table 2", protein: seq.translate({ table: 2 }).toString() },
  ];
  const x = 170;
  return (
    <Figure
      width={x + codons.length * CODON_STEP + 10}
      height={150}
      description={`The codons ${codons.join(", ")} translated with two genetic codes. The standard code gives ${aminoNames(rows[0].protein).join(", ")}. The vertebrate mitochondrial code gives ${aminoNames(rows[1].protein).join(", ")}.`}
      caption="The same DNA read with two genetic codes. Three of these four codons mean something different inside a mitochondrion."
      {...options}
    >
      <Note x={12} y={32} size={12} bold fill="var(--ink)">DNA</Note>
      <CodonRow x={x} y={34} codons={codons} />
      {rows.map((row, i) => {
        const y = 86 + i * 44;
        return (
          <g key={row.label}>
            <Note x={12} y={y - 4} size={12} bold fill="var(--ink)">{row.label}</Note>
            <Note x={12} y={y + 10} size={10}>{row.hint}</Note>
            <AminoRow x={x} y={y} protein={row.protein} />
          </g>
        );
      })}
    </Figure>
  );
}

export function ReadingFrameDiagram(options: FigureOptions) {
  const dna = "ATGGCCATTGTAATGGGCC";
  const cell = 16;
  const x = 84;
  const frames = [0, 1, 2].map((offset) => {
    const count = Math.floor((dna.length - offset) / 3);
    return { offset, count, protein: new Seq(dna.slice(offset, offset + count * 3)).translate().toString() };
  });
  return (
    <Figure
      width={x + dna.length * cell + 16}
      height={180}
      description={`The sequence ${dna} read in three frames. ${frames.map((f) => `Starting at base ${f.offset + 1} it reads ${[...f.protein].map((p) => (p === "*" ? "stop" : p)).join(" ")}`).join(". ")}.`}
      caption="The same bases grouped three ways. Shifting the start by one base changes every codon, and here the second frame runs into a stop."
      {...options}
    >
      {frames.map((frame) => {
        const y = 32 + frame.offset * 56;
        const inFrame = (i: number) => i >= frame.offset && i < frame.offset + frame.count * 3;
        return (
          <g key={frame.offset}>
            <Note x={12} y={y - 1} size={12} bold fill="var(--ink)">Frame {frame.offset + 1}</Note>
            {[...frame.protein].map((amino, i) => {
              const left = x + (frame.offset + i * 3) * cell;
              return (
                <g key={i}>
                  <rect x={left + 1} y={y - 16} width={cell * 3 - 2} height={23} rx={4} fill={amino === "*" ? "var(--sunken)" : "none"} stroke="var(--line)" />
                  <text x={left + cell * 1.5} y={y + 24} textAnchor="middle" fontFamily={MONO} fontSize={12} fontWeight={600} fill={amino === "*" ? "var(--base-t)" : "var(--accent)"}>
                    {amino === "*" ? "stop" : amino}
                  </text>
                </g>
              );
            })}
            <Letters x={x} y={y} text={dna} cell={cell} size={13} opacity={(i) => (inFrame(i) ? 1 : 0.3)} />
          </g>
        );
      })}
    </Figure>
  );
}

export function CentralDogmaDiagram(options: FigureOptions) {
  const dna = "ATGGCCATTGTA";
  const seq = new Seq(dna);
  const rna = seq.transcribe().toString();
  const protein = seq.translate().toString();
  const x = 100;
  const mid = x + (dna.length * CELL) / 2;
  return (
    <Figure
      width={x + dna.length * CELL + 24}
      height={156}
      description={`Three rows joined by arrows. DNA ${dna} is transcribed into RNA ${rna}, in which U replaces T. The RNA is translated into the protein ${aminoNames(protein).join(", ")}.`}
      caption="Transcription copies DNA into RNA, with U in place of T. Translation reads the RNA three bases at a time into amino acids."
      {...options}
    >
      <Note x={12} y={32} size={12} bold fill="var(--ink)">DNA</Note>
      <Letters x={x} y={34} text={dna} />
      <Arrow from={[mid, 44]} to={[mid, 66]} />
      <Note x={mid + 10} y={59}>transcription</Note>
      <Note x={12} y={84} size={12} bold fill="var(--ink)">RNA</Note>
      {[...rna].map((base, i) => base === "U" && <rect key={i} x={x + i * CELL + 3} y={90} width={CELL - 6} height={2} fill="var(--base-t)" />)}
      <Letters x={x} y={86} text={rna} />
      <Arrow from={[mid, 98]} to={[mid, 118]} />
      <Note x={mid + 10} y={112}>translation</Note>
      <Note x={12} y={140} size={12} bold fill="var(--ink)">Protein</Note>
      {aminoNames(protein).map((name, i) => (
        <Pill key={i} x={x + i * CELL * 3 + 4} y={124} width={CELL * 3 - 8} text={name} />
      ))}
    </Figure>
  );
}

export function MutationDiagram(options: FigureOptions) {
  const cases = [
    { title: "Original", codon: "GAG", changed: -1, note: "" },
    { title: "Silent", codon: "GAA", changed: 2, note: "same amino acid" },
    { title: "Missense", codon: "GTG", changed: 1, note: "different amino acid" },
    { title: "Nonsense", codon: "TAG", changed: 0, note: "protein cut short" },
  ].map((c) => ({ ...c, amino: aminoNames(new Seq(c.codon).translate().toString())[0] }));
  const column = 126;
  return (
    <Figure
      width={column * cases.length + 16}
      height={140}
      description={cases.map((c) => `${c.title}: ${c.codon} codes for ${c.amino}`).join(". ") + "."}
      caption="One changed base, three outcomes. GAG to GTG, glutamate to valine, is the single change behind sickle-cell disease."
      {...options}
    >
      {cases.map((c, i) => {
        const left = 8 + i * column;
        const centre = left + column / 2;
        return (
          <g key={c.title}>
            <Note x={centre} y={18} anchor="middle" size={12} bold fill="var(--ink)">{c.title}</Note>
            <CodonRow x={centre - 27} y={50} codons={[c.codon]} changed={(_, base) => base === c.changed} />
            <Arrow from={[centre, 62]} to={[centre, 80]} head={4} />
            <Pill x={centre - 26} y={86} width={52} text={c.amino} />
            <Note x={centre} y={130} anchor="middle">{c.note}</Note>
          </g>
        );
      })}
    </Figure>
  );
}

// --- Records and files ----------------------------------------------------------------------------

export function FeatureDiagram(options: FigureOptions) {
  return (
    <Figure
      width={520}
      height={130}
      description="A horizontal line stands for a sequence of 4,000 bases. Above it, pointing right, are a promoter, a gene and a terminator. Below it, pointing left, is a second gene on the other strand."
      caption="Each coloured block is a feature: a type, a location and a strand. Arrows above the line read left to right; the one below is on the opposite strand and reads right to left."
      {...options}
    >
      <line x1={20} x2={500} y1={60} y2={60} stroke="var(--ink)" strokeWidth={2} />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line x1={20 + i * 120} x2={20 + i * 120} y1={56} y2={64} stroke="var(--ink)" strokeWidth={1.5} />
          <Note x={20 + i * 120} y={124} anchor="middle" size={10} mono>{i === 0 ? "1" : (i * 1000).toLocaleString("en-US")}</Note>
        </g>
      ))}
      <FeatureArrow x={50} y={38} width={48} color="var(--base-g)" />
      <Note x={74} y={30} anchor="middle">promoter</Note>
      <FeatureArrow x={108} y={38} width={200} color="var(--accent)" />
      <Note x={208} y={30} anchor="middle">gene</Note>
      <FeatureArrow x={318} y={38} width={22} direction="none" color="var(--base-t)" />
      <Note x={329} y={30} anchor="middle">terminator</Note>
      <FeatureArrow x={372} y={68} width={110} direction="left" color="var(--base-c)" />
      <Note x={427} y={100} anchor="middle">gene on the other strand</Note>
    </Figure>
  );
}

export function PlasmidDiagram(options: FigureOptions) {
  const cx = 230;
  const cy = 122;
  const r = 76;
  const at = (degrees: number, radius: number): [number, number] => {
    const a = (degrees * Math.PI) / 180;
    return [cx + radius * Math.sin(a), cy - radius * Math.cos(a)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = at(from, r);
    const [x2, y2] = at(to, r);
    return `M${x1},${y1} A${r},${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2},${y2}`;
  };
  const features = [
    { from: 28, to: 112, color: "var(--accent)", label: "your gene" },
    { from: 150, to: 232, color: "var(--base-c)", label: "resistance gene" },
    { from: 268, to: 304, color: "var(--base-g)", label: "origin of replication" },
  ];
  return (
    <Figure
      width={460}
      height={244}
      description="A circle standing for a plasmid. Three coloured arcs on it mark the inserted gene, a resistance gene and the origin of replication. A tick at the top marks position 1."
      caption="A plasmid is a circle, so it has no ends. Position 1 is wherever the file says it is, and a feature can run straight across it."
      {...options}
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--muted)" strokeWidth={2} />
      {features.map((f) => {
        const middle = (f.from + f.to) / 2;
        const [lx, ly] = at(middle, r + 20);
        const side = Math.sin((middle * Math.PI) / 180);
        return (
          <g key={f.label}>
            <path d={arc(f.from, f.to)} fill="none" stroke={f.color} strokeWidth={12} strokeLinecap="butt" />
            <Note x={lx} y={ly + 4} anchor={side > 0.3 ? "start" : side < -0.3 ? "end" : "middle"}>{f.label}</Note>
          </g>
        );
      })}
      <line x1={cx} x2={cx} y1={cy - r - 9} y2={cy - r + 9} stroke="var(--ink)" strokeWidth={2} />
      <Note x={cx} y={cy - r - 16} anchor="middle" mono>position 1</Note>
    </Figure>
  );
}

export function CoordinateDiagram(options: FigureOptions) {
  const dna = "ATGGCCAT";
  const cell = 40;
  const x = 62;
  const chosen = (i: number) => i >= 2 && i < 5;
  return (
    <Figure
      width={x + dna.length * cell + 20}
      height={152}
      description="Eight bases in boxes. Above, the gaps between them are numbered 0 to 8; below, the bases themselves are numbered 1 to 8. The bases G, G, C are highlighted: they run from 2 to 5 counting gaps, and from 3 to 5 counting bases."
      caption="The same three bases are slice(2, 5) when you count the gaps from zero, and 3..5 when you count the bases from one."
      {...options}
    >
      <Note x={8} y={50} bold fill="var(--ink)">0-based</Note>
      <Note x={8} y={116} bold fill="var(--ink)">1-based</Note>
      {[...dna].map((base, i) => (
        <g key={i}>
          <rect x={x + i * cell} y={60} width={cell} height={36} fill={chosen(i) ? "var(--accent-soft)" : "none"} stroke="var(--line)" />
          <text x={x + i * cell + cell / 2} y={84} textAnchor="middle" fontFamily={MONO} fontSize={16} fontWeight={600} fill={baseColor(base)}>{base}</text>
          <Note x={x + i * cell + cell / 2} y={116} anchor="middle" mono>{i + 1}</Note>
        </g>
      ))}
      {Array.from({ length: dna.length + 1 }, (_, i) => (
        <Note key={i} x={x + i * cell} y={50} anchor="middle" mono>{i}</Note>
      ))}
      <path d={`M${x + 2 * cell},36 v-6 h${3 * cell} v6`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      <Note x={x + 3.5 * cell} y={22} anchor="middle" fill="var(--accent)">start included, end excluded</Note>
      <path d={`M${x + 2.5 * cell},122 v6 h${2 * cell} v-6`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      <Note x={x + 3.5 * cell} y={144} anchor="middle" fill="var(--accent)">both ends included</Note>
    </Figure>
  );
}

export function FileFormatDiagram({ format, ...options }: FigureOptions & { format: "fasta" | "fastq" }) {
  const lines =
    format === "fasta"
      ? [
          { text: ">gene1 An example gene", note: "name line: begins with >" },
          { text: "ATGGCCATTGTAATGGGCCGC", note: "the sequence," },
          { text: "TGAAAGGGTGCCCGATAG", note: "wrapped over as many lines as needed" },
        ]
      : [
          { text: "@read1", note: "name line: begins with @" },
          { text: "GATTACAGGCATTGCA", note: "the bases the machine read" },
          { text: "+", note: "separator" },
          { text: "IIIIHHGFF#5!IIIH", note: "one quality character per base" },
        ];
  const height = 20 + lines.length * 24 + (format === "fastq" ? 26 : 6);
  return (
    <Figure
      width={470}
      height={height}
      description={
        format === "fasta"
          ? "A FASTA file of three lines: a name line beginning with a greater-than sign, then two lines of sequence."
          : "A FASTQ record of four lines: a name line beginning with an at sign, the bases, a plus sign as separator, and a line of quality characters the same length as the bases."
      }
      caption={
        format === "fasta"
          ? "A FASTA file holds a name and the letters, and nothing else."
          : "Each quality character sits under the base it describes. Here I is the best score, about one error in 10,000, and ! is the worst."
      }
      {...options}
    >
      <rect x={10} y={8} width={196} height={lines.length * 24 + 8} rx={6} fill="var(--code-bg)" stroke="var(--line)" />
      {lines.map((line, i) => {
        const y = 30 + i * 24;
        const isSequence = /^[ACGT]+$/.test(line.text);
        return (
          <g key={i}>
            {isSequence ? (
              <Letters x={18} y={y} text={line.text} cell={8.4} size={13} />
            ) : (
              <text x={20} y={y} fontFamily={MONO} fontSize={13} fill="var(--ink)">{line.text}</text>
            )}
            <line x1={210} x2={226} y1={y - 4} y2={y - 4} stroke="var(--muted)" />
            <Note x={232} y={y}>{line.note}</Note>
          </g>
        );
      })}
      {format === "fastq" && <Note x={20} y={height - 8} size={10}>I = quality 40 · 5 = quality 20 · ! = quality 0</Note>}
    </Figure>
  );
}

// --- At the bench ---------------------------------------------------------------------------------

export function CutDiagram({ enzyme: name, ...options }: FigureOptions & { enzyme: string }) {
  const enzyme = enzymes[name];
  const pattern = enzyme.elucidate(); // e.g. "G^AATT_C": ^ is the top-strand cut, _ the bottom
  const flank = 3;
  const dna = `ACT${enzyme.site}GCA`;
  const partner = new Seq(dna).complement().toString();
  const topCut = flank + Math.max(0, pattern.replace("_", "").indexOf("^"));
  const bottomCut = flank + Math.max(0, pattern.replace("^", "").indexOf("_"));
  const overhang = Math.abs(topCut - bottomCut);
  const x = 48;
  const gap = 36;
  const width = dna.length * CELL;
  const ends = (top: number, bottom: number, right: number) => (
    <>
      <Note x={x - 8} y={top - 1} anchor="end">5′</Note>
      <Note x={x - 8} y={bottom - 1} anchor="end">3′</Note>
      <Note x={right + 8} y={top - 1}>3′</Note>
      <Note x={right + 8} y={bottom - 1}>5′</Note>
    </>
  );
  const ending = overhang ? `a ${overhang}-base overhang, ${enzyme.ovhgseq ?? ""}` : "blunt ends with no overhang";
  return (
    <Figure
      width={x * 2 + width + gap}
      height={212}
      description={`${name} recognises ${enzyme.site}. Before the cut, the two strands are intact. After it, the DNA is in two pieces with ${ending}.`}
      caption={
        overhang
          ? `${name} recognises ${enzyme.site} and cuts the two strands ${overhang} bases apart, leaving sticky ends with the overhang ${enzyme.ovhgseq}.`
          : `${name} recognises ${enzyme.site} and cuts both strands at the same place, leaving blunt ends.`
      }
      {...options}
    >
      <Note x={12} y={14} bold fill="var(--ink)">Before</Note>
      <rect x={x + flank * CELL} y={24} width={enzyme.site.length * CELL} height={62} rx={6} fill="var(--sunken)" />
      <Note x={x + (flank + enzyme.site.length / 2) * CELL} y={14} anchor="middle">recognition site</Note>
      <Letters x={x} y={46} text={dna} opacity={(i) => (i < flank || i >= flank + enzyme.site.length ? 0.4 : 1)} />
      <Letters x={x} y={78} text={partner} opacity={(i) => (i < flank || i >= flank + enzyme.site.length ? 0.4 : 1)} />
      {ends(46, 78, x + width)}
      <path
        d={`M${x + topCut * CELL},26 V57 H${x + bottomCut * CELL} V88`}
        fill="none"
        stroke="var(--base-t)"
        strokeWidth={2}
        strokeDasharray="4 3"
      />

      <Note x={12} y={122} bold fill="var(--ink)">After</Note>
      <Letters x={x} y={150} text={dna.slice(0, topCut)} />
      <Letters x={x} y={182} text={partner.slice(0, bottomCut)} />
      <Letters x={x + topCut * CELL + gap} y={150} text={dna.slice(topCut)} />
      <Letters x={x + bottomCut * CELL + gap} y={182} text={partner.slice(bottomCut)} />
      {ends(150, 182, x + width + gap)}
      <Note x={x + (width + gap) / 2} y={206} anchor="middle" fill="var(--accent)">{overhang ? `sticky ends: ${ending}` : ending}</Note>
    </Figure>
  );
}

/** The three things looked for at a primer's ends: a G or C to hold it, a fold, and a partner it should not have. */
export function PrimerEndDiagram({ kind, ...options }: FigureOptions & { kind: "clamp" | "hairpin" | "dimer" }) {
  const pair = (text: string) => new Seq(text).complement().toString();
  const rungs = (x: number, from: number, many: number, top: number, bottom: number) =>
    Array.from({ length: many }, (_, i) => <line key={i} x1={x + (from + i) * CELL + CELL / 2} x2={x + (from + i) * CELL + CELL / 2} y1={top} y2={bottom} stroke="var(--line)" strokeWidth={1.5} />);
  if (kind === "clamp") {
    const primer = "ATGACCATGATTACG";
    const template = pair(`${primer}CCAAGC`);
    const x = 40;
    const last = primer.length - 1;
    return (
      <Figure
        width={template.length * CELL + 80}
        height={132}
        description={`A primer, ${primer}, written 5′ to 3′ over the strand it binds. Its last base, a G, is outlined, paired with a C below. An arrow runs on from that end, where copying starts.`}
        caption="The primer's last base is a G, paired with a C. That end is the one the copying enzyme extends, so a strong pair there holds it in place."
        {...options}
      >
        <rect x={x + last * CELL + 1} y={24} width={CELL - 2} height={66} rx={5} fill="var(--accent-soft)" stroke="var(--accent)" />
        <Letters x={x} y={46} text={primer} />
        {rungs(x, 0, primer.length, 54, 68)}
        <Letters x={x} y={84} text={template} opacity={(i) => (i < primer.length ? 1 : 0.4)} />
        <Note x={x - 8} y={50} anchor="end">5′</Note>
        <Note x={x - 8} y={88} anchor="end">3′</Note>
        <Note x={x + template.length * CELL + 8} y={88}>5′</Note>
        <Arrow from={[x + primer.length * CELL + 4, 42]} to={[x + template.length * CELL - 4, 42]} color="var(--accent)" width={2} />
        <Note x={x + (last + 0.5) * CELL} y={16} anchor="middle" fill="var(--accent)" bold>3′ end: G</Note>
        <Note x={x} y={118}>the primer, over the strand it binds</Note>
      </Figure>
    );
  }
  if (kind === "hairpin") {
    const [stem, loop] = ["GGATCCA", "TTTT"];
    const back = pair(stem);
    const x = 44;
    const turn = x + stem.length * CELL;
    return (
      <Figure
        width={stem.length * CELL + 150}
        height={132}
        description={`One strand, ${stem}${loop}${[...back].reverse().join("")}, folded back on itself. Its first seven bases are paired with its last seven, and the four Ts between them make an unpaired loop at the turn.`}
        caption="One strand, read 5′ to 3′ along the top, round the loop and back along the bottom. Its two ends are complementary, so it pairs with itself."
        {...options}
      >
        <Letters x={x} y={46} text={stem} />
        {rungs(x, 0, stem.length, 54, 68)}
        <Letters x={x} y={84} text={back} />
        <path d={`M${turn + 4},40 C${turn + 78},30 ${turn + 78},90 ${turn + 4},80`} fill="none" stroke="var(--line)" strokeWidth={1.5} />
        <Letters x={turn + 6} y={34} text={loop.slice(0, 2)} />
        <Letters x={turn + 6} y={96} text={[...loop.slice(2)].reverse().join("")} />
        <Note x={turn + 70} y={64} fill="var(--muted)">loop</Note>
        <Note x={x - 8} y={50} anchor="end">5′</Note>
        <Note x={x - 8} y={88} anchor="end">3′</Note>
        <Note x={x} y={118}>the stem: {stem.length} bases paired</Note>
      </Figure>
    );
  }
  const [first, overlap] = ["ACTGAC", "GGATCC"];
  const second = "TGACCA";
  const upper = first + overlap;
  const lower = pair(overlap) + second;
  const x = 44;
  const lowerX = x + first.length * CELL;
  return (
    <Figure
      width={(first.length + overlap.length + second.length) * CELL + 96}
      height={140}
      description={`Two primers. The last six bases of the upper one, ${overlap}, are paired with the last six of the lower one. A dashed arrow runs on from the 3′ end of each along the other, where each would be extended.`}
      caption="The 3′ ends of the two primers are complementary, so they pair with each other. Each is then extended along the other, making a short product that is not the one wanted."
      {...options}
    >
      <rect x={lowerX} y={26} width={overlap.length * CELL} height={66} rx={6} fill="var(--accent-soft)" />
      <Letters x={x} y={46} text={upper} />
      {rungs(x, first.length, overlap.length, 54, 68)}
      <Letters x={lowerX} y={84} text={lower} />
      <Note x={x - 8} y={50} anchor="end">5′</Note>
      <Note x={x + upper.length * CELL + 6} y={50}>3′</Note>
      <Note x={lowerX - 8} y={88} anchor="end">3′</Note>
      <Note x={lowerX + lower.length * CELL + 6} y={88}>5′</Note>
      <line x1={x + upper.length * CELL + 22} x2={lowerX + lower.length * CELL - 8} y1={42} y2={42} stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" />
      <Arrow from={[lowerX + lower.length * CELL - 10, 42]} to={[lowerX + lower.length * CELL, 42]} color="var(--accent)" width={2} />
      <line x1={lowerX - 22} x2={x + 8} y1={80} y2={80} stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" />
      <Arrow from={[x + 10, 80]} to={[x, 80]} color="var(--accent)" width={2} />
      <Note x={x} y={18}>one primer</Note>
      <Note x={lowerX + lower.length * CELL} y={112} anchor="end">the other primer</Note>
      <Note x={x} y={130}>dashed: where each is extended along the other</Note>
    </Figure>
  );
}

export function PcrDiagram(options: FigureOptions) {
  return (
    <Figure
      width={520}
      height={186}
      description="A template of two strands. A forward primer binds the bottom strand on the left and points right; a reverse primer binds the top strand on the right and points left. Below, the product: a shorter double strand spanning only the region between the primers."
      caption="The two primers bind on opposite strands and point towards each other. Only the stretch between them is copied, and each cycle doubles it."
      {...options}
    >
      <rect x={140} y={20} width={240} height={72} fill="var(--accent-soft)" />
      <line x1={30} x2={490} y1={30} y2={30} stroke="var(--ink)" strokeWidth={2} />
      <line x1={30} x2={490} y1={84} y2={84} stroke="var(--ink)" strokeWidth={2} />
      <Note x={22} y={34} anchor="end">5′</Note>
      <Note x={498} y={34}>3′</Note>
      <Note x={22} y={88} anchor="end">3′</Note>
      <Note x={498} y={88}>5′</Note>
      <Arrow from={[380, 42]} to={[318, 42]} color="var(--base-c)" width={4} head={7} />
      <Note x={380} y={58} anchor="end" fill="var(--base-c)" bold>reverse primer</Note>
      <Arrow from={[140, 72]} to={[202, 72]} color="var(--accent)" width={4} head={7} />
      <Note x={140} y={64} fill="var(--accent)" bold>forward primer</Note>
      <Arrow from={[260, 100]} to={[260, 124]} />
      <Note x={270} y={117}>repeat for about 30 cycles</Note>
      <line x1={140} x2={380} y1={140} y2={140} stroke="var(--ink)" strokeWidth={3} />
      <line x1={140} x2={380} y1={150} y2={150} stroke="var(--ink)" strokeWidth={3} />
      <Note x={260} y={174} anchor="middle">the product: millions of copies of the region between the primers</Note>
    </Figure>
  );
}

export function GelDiagram(options: FigureOptions) {
  const gel = gelById("1.0");
  const ladder = ladderBands(ladderById("1kb").sizes, gel);
  const lanes = [
    { label: "Uncut", bands: bandsOf([3000], gel) },
    { label: "Cut", bands: bandsOf([1850, 835, 315], gel) },
  ];
  const top = 44;
  const bottom = 226;
  const y = (band: Band) => top + band.position * (bottom - top);
  // Label a ladder band only if it sits clear of the last one labelled.
  const labelled = ladder.reduce<{ last: number; sizes: Set<number> }>(
    (acc, band) => (y(band) - acc.last >= 11 ? { last: y(band), sizes: acc.sizes.add(band.size) } : acc),
    { last: -Infinity, sizes: new Set() },
  ).sizes;
  const grey = "#8f979f";
  return (
    <Figure
      width={320}
      height={244}
      description="A gel with three lanes: a ladder of known sizes, an uncut sample with one band at 3,000 base pairs, and a cut sample with bands at 1,850, 835 and 315 base pairs. Smaller fragments are further down."
      caption="DNA is loaded at the top and pulled towards the positive electrode. The uncut lane has one large band; cutting it gives three smaller ones, which run further. The ladder on the left gives the scale."
      {...options}
    >
      <rect width={320} height={244} rx={8} fill="#12161a" />
      <Note x={14} y={top + 4} fill={grey} size={14} bold>−</Note>
      <Note x={14} y={bottom + 4} fill={grey} size={14} bold>+</Note>
      <Arrow from={[18, top + 16]} to={[18, bottom - 14]} color={grey} />
      {["Ladder", ...lanes.map((l) => l.label)].map((label, i) => (
        <g key={label}>
          <Note x={103 + i * 70} y={16} anchor="middle" fill={grey} size={10} mono>{label}</Note>
          <rect x={80 + i * 70} y={24} width={46} height={7} rx={1.5} fill="#05070a" stroke="#2c343c" />
        </g>
      ))}
      {ladder.map((band) => {
        const show = labelled.has(band.size);
        return (
          <g key={band.size}>
            <rect x={82} y={y(band) - 1.25} width={42} height={2.5} rx={1} fill="#cfd6dc" opacity={0.75} />
            {show && <Note x={74} y={y(band) + 3} anchor="end" fill={grey} size={9} mono>{band.size.toLocaleString("en-US")}</Note>}
          </g>
        );
      })}
      {lanes.map((lane, i) =>
        lane.bands.map((band) => (
          <g key={`${lane.label}${band.size}`}>
            <rect x={152 + i * 70} y={y(band) - 2} width={42} height={4} rx={1.5} fill="#f6f1df" opacity={0.5 + 0.5 * band.intensity} />
            {i === lanes.length - 1 && <Note x={270} y={y(band) + 3} fill="#f6f1df" size={9} mono>{band.size.toLocaleString("en-US")}</Note>}
          </g>
        )),
      )}
    </Figure>
  );
}

// --- Comparing sequences --------------------------------------------------------------------------

export function AlignmentDiagram({ mode = "global", ...options }: FigureOptions & { mode?: "global" | "local" }) {
  const x = 110;
  if (mode === "local") {
    const core = "GATTACA";
    const rows = [
      { left: "TTCC", right: "GG" },
      { left: "AA", right: "TTCGA" },
    ];
    const lead = Math.max(...rows.map((r) => r.left.length));
    const columns = lead + core.length + Math.max(...rows.map((r) => r.right.length));
    return (
      <Figure
        width={x + columns * CELL + 20}
        height={118}
        description={`Two sequences that share the stretch ${core} in the middle. Only that stretch is aligned and boxed; the unrelated ends are left out.`}
        caption="A local alignment keeps only the best-matching part of each sequence and ignores the rest."
        {...options}
      >
        <rect x={x + lead * CELL - 3} y={18} width={core.length * CELL + 6} height={78} rx={6} fill="var(--accent-soft)" stroke="var(--accent)" />
        {rows.map((row, i) => {
          const text = row.left + core + row.right;
          const start = x + (lead - row.left.length) * CELL;
          const y = 40 + i * 48;
          return (
            <g key={i}>
              <Note x={12} y={y - 1} size={12} bold fill="var(--ink)">Sequence {i + 1}</Note>
              <Letters x={start} y={y} text={text} opacity={(j) => (j >= row.left.length && j < row.left.length + core.length ? 1 : 0.35)} />
            </g>
          );
        })}
        {[...core].map((_, i) => (
          <line key={i} x1={x + (lead + i) * CELL + CELL / 2} x2={x + (lead + i) * CELL + CELL / 2} y1={50} y2={70} stroke="var(--accent)" strokeWidth={2} />
        ))}
      </Figure>
    );
  }

  const top = "GATTACAG-TC";
  const bottom = "GAT-ACTGATC";
  const kind = (i: number) => (top[i] === "-" || bottom[i] === "-" ? "gap" : top[i] === bottom[i] ? "match" : "mismatch");
  const counts = { match: 0, mismatch: 0, gap: 0 };
  [...top].forEach((_, i) => counts[kind(i)]++);
  const gapFill = (char: string) => (char === "-" ? "var(--muted)" : baseColor(char));
  return (
    <Figure
      width={x + top.length * CELL + 20}
      height={140}
      description={`Two sequences aligned in ${top.length} columns: ${counts.match} matches, ${counts.mismatch} mismatch and ${counts.gap} gaps, one in each sequence.`}
      caption="Every column is a match, a mismatch or a gap. This is a global alignment: both sequences are lined up from end to end."
      {...options}
    >
      {[...top].map((_, i) => kind(i) === "gap" && <rect key={i} x={x + i * CELL + 1} y={20} width={CELL - 2} height={76} rx={5} fill="var(--sunken)" />)}
      <Note x={12} y={39} size={12} bold fill="var(--ink)">Sequence 1</Note>
      <Note x={12} y={87} size={12} bold fill="var(--ink)">Sequence 2</Note>
      <Letters x={x} y={40} text={top} fill={gapFill} />
      <Letters x={x} y={88} text={bottom} fill={gapFill} />
      {[...top].map((_, i) => {
        const cx = x + i * CELL + CELL / 2;
        if (kind(i) === "match") return <line key={i} x1={cx} x2={cx} y1={50} y2={70} stroke="var(--accent)" strokeWidth={2} />;
        if (kind(i) === "mismatch") return <circle key={i} cx={cx} cy={60} r={3} fill="var(--base-t)" />;
        return null;
      })}
      <line x1={x} x2={x} y1={118} y2={130} stroke="var(--accent)" strokeWidth={2} />
      <Note x={x + 8} y={128}>match</Note>
      <circle cx={x + 62} cy={124} r={3} fill="var(--base-t)" />
      <Note x={x + 70} y={128}>mismatch</Note>
      <Note x={x + 138} y={128} mono bold>-</Note>
      <Note x={x + 150} y={128}>gap</Note>
    </Figure>
  );
}

export function MotifDiagram(options: FigureOptions) {
  const sites = ["TATAAT", "TATGAT", "TACAAT", "TATACT", "GATAAT", "TATAAT", "TTTAAT", "TATATT"];
  const length = sites[0].length;
  const columns = Array.from({ length }, (_, p) => {
    const counts = new Map<string, number>();
    for (const site of sites) counts.set(site[p], (counts.get(site[p]) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  });
  const chartTop = 16;
  const chartHeight = 124;
  const consensus = columns.map((c) => c[0][0]).join("");
  return (
    <Figure
      width={480}
      height={166}
      description={`Eight example binding sites, six bases each, listed on the left. On the right, one stacked bar per position shows how often each base occurs there. The most common base at each position spells ${consensus}.`}
      caption={`Eight known sites on the left; on the right, how often each base appears at each position. No single site need match the most common pattern, ${consensus}, exactly.`}
      {...options}
    >
      {sites.map((site, i) => (
        <Letters key={i} x={16} y={30 + i * 15} text={site} cell={13} size={12} />
      ))}
      <Note x={16} y={160} size={10}>8 known sites</Note>
      {columns.map((column, p) => {
        let offset = 0;
        const left = 160 + p * 50;
        return (
          <g key={p}>
            {column.map(([base, count]) => {
              const height = (count / sites.length) * chartHeight;
              const y = chartTop + chartHeight - offset - height;
              offset += height;
              return (
                <g key={base}>
                  <rect x={left} y={y + 0.75} width={38} height={Math.max(0, height - 1.5)} rx={2} fill={baseColor(base)} />
                  {height >= 15 && (
                    <text x={left + 19} y={y + height / 2 + 4.5} textAnchor="middle" fontFamily={MONO} fontSize={13} fontWeight={700} fill="var(--surface)">{base}</text>
                  )}
                </g>
              );
            })}
            <Note x={left + 19} y={158} anchor="middle" mono>{p + 1}</Note>
          </g>
        );
      })}
    </Figure>
  );
}

export function TreeDiagram({ support = false, ...options }: FigureOptions & { support?: boolean }) {
  const line = { stroke: "var(--ink)", strokeWidth: 2, fill: "none", strokeLinejoin: "round" as const };
  const tips = [
    { name: "A", x: 230, y: 30 },
    { name: "B", x: 255, y: 60 },
    { name: "C", x: 240, y: 95 },
    { name: "D", x: 215, y: 135 },
  ];
  return (
    <Figure
      width={support ? 480 : 400}
      height={support ? 156 : 186}
      description={
        support
          ? "A tree with four tips, A, B, C and D. The fork joining A and B is labelled 98 and the fork joining them to C is labelled 62."
          : "A tree with four tips, A, B, C and D. A and B share the most recent common ancestor and are boxed as a clade; C joins them next, and D branches off first. The same tree is written beneath in Newick notation as (((A,B),C),D);"
      }
      caption={
        support
          ? "The number at each fork is its bootstrap support. A and B grouped together in 98 of 100 resampled trees, so that grouping is solid. The grouping with C appeared in only 62, so it is less certain."
          : "Tips are what exists today and forks are inferred common ancestors. The boxed branch, A and B with their ancestor, is one clade. The last line is the same tree in Newick notation."
      }
      {...options}
    >
      <rect x={140} y={14} width={146} height={60} rx={8} fill="var(--accent-soft)" />
      <Note x={294} y={48} fill="var(--accent)" bold>{support ? "in 98 of 100 resampled trees" : "a clade"}</Note>
      <path d="M40,70 V135 M40,70 H95 M40,135 H215" {...line} />
      <path d="M95,45 V95 M95,45 H150 M95,95 H240" {...line} />
      <path d="M150,30 V60 M150,30 H230 M150,60 H255" {...line} />
      {[
        [40, 102],
        [95, 70],
        [150, 45],
      ].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r={4} fill="var(--ink)" />
      ))}
      {tips.map((tip) => (
        <Note key={tip.name} x={tip.x + 8} y={tip.y + 4} size={13} bold mono fill="var(--ink)">{tip.name}</Note>
      ))}
      {support ? (
        <>
          <Note x={145} y={39} anchor="end" mono bold fill="var(--accent)" size={12}>98</Note>
          <Note x={90} y={64} anchor="end" mono bold fill="var(--base-g)" size={12}>62</Note>
        </>
      ) : (
        <>
          <Note x={244} y={139}>← a tip</Note>
          <Note x={102} y={84}>common ancestor</Note>
          <Note x={128} y={128} anchor="middle">branch length</Note>
          <text x={40} y={172} fontFamily={MONO} fontSize={13} fill="var(--ink)">(((A,B),C),D);</text>
        </>
      )}
    </Figure>
  );
}

// --- Structure ------------------------------------------------------------------------------------

export function StructureDiagram({ highlight = "all", ...options }: FigureOptions & { highlight?: "all" | "residue" }) {
  const box = (x: number, y: number, w: number, h: number, label: string, strong = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={strong ? "var(--accent-soft)" : "none"} stroke={strong ? "var(--accent)" : "var(--line)"} strokeWidth={1.5} />
      <Note x={x + 10} y={y + 16} bold fill="var(--ink)">{label}</Note>
    </g>
  );
  const residues = ["Met", "Ala", "Ile", "Val"];
  const atoms = ["N", "CA", "C", "O", "CB"];
  return (
    <Figure
      width={520}
      height={190}
      description="Nested boxes. A structure contains a model; the model contains chain A and chain B; chain A contains the residues Met, Ala, Ile and Val; and the residue Ala contains the atoms N, CA, C, O and CB."
      caption={
        highlight === "residue"
          ? "One residue, alanine, is highlighted with its five atoms. Residues sit in chains, chains in models, and models in a structure."
          : "A structure file is a hierarchy: structure, model, chain, residue, atom. Each level contains the next."
      }
      {...options}
    >
      {box(10, 8, 500, 174, "Structure")}
      {box(22, 30, 476, 142, "Model")}
      {box(34, 52, 310, 110, "Chain A")}
      {box(354, 52, 132, 110, "Chain B")}
      {residues.map((name, i) => {
        const chosen = i === 1;
        return (
          <g key={name}>
            <rect x={46 + i * 72} y={76} width={64} height={24} rx={5} fill={chosen ? "var(--accent-soft)" : "var(--sunken)"} stroke={chosen ? "var(--accent)" : "var(--line)"} />
            <Note x={78 + i * 72} y={92} anchor="middle" mono fill="var(--ink)">{name}</Note>
          </g>
        );
      })}
      {["Gly", "Ser"].map((name, i) => (
        <g key={name}>
          <rect x={366 + i * 56} y={76} width={48} height={24} rx={5} fill="var(--sunken)" stroke="var(--line)" />
          <Note x={390 + i * 56} y={92} anchor="middle" mono fill="var(--ink)">{name}</Note>
        </g>
      ))}
      <path d="M150,100 L56,122 M150,100 L228,122" fill="none" stroke="var(--accent)" strokeDasharray="3 3" />
      {atoms.map((atom, i) => (
        <g key={atom}>
          <circle cx={68 + i * 37} cy={136} r={12} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.5} />
          <Note x={68 + i * 37} y={140} anchor="middle" size={10} mono fill="var(--ink)">{atom}</Note>
        </g>
      ))}
      <Note x={244} y={140}>atoms of one residue</Note>
    </Figure>
  );
}

// --- Lookup ---------------------------------------------------------------------------------------


/**
 * Light through a cuvette: what a spectrophotometer does, and what a culture does to it instead.
 *
 * @param props - `scatters` draws a sample that throws the light out of the beam rather than taking
 *   it up, which is what a culture does and why its reading is not an absorbance.
 */
export function BeamDiagram({ scatters = false, ...options }: FigureOptions & { scatters?: boolean }) {
  const [lamp, left, right, cell] = [52, 162, 262, 372];
  const mid = 92;
  // The beam in pieces, each at the light left in it, so the fall across the cuvette is visible.
  const through = scatters ? 0.3 : 0.38;
  const pieces = Array.from({ length: 20 }, (_, at) => {
    const from = lamp + ((cell - lamp) * at) / 20;
    const to = lamp + ((cell - lamp) * (at + 1)) / 20;
    const middle = (from + to) / 2;
    const left_ = middle <= left ? 1 : middle >= right ? through : through ** ((middle - left) / (right - left));
    return { from, to, left: left_ };
  });
  const colour = scatters ? "var(--base-g)" : "var(--accent)";
  return (
    <Figure
      width={430}
      height={186}
      description={scatters
        ? "Light from a lamp crosses a cuvette of cells and reaches a detector. Inside the cuvette some of it leaves sideways, so less arrives: 30 per cent of what set out."
        : "Light from a lamp crosses a cuvette of sample and reaches a detector. The beam dims across the cuvette as the sample takes it up, so 38 per cent of what set out arrives."}
      caption={scatters
        ? "Cells do not take the light up; they scatter it out of the beam. Less arrives, so the number looks like an absorbance — but Beer's law does not hold for it, and how much is lost depends on where the detector sits."
        : "The sample takes up part of the light. Absorbance is the logarithm of how much was stopped: 1.0 is a tenth getting through, 2.0 a hundredth."}
      {...options}
    >
      <rect x={left} y={mid - 46} width={right - left} height={92} rx={3} fill="var(--sunken)" stroke="var(--line)" />
      <line x1={left} y1={mid - 24} x2={right} y2={mid - 24} stroke="var(--line)" strokeWidth={1} />
      {pieces.map((piece) => (
        <line key={piece.from} x1={piece.from} y1={mid} x2={piece.to} y2={mid} stroke={colour} strokeWidth={3} opacity={Math.max(0.08, piece.left)} />
      ))}
      {scatters && [0, 1, 2, 3, 4, 5].map((at) => {
        const x = left + ((right - left) * (at + 0.5)) / 6;
        const away = at % 2 === 0 ? -1 : 1;
        return <line key={at} x1={x} y1={mid} x2={x + (at % 3) * 6 - 6} y2={mid + away * (28 + (at % 3) * 8)} stroke={colour} strokeWidth={1.4} opacity={0.5} />;
      })}
      <circle cx={lamp - 14} cy={mid} r={12} fill="none" stroke="var(--muted)" strokeWidth={1.5} />
      <line x1={cell} y1={mid - 22} x2={cell} y2={mid + 22} stroke="var(--muted)" strokeWidth={4} />
      <Note x={lamp - 14} y={mid - 24} anchor="middle">lamp</Note>
      <Note x={lamp - 14} y={mid + 34} anchor="middle" mono>100%</Note>
      <Note x={(left + right) / 2} y={mid + 62} anchor="middle">{scatters ? "a culture" : "the sample"}</Note>
      <Note x={cell} y={mid - 30} anchor="middle">detector</Note>
      <Note x={cell} y={mid + 38} anchor="middle" mono bold fill="var(--ink)">{Math.round(through * 100)}%</Note>
    </Figure>
  );
}


/**
 * A cuvette between two electrodes: the gap, the field it makes, and the cells in it.
 *
 * It draws the same thing twice, in two cuvettes, at one voltage — because the one thing worth
 * knowing here is that the same setting is two different fields in two different gaps.
 */
export function PulseDiagram(options: FigureOptions) {
  const volts = 1_500;
  const mid = 96;
  const cuvettes = [
    { gap: 1, x: 112, half: 22 },
    { gap: 2, x: 300, half: 44 },
  ];
  return (
    <Figure
      width={440}
      height={176}
      description="The same 1,500 volts across a 1 mm gap and a 2 mm gap. The narrow cuvette is in 15 kV/cm and the wide one in 7.5 kV/cm: the same setting, half the field."
      caption="What a protocol writes down is a voltage; what the cells are in is a field, which is that voltage divided by the gap. The same setting in a cuvette twice as wide is half the field, and the machine does not know which cuvette is in it."
      {...options}
    >
      {cuvettes.map(({ gap, x, half }) => {
        const strength = (volts / 1000) / (gap / 10);
        const hard = strength / 15;
        return (
          <g key={gap}>
            {[0, 1, 2, 3, 4, 5, 6].map((at) => {
              const y = mid - 36 + at * 12;
              return <line key={at} x1={x - half} y1={y} x2={x + half} y2={y} stroke="var(--base-g)" strokeWidth={1.2} opacity={0.25 + hard * 0.6} />;
            })}
            {[0, 1, 2, 3].map((at) => (
              <circle key={at} cx={x - half + ((at + 0.5) * half * 2) / 4} cy={mid} r={Math.min(7, half / 2.4)} fill="none" stroke="var(--ink)" strokeWidth={1.4} opacity={0.75} />
            ))}
            <line x1={x - half} y1={mid - 48} x2={x - half} y2={mid + 48} stroke="var(--muted)" strokeWidth={4} />
            <line x1={x + half} y1={mid - 48} x2={x + half} y2={mid + 48} stroke="var(--muted)" strokeWidth={4} />
            <line x1={x - half} y1={mid + 58} x2={x + half} y2={mid + 58} stroke="var(--line)" strokeWidth={1.2} />
            <Note x={x} y={mid + 74} anchor="middle" mono>{gap} mm</Note>
            <Note x={x} y={mid - 58} anchor="middle" mono bold fill="var(--ink)">{strength} kV/cm</Note>
          </g>
        );
      })}
      <Note x={220} y={18} anchor="middle" bold fill="var(--ink)">{volts.toLocaleString("en-US")} V in both</Note>
    </Figure>
  );
}


/**
 * A lane drawn as a profile, where the two things a gel photograph hides are visible.
 *
 * With `byMass` it shows two bands at the same number of molecules, one six times the length of
 * the other, so the shorter one is a sixth the height — which in a photograph looks like failure.
 * Without it, two peaks against the line where the camera gives out, one of them with its top cut
 * off, which is what a saturated band is and what no photograph can show.
 */
export function ExposureDiagram({ byMass = false, ...options }: FigureOptions & { byMass?: boolean }) {
  const [left, right, floor, tall] = [40, 400, 136, 104];
  const peaks = byMass
    ? [{ at: 0.3, high: 1, label: "3,000 bp" }, { at: 0.7, high: 1 / 6, label: "500 bp" }]
    : [{ at: 0.3, high: 1.45, label: "cut off" }, { at: 0.7, high: 0.55, label: "a peak" }];
  const ceiling = byMass ? 1.25 : 1;
  const at = (fraction: number): number => left + fraction * (right - left);
  const high = (value: number): number => floor - Math.min(ceiling, value) * tall;
  const points = Array.from({ length: 73 }, (_, index) => {
    const along = index / 72;
    const value = peaks.reduce((sum, peak) => sum + peak.high * Math.exp(-(((along - peak.at) / 0.055) ** 2)), 0);
    return `${at(along)},${high(value)}`;
  }).join(" ");
  return (
    <Figure
      width={440}
      height={186}
      description={byMass
        ? "Two bands holding the same number of molecules, drawn as a profile along the lane. The 3,000 bp one is six times the height of the 500 bp one, because the stain binds along the DNA."
        : "Two bands drawn as a profile along the lane, against the line where the camera stops recording. One peak is below it; the other has its top cut off by it."}
      caption={byMass
        ? "The same number of molecules in both. The stain binds along the DNA, so the longer band is six times brighter — which is why a short insert beside its vector looks like it failed when it did not."
        : "A photograph shows both of these as a bright band. Only the profile shows that one of them has run into the top of what the camera records, where a brighter band would look no different."}
      {...options}
    >
      <line x1={left} y1={floor} x2={right} y2={floor} stroke="var(--line)" strokeWidth={1.4} />
      {!byMass && (
        <>
          <line x1={left} y1={high(ceiling)} x2={right} y2={high(ceiling)} stroke="var(--base-t)" strokeWidth={1.4} strokeDasharray="5 4" />
          <Note x={right} y={high(ceiling) - 7} anchor="end" fill="var(--base-t)">as bright as the camera records</Note>
        </>
      )}
      <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinejoin="round" />
      {peaks.map((peak) => (
        <g key={peak.label}>
          <line x1={at(peak.at)} y1={floor} x2={at(peak.at)} y2={floor + 8} stroke="var(--muted)" strokeWidth={1.2} />
          <Note x={at(peak.at)} y={floor + 22} anchor="middle" mono>{peak.label}</Note>
        </g>
      ))}
      <Note x={left} y={floor + 22} anchor="start">wells</Note>
      <Note x={right} y={floor + 22} anchor="end">front</Note>
    </Figure>
  );
}


/**
 * Three rotors seen from above: one unbalanced, two balanced in different ways.
 *
 * The arrow on the first is where its load pulls. The other two pull nowhere, which is what
 * balanced means and why three tubes evenly spaced is as good as two opposite each other.
 */
export function RotorDiagram(options: FigureOptions) {
  const rotors = [
    { x: 86, loaded: [0], says: "one tube" },
    { x: 226, loaded: [0, 6], says: "two, opposite" },
    { x: 366, loaded: [0, 4, 8], says: "three, evenly spaced" },
  ];
  const [positions, radius, ring, hole] = [12, 54, 38, 7];
  const mid = 84;
  return (
    <Figure
      width={452}
      height={188}
      description="Three rotors of twelve positions seen from above. One holds a single tube and an arrow points from the axis to where its load pulls. One holds two opposite each other and one holds three evenly spaced; neither pulls anywhere."
      caption="A balanced rotor is one where what the tubes pull adds up to nothing. Two opposite each other do; so do three evenly spaced, which looks wrong and is not. One on its own does not, and at full speed that is what destroys a centrifuge."
      {...options}
    >
      {rotors.map(({ x, loaded, says }) => {
        const angle = (at: number): number => (at / positions) * Math.PI * 2 - Math.PI / 2;
        const pullX = loaded.reduce((sum, at) => sum + Math.cos(angle(at)), 0) / loaded.length;
        const pullY = loaded.reduce((sum, at) => sum + Math.sin(angle(at)), 0) / loaded.length;
        const out = Math.hypot(pullX, pullY) > 0.02;
        return (
          <g key={says}>
            <circle cx={x} cy={mid} r={radius} fill="none" stroke="var(--line)" strokeWidth={1.5} />
            {Array.from({ length: positions }, (_, at) => (
              <circle key={at} cx={x + Math.cos(angle(at)) * ring} cy={mid + Math.sin(angle(at)) * ring} r={hole}
                      fill={loaded.includes(at) ? "var(--base-g)" : "none"} stroke={loaded.includes(at) ? "var(--base-g)" : "var(--line)"} strokeWidth={1.4} />
            ))}
            {out
              ? <Arrow from={[x, mid]} to={[x + pullX * ring * 0.8, mid + pullY * ring * 0.8]} color="var(--base-t)" width={2} />
              : <circle cx={x} cy={mid} r={3} fill="var(--accent)" />}
            <Note x={x} y={mid + radius + 20} anchor="middle">{says}</Note>
            <Note x={x} y={mid + radius + 34} anchor="middle" fill={out ? "var(--base-t)" : "var(--accent)"}>{out ? "pulls off the axis" : "pulls nowhere"}</Note>
          </g>
        );
      })}
    </Figure>
  );
}


/**
 * One plate at three times: too early, ready, and left too long.
 *
 * The last of the three is the one worth drawing. The colonies have run together, so no one of them
 * is one colony any more, and the small marks round them are satellites that took nothing up.
 */
export function PlateDiagram(options: FigureOptions) {
  const plates = [
    { x: 86, says: "too early", grown: 0.25, satellites: false, touching: false },
    { x: 226, says: "ready", grown: 1, satellites: false, touching: false },
    { x: 366, says: "left too long", grown: 2.4, satellites: true, touching: true },
  ];
  const [radius, mid] = [54, 80];
  // The same scatter on every plate, so what changes across them is the growing and nothing else.
  const spots = [[-0.45, -0.3], [0.2, -0.5], [0.5, 0.25], [-0.25, 0.45], [-0.6, 0.15], [0.05, 0.05]];
  return (
    <Figure
      width={452}
      height={168}
      description="One plate at three times. Early there is almost nothing on it; ready there are six separate colonies; left too long they have grown into each other and small satellite colonies have come up around them."
      caption="A colony is a clone, so the point of a plate is colonies that are separate. Left too long they run together and the one you pick is not one colony — and on ampicillin, small satellites come up in the ring each colony has cleared of the drug."
      {...options}
    >
      {plates.map(({ x, says, grown, satellites, touching }) => (
        <g key={says}>
          <circle cx={x} cy={mid} r={radius} fill="none" stroke="var(--line)" strokeWidth={1.5} />
          {spots.map(([sx, sy], at) => (
            <g key={at}>
              <circle cx={x + sx! * radius * 0.78} cy={mid + sy! * radius * 0.78} r={Math.max(1, 7 * grown)}
                      fill="none" stroke={touching ? "var(--base-t)" : "var(--accent)"} strokeWidth={1.8} />
              {satellites && [0, 1, 2].map((which) => (
                <circle key={which} cx={x + sx! * radius * 0.78 + Math.cos(which * 2.1) * 13} cy={mid + sy! * radius * 0.78 + Math.sin(which * 2.1) * 13}
                        r={1.8} fill="none" stroke="var(--muted)" strokeWidth={1.2} />
              ))}
            </g>
          ))}
          <Note x={x} y={mid + radius + 20} anchor="middle">{says}</Note>
        </g>
      ))}
    </Figure>
  );
}

/** The diagram for a glossary entry (or one of the extra lesson pictures), or null if it has none. */
export function TermDiagram({ slug, ...options }: FigureOptions & { slug: string }) {
  switch (slug) {
    case "cell":
      return <CellDiagram {...options} />;
    case "dna":
      return <DuplexDiagram {...options} />;
    case "rna":
      return <DnaRnaDiagram {...options} />;
    case "nucleotide":
      return <NucleotideDiagram {...options} />;
    case "amino-acid":
      return <AminoAcidDiagram {...options} />;
    case "enzyme":
      return <EnzymeDiagram {...options} />;
    case "chromosome":
      return <ZoomDiagram {...options} />;
    case "genome":
      return <GenomeSizeDiagram {...options} />;
    case "units":
      return <UnitsDiagram {...options} />;
    case "exons-and-introns":
      return <SplicingDiagram {...options} />;
    case "start-and-stop-codons":
    case "open-reading-frame":
      return <OrfDiagram {...options} />;
    // Not glossary terms: pictures used only by the Start here lessons.
    case "protein-fold":
      return <ProteinFoldDiagram {...options} />;
    case "pipeline":
      return <PipelineDiagram {...options} />;
    case "base":
      return <DuplexDiagram highlight="base" {...options} />;
    case "base-pair":
      return <DuplexDiagram highlight="pair" {...options} />;
    case "strand-direction":
      return <DuplexDiagram {...options} />;
    case "complement":
    case "reverse-complement":
      return <ReverseComplementDiagram {...options} />;
    case "gc-content":
      return <GcDiagram {...options} />;
    case "melting-temperature":
      return <MeltingDiagram {...options} />;
    case "gene":
    case "promoter":
    case "feature":
      return <FeatureDiagram {...options} />;
    case "transcription":
      return <CentralDogmaDiagram {...options} />;
    case "translation":
    case "codon":
      return <CodonDiagram {...options} />;
    case "genetic-code":
      return <GeneticCodeDiagram {...options} />;
    case "reading-frame":
      return <ReadingFrameDiagram {...options} />;
    case "mutation":
      return <MutationDiagram {...options} />;
    case "plasmid":
      return <PlasmidDiagram {...options} />;
    case "coordinates":
      return <CoordinateDiagram {...options} />;
    case "fasta":
      return <FileFormatDiagram format="fasta" {...options} />;
    case "fastq":
      return <FileFormatDiagram format="fastq" {...options} />;
    case "restriction-enzyme":
    case "sticky-end":
    case "ligation":
      return <CutDiagram enzyme="EcoRI" {...options} />;
    case "blunt-end":
      return <CutDiagram enzyme="SmaI" {...options} />;
    case "primer":
    case "pcr":
      return <PcrDiagram {...options} />;
    case "gc-clamp":
      return <PrimerEndDiagram kind="clamp" {...options} />;
    case "hairpin":
      return <PrimerEndDiagram kind="hairpin" {...options} />;
    case "primer-dimer":
      return <PrimerEndDiagram kind="dimer" {...options} />;
    case "gel-electrophoresis":
      return <GelDiagram {...options} />;
    case "ladder":
      return <GelDiagram {...options} />;
    case "saturation":
      return <ExposureDiagram {...options} />;
    case "colony":
    case "satellite-colony":
    case "doubling-time":
      return <PlateDiagram {...options} />;
    case "relative-centrifugal-force":
    case "centrifuge-balance":
    case "pellet":
      return <RotorDiagram {...options} />;
    case "band-intensity":
      return <ExposureDiagram byMass {...options} />;
    case "spectrophotometer":
    case "absorbance":
      return <BeamDiagram {...options} />;
    case "optical-density":
      return <BeamDiagram scatters {...options} />;
    case "electroporation":
    case "time-constant":
    case "transformation":
      return <PulseDiagram {...options} />;
    case "alignment":
    case "gap":
      return <AlignmentDiagram {...options} />;
    case "motif":
      return <MotifDiagram {...options} />;
    case "phylogenetic-tree":
    case "clade":
    case "newick":
      return <TreeDiagram {...options} />;
    case "bootstrap":
      return <TreeDiagram support {...options} />;
    case "sequencing":
    case "read":
      return <SequencingDiagram {...options} />;
    case "vector-and-insert":
      return <VectorInsertDiagram {...options} />;
    case "transformation":
    case "selection":
      return <TransformationDiagram {...options} />;
    case "induction":
    case "sds-page":
      return <InductionDiagram {...options} />;
    case "signal-peptide":
      return <SignalPeptideDiagram {...options} />;
    case "gibson-assembly":
      return <GibsonDiagram {...options} />;
    case "homology":
      return <HomologyDiagram {...options} />;
    case "identity-and-similarity":
      return <IdentityDiagram {...options} />;
    case "substitution-matrix":
      return <MatrixDiagram {...options} />;
    case "backbone-and-side-chain":
      return <AminoAcidDiagram {...options} />;
    case "secondary-structure":
      return <SecondaryStructureDiagram {...options} />;
    case "rmsd":
      return <RmsdDiagram {...options} />;
    case "protein":
      return <StructureDiagram {...options} />;
    case "residue":
      return <StructureDiagram highlight="residue" {...options} />;
    default:
      return null;
  }
}
