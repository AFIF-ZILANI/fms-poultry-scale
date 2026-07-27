import {
  isOnboardingComplete,
  markOnboardingComplete,
  saveOnboardingDraft,
  loadOnboardingDraft,
  getUserProfile,
  saveUserProfile,
  type OnboardingData,
} from "../lib/onboarding";
import { applyMigrations, resetDb } from "./helpers/db";

beforeAll(() => applyMigrations());
beforeEach(() => resetDb());

function makeProfile(o: Partial<OnboardingData> = {}): OnboardingData {
  return {
    role: "farmer",
    name: "Afif",
    phone: "01700000000",
    email: "afif@example.com",
    location: "Dhaka",
    farmName: "Green Farm",
    subscriptionPlan: "community",
    ...o,
  };
}

describe("isOnboardingComplete", () => {
  it("is false for a user with no row", async () => {
    expect(await isOnboardingComplete("nobody")).toBe(false);
  });

  it("is false while only a draft has been saved", async () => {
    await saveOnboardingDraft("user-1", { name: "Afif" });
    expect(await isOnboardingComplete("user-1")).toBe(false);
  });

  it("is true after the profile is saved", async () => {
    await saveUserProfile("user-1", makeProfile());
    expect(await isOnboardingComplete("user-1")).toBe(true);
  });

  it("is true after markOnboardingComplete", async () => {
    await saveOnboardingDraft("user-1", { name: "Afif" });
    await markOnboardingComplete("user-1");
    expect(await isOnboardingComplete("user-1")).toBe(true);
  });

  it("isolates state by user", async () => {
    await saveUserProfile("user-1", makeProfile());
    expect(await isOnboardingComplete("user-2")).toBe(false);
  });
});

describe("profile round-trip", () => {
  it("returns null for an unknown user", async () => {
    expect(await getUserProfile("nobody")).toBeNull();
  });

  it("saves and reads back every field", async () => {
    const profile = makeProfile({
      role: "wholesaler",
      businessName: "Zerod Traders",
      buyingCapacity: 5000,
      supplyRegions: "Dhaka, Chattogram",
      subscriptionPlan: "premium",
    });
    await saveUserProfile("user-1", profile);

    expect(await getUserProfile("user-1")).toMatchObject(profile);
  });

  it("overwrites an existing profile instead of erroring", async () => {
    await saveUserProfile("user-1", makeProfile({ name: "First" }));
    await saveUserProfile("user-1", makeProfile({ name: "Second" }));

    expect((await getUserProfile("user-1"))?.name).toBe("Second");
  });

  it("upgrades a draft in place, keeping the same row", async () => {
    await saveOnboardingDraft("user-1", { name: "Afif", location: "Dhaka" });
    await saveUserProfile("user-1", makeProfile({ name: "Afif Zilani" }));

    const profile = await getUserProfile("user-1");
    expect(profile?.name).toBe("Afif Zilani");
    expect(await isOnboardingComplete("user-1")).toBe(true);
  });
});

describe("onboarding draft", () => {
  it("returns null before anything is saved", async () => {
    expect(await loadOnboardingDraft("user-1")).toBeNull();
  });

  it("saves and reloads a partial draft", async () => {
    await saveOnboardingDraft("user-1", {
      role: "farmer",
      name: "Afif",
      farmCapacity: 1200,
    });

    expect(await loadOnboardingDraft("user-1")).toMatchObject({
      role: "farmer",
      name: "Afif",
      farmCapacity: 1200,
    });
  });

  it("overwrites the previous draft on the next step", async () => {
    await saveOnboardingDraft("user-1", { name: "Afif" });
    await saveOnboardingDraft("user-1", { name: "Afif", breed: "Broiler" });

    const draft = await loadOnboardingDraft("user-1");
    expect(draft).toMatchObject({ name: "Afif", breed: "Broiler" });
  });

  it("defaults role to farmer when the draft has not chosen one", async () => {
    await saveOnboardingDraft("user-1", { name: "Afif" });
    expect((await loadOnboardingDraft("user-1"))?.role).toBe("farmer");
  });
});
