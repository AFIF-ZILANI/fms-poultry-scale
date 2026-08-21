import data from "./bd-regions.json";

export interface Division {
  id: string;
  nameEn: string;
  nameBn: string;
}

export interface District {
  id: string;
  divisionId: string;
  nameEn: string;
  nameBn: string;
}

export interface Upazila {
  id: string;
  districtId: string;
  nameEn: string;
  nameBn: string;
}

export function listDistricts(): District[] {
  return data.districts;
}

export function listUpazilas(districtId: string): Upazila[] {
  return data.upazilas.filter((u) => u.districtId === districtId);
}

export function getDistrictName(
  id: string | null | undefined,
  language: "en" | "bn",
): string | null {
  if (!id) return null;
  const district = data.districts.find((d) => d.id === id);
  if (!district) return null;
  return language === "bn" ? district.nameBn : district.nameEn;
}

export function getUpazilaName(
  id: string | null | undefined,
  language: "en" | "bn",
): string | null {
  if (!id) return null;
  const upazila = data.upazilas.find((u) => u.id === id);
  if (!upazila) return null;
  return language === "bn" ? upazila.nameBn : upazila.nameEn;
}
