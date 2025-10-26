// db/importSingleResults.js
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

// ---------- CONFIG ----------
const DB_PATH = path.join(__dirname, 'karate_ranking.db'); // adjust your DB file
const EXCEL_FILE = path.join(__dirname, 'excel_files', 'U14', 'U14_KUMITE_MALE_-55KG.xlsx');


// ---------- CONNECT DB ----------
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('DB Connection Error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database.');
});

// ---------- HELPER FUNCTIONS ----------
function getTournamentId(callback) {
  // Tournament hardcoded for now (you can change)
  const tournamentName = 'ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016';
  db.get('SELECT id FROM tournaments WHERE name = ?', [tournamentName], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(new Error(`Tournament not found: ${tournamentName}`));
    callback(null, row.id);
  });
}

function getAgeCategoryId(ageCategory, callback) {
  db.get('SELECT id FROM age_categories WHERE name = ?', [ageCategory], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(new Error(`Age category not found: ${ageCategory}`));
    callback(null, row.id);
  });
}

function getWeightCategoryId(name, gender, ageCategoryId, callback) {
  db.get(
    'SELECT id FROM weight_categories WHERE name = ? AND gender = ? AND age_category_id = ?',
    [name, gender, ageCategoryId],
    (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error(`Weight category not found: ${name} (${gender})`));
      callback(null, row.id);
    }
  );
}

function getAthleteId(fullName, ageCategoryId, weightCategoryId, callback) {
  db.get(
    'SELECT id FROM athletes WHERE full_name = ? AND age_category_id = ? AND weight_category_id = ?',
    [fullName, ageCategoryId, weightCategoryId],
    (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(new Error(`Athlete not found: ${fullName}`));
      callback(null, row.id);
    }
  );
}

// ---------- PROCESS EXCEL ----------
if (!fs.existsSync(EXCEL_FILE)) {
  console.error('❌ Excel file not found:', EXCEL_FILE);
  process.exit(1);
}

const workbook = xlsx.readFile(EXCEL_FILE);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

console.log(`📊 Found ${data.length} rows in Excel.`);

// Parse filename for category info
const filename = path.basename(EXCEL_FILE, '.xlsx'); // U14_KUMITE_FEMALE_-42KG
const [ageCat, , genderRaw, weight] = filename.split('_');
const gender = genderRaw.toLowerCase(); // male / female

getTournamentId((err, tournamentId) => {
  if (err) return console.error(err.message);

  getAgeCategoryId(ageCat, (err, ageCategoryId) => {
    if (err) return console.error(err.message);

    getWeightCategoryId(weight, gender, ageCategoryId, (err, weightCategoryId) => {
      if (err) return console.error(err.message);

      console.log(`✅ Importing results for ${ageCat} - ${gender} - ${weight}`);

      // Insert results
      data.forEach((row) => {
        const { NAME, Θέση, Νίκες, POINTS } = row;

        getAthleteId(NAME, ageCategoryId, weightCategoryId, (err, athleteId) => {
          if (err) return console.error(err.message);

          const sql = `
            INSERT INTO results
            (athlete_id, tournament_id, age_category_id, weight_category_id, placement, wins, points_earned)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          db.run(sql, [
            athleteId,
            tournamentId,
            ageCategoryId,
            weightCategoryId,
            Θέση || 0,
            Νίκες || 0,
            POINTS || 0,
          ], function (err) {
            if (err) console.error(err.message);
          });
        });
      });

      console.log('✅ Done importing results.');
    });
  });
});
