const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

// --------------------------------------------------
// CONFIG
// --------------------------------------------------
const DB_PATH = path.join(__dirname, 'karate_ranking.db');
const EXCEL_DIR = path.join(__dirname, 'excel_files', 'Seniors'); // 👈 change per folder

// Age category IDs (from your DB)
const AGE_CATEGORY_MAP = {
    U14: 6,
    U16: 7,
    U18: 8,
    U21: 9,
    SENIORS: 10
};

// Extract folder name and find matching ID
const currentFolder = path.basename(EXCEL_DIR).toUpperCase();
const AGE_CATEGORY_ID = AGE_CATEGORY_MAP[currentFolder] || null;

// Tournament info
const EURO_TOURNAMENT_ID = 11; // EUROPEAN FIGHTS
const NAT_TOURNAMENT_ID = 10; // NATIONALS FIGHTS

// --------------------------------------------------
// UTIL: Convert Excel date -> ISO (YYYY-MM-DD)
// --------------------------------------------------
function excelDateToISO(cellVal) {
    if (!cellVal) return null;
    if (typeof cellVal === 'number') {
        const jsDate = new Date((cellVal - 25569) * 86400 * 1000);
        return jsDate.toISOString().split('T')[0];
    }
    if (typeof cellVal === 'string') {
        const parts = cellVal.split(/[\/\-\.]/);
        if (parts.length === 3) {
            const [d, m, y] = parts;
            const iso = new Date(`${y}-${m}-${d}`);
            if (!isNaN(iso.getTime())) return iso.toISOString().split('T')[0];
        }
        const parsed = new Date(cellVal);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    }
    return null;
}

// --------------------------------------------------
// DB INIT
// --------------------------------------------------
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) throw err;
    console.log('✅ Connected to DB');
});

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function getOrCreateClub(name) {
    return new Promise((resolve, reject) => {
        if (!name) return resolve(null);
        const clean = name.toString().trim();
        db.get(`SELECT id FROM clubs WHERE name = ?`, [clean], (err, row) => {
            if (err) return reject(err);
            if (row) return resolve(row.id);
            db.run(`INSERT INTO clubs (name) VALUES (?)`, [clean], function (err2) {
                if (err2) return reject(err2);
                resolve(this.lastID);
            });
        });
    });
}

function getOrCreateAthlete(fullName, birthDate, gender, clubId) {
  return new Promise((resolve, reject) => {
    const cleanName = fullName.toString().trim();
    const safeBirth = birthDate || null;

    // 1️⃣ Try exact match first (name + birth)
    db.get(
      `SELECT id FROM athletes WHERE full_name = ? AND birth_date = ?`,
      [cleanName, safeBirth],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          console.log(`   🔹 Found exact match for ${cleanName} (${safeBirth})`);
          return resolve(row.id);
        }

        // 2️⃣ Fallback: same name only
        db.get(
          `SELECT id, birth_date FROM athletes WHERE full_name = ?`,
          [cleanName],
          (err2, row2) => {
            if (err2) return reject(err2);
            if (row2) {
              console.log(`   ⚠️ Found same name (different birth/club): ${cleanName}. Updating record.`);
              db.run(
                `UPDATE athletes
                 SET birth_date = COALESCE(?, birth_date),
                     gender = COALESCE(?, gender),
                     club_id = COALESCE(?, club_id)
                 WHERE id = ?`,
                [safeBirth, gender, clubId, row2.id],
                (err3) => {
                  if (err3) return reject(err3);
                  return resolve(row2.id);
                }
              );
              return;
            }

            // 3️⃣ Still not found → create new
            db.run(
              `INSERT INTO athletes (full_name, birth_date, gender, club_id, age_category_id)
               VALUES (?, ?, ?, ?, ?)`,
              [cleanName, safeBirth || '1970-01-01', gender, clubId, AGE_CATEGORY_ID],
              function (err4) {
                if (err4) return reject(err4);
                console.log(`   🆕 Created new athlete ${cleanName}`);
                resolve(this.lastID);
              }
            );
          }
        );
      }
    );
  });
}



