"""Golden cases for Bio.SeqIO (text formats).

Output: packages/seqio/test/golden/seqio-<family>.json   (family given on the command line; default: fasta)
Case kinds: parse, read, write, writer, format, to_dict, convert, simple_parser.
A parse case records the records yielded before any error, then the error.
"""
import io, json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import Bio
from Bio import SeqIO
from Bio.SeqIO import FastaIO, QualityIO as Q, PirIO, SeqXmlIO, SffIO
from Bio.SeqRecord import SeqRecord
from Bio.Seq import Seq
from Bio.SeqFeature import SeqFeature, SimpleLocation, CompoundLocation, Reference, ExactPosition, BeforePosition, AfterPosition, WithinPosition
from codec import S, M, U, LST, P as SPART
from codec_feature import enc, dec, REC, FEAT, X, CL, SL as LOC_, pos

FAMILY = sys.argv[1] if len(sys.argv) > 1 else "fasta"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "seqio", "test", "golden", f"seqio-{FAMILY}.json")
rnd = random.Random(2024)

def tname(e): return "TypeError" if type(e).__name__ == "AttributeError" else ("ValueError" if isinstance(e, UnicodeError) else type(e).__name__)
def emsg(e):
    if type(e).__name__ == "AttributeError" or isinstance(e, UnicodeError): return None
    return str(e.args[0]) if isinstance(e, KeyError) and e.args else str(e)

import tempfile, resource
try: resource.setrlimit(resource.RLIMIT_AS, (6 * 2**30, 6 * 2**30))     # corrupt twoBit counts must fail fast, not allocate
except (ValueError, OSError): pass

OPENED = []
def src(case):
    if "bytes" in case and case.get("format") == "twobit":      # numpy reads this format from a real file
        f = tempfile.NamedTemporaryFile(suffix=".2bit", delete=False); f.write(case["bytes"].encode("latin-1")); f.close()
        h = open(f.name, "rb"); OPENED.append(h)
        return h
    return io.BytesIO(case["bytes"].encode("latin-1")) if "bytes" in case else io.StringIO(case["text"])

def out_text(h, case):
    v = h.getvalue()
    if not case.get("binary"): return v
    return v.decode("latin-1") if case["binary"] == "bytes" else v.decode("utf-8")

WRITERS = {"SffWriter": SffIO.SffWriter, "SeqXmlWriter": SeqXmlIO.SeqXmlWriter, "FastaWriter": FastaIO.FastaWriter, "FastaTwoLineWriter": FastaIO.FastaTwoLineWriter, "QualPhredWriter": Q.QualPhredWriter,
           "PirWriter": PirIO.PirWriter, "FastqPhredWriter": Q.FastqPhredWriter, "FastqSolexaWriter": Q.FastqSolexaWriter, "FastqIlluminaWriter": Q.FastqIlluminaWriter}

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
                h = io.BytesIO() if case.get("binary") else io.StringIO()
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
                    out["text_out"] = out_text(h, case)
            elif kind == "twobit_ops":
                res = []
                out["ops_out"] = res
                for r in SeqIO.parse(src(case), "twobit"):
                    for op in case["ops"]:
                        try:
                            sq = r.seq
                            if op[0] == "get": res.append(enc(sq[op[1]]))
                            else:
                                sq = {"slice": sq, "upper": sq.upper(), "lower": sq.lower()}[op[0]]
                                res.append(enc(sq[slice(*op[1:])]))
                        except Exception as e:
                            res.append({"exc": {"type": tname(e), "msg": emsg(e)}})
            elif kind == "format":
                out["result"] = dec(case["record"]).format(case["format"])
            elif kind == "to_dict":
                d = SeqIO.to_dict(dec(r) for r in case["records"])
                out["keys"] = list(d)
            elif kind == "convert":
                h = io.BytesIO() if case.get("binary") else io.StringIO()
                try:
                    out["count"] = SeqIO.convert(src(case), case["format"], h, case["out"], case.get("molecule_type"))
                finally:
                    out["text_out"] = out_text(h, case)
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
            out["exc"] = {"type": tname(e), "msg": None if tname(e) in ("SAXParseException", "ExpatError") else emsg(e)}   # expat's wording is not reproduced
        finally:
            for h in OPENED: h.close()
            OPENED.clear()
    out["warnings"] = [str(x.message) for x in w]
    return out

cases, seen = [], set()
import signal
class CaseTimeout(BaseException): pass
def _alarm(signum, frame): raise CaseTimeout()
signal.signal(signal.SIGALRM, _alarm)

def add(c):
    """Record a case; one that runs for more than 2 seconds (a corrupt count that makes Biopython loop for ages) is dropped."""
    k = json.dumps(c, sort_keys=True)
    if k in seen: return
    seen.add(k)
    signal.setitimer(signal.ITIMER_REAL, 2.0)
    try: c.update(run(c))
    except CaseTimeout: return
    finally: signal.setitimer(signal.ITIMER_REAL, 0)
    cases.append(c)

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

GENBANK_HAND = [
"""LOCUS       SCU49845     120 bp    DNA             PLN       21-JUN-1999
DEFINITION  Saccharomyces cerevisiae TCP1-beta gene, partial cds; and Axl2p
            (AXL2) and Rev7p (REV7) genes, complete cds.
ACCESSION   U49845
VERSION     U49845.1  GI:1293613
KEYWORDS    .
SOURCE      Saccharomyces cerevisiae (baker's yeast)
  ORGANISM  Saccharomyces cerevisiae
            Eukaryota; Fungi; Ascomycota; Saccharomycotina; Saccharomycetes;
            Saccharomycetales; Saccharomycetaceae; Saccharomyces.
REFERENCE   1  (bases 1 to 120)
  AUTHORS   Torpey,L.E., Gibbs,P.E., Nelson,J. and Lawrence,C.W.
  TITLE     Cloning and sequence of REV7, a gene whose function is required for
            DNA damage-induced mutagenesis in Saccharomyces cerevisiae
  JOURNAL   Yeast 10 (11), 1503-1509 (1994)
  PUBMED    7871890
REFERENCE   2  (bases 1 to 120)
  AUTHORS   Roemer,T., Madden,K., Chang,J. and Snyder,M.
  TITLE     Selection of axial growth sites in yeast requires Axl2p
  JOURNAL   Genes Dev. 10 (7), 777-793 (1996)
   PUBMED   8846915
COMMENT     Method: conceptual translation supplied by author.
FEATURES             Location/Qualifiers
     source          1..120
                     /organism="Saccharomyces cerevisiae"
                     /db_xref="taxon:4932"
                     /chromosome="IX"
     CDS             <1..>40
                     /note="N-terminal"
                     /codon_start=3
                     /product="TCP1-beta"
                     /protein_id="AAA98665.1"
                     /db_xref="GI:1293614"
                     /translation="SSIYNGISTSGLDLNNGTIADMRQLGIVESYKLKRAVVSSASEA
                     AEVLLRVDNIIRARPRTANRQHM"
     gene            join(50..60,80..100)
                     /gene="AXL2"
                     /pseudo
     misc_feature    complement(20..30)
                     /note="a ""quoted"" word"
ORIGIN
        1 gatcctccat atacaacggt atctccacct caggtttaga tctcaacaac ggaaccattg
       61 ccgacatgag acagttaggt atcgtcgaga gttacaagct aaaacgagca gtagtcagct
//
""",
"""LOCUS       NC_TEST1              60 bp    DNA     circular BCT 01-JAN-2000
DEFINITION  Test circular record.
ACCESSION   NC_TEST1
VERSION     NC_TEST1.2
DBLINK      BioProject: PRJNA1
            BioSample: SAMN1
KEYWORDS    test; example.
SOURCE      Escherichia coli
  ORGANISM  Escherichia coli
            Bacteria; Proteobacteria; Gammaproteobacteria; Enterobacterales;
            Enterobacteriaceae; Escherichia.
COMMENT     ##Assembly-Data-START##
            Assembly Method       :: SPAdes v. 3.1
            Sequencing Technology :: Illumina
            ##Assembly-Data-END##
FEATURES             Location/Qualifiers
     source          1..60
                     /mol_type="genomic DNA"
     CDS             join(55..60,1..10)
                     /gene="wrap"
ORIGIN
        1 acgtacgtac gtacgtacgt acgtacgtac gtacgtacgt acgtacgtac gtacgtacgt
//
""",
"""LOCUS       AAA12345                 20 aa            linear   BCT 01-JAN-2000
DEFINITION  hypothetical protein.
ACCESSION   AAA12345
VERSION     AAA12345.1
FEATURES             Location/Qualifiers
     Protein         1..20
                     /product="hypothetical protein"
ORIGIN
        1 mkvlaagivg lgaaaqedtp
//
""",
"""LOCUS       CONTIG1               5000 bp    DNA     linear   CON 01-JAN-2000
DEFINITION  A contig record.
ACCESSION   CONTIG1
VERSION     CONTIG1.1
FEATURES             Location/Qualifiers
     source          1..5000
CONTIG      join(AA000001.1:1..2500,gap(100),AA000002.1:1..2400)
//
""",
"LOCUS       MINIMAL\nDEFINITION  minimal.\nACCESSION   MINIMAL\nORIGIN\n        1 acgt\n//\n",
"LOCUS       OLDFMT       12 bp    DNA             PLN       21-JUN-1999\nDEFINITION  old.\nACCESSION   OLDFMT\nORIGIN\n        1 acgtacgtac gt\n//\n",
"LOCUS       WGSREC             10 bp    DNA     linear   BCT 01-JAN-2000\nDEFINITION  wgs.\nACCESSION   WGSREC\nVERSION     WGSREC.1\nWGS         AAAA01000001-AAAA01000100\nWGS_SCAFLD  CM000001-CM000002\nORIGIN\n        1 acgtacgtac\n//\n",
    ]

def make_record(rnd, i):
    L = rnd.randint(20, 110)
    seq = "".join(rnd.choice("ACGT") for _ in range(L))
    r = SeqRecord(Seq(seq), id=f"ACC{i:05d}.{rnd.randint(1, 3)}", name=f"LOC{i}", description=rnd.choice(["A test sequence.", "Long description " * 6, "x", "Gene for something, complete cds"]))
    a = r.annotations
    a["molecule_type"] = rnd.choice(["DNA", "mRNA", "genomic DNA", "RNA"])
    if rnd.random() < .7: a["topology"] = rnd.choice(["linear", "circular"])
    a["data_file_division"] = rnd.choice(["BCT", "PLN", "UNK", "PRI"])
    a["date"] = rnd.choice(["01-JAN-2000", "15-MAR-1999", "31-DEC-2020"])
    a["accessions"] = [f"ACC{i:05d}"] + ([f"EXTRA{i}"] if rnd.random() < .3 else [])
    a["sequence_version"] = int(r.id.split(".")[1])
    if rnd.random() < .7: a["organism"] = rnd.choice(["Homo sapiens", "Escherichia coli K-12", "Mus musculus"])
    if rnd.random() < .6: a["taxonomy"] = rnd.choice([["Eukaryota", "Metazoa", "Chordata"], ["Bacteria", "Proteobacteria"], ["Viruses"]])
    if rnd.random() < .5: a["keywords"] = rnd.choice([["alpha", "beta"], ["only"]])
    if rnd.random() < .5: a["source"] = rnd.choice(["human", "bacterium", "mouse"])
    if rnd.random() < .5: a["comment"] = rnd.choice(["One line comment.", "Line one.\nLine two.", "A very long comment " * 8])
    if rnd.random() < .4:
        ref = Reference(); ref.authors = "Smith,J. and Jones,K."; ref.title = rnd.choice(["A title", "Direct Submission"]); ref.journal = "J. Test 1 (2), 3-4 (2000)"; ref.pubmed_id = rnd.choice(["", "12345"])
        ref.location = [SimpleLocation(0, L)]
        a["references"] = [ref]
    if rnd.random() < .3: r.dbxrefs = ["BioProject:PRJ1", "BioSample:SAMN2"]
    feats = [SeqFeature(SimpleLocation(0, L, 1), "source", qualifiers={"organism": ["Test org"], "mol_type": ["genomic DNA"]})]
    for _ in range(rnd.randint(0, 4)):
        s0 = rnd.randint(0, L - 10); e0 = rnd.randint(s0 + 3, min(L, s0 + 60))
        kind = rnd.choice(["simple", "minus", "join", "fuzzy", "single", "order"])
        if kind == "simple": loc = SimpleLocation(s0, e0, 1)
        elif kind == "minus": loc = SimpleLocation(s0, e0, -1)
        elif kind == "join" and e0 - s0 > 7: loc = CompoundLocation([SimpleLocation(s0, s0 + 3, 1), SimpleLocation(s0 + 5, e0, 1)])
        elif kind == "order" and e0 - s0 > 7: loc = CompoundLocation([SimpleLocation(s0, s0 + 3, -1), SimpleLocation(s0 + 5, e0, -1)], "order")
        elif kind == "fuzzy": loc = SimpleLocation(BeforePosition(s0), AfterPosition(e0), 1)
        else: loc = SimpleLocation(s0, s0 + 1, 1)
        q = {}
        if rnd.random() < .8: q["gene"] = [rnd.choice(["abc", "xyz1", "geneA"])]
        if rnd.random() < .5: q["note"] = [rnd.choice(["short", "a longer note that must be wrapped across several lines in the output file " * 2, 'with "quotes"'])]
        if rnd.random() < .3: q["pseudo"] = [None] if False else [""]
        if rnd.random() < .3: q["db_xref"] = ["GeneID:1", "UniProtKB:P1"]
        if rnd.random() < .3: q["codon_start"] = ["1"]
        if rnd.random() < .3: q["translation"] = ["MKV" * rnd.randint(1, 30)]
        feats.append(SeqFeature(loc, rnd.choice(["gene", "CDS", "misc_feature", "mRNA", "exon"]), qualifiers=q))
    r.features = feats
    return r

