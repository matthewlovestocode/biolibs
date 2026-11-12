/** The NEXUS file parser (the reading half of Biopython's `Bio.Nexus.Nexus.Nexus`). */

import { IUPACData, Seq } from "@biolibs/seq";
import { IndexError, KeyError, ValueError, pyFloat, pyInt, pyStrip, pySplit } from "@biolibs/core";
import { CharBuffer } from "./char-buffer.js";
import { NexusError, PyAttributeError, StopIteration } from "./errors.js";
import { Block, Commandline, getCommandLines, makeUnique, quotestrip, replaceParenthesizedAmbigs, safename, uniqueLabel } from "./helpers.js";
import { StandardData } from "./standard-data.js";
import { Tree } from "./trees.js";

/** Blocks the parser understands. */
export const KNOWN_NEXUS_BLOCKS = ["trees", "data", "characters", "taxa", "sets", "codons"];
/** Set type: characters. */
export const CHARSET = "chars";
/** Set type: taxa. */
export const TAXSET = "taxa";
/** Name of the codon position partition. */
export const CODONPOSITIONS = "codonpositions";
/** What an empty `Nexus()` reads. */
export const DEFAULTNEXUS = "#NEXUS\nbegin data; dimensions ntax=0 nchar=0; format datatype=dna; end; ";

/** A sequence row of the matrix. */
export type MatrixRow = Seq | StandardData;
/** Options of a command: a dictionary of keywords, or the raw text for special commands. */
type Options = Map<string, string | null> | string;

/** `x in options` for a keyword dictionary. */
const has = (options: Options, key: string): boolean => (options instanceof Map ? options.has(key) : options.includes(key));
/** `options[key]` for a keyword dictionary. */
const get = (options: Options, key: string): string | null => {
  if (!(options instanceof Map)) throw new TypeError("string indices must be integers, not 'str'");
  return options.get(key) ?? null;
};
/** Python `int(text, 10)`. */
const int10 = (text: string | null): number => {
  if (text === null) throw new TypeError("int() can't convert non-string with explicit base");
  return pyInt(text);
};

/** Part of the NEXUS reader: state and the command handlers. Use {@link Nexus}. */
export class NexusParser {
  ntax = 0;
  nchar = 0;
  unalteredTaxlabels: string[] = [];
  taxlabels: string[] = [];
  charlabels: Map<number, string | null> | null = null;
  statelabels: Map<number, (string | null)[]> | null = null;
  datatype = "dna";
  respectcase = false;
  missing = "?";
  gap = "-";
  symbols: string | string[] | null = null;
  equate: string | null = null;
  matchchar: string | null = null;
  labels: string | null = null;
  transpose = false;
  interleave = false;
  tokens = false;
  eliminate: Options | null = null;
  matrix: Map<string, MatrixRow> | null = null;
  unknownBlocks: Block[] = [];
  taxsets = new Map<string, string[]>();
  charsets = new Map<string, number[]>();
  charpartitions = new Map<string, Map<string, number[]>>();
  taxpartitions = new Map<string, Map<string, string[]>>();
  trees: Tree[] = [];
  translate: Map<number, string | null> | null = null;
  structured: Block[] = [];
  set: Options = new Map();
  options: Options = new Map<string, string | null>([["gapmode", "missing"]]);
  codonposset: string | null = null;
  filename = "";
  // Attributes that exist only once a `format datatype=...` command has run (Python raises AttributeError before then).
  ambiguousValues?: Record<string, string>;
  unambiguousLetters?: string;
  validCharacters?: string;
  revAmbiguousValues?: Record<string, string>;

  /**
   * @param input - NEXUS text, or an object with a `read()` method returning it. Empty input gives an empty DNA data set.
   * @throws {@link NexusError} for malformed NEXUS.
   */
  constructor(input: string | { read(): string } | null = null) {
    if (input) this.read(input);
    else this.read(DEFAULTNEXUS);
  }

