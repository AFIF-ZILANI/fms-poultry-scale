# Batch/Sale Operational Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional breed, placement date, and initial bird count to
batches, and an optional categorized buyer type to sales — filling gaps a
future analytics dataset needs but the app doesn't currently collect.

**Architecture:** Four new nullable columns (three on `batches`, one on
`saleMetaData`), threaded through `lib/storage.ts`'s existing save/load
functions, surfaced in the existing batch-detail edit modal and the
existing sale-completion "Buyer" card — no new screens, no new dependency
beyond a date picker (this app has none today).

**Tech Stack:** React Native / Expo Router, TypeScript, Drizzle ORM
(`expo-sqlite`), Jest, `@react-native-community/datetimepicker` (new).

**Spec:** `docs/superpowers/specs/2026-08-21-batch-sale-operational-fields-design.md`

## Global Constraints

- All four new columns are nullable at the DB level and optional in every
  UI — batch creation stays a fast, single-field action; sale completion
  gains no new friction (spec §2).
- No "unknown" enum value for `buyerType` — null already means unset,
  matching how an empty `buyerName` already means "not recorded" (spec §3).
- Reuse existing UI patterns: the card/chip selection interaction already
  used in onboarding's `RoleStep` for categorical choices, the existing
  `TextInput` + `keyboardType="number-pad"` pattern for counts (spec §4).
- No backfill logic — no real users yet (spec, scope note).
- The existing `users.breed` profile field stays untouched — it's
  unrelated to the new per-batch `breed` this plan adds (spec, scope note).

---

## Task 1: Add breed/placementDate/initialBirdCount/buyerType columns

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/00XX_<generated-name>.sql` (auto-generated)

**Interfaces:**
- Consumes: none
- Produces: `batches.breed: "cobb_500" | "ross_308" | "hubbard" | "sonali" | "deshi" | "other" | null`,
  `batches.placementDate: Date | null`, `batches.initialBirdCount: number | null`,
  `saleMetaData.buyerType: "wholesaler" | "retail" | "direct" | null`
  (Drizzle-inferred columns, consumed by Task 2)

- [ ] **Step 1: Add the columns to the schema**

In `db/schema.ts`, in the `batches` table definition, add `breed`,
`placementDate`, and `initialBirdCount` immediately after the existing
`name` column:

```ts
export const batches = sqliteTable("batches", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  breed: text("breed", {
    enum: ["cobb_500", "ross_308", "hubbard", "sonali", "deshi", "other"],
  }),
  placementDate: integer("placement_date", { mode: "timestamp" }),
  initialBirdCount: integer("initial_bird_count"),
  // null = still active. One column instead of a status enum to keep in sync.
  closedAt: integer("closed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  userIdx: index("batches_user_id_idx").on(table.userId, table.closedAt),
}));
```

In the `saleMetaData` table definition, add `buyerType` immediately after
the existing `buyerName` column:

```ts
  buyerName: text("buyer_name"),
  buyerType: text("buyer_type", {
    enum: ["wholesaler", "retail", "direct"],
  }),
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`

This creates a new `db/migrations/00XX_<random-name>.sql` file, updates
`db/migrations/meta/_journal.json` and adds a new
`db/migrations/meta/00XX_snapshot.json`, and regenerates
`db/migrations/migrations.js`. Note the generated filename for the next
step. If drizzle-kit prompts interactively about a column being a rename
vs. a new column, answer "create column" for all four — these are new
columns, not renames.

- [ ] **Step 3: Verify the generated migration**

Read the new SQL file. Expected content (order may vary slightly, but all
four statements must be present and none may have `NOT NULL`):

```sql
ALTER TABLE `batches` ADD `breed` text;
--> statement-breakpoint
ALTER TABLE `batches` ADD `placement_date` integer;
--> statement-breakpoint
ALTER TABLE `batches` ADD `initial_bird_count` integer;
--> statement-breakpoint
ALTER TABLE `sale_meta_data` ADD `buyer_type` text;
```

- [ ] **Step 4: Run the existing test suite to confirm nothing broke**

Run: `npx jest`
Expected: all existing suites still pass (purely additive, nullable
columns).

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts db/migrations/
git commit -m "feat(db): add breed/placementDate/initialBirdCount to batches, buyerType to sales"
```