def insdc_cases(fmt, HAND, cds_fmt, alias, extra=()):
    def rec_text(rnd, i):
        r = make_record(rnd, i)
        buf = io.StringIO()
        try:
            SeqIO.write(r, buf, fmt)
            return buf.getvalue()
        except Exception:
            return None
    texts = list(HAND) + list(extra)
    for i in range(70):
        t = rec_text(rnd, i)
        if t: texts.append(t)
    texts.append(texts[0] + texts[1] + texts[2])           # several records
    base = list(texts)
    def mutate(t, rnd):
        lines = t.split("\n")
        k = rnd.choice(["delete", "dup", "trunc", "garble", "swap", "blank", "indent", "noend", "chars", "locus", "insert"])
        if not lines: return t
        i = rnd.randrange(len(lines))
        if k == "delete": del lines[i]
        elif k == "dup": lines.insert(i, lines[i])
        elif k == "trunc": return t[:rnd.randrange(len(t) + 1)]
        elif k == "garble": lines[i] = "".join(rnd.choice("ABC /=\"()<>.,0123456789 ") for _ in range(rnd.randint(0, 40)))
        elif k == "swap" and len(lines) > 1: j = rnd.randrange(len(lines)); lines[i], lines[j] = lines[j], lines[i]
        elif k == "blank": lines[i] = ""
        elif k == "indent": lines[i] = " " + lines[i] if rnd.random() < .5 else lines[i][1:]
        elif k == "noend": return t.replace("//", "")
        elif k == "chars":
            l = list(lines[i]); 
            if l: l[rnd.randrange(len(l))] = rnd.choice("x /\"-_0"); lines[i] = "".join(l)
        elif k == "locus": lines[0] = lines[0][:rnd.randint(0, len(lines[0]))] + rnd.choice(["", " ", "  bp", "x"] ) + lines[0][rnd.randint(0, len(lines[0])):]
        elif k == "insert": lines.insert(i, rnd.choice(["XX", "     /orphan=1", "// ", "ORIGIN", "FEATURES", "REFERENCE   9", "  AUTHORS   nobody"]))
        return "\n".join(lines)
    allt = list(base)
    for t in base:
        for _ in range(6): allt.append(mutate(t, rnd))
    for t in allt[:]:
        if rnd.random() < .15: allt.append(mutate(mutate(t, rnd), rnd))
    for t in allt:
        add({"kind": "parse", "format": fmt, "text": t})
    for t in rnd.sample(allt, 90):
        add({"kind": "read", "format": fmt, "text": t}); add({"kind": "parse", "format": alias, "text": t})
    for t in rnd.sample(allt, 120): add({"kind": "parse", "format": cds_fmt, "text": t})
    for t in ["", "\n", "LOCUS", "LOCUS       ", "ID   ", "ID   X;", "random\ntext\n", "//\n//\n"]:
        add({"kind": "parse", "format": fmt, "text": t}); add({"kind": "parse", "format": cds_fmt, "text": t})
    add({"kind": "parse", "format": fmt, "bytes": "ID   A;\n"})

def insdc_write_cases():
    def R(seq, id="X1.1", name="NAME", desc="a description", dbx=(), feats=(), ann=(), letter=None):
        return REC(seq, id, name, desc, list(dbx), list(feats), [list(a) for a in ann], letter)
    DNA = ("molecule_type", "DNA")
    def feat(loc, typ="gene", quals=()): return FEAT(loc, typ, "<unknown id>", quals)
    LOC = lambda a, b, st=1, ref=None, db=None: LOC_(a, b, st, ref, db)
    def PO(cls, v, *r): return pos(cls, v, *r)
    ref1 = {"$": "ref", "authors": "Smith J., Jones K. " * 4, "consrtm": "A consortium", "title": "A long title " * 5, "journal": "J. Test 1:1-2(2000)", "medline_id": "123", "pubmed_id": "456", "comment": "remark text", "location": [LOC(0, 10)]}
    ref2 = {"$": "ref", "authors": "", "consrtm": "", "title": "", "journal": "", "medline_id": "", "pubmed_id": "", "comment": "", "location": []}
    ref3 = {"$": "ref", "authors": "X", "consrtm": "", "title": "T", "journal": "J", "medline_id": "", "pubmed_id": "", "comment": "", "location": [LOC(0, 3), LOC(5, 8)]}
    S0 = S("ACGTACGTAC" * 13)
    recs = {
     "plain": R(S("ACGTACGTAC"), ann=[DNA]), "nomol": R(S("ACGT")), "protein": R(S("MKVLAAGIVG"), ann=[("molecule_type", "protein")]), "rna": R(S("ACGU"), ann=[("molecule_type", "mRNA")]),
     "weird_mol": R(S("ACGT"), ann=[("molecule_type", "weird thing")]), "longmol": R(S("ACGT"), ann=[("molecule_type", "unassigned DNA")]), "toolong_mol": R(S("ACGT"), ann=[("molecule_type", "x" * 12)]),
     "long": R(S0, ann=[DNA]), "long130": R(S("A" * 130), ann=[DNA]), "len60": R(S("A" * 60), ann=[DNA]), "len61": R(S("C" * 61), ann=[DNA]), "empty": R(S(""), ann=[DNA]),
     "nameunk": R(S("ACGT"), "ID9.2", "<unknown name>", "d", ann=[DNA]), "bothunk": R(S("ACGT"), "<unknown id>", "<unknown name>", "d", ann=[DNA, ("accession", "ACC1")]), "longname": R(S("ACGT"), "ID1.1", "ThisIsAVeryLongLocusNameOver16", "d", ann=[DNA]),
     "longname2": R(S("ACGT"), "ID1.1", "L" * 30, "d", ann=[DNA]), "spacename": R(S("ACGT"), "ID1.1", "has space", "d", ann=[DNA]), "noversion": R(S("ACGT"), "ACC", "N", "d", ann=[DNA]), "badversion": R(S("ACGT"), "ACC.x", "N", "d", ann=[DNA]),
     "accsemi": R(S("ACGT"), "A;B", "N", "d", ann=[DNA]), "accspace": R(S("ACGT"), "A B", "N", "d", ann=[DNA]), "accession_ann": R(S("ACGT"), "ACC.3", "N", "d", ann=[DNA, ("accession", "OTHER")]), "gi": R(S("ACGT"), "ACC.1", "N", "d", ann=[DNA, ("gi", "12345")]),
     "unkdesc": R(S("ACGT"), "A.1", "N", "<unknown description>", ann=[DNA]), "emptydesc": R(S("ACGT"), "A.1", "N", "", ann=[DNA]), "longdesc": R(S("ACGT"), "A.1", "N", "word " * 40, ann=[DNA]), "nlsdesc": R(S("ACGT"), "A.1", "N", "line1\nline2", ann=[DNA]),
     "topo_lin": R(S("ACGT"), ann=[DNA, ("topology", "linear")]), "topo_circ": R(S("ACGT"), ann=[DNA, ("topology", "circular")]), "topo_bad": R(S("ACGT"), ann=[DNA, ("topology", "very-long-topology")]),
     "div_pri": R(S("ACGT"), ann=[DNA, ("data_file_division", "PRI")]), "div_bct": R(S("ACGT"), ann=[DNA, ("data_file_division", "BCT")]), "div_hum": R(S("ACGT"), ann=[DNA, ("data_file_division", "HUM")]), "div_unk": R(S("ACGT"), ann=[DNA, ("data_file_division", "UNK")]),
     "div_bogus": R(S("ACGT"), ann=[DNA, ("data_file_division", "BOGUS")]), "div_long": R(S("ACGT"), ann=[DNA, ("data_file_division", "TOOLONG")]),
     "date_ok": R(S("ACGT"), ann=[DNA, ("date", "15-MAR-1999")]), "date_short": R(S("ACGT"), ann=[DNA, ("date", "15-MAR-99")]), "date_bad_month": R(S("ACGT"), ann=[DNA, ("date", "15-XYZ-1999")]), "date_feb30": R(S("ACGT"), ann=[DNA, ("date", "30-FEB-2000")]),
     "date_leap": R(S("ACGT"), ann=[DNA, ("date", "29-FEB-2000")]), "date_noleap": R(S("ACGT"), ann=[DNA, ("date", "29-FEB-1900")]), "date_list": R(S("ACGT"), ann=[DNA, ("date", {"$": "list", "v": ["01-JAN-2000"]})]),
     "date_list2": R(S("ACGT"), ann=[DNA, ("date", {"$": "list", "v": ["01-JAN-2000", "02-JAN-2000"]})]), "date_int": R(S("ACGT"), ann=[DNA, ("date", 5)]), "date_text": R(S("ACGT"), ann=[DNA, ("date", "xx-xxx-xxxx")]),
     "kw": R(S("ACGT"), ann=[DNA, ("keywords", {"$": "list", "v": ["alpha", "beta", "gamma"]})]), "kw_dot": R(S("ACGT"), ann=[DNA, ("keywords", {"$": "list", "v": ["alpha."]})]), "kw_empty": R(S("ACGT"), ann=[DNA, ("keywords", {"$": "list", "v": []})]),
     "kw_long": R(S("ACGT"), ann=[DNA, ("keywords", {"$": "list", "v": ["keyword number %d" % i for i in range(12)]})]),
     "seg": R(S("ACGT"), ann=[DNA, ("segment", "1 of 2")]), "seg_list": R(S("ACGT"), ann=[DNA, ("segment", {"$": "list", "v": ["1 of 2"]})]), "seg_list2": R(S("ACGT"), ann=[DNA, ("segment", {"$": "list", "v": ["a", "b"]})]),
     "source_org": R(S("ACGT"), ann=[DNA, ("source", "human"), ("organism", "Homo sapiens")]), "org_long": R(S("ACGT"), ann=[DNA, ("organism", "O" * 100)]), "tax": R(S("ACGT"), ann=[DNA, ("taxonomy", {"$": "list", "v": ["Eukaryota", "Metazoa", "Chordata"]})]),
     "tax_dot": R(S("ACGT"), ann=[DNA, ("taxonomy", {"$": "list", "v": ["Eukaryota."]})]), "tax_long": R(S("ACGT"), ann=[DNA, ("taxonomy", {"$": "list", "v": ["Taxon%d" % i for i in range(25)]})]), "dbsrc": R(S("ACGT"), ann=[DNA, ("db_source", "REFSEQ: x")]),
     "dbsrc_list": R(S("ACGT"), ann=[DNA, ("db_source", {"$": "list", "v": ["a", "b"]})]), "dbx": R(S("ACGT"), dbx=["BioProject:PRJ1", "BioSample: SAMN2", "Other:x"], ann=[DNA]), "dbx_proj": R(S("ACGT"), dbx=["Project:PRJ7", "A:b"], ann=[DNA]), "dbx_none": R(S("ACGT"), dbx=["noColon"], ann=[DNA]),
     "refs": R(S("ACGT" * 5), ann=[DNA, ("references", {"$": "list", "v": [ref1, ref2, ref3]})]), "refs_prot": R(S("MKVL"), ann=[("molecule_type", "protein"), ("references", {"$": "list", "v": [ref1]})]), "refs_junk": R(S("ACGT"), ann=[DNA, ("references", {"$": "list", "v": ["not a ref", ref3]})]),
     "comment_str": R(S("ACGT"), ann=[DNA, ("comment", "one line")]), "comment_multi": R(S("ACGT"), ann=[DNA, ("comment", "line one\nline two\n" + "long " * 30)]), "comment_list": R(S("ACGT"), ann=[DNA, ("comment", {"$": "list", "v": ["a", "b c"]})]),
     "comment_empty_list": R(S("ACGT"), ann=[DNA, ("comment", {"$": "list", "v": []})]), "comment_bad": R(S("ACGT"), ann=[DNA, ("comment", 5)]),
     "struct": R(S("ACGT"), ann=[DNA, ("structured_comment", {"$": "dict", "v": [["Assembly-Data", {"$": "dict", "v": [["Method", "SPAdes"], ["Technology Used", "Illumina"]]}], ["Other", {"$": "dict", "v": [["k", "v"]]}]]}), ("comment", "plain too")]),
     "struct_only": R(S("ACGT"), ann=[DNA, ("structured_comment", {"$": "dict", "v": [["A", {"$": "dict", "v": [["x", "y"]]}]]})]), "struct_empty": R(S("ACGT"), ann=[DNA, ("structured_comment", {"$": "dict", "v": []})]),
     "undef": R(U(10), ann=[DNA]), "undef_contig": R(U(10), ann=[DNA, ("contig", "join(A:1..5,gap(5))")]), "undef_contig_list": R(U(10), ann=[DNA, ("contig", {"$": "list", "v": ["join(A:1..5,", "gap(5))"]})]),
     "undef_contig_long": R(U(10), ann=[DNA, ("contig", "join(" + ",".join("ACC%05d.1:1..100" % i for i in range(12)) + ")")]), "undef_contig_nocomma": R(U(10), ann=[DNA, ("contig", "x" * 100)]), "partial": R(SPART(10, [(0, "ACG")]), ann=[DNA]),
     "mutable": R(M("ACGT"), ann=[DNA]), "noseq": R(None, ann=[DNA]),
    }
    feats = {
     "f_simple": [feat(LOC(0, 10))], "f_minus": [feat(LOC(2, 8, -1))], "f_single": [feat(LOC(4, 5))], "f_between": [feat(LOC(4, 4))], "f_between_end": [feat(LOC(10, 10))], "f_unstranded": [feat(LOC(1, 9, None))], "f_zerostrand": [feat(LOC(1, 9, 0))],
     "f_join": [feat(CL([LOC(0, 3), LOC(5, 8)], "join"))], "f_join_minus": [feat(CL([LOC(5, 8, -1), LOC(0, 3, -1)], "join"))],
     "f_order": [feat(CL([LOC(0, 3, -1), LOC(5, 8, -1)], "order"))], "f_mixed": [feat(CL([LOC(0, 3, 1), LOC(5, 8, -1)], "join"))],
     "f_bond": [feat(CL([LOC(0, 1), LOC(5, 6)], "bond"))], "f_fuzzy": [feat(LOC(PO("BeforePosition", 1), PO("AfterPosition", 9)))], "f_within": [feat(LOC(PO("WithinPosition", 2, 2, 4), PO("WithinPosition", 8, 6, 8)))],
     "f_oneof": [feat(LOC(PO("OneOfPosition", 2, [X(2), X(4)]), PO("OneOfPosition", 9, [X(7), X(9)])))], "f_betweenpos": [feat(LOC(PO("BetweenPosition", 3, 3, 4), X(8)))], "f_uncertain": [feat(LOC(PO("UncertainPosition", 3), X(8)))],
     "f_unk_start": [feat(LOC({"$": "pos", "cls": "UnknownPosition"}, X(8)))], "f_unk_end": [feat(LOC(X(2), {"$": "pos", "cls": "UnknownPosition"}))], "f_unk_both": [feat(LOC({"$": "pos", "cls": "UnknownPosition"}, {"$": "pos", "cls": "UnknownPosition"}))],
     "f_ref": [feat(LOC(1, 5, 1, "NC_9.1"))], "f_refdb": [feat(LOC(1, 5, 1, "NC_9.1", "GenBank"))], "f_longjoin": [feat(CL([LOC(i * 10, i * 10 + 5) for i in range(12)], "join"))],
     "f_none_loc": [feat(None)], "f_notype": [FEAT(LOC(0, 3), "", "<unknown id>", [])], "f_spacetype": [feat(LOC(0, 3), "misc feature")], "f_longtype": [feat(LOC(0, 3), "a_very_long_feature_key")], "f_badtype": [feat(LOC(0, 3), "bad$type")],
     "q_basic": [feat(LOC(0, 5), "gene", [("gene", {"$": "list", "v": ["abc"]}), ("note", {"$": "list", "v": ["n1", "n2"]})])], "q_flag": [feat(LOC(0, 5), "gene", [("pseudo", {"$": "list", "v": [""]})])],
     "q_int": [feat(LOC(0, 5), "CDS", [("codon_start", {"$": "list", "v": [1]}), ("number", 5), ("note", {"$": "list", "v": [7]})])], "q_noquote": [feat(LOC(0, 5), "CDS", [("transl_table", {"$": "list", "v": ["11"]}), ("anticodon", {"$": "list", "v": ["(pos:1..3,aa:Met)"]})])],
     "q_quote": [feat(LOC(0, 5), "gene", [("note", {"$": "list", "v": ['a "quoted" b']})])], "q_long": [feat(LOC(0, 5), "gene", [("note", {"$": "list", "v": ["long note words " * 12]})])], "q_longword": [feat(LOC(0, 5), "gene", [("note", {"$": "list", "v": ["x" * 150]})])],
     "q_translation": [feat(LOC(0, 5), "CDS", [("translation", {"$": "list", "v": ["MKV" * 40]})])], "q_scalar": [feat(LOC(0, 5), "gene", [("gene", "scalar")])], "q_badkey": [feat(LOC(0, 5), "gene", [("bad key!", {"$": "list", "v": ["v"]})])],
     "q_longkey": [feat(LOC(0, 5), "gene", [("k" * 25, {"$": "list", "v": ["v"]})])], "q_none": [feat(LOC(0, 5), "gene", [("flag", None), ("flag2", {"$": "list", "v": [None]})])], "q_empty_list": [feat(LOC(0, 5), "gene", [("k", {"$": "list", "v": []})])],
     "q_newline": [feat(LOC(0, 5), "gene", [("note", {"$": "list", "v": ["line1\nline2"]})])],
    }
    out = {}
    for fk, fl in feats.items():
        out["feat_" + fk] = R(S("ACGTACGTAC"), "F.1", "FN", "feature test", [], fl, [DNA])
    recs.update(out)
    rnd2 = random.Random(55)
    for i in range(40): recs[f"rand{i}"] = enc(make_record(rnd2, i))
    for fmt in ("genbank", "gb", "embl", "imgt"):
        for nm, rec in recs.items():
            add({"kind": "write", "format": fmt, "records": [rec]})
            if rnd.random() < .25: add({"kind": "format", "format": fmt, "record": rec})
        add({"kind": "write", "format": fmt, "records": [recs["plain"], recs["long"], recs["refs"], recs["tax"]]})
        add({"kind": "write", "format": fmt, "records": []})
    # converters and round trips through the writers
    for fmt, writer_fmt in (("genbank", "genbank"), ("embl", "embl")):
        pass
    rnd3 = random.Random(77)
    for fmt in ("genbank", "embl"):
        for i in range(25):
            rec = make_record(rnd3, 100 + i)
            buf = io.StringIO()
            try: SeqIO.write(rec, buf, fmt)
            except Exception: continue
            for out_fmt in ("fasta", "genbank", "embl", "imgt", "fastq"):
                add({"kind": "convert", "format": fmt, "text": buf.getvalue(), "out": out_fmt, "molecule_type": None})
    add({"kind": "convert", "format": "genbank", "text": "LOCUS", "out": "fasta", "molecule_type": None})


