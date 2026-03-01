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
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { formatWeight, getRelativeTime } from "@/lib/utils";
import {
  saveSale,
  loadLastPricePerKg,
  saveLastPricePerKg,
  loadLastKgPerCrate,
  saveLastKgPerCrate,
  loadLastDeductionG,
  saveLastDeductionG,
} from "@/lib/storage";
import { EditRowModal } from "@/components/EditRowModal";
import type { MeasurementRow, SaleRecord, DholtaDetails } from "@/lib/types";

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function calcDholta(
  totalWeight: number,
  kgPerCrate: number,
  deductionPerCrateG: number,
  fullCratesOnly: boolean
): { totalCrates: number; totalDeductionKg: number; netWeight: number } {
  const rawCrates = totalWeight / kgPerCrate;
  const totalCrates = fullCratesOnly ? Math.floor(rawCrates) : rawCrates;
  const totalDeductionKg = (totalCrates * deductionPerCrateG) / 1000;
  const netWeight = totalWeight - totalDeductionKg;
  return { totalCrates, totalDeductionKg, netWeight };
}

function RowItem({
  row,
  rowNumber,
  theme,
  onEdit,
}: {
  row: MeasurementRow;
  rowNumber: number;
  theme: ReturnType<typeof useTheme>;
  onEdit: (row: MeasurementRow) => void;
}) {
  const [timeAgo, setTimeAgo] = useState(getRelativeTime(row.timestamp));
  const lastEdit = row.editHistory?.[0];
  const [editAgo, setEditAgo] = useState(
    lastEdit ? getRelativeTime(lastEdit.timestamp) : ""
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(getRelativeTime(row.timestamp));
      if (lastEdit) setEditAgo(getRelativeTime(lastEdit.timestamp));
    }, 5000);
    return () => clearInterval(interval);
  }, [row.timestamp, lastEdit]);

  return (
    <Animated.View
      entering={
        Platform.OS !== "web" ? FadeInDown.springify().damping(18) : undefined
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
          <View style={styles.rowMeta}>
            <Text
              style={[
                styles.rowTimeText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {timeAgo}
            </Text>
            {lastEdit && (
              <>
                <View
                  style={[
                    styles.metaDot,
                    { backgroundColor: theme.textTertiary },
                  ]}
                />
                <Text
                  style={[
                    styles.editedText,
                    { color: theme.accent, fontFamily: "Outfit_400Regular" },
                  ]}
                >
                  edited {editAgo}
                </Text>
              </>
            )}
          </View>
        </View>

        <View
          style={[styles.rowPcsBadge, { backgroundColor: theme.warmLight }]}
        >
          <MaterialCommunityIcons name="food-turkey" size={13} color={theme.warm} />
          <Text
            style={[
              styles.rowPcsText,
              { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {row.pcs}
          </Text>
        </View>

        <Pressable
          onPress={() => onEdit(row)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.rowEditBtn,
            {
              backgroundColor: theme.accentLight,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          testID={`edit-row-${rowNumber}`}
        >
          <Feather name="edit-2" size={13} color={theme.accent} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function DholtaModal({
  visible,
  totalWeight,
  totalPcs,
  rows,
  theme,
  insets,
  onCancel,
  onSaved,
}: {
  visible: boolean;
  totalWeight: number;
  totalPcs: number;
  rows: MeasurementRow[];
  theme: ReturnType<typeof useTheme>;
  insets: { top: number; bottom: number };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [kgPerCrate, setKgPerCrate] = useState("");
  const [deductionG, setDeductionG] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [fullCratesOnly, setFullCratesOnly] = useState(true);
  const [saving, setSaving] = useState(false);

  const deductionRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      Promise.all([
        loadLastPricePerKg(),
        loadLastKgPerCrate(),
        loadLastDeductionG(),
      ]).then(([price, kpc, dg]) => {
        if (price) setPricePerKg(price);
        if (kpc) setKgPerCrate(kpc);
        if (dg) setDeductionG(dg);
      });
    }
  }, [visible]);

  const kgPerCrateNum = parseFloat(kgPerCrate);
  const deductionGNum = parseFloat(deductionG);
  const pricePerKgNum = parseFloat(pricePerKg);

  const isValid =
    kgPerCrate.length > 0 &&
    deductionG.length > 0 &&
    pricePerKg.length > 0 &&
    !isNaN(kgPerCrateNum) &&
    kgPerCrateNum > 0 &&
    !isNaN(deductionGNum) &&
    deductionGNum >= 0 &&
    !isNaN(pricePerKgNum) &&
    pricePerKgNum > 0;

  const calc = isValid
    ? calcDholta(totalWeight, kgPerCrateNum, deductionGNum, fullCratesOnly)
    : null;

  const finalAmount =
    calc && pricePerKgNum > 0 ? calc.netWeight * pricePerKgNum : null;

  const handleSave = async () => {
    if (!isValid || !calc || finalAmount === null) return;
    setSaving(true);

    try {
      const dholta: DholtaDetails = {
        gross_weight: totalWeight,
        kg_per_crate: kgPerCrateNum,
        deduction_per_crate_g: deductionGNum,
        full_crates_only: fullCratesOnly,
        total_crates: calc.totalCrates,
        total_deduction_kg: calc.totalDeductionKg,
        net_weight: calc.netWeight,
        price_per_kg: pricePerKgNum,
        final_amount: finalAmount,
      };

      const totalWeightGrams = Math.round(totalWeight * 1000);
      const avgWeightKg = totalPcs > 0 ? totalWeight / totalPcs : 0;
      const avgWeightGrams = Math.round(avgWeightKg * 1000);

      const sale: SaleRecord = {
        id: Crypto.randomUUID(),
        totalWeightKg: totalWeight,
        totalWeightGrams,
        totalPcs,
        averageWeightKg: avgWeightKg,
        averageWeightGrams: avgWeightGrams,
        rows,
        createdAt: Date.now(),
        dholta,
      };

      await Promise.all([
        saveSale(sale),
        saveLastPricePerKg(pricePerKg),
        saveLastKgPerCrate(kgPerCrate),
        saveLastDeductionG(deductionG),
      ]);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View
        style={[styles.modalContainer, { backgroundColor: theme.background }]}
      >
        <View
          style={[
            styles.modalHeader,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
              paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12,
            },
          ]}
        >
          <Pressable
            onPress={onCancel}
            hitSlop={16}
            style={({ pressed }) => [
              styles.modalCloseBtn,
              {
                backgroundColor: theme.borderLight,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="close" size={20} color={theme.text} />
          </Pressable>
          <Text
            style={[
              styles.modalTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            Trade Deduction
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + webBottomInset + 120,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[styles.grossBanner, { backgroundColor: theme.timerBg }]}
          >
            <Text
              style={[styles.grossLabel, { fontFamily: "Outfit_400Regular" }]}
            >
              Gross Weight
            </Text>
            <Text
              style={[styles.grossValue, { fontFamily: "Outfit_700Bold" }]}
            >
              {formatWeight(totalWeight)}{" "}
              <Text style={styles.grossUnit}>KG</Text>
            </Text>
          </View>

          <Text
            style={[
              styles.sectionLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            DEDUCTION PARAMETERS
          </Text>

          <View
            style={[
              styles.inputCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
              },
            ]}
          >
            <View
              style={[
                styles.inputRow,
                { borderBottomColor: theme.borderLight },
              ]}
            >
              <View style={styles.inputLabelWrap}>
                <MaterialCommunityIcons
                  name="package-variant"
                  size={16}
                  color={theme.accent}
                />
                <Text
                  style={[
                    styles.inputFieldLabel,
                    { color: theme.text, fontFamily: "Outfit_500Medium" },
                  ]}
                >
                  KG per Crate
                </Text>
              </View>
              <TextInput
                value={kgPerCrate}
                onChangeText={setKgPerCrate}
                keyboardType="decimal-pad"
                placeholder="e.g. 20"
                placeholderTextColor={theme.textTertiary}
                returnKeyType="next"
                onSubmitEditing={() => deductionRef.current?.focus()}
                style={[
                  styles.inputField,
                  {
                    color: theme.text,
                    fontFamily: "Outfit_600SemiBold",
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                testID="kg-per-crate-input"
              />
            </View>

            <View
              style={[
                styles.inputRow,
                { borderBottomColor: theme.borderLight },
              ]}
            >
              <View style={styles.inputLabelWrap}>
                <Feather name="minus-circle" size={16} color={theme.danger} />
                <Text
                  style={[
                    styles.inputFieldLabel,
                    { color: theme.text, fontFamily: "Outfit_500Medium" },
                  ]}
                >
                  Dholta per Crate (g)
                </Text>
              </View>
              <TextInput
                ref={deductionRef}
                value={deductionG}
                onChangeText={setDeductionG}
                keyboardType="decimal-pad"
                placeholder="e.g. 300"
                placeholderTextColor={theme.textTertiary}
                returnKeyType="next"
                onSubmitEditing={() => priceRef.current?.focus()}
                style={[
                  styles.inputField,
                  {
                    color: theme.text,
                    fontFamily: "Outfit_600SemiBold",
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                testID="deduction-g-input"
              />
            </View>

            <View style={styles.inputRow}>
              <View style={styles.inputLabelWrap}>
                <Feather name="tag" size={16} color={theme.success} />
                <Text
                  style={[
                    styles.inputFieldLabel,
                    { color: theme.text, fontFamily: "Outfit_500Medium" },
                  ]}
                >
                  Price per KG
                </Text>
              </View>
              <TextInput
                ref={priceRef}
                value={pricePerKg}
                onChangeText={setPricePerKg}
                keyboardType="decimal-pad"
                placeholder="e.g. 250"
                placeholderTextColor={theme.textTertiary}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                style={[
                  styles.inputField,
                  {
                    color: theme.text,
                    fontFamily: "Outfit_600SemiBold",
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                testID="price-per-kg-input"
              />
            </View>
          </View>

          <Pressable
            onPress={() => setFullCratesOnly((v) => !v)}
            style={[
              styles.checkboxRow,
              {
                backgroundColor: theme.surface,
                borderColor: fullCratesOnly ? theme.accent : theme.borderLight,
              },
            ]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: fullCratesOnly ? theme.accent : theme.border,
                  backgroundColor: fullCratesOnly ? theme.accent : "transparent",
                },
              ]}
            >
              {fullCratesOnly && (
                <Ionicons name="checkmark" size={14} color="#FFF" />
              )}
            </View>
            <View style={styles.checkboxTextWrap}>
              <Text
                style={[
                  styles.checkboxLabel,
                  { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                Full crates only (floor logic)
              </Text>
              <Text
                style={[
                  styles.checkboxSub,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_400Regular",
                  },
                ]}
              >
                Deduct only on complete crates, ignore partial
              </Text>
            </View>
          </Pressable>

          {calc && finalAmount !== null && (
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.sectionLabel,
                  {
                    color: theme.textTertiary,
                    fontFamily: "Outfit_600SemiBold",
                    marginBottom: 12,
                  },
                ]}
              >
                CALCULATION SUMMARY
              </Text>

              <SummaryRow
                label="Gross Weight"
                value={`${formatWeight(totalWeight)} KG`}
                theme={theme}
              />
              <SummaryRow
                label={`Total Crates${fullCratesOnly ? " (floored)" : ""}`}
                value={
                  fullCratesOnly
                    ? `${calc.totalCrates}`
                    : `${calc.totalCrates.toFixed(3)}`
                }
                theme={theme}
              />
              <SummaryRow
                label="Total Deduction"
                value={`${formatWeight(calc.totalDeductionKg)} KG`}
                theme={theme}
                isNegative
              />
              <SummaryRow
                label="Payable Weight"
                value={`${formatWeight(calc.netWeight)} KG`}
                theme={theme}
                isHighlight
              />
              <SummaryRow
                label="Price per KG"
                value={`Tk ${pricePerKgNum.toFixed(2)}`}
                theme={theme}
              />

              <View
                style={[
                  styles.finalAmountRow,
                  { backgroundColor: theme.accentLight },
                ]}
              >
                <Text
                  style={[
                    styles.finalAmountLabel,
                    { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  Final Amount
                </Text>
                <Text
                  style={[
                    styles.finalAmountValue,
                    { color: theme.accent, fontFamily: "Outfit_700Bold" },
                  ]}
                >
                  Tk{" "}
                  {finalAmount.toLocaleString("en-PK", {
                    maximumFractionDigits: 2,
                  })}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.modalFooter,
            {
              paddingBottom: insets.bottom + webBottomInset + 12,
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
          ]}
        >
          <View style={styles.footerBtns}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.cancelBtnText,
                  { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!isValid || saving}
              style={({ pressed }) => [
                styles.confirmBtn,
                {
                  backgroundColor: isValid ? theme.accent : theme.border,
                  transform: [{ scale: pressed && isValid ? 0.97 : 1 }],
                },
              ]}
              testID="confirm-save-button"
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Feather
                    name="check-circle"
                    size={18}
                    color={isValid ? "#FFF" : theme.textTertiary}
                  />
                  <Text
                    style={[
                      styles.confirmBtnText,
                      {
                        color: isValid ? "#FFF" : theme.textTertiary,
                        fontFamily: "Outfit_700Bold",
                      },
                    ]}
                  >
                    Confirm & Save Sale
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryRow({
  label,
  value,
  theme,
  isNegative,
  isHighlight,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  isNegative?: boolean;
  isHighlight?: boolean;
}) {
  const valueColor = isNegative
    ? theme.danger
    : isHighlight
    ? theme.success
    : theme.text;
  return (
    <View style={styles.summaryRow}>
      <Text
        style={[
          styles.summaryLabel,
          { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          { color: valueColor, fontFamily: "Outfit_600SemiBold" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function MeasurementScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [pcsInput, setPcsInput] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showDholta, setShowDholta] = useState(false);
  const [editingRow, setEditingRow] = useState<MeasurementRow | null>(null);
  const weightRef = useRef<TextInput>(null);
  const pcsRef = useRef<TextInput>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(
        Math.floor((Date.now() - startTimeRef.current) / 1000)
      );
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
    Keyboard.dismiss();

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
      if (Platform.OS !== "web") {
        Alert.alert("No Data", "Add at least one weighing first.");
      }
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowDholta(true);
  };

  const handleBack = () => {
    if (rows.length > 0) {
      if (Platform.OS === "web") {
        router.back();
        return;
      }
      Alert.alert("Discard?", "All unsaved weighings will be lost.", [
        { text: "Stay", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => router.back(),
        },
      ]);
    } else {
      router.back();
    }
  };

  const handleEditSave = (updatedRow: MeasurementRow) => {
    setRows((prev) => prev.map((r) => (r.id === updatedRow.id ? updatedRow : r)));
    setEditingRow(null);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleViewHistory = (row: MeasurementRow) => {
    setEditingRow(null);
    const rowIdx = rows.findIndex((r) => r.id === row.id);
    const rowNumber = rows.length - rowIdx;
    router.push({
      pathname: "/row-history",
      params: {
        rowNumber: String(rowNumber),
        history: JSON.stringify(row.editHistory ?? []),
        currentWeightKg: String(row.weightKg),
        currentPcs: String(row.pcs),
      },
    });
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

  const editingRowNumber = editingRow
    ? rows.length - rows.findIndex((r) => r.id === editingRow.id)
    : 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <EditRowModal
        visible={editingRow !== null}
        row={editingRow}
        rowNumber={editingRowNumber}
        onClose={() => setEditingRow(null)}
        onSave={handleEditSave}
        onViewHistory={handleViewHistory}
      />

      <DholtaModal
        visible={showDholta}
        totalWeight={totalWeight}
        totalPcs={totalPcs}
        rows={rows}
        theme={theme}
        insets={insets}
        onCancel={() => setShowDholta(false)}
        onSaved={() => {
          setShowDholta(false);
          router.dismissAll();
        }}
      />

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
              {
                backgroundColor: theme.dangerLight,
                opacity: pressed ? 0.6 : 1,
              },
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
          <Text
            style={[styles.timerText, { fontFamily: "Outfit_600SemiBold" }]}
          >
            {formatTimer(elapsedSeconds)}
          </Text>
        </View>

        <Text style={[styles.displayWeight, { fontFamily: "Outfit_700Bold" }]}>
          {formatWeight(totalWeight)}
        </Text>
        <Text style={[styles.displayKg, { fontFamily: "Outfit_500Medium" }]}>
          KG
        </Text>

        <View style={styles.displayStats}>
          <View style={styles.displayStatItem}>
            <MaterialCommunityIcons
              name="food-turkey"
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
          { backgroundColor: theme.surface, borderColor: theme.border },
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
              placeholder="0.00"
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
            onEdit={setEditingRow}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!rows.length}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyRows}>
            <Feather name="inbox" size={28} color={theme.textTertiary} />
            <Text
              style={[
                styles.emptyRowsText,
                {
                  color: theme.textTertiary,
                  fontFamily: "Outfit_400Regular",
                },
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
              backgroundColor: rows.length > 0 ? theme.accent : theme.border,
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
              <Text
                style={[
                  styles.endBtnBadgeText,
                  { fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {rows.length}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
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
  displayStatItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  displayStatVal: { fontSize: 18, color: "#FFFFFF" },
  displayStatLabel: { fontSize: 12, color: "rgba(255,255,255,0.4)" },
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
  inputGroup: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
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
    gap: 8,
  },
  rowNum: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowNumText: { fontSize: 15 },
  rowInfo: { flex: 1 },
  rowWeight: { fontSize: 17 },
  rowMeta: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 5 },
  rowTimeText: { fontSize: 12 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5 },
  editedText: { fontSize: 11 },
  rowPcsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  rowPcsText: { fontSize: 14 },
  rowEditBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyRows: { paddingVertical: 48, alignItems: "center", gap: 10 },
  emptyRowsText: { fontSize: 14, textAlign: "center" },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
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
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 18 },
  grossBanner: {
    borderRadius: 18,
    padding: 18,
    alignItems: "center",
    marginBottom: 20,
  },
  grossLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  grossValue: { fontSize: 40, color: "#FFFFFF", lineHeight: 46 },
  grossUnit: {
    fontSize: 16,
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Outfit_400Regular",
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 2,
    textTransform: "uppercase",
  },
  inputCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  inputLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  inputFieldLabel: { fontSize: 14 },
  inputField: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 18,
    borderWidth: 1,
    width: 110,
    textAlign: "right",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxTextWrap: { flex: 1 },
  checkboxLabel: { fontSize: 14 },
  checkboxSub: { fontSize: 12, marginTop: 2 },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 15 },
  finalAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
  },
  finalAmountLabel: { fontSize: 14 },
  finalAmountValue: { fontSize: 20 },
  modalFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  footerBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { fontSize: 15 },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
  },
  confirmBtnText: { fontSize: 15 },
});
