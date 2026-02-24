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
import { Ionicons, Feather } from "@expo/vector-icons";
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
            borderBottomColor: theme.borderLight,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text
          style={[
            styles.topBarTitle,
            { color: theme.text, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          Report
        </Text>
        <View style={{ width: 24 }} />
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
          style={[
            styles.summaryCard,
            { backgroundColor: theme.accent, shadowColor: theme.accent },
          ]}
        >
          <View style={styles.summaryHeader}>
            <Ionicons name="checkmark-circle" size={28} color="#FFF" />
            <Text style={[styles.summaryTitle, { fontFamily: "Outfit_700Bold" }]}>
              Measurement Complete
            </Text>
          </View>
          <Text style={[styles.summaryDate, { fontFamily: "Outfit_400Regular" }]}>
            {formatDateTime(now)}
          </Text>
        </Animated.View>

        <Animated.View
          entering={Platform.OS !== "web" ? FadeInDown.delay(150).springify() : undefined}
        >
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textSecondary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            TOTAL WEIGHT
          </Text>
          <View
            style={[
              styles.dataCard,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            <View style={styles.dataRow}>
              <View style={styles.dataItem}>
                <Text
                  style={[
                    styles.dataValue,
                    { color: theme.accent, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  {formatWeight(totalWeightKg)}
                </Text>
                <Text
                  style={[
                    styles.dataUnit,
                    { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  Kilograms
                </Text>
              </View>
              <View
                style={[styles.dataDivider, { backgroundColor: theme.border }]}
              />
              <View style={styles.dataItem}>
                <Text
                  style={[
                    styles.dataValue,
                    { color: theme.accent, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  {formatGrams(totalWeightGrams)}
                </Text>
                <Text
                  style={[
                    styles.dataUnit,
                    { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  Grams
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          entering={Platform.OS !== "web" ? FadeInDown.delay(250).springify() : undefined}
        >
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textSecondary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            TOTAL PIECES
          </Text>
          <View
            style={[
              styles.dataCard,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            <View style={styles.pcsCenter}>
              <Text
                style={[
                  styles.pcsValue,
                  { color: theme.warm, fontFamily: "Outfit_700Bold" },
                ]}
              >
                {totalPcs}
              </Text>
              <Text
                style={[
                  styles.pcsLabel,
                  { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                ]}
              >
                Birds
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          entering={Platform.OS !== "web" ? FadeInDown.delay(350).springify() : undefined}
        >
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textSecondary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            AVERAGE WEIGHT
          </Text>
          <View
            style={[
              styles.dataCard,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            <View style={styles.dataRow}>
              <View style={styles.dataItem}>
                <Text
                  style={[
                    styles.dataValue,
                    { color: theme.text, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  {formatWeight(avgWeightKg)}
                </Text>
                <Text
                  style={[
                    styles.dataUnit,
                    { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  KG per bird
                </Text>
              </View>
              <View
                style={[styles.dataDivider, { backgroundColor: theme.border }]}
              />
              <View style={styles.dataItem}>
                <Text
                  style={[
                    styles.dataValue,
                    { color: theme.text, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  {formatGrams(avgWeightGrams)}
                </Text>
                <Text
                  style={[
                    styles.dataUnit,
                    { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  Grams per bird
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View
          entering={Platform.OS !== "web" ? FadeInDown.delay(450).springify() : undefined}
        >
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.textSecondary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            MEASUREMENTS ({rows.length})
          </Text>
          <View
            style={[
              styles.dataCard,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            {rows.map((row, idx) => (
              <View
                key={row.id}
                style={[
                  styles.measurementItem,
                  idx < rows.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.borderLight,
                  },
                ]}
              >
                <View
                  style={[
                    styles.measurementNum,
                    { backgroundColor: theme.accentLight },
                  ]}
                >
                  <Text
                    style={[
                      styles.measurementNumText,
                      { color: theme.accent, fontFamily: "Outfit_700Bold" },
                    ]}
                  >
                    {rows.length - idx}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.measurementWeight,
                    { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {formatWeight(row.weightKg)} KG
                </Text>
                <Text
                  style={[
                    styles.measurementPcs,
                    { color: theme.warm, fontFamily: "Outfit_500Medium" },
                  ]}
                >
                  {row.pcs} PCS
                </Text>
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
            borderTopColor: theme.borderLight,
          },
        ]}
      >
        <View style={styles.buttonRow}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="arrow-back" size={18} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: theme.accent,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <Feather name="save" size={18} color="#FFF" />
            <Text
              style={[
                styles.saveButtonText,
                { fontFamily: "Outfit_700Bold" },
              ]}
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
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    fontSize: 17,
  },
  summaryCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  summaryTitle: {
    fontSize: 20,
    color: "#FFF",
  },
  summaryDate: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
    marginLeft: 38,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  dataCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dataItem: {
    flex: 1,
    alignItems: "center",
  },
  dataValue: {
    fontSize: 26,
  },
  dataUnit: {
    fontSize: 12,
    marginTop: 4,
  },
  dataDivider: {
    width: 1,
    height: 40,
  },
  pcsCenter: {
    alignItems: "center",
    paddingVertical: 4,
  },
  pcsValue: {
    fontSize: 38,
  },
  pcsLabel: {
    fontSize: 14,
    marginTop: 2,
  },
  measurementItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  measurementNum: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  measurementNumText: {
    fontSize: 13,
  },
  measurementWeight: {
    flex: 1,
    fontSize: 15,
  },
  measurementPcs: {
    fontSize: 13,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 14,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
  },
});
