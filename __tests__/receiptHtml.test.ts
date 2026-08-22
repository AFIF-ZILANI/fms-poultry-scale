import { generateReceiptHtml } from "@/lib/receiptHtml";
import type { SaleRecord } from "@/lib/types";

function buildSale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: "sale-1",
    userId: "user-1",
    phase: "main",
    isPcsTracked: true,
    hasCull: false,
    isFinished: true,
    rows: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: {
      mainWeightKg: 100,
      buyerName: '<img src=x onerror="alert(1)">',
      kgPerCrate: 20,
      deductionPerCrateG: 300,
      isFullCratesOnly: true,
      mainPrice: 300,
      mainAmount: 30000,
      cullWeightKg: 0,
      finalAmount: 30000,
      receivedAmount: 30000,
      totalDeductionWtKg: 0,
      netWeightKg: 100,
      totalCrates: 5,
      createdAt: Date.now(),
    },
    ...overrides,
  };
}

describe("generateReceiptHtml", () => {
  it("escapes HTML in buyerName instead of injecting it raw", () => {
    const html = generateReceiptHtml(buildSale(), "Green Valley Farm");
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).toContain("&lt;img src=x onerror=");
  });

  it("escapes HTML in farmName instead of injecting it raw", () => {
    const html = generateReceiptHtml(buildSale(), '<script>alert(1)</script>');
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