---

## Task 2: Thread the new fields through lib/types.ts and lib/storage.ts

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/storage.ts`
- Modify: `__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `batches.breed`, `batches.placementDate`, `batches.initialBirdCount`,
  `saleMetaData.buyerType` (from Task 1)
- Produces: `SaleMetaData.buyerType?: "wholesaler" | "retail" | "direct"`;
  `updateBatchDetails(batchId: string, details: { breed?: Batch["breed"] | null; placementDate?: number | null; initialBirdCount?: number | null }): Promise<void>`
  (consumed by Task 4)

- [ ] **Step 1: Extend the failing tests first**

In `__tests__/storage.test.ts`, add `updateBatchDetails` to the import
list from `../lib/storage` (alongside the existing `createBatch`,
`renameBatch`, etc.).

Add these two tests inside the existing `describe("batches", () => { ... })`
block, right after the existing `"renames a batch"` test:

```ts
  it("saves and updates breed, placement date, and bird count", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await updateBatchDetails(id, {
      breed: "cobb_500",
      placementDate: 5_000,
      initialBirdCount: 500,
    });

    const loaded = await loadBatch(id);
    expect(loaded?.batch.breed).toBe("cobb_500");
    expect(loaded?.batch.placementDate?.getTime()).toBe(5_000);
    expect(loaded?.batch.initialBirdCount).toBe(500);
  });

  it("clears breed, placement date, and bird count when omitted", async () => {
    const id = "b-id";
    await createBatch("user-1", id, "Shed 1");
    await updateBatchDetails(id, {
      breed: "cobb_500",
      placementDate: 5_000,
      initialBirdCount: 500,
    });
    await updateBatchDetails(id, {});

    const loaded = await loadBatch(id);
    expect(loaded?.batch.breed).toBeNull();
    expect(loaded?.batch.placementDate).toBeNull();
    expect(loaded?.batch.initialBirdCount).toBeNull();
  });
```

Add these two tests inside the existing `describe("saveSale + loadSales", () => { ... })`
block, right after its last existing test:

```ts
  it("saves and reads back buyerType", async () => {
    await saveSale(
      "user-1",
      makeSale({ meta: makeMeta({ buyerType: "wholesaler" }) }),
    );
    const [sale] = await loadSales("user-1");
    expect(sale.meta?.buyerType).toBe("wholesaler");
  });

  it("leaves buyerType undefined when not provided", async () => {
    await saveSale("user-1", makeSale());
    const [sale] = await loadSales("user-1");
    expect(sale.meta?.buyerType).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/storage.test.ts`
Expected: FAIL — `updateBatchDetails` is not exported / `buyerType` is not
a recognized field on `SaleMetaData` (TypeScript) or the new assertions
fail because the fields aren't persisted yet.

- [ ] **Step 3: Add `buyerType` to `SaleMetaData`**

In `lib/types.ts`, add to the `SaleMetaData` interface, right after
`buyerName?: string;`:

```ts
  buyerType?: "wholesaler" | "retail" | "direct";
```

- [ ] **Step 4: Thread `buyerType` through `lib/storage.ts`'s sale functions**

In `toSaleRecord`'s `meta` construction (the function containing
`buyerName: m.buyerName ?? undefined,`), add right after that line:

```ts
          buyerType: m.buyerType ?? undefined,
```

In `saveSale`'s `values` object (the block containing `buyerName: m.buyerName,`
inside `if (sale.meta) { ... }`), add right after that line:

```ts
        buyerType: m.buyerType,
```

(No other change needed there — `updatable` is already derived by
spreading `values` minus `saleId`, so `buyerType` flows into the
`onConflictDoUpdate` set automatically.)

- [ ] **Step 5: Add `updateBatchDetails`**

In `lib/storage.ts`, add this function right after the existing
`renameBatch` function (before `setBatchClosed`):

