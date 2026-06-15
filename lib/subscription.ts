import AsyncStorage from "@react-native-async-storage/async-storage";

export type Plan = "community" | "premium";

const PLAN_KEY = "app_subscription_plan";

export async function loadPlan(): Promise<Plan> {
  try {
    const val = await AsyncStorage.getItem(PLAN_KEY);
    return val === "premium" ? "premium" : "community";
  } catch {
    return "community";
  }
}

export async function savePlan(plan: Plan): Promise<void> {
  await AsyncStorage.setItem(PLAN_KEY, plan);
}
