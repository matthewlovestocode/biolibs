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
    if q is None: return None
    if getattr(q, "defined", True): return str(q)
    return {"len": len(q), "defined": [[int(a), int(b), str(q[a:b])] for a, b in q.defined_ranges]}

def enc_aln(a):
    rows = []
    for i in range(len(a)):
        try: rows.append(str(a[i]))
        except Exception as e: rows.append({"err": [tname(e), emsg(e)]})
    d = {"ids": [getattr(s, "id", None) for s in a.sequences], "rows": rows, "coords": a.coordinates.tolist(),
         "seqs": [seq_text(s) for s in a.sequences]}
    if getattr(a, "annotations", None): d["ann"] = {k: v for k, v in a.annotations.items()}
    d["dbx"] = [list(getattr(s, "dbxrefs", [])) for s in a.sequences]
    d["rann"] = [dict(getattr(s, "annotations", {})) for s in a.sequences]
    d["lann"] = [dict(getattr(s, "letter_annotations", {})) for s in a.sequences]
    if hasattr(a, "operations"): d["ops"] = bytes(a.operations).decode()
    d["feat"] = [[[f.type, str(f.location), {k: v for k, v in f.qualifiers.items()}] for f in getattr(s, "features", [])] for s in a.sequences]
    ex = {k: getattr(a, k) for k in ("matches", "misMatches", "repMatches", "nCount") if hasattr(a, k)}
    if ex: d["extra"] = ex
    d["names"] = [getattr(s, "name", None) for s in a.sequences]
    d["descs"] = [getattr(s, "description", None) for s in a.sequences]
    d["weights"] = [getattr(s, "annotations", {}).get("weight") for s in a.sequences]
    if hasattr(a, "column_annotations"): d["colann"] = {k: str(v) for k, v in a.column_annotations.items()}
    return d

def meta(alns):
    m = getattr(alns, "metadata", None)
    return None if m is None else {k: str(v) for k, v in m.items()}

def build(spec):
    if "seqs" in spec:
        undef = spec.get("undef") or [False] * len(spec["seqs"])
        recs = [SeqRecord(Seq(None, length=len(q)) if u else Seq(q), id=i) for q, i, u in zip(spec["seqs"], spec["ids"], undef)]
        if spec.get("plain"): recs = [r.seq if p else r for r, p in zip(recs, spec["plain"])]
        a = Alignment(recs, np.array(spec["coords"], dtype=np.intp))
        for k, v in (spec.get("extra") or {}).items(): setattr(a, k, v)
        return a
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
    for r, info in zip(recs, spec.get("recinfo") or []):
        if info.get("desc") is not None: r.description = info["desc"]
        if info.get("dbx"): r.dbxrefs = list(info["dbx"])
        for k, v in (info.get("ann") or {}).items(): r.annotations[k] = v
        for k, v in (info.get("letter") or {}).items(): r.letter_annotations[k] = v
    if spec.get("ann") is not None: a.annotations = dict(spec["ann"])
    if spec.get("ops") is not None: a.operations = bytearray(spec["ops"].encode())
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
            elif k == "roundtrip":
                alns = list(Align.parse(io.StringIO(case["text"]), case["fmt"]))
                out["result"] = [a.format(case["fmt"]) for a in alns]
            elif k == "rewrite":
                alns = Align.parse(io.StringIO(case["text"]), case["fmt"])
                buf = io.StringIO()
                n = Align.write(alns, buf, case["fmt"], **case.get("kwargs", {}))
                out["result"] = {"text": buf.getvalue(), "n": n}
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
        if len({len(r) for r in a["rows"] if isinstance(r, str)}) > 1: return
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

# ---- Tabular (BLAST -outfmt 7, FASTA -m 8C*) ----
STD = "query id, subject id, % identity, alignment length, mismatches, gap opens, q. start, q. end, s. start, s. end, evalue, bit score"
def blast(prog="BLASTN 2.2.28+", fields=STD, rows=(), query="Query: q1 a query", hits=None, db="nt", processed=1, extra=()):
    L = [f"# {prog}", f"# {query}", f"# Database: {db}"] + list(extra) + [f"# Fields: {fields}", f"# {len(rows) if hits is None else hits} hits found"]
    L += ["\t".join(map(str, r)) for r in rows]
    return "\n".join(L + [f"# BLAST processed {processed} queries", ""])
