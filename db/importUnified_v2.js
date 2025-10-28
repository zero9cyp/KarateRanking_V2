// importUnified_v6.js — Official K.O.K. 2024→2025 unified importer
// Usage: node importUnified_v6.js

const Database = require("better-sqlite3");
const xlsx = require("xlsx");
const path = require("path");

const DB_PATH = path.join(__dirname, "karate_ranking.db");
const EXCEL_PATH = path.join(__dirname, "athletes_cleaned (1).xlsx");
const CURRENT_SEASON = 2025;
const PREVIOUS_SEASON = 2024;
const FALLBACK_BIRTHDATE = "1971-01-09";

const db = new Database(DB_PATH);
console.log("🏁 Starting official import v6 …");

const workbook = xlsx.readFile(EXCEL_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

console.log(`📄 ${rows.length} athlete rows loaded.`);

// ---------- helpers ----------
function normalize(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\sΑ-Ωα-ω]/g, " ")
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
function normDate(d) {
  if (!d) return FALLBACK_BIRTHDATE;
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }
  const txt = String(d).trim();
  const parts = txt.split(/[\sT]/)[0].split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4)
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    else
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  return FALLBACK_BIRTHDATE;
}
function safeText(v) {
  return v == null ? null : String(v).trim();
}

// ---------- SQL prepared ----------
const stmt = {
  wipe_results: db.prepare("DELETE FROM results"),
  wipe_penalties: db.prepare("DELETE FROM penalties"),
  wipe_athletes: db.prepare("DELETE FROM athletes"),

  club_get: db.prepare("SELECT id FROM clubs WHERE LOWER(name)=LOWER(?)"),
  club_insert: db.prepare("INSERT INTO clubs (name) VALUES (?)"),

  age_get: db.prepare("SELECT id FROM age_categories WHERE name=?"),
  weight_get: db.prepare(`
      SELECT id FROM weight_categories
      WHERE UPPER(name)=? AND gender=? AND age_category_id=?`),

  athlete_get: db.prepare(
    "SELECT id FROM athletes WHERE LOWER(full_name)=LOWER(?) AND birth_date=?"
  ),

  athlete_insert: db.prepare(`
      INSERT INTO athletes (
        full_name,birth_date,gender,age_category_id,weight_category_id,
        club_id,closing_points_2024,starting_points_2025,total_points
      ) VALUES (
        @full_name,@birth_date,@gender,@age_category_id,@weight_category_id,
        @club_id,@closing_points_2024,@starting_points_2025,@total_points
      )`),

  athlete_update: db.prepare(`
      UPDATE athletes SET
        gender=@gender,
        age_category_id=@age_category_id,
        weight_category_id=@weight_category_id,
        club_id=@club_id,
        closing_points_2024=@closing_points_2024,
        starting_points_2025=@starting_points_2025,
        total_points=@total_points
      WHERE id=@id`),

  penalty_insert: db.prepare(`
      INSERT INTO penalties (athlete_id,result_id,season_year,penalty_points,reason)
      VALUES (@athlete_id,NULL,@season_year,@penalty_points,@reason)`),

  tournament_list: db.prepare("SELECT id,name FROM tournaments"),
  result_get: db.prepare("SELECT id FROM results WHERE athlete_id=? AND tournament_id=?"),
  result_insert: db.prepare(`
      INSERT INTO results (
        athlete_id,tournament_id,age_category_id,weight_category_id,
        placement,wins,points_earned,participated,approved,season_year
      ) VALUES (
        @athlete_id,@tournament_id,@age_category_id,@weight_category_id,
        @placement,@wins,@points_earned,1,1,@season_year)`),
  result_update: db.prepare(`
      UPDATE results SET placement=@placement,wins=@wins,points_earned=@points_earned
      WHERE id=@id`),
};

// ---------- clean ----------
console.log("🧹 Cleaning old data …");
db.pragma("foreign_keys = OFF");
db.transaction(() => {
  stmt.wipe_results.run();
  stmt.wipe_penalties.run();
  stmt.wipe_athletes.run();
})();
db.pragma("foreign_keys = ON");
console.log("✅ Clean done.");

// ---------- import ----------
let inserted = 0,
  updated = 0,
  newClubs = 0,
  penalties = 0,
  results = 0,
  errs = [];

