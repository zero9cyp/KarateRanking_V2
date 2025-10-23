// db/importResults.js
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const DB_FILE = path.join(__dirname, 'karate_ranking.db');
const EXCEL_FOLDER = path.join(__dirname, 'excel_files/U14');

// Συνδεση στη βάση
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('DB Connection Error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite database.');
});

// Ανάγνωση όλων των Excel αρχείων
fs.readdir(EXCEL_FOLDER, (err, files) => {
  if (err) return console.error('Cannot read Excel folder:', err);

  files.filter(f => f.endsWith('.xlsx')).forEach(file => {
    const filePath = path.join(EXCEL_FOLDER, file);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`📊 Found ${rows.length} rows in Excel: ${file}`);

    // Παίρνουμε info από όνομα αρχείου
    const [age, gender, weight] = file.replace('.xlsx','').split('_').slice(1); 

    // Προσθήκη/ενημέρωση αποτελεσμάτων
    rows.forEach(async row => {
      const full_name = row['NAME']?.trim();
      const club_name = row['CLUB']?.trim();
      const birth_date = row['ΗΜΕΡΟΜΗΝΙΑ ΓΕΝΝΗΣΗΣ']; // format: yyyy-mm-dd
      const placement = row['Θέση'] || null;
      const wins = row['Νίκες'] || 0;
      const points_earned = row['POINTS'] || 0;
      const total_points = row['TOTAL POINTS 2024'] || 0;

      if (!full_name || !birth_date) return; // αγνοούμε χωρίς ημερομηνία

      // Πρώτα παίρνουμε athlete id
      db.get(`SELECT id FROM athletes WHERE full_name = ?`, [full_name], (err, athlete) => {
        if (err) return console.error(err);

        const insertOrUpdateResult = (athlete_id) => {
          // Βρίσκουμε tournament id (χρησιμοποιώντας age/weight/gender αν θέλουμε ή παίζουμε με ένα σταθερό)
          db.get(`SELECT id FROM tournaments WHERE name LIKE ?`, [`%U14%`], (err, tour) => {
            if (err || !tour) return console.log('Tournament not found for:', file);

            const tournament_id = tour.id;

            // Εισαγωγή ή ενημέρωση αποτελέσματος
            db.get(`SELECT id FROM results WHERE athlete_id = ? AND tournament_id = ?`, 
              [athlete_id, tournament_id], (err, resRow) => {
              if (err) return console.error(err);

              if (resRow) {
                // Ενημέρωση
                db.run(`UPDATE results SET placement=?, wins=?, points_earned=? WHERE id=?`, 
                  [placement, wins, points_earned, resRow.id], err => {
                    if (err) console.error(err);
                  });
              } else {
                // Νέο αποτέλεσμα
                db.run(`INSERT INTO results (athlete_id, tournament_id, age_category_id, weight_category_id, placement, wins, points_earned) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [athlete_id, tournament_id, null, null, placement, wins, points_earned], err => {
                    if (err) console.error(err);
                  });
              }
            });
          });
        };

        if (athlete) {
          insertOrUpdateResult(athlete.id);
        } else {
          // Δεν υπάρχει ο αθλητής → προσθήκη
          db.run(`INSERT INTO athletes (full_name, birth_date, total_points) VALUES (?, ?, ?)`,
            [full_name, birth_date, total_points], function(err) {
              if (err) return console.error(err);
              console.log(`➕ Added athlete: ${full_name}`);
              insertOrUpdateResult(this.lastID);
            });
        }
      });
    });
  });
});
