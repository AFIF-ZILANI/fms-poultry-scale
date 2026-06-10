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
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
} from "@/lib/storage";

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, themePreference, setThemePreference, t } =
    useSettings();

  const [defaultPrice, setDefaultPrice] = useState("");
  const [defaultKgPerCrate, setDefaultKgPerCrate] = useState("");
  const [defaultDholtaG, setDefaultDholtaG] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useEffect(() => {
    Promise.all([
      loadLastPricePerKg(),
      loadLastKgPerCrate(),
      loadLastDeductionG(),
    ]).then(([price, kpc, dg]) => {
      if (price) setDefaultPrice(price);
      if (kpc) setDefaultKgPerCrate(kpc);
      if (dg) setDefaultDholtaG(dg);
    });
  }, []);

  const handleLanguage = (lang: Language) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setLanguage(lang);
  };

  const handleTheme = (pref: ThemePreference) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setThemePreference(pref);
  };

  const handleSaveDefaults = async () => {
    await Promise.all([
      defaultPrice ? saveLastPricePerKg(defaultPrice) : Promise.resolve(),
      defaultKgPerCrate
        ? saveLastKgPerCrate(defaultKgPerCrate)
        : Promise.resolve(),
      defaultDholtaG ? saveLastDeductionG(defaultDholtaG) : Promise.resolve(),
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
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.borderLight },
          ]}
        >
          <OptionRow
            icon={<Feather name="globe" size={18} color={theme.accent} />}
            label={t.english}
            selected={language === "en"}
            onPress={() => handleLanguage("en")}
            theme={theme}
            isLast={false}
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
            isLast
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
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.borderLight },
          ]}
        >
          {themeOptions.map((opt, idx) => (
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
              isLast={idx === themeOptions.length - 1}
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
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.borderLight },
          ]}
        >
          <InputRow
            label={t.defaultKgPerCrate}
            value={defaultKgPerCrate}
            onChange={setDefaultKgPerCrate}
            placeholder="e.g. 20"
            theme={theme}
            isLast={false}
          />
          <InputRow
            label={t.defaultDholtaG}
            value={defaultDholtaG}
            onChange={setDefaultDholtaG}
            placeholder="e.g. 300"
            theme={theme}
            isLast={false}
          />
          <InputRow
            label={t.defaultPricePerKg}
            value={defaultPrice}
            onChange={setDefaultPrice}
            placeholder="e.g. 250"
            theme={theme}
            isLast
          />
        </View>
        <Pressable
          onPress={handleSaveDefaults}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: theme.accent,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Feather name="save" size={16} color="#FFF" />
          <Text
            style={[styles.saveBtnText, { fontFamily: "Outfit_700Bold" }]}
          >
            {t.save}
          </Text>
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
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  isLast: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        !isLast && {
          borderBottomWidth: 1,
          borderBottomColor: theme.borderLight,
        },
        { opacity: pressed ? 0.7 : 1 },
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
  isLast,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  theme: ReturnType<typeof useTheme>;
  isLast: boolean;
}) {
  return (
    <View
      style={[
        styles.inputRow,
        !isLast && {
          borderBottomWidth: 1,
          borderBottomColor: theme.borderLight,
        },
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
        keyboardType="decimal-pad"
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
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 16,
    marginTop: 4,
  },
  saveBtnText: { color: "#FFF", fontSize: 15 },
});
