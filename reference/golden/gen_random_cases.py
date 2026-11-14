"""Golden cases for Python's `random` module -> packages/core/test/golden/random.json

`Bio.Nexus.Trees.Tree.randomize` and `Bio.Nexus.Nexus.Nexus.bootstrap` pick their output with
`random.choice`, `random.shuffle`, `random.randint` and `random.gauss`, so their results can only be
compared with Biopython's once the same bits come out of the Mersenne Twister in the same order. These
cases pin that down: the raw stream, every width `getrandbits` is asked for, the rejection loop behind
`randbelow`, and `gauss`'s habit of keeping its second value for the next call.
"""
import json, os, random

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "..", "packages", "core", "test", "golden", "random.json")

SEEDS = [0, 1, 7, 42, 88, 1234, 12345, 2 ** 31, 2 ** 32, 2 ** 32 + 1, 2 ** 64 - 1, 2 ** 97 + 12345,
         -1, -88, -(2 ** 40)]

cases = []


def case(**kw):
    """One case, with the seed as decimal text so that a seed above 2**53 survives JSON."""
    kw["seed"] = str(kw["seed"])
    cases.append(kw)

# the raw stream and the widths getrandbits is asked for
for seed in SEEDS:
    random.seed(seed)
    case(**{"kind": "random", "seed": seed, "values": [random.random() for _ in range(8)]})
    random.seed(seed)
    case(**{"kind": "getrandbits", "seed": seed, "widths": list(range(0, 54)),
                  "values": [random.getrandbits(k) for k in range(0, 54)]})
    random.seed(seed)
    # above 53 bits the values no longer fit a double, so the port answers with a big integer and the
    # case carries the decimal text
    widths = [54, 64, 65, 96, 128, 257]
    case(**{"kind": "getrandbits-big", "seed": seed, "widths": widths,
                  "values": [str(random.getrandbits(k)) for k in widths]})

# randbelow, through the two methods that reach it, including bounds that are one more than a power of two
# so that the rejection loop runs
for seed in (1, 88, 12345):
    for n in (1, 2, 3, 4, 5, 7, 8, 9, 17, 31, 32, 33, 100, 1000, 65537, 2 ** 31 + 1):
        random.seed(seed)
        case(**{"kind": "randrange", "seed": seed, "n": n,
                      "values": [random.randrange(n) for _ in range(12)]})
        random.seed(seed)
        case(**{"kind": "randint", "seed": seed, "a": 5, "b": 5 + n - 1,
                      "values": [random.randint(5, 5 + n - 1) for _ in range(12)]})

# choice and shuffle over lists of every length that changes the number of bits drawn
for seed in (1, 7, 88):
    for n in (1, 2, 3, 5, 8, 9, 16, 17, 33, 64):
        items = ["t%d" % i for i in range(n)]
        random.seed(seed)
        case(**{"kind": "choice", "seed": seed, "items": items,
                      "values": [random.choice(items) for _ in range(10)]})
        random.seed(seed)
        order = list(items)
        random.shuffle(order)
        case(**{"kind": "shuffle", "seed": seed, "items": items, "values": order})

# gauss: an odd number of calls leaves its second value behind, so the count matters
for seed in (1, 88, 12345):
    for count in (1, 2, 3, 4, 5, 10):
        random.seed(seed)
        case(**{"kind": "gauss", "seed": seed, "mu": 1.0, "sigma": 0.25,
                      "values": [random.gauss(1.0, 0.25) for _ in range(count)]})
    random.seed(seed)
    case(**{"kind": "gauss", "seed": seed, "mu": 0.0, "sigma": 1.0,
                  "values": [random.gauss() for _ in range(6)]})
    # seeding again in the middle throws away the value gauss was keeping
    random.seed(seed)
    first = [random.gauss(0.0, 1.0)]
    random.seed(seed)
    case(**{"kind": "gauss-reseed", "seed": seed, "values": first + [random.gauss(0.0, 1.0)]})

# an empty sequence
case(**{"kind": "choice-empty", "seed": 1, "items": [], "exc": "Cannot choose from an empty sequence"})
case(**{"kind": "randrange-empty", "seed": 1, "n": 0, "exc": "empty range for randrange()"})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(cases, open(OUT, "w"), indent=0)
print(len(cases), "random cases ->", OUT)