R1 = ("q1", "s1", 95.0, 20, 1, 0, 1, 20, 5, 24, "1e-05", 30.5)
R2 = ("q1", "s2", 80.0, 15, 3, 1, 20, 6, 40, 54, "0.002", 21.1)
fields_btop = STD + ", BTOP"
TAB = [blast(rows=[R1, R2]), blast(rows=[]), blast("BLASTP 2.9.0+", rows=[R1]), blast(fields=fields_btop, rows=[R1 + ("10A-G5",), R2 + ("3-A5TC2G-4",)]),
       blast("BLASTX 2.9.0+", fields=fields_btop, rows=[R1 + ("5AG10",), R2 + ("12",)]),
       blast("TBLASTN 2.9.0+", fields=fields_btop + ", query length, subject length, query seq, subject seq", rows=[("q1", "s1", 90.0, 8, 1, 0, 2, 9, 11, 18, "1e-3", 20.0, "8", 10, 30, "ACDEFGHI", "ACDEFGHI")]),
       blast("TBLASTX 2.9.0+", fields=STD + ", query seq, subject seq, subject length", rows=[("q1", "s1", 90.0, 6, 1, 0, 1, 18, 5, 22, "1e-3", 20.0, "ACDEFG", "ACDEFG", 100)]),
       blast("BLASTP 2.9.0+", fields=STD + ", query seq, subject seq", rows=[R1 + ("ACDE", "ACDE")]),
       blast(fields="query acc.ver, subject acc.ver, score, identical, positives, gaps, % positives, query length, subject length, query gi, subject title, subject strand, % subject coverage, BTOP, q. start, q. end, s. start, s. end",
             rows=[("q1.1", "s1.2", 40, 18, 19, 0, 95.0, 100, 500, "123", "Some title", "plus", 12.5, "18", 1, 18, 7, 24)]),
       blast(fields="query id, subject id, bogus", rows=[("q1", "s1", "x")]),
       blast(rows=[R1], query="Query: q1"), blast(rows=[R1], query="Query: "), blast(rows=[R1], query="Query: q1 desc", extra=["# RID: ABC123"]),
       blast(rows=[("q9",) + R1[1:]]),
       blast(rows=[R1], processed=1).replace("# BLAST processed 1 queries\n", ""), blast(rows=[R1, R2]) + blast(rows=[R2]).split("\n", 0)[0],
       "# BLASTN 2.2.28+\n# Query: q1\n# Database: nt\n# Fields: " + STD + "\n# 1 hits found\n" + "\t".join(map(str, R1)) + "\n# BLASTN 2.2.28+\n# Query: q2 second\n# Database: nt\n# Fields: " + STD + "\n# 1 hits found\n" + "\t".join(map(str, ("q2",) + R1[1:])) + "\n# BLAST processed 2 queries\n"]
FHEAD = lambda rows, q="Query: sp|P1|NAME desc - 100 aa", fields=STD + ", aln_code": "\n".join(["# fasta36 -m 8CB q.fa db.fa", "# FASTA 36.3.8h Aug, 2019", "# " + q, "# Database: db.fa", "# Fields: " + fields, f"# {len(rows)} hits found"] + ["\t".join(map(str, r)) for r in rows] + ["# FASTA processed 1 queries", ""])
TAB += [FHEAD([("sp|P1|NAME", "t1", 99.0, 20, 0, 0, 1, 20, 3, 22, "1e-5", 50.0, "20M")]), FHEAD([("sp|P1|NAME", "t1", 99.0, 20, 0, 0, 20, 1, 3, 22, "1e-5", 50.0, "5M2I8M3D5M")]),
        FHEAD([]), FHEAD([("sp|P1|NAME", "t1", 99.0, 20, 0, 0, 1, 20, 3, 22, "1e-5", 50.0, "20M")], q="Query: sp|P1|NAME desc - 100 xx"), FHEAD([("sp|P1|NAME", "t1", 99.0, 20, 0, 0, 1, 20, 3, 22, "1e-5", 50.0, "20M")], q="Query: nodash"),
        FHEAD([("sp|P1|NAME", "t1", 99.0, 20, 0, 0, 1, 20, 3, 22, "1e-5", 50.0, "xM")]),
        "# fasta36 -m 8CB q.fa db.fa\n", "# only", "# fasta36\nnot a header\n", "", "no hash\n", "# BLASTN 2.2\n# Query: q\n# 1 hits found\n", "# BLASTN 2.2\n# Query: q\n# Fields: query id\n# x hits found\n"]