  private need<T>(value: T | undefined, what: string): T {
    if (value === undefined) throw new PyAttributeError(`'Nexus' object has no attribute '${what}'`);
    return value;
  }

  /** Read NEXUS text and process its blocks. */
  read(input: string | { read(): string }): void {
    let contents: string;
    if (typeof input === "string") {
      contents = input;
      this.filename = "input_string";
    } else if (input && typeof (input as { read?: unknown }).read === "function") {
      contents = input.read();
      this.filename = "Unknown_nexus_file";
    } else {
      throw new NexusError(`Unrecognized input: ${String(input).slice(0, 100)} ...`);
    }
    contents = pyStrip(contents);
    if (contents.startsWith("#NEXUS")) contents = contents.slice(6);
    const commandlines = getCommandLines(contents);
    commandlines.forEach((cl, i) => {
      if (cl.slice(0, 6).toUpperCase() === "#NEXUS") commandlines[i] = pyStrip(cl.slice(6));
    });
    for (const [title, blockLines] of this.nexusBlocks(commandlines)) {
      if (KNOWN_NEXUS_BLOCKS.includes(title)) this.parseNexusBlock(title, blockLines);
      else this.unknownNexusBlock(title, blockLines);
    }
  }

  /** Blocks of the file as `[title, lines]`; the parsing of one block happens before the next is looked at. */
  private *nexusBlocks(fileContents: string[]): Generator<[string, string[]]> {
    let inblock = false;
    let blocklines: string[] = [];
    let title = "";
    while (fileContents.length > 0) {
      const cl = fileContents.shift()!;
      if (cl.toLowerCase().startsWith("begin")) {
        if (!inblock) {
          inblock = true;
          const words = pySplit(cl);
          if (words.length < 2) throw new IndexError("list index out of range");
          title = words[1]!.toLowerCase();
        } else {
          throw new NexusError(`Illegal block nesting in block ${title}`);
        }
      } else if (cl.toLowerCase().startsWith("end")) {
        if (inblock) {
          inblock = false;
          yield [title, blocklines];
          blocklines = [];
        } else {
          throw new NexusError("Unmatched 'end'.");
        }
      } else if (inblock) {
        blocklines.push(cl);
      }
    }
  }

  private unknownNexusBlock(title: string, contents: string[]): void {
    const block = new Block();
    block.commandlines.push(contents);
    block.title = title;
    this.unknownBlocks.push(block);
  }

  private parseNexusBlock(title: string, contents: string[]): void {
    this.applyBlockStructure(title, contents);
    const block = this.structured[this.structured.length - 1]!;
    for (const line of block.commandlines as Commandline[]) {
      try {
        this.runCommand(line.command, line.options);
      } catch (e) {
        // Biopython reports any AttributeError raised while running a command as an unknown command.
        if (e instanceof PyAttributeError) throw new NexusError(`Unknown command: ${line.command} `);
        throw e;
      }
    }
  }

  /** Run one command by name (Python looks up `self._<command>`). */
  private runCommand(command: string, options: Options): void {
    switch (command) {
      case "title": case "link": case "taxlabels": case "statelabels": case "codeset": case "stateset": case "changeset": case "treeset": case "treepartition": return;
      case "dimensions": return this.cmdDimensions(options);
      case "format": return this.cmdFormat(options);
      case "set": this.set = options; return;
      case "options": this.options = options; return;
      case "eliminate": this.eliminate = options; return;
      case "charlabels": return this.cmdCharlabels(options as string);
      case "charstatelabels": return this.cmdCharstatelabels(options as string);
      case "matrix": return this.cmdMatrix(options as string);
      case "translate": return this.cmdTranslate(options as string);
      case "utree": case "tree": return this.cmdTree(options as string);
      case "taxset": { const [name, taxa] = this.getIndices(options as string, TAXSET); this.taxsets.set(name, makeUnique(taxa as string[])); return; }
      case "charset": { const [name, sites] = this.getIndices(options as string, CHARSET); this.charsets.set(name, makeUnique(sites as number[])); return; }
      case "taxpartition": return this.cmdPartition(options as string, TAXSET);
      case "charpartition": return this.cmdPartition(options as string, CHARSET);
      case "codonposset": return this.cmdCodonposset(options as string);
      default: throw new PyAttributeError(`'Nexus' object has no attribute '_${command}'`);
    }
  }