```ts
export type BatchDetails = {
  breed?: Batch["breed"] | null;
  placementDate?: number | null;
  initialBirdCount?: number | null;
};

export async function updateBatchDetails(
  batchId: string,
  details: BatchDetails,
): Promise<void> {
  await db
    .update(batches)
    .set({
      breed: details.breed ?? null,
      placementDate:
        details.placementDate != null
          ? new Date(details.placementDate)
          : null,
      initialBirdCount: details.initialBirdCount ?? null,
      updatedAt: new Date(),
    })
    .where(eq(batches.id, batchId));
}
```

(`Batch` is already defined and exported earlier in this file as
`export type Batch = typeof batches.$inferSelect;` — no new import
needed.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest __tests__/storage.test.ts`
Expected: PASS, all tests including the new ones

- [ ] **Step 7: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/storage.ts __tests__/storage.test.ts
git commit -m "feat(storage): thread breed/placementDate/initialBirdCount/buyerType through storage"
```

---

## Task 3: Add i18n copy for the new fields and their options

**Files:**
- Modify: `lib/i18n.ts`

**Interfaces:**
- Consumes: none
- Produces: `t.buyerType`, `t.buyerTypeWholesaler`, `t.buyerTypeRetail`,
  `t.buyerTypeDirect`, `t.batchBreed`, `t.batchBreedCobb500`,
  `t.batchBreedRoss308`, `t.batchBreedHubbard`, `t.batchBreedSonali`,
  `t.batchBreedDeshi`, `t.batchBreedOther`, `t.batchPlacementDate`,
  `t.batchPlacementDateNotSet`, `t.batchInitialBirdCount`,
  `t.batchInitialBirdCountPlaceholder` (consumed by Task 4 and Task 5)

- [ ] **Step 1: Add English copy**

In `lib/i18n.ts`, in the `en` object, immediately after the existing line
`buyerNamePlaceholder: "Buyer name (optional)",`, add:

```ts
  buyerType: "Buyer Type",
  buyerTypeWholesaler: "Wholesaler",
  buyerTypeRetail: "Retail",
  buyerTypeDirect: "Direct",
```

In the same `en` object, immediately after the existing line
`renameBatch: "Rename batch",`, add:

```ts
  batchBreed: "Breed",
  batchBreedCobb500: "Cobb 500",
  batchBreedRoss308: "Ross 308",
  batchBreedHubbard: "Hubbard",
  batchBreedSonali: "Sonali",
  batchBreedDeshi: "Deshi",
  batchBreedOther: "Other",
  batchPlacementDate: "Placement Date",
  batchPlacementDateNotSet: "Not set",
  batchInitialBirdCount: "Initial Bird Count",
  batchInitialBirdCountPlaceholder: "e.g. 500",
```

- [ ] **Step 2: Add Bangla copy**

In the `bn` object, immediately after the existing line
`buyerNamePlaceholder: "বায়ারের নাম (অপশনাল)",`, add:

```ts
  buyerType: "বায়ারের ধরন",
  buyerTypeWholesaler: "পাইকার",
  buyerTypeRetail: "খুচরা",
  buyerTypeDirect: "সরাসরি",
```

In the same `bn` object, immediately after the existing line
`renameBatch: "নাম বদলান",`, add:

```ts
  batchBreed: "জাত",
  batchBreedCobb500: "কব ৫০০",
  batchBreedRoss308: "রস ৩০৮",
  batchBreedHubbard: "হাবার্ড",
  batchBreedSonali: "সোনালী",
  batchBreedDeshi: "দেশি",
  batchBreedOther: "অন্যান্য",
  batchPlacementDate: "ফার্মে আনার তারিখ",
  batchPlacementDateNotSet: "নির্ধারিত নয়",
  batchInitialBirdCount: "প্রাথমিক মুরগির সংখ্যা",
  batchInitialBirdCountPlaceholder: "যেমন ৫০০",
```

- [ ] **Step 3: Run the full test suite**

Run: `npx jest`
Expected: all suites pass (i18n has no dedicated test suite; this just
confirms nothing else broke)

- [ ] **Step 4: Commit**

```bash
git add lib/i18n.ts
git commit -m "feat(i18n): add copy for breed, placement date, bird count, and buyer type"
```

---

## Task 4: Batch detail edit modal — breed, placement date, bird count

**Files:**
- Modify: `lib/utils.ts`
- Modify: `app/batch/[id].tsx`
- Modify: `package.json` (via `npx expo install`)

**Interfaces:**
- Consumes: `updateBatchDetails` (Task 2); `t.batchBreed` and related keys
  (Task 3); `Batch.breed`, `Batch.placementDate`, `Batch.initialBirdCount`
  (Task 1, via the existing `Batch` type)
- Produces: `formatDate(timestamp: number): string` in `lib/utils.ts`
  (not consumed elsewhere in this plan, but available for reuse)

- [ ] **Step 1: Install the date picker dependency**

Run: `npx expo install @react-native-community/datetimepicker`

- [ ] **Step 2: Add a date-only formatter**

In `lib/utils.ts`, the existing `formatDateTime` function has a local
`months` array. Extract it to a module-level constant and add a new
`formatDate` function that uses it. Replace:

```ts
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
```

with:

```ts
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = MONTHS[date.getMonth()];
```

(The rest of `formatDateTime`'s body — `day`, `year`, `hours`, etc. —
stays exactly as it is; only the `months` array declaration is removed
from inside it, since `MONTHS` now serves both functions.)

- [ ] **Step 3: Add imports to `app/batch/[id].tsx`**

Add `updateBatchDetails` to the existing import from `@/lib/storage`
(alongside `loadBatch`, `renameBatch`, `setBatchClosed`, `deleteBatch`,
`type Batch`).

Add `formatDate` to the existing import from `@/lib/utils` (alongside
`formatWeight`, `formatTk`, `formatDateTime`).

Add a new import:

```ts
import DateTimePicker from "@react-native-community/datetimepicker";
```

- [ ] **Step 4: Add state for the three new fields**

Replace:

```ts
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
```

with:

```ts
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState<Batch["breed"]>(null);
  const [placementDate, setPlacementDate] = useState<number | null>(null);
  const [initialBirdCount, setInitialBirdCount] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
```

- [ ] **Step 5: Populate the new state when opening the modal**

Find the `Pressable` that opens the rename modal (the one setting
`setName(batch?.name ?? "")` then `setRenaming(true)`). Replace it with:

```tsx
        <Pressable
          onPress={() => {
            setName(batch?.name ?? "");
            setBreed(batch?.breed ?? null);
            setPlacementDate(batch?.placementDate?.getTime() ?? null);
            setInitialBirdCount(
              batch?.initialBirdCount != null
                ? String(batch.initialBirdCount)
                : "",
            );
            setRenaming(true);
          }}
```

(Keep every other prop on that `Pressable` — `hitSlop`, `style`, and its
children — exactly as they are; only the `onPress` body changes.)

- [ ] **Step 6: Save all four fields together on submit**

Replace `handleRename`:

```ts
  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || !id) return;
    await renameBatch(id, trimmed);
    setRenaming(false);
    refresh();
  };
```

with:

```ts
  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || !id) return;
    const count = parseInt(initialBirdCount, 10);
    await Promise.all([
      renameBatch(id, trimmed),
      updateBatchDetails(id, {
        breed,
        placementDate,
        initialBirdCount:
          Number.isFinite(count) && count > 0 ? count : null,
      }),
    ]);
    setRenaming(false);
    refresh();
  };
```

- [ ] **Step 7: Add the breed picker, date field, and bird count input to the modal**

Inside the rename `Modal`'s `modalCard`, find the `TextInput` for `name`
(the one with `placeholder={t.batchNamePlaceholder}`). Immediately after
its closing `/>` and before the `<View style={styles.modalActions}>`
block, insert:

```tsx
            <Text
              style={[
                styles.fieldLabel,
                { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.batchBreed}
            </Text>
            <View style={styles.chipRow}>
              {(
                [
                  ["cobb_500", t.batchBreedCobb500],
                  ["ross_308", t.batchBreedRoss308],
                  ["hubbard", t.batchBreedHubbard],
                  ["sonali", t.batchBreedSonali],
                  ["deshi", t.batchBreedDeshi],
                  ["other", t.batchBreedOther],
                ] as const
              ).map(([key, label]) => {
                const selected = breed === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setBreed(selected ? null : key)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected
                          ? theme.accentLight
                          : theme.background,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: selected ? theme.accent : theme.text,
                          fontFamily: "Outfit_500Medium",
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[
                styles.fieldLabel,
                { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.batchPlacementDate}
            </Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[
                styles.modalInput,
                { borderColor: theme.border, backgroundColor: theme.background },
              ]}
            >
              <Text
                style={{
                  color: placementDate ? theme.text : theme.textTertiary,
                  fontFamily: "Outfit_500Medium",
                  fontSize: 15,
                }}
              >
                {placementDate
                  ? formatDate(placementDate)
                  : t.batchPlacementDateNotSet}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={placementDate ? new Date(placementDate) : new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_event, date) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (date) setPlacementDate(date.getTime());
                }}
              />
            )}

            <Text
              style={[
                styles.fieldLabel,
                { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.batchInitialBirdCount}
            </Text>
            <TextInput
              value={initialBirdCount}
              onChangeText={setInitialBirdCount}
              placeholder={t.batchInitialBirdCountPlaceholder}
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              style={[
                styles.modalInput,
                {
                  color: theme.text,
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  fontFamily: "Outfit_500Medium",
                },
              ]}
            />
```

- [ ] **Step 8: Add the new styles**

In the `styles` `StyleSheet.create({...})` at the bottom of the file, add,
right after the existing `modalTitle: { fontSize: 18 },` line:

```ts
  fieldLabel: { fontSize: 13, marginBottom: -2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 13 },
```

- [ ] **Step 9: Display the new fields in the batch header**

Find the header's subtitle `Text` (the one rendering
`{t.batchSessions(sales.length)}{range ? ...}`). Immediately after its
closing `</Text>`, add:

