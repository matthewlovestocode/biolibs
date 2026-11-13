"""Golden cases for Bio.Phylo.PhyloXML / PhyloXMLIO -> packages/phylo/test/golden/phyloxml.json

Documents are generated (valid, hand-picked odd, and mutated/malformed); each is read, parsed incrementally, written and round-tripped.
"""
import io, json, os, random, sys, warnings
sys.path.insert(0, os.path.dirname(__file__))
from Bio import Phylo
from Bio.Phylo import PhyloXML as PX, PhyloXMLIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from Bio.SeqFeature import SeqFeature, SimpleLocation
from phylo_codec import enc_px, enc_tree, tname, emsg

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "phylo", "test", "golden", "phyloxml.json")
rnd = random.Random(2024)

# ---------------------------------------------------------------- running
def catch(fn):
    """Run fn, returning {"result"|"exc", "warnings"}."""
    out = {}
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try: out["result"] = fn()
        except BaseException as e: out["exc"] = {"type": tname(e), "msg": emsg(e)}
    out["warnings"] = [[x.category.__name__, str(x.message)] for x in w]
    return out

def collect(gen):
    items = []
    try:
        for t in gen: items.append(enc_px(t))
    except BaseException as e:
        return {"items": items, "exc": {"type": tname(e), "msg": emsg(e)}}
    return {"items": items}

def write_text(obj, **kw):
    s = io.StringIO()
    n = PhyloXMLIO.write(obj, s, **kw)
    return [n, s.getvalue()]

def phylo_write(obj, **kw):
    s = io.StringIO()
    n = Phylo.write(obj, s, "phyloxml", **kw)
    return [n, s.getvalue()]

def run(c):
    fn = c["fn"]
    if fn == "read": return catch(lambda: enc_px(PhyloXMLIO.read(io.StringIO(c["xml"]))))
    if fn == "parse":
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            try: r = collect(PhyloXMLIO.parse(io.StringIO(c["xml"])))
            except BaseException as e: r = {"items": [], "exc": {"type": tname(e), "msg": emsg(e)}}
        r["warnings"] = [[x.category.__name__, str(x.message)] for x in w]
        return r
    if fn == "phylo_read": return catch(lambda: enc_px(Phylo.read(io.StringIO(c["xml"]), "phyloxml")))
    if fn == "roundtrip": return catch(lambda: write_text(PhyloXMLIO.read(io.StringIO(c["xml"])), **c.get("kwargs", {})))
    if fn == "phylo_roundtrip": return catch(lambda: phylo_write(list(Phylo.parse(io.StringIO(c["xml"]), "phyloxml")), **c.get("kwargs", {})))
    if fn == "convert":
        def go():
            trees = list(Phylo.parse(io.StringIO(c["text"]), c["fmt"]))
            if c.get("single"): trees = trees[0]
            if c.get("clade"): trees = trees.root
            return phylo_write(trees, **c.get("kwargs", {}))
        return catch(go)
    if fn == "write_direct":
        def go():
            trees = list(Phylo.parse(io.StringIO(c["text"]), c["fmt"]))
            return write_text(trees[0] if c.get("single") else trees)
        return catch(go)
    if fn == "as_phyloxml":
        def go():
            t = Phylo.read(io.StringIO(c["text"]), c["fmt"])
            p = t.as_phyloxml(**c.get("kwargs", {}))
            return enc_px(p)
        return catch(go)
    if fn == "ops": return catch(lambda: run_ops(c))
    if fn == "ctor": return catch(lambda: enc_px(eval(c["expr"], {"PX": PX, "SeqRecord": SeqRecord, "Seq": Seq, "SeqFeature": SeqFeature, "SimpleLocation": SimpleLocation})))
    raise SystemExit("unknown fn " + fn)

def run_ops(c):
    """Apply Python statements to `ph` (first phylogeny of xml), `root`, `px` and record the encoded results of the expressions."""
    px = PhyloXMLIO.read(io.StringIO(c["xml"]))
    ph = px.phylogenies[0]
    root = ph.root
    def tryit(fn, *a):
        try: return fn(*a)
        except BaseException as e: return {"EXC": tname(e)}
    env = {"px": px, "ph": ph, "root": root, "PX": PX, "Phylo": Phylo, "tryit": tryit}
    results = []
    for step in c["steps"]:
        try:
            if step["kind"] == "exec": exec(step["py"], env); results.append(None)
            else: results.append({"v": enc_px(eval(step["py"], env))})
        except BaseException as e:
            results.append({"exc": {"type": tname(e), "msg": emsg(e)}})
    return results

# ---------------------------------------------------------------- document generator
WORDS = ["alpha", "beta", "gamma", "delta", "kinase", "Homo sapiens", "x1", "sp|P12345", "cell cycle", "a  b\tc", " padded ", "node"]
def txt(): return rnd.choice(WORDS)
def esc(s): return s.replace("&", "&amp;").replace("<", "&lt;")
def num(): return rnd.choice(["0.5", "1", "2.25", "1e-05", "100", "0", "-0.125", "3.0", "7.0E-26", "0.9"])
def el(tag, text=None, attrs=None, children=""):
    a = "".join(' %s="%s"' % (k, esc(v).replace('"', "&quot;")) for k, v in (attrs or {}).items() if v is not None)
    if text is None and not children: return "<%s%s/>" % (tag, a)
    return "<%s%s>%s%s</%s>" % (tag, a, esc(text) if text is not None else "", children, tag)
