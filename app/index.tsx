import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Svg, { Rect, Text as SvgText, G } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useUser } from "@clerk/expo";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { loadSales, deleteSale, loadDrafts } from "@/lib/storage";
import { formatWeight, formatDateTime } from "@/lib/utils";
import { getUserProfile, type OnboardingData } from "@/lib/onboarding";
import { loadPlan, type Plan } from "@/lib/subscription";
import type { SaleRecord, DraftSession } from "@/lib/types";

// ─── Analytics helpers ───────────────────────────────────────────────────────

interface DayBar {
  label: string;
  revenue: number;
  weight: number;
}

function buildWeekBars(sales: SaleRecord[]): DayBar[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = todayStart - (6 - i) * 86400000;
    const dayEnd = dayStart + 86400000;
    const daySales = sales.filter((s) => s.createdAt >= dayStart && s.createdAt < dayEnd);
    return {
      label: dayLabels[new Date(dayStart).getDay()],
      revenue: daySales.reduce((sum, s) => sum + (s.deduction?.final_amount ?? 0), 0),
      weight: daySales.reduce((sum, s) => sum + s.totalWeightKg, 0),
    };
  });
}

function getGreeting(t: any): string {
  const h = new Date().getHours();
  if (h < 12) return t.goodMorning;
  if (h < 17) return t.goodAfternoon;
  return t.goodEvening;
}

