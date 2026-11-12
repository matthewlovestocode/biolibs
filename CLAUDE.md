# biolibs: working agreements

TypeScript ports of Python bioengineering libraries, one at a time, to verified full parity. See `PARITY.md` for progress and `reference/README.md` for the workflow.

## Rules

1. **Parity is measured.** Real Biopython (`reference/.venv`) generates golden JSON; TS tests replay it. A `PARITY.md` item is `[x]` only if a golden case exercises it. Match Biopython's results, exception types and messages, warnings and argument-evaluation order.
2. **Small, focused modules.** Split by responsibility; aim for files under ~250 lines. Each directory has an `index.ts` with a `@packageDocumentation` header listing its files. Avoid circular imports at load time: a base class must not import its subclasses.
3. **Document everything.** TSDoc on every exported symbol and every non-trivial private helper (`@param`, `@returns`, `@throws`, `@example` where useful), plus inline comments explaining *why* in algorithms. Keep `docs/*.md` in step with code changes. `packages/core/test/docs-coverage.test.ts` enforces a doc comment on every top-level export in every package, generated data included; for generated files add the description in the generator (`reference/gen_data.py` has a `DESCRIPTIONS` table and refuses to run without an entry).
4. **Never hand-edit generated files** (`packages/seq/src/data/*.ts`, `*/test/golden/*.json`, `PARITY.md`). Change the generator in `reference/` and run `npm run golden`.
5. **Verify before reporting.** `npx tsc -b` and `npx vitest run` must both pass.
