"""Golden cases for pydna.seq -> packages/dseq/test/golden/pydna-seq.json

`pydna.seq.Seq` is the sequence `Dseqrecord` and the whole assembly stack are built on. What it adds to
Biopython's `Seq` is a handful of questions about a coding sequence -- GC content, rare codons, start and
stop strength, open reading frames, a checksum -- and `ProteinSeq`, which refuses the ones that only make
sense for nucleotides.

`cai` and `express` reach further than pydna: `cai` calls the `cai2` package, which asks SciPy for a
geometric mean, so what those cases pin is a fourth library's behaviour. Three parts of it are worth having
recorded rather than reasoned about -- a sequence of nothing but `ATG` and `TGG` has no scorable codon and
comes back NaN with SciPy's own warning; a stop codon missing from the weights is skipped while any other
missing codon raises; and `express` asks for the start and stop strengths without passing the organism on,
so those columns are always the default organism's.

What `express` returns is a `prettytable` table, and that library's rendering is not pydna's, so only the
cells are recorded -- `lol()`, the way pydna itself reads them back.
"""
import json, os, re, warnings
from Bio.SeqUtils import seq3
from pydna.codon import n_end as _n_end
from pydna.seq import ProteinSeq, Seq

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseq", "test", "golden",
                   "pydna-seq.json")


#: The seguid package reports unknown symbols in the order a Python set iterates them, which depends on the
#: interpreter's hash seed. Sorting them is the only way this file reproduces; the port sorts them too.
UNKNOWN_SYMBOLS = re.compile(r"Detected symbols '([^']*)' not in the 'alphabet'")


def err(e):
    """One exception, as JSON, with any hash-ordered symbol list sorted."""
    msg = str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)
    found = UNKNOWN_SYMBOLS.fullmatch(msg)
    if found:
        msg = "Detected symbols '%s' not in the 'alphabet'" % " ".join(sorted(found.group(1).split()))
    return {"type": type(e).__name__, "msg": msg}


def guard(fn):
    """Run something, giving either its value or the error it raised, with any warnings it emitted.

    Warnings are part of what a port has to reproduce, and a short or partial codon makes Biopython warn,
    so they are recorded wherever they happen rather than only where they were expected.
    """
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            out = {"value": fn()}
        except Exception as e:
            out = {"exc": err(e)}
    if caught:
        out["warnings"] = [[type(w.message).__name__, str(w.message)] for w in caught]
    return out


#: Sequences chosen for what each one puts pressure on.
DNA = [
    # An ordinary little gene: start, a few codons, stop.
    "ATGGCCTTTAAATTTGGGTGCTGA",
    # The same in mixed case, since every one of these methods upper-cases first except orfs2 and the slices.
    "atgGCCtttaaatttgggTGCtga",
    # Rare codons, one of each and then several in a row.
    "CGACGGCCGCCGCTCGCG", "ATGCGACGGTAA", "AGGAGGAGG",
    # Starts and stops that are and are not in the tables.
    "ATG", "TTG", "ATA", "AAA", "TAA", "TAG", "TGA", "ATGTAA", "TTGTAG",
    # Readings that overlap, nest, and run off the end without a stop.
    "ATGAAATGAATGAAATAA", "ATGATGATGTAA", "ATGAAAAAAAAA", "ATGTGA" * 4,
    # All three frames, so the frame-by-frame search has something in each.
    "AATGAAATAACATGAAATAG", "CCATGAAATAACCATGAAATGA",
    # Lengths that are not a multiple of three, which leaves a trailing fragment of a codon.
    "ATGGCCT", "ATGGCCTT", "A", "AC",
    # RNA, and a mixture, which pydna's own reverse complement accepts where Biopython's would not.
    "AUGGCCUUU", "aUgGCc", "ATGGCCUUU",
    # dscode letters, which the same table complements.
    "PQGATC", "GATCIJ",
    # Nothing at all.
    "",
    # GC extremes, for the rounding.
    "GCGCGCGC", "ATATATAT", "GGGCCCAAA", "N", "ACGTN", "ACGTRYMKSWHBVDN",
]
#: Proteins, including the empty one and the residues ProtParam has no numbers for.
PROTEINS = ["MAFKFGC", "M", "MA", "MAFKFGC*", "ACDEFGHIKLMNPQRSTVWY", "", "MXZ", "mafkfgc"]
#: Which organism's tables to read. "xxx" has none, which is a KeyError.
ORGANISMS = ["sce", "eco", "xxx"]

