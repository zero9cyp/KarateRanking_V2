// importLive.js
// Excel → SQLite live sync (with normalization and fallback matching)

const Database = require("better-sqlite3");
const xlsx = require("xlsx");
const path = require("path");
const db = new Database(path.join(__dirname, "karate_ranking.db"));

const EXCEL_PATH = path.join(__dirname, "athletes.xlsx");

// --- Prepare statements ---
const q = {
  club: db.prepare("SELECT id FROM clubs WHERE LOWER(name)=LOWER(?)"),
  insertClub: db.prepare("INSERT INTO clubs (name) VALUES (?)"),
  age: db.prepare("SELECT id FROM age_categories WHERE name=?"),
  weight: db.prepare(`
    SELECT id FROM weight_categories 
    WHERE UPPER(name)=? AND gender=? AND age_category_id=?`),
  athlete: db.prepare(
    "SELECT id FROM athletes WHERE LOWER(full_name)=LOWER(?) AND birth_date=?"
  ),
  insertAthlete: db.prepare(`
    INSERT INTO athletes (full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id)
    VALUES (@full_name, @birth_date, @gender, @age_category_id, @weight_category_id, @total_points, @club_id)`),
  updateAthlete: db.prepare(`
    UPDATE athletes SET gender=@gender, age_category_id=@age_category_id,
    weight_category_id=@weight_category_id, total_points=@total_points, club_id=@club_id WHERE id=@id`),
  tournament: db.prepare("SELECT id, name FROM tournaments"),
  result: db.prepare("SELECT id FROM results WHERE athlete_id=? AND tournament_id=?"),
  insertResult: db.prepare(`
    INSERT INTO results (athlete_id, tournament_id, age_category_id, weight_category_id, placement, wins, points_earned, participated, approved)
    VALUES (@athlete_id, @tournament_id, @age_category_id, @weight_category_id, @placement, @wins, @points_earned, 1, 1)`),
  updateResult: db.prepare(`
    UPDATE results SET placement=@placement, wins=@wins, points_earned=@points_earned WHERE id=@id`),
};

