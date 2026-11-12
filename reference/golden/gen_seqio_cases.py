"""Golden cases for Bio.SeqIO (text formats).

Output: packages/seqio/test/golden/seqio-<family>.json   (family given on the command line; default: fasta)
Case kinds: parse, read, write, writer, format, to_dict, convert, simple_parser.
A parse case records the records yielded before any error, then the error.
"""
import io, json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
import Bio
from Bio import SeqIO
from Bio.SeqIO import FastaIO, QualityIO as Q
from Bio.SeqRecord import SeqRecord
from codec import S, M, U, LST
from codec_feature import enc, dec, REC, FEAT, SL as LOC

FAMILY = sys.argv[1] if len(sys.argv) > 1 else "fasta"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqio", "test", "golden", f"seqio-{FAMILY}.json")
rnd = random.Random(2024)

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else ("ValueError" if isinstance(e, UnicodeError) else type(e).__name__)
def emsg(e):
    if type(e).__name__ == "AttributeError" or isinstance(e, UnicodeError): return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

def src(case):
    return io.BytesIO(case["bytes"].encode("latin-1")) if "bytes" in case else io.StringIO(case["text"])

WRITERS = {"FastaWriter": FastaIO.FastaWriter, "FastaTwoLineWriter": FastaIO.FastaTwoLineWriter, "QualPhredWriter": Q.QualPhredWriter,
           "FastqPhredWriter": Q.FastqPhredWriter, "FastqSolexaWriter": Q.FastqSolexaWriter, "FastqIlluminaWriter": Q.FastqIlluminaWriter}

def run(case):
    kind = case["kind"]
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            if kind == "parse":
                recs = []
                out["parsed"] = recs
                for r in SeqIO.parse(src(case), case["format"]): recs.append(enc(r))
            elif kind == "read":
                out["result"] = enc(SeqIO.read(src(case), case["format"]))
            elif kind in ("write", "writer"):
                h = io.StringIO()
                recs = [dec(r) for r in case["records"]]
                try:
                    if kind == "write":
                        bad = case.get("bad_handle")
                        target = recs[0] if bad == "handle_record" else [] if bad == "handle_list" else h
                        seqs = recs[0] if case.get("single") else recs
                        out["count"] = SeqIO.write(seqs, target, case["format"])
                    else:
                        out["count"] = WRITERS[case["cls"]](h, *case.get("args", [])).write_file(recs)
                finally:
                    out["text_out"] = h.getvalue()
            elif kind == "format":
                out["result"] = dec(case["record"]).format(case["format"])
            elif kind == "to_dict":
                d = SeqIO.to_dict(dec(r) for r in case["records"])
                out["keys"] = list(d)
            elif kind == "convert":
                h = io.StringIO()
                try:
                    out["count"] = SeqIO.convert(src(case), case["format"], h, case["out"], case.get("molecule_type"))
                finally:
                    out["text_out"] = h.getvalue()
            elif kind == "fastq_general":
                items = []
                out["pairs"] = items
                for triple in Q.FastqGeneralIterator(src(case)): items.append(list(triple))
            elif kind == "paired":
                recs = []
                out["parsed"] = recs
                for r in Q.PairedFastaQualIterator(io.StringIO(case["fasta"]), io.StringIO(case["qual"])): recs.append(enc(r))
            elif kind == "func":
                out["result"] = getattr(Q, case["fn"])(*case["args"])
            elif kind == "simple_parser":
                fn = {"simple": FastaIO.SimpleFastaParser, "two_line": FastaIO.FastaTwoLineParser}[case["parser"]]
                items = []
                out["pairs"] = items
                for pair in fn(io.StringIO(case["text"])): items.append(list(pair))
        except Exception as e:
            out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [str(x.message) for x in w]
    return out

cases, seen = [], set()
def add(c):
    k = json.dumps(c, sort_keys=True)
    if k in seen: return
    seen.add(k); c.update(run(c)); cases.append(c)

