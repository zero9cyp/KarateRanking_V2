// importUnified.js — Unified, safe Excel → SQLite importer for Karate Ranking
// (keeps tournament dates, prevents duplicates, fuzzy matching by name)

const Database = require("better-sqlite3");
const xlsx = require("xlsx");
const path = require("path");

const db = new Database(path.join(__dirname, "karate_ranking.db"));
const EXCEL_PATH = path.join(__dirname, "athletes_cleaned.xlsx");

console.log("🏁 Starting unified import...");

// --- Read Excel ---
const workbook = xlsx.readFile(EXCEL_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

console.log(`📄 Found ${rows.length} rows in Excel`);
console.log("Detected columns:", Object.keys(rows[0]));

// --- Helper Functions ---
function normalize(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\u00A0/g, " ")
    .replace(/[^\w\sΑ-Ωα-ω]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normGender(g) {
  if (!g) return null;
  g = g.toLowerCase();
  if (g.startsWith("m")) return "male";
  if (g.startsWith("f")) return "female";
  return null;
}

function normDate(d) {
  if (!d) return "1970-01-01";
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }
  const p = String(d).split(/[\/\-\.]/);
  return p.length === 3
    ? p[0].length === 4
      ? `${p[0]}-${p[1].padStart(2, "0")}-${p[2].padStart(2, "0")}`
      : `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`
    : "1970-01-01";
}

function safeText(v) {
  return v == null ? null : String(v).trim();
}

// --- Prepared statements ---
const q = {
  club: db.prepare("SELECT id FROM clubs WHERE LOWER(name)=LOWER(?)"),
  insertClub: db.prepare("INSERT INTO clubs (name) VALUES (?)"),
  age: db.prepare("SELECT id FROM age_categories WHERE name=?"),
  weight: db.prepare(
    "SELECT id FROM weight_categories WHERE UPPER(name)=? AND gender=? AND age_category_id=?"
  ),
  athlete: db.prepare(
    "SELECT id FROM athletes WHERE LOWER(full_name)=LOWER(?) AND birth_date=?"
  ),
  insertAthlete: db.prepare(`
    INSERT INTO athletes (full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id)
    VALUES (@full_name, @birth_date, @gender, @age_category_id, @weight_category_id, @total_points, @club_id)
  `),
  updateAthlete: db.prepare(`
    UPDATE athletes SET gender=@gender, age_category_id=@age_category_id,
    weight_category_id=@weight_category_id, total_points=@total_points, club_id=@club_id WHERE id=@id
  `),
  getTournaments: db.prepare("SELECT id, name FROM tournaments"),
  getResult: db.prepare("SELECT id FROM results WHERE athlete_id=? AND tournament_id=?"),
  insertResult: db.prepare(`
    INSERT INTO results (athlete_id, tournament_id, age_category_id, weight_category_id, placement, wins, points_earned, participated, approved, season_year)
    VALUES (@athlete_id, @tournament_id, @age_category_id, @weight_category_id, @placement, @wins, @points_earned, 1, 1, 2025)
  `),
  updateResult: db.prepare(`
    UPDATE results SET placement=@placement, wins=@wins, points_earned=@points_earned WHERE id=@id
  `),
};

// --- Tournament fuzzy matcher ---
function findTournament(name) {
  const all = q.getTournaments.all();
  const n = normalize(name);
  let found = all.find((t) => normalize(t.name) === n);
  if (!found) {
    found = all.find(
      (t) => normalize(t.name).includes(n) || n.includes(normalize(t.name))
    );
  }
  return found;
}

// --- Tournament list from Excel headers ---
const tournaments = [
  {
    name: "ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016",
    place: "παγκυπριο_πρωταθλημα_ηλικιων_u14_2013,_2014,_2015,_2016_place",
    wins: "παγκυπριο_πρωταθλημα_ηλικιων_u14_2013,_2014,_2015,_2016_wins",
    points: "παγκυπριο_πρωταθλημα_ηλικιων_u14_2013,_2014,_2015,_2016_points",
  },
  {
    name: "EUROPEAN FIGHTS",
    place: "european_fights_place",
    wins: "european_fights_wins",
    points: "european_fights_points",
  },
  {
    name: "NATIONALS FIGHTS",
    place: "nationals_fights_place",
    wins: "nationals_fights_wins",
    points: "nationals_fights_points",
  },
  {
    name: "SERIES A LARNACA FIGHTS",
    place: "series_a_larnaca_fights_place",
    wins: "series_a_larnaca_fights_wins",
    points: "series_a_larnaca_fights_points",
  },
  {
    name: "ΑΜΚΕ GAMES FIGHTS",
    place: "αμκε_games_fights_place",
    wins: "αμκε_games_fights_wins",
    points: "αμκε_games_fights_points",
  },
  {
    name: "MKFU GAMES FIGHTS",
    place: "mkfu_games_fights_place",
    wins: "mkfu_games_fights_wins",
    points: "mkfu_games_fights_points",
  },
];

// --- Import transaction ---
let insertedCount = 0;
let updatedCount = 0;
let missed = [];

const tx = db.transaction((r) => {
  const fullName = safeText(r.full_name);
  if (!fullName) return;

  const birth = normDate(r.hmer_gennhshs);
  const gender = normGender(r.gender);
  const clubName = safeText(r.club);
  const totalPoints = Number(r.total_points_2024 || 0);

  let clubId = null;
  if (clubName) {
    const clubRow = q.club.get(clubName);
    clubId = clubRow ? clubRow.id : q.insertClub.run(clubName).lastInsertRowid;
  }

  const ageRow = q.age.get(safeText(r.age_category));
  const ageId = ageRow ? ageRow.id : null;

  const weightRow = q.weight.get(
    safeText(r.weight_category)?.toUpperCase(),
    gender,
    ageId
  );
  const weightId = weightRow ? weightRow.id : null;

  const athleteRow = q.athlete.get(fullName, birth);
  if (athleteRow) {
    q.updateAthlete.run({
      id: athleteRow.id,
      gender,
      age_category_id: ageId,
      weight_category_id: weightId,
      total_points: totalPoints,
      club_id: clubId,
    });
    updatedCount++;
  } else {
    q.insertAthlete.run({
      full_name: fullName,
      birth_date: birth,
      gender,
      age_category_id: ageId,
      weight_category_id: weightId,
      total_points: totalPoints,
      club_id: clubId,
    });
    insertedCount++;
  }

  const athleteId = athleteRow
    ? athleteRow.id
    : db.prepare("SELECT last_insert_rowid() AS id").get().id;

  for (const t of tournaments) {
    const tournament = findTournament(t.name);
    if (!tournament) {
      console.warn(`⚠️ Tournament not found for: "${t.name}"`);
      missed.push(fullName);
      continue;
    }

    const placement = r[t.place];
    const wins = r[t.wins];
    const pts = r[t.points];
    if ([placement, wins, pts].every((v) => !v && v !== 0)) continue;

    const res = q.getResult.get(athleteId, tournament.id);
    if (res) {
      q.updateResult.run({ id: res.id, placement, wins, points_earned: pts });
    } else {
      q.insertResult.run({
        athlete_id: athleteId,
        tournament_id: tournament.id,
        age_category_id: ageId,
        weight_category_id: weightId,
        placement,
        wins,
        points_earned: pts,
      });
    }
  }
});

// --- Run all imports ---
for (const [i, row] of rows.entries()) {
  try {
    tx(row);
  } catch (err) {
    console.error(`❌ Error at ${row.full_name}: ${err.message}`);
    missed.push(row.full_name);
  }
}

console.log("\n=== IMPORT COMPLETE ===");
console.log(`👤 Inserted: ${insertedCount} | Updated: ${updatedCount}`);

if (missed.length) {
  console.log(`⚠️ Missed: ${missed.length}`);
  console.log(missed.slice(0, 10));
} else {
  console.log("✅ All athletes imported successfully");
}
