# Structured Location Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's free-text location field with required District +
Upazila fields backed by stable IDs, so a future analytics dataset can join
against location cleanly instead of parsing free text.

**Architecture:** A vendored, checked-in JSON snapshot of Bangladesh's
division → district → upazila hierarchy (ids + English/Bangla names) backs a
small typed lookup module. Two new nullable columns on `users`
(`district_id`, `upazila_id`) store the selection; the existing `location`
column is repurposed as an optional free-text "Village/Area" detail. A
cascading picker (District, then Upazila) in onboarding gates progression;
the profile screen displays the resolved names.

**Tech Stack:** React Native / Expo Router, TypeScript, Drizzle ORM
(`expo-sqlite`), Jest (`babel-jest`, node test environment, no component
testing library — this codebase only unit-tests `lib/`/`db/` logic).

**Spec:** `docs/superpowers/specs/2026-08-21-structured-location-fields-design.md`

## Global Constraints

- No network calls at runtime — the region reference data is a bundled
  static import, matching this app's offline-first design (spec §2, §6).
- District and Upazila are required to proceed past onboarding's Basic Info
  step; the underlying DB columns stay nullable, matching the existing
  convention for other onboarding-required fields (spec §4).
- No backfill logic for existing users — there are no real users yet (spec,
  scope note).
- No new npm dependencies — the picker reuses the existing `Modal` pattern
  already in `app/profile.tsx`'s `UpgradeModal` (spec §5).
- Vendored reference data comes from a single checked-in JSON file, used as
  the source for both the local module and (later, out of scope here) a
  future Postgres seed — see spec §3.

---

## Task 1: Vendor Bangladesh region reference data + typed lookup module

**Files:**
- Create: `scripts/vendor-bd-regions.mjs`
- Create: `lib/regions/bd-regions.json`
- Create: `lib/regions/index.ts`
- Test: `__tests__/regions.test.ts`

**Interfaces:**
- Produces: `Division { id: string; nameEn: string; nameBn: string }`,
  `District { id: string; divisionId: string; nameEn: string; nameBn: string }`,
  `Upazila { id: string; districtId: string; nameEn: string; nameBn: string }`
  (all exported from `lib/regions/index.ts`)
- Produces: `listDistricts(): District[]`,
  `listUpazilas(districtId: string): Upazila[]`,
  `getDistrictName(id: string | null | undefined, language: "en" | "bn"): string | null`,
  `getUpazilaName(id: string | null | undefined, language: "en" | "bn"): string | null`

- [ ] **Step 1: Write the vendoring script**

The source data comes from
[nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode),
confirmed at plan-writing time to serve `divisions/divisions.json`,
`districts/districts.json`, and `upazilas/upazilas.json` as phpMyAdmin JSON
exports — a 3-element array per file, where element `[2]` has a `.data`
array of the actual rows (8 divisions, 64 districts, 494 upazilas). Rows
carry `id`, `name`, `bn_name`, and (for districts/upazilas) a parent
`division_id`/`district_id`, plus `lat`/`lon`/`url` fields this app doesn't
need.

Create `scripts/vendor-bd-regions.mjs`:

