# @biolibs/assembly2

A TypeScript port of pydna's assembly engine, `pydna.assembly2`, with `pydna.primer` and the part of `pydna.utils` the engine rests on. **89 of 105 applicable items** are at parity, verified against pydna 5.5.16 with **1,197 recorded cases** — 502 of the helpers, 283 of the seven cloning methods, 198 of `Assembly` itself, 110 of the overlap finders, 46 of PCR, 39 of a single fragment on its own and 19 of `Primer`. The sixteen items not ported are the ones that join DNA by recombination: Gateway, Cre-lox, the recombinases, CRISPR, and the integration helpers they share. See [the checklist](parity-pydna/pydna.assembly2.md), and [the package README](../packages/assembly2/README.md) for the API with worked examples.

```ts
import { Dseqrecord } from "@biolibs/dseqrecord";
import { gibsonAssembly, ligationAssembly, pcrAssembly, Primer } from "@biolibs/assembly2";

const [plasmid] = gibsonAssembly([first, second, third], 25, true);   // Python: gibson_assembly(...)
plasmid.circular;                                                     // true
plasmid.source?.input.length;                                         // 3, and where each joined

ligationAssembly(cutFragments, false, false, true);                   // sticky ends that fit
pcrAssembly(template, new Primer("..."), new Primer("..."));          // a template and two primers
```

## How it works

The fragments become a graph: a node for each one in each of its two orientations, an edge wherever the overlap finder says two of them meet. A path through that graph is a linear molecule, a cycle is a plasmid, and a cycle that passes through one fragment twice is an insertion into it. Each cloning method is the same engine with a different finder — a shared stretch at the ends for Gibson, complementary overhangs for a ligation, the ends an enzyme would leave for Golden Gate — so the methods differ only in where a join is allowed.

Every product carries a `source`: which fragments went in, which way round, and the stretch of each that was shared with its neighbours. That is the record a cloning plan is replayed from.

## The order of the products

pydna returns products in the order the graph search finds them, and callers take `products[0]`, so the order is part of the answer. Reproducing it is most of what this port does.

networkx drives its cycle search one strongly connected component at a time and picks the node to start from with `next(iter(component))`, where the component is a Python `set`. For small integers CPython's iteration order is wherever the values land in its hash table, which is neither insertion order nor sorted order once negative numbers are in play. So `pyset.ts` is a port of CPython's set — the probe sequence, the growth rule and the iteration — checked against CPython 3.15 over 40,000 random insertion sequences, and `graph.ts`, `traverse.ts` and `cycles.ts` are ports of the networkx searches that use it. None of this is affected by `PYTHONHASHSEED`, which randomises the hashing of text and not of integers; the golden file is byte-identical under a different seed.

## From Python

- **Not ported:** `gateway_assembly`, `cre_lox_integration`, `cre_lox_excision`, `cre_lox_excision_or_inversion`, `recombinase_assembly`, `recombinase_integration`, `recombinase_excision`, `recombinase_excision_or_inversion`, `crispr_integration`, `homologous_recombination_integration`, `homologous_recombination_excision`, `homologous_recombination_excision_or_inversion`, `common_function_integration_products`, `common_function_excision_or_inversion_products`, `common_handle_insertion_fragments`, `assembly_is_multi_site`. Joining fragments by shared homology *is* ported, and is what `inVivoAssembly` does.
- **The provenance is the engine's half of pydna's.** pydna's `source` also maps onto the [OpenCloning](https://opencloning.org) data model, which records where each input itself came from and serialises a whole project to JSON. That layer, and `CloningStrategy` with it, is not ported yet.
- **A record holds a `Dseq`, which is not a `Seq`**, so where pydna assigns to `record.seq` this builds a new record (`withSeq`). Chewing an end back leaves the molecule the same length, so the features keep their places.
- **Errors.** `ValueError` is core's. `NotImplementedError` is defined here, for the combinations pydna refuses — a PCR has no circular products, one fragment has no linear ones. pydna's bare `Exception` for an unknown assembly format is a `BioError` named `Exception`. `TypeError` is JavaScript's own.
- **`Primer`'s footprint and tail are strings**, where pydna gives a `Seq` for one and `""` for the other.

## Source layout

```
packages/assembly2/src/
  algorithms.ts   commonSubStrings, terminalOverlap, gibsonOverlap, inFusionOverlap, pcrFusionOverlap,
                  stickyEndSubStrings, bluntOverlap, restrictionLigationOverlap, endsFromCutsite
  assembly.ts     Assembly: the graph, the walks, what is refused
  single.ts       SingleFragmentAssembly: circularising, splicing, inverting
  pcr.ts          PCRAssembly, pcrAssembly, primerTemplateOverlap, zipMatchLeftwards/Rightwards
  methods.ts      gibsonAssembly, inFusionAssembly, fusionPcrAssembly, inVivoAssembly,
                  ligationAssembly, restrictionLigationAssembly, goldenGateAssembly
  assemble.ts     turning a walk into a molecule, and the two ways of writing one down
  insertion.ts    the shapes an insertion can take, and the overlapping-arms edge case
  source.ts       AssemblySource: the provenance a product carries
  primer.ts       Primer, with its footprint and tail
  fragment.ts     what the engine assembles: a molecule, or a primer
  locations.ts    stretches of a molecule, on a line and round a circle
  pyutils.ts      sumIsSticky, deduplicate, isSublist, circularPermutationMinAbs
  graph.ts        MultiDiGraph, DiGraph, subgraph views, with networkx's ordering
  traverse.ts     components and every simple path
  cycles.ts       every simple cycle, bounded and unbounded
  pyset.ts        CPython's set of integers, for its iteration order
```

Golden cases: `packages/assembly2/test/golden/assembly2.json`, built by `reference/golden/gen_assembly2_cases.py`.