def maybe(p=0.5): return rnd.random() < p
def nl(s): return "\n" + s if maybe(0.4) else s

def confidence(): return el("confidence", num(), {"type": rnd.choice(["bootstrap", "probability", None])})
def prop(): return el("property", rnd.choice(["8200", "x", "true"]), {"ref": rnd.choice(["NOAA:depth", "AU:km", "bad ref"]), "unit": rnd.choice([None, "METRIC:m"]), "datatype": rnd.choice(["xsd:integer", "xsd:string", "xsd:odd"]), "applies_to": rnd.choice(["clade", "node", "other_x"]), "id_ref": rnd.choice([None, "c1"])})
def uri(): return el("uri", rnd.choice(["http://example.org/a", "https://x.y/z?q=1&r=2"]), {"desc": rnd.choice([None, "a   link", "d"]), "type": rnd.choice([None, "image"])})
def date(): return el("date", None, {"unit": rnd.choice([None, "mya"])}, "".join(x for x in [el("desc", txt()) if maybe() else "", el("value", num()) if maybe(.7) else "", el("minimum", num()) if maybe(.4) else "", el("maximum", num()) if maybe(.4) else ""]))
def point(): return el("point", None, {"geodetic_datum": rnd.choice(["WGS84", "EPSG:4326"]), "alt_unit": rnd.choice([None, "m"])}, el("lat", num()) + el("long", num()) + (el("alt", num()) if maybe() else ""))
def distribution(): return el("distribution", None, None, (el("desc", txt()) if maybe() else "") + "".join(point() for _ in range(rnd.randint(0, 2))) + "".join(el("polygon", None, None, "".join(point() for _ in range(3))) for _ in range(rnd.randint(0, 2))))
def events(): return el("events", None, None, "".join(x for x in [el("type", rnd.choice(["speciation_or_duplication", "fusion", "bogus"])) if maybe() else "", el("duplications", rnd.choice(["1", "2", "3", "4", "x"])) if maybe() else "", el("speciations", "3") if maybe() else "", el("losses", "0") if maybe() else "", confidence() if maybe(.3) else ""]))
def binary_chars(): return el("binary_characters", None, {"type": rnd.choice([None, "parsimony_inferred"]), "gained_count": rnd.choice([None, "1", "z"]), "lost_count": rnd.choice([None, "2"]), "present_count": rnd.choice([None, "3"]), "absent_count": rnd.choice([None, "4"])}, "".join(el(k, None, None, "".join(el("bc", w) for w in rnd.sample(["a", "b", "c", "d"], rnd.randint(0, 3)))) for k in ("gained", "lost", "present", "absent") if maybe(.6)))
def color(): return el("color", None, None, "".join(el(k, str(rnd.choice([0, 17, 128, 255]))) for k in ("red", "green", "blue")))
def reference(): return el("reference", None, {"doi": rnd.choice(["10.1093/bioinformatics/btm619", "bad doi", None])}, el("desc", txt()) if maybe() else "")
def taxonomy(): return el("taxonomy", None, {"id_source": rnd.choice([None, "t1"])}, "".join(x for x in [
    el("id", rnd.choice(["9606", "x"]), {"provider": rnd.choice([None, "ncbi"]), "type": rnd.choice([None, "ncbi_taxonomy"])}) if maybe() else "",
    el("code", rnd.choice(["HUMAN", "x", "TOOLONGCODE123"])) if maybe() else "", el("scientific_name", txt()) if maybe(.7) else "", el("authority", "L., 1758") if maybe(.3) else "",
    "".join(el("common_name", txt()) for _ in range(rnd.randint(0, 2))), "".join(el("synonym", txt()) for _ in range(rnd.randint(0, 2))),
    el("rank", rnd.choice(["species", "genus", "weird"])) if maybe() else "", uri() if maybe(.3) else "", foreign() if maybe(.2) else ""]))
def annotation(): return el("annotation", None, {"ref": rnd.choice(["EC:1.1.1.1", "bad ref"]), "source": rnd.choice([None, "S"]), "evidence": rnd.choice([None, "experimental"]), "type": rnd.choice([None, "function"])}, "".join(x for x in [el("desc", txt()) if maybe() else "", confidence() if maybe(.4) else "", prop() if maybe(.4) else "", uri() if maybe(.3) else ""]))
def domain_arch(): return el("domain_architecture", None, {"length": rnd.choice(["124", "50"])}, "".join(el("domain", rnd.choice(["SH2", "Kinase"]), {"from": str(rnd.randint(1, 20)), "to": str(rnd.randint(21, 120)), "confidence": rnd.choice([None, "7.0E-26", "0.5"]), "id": rnd.choice([None, "d1"])}) for _ in range(rnd.randint(0, 3))))
def sequence(): return el("sequence", None, {"type": rnd.choice([None, "protein", "dna", "bogus"]), "id_ref": rnd.choice([None, "r1"]), "id_source": rnd.choice([None, "s1"])}, "".join(x for x in [
    el("symbol", rnd.choice(["act", "tooooolongsymbol", "a b"])) if maybe() else "", el("accession", rnd.choice(["P12345", "AB1"]), {"source": rnd.choice([None, "UniProtKB"])}) if maybe() else "",
    el("name", txt()) if maybe() else "", el("location", "chr1") if maybe(.3) else "", el("mol_seq", rnd.choice(["ACGT-A", "MKV", "bad seq 1"]), {"is_aligned": rnd.choice([None, "true", "false", "1"])}) if maybe() else "",
    uri() if maybe(.3) else "", "".join(annotation() for _ in range(rnd.randint(0, 2))), domain_arch() if maybe(.4) else "", foreign() if maybe(.2) else ""]))
