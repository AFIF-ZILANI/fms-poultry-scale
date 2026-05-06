import { useSignIn } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/lib/useTheme";

export default function SignInPage() {
  const signIn = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const isLoading = signIn?.fetchStatus === "fetching";

  const handleSignIn = async () => {
    if (!email || !password || !signIn) return;
    setLocalError("");
    try {
      const { error } = await signIn.password({ emailAddress: email, password });
      if (error) {
        setLocalError(error.message || "Sign in failed. Please try again.");
        return;
      }
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: ({ decorateUrl }) => {
            const url = decorateUrl("/");
            if (url.startsWith("http") && Platform.OS === "web") {
              if (typeof window !== "undefined") window.location.href = url;
            } else {
              router.replace("/");
            }
          },
        });
      }
    } catch (e: any) {
      setLocalError(e?.message || "Something went wrong. Please try again.");
    }
  };

  const fieldError =
    signIn?.errors?.fields?.emailAddress?.message ||
    signIn?.errors?.fields?.password?.message ||
    localError;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 32,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.brandRow}>
          <View style={[styles.iconCircle, { backgroundColor: theme.accent }]}>
            <MaterialCommunityIcons name="scale-balance" size={32} color="#fff" />
          </View>
          <Text style={[styles.brandName, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
            PoultryScale
          </Text>
        </View>

        <Text style={[styles.title, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
          Welcome back
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
          Sign in to continue
        </Text>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.textSecondary, fontFamily: "Outfit_500Medium" }]}>
            Email address
          </Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="email-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text, fontFamily: "Outfit_400Regular" }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={theme.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              testID="sign-in-email"
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.textSecondary, fontFamily: "Outfit_500Medium" }]}>
            Password
          </Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="lock-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text, fontFamily: "Outfit_400Regular" }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showPassword}
              testID="sign-in-password"
            />
            <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn} hitSlop={8}>
              <MaterialCommunityIcons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.textTertiary}
              />
            </Pressable>
          </View>
        </View>

        {/* Error */}
        {fieldError ? (
          <View style={[styles.errorBox, { backgroundColor: theme.dangerLight }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.danger} />
            <Text style={[styles.errorText, { color: theme.danger, fontFamily: "Outfit_400Regular" }]}>
              {fieldError}
            </Text>
          </View>
        ) : null}

        {/* Sign In Button */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            (isLoading || !email || !password) && styles.btnDisabled,
          ]}
          onPress={handleSignIn}
          disabled={isLoading || !email || !password}
          testID="sign-in-btn"
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.primaryBtnText, { fontFamily: "Outfit_600SemiBold" }]}>
              Sign In
            </Text>
          )}
        </Pressable>

        {/* Sign Up Link */}
        <View style={styles.linkRow}>
          <Text style={[styles.linkLabel, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
            New here?{" "}
          </Text>
          <Link href={"/(auth)/sign-up" as Href} asChild>
            <Pressable>
              <Text style={[styles.link, { color: theme.accent, fontFamily: "Outfit_600SemiBold" }]}>
                Create account
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 22,
  },
  title: {
    fontSize: 30,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 16,
    marginTop: -8,
    marginBottom: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 56,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  eyeBtn: {
    padding: 4,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  linkLabel: {
    fontSize: 15,
  },
  link: {
    fontSize: 15,
  },
});
