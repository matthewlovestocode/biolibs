"""Golden cases for Bio.Align.substitution_matrices.Array.__array_ufunc__
-> packages/align/test/golden/ufunc.json

The method is Biopython's bookkeeping around NumPy: it unwraps the Array inputs, refusing a call whose
alphabets disagree, and puts the alphabet back on the results, leaving a result with no axes a bare number
and returning an `out` argument as it stands. These cases record that, for the ufuncs the port implements
and for each of the forms NumPy can call (`__call__`, `reduce`, `accumulate`, `outer` and `at`).
"""
import json, os
import numpy as np
from Bio.Align import substitution_matrices as sm

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "align", "test", "golden", "ufunc.json")

UFUNCS = {"add": np.add, "subtract": np.subtract, "multiply": np.multiply, "true_divide": np.true_divide,
          "floor_divide": np.floor_divide, "remainder": np.remainder, "maximum": np.maximum,
          "minimum": np.minimum, "exp": np.exp, "log": np.log, "sqrt": np.sqrt, "negative": np.negative,
          "absolute": np.absolute, "divmod": np.divmod}


def mark(v):
    """A scalar as the case records it: a Python int becomes {"int": n}, because NumPy's result type comes
    from the operand's type and not its value, and JavaScript cannot tell 2 from 2.0."""
    if isinstance(v, int) and not isinstance(v, bool):
        return {"int": v}
    return v


def build(spec):
    """An Array, a plain list or a number, from a case's description of it."""
    if isinstance(spec, dict) and "int" in spec:
        return spec["int"]
    if not isinstance(spec, dict):
        return spec
    alphabet = tuple(spec["alphabet"]) if isinstance(spec["alphabet"], list) else spec["alphabet"]
    a = sm.Array(alphabet=alphabet, dims=spec["dims"], dtype=int if spec.get("dtype") == "int" else float)
    data = spec["data"]
    if spec["dims"] == 1:
        for i, v in enumerate(data):
            np.ndarray.__setitem__(a, i, v)
    else:
        for i, row in enumerate(data):
            for j, v in enumerate(row):
                np.ndarray.__setitem__(a, (i, j), v)
    return a


def enc(x):
    """A result as JSON can hold it: the type, the alphabet if it kept one, the shape and the values."""
    if isinstance(x, list):
        return [enc(v) for v in x]
    if x is None:
        return None
    if isinstance(x, sm.Array):
        values = np.asarray(x).tolist()
        return {"array": True, "alphabet": x.alphabet if isinstance(x.alphabet, str) else list(x.alphabet),
                "dtype": "int" if np.issubdtype(x.dtype, np.integer) else "float",
                "shape": list(np.asarray(x).shape), "values": num(values)}
    if isinstance(x, np.ndarray):
        return {"array": False, "shape": list(x.shape), "values": num(x.tolist())}
    return {"scalar": num(float(x))}


def num(v):
    """Floats, with the ones JSON cannot hold written as text."""
    if isinstance(v, list):
        return [num(x) for x in v]
    v = float(v)
    if v != v:
        return "nan"
    if v in (float("inf"), float("-inf")):
        return "inf" if v > 0 else "-inf"
    return v


M = {"alphabet": "ABC", "dims": 2, "data": [[0.0, 1.0, 2.0], [3.0, 4.0, 5.0], [6.0, 7.0, 8.0]]}
MI = {"alphabet": "ABC", "dims": 2, "dtype": "int", "data": [[0, 1, 2], [3, 4, 5], [6, 7, 8]]}
V = {"alphabet": "ABC", "dims": 1, "data": [1.0, 2.0, 3.0]}
VI = {"alphabet": "ABC", "dims": 1, "dtype": "int", "data": [1, 2, 3]}
W = {"alphabet": "ABC", "dims": 1, "data": [-1.5, 0.0, 4.25]}
OTHER = {"alphabet": "ABD", "dims": 2, "data": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]}
TUPLE = {"alphabet": ["Ala", "Bet", "Cys"], "dims": 1, "data": [1.0, 2.0, 3.0]}