# ------------------------------------------------------------------ tab / pir / swiss
def mutate_text(t, rnd, junk=("XX", "//", "\t", ">", ";x", "  ")):
    """Randomly damage a text file: drop/duplicate/swap/blank/garble lines, cut it short, or flip characters."""
    lines = t.split("\n")
    if not lines: return t
    k = rnd.choice(["delete", "dup", "trunc", "garble", "swap", "blank", "indent", "chars", "insert", "nonl"])
    i = rnd.randrange(len(lines))
    if k == "delete": del lines[i]
    elif k == "dup": lines.insert(i, lines[i])
    elif k == "trunc": return t[:rnd.randrange(len(t) + 1)]
    elif k == "garble": lines[i] = "".join(rnd.choice("ABC /=\"()<>.,;:0123456789 \t*-") for _ in range(rnd.randint(0, 40)))
    elif k == "swap" and len(lines) > 1: j = rnd.randrange(len(lines)); lines[i], lines[j] = lines[j], lines[i]
    elif k == "blank": lines[i] = ""
    elif k == "indent": lines[i] = " " + lines[i] if rnd.random() < .5 else lines[i][1:]
    elif k == "chars":
        l = list(lines[i])
        if l: l[rnd.randrange(len(l))] = rnd.choice("x /\"-_0;=\t*"); lines[i] = "".join(l)
    elif k == "insert": lines.insert(i, rnd.choice(junk))
    elif k == "nonl": return t.rstrip("\n")
    return "\n".join(lines)

def rand_seq(rnd, alphabet, lo=0, hi=150):
    return "".join(rnd.choice(alphabet) for _ in range(rnd.randint(lo, hi)))

def simple_records(rnd, n, alphabet="ACGTN", ids=True):
    out = []
    for i in range(n):
        out.append(REC(S(rand_seq(rnd, alphabet, 0, 90)), rnd.choice(["r%d" % i, "id_%d.1" % i, "a b", "x", "<unknown id>", "tab\tid", "nl\nid", "é"]) if ids else "r%d" % i,
                       rnd.choice(["n", "<unknown name>"]), rnd.choice(["d", "", "two words", "<unknown description>", "a\nb"]),
                       annotations=rnd.choice([[], [["molecule_type", "DNA"]], [["molecule_type", "RNA"]], [["molecule_type", "protein"]], [["molecule_type", "mRNA"]], [["molecule_type", "weird"]]])))
    return out

def writer_extra_cases():
    base = [REC(S("ACGT"), "a", "n", "d"), REC(U(5), "u", "n", "d"), REC(M("ACGT"), "m", "n", "d"), REC(None, "s", "n", "d"), REC(S(""), "e", "n", "d"),
            REC(S("AC\tGT"), "t", "n", "d"), REC(S("AC\nGT"), "t", "n", "d"), REC(S("AC\rGT"), "t", "n", "d")]
    return base

def tab_cases():
    texts = ["", "\n", "a\tACGT\n", "a\tACGT", "a\tAC\nb\tGG\n", " a \t AC GT \n", "\t\n", "a\t\n", "\tAC\n", "a\tb\tc\n", "noTab\n", "a b\n\n\nc\td\n", "a\tAC\r\nb\tGG\r\n", "  \n \t \n", "a\t\t\n", "é\tAC\n",
             "id1\tMKV\nid2\tMKVL\n", "a\tAC\n\nb\tGG\n", "\n\na\tAC\n"]
    rnd2 = random.Random(31)
    base = list(texts)
    for i in range(60):
        recs = simple_records(rnd2, rnd2.randint(1, 5), ids=False)
        base.append("".join("%s\t%s\n" % (r["id"], r["seq"]["v"]) for r in recs if "v" in r["seq"]))
    allt = list(base)
    for t in base:
        for _ in range(4): allt.append(mutate_text(t, rnd2))
    for t in allt:
        add({"kind": "parse", "format": "tab", "text": t})
    for t in rnd2.sample(allt, 50): add({"kind": "read", "format": "tab", "text": t})
    add({"kind": "parse", "format": "tab", "bytes": "a\tAC\n"})
    for r in writer_extra_cases() + simple_records(rnd2, 60):
        add({"kind": "write", "format": "tab", "records": [r]})
        add({"kind": "format", "format": "tab", "record": r})
    recs = simple_records(rnd2, 6, ids=False)
    add({"kind": "write", "format": "tab", "records": recs}); add({"kind": "write", "format": "tab", "records": []})
    for t in ["a\tACGT\nb\tTT\n", ">a d\nACGT\n>b\nTT\n"]:
        add({"kind": "convert", "format": "tab" if "\t" in t else "fasta", "text": t, "out": "fasta" if "\t" in t else "tab", "molecule_type": None})
        add({"kind": "convert", "format": "tab" if "\t" in t else "fasta", "text": t, "out": "genbank", "molecule_type": "DNA"})
    add({"kind": "convert", "format": "tab", "text": "a\tACGT\nb\tTT\n", "out": "pir", "molecule_type": None})

PIR_HAND = [
">P1;CYC_BOVIN\nCytochrome c - bovine\nGDVEKGKKIF VQKCAQCHTV EAGGKHKVGP NLHGLFGRKT GQAPGFTYTD ANKNKGITWK\nEETLMEYLEN PKKYIPGTKM IFAGIKKKGE RADLIAYLKK ATNE*\n",
">DL;SEQ1\ndescription of seq\nACGTACGT*\n>RL;SEQ2\nrna one\nACGUACGU*\n",
">XX;UNK\n\nAAAA*\n", ">N3;N\nrna\nACGU*\n>RC;R\nr\nAC*\n>DC;D\nd\nAC*\n>F1;F\nf\nMK*\n>D1;D\nd\nAC*\n",
"junk before\n>P1;A\ndesc\nMKV*\n", ">P1;A\ndesc\nMKV\n", ">P1;A\ndesc\n", ">P1;A\n", ">P1;A", ">P1", ">P1;", ">ZZ;A\nd\nMK*\n", ">P1:A\nd\nMK*\n", ">P1;A\nd\n*\n", ">P1;A\nd\n\n>P1;B\nd\nMK*\n",
">P1;A\nd\nMK K*\n", ">P1;A  \nd  \nMK*  \n", "", "\n", "no header\n", ">P1;A\nd\nMK*\n\n", ">\n", ">P1;A\nd\nMK*\n>P1;B\n", ">P1;A\nd\nMK*\n>", ">P1;A\nd\nMK*\n>P1", "\n>P1;A\nd\nMK*\n", ">P1;A\r\nd\r\nMK*\r\n",
">P1;A\nd\nM\nK\n*\n", ">P1;A\nd\n*", ">P1;A\nd\n **\n", ">P1;A\nd\nMK*extra\n",
]

def pir_cases():
    rnd2 = random.Random(32)
    base = list(PIR_HAND)
    for i in range(60):
        recs = simple_records(rnd2, rnd2.randint(1, 4), alphabet="ACGTMKVLN")
        buf = io.StringIO()
        try: SeqIO.write([dec(r) for r in recs], buf, "pir"); base.append(buf.getvalue())
        except Exception: pass
    allt = list(base)
    for t in base:
        for _ in range(5): allt.append(mutate_text(t, rnd2, junk=("XX", ">P1;Z", "*", ">", "\t", ">P1;")))
    for t in allt: add({"kind": "parse", "format": "pir", "text": t})
    for t in rnd2.sample(allt, 60): add({"kind": "read", "format": "pir", "text": t})
    add({"kind": "parse", "format": "pir", "bytes": ">P1;A\nd\nMK*\n"})
    recs = writer_extra_cases() + simple_records(rnd2, 80, alphabet="ACGTMKVL")
    for r in recs:
        add({"kind": "write", "format": "pir", "records": [r]})
        add({"kind": "format", "format": "pir", "record": r})
    long = REC(S("ACGT" * 40), "long", "name", "descr", annotations=[["molecule_type", "DNA"]])
    for wrap in (60, 10, 7, 1, 200, 0, None, -1, 2.5):
        add({"kind": "writer", "cls": "PirWriter", "args": [wrap], "records": [long, REC(S("MKV"), "p", "pn", "pd", annotations=[["molecule_type", "protein"]]), REC(S(""), "empty", "n", "d")]})
    for code in ("P1", "F1", "D1", "DL", "DC", "RL", "RC", "N3", "XX", "ZZ", "", None, "d1"):
        add({"kind": "writer", "cls": "PirWriter", "args": [60, None, code], "records": [long]})
    add({"kind": "write", "format": "pir", "records": []})
    add({"kind": "write", "format": "pir", "records": simple_records(rnd2, 5, alphabet="MKV", ids=False)})
    for t in (">P1;A\nd\nMKV*\n>DL;B\ne\nACGT*\n",):
        for out in ("fasta", "pir", "tab", "genbank"): add({"kind": "convert", "format": "pir", "text": t, "out": out, "molecule_type": None})


