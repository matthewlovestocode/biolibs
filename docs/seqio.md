# @biolibs/seqio

A TypeScript port of Biopython's `Bio.SeqIO`: read and write sequence files as `SeqRecord`s. Verified against Biopython 1.88 with about 25,000 recorded calls so far (FASTA, FASTQ/QUAL, GenBank, EMBL, IMGT, tab, PIR, SwissProt, PHD, IntelliGenetics, seqXML, nib, twoBit, GCK, xdna, ABIF, SnapGene and SFF); each further format is added and verified the same way. See [PARITY.md](../PARITY.md) for which formats are done.

```ts
import { parse, read, write, toDict, convert, StringHandle } from "@biolibs/seqio";

const fasta = ">a first record\nACGTAC\nGT\n>b\nTTGG\n";

for (const record of parse(fasta, "fasta")) console.log(record.id, record.seq!.toString()); // a ACGTACGT, b TTGG

const out = new StringHandle();
write(parse(fasta, "fasta"), out, "fasta-2line");
out.getvalue();        // ">a first record\nACGTACGT\n>b\nTTGG\n"
```

## No file system: text in, text out

Unlike Python, nothing here opens files, so the library works in Node and in the browser.

- **Inputs are the file's contents** as a string (a string is *never* a file name), or a `LineStream` over it. In Node: `parse(fs.readFileSync(path, "utf8"), "fasta")`.
- **Outputs are any object with `write(text)`**, such as `StringHandle` (like `io.StringIO`; call `.getvalue()`). A Node `fs.WriteStream` also works.
- Binary formats (`seqxml`) take **bytes** (`fs.readFileSync(path)`, a `Uint8Array`) and write to a byte target such as `BytesHandle` (`.getvalue()` returns a `Uint8Array`). Text given to a binary format, or bytes to a text format, throws `StreamModeError`, as in Biopython.
- Binary data passed to a text format throws `StreamModeError("Fasta files must be opened in text mode.")`, as in Biopython.
- Lines end at `"\n"` only (like `io.StringIO`); a `"\r"` stays in the text. Python's file objects translate `"\r\n"` for you; do that yourself if needed.

## Functions

| Python | TypeScript | Notes |
|---|---|---|
| `SeqIO.parse(handle, format)` | `parse(source, format)` | returns an iterator of records; `close()` releases it |
| `SeqIO.read(handle, format)` | `read(source, format)` | exactly one record, else `ValueError` |
| `SeqIO.write(records, handle, format)` | `write(records, target, format)` | returns the record count |
| `SeqIO.to_dict(records, key_function)` | `toDict(records, keyFunction?)` | returns a `Map`; duplicates raise `ValueError` |
| `SeqIO.convert(in, fmt, out, fmt, molecule_type)` | `convert(source, inFormat, target, outFormat, moleculeType?)` | uses Biopython's direct paths (FASTQ to anything, GenBank/EMBL to FASTA) and the general path otherwise |
| `SeqIO.index`, `SeqIO.index_db` | not yet | need file access |

Format names must be lower case (`"fasta"`, not `"FASTA"`); errors for bad names match Biopython's.

## Formats

| Format | Read | Write |
|---|---|---|
| `fasta` | yes | yes (wraps at 60) |
| `fasta-2line` | yes | yes (no wrapping) |
| `fasta-pearson` | yes | |
| `fasta-blast` | yes | |
| `fastq`, `fastq-sanger` | yes | yes |
| `fastq-solexa` | yes | yes |
| `fastq-illumina` | yes | yes |
| `qual` | yes | yes |
| `genbank`, `gb` | yes | yes |
| `genbank-cds` | yes (one record per CDS feature) | |
| `embl` | yes | yes |
| `embl-cds` | yes (one record per CDS feature) | |
| `imgt` | yes | yes |
| `tab` | yes | yes |
| `pir` | yes | yes (wraps at 60) |
| `swiss` | yes | |
| `phd` | yes | yes |
| `ig` | yes | |
| `seqxml` | yes (bytes) | yes (bytes) |
| `nib` | yes (bytes) | yes (bytes) |
| `twobit` | yes (bytes) | |
| `gck` | yes (bytes) | |
| `xdna` | yes (bytes) | yes (bytes) |
| `abi`, `abi-trim` | yes (bytes) | |
| `snapgene` | yes (bytes) | |
| `sff`, `sff-trim` | yes (bytes) | yes (bytes) |

