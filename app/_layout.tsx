import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { SettingsProvider } from "@/lib/SettingsContext";
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";

// Only prevent auto-hide on native — on web SplashScreen is a no-op and
// holding it causes the Expo Router 6000ms navigation timeout.
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="measurement" options={{ gestureEnabled: false }} />
      <Stack.Screen name="report" options={{ gestureEnabled: false }} />
      <Stack.Screen name="sale/[id]" />
      <Stack.Screen name="row-history" />
      <Stack.Screen name="drafts" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(auth)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  useEffect(() => {
    if (Platform.OS === "web") {
      // On web, fonts load via CSS — no need to gate. Hide splash immediately.
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // On web: render immediately (no blocking) to avoid the 6000ms nav timeout.
  // On native: wait for fonts so text renders correctly from the first frame.
  if (!fontsLoaded && !fontError && Platform.OS !== "web") return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AppLayout />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SettingsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
