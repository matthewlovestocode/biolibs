# @biolibs/opencloning

A cloning plan you can send to another lab — and that the other lab can **check** by running it again.

A plan is the molecules, the primers, and for each molecule the step that made it and what went into
it: the [OpenCloning](https://opencloning.org) data model, which is what pydna's `CloningStrategy`
serialises to. Give it a plasmid you built with [`@biolibs/assembly2`](../assembly2) and it writes the
whole history down; hand that document to someone else and `validate()` replays every step from the
parts and fails if the molecule the plan claims does not come out.

- **Write a plan** from the molecules at the end of it, history and all
- **Read one back**, whether it came from here, from pydna, or from the OpenCloning web interface
- **Replay it** — every step, from the inputs, with the products matched to the claims
- **Normalise it**, so that two labs' plans for the same construct can be compared
- **Draw it**, as the tree pydna prints
- Molecules travel as **GenBank files**, with the overhangs GenBank cannot express kept beside them

Steps that join DNA by recombination — Gateway, Cre-lox, the recombinases, CRISPR — cannot be replayed,
because [`@biolibs/assembly2`](../assembly2) does not do them yet.

## What is verified

A generator drives the real pydna and records the whole of each plan: the document it serialises to, the
molecules read back out of it, the printed history, the renumbering, and the verdict when every step is
replayed — for a product that really follows from its inputs and for one that does not.

| Upstream module | Items at parity | Checklist |
|---|---|---|
| `pydna.opencloning_models` | **41 / 44** | [pydna.opencloning_models.md](../../docs/parity-pydna/pydna.opencloning_models.md) |

**14 whole plans and 16 locations** against pydna 5.5.16: Gibson with two and three fragments, In-Fusion,
fusion PCR, in-vivo assembly, ligation, restriction-ligation, Golden Gate, PCR with and without the
primers marked, two multi-step plans, a renumbering, and a plan whose product does not follow from its
steps. Each plan is compared as a document, as records read back, as a history, as a normalised
document, and as a verdict.

Where the claim stops:

- **Only the steps `@biolibs/assembly2` can run are replayable.** A plan may hold other kinds of step —
  a sequence fetched from Addgene, a Gateway reaction — and this reads and writes them as data, but
  `validate()` refuses to pretend it checked one.
- **Identifiers are the records' own.** pydna numbers sequences by `id()`, the memory address of the
  Python object, and renumbers them on the way out; a port has no such thing, so a record's `id` must
  be a number, or `assignIds` must be set. This is what pydna's
  `id_mode(use_python_internal_id=False)` does.
- **`figure()` is not ported**, nor `get_ncbi_format_coordinates`.

## Install

```bash
npm install @biolibs/opencloning
```

```mermaid
graph BT
  opencloning["@biolibs/opencloning"] --> assembly2["@biolibs/assembly2<br/><i>runs the steps</i>"]
  opencloning --> seqio["@biolibs/seqio<br/><i>GenBank in and out</i>"]
  opencloning --> dseqrecord["@biolibs/dseqrecord"]
  opencloning --> restriction["@biolibs/restriction"]
```

## Writing a plan down

```ts
import { Dseqrecord } from "@biolibs/dseqrecord";
import { gibsonAssembly } from "@biolibs/assembly2";
import { CloningStrategy } from "@biolibs/opencloning";

// Three 50-base windows of one 75-base circle, each sharing its last 25 bases with the next.
const first = new Dseqrecord("GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA", false, undefined, "1", "f1");
const second = new Dseqrecord("CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC", false, undefined, "2", "f2");
const third = new Dseqrecord("GAGGGTGCTTCAGAGTATGTATACCGGATCACAGTCTACACTGCTCACTC", false, undefined, "3", "f3");

const [plasmid] = gibsonAssembly([first, second, third], 25, true);
plasmid.id = "100";

const plan = CloningStrategy.fromRecords([plasmid], { description: "a 75 bp circle" });

console.log(plan.sequences.length, plan.sources.length);        // 4 4 — the plasmid and its three parts
console.log(plan.sources[0]?.type);                             // "GibsonAssemblySource"
console.log(plan.sources[1]?.type);                             // "ManuallyTypedSource" — a part nobody made
console.log(plan.idsOfSequencesThatAreNotInputs());             // [100], what the plan ends with
```

The document is plain data, ready to be sent:

```ts
const sent = JSON.stringify(plan.document);
console.log(JSON.parse(sent).schema_version);                   // "1.0.0"
```

## Checking one that arrives

This is the part that matters. Nothing here trusts the document: every step is run again from its
inputs, through the same engine that would have made it in the first place.

```ts
import { CloningStrategy } from "@biolibs/opencloning";

const received = CloningStrategy.fromDocument(JSON.parse(sent));

received.validate();                            // throws if any step does not make what it claims
const [rebuilt] = received.toRecords();
console.log(rebuilt.circular, rebuilt.length);  // true 75
console.log(rebuilt.seguid());                  // cdseguid=sYESdtpVMj71Meubth63wObHHwE
```

A plan whose product does not follow from its parts is refused, and the error names the step:

```ts
import { ValueError } from "@biolibs/core";

const tampered = JSON.parse(sent) as { sequences: { id: number; file_content: string }[] };
const product = tampered.sequences.find((one) => one.id === 100)!;
product.file_content = product.file_content.replace("ggatcacagt", "ggatcacagc");

try {
  CloningStrategy.fromDocument(tampered as never).validate();
} catch (error) {
  console.log(error instanceof ValueError);     // true
  console.log((error as Error).message);
  // Result sequence does not match any of the 1 product(s) from GibsonAssemblySource
}
```

## Drawing one

```ts
import { history } from "@biolibs/opencloning";

console.log(history(plasmid));
// ╙── name (Dseqrecord(o75))
//     └─╼ GibsonAssemblySource
//         ├─╼ f1 (Dseqrecord(-50))
//         ├─╼ f2 (Dseqrecord(-50))
//         └─╼ f3 (Dseqrecord(-50))
```

## Normalising one

A circle has no beginning, and a fragment can be written down from either strand. Two labs can describe
the same construct differently, so `normalize()` replaces every molecule with the one its own step
makes, matched by checksum — which is invariant to both.

```ts
const normalised = received.normalize();
console.log(normalised.sequences.length);                          // 4
console.log(normalised.idsOfSequencesThatAreNotInputs().length);   // 1
```

## A plan with more than one step

The history is followed all the way back, so a product made from another product carries both steps, and
replaying it replays both.

```ts
import { Primer, pcrAssembly } from "@biolibs/assembly2";

const amplified = pcrAssembly(template, forwardPrimer, reversePrimer, false, 20);
amplified[0]!.id = "50";

const [construct] = gibsonAssembly([backbone, amplified[0]!], 20, true);
construct.id = "101";

const twoStep = CloningStrategy.fromRecords([construct], { description: "amplify, then assemble" });
console.log(twoStep.sources.map((one) => one.type));
// [ "GibsonAssemblySource", "ManuallyTypedSource", "PCRSource", "ManuallyTypedSource" ]
console.log(twoStep.primers.length);    // 2
twoStep.validate();                     // replays the PCR, then the assembly
```

## From Python

| Python | TypeScript |
|---|---|
| `CloningStrategy.from_dseqrecords(records, description)` | `CloningStrategy.fromRecords(records, { description })` |
| `strategy.model_dump_json()` | `JSON.stringify(strategy.document)` |
| `CloningStrategy(**json.loads(text))` | `CloningStrategy.fromDocument(JSON.parse(text))` |
| `strategy.to_dseqrecords()` | `strategy.toRecords()` |
| `strategy.validate()` | `strategy.validate()` |
| `strategy.normalize()` | `strategy.normalize()` |
| `strategy.reassign_ids()` | `strategy.reassignIds()` |
| `record.history()` | `history(record)` |
| `record.validate_history()` | `validateHistory(record)` |
| `record.normalize_history()` | `normalizeHistory(record)` |
| `SequenceLocationStr.from_biopython_location(loc)` | `locationText(location)` |
| `id_mode(use_python_internal_id=False)` | always, since a port has no `id()` |
| `source.figure()` | not ported |

## Testing

```bash
npm test                 # the whole workspace
npx vitest run packages/opencloning/test
```

| File | What it checks |
|---|---|
| `test/opencloning.test.ts` | the recorded plans from pydna 5.5.16 |
| `test/readme.test.ts` | every code block in this file |

## Things to know

- **A molecule travels as a GenBank file**, so its bases come back in lower case. Molecules are compared
  without regard to case, as pydna compares them.
- **Overhangs travel beside the file**, in `overhang_crick_3prime` and `overhang_watson_3prime`, because
  GenBank has no way to write a sticky end.
- **`validate()` is not a safety check.** It says the molecules follow from the parts as described. It
  says nothing about whether the parts are what they claim to be, or whether the work was done.
- **`normalize()` rebuilds the molecules**, so a plan that has been normalised carries its products as
  its own steps leave them, not as they were written down.

## License

MIT — see [LICENSE](LICENSE).
