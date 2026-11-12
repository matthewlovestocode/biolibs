"""Golden cases for Bio.SeqIO (text formats).

Output: packages/seqio/test/golden/seqio-<family>.json   (family given on the command line; default: fasta)
Case kinds: parse, read, write, writer, format, to_dict, convert, simple_parser.
A parse case records the records yielded before any error, then the error.
"""
import io, json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
import Bio
from Bio import SeqIO
from Bio.SeqIO import FastaIO
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

WRITERS = {"FastaWriter": FastaIO.FastaWriter, "FastaTwoLineWriter": FastaIO.FastaTwoLineWriter}

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

family_cases()
json.dump({"biopython": Bio.__version__, "cases": cases}, open(OUT, "w"), separators=(",", ":"))
print(f"{len(cases)} cases, {sum('exc' in c for c in cases)} raise -> {os.path.relpath(OUT)} ({os.path.getsize(OUT)/1e6:.1f} MB)")
