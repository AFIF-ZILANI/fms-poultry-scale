import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),

  totalWeightKg: real("total_weight_kg").notNull(),
  totalWeightGrams: integer("total_weight_grams").notNull(),
  totalPcs: integer("total_pcs").notNull(),
  pcsTracked: integer("pcs_tracked", { mode: "boolean" }),
  averageWeightKg: real("average_weight_kg").notNull(),
  averageWeightGrams: integer("average_weight_grams").notNull(),
  buyerName: text("buyer_name"),
  receivedAmount: real("received_amount"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  synced: integer("synced", { mode: "boolean" }).notNull().default(false),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
});

// One row per MeasurementRow, with a "kind" discriminator instead of two separate tables
export const measurementRows = sqliteTable("measurement_rows", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").references(() => sales.id, { onDelete: "cascade" }),
  draftId: text("draft_id").references(() => drafts.id, {
    onDelete: "cascade",
  }),
  kind: text("kind", { enum: ["main", "cull"] }).notNull(),
  weightKg: real("weight_kg").notNull(),
  pcs: integer("pcs"), // nullable = unknown, per your type comment
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

export const rowEditHistory = sqliteTable("row_edit_history", {
  id: text("id").primaryKey(),
  rowId: text("row_id")
    .notNull()
    .references(() => measurementRows.id, { onDelete: "cascade" }),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  previousWeightKg: real("previous_weight_kg").notNull(),
  previousPcs: integer("previous_pcs"),
  newWeightKg: real("new_weight_kg").notNull(),
  newPcs: integer("new_pcs"),
});

export const tradeDeductions = sqliteTable("trade_deductions", {
  id: text("id").primaryKey(),
  saleId: text("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  grossWeight: real("gross_weight").notNull(),
  kgPerCrate: real("kg_per_crate").notNull(),
  deductionPerCrateG: real("deduction_per_crate_g").notNull(),
  fullCratesOnly: integer("full_crates_only", { mode: "boolean" }).notNull(),
  totalCrates: real("total_crates").notNull(),
  totalDeductionKg: real("total_deduction_kg").notNull(),
  cullWeightKg: real("cull_weight_kg").notNull(),
  netWeight: real("net_weight").notNull(),
  pricePerKg: real("price_per_kg").notNull(),
  mainAmount: real("main_amount"),
  cullSessionMode: text("cull_session_mode", { enum: ["weigh", "pcs_only"] }),
  cullSold: integer("cull_sold", { mode: "boolean" }),
  cullPricingMode: text("cull_pricing_mode", { enum: ["per_kg", "per_piece"] }),
  cullPrice: real("cull_price"),
  cullPcs: integer("cull_pcs"),
  cullAmount: real("cull_amount"),
  finalAmount: real("final_amount").notNull(),
});

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  phase: text("phase", { enum: ["main", "cull"] }),
  pcsOptional: integer("pcs_optional", { mode: "boolean" }),
  totalWeightKg: real("total_weight_kg").notNull(),
  totalPcs: integer("total_pcs").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const prefs = sqliteTable("prefs", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Relations ───
export const salesRelations = relations(sales, ({ many, one }) => ({
  rows: many(measurementRows),
  deduction: one(tradeDeductions, {
    fields: [sales.id],
    references: [tradeDeductions.saleId],
  }),
}));

export const measurementRowsRelations = relations(
  measurementRows,
  ({ one, many }) => ({
    sale: one(sales, {
      fields: [measurementRows.saleId],
      references: [sales.id],
    }),
    draft: one(drafts, {
      fields: [measurementRows.draftId],
      references: [drafts.id],
    }),
    editHistory: many(rowEditHistory),
  }),
);

export const rowEditHistoryRelations = relations(rowEditHistory, ({ one }) => ({
  row: one(measurementRows, {
    fields: [rowEditHistory.rowId],
    references: [measurementRows.id],
  }),
}));
