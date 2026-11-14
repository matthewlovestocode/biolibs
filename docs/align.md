# @biolibs/align

A TypeScript port of Biopython's `Bio.Align`: `MultipleSeqAlignment`, the `Alignment` class, the substitution matrices, `PairwiseAligner` with scoring and alignment, and the alignment file formats (every one Biopython reads, and every writer it has apart from the three binary `big*` containers). Verified against Biopython 1.88 with about 1,900 recorded operations plus 7,836 file-format cases (`packages/align/test/golden/alignfmt.json`). See [PARITY.md](../PARITY.md).

```ts
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";

const aln = new MultipleSeqAlignment([new SeqRecord(new Seq("AC-T"), "a"), new SeqRecord(new Seq("ACGT"), "b")]);
aln.length;                    // 2 rows
aln.getAlignmentLength();      // 4 columns
aln.get(0, 2);                 // "-"          (Python aln[0, 2])
aln.get({ start: 1 }, 3);      // "T"          (Python aln[1:, 3])
aln.format("clustal");         // needs @biolibs/seqio to be imported
```

| Python | TypeScript |
|---|---|
| `MultipleSeqAlignment(records, annotations=, column_annotations=)` | `new MultipleSeqAlignment(records, null, annotations?, columnAnnotations?)` |
| `len(aln)`, `aln.get_alignment_length()` | `aln.length`, `aln.getAlignmentLength()` |
| `aln[i]`, `aln[a:b]`, `aln[i, j]`, `aln[rows, cols]` | `aln.get(i)`, `aln.get(slice)`, `aln.get(i, j)`, `aln.get(rows, cols)` |
| `aln.append(r)`, `aln.extend(rs)`, `aln + other` | `append`, `extend`, `add` |
| `del aln[i]`, `aln.sort(key, reverse)` | `aln.delete(i)`, `aln.sort(key, reverse)` |
| `aln.column_annotations` | `aln.columnAnnotations` (a `RestrictedDict`) |
| `format(aln, "fmt")` | `aln.format("fmt")` — every format name Biopython knows: the text writers produce text, the binary `bigbed`/`bigmaf`/`bigpsl` are refused as it refuses them, and a format with no writer says so |
| `aln.substitutions`, `aln.alignment` | `aln.substitutions`, `aln.alignment` |

Records must all have the same length (`ValueError` otherwise); a record without a sequence raises `TypeError` when the alignment length is needed, as `len(None)` does in Python.

`aln.substitutions` counts every pair of letters over every pair of rows, gaps skipped, weighted by each record's `annotations["weight"]` (1 by default), then halves each cell against its mirror so the matrix is symmetric. An alignment with no rows throws `TypeError` (Python's `set.union()` with no argument); one with nothing but gaps gives an empty alphabet, which only fails when the matrix is printed.

`aln.alignment` returns the same alignment as an `Alignment`, each row's gaps removed and turned into coordinates. **Reading it has a side effect**, as in Biopython: the records are shallow-copied, so clearing the copy's letter annotations empties the *original* record's as well — the docstring there claims the opposite. An alignment with no rows throws `ValueError`, from NumPy's minimum of an empty array.

## Substitution matrices

`substitutionMatrices` is `Bio.Align.substitution_matrices`: the 30 bundled scoring matrices (BLOSUM, PAM, nucleotide matrices, ...) as letter-indexed arrays. The matrix text is generated from Biopython's data files (`matrix-files.ts`), so the values cannot drift.

```ts
import { substitutionMatrices as SM } from "@biolibs/align";

const blosum62 = SM.loadMatrix("BLOSUM62");     // Python: substitution_matrices.load("BLOSUM62")
blosum62.get(["A", "R"]);                       // -1   (Python m["A", "R"])
blosum62.get("A");                              // the row for A, a SubstitutionArray (a view)
blosum62.set(["A", "A"], 5);
SM.loadNames();                                 // sorted names, like load()
```