# ------------------------------------------------------------------------------- inputs
FASTA_TEXTS = ["", "\n", ">", ">\n", ">a", ">a\n", ">a\nACGT", ">a\nACGT\n", ">a desc here\nAC GT\nTTT\n>b\n\n>c\nGG", "no header\n>a\nAC\n", ";comment\n>a\nAC\n",
    "#c\n>a\nAC\n", "!c\n>a\nAC\n", "; x\n>a\nAC\n;mid\nGG\n>b\n;c\nTT\n", ">a\r\nAC\r\nGT\r\n", ">a\tx\nA\tC\n", ">  \nACGT\n", ">a\n\n\nACGT\n\n>b\nTT\n\n",
    "\n\n>a\nAC", ">a\n>b\n>c\n", ">>a\nAC\n", "> a\nAC\n", ">a b\nAC\n  \nGT\n", ">é\nACé\n", ">a\n#c\nAC\n!d\nGG\n", ">a\n;c\nAC\n>b\nGG\n", "ACGT\n",
    ">a\nAC\n>b\nGG\n>c\nTT\n>d\nCC\n", ">a\n AC\n", ">x\nA C\tG\r\n", ">a\nACGT\n\n", "\n>a\nAC\n", " >a\nAC\n", "#only comments\n;more\n", ">a\nAC\n;x\n", ">1\nA\n>2\nC\n>3\nG\n>4\nT\n"]
TWO_LINE_TEXTS = ["", ">a\nAC\n", ">a\nAC\n>b\nGG\n", ">a\nAC\nGT\n", ">a\n>b\n", ">a\n", "AC\n", ">a\nAC", ">a\nAC\n>b", ">a b c\n  AC GT  \n", ">\n\n", ">a\n\n", "\n", ">a\nAC\n\n", ">a\r\nAC\r\n", ">é\nA\n", ">a\nAC\nGT\n>b\nTT\n"]

def random_text(rnd):
    parts = []
    for _ in range(rnd.randint(0, 8)):
        kind = rnd.choice(["head", "head", "seq", "seq", "blank", "comment", "ws"])
        if kind == "head": parts.append(">" + rnd.choice(["a", "b c", "", " ", "id|1 desc", "é"]) + rnd.choice(["\n", "\r\n", ""]))
        elif kind == "seq": parts.append("".join(rnd.choice("ACGTN -") for _ in range(rnd.randint(0, 12))) + rnd.choice(["\n", "\n", "\r\n", ""]))
        elif kind == "blank": parts.append(rnd.choice(["\n", "  \n", "\t\n"]))
        elif kind == "comment": parts.append(rnd.choice([";", "#", "!"]) + "note\n")
        else: parts.append(rnd.choice([" ", "\t"]) + "\n")
    return "".join(parts)