```js
// One-off / re-runnable vendoring script: fetches Bangladesh's division →
// district → upazila hierarchy from nuhil/bangladesh-geocode and writes a
// normalized snapshot to lib/regions/bd-regions.json. Re-run this if the
// upstream source is ever updated; do not hand-edit the output file.
const BASE = "https://raw.githubusercontent.com/nuhil/bangladesh-geocode/master";

async function fetchRows(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const json = await res.json();
  const table = json.find((el) => el.type === "table");
  if (!table) throw new Error(`No table data found in ${path}`);
  return table.data;
}

async function main() {
  const [divisionRows, districtRows, upazilaRows] = await Promise.all([
    fetchRows("divisions/divisions.json"),
    fetchRows("districts/districts.json"),
    fetchRows("upazilas/upazilas.json"),
  ]);

  const divisions = divisionRows.map((r) => ({
    id: r.id,
    nameEn: r.name,
    nameBn: r.bn_name,
  }));
  const districts = districtRows.map((r) => ({
    id: r.id,
    divisionId: r.division_id,
    nameEn: r.name,
    nameBn: r.bn_name,
  }));
  const upazilas = upazilaRows.map((r) => ({
    id: r.id,
    districtId: r.district_id,
    nameEn: r.name,
    nameBn: r.bn_name,
  }));

  const out = { divisions, districts, upazilas };
  const fs = await import("fs");
  fs.writeFileSync(
    new URL("../lib/regions/bd-regions.json", import.meta.url),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(
    `Wrote ${divisions.length} divisions, ${districts.length} districts, ${upazilas.length} upazilas`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script to generate the data file**

Run: `node scripts/vendor-bd-regions.mjs`
Expected output: `Wrote 8 divisions, 64 districts, 494 upazilas`

This creates `lib/regions/bd-regions.json`. Confirm it exists and has the
three top-level arrays:

Run: `node -e "const d = require('./lib/regions/bd-regions.json'); console.log(Object.keys(d), d.divisions.length, d.districts.length, d.upazilas.length)"`
Expected: `[ 'divisions', 'districts', 'upazilas' ] 8 64 494`

- [ ] **Step 3: Write the failing data-integrity test**

Create `__tests__/regions.test.ts`:

```ts
import data from "../lib/regions/bd-regions.json";
import { listDistricts, listUpazilas, getDistrictName, getUpazilaName } from "../lib/regions";

describe("bd-regions data integrity", () => {
  it("has 8 divisions, 64 districts, and upazilas", () => {
    expect(data.divisions.length).toBe(8);
    expect(data.districts.length).toBe(64);
    expect(data.upazilas.length).toBeGreaterThan(400);
  });

  it("every district's divisionId resolves to a real division", () => {
    const divisionIds = new Set(data.divisions.map((d) => d.id));
    for (const district of data.districts) {
      expect(divisionIds.has(district.divisionId)).toBe(true);
    }
  });

  it("every upazila's districtId resolves to a real district", () => {
    const districtIds = new Set(data.districts.map((d) => d.id));
    for (const upazila of data.upazilas) {
      expect(districtIds.has(upazila.districtId)).toBe(true);
    }
  });
});

