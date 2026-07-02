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
import { FormatLog, formatWeight, getRelativeTime } from "@/lib/utils";
import { DraftSummary } from "@/lib/types";

function DraftCard({
  draft,
  index,
  theme,
  t,
  onDelete,
  onResume,
}: {
  draft: DraftSummary;
  index: number;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useSettings>["t"];
  onDelete: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // main can never have prior cull data — cull only exists after main is finished.
  // so expand is only meaningful when we're currently IN cull phase (main data exists behind it).
  const canExpand = draft.phase === "cull";

  const currentWeight =
    draft.phase === "main" ? draft.mainWeightKg : draft.cullWeightKg;
  const currentBirds =
    draft.phase === "main" ? draft.mainBirdCount : draft.cullBirdCount;
  const currentLogs = draft.phase === "main" ? draft.mainLog : draft.cullLog;

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

  const toggleExpand = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpanded((prev) => !prev);
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
        <View style={[styles.accentBar, { backgroundColor: theme.warm }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardMain}>
            {/* status: phase badge + neutral draft timestamp */}
            <View style={styles.statusRow}>
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
              <Text
                style={[
                  styles.sessionMeta,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                {t.session ?? "Session"} {getRelativeTime(draft.createdAt, t)}
              </Text>
            </View>

            {/* current phase weight - primary value */}
            <Text
              style={[
                styles.cardTitle,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(currentWeight)}{" "}
              <Text style={[styles.cardUnit, { color: theme.textTertiary }]}>
                KG
              </Text>
            </Text>

            {/* current phase birds + logs */}
            <View style={styles.statGroupRow}>
              <MaterialCommunityIcons
                name="bird"
                size={12}
                color={theme.textTertiary}
              />
              <Text
                style={[
                  styles.statValue,
                  { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {currentBirds}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                {t.birds ?? "birds"}
              </Text>
              <View style={[styles.dot, { backgroundColor: theme.border }]} />
              <Feather name="layers" size={11} color={theme.textTertiary} />
              <Text
                style={[
                  styles.statValue,
                  { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {currentLogs}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                {t.logs ?? "logs"}
              </Text>
            </View>

            {/* expanded: main phase data, only reachable from cull phase */}
            {canExpand && expanded && (
              <Animated.View
                entering={
                  Platform.OS !== "web" ? FadeInDown.springify() : undefined
                }
                style={[styles.expandedBlock, { borderTopColor: theme.border }]}
              >
                <Text
                  style={[
                    styles.statGroupLabel,
                    {
                      color: theme.textTertiary,
                      fontFamily: "Outfit_600SemiBold",
                    },
                  ]}
                >
                  MAIN PHASE
                </Text>
                <View style={styles.expandedRow}>
                  <Text
                    style={[
                      styles.expandedWeight,
                      { color: theme.text, fontFamily: "Outfit_700Bold" },
                    ]}
                  >
                    {formatWeight(draft.mainWeightKg)}{" "}
                    <Text style={{ fontSize: 12, color: theme.textTertiary }}>
                      KG
                    </Text>
                  </Text>
                  <View style={styles.statGroupRow}>
                    <MaterialCommunityIcons
                      name="bird"
                      size={12}
                      color={theme.textTertiary}
                    />
                    <Text
                      style={[
                        styles.statValue,
                        { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                      ]}
                    >
                      {draft.mainBirdCount}
                    </Text>
                    <View
                      style={[styles.dot, { backgroundColor: theme.border }]}
                    />
                    <Feather
                      name="layers"
                      size={11}
                      color={theme.textTertiary}
                    />
                    <Text
                      style={[
                        styles.statValue,
                        { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                      ]}
                    >
                      {draft.mainLog}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* expand trigger - only exists when there's actually something behind it */}
            {canExpand && (
              <Pressable
                onPress={toggleExpand}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.expandTrigger,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.expandTriggerText,
                    { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {expanded
                    ? (t.showLess ?? "Show less")
                    : (t.showMainPhase ?? "Show main phase")}
                </Text>
                <Feather
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.accent}
                />
              </Pressable>
            )}
          </View>

          <View style={styles.cardRight}>
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
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      setLoading(true);
      loadDrafts(user.id).then((data) => {
        setDrafts(data);
        FormatLog("Loaded drafts:", data);
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
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1, gap: 5 },
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
  metaTextSecondary: { fontSize: 12 },
  metaTextTertiary: { fontSize: 11 },

  card: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  accentBar: { width: 3 },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statsBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 2,
  },
  statGroup: { gap: 3 },
  statSubvalue: { fontSize: 11, marginTop: 1 },
  statDivider: { width: 1, alignSelf: "stretch", marginTop: 14 },
  // ----

  cardMain: { flex: 1, gap: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  phaseBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  phaseBadgeText: { fontSize: 10, letterSpacing: 0.3 },
  statusTime: { fontSize: 12 },
  cardTitle: { fontSize: 22, lineHeight: 26 },
  cardUnit: { fontSize: 13 },
  statGroupRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statValue: { fontSize: 12 },
  statLabel: { fontSize: 11 },
  statGroupLabel: { fontSize: 9, letterSpacing: 0.5 },
  dot: { width: 2.5, height: 2.5, borderRadius: 1.25 },
  expandedBlock: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  expandedRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  expandedWeight: { fontSize: 16 },
  expandTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
    alignSelf: "flex-start",
  },
  expandTriggerText: { fontSize: 12 },
  cardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
    paddingTop: 2,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionMeta: {
    fontSize: 11,
    marginTop: 2,
    marginBottom: 4,
  },
});