for t in TAB:
    add({"kind": "parse", "fmt": "tabular", "text": t})
    add({"kind": "read", "fmt": "tabular", "text": t})
    lines = t.split("\n")
    for _ in range(40):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.25: del m[i]
        elif r < 0.45: m[i] = m[i][:rnd.randrange(len(m[i]) + 1)]
        elif r < 0.7 and m[i]:
            if "\t" in m[i] and rnd.random() < 0.6:
                f = m[i].split("\t"); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", "1.5", f[k] + "9"]); m[i] = "\t".join(f)
            else:
                j = rnd.randrange(len(m[i])); m[i] = m[i][:j] + rnd.choice("X-5 :#\t") + m[i][j + 1:]
        elif r < 0.85: m.insert(i, rnd.choice(["", "#", "# x: y", "junk", "# 3 hits found"]))
        else: m = m[:i]
        add({"kind": "parse", "fmt": "tabular", "text": "\n".join(m)})

# ---- Stockholm ----
HAT = """# STOCKHOLM 1.0
#=GF ID   HAT
#=GF AC   PF02184.18
#=GF DE   HAT (Half-A-TPR) repeat
#=GF AU   SMART;
#=GF AU   Someone Else;
#=GF SE   Alignment kindly provided by SMART
#=GF GA   21.00 21.00;
#=GF TC   21.00 21.00;
#=GF NC   20.90 20.90;
#=GF BM   hmmbuild HMM.ann SEED.ann
#=GF SM   hmmsearch -Z 57096847 -E 1000 --cpu 4 HMM pfamseq
#=GF TP   Repeat
#=GF CL   CL0020
#=GF RC   A comment on the first reference.
#=GF RN   [1]
#=GF RM   9478129
#=GF RT   The HAT helix, a repetitive motif implicated in RNA processing.
#=GF RA   Preker PJ, Keller W;
#=GF RL   Trends Biochem Sci 1998;23:15-16.
#=GF RN   [2]
#=GF RM   1234
#=GF RT   A second
#=GF RT   title.
#=GF RA   Doe J;
#=GF RL   Nature.
#=GF DR   INTERPRO; IPR003107;
#=GF DC   a database comment
#=GF DR   SMART; HAT;
#=GF NE   PF00001
#=GF NL   1-20
#=GF CC   The HAT (Half A TPR) repeat is found in several RNA processing
#=GF CC   proteins [1].
#=GF WK   Some_page
#=GF WK   Other/
#=GF WK   _page
#=GF SQ   3
#=GS CRN_DROME/191-222     AC P17886.2
#=GS CLF1_SCHPO/185-216    AC P87312.1
#=GS CLF1_SCHPO/185-216    DR PDB; 3JB9 R; 185-216;
#=GS CLF1_SCHPO/185-216    DE a described one
#=GS O16376_CAEEL/201-233  OS Caenorhabditis elegans
CRN_DROME/191-222                KEIDRAREIYERFVYVH.PDVKNWIKFARFEES
CLF1_SCHPO/185-216               HENERARGIYERFVVVH.PEVTNWLRWARFEEE
#=GR CLF1_SCHPO/185-216    SS    --HHHHHHHHHHHHHHS.--HHHHHHHHHHHHH
O16376_CAEEL/201-233             KEIDRARSVYQRFLHVHGINVQNWIKYAKFEER
#=GC SS_cons                     --HHHHHHHHHHHHHHS.--HHHHHHHHHHHHH
#=GC seq_cons                    KEIDRARuIYERFVaVH.P-VpNWIKaARFEEc
//
"""
SIMPLE = "# STOCKHOLM 1.0\nseq1 AC-GT\nseq2 ACGGT\n//\n"
ST = [HAT, SIMPLE, SIMPLE + SIMPLE.replace("seq", "other"), "# STOCKHOLM 1.0\nseq1 AC--T\nseq2 AC--T\nseq3 AC-GT\n//\n", "# STOCKHOLM 1.0\nseq1 AC.GT\nseq2 ACG-T\n//\n",
      "# STOCKHOLM 1.0\nseq1 AC.GT\nseq2 AC-GT\n//\n", "# STOCKHOLM 1.0\nseq1 AC-GT\nseq2 ACGG\n//\n", "# STOCKHOLM 1.0\nseq1\n//\n", "# STOCKHOLM 1.0\n//\n", "", "\n\n", "# STOCKHOLM 1.0\nseq1 ACGT\n",
      "#=GF ID x\n", "seq1 ACGT\n", "//\n", "#=GR a SS xx\n", "#=GC SS ACGT\n", "#=GS a AC x\n", "#=GF RM 1\n", "#=GF RN [1]\n", "#=GF DC x\n", "#=GF NL x\n",
      "# STOCKHOLM 1.0\nseq1 ACGT\n#=GC SS_cons ..HH\n#=GC SS_cons ..HH\nseq2 ACGT\n//\n",
      "# STOCKHOLM 1.0\nseq1 AC-GT\nseq2 AC-GA\n#=GC SS_cons ..-HH\n//\n", "# STOCKHOLM 1.0\nseq1 AC-GT\nseq2 AC-GA\n#=GC SS_cons ..HH\n//\n",
      "# STOCKHOLM 1.0\n#=GF SQ 3\nseq1 ACGT\nseq2 ACGT\n//\n", "# STOCKHOLM 1.0\n#=GF ID a\n#=GF ID b\nseq1 ACGT\n//\n", "# STOCKHOLM 1.0\n#=GF WK abc/\nseq1 ACGT\n//\n",
      "# STOCKHOLM 1.0\n#=GF XX unknown\n#=GF RT title\nseq1 ACGT\n//\n", "# STOCKHOLM 1.0\n#=GF RN [1]\n#=GF RT t\n#=GF RA a\nseq1 ACGT\n//\n", "# STOCKHOLM 1.0\n#=GF RN 1\nseq1 ACGT\n//\n",
      "# STOCKHOLM 1.0\n#=GF RN [x]\nseq1 ACGT\n//\n", "# STOCKHOLM 1.0\n#=GF RN [1]\n#=GF RM a\n#=GF RM b\n#=GF RT t\n#=GF RA a\n#=GF RL l\nseq1 ACGT\n//\n",
      "# STOCKHOLM 1.0\nseq1 ACGT\n#=GS seq1 AC x\n#=GS seq1 AC y\nseq2 ACGT\n//\n", "# STOCKHOLM 1.0\nseq1 ACGT\n#=GS seq1 DE\n//\n", "# STOCKHOLM 1.0\nseq1 ACGT\n#=GS seq9 AC x\n//\n",
      "# STOCKHOLM 1.0\nseq1 ACGT\n#=GR seq1 SS HHHH\n#=GR seq1 PP 9999\n#=GR seq1 CSA ----\n//\n", "# STOCKHOLM 1.0\nseq1 AC-T\n#=GR seq1 SS HH.\n//\n", "# STOCKHOLM 1.0\nseq1 ACGT\n#=GR seq1 SS HH\n//\n",
      "# STOCKHOLM 1.0\nseq1 ACGT\n#=GR seq2 SS HHHH\n//\n", "# STOCKHOLM 1.0\nseq1 ACGT\n#=GR seq1\n//\n", "# STOCKHOLM 1.0\nseq1 ACGT\n#=GR\n//\n", "# STOCKHOLM 1.0\nseq1 ACGT\n#=GC SS ACGT x\n//\n",
      "# STOCKHOLM 1.0\nseq1 ACGT\n#=GC\n//\n", "# STOCKHOLM 1.0\n#=GF CC  one\n#=GF CC  two\nseq1 ACGT\n//\n", "# STOCKHOLM 1.0\n#=GF SQ 1\n#=GF SQ 1\nseq1 ACGT\n//\n"]
