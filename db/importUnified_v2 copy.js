// importUnified_v2.js — Season reset + re-import with penalties
// Requires: better-sqlite3, xlsx
// Usage: node importUnified_v2.js

const Database = require("better-sqlite3");
const xlsx = require("xlsx");
const path = require("path");

// === CONFIG ===
const DB_PATH = path.join(__dirname, "karate_ranking.db"); // <-- adjust if needed
const EXCEL_PATH = path.join(__dirname, "athletes_cleaned (1).xlsx");
const CURRENT_SEASON = 2025;
const FALLBACK_BIRTHDATE = "1971-01-09"; // placeholder birthdate for missing values

// === INIT ===
const db = new Database(DB_PATH);
console.log("🏁 Starting unified season import...");
const workbook = xlsx.readFile(EXCEL_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

console.log(`📄 Found ${rows.length} athlete rows in Excel`);
console.log("🔎 Detected columns:", Object.keys(rows[0]));

// === Helpers ===
function normalize(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\u00A0/g, " ")         // strip nbsp
    .replace(/[^\w\sΑ-Ωα-ω]/g, " ")  // keep greek/latin words/numbers, drop punctuation
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normGender(g) {
  if (!g) return null;
  g = String(g).trim().toLowerCase();
  if (g.startsWith("m")) return "male";
  if (g.startsWith("f")) return "female";
  return null;
}

// Turn excel date or string into YYYY-MM-DD, default fallback if blank
function normDate(d) {
  if (!d) return FALLBACK_BIRTHDATE;
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }
  // if it's string like "2010-01-01 00:00:00" or "01/01/2010"
  const txt = String(d).trim();
  // try split
  const parts = txt.split(/[\sT]/)[0].split(/[\/\-\.]/); // get date portion before space
  if (parts.length === 3) {
    // detect if first is year or day
    if (parts[0].length === 4) {
      // yyyy-mm-dd
      return (
        parts[0] +
        "-" +
        parts[1].padStart(2, "0") +
        "-" +
        parts[2].padStart(2, "0")
      );
    } else {
      // dd/mm/yyyy or dd-mm-yyyy
      return (
        parts[2] +
        "-" +
        parts[1].padStart(2, "0") +
        "-" +
        parts[0].padStart(2, "0")
      );
    }
  }
  return FALLBACK_BIRTHDATE;
}

function safeText(v) {
  return v == null ? null : String(v).trim();
}

// === Prepared statements ===
const stmt = {
  // cleanup phase (run once before import)
  wipe_results: db.prepare("DELETE FROM results"),
  wipe_points_history: db.prepare("DELETE FROM points_history"),
  wipe_points_history_old: db.prepare("DELETE FROM points_history_old"),
  wipe_last_particip: db.prepare("DELETE FROM athlete_last_participation"),
  wipe_changes: db.prepare("DELETE FROM category_changes"),
  wipe_merge_map: db.prepare("DELETE FROM athlete_merge_map"),
  wipe_athletes: db.prepare("DELETE FROM athletes"),

  // lookup/insert helpers
  club_get: db.prepare("SELECT id FROM clubs WHERE LOWER(name)=LOWER(?)"),
  club_insert: db.prepare("INSERT INTO clubs (name) VALUES (?)"),

  age_get: db.prepare("SELECT id FROM age_categories WHERE name=?"),

  weight_get: db.prepare(`
    SELECT id
    FROM weight_categories
    WHERE UPPER(name)=? AND gender=? AND age_category_id=?
  `),

  athlete_get: db.prepare(`
    SELECT id
    FROM athletes
    WHERE LOWER(full_name)=LOWER(?) AND birth_date=?
  `),

  athlete_insert: db.prepare(`
    INSERT INTO athletes
    (full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id)
    VALUES (@full_name, @birth_date, @gender, @age_category_id, @weight_category_id, @total_points, @club_id)
  `),

  athlete_update: db.prepare(`
    UPDATE athletes
    SET gender=@gender,
        age_category_id=@age_category_id,
        weight_category_id=@weight_category_id,
        total_points=@total_points,
        club_id=@club_id
    WHERE id=@id
  `),

  tournaments_all: db.prepare("SELECT id, name FROM tournaments"),

  result_get: db.prepare(`
    SELECT id
    FROM results
    WHERE athlete_id=? AND tournament_id=?
  `),

  result_insert: db.prepare(`
    INSERT INTO results
    (athlete_id, tournament_id, age_category_id, weight_category_id,
     placement, wins, participated, approved,
     points_earned, penalty_points, raw_points,
     countries_participated, approved_up_age,
     season_year)
    VALUES
    (@athlete_id, @tournament_id, @age_category_id, @weight_category_id,
     @placement, @wins, 1, 1,
     @points_earned, 0, @raw_points,
     1, 0,
     @season_year)
  `),

  result_update: db.prepare(`
    UPDATE results
    SET placement=@placement,
        wins=@wins,
        points_earned=@points_earned,
        raw_points=@raw_points
    WHERE id=@id
  `),

  penalty_insert: db.prepare(`
    INSERT INTO penalties
    (athlete_id, result_id, season_year, penalty_points, reason)
    VALUES (@athlete_id, NULL, @season_year, @penalty_points, @reason)
  `),
};

