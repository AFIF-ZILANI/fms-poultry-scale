import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
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
  SectionList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useUser } from "@clerk/expo";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { formatWeight, formatPcs, sumPcs, getRelativeTime } from "@/lib/utils";
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
  getChunkSize,
  DEFAULT_CHUNK_SIZE,
} from "@/lib/storage";
import { EditRowModal } from "@/components/EditRowModal";
import type {
  MeasurementRow,
  SaleRecord,
  TradeDeduction,
  DraftSession,
  RowGroup,
} from "@/lib/types";

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function calcDeduction(
  totalWeight: number,
  kgPerCrate: number,
  deductionPerCrateG: number,
  fullCratesOnly: boolean,
): { totalCrates: number; totalDeductionKg: number; netWeight: number } {
  const rawCrates = totalWeight / kgPerCrate;
  const totalCrates = fullCratesOnly ? Math.floor(rawCrates) : rawCrates;
  const totalDeductionKg = (totalCrates * deductionPerCrateG) / 1000;
  const netWeight = totalWeight - totalDeductionKg;
  return { totalCrates, totalDeductionKg, netWeight };
}

function groupRows(rows: MeasurementRow[], chunkSize: number): RowGroup[] {
  const total = rows.length;
  const groups: RowGroup[] = [];

  // rows[0] = newest = log number `total`
  // rows[total-1] = oldest = log number 1
  // So log number for index i = total - i

  // Group boundaries are based on log numbers: 1-10, 11-20, 21-30...
  // We need to find which group each row belongs to by its log number

  // Total groups needed
  const numGroups = Math.ceil(total / chunkSize);

  for (let g = 0; g < numGroups; g++) {
    // Log numbers in this group (1-indexed)
    const lowLogNum = g * chunkSize + 1; // e.g. 1, 11, 21
    const highLogNum = Math.min((g + 1) * chunkSize, total); // e.g. 10, 20, 14

    // Convert log numbers back to array indices
    // logNum = total - arrayIndex  =>  arrayIndex = total - logNum
    const highIndex = total - lowLogNum; // array index of lowest log num
    const lowIndex = total - highLogNum; // array index of highest log num

    const chunk = rows.slice(lowIndex, highIndex + 1);
    // chunk is newest-first within the group, which is correct

    const totalWeight = chunk.reduce((sum, r) => sum + (r.weightKg ?? 0), 0);
    const totalPcs = chunk.reduce((sum, r) => sum + (r.pcs ?? 0), 0);
    const avgWeight = totalPcs > 0 ? totalWeight / totalPcs : 0;

    groups.push({
      groupLabel: `${lowLogNum} – ${highLogNum}`,
      totalWeight,
      totalPcs,
      avgWeight,
      data: chunk,
    });
  }

  // Reverse so newest group (highest log numbers) shows at top
  return groups.reverse();
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
  const [timeAgo, setTimeAgo] = useState(getRelativeTime(row.timestamp, t));
  const lastEdit = row.editHistory?.[0];
  const [editAgo, setEditAgo] = useState(
    lastEdit ? getRelativeTime(lastEdit.timestamp, t) : "",
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(getRelativeTime(row.timestamp, t));
      if (lastEdit) setEditAgo(getRelativeTime(lastEdit.timestamp, t));
    }, 5000);
    return () => clearInterval(interval);
  }, [row.timestamp, lastEdit, t]);

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
            {formatPcs(row.pcs, t.unknown)}
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

