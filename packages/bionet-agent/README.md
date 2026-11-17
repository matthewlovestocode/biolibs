# @biolibs/bionet-agent

A lab's adviser: what an agent with no hands can read of a [Bionet](../bionet) lab, work out with
the lab's own tools, and propose for a person to carry out — served to it over the
[Model Context Protocol](https://modelcontextprotocol.io) from the device that hosts it.

An agent is good at seeing the whole of a cloning plan at once and bad at holding a pipette. So it
is let into a lab as what it is: a member that can propose and cannot do. It designs the primers,
works out what the PCR would make with the same engine the lab's windows use, and proposes the run.
A person finds the proposal at the thermocycler with its reasons, sets the bench up from it, reads
the working their own tools give, and does it or does not. What really happened is theirs to record.

## What keeps it to that

- **Its key has the role `adviser`.** In `@biolibs/bionet`, an adviser may add a part, propose a
  run, and set aside a proposal of its own. Anything else it signs is refused where the logs are
  merged, on every device and on the lab's peer. This is not something this package enforces; it is
  something this package cannot get round.
- **It has a key of its own.** The device that hosts it keeps a second key for it
  (`hostAdviser` in `@biolibs/bionet-client`). What it writes is in its own log under its own name,
  never the person's, and a keeper has to let that key into the lab before it can write at all.
- **There is no tool for the rest.** Nothing here records a run, uses a tube, moves one, or touches
  the roster.
- **The door is shut by default.** `serveAgent` listens on `127.0.0.1` only, wants a bearer token on
  every request, and refuses anything that says it comes from a web page or is addressed to another
  name for this machine.

## Install

```sh
npm install @biolibs/bionet-agent
```

## Serving the tools

```ts
import { Lab, memoryKeys, memoryStore } from "@biolibs/bionet-client";
import { agentTools, newAgentToken, serveAgent } from "@biolibs/bionet-agent";

// A device that can host an adviser is one given somewhere to keep its key.
const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
await lab.setPerson("Ada");
await lab.found({ name: "The Wren Lab" });

// Two decisions, both a person's: host one, and let it in.
const { key } = await lab.hostAdviser();
await lab.addMember({ key, person: "Claude", role: "adviser" });

const token = newAgentToken();
const server = await serveAgent({ tools: agentTools(lab), token });
server.url;       // http://127.0.0.1:<port>/mcp
```

Connect an agent to it with the URL and the token as a bearer token. For Claude Code:

```sh
claude mcp add --transport http bionet http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

The Bionet desktop app does all of this from its Adviser tab, keeps the token sealed by the
system's keychain, and puts that command on the clipboard without showing the token.

## The tools

| Tool | What it does |
|---|---|
| `lab_overview` | Which lab, whether the adviser is in it, what it holds, its instruments |
| `list_parts`, `get_part` | The parts, and one read closely: sequence, features, tubes |
| `list_tubes` | Every tube: what it is, how much is left, where it is |
| `list_runs` | What has been done at the bench, failures included |
| `list_proposals` | What has been proposed, by whom, and what became of it |
| `find_cutters` | Which enzymes cut a part, and where |
| `design_primers` | A pair for a stretch or a feature, with why each won and what to watch for |
| `work_out_pcr`, `work_out_digest`, `work_out_ligation` | What each would give, from the lab's own engines |
| `list_strains` | What the lab keeps alive, what has been put into it, and the cultures of each |
| `translate_gene` | The protein a gene codes for, and what its sequence says about it |
| `work_out_induction` | The protein growing a culture would make, its mass, and where its band should run |
| `propose_transformation` | Propose putting a construct into a living host |
| `propose_induction` | Propose growing a culture and turning its promoter on |
| `add_part` | Say a sequence is a part, such as a primer just designed. Adds no tube |
| `propose_pcr`, `propose_digest`, `propose_ligation` | Propose a run. Nothing is used or recorded as done |
| `withdraw_proposal` | Take back a proposal of its own |
| `search_proteins`, `look_up_protein` | What UniProt knows about a protein: its mature chain, its modified residues, its variants |
| `work_out_phosphorylation` | Which residues would be phosphorylated, and whether the host has the enzyme |
| `search_papers` | Search the literature at Europe PMC: PubMed, PMC, preprints and patents together |
| `read_paper` | Read an open-access paper: its abstract, a named section such as the methods, or its tables |
| `papers_around` | What a paper cited, and who has cited it since |
| `search_ncbi` | Search NCBI's nucleotide, protein, gene or pubmed databases by keyword |
| `fetch_from_ncbi` | Read one record by accession: its sequence, and what it says is marked on it |
| `keep_from_ncbi` | Keep one as a part, with what the record says is marked on it. No tube |

`add_part`, `keep_from_ncbi`, the `propose_` tools and `withdraw_proposal` are the only ones
that write. A
proposal may count on a part there is no tube of yet; it then says that the part has to be ordered
or made first.

### Whether the protein will work, not just whether it gets made

`look_up_protein` and `work_out_phosphorylation` go to UniProt and to the motif rules. They answer the
question a project to make a milk protein actually turns on, which is not the question of whether the
host will express it.

`look_up_protein` gives the **mature chain** apart from the precursor — different lengths, different
masses, and the band a lab should look for is the chain's — and every residue that carries something
after the protein is made, counted both on the entry (how a paper cites it) and on the chain (how a
lab holding it counts). It says whether a curator read the entry or a machine inferred it.

`work_out_phosphorylation` applies the kinase motifs, compares them against what the curator recorded,
and says whether the host has the enzyme at all. The comparison is the useful part: on bovine
β-casein the rule reproduces every recorded site, which is the reason to believe it on a variant
nobody has studied. The host answer is explicitly not computed, and says so.

### Reading what other people did

`search_papers`, `read_paper` and `papers_around` go to Europe PMC. They are what turns "which host
should we express this in?" from something an adviser answers out of whatever it happens to know into
something it answers with a paper: this group used this host with this promoter and got this much,
here is the section that says so, here is where to read it.

`read_paper` with `section: "methods"` is the one that earns its place. A paper's methods are where
the recipe is — which strain, which plasmid, what the medium was, what it was induced with and for how
long — and it comes back as prose, with the citation markers taken out and the tables kept apart.
Most papers are not open access; a search result says plainly whether its full text can be read, and
for the rest there is the abstract and a link.

The arc the tools are for runs from a gene to a protein: find it, design the primers, work out the PCR,
design the assembly, rewrite it in the host's codons, check the read against the design, put it into a
host, and grow that host to make the protein. The last step is the one where the adviser has least to
say and should say so: `work_out_induction` gives the protein the gene codes for and the mass to look
for, and predicts no yield, because nothing in a sequence predicts one.

### Looking something up

The last three are the only ones that reach outside the lab, to NCBI's public databases. They are
what lets an adviser answer a question the freezer says nothing about: which genes a protein is
made by, what a reference sequence for one is called, what has been published about it.

```ts
const tools = agentTools(lab, { outside: { tool: "bionet-adviser" } });
// or leave them out entirely:
agentTools(lab, { outside: { outside: false } });
```

- **Nothing of the lab's goes out.** Only the search term or the accession is sent. A term is capped
  at 200 characters, which is short enough that a sequence cannot be pasted into one.
- **NCBI is told the software's name** and nothing about the lab or the person at it. It asks every
  client for an address to contact about heavy use; pass `email` only if somebody has given one for
  that, and never take one from the lab.
- **Nothing comes in by itself.** `fetch_from_ncbi` hands a record back to be read and keeps nothing.
  `keep_from_ncbi` is the one that keeps it, and what lands is what NCBI returned rather than
  anything the agent retyped. It adds no tube.
- **What your lab has said stands.** An adviser may say what is marked on a part nobody has
  described, and may not change what somebody has marked — including when the two are written at the
  same moment. So keeping a record whose sequence your lab already describes leaves your reading
  alone, and the answer says that it did.
- **What comes back is what somebody deposited**, not something the lab has checked. The adviser is
  told to say so.

## Showing it at work

`agentTools(lab, { watch })` tells `watch` of every use, with where in the lab it would be seen:
a part being read, a digest being worked out at the gel station. It is shaped like a stop on the
demo's walk, which is how a bench is already told what to show.

## Things to know

- **What it reads is data.** Names, notes and features were typed by lab members and by other labs.
  The instructions the server gives an agent say to treat them as data and never as instructions;
  an agent you connect should be one that does.
- **Before it is let in** the adviser can read and work things out. Anything it tries to write
  says that a keeper has to let it in.
- **If a keeper makes its key a member or a keeper**, the device stops writing with it. A hosted
  key is for advising.
- **Every device should be on `@biolibs/bionet` 1.5 or later** before an adviser adds parts: an
  older one does not see what an adviser writes.

## License

MIT