// build fuzzy tournament matcher once
const TOURNAMENT_COLUMNS = [
  {
    // "SERIES A LARNACA FIGHTS"
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
    name: "ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016",
    place:
      "παγκυπριο_πρωταθλημα_ηλικιων_u14_2013,_2014,_2015,_2016_place",
    wins:
      "παγκυπριο_πρωταθλημα_ηλικιων_u14_2013,_2014,_2015,_2016_wins",
    points:
      "παγκυπριο_πρωταθλημα_ηλικιων_u14_2013,_2014,_2015,_2016_points",
  },
];

// fuzzy match tournament names from DB
function buildTournamentMap() {
  const all = stmt.tournaments_all.all();
  return function findTournament(excelName) {
    const needle = normalize(excelName);
    if (!needle) return null;

    // perfect normalized match
    let found = all.find((t) => normalize(t.name) === needle);
    if (found) return found;

    // substring loose match
    found = all.find(
      (t) =>
        normalize(t.name).includes(needle) ||
        needle.includes(normalize(t.name))
    );
    return found || null;
  };
}

const findTournament = buildTournamentMap();

// === CLEAN PHASE ===
console.log("🧹 Wiping old season data...");
db.transaction(() => {
  stmt.wipe_results.run();
  stmt.wipe_points_history.run();
  stmt.wipe_points_history_old.run();
  stmt.wipe_last_particip.run();
  stmt.wipe_changes.run();
  stmt.wipe_merge_map.run();
  db.prepare("DELETE FROM penalties").run(); // ✅ add this line
  stmt.wipe_athletes.run();
})();

console.log("🧾 Importing athletes + results + penalties...");

let insertedAthletes = 0;
let updatedAthletes = 0;
let createdResults = 0;
let updatedResults = 0;
let createdClubs = 0;
let createdPenalties = 0;

