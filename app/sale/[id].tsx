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
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { formatWeight, formatDateTime, formatGrams } from "@/lib/utils";
import { loadSales, updateSale } from "@/lib/storage";
import { EditRowModal } from "@/components/EditRowModal";
import type { MeasurementRow, SaleRecord } from "@/lib/types";

export default function SaleDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<MeasurementRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSales().then((sales) => {
        const found = sales.find((s) => s.id === id) ?? null;
        setSale(found);
        setLoading(false);
      });
    }, [id])
  );

  const getRowNumber = (rowId: string) => {
    if (!sale) return 1;
    const idx = sale.rows.findIndex((r) => r.id === rowId);
    return sale.rows.length - idx;
  };

  const handleEditSave = async (updatedRow: MeasurementRow) => {
    if (!sale) return;
    const updatedRows = sale.rows.map((r) =>
      r.id === updatedRow.id ? updatedRow : r
    );
    await updateSale(sale.id, updatedRows);

    const totalWeightKg = updatedRows.reduce((s, r) => s + r.weightKg, 0);
    const totalPcs = updatedRows.reduce((s, r) => s + r.pcs, 0);
    const avgWeightKg = totalPcs > 0 ? totalWeightKg / totalPcs : 0;

    setSale({
      ...sale,
      rows: updatedRows,
      totalWeightKg,
      totalWeightGrams: Math.round(totalWeightKg * 1000),
      totalPcs,
      averageWeightKg: avgWeightKg,
      averageWeightGrams: Math.round(avgWeightKg * 1000),
    });
    setEditingRow(null);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleViewHistory = (row: MeasurementRow) => {
    setEditingRow(null);
    router.push({
      pathname: "/row-history",
      params: {
        rowNumber: String(getRowNumber(row.id)),
        history: JSON.stringify(row.editHistory ?? []),
        currentWeightKg: String(row.weightKg),
        currentPcs: String(row.pcs),
      },
    });
  };

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
          Sale not found
        </Text>
      </View>
    );
  }

  const { dholta } = sale;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <EditRowModal
        visible={editingRow !== null}
        row={editingRow}
        rowNumber={editingRow ? getRowNumber(editingRow.id) : 1}
        onClose={() => setEditingRow(null)}
        onSave={handleEditSave}
        onViewHistory={handleViewHistory}
      />

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
          Sale Detail
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
                Gross KG
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
                Birds
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
                Avg KG
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
              TRADE DEDUCTION (DHOLTA)
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
                label="Gross Weight"
                value={`${formatWeight(dholta.gross_weight)} KG`}
                theme={theme}
              />
              <DholtaRow
                label="KG per Crate"
                value={`${dholta.kg_per_crate} KG`}
                theme={theme}
              />
              <DholtaRow
                label="Dholta per Crate"
                value={`${dholta.deduction_per_crate_g} g`}
                theme={theme}
              />
              <DholtaRow
                label={`Total Crates${dholta.full_crates_only ? " (full)" : ""}`}
                value={
                  dholta.total_crates % 1 === 0
                    ? `${dholta.total_crates}`
                    : `${dholta.total_crates.toFixed(3)}`
                }
                theme={theme}
              />
              <DholtaRow
                label="Total Deduction"
                value={`-${formatWeight(dholta.total_deduction_kg)} KG`}
                theme={theme}
                isNegative
              />
              <DholtaRow
                label="Net Weight"
                value={`${formatWeight(dholta.net_weight)} KG`}
                theme={theme}
                isHighlight
              />
              <DholtaRow
                label="Price per KG"
                value={`₨ ${dholta.price_per_kg.toFixed(2)}`}
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
                  Final Amount
                </Text>
                <Text
                  style={[
                    styles.finalValue,
                    { color: theme.accent, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  ₨{" "}
                  {dholta.final_amount.toLocaleString("en-PK", {
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
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
            WEIGHING LOG ({sale.rows.length})
          </Text>

          <View
            style={[
              styles.logCard,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            {sale.rows.map((row, idx) => {
              const rowNum = sale.rows.length - idx;
              const lastEdit = row.editHistory?.[0];
              return (
                <View
                  key={row.id}
                  style={[
                    styles.logItem,
                    idx < sale.rows.length - 1 && {
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
                      {rowNum}
                    </Text>
                  </View>

                  <View style={styles.logInfo}>
                    <Text
                      style={[
                        styles.logWeight,
                        { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                      ]}
                    >
                      {formatWeight(row.weightKg)} KG
                    </Text>
                    {lastEdit && (
                      <Text
                        style={[
                          styles.logEdited,
                          {
                            color: theme.accent,
                            fontFamily: "Outfit_400Regular",
                          },
                        ]}
                      >
                        edited · {(row.editHistory?.length ?? 0)} change
                        {(row.editHistory?.length ?? 0) !== 1 ? "s" : ""}
                      </Text>
                    )}
                  </View>

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

                  <Pressable
                    onPress={() => setEditingRow(row)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.editBtn,
                      {
                        backgroundColor: theme.accentLight,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}
                    testID={`edit-row-${rowNum}`}
                  >
                    <Feather name="edit-2" size={13} color={theme.accent} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </View>
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
  finalLabel: { fontSize: 14 },
  finalValue: { fontSize: 20 },
  logCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  logItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  logNum: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logNumText: { fontSize: 13 },
  logInfo: { flex: 1 },
  logWeight: { fontSize: 15 },
  logEdited: { fontSize: 11, marginTop: 1 },
  logPcs: { flexDirection: "row", alignItems: "center", gap: 4 },
  logPcsText: { fontSize: 13 },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
});
