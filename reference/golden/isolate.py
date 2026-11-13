"""Run one golden case in a forked child, so that a case cannot take the rest of the run with it.

Some of what Biopython is asked to do here ends in a signal rather than an exception: `PairwiseAligner`'s FOGSAA
algorithm segfaults on some inputs, and a case that leaves global state behind would otherwise colour the next one.
Forking per case keeps both contained.

Three outcomes are told apart, because they mean different things:

* The child answers. Its JSON comes back to the caller.
* The child raises. That is a fault in the generator, not a measurement, so `CaseFailed` is raised with the
  child's own traceback instead of being passed off as a crash.
* The child dies without answering (a signal, or no output at all). The case is tried again, up to `retries` more
  times, because such a death is not always repeatable: before this, a child that died once dropped its case in
  silence, which is why a regenerated golden file did not always match the committed one. A case that dies every
  time is reported and `None` is returned, which is how a generator skips the inputs that reliably crash.

Returning `None` is therefore a statement about the case, not about the weather, and every skip is printed.
"""
import json
import os
import sys
import traceback


class CaseFailed(RuntimeError):
    """A case's own code raised, so the generator cannot record what Biopython does with it."""


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


def run_isolated(fn, case, retries=2, in_child=None):
    """Run `fn(case)` in a forked child and return what it produced.

    `fn` is called with `case` and must return something JSON can hold. `retries` is how many further attempts to
    make when a child dies without answering; `in_child`, if given, runs inside the child before `fn`, which is how
    a generator silences the crash report of a case it expects to segfault.

    Returns what `fn` returned, or None when every attempt died without answering. Raises CaseFailed if `fn` itself
    raised, carrying the child's traceback, since that is the generator's own bug and not a measurement.
    """
    why = "not attempted"
    for _ in range(retries + 1):
        answer, why = _fork_once(fn, case, in_child)
        if why is None:          # `why` decides, not `answer`, which a case is free to leave empty
            return answer
    skipped.append((_describe(case), why))
    print(f"SKIPPED {_describe(case)}: {why} on every one of {retries + 1} attempts", file=sys.stderr)
    return None


def report_skipped():
    """Print a one-line summary of the cases that could not be run, for the end of a generator."""
    if skipped:
        print(f"{len(skipped)} case(s) could not be run: " + "; ".join(f"{what} ({why})" for what, why in skipped[:5]))
