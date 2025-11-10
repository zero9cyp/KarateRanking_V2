const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const router = express.Router();
const db = new Database(path.join(__dirname, "../db/karate_ranking.db"));

// 📋 View όλων των αθλητών με kumite/kata points
router.get("/", (req, res) => {
  const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : "%";
  try {
    const rows = db.prepare(`
      SELECT 
        a.id AS athlete_id,
        a.full_name,
        a.gender,
        ac.name AS age_category,
        wc.name AS weight_category,
        IFNULL(a.total_points,0) AS total_points,
        IFNULL(yk.closing_points,0) AS kumite_points,
        IFNULL(yka.closing_points,0) AS kata_points
      FROM athletes a
      LEFT JOIN age_categories ac ON ac.id = a.age_category_id
      LEFT JOIN weight_categories wc ON wc.id = a.weight_category_id
      LEFT JOIN yearly_points yk ON yk.athlete_id = a.id AND yk.year = 2025
      LEFT JOIN yearly_points yka ON yka.athlete_id = a.id AND yka.year = 2025
      WHERE LOWER(a.full_name) LIKE ?
      ORDER BY a.full_name COLLATE NOCASE;
    `).all(search);

    res.render("admin/ranking-editor", { rows, search: req.query.search || "" });
  } catch (err) {
    console.error("Error loading ranking editor:", err);
    res.status(500).send("Σφάλμα φόρτωσης ranking editor");
  }
});

// 🧾 Update athlete points (and save to history)
router.post("/update", (req, res) => {
  const { athlete_id, kumite_points, kata_points, total_points, note } = req.body;

  try {
    // 1️⃣ ενημέρωση του athlete
    db.prepare(`UPDATE athletes SET total_points=? WHERE id=?`).run(total_points, athlete_id);

    // 2️⃣ αποθήκευση ιστορικού
    db.prepare(`
      INSERT INTO points_history 
      (athlete_id, date, points_before, points_after, description, season_year) 
      VALUES (?, datetime('now'), 
              (SELECT total_points FROM athletes WHERE id=?), ?, ?, 2025)
    `).run(athlete_id, athlete_id, total_points, note || "Manual correction");

    res.redirect("/admin/ranking-editor");
  } catch (err) {
    console.error("Error updating points:", err);
    res.status(500).send("Σφάλμα ενημέρωσης πόντων.");
  }
});

module.exports = router;
