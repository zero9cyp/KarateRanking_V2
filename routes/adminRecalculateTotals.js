// routes/adminRecalculateTotals.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');
const { ensureAdmin } = require('../middleware/auth');

// Επανυπολογισμός συνολικών πόντων για όλους τους αθλητές
router.get('/', ensureAdmin, async (req, res) => {
  try {
    // Πάρε όλους τους αθλητές
    const athletes = await new Promise((resolve, reject) => {
      db.all(`SELECT id, full_name FROM athletes`, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const athlete of athletes) {
      // Πάρε το τελευταίο total_after από το points_history
      const lastEntry = await new Promise((resolve, reject) => {
        db.get(
          `SELECT total_after FROM points_history 
           WHERE athlete_id = ? 
           ORDER BY date DESC, id DESC LIMIT 1`,
          [athlete.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (lastEntry && lastEntry.total_after !== null) {
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE athletes SET total_points = ? WHERE id = ?`,
            [lastEntry.total_after, athlete.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
    }

    res.send('✅ Ο επανυπολογισμός των πόντων ολοκληρώθηκε επιτυχώς.');
  } catch (err) {
    console.error('Recalculation failed:', err);
    res.status(500).send('Database error: ' + err.message);
  }
});

module.exports = router;