function fmtTk(n: number): string {
  if (n >= 1_000_000) return `৳${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `৳${(n / 1_000).toFixed(0)}K`;
  return `৳${n.toFixed(0)}`;
}

// ─── Weekly bar chart ─────────────────────────────────────────────────────────

function WeeklyBarChart({ bars, color }: { bars: DayBar[]; color: string }) {
  const W = 280;
  const H = 80;
  const barW = 28;
  const gap = 12;
  const maxVal = Math.max(...bars.map((b) => b.revenue), 1);

  return (
    <Svg width={W} height={H + 20}>
      {bars.map((bar, i) => {
        const barH = Math.max((bar.revenue / maxVal) * H, bar.revenue > 0 ? 4 : 2);
        const x = i * (barW + gap);
        const y = H - barH;
        return (
          <G key={i}>
            <Rect
              x={x} y={y} width={barW} height={barH}
              rx={6} fill={color} opacity={bar.revenue === 0 ? 0.18 : 0.85}
            />
            <SvgText
              x={x + barW / 2} y={H + 16}
              textAnchor="middle" fontSize={10}
              fill={color} opacity={0.55}
              fontFamily="Outfit_500Medium"
            >
              {bar.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Sale card ────────────────────────────────────────────────────────────────

function SaleCard({ sale, index, theme, onDelete, t }: {
  sale: SaleRecord;
  index: number;
  theme: ReturnType<typeof useTheme>;
  onDelete: (id: string) => void;
  t: ReturnType<typeof useSettings>["t"];
}) {
  const { deduction } = sale;

  const handleDelete = () => {
    if (Platform.OS === "web") {
      onDelete(sale.id);
    } else {
      Alert.alert(t.homeDeleteTitle, t.homeDeleteMessage, [
        { text: t.cancel, style: "cancel" },
        { text: t.delete, style: "destructive", onPress: () => onDelete(sale.id) },
      ]);
    }
  };

  return (
    <Animated.View
      entering={Platform.OS !== "web" ? FadeInDown.delay(index * 50).springify() : undefined}
    >
      <Pressable
        onPress={() => router.push({ pathname: "/sale/[id]", params: { id: sale.id } })}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderLight,
            ...(Platform.OS !== "web" ? { shadowColor: theme.cardShadow } : {}),
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardDateRow}>
            <View style={[styles.dateBadge, { backgroundColor: theme.accentLight }]}>
              <Feather name="calendar" size={13} color={theme.accent} />
            </View>
            <Text style={[styles.cardDate, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
              {formatDateTime(sale.createdAt)}
            </Text>
          </View>
          <Pressable
            onPress={handleDelete}
            hitSlop={16}
            style={({ pressed }) => [
              styles.deleteBtn,
              { backgroundColor: theme.dangerLight, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Feather name="trash-2" size={14} color={theme.danger} />
          </Pressable>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: theme.accent, fontFamily: "Outfit_700Bold" }]}>
              {formatWeight(sale.totalWeightKg)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textTertiary, fontFamily: "Outfit_500Medium" }]}>
              {t.grossKg}
            </Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: theme.warm, fontFamily: "Outfit_700Bold" }]}>
              {sale.pcsTracked === false ? "—" : sale.totalPcs}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textTertiary, fontFamily: "Outfit_500Medium" }]}>
              {t.birds}
            </Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
              {deduction ? formatWeight(deduction.net_weight) : formatWeight(sale.averageWeightKg)}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textTertiary, fontFamily: "Outfit_500Medium" }]}>
              {deduction ? t.netKg : t.avgKg}
            </Text>
          </View>
        </View>

        {deduction ? (
          <View style={[styles.deductionStrip, { backgroundColor: theme.accentLight, borderTopColor: theme.borderLight }]}>
            <View style={styles.deductionLeft}>
              <Feather name="minus-circle" size={13} color={theme.accent} />
              <Text style={[styles.deductionLabel, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
                {t.deductionShort}{" "}
                <Text style={{ fontFamily: "Outfit_600SemiBold", color: theme.danger }}>
                  -{formatWeight(deduction.total_deduction_kg)} KG
                </Text>
                {"  "}
                <Text style={{ color: theme.textTertiary }}>
                  ({deduction.total_crates % 1 === 0 ? deduction.total_crates : deduction.total_crates.toFixed(2)} crates)
                </Text>
              </Text>
            </View>
            <Text style={[styles.deductionAmount, { color: theme.accent, fontFamily: "Outfit_700Bold" }]}>
              Tk {deduction.final_amount.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
            </Text>
          </View>
        ) : (
          <View style={[styles.cardBottom, { borderTopColor: theme.borderLight }]}>
            <View style={styles.rowInfo}>
              <Feather name="layers" size={12} color={theme.textTertiary} />
              <Text style={[styles.rowInfoText, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                {t.weighings(sale.rows.length)}
              </Text>
            </View>
            <View style={styles.viewDetailRow}>
              <Text style={[styles.viewDetailText, { color: theme.accent, fontFamily: "Outfit_500Medium" }]}>
                {t.viewDetail}
              </Text>
              <Feather name="chevron-right" size={13} color={theme.accent} />
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Dashboard header ─────────────────────────────────────────────────────────

function DashboardHeader({
  sales,
  profile,
  plan,
  drafts,
  theme,
  t,
  insets,
}: {
  sales: SaleRecord[];
  profile: OnboardingData | null;
  plan: Plan;
  drafts: DraftSession[];
  theme: ReturnType<typeof useTheme>;
  t: any;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const { user } = useUser();
  const isFarmer = profile?.role === "farmer";
  const displayName = profile?.name || user?.firstName || "there";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  const totalSales = sales.length;
  const totalRevenue = sales.reduce((s, r) => s + (r.deduction?.final_amount ?? 0), 0);
  const totalWeightKg = sales.reduce((s, r) => s + r.totalWeightKg, 0);
  const bars = useMemo(() => buildWeekBars(sales), [sales]);
  const hasRevenue = bars.some((b) => b.revenue > 0);

  // Farmer insights
  const avgBatchKg = totalSales > 0 ? totalWeightKg / totalSales : 0;
  const totalCullKg = sales.reduce((s, r) => s + (r.deduction?.cull_weight_kg ?? 0), 0);
  const cullRate = totalWeightKg > 0 ? (totalCullKg / totalWeightKg) * 100 : 0;
  const bestPrice = sales.filter((s) => s.deduction).reduce((m, s) => Math.max(m, s.deduction!.price_per_kg), 0);
  const totalBirds = sales.reduce((s, r) => s + r.totalPcs, 0);

  // Wholesaler insights
  const avgBirds = totalSales > 0 ? Math.round(totalBirds / totalSales) : 0;
  const totalDeductionSavedKg = sales.reduce((s, r) => s + (r.deduction?.total_deduction_kg ?? 0), 0);
  const avgPricePerKg = (() => {
    const ds = sales.filter((s) => s.deduction);
    return ds.length > 0 ? ds.reduce((s, r) => s + r.deduction!.price_per_kg, 0) / ds.length : 0;
  })();

  const farmerStats = [
    { label: t.avgBatchWeight, value: avgBatchKg > 0 ? `${formatWeight(avgBatchKg)} KG` : "—", icon: "weight-kilogram" },
    { label: t.cullRateLabel, value: cullRate > 0 ? `${cullRate.toFixed(1)}%` : "—", icon: "bird" },
    { label: t.bestPriceLabel, value: bestPrice > 0 ? `৳${bestPrice.toFixed(0)}/KG` : "—", icon: "trending-up" },
    { label: t.totalBirdsSold, value: totalBirds > 0 ? totalBirds.toLocaleString() : "—", icon: "counter" },
  ];

  const wholesalerStats = [
    { label: t.avgBirdsPerBatch, value: avgBirds > 0 ? avgBirds.toLocaleString() : "—", icon: "counter" },
    { label: t.deductionSavedKg, value: totalDeductionSavedKg > 0 ? `${formatWeight(totalDeductionSavedKg)} KG` : "—", icon: "arrow-collapse-down" },
    { label: t.avgPurchasePrice, value: avgPricePerKg > 0 ? `৳${avgPricePerKg.toFixed(0)}` : "—", icon: "cash" },
    { label: t.dashTotalSales, value: totalSales > 0 ? totalSales.toString() : "—", icon: "chart-bar" },
  ];

  const insights = isFarmer ? farmerStats : wholesalerStats;

  return (
    <View>
      {/* Greeting header */}
      <LinearGradient
        colors={["#0D1B30", "#1A3458", "#0D1B30"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.greetingGrad, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greetingText, { fontFamily: "Outfit_400Regular" }]}>
              {getGreeting(t)},
            </Text>
            <Text style={[styles.greetingName, { fontFamily: "Outfit_700Bold" }]} numberOfLines={1}>
              {displayName} 👋
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: "rgba(59,130,246,0.25)" }]}>
                <Text style={[styles.badgeText, { fontFamily: "Outfit_600SemiBold" }]}>
                  {isFarmer ? "🌾 " + t.farmerRole : "🏪 " + t.wholesalerRole}
                </Text>
              </View>
              <View style={[styles.planBadge, {
                backgroundColor: plan === "premium" ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.12)",
              }]}>
                <Text style={[styles.planBadgeText, {
                  fontFamily: "Outfit_600SemiBold",
                  color: plan === "premium" ? "#FBBF24" : "rgba(255,255,255,0.7)",
                }]}>
                  {plan === "premium" ? "⚡ " + t.premiumBadge : "◎ " + t.communityBadge}
                </Text>
              </View>
            </View>
          </View>
          {/* Avatar → Profile */}
          <Pressable
            onPress={() => router.push("/profile")}
            style={({ pressed }) => [styles.avatarWrap, { opacity: pressed ? 0.7 : 1 }]}
          >
            <LinearGradient
              colors={["#3B82F6", "#1D4ED8"]}
              style={styles.avatar}
            >
              <Text style={[styles.avatarText, { fontFamily: "Outfit_700Bold" }]}>{initials}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </LinearGradient>

      {/* Draft banner */}
      {drafts.length > 0 && (
        <Pressable
          onPress={() => router.push("/drafts")}
          style={({ pressed }) => [
            styles.draftBanner,
            { backgroundColor: theme.warmLight, borderColor: theme.warm, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.draftBannerLeft}>
            <View style={[styles.draftIcon, { backgroundColor: theme.warm }]}>
              <MaterialCommunityIcons name="progress-clock" size={15} color="#FFF" />
            </View>
            <Text style={[styles.draftText, { color: theme.warm, fontFamily: "Outfit_600SemiBold" }]}>
              {t.homeDraftBanner(drafts.length)}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={theme.warm} />
        </Pressable>
      )}

      {/* Stats row */}
      <View style={styles.statsRow}>
        {[
          { label: t.dashTotalSales, value: totalSales.toString(), color: theme.accent },
          { label: t.dashRevenue, value: fmtTk(totalRevenue), color: theme.success },
          { label: t.dashWeightSold, value: `${formatWeight(totalWeightKg)} KG`, color: theme.warm },
        ].map((s, i) => (
          <View
            key={i}
            style={[styles.statCard, {
              backgroundColor: theme.surface,
              borderColor: theme.borderLight,
              flex: 1,
            }]}
          >
            <Text style={[styles.statCardVal, { color: s.color, fontFamily: "Outfit_700Bold" }]}>
              {s.value}
            </Text>
            <Text style={[styles.statCardLabel, { color: theme.textTertiary, fontFamily: "Outfit_500Medium" }]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Weekly chart */}
      {totalSales > 0 && (
        <View style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" }]}>
              {t.weeklyTrend}
            </Text>
            {hasRevenue && (
              <Text style={[styles.chartSub, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                Revenue (Tk)
              </Text>
            )}
          </View>
          {hasRevenue ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <WeeklyBarChart bars={bars} color={theme.accent} />
            </ScrollView>
          ) : (
            <Text style={[styles.noChartText, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
              {t.noRevenueData}
            </Text>
          )}
        </View>
      )}

      {/* Role insights */}
      {totalSales > 0 && (
        <View>
          <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold", marginHorizontal: 16, marginBottom: 10 }]}>
            {isFarmer ? t.farmerInsights : t.wholesalerInsights}
          </Text>
          <View style={styles.insightsGrid}>
            {insights.map((ins, i) => (
              <View
                key={i}
                style={[styles.insightCard, {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderLight,
                }]}
              >
                <MaterialCommunityIcons name={ins.icon as any} size={18} color={theme.accent} style={{ marginBottom: 6 }} />
                <Text style={[styles.insightVal, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
                  {ins.value}
                </Text>
                <Text style={[styles.insightLabel, { color: theme.textTertiary, fontFamily: "Outfit_500Medium" }]}>
                  {ins.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Sales section header */}
      <View style={styles.salesHeader}>
        <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" }]}>
          {t.allSalesHeader} ({totalSales})
        </Text>
        {totalSales > 0 && (
          <Pressable onPress={() => router.push("/settings")} hitSlop={8}>
            <Ionicons name="settings-outline" size={18} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { user } = useUser();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftSession[]>([]);
  const [profile, setProfile] = useState<OnboardingData | null>(null);
  const [plan, setPlan] = useState<Plan>("community");
  const [loading, setLoading] = useState(true);

  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      const userId = user?.id;
      Promise.all([
        loadSales(),
        loadDrafts(),
        userId ? getUserProfile(userId) : Promise.resolve(null),
        loadPlan(),
      ]).then(([salesData, draftsData, profileData, planData]) => {
        setSales(salesData);
        setDrafts(draftsData);
        setProfile(profileData);
        setPlan(planData);
        setLoading(false);
      });
    }, [user?.id])
  );

  const handleDelete = async (id: string) => {
    await deleteSale(id);
    setSales((prev) => prev.filter((s) => s.id !== id));
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleNewMeasurement = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/measurement");
  };

  if (loading) {
    return <View style={[styles.container, { backgroundColor: theme.background }]} />;
  }

  const emptyBody = (
    <Animated.View
      style={styles.emptyWrap}
      entering={Platform.OS !== "web" ? FadeIn.delay(200) : undefined}
    >
      <View style={[styles.emptyIcon, { backgroundColor: theme.accentLight }]}>
        <MaterialCommunityIcons name="scale" size={44} color={theme.accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: "Outfit_600SemiBold" }]}>
        {t.homeNoSales}
      </Text>
      <Text style={[styles.emptyMsg, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
        {t.homeNoSalesHint}
      </Text>
    </Animated.View>
  );

  const listHeader = (
    <DashboardHeader
      sales={sales}
      profile={profile}
      plan={plan}
      drafts={drafts}
      theme={theme}
      t={t}
      insets={insets}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={sales}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item, index }) => (
          <SaleCard sale={item} index={index} theme={theme} onDelete={handleDelete} t={t} />
        )}
        ListEmptyComponent={emptyBody}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + webBottomInset + 100,
          gap: 0,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <Pressable
        onPress={handleNewMeasurement}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.accent,
            bottom: insets.bottom + webBottomInset + 24,
            transform: [{ scale: pressed ? 0.9 : 1 }],
          },
        ]}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Greeting gradient
  greetingGrad: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 8,
  },
  greetingText: { fontSize: 15, color: "rgba(255,255,255,0.6)", marginBottom: 2 },
  greetingName: { fontSize: 24, color: "#fff" },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, color: "#fff" },
  planBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  planBadgeText: { fontSize: 12 },
  avatarWrap: { marginTop: 4 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, color: "#fff" },

  // Draft banner
  draftBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  draftBannerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  draftIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  draftText: { fontSize: 13, flex: 1 },

  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
  },
  statCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 4,
  },
  statCardVal: { fontSize: 18 },
  statCardLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" },

  // Chart
  chartCard: {
    margin: 16,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chartSub: { fontSize: 11 },
  noChartText: { fontSize: 13, textAlign: "center", paddingVertical: 16 },

  // Insights
  insightsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  insightCard: {
    width: "47.5%",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  insightVal: { fontSize: 18, marginBottom: 2 },
  insightLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },

  // Sales section header
  salesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
  },

  // Section label (shared)
  sectionLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },

  // Empty state
  emptyWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 28,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, marginBottom: 8, textAlign: "center" },
  emptyMsg: { fontSize: 14, textAlign: "center", lineHeight: 21 },

  // Sale card
  card: {
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0px 4px 12px rgba(0,0,0,0.08)" } as object,
      default: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
        elevation: 4,
      },
    }),
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardDateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardDate: { fontSize: 13 },
  deleteBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  cardStats: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 14, gap: 0 },
  statBlock: { flex: 1, alignItems: "center", gap: 2 },
  statSep: { width: 1, marginVertical: 2 },
  statValue: { fontSize: 20 },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  deductionStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  deductionLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  deductionLabel: { fontSize: 12, flex: 1 },
  deductionAmount: { fontSize: 15 },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  rowInfo: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowInfoText: { fontSize: 12 },
  viewDetailRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewDetailText: { fontSize: 12 },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
});