# ------------------------------------------------------------------ swiss
def ft_old(name, frm, to, desc):
    return f"FT   {name:<8} {frm:>6} {to:>6}       {desc}"

def swiss_entry(rnd, style=None):
    """Build a SwissProt entry with a random selection of line types; style is 'new' or 'old'."""
    style = style or rnd.choice(["new", "old"])
    L = []
    n = rnd.randint(30, 140)
    seq = rand_seq(rnd, "ACDEFGHIKLMNPQRSTVWY", n, n)
    name = "%s_%s" % (rnd.choice(["CYC", "ABC1", "P53", "KIN"]), rnd.choice(["BOVIN", "HUMAN", "ECOLI"]))
    if style == "new":
        L.append(f"ID   {name:<24}{rnd.choice(['Reviewed', 'Unreviewed'])};{n:>12} AA.")
    else:
        L.append(f"ID   {name:<12} {rnd.choice(['STANDARD', 'PRELIMINARY', 'IPI'])};      {rnd.choice(['PRT;', ''])}{n:>6} AA.")
    L.append("AC   " + "; ".join(rnd.choice(["P62894", "Q9XYZ1", "A0A024R161", "P00001"]) + str(i) for i in range(rnd.randint(1, 3))) + ";")
    if style == "new":
        L += ["DT   01-JUL-1989, integrated into UniProtKB/Swiss-Prot.", "DT   01-JUL-1989, sequence version 2.", "DT   10-FEB-2021, entry version 150."]
    else:
        L += ["DT   21-JUL-1986 (Rel. 01, Created)", "DT   01-JAN-1990 (Rel. 14, Last sequence update)", "DT   01-NOV-1997 (Rel. 35, Last annotation update)"]
    if rnd.random() < .85: L += rnd.choice([["DE   RecName: Full=Cytochrome c;", "DE   AltName: Full=Other name;"], ["DE   CYTOCHROME C."], ["DE   RecName: Full=Kinase;", "DE            Short=K;", "DE   Flags: Fragment;"]])
    if rnd.random() < .7: L += rnd.choice([["GN   Name=CYCS; Synonyms=CYC, CYC1; ORFNames=XY1;"], ["GN   Name=A; ORFNames=B1, B2;", "GN   and", "GN   Name=B;"], ["GN   OrderedLocusNames=At1g01010;"], ["GN   Name=Long;", "GN   Synonyms=a, b, c;"]])
    L.append("OS   " + rnd.choice(["Bos taurus (Bovine).", "Escherichia coli (strain K12)."]))
    if rnd.random() < .2: L.append("OG   Mitochondrion.")
    L += ["OC   Eukaryota; Metazoa; Chordata; Craniata; Vertebrata; Euteleostomi; Mammalia;", "OC   Eutheria; Laurasiatheria; Artiodactyla; Ruminantia; Pecora; Bovidae;", "OC   Bovinae; Bos."][:rnd.randint(1, 3)]
    L.append(rnd.choice(["OX   NCBI_TaxID=9913;", "OX   NCBI_TaxID=9913 {ECO:0000312|EMBL:AAA};", "OX   NCBI_TaxID=9913, 9914;"]))
    if rnd.random() < .25: L.append("OH   NCBI_TaxID=9606; Homo sapiens (Human).")
    for r in range(rnd.randint(0, 3)):
        L.append(f"RN   [{r+1}]" + rnd.choice(["", " {ECO:0000269|PubMed:1}"]))
        L.append("RP   NUCLEOTIDE SEQUENCE [MRNA].")
        if rnd.random() < .6: L += rnd.choice([["RC   STRAIN=Holstein; TISSUE=Heart;"], ["RC   STRAIN=Holstein; TISSUE=Heart, and Liver;"], ["RC   STRAIN=A", "RC   long strain name; TISSUE=Brain;"], ["RC   SPECIES=x;"]])
        if rnd.random() < .8: L.append(rnd.choice(["RX   PubMed=3456789; DOI=10.1000/xyz;", "RX   MEDLINE=88123456; PubMed=3456789;", "RX   PubMed=3456789;", "RX   AGRICOLA=IND1;", "RX   DOI=10.1/x [NCBI, ExPASy, Israel, Japan];", "RX   PubMed=3456789;", "RX   PubMed=3456789; DOI=10.1000/xyz;", "RX   PubMed=3456789;", "RX   MEDLINE=88123456; PubMed=3456789;"] + (["RX   Bogus=1; Other;", "RX   MEDLINE; 88123456."] if rnd.random() < .12 else [])))
        L.append("RG   The consortium;" if rnd.random() < .2 else "RA   Smith J., Jones K.;")
        if rnd.random() < .8: L += rnd.choice([['RT   "A title that wraps-', 'RT   around two lines.";'], ['RT   "Short title.";'], ["RT   ;"]])
        L.append("RL   J. Biol. Chem. 255:1-2(1980).")
    for c in range(rnd.randint(0, 3)):
        L.append("CC   -----------------------------------------------------------------------" if rnd.random() < .2 else "CC   -!- FUNCTION: Electron carrier protein.")
        L.append("CC       Second line of the comment.")
    for d in range(rnd.randint(0, 4)): L.append(rnd.choice(["DR   EMBL; X1; Y1; -.", "DR   PDB; 1AKK; X-ray; 1.50 A; A=2-104.", "DR   GO; GO:0005506; F:iron ion binding; IEA:InterPro.", "DR   X"]))
    if rnd.random() < .8: L.append(rnd.choice(["PE   1: Evidence at protein level", "PE   2: Evidence at transcript level", "PE   5: Uncertain"]))
    if rnd.random() < .8: L += rnd.choice([["KW   Electron transport; Heme; Iron."], ["KW   Acetylation {ECO:0000255};", "KW   Phosphoprotein."], ["KW   Alpha."]])
    for f in range(rnd.randint(0, 4)):
        if style == "old" or rnd.random() < .3:
            L.append(ft_old(rnd.choice(["SIGNAL", "CHAIN", "VARSPLIC", "VAR_SEQ", "MOD_RES", "DOMAIN"]), rnd.randint(1, 20), rnd.choice([rnd.randint(21, 90), "?", "<30", ">99"]), rnd.choice(["Description here.", "AB CD -> EF GH (in isoform 2).", "By similarity."])))
            if rnd.random() < .5: L.append("FT" + " " * 32 + rnd.choice(["continued text", "more-", "/FTId=PRO_0000123456."]))
        else:
            L.append(f"FT   {rnd.choice(['SIGNAL', 'CHAIN', 'VAR_SEQ', 'VARIANT']):<8} " + " " * 7 + rnd.choice(["1..19", "20", "iso-2:1..5", "<1..>9", "?..5"]))
            for q in rnd.sample(['/note="Signal peptide"', '/evidence="ECO:0000255"', '/id="PRO_0000123456"', '/ftid="x"', '/variation="AB CD -> EF (in isoform 2)"'], rnd.randint(0, 3)):
                L.append("FT" + " " * 19 + q)
            if rnd.random() < .3: L.append("FT" + " " * 19 + "continuation text\"")
    L.append(f"SQ   SEQUENCE   {n} AA;  {n*110} MW;  3B4F6D0E8F2B3D7C CRC64;")
    for i in range(0, len(seq), 60):
        chunk = seq[i:i+60]
        L.append("     " + " ".join(chunk[j:j+10] for j in range(0, len(chunk), 10)))
    L.append("//")
    return "\n".join(L) + "\n"

def swiss_cases():
    rnd2 = random.Random(33)
    base = [swiss_entry(rnd2) for _ in range(160)]
    base.append(base[0] + base[1] + base[2])
    base += ["", "\n", "ID", "ID   X", "ID   A Reviewed; 5 AA.\n", "ID   A Reviewed; 5 AA.\n//\n", "ID   A Reviewed; 5 AA.\nAC   P1;\n//\n", "XX\n", "ID   A Reviewed; x AA.\n//\n", "ID   A Weird; 5 AA.\n//\n", "ID   A STANDARD; DNA; 5 AA.\n//\n",
             "ID   A Reviewed; 5 AA.\nAC   P1;\n**   comment\n//\n", "ID   A Reviewed; 5 AA.\nZZ   unknown\n//\n", "ID   A Reviewed; 5 AA.\nAC   P1;\n\n//\n", "ID   A Reviewed; 5 AA.\nRP   x\n//\n"]
    allt = list(base)
    for t in base[:160]:
        for _ in range(7): allt.append(mutate_text(t, rnd2, junk=("XX", "RN   [1]", "RC   A=b", "FT   CHAIN", "CC   -!- X", "OX   NCBI_TaxID=1;", "SQ   X", "//", "GN   and", "DT   x")))
    for t in allt: add({"kind": "parse", "format": "swiss", "text": t})
    for t in rnd2.sample(allt, 80): add({"kind": "read", "format": "swiss", "text": t})
    add({"kind": "parse", "format": "swiss", "bytes": "ID   A Reviewed; 5 AA.\n"})
    for t in rnd2.sample(base[:160], 30):
        for out in ("fasta", "genbank"): add({"kind": "convert", "format": "swiss", "text": t, "out": out, "molecule_type": None})


# ------------------------------------------------------------------ phd / ig
def phd_entry(rnd):
    n = rnd.randint(0, 12)
    L = ["BEGIN_SEQUENCE " + rnd.choice(["read1.x1", "R2 some description", "clone_7.scf extra words", "a"]), "", "BEGIN_COMMENT", ""]
    pool = ["CHROMAT_FILE: read1.scf", "ABI_THUMBPRINT: 0", "PHRED_VERSION: 0.980904.e", "CALL_METHOD: phred", "QUALITY_LEVELS: 99", "TIME: Mon Jan  1 10:00:00 2001",
            "TRACE_ARRAY_MIN_INDEX: 0", "TRACE_ARRAY_MAX_INDEX: 11", "TRIM: 3 8 0.05", "TRACE_PEAK_AREA_RATIO: 0.0123", "CHEM: term", "DYE: big", "BASECALLER_VERSION: 1.2", "TRACE_PROCESSOR_VERSION: 3", "UNKNOWN_KEY: whatever"]
    L += rnd.sample(pool, rnd.randint(0, len(pool)))
    L += ["END_COMMENT", "", "BEGIN_DNA"]
    peaks = rnd.random() < .6
    for i in range(n):
        L.append(f"{rnd.choice('acgtn')} {rnd.randint(0, 60)}" + (f" {i*10+rnd.randint(0, 5)}" if peaks else ""))
    L += ["END_DNA", "", "END_SEQUENCE"]
    return "\n".join(L) + "\n"

def phd_cases():
    rnd2 = random.Random(41)
    base = [phd_entry(rnd2) for _ in range(120)]
    base.append(base[0] + base[1] + base[2])
    base += ["", "\n", "BEGIN_SEQUENCE", "BEGIN_SEQUENCE \n", "BEGIN_SEQUENCE a\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\n",
             "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\nEND_DNA\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\nEND_DNA\nEND_SEQUENCE\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nnocolon\nEND_COMMENT\n",
             "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nTRIM: 1 2\nEND_COMMENT\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nTRIM: 1 2 x\nEND_COMMENT\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nTRIM: 1 2 3 4\nEND_COMMENT\n",
             "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nTRACE_PEAK_AREA_RATIO: nan\nEND_COMMENT\nBEGIN_DNA\na 1\nEND_DNA\nEND_SEQUENCE\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nTRACE_PEAK_AREA_RATIO: 1_0.5e1\nQUALITY_LEVELS: x\nEND_COMMENT\nBEGIN_DNA\nEND_DNA\nEND_SEQUENCE\n",
             "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\na\nEND_DNA\nEND_SEQUENCE\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\na 1 2 3\nEND_DNA\nEND_SEQUENCE\n",
             "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\na x\nEND_DNA\nEND_SEQUENCE\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\nac 1\nEND_DNA\nEND_SEQUENCE\n",
             "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\na 1 x\nEND_DNA\nEND_SEQUENCE\n", "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\na 1 5\nc 2\nEND_DNA\nEND_SEQUENCE\n",
             "BEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\na 1 x\nc 2\nEND_DNA\nEND_SEQUENCE\n", "junk\nBEGIN_SEQUENCE a\nBEGIN_COMMENT\nEND_COMMENT\nBEGIN_DNA\na 1\nEND_DNA\nEND_SEQUENCE\ntrailing\n"]
    allt = list(base)
    for t in base[:120]:
        for _ in range(6): allt.append(mutate_text(t, rnd2, junk=("END_COMMENT", "BEGIN_DNA", "END_DNA", "END_SEQUENCE", "TRIM: 1 2 0.5", "a 1", "x:y")))
    for t in allt: add({"kind": "parse", "format": "phd", "text": t})
    for t in rnd2.sample(allt, 60): add({"kind": "read", "format": "phd", "text": t})
    add({"kind": "parse", "format": "phd", "bytes": "BEGIN_SEQUENCE a\n"})
    # writer: records built from letter annotations
    def prec(seq, q, peaks=None, ann=(), id="r1", desc="r1 d"):
        letter = [["phred_quality", LST(*q)]] if q is not None else []
        if peaks is not None: letter.append(["peak_location", LST(*peaks)])
        return REC(S(seq), id, "n", desc, annotations=[list(a) for a in ann], letter=letter)
    recs = [prec("ACGT", [10, 20, 30, 40]), prec("ACGT", [10, 20, 30, 40], [1, 5, 9, 13]), prec("ACGT", [9.5, 10.5, 11.5, 0.5]), prec("A", [None]), prec("AC", [1, 2, 3]), prec("AC", [1, 2], [1]), prec("AC", [1, 2], [1.7, 2.2]),
            prec("ACGT", [1, 2, 3, 4], ann=[("chromat_file", "x.scf"), ("abi_thumbprint", 0), ("phred_version", "1"), ("call_method", "phred"), ("quality_levels", 99), ("time", "now"), ("trace_array_min_index", 0), ("trace_array_max_index", 3), ("trace_peak_area_ratio", 0.03125), ("chem", "term"), ("dye", "big")]),
            prec("ACGT", [1, 2, 3, 4], ann=[("chromat_file", ""), ("abi_thumbprint", None), ("quality_levels", 0), ("trace_peak_area_ratio", 0.0), ("dye", 0), ("time", 3.5)]),
            prec("ACGT", [1, 2, 3, 4], ann=[("trace_peak_area_ratio", 1), ("chem", LST("x", "y"))]), prec("ACGT", [1, 2, 3, 4], ann=[("trace_peak_area_ratio", "x")]),
            prec("ACGT", [1, 2, 3, 4], id="id1", desc="id1 already"), prec("ACGT", [1, 2, 3, 4], id="id1", desc="other"), prec("ACGT", [1, 2, 3, 4], id="id1", desc="line\nbreak"),
            prec("ACGT", None), REC(S("ACGT"), "x", "n", "d", letter=[["solexa_quality", LST(-5, 0, 10, 40)]]), prec("", []), REC(U(3), "u", "n", "d", letter=[["phred_quality", LST(1, 2, 3)]]), REC(None, "z", "n", "d"),
            prec("ACGT", [0.5, 1.5, 2.5, 3.5]), prec("AC", [-1, 100])]
    for r in recs:
        add({"kind": "write", "format": "phd", "records": [r]}); add({"kind": "format", "format": "phd", "record": r})
    add({"kind": "write", "format": "phd", "records": recs[:3]})
    for t in rnd2.sample(base[:120], 25):
        for out in ("phd", "fasta", "fastq"): add({"kind": "convert", "format": "phd", "text": t, "out": out, "molecule_type": None})
    add({"kind": "convert", "format": "fastq", "text": "@r1 d\nACGT\n+\nIIII\n", "out": "phd", "molecule_type": None})

