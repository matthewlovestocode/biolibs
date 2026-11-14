"""Run one golden case in a forked child, so that a case cannot take the rest of the run with it.

Some of what Biopython is asked to do here ends in a signal rather than an exception: `PairwiseAligner`'s FOGSAA
algorithm segfaults on some inputs, and a case that leaves global state behind would otherwise colour the next one.
Forking per case keeps both contained.

Three outcomes are told apart, because they mean different things:

* The child answers. Its JSON comes back to the caller.
* The child raises. That is a fault in the generator, not a measurement, so `CaseFailed` is raised with the
  child's own traceback instead of being passed off as a crash.
* The child dies without answering (a signal, or no output at all). The case is tried again, up to `retries` more
  times; then, if the generator offered one, in a brand-new interpreter. A case that survives none of that is
  reported, and what happens then is the caller's decision: `CaseDied` is raised unless the caller passed
  `expect_death=True`, in which case `None` is returned, which is how the generators whose inputs really do crash
  Biopython skip them.

## Why a fresh interpreter, and not just more retries

Retrying was not enough. `Bio.motifs` has a case that dies of SIGSEGV or SIGABRT on *all ten* attempts in about one
run in three, and comes through untouched in the others. It is not the case's fault: run on its own in a fresh
interpreter it survives two hundred forks out of two hundred. What decides is the state three thousand earlier cases
have left in the parent, together with the layout that run happens to have -- fork gives the child all of it, and
some of it is not safe to inherit. Excluding the case does not help either, since the next unlucky one takes its
place: with that case gone the failure rate fell from about one run in three to about one in twelve, which is the
hazard moving, not going away.

So the last resort is to leave the parent out of it. `fresh_eval` lets a generator say "you can re-run me from
scratch for one case": `run_isolated` then starts a new interpreter on the generator's own file with
`ISOLATE_EVAL` set, writes the case to its stdin and reads the answer out of the file it names. The new process has run nothing, so it
inherits nothing. `eval_entrypoint` is the other half, which the generator calls once, after its runners are
defined and before it builds any cases.

A generator that does not do this still works; it is just left with the retries, and a run that loses a case stops
rather than quietly writing a smaller file.
"""
import json
import os
import subprocess
import sys
import tempfile
import traceback


class CaseFailed(RuntimeError):
    """A case's own code raised, so the generator cannot record what Biopython does with it."""


class CaseDied(RuntimeError):
    """Every attempt at a case died without answering, and the generator did not say it expected that.

    Raised rather than returned, because the alternative is a golden file that is a case or two shorter than the
    committed one for no reason the file itself records.
    """


#: Cases that died every time they were tried, as `(what, why)` pairs, for a generator to report at the end.
skipped: list[tuple[str, str]] = []


def _describe(case):
    """A short, readable name for a case, for the warning when one cannot be run."""
    if isinstance(case, dict):
        for field in ("kind", "op", "format", "fmt", "name", "mode"):
            if field in case:
                return f"{field}={case[field]!r}"
        return ", ".join(sorted(case)[:3])
    return repr(case)[:60]


def _fork_once(fn, case, in_child):
    """One attempt. Returns `(answer, None)`, or `(None, why)` when the child died without answering."""
    r, w = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(r)
        try:
            if in_child is not None:
                in_child()
            try:
                payload = json.dumps({"ok": fn(case)})
            except BaseException:
                # Report it rather than dying mutely, so the parent can raise it with the traceback intact.
                payload = json.dumps({"raised": traceback.format_exc()})
            os.write(w, payload.encode())
        finally:
            os._exit(0)
    os.close(w)
    chunks = []
    while True:
        block = os.read(r, 1 << 20)
        if not block:
            break
        chunks.append(block)
    os.close(r)
    _, status = os.waitpid(pid, 0)
    if os.WIFSIGNALED(status):
        return None, f"killed by signal {os.WTERMSIG(status)}"
    if not chunks:
        return None, f"wrote nothing (exit status {os.WEXITSTATUS(status)})"
    try:
        answer = json.loads(b"".join(chunks))
    except json.JSONDecodeError as e:
        return None, f"wrote {sum(len(c) for c in chunks)} bytes that are not JSON ({e})"
    if "raised" in answer:
        raise CaseFailed(f"{_describe(case)} raised in its child process:\n{answer['raised']}")
    return answer["ok"], None


