"""Golden cases for Bio.Blast.qblast -> packages/blast/test/golden/blast.json

Nothing here touches the network. What a client for NCBI's BLAST has to get right is the two requests
it sends, the ticket it reads out of the "please wait" page, and how long it waits between looks, and
all of that can be recorded with the last step replaced:

* `qblast` is run with `urlopen` swapped for something that hands the request back and then answers
  with a scripted page, so each case records the Put body, the Get body, and the warning Biopython
  gives for the short-query workaround;
* `_parse_qblast_ref_page` is run directly against the wait page and against every error layout it
  knows, because the public function cannot reach them all;
* the clock and `sleep` are scripted, so the cases record the gaps the polling leaves.

Every case is built from fixed lists; nothing iterates a set.
"""
import io, json, os, warnings

from Bio import Blast

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "blast", "test", "golden", "blast.json")
WAIT_PAGE = "<html><!--\n    QBlastInfoBegin\n    RID = ABC123XYZ\n    RTOE = 27\n    QBlastInfoEnd\n--></html>\n"
XML = '<?xml version="1.0"?>\n<BlastOutput></BlastOutput>\n'
# Each format's results begin differently, and qblast asserts on it, so each case is answered with a
# page that format would really begin with.
BEGINS = {"XML": XML, "HTML": "<!DOCTYPE html >\n<html></html>\n",
          "Text": "<p><!--\nQBlastInfoBegin\n-->\n", "Tabular": "<p><!--\nQBlastInfoBegin\n-->\n",
          "XML2": "PK\x03\x04zipped", "JSON2": "PK\x03\x04zipped"}


class Reply(io.BytesIO):
    """What urlopen gives back: readable once, and peekable as the polling loop wants."""
    def peek(self, n=0):
        here = self.tell()
        data = self.read()
        self.seek(here)
        return data


def run(search, pages=None):
    """Run qblast against scripted pages. Returns the requests it made and anything it said."""
    if pages is None:
        pages = (WAIT_PAGE, BEGINS[search.get("format_type", "XML")])
    sent, slept, answers = [], [], list(pages)
    clock = [1000.0]

    def urlopen(request, *a, **k):
        sent.append({"url": request.full_url, "method": request.get_method(),
                     "body": request.data.decode(), "headers": dict(request.headers)})
        return Reply(answers.pop(0).encode())

    class Clock:
        def time(self):
            return clock[0]
        def sleep(self, seconds):
            slept.append(round(seconds, 6))
            clock[0] += seconds

    was_open, was_time, was_prev = Blast.urlopen, Blast.time, Blast.qblast.previous
    Blast.urlopen, Blast.time, Blast.qblast.previous = urlopen, Clock(), 0
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            Blast.qblast(**search)
            said = [str(w.message) for w in caught]
    finally:
        Blast.urlopen, Blast.time, Blast.qblast.previous = was_open, was_time, was_prev
    return {"sent": sent, "slept": slept, "warnings": said}


SEARCHES = [
    {"program": "blastn", "database": "nt", "sequence": "ACGTACGTACGT"},
    {"program": "blastp", "database": "nr", "sequence": "MKVLILACLVALALARELEELNVPGEIVE"},
    {"program": "blastx", "database": "nr", "sequence": "ACGT", "expect": 1e-5, "hitlist_size": 10},
    {"program": "tblastn", "database": "nt", "sequence": "MKVL", "matrix_name": "BLOSUM80", "filter": "none"},
    {"program": "tblastx", "database": "nt", "sequence": "ACGTACGT", "entrez_query": "Homo sapiens[orgn]"},
    {"program": "blastn", "database": "nt", "sequence": "ACGTACGTAC", "megablast": "TRUE", "word_size": 28},
    {"program": "blastn", "database": "nt", "sequence": "ACGT", "short_query": "TRUE"},
    {"program": "blastn", "database": "nt", "sequence": "A" * 40, "short_query": "TRUE"},
    {"program": "blastp", "database": "nr", "sequence": "MKVL", "format_type": "Tabular", "alignments": 5, "descriptions": 5},
    {"program": "blastp", "database": "swissprot", "sequence": "MKVL", "url_base": "https://blast.example/Blast.cgi"},
    {"program": "blastn", "database": "nt", "sequence": "ACGT with spaces & symbols=1", "gapcosts": "11 1"},
    {"program": "blastp", "database": "nr", "sequence": "MKVL", "service": "psi", "threshold": 11, "i_thresh": 0.002},
]

ERROR_PAGES = [
    WAIT_PAGE,
    "    RID = XYZ\n    RTOE = 3\n",
    '<div class="error msInf">Message ID#24 Error: Failed to read the Blast query</div>',
    '<p class="error">Message ID#32 Error: Query contains no data</p>',
    "Some preamble Message ID#99 Error: something went wrong<br/>",
    "<html>nothing useful at all</html>",
    "    RID = ONLYRID\n",
    "    RTOE = 9\n",
]

cases = {"searches": [], "refpages": [], "programs": []}

for search in SEARCHES:
    try:
        cases["searches"].append({"search": search, **run(dict(search))})
    except Exception as error:               # noqa: BLE001 - recording what Biopython raises is the point
        cases["searches"].append({"search": search, "error": {"type": type(error).__name__, "message": str(error)}})

for page in ERROR_PAGES:
    try:
        rid, rtoe = Blast._parse_qblast_ref_page(io.BytesIO(page.encode()))
        cases["refpages"].append({"page": page, "rid": rid, "rtoe": rtoe})
    except Exception as error:               # noqa: BLE001
        cases["refpages"].append({"page": page, "error": {"type": type(error).__name__, "message": str(error)}})

for program in ["blastn", "BLASTN", "blast", "", "megablast", "blastp"]:
    try:
        run({"program": program, "database": "nt", "sequence": "ACGT"})
        cases["programs"].append({"program": program, "ok": True})
    except Exception as error:               # noqa: BLE001
        cases["programs"].append({"program": program, "error": {"type": type(error).__name__, "message": str(error)}})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as out:
    json.dump(cases, out, indent=1, sort_keys=True)
print(f"{len(cases['searches'])} searches, {len(cases['refpages'])} wait pages, {len(cases['programs'])} programs")
