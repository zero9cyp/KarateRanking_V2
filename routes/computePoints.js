// routes/computePoints.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');
const { ensureAdmin, logAction } = require('../middleware/auth');

// computePoints implementation (similar to earlier utils but in router)
router.post('/', ensureAdmin, (req, res) => {
  const resultsQuery = `
    SELECT r.id, r.athlete_id, r.tournament_id, r.placement, r.wins, r.participated, r.countries_participated,
           t.difficulty_multiplier, t.is_international
    FROM results r
    JOIN tournaments t ON r.tournament_id = t.id
    WHERE r.approved = 0
  `;
  db.all(resultsQuery, [], (err, results) => {
    if (err) {
      req.flash('error_msg', err.message);
      return res.redirect('/ranking/preview');
    }
    if (!results || results.length === 0) {
      req.flash('success_msg', 'No unapproved results to compute.');
      return res.redirect('/ranking/preview');
    }

    // Process each result sequentially to avoid DB race conditions
    const processNext = (i) => {
      if (i >= results.length) {
        logAction(req.session.user.id, 'Computed points for results', null);
        req.flash('success_msg', 'Points computed successfully');
        return res.redirect('/ranking/preview');
      }
      const r = results[i];
      let totalPoints = 0;
      if (r.participated) totalPoints += 4;
      switch (r.placement) {
        case 1: totalPoints += 70; break;
        case 2: totalPoints += 50; break;
        case 3: totalPoints += 30; break;
        case 5: totalPoints += 20; break;
        case 7: totalPoints += 10; break;
        case 9: totalPoints += 5; break;
      }
      if (r.wins) totalPoints += r.wins * 8;
      if (r.is_international && r.countries_participated >= 3 && r.wins >= 1) totalPoints = Math.round(totalPoints * 1.2);
      if (r.difficulty_multiplier && r.difficulty_multiplier > 1) totalPoints = Math.round(totalPoints * r.difficulty_multiplier);

      // update result, athlete and points_history
      db.run(`UPDATE results SET points_earned=?, approved=1 WHERE id=?`, [totalPoints, r.id], function (err) {
        if (err) {
          // skip and continue
          return processNext(i + 1);
        }
        db.get(`SELECT total_points FROM athletes WHERE id=?`, [r.athlete_id], (err, row) => {
          const oldPts = (row && row.total_points) ? row.total_points : 0;
          const newPts = oldPts + totalPoints;
          db.run(`UPDATE athletes SET total_points=?, last_updated=? WHERE id=?`, [newPts, new Date().toISOString(), r.athlete_id], function () {
            db.run(`INSERT INTO points_history (athlete_id, date, points, reason) VALUES (?,?,?,?)`,
              [r.athlete_id, new Date().toISOString(), totalPoints, `Tournament ${r.tournament_id}`], function () {
                processNext(i + 1);
              });
          });
        });
      });
    };

    processNext(0);
  });
});

module.exports = router;