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
import {
  type OnboardingData,
  type UserRole,
  clearOnboardingDraft,
  loadOnboardingDraft,
  markOnboardingComplete,
  saveOnboardingDraft,
  saveUserProfile,
} from "@/lib/onboarding";

const { width: SCREEN_W } = Dimensions.get("window");
const TOTAL_STEPS = 3;

export default function OnboardingScreen() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [farmName, setFarmName] = useState("");
  const [farmCapacity, setFarmCapacity] = useState("");
  const [breed, setBreed] = useState("");
  const [buyingCapacity, setBuyingCapacity] = useState("");
  const [supplyRegions, setSupplyRegions] = useState("");

  // Load draft on mount
  useEffect(() => {
    if (!user) return;
    loadOnboardingDraft(user.id).then((draft) => {
      if (!draft) return;
      if (draft.role) setRole(draft.role);
      if (draft.name) setName(draft.name);
      if (draft.location) setLocation(draft.location);
      if (draft.farmName) setFarmName(draft.farmName);
      if (draft.farmCapacity) setFarmCapacity(draft.farmCapacity);
      if (draft.breed) setBreed(draft.breed);
      if (draft.buyingCapacity) setBuyingCapacity(draft.buyingCapacity);
      if (draft.supplyRegions) setSupplyRegions(draft.supplyRegions);
    });
  }, [user]);

  // Auto-save draft on every change
  const persistDraft = useCallback(() => {
    if (!user) return;
    const draft: Partial<OnboardingData> = {
      ...(role && { role }),
      ...(name && { name }),
      ...(location && { location }),
      ...(farmName && { farmName }),
      ...(farmCapacity && { farmCapacity }),
      ...(breed && { breed }),
      ...(buyingCapacity && { buyingCapacity }),
      ...(supplyRegions && { supplyRegions }),
    };
    saveOnboardingDraft(user.id, draft);
  }, [user, role, name, location, farmName, farmCapacity, breed, buyingCapacity, supplyRegions]);

  useEffect(() => {
    persistDraft();
  }, [persistDraft]);

  const animateToStep = (nextStep: number) => {
    const direction = nextStep > step ? 1 : -1;
    slideAnim.setValue(direction * SCREEN_W);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setStep(nextStep);
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
    // Brief delay for animation feel before advancing
    setTimeout(() => animateToStep(1), 180);
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const profile: OnboardingData = {
        role: role!,
        name: name.trim(),
        location: location.trim(),
        ...(farmName.trim() && { farmName: farmName.trim() }),
        ...(farmCapacity.trim() && { farmCapacity: farmCapacity.trim() }),
        ...(breed.trim() && { breed: breed.trim() }),
        ...(buyingCapacity.trim() && { buyingCapacity: buyingCapacity.trim() }),
        ...(supplyRegions.trim() && { supplyRegions: supplyRegions.trim() }),
      };
      await saveUserProfile(user.id, profile);
      await markOnboardingComplete(user.id);
      await clearOnboardingDraft(user.id);
      router.replace("/");
    } catch {
      setSaving(false);
    }
  };

  const handleSkipOptional = async () => {
    await handleFinish();
  };

  const step1CanProceed = !!role;
  const step2CanProceed = name.trim().length > 0 && location.trim().length > 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          {step > 0 && (
            <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text} />
            </Pressable>
          )}
        </View>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === step ? theme.accent : theme.border,
                  width: i === step ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.stepLabel, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
            {step + 1}/{TOTAL_STEPS}
          </Text>
        </View>
      </View>

      {/* Slide content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          style={[styles.slideWrapper, { transform: [{ translateX: slideAnim }] }]}
        >
          {step === 0 && (
            <RoleStep role={role} onSelect={handleRoleSelect} theme={theme} />
          )}
          {step === 1 && (
            <BasicInfoStep
              name={name}
              location={location}
              onName={setName}
              onLocation={setLocation}
              theme={theme}
              onNext={goNext}
              canProceed={step2CanProceed}
            />
          )}
          {step === 2 && (
            <OptionalStep
              role={role!}
              farmName={farmName}
              farmCapacity={farmCapacity}
              breed={breed}
              buyingCapacity={buyingCapacity}
              supplyRegions={supplyRegions}
              onFarmName={setFarmName}
              onFarmCapacity={setFarmCapacity}
              onBreed={setBreed}
              onBuyingCapacity={setBuyingCapacity}
              onSupplyRegions={setSupplyRegions}
              theme={theme}
              onFinish={handleFinish}
              onSkip={handleSkipOptional}
              saving={saving}
            />
          )}
        </Animated.View>

        {/* Bottom CTA for step 1 (role) — hidden since role cards auto-advance */}
        {step === 1 && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                !step2CanProceed && styles.btnDisabled,
              ]}
              onPress={goNext}
              disabled={!step2CanProceed}
            >
              <Text style={[styles.primaryBtnText, { fontFamily: "Outfit_600SemiBold" }]}>
                Continue
              </Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Step 1: Role Selection ──────────────────────────────────────────────────

