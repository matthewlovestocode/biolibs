"""Golden cases for pydna.assembly2 (the engine) -> packages/assembly2/test/golden/assembly2.json

`assembly2` joins fragments by finding where they overlap, drawing a graph with a node for each fragment
in each orientation and an edge for each overlap, and walking that graph for the paths and cycles that
are molecules. These cases record every layer of that, so that a difference shows up where it starts:

- the overlap finders, one pair of fragments at a time;
- the small helpers on locations and lists;
- `Assembly`, `PCRAssembly` and `SingleFragmentAssembly`: the assemblies found, in the order found, and
  the molecule each one gives;
- the functions for the common methods (Gibson, In-Fusion, fusion PCR, in vivo, ligation, restriction and
  ligation, Golden Gate, PCR): their products, the warnings and the errors.

A product is recorded with the provenance pydna attaches to it, reduced to what the engine itself decides:
which inputs, which way round, and the stretch of each that was shared with its neighbours.

Everything comes from a seeded generator and fixed lists; nothing iterates a set.
"""
import itertools, json, os, random, warnings
from Bio.Restriction import BamHI, BsaI, BsmBI, EcoRI, EcoRV, HindIII, NotI, PstI, SmaI, XbaI, DrdI, RgaI
from Bio.SeqFeature import SimpleLocation, CompoundLocation
from pydna import assembly2 as A
from pydna.dseq import Dseq
from pydna.dseqrecord import Dseqrecord
from pydna.primer import Primer
from pydna import utils as U

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "assembly2", "test", "golden", "assembly2.json")
ENZYMES = {"EcoRI": EcoRI, "BamHI": BamHI, "HindIII": HindIII, "EcoRV": EcoRV, "SmaI": SmaI, "NotI": NotI,
           "PstI": PstI, "XbaI": XbaI, "BsaI": BsaI, "BsmBI": BsmBI, "DrdI": DrdI, "RgaI": RgaI}
rng = random.Random(20261115)


def dna(n):
    """`n` random bases."""
    return "".join(rng.choice("ACGT") for _ in range(n))


def guard(fn):
    """Run something, giving its value or the error it raised, with any warnings."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            out = {"value": fn()}
        except Exception as e:
            out = {"exc": {"type": type(e).__name__, "msg": str(e)}}
    if caught:
        out["warnings"] = [[type(w.message).__name__, str(w.message)] for w in caught]
    return out


# ------------------------------------------------------------------------------------------ inputs
def spec(watson, crick=None, ovhg=0, circular=False, name=None, features=(), primer=False):
    """A fragment, as the JSON that both sides build it from."""
    if primer:
        return {"primer": watson, "name": name or "primer"}
    return {"watson": watson, "crick": crick, "ovhg": ovhg, "circular": circular, "name": name or "name",
            "features": [list(f) for f in features]}


def build(s):
    """The pydna object a spec stands for."""
    if "primer" in s:
        return Primer(s["primer"], id=s["name"], name=s["name"])
    if s["crick"] is None:
        seq = Dseq(s["watson"], circular=s["circular"])
    else:
        seq = Dseq(s["watson"], s["crick"], s["ovhg"], circular=s["circular"])
    r = Dseqrecord(seq, id=s["name"], name=s["name"])
    for start, end, strand, type_, label in s["features"]:
        r.add_feature(start, end, type_=type_, strand=strand, label=[label])
    return r


def of_dseq(d, name, features=()):
    """The spec of an existing Dseq, so that digested fragments can be inputs."""
    return spec(d.watson, d.crick, d.ovhg, d.circular, name, features)


def loc(l):
    """A location as text, or None."""
    return None if l is None else str(l)


def feat(sf):
    """One feature."""
    return {"loc": loc(sf.location), "type": sf.type, "qualifiers": {k: v for k, v in sorted(sf.qualifiers.items())}}


def index_of(obj, frags):
    """Which input an object is.

    By identity first. `annotate_primer_binding_sites` deep-copies the product, and the copy's provenance
    holds copies of the inputs rather than the inputs themselves, so fall back to what the input is.
    """
    found = next((i for i, f in enumerate(frags) if f is obj), None)
    if found is not None:
        return found
    same = (str(obj.seq), obj.id, obj.name, type(obj).__name__)
    return next(i for i, f in enumerate(frags) if (str(f.seq), f.id, f.name, type(f).__name__) == same)


def source(src, frags):
    """The part of a product's provenance that the engine decides."""
    if src is None:
        return None
    return {"type": type(src).__name__, "circular": src.circular,
            "input": [{"sequence": index_of(i.sequence, frags), "rc": i.reverse_complemented,
                       "left": loc(i.left_location), "right": loc(i.right_location)} for i in src.input]}


def snap(r, frags):
    """Enough of a product to pin it down."""
    return {"watson": r.seq.watson, "crick": r.seq.crick, "ovhg": r.seq.ovhg, "circular": bool(r.circular),
            "code": r.seq._data.decode("ascii"), "id": r.id, "name": r.name, "description": r.description,
            "features": [feat(f) for f in r.features], "source": source(r.source, frags)}


