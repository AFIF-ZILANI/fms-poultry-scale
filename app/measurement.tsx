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
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useTheme } from "@/lib/useTheme";
import { formatWeight, getRelativeTime } from "@/lib/utils";
import type { MeasurementRow } from "@/lib/types";

function MeasurementRowCard({
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
      entering={Platform.OS !== "web" ? FadeInDown.springify().damping(18) : undefined}
    >
      <View
        style={[
          styles.rowCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderLight,
          },
        ]}
      >
        <View
          style={[styles.rowNumber, { backgroundColor: theme.accentLight }]}
        >
          <Text
            style={[
              styles.rowNumberText,
              { color: theme.accent, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {rowNumber}
          </Text>
        </View>
        <View style={styles.rowContent}>
          <View style={styles.rowMainInfo}>
            <Text
              style={[
                styles.rowWeight,
                { color: theme.text, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {formatWeight(row.weightKg)} KG
            </Text>
            <View style={styles.rowPcsBadge}>
              <Text
                style={[
                  styles.rowPcsLabel,
                  { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {row.pcs} PCS
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.rowTime,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {timeAgo}
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
  const [showInputs, setShowInputs] = useState(false);
  const weightRef = useRef<TextInput>(null);
  const pcsRef = useRef<TextInput>(null);

  const totalWeight = rows.reduce((sum, r) => sum + r.weightKg, 0);
  const totalPcs = rows.reduce((sum, r) => sum + r.pcs, 0);
  const avgWeight = totalPcs > 0 ? totalWeight / totalPcs : 0;

  const handleAddRow = useCallback(() => {
    const weight = parseFloat(weightInput);
    const pcs = parseInt(pcsInput, 10);

    if (isNaN(weight) || weight <= 0) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }
    if (isNaN(pcs) || pcs <= 0) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    const newRow: MeasurementRow = {
      id: Crypto.randomUUID(),
      weightKg: weight,
      pcs: pcs,
      timestamp: Date.now(),
    };

    setRows((prev) => [newRow, ...prev]);
    setWeightInput("");
    setPcsInput("");
    weightRef.current?.focus();

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [weightInput, pcsInput]);

  const handleDeleteLast = () => {
    if (rows.length === 0) return;
    if (Platform.OS === "web") {
      setRows((prev) => prev.slice(1));
    } else {
      Alert.alert("Delete Last Row", "Remove the most recent measurement?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
      Alert.alert("No Data", "Add at least one measurement first.");
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
      Alert.alert(
        "End Measurement",
        "Are you sure you want to finish this measurement session?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "End & View Report", style: "default", onPress: doEnd },
        ]
      );
    }
  };

  const handleToggleInputs = () => {
    setShowInputs((prev) => !prev);
    if (!showInputs) {
      setTimeout(() => weightRef.current?.focus(), 300);
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleBack = () => {
    if (rows.length > 0) {
      if (Platform.OS === "web") {
        router.back();
        return;
      }
      Alert.alert(
        "Discard Measurements?",
        "You have unsaved measurements. Going back will discard them.",
        [
          { text: "Stay", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ]
      );
    } else {
      router.back();
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

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
            borderBottomColor: theme.borderLight,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text
          style={[
            styles.topBarTitle,
            { color: theme.text, fontFamily: "Outfit_600SemiBold" },
          ]}
        >
          New Measurement
        </Text>
        {rows.length > 0 ? (
          <Pressable
            onPress={handleDeleteLast}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Feather name="delete" size={20} color={theme.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <Animated.View
        style={[styles.display, { backgroundColor: theme.surface }]}
        entering={Platform.OS !== "web" ? FadeIn.delay(100) : undefined}
      >
        <Text
          style={[
            styles.displayLabel,
            { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
          ]}
        >
          TOTAL WEIGHT
        </Text>
        <Text
          style={[
            styles.displayValue,
            { color: theme.accent, fontFamily: "Outfit_700Bold" },
          ]}
        >
          {formatWeight(totalWeight)}
        </Text>
        <Text
          style={[
            styles.displayUnit,
            { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
          ]}
        >
          KG
        </Text>

        <View style={styles.displayDivider}>
          <View
            style={[styles.displayDividerLine, { backgroundColor: theme.border }]}
          />
        </View>

        <View style={styles.displayRow}>
          <View style={styles.displayStat}>
            <Text
              style={[
                styles.displayStatValue,
                { color: theme.warm, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {totalPcs}
            </Text>
            <Text
              style={[
                styles.displayStatLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              Total PCS
            </Text>
          </View>
          <View
            style={[
              styles.displayVertDivider,
              { backgroundColor: theme.border },
            ]}
          />
          <View style={styles.displayStat}>
            <Text
              style={[
                styles.displayStatValue,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(avgWeight)}
            </Text>
            <Text
              style={[
                styles.displayStatLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              Avg KG/PCS
            </Text>
          </View>
        </View>
      </Animated.View>

      {showInputs && (
        <Animated.View
          style={[
            styles.inputSection,
            {
              backgroundColor: theme.surface,
              borderColor: theme.borderLight,
            },
          ]}
          entering={Platform.OS !== "web" ? FadeInDown.springify().damping(18) : undefined}
        >
          <View style={styles.inputRow}>
            <View style={styles.inputWrapper}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
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
              />
            </View>
            <View style={styles.inputWrapper}>
              <Text
                style={[
                  styles.inputLabel,
                  { color: theme.textSecondary, fontFamily: "Outfit_500Medium" },
                ]}
              >
                PCS
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
              />
            </View>
            <Pressable
              onPress={handleAddRow}
              style={({ pressed }) => [
                styles.addButton,
                {
                  backgroundColor: theme.accent,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <Ionicons name="checkmark" size={22} color="#FFF" />
            </Pressable>
          </View>
        </Animated.View>
      )}

      <Pressable
        onPress={handleToggleInputs}
        style={({ pressed }) => [
          styles.addRowButton,
          {
            backgroundColor: showInputs ? theme.dangerLight : theme.accentLight,
            borderColor: showInputs ? theme.danger : theme.accent,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Ionicons
          name={showInputs ? "close" : "add"}
          size={18}
          color={showInputs ? theme.danger : theme.accent}
        />
        <Text
          style={[
            styles.addRowButtonText,
            {
              color: showInputs ? theme.danger : theme.accent,
              fontFamily: "Outfit_600SemiBold",
            },
          ]}
        >
          {showInputs ? "Close" : "Add Row"}
        </Text>
      </Pressable>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <MeasurementRowCard
            row={item}
            rowNumber={rows.length - index}
            theme={theme}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: insets.bottom + webBottomInset + 80,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!rows.length}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text
              style={[
                styles.emptyListText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              No measurements yet. Tap "Add Row" to begin.
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
            borderTopColor: theme.borderLight,
          },
        ]}
      >
        <Pressable
          onPress={handleEndMeasurement}
          style={({ pressed }) => [
            styles.endButton,
            {
              backgroundColor: rows.length > 0 ? theme.warm : theme.textTertiary,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
          disabled={rows.length === 0}
        >
          <Feather name="check-circle" size={20} color="#FFF" />
          <Text style={[styles.endButtonText, { fontFamily: "Outfit_700Bold" }]}>
            End Measurement
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    fontSize: 17,
  },
  display: {
    alignItems: "center",
    paddingVertical: 20,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
  },
  displayLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  displayValue: {
    fontSize: 48,
    lineHeight: 56,
  },
  displayUnit: {
    fontSize: 16,
    marginTop: -2,
  },
  displayDivider: {
    width: "80%",
    paddingVertical: 10,
  },
  displayDividerLine: {
    height: 1,
  },
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "80%",
  },
  displayStat: {
    flex: 1,
    alignItems: "center",
  },
  displayStatValue: {
    fontSize: 22,
  },
  displayStatLabel: {
    fontSize: 11,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  displayVertDivider: {
    width: 1,
    height: 32,
  },
  inputSection: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 18,
    borderWidth: 1,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addRowButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  addRowButtonText: {
    fontSize: 14,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  rowNumber: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowNumberText: {
    fontSize: 15,
  },
  rowContent: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowMainInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowWeight: {
    fontSize: 16,
  },
  rowPcsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rowPcsLabel: {
    fontSize: 13,
  },
  rowTime: {
    fontSize: 12,
  },
  emptyList: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyListText: {
    fontSize: 14,
    textAlign: "center",
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  endButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  endButtonText: {
    color: "#FFF",
    fontSize: 16,
  },
});
