import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type UserRole = "farmer" | "wholesaler";
export type SubscriptionPlan = "community" | "premium";

export interface OnboardingData {
  role: UserRole;
  name: string;
  phone: string;
  email: string;
  location: string;
  farmName?: string;
  businessName?: string;
  subscriptionPlan: SubscriptionPlan;
  farmCapacity?: number;
  breed?: string;
  buyingCapacity?: number;
  supplyRegions?: string;
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  try {
    const user = db
      .select({ isOnboarded: users.is_onboarded })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return user?.isOnboarded ?? false;
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  db.update(users)
    .set({ is_onboarded: true })
    .where(eq(users.id, userId))
    .run();
}

export async function getUserProfile(
  userId: string,
): Promise<OnboardingData | null> {
  try {
    const user = db
      .select({
        role: users.role,
        name: users.name,
        phone: users.phone,
        location: users.location,
        email: users.email,
        farmName: users.farmName,
        businessName: users.businessName,
        subscriptionPlan: users.subscriptionPlan,
        farmCapacity: users.farmCapacity,
        breed: users.breed,
        buyingCapacity: users.buyingCapacity,
        supplyRegions: users.supplyRegions,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) return null;

    return {
      role: user.role,
      name: user.name ?? "",
      phone: user.phone ?? "",
      email: user.email ?? "",
      location: user.location ?? "",
      farmName: user.farmName ?? undefined,
      businessName: user.businessName ?? undefined,
      subscriptionPlan: user.subscriptionPlan,
      farmCapacity: user.farmCapacity ?? undefined,
      breed: user.breed ?? undefined,
      buyingCapacity: user.buyingCapacity ?? undefined,
      supplyRegions: user.supplyRegions ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function saveUserProfile(
  userId: string,
  data: OnboardingData,
): Promise<void> {
  db.insert(users)
    .values({
      id: userId,
      role: data.role,
      name: data.name,
      email: data.email,
      phone: data.phone,
      location: data.location,
      farmName: data.farmName,
      businessName: data.businessName,
      subscriptionPlan: data.subscriptionPlan ?? "community",
      farmCapacity: data.farmCapacity,
      breed: data.breed,
      buyingCapacity: data.buyingCapacity,
      supplyRegions: data.supplyRegions,
      is_onboarded: true,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        role: data.role,
        name: data.name,
        phone: data.phone,
        location: data.location,
        farmName: data.farmName,
        businessName: data.businessName,
        subscriptionPlan: data.subscriptionPlan ?? "community",
        farmCapacity: data.farmCapacity,
        breed: data.breed,
        buyingCapacity: data.buyingCapacity,
        supplyRegions: data.supplyRegions,
        is_onboarded: true,
      },
    })
    .run();
}
export async function saveOnboardingDraft(
  userId: string,
  data: Partial<OnboardingData>,
): Promise<void> {
  db.insert(users)
    .values({
      id: userId,
      is_onboarded: false,
      createdAt: new Date(),
      role: data.role ?? "farmer",
      location: data.location ?? "",
      email: data.email ?? "",
      name: data.name ?? null,
      phone: data.phone ?? null,
      farmName: data.farmName ?? null,
      businessName: data.businessName ?? null,
      subscriptionPlan: data.subscriptionPlan ?? "community",
      farmCapacity: data.farmCapacity ?? null,
      breed: data.breed ?? null,
      buyingCapacity: data.buyingCapacity ?? null,
      supplyRegions: data.supplyRegions ?? null,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        role: data.role ?? "farmer",
        location: data.location ?? "",
        email: data.email ?? "",
        name: data.name ?? null,
        phone: data.phone ?? null,
        farmName: data.farmName ?? null,
        businessName: data.businessName ?? null,
        subscriptionPlan: data.subscriptionPlan ?? "community",
        farmCapacity: data.farmCapacity ?? null,
        breed: data.breed ?? null,
        buyingCapacity: data.buyingCapacity ?? null,
        supplyRegions: data.supplyRegions ?? null,
      },
    })
    .run();
}
export async function loadOnboardingDraft(
  userId: string,
): Promise<Partial<OnboardingData> | null> {
  try {
    const user = db.select().from(users).where(eq(users.id, userId)).get();

    if (!user) return null;

    return {
      role: user.role ?? undefined,
      name: user.name ?? undefined,
      phone: user.phone ?? undefined,
      location: user.location ?? undefined,
      farmName: user.farmName ?? undefined,
      businessName: user.businessName ?? undefined,
      subscriptionPlan: user.subscriptionPlan ?? undefined,
      farmCapacity: user.farmCapacity ?? undefined,
      breed: user.breed ?? undefined,
      buyingCapacity: user.buyingCapacity ?? undefined,
      supplyRegions: user.supplyRegions ?? undefined,
    };
  } catch {
    return null;
  }
}

// No clearOnboardingDraft — drafts are just the users row with
// isOnboarded: false. "Clearing" a draft would mean deleting the
// user row, which you don't want. If you need to abandon onboarding,
// just don't call markOnboardingComplete — the partial row stays
// harmlessly in the table and gets overwritten on next attempt.
