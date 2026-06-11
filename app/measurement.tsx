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
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { formatWeight, getRelativeTime } from "@/lib/utils";
import {
  saveSale,
  loadLastPricePerKg,
  saveLastPricePerKg,
  loadLastKgPerCrate,
  saveLastKgPerCrate,
  loadLastDeductionG,
  saveLastDeductionG,
  loadDraft,
  saveDraft,
  deleteDraft,
} from "@/lib/storage";
import { EditRowModal } from "@/components/EditRowModal";
import type {
  MeasurementRow,
  SaleRecord,
  DholtaDetails,
  DraftSession,
} from "@/lib/types";

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
  const { t } = useSettings();
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
                  {t.edited} {editAgo}
                </Text>
              </>
            )}
          </View>
        </View>

        <View
          style={[styles.rowPcsBadge, { backgroundColor: theme.warmLight }]}
        >
          <MaterialCommunityIcons name="bird" size={13} color={theme.warm} />
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

function CullDialog({
  visible,
  theme,
  onYes,
  onNo,
}: {
  visible: boolean;
  theme: ReturnType<typeof useTheme>;
  onYes: () => void;
  onNo: () => void;
}) {
  const { t } = useSettings();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onNo}
    >
      <View style={styles.cullOverlay}>
        <Animated.View
          entering={Platform.OS !== "web" ? FadeIn.duration(180) : undefined}
          style={[
            styles.cullCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.borderLight,
            },
          ]}
        >
          <View
            style={[
              styles.cullIconWrap,
              { backgroundColor: theme.warmLight },
            ]}
          >
            <MaterialCommunityIcons
              name="bird"
              size={30}
              color={theme.warm}
            />
          </View>
          <Text
            style={[
              styles.cullTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {t.hasCullBirds}
          </Text>
          <Text
            style={[
              styles.cullHint,
              {
                color: theme.textTertiary,
                fontFamily: "Outfit_400Regular",
              },
            ]}
          >
            {t.hasCullBirdsHint}
          </Text>
          <View style={styles.cullBtns}>
            <Pressable
              onPress={onNo}
              style={({ pressed }) => [
                styles.cullNoBtn,
                {
                  borderColor: theme.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              testID="cull-no-btn"
            >
              <Text
                style={[
                  styles.cullNoBtnText,
                  {
                    color: theme.text,
                    fontFamily: "Outfit_600SemiBold",
                  },
                ]}
              >
                {t.no}
              </Text>
            </Pressable>
            <Pressable
              onPress={onYes}
              style={({ pressed }) => [
                styles.cullYesBtn,
                {
                  backgroundColor: theme.warm,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
              testID="cull-yes-btn"
            >
              <MaterialCommunityIcons
                name="bird"
                size={16}
                color="#FFF"
              />
              <Text
                style={[
                  styles.cullYesBtnText,
                  { fontFamily: "Outfit_700Bold" },
                ]}
              >
                {t.yes}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DholtaModal({
  visible,
  totalWeight,
  totalPcs,
  rows,
  cullWeightKg,
  cullRows,
  theme,
  insets,
  onCancel,
  onSaved,
}: {
  visible: boolean;
  totalWeight: number;
  totalPcs: number;
  rows: MeasurementRow[];
  cullWeightKg: number;
  cullRows: MeasurementRow[];
  theme: ReturnType<typeof useTheme>;
  insets: { top: number; bottom: number };
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t } = useSettings();
  const [kgPerCrate, setKgPerCrate] = useState("");
  const [deductionG, setDeductionG] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [fullCratesOnly, setFullCratesOnly] = useState(true);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const deductionRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  const receivedRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setReceivedAmount("");
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

  const adjustedNetWeight =
    calc !== null ? calc.netWeight - cullWeightKg : null;

  const finalAmount =
    adjustedNetWeight !== null && pricePerKgNum > 0
      ? adjustedNetWeight * pricePerKgNum
      : null;

  const receivedAmountNum = parseFloat(receivedAmount);
  const validReceivedAmount =
    receivedAmount.length > 0 && !isNaN(receivedAmountNum) && receivedAmountNum > 0;

  const handleSave = async () => {
    if (!isValid || !calc || finalAmount === null || adjustedNetWeight === null)
      return;
    setSaving(true);

    try {
      const dholta: DholtaDetails = {
        gross_weight: totalWeight,
        kg_per_crate: kgPerCrateNum,
        deduction_per_crate_g: deductionGNum,
        full_crates_only: fullCratesOnly,
        total_crates: calc.totalCrates,
        total_deduction_kg: calc.totalDeductionKg,
        cull_weight_kg: cullWeightKg,
        net_weight: adjustedNetWeight,
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
        cullRows: cullRows.length > 0 ? cullRows : undefined,
        createdAt: Date.now(),
        dholta,
        receivedAmount: validReceivedAmount ? receivedAmountNum : undefined,
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
            {t.tradeDeduction}
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
              {t.grossWeight}
            </Text>
            <Text
              style={[styles.grossValue, { fontFamily: "Outfit_700Bold" }]}
            >
              {formatWeight(totalWeight)}{" "}
              <Text style={styles.grossUnit}>KG</Text>
            </Text>
            {cullWeightKg > 0 && (
              <View
                style={[
                  styles.cullBanner,
                  { backgroundColor: "rgba(255,255,255,0.12)" },
                ]}
              >
                <MaterialCommunityIcons
                  name="bird"
                  size={14}
                  color="rgba(255,255,255,0.7)"
                />
                <Text
                  style={[
                    styles.cullBannerText,
                    { fontFamily: "Outfit_500Medium" },
                  ]}
                >
                  {t.cullWeight}: {formatWeight(cullWeightKg)} KG
                </Text>
              </View>
            )}
          </View>

          <Text
            style={[
              styles.sectionLabel,
              { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {t.deductionParams}
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
                  {t.kgPerCrate}
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
                  {t.dholtaPerCrate}
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
                  {t.pricePerKg}
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
                  backgroundColor: fullCratesOnly
                    ? theme.accent
                    : "transparent",
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
                {t.fullCratesOnly}
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
                {t.fullCratesOnlyHint}
              </Text>
            </View>
          </Pressable>

          {calc && finalAmount !== null && adjustedNetWeight !== null && (
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
                {t.calcSummary}
              </Text>

              <SummaryRow
                label={t.grossWeight}
                value={`${formatWeight(totalWeight)} KG`}
                theme={theme}
              />
              <SummaryRow
                label={
                  fullCratesOnly ? t.totalCratesFloored : t.totalCrates
                }
                value={
                  fullCratesOnly
                    ? `${calc.totalCrates}`
                    : `${calc.totalCrates.toFixed(3)}`
                }
                theme={theme}
              />
              <SummaryRow
                label={t.totalDeduction}
                value={`-${formatWeight(calc.totalDeductionKg)} KG`}
                theme={theme}
                isNegative
              />
              {cullWeightKg > 0 && (
                <SummaryRow
                  label={t.cullWeight}
                  value={`-${formatWeight(cullWeightKg)} KG`}
                  theme={theme}
                  isNegative
                />
              )}
              <SummaryRow
                label={t.payableWeight}
                value={`${formatWeight(adjustedNetWeight)} KG`}
                theme={theme}
                isHighlight
              />
              <SummaryRow
                label={t.pricePerKg}
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
                    {
                      color: theme.accent,
                      fontFamily: "Outfit_600SemiBold",
                    },
                  ]}
                >
                  {t.finalAmount}
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

              <View
                style={[
                  styles.receivedAmountSection,
                  { borderTopColor: theme.borderLight },
                ]}
              >
                <View style={styles.receivedAmountHeader}>
                  <Feather
                    name="credit-card"
                    size={14}
                    color={theme.textTertiary}
                  />
                  <Text
                    style={[
                      styles.receivedAmountLabel,
                      {
                        color: theme.text,
                        fontFamily: "Outfit_600SemiBold",
                      },
                    ]}
                  >
                    {t.receivedAmount}
                  </Text>
                  <View
                    style={[
                      styles.optionalBadge,
                      { backgroundColor: theme.borderLight },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionalText,
                        {
                          color: theme.textTertiary,
                          fontFamily: "Outfit_400Regular",
                        },
                      ]}
                    >
                      {t.optional}
                    </Text>
                  </View>
                </View>
                <TextInput
                  ref={receivedRef}
                  value={receivedAmount}
                  onChangeText={setReceivedAmount}
                  keyboardType="decimal-pad"
                  placeholder="Tk 0.00"
                  placeholderTextColor={theme.textTertiary}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  style={[
                    styles.receivedAmountInput,
                    {
                      color: theme.text,
                      fontFamily: "Outfit_600SemiBold",
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                    },
                  ]}
                  testID="received-amount-input"
                />
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
                {t.cancel}
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
                    {t.confirmSave}
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

export default function MeasurementScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const { draftId: draftIdParam } = useLocalSearchParams<{
    draftId?: string;
  }>();

  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [mainRows, setMainRows] = useState<MeasurementRow[]>([]);
  const [phase, setPhase] = useState<"main" | "cull">("main");
  const [weightInput, setWeightInput] = useState("");
  const [pcsInput, setPcsInput] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showDholta, setShowDholta] = useState(false);
  const [showCullDialog, setShowCullDialog] = useState(false);
  const [editingRow, setEditingRow] = useState<MeasurementRow | null>(null);

  const weightRef = useRef<TextInput>(null);
  const pcsRef = useRef<TextInput>(null);
  const startTimeRef = useRef(Date.now());
  const sessionDraftId = useRef<string>(
    typeof draftIdParam === "string" && draftIdParam.length > 0
      ? draftIdParam
      : Crypto.randomUUID()
  );
  const hasEverHadRows = useRef(
    typeof draftIdParam === "string" && draftIdParam.length > 0
  );
  const draftLoaded = useRef(false);

  useEffect(() => {
    if (draftLoaded.current) return;
    const id = typeof draftIdParam === "string" ? draftIdParam : "";
    if (!id) return;
    draftLoaded.current = true;
    loadDraft(id).then((draft) => {
      if (!draft) return;
      startTimeRef.current = draft.createdAt;
      if (draft.phase === "cull" && draft.mainRows && draft.mainRows.length > 0) {
        setPhase("cull");
        setMainRows(draft.mainRows);
        if (draft.rows.length > 0) setRows(draft.rows);
      } else if (draft.rows.length > 0) {
        setRows(draft.rows);
      }
    });
  }, [draftIdParam]);

  useEffect(() => {
    const hasData = rows.length > 0 || mainRows.length > 0;
    if (hasData) hasEverHadRows.current = true;
    if (!hasEverHadRows.current) return;
    const draft: DraftSession = {
      id: sessionDraftId.current,
      rows,
      mainRows: mainRows.length > 0 ? mainRows : undefined,
      phase,
      createdAt: startTimeRef.current,
      updatedAt: Date.now(),
      totalWeightKg: rows.reduce((s, r) => s + r.weightKg, 0),
      totalPcs: rows.reduce((s, r) => s + r.pcs, 0),
    };
    saveDraft(draft);
  }, [rows, mainRows, phase]);

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

  const mainWeight = mainRows.reduce((sum, r) => sum + r.weightKg, 0);
  const mainPcs = mainRows.reduce((sum, r) => sum + r.pcs, 0);

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
      Alert.alert(t.undoLast, t.undoLastMessage, [
        { text: t.cancel, style: "cancel" },
        {
          text: t.remove,
          style: "destructive",
          onPress: () => {
            setRows((prev) => prev.slice(1));
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
          },
        },
      ]);
    }
  };

  const handleEndMeasurement = () => {
    if (rows.length === 0) {
      if (Platform.OS !== "web") {
        Alert.alert(t.noDataTitle, t.noDataMessage);
      }
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (phase === "main") {
      setShowCullDialog(true);
    } else {
      setShowDholta(true);
    }
  };

  const handleCullYes = () => {
    setShowCullDialog(false);
    setMainRows(rows);
    setRows([]);
    setPhase("cull");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const handleCullNo = () => {
    setShowCullDialog(false);
    setShowDholta(true);
  };

  const handleBack = () => {
    router.back();
  };

  const handleEditSave = (updatedRow: MeasurementRow) => {
    setRows((prev) =>
      prev.map((r) => (r.id === updatedRow.id ? updatedRow : r))
    );
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

  const dholtaMainWeight = phase === "cull" ? mainWeight : totalWeight;
  const dholtaMainPcs = phase === "cull" ? mainPcs : totalPcs;
  const dholtaMainRows = phase === "cull" ? mainRows : rows;
  const dholtaCullWeight = phase === "cull" ? totalWeight : 0;
  const dholtaCullRows = phase === "cull" ? rows : [];

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

  const isCull = phase === "cull";

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

      <CullDialog
        visible={showCullDialog}
        theme={theme}
        onYes={handleCullYes}
        onNo={handleCullNo}
      />

      <DholtaModal
        visible={showDholta}
        totalWeight={dholtaMainWeight}
        totalPcs={dholtaMainPcs}
        rows={dholtaMainRows}
        cullWeightKg={dholtaCullWeight}
        cullRows={dholtaCullRows}
        theme={theme}
        insets={insets}
        onCancel={() => setShowDholta(false)}
        onSaved={async () => {
          setShowDholta(false);
          await deleteDraft(sessionDraftId.current);
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

        <View style={styles.topBarCenter}>
          <Text
            style={[
              styles.topBarTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {isCull ? t.cullSession : t.mainSession}
          </Text>
          {isCull && (
            <View
              style={[
                styles.cullPhaseBadge,
                { backgroundColor: theme.warmLight },
              ]}
            >
              <MaterialCommunityIcons
                name="bird"
                size={11}
                color={theme.warm}
              />
              <Text
                style={[
                  styles.cullPhaseBadgeText,
                  { color: theme.warm, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                CULL
              </Text>
            </View>
          )}
        </View>

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

      {isCull && mainRows.length > 0 && (
        <View
          style={[
            styles.mainSummaryStrip,
            {
              backgroundColor: theme.accentLight,
              borderBottomColor: theme.borderLight,
            },
          ]}
        >
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={theme.accent}
          />
          <Text
            style={[
              styles.mainSummaryText,
              { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            {t.mainSummaryBanner(formatWeight(mainWeight), mainPcs)}
          </Text>
        </View>
      )}

      <Animated.View
        style={[
          styles.displayPanel,
          {
            backgroundColor: theme.timerBg,
          },
        ]}
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
              {t.birds.toLowerCase()}
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
              {t.avgPerBird}
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
              {t.weightKg}
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
              {t.pcs}
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
              {t.noRowsYet}
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
                rows.length > 0
                  ? isCull
                    ? theme.warm
                    : theme.accent
                  : theme.border,
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
            {t.finishSession}
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
  topBarCenter: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { fontSize: 16 },
  cullPhaseBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cullPhaseBadgeText: { fontSize: 10, letterSpacing: 0.5 },
  mainSummaryStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  mainSummaryText: { fontSize: 13 },
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

  cullOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  cullCard: {
    width: "100%",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    gap: 8,
  },
  cullIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  cullTitle: { fontSize: 20, textAlign: "center" },
  cullHint: { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  cullBtns: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 4,
  },
  cullNoBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cullNoBtnText: { fontSize: 15 },
  cullYesBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cullYesBtnText: { fontSize: 15, color: "#FFF" },

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
    gap: 4,
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
  cullBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 4,
  },
  cullBannerText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
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
  receivedAmountSection: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  receivedAmountHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  receivedAmountLabel: { fontSize: 14, flex: 1 },
  optionalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  optionalText: { fontSize: 11 },
  receivedAmountInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 18,
    borderWidth: 1,
  },
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
