"""Golden cases for scipy.optimize.minimize(method="L-BFGS-B")
-> packages/align/test/golden/lbfgsb.json

Bio.Align.analysis's ML method hands its likelihood to this optimizer, so the port has to walk the same
path through it. Every objective here is a polynomial, computed with plain Python arithmetic in the same
order the TypeScript uses, so the two sides see bit-identical values and any divergence in the recorded
trace of evaluation points is the optimizer's own.
"""
import json, os
import numpy as np
from scipy.optimize import minimize

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "..", "packages", "align", "test", "golden", "lbfgsb.json")


def quad(x, c, w):
    total = 0.0
    for i in range(len(x)):
        total = total + w[i] * (x[i] - c[i]) * (x[i] - c[i])
    return total


def quartic(x, c, w):
    total = 0.0
    for i in range(len(x)):
        d = x[i] - c[i]
        total = total + w[i] * d * d * d * d
    return total


def rosen(x):
    total = 0.0
    for i in range(len(x) - 1):
        a = x[i + 1] - x[i] * x[i]
        b = 1.0 - x[i]
        total = total + 100.0 * a * a + b * b
    return total


def beale(x):
    a = 1.5 - x[0] + x[0] * x[1]
    b = 2.25 - x[0] + x[0] * x[1] * x[1]
    c = 2.625 - x[0] + x[0] * x[1] * x[1] * x[1]
    return a * a + b * b + c * c


def himmelblau(x):
    a = x[0] * x[0] + x[1] - 11.0
    b = x[0] + x[1] * x[1] - 7.0
    return a * a + b * b


def powell(x):
    a = x[0] + 10.0 * x[1]
    b = x[2] - x[3]
    c = x[1] - 2.0 * x[2]
    d = x[0] - x[3]
    return a * a + 5.0 * b * b + c * c * c * c + 10.0 * d * d * d * d


def trid(x):
    total = (x[0] - 1.0) * (x[0] - 1.0)
    for i in range(1, len(x)):
        total = total + (x[i] - 1.0) * (x[i] - 1.0) - x[i] * x[i - 1]
    return total


FUNCS = {
    "quad": lambda x, p: quad(x, p["c"], p["w"]),
    "quartic": lambda x, p: quartic(x, p["c"], p["w"]),
    "rosen": lambda x, p: rosen(x),
    "beale": lambda x, p: beale(x),
    "himmelblau": lambda x, p: himmelblau(x),
    "powell": lambda x, p: powell(x),
    "trid": lambda x, p: trid(x),
}

cases = []


def add(name, x0, bounds, params=None, **options):
    cases.append({"func": name, "x0": x0, "bounds": bounds, "params": params or {}, "options": options})


# unbounded and boxed quadratics, including a start outside the box and a variable pinned by equal bounds
add("quad", [0.0, 0.0], None, {"c": [1.0, -2.0], "w": [1.0, 3.0]})
add("quad", [0.0, 0.0], [[-1.0, 0.5], [-1.0, 1.0]], {"c": [1.0, -2.0], "w": [1.0, 3.0]})
add("quad", [5.0, 5.0], [[-1.0, 0.5], [-1.0, 1.0]], {"c": [1.0, -2.0], "w": [1.0, 3.0]})
add("quad", [0.0, 0.0], [[0.25, 0.25], [None, 1.0]], {"c": [1.0, -2.0], "w": [1.0, 3.0]})
add("quad", [1.0, 0.1, 2.0], None, {"c": [0.3, 0.7, -0.2], "w": [1.0, 100.0, 0.01]})
add("quad", [1.0, 0.1, 2.0], [[1e-10, 20.0], [1e-10, 20.0], [1e-10, 10.0]],
    {"c": [0.3, 0.7, -0.2], "w": [1.0, 100.0, 0.01]}, ftol=1e-5, gtol=1e-5)
add("quad", [1.0, 0.1], [[1e-10, 20.0], [1e-10, 20.0]], {"c": [-1.0, 5.0], "w": [2.0, 0.5]},
    ftol=1e-5, gtol=1e-5)