def edges(assemblies):
    """Assemblies in edge representation, with locations as text."""
    return [[[u, v, loc(lu), loc(lv)] for u, v, lu, lv in a] for a in assemblies]


# ------------------------------------------------------------------------------------------ pools
def overlapping(n, size=60, overlap=20, circular=False, rc_some=False):
    """`n` windows of one random molecule, each sharing `overlap` bases with the next (and the last with the first)."""
    step = size - overlap
    genome = dna(step * n + (0 if circular else overlap))
    doubled = genome + genome
    out = []
    for i in range(n):
        piece = doubled[i * step:i * step + size]
        if rc_some and rng.random() < 0.5:
            piece = str(Dseq(piece).reverse_complement().watson)
        out.append(spec(piece, name=f"f{i + 1}"))
    return out


def digest(text, enzymes, circular, name):
    """The fragments of a digest, as specs."""
    parts = Dseqrecord(text, circular=circular).cut(*enzymes)
    return [of_dseq(p.seq, f"{name}{i + 1}") for i, p in enumerate(parts)]


SITE = {"EcoRI": "GAATTC", "BamHI": "GGATCC", "HindIII": "AAGCTT", "EcoRV": "GATATC", "SmaI": "CCCGGG", "PstI": "CTGCAG", "XbaI": "TCTAGA"}


def with_sites(names, gap=18):
    """Random DNA with the named sites in it, in order."""
    return dna(gap) + "".join(SITE[n] + dna(gap) for n in names)


cases = {"algorithms": [], "utils": [], "assembly": [], "pcr": [], "single": [], "methods": [], "primer": []}

# ------------------------------------------------------------------------------------------ overlap finders
PAIRS = []
for size, overlap in ((40, 12), (60, 20), (50, 25), (30, 30)):
    a, b = overlapping(2, size, overlap)
    PAIRS += [(a, b), (b, a)]
core = dna(40)
PAIRS += [
    (spec(core, circular=True), spec(core[10:] + core[:10], circular=True)),
    (spec(core), spec(core)),
    (spec(core, circular=True), spec(core[25:] + core[:5])),
    (spec(core[25:] + core[:5]), spec(core, circular=True)),
    (spec("TAAAAAAT"), spec("CCaAaAaACC")),
    (spec("ttactaAAAAAA"), spec("AAAAAAcgcacg")),
    # pydna's own `terminal_overlap` example: a 3' recess on the left piece meeting a 5' recess on the right
    (of_dseq(Dseq.from_full_sequence_and_overhangs("aaaACGT", 0, 3), "x"),
     of_dseq(Dseq.from_full_sequence_and_overhangs("ACGTccc", 3, 0), "y")),
]
# sticky pairs, from full sequences and overhangs
for full, right, left in (("AAAAAA", 3, 3), ("ACGTAC", 2, 3), ("GGATCC", 4, 4), ("ACGTACGT", -3, -3), ("ACGTACGT", -2, -4), ("TTTTTT", 0, 0), ("ACGTAC", 3, -3)):
    x = Dseq.from_full_sequence_and_overhangs(full, 0, right)
    y = Dseq.from_full_sequence_and_overhangs(full, left, 0)
    PAIRS += [(of_dseq(x, "x"), of_dseq(y, "y")), (of_dseq(y, "y"), of_dseq(x, "x"))]
for text, enz in ((with_sites(["EcoRI"]), [EcoRI]), (with_sites(["PstI"]), [PstI]), (with_sites(["EcoRV"]), [EcoRV])):
    left, right = digest(text, enz, False, "d")
    PAIRS += [(left, right), (right, left), (left, left), (right, right)]

for x, y in PAIRS:
    bx, by = build(x), build(y)
    runs = {}
    for limit in (4, 5, 8, 12, 25):
        runs[f"common_sub_strings:{limit}"] = guard(lambda: A.common_sub_strings(bx, by, limit))
        for trim in (None, "5'", "3'"):
            runs[f"terminal_overlap:{limit}:{trim}"] = guard(lambda: A.terminal_overlap(bx, by, limit, trim))
        runs[f"gibson_overlap:{limit}"] = guard(lambda: A.gibson_overlap(bx, by, limit))
        runs[f"in_fusion_overlap:{limit}"] = guard(lambda: A.in_fusion_overlap(bx, by, limit))
        runs[f"pcr_fusion_overlap:{limit}"] = guard(lambda: A.pcr_fusion_overlap(bx, by, limit))
    runs["terminal_overlap:5:x"] = guard(lambda: A.terminal_overlap(bx, by, 5, "x"))
    for partial in (False, True):
        runs[f"sticky_end_sub_strings:{partial}"] = guard(lambda: A.sticky_end_sub_strings(bx, by, partial))
    runs["blunt_overlap"] = guard(lambda: A.blunt_overlap(bx, by))
    cases["algorithms"].append({"x": x, "y": y, "runs": runs})

