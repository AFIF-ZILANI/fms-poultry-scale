import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Alert,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Svg, {
  Rect,
  Text as SvgText,
  G,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useUser } from "@clerk/expo";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { loadSales, deleteSale, loadDrafts } from "@/lib/storage";
import { formatWeight, formatDateTime } from "@/lib/utils";
import { getUserProfile, type OnboardingData } from "@/lib/onboarding";
import { loadPlan, type Plan } from "@/lib/subscription";
import type { SaleRecord, DraftSession } from "@/lib/types";

const SCREEN_W = Dimensions.get("window").width;

// ─── Chart helpers ────────────────────────────────────────────────────────────

type ChartPeriod = "7d" | "4w" | "6m";

interface Bar {
  label: string;
  revenue: number;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function buildBars(sales: SaleRecord[], period: ChartPeriod): Bar[] {
  const now = new Date();

  if (period === "7d") {
    const todayMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return Array.from({ length: 7 }, (_, i) => {
      const start = todayMs - (6 - i) * 86_400_000;
      const end = start + 86_400_000;
      const rev = sales
        .filter((s) => s.createdAt >= start && s.createdAt < end)
        .reduce((sum, s) => sum + (s.deduction?.final_amount ?? 0), 0);
      return { label: DAY_LABELS[new Date(start).getDay()], revenue: rev };
    });
  }

  if (period === "4w") {
    const todayMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    return Array.from({ length: 4 }, (_, i) => {
      const start = todayMs - (3 - i) * 7 * 86_400_000;
      const end = start + 7 * 86_400_000;
      const rev = sales
        .filter((s) => s.createdAt >= start && s.createdAt < end)
        .reduce((sum, s) => sum + (s.deduction?.final_amount ?? 0), 0);
      const d = new Date(start);
      return { label: `${d.getDate()}/${d.getMonth() + 1}`, revenue: rev };
    });
  }

  // 6m — one bar per month
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const rev = sales
      .filter((s) => s.createdAt >= start && s.createdAt < end)
      .reduce((sum, s) => sum + (s.deduction?.final_amount ?? 0), 0);
    return { label: MONTH_SHORT[d.getMonth()], revenue: rev };
  });
}

