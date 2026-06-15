import { loadSubscriptionPlan, saveSubscriptionPlan } from "./storage";

export type Plan = "community" | "premium";

export async function loadPlan(userId: string): Promise<Plan> {
  const val = await loadSubscriptionPlan(userId);
  return val === "premium" ? "premium" : "community";
}

export async function savePlan(userId: string, plan: Plan): Promise<void> {
  await saveSubscriptionPlan(userId, plan);
}