# restriction and ligation, on uncut molecules
RL = [("ccGAATTCaa", "aaaaGAATTCgg", ["EcoRI"]), ("GACTAAAGGGTC", "AAGCGATCGCAAGCGATCGCAA", ["RgaI", "DrdI"]),
      ("aaGATATCcc", "ttttGATATCaa", ["EcoRV"]), (with_sites(["EcoRI", "BamHI"]), with_sites(["BamHI", "EcoRI"]), ["EcoRI", "BamHI"]),
      (with_sites(["PstI"]), with_sites(["PstI", "PstI"]), ["PstI"]), (with_sites(["EcoRI"]), with_sites(["XbaI"]), ["EcoRI", "XbaI"]),
      (with_sites(["SmaI"]), with_sites(["EcoRV"]), ["SmaI", "EcoRV"])]
for tx, ty, names in RL:
    for cx, cy in itertools.product((False, True), repeat=2):
        x, y = spec(tx, circular=cx), spec(ty, circular=cy)
        bx, by = build(x), build(y)
        runs = {}
        for partial, blunt in itertools.product((False, True), repeat=2):
            runs[f"{partial}:{blunt}"] = guard(lambda: A.restriction_ligation_overlap(bx, by, [ENZYMES[n] for n in names], partial, blunt))
            runs[f"rev:{partial}:{blunt}"] = guard(lambda: A.restriction_ligation_overlap(by, bx, [ENZYMES[n] for n in names], partial, blunt))
        cases["algorithms"].append({"x": x, "y": y, "enzymes": names, "restriction": runs})
# and on a digested fragment next to an uncut one, where an end counts as a cut
frag_l, frag_r = digest(with_sites(["EcoRI"]), [EcoRI], False, "d")
whole = spec(with_sites(["EcoRI"]))
for x, y in ((frag_l, whole), (whole, frag_r), (frag_l, frag_r), (frag_r, frag_l)):
    bx, by = build(x), build(y)
    cases["algorithms"].append({"x": x, "y": y, "enzymes": ["EcoRI"],
                                "restriction": {"False:True": guard(lambda: A.restriction_ligation_overlap(bx, by, [EcoRI], False, True))}})

# ends_from_cutsite
for text, names in (("ctcgGCGGCCGCcagcggccg", ["NotI"]), (with_sites(["PstI", "EcoRI", "EcoRV"]), ["PstI", "EcoRI", "EcoRV"])):
    for circular in (False, True):
        d = Dseq(text, circular=circular)
        cuts = d.get_cutsites(*[ENZYMES[n] for n in names])
        cases["utils"].append({"fn": "ends_from_cutsite", "seq": text, "circular": circular, "enzymes": names,
                               "result": guard(lambda: [[[w, o], str(e), A.ends_from_cutsite(((w, o), e), d)] for (w, o), e in cuts])})
cases["utils"].append({"fn": "ends_from_cutsite_none", "result": guard(lambda: A.ends_from_cutsite(None, Dseq("ACGT")))})

# primer and template
template_text = dna(120)
TEMPLATES = [spec(template_text, name="t"), spec(template_text, circular=True, name="t"), spec(template_text[60:] + template_text[:60], circular=True, name="t")]


def mutate(text, k):
    """`text` with `k` substitutions, spread out."""
    out = list(text)
    for i in range(k):
        at = (i * 7 + 3) % len(out)
        out[at] = {"A": "C", "C": "G", "G": "T", "T": "A"}[out[at].upper()]
    return "".join(out)


def rc(text):
    return str(Dseq(text).reverse_complement().watson)


PRIMERS = [template_text[5:25], template_text[50:70], dna(6).lower() + template_text[5:25], rc(template_text[90:112]),
           rc(template_text[90:112]) , "gaattc" + rc(template_text[60:80]), mutate(template_text[30:52], 1), mutate(template_text[30:52], 2),
           template_text[55:75], template_text[110:120] + template_text[:10], template_text[5:25].replace("T", "U"), template_text[10:16]]
for t in TEMPLATES:
    bt = build(t)
    for p in PRIMERS:
        bp = Primer(p, id="p", name="p")
        runs = {}
        for limit, mismatches in ((8, 0), (14, 0), (14, 1), (16, 2), (20, 0), (25, 0)):
            runs[f"fwd:{limit}:{mismatches}"] = guard(lambda: A.primer_template_overlap(bp, bt, limit, mismatches))
            runs[f"rvs:{limit}:{mismatches}"] = guard(lambda: A.primer_template_overlap(bt, bp.reverse_complement(), limit, mismatches))
            runs[f"rvs_rc:{limit}:{mismatches}"] = guard(lambda: A.primer_template_overlap(bt.reverse_complement(), bp.reverse_complement(), limit, mismatches))
        cases["algorithms"].append({"x": spec(p, primer=True, name="p"), "y": t, "primer_template": runs})
