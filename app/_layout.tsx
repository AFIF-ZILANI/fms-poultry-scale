import { ClerkProvider, ClerkLoaded, useAuth, useUser } from "@clerk/expo";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Platform, View, Text } from "react-native";
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
import * as SecureStore from "expo-secure-store";
import { Image } from "react-native";
import SplashImage from "@/assets/images/splash-icon.png";
import { useDbMigrations } from "@/db/client";
import { DbErrorScreen } from "@/components/DBErrorScreen";

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
  }, [isLoaded, isSignedIn, user?.id, router]);

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
  const [splashVisible, setSplashVisible] = useState(true);
  const { success: dbReady, error: dbError } = useDbMigrations();
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
