# Parity checklists

Every item is ticked only when a recorded case proves it: the real Python library is run to capture what it
does, and the TypeScript tests replay that. The lists are generated from those cases, not maintained by
hand. [`reference/README.md`](reference/README.md) describes how.

| Upstream | Verified | Checklist |
|---|---|---|
| Biopython 1.88 | 2,345 / 2,345 | [docs/parity/](docs/parity/README.md) |
| pydna 5.5.16 | 222 / 225 | [docs/parity-pydna/](docs/parity-pydna/README.md) |
| seguid | 23 / 23 | [docs/parity-seguid/](docs/parity-seguid/README.md) |

Each library is counted on its own; parity with one says nothing about parity with another.
