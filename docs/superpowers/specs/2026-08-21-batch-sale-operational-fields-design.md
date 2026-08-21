# Batch/Sale Operational Fields — Design Spec

Status: approved, ready for implementation planning
Scope: add breed, placement date, and initial bird count to batches, and a
categorized buyer type to sales — all optional, all locally collected.

Explicitly OUT of scope for this spec (separate, later work):
- The community analytics dataset itself (star schema: `farm_profile` /
  `batch_profile` / `sale_event`, pseudonymization, the push pipeline) —
  the third and final sub-project, designed after this one ships.
- Wiring up a UI for the existing `users.breed` profile-level field — it
  already exists in the schema and `OnboardingData` type but has no form
  control anywhere in the app. It's unrelated to the new per-batch `breed`
  this spec adds, and stays exactly as it is (unused).
- Any change to how `buyerName` (free text) is collected or displayed —
  `buyerType` is added alongside it, not a replacement.
- Backfilling existing batches/sales — no real users yet, per the same
  reasoning as the structured-location-fields spec.

---

## 1. Background

This is the second of three sequential sub-projects preparing the app for a
future community analytics dataset (see
`docs/superpowers/specs/2026-08-21-structured-location-fields-design.md`,
the first sub-project, already shipped). That dataset's planned `sale_event`
fact table needs `breed`, `age_days_at_sale` (derivable from a batch's
placement date and a sale's date), `initial_bird_count`, and `buyer_type` —
none of which the app currently collects anywhere:

- `breed` exists only as a free-text field on the user's *profile*
  ("what breed do you usually raise"), never per-batch or per-sale, and has
  no UI regardless (see the out-of-scope note above).
- Batches (`db/schema.ts`'s `batches` table) record only a `name` and
  timestamps — no placement date, no starting flock size.
- Sales record a free-text `buyerName` (`saleMetaData.buyerName`), not a
  categorized buyer type.

This spec adds the missing fields as optional data, collected where they
naturally fit into the app's existing flows, so the future analytics
sub-project has real data to draw from instead of designing around gaps.

## 2. Goals

- The three new batch fields (`breed`, `placementDate`, `initialBirdCount`)
  are optional and don't add friction to batch creation, which is
  currently a fast, single-field, frequently-used action.
- `buyerType` is optional and sits alongside the existing optional
  `buyerName` field with the same friction level (i.e. none forced).
- Reuse existing UI patterns wherever one exists (the onboarding role-card
  picker for categorical choices, the `InfoField` row style for text/number
  inputs) rather than inventing new ones.
- Introduce a date picker (this app currently has none) using the standard
  Expo-compatible library, not a hand-built one.

## 3. Data model

Add to `batches` (`db/schema.ts`), all nullable — none of this is
UI-required, so there's no draft/complete distinction to preserve like
onboarding's fields have:

```ts
breed: text("breed", {
  enum: ["cobb_500", "ross_308", "hubbard", "sonali", "deshi", "other"],
}),
placementDate: integer("placement_date", { mode: "timestamp" }),
initialBirdCount: integer("initial_bird_count"),
```

Add to `saleMetaData`:

```ts
buyerType: text("buyer_type", {
  enum: ["wholesaler", "retail", "direct"],
}),
```

No "unknown" enum value — null already means unset, matching how
`buyerName` being empty already means "not recorded." A standard
`drizzle-kit generate` migration adds all four columns. No backfill needed
(no real users yet).

The breed list (`cobb_500` / `ross_308` / `hubbard` / `sonali` / `deshi` /
`other`) is carried over from an earlier draft of the analytics schema,
explicitly flagged there as unverified against real farm usage — using it
now as a fixed picker is a deliberate choice to get clean categorical data
immediately, accepting the risk that the list may need revision later (a
future migration, if so).

## 4. UI/UX flow

**Batch fields** — `app/batch/[id].tsx` already has a rename-only edit
modal (`renaming` state, `handleRename`, the modal starting around line
577). It gets extended with three more optional fields, all editable
alongside the existing name field in the same save action:

- **Breed**: a card-picker matching onboarding's `RoleStep` pattern (`app/onboarding.tsx`'s
  role-selection cards) — six selectable cards, one per breed, none
  selected by default.
- **Placement date**: a tappable field opening
  `@react-native-community/datetimepicker`'s native date picker (new
  dependency — this app has no date picker anywhere today). Shows "Not set"
  until a date is picked.
