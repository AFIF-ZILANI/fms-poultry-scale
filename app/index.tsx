import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import Svg, { Rect, Path, Text as SvgText, G } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useUser } from "@clerk/expo";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import {
  loadSales,
  deleteSale,
  loadDrafts,
  loadBatches,
} from "@/lib/storage";
import { formatWeight, formatDateTime, formatTk } from "@/lib/utils";
import { getUserProfile, type OnboardingData } from "@/lib/onboarding";
import { loadPlan, type Plan } from "@/lib/subscription";
import type { BatchSummary, DraftSummary, SaleRecord } from "@/lib/types";
import { Band as BAND } from "@/constants/colors";

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
        .reduce((sum, s) => sum + (s.meta?.finalAmount ?? 0), 0);
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
        .reduce((sum, s) => sum + (s.meta?.finalAmount ?? 0), 0);
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
      .reduce((sum, s) => sum + (s.meta?.finalAmount ?? 0), 0);
    return { label: MONTH_SHORT[d.getMonth()], revenue: rev };
  });
}

// The window the chart covers, and the equally long window immediately
// before it — so "earned" can be stated against something.
function periodWindows(period: ChartPeriod): {
  start: number;
  end: number;
  prevStart: number;
} {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const DAY = 86_400_000;

  if (period === "7d") {
    const start = today - 6 * DAY;
    return { start, end: today + DAY, prevStart: start - 7 * DAY };
  }
  if (period === "4w") {
    const start = today - 21 * DAY;
    return { start, end: today + 7 * DAY, prevStart: start - 28 * DAY };
  }
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();
  const prevStart = new Date(
    now.getFullYear(),
    now.getMonth() - 11,
    1,
  ).getTime();
  return { start, end: now.getTime() + DAY, prevStart };
}

function revenueBetween(sales: SaleRecord[], start: number, end: number) {
  return sales
    .filter((s) => s.createdAt >= start && s.createdAt < end)
    .reduce((sum, s) => sum + (s.meta?.finalAmount ?? 0), 0);
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

// Bars stand on the baseline: top corners rounded, bottom square.
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    "Z",
  ].join(" ");
}