| Python | TypeScript |
|---|---|
| `load()`, `load(name)` | `loadNames()`, `loadMatrix(name)` |
| `read(handle, dtype)` | `readMatrix(text, "float" \| "int")` |
| `Array(alphabet, dims, data, dtype)` | `new SubstitutionArray({ alphabet, dims, data, dtype })`; from a dict: `SubstitutionArray.fromEntries(pairs)` |
| `m[key]`, `m[k1, k2]`, `m[:, k]` | `m.get(key)`, `m.get([k1, k2])`, `m.get([null, k])` (`null` is `:`; a column is a copy) |
| `m[key] = v` | `m.set(key, v)` |
| `m.get(key, default)`, `key in m` | `m.getOr(key, default)`, `m.has(key)` |
| `keys()`, `values()`, `items()`, `update()`, `select()` | the same names |
| `m.format("%.2f")`, `str(m)` | `m.format("%.2f")`, `m.toString()` (a Python `%` format string) |

Differences: `load` of an unknown name throws `FileNotFoundError`-named errors with a name instead of a path. Biopython's `Array` subclasses a numpy array; the numpy operator overloads (`m + 1`, `m * 2`, ufuncs, `repr`, pickling) are not ported, so `__array_ufunc__` stays unchecked in `PARITY.md`. Like Biopython, a one-dimensional dict makes the constructor fail (`UnboundLocalError`), a string alphabet is searched as a substring (`m["AB"]` finds `A`), and an integer array truncates on assignment.

## PairwiseAligner

`PairwiseAligner` holds the scoring settings and computes alignment scores, with the same algorithm choice as Biopython: Needleman-Wunsch or Smith-Waterman for linear gaps, Gotoh for affine gaps, Waterman-Smith-Beyer when a gap function is set. `align()` returns every optimal alignment for the four dynamic-programming algorithms, global and local. The `"fogsaa"` mode (the Fast Optimal Global Sequence Alignment Algorithm, a best-first search) finds one optimal global alignment; like Biopython it warns when the match score is below the mismatch score or a gap score exceeds the mismatch score, because it may then return incorrect results. In that regime Biopython's `align` sometimes crashes the Python interpreter, and the golden tests leave those inputs out, so this port's behaviour there is not verified.

```ts
import { PairwiseAligner, substitutionMatrices as SM } from "@biolibs/align";

const aligner = new PairwiseAligner({ mode: "global", matchScore: 2, mismatchScore: -1, openGapScore: -0.5, extendGapScore: -0.1 });
aligner.score("TACCG", "ACG");                    // like Python aligner.score("TACCG", "ACG")
aligner.score("KEVLA", "EVL", "+");               // the strand argument is "+" or "-" (aligns the reverse complement of the query)

const protein = new PairwiseAligner({ substitutionMatrix: SM.loadMatrix("BLOSUM62") });
new PairwiseAligner({ scoring: "blastn" });       // also "megablast" and "blastp"
```

Properties are the Python names in camelCase: `mode`, `matchScore`, `mismatchScore`, `substitutionMatrix`, `epsilon`, `wildcard`, `algorithm`, and every gap-score property (`gapScore`, `openGapScore`, `extendInternalGapScore`, `endInsertionScore`, ... 45 of them). They are generated from Biopython's C source (`reference/gen_aligner_props.py`), including the rules for which properties read and write which of the twelve base gap scores, the `gap scores are different` and `using a gap score function` errors, and the deprecated names (`targetGapScore`, ...), which warn with `BiopythonDeprecationWarning`. A gap function is `(position, length) => score`.

