import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useUser } from "@clerk/expo";
import { useTheme } from "@/lib/useTheme";
import { useSettings, type ThemePreference } from "@/lib/SettingsContext";
import type { Language } from "@/lib/i18n";
import {
  loadLastPricePerKg,
  loadLastKgPerCrate,
  loadLastDeductionG,
  saveLastPricePerKg,
  saveLastKgPerCrate,
  saveLastDeductionG,
  loadFarmName,
  saveFarmName,
  getChunkSize,
  setChunkSize,
} from "@/lib/storage";

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const userId = user?.id ?? "";
  const { language, setLanguage, themePreference, setThemePreference, t } =
    useSettings();

  const [defaultPrice, setDefaultPrice] = useState("");
  const [defaultKgPerCrate, setDefaultKgPerCrate] = useState("");
  const [defaultDeductionG, setDefaultDeductionG] = useState("");
  const [farmNameValue, setFarmNameValue] = useState("");
  const [chunkSize, setChunkSizeLocal] = useState("10");

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      loadLastPricePerKg(userId),
      loadLastKgPerCrate(userId),
      loadLastDeductionG(userId),
      loadFarmName(userId),
      getChunkSize(userId),
    ]).then(([price, kpc, dg, farm, chunk]) => {
      // Prefs are stored as numbers; these inputs are text. 0 means "unset".
      if (price) setDefaultPrice(String(price));
      if (kpc) setDefaultKgPerCrate(String(kpc));
      if (dg) setDefaultDeductionG(String(dg));
      if (farm) setFarmNameValue(farm);
      setChunkSizeLocal(chunk.toString());
    });
  }, [userId]);

  const handleLanguage = (lang: Language) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setLanguage(lang);
  };

  const handleTheme = (pref: ThemePreference) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setThemePreference(pref);
  };

  const handleSaveDefaults = async () => {
    const parsedChunk = parseInt(chunkSize, 10);
    // Never let a half-typed field reach the DB as NaN.
    const num = (s: string) => {
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };
    const price = num(defaultPrice);
    const kgPerCrate = num(defaultKgPerCrate);
    const deductionG = num(defaultDeductionG);

    await Promise.all([
      price !== null ? saveLastPricePerKg(userId, price) : Promise.resolve(),
      kgPerCrate !== null
        ? saveLastKgPerCrate(userId, kgPerCrate)
        : Promise.resolve(),
      deductionG !== null
        ? saveLastDeductionG(userId, deductionG)
        : Promise.resolve(),
      saveFarmName(userId, farmNameValue.trim()),
      !isNaN(parsedChunk) && parsedChunk > 0
        ? setChunkSize(userId, parsedChunk)
        : Promise.resolve(),
    ]);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const themeOptions: { key: ThemePreference; label: string }[] = [
    { key: "system", label: t.themeSystem },
    { key: "dark", label: t.themeDark },
    { key: "light", label: t.themeLight },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + webTopInset + 8,
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          style={({ pressed }) => [
            styles.navBtn,
            { backgroundColor: theme.borderLight, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <Text
          style={[
            styles.topBarTitle,
            { color: theme.text, fontFamily: "Outfit_700Bold" },
          ]}
        >
          {t.settingsTitle}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + webBottomInset + 40,
          gap: 8,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[
            styles.sectionLabel,
            { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          {t.sectionLanguage}
        </Text>
        <View style={styles.chipGroup}>
          <OptionRow
            icon={<Feather name="globe" size={18} color={theme.accent} />}
            label={t.english}
            selected={language === "en"}
            onPress={() => handleLanguage("en")}
            theme={theme}
          />
          <OptionRow
            icon={
              <MaterialCommunityIcons
                name="translate"
                size={18}
                color={theme.accent}
              />
            }
            label={t.bangla}
            selected={language === "bn"}
            onPress={() => handleLanguage("bn")}
            theme={theme}
          />
        </View>

        <Text
          style={[
            styles.sectionLabel,
            {
              color: theme.textTertiary,
              fontFamily: "Outfit_600SemiBold",
              marginTop: 12,
            },
          ]}
        >
          {t.sectionAppearance}
        </Text>
        <View style={styles.chipGroup}>
          {themeOptions.map((opt) => (
            <OptionRow
              key={opt.key}
              icon={
                <Feather
                  name={
                    opt.key === "dark"
                      ? "moon"
                      : opt.key === "light"
                        ? "sun"
                        : "monitor"
                  }
                  size={18}
                  color={theme.accent}
                />
              }
              label={opt.label}
              selected={themePreference === opt.key}
              onPress={() => handleTheme(opt.key)}
              theme={theme}
            />
          ))}
        </View>

        <Text
          style={[
            styles.sectionLabel,
            {
              color: theme.textTertiary,
              fontFamily: "Outfit_600SemiBold",
              marginTop: 12,
            },
          ]}
        >
          {t.sectionDefaults}
        </Text>
        <View style={styles.chipGroup}>
          <InputRow
            label={t.logGroupSize}
            value={chunkSize}
            onChange={(v) => {
              if (/^\d*$/.test(v)) setChunkSizeLocal(v);
            }}
            placeholder="e.g. 10"
            keyboardType="numeric"
            theme={theme}
          />
          <InputRow
            label={t.defaultKgPerCrate}
            value={defaultKgPerCrate}
            onChange={setDefaultKgPerCrate}
            placeholder="e.g. 20"
            theme={theme}
          />
          <InputRow
            label={t.defaultDeductionG}
            value={defaultDeductionG}
            onChange={setDefaultDeductionG}
            placeholder="e.g. 300"
            theme={theme}
          />
          <InputRow
            label={t.defaultPricePerKg}
            value={defaultPrice}
            onChange={setDefaultPrice}
            placeholder="e.g. 250"
            theme={theme}
          />
        </View>
        <Text
          style={[
            styles.sectionLabel,
            {
              color: theme.textTertiary,
              fontFamily: "Outfit_600SemiBold",
              marginTop: 12,
            },
          ]}
        >
          {t.sectionFarm}
        </Text>
        <View style={styles.chipGroup}>
          <View
            style={[
              styles.chipRow,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            <Text
              style={[
                styles.inputLabel,
                { color: theme.text, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.farmName}
            </Text>
            <TextInput
              value={farmNameValue}
              onChangeText={setFarmNameValue}
              placeholder={t.farmNamePlaceholder}
              placeholderTextColor={theme.textTertiary}
              style={[
                styles.textInput,
                {
                  color: theme.text,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  fontFamily: "Outfit_600SemiBold",
                  width: 160,
                  textAlign: "left",
                  paddingHorizontal: 12,
                },
              ]}
            />
          </View>
        </View>

        <Pressable
          onPress={handleSaveDefaults}
          style={({ pressed }) => [
            styles.saveBtnWrap,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={theme.isDark ? [theme.accent, theme.accentMuted] : [theme.accent, theme.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtn}
          >
            <Feather name="save" size={16} color="#FFF" />
            <Text style={[styles.saveBtnText, { fontFamily: "Outfit_700Bold" }]}>
              {t.save}
            </Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function OptionRow({
  icon,
  label,
  selected,
  onPress,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chipRow,
        {
          backgroundColor: selected ? theme.accentLight : theme.surface,
          borderColor: selected ? theme.accent + "40" : theme.borderLight,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: theme.accentLight }]}>
        {icon}
      </View>
      <Text
        style={[
          styles.optionLabel,
          {
            color: theme.text,
            fontFamily: selected ? "Outfit_700Bold" : "Outfit_400Regular",
          },
        ]}
      >
        {label}
      </Text>
      {selected && (
        <View style={[styles.checkBadge, { backgroundColor: theme.accent }]}>
          <Ionicons name="checkmark" size={14} color="#FFF" />
        </View>
      )}
    </Pressable>
  );
}

function InputRow({
  label,
  value,
  onChange,
  placeholder,
  theme,
  keyboardType = "decimal-pad",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  theme: ReturnType<typeof useTheme>;
  keyboardType?: "decimal-pad" | "numeric";
}) {
  return (
    <View
      style={[
        styles.chipRow,
        { backgroundColor: theme.surface, borderColor: theme.borderLight },
      ]}
    >
      <Text
        style={[
          styles.inputLabel,
          { color: theme.text, fontFamily: "Outfit_500Medium" },
        ]}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        style={[
          styles.textInput,
          {
            color: theme.text,
            borderColor: theme.border,
            backgroundColor: theme.background,
            fontFamily: "Outfit_600SemiBold",
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { fontSize: 17 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginLeft: 4,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  chipGroup: { gap: 8 },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { flex: 1, fontSize: 15 },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  inputLabel: { flex: 1, fontSize: 14 },
  textInput: {
    height: 40,
    width: 110,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
    textAlign: "right",
  },
  saveBtnWrap: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
  },
  saveBtnText: { color: "#FFF", fontSize: 15 },
});
