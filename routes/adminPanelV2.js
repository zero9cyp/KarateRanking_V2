const express = require("express");
const { dbAll, dbRun } = require("../utils/dbPromise"); // ✅ FIX: include dbRun
const router = express.Router();

router.get("/panel-v2", async (req, res) => {
  try {
    const stats = await dbAll(`
      SELECT 
        (SELECT COUNT(*) FROM athletes) AS athletes,
        (SELECT COUNT(*) FROM tournaments) AS tournaments,
        (SELECT COUNT(*) FROM results) AS results,
        (SELECT COUNT(*) FROM clubs) AS clubs
    `);

    // Get last 10 logs
    const logs = await dbAll(`
      SELECT * FROM ranking_logs
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    res.render("adminPanelV2", {
      stats: stats[0],
      logs,
      message: null,
    });
  } catch (err) {
    console.error("Admin panel failed:", err);
    res.render("adminPanelV2", { stats: {}, logs: [], message: "Database error." });
  }
});

module.exports = router;
