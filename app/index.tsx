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
import { Ionicons, Feather } from "@expo/vector-icons";
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
      Alert.alert("Delete Sale", "Are you sure you want to remove this record?", [
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
      entering={Platform.OS !== "web" ? FadeInDown.delay(index * 60).springify() : undefined}
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
        <View style={styles.cardHeader}>
          <View style={styles.cardDateRow}>
            <Feather name="calendar" size={14} color={theme.textTertiary} />
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
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Feather name="trash-2" size={16} color={theme.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.statItem}>
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
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              Total KG
            </Text>
          </View>
          <View
            style={[styles.statDivider, { backgroundColor: theme.border }]}
          />
          <View style={styles.statItem}>
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
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              PCS
            </Text>
          </View>
          <View
            style={[styles.statDivider, { backgroundColor: theme.border }]}
          />
          <View style={styles.statItem}>
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
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              Avg KG
            </Text>
          </View>
        </View>

        <View
          style={[styles.cardFooter, { borderTopColor: theme.borderLight }]}
        >
          <View style={styles.rowCount}>
            <Feather name="layers" size={13} color={theme.textTertiary} />
            <Text
              style={[
                styles.rowCountText,
                { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
              ]}
            >
              {sale.rows.length} measurement{sale.rows.length !== 1 ? "s" : ""}
            </Text>
          </View>
          <Text
            style={[
              styles.gramsText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
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
            paddingTop: insets.top + webTopInset + 16,
            backgroundColor: theme.surface,
            borderBottomColor: theme.borderLight,
          },
        ]}
      >
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
              styles.headerSubtitle,
              { color: theme.textSecondary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            Sales History
          </Text>
        </View>
        <View
          style={[
            styles.headerBadge,
            { backgroundColor: theme.accentLight },
          ]}
        >
          <Ionicons name="scale-outline" size={20} color={theme.accent} />
        </View>
      </View>

      {loading ? (
        <View style={styles.emptyContainer}>
          <Text
            style={[
              styles.emptyText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            Loading...
          </Text>
        </View>
      ) : sales.length === 0 ? (
        <Animated.View
          style={styles.emptyContainer}
          entering={Platform.OS !== "web" ? FadeIn.delay(200) : undefined}
        >
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: theme.accentLight },
            ]}
          >
            <Ionicons name="scale-outline" size={40} color={theme.accent} />
          </View>
          <Text
            style={[
              styles.emptyTitle,
              { color: theme.text, fontFamily: "Outfit_600SemiBold" },
            ]}
          >
            No sales recorded yet
          </Text>
          <Text
            style={[
              styles.emptyText,
              { color: theme.textTertiary, fontFamily: "Outfit_400Regular" },
            ]}
          >
            Tap the button below to start your first measurement
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
            transform: [{ scale: pressed ? 0.92 : 1 }],
            shadowColor: theme.accent,
          },
        ]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 26,
    lineHeight: 32,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  cardDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardDate: {
    fontSize: 13,
  },
  cardStats: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
    alignSelf: "center",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  rowCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  rowCountText: {
    fontSize: 12,
  },
  gramsText: {
    fontSize: 12,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
