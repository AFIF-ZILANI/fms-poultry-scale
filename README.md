# PoultryScale

A weighing and sale-recording app for poultry farmers and wholesalers in Bangladesh.

A farmer sells a flock by putting crates of birds on a scale, one after another, then knocking off an agreed weight per crate before money is worked out. PoultryScale is the instrument for that: it records every weighing as it happens, applies the trade's crate deduction, prices the result, and hands the buyer a receipt. It works fully offline, because the shed is not where connectivity lives.

---

## Ownership

Developed and maintained by **ZeroD Software** and the **ZeroD Agency — Mobile Department**.
A product of **ZeroD Farms**, under the **ZeroD Umbrella**.

---

## What the app does

**Weighing session.** The core loop. Crates go on the scale, each weight is typed in and appended to a running log. Optionally the bird count per entry is recorded too, which is what makes average weight per bird meaningful. A session can be paused at any point and resumed later as a draft.

**Cull phase.** Culled (substandard) birds are weighed separately in a second phase, priced on their own terms — per kilo or per bird — and can be marked unsold. They never contaminate the main flock's average.

**Crate deduction.** The trade convention: a fixed weight is deducted per crate. `fullCratesOnly` decides whether a part-filled crate earns a deduction at all. The rule lives in `lib/utils.ts` as `calcDeduction` so it can be tested independently of any screen.

**Sale Summary.** Closes the session: deduction parameters, the calculation, the final amount, and what the buyer actually handed over. Leaving the received field alone records the full amount — the sale settles when it is recorded. A smaller figure is a **discount**, not a debt. (See *Money model* below.)

**Batches.** A flock raised together and sold across several sessions. A batch stores no totals of its own; every figure it shows is rolled up from the sales inside it, so it can never drift out of sync.

**Receipt.** Rendered two ways — on-screen (`components/ReceiptView.tsx`) and as printable HTML for sharing or PDF export (`lib/receiptHtml.ts`). Both must stay in step; they are the artifact a buyer keeps.

**History and audit.** Every finished sale is browsable, down to the individual weighing rows. Edits to a row are recorded in `row_edit_history` with the before and after values, so a corrected number is never silently a different number.

---

## Money model — read this before touching amounts

**Nothing in the app records a payment after a sale.** There is no ledger, no payment history, no "mark as paid" step anywhere. `receivedAmount` is written once when the sale is saved and never updated.

The consequence, which is easy to get wrong:

- A gap between `finalAmount` and `receivedAmount` **cannot ever be paid down**. Treating it as an outstanding balance would make it a permanent debt by construction.
- So the gap is a **discount** — money the farmer knocked off — and is named that way on every screen, including both receipt renderers.
- Leaving the received field blank records the **full amount**. Blank always meant "the buyer paid it all."

Migration `0010_settled_at_sale_time.sql` backfilled the pre-existing rows that stored `0` for a blank field; without it those sales read as a 100% discount. `__tests__/storage.test.ts` asserts that behaviour in both directions.

If real payment tracking is ever added, this is the decision to revisit first.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | Expo SDK 54, React Native 0.81, React 19, New Architecture |
| Routing | Expo Router (file-based, typed routes) |
| Storage | SQLite (`expo-sqlite`) via Drizzle ORM — local, offline-first |
| Auth | Clerk (`@clerk/expo`), tokens in `expo-secure-store` |
| Fonts | Outfit for words, IBM Plex Mono for figures |
| Animation | Reanimated 4 |
| Tests | Jest, against a real in-memory SQLite with real migrations |

**Supabase** (`lib/supabase.ts`, `hooks/useSupabase.ts`) is scaffolded and configured but **not yet consumed by any screen**. The app is entirely local today.

---

## Project structure

```
app/                      Routes — file-based, every file here is a screen
  _layout.tsx             Providers, font loading, migrations gate, AuthGuard
  index.tsx               Home — readout band, revenue chart, insights, sale list
  measurement.tsx         The weighing session: setup, rows, cull phase, Sale Summary
  batches.tsx             Batch list — readout band, filter, batch cards
  batch/[id].tsx          One batch: rolled-up totals and its sessions
  sale/[id]/index.tsx     A finished sale in full
  sale/[id]/logs/[type].tsx   Raw weighing rows for main or cull
  row-history.tsx         Edit history for a single row
  drafts.tsx              Paused sessions
  sales.tsx               Full sale history
  onboarding.tsx          Role, details, plan
  profile.tsx settings.tsx
  (auth)/sign-in.tsx      Google sign-in via Clerk

components/               Shared UI — receipt, row editor, error boundaries
db/
  schema.ts               Drizzle tables: users, batches, sales, saleMetaData,
                          measurementRows, rowEditHistory, userPrefs
  client.ts               DB handle + useDbMigrations()
  migrations/             Generated SQL + journal — applied on app start
lib/
  storage.ts              Every read and write. Screens never touch the DB directly
  utils.ts                Pure domain logic: calcDeduction, formatters
  types.ts                SaleRecord, SaleMetaData, BatchSummary, MeasurementRow
  i18n.ts                 English + Bangla, one object each, typed against `en`
  useTheme.ts             Resolved theme colours
  SettingsContext.tsx     Language, theme preference, translations
  receiptHtml.ts          Printable receipt
constants/colors.ts       Light/dark palettes + the shared instrument `Band` tokens
__tests__/                Jest suites; helpers/db.ts applies the real migrations
```

