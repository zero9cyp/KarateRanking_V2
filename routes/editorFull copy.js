// routes/editorFull.js
const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const db = new sqlite3.Database(path.join(__dirname, "../db/karate_ranking.db"));
const { ensureAuthenticated, ensureAdminOrCoach } = require("../middleware/auth");

// ---------- helpers ----------
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
      if (err) reject(err); else resolve(this);
    });
  });
}
async function hasColumn(table, column) {
  const info = await dbAll(`PRAGMA table_info(${table});`);
  return info.some(c => c.name.toLowerCase() === column.toLowerCase());
}

// ===============================
// LIST + SEARCH
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
// SHOW: 4 Tabs (Προφίλ/Αποτελέσματα/Πόντοι/Εποχές)
// ===============================
router.get("/:athleteId", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const athleteId = req.params.athleteId;
  try {
    await dbRun(`UPDATE athletes SET last_reviewed_at=datetime('now') WHERE id=?`, [athleteId]);

    const athlete = await dbGet(`
      SELECT a.*,
             ac.name AS age_category, wc.name AS weight_category, c.name AS club
      FROM athletes a
      LEFT JOIN age_categories ac ON ac.id=a.age_category_id
      LEFT JOIN weight_categories wc ON wc.id=a.weight_category_id
      LEFT JOIN clubs c ON c.id=a.club_id
      WHERE a.id=?`, [athleteId]);
    if (!athlete) return res.status(404).send("Αθλητής δεν βρέθηκε.");

    const results = await dbAll(`
      SELECT r.id, r.tournament_id, r.placement, r.wins, r.points_earned, r.season_year,
             t.name AS tournament_name, t.date AS tournament_date
      FROM results r
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.athlete_id=?
      ORDER BY t.date DESC, r.id DESC;`, [athleteId]);

    // yearly seasons
    const yearlyData = await dbAll(`
      SELECT id, year, closing_points, starting_points, closing_raw_points
      FROM yearly_points
      WHERE athlete_id=?
      ORDER BY year DESC;`, [athleteId]);

    // points history (discipline-aware if column exists)
    const hasDiscipline = await hasColumn("points_history", "discipline");

    let historyKumite = [];
    let historyKata = [];
    if (hasDiscipline) {
      historyKumite = await dbAll(`
        SELECT id, date, points_before, points_after,
               COALESCE(points_after - points_before, 0) AS delta,
               COALESCE(total_after, points_after) AS total_after,
               season_year, description, discipline
        FROM points_history
        WHERE athlete_id=? AND discipline='KUMITE'
        ORDER BY date DESC, id DESC;`, [athleteId]);

      historyKata = await dbAll(`
        SELECT id, date, points_before, points_after,
               COALESCE(points_after - points_before, 0) AS delta,
               COALESCE(total_after, points_after) AS total_after,
               season_year, description, discipline
        FROM points_history
        WHERE athlete_id=? AND discipline='KATA'
        ORDER BY date DESC, id DESC;`, [athleteId]);
    } else {
      const history = await dbAll(`
        SELECT id, date, points_before, points_after,
               COALESCE(points_after - points_before, 0) AS delta,
               COALESCE(total_after, points_after) AS total_after,
               season_year, description
        FROM points_history
        WHERE athlete_id=?
        ORDER BY date DESC, id DESC;`, [athleteId]);
      historyKumite = history;
      historyKata = []; // no separation available
    }

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
    });
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

