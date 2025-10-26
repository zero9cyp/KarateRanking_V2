const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

const DB_PATH = path.join(__dirname, 'karate_ranking.db');
const EXCEL_DIR = path.join(__dirname, 'excel_files', 'U16');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) throw err;
    console.log('✅ Connected to DB');
});

async function insertClub(clubName) {
    return new Promise((resolve, reject) => {
        if (!clubName) return resolve(null);
        db.run(
            'INSERT OR IGNORE INTO clubs (name) VALUES (?)',
            [clubName],
            function (err) {
                if (err) return reject(err);
                db.get('SELECT id FROM clubs WHERE name = ?', [clubName], (err, row) => {
                    if (err) return reject(err);
                    resolve(row ? row.id : null);
                });
            }
        );
    });
}

async function insertAthlete(fullName, birthDate, gender, clubId) {
    return new Promise((resolve, reject) => {
        if (!fullName || !birthDate) return resolve(null);
        db.run(
            `INSERT OR IGNORE INTO athletes (full_name, birth_date, gender, club_id) 
             VALUES (?, ?, ?, ?)`,
            [fullName, birthDate, gender, clubId],
            function (err) {
                if (err) return reject(err);
                db.get('SELECT id FROM athletes WHERE full_name = ? AND birth_date = ?', 
                       [fullName, birthDate], 
                       (err, row) => {
                           if (err) return reject(err);
                           resolve(row ? row.id : null);
                       });
            }
        );
    });
}

async function insertResult(athleteId, tournamentId, placement = null, wins = 0, pointsEarned = 0) {
    return new Promise((resolve, reject) => {
        if (!athleteId) return resolve(null);
        db.run(
            `INSERT INTO results (athlete_id, tournament_id, placement, wins, points_earned)
             VALUES (?, ?, ?, ?, ?)`,
            [athleteId, tournamentId, placement, wins, pointsEarned],
            function (err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
}

async function processFile(filePath, tournamentId, gender) {
    console.log(`📥 Processing ${path.basename(filePath)}...`);
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // header:1 returns array of arrays

    for (let i = 1; i < rows.length; i++) { // skip first row (header)
        const row = rows[i];
        const fullName = row[0]?.toString().trim();
        const clubName = row[1]?.toString().trim();
        const birthDateRaw = row[2];
        let birthDate = null;

        if (birthDateRaw) {
            const parsed = new Date(birthDateRaw);
            birthDate = isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        }

        const placement = row[3] != null ? parseInt(row[3], 10) : null;
        const wins = row[4] != null ? parseInt(row[4], 10) : 0;
        const pointsEarned = row[5] != null ? parseInt(row[5], 10) : 0;

        console.log(`Row ${i}:`);
        console.log({ fullName, clubName, birthDate, placement, wins, pointsEarned, gender });

        if (!fullName || !clubName || !birthDate) {
            console.log(`❌ Skipping ${fullName || 'undefined'}, missing info\n`);
            continue;
        }

        try {
            const clubId = await insertClub(clubName);
            console.log(`  clubId from DB: ${clubId}`);

            const athleteId = await insertAthlete(fullName, birthDate, gender, clubId);
            console.log(`  athleteId from DB: ${athleteId}`);

            await insertResult(athleteId, tournamentId, placement, wins, pointsEarned);
            console.log(`✅ Imported ${fullName}\n`);
        } catch (err) {
            console.error(`❌ Error importing row ${i}:`, err);
        }
    }

    console.log(`✅ Finished processing ${path.basename(filePath)}\n`);
}

async function run() {
    const files = fs.readdirSync(EXCEL_DIR).filter(f => f.endsWith('.xlsx'));
    console.log(`📊 Found ${files.length} Excel files.`);

    let tournamentId = 1; // assign a unique ID per file
    for (const file of files) {
        // simple gender detection from filename
        const gender = file.toLowerCase().includes('female') ? 'female' : 'male';
        await processFile(path.join(EXCEL_DIR, file), tournamentId++, gender);
    }

    console.log('🎉 U16 import finished.');
    db.close();
}

run();
