import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SectionList,
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
import type { BatchSummary } from "@/lib/types";

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
            ...(Platform.OS !== "web"
              ? { shadowColor: theme.cardShadow }
              : {}),
          },
        ]}
      >
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.cardName,
                { color: theme.text, fontFamily: "Outfit_600SemiBold" },
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
            >
              {t.batchSessions(batch.sessionCount)}
              {batch.draftCount > 0 ? ` · ${batch.draftCount} ${t.inProgress}` : ""}
              {" · "}
              {formatDateTime(batch.createdAt)}
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isClosed
                  ? theme.borderLight
                  : theme.accentLight,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color: isClosed ? theme.textTertiary : theme.accent,
                  fontFamily: "Outfit_600SemiBold",
                },
              ]}
            >
              {isClosed ? t.batchClosed : t.batchActive}
            </Text>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCell}>
            <Text
              style={[
                styles.statVal,
                { color: theme.accent, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(batch.weightKg)} KG
            </Text>
            <Text
              style={[
                styles.statKey,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.netKg}
            </Text>
          </View>
          <View
            style={[styles.divider, { backgroundColor: theme.borderLight }]}
          />
          <View style={styles.statCell}>
            <Text
              style={[
                styles.statVal,
                { color: theme.warm, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {batch.birds}
            </Text>
            <Text
              style={[
                styles.statKey,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.birds}
            </Text>
          </View>
          <View
            style={[styles.divider, { backgroundColor: theme.borderLight }]}
          />
          <View style={styles.statCell}>
            <Text
              style={[
                styles.statVal,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatTk(batch.revenue)}
            </Text>
            <Text
              style={[
                styles.statKey,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              {t.revenueLabel}
            </Text>
          </View>
        </View>

        {/* Outstanding money is the thing a farmer is actually chasing, so it
            gets its own line rather than hiding among the other stats. */}
        <View
          style={[
            styles.cardFooter,
            {
              backgroundColor:
                batch.due > 0 ? theme.dangerLight : theme.borderLight,
              borderTopColor: theme.borderLight,
            },
          ]}
        >
          <Feather
            name={batch.due > 0 ? "alert-circle" : "check-circle"}
            size={13}
            color={batch.due > 0 ? theme.danger : theme.textTertiary}
          />
          <Text
            style={[
              styles.footerText,
              {
                color: batch.due > 0 ? theme.danger : theme.textTertiary,
                fontFamily: "Outfit_600SemiBold",
              },
            ]}
          >
            {batch.due > 0
              ? `${formatTk(batch.due)} ${t.stillDue}`
              : t.paidUp}
          </Text>
          <Feather
            name="chevron-right"
            size={16}
            color={theme.textTertiary}
            style={{ marginLeft: "auto" }}
          />
        </View>
      </Pressable>
    </Animated.View>
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

  const active = batches.filter((b) => b.closedAt == null);
  const closed = batches.filter((b) => b.closedAt != null);
  const sections = [
    ...(active.length ? [{ title: t.activeBatches, data: active }] : []),
    ...(closed.length ? [{ title: t.closedBatches, data: closed }] : []),
  ];

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
        <View>
          <Text
            style={[
              styles.headerTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {t.batches}
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.batchSessions(batches.reduce((s, b) => s + b.sessionCount, 0))}
          </Text>
        </View>
        <Pressable
          onPress={openCreate}
          hitSlop={16}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: theme.accentLight, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="plus" size={20} color={theme.accent} />
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
            <Feather name="layers" size={36} color={theme.accent} />
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
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <BatchCard batch={item} index={index} theme={theme} t={t} />
          )}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                styles.sectionHeader,
                { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {section.title}
            </Text>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{
            padding: 16,
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
          <View
            style={[styles.modalCard, { backgroundColor: theme.surface }]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {t.newBatch}
            </Text>
            <Text
              style={[
                styles.modalLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
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
              returnKeyType="done"
              onSubmitEditing={handleCreate}
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
                onPress={() => setCreating(false)}
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
                onPress={handleCreate}
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
    justifyContent: "space-between",
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
  headerTitle: { fontSize: 18, textAlign: "center" },
  headerSub: { fontSize: 12, textAlign: "center", marginTop: 1 },

  sectionHeader: {
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 8,
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
    ...(Platform.OS !== "web"
      ? { shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }
      : {}),
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardName: { fontSize: 16 },
  cardMeta: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  badgeText: { fontSize: 10, letterSpacing: 0.3 },

  statRow: { flexDirection: "row", paddingHorizontal: 14, paddingBottom: 12 },
  statCell: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 15 },
  statKey: { fontSize: 10, letterSpacing: 0.3 },
  divider: { width: 1, marginVertical: 2 },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  footerText: { fontSize: 12 },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 76,
    height: 76,
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

  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 20, gap: 8 },
  modalTitle: { fontSize: 18 },
  modalLabel: { fontSize: 11, letterSpacing: 0.8, marginTop: 4 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalBtnText: { fontSize: 14 },
});
