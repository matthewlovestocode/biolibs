# @biolibs/seguid

SEGUID v2: checksums that identify a sequence rather than naming it. A port of the
[seguid](https://github.com/seguid/seguid-python) package, measured against it in
[docs/parity-seguid/](parity-seguid/README.md).

A checksum is the base64 of a SHA-1 over the sequence with the `=` padding dropped, which gives 27
characters. What makes the five variants differ is what goes into the hash:

| Python | biolibs | What it identifies |
|---|---|---|
| `seguid(seq, alphabet, form)` | `seguid(seq, alphabet, form)` | one strand, the original SEGUID's standard base64 |
| `lsseguid(...)` | `lsseguid(...)` | one strand of a linear molecule |
| `csseguid(...)` | `csseguid(...)` | one strand of a circle, read from wherever makes it smallest |
| `ldseguid(watson, crick, ...)` | `ldseguid(watson, crick, ...)` | both strands of a linear duplex, smaller strand first |
| `cdseguid(watson, crick, ...)` | `cdseguid(watson, crick, ...)` | both strands of a circular duplex |
| `rotate`, `rotate_to_min`, `min_rotation_py` | `rotate`, `rotateToMin`, `minRotation` | the smallest rotation |
| `tablefactory(spec)` | `tableFactory(spec)` | an alphabet's pairing table |
| `assert_in_alphabet`, `assert_complementary` | `assertInAlphabet`, `assertComplementary` | the checks |

```ts
import { cdseguid, ldseguid, lsseguid } from "@biolibs/seguid";

lsseguid("GATTACA");                       // "lsseguid=tp2jzeCM2e3W4yxtrrx09CMKa_8"
lsseguid("GATTACA", "{DNA}", "short");     // "tp2jze"
ldseguid("GATTACA", "TGTAATC");            // "ldseguid=zDq4dp6G3AIsldhPDDL8S5A0BKk" — both strands
cdseguid("GAATTCGG", "CCGAATTC");          // "cdseguid=ngaZNIVvW0vWnz91kMnoJrFcWiI" — origin-free
```

The point of the rotation is that two records of the same plasmid with different origins get the same
answer, and the point of putting the smaller strand first is that which strand is called watson does not
matter either. `@biolibs/dseq`'s `seguidOf` is pydna's own use of this: it writes a linear molecule's
overhangs out as gaps so that a sticky end is part of what is identified, and takes a circle's checksum
with `cdseguid`.

An alphabet is written as a comma-separated list of pairs — `"GC,AT"` is plain DNA — which says both
which symbols may appear and which pair with which; a one-letter entry is a symbol that pairs with
nothing, which is what makes an alphabet single-stranded. The named ones (`{DNA}`, `{RNA}`,
`{DNA-extended}`, `{RNA-extended}`, `{protein}`, `{protein-extended}`) are spelled out before the list is
read, so `"{DNA-extended},AU"` means the extended DNA pairs and A with U as well.

Two things to know about the refusals. Where the Python raises through an `assert` — an empty sequence,
strands of different lengths, a single-stranded alphabet handed to a double-stranded checksum — this
throws `AssertionError`, and where it raises a `ValueError` — a symbol outside the alphabet, a
non-complementary pair, an alphabet specification it cannot read — so does this. And the complaint about
unknown symbols lists them in the order a Python set iterates, which depends on the interpreter's hash
seed and is not reproducible; the golden cases sort them, and so does the test.

`minRotation` is Booth's algorithm in the form the reference implements it, including its answer of `-1`
for `"AA"` — the repetition shortcut returns a negative offset there, which `rotate` then takes modulo
the length, so the checksum is unaffected.
