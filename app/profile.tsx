import { useAuth, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { useTheme } from "@/lib/useTheme";
import { useSettings } from "@/lib/SettingsContext";
import { getUserProfile, type OnboardingData } from "@/lib/onboarding";
import { loadPlan, savePlan, type Plan } from "@/lib/subscription";
import { loadSales } from "@/lib/storage";

// ─── Upgrade Modal ────────────────────────────────────────────────────────────

function UpgradeModal({
  visible,
  onClose,
  onUpgrade,
  theme,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  theme: any;
  t: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: theme.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

          <LinearGradient
            colors={["rgba(251,191,36,0.15)", "transparent"]}
            style={styles.sheetGrad}
          >
            <View style={styles.sheetIconRow}>
              <View style={[styles.sheetIcon, { backgroundColor: "#FEF3C7" }]}>
                <MaterialCommunityIcons name="shield-check" size={32} color="#F59E0B" />
              </View>
            </View>
            <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
              {t.upgradeToPremium}
            </Text>
            <Text style={[styles.sheetPrice, { color: theme.warm, fontFamily: "Outfit_700Bold" }]}>
              {t.premiumPrice}
            </Text>
          </LinearGradient>

          <View style={styles.featureList}>
            {[t.premiumFeature1, t.premiumFeature2, t.premiumFeature3].map((f: string) => (
              <View key={f} style={styles.featureRow}>
                <View style={[styles.featureCheck, { backgroundColor: "#D1FAE5" }]}>
                  <MaterialCommunityIcons name="check" size={14} color="#059669" />
                </View>
                <Text style={[styles.featureText, { color: theme.text, fontFamily: "Outfit_500Medium" }]}>
                  {f}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.upgradeBtn,
              { backgroundColor: theme.warm, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={onUpgrade}
          >
            <Text style={[styles.upgradeBtnText, { fontFamily: "Outfit_700Bold" }]}>
              {t.startPremium}
            </Text>
          </Pressable>

          <Pressable onPress={onClose} style={styles.dismissBtn}>
            <Text style={[styles.dismissText, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
              Stay on Community (Free)
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Profile Screen ───────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useSettings();

  const [profile, setProfile] = useState<OnboardingData | null>(null);
  const [plan, setPlanState] = useState<Plan>("community");
  const [totalSales, setTotalSales] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      Promise.all([getUserProfile(user.id), loadPlan(), loadSales()]).then(
        ([p, pl, sales]) => {
          setProfile(p);
          setPlanState(pl);
          setTotalSales(sales.length);
          setTotalRevenue(sales.reduce((s, r) => s + (r.deduction?.final_amount ?? 0), 0));
        }
      );
    }, [user?.id])
  );

  const handleSignOut = () => {
    Alert.alert(t.signOut, t.signOutConfirm, [
      { text: t.cancel, style: "cancel" },
      {
        text: t.signOut,
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  const handleUpgrade = async () => {
    await savePlan("premium");
    setPlanState("premium");
    setShowUpgrade(false);
  };

  const handleDowngrade = async () => {
    Alert.alert("Switch to Community", "Your data will no longer be private. Continue?", [
      { text: t.cancel, style: "cancel" },
      {
        text: "Switch",
        onPress: async () => {
          await savePlan("community");
          setPlanState("community");
        },
      },
    ]);
  };

  const isFarmer = profile?.role === "farmer";
  const displayName = profile?.name || user?.firstName || "User";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const isPremium = plan === "premium";

  const infoRows = [
    profile?.phone && { icon: "phone-outline", label: t.phoneLabel, value: profile.phone },
    profile?.location && { icon: "map-marker-outline", label: t.locationLabel, value: profile.location },
    isFarmer && profile?.farmName && { icon: "barn", label: t.farmLabel, value: profile.farmName },
    !isFarmer && profile?.businessName && { icon: "store-outline", label: t.businessLabel, value: profile.businessName },
    user?.emailAddresses?.[0]?.emailAddress && {
      icon: "email-outline",
      label: "Email",
      value: user.emailAddresses[0].emailAddress,
    },
  ].filter(Boolean) as { icon: string; label: string; value: string }[];

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Gradient header */}
        <LinearGradient
          colors={["#0D1B30", "#1A3458", "#0D1B30"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + webTopInset + 12 }]}
        >
          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={16}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>

          {/* Avatar */}
          <View style={styles.avatarArea}>
            <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.avatar}>
              <Text style={[styles.avatarText, { fontFamily: "Outfit_700Bold" }]}>{initials}</Text>
            </LinearGradient>
            <Text style={[styles.heroName, { fontFamily: "Outfit_700Bold" }]}>{displayName}</Text>
            <View style={styles.heroBadgeRow}>
              <View style={[styles.heroBadge, { backgroundColor: "rgba(59,130,246,0.3)" }]}>
                <Text style={[styles.heroBadgeText, { fontFamily: "Outfit_600SemiBold" }]}>
                  {isFarmer ? "🌾 " + t.farmerRole : "🏪 " + t.wholesalerRole}
                </Text>
              </View>
              <View style={[styles.heroBadge, {
                backgroundColor: isPremium ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.15)",
              }]}>
                <Text style={[styles.heroBadgeText, {
                  fontFamily: "Outfit_600SemiBold",
                  color: isPremium ? "#FBBF24" : "rgba(255,255,255,0.8)",
                }]}>
                  {isPremium ? "⚡ " + t.premiumBadge : "◎ " + t.communityBadge}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick stats */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}>{totalSales}</Text>
              <Text style={[styles.heroStatLabel, { fontFamily: "Outfit_400Regular" }]}>{t.dashTotalSales}</Text>
            </View>
            <View style={[styles.heroStatSep]} />
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatVal, { fontFamily: "Outfit_700Bold" }]}>
                {totalRevenue >= 1000 ? `৳${(totalRevenue / 1000).toFixed(0)}K` : `৳${totalRevenue.toFixed(0)}`}
              </Text>
              <Text style={[styles.heroStatLabel, { fontFamily: "Outfit_400Regular" }]}>{t.dashRevenue}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Your info */}
          {infoRows.length > 0 && (
            <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(60).springify() : undefined}>
              <SectionHeader label={t.infoSection} theme={theme} />
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                {infoRows.map((row, i) => (
                  <View
                    key={i}
                    style={[
                      styles.infoRow,
                      i < infoRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
                    ]}
                  >
                    <View style={[styles.infoIcon, { backgroundColor: theme.accentLight }]}>
                      <MaterialCommunityIcons name={row.icon as any} size={16} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                        {row.label}
                      </Text>
                      <Text style={[styles.infoValue, { color: theme.text, fontFamily: "Outfit_500Medium" }]}>
                        {row.value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Plan section */}
          <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(120).springify() : undefined}>
            <SectionHeader label={t.myPlan} theme={theme} />

            {isPremium ? (
              <View style={[styles.card, styles.premiumCard, { borderColor: theme.warm }]}>
                <LinearGradient
                  colors={["rgba(251,191,36,0.08)", "transparent"]}
                  style={styles.premiumGrad}
                >
                  <View style={styles.premiumCardRow}>
                    <View style={[styles.planIconBg, { backgroundColor: "#FEF3C7" }]}>
                      <MaterialCommunityIcons name="shield-check" size={24} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
                        {t.premiumPlan}
                      </Text>
                      <Text style={[styles.planPrice, { color: theme.warm, fontFamily: "Outfit_600SemiBold" }]}>
                        {t.premiumPrice} · Active
                      </Text>
                    </View>
                    <View style={[styles.activeBadge, { backgroundColor: "#D1FAE5" }]}>
                      <Text style={[styles.activeBadgeText, { fontFamily: "Outfit_600SemiBold", color: "#059669" }]}>
                        Active
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.planDesc, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
                    Your data is private and never shared with anyone.
                  </Text>
                </LinearGradient>
                <Pressable onPress={handleDowngrade} style={styles.downgradeLnk}>
                  <Text style={[styles.downgradeTxt, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                    Switch to Community (Free)
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                  <View style={styles.premiumCardRow}>
                    <View style={[styles.planIconBg, { backgroundColor: theme.accentLight }]}>
                      <MaterialCommunityIcons name="account-group-outline" size={24} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
                        {t.communityPlan}
                      </Text>
                      <Text style={[styles.planPrice, { color: theme.accent, fontFamily: "Outfit_600SemiBold" }]}>
                        Free forever
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.planDesc, { color: theme.textSecondary, fontFamily: "Outfit_400Regular" }]}>
                    {t.communityNote}
                  </Text>
                </View>

                {/* Upgrade CTA */}
                <Pressable
                  onPress={() => setShowUpgrade(true)}
                  style={({ pressed }) => [
                    styles.upgradeCard,
                    {
                      backgroundColor: theme.warm,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <View style={styles.upgradeCardRow}>
                    <MaterialCommunityIcons name="shield-check" size={22} color="#fff" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.upgradeCTATitle, { fontFamily: "Outfit_700Bold" }]}>
                        {t.upgradeToPremium}
                      </Text>
                      <Text style={[styles.upgradeCTASub, { fontFamily: "Outfit_400Regular" }]}>
                        {t.premiumPrice} · Private data
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                  </View>
                </Pressable>
              </>
            )}
          </Animated.View>

          {/* Account actions */}
          <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(180).springify() : undefined}>
            <SectionHeader label={t.accountSection} theme={theme} />
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <ActionRow
                icon="account-edit-outline"
                label={t.editProfile}
                theme={theme}
                onPress={() => router.push("/onboarding")}
              />
              <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} />
              <ActionRow
                icon="cog-outline"
                label={t.appSettings}
                theme={theme}
                onPress={() => router.push("/settings")}
              />
              <View style={[styles.rowSep, { backgroundColor: theme.borderLight }]} />
              <ActionRow
                icon="logout"
                label={t.signOut}
                theme={theme}
                onPress={handleSignOut}
                danger
              />
            </View>
          </Animated.View>

          {/* App version note */}
          <Text style={[styles.versionNote, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
            PoultryScale · v1.0.0
          </Text>
        </View>
      </ScrollView>

      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        theme={theme}
        t={t}
      />
    </View>
  );
}

function SectionHeader({ label, theme }: { label: string; theme: any }) {
  return (
    <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" }]}>
      {label}
    </Text>
  );
}

function ActionRow({ icon, label, onPress, theme, danger }: {
  icon: string;
  label: string;
  onPress: () => void;
  theme: any;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.actionIcon, {
        backgroundColor: danger ? theme.dangerLight : theme.accentLight,
      }]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={18}
          color={danger ? theme.danger : theme.accent}
        />
      </View>
      <Text style={[styles.actionLabel, {
        color: danger ? theme.danger : theme.text,
        fontFamily: "Outfit_500Medium",
        flex: 1,
      }]}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { paddingHorizontal: 20, paddingBottom: 28 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarArea: { alignItems: "center", gap: 10 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: { fontSize: 30, color: "#fff" },
  heroName: { fontSize: 22, color: "#fff" },
  heroBadgeRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  heroBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroBadgeText: { fontSize: 12, color: "#fff" },
  heroStats: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  heroStat: { alignItems: "center", gap: 4 },
  heroStatVal: { fontSize: 22, color: "#fff" },
  heroStatLabel: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  heroStatSep: { width: 1, backgroundColor: "rgba(255,255,255,0.15)" },

  body: { padding: 16, gap: 8 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 12 },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 4,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, marginBottom: 2 },
  infoValue: { fontSize: 14 },

  premiumCard: { borderWidth: 2 },
  premiumGrad: { padding: 16, gap: 10 },
  premiumCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  planIconBg: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 16 },
  planPrice: { fontSize: 13, marginTop: 2 },
  planDesc: { fontSize: 13, lineHeight: 18 },
  activeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activeBadgeText: { fontSize: 11 },
  downgradeLnk: { paddingHorizontal: 16, paddingVertical: 12 },
  downgradeTxt: { fontSize: 13, textAlign: "center" },

  upgradeCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 4,
  },
  upgradeCardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  upgradeCTATitle: { color: "#fff", fontSize: 15 },
  upgradeCTASub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },

  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 15 },
  rowSep: { height: 1, marginLeft: 62 },

  versionNote: { fontSize: 12, textAlign: "center", marginTop: 16 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingBottom: 32,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetGrad: { padding: 24, alignItems: "center", gap: 8 },
  sheetIconRow: { marginBottom: 4 },
  sheetIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 22, textAlign: "center" },
  sheetPrice: { fontSize: 28, textAlign: "center" },
  featureList: { paddingHorizontal: 24, gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureCheck: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 15, flex: 1 },
  upgradeBtn: { marginHorizontal: 24, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  upgradeBtnText: { color: "#fff", fontSize: 17 },
  dismissBtn: { alignItems: "center", paddingVertical: 16 },
  dismissText: { fontSize: 14 },
});
