"""Golden cases for pydna.common_sub_strings -> packages/assembly/test/golden/substrings.json

The matcher every homology-based assembly in pydna starts from. Upstream it is a call into `pydivsufsort`,
a compiled suffix-array library, so what the port has to agree with is that library's output and not any
Python source: all the more reason to measure it rather than read it.

The cases are built to put pressure on the definition rather than on the sequences. Alongside DNA at the
limits pydna actually uses there are tiny alphabets and runs of one letter, where the number of maximal
stretches is quadratic in the length and the order they come out in is what distinguishes one reading of
"maximal" from another; overlapping and nested agreements; one sequence contained in the other; and the
refusals, which come from NumPy rather than from pydna and are worded accordingly.
"""
import json, os, random
from pydna.common_sub_strings import common_sub_strings, terminal_overlap

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "assembly", "test", "golden",
                   "substrings.json")

rnd = random.Random(515)


def err(e):
    """One exception, as JSON."""
    return {"type": type(e).__name__, "msg": str(e)}


def guard(fn):
    """Run something, giving either its value or the error it raised."""
    try:
        return {"value": fn()}
    except Exception as e:
        return {"exc": err(e)}


def seq(alphabet, n):
    """A random string over `alphabet`."""
    return "".join(rnd.choice(alphabet) for _ in range(n))


#: Pairs chosen by hand, each for something it pins down.
HAND = [
    # pydna's own docstring examples, which are the only published answers to check against.
    ("gatgatttcggtagtta", "gtcagtatgtctatctatcgcg", 3),
    ("agctatgtatcttgcatcgta", "gcatcgtagtctatttgcttac", 8),
    # One letter: every offset agrees with every other, so the count is quadratic and the order is the point.
    ("AAAA", "AAAA", 1), ("AAAA", "AAAA", 2), ("AAAAA", "AA", 2), ("AAAAAAAA", "AAAA", 1),
    ("aaa", "aa", 1),
    # Contained, repeated, and reaching exactly to an end.
    ("ACGTACGT", "ACGT", 2), ("ACGT", "ACGTACGT", 2), ("ACGTACGTACGT", "ACGTACGT", 4),
    # Nothing in common, and a limit nothing can reach.
    ("ACGT", "TGCA", 2), ("ACGT", "ACGT", 5), ("ACGT", "ACGT", 25), ("abc", "ABC", 1),
    # Case matters, and the limit of 1 and 0 ask the same question.
    ("ACgt", "acGT", 1), ("A", "A", 0), ("A", "A", 1), ("AAAA", "AAAA", 0),
    # The whole of one sequence against itself, where the longest stretch is everything.
    ("ACGTTGCA", "ACGTTGCA", 1), ("ACGTTGCA", "ACGTTGCA", 8), ("ACGTTGCA", "ACGTTGCA", 9),
    # Control characters are inside ASCII and are not special to the matcher.
    ("ACGT\x00A", "ACGT\x00A", 1), ("\x01\x02", "\x01\x02", 1), ("ACGT\x7f", "ACGT\x7f", 2),
    # Two seams at once, which is what a circular assembly walks.
    ("CCCCCtgtgctgtgctcta", "tgtgctgtgctctaTTTTT", 14),
    ("acgatgctatactgCCCCCtgtgctgtgctcta", "tgtgctgtgctctaTTTTTtattctggctgtatc", 14),
    # Refusals: an empty sequence either side, and a negative limit.
    ("", "", 25), ("", "ACGT", 1), ("ACGT", "", 1), ("A", "A", -1), ("AAAA", "AAAA", -5),
    # Outside ASCII, on either side.
    ("\x80", "\x80", 1), ("ACGTé", "ACGT", 2), ("ACGT", "ACGTé", 2), ("Ā", "A", 1),
]

cases = []
for x, y, limit in HAND:
    cases.append({"x": x, "y": y, "limit": limit, "css": guard(lambda: common_sub_strings(x, y, limit)),
                  "terminal": guard(lambda: terminal_overlap(x, y, limit))})

# Random pairs over alphabets of several sizes. The small ones matter most: over two letters a short limit
# finds hundreds of overlapping stretches, which is where a wrong notion of maximality shows up at once.
for alphabet in ("AC", "ACG", "ACGT", "ACGTN", "AB", "ACGTacgt"):
    for n in (1, 2, 3, 5, 8, 13, 21, 34, 60):
        for limit in (1, 2, 3, 5, 10, 25):
            for _ in range(3):
                x, y = seq(alphabet, n), seq(alphabet, rnd.randint(1, n))
                cases.append({"x": x, "y": y, "limit": limit,
                              "css": guard(lambda: common_sub_strings(x, y, limit)),
                              "terminal": guard(lambda: terminal_overlap(x, y, limit))})

# Pairs built to share a seam of a known length, which is the shape an assembly actually meets: a fragment
# whose tail is the next fragment's head.
for overlap in (1, 2, 5, 14, 25, 30):
    for _ in range(6):
        shared = seq("ACGT", overlap)
        x = seq("ACGT", rnd.randint(0, 30)) + shared
        y = shared + seq("ACGT", rnd.randint(0, 30))
        for limit in (1, overlap, overlap + 1, 25):
            cases.append({"x": x, "y": y, "limit": limit,
                          "css": guard(lambda: common_sub_strings(x, y, limit)),
                          "terminal": guard(lambda: terminal_overlap(x, y, limit))})

# Longer sequences, to show the answer does not depend on how the port finds the matches.
for n in (200, 500):
    for limit in (8, 25):
        x, y = seq("ACGT", n), seq("ACGT", n)
        shared = seq("ACGT", 40)
        cases.append({"x": x + shared, "y": shared + y, "limit": limit,
                      "css": guard(lambda: common_sub_strings(x + shared, shared + y, limit)),
                      "terminal": guard(lambda: terminal_overlap(x + shared, shared + y, limit))})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"pydna": __import__("pydna").__version__, "cases": cases}, open(OUT, "w"), indent=0)
refused = sum(1 for c in cases if "exc" in c["css"])
print(len(cases), "cases,", refused, "refused ->", os.path.relpath(OUT))