def foreign(): return rnd.choice([
    '<ex:thing xmlns:ex="http://example.org/ex" a="1" ex:b="2">hello <ex:inner>x</ex:inner></ex:thing>', '<ex:empty xmlns:ex="http://example.org/ex"/>',
    '<ex:wrap xmlns:ex="http://example.org/ex"><ex:a>1</ex:a><ex:b>2</ex:b></ex:wrap>'])

def clade(depth=0, maxdepth=2):
    parts = []
    if maybe(.8): parts.append(el("name", txt()))
    if maybe(.6): parts.append(el("branch_length", num()))
    for _ in range(rnd.choice([0, 0, 1, 1, 2])): parts.append(confidence())
    if maybe(.2): parts.append(el("width", num()))
    if maybe(.2): parts.append(color())
    if maybe(.2): parts.append(el("node_id", "n%d" % rnd.randint(1, 9), {"provider": rnd.choice([None, "p"])}))
    for _ in range(rnd.choice([0, 0, 0, 1])): parts.append(taxonomy())
    for _ in range(rnd.choice([0, 0, 0, 1])): parts.append(sequence())
    if maybe(.2): parts.append(events())
    if maybe(.15): parts.append(binary_chars())
    if maybe(.15): parts.append(distribution())
    if maybe(.15): parts.append(date())
    if maybe(.15): parts.append(reference())
    if maybe(.15): parts.append(prop())
    if maybe(.03): parts.append(foreign())
    if depth < maxdepth:
        for _ in range(rnd.choice([0, 0, 2]) if depth else 2): parts.append(clade(depth + 1, maxdepth))
    if maybe(.3): rnd.shuffle(parts)
    has_bl = any(p.startswith("<branch_length") for p in parts)
    return el("clade", None, {"id_source": rnd.choice([None, None, "c1"]), "branch_length": None if has_bl else rnd.choice([None, None, "0.75"])}, "".join(nl(p) for p in parts))

def phylogeny():
    parts = []
    if maybe(.7): parts.append(el("name", txt()))
    if maybe(.4): parts.append(el("id", "tree%d" % rnd.randint(1, 9), {"provider": rnd.choice([None, "tol"])}))
    if maybe(.4): parts.append(el("description", txt()))
    if maybe(.08): parts.append(date())
    for _ in range(rnd.choice([0, 0, 1])): parts.append(confidence())
    parts.append(clade())
    if maybe(.2): parts.append(el("clade_relation", None, {"id_ref_0": "c1", "id_ref_1": "c2", "distance": rnd.choice([None, "1.5"]), "type": "orthology"}, confidence() if maybe() else ""))
    if maybe(.2): parts.append(el("sequence_relation", None, {"id_ref_0": "s1", "id_ref_1": "s2", "distance": rnd.choice([None, "0.25", "x"]), "type": rnd.choice(["orthology", "weird"])}, confidence() if maybe() else ""))
    if maybe(.2): parts.append(prop())
    if maybe(.15): parts.append(foreign())
    return el("phylogeny", None, {"rooted": rnd.choice(["true", "false", "1", "0"]), "rerootable": rnd.choice([None, "true", "false"]), "branch_length_unit": rnd.choice([None, "subs"]), "type": rnd.choice([None, "gene tree"])}, "".join(nl(p) for p in parts))

NS = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.phyloxml.org http://www.phyloxml.org/1.10/phyloxml.xsd" xmlns="http://www.phyloxml.org"'
def document(nph=None):
    nph = rnd.choice([1, 1, 1, 2]) if nph is None else nph
    body = "\n".join(phylogeny() for _ in range(nph))
    if maybe(.2): body += "\n" + foreign()
    if maybe(.1): body = foreign() + "\n" + body
    return '<?xml version="1.0" encoding="UTF-8"?>\n<phyloxml %s>\n%s\n</phyloxml>\n' % (NS, body)

