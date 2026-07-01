import { useUser } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
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
import { useSettings } from "@/lib/SettingsContext";
import {
  type OnboardingData,
  type UserRole,
  loadOnboardingDraft,
  markOnboardingComplete,
  saveOnboardingDraft,
  saveUserProfile,
} from "@/lib/onboarding";
import { savePlan, type Plan } from "@/lib/subscription";

const { width: SCREEN_W } = Dimensions.get("window");
const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useSettings();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [farmName, setFarmName] = useState("");
  const [businessName, setBusinessName] = useState("");

  useEffect(() => {
    if (!user) return;
    loadOnboardingDraft(user.id).then((draft) => {
      if (!draft) return;
      if (draft.role) setRole(draft.role);
      if (draft.name) setName(draft.name);
      if ((draft as any).phone) setPhone((draft as any).phone);
      if (draft.location) setLocation(draft.location ?? "");
      if (draft.farmName) setFarmName(draft.farmName ?? "");
      if (draft.businessName) setBusinessName(draft.businessName ?? "");
    });
  }, [user]);

  const persistDraft = useCallback(() => {
    if (!user) return;
    const draft: Partial<OnboardingData> = {
      ...(role && { role }),
      ...(name && { name }),
      ...(phone && { phone }),
      ...(location && { location }),
      ...(farmName && { farmName }),
      ...(businessName && { businessName }),
    };
    saveOnboardingDraft(user.id, draft);
  }, [user, role, name, phone, location, farmName, businessName]);

  useEffect(() => {
    persistDraft();
  }, [persistDraft]);

  const animateToStep = (next: number) => {
    const dir = next > step ? 1 : -1;
    slideAnim.setValue(dir * SCREEN_W);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setStep(next);
  };

  const goNext = () => {
    Keyboard.dismiss();
    if (step < TOTAL_STEPS - 1) animateToStep(step + 1);
  };
  const goBack = () => {
    Keyboard.dismiss();
    if (step > 0) animateToStep(step - 1);
  };

  const handleRoleSelect = (r: UserRole) => {
    setRole(r);
    setTimeout(() => animateToStep(1), 180);
  };

  const handleFinish = async (plan: Plan) => {
    if (!user) return;
    setSaving(true);
    try {
      const profile: OnboardingData = {
        role: role!,
        name: name.trim(),
        phone: phone.trim(),
        email: user.emailAddresses[0]?.emailAddress ?? "",
        location: location.trim(),
        subscriptionPlan: plan,
        ...(farmName.trim() && { farmName: farmName.trim() }),
        ...(businessName.trim() && { businessName: businessName.trim() }),
      };
      await saveUserProfile(user.id, profile);
      await savePlan(user.id, plan);
      await markOnboardingComplete(user.id);
      // await clearOnboardingDraft(user.id);
      router.replace("/");
    } catch {
      setSaving(false);
    }
  };

  const step2CanProceed = name.trim().length > 0 && phone.trim().length >= 10;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerSide}>
          {step > 0 && (
            <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={22}
                color={theme.text}
              />
            </Pressable>
          )}
        </View>
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i <= step ? theme.accent : theme.border,
                  width: i === step ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.headerSide}>
          <Text
            style={[
              styles.stepLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {step + 1}/{TOTAL_STEPS}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          style={[styles.slide, { transform: [{ translateX: slideAnim }] }]}
        >
          {step === 0 && (
            <RoleStep
              role={role}
              onSelect={handleRoleSelect}
              theme={theme}
              t={t}
            />
          )}
          {step === 1 && (
            <BasicInfoStep
              name={name}
              phone={phone}
              location={location}
              onName={setName}
              onPhone={setPhone}
              onLocation={setLocation}
              theme={theme}
              t={t}
              canProceed={step2CanProceed}
              onNext={goNext}
            />
          )}
          {step === 2 && (
            <BusinessStep
              role={role!}
              farmName={farmName}
              businessName={businessName}
              onFarmName={setFarmName}
              onBusinessName={setBusinessName}
              theme={theme}
              t={t}
              onNext={goNext}
              saving={saving}
            />
          )}
          {step === 3 && (
            <PlanStep
              theme={theme}
              t={t}
              onSelect={handleFinish}
              saving={saving}
            />
          )}
        </Animated.View>

        {step === 1 && (
          <View
            style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                !step2CanProceed && styles.btnDisabled,
              ]}
              onPress={goNext}
              disabled={!step2CanProceed}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                Continue
              </Text>
              <MaterialCommunityIcons
                name="arrow-right"
                size={20}
                color="#fff"
                style={{ marginLeft: 8 }}
              />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Step 1: Role ────────────────────────────────────────────────────────────

function RoleStep({ role, onSelect, theme, t }: any) {
  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;

  const pressIn = (a: Animated.Value) =>
    Animated.spring(a, { toValue: 0.96, useNativeDriver: true }).start();
  const pressOut = (a: Animated.Value) =>
    Animated.spring(a, { toValue: 1, useNativeDriver: true }).start();

  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={[
          styles.stepTitle,
          { color: theme.text, fontFamily: "Outfit_700Bold" },
        ]}
      >
        Who are you?
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        Select your role to personalise your experience
      </Text>

      <View style={styles.roleCards}>
        {(
          [
            {
              key: "farmer" as UserRole,
              icon: "tractor",
              title: t.farmerRole,
              desc: "I raise and sell poultry",
              anim: scaleA,
            },
            {
              key: "wholesaler" as UserRole,
              icon: "store-outline",
              title: t.wholesalerRole,
              desc: "I buy and distribute poultry",
              anim: scaleB,
            },
          ] as const
        ).map(({ key, icon, title, desc, anim }) => (
          <Animated.View key={key} style={{ transform: [{ scale: anim }] }}>
            <Pressable
              onPressIn={() => pressIn(anim)}
              onPressOut={() => pressOut(anim)}
              onPress={() => onSelect(key)}
              style={[
                styles.roleCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: role === key ? theme.accent : theme.border,
                  borderWidth: role === key ? 2.5 : 1.5,
                },
              ]}
            >
              <View
                style={[
                  styles.roleIconBg,
                  {
                    backgroundColor:
                      role === key ? theme.accent : theme.accentLight,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={icon as any}
                  size={44}
                  color={role === key ? "#fff" : theme.accent}
                />
              </View>
              <Text
                style={[
                  styles.roleCardTitle,
                  { color: theme.text, fontFamily: "Outfit_700Bold" },
                ]}
              >
                {title}
              </Text>
              <Text
                style={[
                  styles.roleCardDesc,
                  {
                    color: theme.textSecondary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                {desc}
              </Text>
              {role === key && (
                <View
                  style={[styles.checkBadge, { backgroundColor: theme.accent }]}
                >
                  <MaterialCommunityIcons name="check" size={14} color="#fff" />
                </View>
              )}
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Step 2: Basic Info ──────────────────────────────────────────────────────

function BasicInfoStep({
  name,
  phone,
  location,
  onName,
  onPhone,
  onLocation,
  theme,
  t,
  canProceed,
  onNext,
}: any) {
  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={[
          styles.stepTitle,
          { color: theme.text, fontFamily: "Outfit_700Bold" },
        ]}
      >
        Tell us about yourself
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        This helps personalise your records
      </Text>

      <View style={styles.fields}>
        <InfoField
          icon="account-outline"
          label={`Full Name *`}
          value={name}
          onChange={onName}
          placeholder="Your full name"
          theme={theme}
          returnKeyType="next"
        />
        <InfoField
          icon="phone-outline"
          label={`${t.phoneNumber} *`}
          value={phone}
          onChange={onPhone}
          placeholder={t.phonePlaceholder}
          keyboardType="phone-pad"
          theme={theme}
          returnKeyType="next"
        />
        <InfoField
          icon="map-marker-outline"
          label={`${t.address} (optional)`}
          value={location}
          onChange={onLocation}
          placeholder={t.addressPlaceholder}
          theme={theme}
          returnKeyType="done"
          onSubmitEditing={canProceed ? onNext : undefined}
        />
      </View>
    </ScrollView>
  );
}

// ─── Step 3: Business/Farm ───────────────────────────────────────────────────

function BusinessStep({
  role,
  farmName,
  businessName,
  onFarmName,
  onBusinessName,
  theme,
  t,
  onNext,
}: any) {
  const isFarmer = role === "farmer";
  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.optBadge, { backgroundColor: theme.accentLight }]}>
        <Text
          style={[
            styles.optText,
            { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          Optional
        </Text>
      </View>
      <Text
        style={[
          styles.stepTitle,
          { color: theme.text, fontFamily: "Outfit_700Bold" },
        ]}
      >
        {isFarmer ? "About your farm" : "Your business"}
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        Add details now or fill in later from your profile
      </Text>

      <View style={styles.fields}>
        {isFarmer ? (
          <InfoField
            icon="barn"
            label={t.farmName}
            value={farmName}
            onChange={onFarmName}
            placeholder="e.g. Green Valley Farm"
            theme={theme}
            returnKeyType="done"
            onSubmitEditing={onNext}
          />
        ) : (
          <InfoField
            icon="store-outline"
            label={t.businessName}
            value={businessName}
            onChange={onBusinessName}
            placeholder={t.businessNamePlaceholder}
            theme={theme}
            returnKeyType="done"
            onSubmitEditing={onNext}
          />
        )}
      </View>

      <View style={[styles.finishBtns, { marginTop: 32 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={onNext}
        >
          <Text
            style={[
              styles.primaryBtnText,
              { fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            Continue
          </Text>
          <MaterialCommunityIcons
            name="arrow-right"
            size={20}
            color="#fff"
            style={{ marginLeft: 8 }}
          />
        </Pressable>
        <Pressable onPress={onNext} style={styles.skipBtn}>
          <Text
            style={[
              styles.skipText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            Skip for now
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── Step 4: Plan ────────────────────────────────────────────────────────────

function PlanStep({ theme, t, onSelect, saving }: any) {
  const [selected, setSelected] = useState<Plan>("community");

  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={[
          styles.stepTitle,
          { color: theme.text, fontFamily: "Outfit_700Bold" },
        ]}
      >
        {t.choosePlan}
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {t.planSubtitle}
      </Text>

      {/* Community card */}
      <Pressable
        onPress={() => setSelected("community")}
        style={[
          styles.planCard,
          {
            backgroundColor: theme.surface,
            borderColor: selected === "community" ? theme.accent : theme.border,
            borderWidth: selected === "community" ? 2.5 : 1.5,
          },
        ]}
      >
        <View style={styles.planCardRow}>
          <View
            style={[styles.planIconBg, { backgroundColor: theme.accentLight }]}
          >
            <MaterialCommunityIcons
              name="account-group-outline"
              size={28}
              color={theme.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.planName,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {t.communityPlan}
            </Text>
            <Text
              style={[
                styles.planPrice,
                { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              Free forever
            </Text>
          </View>
          {selected === "community" && (
            <View style={[styles.planCheck, { backgroundColor: theme.accent }]}>
              <MaterialCommunityIcons name="check" size={16} color="#fff" />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.planDesc,
            { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
          ]}
        >
          {t.communityDesc}
        </Text>
      </Pressable>

      {/* Premium card */}
      <View style={{ position: "relative" }}>
        {/* Recommended badge */}
        <View style={[styles.recBadge, { backgroundColor: theme.warm }]}>
          <Text style={[styles.recBadgeText, { fontFamily: "Outfit_700Bold" }]}>
            ★ {t.recommended}
          </Text>
        </View>
        <Pressable
          onPress={() => setSelected("premium")}
          disabled
          style={[
            styles.planCard,
            {
              backgroundColor: theme.surface,
              borderColor: selected === "premium" ? theme.warm : theme.border,
              borderWidth: selected === "premium" ? 2.5 : 1.5,
              marginTop: 8,
            },
          ]}
        >
          <View style={styles.planCardRow}>
            <View
              style={[styles.planIconBg, { backgroundColor: theme.warmLight }]}
            >
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={28}
                color={theme.warm}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.planName,
                  { color: theme.text, fontFamily: "Outfit_700Bold" },
                ]}
              >
                {t.premiumPlan}
              </Text>
              <Text
                style={[
                  styles.planPrice,
                  { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {t.premiumPrice}
              </Text>
            </View>
            {selected === "premium" && (
              <View style={[styles.planCheck, { backgroundColor: theme.warm }]}>
                <MaterialCommunityIcons name="check" size={16} color="#fff" />
              </View>
            )}
          </View>
          <Text
            style={[
              styles.planDesc,
              { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.premiumDesc}
          </Text>
          <View style={styles.premiumFeatures}>
            {[t.premiumFeature1, t.premiumFeature2, t.premiumFeature3].map(
              (f: string) => (
                <View key={f} style={styles.featureRow}>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={14}
                    color={theme.warm}
                  />
                  <Text
                    style={[
                      styles.featureText,
                      {
                        color: theme.textSecondary,
                        fontFamily: "Outfit_400Regular",
                      },
                    ]}
                  >
                    {f}
                  </Text>
                </View>
              ),
            )}
          </View>
        </Pressable>
      </View>

      <View style={[styles.finishBtns, { marginTop: 24 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            {
              backgroundColor:
                selected === "premium" ? theme.warm : theme.accent,
              opacity: pressed || saving ? 0.85 : 1,
            },
            saving && styles.btnDisabled,
          ]}
          onPress={() => onSelect(selected)}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text
                style={[
                  styles.primaryBtnText,
                  { fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {selected === "community" ? t.startFree : t.startPremium}
              </Text>
              <MaterialCommunityIcons
                name="check"
                size={20}
                color="#fff"
                style={{ marginLeft: 8 }}
              />
            </>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── Shared field component ──────────────────────────────────────────────────

function InfoField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  theme,
  returnKeyType,
  onSubmitEditing,
}: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text
        style={[
          styles.fieldLabel,
          { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={theme.textTertiary}
          style={styles.inputIcon}
        />
        <TextInput
          style={[
            styles.input,
            { color: theme.text, fontFamily: "Outfit_400Regular" },
          ]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          autoCapitalize="words"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerSide: { width: 44, alignItems: "flex-start" },
  dotsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dot: { height: 8, borderRadius: 4 },
  stepLabel: { fontSize: 13 },
  backBtn: { padding: 4 },
  slide: { flex: 1 },
  stepContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  stepTitle: { fontSize: 28, marginTop: 8 },
  stepSub: { fontSize: 15, marginTop: -4, marginBottom: 8 },
  roleCards: { gap: 16, marginTop: 8 },
  roleCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 10,
    position: "relative",
    minHeight: 160,
    justifyContent: "center",
  },
  roleIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  roleCardTitle: { fontSize: 20 },
  roleCardDesc: { fontSize: 14, textAlign: "center" },
  checkBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fields: { gap: 16, marginTop: 8 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 56,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, height: "100%" },
  optBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  optText: { fontSize: 12 },
  planCard: { borderRadius: 20, padding: 20, gap: 12, marginTop: 8 },
  planCardRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  planIconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  planName: { fontSize: 18 },
  planPrice: { fontSize: 14, marginTop: 2 },
  planDesc: { fontSize: 13, lineHeight: 19 },
  planCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumFeatures: { gap: 6, marginTop: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 13 },
  recBadge: {
    position: "absolute",
    top: 0,
    right: 16,
    zIndex: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  recBadgeText: { fontSize: 11, color: "#fff" },
  bottomBar: { paddingHorizontal: 24, paddingTop: 12 },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: "#fff", fontSize: 17 },
  finishBtns: { gap: 4 },
  skipBtn: { alignItems: "center", paddingVertical: 14 },
  skipText: { fontSize: 15 },
});