`fasta` requires the file to begin with `>` (comments are an error with a helpful message); use `fasta-pearson` (`;` comments, text before the first `>` ignored) or `fasta-blast` (`#`, `!`, `;` comments) for those files. `fasta-blast` reproduces a bug in Biopython 1.88: after the first record it does not advance its saved header line, so later records reuse the first header. The output is identical to Biopython's.

### FASTQ and QUAL

- Scores are decoded to `letterAnnotations`: `phred_quality` for `fastq`/`fastq-sanger` (PHRED+33, 0 to 93) and `fastq-illumina` (PHRED+64, 0 to 62), `solexa_quality` for `fastq-solexa` (Solexa+64, -5 to 62). Characters outside the valid range raise `InvalidCharError`, which shows the character and its context.
- Writers accept either kind of score and convert (Solexa to PHRED and back), warning when values are capped. Missing, `None`/`null`, or unusable qualities raise the same errors as Biopython.
- `qual` records have an undefined sequence of the right length; negative scores become 0 with a warning. `pairedFastaQualIterator(fasta, qual)` merges a FASTA and a QUAL file.
- `fastqGeneralIterator(source)` yields raw `[title, sequence, quality]` strings with no decoding (fast, and used by the direct converters).
- Score helpers: `solexaQualityFromPhred`, `phredQualityFromSolexa` (identical numeric behaviour to Python, including banker's rounding and the overflow error for huge PHRED values).

### GenBank, EMBL and IMGT

- Readers follow Biopython's scanner/consumer split (`insdc/scanner.ts`, `genbank-scanner.ts`, `embl-scanner.ts`, `consumer.ts`): headers, references, comments, feature tables (locations, fuzzy positions, compound locations, qualifiers), `CONTIG`/`CO` and `ORIGIN`/`SQ` sequences, including the same warnings and `ValueError`/`ParserFailureError` messages for malformed input.
- Writers (`GenBankWriter`, `EmblWriter`, `ImgtWriter`) reproduce Biopython's column layout exactly, including its validity checks (LOCUS name and length limits, missing `molecule_type`, bad dates and divisions, undefined sequences with `contig` annotation).
- `record.format("genbank" | "embl" | "imgt")` works, and `convert` uses the direct GenBank/EMBL to FASTA paths.

### tab, PIR and SwissProt

- `tab`: one `title<TAB>sequence` line per record; a line with any other number of tabs is a `ValueError` (blank lines are skipped).
- `pir`: NBRF files (`>P1;ID`, description, sequence ending in `*`). The type code goes to `annotations["PIR-type"]`. `PirWriter(target, wrap = 60, record2title = null, code = null)` picks `D1`/`RL`/`P1`/`XX` from `molecule_type` unless `code` is given.
- `swiss`: UniProt/SwissProt text entries. The first accession is the `id`; cross-references become `dbxrefs`; `FT` lines become features; references become `Reference` objects. The underlying parser is also exported as `parseSwissProt(text)` / `readSwissProt(text)` (Biopython's `Bio.SwissProt`), producing `SwissProtRecord` objects whose fields are camelCased (`entryName`, `geneName`, `proteinExistence`, ...). Parse failures are `SwissProtParserError` (a `ValueError`, with the bad `line`).

### PHD, IntelliGenetics and seqXML

- `phd` (PHRED output): the `BEGIN_COMMENT` fields become `annotations` (absent ones are `null`); `phred_quality` and, when every site has one, `peak_location` become per-letter annotations. `PhdWriter` writes them back.
- `ig`: IntelliGenetics/MASE files; comment lines go to `annotations["comment"]`.
- `seqxml` (versions 0.1 to 0.4): reads and writes. There is no expat in the browser, so a small XML scanner in `seqxml/` produces the same events, and the reader feeds them 1024 bytes at a time exactly as Biopython does, so an error late in a file appears only after the earlier records. Handler errors (`ValueError`, `RuntimeError`, ...) match Biopython. Malformed XML raises `SAXParseException`, but its message text is our own and does not copy expat's wording.

### Binary formats

All of these take the file's **bytes** (`fs.readFileSync(path)`) and write to a `BytesHandle`.

- `nib`: one sequence per file; the writer is little-endian. `twobit`: names and offsets are read up front and each sequence's bases are decoded on demand (N blocks and soft-masked lower case included); the `Seq` keeps a reference to the bytes, so slicing with a step works like Biopython's, including its `trunc((end - start) / step)` length for steps above one.
- `gck`, `xdna`: sequence, features and topology; `xdna` writes one record, dropping fuzzy features and truncating long text with warnings.
- `abi`: ABIF traces; `annotations["abif_raw"]` holds every tag (a `Map`). The record `name` stays empty, because Python takes it from the file name and we only see bytes. `abi-trim` removes low-quality ends.
- `snapgene`: packets for sequence, notes, features and primers; the XML ones are read with a small DOM. `annotations["date"]` is a JavaScript `Date`.
- `sff`: flowgram reads with optional clipping (`sff-trim` removes clipped regions). The writer builds the Roche-style index and goes back to rewrite the header, so it needs a `BytesHandle`. `readRocheXmlManifest(stream)` returns the XML manifest of an indexed file.
- Corrupt files raise the same `ValueError`, `RuntimeError`, `AssertionError` and `struct.error` (class name `error`, exported as `StructError`) as Biopython. The numpy broadcasting errors from corrupt twoBit headers carry numpy's wording.
- As with seqXML, the text of malformed-XML errors in `snapgene` (`ExpatError`) is not copied from expat.

Other formats (pdb, ace, ...) are being added; see PARITY.md.

## Readers and writers

Every reader is a class (`FastaIterator`, ...) whose instances are iterators; every writer is a class (`FastaWriter`, ...) with `writeRecord`, `writeRecords`, `writeFile` and a static `asString(record)` (Python's `to_string`). `FastaWriter(target, wrap = 60, record2title = null)` takes a custom header function:

```ts
new FastaWriter(out, 80, (rec) => `${rec.id} len=${rec.length}`).writeFile(records);
```

`record.format("fasta")` on a `SeqRecord` now works (`@biolibs/seqio` registers its writers there).

The low-level parsers `simpleFastaParser(lines)` and `fastaTwoLineParser(lines)` yield `[title, sequence]` pairs.

Register your own format with `registerIterator(name, Class)` and `registerWriter(name, Class)`.

## Intentional differences from Python

- Sources are contents, not paths or handles (see above); `parse` takes no `alphabet` (it was removed from Biopython too).
- `read()` and `parse()` iterators have no context-manager protocol; `read()` closes for you, otherwise call `close()`.
- Where Python raises `AttributeError` for a wrong argument type, TypeScript throws `TypeError`.

## Source layout

```
packages/seqio/src/
  api.ts  handles.ts  errors.ts  interfaces.ts  registry.ts  index.ts
  fasta/   parsers.ts  iterators.ts  writers.ts  index.ts
  fastq/   scores.ts  general-iterator.ts  iterators.ts  qual-iterator.ts  paired.ts  writers.ts  qual-writer.ts  converters.ts  errors.ts  index.ts
  tab/     iterator.ts  writer.ts  index.ts
  pir/     iterator.ts  writer.ts  index.ts
  swiss/   records.ts  text.ts  fields.ts  features.ts  parser.ts  iterator.ts  index.ts
  phd/     parser.ts  iterator.ts  writer.ts  index.ts
  ig/      iterator.ts  index.ts
  seqxml/  xml-types.ts  xml-chars.ts  xml-names.ts  xml-scanner.ts  xml-sax.ts  content-handler.ts  iterator.ts  xml-generator.ts  writer.ts  index.ts
  binary/  struct.ts  ascii.ts
  nib/ twobit/ gck/ xdna/ abi/ snapgene/ sff/   (one directory per format)
  insdc/   text.ts  cleaner.ts  consumer.ts  scanner.ts  genbank-scanner.ts  embl-scanner.ts  iterators.ts
           location-string.ts  writer-base.ts  genbank-writer.ts  embl-writer.ts  converters.ts  index.ts
```
Each format family lives in its own directory and registers itself with `registry.ts`.