def ig_entry(rnd):
    L = []
    if rnd.random() < .5: L += [";;file header", ";; more header"]
    for _ in range(rnd.randint(1, 4)):
        L += rnd.sample(["; comment one", ";comment two", ";  spaced  ", ";"], rnd.randint(1, 3))
        L.append(rnd.choice(["seq1", "seq 2 title", "Title  "]))
        n = rnd.randint(0, 30)
        sq = rand_seq(rnd, "ACGT -", n, n)
        L += [sq[i:i+10] for i in range(0, len(sq), 10)]
        if rnd.random() < .85: L[-1:] = [(L[-1] if L[-1] and not L[-1].startswith(";") else "") + "1"] if len(sq) else ["1"]
    return "\n".join(L) + "\n"

def ig_cases():
    rnd2 = random.Random(42)
    base = [ig_entry(rnd2) for _ in range(120)]
    base += ["", "\n", ";", ";\n", ";;x\n", ";;x\n;\n", "; c\ntitle\nACGT1\n", "; c\ntitle\nAC1GT1\n", "; c\ntitle\nACGT\n", "; c\ntitle\n", "; c\n", "; c\ntitle\nACGT1\n; d\nt2\nGG1\n", "title only\n", "no semicolon\nACGT1\n; c\nt\nAA1\n",
             "; c\ntitle\n1\n", "; c\ntitle\n\n", ";\n;\ntitle\nAC GT 1\n", "; c\ntitle\nAC\n\nGT1\n", "; c\r\ntitle\r\nACGT1\r\n", "; c\ntitle\nAC1\n; d\n"]
    allt = list(base)
    for t in base[:120]:
        for _ in range(5): allt.append(mutate_text(t, rnd2, junk=(";", ";;", "1", "; c", "title", "AC 1")))
    for t in allt: add({"kind": "parse", "format": "ig", "text": t})
    for t in rnd2.sample(allt, 50): add({"kind": "read", "format": "ig", "text": t})
    add({"kind": "parse", "format": "ig", "bytes": "; c\nt\nAA1\n"})
    for t in rnd2.sample(base[:120], 15):
        for out in ("fasta", "tab"): add({"kind": "convert", "format": "ig", "text": t, "out": out, "molecule_type": None})


# ------------------------------------------------------------------ seqxml
def xml_doc(rnd, ver=None):
    ver = ver or rnd.choice(["0.1", "0.2", "0.3", "0.4"])
    names = {"DNA": "dnaSeq" if ver == "0.1" else "DNAseq", "RNA": "rnaSeq" if ver == "0.1" else "RNAseq", "protein": "aaSeq" if ver == "0.1" else "AAseq"}
    dbref = "alternativeID" if ver == "0.1" else "DBRef"
    root = f'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.seqxml.org/{ver}/seqxml.xsd" seqXMLversion="{ver}"'
    if rnd.random() < .7: root += ' source="SRC &amp; co"'
    if rnd.random() < .4: root += ' sourceVersion="1.2"'
    if ver == "0.4" and rnd.random() < .5: root += ' ncbiTaxID="9606" speciesName="Homo sapiens"'
    ind = rnd.choice(["", "  ", "\t"]); nl = rnd.choice(["\n", "\r\n", ""])
    out = ['<?xml version="1.0" encoding="UTF-8"?>' + nl if rnd.random() < .85 else "", f"<seqXML {root}>" + nl]
    for i in range(rnd.randint(0, 6)):
        mol = rnd.choice(["DNA", "RNA", "protein"])
        alpha = {"DNA": "ACGTN", "RNA": "ACGUN", "protein": "ACDEFGHIKLMNPQRSTVWY"}[mol]
        attrs = f' id="e{i}"'
        if ver in ("0.3", "0.4") and rnd.random() < .4: attrs += ' source="other"'
        out.append(f"{ind}<entry{attrs}>{nl}")
        if rnd.random() < .5: out.append(ind * 2 + rnd.choice([f'<species name="Homo sapiens" ncbiTaxID="9606"/>', '<species name="E. coli" ncbiTaxID="562"></species>']) + nl)
        if rnd.random() < .7: out.append(ind * 2 + "<description>" + rnd.choice(["A description", "with &lt;entities&gt; &amp; more", "<![CDATA[raw <text>]]>", "unicode é ü 日本", "", "multi\nline"]) + "</description>" + nl)
        sq = rand_seq(rnd, alpha, 0 if rnd.random() < .05 else 1, 80)
        out.append(ind * 2 + f"<{names[mol]}>{sq}</{names[mol]}>" + nl)
        for _ in range(rnd.randint(0, 3)):
            t = ' type="x"' if ver in ("0.2", "0.3", "0.4") or rnd.random() < .5 else ""
            out.append(ind * 2 + f'<{dbref} source="DB{rnd.randint(1,3)}" id="ID{rnd.randint(1,9)}"{t}/>' + nl)
        for _ in range(rnd.randint(0, 3)):
            out.append(ind * 2 + rnd.choice(['<property name="color" value="red"/>', '<property name="flag"/>', '<property name="color" value="blue"></property>', f'<property name="score" value="{rnd.randint(0, 9)}"/>']) + nl)
        out.append(f"{ind}</entry>{nl}")
        if rnd.random() < .1: out.append("<!-- a comment -->" + nl)
    out.append("</seqXML>" + rnd.choice(["\n", "", "\n\n"]))
    return "".join(out)

def mutate_xml(t, rnd):
    import re
    k = rnd.choice(["version", "dropattr", "rename", "renameopen", "dropline", "extraattr", "dupline", "trunc", "generic", "swapver", "dropseq", "propmol", "ns", "xmlns", "unknownfield"])
    lines = t.split("\n")
    if k == "version": return re.sub(r'seqXMLversion="[^"]*"', 'seqXMLversion="%s"' % rnd.choice(["0.5", "1", "", "0.1", "0.2", "0.3"]), t, count=1)
    if k == "swapver": return t.replace('seqXMLversion="0.4"', 'seqXMLversion="0.%d"' % rnd.randint(1, 3), 1)
    if k == "dropattr":
        m = list(re.finditer(r' [A-Za-z:]+="[^"]*"', t)); 
        if not m: return t
        x = rnd.choice(m); return t[:x.start()] + t[x.end():]
    if k == "rename":
        tags = list(set(re.findall(r"<([A-Za-z]+)[ />]", t)))
        if not tags: return t
        a = rnd.choice(tags); b = rnd.choice(["entry", "species", "description", "DNAseq", "property", "foo", "DBRef", "AAseq"])
        return re.sub(r"<(/?)%s([ />])" % a, r"<\1%s\2" % b, t)
    if k == "renameopen":
        tags = list(set(re.findall(r"<([A-Za-z]+)[ />]", t)))
        if not tags: return t
        a = rnd.choice(tags); return t.replace("<%s" % a, "<%sX" % a, 1)
    if k == "dropline" and len(lines) > 1: del lines[rnd.randrange(len(lines))]; return "\n".join(lines)
    if k == "dupline": i = rnd.randrange(len(lines)); lines.insert(i, lines[i]); return "\n".join(lines)
    if k == "extraattr":
        m = list(re.finditer(r"<([A-Za-z]+)", t))
        if not m: return t
        x = rnd.choice(m); return t[:x.end()] + rnd.choice([' foo="bar"', ' xmlns="urn:x"', ' xml:lang="en"', ' ncbiTaxID="abc"', ' ncbiTaxID="5"', ' id="dup"', ' source="s"', ' type="t"', ' xmlns:p="urn:p" p:a="1"', ' p:a="1"']) + t[x.end():]
    if k == "trunc": return t[:rnd.randrange(len(t) + 1)]
    if k == "dropseq": return re.sub(r"<(DNAseq|RNAseq|AAseq|dnaSeq|rnaSeq|aaSeq)>[^<]*</\1>", "", t, count=1)
    if k == "propmol": return t.replace("</entry>", '<property name="molecule_type" value="%s"/></entry>' % rnd.choice(["DNA", "mRNA", "protein", "x"]), 1)
    if k == "ns": return t.replace("<entry", "<x:entry xmlns:x=\"urn:x\"", 1)
    if k == "xmlns": return t.replace("<seqXML", '<seqXML xmlns="urn:default"', 1)
    if k == "unknownfield": return t.replace("</entry>", rnd.choice(["<unknown/>", "<species/>", '<description a="b"/>', "<DNAseq a=\"b\">AC</DNAseq>"]) + "</entry>", 1)
    return mutate_text(t, rnd, junk=("<", ">", "&", "<a>", "</a>", "&amp;", "<![CDATA[", "<!--"))