cases = []


def add(name, method, inputs, **kw):
    cases.append({"ufunc": name, "method": method, "inputs": [mark(v) for v in inputs], **kw})


# element-wise, over two matrices, a matrix and a number, and a matrix and a plain list
for name in ("add", "subtract", "multiply", "true_divide", "floor_divide", "remainder", "maximum",
             "minimum", "divmod"):
    add(name, "__call__", [M, M])
    add(name, "__call__", [M, 2.0])
    add(name, "__call__", [M, 2])
    add(name, "__call__", [2.0, M])
    add(name, "__call__", [V, V])
    add(name, "__call__", [M, V])
    add(name, "__call__", [V, [10.0, 20.0, 30.0]])
    add(name, "__call__", [MI, MI])
    add(name, "__call__", [MI, 2])
    add(name, "__call__", [MI, 2.0])
    add(name, "__call__", [VI, VI])
for name in ("exp", "log", "sqrt", "negative", "absolute"):
    add(name, "__call__", [V])
    add(name, "__call__", [W])
    add(name, "__call__", [M])
    add(name, "__call__", [VI])
# the tuple alphabet, which is compared by value
add("add", "__call__", [TUPLE, TUPLE])
add("multiply", "__call__", [TUPLE, 3.0])
# out
add("add", "__call__", [M, M], out=[M])
add("add", "__call__", [V, V], out=[V])
add("divmod", "__call__", [M, 2.0], out=[M, M])
add("divmod", "__call__", [M, 2.0], out=[M, None])
# reduce, accumulate and outer
for name in ("add", "multiply", "maximum", "minimum"):
    add(name, "reduce", [M])
    add(name, "reduce", [M], axis=1)
    add(name, "reduce", [V])
    add(name, "accumulate", [V])
    add(name, "accumulate", [M])
    add(name, "accumulate", [M], axis=1)
    add(name, "outer", [V, V])
    add(name, "outer", [VI, VI])
# at, which mutates its first argument and answers with nothing
add("add", "at", [V, 5.0], indices=[0])
add("add", "at", [V, 5.0], indices=[0, 2, 2])
add("add", "at", [M, 1.0], indices=[0, 2])
add("add", "at", [M, 1.0], indices=[0, 4])
add("multiply", "at", [V, 3.0], indices=[1])
# alphabets that disagree, in an input and in `out`
add("add", "__call__", [M, OTHER])
add("add", "__call__", [M, M], out=[OTHER])
add("add", "__call__", [M, TUPLE])

out = []
for case in cases:
    inputs = [build(spec) for spec in case["inputs"]]
    outs = None if case.get("out") is None else [build(spec) if spec else None for spec in case["out"]]
    ufunc = UFUNCS[case["ufunc"]]
    kwargs = {}
    if outs is not None:
        kwargs["out"] = tuple(outs)
    if "axis" in case:
        kwargs["axis"] = case["axis"]
    got = dict(case)
    try:
        if case["method"] == "at":
            # `np.add.at(a, indices, values)`: the values are the last input
            result = ufunc.at(inputs[0], case["indices"], *inputs[1:])
        elif case["method"] == "outer":
            result = ufunc.outer(*inputs, **kwargs)
        elif case["method"] in ("reduce", "accumulate"):
            result = getattr(ufunc, case["method"])(*inputs, **kwargs)
        else:
            result = ufunc(*inputs, **kwargs)
        got["result"] = enc(result)
        # `at` works in place, so what matters is the array afterwards
        if case["method"] == "at":
            got["after"] = enc(inputs[0])
        # an `out` argument is handed back; record what it holds now
        if outs is not None:
            got["out_after"] = [enc(o) for o in outs]
    except Exception as e:
        got["exc"] = {"type": type(e).__name__, "msg": str(e)}
    out.append(got)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), indent=0)
print(len(out), "ufunc cases;", sum("exc" in c for c in out), "raise ->", os.path.relpath(OUT))