  private cmdDimensions(options: Options): void {
    if (has(options, "ntax")) this.ntax = int10(get(options, "ntax"));
    if (has(options, "nchar")) this.nchar = int10(get(options, "nchar"));
  }

  private cmdFormat(options: Options): void {
    if (has(options, "respectcase")) this.respectcase = true;
    if (has(options, "symbols")) {
      const raw = get(options, "symbols");
      if (raw === null) throw new PyAttributeError("'NoneType' object has no attribute 'split'");
      let symbols = pySplit(raw).join("");
      if ((symbols.startsWith('"') && symbols.endsWith('"')) || (symbols.startsWith("'") && symbols.endsWith("'"))) symbols = symbols.slice(1, -1);
      this.symbols = this.respectcase ? symbols : [...symbols.toUpperCase()];
    }
    if (has(options, "datatype")) {
      const raw = get(options, "datatype");
      if (raw === null) throw new PyAttributeError("'NoneType' object has no attribute 'lower'");
      this.datatype = raw.toLowerCase();
      if (this.datatype === "dna" || this.datatype === "nucleotide") {
        this.ambiguousValues = { ...IUPACData.ambiguousDnaValues };
        this.unambiguousLetters = IUPACData.unambiguousDnaLetters;
      } else if (this.datatype === "rna") {
        this.ambiguousValues = { ...IUPACData.ambiguousRnaValues };
        this.unambiguousLetters = IUPACData.unambiguousRnaLetters;
      } else if (this.datatype === "protein") {
        this.ambiguousValues = { B: "DN", Z: "EQ", X: IUPACData.proteinLetters };
        this.unambiguousLetters = IUPACData.proteinLetters + "*";
      } else if (this.datatype === "standard") {
        this.ambiguousValues = {};
        if (!this.symbols || this.symbols.length === 0) {
          throw new NexusError("Symbols must be defined when using standard datatype. Please remove any whitespace (spaces, tabs, etc.) between values for symbols as this confuses the Nexus parser.");
        }
        this.unambiguousLetters = [...this.symbols].join("");
        if (!this.respectcase) this.unambiguousLetters += this.unambiguousLetters.toLowerCase();
      } else {
        throw new NexusError("Unsupported datatype: " + this.datatype);
      }
      this.validCharacters = Object.keys(this.ambiguousValues).join("") + this.unambiguousLetters;
      if (!this.respectcase) this.validCharacters = this.validCharacters.toLowerCase() + this.validCharacters.toUpperCase();
      const rev = new Map<string, string>();
      for (const [k, v] of Object.entries(this.ambiguousValues)) if (k !== "X") rev.set(v, k);
      this.revAmbiguousValues = {};
      for (const [k, v] of rev) this.revAmbiguousValues[[...k].sort().join("")] = v;
    }
    if (this.datatype === "dna" || this.datatype === "nucleotide") {
      this.symbols = IUPACData.ambiguousDnaLetters;
      const av = this.need(this.ambiguousValues, "ambiguous_values");
      if (!Object.hasOwn(av, this.missing)) av[this.missing] = this.need(this.unambiguousLetters, "unambiguous_letters") + this.gap;
      av[this.gap] = this.gap;
    } else if (this.datatype === "rna") {
      this.symbols = IUPACData.ambiguousRnaLetters;
      const av = this.need(this.ambiguousValues, "ambiguous_values");
      if (!Object.hasOwn(av, this.missing)) av[this.missing] = this.need(this.unambiguousLetters, "unambiguous_letters") + this.gap;
      av[this.gap] = this.gap;
    }
    const value = (key: string): string => {
      const v = get(options, key);
      if (v === null) throw new TypeError("'NoneType' object is not subscriptable");
      return v;
    };
    if (has(options, "missing")) this.missing = value("missing")[0]!;
    if (has(options, "gap")) this.gap = value("gap")[0]!;
    if (has(options, "equate")) this.equate = get(options, "equate");
    if (has(options, "matchchar")) this.matchchar = value("matchchar")[0]!;
    if (has(options, "labels")) this.labels = get(options, "labels");
    if (has(options, "interleave")) {
      const v = get(options, "interleave");
      if (v === null) this.interleave = true;
      else if (v.toLowerCase() === "yes") this.interleave = true;
    }
    if (has(options, "tokens")) this.tokens = true;
    if (has(options, "notokens")) this.tokens = false;
  }

