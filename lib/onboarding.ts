import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_DONE_PREFIX = "onboarding_complete_";
const ONBOARDING_DRAFT_PREFIX = "onboarding_draft_";

export type UserRole = "farmer" | "wholesaler";

export interface OnboardingData {
  role: UserRole;
  name: string;
  location: string;
  farmName?: string;
  farmCapacity?: string;
  breed?: string;
  buyingCapacity?: string;
  supplyRegions?: string;
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_DONE_PREFIX + userId);
    return val === "true";
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_DONE_PREFIX + userId, "true");
}

export async function saveOnboardingDraft(
  userId: string,
  data: Partial<OnboardingData>
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      ONBOARDING_DRAFT_PREFIX + userId,
      JSON.stringify(data)
    );
  } catch {}
}

export async function loadOnboardingDraft(
  userId: string
): Promise<Partial<OnboardingData> | null> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_DRAFT_PREFIX + userId);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export async function clearOnboardingDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_DRAFT_PREFIX + userId);
  } catch {}
}

export async function getUserProfile(
  userId: string
): Promise<OnboardingData | null> {
  try {
    const val = await AsyncStorage.getItem("user_profile_" + userId);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

export async function saveUserProfile(
  userId: string,
  data: OnboardingData
): Promise<void> {
  await AsyncStorage.setItem("user_profile_" + userId, JSON.stringify(data));
}
