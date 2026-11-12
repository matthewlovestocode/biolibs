import { describe, expect, it } from "vitest";
import { Nexus, NexusError, Tree, combine, safename } from "@biolibs/nexus";

const TEXT = "#NEXUS\nbegin data;\ndimensions ntax=2 nchar=4;\nformat datatype=dna missing=? gap=-;\nmatrix\na ACGT\nb AC-T\n;\nend;\n";

describe("Nexus", () => {
  it("reads taxa and matrix", () => {
    const n = new Nexus(TEXT);
    expect(n.taxlabels).toEqual(["a", "b"]);
    expect(String(n.matrix!.get("b"))).toBe("AC-T");
  });
  it("writes to anything with write()", () => {
    let out = "";
    new Nexus(TEXT).writeNexusData({ filename: { write: (t: string) => (out += t) } });
    expect(out).toContain("dimensions ntax=2 nchar=4;");
  });
  it("refuses file names", () => {
    expect(() => new Nexus(TEXT).writeNexusData({ filename: "x.nex" as never })).toThrow(TypeError);
  });
  it("reports malformed input as NexusError", () => {
    expect(() => new Nexus("#NEXUS\nbegin data;\nbogus;\nend;")).toThrow(NexusError);
  });
  it("combines matrices", () => {
    const c = combine([["x", new Nexus(TEXT)], ["y", new Nexus(TEXT)]])!;
    expect(c.nchar).toBe(8);
  });
});

describe("Tree and helpers", () => {
  it("parses Newick", () => {
    const t = new Tree("((a,b),c)");
    expect(t.getTaxa()!.sort()).toEqual(["a", "b", "c"]);
    expect(t.countTerminals()).toBe(3);
  });
  it("quotes names", () => {
    expect(safename("a b")).toBe("'a b'");
  });
});