for t in ST:
    add({"kind": "parse", "fmt": "stockholm", "text": t})
    add({"kind": "read", "fmt": "stockholm", "text": t})
    lines = t.split("\n")
    for _ in range(30):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.3: del m[i]
        elif r < 0.5: m[i] = m[i][:rnd.randrange(len(m[i]) + 1)]
        elif r < 0.75 and m[i]:
            j = rnd.randrange(len(m[i])); m[i] = m[i][:j] + rnd.choice("X-. 5#=/") + m[i][j + 1:]
        elif r < 0.9: m.insert(i, rnd.choice(["", "#", "# x", "junk", "//", "#=GF", "seq1 ACGT", "#=GC SS_cons ..", "# STOCKHOLM 1.0"]))
        else: m = m[:i]
        add({"kind": "parse", "fmt": "stockholm", "text": "\n".join(m)})

REFS = [{"number": 1, "medline": "9478129", "title": "A very long title that goes on and on and on, with well-known hyphenated-words to wrap on and more text after it", "author": "Preker PJ, Keller W;", "location": "Trends 1998;23:15-16.", "comment": "short comment"},
        {"number": 2, "medline": "1", "title": "T", "author": "A", "location": "L"}]

ALNS_ST = [
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {}},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"]},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus secondary structure": "..H.H", "consensus sequence": "ACxGT", "custom": "12345"}},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "ops": "MMIMM"},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "ops": "MMM"},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "ann": {"identifier": "ID1", "accession": "AC1", "definition": "A definition", "author": ["Me;", "You;"], "wikipedia": ["Page", "Other"], "comment": "A long comment text that needs wrapping because it is longer than seventy-nine characters in total, yes indeed.", "source of seed": "x", "clan": "CL1"}},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "ann": {"references": REFS, "database references": [{"reference": "PDB; 1ABC", "comment": "c"}, {"reference": "SMART; X"}], "nested domains": [{"accession": "PF1", "location": "1-5"}, {"accession": "PF2"}]}},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "ann": {"bogus": "x"}},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "ann": {"references": [{"number": 1}]}},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "ann": {"references": [{"number": 1, "medline": "1", "title": "t", "author": "a"}]}},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "recinfo": [{"desc": "first seq", "dbx": ["PDB; 1", "SMART; 2"], "ann": {"accession": "P1", "organism": "Homo", "other": "x"}, "letter": {"secondary structure": "HHHH", "custom": "abcd"}}, {}]},
    {"ids": ["a", "bb"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}, "recinfo": [{"letter": {"secondary structure": "HHH"}}, {}]},
    {"ids": ["a" * 25, "b"], "rows": ["AC-GT", "ACGGT"], "colann": {"consensus sequence": "ACGGT"}},
    {"ids": ["a", "b"], "rows": ["ACGT", "ACGT"], "colann": {"consensus sequence": "ACGT"}, "ann": {"comment": "a" * 100 + " " + "word-" * 30 + " tail"}},
]
for aln in ALNS_ST:
    add({"kind": "format", "fmt": "stockholm", "aln": aln})
    add({"kind": "write", "fmt": "stockholm", "alns": [aln]})
