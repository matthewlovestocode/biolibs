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
from isolate import run_isolated, report_skipped   # shared: one forked child per case, retried if it dies

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
    if getattr(a, "annotations", None): d["ann"] = {k: ([[e[0].id, len(e[0].seq), list(e[1]), e[2]] for e in v] if k == "empty" else v.tolist() if isinstance(v, np.ndarray) else list(v) if isinstance(v, bytes) else v) for k, v in a.annotations.items()}
    d["dbx"] = [list(getattr(s, "dbxrefs", [])) for s in a.sequences]
    d["rann"] = [dict(getattr(s, "annotations", {})) for s in a.sequences]
    d["lann"] = [dict(getattr(s, "letter_annotations", {})) for s in a.sequences]
    if hasattr(a, "operations"): d["ops"] = bytes(a.operations).decode()
    d["feat"] = [[[f.type, str(f.location), {k: v for k, v in f.qualifiers.items()}] for f in getattr(s, "features", [])] for s in a.sequences]
    ex = {k: getattr(a, k) for k in ("matches", "misMatches", "repMatches", "nCount", "score", "thickStart", "thickEnd", "itemRgb", "flag", "mapq", "rnext", "pnext", "tlen", "hard_clip_left", "hard_clip_right") if hasattr(a, k)}
    if ex: d["extra"] = ex
    if hasattr(a, "flag") and getattr(a, "annotations", None):
        def tag(v):
            if isinstance(v, bool): return ["bool", v]
            if isinstance(v, int): return ["int", v]
            if isinstance(v, float): return ["float", v]
            if isinstance(v, str): return ["str", v]
            if isinstance(v, bytes): return ["bytes", list(v)]
            if isinstance(v, np.ndarray): return ["np", v.tolist()]
            return ["other", repr(v)]
        d["sann"] = {k: tag(v) for k, v in a.annotations.items()}
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
        mark = lambda v: float(v["float"]) if isinstance(v, dict) and "float" in v else v
        def conv(k, v):
            if k == "empty": return [(SeqRecord(Seq(None, length=e["len"]), id=e["id"]), tuple(e["segment"]), e["status"]) for e in v]
            return mark(v)
        if spec.get("ann") is not None: a.annotations = {k: conv(k, v) for k, v in spec["ann"].items()}
        for r, info in zip(recs, spec.get("recann") or []):
            if isinstance(r, SeqRecord):
                for k, v in (info or {}).items(): r.annotations[k] = v
        for key, r in (("tann", recs[0]), ("qann", recs[1])):
            if isinstance(r, SeqRecord):
                for k, v in (spec.get(key) or {}).items(): r.annotations[k] = v
        if spec.get("qletter") and isinstance(recs[1], SeqRecord): recs[1].letter_annotations["phred_quality"] = list(spec["qletter"])
        if spec.get("ops") is not None: a.operations = bytearray(spec["ops"].encode())
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
                if hasattr(alns, "identifiers"): out["result"]["identifiers"] = list(alns.identifiers)
                tg = getattr(alns, "targets", None)
                if tg is not None: out["result"]["targets"] = [[t.id, len(t.seq), t.description, {k: v for k, v in t.annotations.items()}] for t in tg]
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
                n = Align.write(alns, buf, case["fmt"], *case.get("args", []), **case.get("kwargs", {}))
                out["result"] = {"text": buf.getvalue(), "n": n}
            elif k == "write":
                buf = io.StringIO()
                n = Align.write([build(s) for s in case["alns"]], buf, case["fmt"], *case.get("args", []), **case.get("kwargs", {}))
                out["result"] = {"text": buf.getvalue(), "n": n}
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
        out["warnings"] = [type(x.message).__name__ for x in w]
        out["wtext"] = [str(x.message) for x in w if type(x.message).__name__ == "BiopythonParserWarning"]
    return out


cases = []
def add(c):
    res = run_isolated(run, c)
    if res is None: return
    if run_isolated(run, c) != res: return        # a case whose result changes between runs depends on uninitialised memory
    # Rows of unequal length make Biopython's printed-alignment parser return coordinates that depend on uninitialised memory
    for a in res.get("result", {}).get("alns", []) if isinstance(res.get("result"), dict) else []:
        if len({len(r) for r in a["rows"] if isinstance(r, str)}) > 1: return
        # cells that np.empty left unfilled (Exonerate's vulgar reader) show up as NUL operations
        if "\x00" in a.get("ops", ""): return
        # uninitialised memory shows up as enormous coordinates or absurd lengths
        if any(abs(x) > 10 ** 12 for row in a["coords"] for x in row if x != 9223372036854775807) or (a["coords"] and len(a["coords"][0]) > 5000): return
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

# ---- BED and chain ----
BED_SPECS = []
for rev in (False, True):
    for _ in range(8):
        sp = rand_psl_spec(prng, rev=rev)
        sp["ids"] = ["chr%d" % prng.randint(1, 5), "read%d" % prng.randint(1, 9)]
        BED_SPECS.append(sp)
BED_TEXTS = []
for sp in BED_SPECS:
    for n in (12, 12, 9, 6, 5, 4, 3):
        sp2 = dict(sp, extra={"score": prng.choice([0, 100.5, 960, 1e-5]), "thickStart": sp["coords"][0][0], "thickEnd": sp["coords"][0][-1], "itemRgb": "255,0,0"})
        try: BED_TEXTS.append(build(sp2).format("bed")) if n == 12 else None
        except Exception: pass
        try:
            buf = io.StringIO(); Align.write([build(sp2)], buf, "bed", bedN=n); BED_TEXTS.append(buf.getvalue())
        except Exception: pass
