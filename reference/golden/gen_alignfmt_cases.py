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
            elif k == "write":
                buf = io.StringIO()
                n = Align.write([build(s) for s in case["alns"]], buf, case["fmt"])
                out["result"] = {"text": buf.getvalue(), "n": n}
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
        out["warnings"] = [type(x.message).__name__ for x in w]
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
