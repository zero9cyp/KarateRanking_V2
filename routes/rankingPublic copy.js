const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const router = express.Router();

const db = new Database(path.join(__dirname, "../db/karate_ranking.db"));

// 🔹 Βοηθητικά
function getFilters(ageId = null) {
  const ageCategories = db.prepare("SELECT id, name FROM age_categories ORDER BY name ASC").all();
  let weightCategories = [];
  if (ageId) {
    weightCategories = db.prepare("SELECT id, name FROM weight_categories WHERE age_category_id = ? ORDER BY name ASC").all(ageId);
  }
  return { ageCategories, weightCategories };
}

// 🔹 Seasons (από το DB ή hardcoded)
function getSeasons() {
  const years = db.prepare("SELECT DISTINCT year FROM yearly_points ORDER BY year DESC").all();
  if (!years.length) return [2025, 2024];
  return years.map(y => y.year);
}

// 🏁 Αρχική
router.get("/", (req, res) => {
  const { ageCategories, weightCategories } = getFilters();
  const seasons = getSeasons();
  res.render("ranking-public", {
    title: "Δημόσια Κατάταξη",
    results: [],
    podium: [],
    selection: { event_type: "", age_id: "", weight_id: "", season: "" },
    ageCategories,
    weightCategories,
    seasons
  });
});

// 🏆 Προβολή
router.get("/view", (req, res) => {
  const event_type = req.query.type || "kumite";
  const age_id = parseInt(req.query.age_id) || null;
  const weight_id = parseInt(req.query.weight_id) || null;
  const season = parseInt(req.query.season) || 2025;

  const { ageCategories, weightCategories } = getFilters(age_id);
  const seasons = getSeasons();

  let sql = `
    SELECT 
      a.full_name,
      a.gender,
      ac.name AS age_category,
      wc.name AS weight_category,
      IFNULL(SUM(r.points_earned), 0) AS total_points
    FROM athletes a
    JOIN results r ON r.athlete_id = a.id
    LEFT JOIN age_categories ac ON ac.id = r.age_category_id
    LEFT JOIN weight_categories wc ON wc.id = r.weight_category_id
    WHERE r.event_type = ? AND r.season_year = ?
  `;
  const params = [event_type, season];

  if (age_id) { sql += " AND ac.id = ?"; params.push(age_id); }
  if (weight_id) { sql += " AND wc.id = ?"; params.push(weight_id); }

  sql += " AND r.approved = 1 GROUP BY a.id ORDER BY total_points DESC, a.full_name ASC";

  try {
    const results = db.prepare(sql).all(...params);
    const podium = results.slice(0, 3); // 🥇🥈🥉
    res.render("ranking-public", {
      title: `${event_type.toUpperCase()} Ranking`,
      results,
      podium,
      selection: { event_type, age_id, weight_id, season },
      ageCategories,
      weightCategories,
      seasons
    });
  } catch (err) {
    console.error("Error loading ranking:", err);
    res.status(500).send("Σφάλμα φόρτωσης κατάταξης.");
  }
});

module.exports = router;
