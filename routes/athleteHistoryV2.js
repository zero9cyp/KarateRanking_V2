// routes/athleteHistoryV2.js
const express = require("express");
const router = express.Router();
const { dbAll, dbGet, dbRun } = require("../utils/dbPromise");

// ===============================
// View athlete's full point history
// ===============================
router.get("/:id/history-v2", async (req, res) => {
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
    if (!athlete)
      return res.status(404).render("404", { message: "Αθλητής δεν βρέθηκε." });

    // 1️⃣ Manual points history
    const manual = await dbAll(
      `
      SELECT 
        ph.id,
        ph.date,
        ph.points_before,
        ph.points_after,
        (ph.points_after - ph.points_before) AS change,
        ph.description AS reason,
        'manual' AS source
      FROM points_history ph
      WHERE ph.athlete_id = ?
      `,
      [athleteId]
    );

    // 2️⃣ Tournament results (earned points)
    const tournaments = await dbAll(
      `
      SELECT 
        r.id,
        t.date,
        r.points_earned AS change,
        NULL AS points_before,
        NULL AS points_after,
        t.name AS reason,
        'tournament' AS source
      FROM results r
      JOIN tournaments t ON r.tournament_id = t.id
      WHERE r.athlete_id = ? AND r.points_earned IS NOT NULL
      `,
      [athleteId]
    );

    // 3️⃣ Yearly points (closing/starting)
    const yearly = await dbAll(
      `
      SELECT 
        y.id,
        datetime(y.year || '-01-01') AS date,
        (y.starting_points - y.closing_points) AS change,
        y.closing_points AS points_before,
        y.starting_points AS points_after,
        'Μεταφορά περιόδου ' || (y.year - 1) || '→' || y.year AS reason,
        'yearly' AS source
      FROM yearly_points y
      WHERE y.athlete_id = ?
      `,
      [athleteId]
    );

    // Combine all sources
    const history = [...manual, ...tournaments, ...yearly].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    res.render("athletes/athleteHistoryV2", {
      athlete,
      history,
      error: null,
    });
  } catch (err) {
    console.error("Combined history query failed:", err);
    res.render("athletes/athleteHistoryV2", {
      athlete: null,
      history: [],
      error: err.message,
    });
  }
});

// ===============================
// Add manual history entry
// ===============================
router.post("/athlete/:id/history-v2/add", async (req, res) => {
  const athleteId = req.params.id;
  const { points_before, points_after, description, season_year } = req.body;

  try {
    await dbRun(
      `
      INSERT INTO points_history 
        (athlete_id, date, points_before, points_after, description, season_year)
      VALUES (?, datetime('now'), ?, ?, ?, ?)
      `,
      [athleteId, points_before, points_after, description || null, season_year || 2025]
    );

    // Update athlete total points
    await dbRun(`UPDATE athletes SET total_points = ? WHERE id = ?`, [
      points_after,
      athleteId,
    ]);

    res.redirect(`/athlete/${athleteId}/history-v2`);
  } catch (err) {
    console.error("Add history failed:", err);
    res.status(500).send("Database error: " + err.message);
  }
});

// ===============================
// Delete a single entry
// ===============================
router.post("/athlete/:athleteId/history-v2/delete/:entryId", async (req, res) => {
  const { athleteId, entryId } = req.params;

  try {
    // Get entry to determine points change
    const entry = await dbGet(`SELECT points_after FROM points_history WHERE id = ?`, [entryId]);

    // Delete the record
    await dbRun(`DELETE FROM points_history WHERE id = ?`, [entryId]);

    // Recalculate total from last entry (optional)
    const last = await dbGet(
      `SELECT points_after FROM points_history WHERE athlete_id = ? ORDER BY date DESC LIMIT 1`,
      [athleteId]
    );
    if (last) {
      await dbRun(`UPDATE athletes SET total_points = ? WHERE id = ?`, [
        last.points_after,
        athleteId,
      ]);
    }

    res.redirect(`/athlete/${athleteId}/history-v2`);
  } catch (err) {
    console.error("Delete history failed:", err);
    res.status(500).send("Database error: " + err.message);
  }
});

// ===============================
// Edit an existing manual entry
// ===============================
router.post("/athlete/:athleteId/history-v2/edit/:entryId", async (req, res) => {
  const { athleteId, entryId } = req.params;
  const { points_before, points_after, description, season_year } = req.body;

  try {
    await dbRun(
      `
      UPDATE points_history
      SET points_before = ?, points_after = ?, description = ?, season_year = ?, date = datetime('now')
      WHERE id = ? AND athlete_id = ?
      `,
      [points_before, points_after, description, season_year, entryId, athleteId]
    );

    // Update athlete's total points (to match last history record)
    const last = await dbGet(
      `SELECT points_after FROM points_history WHERE athlete_id = ? ORDER BY date DESC LIMIT 1`,
      [athleteId]
    );
    if (last) {
      await dbRun(`UPDATE athletes SET total_points = ? WHERE id = ?`, [
        last.points_after,
        athleteId,
      ]);
    }

    res.redirect(`/athlete/${athleteId}/history-v2`);
  } catch (err) {
    console.error("Edit history failed:", err);
    res.status(500).send("Database error: " + err.message);
  }
});


module.exports = router;
