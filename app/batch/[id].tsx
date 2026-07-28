import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import {
  loadBatch,
  renameBatch,
  setBatchClosed,
  deleteBatch,
  type Batch,
} from "@/lib/storage";
import { formatWeight, formatTk, formatDateTime } from "@/lib/utils";
import type { SaleRecord } from "@/lib/types";

function SessionRow({
  sale,
  index,
  theme,
  t,
}: {
  sale: SaleRecord;
  index: number;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useSettings>["t"];
}) {
  const m = sale.meta;
  // The sale settled when it was recorded; any gap is money knocked off.
  const discount = m ? Math.max(m.finalAmount - m.receivedAmount, 0) : 0;
  const logCount = sale.rows.length + (sale.cullRows?.length ?? 0);

  const open = () =>
    sale.isFinished
      ? router.push({ pathname: "/sale/[id]", params: { id: sale.id } })
      : router.push({ pathname: "/measurement", params: { draftId: sale.id } });

  return (
    <Animated.View
      entering={
        Platform.OS !== "web"
          ? FadeInDown.delay(index * 30).springify()
          : undefined
      }
    >
      <Pressable
        onPress={open}
        style={({ pressed }) => [
          styles.session,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderLight,
            opacity: pressed ? 0.94 : 1,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={[
              styles.sessionTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
            numberOfLines={1}
          >
            {m?.buyerName?.trim() || formatDateTime(sale.createdAt)}
          </Text>
          <Text
            style={[
              styles.sessionMeta,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
            numberOfLines={1}
          >
            {sale.isFinished
              ? `${m?.totalPcs ?? 0} ${t.birds} · ${formatWeight(
                  m?.netWeightKg ?? 0,
                )} KG`
              : `${t.inProgress} · ${t.weighings(logCount)}`}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end", gap: 3 }}>
          {sale.isFinished ? (
            <>
              <Text
                style={[
                  styles.sessionAmount,
                  { color: theme.text, fontFamily: "Outfit_700Bold" },
                ]}
              >
                {formatTk(m?.finalAmount ?? 0)}
              </Text>
              <Text
                style={[
                  styles.sessionDue,
                  {
                    color: discount > 0 ? theme.warm : theme.success,
                    fontFamily: "Outfit_600SemiBold",
                  },
                ]}
              >
                {discount > 0
                  ? `−${formatTk(discount)} ${t.discountShort}`
                  : t.paidUp}
              </Text>
            </>
          ) : (
            <View
              style={[styles.draftPill, { backgroundColor: theme.warmLight }]}
            >
              <Text
                style={[
                  styles.draftPillText,
                  { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {t.inProgress}
              </Text>
            </View>
          )}
        </View>
        <Feather name="chevron-right" size={16} color={theme.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

function Stat({
  value,
  label,
  color,
  theme,
}: {
  value: string;
  label: string;
  color: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statVal, { color, fontFamily: "Outfit_700Bold" }]}>
        {value}
      </Text>
      <Text
        style={[
          styles.statKey,
          { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function BatchDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const refresh = useCallback(() => {
    if (!id) return;
    loadBatch(id).then((data) => {
      setBatch(data?.batch ?? null);
      setSales(data?.sales ?? []);
      setLoading(false);
    });
  }, [id]);

  useFocusEffect(refresh);

  // Everything below is derived from the sessions — a batch stores no totals
  // of its own, so it can never drift out of sync with them.
  const finished = sales.filter((s) => s.meta);
  const revenue = finished.reduce((s, x) => s + (x.meta?.finalAmount ?? 0), 0);
  const discount = finished.reduce(
    (s, x) =>
      s + Math.max((x.meta?.finalAmount ?? 0) - (x.meta?.receivedAmount ?? 0), 0),
    0,
  );
  const birds = finished.reduce((s, x) => s + (x.meta?.totalPcs ?? 0), 0);
  const weightKg = finished.reduce((s, x) => s + (x.meta?.netWeightKg ?? 0), 0);
  const pricePerKg = weightKg > 0 ? revenue / weightKg : 0;
  const avgBirdKg = birds > 0 ? weightKg / birds : 0;

  const dates = sales.map((s) => s.createdAt).sort((a, b) => a - b);
  const range =
    dates.length === 0
      ? ""
      : dates.length === 1 || dates[0] === dates[dates.length - 1]
        ? formatDateTime(dates[0])
        : `${formatDateTime(dates[0])} – ${formatDateTime(dates[dates.length - 1])}`;

  const isClosed = batch?.closedAt != null;

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || !id) return;
    await renameBatch(id, trimmed);
    setRenaming(false);
    refresh();
  };

  const handleToggleClosed = () => {
    if (!id || !batch) return;
    if (isClosed) {
      setBatchClosed(id, false).then(refresh);
      return;
    }
    Alert.alert(t.closeBatch, t.closeBatchConfirm, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.closeBatch,
        onPress: () => setBatchClosed(id, true).then(refresh),
      },
    ]);
  };

  const handleDelete = () => {
    if (!id) return;
    Alert.alert(t.deleteBatch, t.deleteBatchConfirm, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.delete,
        style: "destructive",
        onPress: async () => {
          await deleteBatch(id);
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          router.back();
        },
      },
    ]);
  };

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
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: theme.borderLight, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={[
              styles.headerTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
            numberOfLines={1}
          >
            {batch?.name ?? ""}
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
            numberOfLines={1}
          >
            {t.batchSessions(sales.length)}
            {range ? ` · ${range}` : ""}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setName(batch?.name ?? "");
            setRenaming(true);
          }}
          hitSlop={16}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: theme.borderLight, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="edit-2" size={16} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + webBottomInset + 24,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Money first — it is the question the farmer opened this screen to
            answer. Revenue and outstanding dues get the largest type. */}
        <View
          style={[
            styles.hero,
            { backgroundColor: theme.surface, borderColor: theme.borderLight },
          ]}
        >
          {isClosed && (
            <View
              style={[styles.closedPill, { backgroundColor: theme.borderLight }]}
            >
              <Feather name="check" size={11} color={theme.textTertiary} />
              <Text
                style={[
                  styles.closedPillText,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_600SemiBold",
                  },
                ]}
              >
                {t.batchClosed}
              </Text>
            </View>
          )}

          <Text
            style={[
              styles.heroValue,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {formatTk(revenue)}
          </Text>
          <Text
            style={[
              styles.heroLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {t.revenueLabel}
          </Text>

          <View
            style={[styles.heroDivider, { backgroundColor: theme.borderLight }]}
          />

          <Text
            style={[
              styles.heroDue,
              {
                color: discount > 0 ? theme.warm : theme.success,
                fontFamily: "Outfit_700Bold",
              },
            ]}
          >
            {discount > 0 ? `−${formatTk(discount)}` : t.paidUp}
          </Text>
          <Text
            style={[
              styles.heroLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {discount > 0 ? t.discountGiven : ""}
          </Text>
        </View>

        <View
          style={[
            styles.statGrid,
            { backgroundColor: theme.surface, borderColor: theme.borderLight },
          ]}
        >
          <View style={styles.statRow}>
            <Stat
              value={String(birds)}
              label={t.birds}
              color={theme.warm}
              theme={theme}
            />
            <View
              style={[styles.vDivider, { backgroundColor: theme.borderLight }]}
            />
            <Stat
              value={`${formatWeight(weightKg)} KG`}
              label={t.netKg}
              color={theme.accent}
              theme={theme}
            />
          </View>
          <View style={[styles.hDivider, { backgroundColor: theme.borderLight }]} />
          <View style={styles.statRow}>
            <Stat
              value={`${formatTk(pricePerKg)}${t.perKgShort}`}
              label={t.avgPurchasePrice}
              color={theme.text}
              theme={theme}
            />
            <View
              style={[styles.vDivider, { backgroundColor: theme.borderLight }]}
            />
            <Stat
              value={`${formatWeight(avgBirdKg)} KG`}
              label={t.avgBird}
              color={theme.text}
              theme={theme}
            />
          </View>
        </View>

        <Text
          style={[
            styles.sectionHeader,
            { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          {t.sessionsHeader}
        </Text>

        {loading ? null : sales.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
              },
            ]}
          >
            <Feather name="inbox" size={26} color={theme.textTertiary} />
            <Text
              style={[
                styles.emptyText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {t.batchEmptyHint}
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/measurement",
                  params: { batchId: id },
                })
              }
              style={({ pressed }) => [
                styles.addBtn,
                { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="plus" size={15} color="#fff" />
              <Text
                style={[styles.addBtnText, { fontFamily: "Outfit_600SemiBold" }]}
              >
                {t.newSession}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {sales.map((sale, i) => (
              <SessionRow
                key={sale.id}
                sale={sale}
                index={i}
                theme={theme}
                t={t}
              />
            ))}
            {!isClosed && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/measurement",
                    params: { batchId: id },
                  })
                }
                style={({ pressed }) => [
                  styles.addRow,
                  {
                    borderColor: theme.accent,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather name="plus" size={15} color={theme.accent} />
                <Text
                  style={[
                    styles.addRowText,
                    { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {t.newSession}
                </Text>
              </Pressable>
            )}
          </>
        )}

        <View style={{ height: 8 }} />

        <Pressable
          onPress={handleToggleClosed}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: theme.borderLight,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather
            name={isClosed ? "rotate-ccw" : "check-circle"}
            size={15}
            color={theme.text}
          />
          <Text
            style={[
              styles.actionBtnText,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {isClosed ? t.reopenBatch : t.closeBatch}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: theme.dangerLight,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="trash-2" size={15} color={theme.danger} />
          <Text
            style={[
              styles.actionBtnText,
              { color: theme.danger, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {t.deleteBatch}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={renaming}
        transparent
        animationType="fade"
        onRequestClose={() => setRenaming(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRenaming(false)}
          />
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text
              style={[
                styles.modalTitle,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {t.renameBatch}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t.batchNamePlaceholder}
              placeholderTextColor={theme.textTertiary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRename}
              style={[
                styles.modalInput,
                {
                  color: theme.text,
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  fontFamily: "Outfit_500Medium",
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setRenaming(false)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: theme.borderLight,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalBtnText,
                    { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {t.cancel}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleRename}
                disabled={!name.trim()}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: theme.accent,
                    opacity: !name.trim() ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalBtnText,
                    { color: "#fff", fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {t.save}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17 },
  headerSub: { fontSize: 11, marginTop: 1 },

  hero: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  closedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 10,
  },
  closedPillText: { fontSize: 10, letterSpacing: 0.3 },
  heroValue: { fontSize: 30 },
  heroDue: { fontSize: 22 },
  heroLabel: { fontSize: 11, letterSpacing: 0.6, marginTop: 2 },
  heroDivider: { height: 1, alignSelf: "stretch", marginVertical: 14 },

  statGrid: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  statRow: { flexDirection: "row", paddingVertical: 12 },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 16 },
  statKey: { fontSize: 10, letterSpacing: 0.3 },
  vDivider: { width: 1 },
  hDivider: { height: 1 },

  sectionHeader: { fontSize: 11, letterSpacing: 1.2, marginTop: 4 },

  session: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  sessionTitle: { fontSize: 14 },
  sessionMeta: { fontSize: 11 },
  sessionAmount: { fontSize: 15 },
  sessionDue: { fontSize: 11 },
  draftPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  draftPillText: { fontSize: 10, letterSpacing: 0.3 },

  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 12,
  },
  addRowText: { fontSize: 13 },

  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 10,
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  emptyText: { fontSize: 13, textAlign: "center" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 2,
  },
  addBtnText: { color: "#fff", fontSize: 13 },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 13,
    borderRadius: 14,
  },
  actionBtnText: { fontSize: 14 },

  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  modalTitle: { fontSize: 18 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalBtnText: { fontSize: 14 },
});