def mutate(doc):
    kind = rnd.choice(["truncate", "dropclose", "badtag", "dupbl", "noattrs", "swap", "twoclades", "nonamespace", "badattr", "emptydoc", "dropchar"])
    if kind == "truncate": return doc[:rnd.randint(1, len(doc) - 1)]
    if kind == "dropclose":
        i = doc.rfind("</clade>"); return doc[:i] + doc[i + 8:] if i >= 0 else doc
    if kind == "badtag": return doc.replace("<name>", "<nom>", 1).replace("</name>", "</nom>", 1)
    if kind == "dupbl": return doc.replace("<clade", '<clade branch_length="1"', 1).replace("<name>", "<branch_length>2</branch_length><name>", 1)
    if kind == "noattrs": return doc.replace(' xmlns="http://www.phyloxml.org"', "")
    if kind == "swap": return doc.replace("<phylogeny", '<phylogeny rooted="maybe"', 1) if "<phylogeny rooted" not in doc else doc.replace('rooted="true"', 'rooted="maybe"')
    if kind == "twoclades": return doc.replace("</phylogeny>", "<clade><name>extra</name></clade></phylogeny>", 1)
    if kind == "nonamespace": return doc.replace("<name>", "<ex:name xmlns:ex='http://e.org'>", 1).replace("</name>", "</ex:name>", 1)
    if kind == "badattr": return doc.replace("<clade", '<clade zzz="1"', 1)
    if kind == "emptydoc": return rnd.choice(["", "   ", '<?xml version="1.0"?>', "<phyloxml/>", '<phyloxml xmlns="http://www.phyloxml.org"/>', "<a><b></a>"])
    i = rnd.randint(0, len(doc) - 1); return doc[:i] + doc[i + 1:]

# ---------------------------------------------------------------- cases
cases = []
FIXED = [
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny rooted="true"><clade><name>A</name><branch_length>0.1</branch_length></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny rooted="true"><name>  two   words </name><description>d</description><clade><clade><name>x</name></clade><clade><name>y</name><confidence type="bootstrap">90</confidence></clade></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"/>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade/></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny rooted="false" rerootable="true" branch_length_unit="s" type="t"><clade branch_length="2"/></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><confidence>x</confidence></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><width>2</width><branch_length>3</branch_length><color><red>1</red><green>2</green><blue>3</blue></color></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><color><red>1</red></color></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><node_id/></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><sequence><accession/></sequence></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org" a="1" xmlns:q="http://q" q:b="2"><phylogeny><clade/></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><name>café über</name></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><taxonomy><scientific_name>a &amp; b &lt; c</scientific_name></taxonomy></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><sequence><domain_architecture length="10"><domain from="1" to="5">D</domain></domain_architecture></sequence></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><sequence><domain_architecture><domain from="1" to="5">D</domain></domain_architecture></sequence></clade></phylogeny></phyloxml>',
    '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade><events><type>fusion</type></events><binary_characters/></clade></phylogeny></phyloxml>',
]
docs = list(FIXED)
for _ in range(90): docs.append(document())
for _ in range(60): docs.append(mutate(document(rnd.choice([1, 2]))))
for _ in range(10): docs.append(document(1).replace("\n", "\r\n"))
for d in docs:
    cases.append({"fn": "read", "xml": d})
    cases.append({"fn": "parse", "xml": d})
    if maybe(.4): cases.append({"fn": "phylo_read", "xml": d})
    cases.append({"fn": "roundtrip", "xml": d})
    if maybe(.25): cases.append({"fn": "roundtrip", "xml": d, "kwargs": {"indent": False}})
    if maybe(.3): cases.append({"fn": "phylo_roundtrip", "xml": d})

# conversion of other formats
def rand_newick(n, support=True, bl=True):
    names = ["T%d" % i for i in range(1, n + 1)]
    def build(ids):
        if len(ids) == 1: return ids[0] + (":%s" % rnd.choice(["0.5", "1", "0.25", "2"]) if bl else "")
        cut = rnd.randint(1, len(ids) - 1)
        s = "(" + build(ids[:cut]) + "," + build(ids[cut:]) + ")"
        if support and maybe(.6): s += rnd.choice(["90", "0.95", "100", "1.0"])
        return s + (":%s" % rnd.choice(["0.5", "1", "0.125"]) if bl else "")
    return build(names) + ";"
for _ in range(40):
    text = "\n".join(rand_newick(rnd.randint(2, 7), bl=maybe(.8)) for _ in range(rnd.randint(1, 3)))
    cases.append({"fn": "convert", "text": text, "fmt": "newick"})
    cases.append({"fn": "convert", "text": text, "fmt": "newick", "single": True})
    cases.append({"fn": "convert", "text": text, "fmt": "newick", "clade": True, "single": True})
    cases.append({"fn": "write_direct", "text": text, "fmt": "newick"})
    cases.append({"fn": "write_direct", "text": text, "fmt": "newick", "single": True})
    cases.append({"fn": "as_phyloxml", "text": text.split("\n")[0], "fmt": "newick"})
    cases.append({"fn": "as_phyloxml", "text": text.split("\n")[0], "fmt": "newick", "kwargs": {"rerootable": True, "branch_length_unit": "x"}})
cases.append({"fn": "convert", "text": "((A:1,B:1)90:1,C:2);", "fmt": "newick", "kwargs": {"indent": False}})
cases.append({"fn": "convert", "text": "(A:1,B:1);", "fmt": "newick", "kwargs": {"bogus": 1}})
cases.append({"fn": "convert", "text": "(A,B);", "fmt": "newick", "clade": True, "single": True})