describe("lib/regions lookups", () => {
  it("listDistricts returns all districts", () => {
    expect(listDistricts().length).toBe(64);
  });

  it("listUpazilas filters by district", () => {
    const [firstDistrict] = listDistricts();
    const upazilas = listUpazilas(firstDistrict.id);
    expect(upazilas.length).toBeGreaterThan(0);
    for (const u of upazilas) expect(u.districtId).toBe(firstDistrict.id);
  });

  it("listUpazilas returns nothing for an unknown district", () => {
    expect(listUpazilas("not-a-real-id")).toEqual([]);
  });

  it("getDistrictName resolves English and Bangla names", () => {
    const [firstDistrict] = listDistricts();
    expect(getDistrictName(firstDistrict.id, "en")).toBe(firstDistrict.nameEn);
    expect(getDistrictName(firstDistrict.id, "bn")).toBe(firstDistrict.nameBn);
  });

  it("getDistrictName returns null for a missing or unknown id", () => {
    expect(getDistrictName(null, "en")).toBeNull();
    expect(getDistrictName("not-a-real-id", "en")).toBeNull();
  });

  it("getUpazilaName resolves English and Bangla names", () => {
    const [firstDistrict] = listDistricts();
    const [firstUpazila] = listUpazilas(firstDistrict.id);
    expect(getUpazilaName(firstUpazila.id, "en")).toBe(firstUpazila.nameEn);
    expect(getUpazilaName(firstUpazila.id, "bn")).toBe(firstUpazila.nameBn);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx jest __tests__/regions.test.ts`
Expected: FAIL — `Cannot find module '../lib/regions'`

- [ ] **Step 5: Write `lib/regions/index.ts`**

```ts
import data from "./bd-regions.json";

export interface Division {
  id: string;
  nameEn: string;
  nameBn: string;
}

export interface District {
  id: string;
  divisionId: string;
  nameEn: string;
  nameBn: string;
}

export interface Upazila {
  id: string;
  districtId: string;
  nameEn: string;
  nameBn: string;
}

export function listDistricts(): District[] {
  return data.districts;
}

export function listUpazilas(districtId: string): Upazila[] {
  return data.upazilas.filter((u) => u.districtId === districtId);
}

export function getDistrictName(
  id: string | null | undefined,
  language: "en" | "bn",
): string | null {
  if (!id) return null;
  const district = data.districts.find((d) => d.id === id);
  if (!district) return null;
  return language === "bn" ? district.nameBn : district.nameEn;
}

export function getUpazilaName(
  id: string | null | undefined,
  language: "en" | "bn",
): string | null {
  if (!id) return null;
  const upazila = data.upazilas.find((u) => u.id === id);
  if (!upazila) return null;
  return language === "bn" ? upazila.nameBn : upazila.nameEn;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest __tests__/regions.test.ts`
Expected: PASS, all 9 tests

- [ ] **Step 7: Commit**

```bash
git add scripts/vendor-bd-regions.mjs lib/regions/bd-regions.json lib/regions/index.ts __tests__/regions.test.ts
git commit -m "feat(regions): vendor Bangladesh district/upazila reference data"
```

---

## Task 2: Add districtId/upazilaId columns to the users table

**Files:**
- Modify: `db/schema.ts`
- Create: `db/migrations/00XX_<generated-name>.sql` (auto-generated)

**Interfaces:**
- Consumes: none
- Produces: `users.districtId: string | null`, `users.upazilaId: string | null`
  (Drizzle-inferred columns, consumed by Task 3)

- [ ] **Step 1: Add the two columns to the schema**

In `db/schema.ts`, in the `users` table definition, add `districtId` and
`upazilaId` immediately after the existing `location` column:

```ts
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  location: text("location"),
  districtId: text("district_id"),
  upazilaId: text("upazila_id"),
  is_onboarded: integer("is_onboarded", { mode: "boolean" })
    .notNull()
    .default(false),
  // ... rest unchanged
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`

This creates a new `db/migrations/00XX_<random-name>.sql` file, updates
`db/migrations/meta/_journal.json` and adds a new
`db/migrations/meta/00XX_snapshot.json`, and regenerates
`db/migrations/migrations.js` to import the new file. Note the generated
filename for the next step.

- [ ] **Step 3: Verify the generated migration**

Read the new SQL file. Expected content (column order may differ slightly
based on where they were inserted in the schema, but both statements must
be present and neither must have `NOT NULL`):

```sql
ALTER TABLE `users` ADD `district_id` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `upazila_id` text;
```

If drizzle-kit prompts interactively about column renames (it may think
this looks like a rename of an existing column), answer "create column"
for both — these are new columns, not renames of `location`.

- [ ] **Step 4: Run the existing test suite to confirm nothing broke**

Run: `npx jest`
Expected: all existing suites still pass (this migration only adds nullable
columns, so no existing test's assumptions change).

- [ ] **Step 5: Commit**

```bash
git add db/schema.ts db/migrations/
git commit -m "feat(db): add district_id and upazila_id columns to users"
```

---

## Task 3: Thread districtId/upazilaId through lib/onboarding.ts

**Files:**
- Modify: `lib/onboarding.ts`
- Modify: `__tests__/onboarding.test.ts`

**Interfaces:**
- Consumes: `users.districtId`, `users.upazilaId` (from Task 2)
- Produces: `OnboardingData.districtId: string`,
  `OnboardingData.upazilaId: string` (required — this type represents a
  *completed* profile; `saveOnboardingDraft` already takes
  `Partial<OnboardingData>`, so drafts don't need these set)

- [ ] **Step 1: Extend the failing test first**

In `__tests__/onboarding.test.ts`, update `makeProfile()` to include the
new required fields, and add a test asserting they round-trip:

```ts
function makeProfile(o: Partial<OnboardingData> = {}): OnboardingData {
  return {
    role: "farmer",
    name: "Afif",
    phone: "01700000000",
    email: "afif@example.com",
    location: "Dhaka",
    districtId: "1",
    upazilaId: "1",
    farmName: "Green Farm",
    subscriptionPlan: "community",
    ...o,
  };
}
```

Add to the `"profile round-trip"` describe block:

```ts
  it("saves and reads back districtId and upazilaId", async () => {
    await saveUserProfile("user-1", makeProfile({ districtId: "5", upazilaId: "42" }));

    const profile = await getUserProfile("user-1");
    expect(profile?.districtId).toBe("5");
    expect(profile?.upazilaId).toBe("42");
  });
```

Add to the `"onboarding draft"` describe block:

```ts
  it("saves and reloads a partial draft with only districtId set", async () => {
    await saveOnboardingDraft("user-1", { name: "Afif", districtId: "5" });

    const draft = await loadOnboardingDraft("user-1");
    expect(draft).toMatchObject({ name: "Afif", districtId: "5" });
    expect(draft?.upazilaId).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/onboarding.test.ts`
Expected: FAIL — TypeScript error on `makeProfile`'s missing
`districtId`/`upazilaId` (or, if TS isn't type-checked by the test runner,
the new assertions fail because the fields aren't persisted yet).

- [ ] **Step 3: Update `OnboardingData` and the four functions**

In `lib/onboarding.ts`:

Add to the `OnboardingData` interface, after `location`:

```ts
export interface OnboardingData {
  role: UserRole;
  name: string;
  phone: string;
  email: string;
  location: string;
  districtId: string;
  upazilaId: string;
  farmName?: string;
  businessName?: string;
  subscriptionPlan: SubscriptionPlan;
  farmCapacity?: number;
  breed?: string;
  buyingCapacity?: number;
  supplyRegions?: string;
}
```

In `saveUserProfile`, add `districtId: data.districtId, upazilaId: data.upazilaId,`
to both the `.values({...})` block and the `.onConflictDoUpdate({ set: {...} })`
block (right after `location: data.location,` in each).

In `saveOnboardingDraft`, add `districtId: data.districtId ?? null, upazilaId: data.upazilaId ?? null,`
to both the `.values({...})` block and the `.onConflictDoUpdate({ set: {...} })`
block (right after `location: data.location ?? "",` in each).

In `loadOnboardingDraft`, add `districtId: user.districtId ?? undefined, upazilaId: user.upazilaId ?? undefined,`
to the returned object (right after `location: user.location ?? undefined,`).

In `getUserProfile`, add `districtId: users.districtId, upazilaId: users.upazilaId,`
to the `.select({...})` projection (right after `location: users.location,`),
and add `districtId: user.districtId ?? "", upazilaId: user.upazilaId ?? "",`
to the returned object (right after `location: user.location ?? "",`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/onboarding.test.ts`
Expected: PASS, all tests including the new ones

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding.ts __tests__/onboarding.test.ts
git commit -m "feat(onboarding): thread districtId/upazilaId through profile save/load"
```

---

## Task 4: Add i18n copy for district/upazila/village-area

**Files:**
- Modify: `lib/i18n.ts`

**Interfaces:**
- Consumes: none
- Produces: `t.district`, `t.upazila`, `t.selectDistrict`, `t.selectUpazila`,
  `t.searchDistrictPlaceholder`, `t.searchUpazilaPlaceholder`,
  `t.villageArea`, `t.villageAreaPlaceholder`, `t.regionLabel` (consumed by
  Task 5 and Task 6); `t.locationLabel`'s copy changes (same key, new text)

- [ ] **Step 1: Update the English dictionary**

In `lib/i18n.ts`, in the `en` object, replace:

```ts
  address: "Address",
  addressPlaceholder: "Village, Upazila, District",
```

with:

```ts
  district: "District",
  upazila: "Upazila",
  selectDistrict: "Select district",
  selectUpazila: "Select upazila",
  searchDistrictPlaceholder: "Search district...",
  searchUpazilaPlaceholder: "Search upazila...",
  villageArea: "Village/Area",
  villageAreaPlaceholder: "e.g. Rampura",
  regionLabel: "Region",
```

And update the existing `locationLabel` line (used on the profile screen)
from:

```ts
  locationLabel: "Location",
```

to:

```ts
  locationLabel: "Village/Area",
```

- [ ] **Step 2: Update the Bangla dictionary**

In the `bn` object, replace:

```ts
  address: "অ্যাড্রেস",
  addressPlaceholder: "গ্রাম, উপজেলা, জেলা",
```

with:

```ts
  district: "জেলা",
  upazila: "উপজেলা",
  selectDistrict: "জেলা নির্বাচন করুন",
  selectUpazila: "উপজেলা নির্বাচন করুন",
  searchDistrictPlaceholder: "জেলা খুঁজুন...",
  searchUpazilaPlaceholder: "উপজেলা খুঁজুন...",
  villageArea: "গ্রাম/এলাকা",
  villageAreaPlaceholder: "যেমন রামপুরা",
  regionLabel: "অঞ্চল",
```

And update:

```ts
  locationLabel: "লোকেশন",
```

to:

```ts
  locationLabel: "গ্রাম/এলাকা",
```

- [ ] **Step 3: Verify no other file still references the removed keys**

Run: `grep -rn "t\.address\b\|t\.addressPlaceholder\b" app lib --include="*.tsx" --include="*.ts"`
Expected: no output (Task 5 will remove the one call site in
`app/onboarding.tsx`; if this grep finds it, Task 5 hasn't run yet — that's
expected at this point in the plan, just confirm there's exactly one site
and it's the one Task 5 will touch).

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: all suites pass (i18n has no dedicated test suite; this just
confirms nothing else broke)

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts
git commit -m "feat(i18n): add district/upazila copy, relabel location to village/area"
```

---

## Task 5: Replace the onboarding address field with a District/Upazila picker

**Files:**
- Modify: `app/onboarding.tsx`

**Interfaces:**
- Consumes: `listDistricts()`, `listUpazilas(districtId)`,
  `getDistrictName(id, language)`, `getUpazilaName(id, language)` (Task 1);
  `t.district`, `t.upazila`, `t.selectDistrict`, `t.selectUpazila`,
  `t.searchDistrictPlaceholder`, `t.searchUpazilaPlaceholder`,
  `t.villageArea`, `t.villageAreaPlaceholder` (Task 4);
  `OnboardingData.districtId`, `OnboardingData.upazilaId` (Task 3)
- Produces: nothing consumed by later tasks in this plan (Task 6 is
  independent, reading only from `lib/onboarding.ts` and `lib/regions`)

- [ ] **Step 1: Add imports**

In `app/onboarding.tsx`, add `Modal` to the existing `react-native` import
list (it currently imports `ActivityIndicator, Animated, Dimensions,
Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView,
StyleSheet, Text, TextInput, View` — insert `Modal` alphabetically).

Add a new import:

```ts
import { listDistricts, listUpazilas, getDistrictName, getUpazilaName } from "@/lib/regions";
```

- [ ] **Step 2: Add state and handlers to `OnboardingScreen`**

Replace:

```ts
  const [location, setLocation] = useState("");
```

with:

```ts
  const [location, setLocation] = useState("");
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [upazilaId, setUpazilaId] = useState<string | null>(null);
```

In the draft-load `useEffect`, add after the `location` line:

```ts
      if (draft.districtId) setDistrictId(draft.districtId);
      if (draft.upazilaId) setUpazilaId(draft.upazilaId);
```

In `persistDraft`, add to the draft object (after the `location` spread)
and to the dependency array:

```ts
  const persistDraft = useCallback(() => {
    if (!user) return;
    const draft: Partial<OnboardingData> = {
      ...(role && { role }),
      ...(name && { name }),
      ...(phone && { phone }),
      ...(location && { location }),
      ...(districtId && { districtId }),
      ...(upazilaId && { upazilaId }),
      ...(farmName && { farmName }),
      ...(businessName && { businessName }),
    };
    saveOnboardingDraft(user.id, draft);
  }, [user, role, name, phone, location, districtId, upazilaId, farmName, businessName]);
```

Add a district-select handler right after `handleRoleSelect`, which clears
a stale upazila when the district actually changes:

```ts
  const handleRoleSelect = (r: UserRole) => setRole(r);

  const handleDistrictSelect = (id: string) => {
    if (id !== districtId) setUpazilaId(null);
    setDistrictId(id);
  };
```

Update `step2CanProceed`:

```ts
  const step2CanProceed =
    name.trim().length > 0 &&
    phone.trim().length >= 10 &&
    !!districtId &&
    !!upazilaId;
```

In `handleFinish`, add to the `profile` object (after `location:
location.trim(),`):

```ts
        districtId: districtId!,
        upazilaId: upazilaId!,
```

(Safe to assert non-null: `step2CanProceed` already required both to be set
before the user could leave the Basic Info step, the same way `role!` is
already asserted a few lines above.)

- [ ] **Step 3: Pass the new props to `BasicInfoStep`**

Replace the `<BasicInfoStep .../>` call:

```tsx
          {step === 1 && (
            <BasicInfoStep
              name={name}
              phone={phone}
              location={location}
              districtId={districtId}
              upazilaId={upazilaId}
              onName={setName}
              onPhone={setPhone}
              onLocation={setLocation}
              onDistrictSelect={handleDistrictSelect}
              onUpazilaSelect={setUpazilaId}
              theme={theme}
              t={t}
              language={language}
              canProceed={step2CanProceed}
              onNext={goNext}
            />
          )}
```

- [ ] **Step 4: Rewrite `BasicInfoStep`**

Replace the whole `BasicInfoStep` function body (it currently renders a
name field, a phone field, and one free-text "Address" field) with:

```tsx
function BasicInfoStep({
  name,
  phone,
  location,
  districtId,
  upazilaId,
  onName,
  onPhone,
  onLocation,
  onDistrictSelect,
  onUpazilaSelect,
  theme,
  t,
  language,
  canProceed,
  onNext,
}: any) {
  const [districtModalOpen, setDistrictModalOpen] = useState(false);
  const [upazilaModalOpen, setUpazilaModalOpen] = useState(false);

  const districts = listDistricts();
  const upazilas = districtId ? listUpazilas(districtId) : [];
  const selectedDistrictName = getDistrictName(districtId, language);
  const selectedUpazilaName = getUpazilaName(upazilaId, language);

  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={[
          styles.stepTitle,
          { color: theme.text, fontFamily: "Outfit_700Bold" },
        ]}
      >
        {t.obBasicTitle}
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {t.obBasicSub}
      </Text>

      <View style={styles.fields}>
        <InfoField
          icon="account-outline"
          label={`${t.obFullName} *`}
          value={name}
          onChange={onName}
          placeholder={t.obFullNamePlaceholder}
          theme={theme}
          returnKeyType="next"
        />
        <InfoField
          icon="phone-outline"
          label={`${t.phoneNumber} *`}
          value={phone}
          onChange={onPhone}
          placeholder={t.phonePlaceholder}
          keyboardType="phone-pad"
          theme={theme}
          returnKeyType="next"
        />

        <View style={styles.fieldGroup}>
          <Text
            style={[
              styles.fieldLabel,
              { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {`${t.district} *`}
          </Text>
          <Pressable
            style={[
              styles.inputRow,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={() => setDistrictModalOpen(true)}
          >
            <MaterialCommunityIcons
              name="map-outline"
              size={20}
              color={theme.textTertiary}
              style={styles.inputIcon}
            />
            <Text
              style={[
                styles.input,
                {
                  color: selectedDistrictName ? theme.text : theme.textTertiary,
                  fontFamily: "Outfit_400Regular",
                },
              ]}
            >
              {selectedDistrictName ?? t.selectDistrict}
            </Text>
          </Pressable>
        </View>

        <View style={styles.fieldGroup}>
          <Text
            style={[
              styles.fieldLabel,
              { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {`${t.upazila} *`}
          </Text>
          <Pressable
            style={[
              styles.inputRow,
              { backgroundColor: theme.surface, borderColor: theme.border },
              !districtId && { opacity: 0.5 },
            ]}
            onPress={() => districtId && setUpazilaModalOpen(true)}
            disabled={!districtId}
          >
            <MaterialCommunityIcons
              name="map-marker-radius-outline"
              size={20}
              color={theme.textTertiary}
              style={styles.inputIcon}
            />
            <Text
              style={[
                styles.input,
                {
                  color: selectedUpazilaName ? theme.text : theme.textTertiary,
                  fontFamily: "Outfit_400Regular",
                },
              ]}
            >
              {selectedUpazilaName ?? t.selectUpazila}
            </Text>
          </Pressable>
        </View>

        <InfoField
          icon="map-marker-outline"
          label={`${t.villageArea} (${t.optional})`}
          value={location}
          onChange={onLocation}
          placeholder={t.villageAreaPlaceholder}
          theme={theme}
          returnKeyType="done"
          onSubmitEditing={canProceed ? onNext : undefined}
        />
      </View>

      <RegionPickerModal
        visible={districtModalOpen}
        title={t.selectDistrict}
        searchPlaceholder={t.searchDistrictPlaceholder}
        items={districts}
        onSelect={onDistrictSelect}
        onClose={() => setDistrictModalOpen(false)}
        language={language}
        theme={theme}
      />
      <RegionPickerModal
        visible={upazilaModalOpen}
        title={t.selectUpazila}
        searchPlaceholder={t.searchUpazilaPlaceholder}
        items={upazilas}
        onSelect={onUpazilaSelect}
        onClose={() => setUpazilaModalOpen(false)}
        language={language}
        theme={theme}
      />
    </ScrollView>
  );
}
```

- [ ] **Step 5: Add the `RegionPickerModal` component**

Add this new component right after `BasicInfoStep` (before the `// ─── Step
3: Business/Farm` comment):

```tsx
// ─── Region picker (District, then Upazila) ─────────────────────────────────

function RegionPickerModal({
  visible,
  title,
  searchPlaceholder,
  items,
  onSelect,
  onClose,
  language,
  theme,
}: {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  items: { id: string; nameEn: string; nameBn: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
  language: "en" | "bn";
  theme: any;
}) {
  const [query, setQuery] = useState("");

  const filtered = items.filter((item) =>
    (language === "bn" ? item.nameBn : item.nameEn)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: theme.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          <Text
            style={[
              styles.modalTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {title}
          </Text>
          <TextInput
            style={[
              styles.modalSearch,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
          />
          <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
            {filtered.map((item) => (
              <Pressable
                key={item.id}
                style={styles.modalRow}
                onPress={() => {
                  onSelect(item.id);
                  setQuery("");
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.modalRowText,
                    { color: theme.text, fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  {language === "bn" ? item.nameBn : item.nameEn}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 6: Add the new styles**

In the `styles` `StyleSheet.create({...})` at the bottom of the file, add:

```ts
  // Region picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingBottom: 36,
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 14,
    marginBottom: 0,
  },
  modalTitle: {
    fontSize: 18,
    textAlign: "center",
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalSearch: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
  },
  modalList: { paddingHorizontal: 20 },
  modalRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)" },
  modalRowText: { fontSize: 16 },
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/onboarding.tsx` (pre-existing unrelated
errors in `supabase/functions/drive-token/index.ts` are expected and not
part of this change).

- [ ] **Step 8: Run the full test suite**

Run: `npx jest`
Expected: all suites pass (this task has no dedicated automated test — this
codebase has no component-testing setup; the next step is manual)

- [ ] **Step 9: Manually verify in the app**

Use the `run` skill (or `npx expo start`) to launch the app, sign in as a
fresh test user, and walk through onboarding:
- Confirm the Basic Info step shows District and Upazila as tappable
  fields, and an optional "Village/Area" field below them.
- Confirm tapping District opens a modal listing 64 districts, searchable.
- Confirm selecting a district closes that modal and enables the Upazila
  field; tapping it opens a modal filtered to that district's upazilas.
- Confirm the "Continue" button stays disabled until name, phone, district,
  and upazila are all set.
- Confirm switching District after an Upazila was already picked clears the
  Upazila selection.
- Confirm completing onboarding and reopening the app shows the profile
  screen without re-prompting onboarding (i.e. the save succeeded).

- [ ] **Step 10: Commit**

```bash
git add app/onboarding.tsx
git commit -m "feat(onboarding): replace free-text address with District/Upazila picker"
```

---

## Task 6: Show resolved District/Upazila on the profile screen

**Files:**
- Modify: `app/profile.tsx`

**Interfaces:**
- Consumes: `getDistrictName(id, language)`, `getUpazilaName(id, language)`
  (Task 1); `OnboardingData.districtId`, `OnboardingData.upazilaId` (Task
  3); `t.regionLabel`, `t.locationLabel` (Task 4)

- [ ] **Step 1: Import the lookup functions and add `language`**

Add the import:

```ts
import { getDistrictName, getUpazilaName } from "@/lib/regions";
```

Change:

```ts
  const { t } = useSettings();
```

to:

```ts
  const { t, language } = useSettings();
```

- [ ] **Step 2: Add a region row to `infoRows`**

Replace:

```ts
  const infoRows = [
    profile?.phone ? { icon: "phone-outline", label: t.phoneLabel, value: profile.phone } : null,
    profile?.location ? { icon: "map-marker-outline", label: t.locationLabel, value: profile.location } : null,
    isFarmer && profile?.farmName ? { icon: "barn", label: t.farmLabel, value: profile.farmName } : null,
    !isFarmer && profile?.businessName ? { icon: "store-outline", label: t.businessLabel, value: profile.businessName } : null,
    email ? { icon: "email-outline", label: "Email", value: email } : null,
  ].filter(Boolean) as { icon: string; label: string; value: string }[];
```

with:

```ts
  const districtName = getDistrictName(profile?.districtId, language);
  const upazilaName = getUpazilaName(profile?.upazilaId, language);
  const regionValue = upazilaName && districtName ? `${upazilaName}, ${districtName}` : null;

  const infoRows = [
    profile?.phone ? { icon: "phone-outline", label: t.phoneLabel, value: profile.phone } : null,
    regionValue ? { icon: "map-outline", label: t.regionLabel, value: regionValue } : null,
    profile?.location ? { icon: "map-marker-outline", label: t.locationLabel, value: profile.location } : null,
    isFarmer && profile?.farmName ? { icon: "barn", label: t.farmLabel, value: profile.farmName } : null,
    !isFarmer && profile?.businessName ? { icon: "store-outline", label: t.businessLabel, value: profile.businessName } : null,
    email ? { icon: "email-outline", label: "Email", value: email } : null,
  ].filter(Boolean) as { icon: string; label: string; value: string }[];
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/profile.tsx`

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: all suites pass

- [ ] **Step 5: Manually verify in the app**

With the app running (continuing from Task 5's manual check, or a fresh
launch), open the profile screen for the test user who completed
onboarding. Confirm a "Region" row shows "Upazila, District" and, if a
village/area was entered, a separate row shows it under the relabeled
"Village/Area" heading.

- [ ] **Step 6: Commit**

```bash
git add app/profile.tsx
git commit -m "feat(profile): display resolved district/upazila"
```