BED_TEXTS += ["", "\n", "chr1\t10\t20\n", "chr1\t10\t20\tname\t.\t+\n", "chr1\t10\t20\tname\tx\n", "chr1\t10\t20\tname\t5\t-\t11\t19\t0,0,255\t1\t10,\t0,\n",
              "chr1\t10\t20\tname\t5\t-\t11\t19\t0,0,255\t2\t4,6,\t0,4,\n", "chr1\t10\n", "chr1 10 20 name\n", "\t\t\n", "chr1\t10\t20\tn\t1\t+\t1\t2\t3\t1\t10,\t0,\t9\n",
              "chr1\t10\t20\tn\t1\t+\t1\t2\t3\t2\t10,\t0,\n", "chr1\t10\t20\tn\t1\t+\tx\n"]
for t in BED_TEXTS:
    add({"kind": "parse", "fmt": "bed", "text": t})
    add({"kind": "read", "fmt": "bed", "text": t})
for t in BED_TEXTS[:25]:
    lines = t.split("\n")
    for _ in range(8):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if m[i].count("\t") >= 2 and r < 0.7:
            f = m[i].split("\t"); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", "3,", f[k] + "9", "+", "-", "."]); m[i] = "\t".join(f)
        elif r < 0.85 and m[i].count("\t") >= 2:
            f = m[i].split("\t"); del f[rnd.randrange(len(f))]; m[i] = "\t".join(f)
        else: del m[i]
        add({"kind": "parse", "fmt": "bed", "text": "\n".join(m)})
for sp in BED_SPECS:
    for n in (12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 13):
        add({"kind": "write", "fmt": "bed", "alns": [sp], "kwargs": {"bedN": n}})
    add({"kind": "format", "fmt": "bed", "aln": sp})
    add({"kind": "format", "fmt": "bed", "aln": dict(sp, extra={"score": 5, "thickStart": 3, "thickEnd": 9, "itemRgb": "1,2,3"})})
    add({"kind": "format", "fmt": "bed", "aln": dict(sp, extra={"score": "."})})
    add({"kind": "format", "fmt": "bed", "aln": dict(sp, plain=[True, True])})
add({"kind": "write", "fmt": "bed", "alns": BED_SPECS[:4]})
add({"kind": "write", "fmt": "bed", "alns": []})
add({"kind": "format", "fmt": "bed", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "TTTT"], "coords": [[0, 2, 4], [0, 0, 4]]}})
add({"kind": "format", "fmt": "bed", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "TTTT"], "coords": [[0, 4], [4, 0]]}})
add({"kind": "format", "fmt": "bed", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "TTTT"], "coords": [[4, 0], [0, 4]]}})

CHAIN_SPECS = []
for tr in (False, True):
    for qr in (False, True):
        for _ in range(5):
            sp = rand_psl_spec(prng, rev=qr)
            if tr:
                tl = len(sp["seqs"][0]); sp["coords"][0] = [tl - x for x in sp["coords"][0]]
            sp["extra"] = {"score": prng.choice([0, 1234, 55.5, 1e7])}
            if prng.random() < 0.5: sp["ann"] = {"id": str(prng.randint(1, 99))}
            CHAIN_SPECS.append(sp)
CHAIN_TEXTS = []
for sp in CHAIN_SPECS:
    try: CHAIN_TEXTS.append(build(sp).format("chain"))
    except Exception: pass
CHAIN_TEXTS.append("".join(CHAIN_TEXTS[:5]))
CHAIN_TEXTS.append("# comment\n# more\n" + "".join(CHAIN_TEXTS[:3]))
CHAIN_TEXTS.append("".join(t.rstrip("\n") + "\n" for t in CHAIN_TEXTS[:4]))
CHAIN_TEXTS += ["", "\n", "# only comment\n", "chain 5 a 10 + 0 5 b 10 + 0 5\n5\n", "chain 5 a 10 + 0 5 b 10 + 0 5\n", "chain 5 a 10 + 0 5 b 10 + 0 5\n2\t1\t0\n2\n", "chain 5 a 10 x 0 5 b 10 + 0 5\n5\n",
                "chain 5 a 10 + 0 5 b 10 y 0 5\n5\n", "chain 5 a 10 + 0 5 b 10\n5\n", "foo 5 a 10 + 0 5 b 10 + 0 5\n5\n", "chain x a 10 + 0 5 b 10 + 0 5\n5\n", "chain 5 a 10 + 0 5 b 10 + 0 5\n\n5\n",
                "chain 5 a 10 + 0 5 b 10 + 0 5\n2\t1\n", "chain 5 a 10 + 0 5 b 10 + 0 5\n2\t1\t1\t9\n"]
for t in CHAIN_TEXTS:
    add({"kind": "parse", "fmt": "chain", "text": t})
    add({"kind": "read", "fmt": "chain", "text": t})
for t in CHAIN_TEXTS[:14]:
    lines = t.split("\n")
    for _ in range(10):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.3: del m[i]
        elif r < 0.6 and m[i]:
            f = m[i].split(); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", f[k] + "9", "+", "-"]); m[i] = (" " if m[i].startswith("chain") else "\t").join(f)
        elif r < 0.8: m.insert(i, rnd.choice(["", "#", "x", "5\t1\t1", "3"]))
        else: m = m[:i]
        add({"kind": "parse", "fmt": "chain", "text": "\n".join(m)})
for sp in CHAIN_SPECS:
    add({"kind": "format", "fmt": "chain", "aln": sp})
    add({"kind": "write", "fmt": "chain", "alns": [sp]})
    add({"kind": "format", "fmt": "chain", "aln": dict(sp, plain=[True, True])})
add({"kind": "write", "fmt": "chain", "alns": CHAIN_SPECS[:5]})
add({"kind": "write", "fmt": "chain", "alns": []})
add({"kind": "format", "fmt": "chain", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "TTTT"], "coords": [[0, 2, 4], [0, 0, 4]]}})
add({"kind": "format", "fmt": "chain", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "TTTT"], "coords": [[0, 4], [0, 2]], "extra": {"score": "x"}}})
for t in CHAIN_TEXTS[:2] + BED_TEXTS[:2]:
    add({"kind": "rewrite", "fmt": "chain" if t in CHAIN_TEXTS else "bed", "text": t})

