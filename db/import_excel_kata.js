const xlsx = require("xlsx");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/karate_ranking.db");

// === SETTINGS ===
const filePath = "./U14_FEMALE_kata.xlsx";
const eventType = "KATA";
const gender = "female";
const ageCategory = "U14";
const tournamentName = "ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 KATA";
const seasonYear = 2025;

const workbook = xlsx.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

async function runImport() {
  for (const row of rows) {
    const name = row["NAME"]?.trim();
    const clubName = row["CLUB"]?.trim();
    const birthDate = row["ΗΜΕΡΟΜΗΝΙΑ ΓΕΝΝΗΣΗΣ"] || null;
    const closing = parseFloat(row["TOTAL POINTS 2024"]) || 0;
    const carry = parseFloat((row["ΑΛΛΑΓΕΣ ΒΑΘΜΟΛΟΓΙΑΣ"] + "").replace("%", "")) || 100;
    const starting = parseFloat(row["STARTING POINTS"]) || closing;
    const placement = parseInt(row["Θέση"]) || null;
    const wins = parseInt(row["Νίκες"]) || null;
    const pointsEarned = parseFloat(row["POINTS"]) || null;

    if (!name) continue;

    // 1️⃣ Club
    const clubId = await getOrCreate(
      "SELECT id FROM clubs WHERE name=?",
      "INSERT INTO clubs (name) VALUES (?)",
      clubName
    );

    // 2️⃣ Athlete
    const athleteId = await getOrCreate(
      "SELECT id FROM athletes WHERE full_name=?",
      "INSERT INTO athletes (full_name, gender, birth_date, club_id, total_points) VALUES (?, ?, ?, ?, 0)",
      name,
      [name, gender, birthDate, clubId]
    );

    // 3️⃣ Yearly points (closing season 2024)
    await runSQL(
      `INSERT OR REPLACE INTO yearly_points
       (athlete_id, year, closing_points, starting_points, closing_raw_points, carry_percent, updated_by, event_type)
       VALUES (?, ?, ?, ?, ?, ?, 'excel-import', ?)`,
      [athleteId, seasonYear, closing, starting, closing, carry, eventType]
    );

    // 4️⃣ Tournament
    const tournamentId = await getOrCreate(
      "SELECT id FROM tournaments WHERE name=?",
      "INSERT INTO tournaments (name, date) VALUES (?, date('now'))",
      tournamentName
    );

    // 5️⃣ Result
    if (pointsEarned && placement) {
      await runSQL(
        `INSERT OR IGNORE INTO results
         (athlete_id, tournament_id, placement, wins, points_earned, season_year, event_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [athleteId, tournamentId, placement, wins, pointsEarned, seasonYear, eventType]
      );
    }

    console.log(`✅ Imported ${name} (${clubName})`);
  }

  console.log("\n🎯 Import completed!");
  db.close();
}

// --- Helpers ---
function runSQL(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, err => (err ? reject(err) : resolve()));
  });
}

function getOrCreate(selectSQL, insertSQL, value, insertParams = [value]) {
  return new Promise((resolve, reject) => {
    db.get(selectSQL, [value], (err, row) => {
      if (err) reject(err);
      else if (row) resolve(row.id);
      else {
        db.run(insertSQL, insertParams, function (err2) {
          if (err2) reject(err2);
          else resolve(this.lastID);
        });
      }
    });
  });
}

runImport().catch(err => {
  console.error("❌ Error:", err);
  db.close();
});
