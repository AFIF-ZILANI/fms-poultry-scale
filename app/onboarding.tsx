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
  Modal,
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
import { Band } from "@/constants/colors";
import {
  type OnboardingData,
  type UserRole,
  loadOnboardingDraft,
  markOnboardingComplete,
  saveOnboardingDraft,
  saveUserProfile,
} from "@/lib/onboarding";
import { savePlan, type Plan } from "@/lib/subscription";
import { listDistricts, listUpazilas, getDistrictName, getUpazilaName } from "@/lib/regions";

const { width: SCREEN_W } = Dimensions.get("window");
const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, language, setLanguage } = useSettings();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [upazilaId, setUpazilaId] = useState<string | null>(null);
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
      if (draft.districtId) setDistrictId(draft.districtId);
      if (draft.upazilaId) setUpazilaId(draft.upazilaId);
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
      ...(districtId && { districtId }),
      ...(upazilaId && { upazilaId }),
      ...(farmName && { farmName }),
      ...(businessName && { businessName }),
    };
    saveOnboardingDraft(user.id, draft);
  }, [user, role, name, phone, location, districtId, upazilaId, farmName, businessName]);

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

  const handleRoleSelect = (r: UserRole) => setRole(r);

  const handleDistrictSelect = (id: string) => {
    if (id !== districtId) setUpazilaId(null);
    setDistrictId(id);
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
        districtId: districtId!,
        upazilaId: upazilaId!,
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

  const step2CanProceed =
    name.trim().length > 0 &&
    phone.trim().length >= 10 &&
    !!districtId &&
    !!upazilaId;
  // Step 3 (farm/business details) is optional, so it is always passable.
  const canProceed =
    step === 0 ? role !== null : step === 1 ? step2CanProceed : true;

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
        {/* The audience is Bengali-first, and settings live behind
            onboarding — so the language switch has to be reachable here,
            before a single word has to be understood. */}
        <View style={styles.headerSide}>
          <View style={[styles.langRow, { backgroundColor: theme.borderLight }]}>
            {(["en", "bn"] as const).map((code) => {
              const on = language === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setLanguage(code)}
                  hitSlop={6}
                  style={[
                    styles.langBtn,
                    on && { backgroundColor: theme.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.langText,
                      {
                        color: on ? theme.text : theme.textTertiary,
                        fontFamily: on ? "Outfit_600SemiBold" : "Outfit_400Regular",
                      },
                    ]}
                  >
                    {code === "en" ? "EN" : "বাং"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
              districtId={districtId}
              upazilaId={upazilaId}
              onName={setName}
              onPhone={setPhone}
              onLocation={setLocation}
              onDistrictSelect={handleDistrictSelect}
              onUpazilaSelect={setUpazilaId}
              theme={theme}
              t={t}
              language={language}
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

        {step < TOTAL_STEPS - 1 && (
          <View
            style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
                !canProceed && styles.btnDisabled,
              ]}
              onPress={goNext}
              disabled={!canProceed}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {t.obContinue}
              </Text>
              <MaterialCommunityIcons
                name="arrow-right"
                size={20}
                color="#fff"
                style={{ marginLeft: 8 }}
              />
            </Pressable>
            {step === 2 && (
              <Pressable onPress={goNext} style={styles.skipBtn}>
                <Text
                  style={[
                    styles.skipText,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_400Regular",
                    },
                  ]}
                >
                  {t.obSkip}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Step 1: Role ────────────────────────────────────────────────────────────

// The choice is really which side of the trade you stand on, so it's framed
// as a reading, not a settings toggle: each option is a dark instrument slab
// — the same Band material the home screen's scale readout is built from —
// with the verb ("I SELL" / "I BUY") set in the app's own readout face
// (IBM Plex Mono, otherwise reserved for figures) as the headline, and the
// role name as the supporting line beneath it. The chosen side "lights up"
// in the band's single data hue; the other stays dim. No icon, no checkbox —
// the lit verb IS the selected state, the way a reading either shows or it
// doesn't. Band's own colours don't shift with light/dark mode ("an
// instrument face does not change colour with the room"), so this component
// deliberately breaks from `theme` for the slab itself.
function RoleStep({ role, onSelect, theme, t }: any) {
  const options = [
    {
      key: "farmer" as UserRole,
      verb: t.obSellEyebrow,
      title: t.farmerRole,
      benefit: t.obFarmerBenefit,
    },
    {
      key: "wholesaler" as UserRole,
      verb: t.obBuyEyebrow,
      title: t.wholesalerRole,
      benefit: t.obWholesalerBenefit,
    },
  ];

  const slabBg = theme.isDark ? Band.dark : Band.light;

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
        {t.obRoleTitle}
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {t.obRoleSub}
      </Text>

      <View style={styles.roleCards}>
        {options.map(({ key, verb, title, benefit }) => {
          const selected = role === key;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.roleSlab,
                {
                  backgroundColor: slabBg,
                  borderColor: selected ? Band.bar : "transparent",
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.roleVerb,
                  {
                    fontFamily: "IBMPlexMono_600SemiBold",
                    color: selected ? Band.bar : Band.inkFaint,
                  },
                ]}
              >
                {verb.toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.roleName,
                  {
                    fontFamily: "Outfit_600SemiBold",
                    color: selected ? Band.ink : Band.inkDim,
                  },
                ]}
              >
                {title}
              </Text>
              <Text
                style={[
                  styles.roleDesc,
                  { fontFamily: "Outfit_400Regular", color: Band.inkFaint },
                ]}
              >
                {benefit}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Step 2: Basic Info ──────────────────────────────────────────────────────

function BasicInfoStep({
  name,
  phone,
  location,
  districtId,
  upazilaId,
  onName,
  onPhone,
  onLocation,
  onDistrictSelect,
  onUpazilaSelect,
  theme,
  t,
  language,
  canProceed,
  onNext,
}: any) {
  const [districtModalOpen, setDistrictModalOpen] = useState(false);
  const [upazilaModalOpen, setUpazilaModalOpen] = useState(false);

  const districts = listDistricts();
  const upazilas = districtId ? listUpazilas(districtId) : [];
  const selectedDistrictName = getDistrictName(districtId, language);
  const selectedUpazilaName = getUpazilaName(upazilaId, language);

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
        {t.obBasicTitle}
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {t.obBasicSub}
      </Text>

      <View style={styles.fields}>
        <InfoField
          icon="account-outline"
          label={`${t.obFullName} *`}
          value={name}
          onChange={onName}
          placeholder={t.obFullNamePlaceholder}
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

        <View style={styles.fieldGroup}>
          <Text
            style={[
              styles.fieldLabel,
              { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {`${t.district} *`}
          </Text>
          <Pressable
            style={[
              styles.inputRow,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={() => setDistrictModalOpen(true)}
          >
            <MaterialCommunityIcons
              name="map-outline"
              size={20}
              color={theme.textTertiary}
              style={styles.inputIcon}
            />
            <Text
              style={[
                styles.input,
                { height: undefined },
                {
                  color: selectedDistrictName ? theme.text : theme.textTertiary,
                  fontFamily: "Outfit_400Regular",
                },
              ]}
            >
              {selectedDistrictName ?? t.selectDistrict}
            </Text>
          </Pressable>
        </View>

        <View style={styles.fieldGroup}>
          <Text
            style={[
              styles.fieldLabel,
              { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {`${t.upazila} *`}
          </Text>
          <Pressable
            style={[
              styles.inputRow,
              { backgroundColor: theme.surface, borderColor: theme.border },
              !districtId && { opacity: 0.5 },
            ]}
            onPress={() => districtId && setUpazilaModalOpen(true)}
            disabled={!districtId}
          >
            <MaterialCommunityIcons
              name="map-marker-radius-outline"
              size={20}
              color={theme.textTertiary}
              style={styles.inputIcon}
            />
            <Text
              style={[
                styles.input,
                { height: undefined },
                {
                  color: selectedUpazilaName ? theme.text : theme.textTertiary,
                  fontFamily: "Outfit_400Regular",
                },
              ]}
            >
              {selectedUpazilaName ?? t.selectUpazila}
            </Text>
          </Pressable>
        </View>

        <InfoField
          icon="map-marker-outline"
          label={`${t.villageArea} (${t.optional})`}
          value={location}
          onChange={onLocation}
          placeholder={t.villageAreaPlaceholder}
          theme={theme}
          returnKeyType="done"
          onSubmitEditing={canProceed ? onNext : undefined}
        />
      </View>

      <RegionPickerModal
        visible={districtModalOpen}
        title={t.selectDistrict}
        searchPlaceholder={t.searchDistrictPlaceholder}
        items={districts}
        onSelect={onDistrictSelect}
        onClose={() => setDistrictModalOpen(false)}
        language={language}
        theme={theme}
      />
      <RegionPickerModal
        visible={upazilaModalOpen}
        title={t.selectUpazila}
        searchPlaceholder={t.searchUpazilaPlaceholder}
        items={upazilas}
        onSelect={onUpazilaSelect}
        onClose={() => setUpazilaModalOpen(false)}
        language={language}
        theme={theme}
      />
    </ScrollView>
  );
}

// ─── Region picker (District, then Upazila) ─────────────────────────────────

function RegionPickerModal({
  visible,
  title,
  searchPlaceholder,
  items,
  onSelect,
  onClose,
  language,
  theme,
}: {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  items: { id: string; nameEn: string; nameBn: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
  language: "en" | "bn";
  theme: any;
}) {
  const [query, setQuery] = useState("");

  const filtered = items
    .filter((item) =>
      (language === "bn" ? item.nameBn : item.nameEn)
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const an = language === "bn" ? a.nameBn : a.nameEn;
      const bn = language === "bn" ? b.nameBn : b.nameEn;
      return an.localeCompare(bn);
    });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: theme.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          <Text
            style={[
              styles.modalTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {title}
          </Text>
          <TextInput
            style={[
              styles.modalSearch,
              {
                color: theme.text,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
          />
          <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
            {filtered.map((item) => (
              <Pressable
                key={item.id}
                style={styles.modalRow}
                onPress={() => {
                  onSelect(item.id);
                  setQuery("");
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.modalRowText,
                    { color: theme.text, fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  {language === "bn" ? item.nameBn : item.nameEn}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
          {t.optional}
        </Text>
      </View>
      <Text
        style={[
          styles.stepTitle,
          { color: theme.text, fontFamily: "Outfit_700Bold" },
        ]}
      >
        {isFarmer ? t.obFarmTitle : t.obBusinessTitle}
      </Text>
      <Text
        style={[
          styles.stepSub,
          { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {t.obDetailsSub}
      </Text>

      <View style={styles.fields}>
        {isFarmer ? (
          <InfoField
            icon="barn"
            label={t.farmName}
            value={farmName}
            onChange={onFarmName}
            placeholder={t.obFarmNamePlaceholder}
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
  headerSide: { width: 44, alignItems: "flex-start", marginHorizontal: 24 },
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
  langRow: { flexDirection: "row", borderRadius: 9, padding: 2 },
  langBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  langText: { fontSize: 11 },

  roleCards: { gap: 12, marginTop: 8 },
  roleSlab: {
    borderRadius: 18,
    borderWidth: 2,
    padding: 20,
    gap: 4,
  },
  roleVerb: { fontSize: 24, letterSpacing: 0.5 },
  roleName: { fontSize: 14, marginTop: 2 },
  roleDesc: { fontSize: 13, lineHeight: 19, marginTop: 6 },
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

  // Region picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingBottom: 36,
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 14,
    marginBottom: 0,
  },
  modalTitle: {
    fontSize: 18,
    textAlign: "center",
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalSearch: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
  },
  modalList: { paddingHorizontal: 20 },
  modalRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)" },
  modalRowText: { fontSize: 16 },
});
