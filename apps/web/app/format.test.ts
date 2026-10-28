import { describe, expect, it } from "vitest";
import { localToday, maskUsd, toDigits } from "./format";

describe("toDigits", () => {
  it("keeps only digits", () => {
    expect(toDigits("$12,500")).toBe("12500");
    expect(toDigits("12.50")).toBe("1250");
    expect(toDigits("abc")).toBe("");
    expect(toDigits("-500")).toBe("500");
    expect(toDigits("1e5")).toBe("15");
  });
  it("drops leading zeros", () => {
    expect(toDigits("0")).toBe("");
    expect(toDigits("000123")).toBe("123");
    expect(toDigits("$0")).toBe("");
  });
  it("caps very long input", () => {
    expect(toDigits("9".repeat(30))).toHaveLength(12);
  });
});

describe("maskUsd", () => {
  it("formats digits as dollars", () => {
    expect(maskUsd("")).toBe("");
    expect(maskUsd("5")).toBe("$5");
    expect(maskUsd("1234")).toBe("$1,234");
    expect(maskUsd("1000000")).toBe("$1,000,000");
  });
  it("round-trips through toDigits", () => {
    expect(toDigits(maskUsd("987654"))).toBe("987654");
  });
});

describe("localToday", () => {
  it("uses the browser's local calendar date, not UTC", () => {
    // 2026-10-27 01:00 UTC is still Oct 26 at UTC-3 (offset +180 minutes).
    const utcMorning = new Date("2026-10-27T01:00:00Z");
    utcMorning.getTimezoneOffset = () => 180;
    expect(localToday(utcMorning)).toBe("2026-10-26");
    const east = new Date("2026-10-26T23:00:00Z");
    east.getTimezoneOffset = () => -120; // UTC+2 is already Oct 27
    expect(localToday(east)).toBe("2026-10-27");
  });
});
