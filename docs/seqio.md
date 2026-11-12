# @biolibs/seqio

Parse and write sequence file formats, equivalent to Biopython's `Bio.SeqIO`. All functions operate on **text** (strings), not files or streams, so they work in Node and the browser. Read files yourself (`fs.readFileSync(path, "utf8")`) and pass the contents in. Records are `SeqRecord` objects from `@biolibs/core`.

## FASTA

### `parseFasta(text): SeqRecord[]`
- Header line `>id description` gives `id` (first token) and `description` (the full header, as Biopython does).
- Multi-line sequences are joined; whitespace is stripped.
- Blank lines and `;` comment lines are skipped.
- Throws `BioError` if sequence data appears before any `>` header.

### `writeFasta(records, lineWidth = 60): string`
Writes `>description` (falling back to `id`) and wraps the sequence at `lineWidth`.

```ts
const recs = parseFasta(">a first\nACGT\nAC\n");
// [{ id: "a", description: "a first", sequence: "ACGTAC" }]
writeFasta(recs, 4); // ">a first\nACGT\nAC\n"
```

## FASTQ

### `parseFastq(text): SeqRecord[]`
Strict 4-line FASTQ. Qualities are decoded as Phred+33 into `record.quality`. Throws `BioError` if:
- the line count is not a multiple of 4,
- a header doesn't start with `@` or the separator doesn't start with `+`,
- sequence and quality lengths differ.

Multi-line FASTQ is not supported.

### `writeFastq(records): string`
Throws if a record has no `quality`.

### `decodePhred(qualityString, offset = 33): number[]`
### `encodePhred(scores, offset = 33): string`
Use `offset = 64` for old Illumina 1.3–1.7 data.

```ts
const [r] = parseFastq("@r1\nACGT\n+\nIIII\n");
r.quality; // [40, 40, 40, 40]
```

## GenBank

### `parseGenBank(text): SeqRecord[]`
Minimal parser for GenBank flat files (multiple entries separated by `//`).

| Record field | Source |
|---|---|
| `id` | First `ACCESSION` (falls back to the LOCUS name) |
| `description` | `DEFINITION` (continuation lines joined) |
| `sequence` | `ORIGIN` block, digits and spaces removed (case preserved) |
| `annotations.locus` | LOCUS name |
| `annotations.length` | Length declared on the LOCUS line |
| `annotations.version` | `VERSION` |
| `annotations.organism` | `ORGANISM` |
| `annotations.featuresRaw` | Raw text of the `FEATURES` table |

Throws `BioError` if an entry lacks a LOCUS line. Feature-table parsing and a GenBank writer are not implemented yet.

## Not yet supported

GenBank features and writer, EMBL, Stockholm, gzip streaming, indexed random access.