# constructors and _check_str warnings: (python, typescript) expression pairs
CTORS = [
    ("PX.Annotation(ref='EC:1.1.1.1')", "new PX.Annotation({ref:'EC:1.1.1.1'})"), ("PX.Annotation(ref='bad')", "new PX.Annotation({ref:'bad'})"),
    ("PX.Events(type='fusion')", "new PX.Events({type:'fusion'})"), ("PX.Events(type='nope')", "new PX.Events({type:'nope'})"),
    ("PX.Property('1', 'a:b', 'clade', 'xsd:int')", "new PX.Property('1','a:b','clade','xsd:int')"), ("PX.Property('1', 'ab', 'x', 'int', unit='u')", "new PX.Property('1','ab','x','int','u')"),
    ("PX.Sequence(type='dna', symbol='abc')", "new PX.Sequence({type:'dna', symbol:'abc'})"), ("PX.Sequence(type='x', symbol=' ')", "new PX.Sequence({type:'x', symbol:' '})"),
    ("PX.Taxonomy(code='ab', rank='species')", "new PX.Taxonomy({code:'ab', rank:'species'})"), ("PX.Taxonomy(code='a', rank='x')", "new PX.Taxonomy({code:'a', rank:'x'})"),
    ("PX.MolSeq('AC-')", "new PX.MolSeq('AC-')"), ("PX.MolSeq('1')", "new PX.MolSeq('1')"), ("PX.Reference(doi='10.1/x')", "new PX.Reference('10.1/x')"), ("PX.Reference(doi='x')", "new PX.Reference('x')"),
    ("PX.SequenceRelation('orthology', 'a', 'b')", "new PX.SequenceRelation('orthology','a','b')"), ("PX.SequenceRelation('bad', 'a', 'b', distance=1)", "new PX.SequenceRelation('bad','a','b',1)"),
    ("PX.Confidence(1)", "new PX.Confidence(1)"), ("PX.Confidence(0.5, 'bootstrap')", "new PX.Confidence(0.5,'bootstrap')"), ("PX.Date(value=1, unit='y')", "new PX.Date({value:1, unit:'y'})"),
    ("PX.Date()", "new PX.Date()"), ("PX.Point('WGS84', 1, 2)", "new PX.Point('WGS84',1,2)"), ("PX.ProteinDomain('a', 1, 5, confidence=2)", "new PX.ProteinDomain('a',1,5,2)"),
    ("PX.Id('a')", "new PX.Id('a')"), ("PX.Id('a', 'p')", "new PX.Id('a','p')"), ("PX.Uri('')", "new PX.Uri('')"), ("PX.Uri('u', desc='d')", "new PX.Uri('u','d')"),
    ("PX.BranchColor(1, 2, 3)", "new PX.BranchColor(1,2,3)"), ("PX.BranchColor(1, 2, 300)", "new PX.BranchColor(1,2,300)"), ("PX.Accession('A', 'S')", "new PX.Accession('A','S')"),
    ("PX.Other('t', 'ns', {'a': 'b'}, 'v', [PX.Other('c')])", "new PX.Other('t','ns',{a:'b'},'v',[new PX.Other('c')])"),
    ("PX.CladeRelation('t', 'a', 'b', distance='1')", "new PX.CladeRelation('t','a','b','1')"), ("PX.Phylogeny(rooted=1)", "new PX.Phylogeny({rooted:1})"),
    ("list(PX.Other('t', children=[PX.Other('c'), PX.Other('d')]))", "[...new PX.Other('t', null, {}, null, [new PX.Other('c'), new PX.Other('d')])]"),
    ("PX.Phylogeny()", "new PX.Phylogeny()"), ("PX.Clade()", "new PX.Clade()"), ("PX.Clade(branch_length=1, name='n')", "new PX.Clade({branchLength:1, name:'n'})"),
    ("PX.Clade(branch_length=1.5, width=2)", "new PX.Clade({branchLength:1.5, width:2})"), ("PX.Phyloxml({})", "new PX.Phyloxml({})"), ("PX.Phyloxml({'a': 'b'})", "new PX.Phyloxml({a:'b'})"),
    ("PX.Polygon([PX.Point('d', 1.5, 2.5)])", "new PX.Polygon([new PX.Point('d',1.5,2.5)])"), ("PX.Distribution('d')", "new PX.Distribution('d')"),
    ("PX.DomainArchitecture(5, [PX.ProteinDomain('x', 0, 3)])", "new PX.DomainArchitecture(5,[new PX.ProteinDomain('x',0,3)])"), ("PX.BinaryCharacters(type='t', gained=['a'])", "new PX.BinaryCharacters({type:'t', gained:['a']})"),
]
for py, ts in CTORS: cases.append({"fn": "ctor", "expr": py, "ts": ts})

