import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange, isValidDateString } from "@/lib/dates";
import { slugify } from "@/lib/slug";

describe("calendar dates", () => {
  it("accepts real days only", () => {
    expect(isValidDateString("2026-11-11")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    for (const value of ["2027-02-29", "2026-13-01", "2026-00-10", "2026-11-31", "11/11/2026", "2026-11-11T10:00", ""]) {
      expect(isValidDateString(value), value).toBe(false);
    }
  });

  it("formats in French, without any timezone shift", () => {
    expect(formatDate("2026-11-01")).toBe("1 novembre 2026");
    expect(formatDate("2027-01-31")).toBe("31 janvier 2027");
    expect(formatDateRange("2026-11-01", "2027-01-31")).toBe("Du 1 novembre 2026 au 31 janvier 2027");
    expect(formatDateRange("2026-11-01", "2026-11-01")).toBe("1 novembre 2026");
  });
});

describe("slugify", () => {
  it("builds URL-friendly identifiers", () => {
    expect(slugify("Séjour en Martinique !")).toBe("sejour-en-martinique");
    expect(slugify("  Été 2025 — Îles & volcans  ")).toBe("ete-2025-iles-volcans");
    expect(slugify("???")).toBe("");
    expect(slugify("a".repeat(100)).length).toBe(60);
  });
});
