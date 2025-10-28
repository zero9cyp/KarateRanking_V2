// importAthletesCleaned_v2.js
// Full Excel → DB import including points_history initialization

const Database = require("better-sqlite3");
const xlsx = require("xlsx");
const path = require("path");

const db = new Database(path.join(__dirname, "karate_ranking.db"));
const EXCEL_PATH = path.join(__dirname, "athletes_cleaned (1).xlsx");

// --- Prepare SQL statements ---
const q = {
  club: db.prepare("SELECT id FROM clubs WHERE LOWER(name)=LOWER(?)"),
  insertClub: db.prepare("INSERT INTO clubs (name) VALUES (?)"),
  age: db.prepare("SELECT id FROM age_categories WHERE name=?"),
  weight: db.prepare("SELECT id FROM weight_categories WHERE UPPER(name)=? AND gender=? AND age_category_id=?"),
  athlete: db.prepare("SELECT id FROM athletes WHERE LOWER(full_name)=LOWER(?) AND birth_date=?"),
  insertAthlete: db.prepare(`
    INSERT INTO athletes (full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id)
    VALUES (@full_name, @birth_date, @gender, @age_category_id, @weight_category_id, @total_points, @club_id)`),
  updateAthlete: db.prepare(`
    UPDATE athletes SET gender=@gender, age_category_id=@age_category_id,
        weight_category_id=@weight_category_id, total_points=@total_points,
        club_id=@club_id WHERE id=@id`),
  insertHistory: db.prepare(`
    INSERT INTO points_history (athlete_id, date, points, reason, source)
    VALUES (@athlete_id, @date, @points, @reason, @source)
  `),
};

// --- Utility helpers ---
function normalize(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\w\sΑ-Ωα-ω]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normGender(g) {
  if (!g) return null;
  g = g.toLowerCase().trim();
  if (g.startsWith("m")) return "male";
  if (g.startsWith("f")) return "female";
  return null;
}

function normDate(d) {
  if (!d) return "1971-01-01";
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }
  const p = String(d).split(/[\/\-\.]/);
  return p.length === 3
    ? p[0].length === 4
      ? `${p[0]}-${p[1].padStart(2, "0")}-${p[2].padStart(2, "0")}`
      : `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`
    : "1971-01-01";
}

function safeText(v) {
  return v == null ? null : String(v).trim();
}

// --- Load Excel ---
const workbook = xlsx.readFile(EXCEL_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

console.log(`\n📘 Loaded ${rows.length} athletes from ${EXCEL_PATH}`);
console.log("\n=== IMPORT START ===\n");

let inserted = 0,
  updated = 0,
  kata = 0,
  kumite = 0,
  histInserts = 0;

// --- Transaction ---
const importTx = db.transaction((r) => {
  const fullName = safeText(r.full_name);
  if (!fullName) return;

  const type = safeText(r.type)?.toUpperCase() || null;
  const ageName = safeText(r.age_category);
  const birth = normDate(r.birth_date);
  const gender = normGender(r.gender);
  const weightName = safeText(r.weight_category);
  const clubName = safeText(r.club);
  const totalPoints2024 = Number(r.total_points_2024 || 0);
  const startPoints2025 = Number(r.starting_points_2025 || 0);

  const ageRow = ageName ? q.age.get(ageName) : null;
  const ageId = ageRow ? ageRow.id : null;

  // --- Club handling ---
  let clubId = null;
  if (clubName) {
    const clubRow = q.club.get(clubName);
    clubId = clubRow ? clubRow.id : q.insertClub.run(clubName).lastInsertRowid;
  }

  // --- Weight category ---
  let weightId = null;
  if (type === "KATA") kata++;
  else if (type === "KUMITE" && weightName && gender && ageId) {
    kumite++;
    const w = q.weight.get(weightName.toUpperCase(), gender, ageId);
    if (w) weightId = w.id;
  }

  // --- Athlete insert/update ---
  const athleteRow = q.athlete.get(fullName, birth);
  let athleteId = null;
  if (athleteRow) {
    q.updateAthlete.run({
      id: athleteRow.id,
      gender,
      age_category_id: ageId,
      weight_category_id: weightId,
      total_points: startPoints2025,
      club_id: clubId,
    });
    athleteId = athleteRow.id;
    updated++;
  } else {
    const ins = q.insertAthlete.run({
      full_name: fullName,
      birth_date: birth,
      gender,
      age_category_id: ageId,
      weight_category_id: weightId,
      total_points: startPoints2025,
      club_id: clubId,
    });
    athleteId = ins.lastInsertRowid;
    inserted++;
  }

  // --- History entries ---
  const now = new Date().toISOString().slice(0, 10);

  if (totalPoints2024 > 0) {
    q.insertHistory.run({
      athlete_id: athleteId,
      date: "2024-12-31",
      points: totalPoints2024,
      reason: "End of 2024 official ranking",
      source: "import",
    });
    histInserts++;
  }

  q.insertHistory.run({
    athlete_id: athleteId,
    date: "2025-01-01",
    points: startPoints2025,
    reason: "Starting 2025 balance",
    source: "import",
  });
  histInserts++;
});

// --- Main loop ---
for (const [i, row] of rows.entries()) {
  try {
    importTx(row);
  } catch (err) {
    console.error(`❌ Row ${i + 1} (${row.full_name || "?"}):`, err.message);
  }
}

console.log("\n=== IMPORT COMPLETE ===");
console.log(`👤 Inserted: ${inserted} | Updated: ${updated}`);
console.log(`🥋 KATA: ${kata} | KUMITE: ${kumite}`);
console.log(`🧾 Points history entries: ${histInserts}`);
console.log("✅ Done.\n");
