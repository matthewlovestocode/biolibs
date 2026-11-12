import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CodonTable as CT, IUPACData } from "@biolibs/seq";
import { KeyError } from "@biolibs/core";

const data = JSON.parse(readFileSync(new URL("./golden/codon-table.json", import.meta.url), "utf8"));

const REG: Record<string, [Map<number, CT.CodonTable>, Map<string, CT.CodonTable>]> = {
  unambiguous_dna: [CT.unambiguousDnaById, CT.unambiguousDnaByName],
  unambiguous_rna: [CT.unambiguousRnaById, CT.unambiguousRnaByName],
  generic: [CT.genericById, CT.genericByName],
  ambiguous_dna: [CT.ambiguousDnaById, CT.ambiguousDnaByName],
  ambiguous_rna: [CT.ambiguousRnaById, CT.ambiguousRnaByName],
  ambiguous_generic: [CT.ambiguousGenericById, CT.ambiguousGenericByName],
};

/** Run `f`, mapping Biopython's lookup errors to the "!K" / "!T" / "!V:msg" markers used in the golden data. */
const outcome = (f: () => string | undefined): string => {
  try {
    return String(f());
  } catch (e) {
    if (e instanceof KeyError) return "!K";
    if (e instanceof CT.TranslationError) return "!T";
    if ((e as Error).name === "ValueError") return "!V:" + (e as Error).message;
    throw e;
  }
};

describe(`Bio.Data.CodonTable parity with Biopython ${data.biopython}`, () => {
  for (const [kind, reg] of Object.entries<any>(data.registries)) {
    const [byId, byName] = REG[kind]!;
    describe(kind, () => {
      it("registers the same ids and names in the same order", () => {
        expect([...byId.keys()]).toEqual(reg.id_order);
        expect([...byName.keys()]).toEqual(reg.name_order);
      });
      for (const [id, want] of Object.entries<any>(reg.tables)) {
        it(`table ${id}`, () => {
          const t = byId.get(Number(id))!;
          expect(t.id).toBe(want.id);
          expect(t.names).toEqual(want.names);
          expect(t.constructor.name).toBe(want.class);
          expect(t.nucleotideAlphabet).toBe(want.nucleotide_alphabet);
          expect(t.proteinAlphabet).toBe(want.protein_alphabet);
          expect(t.startCodons).toEqual(want.start_codons);
          expect(t.stopCodons).toEqual(want.stop_codons);
          expect([...t.backTable].map(([k, v]) => [k === null ? "$none" : k, v])).toEqual(want.back_table);
          expect(t.toString()).toBe(want.str);
          if ("repr" in want) expect((t as CT.NCBICodonTable).repr()).toBe(want.repr);
          if (want.forward_table) expect([...(t.forwardTable as Map<string, string>)]).toEqual(want.forward_table);
          if (want.lookups) {
            const bad: string[] = [];
            for (const [codon, expected] of Object.entries<string>(want.lookups)) {
              const got = [
                outcome(() => t.forwardTable.getItem(codon)),
                outcome(() => (t.forwardTable.has(codon) ? "1" : "0")),
                outcome(() => t.forwardTable.get(codon, "?")),
              ].join("|");
              if (got !== expected) bad.push(`${JSON.stringify(codon)}: expected ${expected}, got ${got}`);
            }
            expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
          }
        });
      }
    });
  }

  it("make_back_table", () => {
    for (const c of data.functions.make_back_table) {
      const got = [...CT.makeBackTable(c.table, c.stop)].map(([k, v]) => [k === null ? "$none" : k, v]);
      expect(got).toEqual(c.result);
    }
  });

  it("list_ambiguous_codons", () => {
    const vals: Record<string, Record<string, string>> = {
      ambiguous_dna_values: IUPACData.ambiguousDnaValues,
      ambiguous_rna_values: IUPACData.ambiguousRnaValues,
    };
    for (const c of data.functions.list_ambiguous_codons) {
      expect(CT.listAmbiguousCodons(c.codons, vals[c.values]!)).toEqual(c.result);
    }
  });

  it("list_possible_proteins", () => {
    const bad: string[] = [];
    for (const c of data.functions.list_possible_proteins) {
      const table = CT.unambiguousDnaById.get(c.table)!.forwardTable as Map<string, string>;
      let got: unknown;
      try {
        got = CT.listPossibleProteins(c.codon, table, IUPACData.ambiguousDnaValues);
      } catch (e) {
        const err = e as Error;
        got =
          e instanceof KeyError
            ? `!K:${err.message}`
            : e instanceof CT.TranslationError
              ? `!T:${err.message}`
              : err.name === "ValueError"
                ? `!V:${err.message}`
                : `?${err.name}`;
      }
      if (JSON.stringify(got) !== JSON.stringify(c.result)) {
        bad.push(`${c.table} ${c.codon}: expected ${JSON.stringify(c.result)}, got ${JSON.stringify(got)}`);
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });
});

describe("custom NCBI tables built directly", () => {
  const ctors: Record<string, any> = { NCBICodonTableDNA: CT.NCBICodonTableDNA, NCBICodonTableRNA: CT.NCBICodonTableRNA, NCBICodonTable: CT.NCBICodonTable };
  for (const c of data.custom) {
    it(`${c.cls}(${c.args[0]})`, () => {
      const [id, names, table, start, stop] = c.args;
      const t = new ctors[c.cls](id, names, table, start, stop);
      expect(t.toString()).toBe(c.str);
      expect(t.repr()).toBe(c.repr);
      expect([...t.backTable].map(([k, v]: [string | null, string]) => [k === null ? "$none" : k, v])).toEqual(c.back);
      expect(t.nucleotideAlphabet).toBe(c.alphabet);
    });
  }
});

describe("Bio.Data.IUPACData constants", () => {
  const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  for (const [name, want] of Object.entries<unknown>(data.iupac)) {
    it(name, () => expect((IUPACData as Record<string, unknown>)[camel(name)]).toEqual(want));
  }
});
