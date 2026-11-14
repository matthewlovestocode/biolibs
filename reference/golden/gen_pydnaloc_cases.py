"""Golden cases for pydna.utils' location helpers -> packages/dseqrecord/test/golden/pydna-locations.json

`shift_location` is the quiet one. Every time a circular molecule's origin moves -- which it does whenever
one is cut open, rotated or re-closed -- every feature on it has to be rewritten, and a feature spanning the
origin has to be split in two or joined back into one. Getting that wrong does not raise; it moves
annotations onto the wrong bases. So it is measured here on its own, over the shapes that make it decide:

* parts that land exactly on the origin, where `% lim or lim` chooses the end of the circle over the start;
* parts that run off the end and must be split, in both reading directions;
* compound locations whose consecutive parts have no bases between them, which is how Biopython writes a
  feature that already spanned an origin, and which `shift_location` joins back together;
* zero-length parts, which mark a position rather than a stretch;
* a linear location pushed below zero, which is refused because there is nowhere to wrap to.

The locations are built from their GenBank text so that the cases say what they are, and are recorded the
same way, with the parts listed separately because the text alone does not show how a compound location is
divided.
"""
import json, os, warnings
from Bio.SeqFeature import CompoundLocation, SeqFeature, SimpleLocation
from pydna.utils import flatten, location_boundaries, shift_feature, shift_location

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "dseqrecord", "test", "golden",
                   "pydna-locations.json")


def err(e):
    """One exception, as JSON."""
    return {"type": type(e).__name__, "msg": str(e)}


def guard(fn):
    """Run something, giving its value or the error it raised, with any warnings."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            out = {"value": fn()}
        except Exception as e:
            out = {"exc": err(e)}
    if caught:
        out["warnings"] = [[type(w.message).__name__, str(w.message)] for w in caught]
    return out


def enc(loc):
    """One location, as its text plus the parts it is divided into."""
    return {"str": str(loc), "cls": type(loc).__name__, "len": len(loc), "strand": loc.strand,
            "parts": [[int(p.start), int(p.end), p.strand] for p in loc.parts]}


#: Locations to move, each as `(start, end, strand)` or a list of those for a compound one.
SIMPLE = [(0, 3, 1), (0, 3, -1), (2, 5, 1), (2, 5, -1), (0, 10, 1), (5, 10, 1), (9, 10, 1),
          (0, 1, 1), (3, 3, 1), (0, 0, 1), (5, 5, -1), (0, 10, None), (4, 6, 0)]
#: Compound locations, including the adjacent-parts shape Biopython writes for an origin-spanning feature.
COMPOUND = [
    [(8, 10, 1), (0, 2, 1)],        # spans the origin of a 10-mer, forward
    [(0, 2, -1), (8, 10, -1)],      # the same, reverse, written in reading order
    [(1, 3, 1), (5, 7, 1)],         # two separate stretches
    [(0, 5, 1), (5, 10, 1)],        # adjacent: no bases between them, so a join candidate
    [(5, 10, -1), (0, 5, -1)],      # adjacent, reverse
    [(0, 3, 1), (3, 6, 1), (6, 9, 1)],
]
#: How far to move, and what length to wrap around.
SHIFTS = [0, 1, 2, 5, 9, 10, 11, -1, -2, -5, -10, 20]
LIMITS = [10, 6, 3, 1, None]

cases = []
for spec in SIMPLE:
    loc = SimpleLocation(*spec)
    for shift in SHIFTS:
        for lim in LIMITS:
            cases.append({"spec": [list(spec)], "shift": shift, "lim": lim,
                          "before": enc(loc),
                          "after": guard(lambda l=loc, s=shift, m=lim: enc(shift_location(l, s, m))),
                          "boundaries": guard(lambda l=loc: list(location_boundaries(l)))})
for spec in COMPOUND:
    loc = CompoundLocation([SimpleLocation(*p) for p in spec])
    for shift in SHIFTS:
        for lim in LIMITS:
            cases.append({"spec": [list(p) for p in spec], "shift": shift, "lim": lim,
                          "before": enc(loc),
                          "after": guard(lambda l=loc, s=shift, m=lim: enc(shift_location(l, s, m))),
                          "boundaries": guard(lambda l=loc: list(location_boundaries(l)))})

# shift_feature carries the type and the qualifiers across, and leaves the original alone.
features = []
for spec in [(2, 5, 1), (8, 10, 1)]:
    for shift, lim in [(1, 10), (-3, 10), (0, 10), (5, 10)]:
        def move(spec=spec, shift=shift, lim=lim):
            sf = SeqFeature(SimpleLocation(*spec), type="misc",
                            qualifiers={"label": ["a label"], "note": ["a note"]})
            moved = shift_feature(sf, shift, lim)
            return {"moved": enc(moved.location), "type": moved.type,
                    "qualifiers": {k: v for k, v in sorted(moved.qualifiers.items())},
                    "original_untouched": str(sf.location) == str(SimpleLocation(*spec))}
        features.append({"spec": list(spec), "shift": shift, "lim": lim, "result": guard(move)})

#: What flatten is given, and what it should leave alone.
FLAT = [[1, 2, 3], [[1, 2], [3]], [[[1]], 2], ["ab", ["cd"]], [], [[]], [[], [[], []]],
        [1, [2, [3, [4, [5]]]]]]
flats = [{"input": item, "result": guard(lambda i=item: flatten(i))} for item in FLAT]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"pydna": __import__("pydna").__version__, "cases": cases, "features": features,
           "flatten": flats}, open(OUT, "w"), indent=0, allow_nan=False)
refused = sum(1 for c in cases if "exc" in c["after"])
print(len(cases), "shifts,", refused, "refused,", len(features), "features,", len(flats),
      "flattens ->", os.path.relpath(OUT))