def seqxml_cases():
    rnd2 = random.Random(51)
    base = [xml_doc(rnd2) for _ in range(150)]
    for v in ("0.1", "0.2", "0.3", "0.4"): base += [xml_doc(rnd2, v) for _ in range(10)]
    big = xml_doc(rnd2, "0.4").replace("</seqXML>", "") + "".join(f'<entry id="big{i}"><DNAseq>{rand_seq(rnd2, "ACGT", 200, 400)}</DNAseq></entry>' for i in range(12)) + "</seqXML>"
    base += [big]
    base += ["", " ", "<", "<a/>", "<seqXML/>", '<seqXML seqXMLversion="0.4"/>', '<seqXML seqXMLversion="0.4"></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq></entry></seqXML>',
             '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq></entry>', '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq></entry></seqXML><x/>', '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq></entry></seqXML> <!-- ok --> \n',
             '<?xml version="1.0"?><seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>AC&#71;T&#x41;</DNAseq></entry></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>AC&bogus;GT</DNAseq></entry></seqXML>',
             '<?xml version="1.0" encoding="ISO-8859-1"?><seqXML seqXMLversion="0.4"><entry id="caf\xe9"><DNAseq>ACGT</DNAseq></entry></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a" id="b"><DNAseq>ACGT</DNAseq></entry></seqXML>',
             "<seqXML seqXMLversion='0.4'><entry id='a'><DNAseq>ACGT</DNAseq></entry></seqXML>", '<seqXML seqXMLversion="0.4"><entry id="a"><description>x<b/>y</description><DNAseq>ACGT</DNAseq></entry></seqXML>',
             '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>AC<![CDATA[GT]]></DNAseq><property name="molecule_type" value="DNA"/></entry></seqXML>',
             '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq><property name="molecule_type"/></entry></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq><property name="organism" value="x"/></entry></seqXML>',
             '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq><property value="x"/></entry></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq><property name="a" foo="x"/></entry></seqXML>',
             '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq><DBRef source="s" id="i">text</DBRef></entry></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq><DBRef source="s" id="i" foo="1"/></entry></seqXML>',
             '<seqXML seqXMLversion="0.4"><entry id="a"><species name="n"/><DNAseq>ACGT</DNAseq></entry></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a"><species ncbiTaxID="1"/><DNAseq>ACGT</DNAseq></entry></seqXML>', '<seqXML seqXMLversion="0.4"><entry id="a"><species name="n" ncbiTaxID="1" x="2"/><DNAseq>ACGT</DNAseq></entry></seqXML>']
    allt = list(base)
    for t in base[:164]:
        for _ in range(7): allt.append(mutate_xml(t, rnd2))
    for t in list(allt):
        if rnd2.random() < .1: allt.append(mutate_xml(t, rnd2))
    for t in allt: add({"kind": "parse", "format": "seqxml", "bytes": t.encode("utf-8").decode("latin-1")})
    for t in rnd2.sample(allt, 80): add({"kind": "read", "format": "seqxml", "bytes": t.encode("utf-8").decode("latin-1")})
    # a text source is refused
    add({"kind": "parse", "format": "seqxml", "text": '<seqXML seqXMLversion="0.4"/>'})
    # lone bytes with a BOM, invalid UTF-8, unsupported encoding
    add({"kind": "parse", "format": "seqxml", "bytes": "\xef\xbb\xbf" + '<seqXML seqXMLversion="0.4"><entry id="a"><DNAseq>ACGT</DNAseq></entry></seqXML>'.encode("utf-8").decode("latin-1")})
    add({"kind": "parse", "format": "seqxml", "bytes": '<seqXML seqXMLversion="0.4"><entry id="\xff"><DNAseq>ACGT</DNAseq></entry></seqXML>'})
    # writer
    def srec(seq, id="r1", desc="a desc", ann=(), dbx=(), q=None):
        return REC(S(seq), id, "n", desc, dbxrefs=list(dbx), annotations=[list(a) for a in ann])
    DNA = ("molecule_type", "DNA")
    recs = [srec("ACGT", ann=[DNA]), srec("ACGU", ann=[("molecule_type", "mRNA")]), srec("MKV", ann=[("molecule_type", "protein")]), srec("ACGT"), srec("ACGT", ann=[("molecule_type", "weird")]), srec("", ann=[DNA]),
            srec("ACGT", id="<unknown id>", ann=[DNA]), srec("ACGT", id="", ann=[DNA]), srec("ACGT", desc="<unknown description>", ann=[DNA]), srec("ACGT", desc="", ann=[DNA]), srec("ACGT", desc='q"uote <&> \'s', ann=[DNA]),
            srec("ACGT", id='a"b', ann=[DNA]), srec("ACGT", id="a'b\"c", ann=[DNA]), srec("ACGT", id="a\nb\tc", ann=[DNA]), srec("ACGT", id="é 日本", desc="é 日本", ann=[DNA]),
            srec("ACGT", ann=[DNA, ("organism", "Homo"), ("ncbi_taxid", "9606")]), srec("ACGT", ann=[DNA, ("organism", "Homo"), ("ncbi_taxid", 9606)]), srec("ACGT", ann=[DNA, ("organism", "Homo"), ("ncbi_taxid", LST("9606"))]),
            srec("ACGT", ann=[DNA, ("organism", "Homo"), ("ncbi_taxid", LST("1", "2"))]), srec("ACGT", ann=[DNA, ("organism", "Homo"), ("ncbi_taxid", LST())]), srec("ACGT", ann=[DNA, ("organism", 5), ("ncbi_taxid", "1")]),
            srec("ACGT", ann=[DNA, ("organism", "Homo"), ("ncbi_taxid", 1.5)]), srec("ACGT", ann=[DNA, ("organism", "Homo")]), srec("ACGT", ann=[DNA, ("ncbi_taxid", "1")]),
            srec("ACGT", ann=[DNA, ("source", "other")]), srec("ACGT", ann=[DNA, ("source", 5)]), srec("ACGT", ann=[DNA, ("source", "src")]),
            srec("ACGT", ann=[DNA, ("note", "text"), ("count", 5), ("ratio", 0.5), ("flag", True), ("none", None), ("many", LST("a", None, 3)), ("empty", LST())]),
            srec("ACGT", ann=[DNA, ("d", {"$": "dict", "v": [["k", "v"]]})]), srec("ACGT", dbx=["EMBL:X1", "UniProt:P1:extra"], ann=[DNA]), srec("ACGT", dbx=["nocolon"], ann=[DNA]), srec("ACGT", dbx=[":x"], ann=[DNA]),
            REC(U(4), "u", "n", "d", annotations=[[ "molecule_type", "DNA"]]), REC(M("ACGT"), "m", "n", "d", annotations=[["molecule_type", "DNA"]]), REC(None, "nos", "n", "d", annotations=[["molecule_type", "DNA"]]),
            srec("ACGT", ann=[("molecule_type", LST("DNA"))]), srec("ACGT", ann=[("molecule_type", None)]), srec("ACGT", ann=[("molecule_type", "DNA RNA protein")])]
    for r in recs:
        add({"kind": "write", "format": "seqxml", "binary": True, "records": [r]})
        add({"kind": "write", "format": "seqxml", "records": [r]})
        add({"kind": "format", "format": "seqxml", "record": r})
    add({"kind": "write", "format": "seqxml", "binary": True, "records": []})
    add({"kind": "write", "format": "seqxml", "binary": True, "records": recs[:3]})
    add({"kind": "write", "format": "seqxml", "binary": True, "records": [recs[0], recs[6], recs[1]]})
    for args in ([], ["src"], ["src", "1.0"], ["src", "1.0", "Homo", "9606"], [None, None, "Homo", None], [None, None, None, "9606"], [None, None, None, 9606], ["a&b<c", 'q"x', "sp", "5"], [5], [None, None, 5], [None, None, "Homo", [1]], [None, None, None, 1.5], ["other"], [None, None, "Homo", 9606]):
        add({"kind": "writer", "cls": "SeqXmlWriter", "binary": True, "args": args, "records": [recs[0], recs[15], recs[16], recs[24], recs[25]]})
    # round trips through the reader
    for t in rnd2.sample([x for x in base if x.startswith("<?xml")], 25):
        b = t.encode("utf-8").decode("latin-1")
        for out in ("seqxml", "fasta", "genbank"): add({"kind": "convert", "format": "seqxml", "bytes": b, "out": out, "binary": out == "seqxml", "molecule_type": None})
    add({"kind": "convert", "format": "fasta", "text": ">a d\nACGT\n", "out": "seqxml", "binary": True, "molecule_type": "DNA"})
    add({"kind": "convert", "format": "fasta", "text": ">a d\nACGT\n", "out": "seqxml", "molecule_type": "DNA"})


# ------------------------------------------------------------------ nib / twobit / gck / xdna
import binfiles as BF
import struct

def rand_dna(rnd, lo, hi, alpha="ACGT"): return "".join(rnd.choice(alpha) for _ in range(rnd.randint(lo, hi)))

def nib_cases():
    rnd2 = random.Random(71)
    base = []
    for n in list(range(0, 12)) + [30, 31, 100, 101]:
        buf = io.BytesIO()
        try: SeqIO.write(SeqRecord(Seq(rand_dna(rnd2, n, n, "ACGTNacgtn"))), buf, "nib"); base.append(buf.getvalue())
        except Exception: pass
    base += [b"", b"\x3a", b"\x3a\x3d\xe9\x6b", b"\x6b\xe9\x3d\x3a", b"\x6b\xe9\x3d\x3a\x00\x00\x00\x04\x00\x00", b"\x3a\x3d\xe9\x6b\x04\x00\x00\x00\x01\x23", b"\x3a\x3d\xe9\x6b\x03\x00\x00\x00\x01\x23", b"\x3a\x3d\xe9\x6b\x03\x00\x00\x00\x01\x2d",
             b"\x6b\xe9\x3d\x3a\x00\x00\x00\x04\x01\x23", b"\x3a\x3d\xe9\x6b\x04\x00\x00\x00\x01\x23\x45\x67", b"\x3a\x3d\xe9\x6b\x00\x00\x00\x00", b"\x3a\x3d\xe9\x6b\x00\x00\x00", b"\x3a\x3d\xe9\x6b\x04\x00\x00\x00\x44\xcc"]
    allb = list(base)
    for b in base:
        for _ in range(8): allb.append(BF.mutate_bytes(b, rnd2))
    for b in allb: add({"kind": "parse", "format": "nib", "bytes": BF.lat(b)})
    for b in rnd2.sample(allb, 40): add({"kind": "read", "format": "nib", "bytes": BF.lat(b)})
    add({"kind": "parse", "format": "nib", "text": "abc"})
    seqs = [Seq(rand_dna(rnd2, 0, 20, "ACGTNacgtn")) for _ in range(30)] + [Seq("ACGTX"), Seq("ACGU"), Seq("acgt-"), Seq("ACGTTGCA"), Seq("A"), Seq("")]
    for sq in seqs:
        rec = REC(S(str(sq)), "r", "n", "d")
        add({"kind": "write", "format": "nib", "binary": "bytes", "records": [rec]}); add({"kind": "format", "format": "nib", "record": rec})
        add({"kind": "write", "format": "nib", "records": [rec]})
    for r in (REC(U(4), "u", "n", "d"), REC(M("ACGT"), "m", "n", "d"), REC(None, "z", "n", "d")): add({"kind": "write", "format": "nib", "binary": "bytes", "records": [r]})
    add({"kind": "write", "format": "nib", "binary": "bytes", "records": []})
    add({"kind": "write", "format": "nib", "binary": "bytes", "records": [REC(S("ACGT"), "a"), REC(S("ACGT"), "b")]})
    for b in rnd2.sample(base[:20], 8):
        for out in ("fasta", "nib"): add({"kind": "convert", "format": "nib", "bytes": BF.lat(b), "out": out, "binary": "bytes" if out == "nib" else False, "molecule_type": None})

def twobit_cases():
    rnd2 = random.Random(72)
    base = []
    for _ in range(40):
        seqs = {}
        for i in range(rnd2.randint(0, 4)):
            dna = rand_dna(rnd2, 0, 60, "ACGT")
            dna = "".join(c.lower() if rnd2.random() < .2 else c for c in dna)
            if dna and rnd2.random() < .5:
                a = rnd2.randrange(len(dna)); dna = dna[:a] + "N" * rnd2.randint(1, 8) + dna[a:]
            seqs[rnd2.choice(["chr1", "chr2", "seq_%d" % i, "x"])] = dna
        base.append(BF.twobit_file(seqs, little=rnd2.random() < .7))
    base += [BF.twobit_file({"a": "ACGT"}), BF.twobit_file({"a": "ACGTACGTAC" * 5}, little=False), BF.twobit_file({"a": ""}), BF.twobit_file({}), BF.twobit_file({"a": "ACGT"}, version=1), BF.twobit_file({"a": "ACGT"}, version=2),
             BF.twobit_file({"a": "ACGT"}, reserved=1), BF.twobit_file({"a": "ACGT"}, seq_reserved=7), b"", b"\x43\x27\x41\x1a", b"\x1a\x41\x27\x43", b"\x43\x27", b"\x00\x00\x00\x00", BF.twobit_file({"a": "NNNNACGTnnnnacgt"}), BF.twobit_file({"a": "acgtacgtacgt"}), BF.twobit_file({"a": "ACGT", "b": "TTTT"})]
    allb = list(base)
    for b in base:
        for _ in range(6): allb.append(BF.mutate_bytes(b, rnd2))
    for b in allb: add({"kind": "parse", "format": "twobit", "bytes": BF.lat(b)})
    for b in rnd2.sample(allb, 30): add({"kind": "read", "format": "twobit", "bytes": BF.lat(b)})
    ops = [["get", 0], ["get", 3], ["get", -1], ["get", 100], ["get", -100], ["slice", None, None, None], ["slice", 1, 5, None], ["slice", None, None, 2], ["slice", None, None, -1], ["slice", 8, 2, -2], ["slice", 0, 10, 3],
           ["slice", 5, 5, None], ["slice", -10, None, None], ["slice", 2, 100, 1], ["slice", None, None, 0], ["upper", None, None, None], ["lower", None, None, None], ["lower", 2, 6, None], ["upper", 1, 9, 2], ["lower", None, None, -3]]
    for b in rnd2.sample(base[:40], 20):
        add({"kind": "twobit_ops", "format": "twobit", "bytes": BF.lat(b), "ops": ops})
    add({"kind": "twobit_ops", "format": "twobit", "bytes": BF.lat(BF.twobit_file({"a": "NNNNACGTnnnnacgtACGTACGTTTTTGGGGCCCCAAAA", "b": "acgtACGT"})), "ops": ops})

def gck_cases():
    rnd2 = random.Random(73)
    base = []
    for _ in range(40):
        seq = rand_dna(rnd2, 0, 80)
        feats = []
        for _ in range(rnd2.randint(0, 4)):
            a = rnd2.randint(0, max(0, len(seq))); b = rnd2.randint(a, max(a, len(seq)))
            feats.append((a, b, rnd2.choice([0, 1, 5]), rnd2.random() < .5, rnd2.choice(["", "gene A", "lacZ"]), rnd2.choice(["", "a comment"]), rnd2.choice([0, 0, 0, 1])))
        base.append(BF.gck_file(seq, feats, name=rnd2.choice(["construct 1", "pUC19 plasmid", "x"]), circular=rnd2.random() < .5, sites=rnd2.choice([0, 0, 2]), versions=rnd2.choice([(), (None,), ("a note", None)])))
    base += [b"", b"\x00" * 10, b"\x00" * 24, b"\x00" * 23, BF.gck_file("ACGT", seq_len_override=100), BF.gck_file("ACGT", [(3, 1, 0, False, "", "", 0)]), BF.gck_file("ACGT", [(0, 4, 0, False, "", "", 0)], trailer=700)]
    allb = list(base)
    for b in base:
        for _ in range(6): allb.append(BF.mutate_bytes(b, rnd2))
    for b in allb: add({"kind": "parse", "format": "gck", "bytes": BF.lat(b)})
    for b in rnd2.sample(allb, 30): add({"kind": "read", "format": "gck", "bytes": BF.lat(b)})
    add({"kind": "parse", "format": "gck", "text": "abc"})
    for b in rnd2.sample(base[:40], 8): add({"kind": "convert", "format": "gck", "bytes": BF.lat(b), "out": "genbank", "molecule_type": "DNA"})