cases["algorithms"].append({"x": TEMPLATES[0], "y": TEMPLATES[0], "primer_template": {"fwd:8:0": guard(lambda: A.primer_template_overlap(build(TEMPLATES[0]), build(TEMPLATES[0]), 8, 0))}})
for seq, primer, circular, match in (("AAAAACGTCCCGT", "ACGTCCCGT", False, (13, 9, 0)), ("TCCCGTAAAAACG", "ACGTCCCGT", True, (6, 9, 0)),
                                     ("AAAAACGTCCCGT", "ACGTCCCGT", False, (4, 0, 0)), ("AAAAACGTCCCGT", "ACGTCACGT", False, (13, 9, 0)),
                                     ("AAAAACGTCCCGT", "ACGUCCCGU", False, (13, 9, 0))):
    s, p = Dseqrecord(seq, circular=circular), Dseqrecord(primer)
    cases["utils"].append({"fn": "zip_match", "seq": seq, "primer": primer, "circular": circular, "match": list(match),
                           "result": {"left": guard(lambda: A.zip_match_leftwards(s, p, match)), "right": guard(lambda: A.zip_match_rightwards(s, p, match)),
                                      "text": guard(lambda: [A.seqrecord2_uppercase_DNA_string(s), A.seqrecord2_uppercase_DNA_string(p)])}})

# ------------------------------------------------------------------------------------------ location and list helpers
def mk(s, e, n):
    return U.create_location(s, e, n)


for n in (10, 13):
    spans = [(0, 3), (2, 6), (3, 6), (5, 9), (8, 2), (9, 1), (0, n), (4, 4), (7, 3), (1, 2)]
    for (s1, e1), (s2, e2) in itertools.product(spans, repeat=2):
        cases["utils"].append({"fn": "location_overlap", "n": n, "a": [s1, e1], "b": [s2, e2],
                               "result": guard(lambda: [loc(mk(s1, e1, n)), loc(mk(s2, e2, n)), list(U.location_overlap(mk(s1, e1, n), mk(s2, e2, n), n)),
                                                        U.locations_overlap(mk(s1, e1, n), mk(s2, e2, n), n)])})
for s, e, n, strand in ((0, 5, 10, None), (5, 0, 10, None), (-2, 3, 10, None), (3, -2, 10, 1), (8, 12, 10, -1), (0, 0, 10, None), (4, 4, 10, None), (-12, -3, 10, None), (2, 9, 9, 1)):
    cases["utils"].append({"fn": "create_location", "args": [s, e, n, strand],
                           "result": guard(lambda: (lambda l: [loc(l), [[int(p.start), int(p.end), p.strand] for p in l.parts]])(U.create_location(s, e, n, strand)))})
CUTS = [((3, -4), None), ((7, 4), None), ((5, 0), None), ((0, -4), None), ((9, -4), None), ((2, 3), None), ((11, 4), None)]
for a, b in itertools.product(CUTS + [None], repeat=2):
    for n in (12, 20):
        cases["utils"].append({"fn": "cuts_overlap", "a": a and list(a[0]), "b": b and list(b[0]), "n": n, "result": guard(lambda: U.cuts_overlap(a, b, n))})
for c in CUTS + [None]:
    for n in (12, 20):
        cases["utils"].append({"fn": "cutsite_to_location", "cut": c and list(c[0]), "n": n, "result": guard(lambda: loc(U.cutsite_to_location(c, n)))})
ENDS = [("5'", "aatt"), ("5'", "aat"), ("5'", "ttaa"), ("3'", "tgca"), ("3'", "gca"), ("3'", "acgt"), ("blunt", ""), ("5'", "a"), ("3'", "aatt"), ("5'", "catt")]
for a, b in itertools.product(ENDS, repeat=2):
    cases["utils"].append({"fn": "sum_is_sticky", "a": list(a), "b": list(b),
                           "result": [guard(lambda: U.sum_is_sticky(a, b, False)), guard(lambda: U.sum_is_sticky(a, b, True))]})
for sub, lst in (([1, 2], [1, 2, 3]), ([1, 2], [1, 3, 2]), ([3, 1], [1, 2, 3]), ([], [1]), ([1, 2, 3], [1, 2]), ([2, 3, 1], [1, 2, 3]), ([1], []), ([[1, 2]], [[1, 2], [3]])):
    cases["utils"].append({"fn": "is_sublist", "sub": sub, "list": lst, "result": [guard(lambda: A.is_sublist(sub, lst, False)), guard(lambda: A.is_sublist(sub, lst, True))]})
for lst in ([1, 2, 3], [3, 1, 2], [-3, 2, -1], [2, -1, 1], [5], [-2, 2], [3, -2, 2, 1]):
    cases["utils"].append({"fn": "circular_permutation_min_abs", "list": lst, "result": guard(lambda: A.circular_permutation_min_abs(lst))})
cases["utils"].append({"fn": "circular_permutation_min_abs", "list": [], "result": guard(lambda: A.circular_permutation_min_abs([]))})
for items in ([1, 2, 1, 3, 2], ["a", "b", "a"], [], [3, 3, 3]):
    cases["utils"].append({"fn": "deduplicate", "items": items, "result": [guard(lambda: U.deduplicate(items)), guard(lambda: U.deduplicate(items, hashable=False))]})
for n, spans in ((20, [(0, 4), (3, 7), (10, 12), (11, 15), (18, 2)]), (20, [(5, 9), (0, 2), (9, 12)]), (12, [(10, 2), (0, 3), (5, 6), (5, 6)]), (12, [])):
    cases["utils"].append({"fn": "gather_overlapping_locations", "n": n, "spans": [list(s) for s in spans],
                           "result": guard(lambda: [[loc(l) for l in group] for group in A.gather_overlapping_locations([mk(s, e, n) for s, e in spans], n)])})
