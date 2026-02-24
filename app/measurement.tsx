import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useTheme } from "@/lib/useTheme";
import { formatWeight, getRelativeTime } from "@/lib/utils";
import type { MeasurementRow } from "@/lib/types";

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function RowItem({
  row,
  rowNumber,
  theme,
}: {
  row: MeasurementRow;
  rowNumber: number;
  theme: ReturnType<typeof useTheme>;
}) {
  const [timeAgo, setTimeAgo] = useState(getRelativeTime(row.timestamp));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(getRelativeTime(row.timestamp));
    }, 5000);
    return () => clearInterval(interval);
  }, [row.timestamp]);

  return (
    <Animated.View
      entering={
        Platform.OS !== "web"
          ? FadeInDown.springify().damping(18)
          : undefined
      }
    >
      <View
        style={[
          styles.rowCard,
          { backgroundColor: theme.surface, borderColor: theme.borderLight },
        ]}
      >
        <View style={[styles.rowNum, { backgroundColor: theme.accentLight }]}>
          <Text
            style={[
              styles.rowNumText,
              { color: theme.accent, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {rowNumber}
          </Text>
        </View>
        <View style={styles.rowInfo}>
          <Text
            style={[
              styles.rowWeight,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {formatWeight(row.weightKg)}
            <Text style={{ fontSize: 13, fontFamily: "Outfit_500Medium" }}>
              {" "}
              KG
            </Text>
          </Text>
          <Text
            style={[
              styles.rowTimeText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {timeAgo}
          </Text>
        </View>
        <View style={[styles.rowPcsBadge, { backgroundColor: theme.warmLight }]}>
          <MaterialCommunityIcons
            name="bird"
            size={13}
            color={theme.warm}
          />
          <Text
            style={[
              styles.rowPcsText,
              { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {row.pcs}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function MeasurementScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [pcsInput, setPcsInput] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const weightRef = useRef<TextInput>(null);
  const pcsRef = useRef<TextInput>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalWeight = rows.reduce((sum, r) => sum + r.weightKg, 0);
  const totalPcs = rows.reduce((sum, r) => sum + r.pcs, 0);
  const avgWeight = totalPcs > 0 ? totalWeight / totalPcs : 0;

  const handleAddRow = useCallback(() => {
    const weight = parseFloat(weightInput);
    const pcs = parseInt(pcsInput, 10);

    if (isNaN(weight) || weight <= 0 || isNaN(pcs) || pcs <= 0) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    const newRow: MeasurementRow = {
      id: Crypto.randomUUID(),
      weightKg: weight,
      pcs,
      timestamp: Date.now(),
    };

    setRows((prev) => [newRow, ...prev]);
    setWeightInput("");
    setPcsInput("");
    setTimeout(() => weightRef.current?.focus(), 100);

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [weightInput, pcsInput]);

  const handleDeleteLast = () => {
    if (rows.length === 0) return;
    if (Platform.OS === "web") {
      setRows((prev) => prev.slice(1));
    } else {
      Alert.alert("Undo Last", "Remove the most recent weighing?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setRows((prev) => prev.slice(1));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]);
    }
  };

  const handleEndMeasurement = () => {
    if (rows.length === 0) {
      if (Platform.OS === "web") return;
      Alert.alert("No Data", "Add at least one weighing first.");
      return;
    }

    const doEnd = () => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      router.push({
        pathname: "/report",
        params: { rows: JSON.stringify(rows) },
      });
    };

    if (Platform.OS === "web") {
      doEnd();
    } else {
      Alert.alert("Finish Weighing?", "End this session and view report?", [
        { text: "Cancel", style: "cancel" },
        { text: "Finish", style: "default", onPress: doEnd },
      ]);
    }
  };

  const handleBack = () => {
    if (rows.length > 0) {
      if (Platform.OS === "web") {
        router.back();
        return;
      }
      Alert.alert("Discard?", "All unsaved weighings will be lost.", [
        { text: "Stay", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const canAdd =
    weightInput.length > 0 &&
    pcsInput.length > 0 &&
    !isNaN(parseFloat(weightInput)) &&
    parseFloat(weightInput) > 0 &&
    !isNaN(parseInt(pcsInput, 10)) &&
    parseInt(pcsInput, 10) > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
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
          onPress={handleBack}
          hitSlop={16}
          style={({ pressed }) => [
            styles.navBtn,
            { backgroundColor: theme.borderLight, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <Text
          style={[
            styles.topBarTitle,
            { color: theme.text, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          Weighing Session
        </Text>
        {rows.length > 0 ? (
          <Pressable
            onPress={handleDeleteLast}
            hitSlop={12}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: theme.dangerLight, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Feather name="rotate-ccw" size={16} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <Animated.View
        style={[styles.displayPanel, { backgroundColor: theme.timerBg }]}
        entering={Platform.OS !== "web" ? FadeIn.delay(100) : undefined}
      >
        <View style={styles.timerRow}>
          <Feather name="clock" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={[styles.timerText, { fontFamily: "Outfit_600SemiBold" }]}>
            {formatTimer(elapsedSeconds)}
          </Text>
        </View>

        <Text
          style={[
            styles.displayWeight,
            { fontFamily: "Outfit_700Bold" },
          ]}
        >
          {formatWeight(totalWeight)}
        </Text>
        <Text style={[styles.displayKg, { fontFamily: "Outfit_500Medium" }]}>
          KG
        </Text>

        <View style={styles.displayStats}>
          <View style={styles.displayStatItem}>
            <MaterialCommunityIcons
              name="bird"
              size={16}
              color="rgba(255,255,255,0.5)"
            />
            <Text
              style={[
                styles.displayStatVal,
                { fontFamily: "Outfit_700Bold" },
              ]}
            >
              {totalPcs}
            </Text>
            <Text
              style={[
                styles.displayStatLabel,
                { fontFamily: "Outfit_400Regular" },
              ]}
            >
              birds
            </Text>
          </View>
          <View style={styles.displayStatDot} />
          <View style={styles.displayStatItem}>
            <Feather
              name="trending-up"
              size={14}
              color="rgba(255,255,255,0.5)"
            />
            <Text
              style={[
                styles.displayStatVal,
                { fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(avgWeight)}
            </Text>
            <Text
              style={[
                styles.displayStatLabel,
                { fontFamily: "Outfit_400Regular" },
              ]}
            >
              avg kg
            </Text>
          </View>
        </View>
      </Animated.View>

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={styles.inputGroup}>
          <View style={styles.inputCol}>
            <Text
              style={[
                styles.inputLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              Weight (KG)
            </Text>
            <TextInput
              ref={weightRef}
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={theme.textTertiary}
              returnKeyType="next"
              onSubmitEditing={() => pcsRef.current?.focus()}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: theme.border,
                  fontFamily: "Outfit_600SemiBold",
                },
              ]}
              testID="weight-input"
            />
          </View>
          <View style={styles.inputColSmall}>
            <Text
              style={[
                styles.inputLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              Birds
            </Text>
            <TextInput
              ref={pcsRef}
              value={pcsInput}
              onChangeText={setPcsInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={theme.textTertiary}
              returnKeyType="done"
              onSubmitEditing={handleAddRow}
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: theme.border,
                  fontFamily: "Outfit_600SemiBold",
                },
              ]}
              testID="pcs-input"
            />
          </View>
          <Pressable
            onPress={handleAddRow}
            disabled={!canAdd}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: canAdd ? theme.accent : theme.border,
                transform: [{ scale: pressed && canAdd ? 0.92 : 1 }],
              },
            ]}
            testID="add-button"
          >
            <Ionicons
              name="add"
              size={24}
              color={canAdd ? "#FFF" : theme.textTertiary}
            />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <RowItem
            row={item}
            rowNumber={rows.length - index}
            theme={theme}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + webBottomInset + 90,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!rows.length}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyRows}>
            <Feather name="inbox" size={28} color={theme.textTertiary} />
            <Text
              style={[
                styles.emptyRowsText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              Enter weight and bird count above to start
            </Text>
          </View>
        }
      />

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + webBottomInset + 12,
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
          },
        ]}
      >
        <Pressable
          onPress={handleEndMeasurement}
          disabled={rows.length === 0}
          style={({ pressed }) => [
            styles.endBtn,
            {
              backgroundColor:
                rows.length > 0 ? theme.accent : theme.border,
              transform: [{ scale: pressed && rows.length > 0 ? 0.97 : 1 }],
            },
          ]}
          testID="end-button"
        >
          <Feather
            name="check-circle"
            size={20}
            color={rows.length > 0 ? "#FFF" : theme.textTertiary}
          />
          <Text
            style={[
              styles.endBtnText,
              {
                color: rows.length > 0 ? "#FFF" : theme.textTertiary,
                fontFamily: "Outfit_700Bold",
              },
            ]}
          >
            Finish Weighing
          </Text>
          {rows.length > 0 && (
            <View style={styles.endBtnBadge}>
              <Text style={[styles.endBtnBadgeText, { fontFamily: "Outfit_600SemiBold" }]}>
                {rows.length}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  topBarTitle: { fontSize: 16 },
  displayPanel: {
    alignItems: "center",
    paddingVertical: 18,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 22,
    overflow: "hidden",
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  timerText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 2,
  },
  displayWeight: {
    fontSize: 52,
    color: "#FFFFFF",
    lineHeight: 60,
    marginTop: 2,
  },
  displayKg: {
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    marginTop: -2,
    letterSpacing: 2,
  },
  displayStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 20,
  },
  displayStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  displayStatVal: {
    fontSize: 18,
    color: "#FFFFFF",
  },
  displayStatLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  displayStatDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  inputBar: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputCol: { flex: 1.4 },
  inputColSmall: { flex: 0.8 },
  inputLabel: {
    fontSize: 11,
    marginBottom: 5,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  input: {
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 20,
    borderWidth: 1,
  },
  addBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
  },
  rowNum: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowNumText: { fontSize: 15 },
  rowInfo: { flex: 1 },
  rowWeight: { fontSize: 17 },
  rowTimeText: { fontSize: 12, marginTop: 2 },
  rowPcsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  rowPcsText: { fontSize: 14 },
  emptyRows: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 10,
  },
  emptyRowsText: { fontSize: 14, textAlign: "center" },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  endBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  endBtnText: { fontSize: 16 },
  endBtnBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 2,
  },
  endBtnBadgeText: { fontSize: 12, color: "#FFF" },
});