def xdna_cases():
    rnd2 = random.Random(74)
    def xrec(seq, mol, topo, feats, desc="d", rid="r1"):
        ann = [["molecule_type", mol]] if mol else []
        if topo: ann.append(["topology", topo])
        return REC(S(seq), rid, rid, desc, features=feats, annotations=ann)
    def xf(a, b, st, typ="gene", quals=()): return FEAT(LOC_(a, b, st), typ, "<unknown id>", quals)
    recs = []
    for _ in range(40):
        seq = rand_dna(rnd2, 0, 60)
        feats = []
        for _ in range(rnd2.randint(0, 4)):
            a = rnd2.randint(0, len(seq)); b = rnd2.randint(a, len(seq))
            quals = rnd2.choice([[], [("label", LST("lab"))], [("note", LST("a note")), ("gene", LST("x y"))], [("label", LST("l")), ("translation", LST("MK")), ("db_xref", LST("a", "b"))]])
            feats.append(xf(a, b, rnd2.choice([1, -1, None]), rnd2.choice(["gene", "CDS", "", "misc_feature"]), quals))
        recs.append(xrec(seq, rnd2.choice([None, "DNA", "RNA", "protein", "dsDNA", "weird"]), rnd2.choice([None, "linear", "circular"]), feats, rnd2.choice(["d", "r1 already", "", "multi word desc"]), rnd2.choice(["r1", "id2", "id with space"])))
    base = []
    for r in recs:
        buf = io.BytesIO()
        try: SeqIO.write(dec(r), buf, "xdna"); base.append(buf.getvalue())
        except Exception: pass
    base += [b"", b"\x00" * 111, b"\x00" * 112, b"\x01" + b"\x00" * 111]
    allb = list(base)
    for b in base:
        for _ in range(6): allb.append(BF.mutate_bytes(b, rnd2))
    for b in allb: add({"kind": "parse", "format": "xdna", "bytes": BF.lat(b)})
    for b in rnd2.sample(allb, 40): add({"kind": "read", "format": "xdna", "bytes": BF.lat(b)})
    add({"kind": "parse", "format": "xdna", "text": "abc"})
    extra = [xrec("ACGT", "DNA", None, [xf(0, 2, 1, "gene", [("label", LST("a"*300))])]), xrec("ACGT", "DNA", None, [xf(0, 2, 1, "gene", [("note", LST("é"))])]), xrec("ACGT", "DNA", None, [xf(0, 2, 1, "gene", [("note", "abc")])]),
             xrec("ACGT", "DNA", None, [xf(0, 2, 1, "gene", [("label", LST())])]), xrec("ACGT", "DNA", None, [xf(0, 2, 1, "gene", [("note", 5)])]), xrec("ACGT", "DNA", None, [xf(0, 2, 1, "gene", [("label", "lab")])]),
             xrec("ACGT", "DNA", None, [FEAT(SL_fuzzy(), "gene")]), xrec("ACGT", "DNA", None, [xf(0, 2, 1) for _ in range(300)]), xrec("ACGT", "DNA", None, [FEAT(None, "gene")]),
             xrec("ACGT", LST("DNA"), None, []), xrec("ACGT", 5, None, []), xrec("ACGT", "DNA", "circular", [], desc="é"), xrec("é", "DNA", None, []), xrec("", "DNA", None, []), xrec("ACGT", "DNA", None, [], rid=""), xrec("ACGT", "DNA", None, [], desc="x" * 300),
             REC(U(4), "u", "n", "d"), REC(M("ACGT"), "m", "m", "d"), REC(None, "n", "n", "d")]
    for r in recs[:25] + extra:
        add({"kind": "write", "format": "xdna", "binary": "bytes", "records": [r]}); add({"kind": "format", "format": "xdna", "record": r})
    add({"kind": "write", "format": "xdna", "binary": "bytes", "records": []}); add({"kind": "write", "format": "xdna", "binary": "bytes", "records": recs[:2]}); add({"kind": "write", "format": "xdna", "records": [recs[0]]})
    for b in rnd2.sample(base[:40], 10):
        for out in ("xdna", "genbank"): add({"kind": "convert", "format": "xdna", "bytes": BF.lat(b), "out": out, "binary": "bytes" if out == "xdna" else False, "molecule_type": None})

def SL_fuzzy():
    return LOC_({"$": "pos", "cls": "BeforePosition", "v": 1}, 3, 1)


# ------------------------------------------------------------------ abi
def abi_cases():
    rnd2 = random.Random(75)
    def tags_for(n, fsa=False, rnd=rnd2):
        seq = rand_dna(rnd, n, n, "ACGTN")
        quals = bytes(rnd.randint(2, 60) for _ in range(n))
        t = [("SMPL", 1, 18, rnd.choice(["sample1", "S 2", "x"])), ("TUBE", 1, 18, rnd.choice(["A1", "H12"])), ("DySN", 1, 18, "Z-BigDyeV3"), ("GTyp", 1, 18, "POP7"), ("MODL", 1, 18, rnd.choice(["3130", "3730"])),
             ("RUND", 1, 10, (2020, rnd.randint(1, 12), rnd.randint(1, 28))), ("RUND", 2, 10, (2020, 5, 6)), ("RUNT", 1, 11, (rnd.randint(0, 23), rnd.randint(0, 59), rnd.randint(0, 59), 0)), ("RUNT", 2, 11, (1, 2, 3, 4)),
             ("PLOC", 2, 4, [rnd.randint(0, 3000) for _ in range(n)]), ("DATA", 1, 4, [1, 2, 3]), ("Scal", 1, 7, 1.5), ("EPVt", 1, 5, 15000), ("CpEP", 1, 13, 1), ("CMNT", 1, 19, "a comment"), ("Tmpr", 1, 8, 50.0)]
        if fsa: t += [("LIMS", 1, 18, "lims id"), ("CTID", 1, 18, "container")]
        else: t += [("PBAS", 1, 2, seq.encode()), ("PBAS", 2, 2, seq.encode()), ("PCON", 2, 2, quals)]
        rnd.shuffle(t)
        return t
    base = []
    for n in [0, 1, 5, 10, 20, 21, 22, 30, 60, 100]:
        base.append(BF.abi_file(tags_for(n)))
    for _ in range(25): base.append(BF.abi_file(tags_for(rnd2.randint(0, 80), fsa=rnd2.random() < .3)))
    base.append(BF.abi_file(tags_for(5, fsa=True)))
    base.append(BF.abi_file([("PBAS", 2, 2, b"ACGT")]))                     # sequence without qualities
    base.append(BF.abi_file([("PBAS", 2, 2, b"ACGT"), ("PCON", 2, 2, bytes([30, 30]))]))   # mismatched lengths
    base.append(BF.abi_file([("PBAS", 1, 2, b"ACGT")]))                     # PBAS1 only
    base.append(BF.abi_file([("RUND", 1, 10, (2020, 13, 1))])); base.append(BF.abi_file([("RUND", 1, 10, (0, 1, 1))])); base.append(BF.abi_file([("RUNT", 1, 11, (25, 0, 0, 0))]))
    base.append(BF.abi_file([("DATA", 1, 99, b"\x01\x02")])); base.append(BF.abi_file([("SMPL", 1, 2, b"\xff\xfe")])); base.append(BF.abi_file([("PBAS", 2, 2, b"\xff")]))
    base += [b"", b"AB", b"ABIF", b"ABIX" + b"\x00" * 100, b"ABIF" + b"\x00" * 10, b"ABIF" + b"\x00" * 26, BF.abi_file([], )]
    allb = list(base)
    for b in base:
        for _ in range(8): allb.append(BF.mutate_bytes(b, rnd2))
    for fmt in ("abi", "abi-trim"):
        for b in allb: add({"kind": "parse", "format": fmt, "bytes": BF.lat(b)})
    for b in rnd2.sample(allb, 40): add({"kind": "read", "format": "abi", "bytes": BF.lat(b)})
    add({"kind": "parse", "format": "abi", "text": "ABIF"})
    for b in rnd2.sample(base[:35], 8): add({"kind": "convert", "format": "abi", "bytes": BF.lat(b), "out": "fastq", "molecule_type": None})


# ------------------------------------------------------------------ snapgene
def snap_packet(t, data): return bytes([t]) + struct.pack(">I", len(data)) + data

def snap_file(seq="ACGTACGTAC", circular=False, notes=None, features=None, primers=None, cookie=True, extra=()):
    out = b""
    if cookie: out += snap_packet(9, b"SnapGene" + struct.pack(">HHH", 1, 15, 15))
    if seq is not None: out += snap_packet(0, bytes([1 if circular else 0]) + seq.encode())
    for t, xml in ((6, notes), (10, features), (5, primers)):
        if xml is not None: out += snap_packet(t, xml.encode())
    for t, d in extra: out += snap_packet(t, d)
    return out

def snap_xml(rnd, n):
    notes = ("<Notes><Type>%s</Type><LastModified>%s</LastModified><AccessionNumber>%s</AccessionNumber><Comments>%s</Comments></Notes>" %
             (rnd.choice(["Synthetic", "Natural", ""]), rnd.choice(["2020.03.15", "2019.1.2", "2018.12.31", "2020.03.15", "2021.07.04", "2020.03.15", "bad", "2020.13.01", ""]), rnd.choice(["ACC123", ""]), rnd.choice(["pUC19 plasmid", "name <b>bold</b> rest", "single", ""])))
    feats = ["<Features>"]
    for _ in range(rnd.randint(0, 4)):
        a = rnd.randint(1, max(1, n)); b = rnd.randint(1, max(1, n))
        segs = "".join('<Segment range="%d-%d" name="%s" type="%s"/>' % ((lambda x, y: (min(x, y), max(x, y) + 1))(rnd.randint(1, max(1, n)), rnd.randint(1, max(1, n))) + (rnd.choice(["", "s1", "exon"]), rnd.choice(["standard"] * 6 + ["gap"]))) for _ in range(rnd.randint(1, 3)))
        quals = "".join('<Q name="%s">%s</Q>' % (rnd.choice(["note", "gene", "label", "codon_start"]), "".join(rnd.choice(['<V text="val one"/>', '<V predef="pre"/>', '<V int="%d"/>' % rnd.randint(1, 9), '<V text="multi\r\nline"/>', '<V other="x"/>']) for _ in range(rnd.randint(0, 3)))) for _ in range(rnd.randint(0, 2)))
        feats.append('<Feature name="%s" type="%s" directionality="%s">%s%s</Feature>' % (rnd.choice(["F1", "", "label"]), rnd.choice(["CDS", "misc_feature", "gene"]), rnd.choice(["0", "1", "2"]), segs, quals))
    feats.append("</Features>")
    prim = ['<Primers><HybridizationParams minContinuousMatchLen="%d" minMeltingTemperature="%d"/>' % (rnd.choice([0, 5, 10]), rnd.choice([0, 30, 60]))]
    for _ in range(rnd.randint(0, 3)):
        sites = "".join('<BindingSite location="%d-%d" boundStrand="%d" simplified="%d" annealedBases="%s" meltingTemperature="%d"/>' % (rnd.randint(1, max(1, n)), rnd.randint(1, max(1, n)), rnd.randint(0, 1), rnd.randint(0, 1), "A" * rnd.randint(0, 15), rnd.randint(20, 70)) for _ in range(rnd.randint(1, 3)))
        prim.append('<Primer name="%s">%s</Primer>' % (rnd.choice(["p1", "", "fwd"]), sites))
    prim.append("</Primers>")
    return notes, "".join(feats), "".join(prim)

def snapgene_cases():
    rnd2 = random.Random(76)
    base = []
    for _ in range(60):
        seq = rand_dna(rnd2, 1, 60)
        notes, feats, prim = snap_xml(rnd2, len(seq))
        base.append(snap_file(seq, rnd2.random() < .5, notes if rnd2.random() < .8 else None, feats if rnd2.random() < .8 else None, prim if rnd2.random() < .7 else None))
    base += [b"", snap_file(cookie=False), snap_file(seq=None), snap_file(seq=""), snap_file(extra=[(0, b"\x00ACGT")]), snap_file(extra=[(7, b"junk"), (200, b"")]), snap_file(notes="<Notes><Type>Synthetic</Type>"), snap_file(notes="not xml"),
             snap_file(features="<Features><Feature><Segment range='1-3'/></Feature></Features>"), snap_file(features="<Features><Feature><Segment/></Feature></Features>"), snap_file(features="<Features><Feature/></Features>"),
             snap_file(features='<Features><Feature><Segment range="3-3"/></Feature></Features>'), snap_file(features='<Features><Feature><Segment range="1-3"/><Q>x</Q></Feature></Features>'),
             snap_file(features='<Features><Feature><Segment range="9-2"/></Feature></Features>'), snap_file(features='<Features><Feature directionality="2"><Segment range="1-3" name="a"/><Segment range="5-7" name="b"/></Feature></Features>'),
             snap_file(notes="<Notes><Type><!-- c -->Synthetic</Type><Comments><![CDATA[cdata text]]></Comments><LastModified>2020.03.15x</LastModified></Notes>"),
             snap_file(primers='<Primers><Primer name="p"><BindingSite/></Primer></Primers>'), snap_file(primers='<Primers><Primer><BindingSite location="2-5" meltingTemperature="x"/></Primer></Primers>'),
             b"\x09\x00\x00\x00\x0eSnapGene\x00\x01\x00\x0f\x00\x0f", b"\x09\x00\x00\x00\x0eNotSnapG\x00\x01\x00\x0f\x00\x0f", b"\x09\x00\x00\x00"]
    allb = list(base)
    for b in base:
        for _ in range(5): allb.append(BF.mutate_bytes(b, rnd2))
    # structured mutations of the XML packets
    for _ in range(80):
        seq = rand_dna(rnd2, 5, 50)
        notes, feats, prim = snap_xml(rnd2, len(seq))
        allb.append(snap_file(seq, False, mutate_xml(notes, rnd2), mutate_xml(feats, rnd2), mutate_xml(prim, rnd2)))
    for b in allb: add({"kind": "parse", "format": "snapgene", "bytes": BF.lat(b)})
    for b in rnd2.sample(allb, 40): add({"kind": "read", "format": "snapgene", "bytes": BF.lat(b)})
    add({"kind": "parse", "format": "snapgene", "text": "abc"})
    for b in rnd2.sample(base[:60], 8): add({"kind": "convert", "format": "snapgene", "bytes": BF.lat(b), "out": "genbank", "molecule_type": None})


