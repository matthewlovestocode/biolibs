"""Golden cases for Bio.Align file formats (parse/read/write/format) -> packages/align/test/golden/alignfmt.json

Case kinds (each forked so a crash cannot lose the rest):
  parse  - Align.parse(StringIO(text), fmt): every alignment (names, gapped rows, coordinates, column annotations), plus the metadata
  read   - Align.read(...)
  format - alignment built from gapped rows (and optional ids / column annotations), then alignment.format(fmt)
  write  - Align.write([alignment...], StringIO, fmt) -> text and count
  other  - parse/read/format with an unknown or binary format name
"""
import io, json, os, warnings
import numpy as np
from Bio import Align
from Bio.Align import Alignment
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "alignfmt.json")

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else type(e).__name__
def emsg(e):
    if type(e).__name__ == "AttributeError": return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def enc_aln(a):
    rows = [str(s) for s in a]
    d = {"ids": [getattr(s, "id", None) for s in a.sequences], "rows": rows, "coords": a.coordinates.tolist(),
         "seqs": [str(getattr(s, "seq", s)) for s in a.sequences]}
    d["names"] = [getattr(s, "name", None) for s in a.sequences]
    d["descs"] = [getattr(s, "description", None) for s in a.sequences]
    d["weights"] = [getattr(s, "annotations", {}).get("weight") for s in a.sequences]
    if hasattr(a, "column_annotations"): d["colann"] = {k: str(v) for k, v in a.column_annotations.items()}
    return d

def meta(alns):
    m = getattr(alns, "metadata", None)
    return None if m is None else {k: str(v) for k, v in m.items()}

def build(spec):
    seqs = []
    gapped = spec["rows"]
    # aligned rows -> Alignment via the printed-alignment parser, as the readers do
    sequences, coords = Alignment.parse_printed_alignment([r.encode() for r in gapped]) if hasattr(Alignment, "parse_printed_alignment") else (None, None)
    recs = [SeqRecord(Seq(bytes(s).decode()), id=i) for s, i in zip(sequences, spec["ids"])]
    a = Alignment(recs, coords)
    if spec.get("colann"): a.column_annotations = dict(spec["colann"])
    return a

def run(case):
    out = {"warnings": []}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            k = case["kind"]
            if k == "parse":
                alns = Align.parse(io.StringIO(case["text"]), case["fmt"])
                res = [enc_aln(a) for a in alns]
                out["result"] = {"alns": res, "metadata": meta(alns)}
            elif k == "read":
                out["result"] = {"alns": [enc_aln(Align.read(io.StringIO(case["text"]), case["fmt"]))]}
            elif k == "format":
                out["result"] = build(case["aln"]).format(case["fmt"])
            elif k == "alninfo":
                from Bio.Align import AlignInfo, MultipleSeqAlignment
                msa = MultipleSeqAlignment([SeqRecord(Seq(r), id=i) for r, i in zip(case["rows"], case["ids"])])
                info = AlignInfo.SummaryInfo(msa)
                out["result"] = {"ic": list(info.ic_vector), "cols": []}
                for col in case["cols"]:
                    try: out["result"]["cols"].append({"v": info.get_column(col)})
                    except Exception as e: out["result"]["cols"].append({"exc": [tname(e), emsg(e)]})
                out["wmsg"] = [str(x.message) for x in w]
            elif k == "write":
                buf = io.StringIO()
                n = Align.write([build(s) for s in case["alns"]], buf, case["fmt"])
                out["result"] = {"text": buf.getvalue(), "n": n}
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
        out["warnings"] = [type(x.message).__name__ for x in w]
        out["wtext"] = [str(x.message) for x in w if type(x.message).__name__ == "BiopythonParserWarning"]
    return out

def run_isolated(case):
    r, wfd = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        try: os.write(wfd, json.dumps(run(case)).encode())
        finally: os._exit(0)
    os.close(wfd)
    chunks = []
    while True:
        b = os.read(r, 1 << 20)
        if not b: break
        chunks.append(b)
    os.close(r)
    _, st = os.waitpid(pid, 0)
    return json.loads(b"".join(chunks)) if st == 0 and chunks else None

cases = []
def add(c):
    res = run_isolated(c)
    if res is not None: cases.append(dict(c, **res))

FASTA = ">a desc\nAC-GT\n>b\nACGGT\n"
FASTA2 = ">a\nAC-GT\n>b\nACGGT\n\n>c\nAAA\n>d\nAAA\n".replace("\n\n", "\n")
CLUSTAL = """CLUSTAL W (1.83) multiple sequence alignment


alpha         ACGT-ACGT
beta          ACGTTAC-T
              **** ** *

alpha         AA
beta          AA
              **

"""
CLUSTAL_NUM = "CLUSTAL 2.1 multiple sequence alignment\n\n\nalpha         ACGT-ACGT 8\nbeta          ACGTTAC-T 8\n\n"
CLUSTAL_BAD = "CLUSTAL 2.1 multiple sequence alignment\n\n\nalpha         ACGT-ACGT 9\nbeta          ACGTTAC-T 8\n\n"
PHYLIP_I = " 2 12\nseq1       ACGTAC\nseq2       ACGAAC\n\nGTACGT\nGAACGT\n"
PHYLIP_S = " 2 8\nseq1      ACGT\nACGT\nseq2      TTTT\nTTTT\n"
PHYLIP_1 = " 2 6\nseq1      ACGTAC\nseq2      ACG-AC\n"
A2M = ">a\nACgt-A\n>b\nAC-tGA\n"

