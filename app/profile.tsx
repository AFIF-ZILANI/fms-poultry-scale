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
import { MaterialCommunityIcons, Ionicons, Feather } from "@expo/vector-icons";
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
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

          <View style={styles.sheetHead}>
            <View style={[styles.sheetIconBg, { backgroundColor: "#FEF3C7" }]}>
              <MaterialCommunityIcons name="shield-check" size={30} color="#F59E0B" />
            </View>
            <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
              {t.upgradeToPremium}
            </Text>
            <Text style={[styles.sheetPrice, { color: theme.warm, fontFamily: "Outfit_700Bold" }]}>
              {t.premiumPrice}
              <Text style={{ fontSize: 14, color: theme.textSecondary, fontFamily: "Outfit_400Regular" }}>
                {" "}/month
              </Text>
            </Text>
          </View>

          <View style={styles.featureList}>
            {[t.premiumFeature1, t.premiumFeature2, t.premiumFeature3].map((f: string) => (
              <View key={f} style={[styles.featureRow, { borderBottomColor: theme.borderLight }]}>
                <View style={[styles.featureCheck, { backgroundColor: "#D1FAE5" }]}>
                  <MaterialCommunityIcons name="check" size={13} color="#059669" />
                </View>
                <Text style={[styles.featureText, { color: theme.text, fontFamily: "Outfit_500Medium" }]}>
                  {f}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.sheetActions}>
            <Pressable
              style={({ pressed }) => [
                styles.upgradeBtn,
                { backgroundColor: "#F59E0B", opacity: pressed ? 0.85 : 1 },
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
          </View>
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
      Promise.all([getUserProfile(user.id), loadPlan(user.id), loadSales(user.id)]).then(
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
    if (user?.id) await savePlan(user.id, "premium");
    setPlanState("premium");
    setShowUpgrade(false);
  };

  const handleDowngrade = () => {
    Alert.alert("Switch to Community", "Your data will no longer be private. Continue?", [
      { text: t.cancel, style: "cancel" },
      {
        text: "Switch",
        onPress: async () => {
          if (user?.id) await savePlan(user.id, "community");
          setPlanState("community");
        },
      },
    ]);
  };

  const isFarmer = profile?.role === "farmer";
  const displayName = profile?.name || user?.firstName || "User";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const isPremium = plan === "premium";
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";

  const fmtRevenue = totalRevenue >= 1_000_000
    ? `৳${(totalRevenue / 1_000_000).toFixed(1)}M`
    : totalRevenue >= 1_000
    ? `৳${(totalRevenue / 1_000).toFixed(0)}K`
    : `৳${totalRevenue.toFixed(0)}`;

  const infoRows = [
    profile?.phone ? { icon: "phone-outline", label: t.phoneLabel, value: profile.phone } : null,
    profile?.location ? { icon: "map-marker-outline", label: t.locationLabel, value: profile.location } : null,
    isFarmer && profile?.farmName ? { icon: "barn", label: t.farmLabel, value: profile.farmName } : null,
    !isFarmer && profile?.businessName ? { icon: "store-outline", label: t.businessLabel, value: profile.businessName } : null,
    email ? { icon: "email-outline", label: "Email", value: email } : null,
  ].filter(Boolean) as { icon: string; label: string; value: string }[];

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ── Top bar ── */}
      <View style={[styles.topBar, {
        paddingTop: insets.top + webTopInset + 8,
        backgroundColor: theme.surface,
        borderBottomColor: theme.borderLight,
      }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.accentLight, opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
          Profile
        </Text>
        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={14}
          style={({ pressed }) => [styles.settingsBtn, { backgroundColor: theme.accentLight, opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="settings" size={18} color={theme.accent} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── Identity card ── */}
        <Animated.View
          style={[styles.identityCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
          entering={Platform.OS !== "web" ? FadeInDown.delay(30).springify() : undefined}
        >
          {/* Avatar with ring */}
          <View style={styles.avatarWrap}>
            <View style={[styles.avatarRing, { borderColor: theme.accent + "40" }]}>
              <LinearGradient colors={["#3B82F6", "#1D4ED8"]} style={styles.avatarGrad}>
                <Text style={[styles.avatarInitials, { fontFamily: "Outfit_700Bold" }]}>{initials}</Text>
              </LinearGradient>
            </View>
            {isPremium && (
              <View style={[styles.premiumBadgePin, { backgroundColor: "#FBBF24", borderColor: theme.surface }]}>
                <MaterialCommunityIcons name="shield-check" size={11} color="#fff" />
              </View>
            )}
          </View>

          <Text style={[styles.identityName, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
            {displayName}
          </Text>
          {email ? (
            <Text style={[styles.identityEmail, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
              {email}
            </Text>
          ) : null}

          {/* Role + Plan tags */}
          <View style={styles.tagRow}>
            <View style={[styles.tag, { backgroundColor: isFarmer ? theme.accentLight : theme.warmLight }]}>
              <MaterialCommunityIcons
                name={isFarmer ? "barn" : "store-outline"}
                size={13}
                color={isFarmer ? theme.accent : theme.warm}
              />
              <Text style={[styles.tagText, {
                color: isFarmer ? theme.accent : theme.warm,
                fontFamily: "Outfit_600SemiBold",
              }]}>
                {isFarmer ? t.farmerRole : t.wholesalerRole}
              </Text>
            </View>
            <View style={[styles.tag, {
              backgroundColor: isPremium ? "#FEF3C7" : theme.borderLight,
            }]}>
              <MaterialCommunityIcons
                name={isPremium ? "shield-check" : "account-group-outline"}
                size={13}
                color={isPremium ? "#D97706" : theme.textTertiary}
              />
              <Text style={[styles.tagText, {
                color: isPremium ? "#D97706" : theme.textTertiary,
                fontFamily: "Outfit_600SemiBold",
              }]}>
                {isPremium ? t.premiumBadge : t.communityBadge}
              </Text>
            </View>
          </View>

          {/* Stats */}
          <View style={[styles.statsRow, { borderTopColor: theme.borderLight }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
                {totalSales}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                {t.dashTotalSales}
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.borderLight }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
                {fmtRevenue}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                {t.dashRevenue}
              </Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.body}>
          {/* ── Info section ── */}
          {infoRows.length > 0 && (
            <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(80).springify() : undefined}>
              <SectionLabel text={t.infoSection} theme={theme} />
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                {infoRows.map((row, i) => (
                  <View
                    key={i}
                    style={[
                      styles.infoRow,
                      i < infoRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight },
                    ]}
                  >
                    <View style={[styles.infoIconWrap, { backgroundColor: theme.accentLight }]}>
                      <MaterialCommunityIcons name={row.icon as any} size={15} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoRowLabel, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                        {row.label}
                      </Text>
                      <Text style={[styles.infoRowValue, { color: theme.text, fontFamily: "Outfit_500Medium" }]}>
                        {row.value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* ── Plan section ── */}
          <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(140).springify() : undefined}>
            <SectionLabel text={t.myPlan} theme={theme} />

            {isPremium ? (
              <View style={[styles.card, styles.premiumBorderCard, { borderColor: "#F59E0B" }]}>
                <View style={styles.planRow}>
                  <View style={[styles.planIcon, { backgroundColor: "#FEF3C7" }]}>
                    <MaterialCommunityIcons name="shield-check" size={22} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
                      {t.premiumPlan}
                    </Text>
                    <Text style={[styles.planSub, { color: "#D97706", fontFamily: "Outfit_500Medium" }]}>
                      {t.premiumPrice} · Active
                    </Text>
                  </View>
                  <View style={styles.activePill}>
                    <Text style={[styles.activePillText, { fontFamily: "Outfit_600SemiBold" }]}>Active</Text>
                  </View>
                </View>
                <Text style={[styles.planNote, { color: theme.textSecondary, borderTopColor: theme.borderLight, fontFamily: "Outfit_400Regular" }]}>
                  Your data is private and never shared with anyone.
                </Text>
                <Pressable
                  onPress={handleDowngrade}
                  style={({ pressed }) => [styles.subtleLink, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <Text style={[styles.subtleLinkText, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
                    Switch to Community (Free)
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                  <View style={styles.planRow}>
                    <View style={[styles.planIcon, { backgroundColor: theme.accentLight }]}>
                      <MaterialCommunityIcons name="account-group-outline" size={22} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: theme.text, fontFamily: "Outfit_700Bold" }]}>
                        {t.communityPlan}
                      </Text>
                      <Text style={[styles.planSub, { color: theme.accent, fontFamily: "Outfit_500Medium" }]}>
                        Free forever
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.planNote, { color: theme.textSecondary, borderTopColor: theme.borderLight, fontFamily: "Outfit_400Regular" }]}>
                    {t.communityNote}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setShowUpgrade(true)}
                  style={({ pressed }) => [styles.upgradeCard, { opacity: pressed ? 0.88 : 1 }]}
                >
                  <LinearGradient
                    colors={["#F59E0B", "#D97706"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.upgradeCardInner}
                  >
                    <View style={styles.upgradeCardLeft}>
                      <MaterialCommunityIcons name="shield-check" size={20} color="#fff" />
                      <View>
                        <Text style={[styles.upgradeCardTitle, { fontFamily: "Outfit_700Bold" }]}>
                          {t.upgradeToPremium}
                        </Text>
                        <Text style={[styles.upgradeCardSub, { fontFamily: "Outfit_400Regular" }]}>
                          {t.premiumPrice} · Private data
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </LinearGradient>
                </Pressable>
              </>
            )}
          </Animated.View>

          {/* ── Account section ── */}
          <Animated.View entering={Platform.OS !== "web" ? FadeInDown.delay(200).springify() : undefined}>
            <SectionLabel text={t.accountSection} theme={theme} />
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <ActionRow
                icon="account-edit-outline"
                label={t.editProfile}
                theme={theme}
                onPress={() => router.push("/onboarding")}
              />
              <View style={[styles.separator, { backgroundColor: theme.borderLight, marginLeft: 62 }]} />
              <ActionRow
                icon="cog-outline"
                label={t.appSettings}
                theme={theme}
                onPress={() => router.push("/settings")}
              />
              <View style={[styles.separator, { backgroundColor: theme.borderLight, marginLeft: 62 }]} />
              <ActionRow
                icon="logout"
                label={t.signOut}
                theme={theme}
                onPress={handleSignOut}
                danger
              />
            </View>
          </Animated.View>

          <Text style={[styles.versionNote, { color: theme.textTertiary, fontFamily: "Outfit_400Regular" }]}>
            PoultryScale v1.0.0
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ text, theme }: { text: string; theme: any }) {
  return (
    <Text style={[styles.sectionLabel, { color: theme.textTertiary, fontFamily: "Outfit_600SemiBold" }]}>
      {text}
    </Text>
  );
}

function ActionRow({ icon, label, onPress, theme, danger }: {
  icon: string; label: string; onPress: () => void; theme: any; danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.actionIconWrap, {
        backgroundColor: danger ? theme.dangerLight : theme.accentLight,
      }]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={17}
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
      <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  topBarTitle: { fontSize: 17 },
  backBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  settingsBtn: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // Identity card
  identityCard: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 0,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  avatarWrap: { position: "relative", marginBottom: 14 },
  avatarRing: {
    width: 90, height: 90, borderRadius: 30,
    borderWidth: 3,
    padding: 3,
  },
  avatarGrad: {
    flex: 1, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
  },
  avatarInitials: { fontSize: 32, color: "#fff" },
  premiumBadgePin: {
    position: "absolute",
    bottom: -2, right: -2,
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  identityName: { fontSize: 22, marginBottom: 4 },
  identityEmail: { fontSize: 13, marginBottom: 14 },
  tagRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  tagText: { fontSize: 12 },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    borderTopWidth: 1,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 16 },
  statVal: { fontSize: 22, marginBottom: 3 },
  statLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, marginVertical: 12 },

  // Section
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 0 },
  sectionLabel: {
    fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase",
    marginTop: 20, marginBottom: 8,
  },

  // Card
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 4,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  premiumBorderCard: { borderWidth: 1.5 },

  // Info rows
  infoRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  infoIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoRowLabel: { fontSize: 11, marginBottom: 2 },
  infoRowValue: { fontSize: 14 },

  // Plan cards
  planRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  planIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 15, marginBottom: 2 },
  planSub: { fontSize: 13 },
  planNote: {
    fontSize: 13, lineHeight: 19,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    borderTopWidth: 1,
  },
  activePill: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  activePillText: { fontSize: 11, color: "#059669" },
  subtleLink: { alignItems: "center", paddingVertical: 10, paddingBottom: 14 },
  subtleLinkText: { fontSize: 12 },

  // Upgrade card
  upgradeCard: { borderRadius: 18, overflow: "hidden", marginBottom: 4 },
  upgradeCardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
  upgradeCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  upgradeCardTitle: { fontSize: 15, color: "#fff" },
  upgradeCardSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  // Actions
  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  actionIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 15 },
  separator: { height: 1 },

  versionNote: { fontSize: 12, textAlign: "center", marginTop: 24 },

  // Upgrade modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 38, height: 4, borderRadius: 2,
    alignSelf: "center", marginTop: 14, marginBottom: 0,
  },
  sheetHead: { alignItems: "center", padding: 28, paddingTop: 24, gap: 8 },
  sheetIconBg: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  sheetTitle: { fontSize: 22, textAlign: "center" },
  sheetPrice: { fontSize: 30, textAlign: "center" },
  featureList: { paddingHorizontal: 24, gap: 0, marginBottom: 28 },
  featureRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1,
  },
  featureCheck: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 14, flex: 1 },
  sheetActions: { paddingHorizontal: 24, gap: 4 },
  upgradeBtn: {
    height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  upgradeBtnText: { color: "#fff", fontSize: 17 },
  dismissBtn: { alignItems: "center", paddingVertical: 14 },
  dismissText: { fontSize: 14 },
});
