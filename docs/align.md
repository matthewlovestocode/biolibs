# @biolibs/align

A TypeScript port of Biopython's `Bio.Align`. So far it holds `MultipleSeqAlignment`; the pairwise aligner and the newer `Alignment` class are not yet ported (the earlier string-only scaffold was removed). Verified against Biopython 1.88 with about 1,900 recorded operations. See [PARITY.md](../PARITY.md).

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
| `format(aln, "fmt")` | `aln.format("fmt")` |
| `aln.substitutions`, `aln.alignment` | not yet (need substitution matrices and the `Alignment` class) |

Records must all have the same length (`ValueError` otherwise); a record without a sequence raises `TypeError` when the alignment length is needed, as `len(None)` does in Python.