FASTA_FORMATS = ["fasta", "fasta-2line", "fasta-blast", "fasta-pearson"]
def family_cases():
    for f in FASTA_FORMATS:
        for t in FASTA_TEXTS + TWO_LINE_TEXTS:
            add({"kind": "parse", "format": f, "text": t}); add({"kind": "read", "format": f, "text": t})
        for _ in range(500): add({"kind": "parse", "format": f, "text": random_text(rnd)})
        add({"kind": "parse", "format": f, "bytes": ">a\nAC\n"}); add({"kind": "read", "format": f, "bytes": ">a\nAC\n"})
    for t in FASTA_TEXTS + TWO_LINE_TEXTS + [random_text(rnd) for _ in range(200)]:
        add({"kind": "simple_parser", "parser": "simple", "text": t}); add({"kind": "simple_parser", "parser": "two_line", "text": t})

    GENE = FEAT(LOC(0, 4, 1), "gene")
    recs = {
     "plain": REC(S("ACGT"), "a", "n", "a plain record"), "idprefix": REC(S("ACGT"), "a", "n", "a longer description"), "nodesc": REC(S("ACGT"), "a", "n", ""),
     "noid": REC(S("ACGT"), "", "n", "d"), "none_id": REC(S("ACGT"), None, "n", "d"), "long": REC(S("ACGT" * 50), "long", "n", "long one"), "empty": REC(S(""), "e", "n", "empty seq"),
     "newline_id": REC(S("ACGT"), "a\nb", "n", "d\r\ne"), "ws_desc": REC(S("ACGT"), "a", "n", "   "), "mutable": REC(M("ACGT"), "m", "n", "mutable"), "undef": REC(U(4), "u", "n", "undefined"),
     "noseq": REC(None, "x", "n", "d"), "default": REC(S("ACGT")), "unicode": REC(S("ACGT"), "é", "n", "café"), "feat": REC(S("ACGTACGT"), "f", "n", "d", [], [GENE]),
     "exact60": REC(S("A" * 60), "s", "n", "d"), "len61": REC(S("A" * 61), "s", "n", "d"), "len120": REC(S("A" * 120), "s", "n", "d"), "idws": REC(S("AC"), "a b", "n", "a b more"),
    }
    names = list(recs)
    for f in FASTA_FORMATS + ["bogus", "genbank-nope"]:
        for nm in names: add({"kind": "write", "format": f, "records": [recs[nm]]})
        add({"kind": "write", "format": f, "records": [recs[n] for n in ("plain", "long", "empty")]})
        add({"kind": "write", "format": f, "records": []})
        add({"kind": "write", "format": f, "records": [recs["plain"]], "single": True})
        add({"kind": "write", "format": f, "records": [recs["plain"]], "bad_handle": "handle_record"})
        add({"kind": "write", "format": f, "records": [recs["plain"]], "bad_handle": "handle_list"})
    for f in ("", "FASTA", "Fasta", "fasta ", 5, None):
        add({"kind": "write", "format": f, "records": [recs["plain"]]}); add({"kind": "parse", "format": f, "text": ">a\nAC\n"})
    for cls, argsets in (("FastaWriter", [[], [None], [0], [1], [5], [60], [100], [-1], [3.5]]), ("FastaTwoLineWriter", [[]])):
        for args in argsets:
            for nm in ("plain", "long", "len61", "empty", "noseq"):
                add({"kind": "writer", "cls": cls, "args": args, "records": [recs[nm]]})
    for f in ("fasta", "fasta-2line", "fasta-blast", "fasta-pearson", "bogus", "", "FASTA"):
        for nm in names: add({"kind": "format", "format": f, "record": recs[nm]})
    add({"kind": "to_dict", "records": [recs["plain"], recs["idprefix"]]}); add({"kind": "to_dict", "records": [recs["plain"], recs["plain"]]}); add({"kind": "to_dict", "records": []})
    for f in FASTA_FORMATS:
        for out in ("fasta", "fasta-2line", "fasta-blast", "bogus"):
            for t in (">a b\nACGT\nAC\n>c\nGG\n", ""):
                for mt in (None, "DNA", "protein", "RNA", "other", ""): add({"kind": "convert", "format": f, "text": t, "out": out, "molecule_type": mt})

