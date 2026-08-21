import data from "../lib/regions/bd-regions.json";
import { listDistricts, listUpazilas, getDistrictName, getUpazilaName } from "../lib/regions";

describe("bd-regions data integrity", () => {
  it("has 8 divisions, 64 districts, and upazilas", () => {
    expect(data.divisions.length).toBe(8);
    expect(data.districts.length).toBe(64);
    expect(data.upazilas.length).toBeGreaterThan(400);
  });

  it("every district's divisionId resolves to a real division", () => {
    const divisionIds = new Set(data.divisions.map((d) => d.id));
    for (const district of data.districts) {
      expect(divisionIds.has(district.divisionId)).toBe(true);
    }
  });

  it("every upazila's districtId resolves to a real district", () => {
    const districtIds = new Set(data.districts.map((d) => d.id));
    for (const upazila of data.upazilas) {
      expect(districtIds.has(upazila.districtId)).toBe(true);
    }
  });
});

describe("lib/regions lookups", () => {
  it("listDistricts returns all districts", () => {
    expect(listDistricts().length).toBe(64);
  });

  it("listUpazilas filters by district", () => {
    const [firstDistrict] = listDistricts();
    const upazilas = listUpazilas(firstDistrict.id);
    expect(upazilas.length).toBeGreaterThan(0);
    for (const u of upazilas) expect(u.districtId).toBe(firstDistrict.id);
  });

  it("listUpazilas returns nothing for an unknown district", () => {
    expect(listUpazilas("not-a-real-id")).toEqual([]);
  });

  it("getDistrictName resolves English and Bangla names", () => {
    const [firstDistrict] = listDistricts();
    expect(getDistrictName(firstDistrict.id, "en")).toBe(firstDistrict.nameEn);
    expect(getDistrictName(firstDistrict.id, "bn")).toBe(firstDistrict.nameBn);
  });

  it("getDistrictName returns null for a missing or unknown id", () => {
    expect(getDistrictName(null, "en")).toBeNull();
    expect(getDistrictName("not-a-real-id", "en")).toBeNull();
  });

  it("getUpazilaName resolves English and Bangla names", () => {
    const [firstDistrict] = listDistricts();
    const [firstUpazila] = listUpazilas(firstDistrict.id);
    expect(getUpazilaName(firstUpazila.id, "en")).toBe(firstUpazila.nameEn);
    expect(getUpazilaName(firstUpazila.id, "bn")).toBe(firstUpazila.nameBn);
  });
});
