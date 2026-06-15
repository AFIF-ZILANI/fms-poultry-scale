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
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useUser } from "@clerk/expo";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { loadSales, deleteSale } from "@/lib/storage";
import { formatWeight, formatDateTime } from "@/lib/utils";
import type { SaleRecord } from "@/lib/types";

export default function SalesHistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { user } = useUser();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      loadSales(user.id).then((data) => {
        setSales(data);
        setLoading(false);
      });
    }, [user?.id])
  );

  const handleDelete = (id: string) => {
    if (Platform.OS === "web") {
      deleteSale(id).then(() => setSales((prev) => prev.filter((s) => s.id !== id)));
      return;
    }
    Alert.alert(t.homeDeleteTitle, t.homeDeleteMessage, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.delete,
        style: "destructive",
        onPress: async () => {
          await deleteSale(id);
          setSales((prev) => prev.filter((s) => s.id !== id));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: theme.background }} />;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Top bar */}
      <View style={[styles.topBar, {
        paddingTop: insets.top + webTopInset + 8,
        backgroundColor: theme.surface,
        borderBottomColor: theme.borderLight,
      }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.accentLight, opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={18} color={theme.accent} />
        </Pressable>
        <View>
          <Text style={[styles.topBarTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
            Sales History
          </Text>
          {sales.length > 0 && (
            <Text style={[styles.topBarSub, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
              {sales.length} {sales.length === 1 ? "record" : "records"}
            </Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={sales}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <SaleCard sale={item} index={index} theme={theme} t={t} onDelete={handleDelete} />
        )}
        ListEmptyComponent={
          <Animated.View
            style={styles.emptyWrap}
            entering={Platform.OS !== "web" ? FadeIn.delay(80) : undefined}
          >
            <View style={[styles.emptyIconBg, { backgroundColor: theme.accentLight }]}>
              <MaterialCommunityIcons name="receipt-text-outline" size={38} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: "Outfit_600SemiBold" }]}>
              {t.homeNoSales}
            </Text>
            <Text style={[styles.emptyHint, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
              {t.homeNoSalesHint}
            </Text>
          </Animated.View>
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function SaleCard({ sale, index, theme, t, onDelete }: {
  sale: SaleRecord;
  index: number;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useSettings>["t"];
  onDelete: (id: string) => void;
}) {
  const { deduction } = sale;

  return (
    <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(index * 35).springify() : undefined}>
      <Pressable
        onPress={() => router.push({ pathname: "/sale/[id]", params: { id: sale.id } })}
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
            <View style={[styles.calIcon, { backgroundColor: theme.accentLight }]}>
              <Feather name="calendar" size={11} color={theme.accent} />
            </View>
            <Text style={[styles.cardDate, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
              {formatDateTime(sale.createdAt)}
            </Text>
          </View>
          <Pressable onPress={() => onDelete(sale.id)} hitSlop={14}>
            <Feather name="trash-2" size={13} color={theme.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.cardStats}>
          <StatCell value={`${formatWeight(sale.totalWeightKg)} KG`} label={t.grossKg} color={theme.accent} theme={theme} />
          <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />
          <StatCell
            value={sale.pcsTracked === false ? "—" : String(sale.totalPcs)}
            label={t.birds}
            color={theme.warm}
            theme={theme}
          />
          <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />
          <StatCell
            value={deduction ? `${formatWeight(deduction.net_weight)} KG` : `${formatWeight(sale.averageWeightKg)} KG`}
            label={deduction ? t.netKg : t.avgKg}
            color={theme.text}
            theme={theme}
          />
        </View>

        {deduction ? (
          <View style={[styles.cardFooter, { backgroundColor: theme.accentLight, borderTopColor: theme.borderLight }]}>
            <Text style={[styles.footerMeta, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
              <Text style={{ color: theme.danger, fontFamily: "Outfit_600SemiBold" }}>
                −{formatWeight(deduction.total_deduction_kg)} KG
              </Text>
              {"  deduction"}
            </Text>
            <Text style={[styles.footerAmount, { color: theme.accent, fontFamily: "Outfit_700Bold" }]}>
              Tk {deduction.final_amount.toLocaleString("en-PK", { maximumFractionDigits: 0 })}
            </Text>
          </View>
        ) : (
          <View style={[styles.cardFooter, { backgroundColor: "transparent", borderTopColor: theme.borderLight }]}>
            <Text style={[styles.footerMeta, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
              {t.weighings(sale.rows.length)}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Text style={[{ color: theme.accent, fontSize: 12, fontFamily: "Outfit_500Medium" }]}>
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

function StatCell({ value, label, color, theme }: {
  value: string; label: string; color: string; theme: any;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statVal, { color, fontFamily: "Outfit_700Bold" }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textTertiary, fontFamily: "Outfit_500Medium" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  topBarTitle: { fontSize: 17 },
  topBarSub: { fontSize: 12, marginTop: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  emptyWrap: { alignItems: "center", paddingTop: 64, paddingHorizontal: 40 },
  emptyIconBg: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, marginBottom: 8, textAlign: "center" },
  emptyHint: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  card: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" } as object,
      default: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3 },
    }),
  },
  cardHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10,
  },
  cardDateRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  calIcon: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  cardDate: { fontSize: 12 },
  cardStats: { flexDirection: "row", paddingHorizontal: 14, paddingBottom: 12, alignItems: "center" },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 18 },
  statLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 },
  divider: { width: 1, height: 32, marginHorizontal: 4 },
  cardFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1,
  },
  footerMeta: { fontSize: 12, flex: 1 },
  footerAmount: { fontSize: 15 },
});
