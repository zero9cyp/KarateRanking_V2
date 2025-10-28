const express = require("express");
const { dbAll, dbRun } = require("../utils/dbPromise");
const router = express.Router();

function getMultiplier(tournamentType) {
  switch (tournamentType?.toUpperCase()) {
    case "NATIONAL_CHAMPIONSHIP": return 1.0;
    case "NATIONAL": return 0.8;
    case "INTERNATIONAL": return 1.1;
    case "EUROPEAN": return 1.2;
    default: return 1.0;
  }
}

function getPlacementPoints(place) {
  if (place === 1) return 30;
  if (place === 2) return 21;
  if (place === 3) return 12;
  if (place === 5) return 6;
  return 2;
}

router.post("/admin/recalculate-v2", async (req, res) => {
  try {
    await dbRun("UPDATE athletes SET total_points = 0");
    await dbRun("DELETE FROM points_history WHERE source='system'");

    const results = await dbAll(`
      SELECT r.*, t.tournament_type, t.name AS tournament_name
      FROM results r
      LEFT JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.approved = 1
    `);

    for (const r of results) {
      const multiplier = getMultiplier(r.tournament_type);
      const base = getPlacementPoints(r.placement);
      const winsBonus = (r.wins || 0) * 2;
      const penalties = r.penalty_points || 0;
      const participation = r.participated ? 1 : 0;

      const carryReduction = r.approved_up_age === 1 ? 1.0 : 0.5;
      const rawPoints = (base + winsBonus + participation) * carryReduction - penalties;
      const pointsEarned = rawPoints * multiplier;

      await dbRun(
        `UPDATE results SET raw_points=?, points_earned=? WHERE id=?`,
        [rawPoints, pointsEarned, r.id]
      );

      await dbRun(
        `INSERT INTO points_history (athlete_id, date, points, delta, reason, source)
         VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, 'system')`,
        [
          r.athlete_id,
          pointsEarned,
          pointsEarned,
          `${r.tournament_name} (${r.tournament_type})`,
        ]
      );

      await dbRun(
        `UPDATE athletes SET total_points = total_points + ? WHERE id=?`,
        [pointsEarned, r.athlete_id]
      );
    }

    res.json({ success: true, recalculated: results.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
