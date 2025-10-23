const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

// ===== CONFIG =====
const DB_PATH = path.join(__dirname, 'karate_ranking.db');
const EXCEL_FOLDER = path.join(__dirname, 'excel_files/U14'); // put all your Excel files here

// ===== OPEN DB =====
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error('DB Connection Error:', err.message);
  console.log('✅ Connected to SQLite database.');
});

// ===== HELPER: Extract info from filename =====
function parseFilename(filename) {
  // Example: "U14_KUMITE_FEMALE_-42KG.xlsx"
  const base = path.basename(filename, path.extname(filename));
  const parts = base.split('_');
  return {
    ageCategory: parts[0],      // U14
    discipline: parts[1],       // KUMITE
    gender: parts[2],           // FEMALE
    weightCategory: parts.slice(3).join('_') // -42KG
  };
}

// ===== HELPER: Find Tournament =====
function getTournamentId(ageCategory, gender, weightCategory, callback) {
  const sql = `SELECT id FROM tournaments WHERE name LIKE ?`;
  const search = `%${ageCategory}%${gender}%${weightCategory}%`;
  db.get(sql, [search], (err, row) => {
    if (err) return callback(err);
    callback(null, row ? row.id : null);
  });
}

// ===== HELPER: Find Athlete =====
function getAthleteId(fullName, callback) {
  const sql = `SELECT id FROM athletes WHERE full_name = ?`;
  db.get(sql, [fullName], (err, row) => {
    if (err) return callback(err);
    callback(null, row ? row.id : null);
  });
}

// ===== INSERT RESULT =====
function insertResult(result, callback) {
  const sql = `
    INSERT INTO results 
      (athlete_id, tournament_id, placement, wins, points_earned, approved)
    VALUES (?, ?, ?, ?, ?, 1)
  `;
  db.run(sql, [
    result.athlete_id,
    result.tournament_id,
    result.placement,
    result.wins,
    result.points
  ], callback);
}

// ===== PROCESS ALL EXCEL FILES =====
fs.readdir(EXCEL_FOLDER, (err, files) => {
  if (err) return console.error('Cannot read Excel folder:', err);

  files.forEach(file => {
    const info = parseFilename(file);
    console.log(`Processing file: ${file} -> ${JSON.stringify(info)}`);

    getTournamentId(info.ageCategory, info.gender, info.weightCategory, (err, tournamentId) => {
      if (err) return console.error(err);
      if (!tournamentId) return console.warn(`Tournament not found for: ${file}`);

      const workbook = xlsx.readFile(path.join(EXCEL_FOLDER, file));
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      rows.forEach(row => {
        const fullName = row['NAME']?.trim();
        const placement = row['Θέση'];
        const wins = row['Νίκες'];
        const points = row['POINTS'];

        if (!fullName || !placement) return;

        getAthleteId(fullName, (err, athleteId) => {
          if (err) return console.error(err);
          if (!athleteId) return console.warn(`Athlete not found: ${fullName}`);

          insertResult({
            athlete_id: athleteId,
            tournament_id: tournamentId,
            placement,
            wins,
            points
          }, (err) => {
            if (err) console.error('Insert error:', err);
            else console.log(`Inserted result: ${fullName} - Tournament ID: ${tournamentId}`);
          });
        });
      });
    });
  });
});