# operations: (kind, python, typescript)
BASE = '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny rooted="true"><name>t</name><confidence type="bootstrap">0.5</confidence><clade><name>R</name><confidence type="bootstrap">90</confidence><taxonomy><code>HUMAN</code></taxonomy><events><type>fusion</type><duplications>2</duplications></events><clade><name>A</name><branch_length>1</branch_length></clade><clade><name>B</name><branch_length>2.5</branch_length></clade></clade></phylogeny><phylogeny><name>second</name><clade/></phylogeny></phyloxml>'
NW = lambda t: ("__import__('io').StringIO(%r)" % t)
OPS = [
    [("eval", "root.confidence", "root.confidence"), ("exec", "root.confidence = 0.75", "root.confidence = 0.75"), ("eval", "root.confidence", "root.confidence"), ("exec", "root.confidence = 5", "root.confidence = 5"), ("eval", "root.confidence", "root.confidence"),
     ("exec", "root.confidence = 'x'", "root.confidence = 'x'"), ("exec", "root.confidence = None", "root.confidence = null"), ("eval", "root.confidences", "root.confidences"),
     ("exec", "root.confidences.extend([PX.Confidence(1), PX.Confidence(2)])", "root.confidences.push(new PX.Confidence(1), new PX.Confidence(2))"), ("eval", "root.confidence", "root.confidence"),
     ("exec", "root.confidence = 3", "root.confidence = 3"), ("exec", "del root.confidence", "root.deleteConfidence()"), ("eval", "root.confidences", "root.confidences"),
     ("exec", "root.confidence = PX.Confidence(2, 'bootstrap')", "root.confidence = new PX.Confidence(2,'bootstrap')"), ("eval", "root.confidence", "root.confidence")],
    [("eval", "root.taxonomy", "root.taxonomy"), ("exec", "root.taxonomy = PX.Taxonomy(code='ABC')", "root.taxonomy = new PX.Taxonomy({code:'ABC'})"), ("eval", "root.taxonomy", "root.taxonomy"),
     ("exec", "root.taxonomy = 'x'", "root.taxonomy = 'x'"), ("exec", "root.taxonomies.append(PX.Taxonomy())", "root.taxonomies.push(new PX.Taxonomy())"), ("eval", "root.taxonomy", "root.taxonomy"),
     ("exec", "root.taxonomy = PX.Taxonomy()", "root.taxonomy = new PX.Taxonomy()")],
    [("eval", "ph.confidence", "ph.confidence"), ("exec", "ph.confidence = 1", "ph.confidence = 1"), ("eval", "ph.confidence", "ph.confidence"), ("exec", "del ph.confidence", "ph.deleteConfidence()"), ("eval", "ph.confidence", "ph.confidence"),
     ("exec", "ph.confidences = [PX.Confidence(1), PX.Confidence(2)]", "ph.confidences = [new PX.Confidence(1), new PX.Confidence(2)]"), ("eval", "ph.confidence", "ph.confidence")],
    [("eval", "px[0]", "px.get(0)"), ("eval", "px[1]", "px.get(1)"), ("eval", "px[-1]", "px.get(-1)"), ("eval", "px[2]", "px.get(2)"), ("eval", "px['second']", "px.get('second')"), ("eval", "px['nope']", "px.get('nope')"),
     ("eval", "px[1.5]", "px.get(1.5)"), ("eval", "len(px)", "px.length"), ("eval", "[t.name for t in px]", "[...px].map(t => t.name)"), ("eval", "str(px)", "String(px)")],
    [("eval", "root.events.keys()", "root.events.keys()"), ("eval", "list(root.events.items())", "root.events.items()"), ("eval", "list(root.events.values())", "root.events.values()"), ("eval", "len(root.events)", "root.events.length"),
     ("eval", "root.events['type']", "root.events.get('type')"), ("eval", "root.events['losses']", "root.events.get('losses')"), ("eval", "root.events['zzz']", "root.events.get('zzz')"),
     ("eval", "'type' in root.events", "root.events.has('type')"), ("eval", "'losses' in root.events", "root.events.has('losses')"), ("eval", "list(root.events)", "[...root.events]"),
     ("exec", "root.events['losses'] = 4", "root.events.set('losses', 4)"), ("eval", "root.events.losses", "root.events.losses"), ("exec", "del root.events['duplications']", "root.events.delete('duplications')"),
     ("eval", "len(root.events)", "root.events.length"), ("exec", "root.events['bogus'] = 1", "root.events.set('bogus', 1)"), ("eval", "'bogus' in root.events", "root.events.has('bogus')"),
     ("eval", "root.events.keys()", "root.events.keys()"), ("exec", "del root.events['bogus']", "root.events.delete('bogus')"), ("eval", "dict(root.events.items())", "Object.fromEntries(root.events.items())")],
    [("eval", "ph.to_phyloxml_container()", "ph.toPhyloxmlContainer()"), ("eval", "ph.to_phyloxml_container(a='b')", "ph.toPhyloxmlContainer({a:'b'})"), ("eval", "ph.as_phyloxml() is ph", "ph.asPhyloxml() === ph"),
     ("eval", "PX.Phylogeny.from_tree(Phylo.read(%s, 'newick'))" % NW("((A:1,B:2)90:1,C);"), "PX.Phylogeny.fromTree(Phylo.read('((A:1,B:2)90:1,C);', 'newick'))"),
     ("eval", "PX.Phylogeny.from_tree(Phylo.read(%s, 'newick'), name='n', rerootable=True)" % NW("(A,B);"), "PX.Phylogeny.fromTree(Phylo.read('(A,B);', 'newick'), {name:'n', rerootable:true})"),
     ("eval", "PX.Phylogeny.from_clade(root, rerootable=False)", "PX.Phylogeny.fromClade(root, {rerootable:false})"), ("eval", "root.to_phylogeny(type='t')", "root.toPhylogeny({type:'t'})"),
     ("eval", "PX.Clade.from_clade(root)", "PX.Clade.fromClade(root)"), ("eval", "PX.Clade.from_clade(root, name='q')", "PX.Clade.fromClade(root, {name:'q'})")],
    [("eval", "list(root.find_clades())", "[...root.findClades()]"), ("eval", "root.get_terminals()", "root.getTerminals()"), ("eval", "ph.count_terminals()", "ph.countTerminals()"), ("eval", "ph.is_bifurcating()", "ph.isBifurcating()"),
     ("eval", "ph.find_any(name='A')", "ph.findAny(undefined, {name:'A'})"), ("eval", "ph.find_elements(PX.Taxonomy)", "ph.findElements(PX.Taxonomy)"), ("eval", "list(ph.find_elements(code='HUMAN'))", "[...ph.findElements(undefined, {code:'HUMAN'})]"),
     ("eval", "list(ph.find_elements(PX.Events))", "[...ph.findElements(PX.Events)]"), ("eval", "ph.total_branch_length()", "ph.totalBranchLength()"), ("eval", "str(ph)", "String(ph)"), ("eval", "repr(ph)", "ph.repr()"),
     ("eval", "ph.format('newick')", "ph.format('newick')"), ("eval", "root.color", "root.color"), ("exec", "root.color = 'red'", "root.color = 'red'"), ("eval", "root.color", "root.color"), ("eval", "str(root.color)", "String(root.color)")],
]
def steps(ops): return [{"kind": k, "py": p, "ts": t} for k, p, t in ops]
for ops in OPS: cases.append({"fn": "ops", "xml": BASE, "steps": steps(ops)})
RANDOM_OPS = [("eval", "ph.count_terminals()", "ph.countTerminals()"), ("eval", "[c.name for c in ph.find_clades()]", "[...ph.findClades()].map(c => c.name)"),
    ("eval", "list(ph.find_elements(PX.Taxonomy))", "[...ph.findElements(PX.Taxonomy)]"), ("eval", "list(ph.find_elements(PX.Sequence))", "[...ph.findElements(PX.Sequence)]"),
    ("eval", "list(ph.find_elements(PX.Confidence))", "[...ph.findElements(PX.Confidence)]"), ("eval", "ph.get_nonterminals()", "ph.getNonterminals()"), ("eval", "root.confidence", "root.confidence"),
    ("eval", "ph.format('newick')", "ph.format('newick')"), ("eval", "str(ph)", "String(ph)")]