const importRowTx = db.transaction((r) => {
  // --- Extract base fields from Excel row
  const fullName = safeText(r.full_name);
  if (!fullName) return; // skip empty rows

  const birthDate = normDate(r.hmer_gennhshs);
  const gender = normGender(r.gender);
  const ageCatName = safeText(r.age_category);
  const weightCatName = safeText(r.weight_category)?.toUpperCase() || null;
  const clubName = safeText(r.club);

  // points
  const total2024 = Number(r.total_points_2024 || 0);
  const starting2025 = Number(r.starting_points_2025 || 0);
  const mion = Number(r.mion_points || 0); // this is the penalty diff (often negative)

  // --- Resolve club_id (insert if new)
  let club_id = null;
  if (clubName) {
    const existingClub = stmt.club_get.get(clubName);
    if (existingClub) {
      club_id = existingClub.id;
    } else {
      const info = stmt.club_insert.run(clubName);
      club_id = info.lastInsertRowid;
      createdClubs++;
    }
  }

  // --- Resolve age_category_id
  let age_category_id = null;
  if (ageCatName) {
    const ageRow = stmt.age_get.get(ageCatName);
    if (ageRow) {
      age_category_id = ageRow.id;
    } else {
      // If not found, we leave null. (Federation may ask us later to insert new official age cat)
      age_category_id = null;
    }
  }

  // --- Resolve weight_category_id
  let weight_category_id = null;
  if (weightCatName && gender && age_category_id != null) {
    const wRow = stmt.weight_get.get(
      weightCatName,
      gender,
      age_category_id
    );
    if (wRow) {
      weight_category_id = wRow.id;
    } else {
      weight_category_id = null;
    }
  }

  // --- Upsert athlete
  const existingAth = stmt.athlete_get.get(fullName, birthDate);

  let athleteId;
  if (existingAth) {
    stmt.athlete_update.run({
      id: existingAth.id,
      gender,
      age_category_id,
      weight_category_id,
      total_points: starting2025, // this is the season 2025 starting score
      club_id,
    });
    updatedAthletes++;
    athleteId = existingAth.id;
  } else {
    const info = stmt.athlete_insert.run({
      full_name: fullName,
      birth_date: birthDate,
      gender,
      age_category_id,
      weight_category_id,
      total_points: starting2025,
      club_id,
    });
    insertedAthletes++;
    athleteId = info.lastInsertRowid;
  }

  // --- Record seasonal penalty
  // Logic:
  //   total_points_2024 -> starting_points_2025 = after deduction
  //   mion_points column appears to be the deduction (negative or 0)
  // We'll store ONLY if there's actually a deduction (mion != 0)
  if (mion !== 0) {
    stmt.penalty_insert.run({
      athlete_id: athleteId,
      season_year: CURRENT_SEASON,
      penalty_points: mion,
      reason: `Season rollover adjustment from 2024 (${total2024}) to ${CURRENT_SEASON} start (${starting2025})`,
    });
    createdPenalties++;
  }

  // --- Tournament results population
  for (const t of TOURNAMENT_COLUMNS) {
    const tourMeta = findTournament(t.name);
    if (!tourMeta) {
      // Tournament does not exist in DB, skip silently.
      continue;
    }

    const placement = r[t.place];
    const wins = r[t.wins];
    const pts = r[t.points];

    // skip empty rows for this tournament
    const allEmpty =
      (placement === null || placement === undefined || placement === "") &&
      (wins === null || wins === undefined || wins === "") &&
      (pts === null || pts === undefined || pts === "") &&
      // allow 0 as valid
      !(placement === 0 || wins === 0 || pts === 0);

    if (allEmpty) continue;

    const resRow = stmt.result_get.get(athleteId, tourMeta.id);

    // raw_points:
    // - we mirror points_earned into raw_points for traceability
    const raw_points = pts != null && pts !== "" ? Number(pts) : 0;

    if (resRow) {
      stmt.result_update.run({
        id: resRow.id,
        placement: placement ?? null,
        wins: wins ?? null,
        points_earned: pts ?? null,
        raw_points,
      });
      updatedResults++;
    } else {
      stmt.result_insert.run({
        athlete_id: athleteId,
        tournament_id: tourMeta.id,
        age_category_id,
        weight_category_id,
        placement: placement ?? null,
        wins: wins ?? null,
        points_earned: pts ?? null,
        raw_points,
        season_year: CURRENT_SEASON,
      });
      createdResults++;
    }
  }
});

// === RUN IMPORT ON ALL ROWS ===
let errorRows = [];
for (const row of rows) {
  try {
    importRowTx(row);
  } catch (err) {
    console.error(`❌ Row failed for athlete "${row.full_name}": ${err.message}`);
    errorRows.push({ name: row.full_name, err: err.message });
  }
}

// === REPORT ===
console.log("\n=== IMPORT COMPLETE ===");
console.log(`👤 Athletes inserted: ${insertedAthletes}`);
console.log(`🔁 Athletes updated:  ${updatedAthletes}`);
console.log(`🏟 Results inserted:  ${createdResults}`);
console.log(`📝 Results updated:   ${updatedResults}`);
console.log(`🏛 Clubs created:     ${createdClubs}`);
console.log(`⚖ Penalties created: ${createdPenalties}`);

if (errorRows.length) {
  console.log(`⚠ Errors on ${errorRows.length} rows:`);
  console.log(errorRows.slice(0, 10));
} else {
  console.log("✅ All rows imported with no runtime errors.");
}