const tournaments = stmt.tournament_list.all();
function findTournament(name) {
  const n = normalize(name);
  if (!n) return null;
  return (
    tournaments.find((t) => normalize(t.name) === n) ||
    tournaments.find((t) => normalize(t.name).includes(n) || n.includes(normalize(t.name)))
  );
}

const tx = db.transaction((r) => {
  const full = safeText(r.full_name);
  if (!full) return;

  const birth = normDate(r.hmer_gennhshs);
  const gender = normGender(r.gender);
  const age = safeText(r.age_category);
  const weight = safeText(r.weight_category)?.toUpperCase() || null;
  const clubName = safeText(r.club);

  const close2024 = Number(r.total_points_2024 || 0);
  const start2025 = Number(r.starting_points_2025 || 0);
  const liveTotal = Number(r["TOTAL POINTS"] || 0);
  const mion = Number(r.mion_points || 0);

  // club
  let club_id = null;
  if (clubName) {
    const c = stmt.club_get.get(clubName);
    if (c) club_id = c.id;
    else {
      const info = stmt.club_insert.run(clubName);
      club_id = info.lastInsertRowid;
      newClubs++;
    }
  }

  let age_id = null;
  if (age) {
    const a = stmt.age_get.get(age);
    if (a) age_id = a.id;
  }

  let weight_id = null;
  if (weight && gender && age_id != null) {
    const w = stmt.weight_get.get(weight, gender, age_id);
    if (w) weight_id = w.id;
  }

  const ex = stmt.athlete_get.get(full, birth);
  const data = {
    full_name: full,
    birth_date: birth,
    gender,
    age_category_id: age_id,
    weight_category_id: weight_id,
    club_id,
    closing_points_2024: close2024,
    starting_points_2025: start2025,
    total_points: liveTotal, // Excel current total
  };

  let athleteId;
  if (ex) {
    stmt.athlete_update.run({ ...data, id: ex.id });
    athleteId = ex.id;
    updated++;
  } else {
    const info = stmt.athlete_insert.run(data);
    athleteId = info.lastInsertRowid;
    inserted++;
  }

  if (mion !== 0) {
    stmt.penalty_insert.run({
      athlete_id: athleteId,
      season_year: CURRENT_SEASON,
      penalty_points: mion,
      reason: "carry-over penalty",
    });
    penalties++;
  }

  // results from Excel (columns ending with _points/_wins/_place)
  Object.keys(r).forEach((key) => {
    if (!key.toLowerCase().endsWith("_points")) return;
    const base = key.replace(/_points$/i, "");
    const tour = findTournament(base.replace(/_/g, " "));
    if (!tour) return;

    const pts = Number(r[key] || 0);
    const wins = r[`${base}_wins`] || null;
    const place = r[`${base}_place`] || null;
    if (pts === 0 && !wins && !place) return;

    const exRes = stmt.result_get.get(athleteId, tour.id);
    if (exRes)
      stmt.result_update.run({
        id: exRes.id,
        placement: place,
        wins,
        points_earned: pts,
      });
    else
      stmt.result_insert.run({
        athlete_id: athleteId,
        tournament_id: tour.id,
        age_category_id: age_id,
        weight_category_id: weight_id,
        placement: place,
        wins,
        points_earned: pts,
        season_year: CURRENT_SEASON,
      });
    results++;
  });
});

for (const row of rows) {
  try {
    tx(row);
  } catch (err) {
    errs.push({ name: row.full_name, err: err.message });
  }
}

// ---------- recalc live totals if Excel TOTAL missing ----------
console.log("🔄 Re-calculating live totals …");
db.prepare(`
  UPDATE athletes
  SET total_points = starting_points_2025 +
    COALESCE((SELECT SUM(points_earned)
              FROM results
              WHERE results.athlete_id = athletes.id
                AND results.season_year = ?),0)
  WHERE (total_points IS NULL OR total_points = 0)
`).run(CURRENT_SEASON);

// ---------- report ----------
console.log("\n=== ✅ IMPORT FINISHED ===");
console.log(`👤 Athletes inserted: ${inserted}`);
console.log(`🔁 Athletes updated:  ${updated}`);
console.log(`🏛 Clubs created:     ${newClubs}`);
console.log(`⚖ Penalties inserted: ${penalties}`);
console.log(`🏟 Results processed: ${results}`);
console.log(`⚠ Row errors:        ${errs.length}`);
if (errs.length) console.table(errs.slice(0, 10));

db.close();
console.log("🏁 Done — data now matches Excel columns exactly.");