// ===============================
// Review status
// ===============================
router.post("/review-status/:id", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { status } = req.body;
  const id = req.params.id;
  if (!["ok","issue","pending"].includes(status)) return res.status(400).send("Invalid status value");
  try {
    await dbRun(`UPDATE athletes
                 SET review_status=?, last_reviewed_at=datetime('now')
                 WHERE id=?`, [status, id]);
    res.redirect(`/editor-full/${id}`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

// ===============================
// Profile update
// ===============================
router.post("/:athleteId/profile/update", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId } = req.params;
  const { full_name, birth_date, gender, age_category_id, weight_category_id, club_id, total_points } = req.body;
  try {
    await dbRun(
      `UPDATE athletes
       SET full_name=?, birth_date=?, gender=?,
           age_category_id=?, weight_category_id=?, club_id=?, total_points=?
       WHERE id=?`,
      [
        (full_name||"").trim(),
        birth_date || null,
        (gender||"").toLowerCase(),
        age_category_id || null,
        weight_category_id || null,
        club_id || null,
        total_points || 0,
        athleteId
      ]
    );
    res.redirect(`/editor-full/${athleteId}`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

// ===============================
// Results: add / update / delete
// ===============================
router.post("/:athleteId/results/add", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId } = req.params;
  const { tournament_id, placement, wins, points_earned, season_year } = req.body;
  try {
    await dbRun(
      `INSERT INTO results (athlete_id, tournament_id, placement, wins, points_earned, season_year)
       VALUES (?,?,?,?,?,?)`,
      [athleteId, tournament_id, placement||0, wins||0, points_earned||0, season_year||2025]
    );
    res.redirect(`/editor-full/${athleteId}#results`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

router.post("/:athleteId/results/:resultId/update", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, resultId } = req.params;
  const { tournament_id, placement, wins, points_earned, season_year } = req.body;
  try {
    await dbRun(
      `UPDATE results
       SET tournament_id=?, placement=?, wins=?, points_earned=?, season_year=?
       WHERE id=? AND athlete_id=?`,
      [tournament_id, placement||0, wins||0, points_earned||0, season_year||2025, resultId, athleteId]
    );
    res.redirect(`/editor-full/${athleteId}#results`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

router.post("/:athleteId/results/:resultId/delete", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, resultId } = req.params;
  try {
    await dbRun(`DELETE FROM results WHERE id=? AND athlete_id=?`, [resultId, athleteId]);
    res.redirect(`/editor-full/${athleteId}#results`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

// ===============================
// Points history: add (KATA/KUMITE), update, delete
// ===============================
router.post("/:athleteId/points/add/:discipline", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, discipline } = req.params; // "KATA" or "KUMITE"
  const { total_after, season_year, description } = req.body;
  try {
    const colOk = await hasColumn("points_history","discipline");

    const last = await dbGet(
      colOk
        ? `SELECT COALESCE(total_after, points_after, 0) AS last_total
           FROM points_history WHERE athlete_id=? AND discipline=? 
           ORDER BY date DESC, id DESC LIMIT 1`
        : `SELECT COALESCE(total_after, points_after, 0) AS last_total
           FROM points_history WHERE athlete_id=?
           ORDER BY date DESC, id DESC LIMIT 1`,
      colOk ? [athleteId, discipline] : [athleteId]
    );

    const before = last ? (last.last_total || 0) : 0;
    const after = parseFloat(total_after || 0);

    await dbRun(
      colOk
        ? `INSERT INTO points_history
           (athlete_id, date, points_before, points_after, total_after, season_year, description, discipline)
           VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO points_history
           (athlete_id, date, points_before, points_after, total_after, season_year, description)
           VALUES (?, datetime('now'), ?, ?, ?, ?, ?)`,
      colOk
        ? [athleteId, before, after, after, season_year || 2025, description || null, discipline]
        : [athleteId, before, after, after, season_year || 2025, description || null]
    );

    // sync to athletes.{kumite_points|kata_points} or fallback to total_points
    if (colOk) {
      const column = discipline === "KATA" ? "kata_points" : "kumite_points";
      // if the column doesn't exist on athletes, fallback to total_points
      let athleteCols = await dbAll(`PRAGMA table_info(athletes);`);
      const athleteHas = name => athleteCols.some(c => c.name.toLowerCase() === name.toLowerCase());
      if (athleteHas(column)) {
        await dbRun(`UPDATE athletes SET ${column}=? WHERE id=?`, [after, athleteId]);
      } else {
        await dbRun(`UPDATE athletes SET total_points=? WHERE id=?`, [after, athleteId]);
      }
    } else {
      await dbRun(`UPDATE athletes SET total_points=? WHERE id=?`, [after, athleteId]);
    }

    res.redirect(`/editor-full/${athleteId}#points`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

router.post("/:athleteId/points/:pointId/update", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, pointId } = req.params;
  const { points_after, total_after, season_year, description } = req.body;
  try {
    await dbRun(
      `UPDATE points_history
       SET points_after=?, total_after=?, season_year=?, description=?
       WHERE id=? AND athlete_id=?`,
      [points_after||0, total_after||0, season_year||null, description||null, pointId, athleteId]
    );
    res.redirect(`/editor-full/${athleteId}#points`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

router.post("/:athleteId/points/:pointId/delete", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, pointId } = req.params;
  try {
    await dbRun(`DELETE FROM points_history WHERE id=? AND athlete_id=?`, [pointId, athleteId]);
    res.redirect(`/editor-full/${athleteId}#points`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

// ===============================
// Yearly seasons: add / update / delete
// ===============================
router.post("/:athleteId/yearly/add", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId } = req.params;
  const { year, closing_points, starting_points, closing_raw_points } = req.body;
  try {
    await dbRun(
      `INSERT INTO yearly_points (athlete_id, year, closing_points, starting_points, closing_raw_points)
       VALUES (?,?,?,?,?)`,
      [athleteId, year, closing_points||0, starting_points||0, closing_raw_points||0]
    );
    res.redirect(`/editor-full/${athleteId}#seasons`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

router.post("/:athleteId/yearly/:id/update", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, id } = req.params;
  const { year, closing_points, starting_points, closing_raw_points } = req.body;
  try {
    await dbRun(
      `UPDATE yearly_points
       SET year=?, closing_points=?, starting_points=?, closing_raw_points=?
       WHERE id=? AND athlete_id=?`,
      [year, closing_points||0, starting_points||0, closing_raw_points||0, id, athleteId]
    );
    res.redirect(`/editor-full/${athleteId}#seasons`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

router.post("/:athleteId/yearly/:id/delete", ensureAuthenticated, ensureAdminOrCoach, async (req, res) => {
  const { athleteId, id } = req.params;
  try {
    await dbRun(`DELETE FROM yearly_points WHERE id=? AND athlete_id=?`, [id, athleteId]);
    res.redirect(`/editor-full/${athleteId}#seasons`);
  } catch (err) {
    res.status(500).send("DB error: " + err.message);
  }
});

module.exports = router;
