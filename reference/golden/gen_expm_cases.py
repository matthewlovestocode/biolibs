"""Golden cases for the matrix exponential -> packages/align/test/golden/expm.json

`Bio.Align.analysis`'s YN00 and ML methods both go through `scipy.linalg.expm`, so a port of them needs one.
The cases are scipy's own output over matrices of every size and norm the algorithm branches on: the five Pade
orders it chooses between, the scaling-and-squaring path above them, and the rate matrices YN00 itself builds.
"""
import json, os, random
import numpy as np
from scipy.linalg import expm

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "expm.json")
rnd = random.Random(20260211)
np.random.seed(11)
cases = []

def enc(x):
    """JSON has no syntax for the values a matrix exponential can overflow to."""
    x = float(x)
    if x != x: return "nan"
    if x == float("inf"): return "inf"
    if x == float("-inf"): return "-inf"
    return x

def add(kind, m):
    m = np.asarray(m, dtype=float)
    cases.append({"kind": kind, "n": m.shape[0], "a": [[enc(v) for v in row] for row in m],
                  "e": [[enc(v) for v in row] for row in expm(m)]})

# Small matrices with norms either side of each Pade threshold (0.0149, 0.254, 0.950, 2.098, 4.25).
for scale in (0.0, 1e-12, 1e-6, 0.001, 0.0149, 0.015, 0.1, 0.25, 0.26, 0.5, 0.9, 0.95, 0.96, 2.0, 2.1,
              4.0, 4.25, 4.3, 10.0, 100.0, 1e4):
    for n in (1, 2, 3, 5, 8):
        base = np.random.randn(n, n)
        norm = max(np.abs(base).sum(axis=0).max(), 1e-300)
        add("scaled", base * (scale / norm))
# Shapes the algorithm treats specially: diagonal, triangular, nilpotent, symmetric, zero and identity.
for n in (2, 4, 6):
    add("diagonal", np.diag(np.random.randn(n)))
    add("triangular", np.triu(np.random.randn(n, n)))
    add("symmetric", (lambda b: b + b.T)(np.random.randn(n, n)))
    add("zero", np.zeros((n, n)))
    add("identity", np.eye(n))
nil = np.zeros((4, 4))
nil[0, 1] = nil[1, 2] = nil[2, 3] = 1.0
add("nilpotent", nil)
add("single", [[2.5]])
add("single_negative", [[-7.25]])

# A rate matrix of the shape YN00 and ML build: rows summing to zero, strongly diagonal.
def rate_matrix(n, t):
    q = np.abs(np.random.randn(n, n)) * 0.05
    np.fill_diagonal(q, 0.0)
    np.fill_diagonal(q, -q.sum(axis=1))
    return q * t
for n in (4, 20, 61, 64):
    for t in (0.0, 0.01, 0.5, 1.0, 5.0, 50.0):
        add("rate", rate_matrix(n, t))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"scipy": __import__("scipy").__version__, "cases": cases}, open(OUT, "w"))
print(len(cases), "cases ->", OUT)
