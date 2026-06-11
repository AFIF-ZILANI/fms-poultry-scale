import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { formatWeight, formatDateTime } from "@/lib/utils";
import { loadSales } from "@/lib/storage";
import type { SaleRecord } from "@/lib/types";

export default function SaleDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadSales().then((sales) => {
        const found = sales.find((s) => s.id === id) ?? null;
        setSale(found);
        setLoading(false);
      });
    }, [id])
  );

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: theme.background },
        ]}
      >
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!sale) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: theme.background },
        ]}
      >
        <Text
          style={[
            styles.notFound,
            { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
          ]}
        >
          {t.saleNotFound}
        </Text>
      </View>
    );
  }

  const { dholta } = sale;
  const hasCull = (sale.cullRows?.length ?? 0) > 0;
  const cullTotalKg = hasCull
    ? (sale.cullRows ?? []).reduce((s, r) => s + r.weightKg, 0)
    : 0;
  const cullTotalPcs = hasCull
    ? (sale.cullRows ?? []).reduce((s, r) => s + r.pcs, 0)
    : 0;

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
            { color: theme.text, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          {t.saleDetail}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + webBottomInset + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={Platform.OS !== "web" ? FadeIn.delay(80) : undefined}
          style={[styles.heroCard, { backgroundColor: theme.timerBg }]}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroCheck}>
              <Feather name="calendar" size={18} color="rgba(255,255,255,0.7)" />
            </View>
            <Text
              style={[styles.heroTitle, { fontFamily: "Outfit_700Bold" }]}
            >
              {formatDateTime(sale.createdAt)}
            </Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStatItem}>
              <Text
                style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {formatWeight(sale.totalWeightKg)}
              </Text>
              <Text
                style={[
                  styles.heroStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.grossKg}
              </Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroStatItem}>
              <Text
                style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {sale.totalPcs}
              </Text>
              <Text
                style={[
                  styles.heroStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.birds}
              </Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroStatItem}>
              <Text
                style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {formatWeight(sale.averageWeightKg)}
              </Text>
              <Text
                style={[
                  styles.heroStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.avgKg}
              </Text>
            </View>
          </View>
        </Animated.View>

        {dholta && (
          <Animated.View
            entering={
              Platform.OS !== "web"
                ? FadeInDown.delay(120).springify()
                : undefined
            }
          >
            <Text
              style={[
                styles.sectionLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {t.tradeDeductionDholta}
            </Text>
            <View
              style={[
                styles.dholtaCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderLight,
                },
              ]}
            >
              <DholtaRow
                label={t.grossWeight}
                value={`${formatWeight(dholta.gross_weight)} KG`}
                theme={theme}
              />
              <DholtaRow
                label={t.kgPerCrate}
                value={`${dholta.kg_per_crate} KG`}
                theme={theme}
              />
              <DholtaRow
                label={t.deductionPerCrate}
                value={`${dholta.deduction_per_crate_g} g`}
                theme={theme}
              />
              <DholtaRow
                label={dholta.full_crates_only ? t.totalCratesFull : t.totalCrates}
                value={
                  dholta.total_crates % 1 === 0
                    ? `${dholta.total_crates}`
                    : `${dholta.total_crates.toFixed(3)}`
                }
                theme={theme}
              />
              <DholtaRow
                label={t.totalDeduction}
                value={`-${formatWeight(dholta.total_deduction_kg)} KG`}
                theme={theme}
                isNegative
              />
              {dholta.cull_weight_kg > 0 && (
                <DholtaRow
                  label={t.cullWeight}
                  value={`-${formatWeight(dholta.cull_weight_kg)} KG`}
                  theme={theme}
                  isNegative
                />
              )}
              <DholtaRow
                label={dholta.cull_weight_kg > 0 ? t.payableWeight : t.netWeight}
                value={`${formatWeight(dholta.net_weight)} KG`}
                theme={theme}
                isHighlight
              />
              <DholtaRow
                label={t.pricePerKg}
                value={`Tk ${dholta.price_per_kg.toFixed(2)}`}
                theme={theme}
              />
              <View
                style={[
                  styles.finalRow,
                  { backgroundColor: theme.accentLight },
                ]}
              >
                <Text
                  style={[
                    styles.finalLabel,
                    { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {t.finalAmount}
                </Text>
                <Text
                  style={[
                    styles.finalValue,
                    { color: theme.accent, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  Tk{" "}
                  {dholta.final_amount.toLocaleString("en-PK", {
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
              {sale.receivedAmount != null && sale.receivedAmount > 0 && (
                <View
                  style={[
                    styles.receivedRow,
                    { backgroundColor: theme.successLight },
                  ]}
                >
                  <Text
                    style={[
                      styles.finalLabel,
                      { color: theme.success, fontFamily: "Outfit_600SemiBold" },
                    ]}
                  >
                    {t.receivedAmount}
                  </Text>
                  <Text
                    style={[
                      styles.finalValue,
                      { color: theme.success, fontFamily: "Outfit_700Bold" },
                    ]}
                  >
                    Tk{" "}
                    {sale.receivedAmount.toLocaleString("en-PK", {
                      maximumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        <Animated.View
          entering={
            Platform.OS !== "web"
              ? FadeInDown.delay(dholta ? 200 : 140).springify()
              : undefined
          }
        >
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {t.weighingLogs}
          </Text>

          <View
            style={[
              styles.logCard,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            <LogEntryRow
              label={t.mainSession}
              totalKg={sale.totalWeightKg}
              totalPcs={sale.totalPcs}
              rowCount={sale.rows.length}
              isCull={false}
              theme={theme}
              t={t}
              onPress={() => router.push(`/sale/${id}/logs/main`)}
            />
            {hasCull && (
              <>
                <View
                  style={[
                    styles.logDivider,
                    { backgroundColor: theme.borderLight },
                  ]}
                />
                <LogEntryRow
                  label={t.cullSession}
                  totalKg={cullTotalKg}
                  totalPcs={cullTotalPcs}
                  rowCount={sale.cullRows!.length}
                  isCull
                  theme={theme}
                  t={t}
                  onPress={() => router.push(`/sale/${id}/logs/cull`)}
                />
              </>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function LogEntryRow({
  label,
  totalKg,
  totalPcs,
  rowCount,
  isCull,
  theme,
  t,
  onPress,
}: {
  label: string;
  totalKg: number;
  totalPcs: number;
  rowCount: number;
  isCull: boolean;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useSettings>["t"];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.logEntry,
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <View
        style={[
          styles.logEntryIcon,
          {
            backgroundColor: isCull ? theme.warmLight : theme.accentLight,
          },
        ]}
      >
        <MaterialCommunityIcons
          name="bird"
          size={18}
          color={isCull ? theme.warm : theme.accent}
        />
      </View>

      <View style={styles.logEntryInfo}>
        <Text
          style={[
            styles.logEntryLabel,
            { color: theme.text, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.logEntrySub,
            { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
          ]}
        >
          {t.sessionRows(rowCount)}
        </Text>
      </View>

      <View style={styles.logEntryRight}>
        <Text
          style={[
            styles.logEntryKg,
            { color: theme.text, fontFamily: "Outfit_700Bold" },
          ]}
        >
          {formatWeight(totalKg)} KG
        </Text>
        <View style={styles.logEntryPcsRow}>
          <MaterialCommunityIcons
            name="bird"
            size={11}
            color={theme.warm}
          />
          <Text
            style={[
              styles.logEntryPcs,
              { color: theme.warm, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {totalPcs}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    </Pressable>
  );
}

function DholtaRow({
  label,
  value,
  theme,
  isNegative,
  isHighlight,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  isNegative?: boolean;
  isHighlight?: boolean;
}) {
  const valueColor = isNegative
    ? theme.danger
    : isHighlight
    ? theme.success
    : theme.text;
  return (
    <View style={styles.dholtaRow}>
      <Text
        style={[
          styles.dholtaRowLabel,
          { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.dholtaRowValue,
          { color: valueColor, fontFamily: "Outfit_600SemiBold" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16 },
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
  heroCard: { borderRadius: 22, padding: 20, marginBottom: 20 },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  heroCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  heroStatItem: { alignItems: "center" },
  heroStatVal: { fontSize: 22, color: "#FFF" },
  heroStatUnit: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  heroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 2,
    textTransform: "uppercase",
  },
  dholtaCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    gap: 2,
  },
  dholtaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  dholtaRowLabel: { fontSize: 14 },
  dholtaRowValue: { fontSize: 15 },
  finalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
  },
  receivedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
  },
  finalLabel: { fontSize: 14 },
  finalValue: { fontSize: 20 },
  logCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  logDivider: { height: 1 },
  logEntry: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  logEntryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logEntryInfo: { flex: 1 },
  logEntryLabel: { fontSize: 15 },
  logEntrySub: { fontSize: 12, marginTop: 2 },
  logEntryRight: { alignItems: "flex-end", gap: 3 },
  logEntryKg: { fontSize: 15 },
  logEntryPcsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  logEntryPcs: { fontSize: 12 },
});
