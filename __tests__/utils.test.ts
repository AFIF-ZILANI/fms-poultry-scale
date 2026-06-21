import {
  formatWeight,
  formatPcs,
  sumPcs,
  kgToGrams,
  formatGrams,
  getRelativeTime,
  formatDateTime,
  type RelTimeStrings,
} from "../lib/utils";

// ─── formatWeight ────────────────────────────────────────────────────────────

describe("formatWeight", () => {
  it("formats a whole-number weight to two decimal places", () => {
    expect(formatWeight(5)).toBe("5.00");
  });

  it("formats a decimal weight to two decimal places", () => {
    expect(formatWeight(3.5)).toBe("3.50");
  });

  it("truncates correctly at two decimal places", () => {
    // 1.234 should become "1.23" (truncation after 2nd decimal)
    expect(formatWeight(1.234)).toBe("1.23");
  });

  it("handles zero", () => {
    expect(formatWeight(0)).toBe("0.00");
  });

  it("handles large weights", () => {
    expect(formatWeight(1234.56)).toBe("1234.56");
  });

  it("handles very small weights", () => {
    expect(formatWeight(0.001)).toBe("0.00");
  });
});

// ─── formatPcs ───────────────────────────────────────────────────────────────

describe("formatPcs", () => {
  it("returns the count as a string when pcs is a number", () => {
    expect(formatPcs(12, "Unknown")).toBe("12");
  });

  it("returns the unknown label when pcs is null", () => {
    expect(formatPcs(null, "Unknown")).toBe("Unknown");
  });

  it("returns the unknown label when pcs is undefined", () => {
    expect(formatPcs(undefined, "Unknown")).toBe("Unknown");
  });

  it("returns '0' when pcs is zero (not the unknown label)", () => {
    expect(formatPcs(0, "Unknown")).toBe("0");
  });

  it("uses the provided localized unknown label", () => {
    expect(formatPcs(null, "অজানা")).toBe("অজানা");
  });
});

// ─── sumPcs ──────────────────────────────────────────────────────────────────

describe("sumPcs", () => {
  it("sums non-null pcs values", () => {
    expect(sumPcs([{ pcs: 3 }, { pcs: 5 }, { pcs: 2 }])).toBe(10);
  });

  it("treats null pcs as 0", () => {
    expect(sumPcs([{ pcs: 3 }, { pcs: null }, { pcs: 2 }])).toBe(5);
  });

  it("returns 0 for an empty array", () => {
    expect(sumPcs([])).toBe(0);
  });

  it("returns 0 when all pcs are null", () => {
    expect(sumPcs([{ pcs: null }, { pcs: null }])).toBe(0);
  });

  it("handles a mix of zeros and positive counts", () => {
    expect(sumPcs([{ pcs: 0 }, { pcs: 0 }, { pcs: 5 }])).toBe(5);
  });
});

// ─── kgToGrams ───────────────────────────────────────────────────────────────

describe("kgToGrams", () => {
  it("converts whole kilograms to grams", () => {
    expect(kgToGrams(2)).toBe(2000);
  });

  it("converts fractional kilograms and rounds correctly", () => {
    expect(kgToGrams(1.5)).toBe(1500);
  });

  it("rounds 1.2345 kg to the nearest gram", () => {
    // 1.2345 * 1000 = 1234.5 → rounds to 1235
    expect(kgToGrams(1.2345)).toBe(1235);
  });

  it("handles zero", () => {
    expect(kgToGrams(0)).toBe(0);
  });

  it("rounds floating-point imprecision correctly", () => {
    // 1.2345 * 1000 = 1234.5 → rounds to 1235
    expect(kgToGrams(1.2345)).toBe(1235);
  });
});

// ─── formatGrams ─────────────────────────────────────────────────────────────

describe("formatGrams", () => {
  it("formats whole grams as a locale string", () => {
    // Node.js locale format may omit separators for numbers under 1000
    expect(formatGrams(500)).toBe("500");
  });

  it("formats zero grams", () => {
    expect(formatGrams(0)).toBe("0");
  });
});

// ─── getRelativeTime ─────────────────────────────────────────────────────────

describe("getRelativeTime", () => {
  const now = Date.now();

  it("returns 'just now' for timestamps within the last 4 seconds", () => {
    expect(getRelativeTime(now - 4000)).toBe("just now");
  });

  it("returns seconds-ago for timestamps 5–59 seconds ago", () => {
    expect(getRelativeTime(now - 30000)).toBe("30s ago");
  });

  it("returns minutes-ago for timestamps 60–3599 seconds ago", () => {
    expect(getRelativeTime(now - 90000)).toBe("1m ago");
  });

  it("returns '59m ago' for a timestamp 3599 seconds ago (just under 1 hour)", () => {
    expect(getRelativeTime(now - 3599000)).toBe("59m ago");
  });

  it("returns hours-ago for timestamps 1–23 hours ago", () => {
    expect(getRelativeTime(now - 7200000)).toBe("2h ago");
  });

  it("returns days-ago for timestamps 24+ hours ago", () => {
    expect(getRelativeTime(now - 86400000)).toBe("1d ago");
  });

  it("returns '7d ago' for a week-old timestamp", () => {
    expect(getRelativeTime(now - 7 * 86400000)).toBe("7d ago");
  });

  it("uses custom localized strings", () => {
    const strings: RelTimeStrings = {
      justNow: "এইমাত্র",
      secsAgo: (n) => `${n} সেকেন্ড আগে`,
      minsAgo: (n) => `${n} মিনিট আগে`,
      hoursAgo: (n) => `${n} ঘণ্টা আগে`,
      daysAgo: (n) => `${n} দিন আগে`,
    };
    expect(getRelativeTime(now - 3000, strings)).toBe("এইমাত্র");
    expect(getRelativeTime(now - 120000, strings)).toBe("2 মিনিট আগে");
    expect(getRelativeTime(now - 3 * 86400000, strings)).toBe("3 দিন আগে");
  });
});

// ─── formatDateTime ──────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("formats midnight on Jan 1 2024 correctly", () => {
    // Use UTC epoch + offset to get midnight local time — avoid timezone drift
    // by constructing the date explicitly and comparing field-by-field.
    const d = new Date(2024, 0, 1, 0, 0);
    const result = formatDateTime(d.getTime());
    expect(result).toContain("Jan");
    expect(result).toContain("1");
    expect(result).toContain("2024");
    expect(result).toContain("12:00");
    expect(result).toContain("AM");
  });

  it("formats noon correctly", () => {
    const d = new Date(2024, 5, 15, 12, 0);
    const result = formatDateTime(d.getTime());
    expect(result).toContain("Jun");
    expect(result).toContain("15");
    expect(result).toContain("2024");
    expect(result).toContain("12:00");
    expect(result).toContain("PM");
  });

  it("formats 1 PM correctly (hour wraps from 13 to 1)", () => {
    const d = new Date(2024, 11, 31, 13, 5);
    const result = formatDateTime(d.getTime());
    expect(result).toContain("Dec");
    expect(result).toContain("31");
    expect(result).toContain("1:05");
    expect(result).toContain("PM");
  });

  it("pads single-digit minutes with a leading zero", () => {
    const d = new Date(2024, 3, 10, 9, 7);
    const result = formatDateTime(d.getTime());
    expect(result).toContain("9:07");
  });

  it("formats all twelve month names correctly", () => {
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    months.forEach((month, i) => {
      const d = new Date(2024, i, 1, 10, 0);
      expect(formatDateTime(d.getTime())).toContain(month);
    });
  });
});
