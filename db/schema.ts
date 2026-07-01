import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Users ───
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  location: text("location"),
  farmName: text("farm_name"),
  is_onboarded: integer("is_onboarded", { mode: "boolean" })
    .notNull()
    .default(false),
  businessName: text("business_name"),
  role: text("role", { enum: ["farmer", "wholesaler"] }).notNull().default("farmer"),
  subscriptionPlan: text("subscription_plan", {
    enum: ["community", "premium"],
  })
    .notNull()
    .default("community"),
  farmCapacity: integer("farm_capacity"),
  buyingCapacity: integer("buying_capacity"),
  breed: text("breed"),
  supplyRegions: text("supply_regions"),
  createdAt: integer("created_at", { mode: "timestamp" })
});

// ─── Sales ───
export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  phase: text("phase", { enum: ["main", "cull"] }).notNull(),
  isPcsTracked: integer("is_pcs_tracked", { mode: "boolean" }).notNull(),
  hasCull: integer("has_cull", { mode: "boolean" }).notNull().default(false),
  isFinished: integer("is_finished", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  synced: integer("synced", { mode: "boolean" }).notNull().default(false),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
});

// ─── Sale Meta Data ───
export const saleMetaData = sqliteTable("sale_meta_data", {
  id: text("id").primaryKey(),
  saleId: text("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),

  mainWeightKg: real("main_weight_kg").notNull(),
  mainPcs: integer("main_pcs"),

  buyerName: text("buyer_name"),

  kgPerCrate: real("kg_per_crate").notNull(),
  deductionPerCrateG: real("deduction_per_crate_g").notNull(),
  isFullCratesOnly: integer("is_full_crates_only", {
    mode: "boolean",
  }).notNull(),
  mainPrice: real("main_price").notNull(),
  mainAmount: real("main_amount").notNull(),

  cullWeightKg: real("cull_weight_kg").notNull().default(0),
  isCullSold: integer("is_cull_sold", { mode: "boolean" }),
  cullSaleType: text("cull_sale_type", { enum: ["pcs", "weight"] }),
  cullPrice: real("cull_price"),
  cullPcs: integer("cull_pcs"),
  cullAmount: real("cull_amount"),

  finalAmount: real("final_amount").notNull(),

  receivedAmount: real("received_amount").notNull(),
  totalDeductionWtKg: real("total_deduction_wt_kg").notNull(),
  avgWtGrams: real("avg_wt_grams"),
  netWeightKg: real("net_weight_kg").notNull(),
  totalCrates: real("total_crates").notNull(),
  totalPcs: integer("total_pcs"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ─── Measurement Rows ───
export const measurementRows = sqliteTable("measurement_rows", {
  id: text("id").primaryKey(),
  saleId: text("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["main", "cull"] }).notNull(),
  weight: real("weight").notNull(),
  pcs: integer("pcs"), // null if not pcs-tracked
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ─── Row Edit History ───
export const rowEditHistory = sqliteTable("row_edit_history", {
  id: text("id").primaryKey(),
  rowId: text("row_id")
    .notNull()
    .references(() => measurementRows.id, { onDelete: "cascade" }),
  previousWeight: real("previous_weight").notNull(),
  previousPcs: integer("previous_pcs"),
  newWeight: real("new_weight").notNull(), // ADDED — was missing in your spec, see note above
  newPcs: integer("new_pcs"),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ─── User Prefs ───
export const userPrefs = sqliteTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  language: text("language", { enum: ["en", "bn"] })
    .notNull()
    .default("en"),
  theme: text("theme", { enum: ["light", "dark", "system"] })
    .notNull()
    .default("system"),
  logGroupSize: integer("log_group_size").notNull().default(10),
  kgPerCrate: real("kg_per_crate").notNull(),
  deductionWtG: real("deduction_wt_g").notNull(),
  priceKg: real("price_kg").notNull(),
});

// ─── Relations ───
export const usersRelations = relations(users, ({ many, one }) => ({
  sales: many(sales),
  prefs: one(userPrefs, {
    fields: [users.id],
    references: [userPrefs.userId],
  }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  user: one(users, { fields: [sales.userId], references: [users.id] }),
  metaData: one(saleMetaData, {
    fields: [sales.id],
    references: [saleMetaData.saleId],
  }),
  rows: many(measurementRows),
}));

export const saleMetaDataRelations = relations(saleMetaData, ({ one }) => ({
  sale: one(sales, { fields: [saleMetaData.saleId], references: [sales.id] }),
}));

export const measurementRowsRelations = relations(
  measurementRows,
  ({ one, many }) => ({
    sale: one(sales, {
      fields: [measurementRows.saleId],
      references: [sales.id],
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