  /** The taxon in `taxlabels` that is the same as `taxon` apart from spaces/underscores, or undefined. */
  checkTaxlabels(taxon: string): string | undefined {
    const nextaxa = new Map(this.taxlabels.map((t) => [t.replaceAll(" ", "_"), t] as [string, string]));
    return nextaxa.get(taxon.replaceAll(" ", "_"));
  }

  private cmdCharlabels(options: string): void {
    this.charlabels = new Map();
    const opts = new CharBuffer(options);
    for (;;) {
      const w = opts.nextWord();
      if (w === null) break;
      const identifier = this.resolve(w, CHARSET) as number;
      const state = quotestrip(opts.nextWord());
      this.charlabels.set(identifier, state);
      const c = opts.nextNonwhitespace();
      if (c === null) break;
      else if (c !== ",") throw new NexusError(`Missing ',' in line ${options}.`);
    }
  }

  private cmdCharstatelabels(options: string): void {
    this.charlabels = new Map();
    this.statelabels = new Map();
    const opts = new CharBuffer(options);
    if (!this.symbols || this.symbols.length === 0) throw new NexusError("Symbols must be defined when using character states");
    for (;;) {
      const w = opts.nextWord();
      if (w === null) break;
      const identifier = this.resolve(w, CHARSET) as number;
      const character = quotestrip(opts.nextWord());
      this.charlabels.set(identifier, character);
      this.statelabels.set(identifier, []);
      const c = opts.nextNonwhitespace();
      if (c === null) break;
      else if (c !== ",") {
        if (c !== "/") throw new NexusError(`Missing ',' in line ${options}.`);
        let state = quotestrip(opts.nextWord());
        if (state === null) throw new NexusError(`Missing character state in line ${options}.`);
        for (;;) {
          if (this.statelabels.get(identifier)!.length > this.symbols.length) throw new NexusError(`Character states exceed number of available symbols in line ${options}.`);
          this.statelabels.get(identifier)!.push(state);
          state = quotestrip(opts.nextWord());
          if (state === null) return;
          else if (state === ",") break;
        }
      }
    }
  }