for fmt, text in [("fasta", FASTA), ("fasta", ""), ("fasta", ">a\n"), ("fasta", "ACGT\n"), ("fasta", ">a\nAC\n>b\nACG\n"),
                  ("a2m", A2M), ("a2m", ""), ("a2m", ">a\nAC\n>b\nACG\n"),
                  ("clustal", CLUSTAL), ("clustal", CLUSTAL_NUM), ("clustal", CLUSTAL_BAD), ("clustal", ""), ("clustal", "FOO 1.0\n"), ("clustal", "MUSCLE (3.8) multiple sequence alignment\n\n\na ACGT\nb ACGT\n\n"),
                  ("phylip", PHYLIP_I), ("phylip", PHYLIP_S), ("phylip", PHYLIP_1), ("phylip", ""), ("phylip", "x y\n"), ("phylip", " 2 4\nseq1      AC.T\nseq2      ACGT\n"), ("phylip", " 3 4\nseq1      ACGT\nseq2      ACGT\n"),
                  ("FASTA", FASTA)]:
    add({"kind": "parse", "fmt": fmt, "text": text})
    add({"kind": "read", "fmt": fmt, "text": text})
MSF = """!!AA_MULTIPLE_ALIGNMENT 1.0

  stdout MSF: 10  Type: P 01/08/19 Check: 8543 ..

  Name: seqA     oo  Len:  10  Check: 4334 Weight: 1.00
  Name: seqB     oo  Len:  10  Check: 3818 Weight: 0.50

//

            1                                                   10
seqA        ACDEF GHIKL
seqB        ACD.F GHI~~

"""
MSF_BLOCKS = MSF.replace("seqA        ACDEF GHIKL\nseqB        ACD.F GHI~~\n", "seqA        ACDEF\nseqB        ACD.F\n\nseqA        GHIKL\nseqB        GHI~~\n")
MSF_MUSCLE = "PileUp\n\n\n\n   MSF:   4  Type: N    Check:     0   ..\n\n Name: a oo  Len:  4  Check: 1  Weight: 1.0\n Name: b oo  Len: 4  Check: 2  Weight: 1.0\n\n//\n\na ACGT\nb AC-T\n"
for text in [MSF, MSF_BLOCKS, MSF_MUSCLE, "", "FOO\n", "PileUp\n", "PileUp\n MSF: x Type: P Check: 1 ..\n",
             MSF.replace("MSF: 10", "MSF: 12"), MSF.replace("MSF: 10", "MSF: 7"), MSF.replace("ACD.F GHI~~", "AC--F GHI--").replace("Len:  10  Check: 3818", "Len:   6  Check: 3818"), MSF.replace("Type: P", "Type: X"), MSF.replace("Type: P", "Typo: P"), MSF.replace("seqB     oo", "seqA     oo"),
             MSF.replace("  Name: seqA     oo  Len:  10  Check: 4334 Weight: 1.00\n", "  Name: seqA oo Len: 10 Weight: 1.00\n"), MSF.replace("//", "/"),
             MSF.replace("\n//\n\n", "\n//\n").replace("\n//\n", "\n//\n"), MSF.replace("//\n\n", "//\nx\n"),
             MSF.replace("seqB        ACD.F GHI~~", "seqB        ACD.F GHI~~ACGT"), MSF.replace("seqB        ACD.F GHI~~", "zzz ACD.F"), MSF.replace("\nseqB        ACD.F GHI~~", ""),
             MSF + "trailing\n", MSF.rstrip() + "\n\n\n"]:
    add({"kind": "parse", "fmt": "msf", "text": text})
    add({"kind": "read", "fmt": "msf", "text": text})
add({"kind": "parse", "fmt": "msf", "text": MSF + MSF})
for fmt in ["msf"]:
    add({"kind": "format", "fmt": fmt, "aln": {"ids": ["a", "b"], "rows": ["AC", "AC"]}})
    add({"kind": "write", "fmt": fmt, "alns": []})
add({"kind": "alninfo", "ids": ["a", "b", "c"], "rows": ["ACGT", "AC-T", "TTTT"], "cols": [0, 1, 3, 4, -1, -5]})
add({"kind": "alninfo", "ids": ["a"], "rows": ["AC"], "cols": [1]})
for fmt in ["nosuch"]:
    add({"kind": "parse", "fmt": fmt, "text": ""})

ALNS = [
    {"ids": ["a", "b"], "rows": ["AC-GT", "ACGGT"]},
    {"ids": ["first name with spaces", "b"], "rows": ["ACGTACGTAC", "AC--ACGTAC"]},
    {"ids": ["a", "b", "c"], "rows": ["A" * 60 + "C-", "A" * 60 + "CG", "A" * 60 + "C-"]},
    {"ids": ["a", "b"], "rows": ["ACGT", "A-GT"], "colann": {"clustal_consensus": "* **", "state": "UULL"}},
    {"ids": ["a:b;(c)", "[d],e"], "rows": ["ACGT", "ACGT"]},
]
for fmt in ["fasta", "a2m", "clustal", "phylip", "FASTA", "bigbed", "nosuch", "emboss"]:
    for a in ALNS:
        add({"kind": "format", "fmt": fmt, "aln": a})
        add({"kind": "write", "fmt": fmt, "alns": [a]})
    add({"kind": "write", "fmt": fmt, "alns": ALNS[:2]})
    add({"kind": "write", "fmt": fmt, "alns": []})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "cases")
