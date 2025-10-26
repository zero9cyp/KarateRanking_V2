const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

const DB_PATH = path.join(__dirname, 'karate_ranking.db');
const EXCEL_DIR = path.join(__dirname, 'excel_files', 'U16');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) throw err;
  console.log('✅ Connected to DB');
});

// ✅ Utility: convert Excel serial dates (like 40371) → YYYY-MM-DD
function excelDateToJSDate(excelDate) {
  if (!excelDate) return null;
  if (typeof excelDate === 'number') {
    const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
    return jsDate.toISOString().split('T')[0];
  }
  if (typeof excelDate === 'string') {
    const d = new Date(excelDate);
    if (!isNaN(d)) return d.toISOString().split('T')[0];
  }
  return null;
}

// --- DB helpers ---
function getOrCreateClub(db, name) {
  return new Promise((resolve, reject) => {
    if (!name) return resolve(null);
    db.get(`SELECT id FROM clubs WHERE name = ?`, [name.trim()], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row.id);
      db.run(`INSERT INTO clubs (name) VALUES (?)`, [name.trim()], function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  });
}

function getOrCreateAthlete(db, fullName, birthDate, clubId, gender) {
  return new Promise((resolve, reject) => {
    if (!fullName || !birthDate) return resolve(null);
    db.get(
      `SELECT id FROM athletes WHERE full_name = ? AND birth_date = ?`,
      [fullName.trim(), birthDate],
      (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(row.id);
        db.run(
          `INSERT INTO athletes (full_name, birth_date, gender, club_id)
           VALUES (?, ?, ?, ?)`,
          [fullName.trim(), birthDate, gender || 'male', clubId],
          function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      }
    );
  });
}

function getOrCreateTournament(db, name, date) {
  return new Promise((resolve, reject) => {
    if (!name || !date) return resolve(null);
    db.get(
      `SELECT id FROM tournaments WHERE name = ? AND date = ?`,
      [name.trim(), date],
      (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(row.id);
        db.run(
          `INSERT INTO tournaments (name, date) VALUES (?, ?)`,
          [name.trim(), date],
          function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      }
    );
  });
}

function insertResult(db, athleteId, tournamentId, placement, wins, pointsEarned) {
  return new Promise((resolve, reject) => {
    if (!athleteId || !tournamentId) return resolve(null);
    db.run(
      `INSERT INTO results (athlete_id, tournament_id, placement, wins, points_earned)
       VALUES (?, ?, ?, ?, ?)`,
      [athleteId, tournamentId, placement || 0, wins || 0, pointsEarned || 0],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

// --- MAIN FUNCTION ---
async function processFile(filePath) {
  console.log(`📥 Processing ${path.basename(filePath)}...`);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null }); // use Excel headers
  console.log(`Found ${rows.length} rows`);

  // Determine tournament name from file name (e.g. U16_KUMITE_MALE_-70KG)
  const fileName = path.basename(filePath, '.xlsx');
  const tournamentName = 'NATIONALS FIGHTS'; // or set dynamically if needed
  const tournamentDate = '2025-03-15';
  const tournamentId = await getOrCreateTournament(db, tournamentName, tournamentDate);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fullName = row['Name'] || row['ΟΝΟΜΑ'] || row['ΑΘΛΗΤΗΣ'] || row[Object.keys(row)[0]];
    const clubName = row['CLUB'] || row['ΣΥΛΛΟΓΟΣ'] || row[Object.keys(row)[1]];
    const birthDate = excelDateToJSDate(row['ΗΜΕΡΟΜΗΝΙΑ ΓΕΝΝΗΣΗΣ'] || row['BIRTHDATE'] || row[Object.keys(row)[2]]);
    const placement = row['Θέση European'] || row['Placement'] || row['ΘΕΣΗ'] || 0;
    const wins = row['Νίκες National'] || row['Wins'] || row['ΝΙΚΕΣ'] || 0;
    const pointsEarned = row['POINTS National'] || row['Points'] || row['ΒΑΘΜΟΙ'] || 0;

    console.log(`Row ${i + 1}:`, { fullName, clubName, birthDate, placement, wins, pointsEarned });

    if (!fullName || !clubName) {
      console.log(`❌ Skipping ${fullName || 'undefined'}, missing info`);
      continue;
    }

    try {
      const clubId = await getOrCreateClub(db, clubName);
      const athleteId = await getOrCreateAthlete(db, fullName, birthDate || '1970-01-01', clubId, 'female'); // or 'male'
      await insertResult(db, athleteId, tournamentId, placement, wins, pointsEarned);
      console.log(`✅ Imported ${fullName}`);
    } catch (err) {
      console.error(`⚠️ Error importing ${fullName}:`, err.message);
    }
  }

  console.log(`✅ Finished processing ${path.basename(filePath)}`);
}

async function main() {
  const files = fs.readdirSync(EXCEL_DIR).filter(f => f.endsWith('.xlsx'));
  for (const file of files) {
    await processFile(path.join(EXCEL_DIR, file));
  }
  console.log('🎉 U16 import finished.');
  db.close();
}

main();