- **Initial bird count**: a numeric input reusing the `InfoField` row style
  (label + icon + input) already used elsewhere in onboarding, with
  `keyboardType="number-pad"`.

The batch detail header (currently showing just `batch.name` and a
subtitle, around line 261-299) displays these three values when set,
alongside the name.

**Buyer type** — `app/measurement.tsx`'s existing "Buyer" card (around line
966-1011, currently just the optional `buyerName` `TextInput`) gets a
compact three-option chip/card picker (Wholesaler / Retail / Direct) next
to it. No selection required; skipping leaves `buyerType` null, exactly
like leaving `buyerName` blank today.

`app/sale/[id]/index.tsx`'s summary (around line 288-292, where
`meta.buyerName` is conditionally displayed) shows `buyerType` alongside
`buyerName` when set.

## 5. Error handling

No network calls — everything here is local SQLite. The only real
validation: `initialBirdCount` rejects non-positive values on save (light
client-side check, consistent with how other numeric fields in this app are
handled — no error toast needed, just prevent an invalid save). Breed and
buyer type are picker-driven, so they're always a valid enum value or
unset — no free-text validation needed. The native date picker guarantees a
valid date or "unset," nothing to validate there.

## 6. File structure

- Modify: `db/schema.ts` — add `breed`, `placementDate`, `initialBirdCount`
  to `batches`; add `buyerType` to `saleMetaData`
- Modify: `db/migrations/` — new migration (four nullable columns,
  additive-only)
- Modify: `lib/storage.ts` — a new function saving the three batch-detail
  fields together (alongside the existing `renameBatch` /
  `setBatchClosed` / `deleteBatch`), and threading `buyerType` through the
  existing sale-save path next to `buyerName`
- Modify: `app/batch/[id].tsx` — extend the rename-only edit modal with the
  breed picker, date picker, and bird-count input; display them in the
  header
- Modify: `app/measurement.tsx` — add the buyer-type chip picker to the
  existing Buyer card, wire it into the sale-save call
- Modify: `app/sale/[id]/index.tsx` — display `buyerType` alongside
  `buyerName`
- Modify: `lib/i18n.ts` — new copy (en/bn) for all new fields, the six
  breed options, and the three buyer-type options
- Modify: `package.json` — add `@react-native-community/datetimepicker`
  via `npx expo install @react-native-community/datetimepicker`

## 7. Testing

Unit tests in `__tests__/storage.test.ts`, matching its existing style
(round-trip against the real in-memory SQLite DB via the same
`applyMigrations()`/`resetDb()` helpers `__tests__/onboarding.test.ts`
uses):

- The new batch-detail save function round-trips `breed`, `placementDate`,
  and `initialBirdCount`, and leaves them null when not provided.
- The sale-save path round-trips `buyerType` alongside the existing
  `buyerName` coverage, and leaves it null when not provided.

No component tests — this codebase has no React Native Testing Library
setup; UI changes are verified manually (or via the bundle-check proxy used
in the previous sub-project, where a live device isn't available) rather
than automated component tests, consistent with the rest of the app's UI
code.

## 8. Explicitly out of scope

- The community analytics dataset (star schema, pseudonymization, push
  pipeline) — designed last, once this sub-project ships.
- A UI for the existing orphaned `users.breed` profile field — stays
  unused, unrelated to this spec's new per-batch `breed`.
- Any change to `buyerName`'s existing free-text behavior.
- Backfilling existing batches/sales — no real users yet.
