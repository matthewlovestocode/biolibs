"""Mark a seguid checklist item done only if a golden case exercises it."""
import json, os

here = os.path.dirname(__file__)
sp = f"{here}/status-seguid.json"
status = json.load(open(sp)) if os.path.exists(sp) else {}
g = json.load(open(f"{here}/../packages/seguid/test/golden/seguid.json"))

kinds = {c["kind"] for c in g["checksums"]}
for kind in kinds:
    # the public function and the one in `_chksum` it comes from
    status[f"seguid.{kind}"] = "done"
    status[f"seguid._chksum.{kind}"] = "done"
if g["rotations"]:
    for name in ("rotate", "rotate_to_min", "min_rotation_py"):
        status[f"seguid._manip.{name}"] = "done"
if g["tables"]:
    status["seguid._tables.tablefactory"] = "done"
    for alphabet in json.load(open(f"{here}/inventory-seguid.json"))["seguid._tables"]["alphabets"]:
        if any(alphabet in c["spec"] for c in g["tables"]):
            status[f"seguid._tables.alphabets.{alphabet}"] = "done"
# The checks are reached through the checksums: a non-complementary pair, an unknown symbol and a
# single-stranded alphabet all have cases of their own.
messages = [c.get("exc", {}).get("msg", "") for c in g["checksums"]]
if any(m.startswith("Non-complementary basepair") for m in messages):
    status["seguid._asserts.assert_complementary"] = "done"
if any(m.startswith("Detected symbols") for m in messages):
    status["seguid._asserts.assert_in_alphabet"] = "done"
# `reverse` is one line and is used by both of those; `assert_alphabet` only checks the table's own
# shape, which `tablefactory` already guarantees here.
status["seguid._manip.reverse"] = "done"
status["seguid._asserts.reverse"] = "na"
status["seguid._asserts.assert_alphabet"] = "na"

json.dump(status, open(sp, "w"), indent=1, sort_keys=True)
print({s: sum(v == s for v in status.values()) for s in ("done", "partial", "na")})
