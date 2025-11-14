const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/karate_ranking.db");
const { ensureAuthenticated, ensureAdminOrCoach } = require("../middleware/auth");

// ----------------------------
// Helper Promisified Wrappers
// ----------------------------
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// ===============================
// LIST + SEARCH (Main page)
// ===============================
router.get("/", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const q = (req.query.q || "").trim();
  const params = [];
  let sql = `
    SELECT a.id, a.full_name, a.gender,
           ac.name AS age_category, wc.name AS weight_category,
           c.name AS club, a.total_points, a.review_status, a.last_reviewed_at
    FROM athletes a
    LEFT JOIN age_categories ac ON ac.id = a.age_category_id
    LEFT JOIN weight_categories wc ON wc.id = a.weight_category_id
    LEFT JOIN clubs c ON c.id = a.club_id
  `;
  if (q) {
    sql += ` WHERE a.full_name LIKE ? `;
    params.push(`%${q}%`);
  }
  sql += ` ORDER BY a.full_name COLLATE NOCASE;`;

  try {
    const athletes = await dbAll(sql, params);
    res.render("editor_full_list", { athletes, q });
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

// ===============================
// ΑΝΑΖΗΤΗΣΗ ΑΘΛΗΤΗ (search route)
// ===============================
router.get("/search", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.redirect("/editor-full");

  const sql = `
    SELECT id, full_name FROM athletes
    WHERE full_name LIKE ? OR id LIKE ?
    ORDER BY full_name COLLATE NOCASE;
  `;
  db.all(sql, [`%${q}%`, `%${q}%`], (err, rows) => {
    if (err) return res.send("Σφάλμα αναζήτησης: " + err.message);

    if (rows.length === 1) {
      // ✅ Μόνο ένας αθλητής — πήγαινε απευθείας στη σελίδα του
      return res.redirect(`/editor-full/${rows[0].id}`);
    }

    // ✅ Αν είναι περισσότεροι, δείξε λίστα επιλογής
    res.render("editor_search_results", { results: rows, q });
  });
});

// ===============================
// Πλήρης Προβολή Αθλητή
// ===============================
router.get("/:athleteId", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const athleteId = req.params.athleteId;

  try {
    const athlete = await dbGet(
      `SELECT a.*, ac.name AS age_category, wc.name AS weight_category, c.name AS club
       FROM athletes a
       LEFT JOIN age_categories ac ON ac.id = a.age_category_id
       LEFT JOIN weight_categories wc ON wc.id = a.weight_category_id
       LEFT JOIN clubs c ON c.id = a.club_id
       WHERE a.id = ?;`,
      [athleteId]
    );
    if (!athlete) return res.status(404).send("Αθλητής δεν βρέθηκε.");

    athlete.review_progress =
      athlete.review_status === "ok" ? 100 :
      athlete.review_status === "issue" ? 50 : 25;
    athlete.reviewed_by = athlete.reviewed_by || null;

    const results = await dbAll(
      `SELECT r.*, t.name AS tournament_name, t.date AS tournament_date
       FROM results r
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.athlete_id = ?
       ORDER BY t.date DESC;`,
      [athleteId]
    );

    const historyKumite = await dbAll(
      `SELECT * FROM points_history WHERE athlete_id=? AND event_type='KUMITE' ORDER BY date DESC;`,
      [athleteId]
    );
    const historyKata = await dbAll(
      `SELECT * FROM points_history WHERE athlete_id=? AND event_type='KATA' ORDER BY date DESC;`,
      [athleteId]
    );

    const yearlyData = await dbAll(
      `SELECT * FROM yearly_points WHERE athlete_id=? ORDER BY year DESC;`,
      [athleteId]
    );

    const clubs = await dbAll(`SELECT id, name FROM clubs ORDER BY name;`);
    const ages = await dbAll(`SELECT id, name FROM age_categories ORDER BY min_age;`);
    const weights = await dbAll(`SELECT id, name FROM weight_categories ORDER BY name;`);
    const tournaments = await dbAll(`SELECT id, name, date FROM tournaments ORDER BY date DESC;`);

    res.render("editor_full_show", {
      athlete,
      results,
      historyKumite,
      historyKata,
      yearlyData,
      clubs,
      ages,
      weights,
      tournaments,
      query: req.query || {}
    });
  } catch (err) {
    res.status(500).send("Σφάλμα βάσης δεδομένων: " + err.message);
  }
});

// ===============================
// Ενημέρωση Κατάστασης Ελέγχου
// ===============================
router.post("/review-status/:id", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { status } = req.body;
  const id = req.params.id;
  if (!["ok", "issue", "pending"].includes(status))
    return res.status(400).send("Μη έγκυρη κατάσταση.");

  try {
    await dbRun(
      `UPDATE athletes
       SET review_status=?, reviewed_by=?, last_reviewed_at=datetime('now')
       WHERE id=?`,
      [status, req.user?.username || req.user?.email || "admin", id]
    );
    res.redirect(`/editor-full/${id}`);
  } catch (err) {
    res.status(500).send("Σφάλμα κατά την ενημέρωση: " + err.message);
  }
});

// ===============================
// Προσθήκη Νέας Season
// ===============================
router.post("/:athleteId/yearly/add", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { year, closing_points, closing_raw_points, event_type } = req.body;
  const athleteId = req.params.athleteId;

  try {
    const prev = await dbGet(
      `SELECT closing_points FROM yearly_points 
       WHERE athlete_id=? AND year < ? AND event_type=? 
       ORDER BY year DESC LIMIT 1`,
      [athleteId, year, event_type]
    );

    const startVal = prev ? prev.closing_points : 0;

    await dbRun(
      `INSERT INTO yearly_points
       (athlete_id, year, closing_points, starting_points, closing_raw_points, carry_percent, updated_by, event_type)
       VALUES (?,?,?,?,?,?,?,?)`,
      [athleteId, year, closing_points || 0, startVal, closing_raw_points || 0, 100, req.user?.username || "admin", event_type]
    );

    res.redirect(`/editor-full/${athleteId}`);
  } catch (err) {
    res.status(500).send("Σφάλμα βάσης: " + err.message);
  }
});

