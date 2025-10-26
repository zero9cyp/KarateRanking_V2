// dryRunImport.js
// Safe preview of Excel → SQLite updates (no writes)

const Database = require('better-sqlite3');
const xlsx = require('xlsx');
const path = require('path');

const DB_PATH = path.join(__dirname, 'karate_ranking.db');
const EXCEL_PATH = path.join(__dirname, 'athletes.xlsx');

const db = new Database(DB_PATH, { readonly: true });

// --- Helper lookups --------------------------------------------------

const q = {
  club: db.prepare('SELECT id FROM clubs WHERE LOWER(name)=LOWER(?)'),
  age: db.prepare('SELECT id FROM age_categories WHERE name=?'),
  weight: db.prepare(`
    SELECT id FROM weight_categories 
    WHERE LOWER(name)=LOWER(?) AND gender=? AND age_category_id=?
  `),
  athlete: db.prepare(`
    SELECT id, birth_date, total_points, club_id, age_category_id, weight_category_id
    FROM athletes
    WHERE LOWER(full_name)=LOWER(?) AND birth_date=?
  `),
  tournament: db.prepare('SELECT id FROM tournaments WHERE LOWER(name)=LOWER(?)'),
  result: db.prepare(`
    SELECT id, placement, wins, points_earned
    FROM results
    WHERE athlete_id=? AND tournament_id=?
  `)
};

// --- Normalizers -----------------------------------------------------

function normGender(g) {
  if (!g) return null;
  g = g.trim().toLowerCase();
  if (g.startsWith('m')) return 'male';
  if (g.startsWith('f')) return 'female';
  return null;
}

function normDate(d) {
  if (!d) return '1970-01-01';
  if (d instanceof Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const parts = String(d).trim().split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  return '1970-01-01';
}

// --- Excel reading ---------------------------------------------------

const workbook = xlsx.readFile(EXCEL_PATH);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

// Tournament column mapping — adjust these headers if they differ in your Excel
const tournaments = [
  { name: 'ΠΑΓΚΥΠΡΙΟ ΠΡΩΤΑΘΛΗΜΑ ΗΛΙΚΙΩΝ U14 2013, 2014, 2015, 2016', place: 'Place', wins: 'Wins', points: 'Points' },
  { name: 'EUROPEAN FIGHTS', place: 'Place_2', wins: 'Wins_2', points: 'Points_2' },
  { name: 'NATIONALS FIGHTS', place: 'Place_3', wins: 'Wins_3', points: 'Points_3' },
  { name: 'SERIES A LARNACA FIGHTS', place: 'Place_4', wins: 'Wins_4', points: 'Points_4' },
  { name: 'ΑΜΚΕ GAMES FIGHTS', place: 'Place_5', wins: 'Wins_5', points: 'Points_5' },
  { name: 'MKFU GAMES FIGHTS', place: 'Place_6', wins: 'Wins_6', points: 'Points_6' }
];

// --- Dry run ---------------------------------------------------------

console.log('\n=== DRY RUN START ===\n');

for (const [index, r] of rows.entries()) {
  const fullName = (r['FULL NAME'] || '').trim();
  if (!fullName) continue; // skip empty lines

  const birth = normDate(r['HMER. GENNHSHS']);
  const gender = normGender(r['GERNE']);
  const ageName = r['AGE'] ? r['AGE'].toString().trim() : null;
  const weightName = r['WEIGHT'] ? r['WEIGHT'].toString().replace(/"/g, '').trim() : null;
 function safeText(val) {
  if (val == null) return null;
  return String(val).trim();
}

const clubName = safeText(r['CLUB']);


  const totalPoints = Number(r['TOTAL POINTS'] || r['POINTS 2024'] || 0);

  // Lookups
  const ageRow = ageName ? q.age.get(ageName) : null;
  const ageId = ageRow ? ageRow.id : null;

  let weightId = null;
  if (weightName && weightName.toUpperCase() !== 'NO LIMITS' && gender && ageId) {
    const w = q.weight.get(weightName, gender, ageId);
    if (w) weightId = w.id;
    else console.warn(`[!] Unknown weight category "${weightName}" (${gender}, age ${ageName})`);
  }

  const clubRow = clubName ? q.club.get(clubName) : null;

  const athleteRow = q.athlete.get(fullName, birth);

  console.log(`\n#${index + 1}: ${fullName}`);
  console.log(`   Birth: ${birth}, Gender: ${gender}, Age: ${ageName}, Weight: ${weightName || '-'}, Club: ${clubName || '-'}, TotalPts: ${totalPoints}`);

  if (athleteRow) {
    console.log(` → Would UPDATE athlete id=${athleteRow.id}`);
  } else {
    console.log(` → Would CREATE new athlete`);
  }

  if (!clubRow) console.warn(`   [!] Club not found: "${clubName}"`);
  if (!ageId) console.warn(`   [!] Age category not found: "${ageName}"`);

  // Tournaments
  for (const t of tournaments) {
    const tRow = q.tournament.get(t.name.toLowerCase());
    if (!tRow) continue; // skip unknown tournaments

    const placement = r[t.place];
    const wins = r[t.wins];
    const pts = r[t.points];

    const allEmpty = [placement, wins, pts].every(v => v === null || v === '' || v === undefined);
    if (allEmpty) continue;

    const tournamentId = tRow.id;
    const athleteId = athleteRow ? athleteRow.id : '(new)';
    const res = athleteRow ? q.result.get(athleteRow.id, tournamentId) : null;

    if (res) {
      console.log(`   - Would UPDATE result for "${t.name}" (placement=${placement}, wins=${wins}, points=${pts})`);
    } else {
      console.log(`   - Would INSERT result for "${t.name}" (placement=${placement}, wins=${wins}, points=${pts})`);
    }
  }
}

console.log('\n=== DRY RUN END ===\n');