# ---- SAM ----
def sam_spec(r, rev=False, ops=False):
    sp = rand_psl_spec(r, rev=rev)
    sp["ids"] = ["chr1", "read%d" % r.randint(1, 9)]
    n = len(sp["seqs"][1])
    sp["qletter"] = [r.randint(0, 40) for _ in range(n)] if r.random() < 0.5 else None
    if sp["qletter"] is None: del sp["qletter"]
    sp["qann"] = {k: r.randint(1, 9) for k in ("hard_clip_left", "hard_clip_right") if r.random() < 0.3}
    sp["extra"] = {"flag": r.choice([0, 1, 2, 256, 1024]), "mapq": r.choice([0, 30, 60]), "rnext": r.choice(["chr1", "chr2"]), "pnext": r.randint(0, 20)} if r.random() < 0.6 else {}
    if r.random() < 0.5: sp["extra"]["score"] = r.choice([0, 7, 42.5, 100])
    if r.random() < 0.5: sp["ann"] = {"NM": r.randint(0, 5), "XS": r.choice(["+", "-", "ab"]), "XF": {"float": r.choice([0.5, 2.0, 1e-5, 3.25])}}
    return sp
SAM_SPECS = [sam_spec(prng, rev=v) for v in (False, True) for _ in range(10)]
SAM_HDR = "@HD\tVN:1.6\tSO:coordinate\n@SQ\tSN:chr1\tLN:100\n@SQ\tSN:chr2\tLN:80\tAS:hg\tSP:Homo\tM5:abc\tDS:desc\tAH:*\tAN:a,b\tTP:circular\tUR:file:x\tXX:y\n@PG\tID:p1\tPN:prog\n@PG\tID:p2\tPN:prog2\tPP:p1\n@CO\tID:note\n"
SAM_LINES = []
for sp in SAM_SPECS:
    for kw in ({}, {"md": True}):
        try:
            sp2 = dict(sp, seqs=[sp["seqs"][0].upper(), sp["seqs"][1].upper()])
            buf = io.StringIO(); Align.write([build(sp2)], buf, "sam", **kw); SAM_LINES.append(buf.getvalue())
        except Exception: pass
SAM_TEXTS = [SAM_HDR + "".join(SAM_LINES[:6]), "".join(SAM_LINES[:6])] + [SAM_HDR + l for l in SAM_LINES] + [l for l in SAM_LINES[:12]]
Q = "ACGTACGTAC"
H1 = "@SQ\tSN:chr1\tLN:100\n"
HANDMADE = [
    f"r1\t0\tchr1\t5\t60\t10M\t*\t0\t0\t{Q}\t*\n", f"r1\t16\tchr1\t5\t60\t10M\t=\t20\t30\t{Q}\t{'I' * 10}\tNM:i:1\tXF:f:2.5\tXA:A:x\tXZ:Z:hello\tXH:H:0102\tXB:B:i1,2,3\tXC:B:f1.5,2\n",
    f"r1\t0\tchr1\t5\t255\t2S4M1I2M1D1M\t*\t0\t0\t{Q}\t*\n", f"r1\t0\tchr1\t5\t255\t3H2S4M2N4M3S2H\t*\t0\t0\t{Q}\t*\n", f"r1\t0\tchr1\t5\t255\t4=2X4M\t*\t0\t0\t{Q}\t*\n",
    f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tMD:Z:4A5\tAS:i:7\n", f"r1\t0\tchr1\t5\t255\t4M2D4M\t*\t0\t0\tACGTACGT\t*\tMD:Z:4^GG4\n", f"r1\t0\tchr1\t5\t255\t4M2N4M\t*\t0\t0\tACGTACGT\t*\tMD:Z:8\n",
    f"r1\t0\tchr1\t5\t255\t4M1I3M\t*\t0\t0\tACGTACGT\t*\tMD:Z:3C3\n", f"r1\t16\tchr1\t5\t255\t4M2D4M\t*\t0\t0\tACGTACGT\t*\tMD:Z:2T1^AC4\n",
    "r1\t4\t*\t0\t0\t*\t*\t0\t0\tACGT\t*\n", "r1\t4\t*\t0\t0\t*\t*\t0\t0\t*\t*\n", f"r1\t0\tchr1\t5\t255\t*\t*\t0\t0\t{Q}\t*\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t*\t*\n",
    f"r1\t0\tchr9\t5\t255\t10M\t*\t0\t0\t{Q}\t*\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tMD:Z:10\n", f"r1\t0\tchr9\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tMD:Z:10\n",
    f"r1\t0\tchr1\t5\t255\t5M1P4M\t*\t0\t0\t{Q}\t*\n", f"r1\t0\tchr1\t5\t255\t8M\t*\t0\t0\t{Q}\t*\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tAS:Z:7\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tMD:i:7\n",
    f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tXB:B:q,1\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tXB:B:i,1,x\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tXB:B:\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tXH:H:0x\n",
    f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\tbad\n", f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\n", "r1\t0\n", f"r1\tx\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t*\n",
    f"r1\t0\tchr1\t5\t255\t10M\t*\t0\t0\t{Q}\t{'I' * 9}\n", f"r1\t0\tchr1\t5\t255\tM\t*\t0\t0\t{Q}\t*\n", f"r1\t0\tchr1\t5\t255\t10Q\t*\t0\t0\t{Q}\t*\n", "\n", "",
]
for h in ("", H1, SAM_HDR, "@SQ\tSN:chr1\n", "@SQ\tLN:5\n", "@SQ\tSN:chr1\tLN:5\n@SQ\tLN:7\n", "@SQ\tSN:chr1\tLN:5\tTP:x\n", "@HD\tVN\n", "@HD\tVNN:1\n", "@HD\n@SQ\tSN:a\tLN:x\n", "@CO\tx\n"):
    for t in HANDMADE[:12] + HANDMADE[12:]:
        if h in ("", H1) or t is HANDMADE[0] or t is HANDMADE[1]:
            SAM_TEXTS.append(h + t)
