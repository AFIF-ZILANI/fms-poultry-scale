import { ClerkProvider, ClerkLoaded, useAuth, useUser } from "@clerk/expo";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";
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
// Figures wear a mono face so digits stay column-aligned as values change —
// the readout on the home screen depends on it.
import {
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";
import * as SecureStore from "expo-secure-store";
import { Image } from "react-native";
import SplashImage from "@/assets/images/splash-icon.png";
import { useDbMigrations } from "@/db/client";
import { DbErrorScreen } from "@/components/DBErrorScreen";
import { useDriveSync } from "@/lib/driveSync/schedule";
import { DriveSyncProvider } from "@/lib/DriveSyncContext";

if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
  async deleteToken(key: string) {
    return SecureStore.deleteItemAsync(key);
  },
};

// Shown while AuthGuard is deciding where to route — auth resolving, or a
// silent restore-from-Drive check (and any restore it triggers) in flight.
// key={message} restarts the fade whenever the message changes (e.g.
// "Loading..." → "Restoring your data...") instead of it just snapping.
function AuthLoadingScreen({ message }: { message: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0C0C0F",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Image
        source={SplashImage}
        style={{ width: 120, height: 120, borderRadius: 25, marginBottom: 28 }}
        resizeMode="contain"
      />
      <ActivityIndicator size="small" color="#ffffff" />
      <Animated.Text
        key={message}
        entering={FadeIn.duration(300)}
        style={{ color: "#9a9a9a", fontSize: 13, marginTop: 16, letterSpacing: 0.3 }}
      >
        {message}
      </Animated.Text>
    </View>
  );
}

// Handles routing after Clerk loads: unauthed → sign-in, no onboarding → onboarding
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  // Track which userId we already checked so we re-run when the account switches
  const handledUserId = useRef<string | null>(null);
  const driveSync = useDriveSync(isSignedIn ? user?.id : null);

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
      // Wait for the silent Drive-restore check (and any restore it
      // triggers) to finish before deciding on onboarding, so a reinstalled
      // app restores its data in the background instead of routing through
      // onboarding first.
      if (!driveSync.restoreCheckDone) return;
      handledUserId.current = user.id;

      const done = await isOnboardingComplete(user.id);
      if (!done) {
        router.replace("/onboarding");
      }
    })();
  }, [isLoaded, isSignedIn, user?.id, router, driveSync.restoreCheckDone]);

  if (!isLoaded) {
    return <AuthLoadingScreen message="Loading..." />;
  }
  if (!driveSync.restoreCheckDone) {
    return <AuthLoadingScreen message="Restoring your data..." />;
  }

  return <DriveSyncProvider value={driveSync}>{children}</DriveSyncProvider>;
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
  const [splashVisible, setSplashVisible] = useState(true);
  const { success: dbReady, error: dbError } = useDbMigrations();
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (Platform.OS === "web") {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
      // small delay so transition feels intentional
      setTimeout(() => setSplashVisible(false), 3000);
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (dbError) {
      console.log("FULL MIGRATION ERROR:", JSON.stringify(dbError, null, 2));
      console.log("MIGRATION ERROR MESSAGE:", dbError.message);
      console.log("MIGRATION ERROR CAUSE:", dbError.cause);
      console.log(
        "FULL:",
        JSON.stringify(dbError, Object.getOwnPropertyNames(dbError)),
      );
    }
  }, [dbError]);

  if (dbError) {
    // Don't render AppLayout at all — every screen assumes a working db
    return <DbErrorScreen error={dbError} />;
  }

  if ((splashVisible || !dbReady) && Platform.OS !== "web") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Your app icon */}
        <Image
          source={SplashImage}
          style={{ width: 300, height: 300, borderRadius: 25 }}
          resizeMode="contain"
        />

        {/* Bottom text */}
        <View
          style={{
            position: "absolute",
            bottom: 48,
            alignItems: "center",
            gap: 4,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              color: "#aaaaaa",
              letterSpacing: 1,
              // textTransform: "uppercase",
            }}
          >
            Developed by ZeroD Software
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
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
