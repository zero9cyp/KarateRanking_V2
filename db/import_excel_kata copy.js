const xlsx = require("xlsx");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/karate_ranking.db");

// === SETTINGS ===
const filePath = "./db/U16_FEMALE_kata.xlsx";
const eventType = "KATA";
const gender = "female";
const ageCategory = "U16";
const seasonYear = 2025;

const workbook = xlsx.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

async function runImport() {
  console.log(`📥 Starting import for ${ageCategory} ${gender.toUpperCase()} ${eventType}...`);

  for (const row of rows) {
    const name = row["NAME"]?.trim();
    const clubName = row["CLUB"]?.trim();
    if (!name) continue;

    const birthDate = row["HMER_Genn"] || null;
    const closing = parseFloat(row["TOTAL POINTS 2024"]) || 0;
    const carry = parseFloat((row["ΑΛΛΑΓΕΣ"] + "").replace("%", "")) || 100;
    const starting = parseFloat(row["starting"]) || closing;

    // 1️⃣ Insert or get club
    const clubId = await getOrCreate(
      "SELECT id FROM clubs WHERE name=?",
      "INSERT INTO clubs (name) VALUES (?)",
      clubName
    );

    // 2️⃣ Insert or get athlete
    const athleteId = await getOrCreate(
      "SELECT id FROM athletes WHERE full_name=?",
      "INSERT INTO athletes (full_name, gender, birth_date, club_id, total_points) VALUES (?, ?, ?, ?, 0)",
      name,
      [name, gender, birthDate, clubId]
    );

    // 3️⃣ Yearly points (season summary)
    await runSQL(
      `INSERT OR REPLACE INTO yearly_points
       (athlete_id, year, closing_points, starting_points, closing_raw_points, carry_percent, updated_by, event_type)
       VALUES (?, ?, ?, ?, ?, ?, 'excel-import', ?)`,
      [athleteId, seasonYear, closing, starting, closing, carry, eventType]
    );

    // 4️⃣ Detect all tournaments automatically (Θέση N / Νίκες N / POINTS N)
    const tournamentSets = [];
    const headers = Object.keys(row);
    const regex = /^Θέση\s*(\d+)/i;

    for (const key of headers) {
      const match = key.match(regex);
      if (match) {
        const idx = match[1];
        const placement = parseInt(row[`Θέση ${idx}`]) || null;
        const wins = parseInt(row[`Νίκες ${idx}`]) || null;
        const points = parseFloat(row[`POINTS ${idx}`]) || null;
        const total = parseFloat(row[`TOTAL POINTS ${idx}`]) || null;

        if (placement || points) {
          tournamentSets.push({
            idx,
            placement,
            wins,
            points,
            total,
          });
        }
      }
    }

    // 5️⃣ Insert tournaments and results
    for (const t of tournamentSets) {
      const tournamentName = `${ageCategory} ${gender.toUpperCase()} KATA TOURNAMENT ${t.idx} (${seasonYear})`;

      const tournamentId = await getOrCreate(
        "SELECT id FROM tournaments WHERE name=?",
        "INSERT INTO tournaments (name, date, tournament_type, event_type, season_year) VALUES (?, date('now'), 'NATIONAL_CHAMPIONSHIP', ?, ?)",
        tournamentName,
        [tournamentName, eventType, seasonYear]
      );

      await runSQL(
        `INSERT OR IGNORE INTO results
         (athlete_id, tournament_id, placement, wins, points_earned, season_year, event_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [athleteId, tournamentId, t.placement, t.wins, t.points, seasonYear, eventType]
      );
    }

    console.log(`✅ Imported ${name} (${clubName})`);
  }

  console.log("\n🎯 Import completed successfully!");
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
  console.error("❌ Error during import:", err);
  db.close();
});