function fmtTk(n: number): string {
  if (n >= 1_000_000) return `৳${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `৳${(n / 1_000).toFixed(0)}K`;
  return n > 0 ? `৳${n.toFixed(0)}` : "৳0";
}

function getGreeting(t: any): string {
  const h = new Date().getHours();
  if (h < 12) return t.goodMorning;
  if (h < 17) return t.goodAfternoon;
  return t.goodEvening;
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function RevenueChart({ bars }: { bars: Bar[] }) {
  const count = bars.length;
  const W = SCREEN_W - 96;
  const H = 72;
  const SLOT = W / count;
  const BAR_W = Math.max(Math.floor(SLOT * 0.52), 8);
  const GAP = SLOT - BAR_W;
  const maxVal = Math.max(...bars.map((b) => b.revenue), 1);
  const peakIdx = bars.reduce(
    (mi, b, i) => (b.revenue > bars[mi].revenue ? i : mi),
    0,
  );
  const lastIdx = count - 1;

  return (
    <Svg width={W} height={H + 22}>
      <Defs>
        <SvgGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6FA3FF" stopOpacity="1" />
          <Stop offset="1" stopColor="#4080FF" stopOpacity="0.7" />
        </SvgGradient>
        <SvgGradient id="emptyGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.12" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.04" />
        </SvgGradient>
      </Defs>
      {bars.map((bar, i) => {
        const hasRev = bar.revenue > 0;
        const barH = hasRev ? Math.max((bar.revenue / maxVal) * H, 6) : 3;
        const x = i * SLOT + GAP / 2;
        const y = H - barH;
        const isLast = i === lastIdx;
        const isPeak = i === peakIdx && hasRev;
        return (
          <G key={i}>
            <Rect
              x={x}
              y={y}
              width={BAR_W}
              height={barH}
              rx={5}
              fill={hasRev ? "url(#barGrad)" : "url(#emptyGrad)"}
              opacity={isLast ? 1 : hasRev ? 0.82 : 1}
            />
            {isPeak && (
              <SvgText
                x={x + BAR_W / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={9}
                fill="#6FA3FF"
                fontFamily="Outfit_600SemiBold"
              >
                {fmtTk(bar.revenue)}
              </SvgText>
            )}
            <SvgText
              x={x + BAR_W / 2}
              y={H + 16}
              textAnchor="middle"
              fontSize={9.5}
              fill={isLast ? "#fff" : "rgba(255,255,255,0.4)"}
              fontFamily={isLast ? "Outfit_700Bold" : "Outfit_400Regular"}
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

function SaleCard({
  sale,
  index,
  theme,
  onDelete,
  t,
}: {
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
      return;
    }
    Alert.alert(t.homeDeleteTitle, t.homeDeleteMessage, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.delete,
        style: "destructive",
        onPress: () => onDelete(sale.id),
      },
    ]);
  };

  return (
    <Animated.View
      entering={
        Platform.OS !== "web"
          ? FadeInDown.delay(index * 40).springify()
          : undefined
      }
    >
      <Pressable
        onPress={() =>
          router.push({ pathname: "/sale/[id]", params: { id: sale.id } })
        }
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderLight,
            opacity: pressed ? 0.94 : 1,
            ...(Platform.OS !== "web" ? { shadowColor: theme.cardShadow } : {}),
          },
        ]}
      >
        <View style={styles.cardHead}>
          <View style={styles.cardDateRow}>
            <View
              style={[styles.calIcon, { backgroundColor: theme.accentLight }]}
            >
              <Feather name="calendar" size={12} color={theme.accent} />
            </View>
            <Text
              style={[
                styles.cardDate,
                { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {formatDateTime(sale.createdAt)}
            </Text>
          </View>
          <Pressable onPress={handleDelete} hitSlop={14}>
            <Feather name="trash-2" size={13} color={theme.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.cardStats}>
          <StatCell
            value={`${formatWeight(sale.totalWeightKg)} KG`}
            label={t.grossKg}
            color={theme.accent}
            theme={theme}
          />
          <View
            style={[styles.statDivider, { backgroundColor: theme.borderLight }]}
          />
          <StatCell
            value={sale.pcsTracked === false ? "—" : String(sale.totalPcs)}
            label={t.birds}
            color={theme.warm}
            theme={theme}
          />
          <View
            style={[styles.statDivider, { backgroundColor: theme.borderLight }]}
          />
          <StatCell
            value={
              deduction
                ? `${formatWeight(deduction.net_weight)} KG`
                : `${formatWeight(sale.averageWeightKg)} KG`
            }
            label={deduction ? t.netKg : t.avgKg}
            color={theme.text}
            theme={theme}
          />
        </View>

        {deduction ? (
          <View
            style={[
              styles.cardFooter,
              {
                backgroundColor: theme.accentLight,
                borderTopColor: theme.borderLight,
              },
            ]}
          >
            <Text
              style={[
                styles.footerMeta,
                { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              <Text
                style={{
                  color: theme.danger,
                  fontFamily: "Outfit_600SemiBold",
                }}
              >
                −{formatWeight(deduction.total_deduction_kg)} KG
              </Text>
              {"  deduction"}
            </Text>
            <Text
              style={[
                styles.footerAmount,
                { color: theme.accent, fontFamily: "Outfit_700Bold" },
              ]}
            >
              Tk{" "}
              {deduction.final_amount.toLocaleString("en-PK", {
                maximumFractionDigits: 0,
              })}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.cardFooter,
              {
                backgroundColor: "transparent",
                borderTopColor: theme.borderLight,
              },
            ]}
          >
            <Text
              style={[
                styles.footerMeta,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {t.weighings(sale.rows.length)}
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
            >
              <Text
                style={[
                  {
                    color: theme.accent,
                    fontSize: 12,
                    fontFamily: "Outfit_500Medium",
                  },
                ]}
              >
                {t.viewDetail}
              </Text>
              <Feather name="chevron-right" size={12} color={theme.accent} />
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function StatCell({
  value,
  label,
  color,
  theme,
}: {
  value: string;
  label: string;
  color: string;
  theme: any;
}) {
  return (
    <View style={styles.statCell}>
      <Text
        style={[styles.statCellVal, { color, fontFamily: "Outfit_700Bold" }]}
      >
        {value}
      </Text>
      <Text
        style={[
          styles.statCellLabel,
          { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Period toggle ─────────────────────────────────────────────────────────────

function PeriodToggle({
  options,
  active,
  onSelect,
}: {
  options: { label: string; value: ChartPeriod }[];
  active: ChartPeriod;
  onSelect: (v: ChartPeriod) => void;
}) {
  return (
    <View
      style={[styles.toggleRow, { backgroundColor: "rgba(255,255,255,0.08)" }]}
    >
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onSelect(opt.value)}
          style={[
            styles.toggleBtn,
            active === opt.value && {
              backgroundColor: "rgba(255,255,255,0.18)",
            },
          ]}
        >
          <Text
            style={[
              styles.toggleBtnText,
              {
                color: active === opt.value ? "#fff" : "rgba(255,255,255,0.45)",
                fontFamily:
                  active === opt.value ? "Outfit_700Bold" : "Outfit_400Regular",
              },
            ]}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
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
  period,
  onPeriodChange,
}: {
  sales: SaleRecord[];
  profile: OnboardingData | null;
  plan: Plan;
  drafts: DraftSession[];
  theme: ReturnType<typeof useTheme>;
  t: any;
  insets: ReturnType<typeof useSafeAreaInsets>;
  period: ChartPeriod;
  onPeriodChange: (p: ChartPeriod) => void;
}) {
  const { user } = useUser();
  const isFarmer = profile?.role === "farmer";
  const displayName =
    (profile?.name || user?.firstName || "").split(" ")[0] || "there";
  const initials = (profile?.name || user?.firstName || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const totalSales = sales.length;
  const totalRevenue = useMemo(
    () => sales.reduce((s, r) => s + (r.deduction?.final_amount ?? 0), 0),
    [sales],
  );
  const totalWeightKg = useMemo(
    () => sales.reduce((s, r) => s + r.totalWeightKg, 0),
    [sales],
  );
  const bars = useMemo(() => buildBars(sales, period), [sales, period]);
  const hasRevenue = bars.some((b) => b.revenue > 0);
  const isPremium = plan === "premium";
  const totalBirds = useMemo(
    () => sales.reduce((s, r) => s + r.totalPcs, 0),
    [sales],
  );
  const bestPrice = useMemo(
    () =>
      sales
        .filter((s) => s.deduction)
        .reduce((m, s) => Math.max(m, s.deduction!.price_per_kg), 0),
    [sales],
  );

  // Analytics
  const avgBatchKg = totalSales > 0 ? totalWeightKg / totalSales : 0;
  const totalCullKg = sales.reduce(
    (s, r) => s + (r.deduction?.cull_weight_kg ?? 0),
    0,
  );
  const cullRate = totalWeightKg > 0 ? (totalCullKg / totalWeightKg) * 100 : 0;
  const avgBirds = totalSales > 0 ? Math.round(totalBirds / totalSales) : 0;
  const totalDeductionKg = sales.reduce(
    (s, r) => s + (r.deduction?.total_deduction_kg ?? 0),
    0,
  );
  const ds = sales.filter((s) => s.deduction);
  const avgPriceKg =
    ds.length > 0
      ? ds.reduce((s, r) => s + r.deduction!.price_per_kg, 0) / ds.length
      : 0;

  const insights = isFarmer
    ? [
        {
          icon: "scale",
          label: t.avgBatchWeight,
          value: avgBatchKg > 0 ? `${formatWeight(avgBatchKg)} KG` : "—",
        },
        {
          icon: "bird",
          label: t.totalBirdsSold,
          value: totalBirds > 0 ? totalBirds.toLocaleString() : "—",
        },
        {
          icon: "trending-up",
          label: t.bestPriceLabel,
          value: bestPrice > 0 ? `৳${bestPrice.toFixed(0)}/KG` : "—",
        },
        {
          icon: "percent",
          label: t.cullRateLabel,
          value: cullRate > 0 ? `${cullRate.toFixed(1)}%` : "—",
        },
      ]
    : [
        {
          icon: "counter",
          label: t.avgBirdsPerBatch,
          value: avgBirds > 0 ? avgBirds.toLocaleString() : "—",
        },
        {
          icon: "cash",
          label: t.avgPurchasePrice,
          value: avgPriceKg > 0 ? `৳${avgPriceKg.toFixed(0)}/KG` : "—",
        },
        {
          icon: "arrow-collapse-down",
          label: t.deductionSavedKg,
          value:
            totalDeductionKg > 0 ? `${formatWeight(totalDeductionKg)} KG` : "—",
        },
        {
          icon: "chart-bar",
          label: t.dashTotalSales,
          value: totalSales > 0 ? String(totalSales) : "—",
        },
      ];

  const wholesalerPeriods: { label: string; value: ChartPeriod }[] = [
    { label: "7D", value: "7d" },
    { label: "4W", value: "4w" },
  ];

  const chartPeriodLabel = isFarmer
    ? "Last 6 Months"
    : period === "7d"
      ? "Last 7 Days"
      : "Last 4 Weeks";

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View>
      {/* ── Top bar ── */}
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
        <View style={styles.topBarLeft}>
          <View
            style={[styles.logoMark, { backgroundColor: theme.accentLight }]}
          >
            <MaterialCommunityIcons
              name="scale-balance"
              size={18}
              color={theme.accent}
            />
          </View>
          <View>
            <Text
              style={[
                styles.appNameText,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              PoultryScale
            </Text>
            <View
              style={[
                styles.rolePill,
                {
                  backgroundColor: isFarmer
                    ? theme.accentLight
                    : theme.warmLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.rolePillText,
                  {
                    color: isFarmer ? theme.accent : theme.warm,
                    fontFamily: "Outfit_600SemiBold",
                  },
                ]}
              >
                {isFarmer ? t.farmerRole : t.wholesalerRole}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/profile")}
          style={({ pressed }) => [
            { opacity: pressed ? 0.7 : 1, position: "relative" },
          ]}
        >
          <LinearGradient
            colors={["#4080FF", "#2060D0"]}
            style={styles.avatarGrad}
          >
            <Text
              style={[styles.avatarInitials, { fontFamily: "Outfit_700Bold" }]}
            >
              {initials}
            </Text>
          </LinearGradient>
          {isPremium && <View style={styles.premiumDot} />}
        </Pressable>
      </View>

      {/* ── Greeting ── */}
      <View style={styles.greetingRow}>
        <Text
          style={[
            styles.greetSub,
            { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
          ]}
        >
          {getGreeting(t)}
        </Text>
        <Text
          style={[
            styles.greetName,
            { color: theme.text, fontFamily: "Outfit_700Bold" },
          ]}
        >
          {displayName} 👋
        </Text>
      </View>

      {/* ── Draft banner ── */}
      {drafts.length > 0 && (
        <Pressable
          onPress={() => router.push("/drafts")}
          style={({ pressed }) => [
            styles.draftBanner,
            {
              backgroundColor: theme.warmLight,
              borderColor: theme.warm,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="progress-clock"
            size={16}
            color={theme.warm}
          />
          <Text
            style={[
              styles.draftText,
              { color: theme.warm, fontFamily: "Outfit_600SemiBold", flex: 1 },
            ]}
          >
            {t.homeDraftBanner(drafts.length)}
          </Text>
          <Feather name="chevron-right" size={15} color={theme.warm} />
        </Pressable>
      )}

      {/* ── Revenue hero card ── */}
      <View style={styles.heroCard}>
        <LinearGradient
          colors={["#101013", "#18181E", "#101013"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCardInner}
        >
          <View style={styles.heroCardTop}>
            <View>
              <Text
                style={[
                  styles.heroCardLabel,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.dashRevenue}
              </Text>
              <Text
                style={[
                  styles.heroCardAmount,
                  { fontFamily: "Outfit_700Bold" },
                ]}
              >
                {fmtTk(totalRevenue)}
              </Text>
            </View>
            <View
              style={[
                styles.salesCountPill,
                { backgroundColor: "rgba(255,255,255,0.1)" },
              ]}
            >
              <MaterialCommunityIcons
                name="receipt"
                size={13}
                color="rgba(255,255,255,0.6)"
              />
              <Text
                style={[
                  styles.salesCountText,
                  { fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {totalSales} {totalSales === 1 ? "sale" : "sales"}
              </Text>
            </View>
          </View>

          {/* Period label + toggle */}
          <View style={styles.periodRow}>
            <Text
              style={[styles.periodLabel, { fontFamily: "Outfit_400Regular" }]}
            >
              {chartPeriodLabel}
            </Text>
            {!isFarmer && (
              <PeriodToggle
                options={wholesalerPeriods}
                active={period}
                onSelect={onPeriodChange}
              />
            )}
          </View>

          {/* Chart */}
          <View style={styles.chartArea}>
            {hasRevenue ? (
              <RevenueChart bars={bars} />
            ) : (
              <View style={styles.noChartWrap}>
                <Text
                  style={[
                    styles.noChartText,
                    { fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  {t.noRevenueData}
                </Text>
              </View>
            )}
          </View>

          {/* Bottom chips */}
          <View style={styles.heroChips}>
            <View
              style={[
                styles.heroChip,
                { backgroundColor: "rgba(255,255,255,0.08)" },
              ]}
            >
              <Text
                style={[styles.heroChipVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {formatWeight(totalWeightKg)} KG
              </Text>
              <Text
                style={[
                  styles.heroChipLabel,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.dashWeightSold}
              </Text>
            </View>
            <View
              style={[
                styles.heroChip,
                { backgroundColor: "rgba(255,255,255,0.08)" },
              ]}
            >
              <Text
                style={[styles.heroChipVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {totalBirds > 0 ? totalBirds.toLocaleString() : "—"}
              </Text>
              <Text
                style={[
                  styles.heroChipLabel,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.totalBirdsSold}
              </Text>
            </View>
            <View
              style={[
                styles.heroChip,
                { backgroundColor: "rgba(255,255,255,0.08)" },
              ]}
            >
              <Text
                style={[styles.heroChipVal, { fontFamily: "Outfit_700Bold" }]}
              >
                {bestPrice > 0 ? `৳${bestPrice.toFixed(0)}` : "—"}
              </Text>
              <Text
                style={[
                  styles.heroChipLabel,
                  { fontFamily: "Outfit_400Regular" },
                ]}
              >
                {t.bestPriceLabel}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* ── Insights scroll ── */}
      {totalSales > 0 && (
        <View style={styles.insightsSection}>
          <Text
            style={[
              styles.sectionLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {isFarmer ? t.farmerInsights : t.wholesalerInsights}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.insightsScroll}
          >
            {insights.map((ins, i) => (
              <View
                key={i}
                style={[
                  styles.insightChip,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.borderLight,
                  },
                ]}
              >
                <View
                  style={[
                    styles.insightIconBg,
                    { backgroundColor: theme.accentLight },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={ins.icon as any}
                    size={16}
                    color={theme.accent}
                  />
                </View>
                <Text
                  style={[
                    styles.insightChipVal,
                    { color: theme.text, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  {ins.value}
                </Text>
                <Text
                  style={[
                    styles.insightChipLabel,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_500Medium",
                    },
                  ]}
                >
                  {ins.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Recent sales header ── */}
      <View style={styles.recentHeader}>
        <Text
          style={[
            styles.sectionLabel,
            { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          RECENT SALES
        </Text>
        {totalSales > 3 && (
          <Pressable
            onPress={() => router.push("/sales")}
            style={({ pressed }) => [
              styles.viewAllBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[
                styles.viewAllText,
                { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              View All ({totalSales})
            </Text>
            <Feather name="chevron-right" size={14} color={theme.accent} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

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
  const [period, setPeriod] = useState<ChartPeriod>("6m");

  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      const uid = user?.id;
      if (!uid) return;
      Promise.all([
        loadSales(uid),
        loadDrafts(uid),
        getUserProfile(uid),
        loadPlan(uid),
      ]).then(([salesData, draftsData, profileData, planData]) => {
        setSales(salesData);
        setDrafts(draftsData);
        setProfile(profileData);
        setPlan(planData);
        const isFarmer = profileData?.role === "farmer";
        setPeriod(isFarmer ? "6m" : "7d");
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    }, [user?.id]),
  );

  const handleDelete = async (id: string) => {
    await deleteSale(id);
    setSales((prev) => prev.filter((s) => s.id !== id));
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleNew = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/measurement");
  };

  if (loading)
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );

  const recentSales = sales.slice(0, 3);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        data={recentSales}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <DashboardHeader
            sales={sales}
            profile={profile}
            plan={plan}
            drafts={drafts}
            theme={theme}
            t={t}
            insets={insets}
            period={period}
            onPeriodChange={setPeriod}
          />
        }
        renderItem={({ item, index }) => (
          <SaleCard
            sale={item}
            index={index}
            theme={theme}
            onDelete={handleDelete}
            t={t}
          />
        )}
        ListFooterComponent={
          sales.length > 3 ? (
            <Pressable
              onPress={() => router.push("/sales")}
              style={({ pressed }) => [
                styles.viewAllCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderLight,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="history"
                size={18}
                color={theme.accent}
              />
              <Text
                style={[
                  styles.viewAllCardText,
                  { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                View All {sales.length} Sales
              </Text>
              <Feather name="chevron-right" size={16} color={theme.accent} />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <Animated.View
            style={styles.emptyWrap}
            entering={Platform.OS !== "web" ? FadeIn.delay(100) : undefined}
          >
            <View
              style={[
                styles.emptyIconBg,
                { backgroundColor: theme.accentLight },
              ]}
            >
              <MaterialCommunityIcons
                name="scale-balance"
                size={40}
                color={theme.accent}
              />
            </View>
            <Text
              style={[
                styles.emptyTitle,
                { color: theme.text, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {t.homeNoSales}
            </Text>
            <Text
              style={[
                styles.emptyHint,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {t.homeNoSalesHint}
            </Text>
          </Animated.View>
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + webBottomInset + 96,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <View
        style={[
          styles.fabWrap,
          { bottom: insets.bottom + webBottomInset + 20 },
        ]}
      >
        <Pressable
          onPress={handleNew}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.accent,
              transform: [{ scale: pressed ? 0.93 : 1 }],
            },
          ]}
        >
          <Feather name="plus" size={26} color="#fff" />
          <Text style={[styles.fabLabel, { fontFamily: "Outfit_600SemiBold" }]}>
            {t.newWeighing}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  appNameText: { fontSize: 17, marginBottom: 2 },
  rolePill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  rolePillText: { fontSize: 11 },
  avatarGrad: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 17, color: "#fff" },
  premiumDot: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FBBF24",
    borderWidth: 2,
    borderColor: "#fff",
  },

  greetingRow: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
  greetSub: { fontSize: 13, marginBottom: 2 },
  greetName: { fontSize: 24 },

  draftBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  draftText: { fontSize: 13 },

  heroCard: {
    marginTop: 16,
    borderRadius: 22,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  heroCardInner: { padding: 20 },
  heroCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  heroCardLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroCardAmount: { fontSize: 36, color: "#fff", letterSpacing: -1 },
  salesCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  salesCountText: { fontSize: 12, color: "rgba(255,255,255,0.65)" },

  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  periodLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 0.5,
  },
  toggleRow: { flexDirection: "row", borderRadius: 20, padding: 2 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 18 },
  toggleBtnText: { fontSize: 11, letterSpacing: 0.3 },

  chartArea: { marginBottom: 12 },
  noChartWrap: { alignItems: "center", paddingVertical: 24 },
  noChartText: { fontSize: 13, color: "rgba(255,255,255,0.35)" },
  heroChips: { flexDirection: "row", gap: 8, marginTop: 4 },
  heroChip: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    gap: 3,
    alignItems: "center",
  },
  heroChipVal: { fontSize: 14, color: "#fff" },
  heroChipLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },

  insightsSection: { marginTop: 22 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginHorizontal: 16,
    marginBottom: 10,
  },
  insightsScroll: { paddingHorizontal: 16, gap: 10 },
  insightChip: {
    width: 120,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 8,
    alignItems: "flex-start",
  },
  insightIconBg: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  insightChipVal: { fontSize: 17 },
  insightChipLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: { fontSize: 13 },

  emptyWrap: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 40,
    paddingBottom: 32,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 19, marginBottom: 8, textAlign: "center" },
  emptyHint: { fontSize: 14, textAlign: "center", lineHeight: 21 },

  card: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" } as object,
      default: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  cardDateRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  calIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  cardDate: { fontSize: 12 },
  cardStats: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingBottom: 12,
    alignItems: "center",
  },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statCellVal: { fontSize: 18 },
  statCellLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statDivider: { width: 1, height: 32, marginHorizontal: 4 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  footerMeta: { fontSize: 12, flex: 1 },
  footerAmount: { fontSize: 15 },

  viewAllCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 15,
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" } as object,
      default: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  viewAllCardText: { flex: 1, fontSize: 15 },

  fabWrap: {
    position: "absolute",
    alignSelf: "center",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    height: 52,
    borderRadius: 26,
    ...Platform.select({
      ios: {
        shadowColor: "#4080FF",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
    }),
  },
  fabLabel: { color: "#fff", fontSize: 16 },
});
