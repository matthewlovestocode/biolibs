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

def seq_text(s):
    """str(seq), or for a partially defined sequence its length and the text of each defined range."""
    q = getattr(s, "seq", s)
    if getattr(q, "defined", True): return str(q)
    return {"len": len(q), "defined": [[a, b, str(q[a:b])] for a, b in q.defined_ranges]}

def enc_aln(a):
    rows = [str(s) for s in a]
    d = {"ids": [getattr(s, "id", None) for s in a.sequences], "rows": rows, "coords": a.coordinates.tolist(),
         "seqs": [seq_text(s) for s in a.sequences]}
    if getattr(a, "annotations", None): d["ann"] = {k: v for k, v in a.annotations.items()}
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
    if spec.get("mol"):
        for r in recs: r.annotations["molecule_type"] = spec["mol"]
    if spec.get("mols"):
        for r, m in zip(recs, spec["mols"]):
            if m is not None: r.annotations["molecule_type"] = m
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
                n = Align.write([build(s) for s in case["alns"]], buf, case["fmt"], **case.get("kwargs", {}))
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
    if res is None: return
    # Rows of unequal length make Biopython's printed-alignment parser return coordinates that depend on uninitialised memory
    for a in res.get("result", {}).get("alns", []) if isinstance(res.get("result"), dict) else []:
        if len({len(r) for r in a["rows"]}) > 1: return
    cases.append(dict(c, **res))

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

# ---- EMBOSS ----
import random
rnd = random.Random(5)
RULE = "#" * 40
def emboss_header(fmt="srspair", extra=True):
    L = [RULE, "# Program: needle", "# Rundate: Sun 27 Apr 2008 17:09:12", "# Commandline: needle", "#    -asequence a.fa", "#    -bsequence b.fa"]
    if fmt: L.append(f"# Align_format: {fmt}")
    L += ["# Report_file: stdout", RULE, ""]
    return L

def emboss_alignment(ids, rows, starts, strands, fmt="srspair", brief=True, matrix="EBLOSUM62"):
    """rows: gapped rows; starts: 1-based first residue of each sequence in the alignment; strands: +1/-1."""
    n, ncols = len(rows), len(rows[0])
    L = ["#" + "=" * 39, "#", f"# Aligned_sequences: {n}"] + [f"# {i + 1}: {ids[i]}" for i in range(n)]
    L += [f"# Matrix: {matrix}", "# Gap_penalty: 10.0", "# Extend_penalty: 0.5", "#", f"# Length: {ncols}",
          "# Identity:      %d/%d (75.6%%)" % (3, ncols), "# Similarity:     3/%d (75.6%%)" % ncols, "# Gaps:          1/%d (18.3%%)" % ncols, "# Score: 412.5"]
    if not brief: L += ["# Longest_Identity = 40/50 (80.0%)", "# Shortest_Identity = 40/50 (80.0%)"]
    L += ["# ", "#", "#" + "=" * 39, ""]
    pos = [st for st in starts]   # next residue number (1-based) per sequence
    last = [None] * n
    for c in range(0, ncols, 50):
        cons = ""
        for k in range(n):
            chunk = rows[k][c:c + 50]
            cnt = len(chunk.replace("-", ""))
            if strands[k] > 0:
                if cnt: a, b = pos[k], pos[k] + cnt - 1; pos[k] += cnt; last[k] = b
                elif fmt == "srspair": a = b = (last[k] if last[k] is not None else pos[k] - 1)
                else: a, b = pos[k], pos[k] - 1
            else:
                if cnt: a, b = pos[k], pos[k] - cnt + 1; pos[k] -= cnt; last[k] = b
                elif fmt == "srspair": a = (last[k] if last[k] is not None else pos[k] + 1) + 1; b = a
                else: a, b = pos[k], pos[k] + 1
            L.append("%-13s%7d %s %6d" % (ids[k][:13], a, chunk, b))
            if k == 0 and n == 2: cons = "".join("|" if x == y and x != "-" else " " for x, y in zip(rows[0][c:c + 50], rows[1][c:c + 50]))
            if k == 0 and n == 2: L.append(" " * 21 + cons)
        L.append("")
    L += ["", "#---------------------------------------", "#---------------------------------------"]
    return L

E_BASES = []
for fmt in ("srspair", "pair", "simple", None):
    for strands in ((1, 1), (1, -1)):
        txt = "\n".join(emboss_header(fmt) + emboss_alignment(["IXI_234", "IXI_235"], ["ACGT-ACGTTT" * 6, "ACGTTAC-TTTA" * 5 + "AAAAAA"], [1, 7] if strands[1] > 0 else [1, 70], strands, fmt or "srspair") + emboss_alignment(["a", "b"], ["AAAA", "AA-A"], [3, 3], (1, 1), fmt or "srspair", brief=False)) + "\n"
        E_BASES.append(txt)
