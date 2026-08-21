# Structured Location Fields (District + Upazila) — Design Spec

Status: approved, ready for implementation planning
Scope: replace free-text location with structured District + Upazila fields
on the user profile, required at onboarding.

Explicitly OUT of scope for this spec (separate, later work):
- New operational fields on batches/sales (breed, placement date, initial
  bird count, buyer type) — a separate sub-project.
- The community analytics dataset itself (star schema, pseudonymization,
  push pipeline) — depends on this spec and the one above; designed last.
- Any UI for the community/premium plan itself (unchanged by this work).
- Backfilling existing users' free-text location into the new fields — there
  are no real users yet, so this is moot for now.

---

## 1. Background

This is the first of three sequential sub-projects that together prepare the
app for a future community analytics dataset (a star-schema Postgres store,
consent-gated to `subscriptionPlan: "community"` users, fed by finished
sales). That dataset needs region-level location — district and upazila —
to support price benchmarking, and needs it as stable IDs rather than free
text so it can join cleanly against reference tables of the same shape.

Today, `users.location` (`db/schema.ts`) is a single optional free-text
field collected in `app/onboarding.tsx`'s `BasicInfoStep`, with placeholder
copy "Village, Upazila, District" but no enforced structure. Nothing
guarantees a user actually entered it in that order, or that a district or
upazila name is reliably extractable from it. This spec replaces that
implicit structure with two explicit, required, ID-backed fields.

This sub-project stands on its own — it doesn't require the other two to
exist, and ships value independently (cleaner profile data, a foundation
any future region-based feature can build on).

## 2. Goals

- Every user going forward has a district and upazila on record, captured
  as stable IDs, not free text.
- The picker works entirely offline, consistent with this app's offline-first
  design — no network dependency for something this static.
- The existing free-text detail (village/area, for the user's own reference)
  is preserved, just decoupled from the region fields.
- The ID scheme used locally is the same one a future Postgres reference
  table would use, so no reconciliation step is needed when the analytics
  dataset sub-project eventually consumes this data.

## 3. Reference data

Vendor one canonical snapshot of Bangladesh's division → district → upazila
hierarchy from
[nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode) (or
an actively-maintained fork if that repo is stale at implementation time) as
a single JSON file checked into the repo — e.g. `lib/regions/bd-regions.json`.
That project ships `id`, parent `division_id` / `district_id`, English
`name`, and `bn_name` for all 8 divisions, 64 districts, and ~495 upazilas,
sourced from bangladesh.gov.bd, Wikipedia, and Google Maps.

Its IDs are the project's own stable identifiers, not official BBS
statistical codes — that's fine here: this one checked-in file is the single
source of truth for both this local reference module and, later, the
Postgres seed the analytics-dataset sub-project will write, so the two sides
can never drift out of sync regardless of what the IDs mean externally.
License and currency of the source get a final check at implementation
time; this is a static, rarely-changing dataset, so that's a one-time cost.

A thin wrapper module (e.g. `lib/regions/index.ts`) exposes typed lookups:
list divisions, list districts for a division, list upazilas for a district,
and resolve a district/upazila name by ID (used for display).

## 4. Data model

Add two nullable columns to `users` (`db/schema.ts`):

```ts
districtId: text("district_id"),
upazilaId: text("upazila_id"),
```

Nullable at the DB level, matching the existing convention — `name`,
`phone`, and other onboarding-required fields are nullable too, because
`saveOnboardingDraft` persists partial state as the user progresses through
onboarding steps. "Required" is enforced at the UI step (the Next button),
not the schema.

`users.location` is unchanged in the schema — it's repurposed in the UI as
an optional "Village/Area" detail, decoupled from the structured fields, but
no migration is needed for it.

A standard `drizzle-kit generate` migration adds `district_id` and
`upazila_id`. No backfill logic — there are no real users on this app yet.

## 5. UI/UX flow

In `BasicInfoStep` (`app/onboarding.tsx`), the single free-text "Address"
field is replaced by:

- Two required, tappable fields ("District", "Upazila") styled like the
  existing `InfoField`, each opening a picker modal on tap.
- A cascading picker: tapping District opens a modal (reusing the `Modal`
  pattern already in `app/profile.tsx`'s `UpgradeModal`) with a
  search-as-you-type list of the 64 districts. Selecting one opens the
  Upazila modal, pre-filtered to that district's ~5-15 upazilas. Picking a
  district clears any previously-selected upazila that no longer belongs to
  it.
- Below those, the existing free-text field stays, relabeled "Village/Area
  (optional)" — same `InfoField`, now mapped to `location` only, no longer
  implying district/upazila.

`canProceed` for this step now also requires `districtId` and `upazilaId` to
be set, the same way it already gates on `name` and `phone`.

`app/profile.tsx`'s read-only profile display resolves `districtId` /
`upazilaId` to English names via the reference module and shows them
alongside the existing village/area text.

## 6. Error handling

- No network calls are involved — the reference data is a bundled static
  import, so there's no loading or network-error state to design for.
- Defensive-only: if `upazilaId` is ever set without a `districtId` that
  contains it (shouldn't happen through the UI), display resolution returns
  nothing rather than throwing, so a corrupt/edge-case row doesn't crash the
  profile screen.

## 7. File structure

- Create: `lib/regions/bd-regions.json` (vendored reference data)
- Create: `lib/regions/index.ts` (typed lookups: divisions, districts,
  upazilas, id → name resolution)
- Modify: `db/schema.ts` — add `districtId`, `upazilaId` to `users`
- Modify: `db/migrations/` — new migration adding the two columns
- Modify: `lib/onboarding.ts` — `OnboardingData`, `saveUserProfile`,
  `saveOnboardingDraft`, `loadOnboardingDraft`, `getUserProfile` all thread
  the two new fields through, same shape as existing fields
- Modify: `app/onboarding.tsx` — `BasicInfoStep`'s address field split into
  District/Upazila pickers + relabeled village/area field; new picker modal
  component(s); `canProceed` gating
- Modify: `app/profile.tsx` — display resolved district/upazila

## 8. Testing

- Unit test for `lib/regions/index.ts`: every upazila's parent district ID
  resolves to a real district, every district's parent division ID resolves
  to a real division — a data-integrity smoke test against whatever
  snapshot is vendored.
- Existing onboarding-flow tests (if any cover step-gating) extended to
  assert the Basic Info step can't proceed without both IDs set.

## 9. Explicitly out of scope

- New operational fields on batches/sales (breed, placement date, initial
  bird count, buyer type) — a separate sub-project, designed next.
- The community analytics dataset (star schema: `farm_profile` /
  `batch_profile` / `sale_event`, pseudonymization, the push pipeline) —
  designed last, once both prerequisite sub-projects have shipped.
- Backfilling existing users' free-text location — no real users yet.
- Any change to the community/premium plan UI or logic.