function RevenueChart({
  bars,
  width,
  selected,
  onSelect,
}: {
  bars: Bar[];
  width: number;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const count = bars.length;
  const H = 78;
  const LABEL_H = 18;
  const SLOT = width / count;
  const BAR_W = Math.max(Math.min(SLOT - 9, 26), 7);
  const maxVal = Math.max(...bars.map((b) => b.revenue), 1);
  const lastIdx = count - 1;
  // Nothing selected means the newest bucket is the one being read.
  const readIdx = selected ?? lastIdx;

  return (
    <Svg width={width} height={H + LABEL_H}>
      {bars.map((bar, i) => {
        const x = i * SLOT + (SLOT - BAR_W) / 2;
        const isRead = i === readIdx;
        const hasRev = bar.revenue > 0;
        const barH = hasRev ? Math.max((bar.revenue / maxVal) * (H - 8), 5) : 0;
        const y = H - barH;

        return (
          <G key={i} onPress={() => onSelect(i)}>
            {/* Touch target spans the whole slot, not just the mark. */}
            <Rect
              x={i * SLOT}
              y={0}
              width={SLOT}
              height={H + LABEL_H}
              fill="transparent"
            />
            {hasRev ? (
              <Path
                d={barPath(x, y, BAR_W, barH, 4)}
                fill={BAND.bar}
                opacity={isRead ? 1 : 0.42}
              />
            ) : (
              // An empty bucket is an absence, not a tiny value: a flat tick
              // on the baseline rather than a stub that reads as revenue.
              <Rect
                x={x}
                y={H - 2}
                width={BAR_W}
                height={2}
                fill={BAND.inkFaint}
              />
            )}
            <SvgText
              x={i * SLOT + SLOT / 2}
              y={H + 13}
              textAnchor="middle"
              fontSize={9.5}
              fill={isRead ? BAND.ink : BAND.inkFaint}
              fontFamily={isRead ? "Outfit_600SemiBold" : "Outfit_400Regular"}
            >
              {bar.label}
            </SvgText>
          </G>
        );
      })}
      {/* Baseline — the same rule the facts below hang from. */}
      <Rect x={0} y={H} width={width} height={1} fill={BAND.rule} />
    </Svg>
  );
}

// A single qualifying figure under the ledger rule. Value in the mono face so
// the three columns line up; label in tracked caps so it recedes.
function Fact({
  value,
  unit,
  label,
}: {
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.fact}>
      <View style={styles.factValueRow}>
        <Text
          style={[styles.factValue, { fontFamily: "IBMPlexMono_500Medium" }]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {!!unit && (
          <Text
            style={[styles.factUnit, { fontFamily: "Outfit_500Medium" }]}
          >
            {unit}
          </Text>
        )}
      </View>
      <Text
        style={[styles.factLabel, { fontFamily: "Outfit_500Medium" }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
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
  const { meta } = sale;

  // Derive gross weight: prefer meta (persisted), fall back to summing rows
  // for unfinished sales that don't have meta yet.
  const grossWeightKg =
    meta?.mainWeightKg ?? sale.rows.reduce((s, r) => s + r.weightKg, 0);

  // Derive avg weight from meta.avgWtGrams (grams → kg) or compute from rows
  const avgWeightKg =
    meta?.avgWtGrams != null
      ? meta.avgWtGrams / 1000
      : sale.rows.length > 0
        ? grossWeightKg / sale.rows.length
        : 0;

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
            value={`${formatWeight(grossWeightKg)} KG`}
            label={t.grossKg}
            color={theme.accent}
            theme={theme}
          />
          <View
            style={[styles.statDivider, { backgroundColor: theme.borderLight }]}
          />
          <StatCell
            value={
              !sale.isPcsTracked
                ? "—"
                : String(
                    meta?.totalPcs ??
                      sale.rows.reduce((s, r) => s + (r.pcs ?? 0), 0),
                  )
            }
            label={t.birds}
            color={theme.warm}
            theme={theme}
          />
          <View
            style={[styles.statDivider, { backgroundColor: theme.borderLight }]}
          />
          <StatCell
            value={
              meta
                ? `${formatWeight(meta.netWeightKg)} KG`
                : `${formatWeight(avgWeightKg)} KG`
            }
            label={meta ? t.netKg : t.avgKg}
            color={theme.text}
            theme={theme}
          />
        </View>

        {meta ? (
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
                −{formatWeight(meta.totalDeductionWtKg)} KG
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
              {meta.finalAmount.toLocaleString("en-PK", {
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
  batches,
  theme,
  t,
  insets,
  period,
  onPeriodChange,
}: {
  sales: SaleRecord[];
  profile: OnboardingData | null;
  plan: Plan;
  drafts: DraftSummary[];
  batches: BatchSummary[];
  theme: ReturnType<typeof useTheme>;
  t: any;
  insets: ReturnType<typeof useSafeAreaInsets>;
  period: ChartPeriod;
  onPeriodChange: (p: ChartPeriod) => void;
}) {
  const { user } = useUser();
  const isFarmer = profile?.role === "farmer";
  const initials = (profile?.name || user?.firstName || "?")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const totalSales = sales.length;

  // meta is optional (sale might be unfinished / no deduction entered yet)
  // fall back to summing rows directly so the dashboard isn't blank
  // for in-progress sales
  const totalWeightKg = useMemo(
    () =>
      sales.reduce(
        (s, r) =>
          s +
          (r.meta?.mainWeightKg ??
            r.rows.reduce((rs, row) => rs + row.weightKg, 0)),
        0,
      ),
    [sales],
  );

  const totalBirds = useMemo(
    () =>
      sales.reduce(
        (s, r) =>
          s +
          (r.meta?.totalPcs ??
            r.rows.reduce((rs, row) => rs + (row.pcs ?? 0), 0)),
        0,
      ),
    [sales],
  );

  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const bars = useMemo(() => buildBars(sales, period), [sales, period]);
  const { previousRevenue, periodSales } = useMemo(() => {
    const { start, end, prevStart } = periodWindows(period);
    return {
      previousRevenue: revenueBetween(sales, prevStart, start),
      // Counted over the same window as the figure above it, so the two
      // numbers never describe different spans of time.
      periodSales: sales.filter(
        (x) => x.createdAt >= start && x.createdAt < end,
      ).length,
    };
  }, [sales, period]);

  // A tapped bar belongs to the period it was tapped in.
  useEffect(() => setSelectedBar(null), [period]);

  const hasRevenue = bars.some((b) => b.revenue > 0);
  const isPremium = plan === "premium";

  const bestPrice = useMemo(
    () =>
      sales
        .filter((s) => s.meta)
        .reduce((m, s) => Math.max(m, s.meta!.mainPrice), 0),
    [sales],
  );

  // Analytics
  const avgBatchKg = totalSales > 0 ? totalWeightKg / totalSales : 0;

  const totalCullKg = useMemo(
    () => sales.reduce((s, r) => s + (r.meta?.cullWeightKg ?? 0), 0),
    [sales],
  );

  const cullRate = totalWeightKg > 0 ? (totalCullKg / totalWeightKg) * 100 : 0;
  const avgBirds = totalSales > 0 ? Math.round(totalBirds / totalSales) : 0;

  const totalDeductionKg = useMemo(
    () => sales.reduce((s, r) => s + (r.meta?.totalDeductionWtKg ?? 0), 0),
    [sales],
  );

  const salesWithMeta = sales.filter((s) => s.meta);
  const avgPriceKg =
    salesWithMeta.length > 0
      ? salesWithMeta.reduce((s, r) => s + r.meta!.mainPrice, 0) /
        salesWithMeta.length
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

  const periodOptions: { label: string; value: ChartPeriod }[] = [
    { label: "7D", value: "7d" },
    { label: "4W", value: "4w" },
    { label: "6M", value: "6m" },
  ];

  const periodName =
    period === "7d"
      ? t.periodLast7d
      : period === "4w"
        ? t.periodLast4w
        : t.periodLast6m;

  // The reading: the selected bucket if one was tapped, otherwise the whole
  // period. Shown in full — a scale never abbreviates what it weighs.
  const periodRevenue = bars.reduce((sum, b) => sum + b.revenue, 0);
  const reading = selectedBar != null ? bars[selectedBar].revenue : periodRevenue;
  const readingLabel =
    selectedBar != null ? bars[selectedBar].label : periodName;

  const deltaPct =
    previousRevenue > 0
      ? ((periodRevenue - previousRevenue) / previousRevenue) * 100
      : null;

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
          <View>
            <Text
              style={[
                styles.appNameText,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              Poultry Scale
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

      {/* ── Readout band ──────────────────────────────────────────────
          The screen's thesis: this app is a scale, so its home reads like an
          instrument face. One dark slab holds the figure, what it is measured
          against, and its history, sharing a single baseline rule. */}
      <View
        style={[
          styles.band,
          { backgroundColor: theme.isDark ? BAND.dark : BAND.light },
        ]}
      >
        <View style={styles.bandTop}>
          <Text style={[styles.eyebrow, { fontFamily: "Outfit_600SemiBold" }]}>
            {t.earnedLabel}
          </Text>
          <PeriodToggle
            options={periodOptions}
            active={period}
            onSelect={onPeriodChange}
          />
        </View>

        <Text
          style={[styles.reading, { fontFamily: "IBMPlexMono_600SemiBold" }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {formatTk(reading)}
        </Text>

        <View style={styles.readingMetaRow}>
          <Text
            style={[styles.readingMeta, { fontFamily: "Outfit_400Regular" }]}
            numberOfLines={1}
          >
            {readingLabel} · {t.salesCount(periodSales)}
          </Text>

          {selectedBar == null &&
            (deltaPct == null ? (
              <Text
                style={[styles.deltaMuted, { fontFamily: "Outfit_400Regular" }]}
                numberOfLines={1}
              >
                {periodRevenue > 0 ? t.noEarlierData : ""}
              </Text>
            ) : (
              <View style={styles.deltaRow}>
                <Feather
                  name={deltaPct >= 0 ? "arrow-up-right" : "arrow-down-right"}
                  size={12}
                  color={deltaPct >= 0 ? BAND.up : BAND.down}
                />
                <Text
                  style={[
                    styles.delta,
                    {
                      color: deltaPct >= 0 ? BAND.up : BAND.down,
                      fontFamily: "IBMPlexMono_600SemiBold",
                    },
                  ]}
                >
                  {Math.abs(deltaPct).toFixed(0)}%
                </Text>
                <Text
                  style={[
                    styles.deltaSuffix,
                    { fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  {t.vsPrevious}
                </Text>
              </View>
            ))}
        </View>

        <View style={styles.chartArea}>
          {hasRevenue ? (
            <RevenueChart
              bars={bars}
              width={SCREEN_W - 32 - 36}
              selected={selectedBar}
              onSelect={(i) =>
                setSelectedBar((prev) => (prev === i ? null : i))
              }
            />
          ) : (
            <View style={styles.noChartWrap}>
              <Text
                style={[styles.noChartText, { fontFamily: "Outfit_400Regular" }]}
              >
                {t.noSalesInPeriod}
              </Text>
            </View>
          )}
        </View>

        {/* Facts hang from the same rule the bars stand on. */}
        <View style={styles.factRow}>
          <Fact
            value={formatWeight(totalWeightKg)}
            unit="KG"
            label={t.dashWeightSold}
          />
          <Fact
            value={totalBirds > 0 ? totalBirds.toLocaleString() : "—"}
            label={t.totalBirdsSold}
          />
          <Fact
            value={avgPriceKg > 0 ? `৳${avgPriceKg.toFixed(0)}` : "—"}
            unit={t.perKgShort}
            label={t.avgPurchasePrice}
          />
        </View>
      </View>

      {/* ── Needs attention ── two compact pills, not two stacked banners. */}
      {(drafts.length > 0 || batches.length > 0) && (
        <View style={styles.attentionRow}>
          {drafts.length > 0 && (
            <Pressable
              onPress={() => router.push("/drafts")}
              style={({ pressed }) => [
                styles.attentionPill,
                {
                  backgroundColor: theme.warmLight,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="progress-clock"
                size={15}
                color={theme.warm}
              />
              <Text
                style={[
                  styles.attentionText,
                  { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
                ]}
                numberOfLines={1}
              >
                {t.draftsPaused(drafts.length)}
              </Text>
            </Pressable>
          )}
          {batches.length > 0 && (
            <Pressable
              onPress={() => router.push("/batches")}
              style={({ pressed }) => [
                styles.attentionPill,
                {
                  backgroundColor: theme.accentLight,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather name="layers" size={14} color={theme.accent} />
              <Text
                style={[
                  styles.attentionText,
                  { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
                ]}
                numberOfLines={1}
              >
                {`${t.batches} · ${batches.length}`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

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

      <View style={styles.recentHeader}>
        <Text
          style={[
            styles.sectionLabel,
            { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          RECENT SALES
        </Text>
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
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [profile, setProfile] = useState<OnboardingData | null>(null);
  const [plan, setPlan] = useState<Plan>("community");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<ChartPeriod>("6m");
  const [menuOpen, setMenuOpen] = useState(false);

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
        loadBatches(uid),
      ])
        .then(([salesData, draftsData, profileData, planData, batchData]) => {
          setSales(salesData);
          setDrafts(draftsData);
          setBatches(batchData);
          setProfile(profileData);
          setPlan(planData);
          const isFarmer = profileData?.role === "farmer";
          setPeriod(isFarmer ? "6m" : "7d");
          setLoading(false);
        })
        .catch(() => {
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
    setMenuOpen((open) => !open);
  };

  const pickNew = (to: "/measurement" | "/batches") => {
    setMenuOpen(false);
    if (Platform.OS !== "web") Haptics.selectionAsync();
    router.push(to);
  };

  if (loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
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
            batches={batches}
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

      {/* Backdrop: any tap outside closes the menu. Rendered only while open
          so it never swallows taps on the list. */}
      {menuOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setMenuOpen(false)}
        />
      )}

      {/* FAB */}
      <View
        style={[
          styles.fabWrap,
          { bottom: insets.bottom + webBottomInset + 20 },
        ]}
      >
        {menuOpen && (
          <Animated.View
            entering={Platform.OS !== "web" ? FadeInDown.springify() : undefined}
            style={[
              styles.fabMenu,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            <Pressable
              onPress={() => pickNew("/measurement")}
              style={({ pressed }) => [
                styles.fabMenuItem,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View
                style={[
                  styles.fabMenuIcon,
                  { backgroundColor: theme.accentLight },
                ]}
              >
                <MaterialCommunityIcons
                  name="scale-balance"
                  size={18}
                  color={theme.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.fabMenuTitle,
                    { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {t.newSession}
                </Text>
                <Text
                  style={[
                    styles.fabMenuHint,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_400Regular",
                    },
                  ]}
                >
                  {t.newSessionHint}
                </Text>
              </View>
            </Pressable>

            <View
              style={[styles.fabMenuSep, { backgroundColor: theme.borderLight }]}
            />

            <Pressable
              onPress={() => pickNew("/batches")}
              style={({ pressed }) => [
                styles.fabMenuItem,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View
                style={[
                  styles.fabMenuIcon,
                  { backgroundColor: theme.warmLight },
                ]}
              >
                <Feather name="layers" size={17} color={theme.warm} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.fabMenuTitle,
                    { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {t.newBatch}
                </Text>
                <Text
                  style={[
                    styles.fabMenuHint,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_400Regular",
                    },
                  ]}
                >
                  {t.newBatchHint}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

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
          <Feather
            name={menuOpen ? "x" : "plus"}
            size={26}
            color="#fff"
          />
          <Text style={[styles.fabLabel, { fontFamily: "Outfit_600SemiBold" }]}>
            {t.newLabel}
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

  band: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  bandTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 10,
    color: BAND.inkDim,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  // The reading itself: full figure, never abbreviated, mono so the digits
  // hold their columns as the value changes.
  reading: { fontSize: 38, color: BAND.ink, letterSpacing: -0.5 },
  readingMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
    minHeight: 18,
  },
  readingMeta: { fontSize: 12, color: BAND.inkDim, flexShrink: 1 },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  delta: { fontSize: 12 },
  deltaSuffix: { fontSize: 11, color: BAND.inkFaint },
  deltaMuted: { fontSize: 11, color: BAND.inkFaint, flexShrink: 1 },

  toggleRow: { flexDirection: "row", borderRadius: 20, padding: 2 },
  toggleBtn: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: 18 },
  toggleBtnText: { fontSize: 10.5, letterSpacing: 0.3 },

  chartArea: { marginTop: 14 },
  noChartWrap: { alignItems: "center", justifyContent: "center", height: 96 },
  noChartText: { fontSize: 12.5, color: BAND.inkFaint },

  factRow: { flexDirection: "row", marginTop: 12 },
  fact: { flex: 1, gap: 2 },
  factValueRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  factValue: { fontSize: 14, color: BAND.ink },
  factUnit: { fontSize: 10, color: BAND.inkDim },
  factLabel: {
    fontSize: 9.5,
    color: BAND.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  attentionRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
  },
  attentionPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  attentionText: { fontSize: 12, flexShrink: 1 },

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
  fabMenu: {
    width: 268,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  fabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  fabMenuIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fabMenuTitle: { fontSize: 14 },
  fabMenuHint: { fontSize: 11, marginTop: 1 },
  fabMenuSep: { height: 1, marginHorizontal: 14 },
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