for limit in (0, 2, 3, 5):
    cases["utils"].append({"fn": "limit_iterator", "limit": limit, "result": guard(lambda: list(U.limit_iterator(iter([1, 2, 3]), limit)))})

# Printing an assembly, turning the two representations into one another, and the mismatch check. The
# assemblies come from a real graph, so the locations are ones the engine itself would have made.
for frag_specs, limit, algo in ((overlapping(3, 60, 20, circular=True), 15, A.common_sub_strings),
                                (overlapping(2, 60, 20), 15, A.gibson_overlap),
                                ((lambda l, r, o, n: [spec(dna(20) + l + o + r + dna(20), name="g"), spec(l + n + r, name="i")])(dna(25), dna(25), dna(30), dna(40)), 20, A.common_sub_strings)):
    frs = [build(x) for x in frag_specs]
    asm = A.Assembly(frs, limit, algo, use_fragment_order=False, use_all_fragments=True)
    for kind in ("linear", "circular", "insertion"):
        found = getattr(asm, f"get_{kind}_assemblies")()
        for assembly in found[:3]:
            sub = A.edge_representation2subfragment_representation(assembly, kind == "circular")
            cases["utils"].append({
                "fn": "assembly_strings", "frags": frag_specs, "limit": limit, "kind": kind, "algorithm": algo.__name__,
                "assembly": [[u, v, loc(lu), loc(lv)] for u, v, lu, lv in assembly],
                "result": {
                    "str": guard(lambda: A.assembly2str(assembly)),
                    "str_tuple": guard(lambda: A.assembly2str_tuple(assembly)),
                    "mismatches": guard(lambda: A.assembly_has_mismatches(frs, assembly)),
                    "subfragments": guard(lambda: [[n, loc(a), loc(b)] for n, a, b in sub]),
                    "round_trip": guard(lambda: [[u, v, loc(lu), loc(lv)] for u, v, lu, lv in
                                                 A.subfragment_representation2edge_representation(sub, kind == "circular")]),
                }})

# ------------------------------------------------------------------------------------------ Assembly
ALGOS = {"common_sub_strings": A.common_sub_strings, "gibson_overlap": A.gibson_overlap, "in_fusion_overlap": A.in_fusion_overlap,
         "pcr_fusion_overlap": A.pcr_fusion_overlap, "sticky": lambda x, y, l: A.sticky_end_sub_strings(x, y, False),
         "sticky_partial": lambda x, y, l: A.sticky_end_sub_strings(x, y, True),
         "sticky_blunt": A.combine_algorithms(lambda x, y, l: A.sticky_end_sub_strings(x, y, False), A.blunt_overlap)}


def run_assembly(frag_specs, algo, limit, order, use_all):
    """Everything an `Assembly` reports, in the order it reports it."""
    frags = [build(s) for s in frag_specs]
    out = {"frags": frag_specs, "algorithm": algo, "limit": limit, "use_fragment_order": order, "use_all_fragments": use_all}
    made = guard(lambda: A.Assembly(frags, limit, ALGOS[algo], order, use_all))
    if "exc" in made:
        out["init"] = made
        return out
    asm = made["value"]
    out["repr"] = repr(asm) if algo in ("common_sub_strings", "gibson_overlap", "in_fusion_overlap", "pcr_fusion_overlap") else None
    out["graph"] = [[u, v, k, d["uid"]] for u, v, k, d in asm.G.edges(keys=True, data=True)]
    for kind in ("linear", "circular", "insertion"):
        for adjacent in (False, True):
            got = guard(lambda: edges(getattr(asm, f"get_{kind}_assemblies")(adjacent)))
            out[f"{kind}:{adjacent}"] = got
            if "value" in got and not adjacent:
                out[f"{kind}:products"] = guard(lambda: [snap(p, frags) for p in getattr(asm, f"assemble_{kind}")()])
    out["locations"] = guard(lambda: {str(k): {side: [loc(l) for l in ls] for side, ls in v.items()} for k, v in asm.get_locations_on_fragments().items()})
    return out


SETS = []
for n in (2, 3, 4):
    SETS.append((overlapping(n, 60, 20), 15))
    SETS.append((overlapping(n, 60, 20, circular=True), 15))
    SETS.append((overlapping(n, 50, 16, circular=True, rc_some=True), 12))
