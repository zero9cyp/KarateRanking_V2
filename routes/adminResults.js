const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const router = express.Router();

const db = new Database(path.join(__dirname, "../db/karate_ranking.db"));

// ✅ Προβολή όλων των αποτελεσμάτων
router.get("/", (req, res) => {
  const sql = `
    SELECT r.id, 
           a.full_name AS athlete_name,
           t.name AS tournament_name,
           r.event_type,
           ac.name AS age_category,
           wc.name AS weight_category,
           r.placement,
           r.wins,
           r.points_earned,
           r.season_year,
           r.approved
    FROM results r
    JOIN athletes a ON a.id = r.athlete_id
    JOIN tournaments t ON t.id = r.tournament_id
    LEFT JOIN age_categories ac ON ac.id = r.age_category_id
    LEFT JOIN weight_categories wc ON wc.id = r.weight_category_id
    ORDER BY r.season_year DESC, t.date DESC, a.full_name ASC
  `;
  const rows = db.prepare(sql).all();
  res.render("admin/results-manage", { title: "Διαχείριση Αποτελεσμάτων", rows });
});

// ✅ Ενημέρωση αποτελέσματος (θέση, πόντοι, έγκριση)
router.post("/update", (req, res) => {
  const { id, placement, wins, points_earned, approved, event_type } = req.body;
  db.prepare(`
    UPDATE results 
    SET placement=?, wins=?, points_earned=?, approved=?, event_type=?
    WHERE id=?`).run(placement, wins, points_earned, approved ? 1 : 0, event_type, id);

  res.redirect("/admin/results");
});

module.exports = router;
