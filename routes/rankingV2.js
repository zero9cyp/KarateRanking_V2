const express = require("express");
const { dbAll } = require("../utils/dbPromise");
const router = express.Router();

// /ranking-v2?season=2024
router.get("/", async (req, res) => {
  const season = parseInt(req.query.season) || 2025;

  try {
    const rows = await dbAll(
      `
      SELECT a.id, a.full_name, a.gender,
             ac.name AS age_category,
             wc.name AS weight_category,
             c.name AS club,
             IFNULL(SUM(r.points_earned),0) AS total_points
      FROM athletes a
      LEFT JOIN age_categories ac ON a.age_category_id = ac.id
      LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
      LEFT JOIN clubs c ON a.club_id = c.id
      LEFT JOIN results r
             ON r.athlete_id = a.id
            AND r.season_year = ?
      GROUP BY a.id
      ORDER BY total_points DESC, a.full_name ASC
      `,
      [season]
    );

    res.render("rankingV2", { rows, season });
  } catch (err) {
    console.error("Ranking query failed:", err);
    res.render("rankingV2", { rows: [], season, error: err.message });
  }
});

module.exports = router;
