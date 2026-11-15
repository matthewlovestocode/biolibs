"""Golden cases for Bio.PDB.PDBList -> packages/pdblist/test/golden/pdblist.json

Nothing here touches the network or leaves a file behind. `PDBList` downloads to disk, so each case
runs in a temporary directory with the module's `urlopen`, `urlretrieve` and `urlcleanup` replaced:
the stand-ins note the address asked for and serve fixed bytes, or fail as a missing file or a dropped
connection would. What is recorded is everything a port with no file system can still be held to: the
address each method builds, what it prints to stdout and stderr, the name of the file it would have
left and that file's contents, the lists it parses out of the status files, and the type and message
of whatever it raises.

Every case comes from fixed lists; nothing iterates a set.
"""
import contextlib, gzip, importlib, io, json, os, tempfile
from urllib.error import HTTPError, URLError

# `Bio.PDB` re-exports the class under the module's own name, so the module has to be asked for by path.
module = importlib.import_module("Bio.PDB.PDBList")
PDBList = module.PDBList

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "pdblist", "test", "golden", "pdblist.json")
CONTENT = b"data_TEST\n#\n_entry.id TEST\n"


def run(fn, replies):
    """Run `fn` with the network replaced. @returns What it asked for, printed, returned or raised.

    `replies` is consumed one per request: bytes to serve, or ("http", code, msg) / ("url", reason) to fail.
    """
    replies = list(replies)
    requests = []

    def answer(request):
        data = getattr(request, "data", None)
        url = request if isinstance(request, str) else request.full_url
        entry = {"url": url}
        if not isinstance(request, str):
            entry["data"] = None if data is None else data.decode("latin1")
            entry["headers"] = sorted([k, v] for k, v in request.headers.items())
        requests.append(entry)
        reply = replies.pop(0) if replies else b""
        if isinstance(reply, tuple):
            raise HTTPError(url, reply[1], reply[2], None, None) if reply[0] == "http" else URLError(reply[1])
        return reply

    def urlopen(request):
        return io.BytesIO(answer(request))

    def urlretrieve(url, filename):
        body = answer(url)
        with open(filename, "wb") as handle:
            handle.write(body)

    old = (module.urlopen, module.urlretrieve, module.urlcleanup)
    module.urlopen, module.urlretrieve, module.urlcleanup = urlopen, urlretrieve, lambda: None
    stdout, stderr = io.StringIO(), io.StringIO()
    cwd = os.getcwd()
    out = {}
    scratch = []
    with tempfile.TemporaryDirectory() as tmp:
        os.chdir(tmp)
        scratch.append(os.getcwd())
        try:
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                value = fn()
            # A method that downloads returns the path of the file it left. Record the file's name and
            # contents, which is what a port without a file system returns in its place.
            if isinstance(value, str):
                found = os.path.exists(value)
                value = {"name": os.path.basename(value), "data": open(value, "rb").read().decode("latin1") if found else None}
            out["value"] = value
        except Exception as e:
            out["exc"] = {"type": type(e).__name__, "msg": str(e)}
        finally:
            os.chdir(cwd)
            module.urlopen, module.urlretrieve, module.urlcleanup = old
    out.update({"requests": requests, "stdout": stdout.getvalue(), "stderr": stderr.getvalue()})
    # The one thing that differs between runs is the name of the temporary directory, which Python works
    # into its message when a download lands on a directory. Give it a fixed name.
    for key in ("stdout", "stderr"):
        out[key] = out[key].replace(scratch[0], "<dir>")
    if "exc" in out:
        out["exc"]["msg"] = out["exc"]["msg"].replace(scratch[0], "<dir>")
    return out


GZ = gzip.compress(CONTENT, mtime=0)
MISSING = ("http", 404, "Not Found")
DROPPED = ("url", "timed out")
SERVERS = [None, "https://example.org/mirror"]
cases = []