# ------------------------------------------------------------------ sff
def sff_record(rnd, i, nflows=8, uan=False):
    n = rnd.randint(1, 30)
    seq = "".join(rnd.choice("ACGTacgt") for _ in range(n))
    name = "".join(rnd.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(14)) if uan else rnd.choice(["read%d" % i, "r_%d" % i, "x"])
    clips = [rnd.randint(0, n) for _ in range(4)]
    ann = [["flow_values", LST(*[rnd.randint(0, 400) for _ in range(nflows)])], ["flow_index", LST(*[rnd.randint(0, 5) for _ in range(n)])], ["flow_chars", "TACG" * (nflows // 4)], ["flow_key", "TCAG"],
           ["clip_qual_left", clips[0]], ["clip_qual_right", clips[1]], ["clip_adapter_left", clips[2]], ["clip_adapter_right", clips[3]]]
    return REC(S(seq), name, name, "", annotations=ann + [["molecule_type", "DNA"]], letter=[["phred_quality", LST(*[rnd.randint(0, 60) for _ in range(n)])]])

def sff_bytes(records, index=True, xml=None):
    buf = io.BytesIO()
    w = SffIO.SffWriter(buf, index=index, xml=xml)
    w.write_file([dec(r) for r in records])
    return buf.getvalue()

def sff_cases():
    rnd2 = random.Random(77)
    base = []
    for k in range(40):
        recs = [sff_record(rnd2, i, nflows=rnd2.choice([4, 8, 12]), uan=rnd2.random() < .3) for i in range(rnd2.randint(1, 5))]
        nf = len(recs[0]["annotations"][0][1]["v"]); 
        recs = [dict(r, annotations=[a if a[0] != "flow_values" else ["flow_values", LST(*[rnd2.randint(0, 400) for _ in range(nf)])] for a in r["annotations"]]) for r in recs]
        for r in recs:      # same flow layout in every record of one file
            r["annotations"] = [a if a[0] not in ("flow_chars",) else ["flow_chars", recs[0]["annotations"][2][1]] for a in r["annotations"]]
        try: base.append(sff_bytes(recs, index=rnd2.random() < .6, xml=rnd2.choice([None, None, "<manifest/>"])))
        except Exception as e: pass
    base += [b"", b".sff", b".sff" + b"\x00" * 27, b".hsh" + b"\x00" * 27, b".srt" + b"\x00" * 27, b"xxxx" + b"\x00" * 27, b".sff\x00\x00\x00\x02" + b"\x00" * 23]
    allb = list(base)
    for b in base:
        for _ in range(7): allb.append(BF.mutate_bytes(b, rnd2))
    for fmt in ("sff", "sff-trim"):
        for b in allb: add({"kind": "parse", "format": fmt, "bytes": BF.lat(b)})
    for b in rnd2.sample(allb, 40): add({"kind": "read", "format": "sff", "bytes": BF.lat(b)})
    add({"kind": "parse", "format": "sff", "text": ".sff"})
    for b in rnd2.sample(base[:40], 10):
        for out in ("fasta", "fastq", "sff"): add({"kind": "convert", "format": "sff", "bytes": BF.lat(b), "out": out, "binary": "bytes" if out == "sff" else False, "molecule_type": None})
    # writer
    good = [sff_record(rnd2, i) for i in range(3)]
    def without(rec, key, where="annotations"):
        r = dict(rec); r[where] = [a for a in rec[where] if a[0] != key]; return r
    def setann(rec, key, value):
        r = dict(rec); r["annotations"] = [[k, value] if k == key else [k, v] for k, v in rec["annotations"]]; return r
    cases = [good, good[:1], [], [good[0], setann(good[1], "flow_key", "AAAA")], [good[0], setann(good[1], "flow_chars", "CCCCCCCC")], [good[0], without(good[1], "flow_key")], [good[0], without(good[1], "flow_values")]]
    for key in ("flow_key", "flow_chars", "flow_values", "flow_index", "clip_qual_left", "clip_qual_right", "clip_adapter_left", "clip_adapter_right"):
        cases.append([without(good[0], key)])
    for key in ("clip_qual_left", "clip_qual_right", "clip_adapter_left", "clip_adapter_right"): cases.append([setann(good[0], key, -1)]); cases.append([setann(good[0], key, 70000)])
    cases += [[dict(good[0], letter=[])], [dict(good[0], seq=U(5))], [dict(good[0], id="")], [dict(good[0], id="é")], [setann(good[0], "flow_values", LST(1, 2, 3))], [setann(good[0], "flow_values", LST(*[70000] * 8))], [setann(good[0], "flow_index", LST(300, *[1] * (len(good[0]["seq"]["v"]) - 1)))],
              [setann(good[0], "flow_key", 5)], [setann(good[0], "flow_chars", "é" * 8)], [dict(good[0], seq=S("ACGT"), letter=[["phred_quality", LST(1, 2, 3, 400)]])], [setann(good[0], "flow_key", "TCAGé")], [dict(good[0], id="x" * 300)]]
    for recs in cases:
        add({"kind": "write", "format": "sff", "binary": "bytes", "records": recs})
        add({"kind": "writer", "cls": "SffWriter", "binary": "bytes", "args": [False], "records": recs})
        add({"kind": "writer", "cls": "SffWriter", "binary": "bytes", "args": [True, "<custom xml/>"], "records": recs})
    for recs in cases[:2]: add({"kind": "format", "format": "sff", "record": recs[0]})
    add({"kind": "write", "format": "sff", "records": good})


# ------------------------------------------------------------------ alignment formats (via Bio.AlignIO)
def rand_alignment(rnd, alphabet="ACGT-", n=None, length=None, idfn=None):
    n = n or rnd.randint(1, 6); length = length if length is not None else rnd.randint(1, 130)
    recs = []
    for i in range(n):
        rid = idfn(i) if idfn else rnd.choice(["seq%d" % i, "s%d" % i, "Name_%d" % i, "a b%d" % i, "long_identifier_number_%d_x" % i, "x:%d" % i])
        recs.append(REC(S("".join(rnd.choice(alphabet) for _ in range(length))), rid, rid, rid))
    return recs

def align_text(recs, fmt):
    buf = io.StringIO()
    try: SeqIO.write([dec(r) for r in recs], buf, fmt); return buf.getvalue()
    except Exception: return None

def align_cases(fmt, hand=(), alphabet="ACGT-", idfn=None, extra_writer=()):
    rnd2 = random.Random(81 + sum(map(ord, fmt)))
    base = list(hand)
    for _ in range(70):
        t = align_text(rand_alignment(rnd2, alphabet, idfn=idfn), fmt)
        if t: base.append(t)
    base.append("".join(base[i] for i in range(min(3, len(base)))))
    base += ["", "\n", "\n\n", " ", "x", "1 1\n", " 1 1\n", " 2 4\na ACGT\nb ACGT\n"]
    allt = list(base)
    for t in base:
        for _ in range(6): allt.append(mutate_text(t, rnd2, junk=(" 2 5", "CLUSTAL", "# STOCKHOLM 1.0", "//", "#=GF AC x", ".", "-", "\t", "a b", "!!AA_MULTIPLE_ALIGNMENT 1.0", "#NEXUS")))
    for t in allt: add({"kind": "parse", "format": fmt, "text": t})
    for t in rnd2.sample(allt, 50): add({"kind": "read", "format": fmt, "text": t})
    add({"kind": "parse", "format": fmt, "bytes": "x"})
    # writing
    sets = [rand_alignment(rnd2, alphabet, idfn=idfn) for _ in range(40)]
    sets += [rand_alignment(rnd2, alphabet, n=1, length=1), rand_alignment(rnd2, alphabet, n=2, length=50), rand_alignment(rnd2, alphabet, n=2, length=51), rand_alignment(rnd2, alphabet, n=2, length=100), rand_alignment(rnd2, alphabet, n=3, length=10, idfn=lambda i: "dup"),
             rand_alignment(rnd2, alphabet, n=2, length=10, idfn=lambda i: ["abcdefghijk1", "abcdefghijk2"][i]), rand_alignment(rnd2, alphabet, n=2, length=10, idfn=lambda i: ["a(b)[c],d", "e:f;g"][i]), rand_alignment(rnd2, alphabet, n=2, length=10, idfn=lambda i: [" lead", "trail "][i]),
             rand_alignment(rnd2, alphabet, n=2, length=10, idfn=lambda i: ["with space", "tab\there"][i]), rand_alignment(rnd2, alphabet, n=1, length=10, idfn=lambda i: ""), [], [REC(S("ACGT"), "a", "a", "a"), REC(S("ACG"), "b", "b", "b")],
             [REC(S("AC.T"), "dots", "d", "d")], [REC(S(""), "empty", "e", "e")], [REC(U(4), "und", "u", "u")], [REC(None, "none", "n", "n")], [REC(S("ACGT"), "é", "e", "e")], [REC(S("ACGT"), "a\nb", "e", "e")], [REC(S("ACGT"), "x" * 40, "e", "e")]] + list(extra_writer)
    for recs in sets:
        add({"kind": "write", "format": fmt, "records": recs})
        if recs and rnd2.random() < .3: add({"kind": "format", "format": fmt, "record": recs[0]})
    for t in rnd2.sample(base[:70], 8):
        for out in ("fasta", fmt): add({"kind": "convert", "format": fmt, "text": t, "out": out, "molecule_type": None})
    add({"kind": "convert", "format": "fasta", "text": ">a\nACGT\n>b\nAC-T\n", "out": fmt, "molecule_type": None})

def phylip_cases(): align_cases("phylip")
def phylip_sequential_cases(): align_cases("phylip-sequential")
def phylip_relaxed_cases(): align_cases("phylip-relaxed")
def clustal_cases():
    hand = ["CLUSTAL X (1.81) multiple sequence alignment\n\n\nseq1      ACGT\nseq2      ACGA\n          ***:\n\n", "CLUSTAL W (1.83) multiple sequence alignment\n\n\nseq1 ACGT 4\nseq2 AC-A 3\n\n",
            "CLUSTAL 2.1 multiple sequence alignment\n\n\nseq1      ACGT\nseq2      ACGT\n\n\n", "MUSCLE (3.8) multiple sequence alignment\n\n\na   AC\nb   AC\n\n", "PROBCONS\n\n\na AC\nb AC\n\n", "Kalign ()\n\na AC\nb AC\n\n", "WRONG header\n\na AC\n", "CLUSTAL\n"]
    align_cases("clustal", hand)

EMBL_HAND = [
"""ID   AB000001; SV 1; linear; genomic DNA; STD; PLN; 60 BP.
XX
AC   AB000001;
XX
DE   Test EMBL record
DE   with a continuation.
XX
KW   test; example.
XX
OS   Arabidopsis thaliana
OC   Eukaryota; Viridiplantae; Streptophyta.
XX
RN   [1]
RP   1-60
RX   PUBMED; 12345.
RA   Smith J., Jones K.;
RT   "A title";
RL   J. Test 1:2-3(2000).
XX
DR   MD5; abcdef.
XX
CC   A comment line.
XX
FH   Key             Location/Qualifiers
FH
FT   source          1..60
FT                   /organism="Arabidopsis thaliana"
FT                   /mol_type="genomic DNA"
FT   CDS             join(1..20,30..50)
FT                   /gene="abc"
FT                   /translation="MKV
FT                   AAA"
XX
SQ   Sequence 60 BP; 15 A; 15 C; 15 G; 15 T; 0 other;
     acgtacgtac gtacgtacgt acgtacgtac gtacgtacgt acgtacgtac gtacgtacgt        60
//
""",
"""ID   X56734; SV 1; circular; mRNA; STD; PLN; 30 BP.
XX
AC   X56734; S46826;
DE   T.aestivum mRNA.
XX
FH   Key             Location/Qualifiers
FH
FT   CDS             <1..>30
FT                   /product="x"
XX
SQ   Sequence 30 BP;
     acgtacgtac gtacgtacgt acgtacgtac                                         30
//
""",
"ID   A00001; 1; ; DNA; ; STD; 10 BP.\nAC   A00001;\nDE   old style.\nSQ   Sequence 10 BP;\n     acgtacgtac        10\n//\n",
"ID   OLD1 standard; DNA; PLN; 12 BP.\nAC   OLD1;\nDE   old.\nSQ   Sequence 12 BP;\n     acgtacgtac gt        12\n//\n",
"ID   PAT1; SV 1; linear; unassigned DNA; PAT; HUM; 8 BP.\nAC   PAT1;\nDE   patent.\nSQ   Sequence 8 BP;\n     acgtacgt        8\n//\n",
"ID   KIPO1  standard; PRT; 8 AA.\nDE   protein.\nSQ   Sequence 8 AA;\n     mkvlaagi        8\n//\n",
"ID   CON1; SV 1; linear; genomic DNA; CON; BCT; 100 BP.\nAC   CON1;\nDE   contig.\nCO   join(AA000001.1:1..50,AA000002.1:1..50)\n//\n",
]
IMGT_HAND = [
"""ID   HLA00001; SV 1; standard; DNA; HUM; 40 BP.
XX
AC   HLA00001;
DE   HLA-A*01:01:01:01, Human MHC Class I.
XX
FH   Key                 Location/Qualifiers
FH
FT   source          1..40
FT                   /organism="Homo sapiens"
FT   CDS             1..>40
FT                   /gene="HLA-A"
XX
SQ   Sequence 40 BP;
     acgtacgtac gtacgtacgt acgtacgtac gtacgtacgt        40
//
""",
]
{"fasta": family_cases, "fastq": fastq_cases,
 "genbank": lambda: insdc_cases("genbank", GENBANK_HAND, "genbank-cds", "gb"),
 "embl": lambda: insdc_cases("embl", EMBL_HAND, "embl-cds", "embl"),
 "imgt": lambda: insdc_cases("imgt", IMGT_HAND, "embl-cds", "imgt", extra=EMBL_HAND),
 "insdcwrite": insdc_write_cases, "tab": tab_cases, "pir": pir_cases, "swiss": lambda: swiss_cases(), "phd": phd_cases, "seqxml": seqxml_cases, "nib": nib_cases, "abi": abi_cases, "phylip": phylip_cases, "phylip-sequential": phylip_sequential_cases, "phylip-relaxed": phylip_relaxed_cases, "clustal": clustal_cases, "sff": sff_cases, "snapgene": snapgene_cases, "twobit": twobit_cases, "gck": gck_cases, "xdna": xdna_cases, "ig": ig_cases}[FAMILY]()
json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(f"{len(cases)} cases, {sum('exc' in c for c in cases)} raise -> {os.path.relpath(OUT)} ({os.path.getsize(OUT)/1e6:.1f} MB)")
