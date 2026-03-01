import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { formatWeight, formatDateTime } from "@/lib/utils";
import type { RowEditEntry } from "@/lib/types";

export default function RowHistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    rowNumber: string;
    history: string;
    currentWeightKg: string;
    currentPcs: string;
  }>();

  const rowNumber = params.rowNumber ?? "?";
  const currentWeightKg = parseFloat(params.currentWeightKg ?? "0");
  const currentPcs = parseInt(params.currentPcs ?? "0", 10);
  const history: RowEditEntry[] = params.history
    ? JSON.parse(params.history)
    : [];

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
        <View style={styles.titleRow}>
          <View
            style={[styles.rowBadge, { backgroundColor: theme.accentLight }]}
          >
            <Text
              style={[
                styles.rowBadgeText,
                { color: theme.accent, fontFamily: "Outfit_700Bold" },
              ]}
            >
              #{rowNumber}
            </Text>
          </View>
          <Text
            style={[
              styles.topBarTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            Edit History
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + webBottomInset + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[styles.currentCard, { backgroundColor: theme.timerBg }]}
        >
          <Text
            style={[styles.currentLabel, { fontFamily: "Outfit_400Regular" }]}
          >
            Current
          </Text>
          <Text
            style={[styles.currentVal, { fontFamily: "Outfit_700Bold" }]}
          >
            {formatWeight(currentWeightKg)} KG
          </Text>
          <Text
            style={[
              styles.currentPcs,
              { fontFamily: "Outfit_400Regular" },
            ]}
          >
            {currentPcs} birds
          </Text>
        </View>

        {history.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="clock" size={32} color={theme.textTertiary} />
            <Text
              style={[
                styles.emptyText,
                {
                  color: theme.textTertiary,
                  fontFamily: "Outfit_400Regular",
                },
              ]}
            >
              No edits recorded for this row
            </Text>
          </View>
        ) : (
          <>
            <Text
              style={[
                styles.sectionLabel,
                {
                  color: theme.textTertiary,
                  fontFamily: "Outfit_600SemiBold",
                },
              ]}
            >
              {history.length} EDIT{history.length !== 1 ? "S" : ""} — NEWEST
              FIRST
            </Text>

            {history.map((entry, idx) => (
              <Animated.View
                key={entry.id}
                entering={
                  Platform.OS !== "web"
                    ? FadeInDown.delay(idx * 60).springify()
                    : undefined
                }
              >
                <View
                  style={[
                    styles.editCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.borderLight,
                    },
                  ]}
                >
                  <View style={styles.editCardTop}>
                    <View
                      style={[
                        styles.editNum,
                        { backgroundColor: theme.accentLight },
                      ]}
                    >
                      <Text
                        style={[
                          styles.editNumText,
                          {
                            color: theme.accent,
                            fontFamily: "Outfit_700Bold",
                          },
                        ]}
                      >
                        {history.length - idx}
                      </Text>
                    </View>
                    <View style={styles.editMeta}>
                      <Text
                        style={[
                          styles.editDate,
                          {
                            color: theme.text,
                            fontFamily: "Outfit_600SemiBold",
                          },
                        ]}
                      >
                        {formatDateTime(entry.timestamp)}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.diffRow,
                      { borderTopColor: theme.borderLight },
                    ]}
                  >
                    <View style={styles.diffCol}>
                      <Text
                        style={[
                          styles.diffColLabel,
                          {
                            color: theme.textTertiary,
                            fontFamily: "Outfit_400Regular",
                          },
                        ]}
                      >
                        Before
                      </Text>
                      <Text
                        style={[
                          styles.diffWeight,
                          {
                            color: theme.danger,
                            fontFamily: "Outfit_700Bold",
                          },
                        ]}
                      >
                        {formatWeight(entry.previousWeightKg)} KG
                      </Text>
                      <Text
                        style={[
                          styles.diffPcs,
                          {
                            color: theme.textSecondary,
                            fontFamily: "Outfit_400Regular",
                          },
                        ]}
                      >
                        {entry.previousPcs} birds
                      </Text>
                    </View>

                    <View style={styles.diffArrow}>
                      <Feather
                        name="arrow-right"
                        size={18}
                        color={theme.textTertiary}
                      />
                    </View>

                    <View style={[styles.diffCol, { alignItems: "flex-end" }]}>
                      <Text
                        style={[
                          styles.diffColLabel,
                          {
                            color: theme.textTertiary,
                            fontFamily: "Outfit_400Regular",
                          },
                        ]}
                      >
                        After
                      </Text>
                      <Text
                        style={[
                          styles.diffWeight,
                          {
                            color: theme.success,
                            fontFamily: "Outfit_700Bold",
                          },
                        ]}
                      >
                        {formatWeight(entry.newWeightKg)} KG
                      </Text>
                      <Text
                        style={[
                          styles.diffPcs,
                          {
                            color: theme.textSecondary,
                            fontFamily: "Outfit_400Regular",
                          },
                        ]}
                      >
                        {entry.newPcs} birds
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.deltaBadge,
                      {
                        backgroundColor:
                          entry.newWeightKg > entry.previousWeightKg
                            ? theme.successLight
                            : theme.dangerLight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.deltaText,
                        {
                          color:
                            entry.newWeightKg > entry.previousWeightKg
                              ? theme.success
                              : theme.danger,
                          fontFamily: "Outfit_600SemiBold",
                        },
                      ]}
                    >
                      {entry.newWeightKg > entry.previousWeightKg ? "+" : ""}
                      {formatWeight(entry.newWeightKg - entry.previousWeightKg)}{" "}
                      KG
                      {entry.newPcs !== entry.previousPcs
                        ? `, ${entry.newPcs > entry.previousPcs ? "+" : ""}${entry.newPcs - entry.previousPcs} birds`
                        : ""}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  rowBadgeText: { fontSize: 14 },
  topBarTitle: { fontSize: 16 },
  currentCard: {
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  currentLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  currentVal: { fontSize: 32, color: "#FFF" },
  currentPcs: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { fontSize: 14, textAlign: "center" },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 2,
  },
  editCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  editCardTop: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  editNum: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  editNumText: { fontSize: 14 },
  editMeta: { flex: 1 },
  editDate: { fontSize: 13 },
  diffRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  diffCol: { flex: 1 },
  diffColLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  diffWeight: { fontSize: 18 },
  diffPcs: { fontSize: 12, marginTop: 2 },
  diffArrow: {
    paddingHorizontal: 8,
  },
  deltaBadge: {
    marginHorizontal: 14,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  deltaText: { fontSize: 13 },
});