add({"kind": "write", "fmt": "stockholm", "alns": ALNS_ST[:3]})
add({"kind": "write", "fmt": "stockholm", "alns": []})
# round trips of what the reader produced
for t in (HAT, SIMPLE):
    add({"kind": "roundtrip", "fmt": "stockholm", "text": t})

# ---- PSL ----
def rand_psl_spec(r, dnax=False, rev=False):
    t, q = r.randint(0, 5), r.randint(0, 5)
    pts = [(t, q)]
    for b in range(r.randint(1, 4)):
        if b:
            gap = r.randint(1, 4)
            if r.random() < 0.5: t += gap * (3 if dnax else 1)
            else: q += gap
            pts.append((t, q))
        size = r.randint(1, 6)
        t += size * (3 if dnax else 1); q += size
        pts.append((t, q))
    tlen, qlen = t + r.randint(0, 5), q + r.randint(0, 5)
    tc, qc = [p[0] for p in pts], [p[1] for p in pts]
    if rev and dnax: tc = [tlen - x for x in tc]
    elif rev: qc = [qlen - x for x in qc]
    alpha = "ACDEFGHIKLMNPQRSTVWY" if dnax else "ACGTNacgtn"
    tseq = "".join(r.choice("ACGTNacgtn") for _ in range(tlen))
    qseq = "".join(r.choice(alpha) for _ in range(qlen))
    return {"ids": ["chr1", "read1"], "seqs": [tseq, qseq], "coords": [tc, qc]}

prng = random.Random(21)
PSL_SPECS = [rand_psl_spec(prng, dnax=d, rev=v) for d in (False, True) for v in (False, True) for _ in range(6)]
PSL_LINES = []
for sp in PSL_SPECS:
    try: PSL_LINES.append(build(sp).format("psl").rstrip("\n"))
    except Exception: pass
