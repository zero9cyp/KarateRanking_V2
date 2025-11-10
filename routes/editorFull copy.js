// routes/editorFull.js
const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const db = new sqlite3.Database(path.join(__dirname, "../db/karate_ranking.db"));
const { ensureAuthenticated, ensureAdminOrCoach } = require("../middleware/auth");

// ===============================
// LIST ALL ATHLETES + SEARCH
// ===============================
router.get("/", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const q = (req.query.q || "").trim();
  const params = [];
  let sql = `
    SELECT a.id, a.full_name, a.gender,
           ac.name AS age_category, wc.name AS weight_category,
           c.name AS club, a.total_points
    FROM athletes a
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN clubs c ON a.club_id = c.id
  `;

  if (q) {
    sql += ` WHERE a.full_name LIKE ? `;
    params.push(`%${q}%`);
  }

  sql += ` ORDER BY a.full_name COLLATE NOCASE;`;

  db.all(sql, params, (err, athletes) => {
    if (err) return res.status(500).send("DB error: " + err.message);
    res.render("editor_full_list", { athletes, q });
  });
});

// ===============================
// VIEW / MANAGE SINGLE ATHLETE
// ===============================
router.get("/:athleteId", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const athleteId = req.params.athleteId;

  db.run(`UPDATE athletes SET last_reviewed_at = datetime('now') WHERE id = ?`, [athleteId]);

  const sqlAthlete = `
    SELECT a.*, 
           ac.name AS age_category, wc.name AS weight_category, 
           c.name AS club
    FROM athletes a
    LEFT JOIN age_categories ac ON ac.id = a.age_category_id
    LEFT JOIN weight_categories wc ON wc.id = a.weight_category_id
    LEFT JOIN clubs c ON c.id = a.club_id
    WHERE a.id = ?;
  `;

  const sqlResults = `
    SELECT r.id, r.tournament_id, r.placement, r.wins, r.points_earned, 
           r.season_year, r.event_type,
           t.name AS tournament_name, t.date AS tournament_date
    FROM results r
    JOIN tournaments t ON t.id = r.tournament_id
    WHERE r.athlete_id = ?
    ORDER BY t.date DESC, r.id DESC;
  `;

  const sqlHistoryKata = `
    SELECT * FROM points_history
    WHERE athlete_id = ? AND discipline = 'KATA'
    ORDER BY date DESC, id DESC;
  `;

  const sqlHistoryKumite = `
    SELECT * FROM points_history
    WHERE athlete_id = ? AND discipline = 'KUMITE'
    ORDER BY date DESC, id DESC;
  `;

  const sqlYearly = `
    SELECT * FROM yearly_points
    WHERE athlete_id = ?
    ORDER BY year DESC;
  `;

  const sqlOptions = {
    clubs: `SELECT id, name FROM clubs ORDER BY name;`,
    ages: `SELECT id, name FROM age_categories ORDER BY min_age;`,
    weights: `SELECT id, name FROM weight_categories ORDER BY name;`,
    tournaments: `SELECT id, name, date FROM tournaments ORDER BY date DESC;`
  };

  db.get(sqlAthlete, [athleteId], (err, athlete) => {
    if (err) return res.status(500).send("DB error: " + err.message);
    if (!athlete) return res.status(404).send("Αθλητής δεν βρέθηκε.");

    db.all(sqlResults, [athleteId], (err2, results) => {
      if (err2) return res.status(500).send("DB error: " + err2.message);

      db.all(sqlHistoryKata, [athleteId], (err3, historyKata) => {
        if (err3) return res.status(500).send("DB error: " + err3.message);

        db.all(sqlHistoryKumite, [athleteId], (err4, historyKumite) => {
          if (err4) return res.status(500).send("DB error: " + err4.message);

          db.all(sqlYearly, [athleteId], (err5, yearlyData) => {
            if (err5) return res.status(500).send("DB error: " + err5.message);

            db.all(sqlOptions.clubs, [], (e1, clubs) => {
              if (e1) return res.status(500).send("DB error: " + e1.message);
              db.all(sqlOptions.ages, [], (e2, ages) => {
                if (e2) return res.status(500).send("DB error: " + e2.message);
                db.all(sqlOptions.weights, [], (e3, weights) => {
                  if (e3) return res.status(500).send("DB error: " + e3.message);
                  db.all(sqlOptions.tournaments, [], (e4, tournaments) => {
                    if (e4) return res.status(500).send("DB error: " + e4.message);

                    res.render("editor_full_show", {
                      athlete,
                      results,
                      historyKata,
                      historyKumite,
                      yearlyData,
                      clubs,
                      ages,
                      weights,
                      tournaments
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// ===============================
// ADD YEARLY POINTS ENTRY
// ===============================
router.post("/:athleteId/yearly/add", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const { athleteId } = req.params;
  const { year, closing_points, starting_points, closing_raw_points } = req.body;

  db.run(
    `INSERT INTO yearly_points (athlete_id, year, closing_points, starting_points, closing_raw_points)
     VALUES (?, ?, ?, ?, ?)`,
    [athleteId, year, closing_points || 0, starting_points || 0, closing_raw_points || 0],
    (err) => {
      if (err) return res.status(500).send("DB error: " + err.message);
      res.redirect(`/editor-full/${athleteId}`);
    }
  );
});

// ===============================
// UPDATE YEARLY POINTS ENTRY
// ===============================
router.post("/:athleteId/yearly/:yearId/update", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const { athleteId, yearId } = req.params;
  const { year, closing_points, starting_points, closing_raw_points } = req.body;

  db.run(
    `UPDATE yearly_points
     SET year=?, closing_points=?, starting_points=?, closing_raw_points=?
     WHERE id=? AND athlete_id=?`,
    [year, closing_points || 0, starting_points || 0, closing_raw_points || 0, yearId, athleteId],
    (err) => {
      if (err) return res.status(500).send("DB error: " + err.message);
      res.redirect(`/editor-full/${athleteId}`);
    }
  );
});

// ===============================
// DELETE YEARLY POINTS ENTRY
// ===============================
router.post("/:athleteId/yearly/:yearId/delete", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const { athleteId, yearId } = req.params;

  db.run(`DELETE FROM yearly_points WHERE id=? AND athlete_id=?`, [yearId, athleteId], (err) => {
    if (err) return res.status(500).send("DB error: " + err.message);
    res.redirect(`/editor-full/${athleteId}`);
  });
});

module.exports = router;