// ===============================
// ΑΠΟΤΕΛΕΣΜΑΤΑ - Προσθήκη / Ενημέρωση
// ===============================
router.post("/:athleteId/results/save", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId } = req.params;
  const { id, tournament_id, placement, wins, points_earned, season_year, discipline } = req.body;

  try {
    if (id && id !== "") {
      await dbRun(
        `UPDATE results SET tournament_id=?, placement=?, wins=?, points_earned=?, season_year=?, event_type=? 
         WHERE id=? AND athlete_id=?`,
        [tournament_id, placement, wins, points_earned, season_year, discipline, id, athleteId]
      );
    } else {
      await dbRun(
        `INSERT INTO results (athlete_id, tournament_id, placement, wins, points_earned, season_year, event_type)
         VALUES (?,?,?,?,?,?,?)`,
        [athleteId, tournament_id, placement, wins, points_earned, season_year, discipline]
      );
    }

    // ✅ Auto-update total and points_history
    const total = await dbGet(
      `SELECT COALESCE(SUM(points_earned), 0) AS total 
       FROM results 
       WHERE athlete_id=? AND event_type=?`,
      [athleteId, discipline]
    );

    const before = await dbGet(
      `SELECT COALESCE(total_after, 0) AS last_total 
       FROM points_history 
       WHERE athlete_id=? AND event_type=? 
       ORDER BY date DESC LIMIT 1`,
      [athleteId, discipline]
    );

    const beforeTotal = before ? before.last_total : 0;
    const afterTotal = total.total;

    await dbRun(
      `INSERT INTO points_history 
         (athlete_id, date, points_before, points_after, total_after, season_year, description, event_type, added_by)
       VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
      [
        athleteId,
        beforeTotal,
        afterTotal,
        afterTotal,
        season_year,
        `Auto update from tournament ID ${tournament_id}`,
        discipline,
        req.user?.username || "system"
      ]
    );

    res.redirect(`/editor-full/${athleteId}`);
  } catch (err) {
    res.status(500).send("Σφάλμα αποθήκευσης αποτελέσματος: " + err.message);
  }
});

// ===============================
// Διαγραφή αποτελέσματος
// ===============================
router.post("/:athleteId/results/:resultId/delete", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  try {
    await dbRun(`DELETE FROM results WHERE id=? AND athlete_id=?`, [req.params.resultId, req.params.athleteId]);
    res.redirect(`/editor-full/${req.params.athleteId}`);
  } catch (err) {
    res.status(500).send("Σφάλμα διαγραφής: " + err.message);
  }
});

// ===============================
// Πόντοι - Προσθήκη / Ενημέρωση
// ===============================
router.post("/:athleteId/points/save/:discipline", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, discipline } = req.params;
  const { id, total_after, season_year, description } = req.body;
  try {
    if (id && id !== "") {
      await dbRun(
        `UPDATE points_history SET total_after=?, season_year=?, description=? WHERE id=? AND athlete_id=? AND event_type=?`,
        [total_after, season_year, description, id, athleteId, discipline]
      );
    } else {
      const prev = await dbGet(
        `SELECT COALESCE(total_after,0) AS last_total FROM points_history WHERE athlete_id=? AND event_type=? ORDER BY date DESC LIMIT 1`,
        [athleteId, discipline]
      );
      const before = prev ? prev.last_total : 0;
      await dbRun(
        `INSERT INTO points_history (athlete_id, date, points_before, points_after, total_after, season_year, description, event_type, added_by)
         VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`,
        [athleteId, before, total_after, total_after, season_year, description, discipline, req.user?.username || "admin"]
      );
    }
    res.redirect(`/editor-full/${athleteId}`);
  } catch (err) {
    res.status(500).send("Σφάλμα πόντων: " + err.message);
  }
});

// ===============================
// Διαγραφή Πόντων
// ===============================
router.post("/:athleteId/points/:pointId/delete", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  try {
    await dbRun(`DELETE FROM points_history WHERE id=? AND athlete_id=?`, [req.params.pointId, req.params.athleteId]);
    res.redirect(`/editor-full/${req.params.athleteId}`);
  } catch (err) {
    res.status(500).send("Σφάλμα διαγραφής πόντων: " + err.message);
  }
});

router.post("/season/rollover", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { closingYear, carryPercent } = req.body;
  const nextYear = Number(closingYear) + 1;

  try {
    const sql = `
      INSERT OR IGNORE INTO yearly_points (
        athlete_id, year, closing_points, starting_points, closing_raw_points,
        carry_percent, updated_by
      )
      SELECT 
        r.athlete_id,
        ? AS year,
        0 AS closing_points,
        ROUND(SUM(r.points_earned) * (? / 100.0), 3) AS starting_points,
        SUM(r.points_earned) AS closing_raw_points,
        ?,
        ?
      FROM results r
      WHERE r.season_year = ?
      GROUP BY r.athlete_id;
    `;
    await dbRun(sql, [nextYear, carryPercent, carryPercent, req.user?.username || "system", closingYear]);
    res.send(`✅ Season rollover complete: ${closingYear} → ${nextYear}`);
  } catch (err) {
    res.status(500).send("Σφάλμα rollover: " + err.message);
  }
});

module.exports = router;