cases = []
for data in DNA:
    s = Seq(data)
    case = {"data": data, "len": len(s),
            "gc": guard(lambda: s.gc()),
            "seguid": guard(lambda: s.seguid()),
            "transcribe": guard(lambda: str(s.transcribe())),
            "translate": guard(lambda: str(s.translate())),
            "translate_class": guard(lambda: type(s.translate()).__name__),
            "rc": guard(lambda: str(s.rc())),
            "reverse_complement": guard(lambda: str(s.reverse_complement())),
            "rc_class": guard(lambda: type(s.rc()).__name__),
            # orfs2 keeps the case of what it cuts, so the strings are recorded as they come.
            "orfs2": {str(m): guard(lambda m=m: [str(x) for x in s.orfs2(minsize=m)])
                      for m in (1, 2, 30)},
            "orfs": {str(m): guard(lambda m=m: [list(t) for t in s.orfs(minsize=m)])
                     for m in (1, 3, 6, 100)},
            "by_organism": {},
            }
    for organism in ORGANISMS:
        case["by_organism"][organism] = {
            "rarecodons": guard(lambda o=organism: [[x.start, x.stop, x.step] for x in s.rarecodons(o)]),
            "startcodon": guard(lambda o=organism: s.startcodon(o)),
            "stopcodon": guard(lambda o=organism: s.stopcodon(o)),
            # pydna composes this inside `express`; measured here from the same pieces so that the port's
            # helper has something to agree with while `express` itself waits on cai2.
            "n_end": guard(lambda o=organism: _n_end[o].get(seq3(s[3:6].translate()))),
            # NaN is not JSON, so it is recorded as null with `cai_nan` saying which it was.
            "cai": guard(lambda o=organism: None if (v := s.cai(o)) != v else v),
            # The cells only: the table around them is prettytable's work, not pydna's.
            "express": guard(lambda o=organism: [[None if isinstance(v, float) and v != v else v
                                                  for v in rowx] for rowx in s.express(o).lol()]),
            # NaN does not survive JSON, so it is recorded as a flag beside the row.
            "express_nan": guard(lambda o=organism: [i for i, v in enumerate(s.express(o).lol()[1])
                                                     if isinstance(v, float) and v != v]),
            # Called once, so the warning it emits is recorded once: calling twice to compare a value
            # with itself would record two.
            "cai_nan": guard(lambda o=organism: (v := s.cai(o)) != v),
        }
    cases.append(case)

proteins = []
for data in PROTEINS:
    p = ProteinSeq(data)
    entry = {"data": data, "len": len(p),
             "seguid": guard(lambda: p.seguid()),
             "molecular_weight": guard(lambda: p.molecular_weight()),
             "pI": guard(lambda: p.pI()),
             "instability_index": guard(lambda: p.instability_index()),
             "getitem": guard(lambda: [str(p[1:4]), type(p[1:4]).__name__]),
             "refusals": {},
             }
    for name in ("translate", "complement", "complement_rna", "reverse_complement",
                 "reverse_complement_rna", "transcribe", "back_transcribe", "rc"):
        entry["refusals"][name] = guard(lambda n=name: str(getattr(p, n)()))
    proteins.append(entry)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"pydna": __import__("pydna").__version__, "cases": cases, "proteins": proteins},
          open(OUT, "w"), indent=0, allow_nan=False)
print(len(cases), "sequences,", len(proteins), "proteins ->", os.path.relpath(OUT))
