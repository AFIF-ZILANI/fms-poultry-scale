import { ClerkProvider, ClerkLoaded, useAuth, useUser } from "@clerk/expo";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SettingsProvider } from "@/lib/SettingsContext";
import { isOnboardingComplete } from "@/lib/onboarding";
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

// Handles routing after Clerk loads: unauthed → sign-in, no onboarding → onboarding
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  // Track which userId we already checked so we re-run when the account switches
  const handledUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    (async () => {
      if (!isSignedIn) {
        handledUserId.current = null;
        router.replace("/(auth)/sign-in");
        return;
      }
      if (!user?.id) return;
      // Already ran the check for this exact user — skip
      if (handledUserId.current === user.id) return;
      handledUserId.current = user.id;

      const done = await isOnboardingComplete(user.id);
      if (!done) {
        router.replace("/onboarding");
      }
    })();
  }, [isLoaded, isSignedIn, user?.id]);

  if (!isLoaded) {
    // Keep splash visible until auth resolves
    return <View style={{ flex: 1, backgroundColor: "#0C0C0F" }} />;
  }

  return <>{children}</>;
}

function AppLayout() {
  return (
    <AuthGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="measurement" options={{ gestureEnabled: false }} />
        <Stack.Screen name="sale/[id]/index" />
        <Stack.Screen name="sale/[id]/logs/[type]" />
        <Stack.Screen name="row-history" />
        <Stack.Screen name="drafts" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="sales" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </AuthGuard>
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
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && Platform.OS !== "web") return null;

  return (
    <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
      <ClerkLoaded>
        <ErrorBoundary>
          <SettingsProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AppLayout />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </SettingsProvider>
        </ErrorBoundary>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