def add(kind, args, replies, verbose=True, server=None, **extra):
    """Run one method call and record it."""
    def call():
        pl = PDBList(verbose=verbose) if server is None else PDBList(server=server, verbose=verbose)
        if kind == "get_status_list":
            return PDBList.get_status_list(*args)
        if kind == "get_all_assemblies_twice":
            return [pl.get_all_assemblies(), pl.get_all_assemblies()]
        if kind == "get_seqres_file":
            # It returns nothing and leaves a file; hand back the file, so that its contents are recorded.
            pl.get_seqres_file(*args)
            return args[0] if args else "pdb_seqres.txt"
        return getattr(pl, kind)(*args)
    shown = [r if isinstance(r, tuple) else r.decode("latin1") for r in replies]
    cases.append({"kind": kind, "args": args, "replies": [list(r) if isinstance(r, tuple) else r for r in shown],
                  "verbose": verbose, "server": server, **extra, **run(call, replies)})


# ---------------------------------------------------------------------------- retrieve_pdb_file
CODES = ["1ABC", "1abc", "4HHB", "7xyz", "101M", "", "a", "ab", "abcde", "1AbC ", "pdb_00001abc"]
FORMATS = [None, "mmCif", "pdb", "xml", "mmtf", "bundle", "PDB", "mmcif", "cif", ""]
for code in CODES:
    for file_format in FORMATS:
        add("retrieve_pdb_file", [code, False, None, file_format], [GZ])
for file_format in FORMATS:
    add("retrieve_pdb_file", ["1ABC", True, None, file_format], [GZ])
    add("retrieve_pdb_file", ["1ABC", False, None, file_format], [GZ], verbose=False)
    add("retrieve_pdb_file", ["2XyZ", False, None, file_format], [GZ], server=SERVERS[1])
for reply in (MISSING, DROPPED, ("http", 500, "Internal Server Error"), ("url", "[Errno 8] nodename nor servname provided, or not known")):
    for verbose in (True, False):
        for file_format in (None, "pdb", "mmtf"):
            add("retrieve_pdb_file", ["1ABC", False, None, file_format], [reply], verbose=verbose)
# what comes back is whatever the archive holds, whole: several lines, no final newline, bytes, nothing
for body in (b"", b"one line", b"a\nb\n", b"\r\nx\r\n", bytes(range(256)), b"x" * 70000):
    add("retrieve_pdb_file", ["1ABC", False, None, "pdb"], [gzip.compress(body, mtime=0)])
# what the server sends is not always a gzip file: plain text, a file cut short, one with a damaged check
BROKEN = [b"plain text, not gzip", b"\x1f", b"\x1f\x8b", GZ[:-8], GZ[:-3], GZ[:15], GZ[:-8] + b"\x00" * 8, GZ + b"trailing", GZ + GZ]
for body in BROKEN:
    add("retrieve_pdb_file", ["1ABC", False, None, "pdb"], [body])
    add("retrieve_assembly_file", ["1ABC", 1, None, "pdb"], [body])

# ---------------------------------------------------------------------------- retrieve_assembly_file
for code in ("1ABC", "4hhb", "", "a"):
    for number in ("1", 1, " 2 ", "02", "x", 1.7, True, "1.0", "", "10"):
        for file_format in (None, "mmCif", "PDB", "pdb", "xml", "MMCIF", ""):
            if code != "1ABC" and file_format not in (None, "pdb"):
                continue
            add("retrieve_assembly_file", [code, number, None, file_format], [GZ])
for reply in (MISSING, DROPPED):
    for verbose in (True, False):
        for file_format in (None, "pdb"):
            add("retrieve_assembly_file", ["1ABC", "1", None, file_format], [reply], verbose=verbose)
add("retrieve_assembly_file", ["1ABC", 3, None, "pdb"], [GZ], server=SERVERS[1])

# ---------------------------------------------------------------------------- the lists
LISTS = [b"1abc\n2xyz\n101m\n", b"1abc\r\n2xyz\r\n", b"1abc", b"", b"  1abc  \n", b"1abc\n\n2xyz\n", b"1abc\nabcde\n", b"12\n",
         b"1ABC\n", b"\xff\xfe\xfd\xfc\n", b"1ab\xc3\xa9\n", b"1abc\n2xyz"]
for body in LISTS:
    add("get_status_list", ["https://files.wwpdb.org/pub/pdb/data/status/latest/added.pdb"], [body])
