import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { useUser } from "@clerk/expo";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { createBatch, loadBatches } from "@/lib/storage";
import { formatWeight, formatTk, formatDateTime } from "@/lib/utils";
import { Band as BAND } from "@/constants/colors";
import type { BatchSummary } from "@/lib/types";

type Filter = "all" | "active" | "closed";

// Facts hang off the band's baseline rule, same idiom as the home readout.
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
          <Text style={[styles.factUnit, { fontFamily: "Outfit_500Medium" }]}>
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

function FilterToggle({
  options,
  active,
  onSelect,
}: {
  options: { label: string; value: Filter }[];
  active: Filter;
  onSelect: (v: Filter) => void;
}) {
  return (
    <View style={styles.toggleRow}>
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
                color: active === opt.value ? BAND.ink : BAND.inkFaint,
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

function BatchCard({
  batch,
  index,
  theme,
  t,
}: {
  batch: BatchSummary;
  index: number;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useSettings>["t"];
}) {
  const isClosed = batch.closedAt != null;
  const hasMoney = batch.revenue > 0;
  const avgBirdKg = batch.birds > 0 ? batch.weightKg / batch.birds : 0;

  // Closed business recedes; open business stays legible.
  const dim = isClosed;

  return (
    <Animated.View
      entering={
        Platform.OS !== "web"
          ? FadeInDown.delay(index * 35).springify()
          : undefined
      }
    >
      <Pressable
        onPress={() =>
          router.push({ pathname: "/batch/[id]", params: { id: batch.id } })
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
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isClosed ? theme.textTertiary : theme.success,
              },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.cardName,
                {
                  color: dim ? theme.textSecondary : theme.text,
                  fontFamily: "Outfit_600SemiBold",
                },
              ]}
              numberOfLines={1}
            >
              {batch.name}
            </Text>
            <Text
              style={[
                styles.cardMeta,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
              numberOfLines={1}
            >
              {t.batchSessions(batch.sessionCount)}
              {batch.draftCount > 0
                ? ` · ${batch.draftCount} ${t.inProgress}`
                : ""}
              {` · ${formatDateTime(batch.createdAt)}`}
              {isClosed ? ` · ${t.batchClosed}` : ""}
            </Text>
          </View>
          <Feather name="chevron-right" size={17} color={theme.textTertiary} />
        </View>

        {hasMoney ? (
          <View style={styles.cardMoney}>
            <View style={styles.moneyRow}>
              <Text
                style={[
                  styles.revenue,
                  {
                    color: dim ? theme.textSecondary : theme.text,
                    fontFamily: "IBMPlexMono_600SemiBold",
                  },
                ]}
                numberOfLines={1}
              >
                {formatTk(batch.revenue)}
              </Text>
              {batch.discount > 0 && (
                <View
                  style={[styles.discountPill, { backgroundColor: theme.warmLight }]}
                >
                  <Text
                    style={[
                      styles.discountPillText,
                      {
                        color: theme.warm,
                        fontFamily: "IBMPlexMono_600SemiBold",
                      },
                    ]}
                  >
                    −{formatTk(batch.discount)}
                  </Text>
                  <Text
                    style={[
                      styles.discountPillSuffix,
                      { color: theme.warm, fontFamily: "Outfit_500Medium" },
                    ]}
                  >
                    {t.discountShort}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.cardMoney}>
            <Text
              style={[
                styles.emptyBatchText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {t.batchEmptyHint}
            </Text>
          </View>
        )}

        <View
          style={[styles.cardRule, { backgroundColor: theme.borderLight }]}
        />

        <View style={styles.cardFacts}>
          <CardFact
            value={formatWeight(batch.weightKg)}
            unit="KG"
            label={t.netKg}
            theme={theme}
          />
          <CardFact
            value={batch.birds > 0 ? batch.birds.toLocaleString() : "—"}
            label={t.birds}
            theme={theme}
          />
          <CardFact
            value={avgBirdKg > 0 ? formatWeight(avgBirdKg) : "—"}
            unit={avgBirdKg > 0 ? "KG" : undefined}
            label={t.avgBird}
            theme={theme}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function CardFact({
  value,
  unit,
  label,
  theme,
}: {
  value: string;
  unit?: string;
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.cardFact}>
      <View style={styles.factValueRow}>
        <Text
          style={[
            styles.cardFactValue,
            { color: theme.text, fontFamily: "IBMPlexMono_500Medium" },
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
        {!!unit && (
          <Text
            style={[
              styles.cardFactUnit,
              { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {unit}
          </Text>
        )}
      </View>
      <Text
        style={[
          styles.cardFactLabel,
          { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export default function BatchesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { user } = useUser();

  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const refresh = useCallback(() => {
    if (!user?.id) return;
    loadBatches(user.id, { includeClosed: true }).then((data) => {
      setBatches(data);
      setLoading(false);
    });
  }, [user?.id]);

  useFocusEffect(refresh);

  const openCreate = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    // Pre-fill with today's date so a farmer in a hurry can just tap save.
    setName(`${t.batches} — ${formatDateTime(Date.now())}`);
    setCreating(true);
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || !user?.id) return;
    const id = Crypto.randomUUID();
    await createBatch(user.id, id, trimmed);
    setCreating(false);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    router.push({ pathname: "/batch/[id]", params: { id } });
  };

  // Open batches first — the ones still owing money are the ones being worked.
  const visible = useMemo(() => {
    const matches = batches.filter((b) =>
      filter === "all"
        ? true
        : filter === "active"
          ? b.closedAt == null
          : b.closedAt != null,
    );
    return [...matches].sort((a, b) => {
      const aClosed = a.closedAt != null ? 1 : 0;
      const bClosed = b.closedAt != null ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      return b.createdAt - a.createdAt;
    });
  }, [batches, filter]);

  // The band reads the filtered set, so changing the filter changes what the
  // figure is about rather than just what is listed below it.
  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, b) => ({
          discount: acc.discount + b.discount,
          revenue: acc.revenue + b.revenue,
          received: acc.received + b.received,
          weightKg: acc.weightKg + b.weightKg,
          birds: acc.birds + b.birds,
          sessions: acc.sessions + b.sessionCount,
        }),
        {
          discount: 0,
          revenue: 0,
          received: 0,
          weightKg: 0,
          birds: 0,
          sessions: 0,
        },
      ),
    [visible],
  );

  const filterOptions: { label: string; value: Filter }[] = [
    { label: t.allBatches, value: "all" },
    { label: t.activeBatches, value: "active" },
    { label: t.closedBatches, value: "closed" },
  ];

  const header = (
    <View
      style={[
        styles.band,
        { backgroundColor: theme.isDark ? BAND.dark : BAND.light },
      ]}
    >
      <View style={styles.bandTop}>
        <Text style={[styles.eyebrow, { fontFamily: "Outfit_600SemiBold" }]}>
          {t.revenueLabel}
        </Text>
        <FilterToggle
          options={filterOptions}
          active={filter}
          onSelect={setFilter}
        />
      </View>

      <Text
        style={[
          styles.reading,
          {
            fontFamily: "IBMPlexMono_600SemiBold",
            color: totals.revenue > 0 ? BAND.ink : BAND.inkDim,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
      >
        {formatTk(totals.revenue)}
      </Text>

      <View style={styles.readingMetaRow}>
        <Text
          style={[styles.readingMeta, { fontFamily: "Outfit_400Regular" }]}
          numberOfLines={1}
        >
          {t.batchesCount(visible.length)} · {t.batchSessions(totals.sessions)}
        </Text>
      </View>

      <View style={[styles.bandRule, { backgroundColor: BAND.rule }]} />

      <View style={styles.factRow}>
        <Fact
          value={totals.discount > 0 ? `−${formatTk(totals.discount)}` : "—"}
          label={t.discountShort}
        />
        <Fact
          value={formatWeight(totals.weightKg)}
          unit="KG"
          label={t.netKg}
        />
        <Fact
          value={totals.birds > 0 ? totals.birds.toLocaleString() : "—"}
          label={t.birds}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + webTopInset + 10,
            backgroundColor: theme.surface,
            borderBottomColor: theme.borderLight,
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
        <View style={styles.headerTitleWrap}>
          <Text
            style={[
              styles.headerTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {t.batches}
          </Text>
        </View>
        <Pressable
          onPress={openCreate}
          hitSlop={16}
          style={({ pressed }) => [
            styles.newBtn,
            { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="plus" size={15} color="#fff" />
          <Text
            style={[styles.newBtnText, { fontFamily: "Outfit_600SemiBold" }]}
          >
            {t.newLabel}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.emptyWrap}>
          <Text
            style={[
              styles.emptyText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.loading}
          </Text>
        </View>
      ) : batches.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View
            style={[styles.emptyIcon, { backgroundColor: theme.accentLight }]}
          >
            <Feather name="layers" size={32} color={theme.accent} />
          </View>
          <Text
            style={[
              styles.emptyTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {t.batchesEmpty}
          </Text>
          <Text
            style={[
              styles.emptyText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.batchesEmptyHint}
          </Text>
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [
              styles.emptyBtn,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text
              style={[styles.emptyBtnText, { fontFamily: "Outfit_600SemiBold" }]}
            >
              {t.newBatch}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <BatchCard batch={item} index={index} theme={theme} t={t} />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.filterEmpty}>
              <Text
                style={[
                  styles.emptyText,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                {t.noBatchesInFilter}
              </Text>
            </View>
          }
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + webBottomInset + 24,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={creating}
        transparent
        animationType="fade"
        onRequestClose={() => setCreating(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCreating(false)}
          />
          <Animated.View
            entering={
              Platform.OS !== "web" ? FadeInDown.duration(180) : undefined
            }
            style={[
              styles.sheet,
              { backgroundColor: theme.surface, borderColor: theme.borderLight },
            ]}
          >
            <View style={styles.sheetHead}>
              <View
                style={[
                  styles.sheetIcon,
                  { backgroundColor: theme.accentLight },
                ]}
              >
                <Feather name="layers" size={17} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.sheetTitle,
                    { color: theme.text, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  {t.newBatch}
                </Text>
                <Text
                  style={[
                    styles.sheetHint,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_400Regular",
                    },
                  ]}
                >
                  {t.newBatchHint}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.fieldLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {t.batchName}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t.batchNamePlaceholder}
              placeholderTextColor={theme.textTertiary}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  fontFamily: "Outfit_500Medium",
                },
              ]}
            />

            <Pressable
              onPress={handleCreate}
              disabled={!name.trim()}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: theme.accent,
                  opacity: !name.trim() ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  { fontFamily: "Outfit_700Bold" },
                ]}
              >
                {t.save}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCreating(false)}
              style={({ pressed }) => [
                styles.ghostBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.ghostBtnText,
                  {
                    color: theme.textSecondary,
                    fontFamily: "Outfit_600SemiBold",
                  },
                ]}
              >
                {t.cancel}
              </Text>
            </Pressable>
          </Animated.View>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 19 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 12,
  },
  newBtnText: { color: "#fff", fontSize: 13 },

  // ── Readout band ──
  band: {
    marginTop: 16,
    marginBottom: 18,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
      default: {},
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
  reading: { fontSize: 36, letterSpacing: -0.5 },
  readingMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
    minHeight: 18,
  },
  readingMeta: { fontSize: 12, color: BAND.inkDim, flexShrink: 1 },
  readingAside: { fontSize: 11, color: BAND.inkFaint },
  bandRule: { height: 1, marginTop: 14 },

  toggleRow: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 18 },
  toggleBtnText: { fontSize: 10, letterSpacing: 0.3 },

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

  // ── Batch card ──
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 12,
    ...(Platform.OS !== "web"
      ? {
          shadowOpacity: 1,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
        }
      : {}),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  cardName: { fontSize: 15.5 },
  cardMeta: { fontSize: 11.5, marginTop: 1 },

  cardMoney: { marginTop: 12, gap: 7 },
  moneyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  revenue: { fontSize: 22, letterSpacing: -0.4, flexShrink: 1 },
  discountPill: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountPillText: { fontSize: 13 },
  discountPillSuffix: { fontSize: 10 },
  emptyBatchText: { fontSize: 11 },


  cardRule: { height: 1, marginTop: 12 },
  cardFacts: { flexDirection: "row", marginTop: 10 },
  cardFact: { flex: 1, gap: 1 },
  cardFactValue: { fontSize: 13.5 },
  cardFactUnit: { fontSize: 9.5 },
  cardFactLabel: {
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  // ── Empty ──
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    marginTop: 4,
  },
  emptyBtnText: { color: "#fff", fontSize: 14 },
  filterEmpty: { paddingVertical: 40, alignItems: "center" },

  // ── New-batch sheet ──
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 18,
  },
  sheetIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { fontSize: 17 },
  sheetHint: { fontSize: 12, marginTop: 1 },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  primaryBtnText: { color: "#fff", fontSize: 15 },
  ghostBtn: { alignItems: "center", paddingVertical: 12, marginTop: 2 },
  ghostBtnText: { fontSize: 14 },
});
