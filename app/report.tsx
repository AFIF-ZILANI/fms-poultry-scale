import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import {
  formatWeight,
  kgToGrams,
  formatGrams,
  formatDateTime,
} from "@/lib/utils";
import { saveSale } from "@/lib/storage";
import type { MeasurementRow, SaleRecord } from "@/lib/types";

export default function ReportScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rows: string }>();

  const rows: MeasurementRow[] = params.rows ? JSON.parse(params.rows) : [];
  const totalWeightKg = rows.reduce((sum, r) => sum + r.weightKg, 0);
  const totalPcs = rows.reduce((sum, r) => sum + r.pcs, 0);
  const avgWeightKg = totalPcs > 0 ? totalWeightKg / totalPcs : 0;
  const totalWeightGrams = kgToGrams(totalWeightKg);
  const avgWeightGrams = kgToGrams(avgWeightKg);
  const now = Date.now();

  const handleSave = async () => {
    const sale: SaleRecord = {
      id: Crypto.randomUUID(),
      totalWeightKg,
      totalWeightGrams,
      totalPcs,
      averageWeightKg: avgWeightKg,
      averageWeightGrams: avgWeightGrams,
      rows,
      createdAt: now,
    };

    await saveSale(sale);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    router.dismissAll();
  };

  const handleBack = () => {
    router.back();
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

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
          onPress={handleBack}
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
            { color: theme.text, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          Sale Report
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + webBottomInset + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={Platform.OS !== "web" ? FadeIn.delay(100) : undefined}
          style={[styles.heroCard, { backgroundColor: theme.timerBg }]}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroCheck}>
              <Ionicons name="checkmark" size={24} color="#FFF" />
            </View>
            <Text
              style={[styles.heroTitle, { fontFamily: "Outfit_700Bold" }]}
            >
              Weighing Complete
            </Text>
          </View>
          <Text style={[styles.heroDate, { fontFamily: "Outfit_400Regular" }]}>
            {formatDateTime(now)}
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.heroStatItem}>
              <Text
                style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {formatWeight(totalWeightKg)}
              </Text>
              <Text
                style={[
                  styles.heroStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                Total KG
              </Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroStatItem}>
              <Text
                style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {totalPcs}
              </Text>
              <Text
                style={[
                  styles.heroStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                Birds
              </Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroStatItem}>
              <Text
                style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {formatWeight(avgWeightKg)}
              </Text>
              <Text
                style={[
                  styles.heroStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                Avg KG
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          entering={
            Platform.OS !== "web"
              ? FadeInDown.delay(150).springify()
              : undefined
          }
        >
          <View style={styles.detailGrid}>
            <View
              style={[
                styles.detailCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderLight,
                },
              ]}
            >
              <View
                style={[
                  styles.detailIcon,
                  { backgroundColor: theme.accentLight },
                ]}
              >
                <Ionicons name="scale-outline" size={18} color={theme.accent} />
              </View>
              <Text
                style={[
                  styles.detailVal,
                  { color: theme.accent, fontFamily: "Outfit_700Bold" },
                ]}
              >
                {formatGrams(totalWeightGrams)}
              </Text>
              <Text
                style={[
                  styles.detailLabel,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                Total Grams
              </Text>
            </View>
            <View
              style={[
                styles.detailCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderLight,
                },
              ]}
            >
              <View
                style={[
                  styles.detailIcon,
                  { backgroundColor: theme.warmLight },
                ]}
              >
                <Feather name="trending-up" size={18} color={theme.warm} />
              </View>
              <Text
                style={[
                  styles.detailVal,
                  { color: theme.warm, fontFamily: "Outfit_700Bold" },
                ]}
              >
                {formatGrams(avgWeightGrams)}
              </Text>
              <Text
                style={[
                  styles.detailLabel,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                Avg Grams/Bird
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          entering={
            Platform.OS !== "web"
              ? FadeInDown.delay(250).springify()
              : undefined
          }
        >
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            WEIGHING LOG ({rows.length})
          </Text>
          <View
            style={[
              styles.logCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
              },
            ]}
          >
            {rows.map((row, idx) => (
              <View
                key={row.id}
                style={[
                  styles.logItem,
                  idx < rows.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.borderLight,
                  },
                ]}
              >
                <View
                  style={[
                    styles.logNum,
                    { backgroundColor: theme.accentLight },
                  ]}
                >
                  <Text
                    style={[
                      styles.logNumText,
                      { color: theme.accent, fontFamily: "Outfit_700Bold" },
                    ]}
                  >
                    {rows.length - idx}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.logWeight,
                    { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {formatWeight(row.weightKg)} KG
                </Text>
                <View style={styles.logPcs}>
                  <MaterialCommunityIcons
                    name="bird"
                    size={13}
                    color={theme.warm}
                  />
                  <Text
                    style={[
                      styles.logPcsText,
                      { color: theme.warm, fontFamily: "Outfit_500Medium" },
                    ]}
                  >
                    {row.pcs}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + webBottomInset + 12,
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
          },
        ]}
      >
        <View style={styles.btnRow}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backBtn,
              {
                borderColor: theme.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: theme.accent,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
            testID="save-button"
          >
            <Feather name="save" size={18} color="#FFF" />
            <Text
              style={[styles.saveBtnText, { fontFamily: "Outfit_700Bold" }]}
            >
              Save to History
            </Text>
          </Pressable>
        </View>
      </View>
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
  topBarTitle: { fontSize: 16 },
  heroCard: {
    borderRadius: 22,
    padding: 22,
    marginBottom: 16,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  heroCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 20, color: "#FFF" },
  heroDate: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginLeft: 42,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 16,
  },
  heroStatItem: { alignItems: "center" },
  heroStatVal: { fontSize: 24, color: "#FFF" },
  heroStatUnit: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  heroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  detailGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  detailCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  detailVal: { fontSize: 22 },
  detailLabel: { fontSize: 11, marginTop: 4, textTransform: "uppercase" },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  logCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  logItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  logNum: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  logNumText: { fontSize: 13 },
  logWeight: { flex: 1, fontSize: 15 },
  logPcs: { flexDirection: "row", alignItems: "center", gap: 4 },
  logPcsText: { fontSize: 13 },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  btnRow: { flexDirection: "row", gap: 10 },
  backBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnText: { color: "#FFF", fontSize: 16 },
});
