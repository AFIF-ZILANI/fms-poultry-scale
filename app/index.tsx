import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { loadSales, deleteSale, loadDrafts } from "@/lib/storage";
import { formatWeight, formatDateTime } from "@/lib/utils";
import type { SaleRecord, DraftSession } from "@/lib/types";

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
    } else {
      Alert.alert(t.homeDeleteTitle, t.homeDeleteMessage, [
        { text: t.cancel, style: "cancel" },
        {
          text: t.delete,
          style: "destructive",
          onPress: () => onDelete(sale.id),
        },
      ]);
    }
  };

  const handlePress = () => {
    router.push({ pathname: "/sale/[id]", params: { id: sale.id } });
  };

  return (
    <Animated.View
      entering={
        Platform.OS !== "web"
          ? FadeInDown.delay(index * 50).springify()
          : undefined
      }
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderLight,
            ...(Platform.OS !== "web" ? { shadowColor: theme.cardShadow } : {}),
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        testID={`sale-card-${index}`}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardDateRow}>
            <View
              style={[styles.dateBadge, { backgroundColor: theme.accentLight }]}
            >
              <Feather name="calendar" size={13} color={theme.accent} />
            </View>
            <Text
              style={[
                styles.cardDate,
                {
                  color: theme.textSecondary,
                  fontFamily: "Outfit_400Regular",
                },
              ]}
            >
              {formatDateTime(sale.createdAt)}
            </Text>
          </View>
          <Pressable
            onPress={handleDelete}
            hitSlop={16}
            style={({ pressed }) => [
              styles.deleteBtn,
              {
                backgroundColor: theme.dangerLight,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Feather name="trash-2" size={14} color={theme.danger} />
          </Pressable>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.statBlock}>
            <Text
              style={[
                styles.statValue,
                { color: theme.accent, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(sale.totalWeightKg)}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.grossKg}
            </Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <View style={styles.statBlock}>
            <Text
              style={[
                styles.statValue,
                { color: theme.warm, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {sale.pcsTracked === false ? "—" : sale.totalPcs}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.birds}
            </Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <View style={styles.statBlock}>
            <Text
              style={[
                styles.statValue,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {deduction
                ? formatWeight(deduction.net_weight)
                : formatWeight(sale.averageWeightKg)}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {deduction ? t.netKg : t.avgKg}
            </Text>
          </View>
        </View>

        {deduction ? (
          <View
            style={[
              styles.deductionStrip,
              {
                backgroundColor: theme.accentLight,
                borderTopColor: theme.borderLight,
              },
            ]}
          >
            <View style={styles.deductionLeft}>
              <Feather name="minus-circle" size={13} color={theme.accent} />
              <Text
                style={[
                  styles.deductionLabel,
                  {
                    color: theme.textSecondary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                {t.deductionShort}{" "}
                <Text
                  style={{
                    fontFamily: "Outfit_600SemiBold",
                    color: theme.danger,
                  }}
                >
                  -{formatWeight(deduction.total_deduction_kg)} KG
                </Text>
                {"  "}
                <Text style={{ color: theme.textTertiary }}>
                  (
                  {deduction.total_crates % 1 === 0
                    ? deduction.total_crates
                    : deduction.total_crates.toFixed(2)}{" "}
                  crates)
                </Text>
              </Text>
            </View>
            <Text
              style={[
                styles.deductionAmount,
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
            style={[styles.cardBottom, { borderTopColor: theme.borderLight }]}
          >
            <View style={styles.rowInfo}>
              <Feather name="layers" size={12} color={theme.textTertiary} />
              <Text
                style={[
                  styles.rowInfoText,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                {t.weighings(sale.rows.length)}
              </Text>
            </View>
            <View style={styles.viewDetailRow}>
              <Text
                style={[
                  styles.viewDetailText,
                  { color: theme.accent, fontFamily: "Outfit_500Medium" },
                ]}
              >
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

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftSession[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadSales(), loadDrafts()]).then(([salesData, draftsData]) => {
        setSales(salesData);
        setDrafts(draftsData);
        setLoading(false);
      });
    }, [])
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

  const handleOpenDrafts = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/drafts");
  };

  const handleOpenSettings = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push("/settings");
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + webTopInset + 12,
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <View
            style={[styles.logoBadge, { backgroundColor: theme.accentLight }]}
          >
            <MaterialCommunityIcons
              name="bird"
              size={22}
              color={theme.accent}
            />
          </View>
          <View>
            <Text
              style={[
                styles.headerTitle,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {t.appName}
            </Text>
            <Text
              style={[
                styles.headerSub,
                {
                  color: theme.textTertiary,
                  fontFamily: "Outfit_400Regular",
                },
              ]}
            >
              {sales.length > 0
                ? t.homeSalesRecorded(sales.length)
                : t.homeReadyToWeigh}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handleOpenSettings}
          hitSlop={12}
          style={({ pressed }) => [
            styles.settingsBtn,
            { backgroundColor: theme.borderLight, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="settings-outline" size={20} color={theme.text} />
        </Pressable>
      </View>

      {drafts.length > 0 && (
        <Pressable
          onPress={handleOpenDrafts}
          style={({ pressed }) => [
            styles.draftBanner,
            {
              backgroundColor: theme.warmLight,
              borderColor: theme.warm,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={styles.draftBannerLeft}>
            <View
              style={[
                styles.draftBannerIcon,
                { backgroundColor: theme.warm },
              ]}
            >
              <MaterialCommunityIcons
                name="progress-clock"
                size={15}
                color="#FFF"
              />
            </View>
            <Text
              style={[
                styles.draftBannerText,
                { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {t.homeDraftBanner(drafts.length)}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={theme.warm} />
        </Pressable>
      )}

      {loading ? (
        <View style={styles.emptyWrap}>
          <Text
            style={[
              styles.emptyMsg,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.loading}
          </Text>
        </View>
      ) : sales.length === 0 ? (
        <Animated.View
          style={styles.emptyWrap}
          entering={Platform.OS !== "web" ? FadeIn.delay(200) : undefined}
        >
          <View
            style={[styles.emptyIcon, { backgroundColor: theme.accentLight }]}
          >
            <MaterialCommunityIcons
              name="scale"
              size={44}
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
              styles.emptyMsg,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.homeNoSalesHint}
          </Text>
        </Animated.View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SaleCard
              sale={item}
              index={index}
              theme={theme}
              onDelete={handleDelete}
              t={t}
            />
          )}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + webBottomInset + 100,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!sales.length}
        />
      )}

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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
  },
  draftBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  draftBannerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  draftBannerIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  draftBannerText: { fontSize: 13, flex: 1 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22 },
  headerSub: { fontSize: 13, marginTop: 1 },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, marginBottom: 8, textAlign: "center" },
  emptyMsg: { fontSize: 14, textAlign: "center", lineHeight: 21 },
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
  dateBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cardDate: { fontSize: 13 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardStats: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statBlock: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22 },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statSep: { width: 1, height: 36, alignSelf: "center" },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  rowInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowInfoText: { fontSize: 12 },
  viewDetailRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewDetailText: { fontSize: 12 },
  deductionStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  deductionLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  deductionLabel: { fontSize: 12, flexShrink: 1 },
  deductionAmount: { fontSize: 16, marginLeft: 8 },
  fab: {
    position: "absolute",
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0px 6px 16px rgba(37,99,235,0.35)" } as object,
      default: {
        shadowColor: "#2563EB",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 10,
      },
    }),
  },
});