shuffled = overlapping(4, 60, 20, circular=True)
SETS.append(([shuffled[2], shuffled[0], shuffled[3], shuffled[1]], 15))
# a repeat, so that two fragments can join in more than one place
rep = dna(18)
SETS.append(([spec(dna(20) + rep + dna(12) + rep, name="a"), spec(rep + dna(25), name="b")], 12))
SETS.append(([spec(dna(20) + rep + dna(12) + rep + dna(9), name="a"), spec(rep + dna(25) + rep, name="b")], 12))
# an insert with homology arms, and a genome to take it; and a plasmid in place of the genome
arm_l, arm_r, old, new = dna(25), dna(25), dna(30), dna(40)
SETS.append(([spec(dna(20) + arm_l + old + arm_r + dna(20), name="genome"), spec(arm_l + new + arm_r, name="insert")], 20))
SETS.append(([spec(dna(20) + arm_l + old + arm_r + dna(20), circular=True, name="plasmid"), spec(arm_l + new + arm_r, name="insert")], 20))
# features, to follow them into products
fa, fb, fc = overlapping(3, 60, 20, circular=True)
fa = dict(fa, features=[[2, 30, 1, "CDS", "inside"], [45, 58, -1, "misc_feature", "in_overlap"], [0, 60, 1, "source", "whole"]])
fb = dict(fb, features=[[0, 15, 1, "misc_feature", "left_overlap"], [25, 35, None, "gene", "middle"]])
SETS.append(([fa, fb, fc], 15))
# nothing in common
SETS.append(([spec(dna(40), name="a"), spec(dna(40), name="b")], 15))
SETS.append(([spec(dna(40), name="a")], 15))
SETS.append(([], 15))

for frag_specs, limit in SETS:
    for algo in ("common_sub_strings", "gibson_overlap"):
        for order, use_all in itertools.product((True, False), repeat=2):
            cases["assembly"].append(run_assembly(frag_specs, algo, limit, order, use_all))

# sticky ends: the fragments of digests, handed over in a scrambled order
LIG = []
p1 = with_sites(["EcoRI", "BamHI", "HindIII"])
LIG.append(digest(p1, [EcoRI, BamHI, HindIII], True, "p"))
LIG.append(digest(p1, [EcoRI, BamHI], False, "l"))
LIG.append(digest(with_sites(["EcoRI", "EcoRI"]), [EcoRI], True, "e"))
LIG.append(digest(with_sites(["EcoRV", "SmaI"]), [EcoRV, SmaI], True, "b"))
LIG.append(digest(with_sites(["PstI", "EcoRI"]), [PstI, EcoRI], True, "m"))
LIG.append(digest(with_sites(["EcoRI"]), [EcoRI], True, "one"))
for parts in LIG:
    order = parts[:]
    rng.shuffle(order)
    for algo in ("sticky", "sticky_partial", "sticky_blunt"):
        for fo, use_all in ((False, True), (True, False), (False, False)):
            cases["assembly"].append(run_assembly(order, algo, None, fo, use_all))

# max_assemblies
many = [spec((rep + dna(6)) * 4, name="a"), spec((rep + dna(5)) * 4, name="b")]
fr = [build(s) for s in many]
asm = A.Assembly(fr, 12, A.common_sub_strings, False, False)
cases["utils"].append({"fn": "max_assemblies", "frags": many, "limit": 12,
                       "result": {str(m): [guard(lambda: len(asm.get_linear_assemblies(False, m))), guard(lambda: len(asm.get_circular_assemblies(False, m))),
                                           guard(lambda: len(asm.get_insertion_assemblies(False, m)))] for m in (1, 5, 50, 100000)}})

# ------------------------------------------------------------------------------------------ PCR
def run_pcr(t, fwd, rvs, limit, mismatches):
    frag_specs = [spec(fwd, primer=True, name="fwd"), t, spec(rvs, primer=True, name="rvs")]
    frags = [build(s) for s in frag_specs]
    out = {"frags": frag_specs, "limit": limit, "mismatches": mismatches}
    made = guard(lambda: A.PCRAssembly(frags, limit, mismatches))
    if "exc" in made:
        out["init"] = made
        return out
    asm = made["value"]
    out["graph"] = [[u, v, k, d["uid"]] for u, v, k, d in asm.G.edges(keys=True, data=True)]
    out["linear"] = guard(lambda: edges(asm.get_linear_assemblies()))
    out["products"] = guard(lambda: [snap(p, frags) for p in asm.assemble_linear()])
    out["refused"] = [guard(lambda: asm.get_linear_assemblies(True)), guard(lambda: asm.get_circular_assemblies()), guard(lambda: asm.get_insertion_assemblies())]
    for add in (False, True):
        fresh = [build(s) for s in frag_specs]
        out[f"pcr_assembly:{add}"] = guard(lambda: [snap(p, fresh) for p in A.pcr_assembly(fresh[1], fresh[0], fresh[2], add, limit - mismatches if limit - mismatches > 0 else limit, mismatches)])
    return out


T = template_text
featured = dict(spec(T, name="t"), features=[[10, 40, 1, "CDS", "early"], [50, 100, -1, "gene", "late"], [0, 120, 1, "source", "all"]])
PCRS = [(TEMPLATES[0], T[5:25], rc(T[90:112])), (TEMPLATES[1], T[5:25], rc(T[90:112])), (TEMPLATES[2], T[5:25], rc(T[90:112])),
        (TEMPLATES[0], "ggatcc" + T[5:25], "gaattc" + rc(T[90:112])), (TEMPLATES[1], T[90:112], rc(T[5:25])),
        (TEMPLATES[0], mutate(T[5:27], 1), rc(T[90:112])), (TEMPLATES[0], T[5:25], T[90:112]), (TEMPLATES[0], T[5:25], rc(T[5:25])),
        (TEMPLATES[0], T[5:25], dna(20)), (featured, T[5:25], rc(T[90:112])), (featured, "ttt" + T[20:40], "ccc" + rc(T[60:85])),
        (TEMPLATES[1], T[100:120], rc(T[0:20])), (TEMPLATES[0], T[5:25].replace("T", "U"), rc(T[90:112]))]