add("get_status_list", ["https://example.org/x"], [MISSING])
for server in SERVERS:
    add("get_recent_changes", [], [b"1abc\n2xyz\n", b"3def\n", b""], server=server)
add("get_recent_changes", [], [b"1abc\n", MISSING, b"9zzz\n"])
add("get_recent_changes", [], [b"1abc\n", b"toolong\n", b"9zzz\n"])

ENTRIES = [b"IDCODE, HEADER, ACCESSION DATE, COMPOUND, SOURCE, AUTHOR LIST, RESOLUTION, EXPERIMENT TYPE (IF NOT X-RAY)\n"
           b"------- ------- --------------- --------- --------- ----------- ---------- ---------------------------\n"
           b"100D\tDNA-RNA HYBRID\t12/05/94\tCRYSTAL STRUCTURE\t\tBan, C.\t1.9\tX-RAY DIFFRACTION\n"
           b"101D\tDNA\t12/14/94\tREFINEMENT\t\tGoodsell, D.S.\t2.25\tX-RAY DIFFRACTION\n"
           b"abc\n1ABC\n\n12345 tail\n", b"", b"one\ntwo\n", b"h\nh\n1abc x\n2xy\n3defg\n\xff\xfe\xfd\xfc\xfb\n", b"h\nh\n1abc"]
for body in ENTRIES:
    for verbose in (True, False):
        add("get_all_entries", [], [body], verbose=verbose)
add("get_all_entries", [], [b"h\nh\n1abc x\n"], server=SERVERS[1])
add("get_all_entries", [], [MISSING])

OBSOLETE = [b" LIST OF OBSOLETE COORDINATE ENTRIES AND SUCCESSORS\n"
            b"OBSLTE    31-JUL-94 116L     216L\nOBSLTE    29-JAN-96 1HFT     2HFT\nOBSLTE    21-SEP-06 1HLP     2HLP 2JKL\n"
            b"OBSLTE    21-NOV-03 1Q9Q\nnot a record\n", b"", b"OBSLTE \n", b"OBSLTE    31-JUL-94\n", b"OBSLTE    31-JUL-94 TOOLONG  216L\n",
            b"OBSLTE x y 116L z\n", b"obslte    31-JUL-94 116L\nOBSLTE\t31-JUL-94 116L\n", b"OBSLTE  a b \xff\xfe\xfd\xfc\n"]
for body in OBSOLETE:
    add("get_all_obsolete", [], [body])
add("get_all_obsolete", [], [OBSOLETE[0]], server=SERVERS[1])
add("get_all_obsolete", [], [DROPPED])

RESULTS = [{"result_set": [{"identifier": "100D-1"}, {"identifier": "4HHB-2", "score": 1.0}, {"identifier": "1ABC"},
                           {"identifier": "pdb_0000-1abc-12"}, {"identifier": ""}]},
           {"result_set": []}, {"total_count": 0}, {"result_set": [{"id": "1ABC-1"}]}, {"result_set": [{"identifier": "É-1"}]}]
for result in RESULTS:
    for verbose in (True, False):
        add("get_all_assemblies", [], [json.dumps(result).encode()], verbose=verbose)
        add("get_all_assemblies_twice", [], [json.dumps(result).encode(), b'{"result_set": [{"identifier": "9ZZZ-9"}]}'], verbose=verbose)
add("get_all_assemblies", [], [b"not json"])
add("get_all_assemblies", [], [MISSING])
add("get_all_assemblies", ["mmcif"], [json.dumps(RESULTS[0]).encode()])

for verbose in (True, False):
    for server in SERVERS:
        add("get_seqres_file", [], [b">101m_A mol:protein length:154  MYOGLOBIN\nMVLSEGEWQLV\n"], verbose=verbose, server=server)
add("get_seqres_file", ["elsewhere.txt"], [b"x"])
add("get_seqres_file", [], [MISSING])

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"content": CONTENT.decode(), "gz": GZ.decode("latin1"), "cases": cases}, open(OUT, "w"), indent=0)
kinds = {}
for c in cases:
    kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
print(len(cases), "cases:", ", ".join(f"{n} {k}" for k, n in kinds.items()), ";", sum("exc" in c for c in cases), "raise ->", os.path.relpath(OUT))
