const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/karate_ranking.db");
const { ensureAuthenticated, ensureAdminOrCoach } = require("../middleware/auth");

// ===============================
// LIST ALL ATHLETES
// ===============================
router.get("/", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const sql = `
    SELECT a.id, a.full_name, a.birth_date, a.gender,
           ac.name AS age_category, ac.id AS age_category_id,
           wc.name AS weight_category, wc.id AS weight_category_id,
           c.name AS club, c.id AS club_id,
           a.total_points
    FROM athletes a
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN clubs c ON a.club_id = c.id
    ORDER BY a.full_name ASC;
  `;
  db.all(sql, [], (err, athletes) => {
    if (err) return res.send("DB error: " + err.message);

    db.all("SELECT id, name FROM clubs ORDER BY name", [], (err2, clubs) => {
      if (err2) return res.send("DB error: " + err2.message);

      db.all("SELECT id, name FROM age_categories ORDER BY min_age", [], (err3, ages) => {
        if (err3) return res.send("DB error: " + err3.message);

        db.all("SELECT id, name FROM weight_categories ORDER BY name", [], (err4, weights) => {
          if (err4) return res.send("DB error: " + err4.message);

          res.render("editor_full", { athletes, clubs, ages, weights });
        });
      });
    });
  });
});

// ===============================
// UPDATE ATHLETE INFO
// ===============================
router.post("/update", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const {
    id,
    full_name,
    birth_date,
    gender,
    age_category_id,
    weight_category_id,
    club_id,
    total_points,
  } = req.body;

  db.run(
    `UPDATE athletes
       SET full_name = ?, birth_date = ?, gender = ?, 
           age_category_id = ?, weight_category_id = ?, 
           club_id = ?, total_points = ?
     WHERE id = ?`,
    [
      full_name.trim(),
      birth_date,
      gender,
      age_category_id || null,
      weight_category_id || null,
      club_id || null,
      total_points || 0,
      id,
    ],
    (err) => {
      if (err) return res.send("Error updating athlete: " + err.message);
      res.redirect("/editor");
    }
  );
});

// ===============================
// DELETE ATHLETE
// ===============================
router.post("/delete/:id", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  db.run("DELETE FROM athletes WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.send("Error deleting athlete: " + err.message);
    res.redirect("/editor");
  });
});

// ===============================
// VIEW / EDIT RESULTS FOR ONE ATHLETE
// ===============================
// ===============================
// VIEW / EDIT RESULTS FOR ONE ATHLETE  +  ALL TOURNAMENTS LIST
// ===============================
router.get("/results/:athleteId", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const athleteId = req.params.athleteId;

  const sqlResults = `
    SELECT a.full_name, t.name AS tournament, t.id AS tournament_id, t.date,
           r.id AS result_id, r.placement, r.wins, r.points_earned
    FROM results r
    JOIN tournaments t ON r.tournament_id = t.id
    JOIN athletes a ON a.id = r.athlete_id
    WHERE a.id = ?
    ORDER BY t.date DESC;
  `;
  const sqlTournaments = `SELECT id, name, date FROM tournaments ORDER BY date DESC;`;

  db.all(sqlResults, [athleteId], (err, results) => {
    if (err) return res.send("DB error: " + err.message);
    db.all(sqlTournaments, [], (err2, tournaments) => {
      if (err2) return res.send("DB error: " + err2.message);
      res.render("editor_results", { results, athleteId, tournaments });
    });
  });
});

// ===============================
// UPDATE OR ADD RESULT
// ===============================
router.post("/results/update", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const { result_id, athlete_id, tournament_id, placement, wins, points_earned } = req.body;

  if (result_id) {
    // Update existing
    db.run(
      `UPDATE results SET tournament_id=?, placement=?, wins=?, points_earned=? WHERE id=?`,
      [tournament_id, placement || 0, wins || 0, points_earned || 0, result_id],
      (err) => {
        if (err) return res.send("Error updating result: " + err.message);
        res.redirect("back");
      }
    );
  } else {
    // Insert new
    db.run(
      `INSERT INTO results (athlete_id, tournament_id, placement, wins, points_earned)
       VALUES (?, ?, ?, ?, ?)`,
      [athlete_id, tournament_id, placement || 0, wins || 0, points_earned || 0],
      (err) => {
        if (err) return res.send("Error adding new result: " + err.message);
        res.redirect("back");
      }
    );
  }
});


module.exports = router;
