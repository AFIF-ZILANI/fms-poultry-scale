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
import { useUser } from "@clerk/expo";
import { loadDrafts, deleteSale } from "@/lib/storage";
import { formatWeight, getRelativeTime } from "@/lib/utils";
import { SaleRecord } from "@/lib/types";

function DraftCard({
  draft,
  index,
  theme,
  t,
  onDelete,
  onResume,
}: {
  draft: SaleRecord;
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

  const rowCountLabel =
    draft.hasCull && draft.cullRows
      ? `${draft.rows.length} main · ${draft.cullRows.length} cull`
      : `${draft.rows.length} ${draft.rows.length === 1 ? "row" : "rows"}`;

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
              web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.05)" } as object,
              default: {
                shadowColor: theme.cardShadow,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 1,
                shadowRadius: 8,
                elevation: 2,
              },
            }),
          },
        ]}
      >
        {/* status accent - gives phase state at a glance without reading text */}
        <View style={[styles.accentBar, { backgroundColor: theme.warm }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardLeft}>
            <View
              style={[styles.iconWrap, { backgroundColor: theme.warmLight }]}
            >
              <MaterialCommunityIcons
                name="progress-clock"
                size={20}
                color={theme.warm}
              />
            </View>

            <View style={styles.cardInfo}>
              {/* primary value - largest, heaviest weight in the card */}
              <Text
                style={[
                  styles.cardTitle,
                  { color: theme.text, fontFamily: "Outfit_700Bold" },
                ]}
              >
                {formatWeight(draft.meta?.mainWeightKg || 0)}{" "}
                <Text style={[styles.cardUnit, { color: theme.textTertiary }]}>
                  KG
                </Text>
              </Text>

              {/* primary meta line - status badge + time, single row */}
              <View style={styles.metaRowPrimary}>
                <View
                  style={[
                    styles.phaseBadge,
                    { backgroundColor: theme.warmLight },
                  ]}
                >
                  <Text
                    style={[
                      styles.phaseBadgeText,
                      { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
                    ]}
                  >
                    {draft.phase.toUpperCase()}
                  </Text>
                </View>
                <View
                  style={[styles.dot, { backgroundColor: theme.textTertiary }]}
                />
                <Text
                  style={[
                    styles.metaTextSecondary,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_400Regular",
                    },
                  ]}
                >
                  {getRelativeTime(draft.updatedAt, t)}
                </Text>
              </View>

              {/* secondary meta line - de-emphasized, smaller, muted */}
              <View style={styles.metaRowSecondary}>
                <Feather name="layers" size={11} color={theme.textTertiary} />
                <Text
                  style={[
                    styles.metaTextTertiary,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_400Regular",
                    },
                  ]}
                >
                  {rowCountLabel}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.cardRight}>
            {/* ghost delete - present but visually recessive, not competing with resume affordance */}
            <Pressable
              onPress={handleDelete}
              hitSlop={12}
              style={({ pressed }) => [
                styles.deleteBtn,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <Feather name="trash-2" size={16} color={theme.textTertiary} />
            </Pressable>

            {/* chevron = the actual affordance for "this whole card is tappable to resume" */}
            <Feather
              name="chevron-right"
              size={18}
              color={theme.textTertiary}
            />
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
  const { user } = useUser();
  const [drafts, setDrafts] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      setLoading(true);
      loadDrafts(user.id).then((data) => {
        setDrafts(data);
        setLoading(false);
      });
    }, [user?.id]),
  );

  const handleDelete = async (id: string) => {
    await deleteSale(id);
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
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    flexWrap: "wrap",
  },
  cardMetaText: { fontSize: 12 },
  resumeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  accentBar: {
    width: 3,
  },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1, gap: 5 },
  cardTitle: { fontSize: 19, lineHeight: 23 },
  cardUnit: { fontSize: 12 },
  metaRowPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaRowSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  phaseBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  phaseBadgeText: { fontSize: 10, letterSpacing: 0.3 },
  metaTextSecondary: { fontSize: 12 },
  metaTextTertiary: { fontSize: 11 },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.25 },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