# quartics: a flat minimum stresses the line search
add("quartic", [1.0, 1.0], None, {"c": [0.0, 0.5], "w": [1.0, 2.0]})
add("quartic", [1.0, 1.0], [[0.1, 5.0], [0.1, 5.0]], {"c": [0.0, 0.5], "w": [1.0, 2.0]})
add("quartic", [3.0, -3.0, 1.0], None, {"c": [1.0, 1.0, 1.0], "w": [1.0, 1.0, 1.0]}, ftol=1e-5, gtol=1e-5)
# Rosenbrock in two to six variables, free and boxed
for n in (2, 3, 4, 6):
    add("rosen", [-1.2 if i % 2 == 0 else 1.0 for i in range(n)], None)
    add("rosen", [-1.2 if i % 2 == 0 else 1.0 for i in range(n)], [[-2.0, 0.8]] * n)
    add("rosen", [0.5] * n, [[0.0, None]] * n)
    add("rosen", [-1.2 if i % 2 == 0 else 1.0 for i in range(n)], None, ftol=1e-5, gtol=1e-5)
# the classic two-variable test functions, from several starts
for x0 in ([1.0, 1.0], [3.0, 0.5], [-2.0, -2.0]):
    add("beale", x0, None)
    add("beale", x0, [[-4.5, 4.5], [-4.5, 4.5]])
    add("himmelblau", x0, None)
    add("himmelblau", x0, [[0.0, 5.0], [None, 2.0]])
add("powell", [3.0, -1.0, 0.0, 1.0], None)
add("powell", [3.0, -1.0, 0.0, 1.0], [[-1.0, 2.0], [-1.0, 2.0], [-1.0, 2.0], [-1.0, 2.0]])
add("powell", [3.0, -1.0, 0.0, 1.0], None, maxiter=5)
add("trid", [0.0] * 5, None)
add("trid", [0.0] * 5, [[-5.0, 5.0]] * 5, ftol=1e-5, gtol=1e-5)
add("trid", [0.0] * 8, None, maxfun=40)
# tolerances and budgets of their own
add("rosen", [-1.2, 1.0], None, maxiter=3)
add("rosen", [-1.2, 1.0], None, maxcor=2)
add("rosen", [-1.2, 1.0], None, maxls=3)
add("rosen", [-1.2, 1.0], None, eps=1e-6)
add("quad", [0.0, 0.0], None, {"c": [1.0, -2.0], "w": [1.0, 3.0]}, eps=1e-10)
# every variable fixed by its bounds: scipy answers without running the optimizer at all, and its result
# carries no jac, nit or status
add("quad", [0.0, 0.0], [[0.3, 0.3], [0.5, 0.5]], {"c": [1.0, -2.0], "w": [1.0, 3.0]})

def enc(v):
    """A float as JSON can hold it: a NaN or an infinity becomes its Python repr as a string."""
    v = float(v)
    if v != v:
        return "nan"
    if v in (float("inf"), float("-inf")):
        return "inf" if v > 0 else "-inf"
    return v


out = []
for case in cases:
    trace = []
    f = FUNCS[case["func"]]

    def wrapped(x, f=f, params=case["params"], trace=trace):
        trace.append([enc(v) for v in x])
        return f(list(x), params)

    bounds = None if case["bounds"] is None else [tuple(b) for b in case["bounds"]]
    options = dict(case["options"])
    tol = None
    res = minimize(wrapped, np.array(case["x0"]), method="L-BFGS-B", bounds=bounds, tol=tol,
                   options=options)
    got = dict(case, trace=trace, x=[enc(v) for v in res.x], fun=enc(res.fun),
               nfev=int(res.nfev), success=bool(res.success))
    # The all-fixed shortcut returns a result without these three.
    got["jac"] = [enc(v) for v in res.jac] if "jac" in res else None
    got["nit"] = int(res.nit) if "nit" in res else None
    got["status"] = int(res.status) if "status" in res else None
    out.append(got)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), indent=0)
print(len(out), "L-BFGS-B cases;", sum(len(c["trace"]) for c in out), "evaluations traced")
