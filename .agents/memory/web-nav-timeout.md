---
name: Web 6000ms navigation timeout
description: Expo Router fires a 6000ms timeout on web when the root layout renders null too long
---

**The problem:** Expo Router web has a 6-second deadline to resolve the initial route. The root layout's `if (!fontsLoaded && !fontError) return null` guard blocks the navigator from seeing any renderable content on web, triggering the timeout.

**The fix (in `app/_layout.tsx`):**
1. Only call `SplashScreen.preventAutoHideAsync()` on native — skip on web.
2. In the fonts `useEffect`, call `SplashScreen.hideAsync()` immediately when `Platform.OS === 'web'`.
3. Change the null guard to: `if (!fontsLoaded && !fontError && Platform.OS !== 'web') return null`

**Why:** On web, fonts load via CSS — they don't need to be waited for before rendering. The SplashScreen API is a no-op on web anyway. Rendering immediately lets Expo Router resolve the initial route within its 6-second window.
