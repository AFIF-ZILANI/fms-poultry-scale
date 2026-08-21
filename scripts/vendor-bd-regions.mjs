// One-off / re-runnable vendoring script: fetches Bangladesh's division →
// district → upazila hierarchy from nuhil/bangladesh-geocode and writes a
// normalized snapshot to lib/regions/bd-regions.json. Re-run this if the
// upstream source is ever updated; do not hand-edit the output file.
const BASE = "https://raw.githubusercontent.com/nuhil/bangladesh-geocode/master";

async function fetchRows(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const json = await res.json();
  const table = json.find((el) => el.type === "table");
  if (!table) throw new Error(`No table data found in ${path}`);
  return table.data;
}

async function main() {
  const [divisionRows, districtRows, upazilaRows] = await Promise.all([
    fetchRows("divisions/divisions.json"),
    fetchRows("districts/districts.json"),
    fetchRows("upazilas/upazilas.json"),
  ]);

  const divisions = divisionRows.map((r) => ({
    id: r.id,
    nameEn: r.name,
    nameBn: r.bn_name,
  }));
  const districts = districtRows.map((r) => ({
    id: r.id,
    divisionId: r.division_id,
    nameEn: r.name,
    nameBn: r.bn_name,
  }));
  const upazilas = upazilaRows.map((r) => ({
    id: r.id,
    districtId: r.district_id,
    nameEn: r.name,
    nameBn: r.bn_name,
  }));

  const out = { divisions, districts, upazilas };
  const fs = await import("fs");
  fs.writeFileSync(
    new URL("../lib/regions/bd-regions.json", import.meta.url),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(
    `Wrote ${divisions.length} divisions, ${districts.length} districts, ${upazilas.length} upazilas`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