SAM_TEXTS += ["@HD\tVN:1.6\n", H1, "@SQ\tSN:chr1\tLN:100\n@SQ\tSN:chr1\tLN:50\n" + HANDMADE[0] + HANDMADE[1], SAM_HDR + HANDMADE[0] + HANDMADE[1] + HANDMADE[4]]
for t in SAM_TEXTS:
    add({"kind": "parse", "fmt": "sam", "text": t})
    add({"kind": "read", "fmt": "sam", "text": t})
for t in SAM_TEXTS[:12] + SAM_TEXTS[40:50]:
    lines = t.split("\n")
    for _ in range(8):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if "\t" in m[i] and r < 0.7:
            f = m[i].split("\t"); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", "10M", "*", "=", f[k] + "9", f[k][:-1]]); m[i] = "\t".join(f)
        elif r < 0.85 and "\t" in m[i]:
            f = m[i].split("\t"); del f[rnd.randrange(len(f))]; m[i] = "\t".join(f)
        else: del m[i]
        add({"kind": "parse", "fmt": "sam", "text": "\n".join(m)})
for sp in SAM_SPECS:
    add({"kind": "format", "fmt": "sam", "aln": sp})
    add({"kind": "write", "fmt": "sam", "alns": [sp]})
    add({"kind": "write", "fmt": "sam", "alns": [sp], "kwargs": {"md": True}})
    add({"kind": "format", "fmt": "sam", "aln": dict(sp, plain=[True, True])})
    add({"kind": "format", "fmt": "sam", "aln": dict(sp, undef=[False, True])})
    add({"kind": "format", "fmt": "sam", "aln": dict(sp, undef=[True, False])})
    add({"kind": "write", "fmt": "sam", "alns": [dict(sp, undef=[True, False])], "kwargs": {"md": True}})
    add({"kind": "format", "fmt": "sam", "aln": dict(sp, ops="M" * 20)})
add({"kind": "write", "fmt": "sam", "alns": SAM_SPECS[:4]})
add({"kind": "write", "fmt": "sam", "alns": []})
for t in SAM_TEXTS[:3] + SAM_TEXTS[20:24]:
    add({"kind": "rewrite", "fmt": "sam", "text": t})
    add({"kind": "rewrite", "fmt": "sam", "text": t, "kwargs": {"md": True}})
for kw in ({}, {"md": True}):
    add({"kind": "rewrite", "fmt": "sam", "text": SAM_HDR + HANDMADE[2] + HANDMADE[3] + HANDMADE[4] + HANDMADE[5], "kwargs": kw})
add({"kind": "format", "fmt": "sam", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "ACGT"], "coords": [[0, 4], [0, 4]], "ann": {"X": [1]}}})
add({"kind": "format", "fmt": "sam", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "ACGT"], "coords": [[0], [0]]}})
add({"kind": "format", "fmt": "sam", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "ACGT"], "coords": [[], []]}})
add({"kind": "format", "fmt": "sam", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "ACGTA"], "coords": [[0, 2, 4], [0, 2, 5]]}})
add({"kind": "format", "fmt": "sam", "aln": {"ids": ["a", "b"], "seqs": ["ACGT", "ACGT"], "coords": [[0, 4], [0, 4]], "extra": {"score": "x"}}})

# ---- MAF ----
def rand_msa_spec(r, nseq, ncols, strands=None):
    rows = []
    for k in range(nseq):
        rows.append([r.choice("ACGT") if r.random() > 0.2 else "-" for _ in range(ncols)])
    for c in range(ncols):
        if all(row[c] == "-" for row in rows): rows[r.randrange(nseq)][c] = r.choice("ACGT")
    rows = ["".join(x) for x in rows]
    sp = {"ids": ["seq%d.chr%d" % (i, r.randint(1, 3)) for i in range(nseq)], "rows": rows}
    a = build(sp)
    seqs = [str(s.seq) for s in a.sequences]
    # grow each sequence with flanking letters so that starts and sizes are not trivial
    coords = a.coordinates.tolist()
    out_seqs, out_coords = [], []
    for k, (q, c) in enumerate(zip(seqs, coords)):
        pre, post = r.randint(0, 4), r.randint(0, 4)
        q2 = "".join(r.choice("ACGT") for _ in range(pre)) + q + "".join(r.choice("ACGT") for _ in range(post))
        c2 = [x + pre for x in c]
        if (strands[k] if strands else r.random() < 0.3):
            c2 = [len(q2) - x for x in c2]
        out_seqs.append(q2); out_coords.append(c2)
    return {"ids": sp["ids"], "seqs": out_seqs, "coords": out_coords}

MAF_SPECS = [rand_msa_spec(prng, prng.randint(2, 4), prng.randint(4, 14)) for _ in range(14)]
for i, sp in enumerate(MAF_SPECS):
    if i % 2: sp["extra"] = {"score": prng.choice([0, 1234.5, 12])}
    if i % 3 == 0: sp["ann"] = {"pass": prng.randint(1, 9)}
    if i % 4 == 0:
        sp["recann"] = [{"quality": "9" * abs(sp["coords"][0][-1] - sp["coords"][0][0]), "leftStatus": "C", "leftCount": 0, "rightStatus": "I", "rightCount": 5}] + [None] * (len(sp["ids"]) - 1)
    if i % 5 == 0:
        sp.setdefault("ann", {})["empty"] = [{"id": "other.chr1", "len": 100, "segment": [10, 20], "status": "C"}, {"id": "x.chr2", "len": 50, "segment": [30, 20], "status": "n"}]