HDR = "psLayout version 3\n\nmatch\tmis- \trep. \tN's\tQ gap\tQ gap\tT gap\tT gap\tstrand\tQ        \tQ   \tQ    \tQ  \tT        \tT   \tT    \tT  \tblock\tblockSizes \tqStarts\t tStarts\n     \tmatch\tmatch\t   \tcount\tbases\tcount\tbases\t      \tname     \tsize\tstart\tend\tname     \tsize\tstart\tend\tcount\n" + "-" * 159 + "\n"
def pslx(line, sp):
    w = line.split("\t"); bs = [int(x) for x in w[18].rstrip(",").split(",")]; qs = [int(x) for x in w[19].rstrip(",").split(",")]; ts = [int(x) for x in w[20].rstrip(",").split(",")]
    tseq, qseq = sp["seqs"]
    strand = w[8]
    if strand in ("++", "+-"):
        return line + "\t" + ",".join(qseq[a:a + b] for a, b in zip(qs, bs)) + ",\t" + ",".join(qseq[a:a + b] for a, b in zip(qs, bs)) + ","
    qq = qseq if strand == "+" else "".join({"A": "T", "C": "G", "G": "C", "T": "A"}.get(c.upper(), "N") for c in reversed(qseq)).lower()
    return line + "\t" + ",".join(qq[a:a + b] for a, b in zip(qs, bs)) + ",\t" + ",".join(tseq[a:a + b] for a, b in zip(ts, bs)) + ","
PSL_TEXTS = ["\n".join(PSL_LINES) + "\n", HDR + "\n".join(PSL_LINES) + "\n", PSL_LINES[0] + "\n", HDR, "", "\n", "psLayout version 4\n" + HDR.split("\n", 1)[1] + PSL_LINES[0] + "\n",
             "psLayout versio 3\n", "psLayout version 3\n\n\n\n\nxx\n", HDR + "\n"]
for ln, sp in zip(PSL_LINES, PSL_SPECS):
    PSL_TEXTS.append(ln + "\n")
    x = pslx(ln, sp)
    if x: PSL_TEXTS.append(x + "\n")
for t in PSL_TEXTS:
    add({"kind": "parse", "fmt": "psl", "text": t})
    add({"kind": "read", "fmt": "psl", "text": t})
for t in PSL_TEXTS[:2] + PSL_TEXTS[10:30]:
    lines = t.split("\n")
    for _ in range(15):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.15: del m[i]
        elif r < 0.75 and m[i].count("\t") > 15:
            f = m[i].split("\t"); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", "3,", f[k] + "9", "+", "-", "++", "+-"]); m[i] = "\t".join(f)
        elif r < 0.85 and m[i].count("\t") > 15:
            f = m[i].split("\t"); del f[rnd.randrange(len(f))]; m[i] = "\t".join(f)
        elif r < 0.95: m.insert(i, rnd.choice(["", "x", "1\t2"]))
        else: m = m[:i]
        add({"kind": "parse", "fmt": "psl", "text": "\n".join(m)})
for sp in PSL_SPECS:
    add({"kind": "format", "fmt": "psl", "aln": sp})
    add({"kind": "write", "fmt": "psl", "alns": [sp]})
    for kw in ({"header": False}, {"mask": "lower"}, {"mask": "upper"}, {"mask": "lower", "wildcard": "A"}, {"wildcard": None}, {"mask": "upper", "wildcard": "g"}, {"wildcard": "NN"}):
        add({"kind": "write", "fmt": "psl", "alns": [sp], "kwargs": kw})
    add({"kind": "format", "fmt": "psl", "aln": dict(sp, plain=[True, False])})
    add({"kind": "format", "fmt": "psl", "aln": dict(sp, undef=[True, False])})
    add({"kind": "format", "fmt": "psl", "aln": dict(sp, extra={"matches": 7, "misMatches": 1, "repMatches": 2, "nCount": 3})})
add({"kind": "write", "fmt": "psl", "alns": PSL_SPECS[:5]})
add({"kind": "write", "fmt": "psl", "alns": []})
add({"kind": "format", "fmt": "psl", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "ACGT"], "coords": [[0, 4], [0, 4]]}})
add({"kind": "format", "fmt": "psl", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "TTTT"], "coords": [[0, 2, 4], [0, 0, 4]]}})
add({"kind": "format", "fmt": "psl", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "ACGT"], "coords": [[0, 4], [0, 2]]}})
add({"kind": "format", "fmt": "psl", "aln": {"ids": ["a", "b", "c"], "seqs": ["ACGT", "ACGT", "ACGT"], "coords": [[0, 4], [0, 4], [0, 4]]}})
for t in PSL_TEXTS[:3]:
    add({"kind": "rewrite", "fmt": "psl", "text": t})
    add({"kind": "rewrite", "fmt": "psl", "text": t, "kwargs": {"header": False}})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "cases")