  private cmdMatrix(options: string): void {
    if (!this.ntax || !this.nchar) throw new NexusError("Dimensions must be specified before matrix!");
    this.matrix = new Map();
    let taxcount = 0;
    let firstMatrixBlock = true;
    const lines = options.split("\n").map(pyStrip).filter((l) => l !== "");
    let at = 0;
    const nextLine = (): string => {
      if (at >= lines.length) throw new StopIteration();
      return lines[at++]!;
    };
    let refseq: Seq | null = null;
    for (;;) {
      if (at >= lines.length) {
        if (taxcount < this.ntax) throw new NexusError("Not enough taxa in matrix.");
        else if (taxcount > this.ntax) throw new NexusError("Too many taxa in matrix.");
        else break;
      }
      let line = lines[at++]!;
      taxcount += 1;
      if (taxcount > this.ntax) {
        if (!this.interleave) throw new NexusError("Too many taxa in matrix - should matrix be interleaved?");
        taxcount = 1;
        firstMatrixBlock = false;
      }
      const linechars = new CharBuffer(line);
      let id = quotestrip(linechars.nextWord());
      line = pyStrip(linechars.rest());
      let chars = "";
      if (this.interleave) {
        if (line) chars = pySplit(line).join("");
        else chars = pySplit(nextLine()).join("");
      } else {
        chars = pySplit(line).join("");
        while (chars.length < this.nchar) chars += pySplit(nextLine()).join("");
      }
      let iupacSeq: MatrixRow;
      if (this.datatype !== "standard") {
        const rev = this.need(this.revAmbiguousValues, "rev_ambiguous_values");
        let seq = new Seq(replaceParenthesizedAmbigs(chars, rev));
        if (taxcount === 1) refseq = seq;
        else if (this.matchchar) {
          for (;;) {
            const p = seq.find(this.matchchar);
            if (p === -1) break;
            const ref = refseq!.toString();
            if (p >= ref.length) throw new IndexError("index out of range");
            const text = seq.toString();
            seq = new Seq(text.slice(0, p) + ref[p] + text.slice(p + 1));
          }
        }
        const valid = this.need(this.validCharacters, "valid_characters");
        for (const c of seq.toString()) {
          if (!valid.includes(c) && c !== this.gap && c !== this.missing) {
            throw new NexusError(`Taxon ${id}: Illegal character ${c} in sequence ${seq.toString()} (check dimensions/interleaving)`);
          }
        }
        iupacSeq = seq;
      } else {
        const sd = new StandardData(chars);
        const valid = this.need(this.validCharacters, "valid_characters");
        for (const c of sd) {
          for (const coding of c.d) {
            if (!valid.includes(coding) && coding !== this.gap && coding !== this.missing) {
              throw new NexusError(`Taxon ${id}: Illegal character ${coding} in sequence ${sd.toString()} (check dimensions/interleaving)`);
            }
          }
        }
        iupacSeq = sd;
      }
      if (firstMatrixBlock) {
        this.unalteredTaxlabels.push(id as string);
        id = uniqueLabel([...this.matrix.keys()], id as string);
        this.matrix.set(id, iupacSeq);
        this.taxlabels.push(id);
      } else {
        id = uniqueLabel(this.taxlabels.slice(0, taxcount - 1), id as string);
        const present = this.checkTaxlabels(id);
        if (present) {
          const old = this.matrix.get(present)!;
          if (old instanceof Seq && iupacSeq instanceof Seq) this.matrix.set(present, old.add(iupacSeq));
          else throw new TypeError(`unsupported operand type(s) for +=: '${old instanceof Seq ? "Seq" : "StandardData"}' and '${iupacSeq instanceof Seq ? "Seq" : "StandardData"}'`);
        } else {
          throw new NexusError(`Taxon ${id} not in first block of interleaved matrix. Check matrix dimensions and interleave.`);
        }
      }
    }
    for (const [taxon, row] of this.matrix) {
      if (row.length !== this.nchar) throw new NexusError(`Matrix Nchar ${this.nchar} does not match data length (${row.length}) for taxon ${taxon}`);
    }
    const a = [...this.matrix.keys()].sort();
    const b = [...this.taxlabels].sort();
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
      throw new ValueError("ERROR: TAXLABELS must be identical with MATRIX. Please Report this as a bug, and send in data file.");
    }
  }

  private cmdTranslate(options: string): void {
    this.translate = new Map();
    const opts = new CharBuffer(options);
    for (;;) {
      try {
        const word = opts.nextWord();
        if (word === null) throw new TypeError("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'");
        const identifier = pyInt(word);
        const label = quotestrip(opts.nextWord());
        this.translate.set(identifier, label);
        const c = opts.nextNonwhitespace();
        if (c === null) break;
        else if (c !== ",") throw new NexusError(`Missing ',' in line ${options}.`);
      } catch (e) {
        if (e instanceof NexusError) throw e;
        throw new NexusError(`Format error in line ${options}.`);
      }
    }
  }

  private cmdTree(options: string): void {
    const opts = new CharBuffer(options);
    if (opts.peekNonwhitespace() === "*") opts.nextNonwhitespace();
    const name = opts.nextWord();
    if (opts.nextNonwhitespace() !== "=") throw new NexusError(`Syntax error in tree description: ${options.slice(0, 50)}`);
    let rooted = false;
    let weight = 1.0;
    while (opts.peekNonwhitespace() === "[") {
      opts.nextNonwhitespace();
      const symbol = opts.next();
      if (symbol !== "&") throw new NexusError(`Illegal special comment [${symbol}...] in tree description: ${options.slice(0, 50)}`);
      const special = opts.next();
      const value = opts.nextUntil("]");
      opts.next();
      if (special === "R") rooted = true;
      else if (special === "U") rooted = false;
      else if (special === "W") {
        if (value === null) throw new TypeError("float() argument must be a string or a real number, not 'NoneType'");
        weight = pyFloat(value);
      }
    }
    const tree = new Tree(pyStrip(opts.rest()), weight, rooted, name as string);
    if (this.translate && this.translate.size > 0) {
      for (const n of tree.getTerminals()) {
        const data = tree.node(n).data!;
        try {
          const key = pyInt(data.taxon as string);
          if (!this.translate.has(key)) throw new KeyError(String(key));
          data.taxon = safename(this.translate.get(key) as string);
        } catch (e) {
          if (e instanceof ValueError || e instanceof KeyError) throw new NexusError(`Unable to substitute ${data.taxon} using 'translate' data.`);
          throw e;
        }
      }
    }
    this.trees.push(tree);
  }

  private applyBlockStructure(title: string, lines: string[]): void {
    const block = new Block("");
    block.title = title;
    for (const line of lines) block.commandlines.push(new Commandline(line, title));
    this.structured.push(block);
  }

  private cmdPartition(options: string, setType: string): void {
    const kind = setType === CHARSET ? "charpartition" : "taxpartition";
    const partition = new Map<string, number[] | string[]>();
    let quotelevel = false;
    const opts = new CharBuffer(options);
    const name = this.nameNVector(opts);
    if (!name) throw new NexusError(`Formatting error in ${kind}: ${options} `);
    let sub = "";
    for (;;) {
      const w = opts.next();
      if (w === null || (w === "," && !quotelevel)) {
        const [subname, subindices] = this.getIndices(sub, setType, ":");
        partition.set(subname, makeUnique(subindices as (number | string)[]) as number[] | string[]);
        sub = "";
        if (w === null) break;
      } else {
        if (w === "'") quotelevel = !quotelevel;
        sub += w;
      }
    }
    if (setType === CHARSET) this.charpartitions.set(name, partition as Map<string, number[]>);
    else this.taxpartitions.set(name, partition as Map<string, string[]>);
  }

  private cmdCodonposset(options: string): void {
    const prev = [...this.charpartitions.keys()];
    this.cmdPartition(options, CHARSET);
    const codonname = [...this.charpartitions.keys()].filter((n) => !prev.includes(n));
    if (codonname.length === 0 || codonname.length > 1) throw new NexusError(`Formatting Error in codonposset: ${options} `);
    this.codonposset = codonname[0]!;
  }

  private getIndices(options: string, setType: string, separator = "="): [string, (number | string)[]] {
    const opts = new CharBuffer(options);
    const name = this.nameNVector(opts, separator);
    const indices = this.parseList(opts, setType);
    if (indices === null) throw new NexusError(`Formatting error in line: ${options} `);
    return [name, indices];
  }

  /** Read a set name (optionally starting with `*`) followed by the separator. */
  private nameNVector(opts: CharBuffer, separator = "="): string {
    const rest = opts.rest();
    let name = opts.nextWord();
    if (name === "*") name = opts.nextWord();
    if (!name) throw new NexusError(`Formatting error in line: ${rest} `);
    name = quotestrip(name) as string;
    // Biopython compares the method `peek_nonwhitespace` itself with "(", which is never true, so a "(vector)" qualifier is never read.
    if (opts.nextNonwhitespace() !== separator) throw new NexusError(`Formatting error in line: ${rest} `);
    return name;
  }

  /** Read a list of identifiers and ranges; null if it cannot be understood. */
  private parseList(buffer: CharBuffer, setType: string): (number | string)[] | null {
    const plain: (number | string)[] = [];
    if (buffer.peekNonwhitespace()) {
      try {
        for (;;) {
          const identifier = buffer.nextWord();
          if (!identifier) break;
          const start = this.resolve(identifier, setType);
          if (buffer.peekNonwhitespace() === "-") {
            let step = 1;
            buffer.nextNonwhitespace();
            const end = this.resolve(buffer.nextWord() as string, setType);
            if (setType === CHARSET) {
              if (buffer.peekNonwhitespace() === "\\") {
                buffer.nextNonwhitespace();
                step = pyInt(buffer.nextWord() as string);
              }
              if (Array.isArray(start) || Array.isArray(end) || typeof start !== "number" || typeof end !== "number") throw new TypeError("range() argument must be int");
              if (step === 0) throw new ValueError("range() arg 3 must not be zero");
              if (step > 0) for (let i = start; i < end + 1; i += step) plain.push(i);
              else for (let i = start; i > end + 1; i += step) plain.push(i);
            } else {
              if (Array.isArray(start) || Array.isArray(end)) throw new NexusError(`Name if character sets not allowed in range definition: ${identifier}`);
              const s = this.taxlabels.indexOf(start as string);
              const e = this.taxlabels.indexOf(end as string);
              if (s < 0 || e < 0) throw new ValueError("x is not in list");
              plain.push(...this.taxlabels.slice(s, e + 1));
            }
          } else if (Array.isArray(start)) {
            plain.push(...start);
          } else {
            plain.push(start);
          }
        }
      } catch (e) {
        if (e instanceof NexusError) throw e;
        return null;
      }
    }
    return plain;
  }

  /** Turn an identifier into a number/name, a character label's position, or a set's members. */
  private resolve(identifier: string, setType: string | null = null): number | string | (number | string)[] {
    const id = quotestrip(identifier) as string;
    if (!setType) throw new NexusError("INTERNAL ERROR: Need type to resolve identifier.");
    if (setType === CHARSET) {
      let n: number;
      try {
        n = pyInt(id);
      } catch (e) {
        if (!(e instanceof ValueError)) throw e;
        if (this.charlabels && [...this.charlabels.values()].includes(id)) {
          for (const [k, v] of this.charlabels) if (v === id) return k;
        } else if (this.charsets.size > 0 && this.charsets.has(id)) {
          return this.charsets.get(id)!;
        } else {
          throw new NexusError(`Unknown character identifier: ${id}`);
        }
        return undefined as never;
      }
      if (n <= this.nchar) return n - 1;
      throw new TypeError("%d format: a real number is required, not str");
    } else if (setType === TAXSET) {
      let n: number;
      try {
        n = pyInt(id);
      } catch (e) {
        if (!(e instanceof ValueError)) throw e;
        const present = this.checkTaxlabels(id);
        if (present) return present;
        else if (this.taxsets.size > 0 && this.taxsets.has(id)) return this.taxsets.get(id)!;
        throw new NexusError(`Unknown taxon identifier: ${id}`);
      }
      if (n > 0 && n <= this.ntax) return this.taxlabels[n - 1]!;
      throw new TypeError("%d format: a real number is required, not str");
    }
    throw new NexusError(`Unknown set specification: ${setType}.`);
  }
}

