const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

const DB_PATH = path.join(__dirname, 'karate_ranking.db');
const EXCEL_DIR = path.join(__dirname, 'excel_files', 'U21');

const EURO_TOURNAMENT_NAME = 'EUROPEAN FIGHTS';
const EURO_TOURNAMENT_DATE = '2025-02-15';

const NAT_TOURNAMENT_NAME = 'NATIONALS FIGHTS';
const NAT_TOURNAMENT_DATE = '2025-03-15';

// --------------------------------------------------
// util: excel serial date -> YYYY-MM-DD
// --------------------------------------------------
function excelDateToISO(cellVal) {
  if (!cellVal) return null;
  if (typeof cellVal === 'number') {
    // Excel serial number
    const jsDate = new Date((cellVal - 25569) * 86400 * 1000);
    return jsDate.toISOString().split('T')[0];
  }
  if (typeof cellVal === 'string') {
    // try DD/MM/YYYY or D/M/YYYY etc
    const parts = cellVal.split(/[\/\-\.]/); // split by / - .
    if (parts.length === 3) {
      // guess: DD/MM/YYYY
      const [d, m, y] = parts;
      if (y && m && d) {
        const iso = new Date(`${y}-${m}-${d}`);
        if (!isNaN(iso.getTime())) {
          return iso.toISOString().split('T')[0];
        }
      }
    }
    // fallback: native Date parse
    const parsed = new Date(cellVal);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  return null;
}

// --------------------------------------------------
// DB init
// --------------------------------------------------
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) throw err;
  console.log('✅ Connected to DB');
});

// helper: upsert club
function getOrCreateClub(name) {
  return new Promise((resolve, reject) => {
    if (!name) return resolve(null);

    const clean = name.toString().trim();

    db.get(`SELECT id FROM clubs WHERE name = ?`, [clean], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row.id);

      db.run(`INSERT INTO clubs (name) VALUES (?)`, [clean], function (err2) {
        if (err2) return reject(err2);
        return resolve(this.lastID);
      });
    });
  });
}

// helper: upsert athlete
function getOrCreateAthlete(fullName, birthDate, gender, clubId) {
  return new Promise((resolve, reject) => {
    const cleanName = fullName.toString().trim();
    const safeBirth = birthDate || '1970-01-01';

    db.get(
      `SELECT id FROM athletes WHERE full_name = ? AND birth_date = ?`,
      [cleanName, safeBirth],
      (err, row) => {
        if (err) return reject(err);
        if (row) return resolve(row.id);

        db.run(
          `INSERT INTO athletes (full_name, birth_date, gender, club_id)
           VALUES (?, ?, ?, ?)`,
          [cleanName, safeBirth, gender, clubId],
          function (err2) {
            if (err2) return reject(err2);
            resolve(this.lastID);
          }
        );
      }
    );
  });
}

// helper: upsert tournament
function getOrCreateTournament(name, dateISO) {
  return new Promise((resolve, reject) => {
    const cleanName = name.trim();

    db.get(
      "SELECT id FROM tournaments WHERE name = ? AND date = ?",
      [cleanName, dateISO],
      (err, row) => {
        if (err) return reject(err);

        if (!row) {
          return reject(
            new Error(
              `Tournament not found in DB: "${cleanName}" on ${dateISO}. 
              Check Excel data — tournament name is likely wrong.`
            )
          );
        }

        resolve(row.id);
      }
    );
  });
}


