/** `datetime.date` and `datetime.time` as text, with CPython's argument checks. */

import { ValueError } from "@biolibs/core";

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** Whether `year` is a leap year. */
const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * `str(datetime.date(*args))`.
 *
 * @throws TypeError for the wrong number of arguments; {@link ValueError} for a date that does not exist.
 */
export function dateText(args: number[]): string {
  if (args.length > 3) throw new TypeError(`date() takes at most 3 arguments (${args.length} given)`);
  const names = ["year", "month", "day"];
  if (args.length < 3) throw new TypeError(`date() missing required argument '${names[args.length]}' (pos ${args.length + 1})`);
  const [year, month, day] = args as [number, number, number];
  if (year < 1 || year > 9999) throw new ValueError(`year must be in 1..9999, not ${year}`);
  if (month < 1 || month > 12) throw new ValueError(`month must be in 1..12, not ${month}`);
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  if (day < 1 || day > days) throw new ValueError(`day ${day} must be in range 1..${days} for month ${month} in year ${year}`);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * `str(datetime.time(*args))` for up to three arguments (hour, minute, second).
 *
 * @throws {@link ValueError} for a field out of range.
 */
export function timeText(args: number[]): string {
  const [hour = 0, minute = 0, second = 0] = args;
  if (hour < 0 || hour > 23) throw new ValueError(`hour must be in 0..23, not ${hour}`);
  if (minute < 0 || minute > 59) throw new ValueError(`minute must be in 0..59, not ${minute}`);
  if (second < 0 || second > 59) throw new ValueError(`second must be in 0..59, not ${second}`);
  return `${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`;
}
