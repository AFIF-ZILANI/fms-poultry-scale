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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { formatWeight, formatPcs, sumPcs, formatDateTime } from "@/lib/utils";
import { loadSales } from "@/lib/storage";
import type { MeasurementRow, SaleRecord } from "@/lib/types";

export default function SessionLogsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();

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

  const isCull = type === "cull";
  const title = isCull ? t.cullSession : t.mainSession;

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

  const rows: MeasurementRow[] = isCull
    ? (sale.cullRows ?? [])
    : sale.rows;

  const totalKg = rows.reduce((s, r) => s + r.weightKg, 0);
  const totalPcs = sumPcs(rows);

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

        <View style={styles.titleRow}>
          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: isCull ? theme.warmLight : theme.accentLight,
              },
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                {
                  color: isCull ? theme.warm : theme.accent,
                  fontFamily: "Outfit_700Bold",
                },
              ]}
            >
              {isCull ? "CULL" : "MAIN"}
            </Text>
          </View>
          <Text
            style={[
              styles.topBarTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {title}
          </Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + webBottomInset + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.summaryCard, { backgroundColor: theme.timerBg }]}
        >
          <View style={styles.summaryStats}>
            <View style={styles.summaryStatItem}>
              <Text
                style={[styles.summaryStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {formatWeight(totalKg)}
              </Text>
              <Text
                style={[
                  styles.summaryStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.grossKg}
              </Text>
            </View>
            <View style={styles.summaryDot} />
            <View style={styles.summaryStatItem}>
              <Text
                style={[styles.summaryStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {totalPcs}
              </Text>
              <Text
                style={[
                  styles.summaryStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.birds}
              </Text>
            </View>
            <View style={styles.summaryDot} />
            <View style={styles.summaryStatItem}>
              <Text
                style={[styles.summaryStatVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {rows.length}
              </Text>
              <Text
                style={[
                  styles.summaryStatUnit,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.weighings(rows.length)}
              </Text>
            </View>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="food-turkey"
              size={36}
              color={theme.textTertiary}
            />
            <Text
              style={[
                styles.emptyText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {t.noLogsFound}
            </Text>
          </View>
        ) : (
          <>
            <Text
              style={[
                styles.sectionLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {t.weighingLog(rows.length)}
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
              {rows.map((row, idx) => {
                const rowNum = rows.length - idx;
                return (
                  <Animated.View
                    key={row.id}
                    entering={
                      Platform.OS !== "web"
                        ? FadeInDown.delay(idx * 40).springify()
                        : undefined
                    }
                  >
                    <View
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
                          {
                            backgroundColor: isCull
                              ? theme.warmLight
                              : theme.accentLight,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.logNumText,
                            {
                              color: isCull ? theme.warm : theme.accent,
                              fontFamily: "Outfit_700Bold",
                            },
                          ]}
                        >
                          {rowNum}
                        </Text>
                      </View>

                      <View style={styles.logInfo}>
                        <Text
                          style={[
                            styles.logWeight,
                            {
                              color: theme.text,
                              fontFamily: "Outfit_600SemiBold",
                            },
                          ]}
                        >
                          {formatWeight(row.weightKg)} KG
                        </Text>
                        <Text
                          style={[
                            styles.logTime,
                            {
                              color: theme.textTertiary,
                              fontFamily: "Outfit_400Regular",
                            },
                          ]}
                        >
                          {formatDateTime(row.timestamp)}
                        </Text>
                      </View>

                      <View style={styles.logPcsCol}>
                        <MaterialCommunityIcons
                          name="food-turkey"
                          size={14}
                          color={theme.warm}
                        />
                        <Text
                          style={[
                            styles.logPcsText,
                            {
                              color: theme.warm,
                              fontFamily: "Outfit_600SemiBold",
                            },
                          ]}
                        >
                          {formatPcs(row.pcs, t.unknown)}
                        </Text>
                      </View>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: { fontSize: 11, letterSpacing: 0.5 },
  topBarTitle: { fontSize: 16 },
  summaryCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
  },
  summaryStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  summaryStatItem: { alignItems: "center" },
  summaryStatVal: { fontSize: 22, color: "#FFF" },
  summaryStatUnit: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  summaryDot: {
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
  logCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  logItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    gap: 12,
  },
  logNum: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logNumText: { fontSize: 13 },
  logInfo: { flex: 1 },
  logWeight: { fontSize: 15 },
  logTime: { fontSize: 11, marginTop: 2 },
  logPcsCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  logPcsText: { fontSize: 14 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 14, textAlign: "center" },
});