for _ in range(25): cases.append({"fn": "ops", "xml": document(rnd.choice([1, 2])), "steps": steps(RANDOM_OPS)})

# sequences: conversions to and from SeqRecord, alignments
def aligned_doc():
    width = rnd.randint(3, 8)
    def seq_el():
        letters = "".join(rnd.choice("ACGT-") for _ in range(width))
        return el("sequence", None, {"type": rnd.choice(["dna", "protein", None])}, el("accession", "S%d" % rnd.randint(1, 99), {"source": "x"}) + el("name", txt()) + (el("symbol", "sym") if maybe() else "") +
                  el("mol_seq", letters, {"is_aligned": rnd.choice(["true", "true", "false"])}) + (uri() if maybe(.3) else "") + (annotation() if maybe(.5) else "") + (domain_arch() if maybe(.4) else ""))
    def cl(d):
        kids = "".join(cl(d + 1) for _ in range(2)) if d < 2 else ""
        return el("clade", None, None, (el("name", "n%d" % rnd.randint(1, 99)) if maybe() else "") + (seq_el() if maybe(.8) else "") + kids)
    return '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny rooted="true">%s</phylogeny></phyloxml>' % cl(0)

SEQ_OPS = [("eval", "[tryit(lambda s: s.to_seqrecord(), s) for s in ph.find_elements(PX.Sequence)]", "[...ph.findElements(PX.Sequence)].map(s => tryit(() => s.toSeqrecord()))"),
           ("eval", "[tryit(lambda s: PX.Sequence.from_seqrecord(s.to_seqrecord()), s) for s in ph.find_elements(PX.Sequence)]", "[...ph.findElements(PX.Sequence)].map(s => tryit(() => PX.Sequence.fromSeqrecord(s.toSeqrecord())))"),
           ("eval", "[tryit(lambda s: PX.Sequence.from_seqrecord(s.to_seqrecord(), is_aligned=True), s) for s in ph.find_elements(PX.Sequence)]", "[...ph.findElements(PX.Sequence)].map(s => tryit(() => PX.Sequence.fromSeqrecord(s.toSeqrecord(), true)))"),
           ("eval", "tryit(ph.to_alignment)", "tryit(() => ph.toAlignment())"), ("eval", "tryit(lambda: ph.alignment)", "tryit(() => ph.alignment)")]