Sequences may be strings, `Seq`, `MutableSeq`, `SeqRecord`, bytes, an `Int32Array` of indices, or an array of items (mapped through the substitution matrix's alphabet, or an alphabet built from the items). Differences from Python: a Python `bytearray` is rejected by Biopython but a `Uint8Array` here is treated as `bytes`; `toString()` shows `<Array object>` for the substitution matrix instead of a memory address; and `warnDefaultsChanged()` warns at most once per *process*, not per aligner — Biopython keeps that flag in its C module — and only when some gap score was left at its default. All twelve base gap scores must be assigned for it to stay silent, which `gapScore` does alone, or `openGapScore` with `extendGapScore`, or `internalGapScore` with `endGapScore`. Because the flag is process-wide, the golden case replays the whole sequence in one go, with the aligners that set every gap score *first*, while the flag is still clear; `resetDefaultsWarning()` clears it for the tests. Biopython's docstring says the function returns a boolean, but it returns `None`.

### Alignments

`aligner.align(a, b, strand)` returns a `PairwiseAlignments`: the optimal `score`, the number of alignments (`length`, a `bigint`, computed without generating them; very large counts throw `RangeError` where Python raises `OverflowError`), indexing (`get(i)`, negative from the end, fast for increasing indices) and iteration in Biopython's order.

```ts
const alignments = new PairwiseAligner({ mode: "local", matchScore: 2, mismatchScore: -1 }).align("TACCG", "ACG");
alignments.length;                  // 2n
for (const alignment of alignments) console.log(alignment.coordinates, alignment.score);
alignments.get(-1).coordinates;    // [[1, 2, 3, 5], [0, 1, 1, 3]]
```

### Alignment

`Alignment` holds `sequences`, `coordinates` (a `number[][]`, one row per sequence) and `score`. Ported so far, and verified against Biopython on about 6,500 alignments (aligner output on both strands, multiple alignments, reverse-strand rows, Unicode and non-text sequences, and deliberately invalid coordinates):

| Python | TypeScript |
|---|---|
| `Alignment(sequences, coordinates)` | `new Alignment(sequences, coordinates)` |
| `str(alignment)`, `alignment.format()` | `alignment.toString()`, `alignment.format()`; `format("", matrix)` marks similar letters with `:` (the matrix can be a `SubstitutionArray` or an aligner) |
| `len(alignment)` | `alignment.size` (the number of sequences) |
| `.length`, `.shape` | `.length`, `.shape` |
| `.aligned`, `.indices`, `.inverse_indices` | `.aligned` (`number[][][]`), `.indices`, `.inverseIndices` |
| `.target`, `.query` | the same (settable) |
| `==`, `!=`, `<`, `<=`, `>`, `>=` | `equals`, `lt`, `le`, `gt`, `ge` |
| `.sort(key, reverse)` | `.sort(key, reverse)` |
| `alignment[row]`, `alignment[rows]`, `alignment[row, col]`, ... | `alignment.get(key)`: an integer row gives text with `-` gaps (a list with `null` for non-text sequences), a slice `{ start, stop, step }` gives an alignment of those rows, a pair `[row, col]` takes an integer, a slice or (for `col`) a list of integers; a column slice of several rows gives a sub-alignment (carrying `score` and `columnAnnotations`) |
| `a + b` | `a.add(b)` |
| `.counts(scoring)` | `.counts(scoring)`: an `AlignmentCounts` (`aligned`, `identities`, `mismatches`, `positives`, `gaps`, `openGaps`, `leftInsertions`, ..., `score`, `gapScore`, `substitutionScore`; `toString()` prints the full table). `scoring` is a `PairwiseAligner` (gap and substitution scores are computed), a substitution matrix, a one-letter wildcard, or null |
| `.map(alignment)`, `.mapall(alignments)` | `.map(alignment)`, `.mapall(alignments)` |
| `Alignment.from_alignments_with_same_reference(alignments)` | `Alignment.fromAlignmentsWithSameReference(alignments)` |
| `.reverse_complement()` | `.reverseComplement()` |
| `.frequencies`, `.substitutions` | `.frequencies` (a `Map` of letter to per-column weights), `.substitutions` (a `SubstitutionArray`) |
| `Alignment.parse_printed_alignment(lines)` | `Alignment.parsePrintedAlignment(lines)` (lines are `Uint8Array`s) |

`format("fasta")`, `"a2m"`, `"clustal"` and `"phylip"` give file text (see below); any other Biopython format throws `NotImplementedError` until it is ported. In a pair key an array is a Python tuple, so a top-level list key (a `TypeError` in Python) behaves like a 1-element tuple here (`ValueError`). Biopython reads uninitialised memory when a zero-width column selection of three or more rows is re-parsed; that case is not reproduced. On the minus strand the query coordinates run backwards, as in Biopython. On the minus strand the query coordinates run backwards, as in Biopython. The traceback follows the C implementation cell by cell (including the way it prunes and extends paths in place), so alignments come out in the same order.


### Alignment file formats (`formats/`)

`parse`, `read` and `write` work over text instead of file handles, and `Alignment.format(fmt)` returns file text. Ported and verified against Biopython on about 7,800 cases (valid files, malformed files, odd identifiers, long alignments): `fasta`, `a2m`, `clustal`, `phylip`, `nexus`, `stockholm`, `psl`, `bed`, `chain`, `sam`, `maf`, `mauve` and `exonerate` (read and write; the writer takes an optional `interleave`) and `msf`, `emboss`, `tabular` and `hhr` (read only, as in Biopython; `hhr` reads HHsearch/HHblits output into one pairwise alignment per hit, with the per-hit scores in `annotations`, consensus and secondary-structure strings as letter annotations, and `No_of_seqs` as a tuple; `tabular` reads BLAST `-outfmt 7` and FASTA `-m 8CB`/`8CC` output and, as in Biopython, needs a `BTOP` or `aln_code` column to build coordinates; EMBOSS files keep their header in `metadata`, strand and start become partially defined sequences, and Biopython's `raise ValueError(...) % line` typo surfaces as the same `TypeError`). Reading `bigbed`, `bigpsl` and `bigmaf` is ported too, and writing `bigbed` (see below); writing the other two throws `NotImplementedError`; the error for an unknown name, a binary format written to text (`StreamModeError`) and a format without a writer (`ValueError`) match Biopython's.

| Python | TypeScript |
|---|---|
| `Align.parse(handle, fmt)` | `parse(text, fmt)`: a lazy, rewindable `AlignmentIterator`; `metadata` (Clustal's program and version) is set on it |
| `Align.read(handle, fmt)` | `read(text, fmt)` (`ValueError` for none or several alignments) |
| `Align.write(alignments, handle, fmt)` | `write(alignments, target, fmt)` where `target` is anything with `write(text)`; returns the count |
| `Alignment.format(fmt)` | `alignment.format(fmt)` |
| `Align.formats` | `FORMATS` |

`AlignmentWriter` in this package is the older function type used by `MultipleSeqAlignment`; the base class of the file writers is exported as `AlignmentFileWriter`.

#### bigBed (`formats/bigbed/`)

A BED file turned into an indexed binary file: a header, a B+ tree naming the chromosomes, zoom summaries, an R
tree over the data, and the rows themselves in zlib-compressed blocks. `parse` takes the file's **bytes** for a
binary format, so `parse(bytes, "bigbed")` where a text format takes a string; the reader keeps the chromosome
records in `targets`, the autoSql column declaration in `declaration`, how many of the columns are standard BED
columns in `bedN`, and the file's own item count as `length` (it is in the header, so nothing is read to count).
Columns beyond the standard ones become `alignment.annotations`, converted as their declared autoSql type says —
`int`, `float`, `string` or an array of those.

`search(chromosome, start, end)` walks the same R tree but prunes the nodes that cannot overlap, and returns the
alignments that do, counting an item that merely touches the region at an endpoint. As in Biopython, `start`
alone means one base, no `start` or `end` means the whole chromosome, `end` without `start` is a `ValueError`,
and `search()` with no chromosome at all raises `UnboundLocalError` — Biopython uses variables it never bound on
that path, which is reproduced rather than given a meaning of its own.

Two pieces of Biopython here can never run, and are kept only for fidelity: the assertion that a chromosome's id
matches its position in the B+ tree, and the one-base padding the search adds to the region before pruning (a
node ending just before the region holds nothing the item test would then accept).

#### bigPsl and bigMaf

Both are bigBed files with a different set of extra columns, so they are the same reader with a different
`createAlignment`. **bigPsl** puts back what PSL holds and bigBed does not: the query's own start, end, size and
strand, its block starts, its sequence and CDS feature, and the `matches`/`misMatches`/`repMatches`/`nCount`
counts. A query declared as protein has blocks a third the length of the target's, and when both strands are
reversed the blocks are counted from the far end of both sequences and read back to front. **bigMaf** stores a
whole MAF block in one column with `;` where a MAF file has newlines, so reading one is bigBed's indexes with
MAF's block parser on top: one record per `s` line placed inside its source, the `e` lines under the `"empty"`
annotation, and the per-line statuses and qualities on the records. A bigMaf file keeps only the chromosome in
its tree, so the reader takes the species from the first `s` line of the first block and names the first target
`species.chromosome`, as MAF does.

Twelve of the golden bigPsl files cannot be read back by Biopython at all — its writer and reader disagree about
the query start and end for some reverse-strand and translated alignments (`Inconsistent qEnd found (8, expected
14)`) — and the cases record those errors with their numbers, which the port reproduces.

#### Writing bigBed

`write(alignments, new ByteWriter(), "bigbed", options)` writes one, where `options` are Biopython's keyword
arguments (`bedN`, `declaration`, `targets`, `compress`, `itemsPerSlot`, `blockSize`, `extraIndex`). The target
must be a `ByteWriter`, since a text target is what Biopython refuses with `StreamModeError`; it collects the
bytes and lets the writer seek back to fill in the header, which is the last thing to be known. As in Biopython,
the call returns nothing rather than a count.

The file is laid out in one pass: room for the header, the declaration, the summary and the extra indexes, then
the chromosome B+ tree, the data in blocks, the R tree over them, the zoom levels, the extra indexes' own trees,
and the magic number again at the end. The zoom levels are the part with real work in them: the coverage depth
of the alignments is kept in a red-black tree of non-overlapping ranges (`range-tree.ts`), summarised over
windows of a fixed width, and then summarised again at four times the width until a level holds no fewer
summaries than the one before. Those figures are 32-bit floats in Biopython, so the arithmetic rounds through
`Math.fround` at each step.

**The file matches Biopython's byte for byte**, compressed or not, which is what the golden cases compare —
across `bedN` 3 to 12, several `itemsPerSlot` and `blockSize` combinations, an extended declaration, extra
indexes over two columns, a 120-item file with several blocks and index levels, 260 overlapping alignments of
varied lengths, and a pile of 300 covering one stretch. Compressed files match because `@biolibs/core`'s
`deflate` reproduces zlib's own output, not merely a valid stream; see `docs/core.md`.

One difference the cases pin down rather than hide. A score that is a whole number is written `100.0` by Biopython, whose
BED reader makes every score a `float`, and `100` here, where a JavaScript number that happens to be whole is
an `int`; the byte-compared cases therefore use fractional scores, and an integer-score file is compared by
reading it back. And three combinations of `blockSize` and `itemsPerSlot` make Biopython's own R tree writer
notice that its offsets do not add up and raise `RuntimeError: Internal error: offset mismatch (1839 vs 1891)`
— the port raises the same error with the same numbers.

Writing bigPsl and bigMaf is not ported. Biopython's own writer needs a real file — it puts its index out with
`numpy.ndarray.tofile` — and it raises on an empty alignment list, so the golden files are written to a
temporary file with at least one alignment in them. The bigPsl writer also wants each alignment to carry an
`annotations` dict already, and the bigMaf writer renames the targets of the alignments it is given, so each
golden file is written from a freshly parsed copy.

### AlignInfo

`SummaryInfo(msa)` (deprecated in Biopython) emits a `BiopythonDeprecationWarning` with the same text; `getColumn(col)` returns that column of a `MultipleSeqAlignment` as text; `icVector` is always empty.

`stockholm` keeps `#=GF` data in `alignment.annotations` (nested values such as `references` are plain objects and arrays), `#=GC` in `columnAnnotations`, `#=GS` in each record's `annotations`, `description` and `dbxrefs`, and `#=GR` in `letterAnnotations`. The reader also sets `alignment.operations` (bytes of `M`, `D`, `I`) so that the writer can tell insertion dots from deletion dashes. As in Biopython, writing an alignment without `columnAnnotations` fails, a file cut off before `//` yields no alignment, and a `#=GF WK` line ending in `/` at the end of the entry silently ends the iteration.

`psl` reads PSL and PSLX lines (the first line may be the `psLayout` header, kept in `metadata`) and sets `matches`, `misMatches`, `repMatches` and `nCount` on each alignment; PSLX sequence columns become partially defined `Seq`s, and a protein aligned to translated DNA (`++`/`+-`) gets a `CDS` feature with the translation. The writer takes `header`, `mask` (`"lower"`/`"upper"`) and `wildcard`, in that order, and counts matches from the sequences unless the alignment carries those four attributes. Reading a partially defined sequence row raises `UndefinedSequenceError`, with Biopython's two messages for a piece with no content and a piece with some.

`bed` reads and writes 3 to 12 columns (`BedWriter(target, bedN)`); the reader gives the target and query `Seq`s of length 2**63-1 and the block sizes as the query length, and keeps the score (text when it is not a number), `thickStart`, `thickEnd` and `itemRgb` on the alignment. `chain` stores the block score in `score` and the chain id in `annotations["id"]`; as in Biopython, a block that runs straight into the next header loses that header line. A sequence with no content (such as the BED target) can be sliced to nothing but raises `UndefinedSequenceError` as soon as a row would read from it.

`sam` keeps the header in the parser: `metadata` (`HD` is one object, every other tag a list of objects) and `targets` (one `SeqRecord` per `@SQ` line); `SamWriter` writes both from the parser it is given, so `write(parse(text, "sam"), target, "sam")` copies the header. Each alignment gets `flag`, `mapq` (unless 255), `rnext`, `pnext`, `tlen`, `score`, `hardClipLeft`/`hardClipRight`, `operations` (when `=`, `X` or `N` occur) and the other tags in `annotations`. Because JavaScript has one number type, tag values are `number` for `int`, `PyFloatValue` for `float`, `string`, `Uint8Array` for `H` and `NumpyArray` for `B`. As in Biopython, a `B` tag in the standard form (`B:i,1,2`) fails to parse because of the comma after the type letter, tags are split on any white space, the `H` hex digits are read as decimal, and writing an alignment that has a `B` array raises a `TypeError`. The MD tag is rebuilt into a partially defined target `Seq`, and `SamWriter(target, md)` can compute it.

`maf` keeps the file header (track line, `##maf` variables, comments) in `metadata`; each alignment's `pass` value and the `e` lines (as `[record, [start, end], status]` under `"empty"`) are in `annotations`, `q` and `i` lines in the matching record's `annotations`, and `score` on the alignment. Sequences are partially defined `Seq`s placed at their source start. A file with a header but no alignment fails in Biopython (it calls a method that does not exist), so here it raises `TypeError`. `mauve` keeps the header in `metadata` and the sequence names in `identifiers`; `MauveWriter(target, metadata, identifiers)` takes both from the parser being written when they are not given. `shlexSplit` (Python's `shlex.split`) is exported for track lines.

`exonerate` reads and writes `vulgar:` and `cigar:` lines (`ExonerateWriter(target, fmt)` with `fmt` `"vulgar"` by default); the file header and the closing `-- completed exonerate analysis` line are written and checked, and `metadata` holds `Program`, `Command line` and `Hostname`. The vulgar reader keeps the operation letters in `operations`. Biopython allocates the vulgar coordinate arrays with `np.empty`, so a line whose `N` operations have a zero step leaves cells uninitialised; those cells read as zero here and are not covered by the goldens.

### CodonAligner

`new CodonAligner(codonTable?)` aligns a protein to a nucleotide sequence (DNA or RNA) with a dynamic-programming search over the three reading frames that allows frame shifts. `score(protein, dna)` returns the best score; `align(protein, dna)` returns a `PairwiseAlignments` (the protein is the target, the nucleotide sequence the query; coordinates count nucleotides in the query). Both take strings, `Seq`, `MutableSeq` or `SeqRecord`. Settings: `matchScore`/`match`, `mismatchScore`/`mismatch`, `epsilon`, `wildcard`, `frameshiftMinusTwoScore`, `frameshiftMinusOneScore`, `frameshiftPlusOneScore`, `frameshiftPlusTwoScore`, and the combined `frameshiftOneScore`, `frameshiftTwoScore`, `frameshiftMinusScore`, `frameshiftPlusScore` and `frameshiftScore` (a getter raises `ValueError` when the scores it covers differ). As in Biopython, a nucleotide string requires a protein string (the check tests the wrong argument), `anchor_len` is accepted but unused, and reading `wildcard` for a code of 128 or more raises `OverflowError`. Verified on about 440 cases, including all optimal alignments with frame shifts; cases where Biopython's C code crashes the interpreter or keeps yielding undefined paths are not covered.

### analysis

`analysis.calculateDnDs(alignment, method = "NG86", codonTable, k, cfreq)` returns `[dN, dS]` for a pairwise alignment of coding sequences (the aligned blocks are read three letters at a time), by the NG86 or LWL85 method; a stop codon is a `KeyError`, other characters than A, T, C and G a `ValueError`, and the maths errors Python raises (`ZeroDivisionError`, `ValueError: expected a positive input, got ...`) are raised too. `analysis.mktest(alignment, species, codonTable)` is the McDonald-Kreitman test and returns the p-value (it uses the same Dijkstra and Prim code as Biopython, including Prim's start from the *letters* of the first codon; because that step depends on the iteration order of a Python set, cases with three or more different codons at one position are not covered by the goldens). `erfc` is a port of fdlibm's. The `ML` and `YN00` methods need scipy (matrix exponential and L-BFGS-B) and throw `NotImplementedError`. `calculateDnDsMatrix(alignment, method, codonTable)` is in `@biolibs/phylo` (`TreeConstruction.calculateDnDsMatrix`) because it returns `DistanceMatrix` objects.