pal = dna(10)
pal = pal + rc(pal)
PCRS.append((spec(dna(20) + pal + dna(30) + pal + dna(20), name="t"), pal, pal))
for t, fwd, rvs in PCRS:
    for limit, mismatches in ((14, 0), (20, 0), (15, 1)):
        cases["pcr"].append(run_pcr(t, fwd, rvs, limit, mismatches))
for bad in ([spec(T[5:25], primer=True), TEMPLATES[0]], [TEMPLATES[0], spec(T[5:25], primer=True), spec(T[5:25], primer=True)],
            [spec(T[5:25], primer=True), spec(T[5:25], primer=True), spec(T[5:25], primer=True)], [TEMPLATES[0], TEMPLATES[0], TEMPLATES[0]]):
    cases["pcr"].append({"frags": bad, "limit": 14, "mismatches": 0, "init": guard(lambda: A.PCRAssembly([build(s) for s in bad], 14, 0) and None)})

# ------------------------------------------------------------------------------------------ one fragment
def run_single(s, algo, limit):
    frags = [build(s)]
    out = {"frags": [s], "algorithm": algo, "limit": limit}
    made = guard(lambda: A.SingleFragmentAssembly(frags, limit, ALGOS[algo]))
    if "exc" in made:
        out["init"] = made
        return out
    asm = made["value"]
    out["graph"] = [[u, v, k, d["uid"]] for u, v, k, d in asm.G.edges(keys=True, data=True)]
    for kind in ("circular", "insertion", "inversion"):
        out[kind] = guard(lambda: edges(getattr(asm, f"get_{kind}_assemblies")()))
        out[f"{kind}:products"] = guard(lambda: [snap(p, frags) for p in getattr(asm, f"assemble_{kind}")()])
    out["linear"] = guard(lambda: asm.get_linear_assemblies())
    out["insertion:adjacent"] = guard(lambda: asm.get_insertion_assemblies(True))
    return out


r1, r2 = dna(16), dna(16)
SINGLES = [spec(r1 + dna(30) + r1, name="ends"), spec(dna(10) + r1 + dna(30) + r1 + dna(10), name="direct"),
           spec(dna(10) + r1 + dna(30) + rc(r1) + dna(10), name="inverted"), spec(dna(10) + r1 + dna(30) + rc(r1) + dna(10), circular=True, name="inverted_c"),
           spec(dna(10) + r1 + dna(30) + r1 + dna(10), circular=True, name="direct_c"), spec(dna(60), name="nothing"),
           spec(r1 + dna(12) + r2 + dna(12) + r1 + dna(12) + r2, name="two"),
           dict(spec(dna(10) + r1 + dna(30) + r1 + dna(10), name="feat"), features=[[0, 8, 1, "misc_feature", "before"], [30, 40, 1, "CDS", "looped_out"], [60, 70, -1, "gene", "after"]])]
for s in SINGLES:
    for limit in (12, 16):
        cases["single"].append(run_single(s, "common_sub_strings", limit))
for parts in LIG:
    for s in parts[:2]:
        cases["single"].append(run_single(s, "sticky", None))
        cases["single"].append(run_single(s, "sticky_blunt", None))
cases["single"].append({"frags": SINGLES[:2], "algorithm": "common_sub_strings", "limit": 12,
                        "init": guard(lambda: A.SingleFragmentAssembly([build(s) for s in SINGLES[:2]], 12) and None)})

# ------------------------------------------------------------------------------------------ the common methods
def method(name, frag_specs, **kw):
    frags = [build(s) for s in frag_specs]
    args = dict(kw)
    if "enzymes" in args:
        args["enzymes"] = [ENZYMES[n] for n in args["enzymes"]]
    cases["methods"].append({"fn": name, "frags": frag_specs, "kwargs": kw,
                             "result": guard(lambda: [snap(p, frags) for p in getattr(A, name)(frags, **args)])})


for frag_specs, limit in SETS:
    if not frag_specs:
        continue
    for name in ("gibson_assembly", "in_fusion_assembly", "fusion_pcr_assembly", "in_vivo_assembly"):
        for circular_only in (False, True):
            method(name, frag_specs, limit=limit, circular_only=circular_only)
for s in SINGLES:
    for name in ("gibson_assembly", "in_vivo_assembly"):
        for circular_only in (False, True):
            method(name, [s], limit=12, circular_only=circular_only)
# Gibson needs 5' ends chewed back: fragments with overhangs
ga, gb = overlapping(2, 50, 20, circular=True)
for trim in ((0, 0), (4, 0), (-4, 0), (0, 4), (0, -4)):
    xa = Dseq.from_full_sequence_and_overhangs(ga["watson"], trim[0], trim[1])
    for name in ("gibson_assembly", "in_fusion_assembly", "fusion_pcr_assembly"):
        method(name, [of_dseq(xa, "a"), gb], limit=15, circular_only=False)