for _ in range(30): cases.append({"fn": "ops", "xml": document(1), "steps": steps(SEQ_OPS)})
for _ in range(25): cases.append({"fn": "ops", "xml": aligned_doc(), "steps": steps(SEQ_OPS)})
RECS = [
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACGT-A'), id='x', name='n', description='d'))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACGT-A'), 'x', 'n', 'd'))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACGT'), id='x'), is_aligned=True)", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACGT'), 'x'), true)"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('MKV'), id='x', annotations={'molecule_type': 'protein', 'id_ref': 'r1', 'id_source': 's1', 'location': 'chr1'}))",
     "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('MKV'), 'x', undefined, undefined, null, null, M({molecule_type: 'protein', id_ref: 'r1', id_source: 's1', location: 'chr1'})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'molecule_type': 'mRNA'}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({molecule_type: 'mRNA'})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'molecule_type': 'genomic DNA'}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({molecule_type: 'genomic DNA'})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'uri': {'value': 'http://u', 'desc': 'd', 'type': 't'}}))",
     "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({uri: {value: 'http://u', desc: 'd', type: 't'}})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'uri': {'desc': 'd'}}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({uri: {desc: 'd'}})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'uri': {'value': 'v', 'zz': 'd'}}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({uri: {value: 'v', zz: 'd'}})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'annotations': [{'ref': 'EC:1.1', 'source': 's', 'evidence': 'e', 'type': 't', 'desc': 'dd', 'confidence': [0.5, 'bootstrap'], 'properties': [{'value': '1', 'ref': 'a:b', 'applies_to': 'clade', 'datatype': 'xsd:int', 'unit': 'u:v', 'id_ref': 'q'}, 'skipped']}]}))",
     "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({annotations: [{ref: 'EC:1.1', source: 's', evidence: 'e', type: 't', desc: 'dd', confidence: [0.5, 'bootstrap'], properties: [{value: '1', ref: 'a:b', applies_to: 'clade', datatype: 'xsd:int', unit: 'u:v', id_ref: 'q'}, 'skipped']}]})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'annotations': [{'confidence': [1]}]}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({annotations: [{confidence: [1]}]})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'annotations': [{'confidence': []}]}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({annotations: [{confidence: []}]})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'annotations': [{'properties': [{'value': '1'}]}]}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({annotations: [{properties: [{value: '1'}]}]})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACG'), id='x', annotations={'annotations': []}))", "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACG'), 'x', undefined, undefined, null, null, M({annotations: []})))"),
    ("PX.Sequence.from_seqrecord(SeqRecord(Seq('ACGTAC'), id='x', features=[SeqFeature(SimpleLocation(1, 4), id='dom1', qualifiers={'confidence': 0.5}), SeqFeature(SimpleLocation(2, 6), id='dom2')]))",
     "PX.Sequence.fromSeqrecord(new SeqRecord(new Seq('ACGTAC'), 'x', undefined, undefined, null, [new SeqFeature(new SimpleLocation(1, 4), '', 'dom1', {confidence: 0.5}), new SeqFeature(new SimpleLocation(2, 6), '', 'dom2')]))"),
    ("PX.ProteinDomain.from_seqfeature(SeqFeature(SimpleLocation(2, 9), id='d', qualifiers={'confidence': 1e-5}))", "PX.ProteinDomain.fromSeqfeature(new SeqFeature(new SimpleLocation(2, 9), '', 'd', {confidence: 1e-5}))"),
    ("PX.ProteinDomain('a', 1, 5, confidence=0.5).to_seqfeature()", "new PX.ProteinDomain('a', 1, 5, 0.5).toSeqfeature()"), ("PX.ProteinDomain('a', 5, 1).to_seqfeature()", "new PX.ProteinDomain('a', 5, 1).toSeqfeature()"),
    ("PX.ProteinDomain('a', 1, 5).to_seqfeature()", "new PX.ProteinDomain('a', 1, 5).toSeqfeature()"),
    ("PX.Sequence().to_seqrecord()", "new PX.Sequence().toSeqrecord()"), ("PX.Sequence(mol_seq=PX.MolSeq('AC')).to_seqrecord()", "new PX.Sequence({molSeq: new PX.MolSeq('AC')}).toSeqrecord()"),
    ("PX.Sequence(mol_seq=PX.MolSeq('AC'), accession=PX.Accession('A1', 'S'), symbol='sy', name='nm', type='rna', annotations=[PX.Annotation(ref='a:b', confidence=PX.Confidence(0.0, 'p'))]).to_seqrecord()",
     "new PX.Sequence({molSeq: new PX.MolSeq('AC'), accession: new PX.Accession('A1', 'S'), symbol: 'sy', name: 'nm', type: 'rna', annotations: [new PX.Annotation({ref: 'a:b', confidence: new PX.Confidence(0.0, 'p')})]}).toSeqrecord()"),
]
for py, ts in RECS: cases.append({"fn": "ctor", "expr": py, "ts": ts})

results = [run(c) for c in cases]
# a case must be deterministic: run twice
again = [run(c) for c in cases]
keep = [(c, r) for c, r, r2 in zip(cases, results, again) if r == r2]
print("cases", len(cases), "kept", len(keep), file=sys.stderr)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f: json.dump([dict(c, expect=r) for c, r in keep], f)
