/**
 * The two codes the Fortran passes back and forth with its caller: what it wants next, and the detail
 * behind it. They are shared by the line search, its wrapper and the driver, and `minimize.ts` turns the
 * final pair into scipy's own status.
 */

/** What the algorithm wants next, as the Fortran's `task[0]`. */
export enum Task {
  /** Starting a new search. */
  Start = 0,
  /** A new point is ready. */
  NewX = 1,
  /** The search was restarted. */
  Restart = 2,
  /** The function and gradient are wanted at the current point. */
  Fg = 3,
  /** The search is finished. */
  Convergence = 4,
  /** The caller asked it to stop. */
  Stop = 5,
  /** It stopped without meeting the conditions. */
  Warning = 6,
  /** An argument was wrong. */
  Error = 7,
  /** The line search failed. */
  Abnormal = 8,
}

/** The detail behind a status, as the Fortran's `task[1]`, which scipy renders into its message. */
export enum TaskMsg {
  /** No message. */
  None = 0,
  /** The first evaluation. */
  FgStart = 301,
  /** An evaluation inside the line search. */
  FgLnsrch = 302,
  /** The projected gradient is small enough. */
  ConvGrad = 401,
  /** The function is no longer decreasing. */
  ConvF = 402,
  /** The evaluation budget ran out. */
  StopIter = 502,
  /** The iteration budget ran out. */
  StopIterc = 504,
  /** Rounding errors stop the search making progress. */
  WarnRound = 601,
  /** The step reached its upper limit. */
  WarnStpmax = 602,
  /** The step reached its lower limit. */
  WarnStpmin = 603,
  /** The interval of uncertainty is as small as it will get. */
  WarnXtol = 604,
  /** The initial step is below its lower limit. */
  ErrorStp1 = 706,
  /** The initial step is above its upper limit. */
  ErrorStp2 = 707,
  /** The initial directional derivative is not negative. */
  ErrorInitg = 710,
}