for parts in LIG:
    order = parts[:]
    rng.shuffle(order)
    for blunt, partial, circular_only in itertools.product((False, True), repeat=3):
        method("ligation_assembly", order, allow_blunt=blunt, allow_partial_overlap=partial, circular_only=circular_only)
    method("ligation_assembly", order[:1], allow_blunt=True)

# restriction and ligation from uncut molecules
vector = spec(dna(30) + "GAATTC" + dna(12) + "GGATCC" + dna(30), circular=True, name="vector")
insert = spec(dna(8) + "GAATTC" + dna(40) + "GGATCC" + dna(8), name="insert")
insert_feat = dict(insert, features=[[16, 50, 1, "CDS", "cargo"], [0, 6, 1, "misc_feature", "lost"]])
same = spec(dna(8) + "GAATTC" + dna(40) + "GAATTC" + dna(8), name="insert2")
vector1 = spec(dna(30) + "GAATTC" + dna(40), circular=True, name="vector1")
for frag_specs, names in (([vector, insert], ["EcoRI", "BamHI"]), ([insert, vector], ["EcoRI", "BamHI"]), ([vector, insert_feat], ["EcoRI", "BamHI"]),
                          ([vector1, same], ["EcoRI"]), ([vector, insert], ["EcoRI"]), ([vector, insert], ["PstI"]), ([vector], ["EcoRI", "BamHI"]),
                          ([insert, same], ["EcoRI"]), ([vector, insert, same], ["EcoRI", "BamHI"])):
    for blunt, circular_only in itertools.product((True, False), repeat=2):
        method("restriction_ligation_assembly", frag_specs, enzymes=names, allow_blunt=blunt, circular_only=circular_only)
blunt_v = spec(dna(30) + "GATATC" + dna(30), circular=True, name="bv")
blunt_i = spec(dna(8) + "CCCGGG" + dna(30) + "GATATC" + dna(8), name="bi")
for blunt in (True, False):
    method("restriction_ligation_assembly", [blunt_v, blunt_i], enzymes=["EcoRV", "SmaI"], allow_blunt=blunt)
# Golden Gate: type IIS sites that cut outside themselves, with chosen four-base overhangs
o1, o2, o3 = "AATG", "GCTT", "CGAA"
gg_vector = spec(dna(25) + o3 + "T" + "GAGACC" + dna(15) + "GGTCTC" + "A" + o1 + dna(25), circular=True, name="acceptor")
gg_a = spec(dna(6) + "GGTCTC" + "A" + o1 + dna(30) + o2 + "T" + "GAGACC" + dna(6), name="part1")
gg_b = spec(dna(6) + "GGTCTC" + "A" + o2 + dna(30) + o3 + "T" + "GAGACC" + dna(6), name="part2")
for frag_specs in ([gg_vector, gg_a, gg_b], [gg_b, gg_vector, gg_a], [gg_a, gg_b], [gg_vector, gg_a]):
    for circular_only in (False, True):
        method("golden_gate_assembly", frag_specs, enzymes=["BsaI"], circular_only=circular_only)

# ------------------------------------------------------------------------------------------ Primer
def primer_snap(p):
    return {"seq": str(p.seq), "id": p.id, "name": p.name, "footprint": str(p.footprint), "tail": str(p.tail), "fp": p._fp,
            "repr": repr(p), "len": len(p), "position": p.position, "amplicon": p.amplicon}


for text in ("ACGTACGTACGTACGTACGTACGT", "ACGT", "acgtnACGU", ""):
    for footprint in (0, 4, 10, len(text) + 5):
        def run():
            p = Primer(text, id="pid", name="pname", footprint=footprint)
            out = {"new": primer_snap(p), "rc": primer_snap(p.reverse_complement())}
            out["slices"] = {f"{a}:{b}": guard(lambda: primer_snap(p[a:b])) for a, b in ((0, 5), (2, None), (None, -3), (-6, None), (5, 2), (None, None))}
            out["index"] = guard(lambda: str(p[0]))
            out["radd"] = guard(lambda: primer_snap("tttt" + p))
            return out
        cases["primer"].append({"text": text, "footprint": footprint, "result": guard(run)})
from pydna.seq import Seq as PSeq
from pydna.seqrecord import SeqRecord as PRec
cases["primer"].append({"from": "seq", "result": guard(lambda: primer_snap(Primer(PSeq("ACGTACGT"), id="a", name="b")))})
cases["primer"].append({"from": "record", "result": guard(lambda: primer_snap(Primer(PRec(PSeq("ACGTACGT"), id="a", name="b"), footprint=3)))})
cases["primer"].append({"from": "dseqrecord", "result": guard(lambda: primer_snap(Primer(Dseqrecord("ACGTACGT", id="a", name="b"))))})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0, sort_keys=True)
print({k: len(v) for k, v in cases.items()}, "->", os.path.relpath(OUT), os.path.getsize(OUT) // 1024, "kB")
