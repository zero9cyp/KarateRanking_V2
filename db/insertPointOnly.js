const path = require("path");
const xlsx = require("xlsx");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "karate_ranking.db");
const excelPath = path.join(__dirname, "athletes_cleaned (1).xlsx");
const db = new Database(dbPath);

const sheet = xlsx.readFile(excelPath).Sheets[xlsx.readFile(excelPath).SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

// ---------- helpers ----------
function normalize(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\sΑ-Ωα-ω]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fuzzyMatch(a, b) {
  // basic similarity check
  if (!a || !b) return false;
  a = normalize(a);
  b = normalize(b);
  if (a === b) return true;
  // allow partial match if name difference <= 2 chars
  const diff = Math.abs(a.length - b.length);
  return diff <= 2 && (a.includes(b) || b.includes(a));
}

// ---------- SQL prep ----------
const getAllAthletes = db.prepare("SELECT id, full_name FROM athletes").all();
const updateAthlete = db.prepare("UPDATE athletes SET total_points=? WHERE id=?");
const insertHistory = db.prepare(`
  INSERT INTO points_history (athlete_id, date, points, reason, source)
  VALUES (?, DATE('2024-12-31'), ?, 'Excel 2024 carry import', 'excel_2024')
`);

// ---------- main ----------
let updated = 0;
let fuzzyMatched = 0;
let missing = 0;

db.transaction(() => {
  for (const row of rows) {
    const name = row.full_name || row["Full Name"] || row["FULL NAME"];
    const points = Number(
      row.total_points_2024 || row.total_points_2024_1 || row["TOTAL POINTS 2024"] || 0
    );

    if (!name || isNaN(points)) continue;

    const normalizedExcelName = normalize(name);
    let found = getAllAthletes.find(
      (a) => normalize(a.full_name) === normalizedExcelName
    );

    if (!found) {
      // try fuzzy match
      found = getAllAthletes.find((a) => fuzzyMatch(a.full_name, name));
      if (found) fuzzyMatched++;
    }

    if (!found) {
      console.warn(`⚠️ Not found: ${name}`);
      missing++;
      continue;
    }

    updateAthlete.run(points, found.id);

    // avoid duplicate entries
    const already = db
      .prepare(
        "SELECT id FROM points_history WHERE athlete_id=? AND source='excel_2024'"
      )
      .get(found.id);
    if (!already) insertHistory.run(found.id, points);

    updated++;
  }
})();

console.log(`✅ Updated ${updated} athletes`);
console.log(`🤏 Fuzzy matches: ${fuzzyMatched}`);
console.log(`⚠️ Missing (no match): ${missing}`);

// ---------- recompute total_points = base + 2025 tournaments ----------
console.log("🔄 Recalculating totals...");
db.prepare(`
  UPDATE athletes
  SET total_points = (
    SELECT IFNULL(MAX(points), 0)
    FROM points_history
    WHERE points_history.athlete_id = athletes.id
      AND points_history.source = 'excel_2024'
  )
`).run();

db.prepare(`
  UPDATE athletes
  SET total_points = total_points + (
    SELECT IFNULL(SUM(points_earned - penalty_points), 0)
    FROM results
    WHERE results.athlete_id = athletes.id
      AND results.season_year = 2025
  )
`).run();

const top = db
  .prepare(
    "SELECT full_name, total_points FROM athletes ORDER BY total_points DESC LIMIT 20"
  )
  .all();

console.log("\n🏆 Top 20 athletes after merge:");
for (const t of top) {
  console.log(`${t.full_name.padEnd(35)} ${t.total_points}`);
}
