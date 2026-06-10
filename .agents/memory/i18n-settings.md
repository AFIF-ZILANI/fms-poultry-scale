---
name: i18n + Settings system
description: How language and theme preferences are stored and applied across the app
---

# i18n + Settings System

## Architecture
- `lib/i18n.ts` — translation objects for `en` and `bn`; type `Translations` = typeof en; `translations.en` / `translations.bn`
- `lib/SettingsContext.tsx` — React context with `SettingsProvider` + `useSettings()` hook
- `lib/useTheme.ts` — calls `useSettings()` for `isDark`; keeps same return shape `ThemeColors & { isDark: boolean }`
- `lib/storage.ts` — `loadLanguagePref/saveLanguagePref` (key: `language`) and `loadThemePref/saveThemePref` (key: `theme_preference`) via SQLite getPref/setPref

## useSettings() returns
`{ language, setLanguage, themePreference, setThemePreference, isDark, t }`
- `themePreference`: `'system' | 'dark' | 'light'`
- `isDark`: computed from themePreference + system colorScheme
- `t`: translations object (all UI strings)

## Settings page
`app/settings.tsx` — language toggle (EN/BN), theme selector (System/Dark/Light), default deduction values (save via `saveLastPricePerKg`, `saveLastKgPerCrate`, `saveLastDeductionG`)

## Provider placement
`SettingsProvider` wraps `GestureHandlerRootView` in `_layout.tsx` (above all screens)

**Why:** useTheme() needs the context; placing SettingsProvider high ensures it's available everywhere without circular deps.

**How to apply:** All screens use `const { t } = useSettings()` for translations. Never hardcode UI strings — always use `t.xxx`.