function RoleStep({
  role,
  onSelect,
  theme,
}: {
  role: UserRole | null;
  onSelect: (r: UserRole) => void;
  theme: any;
}) {
  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;

  const pressIn = (anim: Animated.Value) =>
    Animated.spring(anim, { toValue: 0.96, useNativeDriver: true }).start();
  const pressOut = (anim: Animated.Value) =>
    Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();

  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.stepTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
        Who are you?
      </Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
        Select your role to personalise your experience
      </Text>

      <View style={styles.roleCards}>
        <Animated.View style={{ transform: [{ scale: scaleA }] }}>
          <Pressable
            onPressIn={() => pressIn(scaleA)}
            onPressOut={() => pressOut(scaleA)}
            onPress={() => onSelect("farmer")}
            style={[
              styles.roleCard,
              {
                backgroundColor: theme.surface,
                borderColor: role === "farmer" ? theme.accent : theme.border,
                borderWidth: role === "farmer" ? 2.5 : 1.5,
              },
            ]}
          >
            <View style={[styles.roleIconBg, { backgroundColor: role === "farmer" ? theme.accent : theme.accentLight }]}>
              <MaterialCommunityIcons
                name="tractor"
                size={44}
                color={role === "farmer" ? "#fff" : theme.accent}
              />
            </View>
            <Text style={[styles.roleCardTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
              Farmer
            </Text>
            <Text style={[styles.roleCardDesc, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
              I raise and sell poultry
            </Text>
            {role === "farmer" && (
              <View style={[styles.checkBadge, { backgroundColor: theme.accent }]}>
                <MaterialCommunityIcons name="check" size={14} color="#fff" />
              </View>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: scaleB }] }}>
          <Pressable
            onPressIn={() => pressIn(scaleB)}
            onPressOut={() => pressOut(scaleB)}
            onPress={() => onSelect("wholesaler")}
            style={[
              styles.roleCard,
              {
                backgroundColor: theme.surface,
                borderColor: role === "wholesaler" ? theme.accent : theme.border,
                borderWidth: role === "wholesaler" ? 2.5 : 1.5,
              },
            ]}
          >
            <View style={[styles.roleIconBg, { backgroundColor: role === "wholesaler" ? theme.accent : theme.accentLight }]}>
              <MaterialCommunityIcons
                name="store-outline"
                size={44}
                color={role === "wholesaler" ? "#fff" : theme.accent}
              />
            </View>
            <Text style={[styles.roleCardTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
              Wholesaler
            </Text>
            <Text style={[styles.roleCardDesc, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
              I buy and distribute poultry
            </Text>
            {role === "wholesaler" && (
              <View style={[styles.checkBadge, { backgroundColor: theme.accent }]}>
                <MaterialCommunityIcons name="check" size={14} color="#fff" />
              </View>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </ScrollView>
  );
}

// ─── Step 2: Basic Info ──────────────────────────────────────────────────────

function BasicInfoStep({
  name,
  location,
  onName,
  onLocation,
  theme,
  onNext,
  canProceed,
}: {
  name: string;
  location: string;
  onName: (v: string) => void;
  onLocation: (v: string) => void;
  theme: any;
  onNext: () => void;
  canProceed: boolean;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.stepTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
        Tell us about yourself
      </Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
        This helps us personalise your records
      </Text>

      <View style={styles.fields}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary, fontFamily: "Outfit_500Medium" }]}>
            Your name <Text style={{ color: theme.danger }}>*</Text>
          </Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="account-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text, fontFamily: "Outfit_400Regular" }]}
              value={name}
              onChangeText={onName}
              placeholder="Your full name"
              placeholderTextColor={theme.textTertiary}
              returnKeyType="next"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary, fontFamily: "Outfit_500Medium" }]}>
            Location <Text style={{ color: theme.danger }}>*</Text>
          </Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="map-marker-outline" size={20} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.text, fontFamily: "Outfit_400Regular" }]}
              value={location}
              onChangeText={onLocation}
              placeholder="City or district"
              placeholderTextColor={theme.textTertiary}
              returnKeyType="done"
              onSubmitEditing={canProceed ? onNext : undefined}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Step 3: Optional Info ───────────────────────────────────────────────────

