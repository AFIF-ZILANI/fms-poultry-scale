import {
  isOnboardingComplete,
  markOnboardingComplete,
  saveOnboardingDraft,
  loadOnboardingDraft,
  clearOnboardingDraft,
  getUserProfile,
  saveUserProfile,
  type OnboardingData,
} from "../lib/onboarding";
import AsyncStorage from "@react-native-async-storage/async-storage";

// The __mocks__/@react-native-async-storage/async-storage mock is picked up
// automatically by Jest for node_modules manual mocks.

const mockStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & {
  __resetStore: () => void;
};

beforeEach(() => {
  mockStorage.__resetStore();
  jest.clearAllMocks();
});

// ─── isOnboardingComplete / markOnboardingComplete ───────────────────────────

describe("isOnboardingComplete", () => {
  it("returns false for a user who has not completed onboarding", async () => {
    expect(await isOnboardingComplete("user-1")).toBe(false);
  });

  it("returns true after markOnboardingComplete is called", async () => {
    await markOnboardingComplete("user-1");
    expect(await isOnboardingComplete("user-1")).toBe(true);
  });

  it("isolates onboarding state by userId", async () => {
    await markOnboardingComplete("user-1");
    expect(await isOnboardingComplete("user-2")).toBe(false);
  });

  it("returns false when AsyncStorage.getItem returns null", async () => {
    mockStorage.getItem.mockResolvedValueOnce(null);
    expect(await isOnboardingComplete("user-1")).toBe(false);
  });

  it("returns false (not throws) when AsyncStorage.getItem rejects", async () => {
    mockStorage.getItem.mockRejectedValueOnce(new Error("storage failure"));
    expect(await isOnboardingComplete("user-1")).toBe(false);
  });
});

// ─── saveOnboardingDraft / loadOnboardingDraft / clearOnboardingDraft ────────

describe("Onboarding draft lifecycle", () => {
  it("returns null when no draft has been saved", async () => {
    expect(await loadOnboardingDraft("user-1")).toBeNull();
  });

  it("saves and retrieves a partial onboarding draft", async () => {
    await saveOnboardingDraft("user-1", { role: "farmer", name: "Karim" });
    const draft = await loadOnboardingDraft("user-1");
    expect(draft).toMatchObject({ role: "farmer", name: "Karim" });
  });

  it("isolates drafts by userId", async () => {
    await saveOnboardingDraft("user-1", { name: "Karim" });
    expect(await loadOnboardingDraft("user-2")).toBeNull();
  });

  it("overwrites the draft on repeated saves", async () => {
    await saveOnboardingDraft("user-1", { name: "Old" });
    await saveOnboardingDraft("user-1", { name: "New", role: "wholesaler" });
    const draft = await loadOnboardingDraft("user-1");
    expect(draft?.name).toBe("New");
    expect(draft?.role).toBe("wholesaler");
  });

  it("clearOnboardingDraft removes the draft", async () => {
    await saveOnboardingDraft("user-1", { name: "Karim" });
    await clearOnboardingDraft("user-1");
    expect(await loadOnboardingDraft("user-1")).toBeNull();
  });

  it("clearOnboardingDraft is a no-op when no draft exists", async () => {
    await expect(clearOnboardingDraft("user-1")).resolves.not.toThrow();
  });

  it("returns null (not throws) when loadOnboardingDraft encounters an error", async () => {
    mockStorage.getItem.mockRejectedValueOnce(new Error("quota exceeded"));
    expect(await loadOnboardingDraft("user-1")).toBeNull();
  });
});

// ─── getUserProfile / saveUserProfile ────────────────────────────────────────

describe("User profile", () => {
  const profile: OnboardingData = {
    role: "farmer",
    name: "Ahmed",
    phone: "+8801711000000",
    farmName: "Green Farm",
  };

  it("returns null when no profile has been saved", async () => {
    expect(await getUserProfile("user-1")).toBeNull();
  });

  it("saves and retrieves a full user profile", async () => {
    await saveUserProfile("user-1", profile);
    const loaded = await getUserProfile("user-1");
    expect(loaded).toEqual(profile);
  });

  it("isolates profiles by userId", async () => {
    await saveUserProfile("user-1", profile);
    expect(await getUserProfile("user-2")).toBeNull();
  });

  it("overwrites the profile on second save", async () => {
    await saveUserProfile("user-1", profile);
    const updated = { ...profile, name: "Karim", farmName: "Blue Farm" };
    await saveUserProfile("user-1", updated);
    const loaded = await getUserProfile("user-1");
    expect(loaded?.name).toBe("Karim");
    expect(loaded?.farmName).toBe("Blue Farm");
  });

  it("returns null (not throws) when getUserProfile encounters a parse error", async () => {
    mockStorage.getItem.mockResolvedValueOnce("{invalid json");
    expect(await getUserProfile("user-1")).toBeNull();
  });

  it("round-trips all optional profile fields correctly", async () => {
    const full: OnboardingData = {
      role: "wholesaler",
      name: "Rahim",
      phone: "+8801800000000",
      location: "Dhaka",
      businessName: "Rahim Traders",
      buyingCapacity: "1000",
      supplyRegions: "Dhaka, Chittagong",
    };
    await saveUserProfile("user-1", full);
    const loaded = await getUserProfile("user-1");
    expect(loaded).toEqual(full);
  });
});