```tsx
          {(batch?.breed || batch?.placementDate || batch?.initialBirdCount) && (
            <Text
              style={[
                styles.headerSub,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
              numberOfLines={1}
            >
              {[
                batch?.breed
                  ? {
                      cobb_500: t.batchBreedCobb500,
                      ross_308: t.batchBreedRoss308,
                      hubbard: t.batchBreedHubbard,
                      sonali: t.batchBreedSonali,
                      deshi: t.batchBreedDeshi,
                      other: t.batchBreedOther,
                    }[batch.breed]
                  : null,
                batch?.placementDate ? formatDate(batch.placementDate.getTime()) : null,
                batch?.initialBirdCount ? `${batch.initialBirdCount} ${t.birds}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          )}
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/batch/[id].tsx` or `lib/utils.ts`
(pre-existing unrelated errors in `supabase/functions/drive-token/index.ts`
are expected and not part of this change).

- [ ] **Step 11: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 12: Bundle-check proxy (no live device in this environment)**

Run: `npx expo export --platform ios --output-dir <a scratch dir under /tmp>`
Expected: completes with `iOS Bundled` and no errors (confirms
`app/batch/[id].tsx` and the new `@react-native-community/datetimepicker`
import resolve correctly through Metro). Delete the scratch output dir
afterward.

- [ ] **Step 13: Commit**

```bash
git add lib/utils.ts app/batch/[id].tsx package.json package-lock.json
git commit -m "feat(batch): add breed, placement date, and bird count to batch edit modal"
```

(If this project uses `yarn.lock` or `pnpm-lock.yaml` instead of
`package-lock.json`, add whichever lockfile `npx expo install` actually
modified.)

---

## Task 5: Buyer type picker in the sale-completion flow

**Files:**
- Modify: `app/measurement.tsx`

**Interfaces:**
- Consumes: `SaleMetaData.buyerType` (Task 2); `t.buyerType`,
  `t.buyerTypeWholesaler`, `t.buyerTypeRetail`, `t.buyerTypeDirect` (Task 3)
- Produces: nothing consumed by later tasks in this plan (Task 6 is
  independent — it only reads `meta.buyerType`, already produced by Task 2)

- [ ] **Step 1: Add state for buyerType**

In the component containing the Buyer card (the one with
`const [buyerName, setBuyerName] = useState("");`), add right after that
line:

```ts
  const [buyerType, setBuyerType] = useState<
    "wholesaler" | "retail" | "direct" | null
  >(null);