---

## Design language

The app is a scale, so its screens read like an instrument face rather than a marketing dashboard.

- **Figures never abbreviate.** A scale does not round what it weighs. `৳1,24,500`, not `৳1.2L`.
- **Figures are mono, words are not.** IBM Plex Mono keeps digits in their columns as values change; Outfit carries the prose. That pairing is the identity.
- **The readout band** — the dark slab on Home and Batches — keeps its own surface in both light and dark themes; an instrument face does not change colour with the room. Its tokens live in `constants/colors.ts` as `Band`, shared so the two screens cannot drift.
- **One data hue.** Emphasis comes from a direct label or opacity, not a second tint.
- **Marks stand on the baseline.** Bars are rounded on top only and anchored to the rule the facts hang from.

Both languages must be checked when text changes: Bangla strings run longer than their English counterparts and will break a layout that only ever saw English.

---

## Development workflow

**Branch-based, always.** No commits directly on `main`, regardless of size.

```
branch  →  change  →  verify  →  merge to main  →  delete branch
```

```bash
git checkout -b feat/thing     # feat/ fix/ refactor/ docs/ chore/
# ... make the change ...
npx tsc --noEmit && npx jest && npx expo lint
git checkout main
git merge --no-ff feat/thing
git branch -d feat/thing
```

Commits follow Conventional Commits (`feat(scope): …`). The body is where the *why* goes — this repo's history explains reasoning, not just diffs.

### Verifying

| Check | Command |
|---|---|
| Types | `npx tsc --noEmit` |
| Tests | `npm test` |
| Lint | `npm run lint` |
| On device | `npm run android` / `npm run ios` |

`components/DBErrorScreen.tsx` carries one pre-existing lint error. That is the baseline — leave it at one, don't add a second.

**UI changes need to be seen, not just typechecked.** Layout, spacing, and dark mode do not show up in a passing test suite.

### Running it

```bash
npm install
cp .env.local.example .env.local     # then fill in the keys below
npx expo start
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth — the app will not get past sign-in without it |
| `EXPO_PUBLIC_SUPABASE_URL` | Scaffolded, unused today |
| `EXPO_PUBLIC_SUPABASE_KEY` | Scaffolded, unused today |

Native builds (`npm run android`) compile the NDK on first run — budget several GB of disk and a long first build.

> **Web is not a supported target.** `expo-sqlite` needs `SharedArrayBuffer` and a worker that does not load under the dev server's headers. Use a simulator, emulator, or device.

### Database changes

The schema is Drizzle-first. Edit `db/schema.ts`, then:

```bash
npx drizzle-kit generate
```

Register the new file in `db/migrations/migrations.js` **and** `db/migrations/meta/_journal.json` — Expo needs the static import, and both are checked in. Migrations run at app start through `useDbMigrations()`; a failure renders `DbErrorScreen` instead of the app, because every screen assumes a working database.

Tests apply the real migration files in journal order (`__tests__/helpers/db.ts`), so a broken migration fails the suite rather than surfacing on a user's phone.

### The lockfile is npm-version sensitive — regenerate with npm 10

EAS Build runs `npm ci`, which fails hard if the lockfile does not match what
its npm would resolve.

`@clerk/shared` declares an optional peer on `react-dom` that the Expo-pinned
`react-dom@19.1.0` does not satisfy. **npm 10 records a nested copy** of
`react`/`react-dom`/`scheduler` under `@clerk/clerk-js`; **npm 11 silently omits
them.** A lockfile written by npm 11 therefore builds fine locally and fails on
EAS with:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json are in sync.
npm error Missing: react@19.2.8 from lock file
```

So regenerate the lockfile with npm 10, whichever npm you use day to day:

```bash
npx npm@10 install --package-lock-only
npx npm@10 ci --include=dev --dry-run   # this is what EAS runs — must pass
```

Running a bare `npm install` on npm 11 will quietly drop those three entries
again. If a build dies in *Install dependencies*, check this first.

### Adding text

Add the key to **both** `en` and `bn` in `lib/i18n.ts`. `bn` is typed as `typeof en`, so a missing translation is a compile error rather than an English string leaking into a Bangla screen. Check whether a suitable key already exists before adding one.

---

## Domain glossary

| Term | Meaning |
|---|---|
| **Session** | One weighing run, from first crate to saved sale |
| **Batch** | A flock sold across several sessions; a container, holds no totals itself |
| **Cull** | Substandard birds, weighed and priced separately, sometimes unsold |
| **Crate deduction** | Fixed weight knocked off per crate, by trade convention |
| **Gross / Net** | Before and after the crate deduction |
| **Discount** | Final amount minus what the buyer handed over — *not* a debt |
| **Draft** | A paused, unfinished session |
| **Farmer / Wholesaler** | The two roles; changes which insights the home screen shows |

---

## Licence

Proprietary. © ZeroD Farms, under the ZeroD Umbrella. All rights reserved.