function PcsOptionalDialog({
  visible,
  theme,
  onTrack,
  onSkip,
}: {
  visible: boolean;
  theme: ReturnType<typeof useTheme>;
  onTrack: () => void;
  onSkip: () => void;
}) {
  const { t } = useSettings();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.cullOverlay}>
        <Animated.View
          entering={Platform.OS !== "web" ? FadeIn.duration(200) : undefined}
          style={[
            styles.cullCard,
            { backgroundColor: theme.surface, borderColor: theme.borderLight },
          ]}
        >
          <View
            style={[
              styles.cullIconWrap,
              { backgroundColor: theme.accentLight },
            ]}
          >
            <MaterialCommunityIcons
              name="counter"
              size={28}
              color={theme.accent}
            />
          </View>
          <Text
            style={[
              styles.cullTitle,
              { color: theme.text, fontFamily: "Outfit_700Bold" },
            ]}
          >
            {t.pcsOptionalTitle}
          </Text>
          <Text
            style={[
              styles.cullHint,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            {t.pcsOptionalDesc}
          </Text>
          <View style={styles.cullBtns}>
            <Pressable
              onPress={onSkip}
              style={({ pressed }) => [
                styles.cullNoBtn,
                { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.cullNoBtnText,
                  { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                ]}
              >
                {t.pcsOptionalSkip}
              </Text>
            </Pressable>
            <Pressable
              onPress={onTrack}
              style={({ pressed }) => [
                styles.cullYesBtn,
                {
                  backgroundColor: theme.accent,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Ionicons name="checkmark" size={16} color="#FFF" />
              <Text
                style={[
                  styles.cullYesBtnText,
                  { fontFamily: "Outfit_700Bold" },
                ]}
              >
                {t.pcsOptionalTrack}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function CullDialog({
  visible,
  theme,
  onNo,
  onYes,
}: {
  visible: boolean;
  theme: ReturnType<typeof useTheme>;
  onNo: () => void;
  onYes: () => void;
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
            style={[styles.cullIconWrap, { backgroundColor: theme.warmLight }]}
          >
            <MaterialCommunityIcons name="bird" size={30} color={theme.warm} />
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
              <MaterialCommunityIcons name="bird" size={15} color="#FFF" />
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

function TradeDeductionModal({
  visible,
  totalWeight,
  totalPcs,
  pcsTracked,
  rows,
  cullWeightKg,
  cullRows,
  theme,
  insets,
  onCancel,
  onSaved,
  userId,
}: {
  visible: boolean;
  totalWeight: number;
  totalPcs: number;
  pcsTracked: boolean;
  rows: MeasurementRow[];
  cullWeightKg: number;
  cullRows: MeasurementRow[];
  theme: ReturnType<typeof useTheme>;
  insets: { top: number; bottom: number };
  onCancel: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const { t } = useSettings();
  const [kgPerCrate, setKgPerCrate] = useState("");
  const [deductionG, setDeductionG] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [fullCratesOnly, setFullCratesOnly] = useState(true);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [cullSold, setCullSold] = useState(false);
  const [cullPricingMode, setCullPricingMode] = useState<
    "per_kg" | "per_piece"
  >("per_kg");
  const [cullPrice, setCullPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const deductionRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);
  const receivedRef = useRef<TextInput>(null);
  const cullPriceRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setReceivedAmount("");
      setBuyerName("");
      setCullSold(false);
      setCullPrice("");
      Promise.all([
        loadLastPricePerKg(userId),
        loadLastKgPerCrate(userId),
        loadLastDeductionG(userId),
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
  const cullPriceNum = parseFloat(cullPrice);
  const cullPcs = sumPcs(cullRows);

  // Cull session happened if rows were recorded
  const hasCull = cullRows.length > 0;

  const isValidCullPrice =
    !hasCull || !cullSold
      ? true
      : cullPrice.length > 0 && !isNaN(cullPriceNum) && cullPriceNum > 0;

  const isValid =
    kgPerCrate.length > 0 &&
    deductionG.length > 0 &&
    pricePerKg.length > 0 &&
    !isNaN(kgPerCrateNum) &&
    kgPerCrateNum > 0 &&
    !isNaN(deductionGNum) &&
    deductionGNum >= 0 &&
    !isNaN(pricePerKgNum) &&
    pricePerKgNum > 0 &&
    isValidCullPrice;

  // KEY FIX: crate count is based on (gross - cull_weight), not full gross.
  // For pcs_only mode, cullWeightKg is 0 so subtotalGross = totalWeight.
  const subtotalGross = totalWeight - cullWeightKg;
  const calc = isValid
    ? calcDeduction(subtotalGross, kgPerCrateNum, deductionGNum, fullCratesOnly)
    : null;

  // net main weight = subtotalGross - crate_deduction
  const netMainWeight = calc !== null ? calc.netWeight : null;

  const mainAmount =
    netMainWeight !== null && pricePerKgNum > 0
      ? netMainWeight * pricePerKgNum
      : null;

  const cullAmount =
    hasCull && cullSold && !isNaN(cullPriceNum) && cullPriceNum > 0
      ? cullPricingMode === "per_kg"
        ? cullWeightKg * cullPriceNum
        : cullPcs * cullPriceNum
      : 0;

  const finalAmount = mainAmount !== null ? mainAmount + cullAmount : null;

  const receivedAmountNum = parseFloat(receivedAmount);
  const validReceivedAmount =
    receivedAmount.length > 0 &&
    !isNaN(receivedAmountNum) &&
    receivedAmountNum > 0;

  const balanceDue =
    validReceivedAmount && finalAmount !== null
      ? finalAmount - receivedAmountNum
      : null;

  const handleSave = async () => {
    if (
      !isValid ||
      !calc ||
      finalAmount === null ||
      netMainWeight === null ||
      mainAmount === null
    )
      return;
    setSaving(true);

    try {
      const deduction: TradeDeduction = {
        gross_weight: totalWeight,
        kg_per_crate: kgPerCrateNum,
        deduction_per_crate_g: deductionGNum,
        full_crates_only: fullCratesOnly,
        total_crates: calc.totalCrates,
        total_deduction_kg: calc.totalDeductionKg,
        cull_weight_kg: cullWeightKg,
        net_weight: netMainWeight,
        price_per_kg: pricePerKgNum,
        main_amount: mainAmount,
        cull_sold: hasCull ? cullSold : false,
        cull_pricing_mode: hasCull && cullSold ? cullPricingMode : undefined,
        cull_price: hasCull && cullSold ? cullPriceNum : undefined,
        cull_pcs: hasCull ? cullPcs : undefined,
        cull_amount: cullAmount,
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
        pcsTracked,
        averageWeightKg: avgWeightKg,
        averageWeightGrams: avgWeightGrams,
        rows,
        cullRows: cullRows.length > 0 ? cullRows : undefined,
        createdAt: Date.now(),
        deduction,
        receivedAmount: validReceivedAmount ? receivedAmountNum : undefined,
        buyerName: buyerName.trim() || undefined,
      };

      await Promise.all([
        saveSale(userId, sale),
        saveLastPricePerKg(userId, pricePerKg),
        saveLastKgPerCrate(userId, kgPerCrate),
        saveLastDeductionG(userId, deductionG),
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
  const rawCrates = isValid ? subtotalGross / kgPerCrateNum : 0;

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
          {/* Gross banner */}
          <View
            style={[styles.grossBanner, { backgroundColor: theme.timerBg }]}
          >
            <Text
              style={[styles.grossLabel, { fontFamily: "Outfit_400Regular" }]}
            >
              {t.grossWeight}
            </Text>
            <Text style={[styles.grossValue, { fontFamily: "Outfit_700Bold" }]}>
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

          {/* Buyer name — optional, full-width */}
          <View
            style={[
              styles.inputCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
                marginBottom: 16,
              },
            ]}
          >
            <View style={[styles.buyerNameCard]}>
              <View style={styles.buyerNameHeader}>
                <View
                  style={[
                    styles.buyerIconWrap,
                    { backgroundColor: theme.accentLight },
                  ]}
                >
                  <Feather name="user" size={16} color={theme.accent} />
                </View>
                <Text
                  style={[
                    styles.buyerNameLabel,
                    { color: theme.text, fontFamily: "Outfit_600SemiBold" },
                  ]}
                >
                  {t.buyerName}
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
                value={buyerName}
                onChangeText={setBuyerName}
                placeholder={t.buyerNamePlaceholder}
                placeholderTextColor={theme.textTertiary}
                returnKeyType="next"
                onSubmitEditing={() => deductionRef.current?.focus()}
                style={[
                  styles.buyerNameInput,
                  {
                    color: theme.text,
                    fontFamily: "Outfit_600SemiBold",
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
              />
            </View>
          </View>

          {/* Deduction parameters */}
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
                  {t.deductionPerCrate}
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

          {/* Cull pricing — only when cull session exists */}
          {hasCull && (
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
                {t.cullPricingSection}
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
                {/* Sold / Not sold toggle */}
                <View
                  style={[
                    styles.inputRow,
                    {
                      borderBottomColor: theme.borderLight,
                      borderBottomWidth: cullSold ? 1 : 0,
                    },
                  ]}
                >
                  <View style={styles.inputLabelWrap}>
                    <MaterialCommunityIcons
                      name="bird"
                      size={16}
                      color={theme.warm}
                    />
                    <Text
                      style={[
                        styles.inputFieldLabel,
                        { color: theme.text, fontFamily: "Outfit_500Medium" },
                      ]}
                    >
                      {t.cullSoldQuestion}
                    </Text>
                  </View>
                  <View style={styles.segmentRow}>
                    <Pressable
                      onPress={() => setCullSold(false)}
                      style={[
                        styles.segmentBtn,
                        {
                          backgroundColor: !cullSold
                            ? theme.borderLight
                            : "transparent",
                          borderColor: !cullSold ? theme.border : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: !cullSold ? theme.text : theme.textTertiary,
                            fontFamily: !cullSold
                              ? "Outfit_700Bold"
                              : "Outfit_400Regular",
                          },
                        ]}
                      >
                        {t.no}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCullSold(true)}
                      style={[
                        styles.segmentBtn,
                        {
                          backgroundColor: cullSold
                            ? theme.warmLight
                            : "transparent",
                          borderColor: cullSold ? theme.warm : "transparent",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: cullSold ? theme.warm : theme.textTertiary,
                            fontFamily: cullSold
                              ? "Outfit_700Bold"
                              : "Outfit_400Regular",
                          },
                        ]}
                      >
                        {t.yes}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {cullSold && (
                  <>
                    {/* Per kg / Per piece toggle */}
                    <View
                      style={[
                        styles.inputRow,
                        { borderBottomColor: theme.borderLight },
                      ]}
                    >
                      <View style={styles.inputLabelWrap}>
                        <Feather
                          name="sliders"
                          size={16}
                          color={theme.accent}
                        />
                        <Text
                          style={[
                            styles.inputFieldLabel,
                            {
                              color: theme.text,
                              fontFamily: "Outfit_500Medium",
                            },
                          ]}
                        >
                          {t.cullPricingMode}
                        </Text>
                      </View>
                      <View style={styles.segmentRow}>
                        <Pressable
                          onPress={() => setCullPricingMode("per_kg")}
                          style={[
                            styles.segmentBtn,
                            {
                              backgroundColor:
                                cullPricingMode === "per_kg"
                                  ? theme.accentLight
                                  : "transparent",
                              borderColor:
                                cullPricingMode === "per_kg"
                                  ? theme.accent
                                  : theme.borderLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              {
                                color:
                                  cullPricingMode === "per_kg"
                                    ? theme.accent
                                    : theme.textTertiary,
                                fontFamily:
                                  cullPricingMode === "per_kg"
                                    ? "Outfit_700Bold"
                                    : "Outfit_400Regular",
                              },
                            ]}
                          >
                            {t.perKg}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setCullPricingMode("per_piece")}
                          style={[
                            styles.segmentBtn,
                            {
                              backgroundColor:
                                cullPricingMode === "per_piece"
                                  ? theme.accentLight
                                  : "transparent",
                              borderColor:
                                cullPricingMode === "per_piece"
                                  ? theme.accent
                                  : theme.borderLight,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              {
                                color:
                                  cullPricingMode === "per_piece"
                                    ? theme.accent
                                    : theme.textTertiary,
                                fontFamily:
                                  cullPricingMode === "per_piece"
                                    ? "Outfit_700Bold"
                                    : "Outfit_400Regular",
                              },
                            ]}
                          >
                            {t.perPiece}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Cull price input */}
                    <View style={[styles.inputRow, { borderBottomWidth: 0 }]}>
                      <View style={styles.inputLabelWrap}>
                        <Feather name="tag" size={16} color={theme.warm} />
                        <Text
                          style={[
                            styles.inputFieldLabel,
                            {
                              color: theme.text,
                              fontFamily: "Outfit_500Medium",
                            },
                          ]}
                        >
                          {cullPricingMode === "per_kg"
                            ? t.cullPriceKg
                            : t.cullPricePiece}
                        </Text>
                      </View>
                      <TextInput
                        ref={cullPriceRef}
                        value={cullPrice}
                        onChangeText={setCullPrice}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 120"
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
                        testID="cull-price-input"
                      />
                    </View>
                  </>
                )}
              </View>
            </>
          )}

          {/* Calculation summary */}
          {calc &&
            finalAmount !== null &&
            netMainWeight !== null &&
            mainAmount !== null && (
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

                {/* Gross weight */}
                <SummaryRow
                  label={t.grossWeight}
                  value={`${formatWeight(totalWeight)} KG`}
                  theme={theme}
                />

                {/* Cull weight — always shown for full transparency */}
                {hasCull ? (
                  <>
                    <SummaryRow
                      label={t.cullWeight}
                      value={`−${formatWeight(cullWeightKg)} KG`}
                      theme={theme}
                      isNegative
                    />
                    <SummaryRow
                      label={t.subtotalGross}
                      value={`${formatWeight(subtotalGross)} KG`}
                      theme={theme}
                    />
                  </>
                ) : (
                  <SummaryRow label={t.cullWeight} value="0 KG" theme={theme} />
                )}

                {/* Explicit floor calculation */}
                {fullCratesOnly ? (
                  <SummaryRow
                    label={`${formatWeight(subtotalGross)} ÷ ${kgPerCrateNum} = ${rawCrates.toFixed(3)} → ${calc.totalCrates} crates`}
                    value={`${calc.totalCrates}`}
                    theme={theme}
                  />
                ) : (
                  <SummaryRow
                    label={t.totalCrates}
                    value={`${calc.totalCrates.toFixed(3)}`}
                    theme={theme}
                  />
                )}

                {/* Crate deduction */}
                <SummaryRow
                  label={`${calc.totalCrates} × ${deductionGNum}g deduction`}
                  value={`−${formatWeight(calc.totalDeductionKg)} KG`}
                  theme={theme}
                  isNegative
                />

                {/* Net main weight */}
                <SummaryRow
                  label={t.payableWeight}
                  value={`${formatWeight(netMainWeight)} KG`}
                  theme={theme}
                  isHighlight
                />

                {/* × price/kg label */}
                <View style={styles.multiplyRow}>
                  <Text
                    style={[
                      styles.multiplyText,
                      {
                        color: theme.textTertiary,
                        fontFamily: "Outfit_400Regular",
                      },
                    ]}
                  >
                    × Tk {pricePerKgNum.toFixed(2)} / kg
                  </Text>
                </View>

                {/* Main amount */}
                <SummaryRow
                  label={t.mainAmount}
                  value={`Tk ${mainAmount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`}
                  theme={theme}
                />

                {/* Cull revenue line */}
                {hasCull && cullSold && cullAmount > 0 && (
                  <SummaryRow
                    label={
                      cullPricingMode === "per_kg"
                        ? `${t.cullAmount} (${formatWeight(cullWeightKg)} kg × Tk ${cullPriceNum.toFixed(2)})`
                        : `${t.cullAmount} (${cullPcs} birds × Tk ${cullPriceNum.toFixed(2)})`
                    }
                    value={`+ Tk ${cullAmount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`}
                    theme={theme}
                    isHighlight
                  />
                )}

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

                  {/* Balance due preview */}
                  {balanceDue !== null && (
                    <View
                      style={[
                        styles.balanceDueRow,
                        {
                          backgroundColor:
                            balanceDue > 0
                              ? theme.dangerLight
                              : theme.successLight,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.balanceDueLabel,
                          {
                            color:
                              balanceDue > 0 ? theme.danger : theme.success,
                            fontFamily: "Outfit_600SemiBold",
                          },
                        ]}
                      >
                        {t.balanceDue}
                      </Text>
                      <Text
                        style={[
                          styles.balanceDueValue,
                          {
                            color:
                              balanceDue > 0 ? theme.danger : theme.success,
                            fontFamily: "Outfit_700Bold",
                          },
                        ]}
                      >
                        Tk{" "}
                        {Math.abs(balanceDue).toLocaleString("en-PK", {
                          maximumFractionDigits: 2,
                        })}
                        {balanceDue < 0 ? " (overpaid)" : ""}
                      </Text>
                    </View>
                  )}
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
  const { user } = useUser();
  const userId = user?.id ?? "";
  const { draftId: draftIdParam } = useLocalSearchParams<{
    draftId?: string;
  }>();

  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [mainRows, setMainRows] = useState<MeasurementRow[]>([]);
  const [phase, setPhase] = useState<"main" | "cull">("main");
  // Show setup dialog for new sessions (not draft resumes)
  const [showPcsDialog, setShowPcsDialog] = useState(
    !(typeof draftIdParam === "string" && draftIdParam.length > 0),
  );
  const [pcsOptional, setPcsOptional] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [showCullDialog, setShowCullDialog] = useState(false);
  const [editingRow, setEditingRow] = useState<MeasurementRow | null>(null);
  const [isEnterPcsMode, setIsEnterPcsMode] = useState(false);
  const [chunkSize, setChunkSizeState] = useState(DEFAULT_CHUNK_SIZE);

  const weightRef = useRef<TextInput>(null);
  const enterPcsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(Date.now());
  const sessionDraftId = useRef<string>(
    typeof draftIdParam === "string" && draftIdParam.length > 0
      ? draftIdParam
      : Crypto.randomUUID(),
  );
  const hasEverHadRows = useRef(
    typeof draftIdParam === "string" && draftIdParam.length > 0,
  );
  const draftLoaded = useRef(false);

  useFocusEffect(
    useCallback(() => {
      getChunkSize(userId).then(setChunkSizeState);
    }, [userId]),
  );

  const groupedRows = useMemo(() => groupRows(rows, chunkSize), [rows]);
  // Cancel any pending auto-open timer on unmount
  useEffect(
    () => () => {
      if (enterPcsTimerRef.current) clearTimeout(enterPcsTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (draftLoaded.current) return;
    const id = typeof draftIdParam === "string" ? draftIdParam : "";
    if (!id) return;
    draftLoaded.current = true;
    loadDraft(id).then((draft) => {
      if (!draft) return;
      startTimeRef.current = draft.createdAt;
      if (draft.pcsOptional) setPcsOptional(true);
      if (
        draft.phase === "cull" &&
        draft.mainRows &&
        draft.mainRows.length > 0
      ) {
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
      pcsOptional: pcsOptional || undefined,
      createdAt: startTimeRef.current,
      updatedAt: Date.now(),
      totalWeightKg: rows.reduce((s, r) => s + r.weightKg, 0),
      totalPcs: sumPcs(rows),
    };
    if (userId) saveDraft(userId, draft);
  }, [rows, mainRows, phase, pcsOptional, userId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalWeight = rows.reduce((sum, r) => sum + r.weightKg, 0);
  const totalPcs = sumPcs(rows);
  // When pcs tracking is skipped, average per bird is meaningless — default to 0
  // and hide it in the UI.
  const avgWeight = pcsOptional || totalPcs === 0 ? 0 : totalWeight / totalPcs;

  const mainWeight = mainRows.reduce((sum, r) => sum + r.weightKg, 0);
  const mainPcs = sumPcs(mainRows);

  const performAddRow = useCallback(
    (weight: number) => {
      const newRow: MeasurementRow = {
        id: Crypto.randomUUID(),
        weightKg: weight,
        // Unknown until entered. Tracked sessions capture it via the edit modal
        // below; skipped (pcsOptional) sessions leave it unknown.
        pcs: null,
        timestamp: Date.now(),
      };

      setRows((prev) => [newRow, ...prev]);
      setWeightInput("");
      Keyboard.dismiss();

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (!pcsOptional) {
        // Auto-open the edit modal to enter bird count after row animation settles
        if (enterPcsTimerRef.current) clearTimeout(enterPcsTimerRef.current);
        enterPcsTimerRef.current = setTimeout(() => {
          setEditingRow(newRow);
          setIsEnterPcsMode(true);
        }, 800);
      }
    },
    [pcsOptional],
  );

  const handleAddRow = useCallback(() => {
    const weight = parseFloat(weightInput);

    if (isNaN(weight) || weight <= 0) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    if (weight > 500 && Platform.OS !== "web") {
      Alert.alert(t.weightTooLargeTitle, t.weightTooLargeMessage, [
        { text: t.cancel, style: "cancel" },
        { text: t.addAnyway, onPress: () => performAddRow(weight) },
      ]);
      return;
    }

    performAddRow(weight);
  }, [weightInput, performAddRow, t]);

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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      setShowDeductionModal(true);
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
    setShowDeductionModal(true);
  };

  const handleBack = () => {
    router.back();
  };

  const handleEditSave = (updatedRow: MeasurementRow) => {
    setRows((prev) =>
      prev.map((r) => (r.id === updatedRow.id ? updatedRow : r)),
    );
    setEditingRow(null);
    setIsEnterPcsMode(false);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleEditClose = () => {
    setEditingRow(null);
    setIsEnterPcsMode(false);
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
        currentPcs: row.pcs == null ? "" : String(row.pcs),
      },
    });
  };

  const deductionMainWeight = phase === "cull" ? mainWeight : totalWeight;
  const deductionMainPcs = phase === "cull" ? mainPcs : totalPcs;
  const deductionMainRows = phase === "cull" ? mainRows : rows;
  const deductionCullWeight = phase === "cull" ? totalWeight : 0;
  const deductionCullRows = phase === "cull" ? rows : [];

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const canAdd =
    weightInput.length > 0 &&
    !isNaN(parseFloat(weightInput)) &&
    parseFloat(weightInput) > 0;

  const editingRowNumber = editingRow
    ? rows.length - rows.findIndex((r) => r.id === editingRow.id)
    : 1;

  const isCull = phase === "cull";

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <PcsOptionalDialog
        visible={showPcsDialog}
        theme={theme}
        onTrack={() => {
          setPcsOptional(false);
          setShowPcsDialog(false);
        }}
        onSkip={() => {
          setPcsOptional(true);
          setShowPcsDialog(false);
        }}
      />

      <EditRowModal
        visible={editingRow !== null}
        row={editingRow}
        rowNumber={editingRowNumber}
        onClose={handleEditClose}
        onSave={handleEditSave}
        onViewHistory={handleViewHistory}
        enterPcsMode={isEnterPcsMode}
        pcsOptional={pcsOptional}
      />

      <CullDialog
        visible={showCullDialog}
        theme={theme}
        onYes={handleCullYes}
        onNo={handleCullNo}
      />

      <TradeDeductionModal
        visible={showDeductionModal}
        totalWeight={deductionMainWeight}
        totalPcs={deductionMainPcs}
        pcsTracked={!pcsOptional}
        rows={deductionMainRows}
        cullWeightKg={deductionCullWeight}
        cullRows={deductionCullRows}
        theme={theme}
        insets={insets}
        userId={userId}
        onCancel={() => setShowDeductionModal(false)}
        onSaved={async () => {
          setShowDeductionModal(false);
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
          <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
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
              style={[styles.displayStatVal, { fontFamily: "Outfit_700Bold" }]}
            >
              {pcsOptional ? t.unknown : totalPcs}
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
          {/* Average per bird is meaningless without bird counts */}
          {!pcsOptional && (
            <>
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
            </>
          )}
        </View>
      </Animated.View>

      <View
        style={[
          styles.inputBar,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {!pcsOptional && (
          <View
            style={[
              styles.pcsTrackingBadge,
              { backgroundColor: theme.accentLight },
            ]}
          >
            <Ionicons name="checkmark-circle" size={12} color={theme.accent} />
            <Text
              style={[
                styles.pcsTrackingText,
                { color: theme.accent, fontFamily: "Outfit_600SemiBold" },
              ]}
            >
              {t.pcsOptionalTrack}
            </Text>
          </View>
        )}
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
              testID="weight-input"
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

      {/* <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <RowItem
            row={item}
            rowNumber={rows.length - index}
            theme={theme}
            onEdit={(row) => {
              // Cancel auto-open timer if user manually taps edit
              if (enterPcsTimerRef.current)
                clearTimeout(enterPcsTimerRef.current);
              setIsEnterPcsMode(false);
              setEditingRow(row);
            }}
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
      /> */}

      <SectionList
        sections={groupedRows}
        keyExtractor={(item) => item.id}
        renderItem={({ item, section }) => {
          // Compute rowNumber from the full rows array
          const globalIndex = rows.findIndex((r) => r.id === item.id);
          const rowNumber = rows.length - globalIndex;

          return (
            <RowItem
              row={item}
              rowNumber={rowNumber}
              theme={theme}
              onEdit={(row) => {
                if (enterPcsTimerRef.current)
                  clearTimeout(enterPcsTimerRef.current);
                setIsEnterPcsMode(false);
                setEditingRow(row);
              }}
            />
          );
        }}
        renderSectionHeader={({ section }) => (
          <GroupHeader section={section} theme={theme} />
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
        stickySectionHeadersEnabled={false} // set true if you want sticky group headers
        ListEmptyComponent={
          <View style={styles.emptyRows}>
            <Feather name="inbox" size={28} color={theme.textTertiary} />
            <Text
              style={[
                styles.emptyRowsText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
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

// function GroupHeader({
//   section,
//   theme,
// }: {
//   section: RowGroup;
//   theme: ReturnType<typeof useTheme>;
// }) {
//   return (
//     <View
//       style={[
//         styles.groupHeader,
//         { backgroundColor: theme.surface, borderColor: theme.border },
//       ]}
//     >
//       <Text
//         style={[
//           styles.groupLabel,
//           { color: theme.textSecondary, fontFamily: "Outfit_600SemiBold" },
//         ]}
//       >
//         ({section.groupLabel})
//       </Text>
//       <View style={styles.groupStats}>
//         <View style={styles.groupStat}>
//           <Text
//             style={[
//               styles.statValue,
//               { color: theme.text, fontFamily: "Outfit_600SemiBold" },
//             ]}
//           >
//             {section.totalWeight.toFixed(2)} kg
//           </Text>
//           <Text
//             style={[
//               styles.statLabel,
//               { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
//             ]}
//           >
//             total wt
//           </Text>
//         </View>
//         <View style={styles.groupStat}>
//           <Text
//             style={[
//               styles.statValue,
//               { color: theme.text, fontFamily: "Outfit_600SemiBold" },
//             ]}
//           >
//             {section.totalPcs}
//           </Text>
//           <Text
//             style={[
//               styles.statLabel,
//               { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
//             ]}
//           >
//             total pcs
//           </Text>
//         </View>
//         <View style={styles.groupStat}>
//           <Text
//             style={[
//               styles.statValue,
//               { color: theme.text, fontFamily: "Outfit_600SemiBold" },
//             ]}
//           >
//             {section.avgWeight.toFixed(3)} kg
//           </Text>
//           <Text
//             style={[
//               styles.statLabel,
//               { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
//             ]}
//           >
//             avg wt
//           </Text>
//         </View>
//       </View>
//     </View>
//   );
// }

function GroupHeader({
  section,
  theme,
}: {
  section: RowGroup;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.groupHeader]}>
      <View style={[styles.groupDivider, { backgroundColor: theme.border }]} />
      <Text
        style={[
          styles.groupLabel,
          { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
        ]}
      >
        {section.groupLabel}
        {"     |     "}
        {section.totalWeight.toFixed(2)} kg{"     |     "}
        {section.totalPcs} pcs{"     |     "}avg {section.avgWeight.toFixed(3)}{" "}
        kg
      </Text>
      <View style={[styles.groupDivider, { backgroundColor: theme.border }]} />
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

  // groupHeader: {
  //   borderWidth: 1,
  //   borderRadius: 10,
  //   padding: 12,
  //   marginBottom: 6,
  //   marginTop: 10,
  // },
  // groupLabel: {
  //   fontSize: 13,
  //   marginBottom: 8,
  // },
  // groupStats: {
  //   flexDirection: "row",
  //   justifyContent: "space-between",
  // },
  // groupStat: {
  //   alignItems: "center",
  //   flex: 1,
  // },
  // statValue: {
  //   fontSize: 15,
  // },
  // statLabel: {
  //   fontSize: 11,
  //   marginTop: 2,
  // },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  groupDivider: {
    flex: 1,
    height: 1,
  },
  groupLabel: {
    fontSize: 11,
    opacity: 0.7,
  },
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
  cullHint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
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
  balanceDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
  },
  balanceDueLabel: { fontSize: 14 },
  balanceDueValue: { fontSize: 18 },
  segmentRow: {
    flexDirection: "row",
    gap: 6,
  },
  segmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    minWidth: 56,
    alignItems: "center",
  },
  segmentText: { fontSize: 14 },
  multiplyRow: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  multiplyText: { fontSize: 13 },
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
  pcsTrackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  pcsTrackingText: { fontSize: 11 },
  buyerNameCard: {
    padding: 16,
  },
  buyerNameHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  buyerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buyerNameLabel: { fontSize: 15, flex: 1 },
  buyerNameInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 17,
  },
});
