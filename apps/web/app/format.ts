import { formatUsd, isoDate } from "@app/backend/contract";

const MAX_DIGITS = 12; // keeps Number() exact; values over the budget cap still get a friendly error

/** Keeps digits only, drops leading zeros and caps the length: "$0,012,5ab" -> "125". */
export function toDigits(input: string) {
  return input.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
}

/** Display value for the money input: "12500" -> "$12,500", "" -> "". */
export const maskUsd = (digits: string) => (digits ? formatUsd(Number(digits)) : "");

/** Today in the browser's timezone as "YYYY-MM-DD" (min value for the date input). */
export function localToday(now: Date = new Date()) {
  return isoDate(new Date(now.getTime() - now.getTimezoneOffset() * 60_000));
}