```

- [ ] **Step 2: Reset it alongside buyerName**

Find the `useEffect` that resets `buyerName` to `""` when the modal
becomes visible (the block starting `if (visible) { setReceivedAmount(""); setBuyerName("");`).
Add `setBuyerType(null);` right after `setBuyerName("");` in that block.

- [ ] **Step 3: Include it in the saved meta object**

In `handleSave`, find the `meta: SaleMetaData` object's
`buyerName: buyerName.trim() || undefined,` line. Add right after it:

```ts
        buyerType: buyerType ?? undefined,
```

- [ ] **Step 4: Add the picker to the Buyer card UI**

Find the buyer-name `TextInput` inside the Buyer card (the one with
`placeholder={t.buyerNamePlaceholder}`). Immediately after its closing
`/>`, insert:

```tsx
              <Text
                style={[
                  styles.buyerNameLabel,
                  {
                    color: theme.text,
                    fontFamily: "Outfit_600SemiBold",
                    marginTop: 10,
                  },
                ]}
              >
                {t.buyerType}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {(
                  [
                    ["wholesaler", t.buyerTypeWholesaler],
                    ["retail", t.buyerTypeRetail],
                    ["direct", t.buyerTypeDirect],
                  ] as const
                ).map(([key, label]) => {
                  const selected = buyerType === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setBuyerType(selected ? null : key)}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        paddingVertical: 8,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        backgroundColor: selected
                          ? theme.accentLight
                          : theme.background,
                        borderColor: selected ? theme.accent : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: selected ? theme.accent : theme.text,
                          fontFamily: "Outfit_500Medium",
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
```

(This reuses the existing `theme` variable already in scope in this
component, and the existing `styles.buyerNameLabel` style for visual
consistency with the "Buyer" label above it.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/measurement.tsx`

- [ ] **Step 6: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 7: Bundle-check proxy**

Run: `npx expo export --platform ios --output-dir <a scratch dir under /tmp>`
Expected: completes cleanly. Delete the scratch dir afterward.

- [ ] **Step 8: Commit**

```bash
git add app/measurement.tsx
git commit -m "feat(measurement): add buyer type picker to the Buyer card"
```

---

## Task 6: Show buyerType on the sale detail screen

**Files:**
- Modify: `app/sale/[id]/index.tsx`

**Interfaces:**
- Consumes: `meta.buyerType` (Task 2, via `SaleMetaData`); `t.buyerTypeWholesaler`,
  `t.buyerTypeRetail`, `t.buyerTypeDirect` (Task 3)

- [ ] **Step 1: Display buyerType alongside buyerName**

Find the block conditionally rendering `meta?.buyerName` (the `Text` with
`styles.heroBuyer`). Replace:

```tsx
              {meta?.buyerName ? (
                <Text
                  style={[styles.heroBuyer, { fontFamily: "Outfit_500Medium" }]}
                >
                  {meta.buyerName}
                </Text>
              ) : null}
```

with:

```tsx
              {meta?.buyerName || meta?.buyerType ? (
                <Text
                  style={[styles.heroBuyer, { fontFamily: "Outfit_500Medium" }]}
                >
                  {[
                    meta?.buyerName,
                    meta?.buyerType
                      ? {
                          wholesaler: t.buyerTypeWholesaler,
                          retail: t.buyerTypeRetail,
                          direct: t.buyerTypeDirect,
                        }[meta.buyerType]
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ) : null}
```

(`t` must already be in scope in this component via `useSettings()` — this
screen already uses `t` elsewhere for other labels; if it isn't already
destructured at the top of the component, add
`const { t } = useSettings();` alongside the existing `useTheme()` call.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/sale/[id]/index.tsx`

- [ ] **Step 3: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 4: Bundle-check proxy**

Run: `npx expo export --platform ios --output-dir <a scratch dir under /tmp>`
Expected: completes cleanly. Delete the scratch dir afterward.

- [ ] **Step 5: Commit**

```bash
git add app/sale/[id]/index.tsx
git commit -m "feat(sale): display buyer type alongside buyer name"
```