MAF_TEXTS = []
for sp in MAF_SPECS:
    try:
        sp2 = dict(sp)
        a = build(sp2)
        buf = io.StringIO(); Align.write([a], buf, "maf"); MAF_TEXTS.append(buf.getvalue())
    except Exception: pass
JOINED = ""
for sp in MAF_SPECS[:6]:
    try: JOINED += build(sp).format("maf")
    except Exception: pass
MAF_TEXTS += ["##maf version=1\n\n" + JOINED, "##maf version=1 scoring=blastz program=lastz\n# comment one\n# comment two\n\n" + JOINED,
              'track name="my maf" description=desc mafDot=on visibility=full speciesOrder="a b c"\n##maf version=1\n\n' + JOINED,
              "##maf version=1\n\na score=23262.0 pass=2\ns hg16.chr7    27578828 38 + 158545518 AAA-GGGAATGTTAACCAAATGA---ATTGTCTCTTACGGTG\ns panTro1.chr6 28741140 38 + 161576975 AAA-GGGAATGTTAACCAAATGA---ATTGTCTCTTACGGTG\ns baboon         116834 38 +   4622798 AAA-GGGAATGTTAACCAAATGA---GTTGTCTCTTATGGTG\ns mm4.chr6     53215344 38 + 151104725 -AATGGGAATGTTAAGCAAACGA---ATTGTCTCTCAGTGTG\nq panTro1.chr6                                 99999999999999999999999---99999999999999999\ni panTro1.chr6 N 0 C 0\n\n",
              "##maf version=1\n\na score=5\ns a 0 3 + 10 ACG\ns b 2 3 - 10 A-CG\n\n", "##maf version=2\n", "##maf version=1\n", "##maf version=1\n# c\n", "##maf\n", "", "maf\n", "##maf version=1\n\nb score=1\n",
              "##maf version=1\n\na bogus=1\ns a 0 3 + 10 ACG\n", "##maf version=1\n\na score=x\n", "##maf version=1\n\na pass=0\n", "##maf version=1\n\na score\n", "##maf version=1\n\na\ns a 0 3 + 10\n",
              "##maf version=1\n\na\ns a 0 3 + 10 ACG\ni a N 0 C\n", "##maf version=1\n\na\ni a N 0 C 0\n", "##maf version=1\n\na\ns a 0 3 + 10 ACG\ni b N 0 C 0\n", "##maf version=1\n\na\ns a 0 3 + 10 ACG\ni a X 0 C 0\n",
              "##maf version=1\n\na\ns a 0 3 + 10 ACG\nq a 999\nq a 99\n", "##maf version=1\n\na\ns a 0 3 + 10 ACG\ne b 5 4 + 20 C\ne c 5 4 - 20 n\ne d 5 4 + 20 X\n", "##maf version=1\n\na\ns a 0 3 + 10 ACG\ne b 5 4 + 20\n",
              "##maf version=1\n\na\ns a 0 4 + 10 ACG\n", "##maf version=1\n\na\ns a 0 3 + 10 ACG\nzzz\n", "##maf version=1\n\na\n", "##maf version=1\n\na\ns a 0 0 + 10 -\n", "##maf version=1\n\na\ns a 0 3 + 10 A.G\ns b 0 3 + 10 A=G\n",
              "track name=x bogus=1\n##maf version=1\n\na\ns a 0 3 + 10 ACG\n", "track mafDot=maybe\n##maf version=1\n", "track visibility=x\n##maf version=1\n", "track name\n##maf version=1\n", "track name=\"unclosed\n##maf version=1\n", "track speciesOrder=\"a b\"\n##maf version=1\n\na\ns a 0 3 + 10 ACG\n",
              "##maf version=1 foo=bar\n", "##maf version=1 scoring\n", "##maf version=1\n\nxx\n"]
for t in MAF_TEXTS:
    add({"kind": "parse", "fmt": "maf", "text": t})
    add({"kind": "read", "fmt": "maf", "text": t})
    add({"kind": "rewrite", "fmt": "maf", "text": t})
for t in MAF_TEXTS[:16]:
    lines = t.split("\n")
    for _ in range(6):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.3: del m[i]
        elif r < 0.6 and m[i]:
            f = m[i].split(" "); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", f[k] + "9", "+", "-"]); m[i] = " ".join(f)
        elif r < 0.8: m.insert(i, rnd.choice(["", "#", "s a 0 1 + 5 A", "q a 9", "e a 0 1 + 5 C", "a score=1"]))
        else: m = m[:i]
        t2 = "\n".join(m)
        # Rows of unequal length make Biopython's printed-alignment parser depend on uninitialised memory: skip such texts.
        blocks, cur = [], None
        for ln in t2.split("\n"):
            if ln.startswith("a"): cur = []; blocks.append(cur)
            elif ln.startswith("s "):
                if cur is None: cur = []; blocks.append(cur)
                if len(ln.split()) == 7: cur.append(len(ln.split()[6]))
        if all(len(set(b)) <= 1 for b in blocks): add({"kind": "parse", "fmt": "maf", "text": t2})
for sp in MAF_SPECS:
    add({"kind": "format", "fmt": "maf", "aln": sp})
    add({"kind": "write", "fmt": "maf", "alns": [sp]})
    add({"kind": "format", "fmt": "maf", "aln": dict(sp, plain=[True] * len(sp["ids"]))})
add({"kind": "write", "fmt": "maf", "alns": MAF_SPECS[:5]})
add({"kind": "write", "fmt": "maf", "alns": []})