E_BASES.append("\n".join(emboss_header("srspair") + emboss_alignment(["a", "b"], ["AC------", "--GTTTGG"], [1, 1], (1, 1))) + "\n")
E_BASES.append("\n".join(emboss_header("pair") + emboss_alignment(["a", "b"], ["AC------", "--GTTTGG"], [1, 1], (1, 1), "pair")) + "\n")
E_BASES.append("\n".join(emboss_header("srspair") + emboss_alignment(["a", "b", "c"], ["ACGT", "AC-T", "A-GT"], [1, 1, 1], (1, 1, 1))) + "\n")
E_BASES.append("\n".join(emboss_header("srspair")) + "\n")
for t in E_BASES:
    add({"kind": "parse", "fmt": "emboss", "text": t})
    add({"kind": "read", "fmt": "emboss", "text": t})
    lines = t.split("\n")
    for _ in range(40):
        m = list(lines); r = rnd.random()
        i = rnd.randrange(len(m))
        if r < 0.3: del m[i]
        elif r < 0.5: m[i] = m[i][:rnd.randrange(len(m[i]) + 1)]
        elif r < 0.7 and m[i]:
            j = rnd.randrange(len(m[i])); m[i] = m[i][:j] + rnd.choice("X-5 :#=|") + m[i][j + 1:]
        elif r < 0.85: m.insert(i, rnd.choice(["", "#", "# x", "junk", "# Length: 3"]))
        else: m = m[:i]
        add({"kind": "parse", "fmt": "emboss", "text": "\n".join(m)})
for t in ["", "x\n", RULE + "\n", RULE + "\n# Program\n", RULE + "\n# Program: x\n" + RULE + "\n"]:
    add({"kind": "parse", "fmt": "emboss", "text": t})

# ---- NEXUS ----
def nex(datatype="dna", rows=(("a", "ACGT-A"), ("b", "ACGTTA")), interleave=False, extra="", gap="-", missing="?"):
    n = len(rows); L = len(rows[0][1])
    t = f"#NEXUS\nbegin data;\ndimensions ntax={n} nchar={L};\nformat datatype={datatype} gap={gap} missing={missing}{' interleave' if interleave else ''};\nmatrix\n"
    if interleave:
        h = L // 2
        t += "".join(f"{k} {v[:h]}\n" for k, v in rows) + "\n" + "".join(f"{k} {v[h:]}\n" for k, v in rows)
    else: t += "".join(f"{k} {v}\n" for k, v in rows)
    return t + ";\nend;\n" + extra
NEX = [nex(), nex("protein", (("p1", "MKV-LA"), ("p2", "MKVQLA"))), nex("rna", (("a", "ACGU-A"), ("b", "ACGUUA"))), nex(interleave=True), nex("standard"), nex("dna", (("a", "AC--GT"), ("b", "AC--GA"))),
       nex("dna", (("a", "ACGT"), ("a", "ACGA"))), nex(extra="begin trees;\ntree t = (a,b);\nend;\n"), nex(extra="begin sets;\ncharset x = 1-2;\nend;\n"),
       "#NEXUS\n", "#NEXUS\nbegin trees;\ntree t = (a,b);\nend;\n", "#nexus\nbegin data;\nend;\n", "", "NEXUS\n", "#NEXUS\nbegin data;\ndimensions ntax=2 nchar=3;\nformat datatype=dna;\nmatrix\na ACG\nb AC\n;\nend;\n",
       nex("dna", (("taxon one", "ACGT"), ("taxon two", "ACGA"))).replace("a ", "'a'"), nex().replace("matrix", "matrix [comment]"), nex().replace(";\nend;", ";\nend"), nex().replace("begin data", "begin foo")]
for t in NEX:
    add({"kind": "parse", "fmt": "nexus", "text": t})
    add({"kind": "read", "fmt": "nexus", "text": t})
    lines = t.split("\n")
    for _ in range(25):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.35: del m[i]
        elif r < 0.55: m[i] = m[i][:rnd.randrange(len(m[i]) + 1)]
        elif r < 0.8 and m[i]:
            j = rnd.randrange(len(m[i])); m[i] = m[i][:j] + rnd.choice("X-5 ;=[]'") + m[i][j + 1:]
        else: m = m[:i]
        add({"kind": "parse", "fmt": "nexus", "text": "\n".join(m)})
add({"kind": "parse", "fmt": "nexus", "text": NEX[0] + NEX[1]})
for aln in [{"ids": ["a", "b"], "rows": ["ACGT-A", "ACGTTA"], "mol": "DNA"}, {"ids": ["a", "b"], "rows": ["ACGU-A", "ACGUUA"], "mol": "RNA"}, {"ids": ["p", "q"], "rows": ["MKV-LA", "MKVQLA"], "mol": "protein"},
            {"ids": ["a", "b"], "rows": ["ACGT", "ACGT"]}, {"ids": ["a", "b"], "rows": ["ACGU", "ACGU"], "mol": "DNA"}, {"ids": ["a", "b"], "rows": ["ACGT", "ACGT"], "mol": "RNA"},
            {"ids": ["a", "b"], "rows": ["ACGT", "ACGT"], "mols": ["DNA", "protein"]}, {"ids": ["a", "b"], "rows": ["ACGT", "ACGT"], "mols": ["gDNA", "DNA"]}, {"ids": ["a", "b"], "rows": ["ACGT", "ACGT"], "mols": ["DNA", None]},
            {"ids": ["a b", "c"], "rows": ["AC-T", "ACGT"], "mol": "DNA"}, {"ids": ["a", "b"], "rows": ["A" * 1001, "C" * 1001], "mol": "DNA"}, {"ids": ["a", "b"], "rows": ["A" * 130, "C" * 130], "mol": "DNA"}]:
    add({"kind": "format", "fmt": "nexus", "aln": aln})
    add({"kind": "write", "fmt": "nexus", "alns": [aln]})
    add({"kind": "write", "fmt": "nexus", "alns": [aln], "kwargs": {"interleave": True}})
    add({"kind": "write", "fmt": "nexus", "alns": [aln], "kwargs": {"interleave": False}})
    add({"kind": "write", "fmt": "nexus", "alns": [aln, aln]})
add({"kind": "write", "fmt": "nexus", "alns": []})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "cases")
