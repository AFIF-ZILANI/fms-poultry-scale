import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Modal,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/lib/useTheme";
import { formatWeight } from "@/lib/utils";
import type { MeasurementRow, RowEditEntry } from "@/lib/types";

interface Props {
  visible: boolean;
  row: MeasurementRow | null;
  rowNumber: number;
  onClose: () => void;
  onSave: (updatedRow: MeasurementRow) => void;
  onViewHistory: (row: MeasurementRow) => void;
}

export function EditRowModal({
  visible,
  row,
  rowNumber,
  onClose,
  onSave,
  onViewHistory,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [weightInput, setWeightInput] = useState("");
  const [pcsInput, setPcsInput] = useState("");
  const pcsRef = useRef<TextInput>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  useEffect(() => {
    if (visible && row) {
      setWeightInput(String(row.weightKg));
      setPcsInput(String(row.pcs));
    }
  }, [visible, row]);

  if (!row) return null;

  const newWeight = parseFloat(weightInput);
  const newPcs = parseInt(pcsInput, 10);
  const isValid =
    weightInput.length > 0 &&
    pcsInput.length > 0 &&
    !isNaN(newWeight) &&
    newWeight > 0 &&
    !isNaN(newPcs) &&
    newPcs > 0;

  const hasChanges =
    isValid && (newWeight !== row.weightKg || newPcs !== row.pcs);

  const editCount = row.editHistory?.length ?? 0;

  const handleSave = () => {
    if (!isValid || !hasChanges) return;
    Keyboard.dismiss();

    const entry: RowEditEntry = {
      id: Crypto.randomUUID(),
      timestamp: Date.now(),
      previousWeightKg: row.weightKg,
      previousPcs: row.pcs,
      newWeightKg: newWeight,
      newPcs,
    };

    const updatedRow: MeasurementRow = {
      ...row,
      weightKg: newWeight,
      pcs: newPcs,
      editHistory: [entry, ...(row.editHistory ?? [])],
    };

    onSave(updatedRow);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
      transparent={false}
    >
      <View
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
              paddingTop: insets.top + webTopInset + 12,
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={16}
            style={({ pressed }) => [
              styles.closeBtn,
              {
                backgroundColor: theme.borderLight,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="close" size={20} color={theme.text} />
          </Pressable>
          <View style={styles.headerCenter}>
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
                styles.headerTitle,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              Edit Row
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.body}>
          <View
            style={[
              styles.currentCard,
              {
                backgroundColor: theme.timerBg,
              },
            ]}
          >
            <Text
              style={[
                styles.currentLabel,
                { fontFamily: "Outfit_400Regular" },
              ]}
            >
              Current values
            </Text>
            <Text
              style={[
                styles.currentValues,
                { fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(row.weightKg)} KG — {row.pcs} birds
            </Text>
          </View>

          <View
            style={[
              styles.fieldsCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
              },
            ]}
          >
            <View
              style={[
                styles.fieldRow,
                { borderBottomColor: theme.borderLight },
              ]}
            >
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_500Medium",
                  },
                ]}
              >
                Weight (KG)
              </Text>
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                returnKeyType="next"
                onSubmitEditing={() => pcsRef.current?.focus()}
                style={[
                  styles.fieldInput,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    fontFamily: "Outfit_600SemiBold",
                  },
                ]}
                testID="edit-weight-input"
              />
            </View>
            <View style={styles.fieldRow}>
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_500Medium",
                  },
                ]}
              >
                Birds (Pcs)
              </Text>
              <TextInput
                ref={pcsRef}
                value={pcsInput}
                onChangeText={setPcsInput}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleSave}
                style={[
                  styles.fieldInput,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    fontFamily: "Outfit_600SemiBold",
                  },
                ]}
                testID="edit-pcs-input"
              />
            </View>
          </View>

          {editCount > 0 && (
            <Pressable
              onPress={() => onViewHistory(row)}
              style={({ pressed }) => [
                styles.historyLink,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderLight,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
              testID="view-history-link"
            >
              <View
                style={[
                  styles.historyIcon,
                  { backgroundColor: theme.accentLight },
                ]}
              >
                <Feather name="clock" size={15} color={theme.accent} />
              </View>
              <Text
                style={[
                  styles.historyLinkText,
                  { color: theme.text, fontFamily: "Outfit_500Medium" },
                ]}
              >
                View edit history
              </Text>
              <View
                style={[
                  styles.historyBadge,
                  { backgroundColor: theme.accent },
                ]}
              >
                <Text
                  style={[
                    styles.historyBadgeText,
                    { fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {editCount}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={theme.textTertiary}
              />
            </Pressable>
          )}
        </View>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + webBottomInset + 12,
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
          ]}
        >
          <View style={styles.footerBtns}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.cancelText,
                  { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!hasChanges}
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: hasChanges ? theme.accent : theme.border,
                  transform: [{ scale: pressed && hasChanges ? 0.97 : 1 }],
                },
              ]}
              testID="edit-save-button"
            >
              <Feather
                name="check"
                size={18}
                color={hasChanges ? "#FFF" : theme.textTertiary}
              />
              <Text
                style={[
                  styles.saveText,
                  {
                    color: hasChanges ? "#FFF" : theme.textTertiary,
                    fontFamily: "Outfit_700Bold",
                  },
                ]}
              >
                Save Changes
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
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
  headerTitle: { fontSize: 17 },
  body: { flex: 1, padding: 16 },
  currentCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  currentLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  currentValues: {
    fontSize: 20,
    color: "#FFF",
  },
  fieldsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  fieldLabel: { fontSize: 14, flex: 1 },
  fieldInput: {
    height: 44,
    width: 120,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 18,
    textAlign: "right",
  },
  historyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  historyLinkText: { flex: 1, fontSize: 14 },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  historyBadgeText: { fontSize: 12, color: "#FFF" },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  footerBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 15 },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
  },
  saveText: { fontSize: 15 },
});
