import { useOAuth } from "@clerk/expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";

WebBrowser.maybeCompleteAuthSession();

export default function SignInPage() {
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      const { createdSessionId, setActive } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/", { scheme: "poultryscale" }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // _layout AuthGuard will redirect to onboarding or dashboard
      }
    } catch (e: any) {
      setError(e?.message ?? "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Gradient top section */}
      <LinearGradient
        colors={["#0C0C0F", "#131320", "#0C0C0F"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 48 }]}
      >
        {/* App icon */}
        <View style={styles.iconWrap}>
          <View style={[styles.iconOuter, { backgroundColor: "rgba(59,130,246,0.25)" }]}>
            <View style={[styles.iconInner, { backgroundColor: theme.accent }]}>
              <MaterialCommunityIcons name="scale-balance" size={36} color="#fff" />
            </View>
          </View>
        </View>

        <Text style={[styles.appName, { fontFamily: "Outfit_700Bold" }]}>
          PoultryScale
        </Text>
        <Text style={[styles.tagline, { fontFamily: "Outfit_400Regular" }]}>
          {t.signInSubtitle}
        </Text>

        {/* Feature pills */}
        <View style={styles.pills}>
          {["Digital Weighing", "Sales Records", "Analytics"].map((f) => (
            <View key={f} style={styles.pill}>
              <Text style={[styles.pillText, { fontFamily: "Outfit_500Medium" }]}>{f}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Sign in card */}
      <View style={[styles.card, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 32 }]}>
        <Text style={[styles.cardTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
          {t.signInTitle}
        </Text>
        <Text style={[styles.cardSub, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
          Sign in to access your records
        </Text>

        {/* Error */}
        {!!error && (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerLight }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.danger} />
            <Text style={[styles.errorText, { color: theme.danger, fontFamily: "Outfit_400Regular" }]}>
              {error}
            </Text>
          </View>
        )}

        {/* Google button */}
        <Pressable
          style={({ pressed }) => [
            styles.googleBtn,
            {
              backgroundColor: theme.isDark ? theme.surfaceElevated : "#fff",
              borderColor: theme.border,
              opacity: pressed || loading ? 0.8 : 1,
            },
          ]}
          onPress={handleGoogle}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.accent} size="small" />
          ) : (
            <>
              {/* Google G logo via SVG-like shape */}
              <View style={styles.googleLogo}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={[styles.googleBtnText, { color: theme.text, fontFamily: "Outfit_600SemiBold" }]}>
                {t.signInWithGoogle}
              </Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.terms, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 12,
  },
  iconWrap: { marginBottom: 8 },
  iconOuter: {
    width: 100,
    height: 100,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 32,
    color: "#fff",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
  pills: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
  },
  card: {
    flex: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -24,
    paddingHorizontal: 24,
    paddingTop: 36,
    gap: 16,
  },
  cardTitle: {
    fontSize: 24,
  },
  cardSub: {
    fontSize: 15,
    marginTop: -8,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { fontSize: 13, flex: 1 },
  googleBtn: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  googleLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  googleBtnText: {
    fontSize: 17,
  },
  terms: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 4,
  },
});