// --- Utility functions ---
function normalize(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove Greek accents
    .replace(/\u00A0/g, " ") // non-breaking spaces
    .replace(/[^\w\sΑ-Ωα-ω]/g, " ") // remove weird chars
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normGender(g) {
  if (!g) return null;
  g = g.toLowerCase().trim();
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

// --- Tournament mapping (column names) ---
const tournaments = [
  {
    name: "ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016",
    place: "ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016 Place",
    wins: "ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016 Wins",
    points: "ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016 Points",
  },
  { name: "EUROPEAN FIGHTS", place: "EUROPEAN FIGHTS Place", wins: "EUROPEAN FIGHTS Wins", points: "EUROPEAN FIGHTS Points" },
  { name: "NATIONALS FIGHTS", place: "NATIONALS FIGHTS Place", wins: "NATIONALS FIGHTS Wins", points: "NATIONALS FIGHTS Points" },
  { name: "SERIES A LARNACA FIGHTS", place: "SERIES A LARNACA FIGHTS Place", wins: "SERIES A LARNACA FIGHTS Wins", points: "SERIES A LARNACA FIGHTS Points" },
  { name: "ΑΜΚΕ GAMES FIGHTS", place: "ΑΜΚΕ GAMES FIGHTS Place", wins: "ΑΜΚΕ GAMES FIGHTS Wins", points: "ΑΜΚΕ GAMES FIGHTS Points" },
  { name: "MKFU GAMES FIGHTS", place: "MKFU GAMES FIGHTS Place", wins: "MKFU GAMES FIGHTS Wins", points: "MKFU GAMES FIGHTS Points" },
];

// --- Load tournaments once ---
const dbTournaments = q.tournament.all();
const tournamentMap = new Map(
  dbTournaments.map((t) => [normalize(t.name), { id: t.id, name: t.name }])
);

// --- Excel reading ---
const workbook = xlsx.readFile(EXCEL_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
console.log("Detected columns:", Object.keys(rows[0]));
console.log("\n=== LIVE IMPORT START ===\n");

let insertedCount = 0,
  updatedCount = 0,
  kataCount = 0,
  kumiteCount = 0;

// --- Transaction ---
const insertTransaction = db.transaction((r) => {
  const fullName = safeText(r["FULL NAME"]);
  if (!fullName) return;

  const type = safeText(r["TYPE"])?.toUpperCase() || null;
  let ageName = safeText(r["AGE"]);
  if (ageName && ageName.toUpperCase() === "SENIORS") ageName = "SENIOR";

  const birth = normDate(r["HMER. GENNHSHS"]);
  const gender = normGender(r["GERNE"]);
  const weightName = safeText(r["WEIGHT"]);
  const clubName = safeText(r["CLUB"]);
  const totalPoints = Number(r["TOTAL POINTS 2024"] || r["TOTAL POINTS"] || 0);

  const ageRow = ageName ? q.age.get(ageName) : null;
  const ageId = ageRow ? ageRow.id : null;

  let clubId = null;
  if (clubName) {
    const clubRow = q.club.get(clubName);
    clubId = clubRow ? clubRow.id : q.insertClub.run(clubName).lastInsertRowid;
  }

  let weightId = null;
  if (type === "KATA") kataCount++;
  else if (type === "KUMITE" && weightName && gender && ageId) {
    kumiteCount++;
    const wn = normalize(weightName).toUpperCase();
    if (!["NOLIMITS", "NO-LIMITS", "NO_LIMITS"].includes(wn)) {
      const w = q.weight.get(wn, gender, ageId);
      if (w) weightId = w.id;
    }
  }

  const athleteRow = q.athlete.get(fullName, birth);
  if (athleteRow)
    q.updateAthlete.run({
      id: athleteRow.id,
      gender,
      age_category_id: ageId,
      weight_category_id: weightId,
      total_points: totalPoints,
      club_id: clubId,
    });
  else
    q.insertAthlete.run({
      full_name: fullName,
      birth_date: birth,
      gender,
      age_category_id: ageId,
      weight_category_id: weightId,
      total_points: totalPoints,
      club_id: clubId,
    });

  const athleteId = athleteRow
    ? athleteRow.id
    : db.prepare("SELECT last_insert_rowid() AS id").get().id;

  // --- Tournament results ---
  for (const t of tournaments) {
    const normalizedName = normalize(t.name);
    let found = tournamentMap.get(normalizedName);

    if (!found) {
      // try partial match
      for (const [key, val] of tournamentMap.entries()) {
        if (key.includes(normalizedName) || normalizedName.includes(key)) {
          found = val;
          console.log(`✅ Matched fuzzy: "${t.name}" → "${val.name}"`);
          break;
        }
      }
    }

    if (!found) {
      console.warn(`⚠️ Tournament not found for: "${t.name}"`);
      continue;
    }

    const placement = r[t.place];
    const wins = r[t.wins];
    const pts = r[t.points];
    const allEmpty = [placement, wins, pts].every(
      (v) => v == null || v === ""
    );
    if (allEmpty) continue;

    const res = q.result.get(athleteId, found.id);
    if (res)
      q.updateResult.run({ id: res.id, placement, wins, points_earned: pts });
    else
      q.insertResult.run({
        athlete_id: athleteId,
        tournament_id: found.id,
        age_category_id: ageId,
        weight_category_id: weightId,
        placement,
        wins,
        points_earned: pts,
      });
  }
});

// --- Run main loop ---
for (const [i, row] of rows.entries()) {
  try {
    insertTransaction(row);
  } catch (err) {
    console.error(`Row ${i + 1} error:`, err.message);
  }
}

console.log("\n=== LIVE IMPORT END ===");
console.log(`Inserted: ${insertedCount} | Updated: ${updatedCount}`);
console.log(`KATA athletes: ${kataCount} | KUMITE athletes: ${kumiteCount}`);
