# PoultryScale - Poultry Farm Weight Tracker

## Run & Operate
- Frontend: `npm run expo:dev` (port 8081 — Expo dev server)
- Backend: `npm run server:dev` (port 5000 — Express)
- Scan QR from Replit URL bar to preview on device via Expo Go
- Required secrets: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`

## Stack
- **Frontend**: Expo Router 6, React Native (TypeScript), Expo SDK 54
- **Backend**: Express.js + TypeScript
- **Auth**: @clerk/expo 3.2.8 (signals API — useSignIn()/useSignUp() return the signal directly)
- **Fonts**: Outfit (Google Fonts via @expo-google-fonts/outfit)
- **Storage**: expo-sqlite ~16.0.10 (native) + AsyncStorage fallback (web via `lib/database.web.ts`)
- **State**: useState + useFocusEffect (no global state needed)

## Where things live
```
app/
  _layout.tsx        - Root layout (ClerkProvider + InitialLayout auth guard)
  (auth)/
    _layout.tsx      - Auth group layout (redirects signed-in users away)
    sign-in.tsx      - Sign-in screen (Clerk v3 signals API)
    sign-up.tsx      - Sign-up + email OTP verification
  onboarding.tsx     - 3-step onboarding (role → basic info → optional)
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
  onboarding.ts      - AsyncStorage helpers for onboarding state + user profile
  useTheme.ts        - Dark/light theme hook
  utils.ts           - Formatting utilities
constants/colors.ts  - Theme palette (navy/blue/white)
components/
  EditRowModal.tsx   - Shared row edit modal
  ErrorBoundary.tsx  - Error boundary
metro.config.js      - blockList (.local/skills, .local/state), React dedup resolver
babel.config.js      - React Compiler DISABLED (react-compiler: false) — required for Clerk
```

## Architecture decisions
- **SQLite via singleton promise** (`getDb()`) — initializes once, reused across calls; tables created on first open
- **Web DB shim** — `lib/database.web.ts` mirrors the SQLiteDatabase interface using AsyncStorage + in-memory cache; Metro automatically picks it up for web platform builds
- **Draft auto-save** — `useEffect` in measurement screen watches `rows` state and calls `saveDraft()` on every change; draft is deleted when sale is saved
- **Clerk v3 signals API** — `useSignIn()` / `useSignUp()` return the signal object directly (NOT `{ signIn }` wrapper). Use `const signIn = useSignIn()` then `signIn.password()`, `signIn.finalize()`, `signIn.errors`, `signIn.fetchStatus`
- **React Compiler disabled** — `babel-plugin-react-compiler` is installed but must be disabled via `babel.config.js`. When enabled, it emits `c()` calls from `react/compiler-runtime` which check `ReactSharedInternals.H` — this is null in the Clerk context, causing "Invalid hook call". Fix: `"react-compiler": false` in babel-preset-expo options
- **Metro blockList** — blocks `.local/skills` temp files AND `.local/state` workflow logs to prevent FallbackWatcher ENOENT crashes
- **onboarding_complete_{userId}** stored in AsyncStorage — checked after sign-in; if missing → redirect to /onboarding; if present → redirect to /

## Product
- Unauthenticated users are redirected to sign-in; new users go through 3-step onboarding
- Onboarding: role selection (Farmer/Wholesaler) → name + location → optional farm/business details
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
- expo-secure-store@55.0.13 is installed (wrong version for SDK 54, expected ~15.0.8) — works for Expo Go but may cause issues in production builds
- React Compiler MUST stay disabled — see Architecture decisions above

## Pointers
- Expo skill: `.local/skills/expo/SKILL.md`
- Package management: `.local/skills/package-management/SKILL.md`