def eval_entrypoint(runners):
    """If this process was started to evaluate a single case, do that and exit; otherwise return.

    A generator calls this once, after its runner functions are defined and before it builds any cases, passing
    `{name: runner}`. When `run_isolated` has run out of forks it starts the generator's file again with
    `ISOLATE_EVAL` naming one of those runners, and this is where that new process turns round: it reads the case
    from stdin, answers on stdout and exits without building anything.

    :param runners: The runners this generator offers by name, as `run_isolated`'s `fresh_eval` will name them.
    """
    name = os.environ.get("ISOLATE_EVAL")
    if not name:
        return
    case = json.load(sys.stdin)
    try:
        payload = {"ok": runners[name](case)}
    except BaseException:
        payload = {"raised": traceback.format_exc()}
    # To a file, not to stdout: a generator is free to print on its way here, and the answer must not be mixed
    # in with whatever it said.
    with open(os.environ["ISOLATE_EVAL_OUT"], "w") as f:
        json.dump(payload, f)
    sys.exit(0)


def _eval_fresh(name, case):
    """One attempt in a brand-new interpreter. Returns `(answer, None)`, or `(None, why)`.

    The new process runs the generator's own file with `ISOLATE_EVAL` set, so `eval_entrypoint` answers before any
    case is built. Nothing of this process is inherited, which is the point: what kills these children is the state
    the parent has accumulated, not the case.
    """
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "answer.json")
        env = dict(os.environ, ISOLATE_EVAL=name, ISOLATE_EVAL_OUT=out)
        try:
            p = subprocess.run([sys.executable, sys.argv[0]], input=json.dumps(case), env=env,
                               capture_output=True, text=True, timeout=600)
        except subprocess.TimeoutExpired:
            return None, "a fresh interpreter did not finish within 600s"
        if p.returncode != 0 or not os.path.exists(out):
            return None, f"a fresh interpreter exited with {p.returncode} ({p.stderr.strip()[-200:]})"
        try:
            with open(out) as f:
                answer = json.load(f)
        except json.JSONDecodeError as e:
            return None, f"a fresh interpreter wrote what is not JSON ({e})"
    if "raised" in answer:
        raise CaseFailed(f"{_describe(case)} raised in a fresh interpreter:\n{answer['raised']}")
    return answer["ok"], None


def run_isolated(fn, case, retries=9, in_child=None, expect_death=False, fresh_eval=None):
    """Run `fn(case)` in a forked child and return what it produced.

    `fn` is called with `case` and must return something JSON can hold. `retries` is how many further attempts to
    make when a child dies without answering; `in_child`, if given, runs inside the child before `fn`, which is how
    a generator silences the crash report of a case it expects to segfault.

    `fresh_eval`, if given, is the name under which this generator registered `fn` with `eval_entrypoint`. When
    every fork has died, the case is tried once more in a new interpreter started on the generator's own file,
    which inherits none of this process's state -- the only thing that reliably saves the cases whose children die
    on every attempt. Leave it out and only the forks are tried.

    `expect_death` says what a case that dies everywhere means. Left False, it means the run has lost coverage it
    had before, so `CaseDied` is raised and the generator stops without writing a shorter file. Set True by the
    generators whose inputs really do crash Biopython -- the FOGSAA aligner and what builds on it -- it means the
    case is one of those, and `None` comes back for the generator to record as unrunnable.

    Returns what `fn` returned, or None when every attempt died and `expect_death` is set.
    Raises CaseFailed if `fn` itself raised, carrying the child's traceback, since that is the generator's own bug
    and not a measurement; CaseDied if every attempt died and the generator did not expect that.
    """
    why = "not attempted"
    for _ in range(retries + 1):
        answer, why = _fork_once(fn, case, in_child)
        if why is None:          # `why` decides, not `answer`, which a case is free to leave empty
            return answer
    attempts = f"{why} on every one of {retries + 1} attempts"
    if fresh_eval is not None:
        answer, fresh_why = _eval_fresh(fresh_eval, case)
        if fresh_why is None:
            return answer
        attempts += f", then {fresh_why}"
    if not expect_death:
        raise CaseDied(
            f"{_describe(case)} {attempts}.\nThis case was measurable before, so the golden file this run would "
            f"write is short of the committed one. Nothing has been written. Run it again: these deaths are not "
            f"always repeatable.\nThe case was:\n{json.dumps(case, default=repr)[:4000]}")
    skipped.append((_describe(case), why))
    print(f"SKIPPED {_describe(case)}: {attempts}", file=sys.stderr)
    return None


def report_skipped():
    """Print a one-line summary of the cases that could not be run, for the end of a generator."""
    if skipped:
        print(f"{len(skipped)} case(s) could not be run: " + "; ".join(f"{what} ({why})" for what, why in skipped[:5]))
