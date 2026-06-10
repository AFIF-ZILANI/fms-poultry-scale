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
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { loadDrafts, deleteDraft } from "@/lib/storage";
import { formatWeight } from "@/lib/utils";
import type { DraftSession } from "@/lib/types";

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DraftCard({
  draft,
  index,
  theme,
  t,
  onDelete,
  onResume,
}: {
  draft: DraftSession;
  index: number;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useSettings>["t"];
  onDelete: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const handleDelete = () => {
    if (Platform.OS === "web") {
      onDelete(draft.id);
    } else {
      Alert.alert(t.discardDraft, t.discardDraftMessage, [
        { text: t.cancel, style: "cancel" },
        {
          text: t.discard,
          style: "destructive",
          onPress: () => onDelete(draft.id),
        },
      ]);
    }
  };

  return (
    <Animated.View
      entering={
        Platform.OS !== "web"
          ? FadeInDown.delay(index * 60).springify()
          : undefined
      }
    >
      <Pressable
        onPress={() => onResume(draft.id)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            opacity: pressed ? 0.92 : 1,
            ...Platform.select({
              web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" } as object,
              default: {
                shadowColor: theme.cardShadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 1,
                shadowRadius: 8,
                elevation: 3,
              },
            }),
          },
        ]}
      >
        <View style={styles.cardLeft}>
          <View
            style={[styles.iconWrap, { backgroundColor: theme.warmLight }]}
          >
            <MaterialCommunityIcons
              name="progress-clock"
              size={22}
              color={theme.warm}
            />
          </View>
          <View style={styles.cardInfo}>
            <Text
              style={[
                styles.cardTitle,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(draft.totalWeightKg)}{" "}
              <Text style={[styles.cardUnit, { color: theme.textTertiary }]}>
                KG
              </Text>
            </Text>
            <View style={styles.cardMeta}>
              <MaterialCommunityIcons
                name="bird"
                size={12}
                color={theme.warm}
              />
              <Text
                style={[
                  styles.cardMetaText,
                  { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                ]}
              >
                {draft.totalPcs} {t.birds.toLowerCase()}
              </Text>
              <View
                style={[styles.dot, { backgroundColor: theme.textTertiary }]}
              />
              <Feather name="layers" size={11} color={theme.textTertiary} />
              <Text
                style={[
                  styles.cardMetaText,
                  { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                ]}
              >
                {draft.rows.length} row{draft.rows.length !== 1 ? "s" : ""}
              </Text>
              <View
                style={[styles.dot, { backgroundColor: theme.textTertiary }]}
              />
              <Text
                style={[
                  styles.cardMetaText,
                  { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
                ]}
              >
                {formatRelative(draft.updatedAt)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardRight}>
          <Pressable
            onPress={handleDelete}
            hitSlop={12}
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
          <View
            style={[styles.resumeBtn, { backgroundColor: theme.accentLight }]}
          >
            <Feather name="play" size={14} color={theme.accent} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function DraftsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const [drafts, setDrafts] = useState<DraftSession[]>([]);
  const [loading, setLoading] = useState(true);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDrafts().then((data) => {
        setDrafts(data);
        setLoading(false);
      });
    }, [])
  );

  const handleDelete = async (id: string) => {
    await deleteDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleResume = (id: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push({ pathname: "/measurement", params: { draftId: id } });
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
            styles.backBtn,
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
            {t.draftsTitle}
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
            {drafts.length > 0
              ? t.draftsPaused(drafts.length)
              : t.noDraftsSaved}
          </Text>
        </View>
        <View style={{ width: 36 }} />
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
      ) : drafts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View
            style={[styles.emptyIcon, { backgroundColor: theme.accentLight }]}
          >
            <Feather name="inbox" size={36} color={theme.accent} />
          </View>
          <Text
            style={[
              styles.emptyTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {t.noDraftSessions}
          </Text>
          <Text
            style={[
              styles.emptyText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.draftsAutoSave}
          </Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <DraftCard
              draft={item}
              index={index}
              theme={theme}
              t={t}
              onDelete={handleDelete}
              onResume={handleResume}
            />
          )}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + webBottomInset + 24,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!drafts.length}
        />
      )}
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, textAlign: "center" },
  headerSub: { fontSize: 12, textAlign: "center", marginTop: 1 },
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    justifyContent: "space-between",
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 20 },
  cardUnit: { fontSize: 13 },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    flexWrap: "wrap",
  },
  cardMetaText: { fontSize: 12 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 8 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
