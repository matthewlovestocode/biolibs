/** `OneOfPosition`: one of several possible positions. */

import { ValueError } from "@biolibs/core";
import { pyRepr } from "@biolibs/core";
import { IntPosition, type Position } from "./base.js";

/** A position that is one of several candidates, written `one-of(3,6)`. */
export class OneOfPosition extends IntPosition {
  /** The candidate positions, in order. */
  readonly positionChoices: Position[];

  /**
   * @param position - Representative position; must equal one of `choices`.
   * @param choices - The candidate positions.
   * @throws {@link ValueError} if `position` is not among `choices`.
   */
  constructor(position: number, choices: Position[]) {
    if (!choices.some((c) => c.valueOf() === position)) {
      throw new ValueError(`OneOfPosition: ${position} should match one of ${pyRepr(choices)}`);
    }
    super(position);
    this.positionChoices = choices;
  }

  repr(): string {
    return `${this.constructor.name}(${this.position}, choices=${pyRepr(this.positionChoices)})`;
  }

  toString(): string {
    return `one-of(${this.positionChoices.map((p) => p.toString()).join(",")})`;
  }

  add(offset: number): OneOfPosition {
    return new OneOfPosition(this.position + offset, this.positionChoices.map((p) => p.add(offset)));
  }

  /** Flipping reverses the order of the candidates too. */
  flip(length: number): OneOfPosition {
    return new OneOfPosition(length - this.position, [...this.positionChoices].reverse().map((p) => p.flip(length)));
  }
}