function insertResult(athleteId, tournamentId, placement, wins, pointsEarned) {
    return new Promise((resolve, reject) => {
        if (!athleteId || !tournamentId) return resolve(null);
        db.run(
            `INSERT INTO results (athlete_id, tournament_id, placement, wins, points_earned, participated, approved)
       VALUES (?, ?, ?, ?, ?, 1, 1)
       ON CONFLICT(athlete_id, tournament_id)
       DO UPDATE SET
         placement = excluded.placement,
         wins = excluded.wins,
         points_earned = excluded.points_earned,
         participated = 1,
         approved = 1`,
            [
                athleteId,
                tournamentId,
                placement != null ? placement : 0,
                wins != null ? wins : 0,
                pointsEarned != null ? pointsEarned : 0
            ],
            function (err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
}

function updateAthleteTotalPoints(athleteId, totalPoints) {
    return new Promise((resolve, reject) => {
        if (!athleteId) return resolve(null);
        const points = isNaN(parseInt(totalPoints)) ? 0 : parseInt(totalPoints);

        db.run(
            `UPDATE athletes
       SET total_points = ?
       WHERE id = ?`,
            [points, athleteId],
            function (err) {
                if (err) return reject(err);
                resolve(true);
            }
        );
    });
}


// --------------------------------------------------
// PROCESS ONE FILE
// --------------------------------------------------
async function processFile(filePath) {
    console.log(`📥 Processing ${path.basename(filePath)}...`);

    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

    const gender = filePath.toLowerCase().includes('female') ? 'female' : 'male';

    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0 || (r[0] === null && r[1] === null)) continue;

        const fullNameRaw = r[0];
        const clubNameRaw = r[1];
        const birthRaw = r[2];
        const placementEuro = r[6];
        const winsEuro = r[7];
        const pointsEuro = r[8];
        const placementNat = r[10];
        const winsNat = r[11];
        const pointsNat = r[12];

        const fullName = fullNameRaw ? fullNameRaw.toString().trim() : null;
        const clubName = clubNameRaw ? clubNameRaw.toString().trim() : null;
        const birthDate = excelDateToISO(birthRaw) || '1970-01-01';

        if (!fullName || !clubName) {
            console.log(`❌ Skipping row ${i} (${fullName || 'NO NAME'})`);
            continue;
        }

        try {
            const clubId = await getOrCreateClub(clubName);
            const athleteId = await getOrCreateAthlete(fullName, birthDate, gender, clubId);
            const totalPoints = r[5]; // TOTAL POINTS Until Now
            if (totalPoints != null && totalPoints !== '') {
                await updateAthleteTotalPoints(athleteId, totalPoints);
                console.log(`Row ${i} preview:`, r.slice(0, 8));


                console.log(`   🟢 Updated total points for ${fullName}: ${totalPoints}`);
            }

            console.log(`   clubId=${clubId}, athleteId=${athleteId}`);

            const hasEuro = placementEuro || winsEuro || pointsEuro;
            if (hasEuro) {
                await insertResult(
                    athleteId,
                    EURO_TOURNAMENT_ID,
                    parseInt(placementEuro) || 0,
                    parseInt(winsEuro) || 0,
                    parseInt(pointsEuro) || 0
                );
                console.log(`   ✅ Added EUROPEAN FIGHTS result for ${fullName}`);
            }

            const hasNat = placementNat || winsNat || pointsNat;
            if (hasNat) {
                await insertResult(
                    athleteId,
                    NAT_TOURNAMENT_ID,
                    parseInt(placementNat) || 0,
                    parseInt(winsNat) || 0,
                    parseInt(pointsNat) || 0
                );
                console.log(`   ✅ Added NATIONALS FIGHTS result for ${fullName}`);
            }

            console.log(`✅ Imported ${fullName}\n`);
        } catch (err) {
            console.error(`⚠️ Error on row ${i} (${r[0]}):`, err.message);
        }
    }

    console.log(`✅ Finished processing ${path.basename(filePath)}\n`);
}

// --------------------------------------------------
// RUN ALL FILES IN FOLDER
// --------------------------------------------------
async function runAll() {
    const files = fs.readdirSync(EXCEL_DIR).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
    console.log(`📊 Found ${files.length} Excel files in ${EXCEL_DIR}`);

    for (const file of files) {
        await processFile(path.join(EXCEL_DIR, file));
    }

    console.log(`🎉 Import finished for ${currentFolder}`);
    db.close();
}

runAll();
