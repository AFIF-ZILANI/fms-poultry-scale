import { useSignUp } from "@clerk/expo";
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

export default function SignUpPage() {
  const signUp = useSignUp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [step, setStep] = useState<"register" | "verify">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const isLoading = signUp?.fetchStatus === "fetching";

  const handleSignUp = async () => {
    if (!email || !password || !signUp) return;
    setLocalError("");
    try {
      const { error } = await signUp.password({ emailAddress: email, password });
      if (error) {
        setLocalError(error.message || "Sign up failed. Please try again.");
        return;
      }
      await signUp.verifications.sendEmailCode();
      setStep("verify");
    } catch (e: any) {
      setLocalError(e?.message || "Something went wrong. Please try again.");
    }
  };

  const handleVerify = async () => {
    if (!code || !signUp) return;
    setLocalError("");
    try {
      await signUp.verifications.verifyEmailCode({ code });
      if (signUp.status === "complete") {
        await signUp.finalize({
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
      setLocalError(e?.message || "Invalid code. Please try again.");
    }
  };

  const resendCode = async () => {
    if (!signUp) return;
    try {
      await signUp.verifications.sendEmailCode();
    } catch {}
  };

  const fieldError =
    signUp?.errors?.fields?.emailAddress?.message ||
    signUp?.errors?.fields?.password?.message ||
    signUp?.errors?.fields?.code?.message ||
    localError;

  if (step === "verify") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => setStep("register")} style={styles.backBtn} hitSlop={12}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>

          <View style={[styles.iconCircleSm, { backgroundColor: theme.accentLight, marginBottom: 8 }]}>
            <MaterialCommunityIcons name="email-check-outline" size={28} color={theme.accent} />
          </View>

          <Text style={[styles.title, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
            Check your email
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
            We sent a 6-digit code to{"\n"}
            <Text style={{ color: theme.text, fontFamily: "Outfit_600SemiBold" }}>{email}</Text>
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textSecondary, fontFamily: "Outfit_500Medium" }]}>
              Verification code
            </Text>
            <TextInput
              style={[
                styles.codeInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                  fontFamily: "Outfit_600SemiBold",
                },
              ]}
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              testID="verify-code-input"
            />
          </View>

          {fieldError ? (
            <View style={[styles.errorBox, { backgroundColor: theme.dangerLight }]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.danger} />
              <Text style={[styles.errorText, { color: theme.danger, fontFamily: "Outfit_400Regular" }]}>
                {fieldError}
              </Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
              (isLoading || code.length < 6) && styles.btnDisabled,
            ]}
            onPress={handleVerify}
            disabled={isLoading || code.length < 6}
            testID="verify-btn"
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.primaryBtnText, { fontFamily: "Outfit_600SemiBold" }]}>
                Verify Email
              </Text>
            )}
          </Pressable>

          <Pressable onPress={resendCode} style={styles.secondaryBtn}>
            <Text style={[styles.secondaryBtnText, { color: theme.accent, fontFamily: "Outfit_500Medium" }]}>
              Resend code
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding */}
        <View style={styles.brandRow}>
          <View style={[styles.iconCircle, { backgroundColor: theme.accent }]}>
            <MaterialCommunityIcons name="scale-balance" size={32} color="#fff" />
          </View>
          <Text style={[styles.brandName, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
            PoultryScale
          </Text>
        </View>

        <Text style={[styles.title, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
          Create account
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
          Get started in seconds
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
              testID="sign-up-email"
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
              placeholder="Min. 8 characters"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showPassword}
              testID="sign-up-password"
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

        {/* Sign Up Button */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            (isLoading || !email || !password) && styles.btnDisabled,
          ]}
          onPress={handleSignUp}
          disabled={isLoading || !email || !password}
          testID="sign-up-btn"
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.primaryBtnText, { fontFamily: "Outfit_600SemiBold" }]}>
              Continue
            </Text>
          )}
        </Pressable>

        {/* Sign In Link */}
        <View style={styles.linkRow}>
          <Text style={[styles.linkLabel, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
            Already have an account?{" "}
          </Text>
          <Link href={"/(auth)/sign-in" as Href} asChild>
            <Pressable>
              <Text style={[styles.link, { color: theme.accent, fontFamily: "Outfit_600SemiBold" }]}>
                Sign in
              </Text>
            </Pressable>
          </Link>
        </View>

        <View nativeID="clerk-captcha" />
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
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
    marginBottom: 8,
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
  iconCircleSm: {
    width: 56,
    height: 56,
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
    lineHeight: 22,
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
  codeInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 64,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: "center",
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
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontSize: 15,
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
