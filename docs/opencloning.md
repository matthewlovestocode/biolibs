# @biolibs/opencloning

A TypeScript port of `pydna.opencloning_models`: a cloning plan written down in the [OpenCloning](https://opencloning.org) data model, and — the point of writing one down — run again to check that the molecules really follow from the parts. **41 of 44 applicable items** are at parity, verified against pydna 5.5.16 with **14 whole plans and 16 locations**, each plan compared as a document, as the records read back out of it, as a printed history, as a normalised document, and as a verdict. The three items not ported are two `figure` methods and `get_ncbi_format_coordinates`. See [the checklist](parity-pydna/pydna.opencloning_models.md), and [the package README](../packages/opencloning/README.md) for the API with worked examples.

```ts
import { CloningStrategy } from "@biolibs/opencloning";

const plan = CloningStrategy.fromRecords([plasmid], { description: "my construct" });
const sent = JSON.stringify(plan.document);          // Python: strategy.model_dump_json()

// somewhere else
const received = CloningStrategy.fromDocument(JSON.parse(sent));
received.validate();                                 // throws unless every step makes what it claims
const [rebuilt] = received.toRecords();
```

## What a plan is

Three lists and a description. **Sequences** are molecules, each as a GenBank file with its overhangs noted beside it, because GenBank cannot write a sticky end. **Primers** are the short pieces a PCR used. **Sources** are the steps: one per sequence, saying how that sequence was made and which of the others went into it, by identifier. A molecule nobody made — a part that was simply had — gets a `ManuallyTypedSource` with no inputs, which is where a plan bottoms out.

`validate()` walks from the molecules the plan ends with back to those leaves, running every step again through [`@biolibs/assembly2`](assembly2.md) and checking that the molecule the plan claims is among the products — by the molecule itself *and* by the step's own record of which fragment joined where. `normalize()` does the same but keeps the replay's product, matched by SEGUID checksum, which is invariant to where a circle was cut open and to which strand is called the upper one; that is what lets two labs' plans for one construct be compared.

## Reading what somebody else wrote

The format is only worth having if another tool writes it too. Four plans are handed to
`opencloning_linkml` 1.0.0, the library the OpenCloning data model is defined by, and written back out
by it: that library emits them byte for byte as this port does, and replaying its output here gives the
same molecules — with the fields shuffled as well, since another writer will not order them this way.
The OpenCloning *web application* has not been tried; it is the data model that is shown to agree.

## Signing a plan, which is not pydna's

Replaying a plan answers whether the molecules follow from the parts. It says nothing about who sent it, and in a network of labs that second question matters too — so three files here are additions rather than ports, marked as such where they begin: `signature.ts`, `keys.ts` and `canonical.ts`.

A signature cannot be put inside a plan: the data model forbids fields it does not define, and `opencloning_linkml` rejects a document carrying one. So a signed plan wraps it — `{ signed_plan_version, plan, signatures }`, where `plan` is byte for byte the document that library accepts. Unwrap it and interoperation is exactly as it was.

What is signed is not the document as it happens to be serialised but a canonical form of it: object keys sorted, no insignificant space, following RFC 8785 for everything a plan can hold, and refusing a fractional number rather than guessing at how it should be written. Two programs holding the same plan therefore sign the same bytes, which has to be true here, because this port and the official library already order their fields differently. Each signature covers the plan together with its own `signer` and `signed_at`, under a domain string, so one signature cannot be lifted onto another plan or into another protocol, and a second key can countersign — a lab that has run someone else's plan saying so.

Keys are Ed25519 through Web Crypto, present in Node 20 and in current browsers, so the same key signs in a script and in a page; the public half is 32 bytes, short enough to travel in a link beside the plan. `keyFingerprint` names a key in four groups of hex for a person to compare out loud.

**What a signature means is narrow and worth stating.** It means whoever holds this key put their name to this exact plan. It does not mean the key belongs to a lab, that the lab did the work, or that the plan is a good one; `signer` is a label its holder chose. Binding a key to a lab means obtaining that key from somewhere you already trust the lab to speak from — a published, signed inventory, which is the next layer and is not built yet. The two checks belong together: a signature without a replay is an accountable claim that may be wrong, a replay without a signature is a sound plan from nobody.

## From Python

- **Identifiers are the records' own.** pydna numbers sequences by `id()` — the memory address of the Python object — and renumbers them on the way out, so the same plan written twice in one session can carry different numbers. A port has no object identity, so a record's `id` must be a number, which is what pydna's `id_mode(use_python_internal_id=False)` asks for. `fromRecords(records, { assignIds: true })` numbers whatever is not numbered, in the order the plan reaches it.
- **Not every step can be replayed.** A plan may hold steps this stack does not do — a sequence fetched from Addgene, a Gateway reaction — and they are carried as data. `validate()` refuses rather than pretending.
- **Not ported:** `Source.figure`, `PCRSource.figure` and `SequenceLocationStr.get_ncbi_format_coordinates`.
- **A molecule comes back in lower case**, because GenBank writes it that way; molecules are compared without regard to case, as pydna compares them.

## What this port found in the ones below it

Writing plans and replaying them exercised `@biolibs/dseqrecord` harder than its own cases did, and turned up four places where it differed from pydna. Each is fixed, with cases added that would have caught it:

- Joining two records kept the left one's **identifiers**, where Biopython keeps one only when both records agree on it.
- Joining kept the left one's **annotations** too, where Biopython keeps only what both agree on and takes the union of the cross-references.
- pydna turns every **annotation into text** as it builds a record, so a `keywords` of `[""]` read out of a GenBank file becomes the five characters `['']` and is written back out that way. The port left it a list.
- **Reverse complementing** carried the annotations over, where Biopython leaves them behind.

The first three change what a plan's GenBank text says, so they would have made this port's documents differ from pydna's; the fourth decides whether an annotation survives a later join.

## Source layout

```
packages/opencloning/src/
  strategy.ts    CloningStrategy: writing a plan, reading one, replaying it, normalising it
  sources.ts     one step: written down, read back, run again; validate and normalize
  sequences.ts   molecules and primers in and out of a plan
  locations.ts   where two fragments were joined, as GenBank writes a position
  history.ts     the plan drawn as a tree
  model.ts       the shape of the document itself

  signature.ts   not pydna's: signing a plan, checking a signature on one
  keys.ts        not pydna's: Ed25519 keys, kept and named
  canonical.ts   not pydna's: one document, one string of bytes
```

Golden cases: `packages/opencloning/test/golden/opencloning.json`, built by `reference/golden/gen_opencloning_cases.py`.
