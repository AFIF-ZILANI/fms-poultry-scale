import { loadSubscriptionPlan, saveSubscriptionPlan } from "./storage";

export type Plan = "community" | "premium";

export async function loadPlan(): Promise<Plan> {
  const val = await loadSubscriptionPlan();
  return val === "premium" ? "premium" : "community";
}

export async function savePlan(plan: Plan): Promise<void> {
  await saveSubscriptionPlan(plan);
}
