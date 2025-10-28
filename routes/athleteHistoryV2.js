const express = require("express");
const { dbAll, dbGet } = require("../utils/dbPromise");
const router = express.Router();

router.get("/athlete/:id/history-v2", async (req, res) => {
  const athleteId = req.params.id;

  try {
    const athlete = await dbGet(
      `
      SELECT a.*, ac.name AS age_category, wc.name AS weight_category, c.name AS club
      FROM athletes a
      LEFT JOIN age_categories ac ON a.age_category_id = ac.id
      LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
      LEFT JOIN clubs c ON a.club_id = c.id
      WHERE a.id = ?
      `,
      [athleteId]
    );

    if (!athlete) {
      return res.status(404).render("404", { message: "Athlete not found" });
    }

    const history = await dbAll(
      `
      SELECT ph.date, ph.points, ph.delta, ph.reason, ph.source
      FROM points_history ph
      WHERE ph.athlete_id = ?
      ORDER BY ph.date DESC
      `,
      [athleteId]
    );

    res.render("athleteHistoryV2", { athlete, history });
  } catch (err) {
    console.error("History query failed:", err);
    res.render("athleteHistoryV2", { athlete: null, history: [], error: err.message });
  }
});

module.exports = router;
