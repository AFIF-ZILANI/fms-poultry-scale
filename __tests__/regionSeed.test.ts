import fs from "fs";
import path from "path";
import data from "../lib/regions/bd-regions.json";

function findSeedMigration(): string {
  const dir = path.join(__dirname, "../supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.includes("seed_regions"));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one seed_regions migration, found ${files.length}`);
  }
  return fs.readFileSync(path.join(dir, files[0]), "utf8");
}

describe("region seed migration", () => {
  it("has one INSERT per division, district, and upazila", () => {
    const sql = findSeedMigration();
    const divisionInserts = sql.match(/INSERT INTO divisions/g) ?? [];
    const districtInserts = sql.match(/INSERT INTO districts/g) ?? [];
    const upazilaInserts = sql.match(/INSERT INTO upazilas/g) ?? [];
    expect(divisionInserts.length).toBe(data.divisions.length);
    expect(districtInserts.length).toBe(data.districts.length);
    expect(upazilaInserts.length).toBe(data.upazilas.length);
  });

  it("includes a specific known district's insert with matching name", () => {
    const sql = findSeedMigration();
    const [firstDistrict] = data.districts;
    expect(sql).toContain(
      `('${firstDistrict.id}', '${firstDistrict.divisionId}', '${firstDistrict.nameEn}', '${firstDistrict.nameBn}')`,
    );
  });
});
