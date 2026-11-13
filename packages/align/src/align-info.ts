/** `Bio.Align.AlignInfo`: the deprecated `SummaryInfo`. */

import { warn } from "@biolibs/core";
import type { MultipleSeqAlignment } from "./multiple-seq-alignment.js";

/** Summary information about an alignment (deprecated in Biopython; constructing it emits a `BiopythonDeprecationWarning`). */
export class SummaryInfo {
  /** The alignment summarised. */
  alignment: MultipleSeqAlignment;
  /** Information content per column (always empty, as in Biopython). */
  icVector: number[] = [];

  /**
   * @param alignment - The alignment to summarise.
   */
  constructor(alignment: MultipleSeqAlignment) {
    warn(
      `The class SummaryInfo has been deprecated. Instead of

>>> align_info = AlignInfo.SummaryInfo(msa)
>>> sequence = align_info.get_column(1)

please use

>>> alignment = msa.alignment  # to get a new-style Alignment object
>>> sequence = alignment[:, 1]

Here, \`msa\` is a MultipleSeqAlignment object and \`alignment\` is an
\`Alignment\` object.`,
      "BiopythonDeprecationWarning",
    );
    this.alignment = alignment;
  }

  /**
   * One column of the alignment.
   *
   * @param col - Column index.
   * @returns The column's letters as text.
   */
  getColumn(col: number): string {
    return this.alignment.get({ start: null, stop: null, step: null }, col);
  }
}
