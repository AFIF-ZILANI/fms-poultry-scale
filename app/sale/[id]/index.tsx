import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { formatWeight, formatDateTime } from "@/lib/utils";
import { loadSales, loadFarmName } from "@/lib/storage";
import { ReceiptView } from "@/components/ReceiptView";
import { generateReceiptHtml } from "@/lib/receiptHtml";
import type { SaleRecord } from "@/lib/types";

export default function SaleDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [farmName, setFarmName] = useState("");
  const [loading, setLoading] = useState(true);
  const [showReceipt, setShowReceipt] = useState(false);
  const [sharing, setSharing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadSales(), loadFarmName()]).then(([sales, name]) => {
        const found = sales.find((s) => s.id === id) ?? null;
        setSale(found);
        setFarmName(name);
        setLoading(false);
      });
    }, [id])
  );

  const handleShare = async () => {
    if (!sale) return;
    setSharing(true);
    try {
      const html = generateReceiptHtml(sale, farmName);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Sharing not available on this device");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share Receipt",
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      Alert.alert("Could not generate receipt PDF");
    } finally {
      setSharing(false);
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!sale) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.notFound, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
          {t.saleNotFound}
        </Text>
      </View>
    );
  }

  const { dholta } = sale;
  const hasCull = (sale.cullRows?.length ?? 0) > 0;
  const cullTotalKg = hasCull ? (sale.cullRows ?? []).reduce((s, r) => s + r.weightKg, 0) : 0;
  const cullTotalPcs = hasCull ? (sale.cullRows ?? []).reduce((s, r) => s + r.pcs, 0) : 0;

  const mainAmount = dholta?.main_amount ?? (dholta ? dholta.net_weight * dholta.price_per_kg : 0);
  const cullAmount = dholta?.cull_amount ?? 0;
  const cullSold = dholta?.cull_sold ?? false;
  const balanceDue =
    sale.receivedAmount != null && dholta
      ? dholta.final_amount - sale.receivedAmount
      : null;

  const subtotalGross = dholta ? dholta.gross_weight - dholta.cull_weight_kg : 0;
  const rawCrates = dholta ? subtotalGross / dholta.kg_per_crate : 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Receipt preview modal */}
      <Modal
        visible={showReceipt}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReceipt(false)}
      >
        <View style={[styles.receiptModal, { backgroundColor: theme.background }]}>
          <View
            style={[
              styles.receiptModalHeader,
              {
                backgroundColor: theme.surface,
                borderBottomColor: theme.border,
                paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
              },
            ]}
          >
            <Pressable
              onPress={() => setShowReceipt(false)}
              hitSlop={16}
              style={({ pressed }) => [
                styles.navBtn,
                { backgroundColor: theme.borderLight, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </Pressable>
            <Text style={[styles.receiptModalTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
              {t.receiptPreview}
            </Text>
            <Pressable
              onPress={handleShare}
              disabled={sharing}
              style={({ pressed }) => [
                styles.shareBtn,
                { backgroundColor: theme.accent, opacity: pressed || sharing ? 0.7 : 1 },
              ]}
            >
              {sharing ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Feather name="share-2" size={16} color="#FFF" />
                  <Text style={[styles.shareBtnText, { fontFamily: "Outfit_700Bold" }]}>
                    {t.shareReceipt}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <ReceiptView sale={sale} farmName={farmName} />
          </ScrollView>
        </View>
      </Modal>

      {/* Main screen */}
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
        <Text style={[styles.topBarTitle, { color: theme.text, fontFamily: "Outfit_600SemiBold" }]}>
          {t.saleDetail}
        </Text>
        <Pressable
          onPress={() => setShowReceipt(true)}
          style={({ pressed }) => [
            styles.shareTopBtn,
            { backgroundColor: theme.accentLight, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="share-2" size={16} color={theme.accent} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + webBottomInset + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <Animated.View
          entering={Platform.OS !== "web" ? FadeIn.delay(80) : undefined}
          style={[styles.heroCard, { backgroundColor: theme.timerBg }]}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroCheck}>
              <Feather name="calendar" size={18} color="rgba(255,255,255,0.7)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { fontFamily: "Outfit_700Bold" }]}>
                {formatDateTime(sale.createdAt)}
              </Text>
              {sale.buyerName ? (
                <Text style={[styles.heroBuyer, { fontFamily: "Outfit_500Medium" }]}>
                  {sale.buyerName}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStatItem}>
              <Text style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}>
                {formatWeight(sale.totalWeightKg)}
              </Text>
              <Text style={[styles.heroStatUnit, { fontFamily: "Outfit_400Regular" }]}>
                {t.grossKg}
              </Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroStatItem}>
              <Text style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}>
                {sale.totalPcs}
              </Text>
              <Text style={[styles.heroStatUnit, { fontFamily: "Outfit_400Regular" }]}>
                {t.birds}
              </Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroStatItem}>
              <Text style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}>
                {formatWeight(sale.averageWeightKg)}
              </Text>
              <Text style={[styles.heroStatUnit, { fontFamily: "Outfit_400Regular" }]}>
                {t.avgKg}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Dholta card */}
        {dholta && (
          <Animated.View
            entering={
              Platform.OS !== "web" ? FadeInDown.delay(120).springify() : undefined
            }
          >
            <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" }]}>
              {t.tradeDeductionDholta}
            </Text>
            <View
              style={[
                styles.dholtaCard,
                { backgroundColor: theme.surface, borderColor: theme.borderLight },
              ]}
            >
              {/* Gross */}
              <DholtaRow label={t.grossWeight} value={`${formatWeight(dholta.gross_weight)} KG`} theme={theme} />

              {/* Cull weight — always shown for transparency */}
              {dholta.cull_weight_kg > 0 ? (
                <>
                  <DholtaRow
                    label={t.cullWeight}
                    value={`−${formatWeight(dholta.cull_weight_kg)} KG`}
                    theme={theme}
                    isNegative
                  />
                  <DholtaRow
                    label={t.subtotalGross}
                    value={`${formatWeight(subtotalGross)} KG`}
                    theme={theme}
                  />
                </>
              ) : (
                <DholtaRow
                  label={t.cullWeight}
                  value="0 KG"
                  theme={theme}
                />
              )}

              {/* Explicit crate floor calculation */}
              {dholta.full_crates_only ? (
                <DholtaRow
                  label={`${formatWeight(subtotalGross)} ÷ ${dholta.kg_per_crate} = ${rawCrates.toFixed(3)} → ${dholta.total_crates} crates`}
                  value={`${dholta.total_crates}`}
                  theme={theme}
                  isIndent
                />
              ) : (
                <DholtaRow
                  label={`${t.totalCrates}`}
                  value={`${dholta.total_crates.toFixed(3)}`}
                  theme={theme}
                />
              )}

              {/* Crate deduction */}
              <DholtaRow
                label={`${dholta.total_crates} × ${dholta.deduction_per_crate_g}g dholta`}
                value={`−${formatWeight(dholta.total_deduction_kg)} KG`}
                theme={theme}
                isNegative
              />

              {/* Net main weight */}
              <DholtaRow
                label={dholta.cull_weight_kg > 0 ? t.payableWeight : t.netWeight}
                value={`${formatWeight(dholta.net_weight)} KG`}
                theme={theme}
                isHighlight
              />

              {/* × price/kg */}
              <View style={styles.multiplyHint}>
                <Text style={[styles.multiplyHintText, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                  × Tk {dholta.price_per_kg.toFixed(2)} / kg
                </Text>
              </View>

              {/* Main amount */}
              <DholtaRow
                label={t.mainAmount}
                value={`Tk ${mainAmount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`}
                theme={theme}
              />

              {/* Cull revenue */}
              {cullSold && cullAmount > 0 && (
                <DholtaRow
                  label={
                    dholta.cull_pricing_mode === "per_kg"
                      ? `${t.cullAmount} (${formatWeight(dholta.cull_weight_kg)} kg × Tk ${dholta.cull_price?.toFixed(2)})`
                      : `${t.cullAmount} (${dholta.cull_pcs} birds × Tk ${dholta.cull_price?.toFixed(2)})`
                  }
                  value={`+ Tk ${cullAmount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`}
                  theme={theme}
                  isHighlight
                />
              )}

              {/* Final amount */}
              <View style={[styles.finalRow, { backgroundColor: theme.accentLight }]}>
                <Text style={[styles.finalLabel, { color: theme.accent, fontFamily: "Outfit_600SemiBold" }]}>
                  {t.finalAmount}
                </Text>
                <Text style={[styles.finalValue, { color: theme.accent, fontFamily: "Outfit_700Bold" }]}>
                  Tk {dholta.final_amount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}
                </Text>
              </View>

              {/* Received */}
              {sale.receivedAmount != null && sale.receivedAmount > 0 && (
                <View style={[styles.receivedRow, { backgroundColor: theme.successLight }]}>
                  <Text style={[styles.finalLabel, { color: theme.success, fontFamily: "Outfit_600SemiBold" }]}>
                    {t.receivedAmount}
                  </Text>
                  <Text style={[styles.finalValue, { color: theme.success, fontFamily: "Outfit_700Bold" }]}>
                    Tk {sale.receivedAmount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}
                  </Text>
                </View>
              )}

              {/* Balance due */}
              {balanceDue !== null && (
                <View
                  style={[
                    styles.balanceRow,
                    { backgroundColor: balanceDue > 0 ? theme.dangerLight : theme.successLight },
                  ]}
                >
                  <Text
                    style={[
                      styles.finalLabel,
                      {
                        color: balanceDue > 0 ? theme.danger : theme.success,
                        fontFamily: "Outfit_600SemiBold",
                      },
                    ]}
                  >
                    {t.balanceDue}
                  </Text>
                  <Text
                    style={[
                      styles.finalValue,
                      { color: balanceDue > 0 ? theme.danger : theme.success, fontFamily: "Outfit_700Bold" },
                    ]}
                  >
                    Tk {Math.abs(balanceDue).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
                    {balanceDue < 0 ? " ✓" : ""}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Weighing logs */}
        <Animated.View
          entering={
            Platform.OS !== "web"
              ? FadeInDown.delay(dholta ? 200 : 140).springify()
              : undefined
          }
        >
          <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" }]}>
            {t.weighingLogs}
          </Text>

          <View style={[styles.logCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
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
                <View style={[styles.logDivider, { backgroundColor: theme.borderLight }]} />
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
      style={({ pressed }) => [styles.logEntry, { opacity: pressed ? 0.65 : 1 }]}
    >
      <View
        style={[
          styles.logEntryIcon,
          { backgroundColor: isCull ? theme.warmLight : theme.accentLight },
        ]}
      >
        <MaterialCommunityIcons
          name="bird"
          size={18}
          color={isCull ? theme.warm : theme.accent}
        />
      </View>

      <View style={styles.logEntryInfo}>
        <Text style={[styles.logEntryLabel, { color: theme.text, fontFamily: "Outfit_600SemiBold" }]}>
          {label}
        </Text>
        <Text style={[styles.logEntrySub, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
          {t.sessionRows(rowCount)}
        </Text>
      </View>

      <View style={styles.logEntryRight}>
        <Text style={[styles.logEntryKg, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
          {formatWeight(totalKg)} KG
        </Text>
        <View style={styles.logEntryPcsRow}>
          <MaterialCommunityIcons name="bird" size={11} color={theme.warm} />
          <Text style={[styles.logEntryPcs, { color: theme.warm, fontFamily: "Outfit_500Medium" }]}>
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
  isIndent,
}: {
  label: string;
  value?: string;
  theme: ReturnType<typeof useTheme>;
  isNegative?: boolean;
  isHighlight?: boolean;
  isIndent?: boolean;
}) {
  const valueColor = isNegative
    ? theme.danger
    : isHighlight
    ? theme.success
    : theme.text;
  return (
    <View style={[styles.dholtaRow, isIndent && styles.dholtaRowIndent]}>
      <Text
        style={[
          styles.dholtaRowLabel,
          { color: isIndent ? theme.textTertiary : theme.textTertiary, fontFamily: "Outfit_400Regular" },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {value != null && (
        <Text style={[styles.dholtaRowValue, { color: valueColor, fontFamily: "Outfit_600SemiBold" }]}>
          {value}
        </Text>
      )}
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
  topBarTitle: { fontSize: 16, flex: 1, textAlign: "center" },
  shareTopBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // Receipt modal
  receiptModal: { flex: 1 },
  receiptModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  receiptModalTitle: { fontSize: 16, flex: 1, textAlign: "center" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  shareBtnText: { fontSize: 13, color: "#FFF" },

  // Hero
  heroCard: { borderRadius: 22, padding: 20, marginBottom: 20 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 16 },
  heroCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  heroBuyer: { fontSize: 16, color: "#FFFFFF", marginTop: 3 },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  heroStatItem: { alignItems: "center" },
  heroStatVal: { fontSize: 22, color: "#FFF" },
  heroStatUnit: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  heroDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },

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
    alignItems: "flex-start",
    paddingVertical: 7,
    gap: 8,
  },
  dholtaRowIndent: { paddingLeft: 12 },
  dholtaRowLabel: { fontSize: 14, flex: 1, lineHeight: 20 },
  dholtaRowValue: { fontSize: 15, textAlign: "right" },

  multiplyHint: { paddingVertical: 2, paddingLeft: 2 },
  multiplyHintText: { fontSize: 13 },

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
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
  },
  finalLabel: { fontSize: 14 },
  finalValue: { fontSize: 20 },

  logCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  logDivider: { height: 1 },
  logEntry: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  logEntryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logEntryInfo: { flex: 1 },
  logEntryLabel: { fontSize: 15 },
  logEntrySub: { fontSize: 12, marginTop: 2 },
  logEntryRight: { alignItems: "flex-end", gap: 3 },
  logEntryKg: { fontSize: 15 },
  logEntryPcsRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  logEntryPcs: { fontSize: 12 },
});
