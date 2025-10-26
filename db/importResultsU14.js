// db/importResults.js
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

// ---------- CONFIG ----------
// Adjust DB path and folder with Excel files
const DB_PATH = path.join(__dirname, 'karate_ranking.db');
const EXCEL_FOLDER = path.join(__dirname, 'excel_files', 'U14');

// Specify the tournament to insert results into
const TOURNAMENT_NAME = 'ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016';

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
  db.get('SELECT id FROM tournaments WHERE name = ?', [TOURNAMENT_NAME], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(new Error(`Tournament not found: ${TOURNAMENT_NAME}`));
    callback(null, row.id);
  });
}

function getAgeCategoryId(name, callback) {
  db.get('SELECT id FROM age_categories WHERE name = ?', [name], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(new Error(`Age category not found: ${name}`));
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

// Get or create athlete
function getOrCreateAthlete(fullName, ageCategoryId, weightCategoryId, club, birthday, callback) {
  if (!birthday) {
    return callback(new Error(`Athlete ${fullName} missing birthday - cannot import.`));
  }

  db.get(
    'SELECT id FROM athletes WHERE full_name = ? AND age_category_id = ? AND weight_category_id = ?',
    [fullName, ageCategoryId, weightCategoryId],
    (err, row) => {
      if (err) return callback(err);
      if (row) return callback(null, row.id);

      // Insert new athlete
      const sql = `
        INSERT INTO athletes (full_name, age_category_id, weight_category_id, club, birthday)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.run(sql, [fullName, ageCategoryId, weightCategoryId, club, birthday], function (err) {
        if (err) return callback(err);
        callback(null, this.lastID);
      });
    }
  );
}

// ---------- PROCESS ALL FILES ----------
fs.readdir(EXCEL_FOLDER, (err, files) => {
  if (err) return console.error('Cannot read folder:', err);

  const excelFiles = files.filter(f => f.endsWith('.xlsx'));
  if (!excelFiles.length) return console.log('No Excel files found.');

  getTournamentId((err, tournamentId) => {
    if (err) return console.error(err.message);

    excelFiles.forEach(file => {
      const filePath = path.join(EXCEL_FOLDER, file);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet);

      console.log(`📊 Processing file: ${file} (${data.length} rows)`);

      // Parse filename for category info: U14_KUMITE_MALE_-55KG.xlsx
      const filename = path.basename(file, '.xlsx');
      const [ageCat, , genderRaw, weight] = filename.split('_');
      const gender = genderRaw.toLowerCase();

      getAgeCategoryId(ageCat, (err, ageCategoryId) => {
        if (err) return console.error(err.message);

        getWeightCategoryId(weight, gender, ageCategoryId, (err, weightCategoryId) => {
          if (err) return console.error(err.message);

          data.forEach(row => {
            const { NAME, CLUB, BIRTHDAY, Θέση, Νίκες, POINTS } = row;

            getOrCreateAthlete(NAME, ageCategoryId, weightCategoryId, CLUB, BIRTHDAY, (err, athleteId) => {
              if (err) {
                console.warn(err.message); // skip row if no birthday or other error
                return;
              }

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
                POINTS || 0
              ], function(err) {
                if (err) console.error(err.message);
              });
            });
          });

          console.log(`✅ Done importing ${file}`);
        });
      });
    });
  });
});
