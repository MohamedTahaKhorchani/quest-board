import { describe, expect, it } from "vitest";
import { isValidTimeZone, wallTimeToIso } from "./questTime.js";

describe("questTime", () => {
  it("accepts known IANA zones", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("converts Paris summer wall time to UTC (CEST, UTC+2)", () => {
    expect(wallTimeToIso("2026-07-15T14:00", "Europe/Paris")).toEqual({
      iso: "2026-07-15T12:00:00.000Z",
    });
  });

  it("converts Paris winter wall time to UTC (CET, UTC+1)", () => {
    expect(wallTimeToIso("2026-01-15T14:00", "Europe/Paris")).toEqual({
      iso: "2026-01-15T13:00:00.000Z",
    });
  });

  it("rejects a non-existent spring-forward time in Europe/Paris", () => {
    // 2026-03-29: clocks jump 02:00 -> 03:00 in Paris.
    expect(wallTimeToIso("2026-03-29T02:30", "Europe/Paris")).toEqual({ error: "impossible" });
  });

  it("rejects an ambiguous fall-back time in Europe/Paris", () => {
    // 2026-10-25: clocks fall back 03:00 -> 02:00 in Paris.
    expect(wallTimeToIso("2026-10-25T02:30", "Europe/Paris")).toEqual({ error: "ambiguous" });
  });

  it("rejects unknown zones and bad wall clocks", () => {
    expect(wallTimeToIso("2026-07-15T14:00", "Mars/Colony")).toEqual({ error: "unknown_zone" });
    expect(wallTimeToIso("not-a-time", "Europe/Paris")).toEqual({ error: "invalid" });
  });
});
