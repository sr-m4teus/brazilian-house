import { describe, it, expect } from "vitest";
import { seasonKey, seasonLabel, isCwlWindow } from "../../src/lib/coc/season";

describe("season helpers", () => {
  it("formats season key from a date", () => {
    expect(seasonKey(new Date("2026-06-25T00:00:00Z"))).toBe("2026-06");
  });

  it("formats a human label", () => {
    expect(seasonLabel("2026-06")).toBe("Liga 06/2026");
  });

  it("is in CWL window on days 1-12", () => {
    expect(isCwlWindow(new Date("2026-06-03T00:00:00Z"))).toBe(true);
    expect(isCwlWindow(new Date("2026-06-12T00:00:00Z"))).toBe(true);
  });

  it("is outside CWL window after day 12", () => {
    expect(isCwlWindow(new Date("2026-06-20T00:00:00Z"))).toBe(false);
  });
});