# ---- Mauve ----
def mauve_spec(r, n, files):
    sp = rand_msa_spec(r, n, r.randint(4, 12))
    sp["ids"] = [("%d" % i) if not files else ("seq%d.fa" % (i + 1)) for i in range(n)]
    return sp
MAUVE_SPECS = [mauve_spec(prng, prng.randint(2, 4), files) for files in (False, True) for _ in range(6)]
MAUVE_TEXTS = []
for k, sp in enumerate(MAUVE_SPECS):
    files = k >= 6
    mmeta = {"File": "all.fa"} if not files else {}
    if k % 3 == 0: mmeta["BackboneFile"] = "out.backbone"
    if k % 4 == 0: mmeta["FormatVersion"] = "Mauve2"
    try:
        buf = io.StringIO(); Align.write([build(sp), build(sp)], buf, "mauve", metadata=mmeta, identifiers=sp["ids"]); MAUVE_TEXTS.append(buf.getvalue())
    except Exception: pass
MAUVE_TEXTS += ["#FormatVersion Mauve1\n#Sequence1File\ta.fa\n#Sequence1Format\tFastA\n#Sequence2File\tb.fa\n#Sequence2Format\tFastA\n> 1:1-6 + a.fa\nACGT-A\n> 2:1-6 - b.fa\nACGTTA\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\tall.fa\n#Sequence1Entry\t1\n#Sequence1Format\tFastA\n#Sequence2File\tall.fa\n#Sequence2Entry\t2\n#Sequence2Format\tFastA\n> 1:3-7 + all.fa\nACGT-A\n> 2:1-6 + all.fa\nACGTTA\n=\n> 1:0-0 + all.fa\n\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n#Sequence1Format\tFastA\n", "#Sequence1File\ta.fa\n", "", "#\n", "#a b c\n", "#Sequence1Bogus\tx\n", "#SequenceXFile\tx\n", "#Sequence2File\tx\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n#Sequence2File\ta.fa\n> 1:1-2 + a.fa\nAC\n> 2:1-2 + a.fa\nAC\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n#Sequence2File\ta.fa\n#Sequence1Entry\t1\n#Sequence2Entry\t2\n> 1:1-2 + a.fa\nAC\n> 2:1-2 + a.fa\nAC\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n#Sequence2File\ta.fa\n#Sequence1Entry\tx\n", "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1:1-2 + a.fa\nAC\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 5:1-2 + a.fa\nAC\n=\n", "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 0:1-2 + a.fa\nAC\n=\n", "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1:1-3 + a.fa\nAC\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1:1-2 x a.fa\nAC\n=\n", "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1:1-2 +- a.fa\nAC\n=\n", "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1:1-2 +\nAC\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1:0-2 + a.fa\nAC\n=\n", "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1-1-2 + a.fa\nAC\n=\n", "#FormatVersion Mauve1\n#Sequence1File\ta.fa\nAC\n> 1:1-2 + a.fa\nAC\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n#Sequence2File\tb.fa\n> 1:1-2 + a.fa\nAC\n> 2:1-2 + b.fa\nAC\n=\n> 1:3-4 - a.fa\nAC\n> 2:5-6 + b.fa\nAC\n=\n",
                "#FormatVersion Mauve1\n#Sequence1File\ta.fa\n> 1:1-2 + a.fa description with spaces\nA\nC\n=\n"]
for t in MAUVE_TEXTS:
    add({"kind": "parse", "fmt": "mauve", "text": t})
    add({"kind": "read", "fmt": "mauve", "text": t})
    add({"kind": "rewrite", "fmt": "mauve", "text": t})
for t in MAUVE_TEXTS[:14]:
    lines = t.split("\n")
    for _ in range(8):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.3: del m[i]
        elif r < 0.6 and m[i]:
            f = m[i].split(" "); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", f[k] + "9", "+", "-"]); m[i] = " ".join(f)
        elif r < 0.8: m.insert(i, rnd.choice(["", "#", "=", "> 1:1-2 + a.fa", "AC"]))
        else: m = m[:i]
        t2 = "\n".join(m)
        rows_ok = True
        blocks, cur = [], []
        for ln in t2.split("\n"):
            if ln.startswith(">"): cur.append("")
            elif ln.startswith("="): blocks.append(cur); cur = []
            elif cur and not ln.startswith("#"): cur[-1] += ln.strip()
        if all(len({len(x) for x in b}) <= 1 for b in blocks): add({"kind": "parse", "fmt": "mauve", "text": t2})
for k, sp in enumerate(MAUVE_SPECS):
    files = k >= 6
    mmeta = {"File": "all.fa"} if not files else {}
    add({"kind": "format", "fmt": "mauve", "aln": sp})
    add({"kind": "write", "fmt": "mauve", "alns": [sp, sp], "kwargs": {"metadata": mmeta, "identifiers": sp["ids"]}})
    add({"kind": "write", "fmt": "mauve", "alns": [sp], "kwargs": {"metadata": mmeta}})
    add({"kind": "write", "fmt": "mauve", "alns": [sp], "kwargs": {"metadata": mmeta, "identifiers": sp["ids"][:1]}})
    add({"kind": "write", "fmt": "mauve", "alns": [sp], "kwargs": {"metadata": {"File": "x", "BackboneFile": "bb"}, "identifiers": ["0", "x"]}})
add({"kind": "write", "fmt": "mauve", "alns": []})