def fastq_cases():
    sanger_q = "".join(chr(c) for c in range(33, 127))
    FQ = ["", "\n", "@", "@\n", "@a\nACGT\n+\nIIII\n", "@a\nACGT\n+a\nIIII\n", "@a\nACGT\n+b\nIIII\n", "@a desc\nACGT\n+\nIIII\n@b\nGG\n+\nII\n",
          "@a\nAC\nGT\n+\nII\nII\n", "@a\nACGT\n+\nIIII", "@a\nACGT\n+\nIII\n", "@a\nACGT\n+\nIIIII\n", "@a\nACGT\n", "@a\nACGT", "@a\n", "ACGT\n",
          "@a\nAC GT\n+\nIIII\n", "@a\nAC\tGT\n+\nIIII\n", "@a\n\n+\n\n", "@a\n\n+\n", "@\nACGT\n+\nIIII\n", "@a\r\nACGT\r\n+\r\nIIII\r\n",
          "@a\nACGT\n+\nI@II\n@b\nA\n+\nI\n", "@a\nACGT\n+\n@III\n", "@a\nACGT\n+\n@@@@\n@b\nA\n+\nI\n", "@a\nACGT\n+\nII\u00e9I\n",
          "@a\nACGT\n+\nII\x7fI\n", "@a\nACGT\n+\nII I\n", "@a\n\u00e9CGT\n+\nIIII\n", "@\u00e9\nACGT\n+\nIIII\n", "\n@a\nA\n+\nI\n", "@a\nA\n+\nI\n\n@b\nC\n+\nI\n",
          "@a\nACGT\n+\n!!!!\n", "@a\nACGT\n+\n~~~~\n", "@a\nACGT\n+\n;;;;\n", "@a\nACGT\n+\n@@@@\n", "@a\nACGT\n+\n]]]]\n", "@a\nACGT\n+\n>>>>\n", "@a\nACGT\n+\n    \n",
          "@a\nAC\n+\n" + sanger_q[:2] + "\n", "@a\n" + "A" * 94 + "\n+\n" + sanger_q + "\n", "@a\n" + "A" * 69 + "\n+\n" + "".join(chr(c) for c in range(58, 127)) + "\n",
          "@a\n" + "A" * 63 + "\n+\n" + "".join(chr(c) for c in range(64, 127)) + "\n", "@a\nA\n+\n\x00\n", "@a\nA\n+\n\n", "@a b c\nA\n+\nI\n", "@@a\nA\n+\nI\n", "@a\nA\n++\nI\n"]
    def rand_fastq(rnd):
        out = []
        for _ in range(rnd.randint(0, 4)):
            n = rnd.randint(0, 8)
            seq = "".join(rnd.choice("ACGTN") for _ in range(n))
            qual = "".join(rnd.choice(sanger_q if rnd.random() < .6 else sanger_q[26:]) for _ in range(n + rnd.choice([0, 0, 0, 1, -1])))
            title = rnd.choice(["a", "b c", "", "id|1 x"])
            plus = rnd.choice(["", "", title, "other"])
            eol = rnd.choice(["\n", "\n", "\n", "\r\n"])
            parts = [seq] if rnd.random() < .8 or len(seq) < 2 else [seq[:len(seq)//2], seq[len(seq)//2:]]
            qparts = [qual] if rnd.random() < .8 or len(qual) < 2 else [qual[:len(qual)//2], qual[len(qual)//2:]]
            out.append("@" + title + eol + eol.join(parts) + eol + "+" + plus + eol + eol.join(qparts) + eol)
        t = "".join(out)
        return t if rnd.random() < .85 else t.rstrip("\n")
    for f in ("fastq", "fastq-sanger", "fastq-solexa", "fastq-illumina"):
        for t in FQ:
            add({"kind": "parse", "format": f, "text": t}); add({"kind": "read", "format": f, "text": t})
        for _ in range(600): add({"kind": "parse", "format": f, "text": rand_fastq(rnd)})
        add({"kind": "parse", "format": f, "bytes": "@a\nA\n+\nI\n"})
    for t in FQ + [rand_fastq(rnd) for _ in range(300)]:
        add({"kind": "fastq_general", "text": t})
    add({"kind": "fastq_general", "bytes": "@a\nA\n+\nI\n"})

    QUAL = ["", ">a\n40 30 20\n", ">a\n40 30\n20\n>b\n1 2\n", ">a\n", ">a", ">a\n\n>b\n5\n", "no header\n>a\n1\n", ">a b\n-1 5 -3\n", ">a\n1 x 3\n", ">a\n 1  2 \n", ">\n1 2\n",
            ">a\n1_0 2\n", ">a\n+5 -0\n", ">a\n1.5\n", ">a\r\n1 2\r\n", ">a\n\n\n", ">a\n1\n>b\n>c\n3\n", ">a\n007\n", ">a\n40\t30\n"]
    for t in QUAL:
        add({"kind": "parse", "format": "qual", "text": t}); add({"kind": "read", "format": "qual", "text": t})
    for _ in range(300):
        add({"kind": "parse", "format": "qual", "text": "".join(rnd.choice([">a\n", ">b c\n", "1 2 3\n", "40\n", "-2 7\n", "\n", "12 13 14 15 16 17 18 19 20\n"]) for _ in range(rnd.randint(0, 6)))})
    add({"kind": "parse", "format": "qual", "bytes": ">a\n1\n"})
    for fa, qu in [(">a\nACG\n>b\nTT\n", ">a\n1 2 3\n>b\n4 5\n"), (">a\nACG\n", ">a\n1 2 3\n>b\n4 5\n"), (">a\nACG\n>b\nT\n", ">a\n1 2 3\n"), (">a\nACG\n", ">b\n1 2 3\n"),
                   (">a\nACG\n", ">a\n1 2\n"), ("", ""), (">a\nA\n", ""), ("", ">a\n1\n"), (">a\nAC\n", ">a\n-1 5\n"), ("junk\n>a\nA\n", ">a\n1\n"), (">a\nA\n", "junk\n>a\n1\n")]:
        add({"kind": "paired", "fasta": fa, "qual": qu})

    def Q_(vals, key="phred_quality", seq="ACGT", id="r1", desc="rec one"):
        return REC(S(seq), id, "n", desc, [], [], [], [(key, LST(*vals))])
    recs = {
     "ints": Q_([40, 40, 38, 12]), "floats": Q_([40.4, 40.5, 38.5, 12.49]), "half": Q_([0.5, 1.5, 2.5, 3.5]), "big": Q_([100, 93, 94, 62]), "bigger": Q_([62, 63, 70, 0]), "neg": Q_([-1, 0, 5, 10]),
     "veryneg": Q_([-40, -34, 0, 1]), "with_none": Q_([40, None, 38, 12]), "all_none": Q_([None] * 4), "mismatch_len": Q_([1, 2, 3]), "empty": Q_([], seq=""),
     "solexa": Q_([-5, -3, 0, 40], "solexa_quality"), "solexa_low": Q_([-10, -6, 0, 62], "solexa_quality"), "solexa_float": Q_([-4.5, 0.5, 10.4, 62.5], "solexa_quality"), "solexa_big": Q_([70, 100, 62, 63], "solexa_quality"),
     "both": REC(S("ACGT"), "b", "n", "d", [], [], [], [("phred_quality", LST(10, 20, 30, 40)), ("solexa_quality", LST(1, 2, 3, 4))]),
     "noqual": REC(S("ACGT"), "x", "n", "d"), "noseq": REC(None, "x", "n", "d", [], [], [], []), "newline": Q_([1, 2, 3, 4], id="a\nb", desc="d\r\ne"), "noid": Q_([1, 2, 3, 4], id=""), "nodesc": Q_([1, 2, 3, 4], desc=""),
     "idprefix": Q_([1, 2, 3, 4], id="r1", desc="r1 more"), "none_id": REC(S("ACGT"), None, "n", "d", [], [], [], [("phred_quality", LST(1, 2, 3, 4))]), "long": Q_(list(range(0, 94)), seq="A" * 94),
     "long_solexa": Q_(list(range(-5, 63)), "solexa_quality", seq="A" * 68), "long_floaty": Q_([i + 0.5 for i in range(40)], seq="A" * 40), "wide": Q_([1000, 2000, 3000, 4000]),
     "undef": REC(U(4), "u", "n", "d", [], [], [], [("phred_quality", LST(1, 2, 3, 4))]), "qual_str": REC(S("ACGT"), "s", "n", "d", [], [], [], [("phred_quality", "abcd")]),
    }
    for f in ("fastq", "fastq-sanger", "fastq-solexa", "fastq-illumina", "qual"):
        for nm in recs: add({"kind": "write", "format": f, "records": [recs[nm]]}); add({"kind": "format", "format": f, "record": recs[nm]})
        add({"kind": "write", "format": f, "records": [recs["ints"], recs["long"], recs["empty"]]})
    for cls, argsets in (("QualPhredWriter", [[], [None], [0], [1], [5], [6], [20], [60], [100], [-1]]), ("FastqPhredWriter", [[]]), ("FastqSolexaWriter", [[]]), ("FastqIlluminaWriter", [[]])):
        for args in argsets:
            for nm in ("ints", "long", "long_solexa", "wide", "floats", "noqual", "empty"):
                add({"kind": "writer", "cls": cls, "args": args, "records": [recs[nm]]})
    # conversions through every direct path and the generic path
    IN = ("fastq", "fastq-sanger", "fastq-solexa", "fastq-illumina")
    OUT = ("fasta", "tab", "fastq", "fastq-sanger", "fastq-solexa", "fastq-illumina", "qual", "fasta-2line")
    CONV = ["@a desc\nACGT\n+\nIIII\n@b\nGGTT\n+b\n5?@I\n", "@a\nACGT\n+\n!!!!\n", "@a\nACGT\n+\n~~~~\n", "@a\n" + "A" * 94 + "\n+\n" + sanger_q + "\n", "@a\n" + "A" * 69 + "\n+\n" + "".join(chr(c) for c in range(59, 128)[:68]) + "\n",
            "@a\n" + "A" * 63 + "\n+\n" + "".join(chr(c) for c in range(64, 127)) + "\n", "@a\nACGT\n+\nII\u00e9I\n", "@a\nACGT\n+\nI I I\n", "@a\nACGT\n+\n\u20acIII\n", "", "@\nA\n+\nI\n", "@a\nA\n+\nI",
            "@a\n" + "A" * 40 + "\n+\n" + "I" * 40 + "\n", "@a\n" + "A" * 30 + "\n+\n" + "".join(chr(33 + i) for i in range(30)) + "\n", "@a\n" + "A" * 33 + "\n+\n" + "".join(chr(33 + 10 + (i % 80)) for i in range(33)) + "\n"]
    for i in IN:
        for o in OUT:
            for t in CONV: add({"kind": "convert", "format": i, "text": t, "out": o, "molecule_type": None})
    add({"kind": "convert", "format": "fastq", "text": CONV[0], "out": "fasta", "molecule_type": "DNA"})
    add({"kind": "convert", "format": "fastq", "text": CONV[0], "out": "fastq-solexa", "molecule_type": "bogus"})
    add({"kind": "convert", "format": "qual", "text": ">a\n40 30 20\n", "out": "qual", "molecule_type": None})
    # score functions
    for x in (None, 0, 0.5, 1, 2, 5, 10, 20, 30, 40, 50, 62, 93, 100, 1000, -1, -0.5, 1e-9, 2.5, 7.25): add({"kind": "func", "fn": "solexa_quality_from_phred", "args": [x]})
    for x in (None, -10, -6, -5, -4.5, -3, -1, 0, 1, 5, 10, 20, 30, 40, 62, 100, 0.5, 2.5, 7.25): add({"kind": "func", "fn": "phred_quality_from_solexa", "args": [x]})

{"fasta": family_cases, "fastq": fastq_cases}[FAMILY]()
json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(f"{len(cases)} cases, {sum('exc' in c for c in cases)} raise -> {os.path.relpath(OUT)} ({os.path.getsize(OUT)/1e6:.1f} MB)")
