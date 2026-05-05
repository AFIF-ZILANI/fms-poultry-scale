# PoultryScale - Poultry Farm Weight Tracker

## Run & Operate
- Frontend: `npm run expo:dev` (port 8081 — Expo dev server)
- Backend: `npm run server:dev` (port 5000 — Express)
- Scan QR from Replit URL bar to preview on device via Expo Go

## Stack
- **Frontend**: Expo Router 6, React Native (TypeScript), Expo SDK 54
- **Backend**: Express.js + TypeScript
- **Fonts**: Outfit (Google Fonts via @expo-google-fonts/outfit)
- **Storage**: expo-sqlite ~16.0.10 (native) + AsyncStorage fallback (web via `lib/database.web.ts`)
- **State**: useState + useFocusEffect (no global state needed)

## Where things live
```
app/
  _layout.tsx        - Root layout (fonts, providers, routes)
  index.tsx          - Home screen (sales history, draft banner, FAB)
  measurement.tsx    - Weighing session (auto-saves draft on every row change)
  drafts.tsx         - Draft sessions list (resume or delete)
  report.tsx         - Report/summary screen
  sale/[id].tsx      - Sale detail with row editing
  row-history.tsx    - Row edit history
lib/
  types.ts           - TypeScript interfaces
  database.ts        - SQLite singleton (native)
  database.web.ts    - AsyncStorage-based DB shim (web only, Metro platform extension)
  storage.ts         - CRUD for sales, drafts, preferences
  useTheme.ts        - Dark/light theme hook
  utils.ts           - Formatting utilities
constants/colors.ts  - Theme palette (navy/blue/white)
components/
  EditRowModal.tsx   - Shared row edit modal
  ErrorBoundary.tsx  - Error boundary
metro.config.js      - Blocks .local/skills/.tmp-* from watchman
```

## Architecture decisions
- **SQLite via singleton promise** (`getDb()`) — initializes once, reused across calls; tables created on first open
- **Web DB shim** — `lib/database.web.ts` mirrors the SQLiteDatabase interface using AsyncStorage + in-memory cache; Metro automatically picks it up for web platform builds
- **Draft auto-save** — `useEffect` in measurement screen watches `rows` state and calls `saveDraft()` on every change; draft is deleted when sale is saved
- **Platform shadow fix** — `Platform.select` with `boxShadow` on web, native shadow props on iOS/Android
- **Metro blockList** — prevents crash when Replit cleans up temporary skill files in `.local/skills/`

## Product
- Start a weighing session → add rows (KG + birds) → session auto-saves as draft on every change
- Go back anytime; session is preserved as a draft
- Home screen shows amber banner with draft count → tap to open Drafts page → resume any session
- Finishing a session opens the Trade Deduction (Dholta) modal → calculates net weight/amount → saves as completed sale
- Sales history with detail view, row editing with full edit history per row
- Dark/light mode, Tk currency, food-turkey icons throughout

## User preferences
- Always Tk currency (not $)
- MaterialCommunityIcons `food-turkey` for bird counts
- Outfit font, dark navy (#1E3A5F/#0D1B30) panels
- No emojis, always @expo/vector-icons
- Weight always 2 decimal places

## Gotchas
- Never run `npx expo start` directly — use `restart_workflow` (env vars injected by workflow)
- expo-sqlite@~16.0.10 for Expo SDK 54 — do NOT upgrade to v55+ (different architecture, WASM issues on web)
- Metro cache lives at `/tmp/metro-cache` — delete and restart frontend if bundling issues persist
- `lib/database.web.ts` is a Metro platform extension (auto-selected for web builds); keep it in sync with the native `lib/database.ts` interface

## Pointers
- Expo skill: `.local/skills/expo/SKILL.md`
- Package management: `.local/skills/package-management/SKILL.md`