// insert result row
function insertResult(athleteId, tournamentId, placement, wins, pointsEarned) {
 return new Promise((resolve, reject) => {
    if (!athleteId || !tournamentId) return resolve(null);

    db.run(
      `INSERT INTO results (athlete_id, tournament_id, placement, wins, points_earned)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(athlete_id, tournament_id)
       DO UPDATE SET
         placement = excluded.placement,
         wins = excluded.wins,
         points_earned = excluded.points_earned`,
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



// --------------------------------------------------
// process ONE file
// --------------------------------------------------
async function processFile(filePath) {
  console.log(`📥 Processing ${path.basename(filePath)}...`);

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // header:1 -> raw rows [ [A,B,C,...], [A,B,C,...], ...]
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // tournaments (create/get once per file so we reuse IDs)
  const euroTournamentId = 11
  const natTournamentId  = 10

  // detect gender from filename
  const gender = filePath.toLowerCase().includes('female') ? 'female' : 'male';

  // rows[0] = headers row (we skip it)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];

    // guard empty / short lines
    if (!r || r.length === 0 || (r[0] === null && r[1] === null)) {
      continue;
    }

    // columns mapping:
    // 0: Name
    // 1: Club
    // 2: Birthdate
    // 3: TOTAL POINTS 2024            (ignore)
    // 4: ΑΛΛΑΓΕΣ ΒΑΘΜΟΛΟΓΙΑΣ         (ignore)
    // 5: TOTAL POINTS Until Now       (ignore)
    // 6: Θέση European                -> placementEuro
    // 7: Νίκες European               -> winsEuro
    // 8: POINTS From European         -> pointsEuro
    // 9: TOTAL POINTS With European   (ignore)
    //10: Θέση National                -> placementNat
    //11: Νίκες National               -> winsNat
    //12: POINTS National              -> pointsNat
    //13: TOTAL ALL POINTS             (ignore)

    const fullNameRaw = r[0];
    const clubNameRaw = r[1];
    const birthRaw    = r[2];

    const placementEuro = r[6];
    const winsEuro      = r[7];
    const pointsEuro    = r[8];

    const placementNat  = r[10];
    const winsNat       = r[11];
    const pointsNat     = r[12];

    // clean values
    const fullName = fullNameRaw ? fullNameRaw.toString().trim() : null;
    const clubName = clubNameRaw ? clubNameRaw.toString().trim() : null;

    // birthDate handling (excel serials or dd/mm/yyyy etc.)
    const birthDate = excelDateToISO(birthRaw) || '1970-01-01';

    console.log(`Row ${i}:`, {
      fullName,
      clubName,
      birthDate,
      placementEuro,
      winsEuro,
      pointsEuro,
      placementNat,
      winsNat,
      pointsNat,
      gender
    });

    // must have at least name + club
    if (!fullName || !clubName) {
      console.log(`❌ Skipping row ${i} (${fullName || 'NO NAME'}), missing basic info`);
      continue;
    }

    try {
      // 1. club
      const clubId = await getOrCreateClub(clubName);

      // 2. athlete
      const athleteId = await getOrCreateAthlete(fullName, birthDate, gender, clubId);

      console.log(`   clubId=${clubId}, athleteId=${athleteId}`);

      // 3. EUROPEAN FIGHTS result (only if there is something meaningful)
      const hasEuro =
        placementEuro != null ||
        winsEuro != null ||
        pointsEuro != null;

      if (hasEuro) {
        await insertResult(
          athleteId,
          euroTournamentId,
          isNaN(parseInt(placementEuro)) ? 0 : parseInt(placementEuro),
          isNaN(parseInt(winsEuro))      ? 0 : parseInt(winsEuro),
          isNaN(parseInt(pointsEuro))    ? 0 : parseInt(pointsEuro)
        );
        console.log(`   ✅ Added EUROPEAN FIGHTS result for ${fullName}`);
      }

      // 4. NATIONALS FIGHTS result
      const hasNat =
        placementNat != null ||
        winsNat != null ||
        pointsNat != null;

      if (hasNat) {
        await insertResult(
          athleteId,
          natTournamentId,
          isNaN(parseInt(placementNat)) ? 0 : parseInt(placementNat),
          isNaN(parseInt(winsNat))      ? 0 : parseInt(winsNat),
          isNaN(parseInt(pointsNat))    ? 0 : parseInt(pointsNat)
        );
        console.log(`   ✅ Added NATIONALS FIGHTS result for ${fullName}`);
      }

      console.log(`✅ Imported ${fullName}\n`);
    } catch (err) {
      console.error(`⚠️ Error on row ${i} (${fullName}):`, err.message);
    }
  }

  console.log(`✅ Finished processing ${path.basename(filePath)}\n`);
}

// --------------------------------------------------
// run all .xlsx in folder
// --------------------------------------------------
async function runAll() {
  const files = fs.readdirSync(EXCEL_DIR)
    .filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));

  console.log(`📊 Found ${files.length} Excel files.`);

  for (const file of files) {
    await processFile(path.join(EXCEL_DIR, file));
  }

  console.log('🎉 U16 import finished.');
  db.close();
}

runAll();
