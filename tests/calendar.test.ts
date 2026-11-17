import { describe, expect, it } from "vitest";
import { addMonths, formatMonth, monthOf, monthsBetween, monthWeeks } from "@/lib/calendar";

describe("calendar of the day filter", () => {
  it("moves from month to month, across years", () => {
    expect(monthOf("2026-11-14")).toBe("2026-11");
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-11", "2026-11")).toEqual(["2026-11"]);
  });

  it("lays out a month in weeks starting on Monday", () => {
    // 1 November 2026 is a Sunday: six empty cells before it.
    const weeks = monthWeeks("2026-11");
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks[1]![0]).toBe("2026-11-02");
    expect(weeks.at(-1)).toEqual(["2026-11-30", null, null, null, null, null, null]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it("knows leap years and months starting on Monday", () => {
    // 1 February 2027 is a Monday; 2028 is a leap year.
    expect(monthWeeks("2027-02")[0]![0]).toBe("2027-02-01");
    expect(monthWeeks("2027-02").flat().filter(Boolean)).toHaveLength(28);
    expect(monthWeeks("2028-02").flat().filter(Boolean)).toHaveLength(29);
  });

  it("names the month in French", () => {
    expect(formatMonth("2026-11")).toBe("novembre 2026");
  });
});
