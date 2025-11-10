// routes/editor
const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/karate_ranking.db");
const { ensureAuthenticated, ensureAdminOrCoach } = require("../middleware/auth");

// =====================================================
// LIST ALL ATHLETES (with filter by review_status)
// =====================================================
router.get("/", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  let sql = `
    SELECT a.id, a.full_name, a.gender,
           ac.name AS age_category,
           wc.name AS weight_category,
           c.name AS club,
           a.total_points,
           a.review_status,
           a.last_reviewed_at
    FROM athletes a
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN clubs c ON a.club_id = c.id
  `;
  const params = [];

  if (req.query.status) {
    sql += " WHERE a.review_status = ?";
    params.push(req.query.status);
  }
  sql += " ORDER BY a.full_name ASC";

  db.all(sql, params, (err, athletes) => {
    if (err) return res.status(500).send("DB error: " + err.message);
    res.render("editor_full", { athletes, filter: req.query.status || "" });
  });
});

// =====================================================
// UPDATE ATHLETE INFO
// =====================================================
router.get("/:athleteId", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const athleteId = req.params.athleteId;

  db.run(`UPDATE athletes SET last_reviewed_at=datetime('now') WHERE id=?`, [athleteId]);

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
    SELECT r.id, r.tournament_id, r.placement, r.wins, r.points_earned, r.season_year,
           t.name AS tournament_name, t.date AS tournament_date
    FROM results r
    JOIN tournaments t ON t.id = r.tournament_id
    WHERE r.athlete_id = ?
    ORDER BY t.date DESC, r.id DESC;
  `;

  const sqlHistory = `
    SELECT id, date, points_before, points_after, 
           COALESCE(points_after - points_before, 0) AS delta,
           COALESCE(total_after, points_after) AS total_after,
           season_year, description
    FROM points_history
    WHERE athlete_id = ?
    ORDER BY date DESC, id DESC;
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

      db.all(sqlHistory, [athleteId], (err3, history) => {
        if (err3) return res.status(500).send("DB error: " + err3.message);

        // 👇 Δεν υπάρχει event_type, οπότε ορίζουμε απλά
        const historyKumite = history;
        const historyKata = [];

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
                  history,
                  historyKumite,
                  historyKata,
                  yearlyData: [],   // ✅ add this line so the EJS always has it
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



// =====================================================
// DELETE ATHLETE
// =====================================================
router.post("/delete/:id", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  db.run("DELETE FROM athletes WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.send("Error deleting athlete: " + err.message);
    res.redirect("/editor");
  });
});

// =====================================================
// VIEW DETAILED ATHLETE PAGE
// =====================================================
router.get("/:athleteId", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const athleteId = req.params.athleteId;
  const historyKumite = history || [];
  const historyKata = [];

  db.run(`UPDATE athletes SET last_reviewed_at=datetime('now') WHERE id=?`, [athleteId]);

  const sqlAthlete = `
    SELECT a.*, ac.name AS age_category, wc.name AS weight_category, c.name AS club
    FROM athletes a
    LEFT JOIN age_categories ac ON ac.id=a.age_category_id
    LEFT JOIN weight_categories wc ON wc.id=a.weight_category_id
    LEFT JOIN clubs c ON c.id=a.club_id
    WHERE a.id=?;
  `;
  const sqlResults = `
    SELECT r.id, r.tournament_id, r.placement, r.wins, r.points_earned, r.season_year,
           t.name AS tournament_name, t.date AS tournament_date
    FROM results r
    JOIN tournaments t ON t.id = r.tournament_id
    WHERE r.athlete_id=?
    ORDER BY t.date DESC, r.id DESC;
  `;
  const sqlHistory = `
    SELECT id, date, points_before, points_after,
           COALESCE(points_after - points_before, 0) AS delta,
           COALESCE(total_after, points_after) AS total_after,
           season_year, description
    FROM points_history
    WHERE athlete_id=?
    ORDER BY date DESC, id DESC;
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
      db.all(sqlHistory, [athleteId], (err3, history) => {
        if (err3) return res.status(500).send("DB error: " + err3.message);
        db.all(sqlOptions.clubs, [], (e1, clubs) => {
          db.all(sqlOptions.ages, [], (e2, ages) => {
            db.all(sqlOptions.weights, [], (e3, weights) => {
              db.all(sqlOptions.tournaments, [], (e4, tournaments) => {
                res.render("editor_full_show", {
                  athlete, results, history, historyKumite, historyKata, clubs, ages, weights, tournaments
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
// UPDATE REVIEW STATUS (OK / ISSUE / PENDING)
// ===============================
router.post("/review-status/:id", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const { status } = req.body;
  const id = req.params.id;

  if (!["ok", "issue", "pending"].includes(status)) {
    return res.status(400).send("Invalid status value");
  }

  db.run(
    `UPDATE athletes 
     SET review_status = ?, last_reviewed_at = datetime('now')
     WHERE id = ?`,
    [status, id],
    (err) => {
      if (err) return res.status(500).send("DB error: " + err.message);
      res.redirect("/editor/" + id);
    }
  );
});


module.exports = router;