function OptionalStep({
  role,
  farmName,
  farmCapacity,
  breed,
  buyingCapacity,
  supplyRegions,
  onFarmName,
  onFarmCapacity,
  onBreed,
  onBuyingCapacity,
  onSupplyRegions,
  theme,
  onFinish,
  onSkip,
  saving,
}: {
  role: UserRole;
  farmName: string;
  farmCapacity: string;
  breed: string;
  buyingCapacity: string;
  supplyRegions: string;
  onFarmName: (v: string) => void;
  onFarmCapacity: (v: string) => void;
  onBreed: (v: string) => void;
  onBuyingCapacity: (v: string) => void;
  onSupplyRegions: (v: string) => void;
  theme: any;
  onFinish: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  const isFarmer = role === "farmer";
  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.optionalBadge}>
        <Text style={[styles.optionalText, { color: theme.textTertiary, fontFamily: "Outfit_500Medium" }]}>
          Optional
        </Text>
      </View>
      <Text style={[styles.stepTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
        {isFarmer ? "About your farm" : "Your business"}
      </Text>
      <Text style={[styles.stepSubtitle, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
        Add details now or fill them in later
      </Text>

      <View style={styles.fields}>
        {isFarmer ? (
          <>
            <OptionalField
              icon="barn"
              label="Farm name"
              value={farmName}
              onChange={onFarmName}
              placeholder="e.g. Green Valley Farm"
              theme={theme}
            />
            <OptionalField
              icon="counter"
              label="Farm capacity (birds)"
              value={farmCapacity}
              onChange={onFarmCapacity}
              placeholder="e.g. 5000"
              keyboardType="number-pad"
              theme={theme}
            />
            <OptionalField
              icon="feather"
              label="Breed"
              value={breed}
              onChange={onBreed}
              placeholder="e.g. Broiler, Layer"
              theme={theme}
            />
          </>
        ) : (
          <>
            <OptionalField
              icon="package-variant"
              label="Buying capacity (birds/week)"
              value={buyingCapacity}
              onChange={onBuyingCapacity}
              placeholder="e.g. 10000"
              keyboardType="number-pad"
              theme={theme}
            />
            <OptionalField
              icon="map-marker-radius-outline"
              label="Supply regions"
              value={supplyRegions}
              onChange={onSupplyRegions}
              placeholder="e.g. Dhaka, Chittagong"
              theme={theme}
            />
          </>
        )}
      </View>

      {/* Bottom buttons */}
      <View style={styles.finishBtns}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            saving && styles.btnDisabled,
          ]}
          onPress={onFinish}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={[styles.primaryBtnText, { fontFamily: "Outfit_600SemiBold" }]}>
                Finish Setup
              </Text>
              <MaterialCommunityIcons name="check" size={20} color="#fff" style={{ marginLeft: 8 }} />
            </>
          )}
        </Pressable>

        <Pressable onPress={onSkip} style={styles.skipBtn} disabled={saving}>
          <Text style={[styles.skipText, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
            Skip for now
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function OptionalField({
  icon,
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  theme,
}: {
  icon: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: any;
  theme: any;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary, fontFamily: "Outfit_500Medium" }]}>
        {label}
      </Text>
      <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={theme.textTertiary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { color: theme.text, fontFamily: "Outfit_400Regular" }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          keyboardType={keyboardType}
          returnKeyType="next"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: {
    width: 44,
    alignItems: "flex-start",
  },
  headerRight: {
    width: 44,
    alignItems: "flex-end",
  },
  backBtn: {
    padding: 4,
  },
  dots: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  stepLabel: {
    fontSize: 13,
  },
  slideWrapper: {
    flex: 1,
  },
  stepContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  stepTitle: {
    fontSize: 28,
    marginTop: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    marginTop: -4,
    marginBottom: 8,
  },
  roleCards: {
    gap: 16,
    marginTop: 8,
  },
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
  roleCardTitle: {
    fontSize: 20,
  },
  roleCardDesc: {
    fontSize: 14,
    textAlign: "center",
  },
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
  fields: {
    gap: 16,
    marginTop: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
  },
  finishBtns: {
    gap: 4,
    marginTop: 16,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  skipText: {
    fontSize: 15,
  },
  optionalBadge: {
    alignSelf: "flex-start",
  },
  optionalText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