# ---- HHR ----
def hhr_text(r, nhits=2, match=30, with_ss=True, dones=True, name="sp|P12345|TEST some description"):
    L = [f"Query         {name}", f"Match_columns {match}", "No_of_seqs    10 out of 12", "Neff          3.5", "Searched_HMMs 100", "Date          Mon Jan  1 00:00:00 2020", "Command       hhsearch -i q.a3m -d db", ""]
    L.append(" No Hit                             Prob E-value P-value  Score    SS Cols Query HMM  Template HMM")
    hits = []
    for i in range(nhits):
        cols = r.randint(6, 12)
        qs, ts = r.randint(0, match - cols), r.randint(0, 20)
        q = ""; t = ""
        for _ in range(cols):
            k = r.random()
            if k < 0.1: q += "-"; t += r.choice("ACDEFGHIK")
            elif k < 0.2: t += "-"; q += r.choice("ACDEFGHIK")
            else: q += r.choice("ACDEFGHIK"); t += r.choice("ACDEFGHIK")
        tlen = ts + len(t.replace("-", "")) + r.randint(0, 10)
        hits.append((f"tmpl{i + 1}", f"description {i + 1}", qs, ts, q, t, tlen))
        L.append(f"{i + 1:>3} tmpl{i + 1} description {i + 1}        99.9 1.2E-20 3.4E-25  100.1   5.0   {cols}    {qs + 1}-{qs + len(q.replace('-', ''))}     {ts + 1}-{ts + len(t.replace('-', ''))} ({tlen})")
    L.append("")
    for i, (tn, td, qs, ts, q, t, tlen) in enumerate(hits):
        qe, te = qs + len(q.replace("-", "")), ts + len(t.replace("-", ""))
        L += [f"No {i + 1}", f">{tn} {td}", "Probab=99.89  E-value=1.2e-20  Score=100.12  Aligned_cols=%d  Identities=40%%  Similarity=0.5  Sum_probs=29.0  Template_Neff=5.0" % len(q), ""]
        L.append(f"Q {name.split()[0]:<14} {qs + 1:>3} {q} {qe:>3} ({match})")
        L.append(f"Q Consensus    {qs + 1:>3} {q} {qe:>3} ({match})")
        L.append("                  " + "".join("|" if a == b else " " for a, b in zip(q, t)))
        L.append(f"T Consensus    {ts + 1:>3} {t} {te:>3} ({tlen})")
        L.append(f"T {tn:<14} {ts + 1:>3} {t} {te:>3} ({tlen})")
        L.append("Confidence     " + "9" * len(q))
        if with_ss:
            L.append("Q ss_pred      " + "c" * len(q.replace("-", "")))
            L.append("T ss_pred      " + "h" * len(t.replace("-", "")))
            L.append("T ss_dssp      " + "e" * len(t.replace("-", "")))
        L.append("")
    if dones: L.append("Done!")
    return "\n".join(L) + "\n"
HHR_TEXTS = [hhr_text(prng, nh, match=m, with_ss=ss) for nh in (1, 2, 3) for m in (30, 40) for ss in (True, False)]
HHR_TEXTS += [hhr_text(prng, 2, dones=False), hhr_text(prng, 2, name="q1"), hhr_text(prng, 1, match=12), "", "\n", "Query q\n", "Query q\nMatch_columns 5\n\n", "Query q\nMatch_columns 5\n\n No Hit x\n",
              "Bogus 1\n\n", "Query q\nNo_of_seqs 5\n\n", "Query q\nNo_of_seqs 5 out of 6 out of 7\n\n", "Query q\nNeff x\n\n", "Query q\nSearched_HMMs 1.5\n\n", "Query\n\n",
              "Query q\nMatch_columns 5\n\n No Hit Prob E-value P-value Score SS Cols Query HMM Template HMM\n  1 a b\n\nNo 1\n>a b\nProbab=1\n\nQ q 1 AC 2 (5)\nT a 1 AC 2 (5)\n\nDone!\n",
              "Query q\nMatch_columns 5\n\n No Hit Prob E-value P-value Score SS Cols Query HMM Template HMM\n  1 a b\n\nNo 1\nNo 2\n", "Query q\nMatch_columns 5\n\n No Hit Prob E-value P-value Score SS Cols Query HMM Template HMM\n  2 a b\n\n",
              "Query q\nMatch_columns 5\n\n No Hit Prob E-value P-value Score SS Cols Query HMM Template HMM\n  1 a b\n\nNo 1\nzzz\n"]
for t in HHR_TEXTS:
    add({"kind": "parse", "fmt": "hhr", "text": t})
    add({"kind": "read", "fmt": "hhr", "text": t})
for t in HHR_TEXTS[:14]:
    lines = t.split("\n")
    for _ in range(14):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.25: del m[i]
        elif r < 0.55 and m[i].split():
            f = m[i].split(" "); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", f[k] + "9", "(5)", "()", "1.5"]); m[i] = " ".join(f)
        elif r < 0.75: m.insert(i, rnd.choice(["", " ", "Done!", "No 1", "No 9", "Confidence", "Q ss_pred", "T ss_pred x", "junk", ">a b", "Q Consensus 1 AC 2 (30)"]))
        elif r < 0.9: m[i] = m[i][:rnd.randrange(len(m[i]) + 1)]
        else: m = m[:i]
        t2 = "\n".join(m)
        # rows of unequal length are not a valid alignment (and read uninitialised memory in Biopython's parser)
        add({"kind": "parse", "fmt": "hhr", "text": t2})

# ---- Exonerate ----
def exo_spec(r, dnax, rev_t=False, rev_q=False, ops=False, protein_target=False):
    sp = rand_psl_spec(r, dnax=dnax, rev=False)
    tc, qc = sp["coords"]
    tl, ql = len(sp["seqs"][0]), len(sp["seqs"][1])
    if rev_t: tc = [tl - x for x in tc]
    if rev_q: qc = [ql - x for x in qc]
    sp["coords"] = [tc, qc]
    sp["ids"] = ["target1", "query1"]
    sp["extra"] = {"score": r.choice([0, 100, 55.5, 1e6])}
    if dnax: sp["qann"] = {"molecule_type": "protein"}
    if protein_target: sp["tann"] = {"molecule_type": "protein"}
    if ops:
        steps = [(abs(tc[i + 1] - tc[i]), abs(qc[i + 1] - qc[i])) for i in range(len(tc) - 1)]
        o = ""
        for t, q in steps:
            if t == q: o += "M"
            elif q == 0: o += "D"
            elif t == 0: o += "I"
            else: o += "M"
        o = "".join(r.choice(o) if r.random() < 0.1 else ch for ch in o)
        sp["ops"] = o
    return sp
