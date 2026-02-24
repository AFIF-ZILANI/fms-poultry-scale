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
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useTheme } from "@/lib/useTheme";
import { loadSales, deleteSale } from "@/lib/storage";
import { formatWeight, formatDateTime } from "@/lib/utils";
import type { SaleRecord } from "@/lib/types";

function SaleCard({
  sale,
  index,
  theme,
  onDelete,
}: {
  sale: SaleRecord;
  index: number;
  theme: ReturnType<typeof useTheme>;
  onDelete: (id: string) => void;
}) {
  const handleDelete = () => {
    if (Platform.OS === "web") {
      onDelete(sale.id);
    } else {
      Alert.alert("Delete Sale", "Remove this record permanently?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(sale.id),
        },
      ]);
    }
  };

  return (
    <Animated.View
      entering={
        Platform.OS !== "web"
          ? FadeInDown.delay(index * 50).springify()
          : undefined
      }
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.borderLight,
            shadowColor: theme.cardShadow,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardDateRow}>
            <View
              style={[styles.dateBadge, { backgroundColor: theme.accentLight }]}
            >
              <Feather name="calendar" size={13} color={theme.accent} />
            </View>
            <Text
              style={[
                styles.cardDate,
                { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {formatDateTime(sale.createdAt)}
            </Text>
          </View>
          <Pressable
            onPress={handleDelete}
            hitSlop={16}
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
        </View>

        <View style={styles.cardStats}>
          <View style={styles.statBlock}>
            <Text
              style={[
                styles.statValue,
                { color: theme.accent, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(sale.totalWeightKg)}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              Total KG
            </Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <View style={styles.statBlock}>
            <Text
              style={[
                styles.statValue,
                { color: theme.warm, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {sale.totalPcs}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              Birds
            </Text>
          </View>
          <View style={[styles.statSep, { backgroundColor: theme.border }]} />
          <View style={styles.statBlock}>
            <Text
              style={[
                styles.statValue,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              {formatWeight(sale.averageWeightKg)}
            </Text>
            <Text
              style={[
                styles.statLabel,
                { color: theme.textTertiary, fontFamily: "Outfit_500Medium" },
              ]}
            >
              Avg KG
            </Text>
          </View>
        </View>

        <View
          style={[styles.cardBottom, { borderTopColor: theme.borderLight }]}
        >
          <View style={styles.rowInfo}>
            <Feather name="layers" size={12} color={theme.textTertiary} />
            <Text
              style={[
                styles.rowInfoText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {sale.rows.length} weighing{sale.rows.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <Text
            style={[
              styles.gramsInfo,
              { color: theme.accentMuted, fontFamily: "Outfit_500Medium" },
            ]}
          >
            {sale.totalWeightGrams.toLocaleString()}g
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadSales().then((data) => {
        setSales(data);
        setLoading(false);
      });
    }, [])
  );

  const handleDelete = async (id: string) => {
    await deleteSale(id);
    setSales((prev) => prev.filter((s) => s.id !== id));
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleNewMeasurement = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push("/measurement");
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

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
        <View style={styles.headerLeft}>
          <View style={[styles.logoBadge, { backgroundColor: theme.accentLight }]}>
            <MaterialCommunityIcons
              name="bird"
              size={22}
              color={theme.accent}
            />
          </View>
          <View>
            <Text
              style={[
                styles.headerTitle,
                { color: theme.text, fontFamily: "Outfit_700Bold" },
              ]}
            >
              PoultryScale
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
              {sales.length > 0
                ? `${sales.length} sale${sales.length !== 1 ? "s" : ""} recorded`
                : "Ready to weigh"}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.emptyWrap}>
          <Text
            style={[
              styles.emptyMsg,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            Loading...
          </Text>
        </View>
      ) : sales.length === 0 ? (
        <Animated.View
          style={styles.emptyWrap}
          entering={Platform.OS !== "web" ? FadeIn.delay(200) : undefined}
        >
          <View
            style={[styles.emptyIcon, { backgroundColor: theme.accentLight }]}
          >
            <MaterialCommunityIcons
              name="scale"
              size={44}
              color={theme.accent}
            />
          </View>
          <Text
            style={[
              styles.emptyTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            No sales yet
          </Text>
          <Text
            style={[
              styles.emptyMsg,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            Tap the button below to start weighing your birds
          </Text>
        </Animated.View>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SaleCard
              sale={item}
              index={index}
              theme={theme}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + webBottomInset + 100,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!sales.length}
        />
      )}

      <Pressable
        onPress={handleNewMeasurement}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.accent,
            bottom: insets.bottom + webBottomInset + 24,
            transform: [{ scale: pressed ? 0.9 : 1 }],
          },
        ]}
      >
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 22 },
  headerSub: { fontSize: 13, marginTop: 1 },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, marginBottom: 8, textAlign: "center" },
  emptyMsg: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  card: {
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardDateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cardDate: { fontSize: 13 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardStats: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statBlock: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22 },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statSep: { width: 1, height: 36, alignSelf: "center" },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  rowInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  rowInfoText: { fontSize: 12 },
  gramsInfo: { fontSize: 12 },
  fab: {
    position: "absolute",
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
});