EXO_SPECS = []
for dnax in (False, True):
    for rt, rq in ((False, False), (True, False), (False, True), (True, True)):
        for ops in (False, True):
            for _ in range(2): EXO_SPECS.append(exo_spec(prng, dnax, rt, rq, ops))
EXO_SPECS += [exo_spec(prng, False, protein_target=True) for _ in range(2)] + [exo_spec(prng, True, protein_target=True) for _ in range(2)]
EXO_HDR = "Command line: [exonerate --model est2genome q.fa t.fa]\nHostname: [myhost]\n"
EXO_TEXTS = []
for sp in EXO_SPECS:
    for kw in ({}, {"fmt": "cigar"}):
        try:
            buf = io.StringIO(); Align.write([build(sp)], buf, "exonerate", **kw); EXO_TEXTS.append(buf.getvalue())
        except Exception: pass
EXO_TEXTS += [EXO_HDR + "vulgar: q 0 11 + t 100 111 + 55 M 11 11\n-- completed exonerate analysis\n", EXO_HDR + "cigar: q 0 11 + t 100 111 - 55.5 M 11\n-- completed exonerate analysis\n",
              EXO_HDR + "vulgar: q 0 30 . t 0 90 + 100 M 10 30 5 0 2 I 0 100 3 0 2 M 10 30 G 0 3 C 3 9 S 1 1 F 0 1 N 2 4\n-- completed exonerate analysis\n",
              EXO_HDR + "cigar: q 0 10 . t 0 30 + 100 M 10 D 2 I 1\n-- completed exonerate analysis\n", EXO_HDR + "cigar: q 0 10 + t 0 30 . 100 M 10 D 2 I 1\n-- completed exonerate analysis\n",
              EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5 X 1 1\n-- completed exonerate analysis\n", EXO_HDR + "cigar: q 0 11 + t 0 11 + 5 X 1\n-- completed exonerate analysis\n",
              EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5 G 1 1\n-- completed exonerate analysis\n", EXO_HDR + "vulgar: q 0 11 x t 0 11 + 5 M 11 11\n-- completed exonerate analysis\n", EXO_HDR + "cigar: q 0 11 + t 0 11 y 5 M 11\n-- completed exonerate analysis\n",
              EXO_HDR, EXO_HDR + "-- completed exonerate analysis\n", EXO_HDR + "-- completed exonerate analysis\nextra\n", EXO_HDR + "junk\n", EXO_HDR + "vulgar: q 0\n", EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5\n-- completed exonerate analysis\n",
              EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5 M 11\n-- completed exonerate analysis\n", EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5 M a b\n-- completed exonerate analysis\n", EXO_HDR + "vulgar: q 0 11 + t 0 11 + x M 11 11\n-- completed exonerate analysis\n",
              EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5 M 11 11 M 1 1\nvulgar: q 0 11 + t 0 11 + 5 M 11 11\n-- completed exonerate analysis\n", "", "Command line: x\n", "Command line: [x]\n", "Command line: [x]\nHostname: y\n", "Command line: [x]\nHost: [y]\n",
              EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5 N 0 5 M 11 11\n-- completed exonerate analysis\n", EXO_HDR + "vulgar: q 0 11 + t 0 11 + 5 N 3 5 M 11 11\n-- completed exonerate analysis\n"]
for t in EXO_TEXTS:
    add({"kind": "parse", "fmt": "exonerate", "text": t})
    add({"kind": "read", "fmt": "exonerate", "text": t})
for t in EXO_TEXTS[:12] + EXO_TEXTS[24:34]:
    lines = t.split("\n")
    for _ in range(8):
        m = list(lines); i = rnd.randrange(len(m)); r = rnd.random()
        if r < 0.2: del m[i]
        elif r < 0.7 and m[i].split():
            f = m[i].split(" "); k = rnd.randrange(len(f)); f[k] = rnd.choice(["", "x", "-1", "0", "5", "M", "G", "N", "I", "U", f[k] + "9", "+", "-", "."]); m[i] = " ".join(f)
        elif r < 0.85: m.insert(i, rnd.choice(["", "junk", "vulgar: q 0 1 + t 0 1 + 1 M 1 1", "-- completed exonerate analysis"]))
        else: m = m[:i]
        add({"kind": "parse", "fmt": "exonerate", "text": "\n".join(m)})
for sp in EXO_SPECS:
    add({"kind": "format", "fmt": "exonerate", "aln": sp})
    add({"kind": "write", "fmt": "exonerate", "alns": [sp]})
    add({"kind": "write", "fmt": "exonerate", "alns": [sp], "args": ["cigar"]})
    add({"kind": "write", "fmt": "exonerate", "alns": [sp, sp], "args": ["cigar"]})
    add({"kind": "format", "fmt": "exonerate", "aln": dict(sp, plain=[True, True])})
    add({"kind": "format", "fmt": "exonerate", "aln": dict(sp, extra={})})
add({"kind": "write", "fmt": "exonerate", "alns": [EXO_SPECS[0]], "args": ["bogus"]})
add({"kind": "write", "fmt": "exonerate", "alns": []})
for t in EXO_TEXTS[:3] + EXO_TEXTS[24:27]:
    add({"kind": "rewrite", "fmt": "exonerate", "text": t})
    add({"kind": "rewrite", "fmt": "exonerate", "text": t, "args": ["cigar"]})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
report_skipped()
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "cases")
