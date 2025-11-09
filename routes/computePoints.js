// routes/computePoints.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');
const { ensureAdmin } = require('../middleware/auth');
const { calculateResultPoints } = require('../utils/rankingRules');

router.post('/', ensureAdmin, (req, res) => {
  const query = `
    SELECT r.id, r.athlete_id, r.tournament_id, r.placement, r.wins, r.participated,
           r.countries_participated,
           t.tournament_type,
           t.is_international,
           t.requires_approval,
           t.difficulty_multiplier,
           t.date AS t_date
    FROM results r
    JOIN tournaments t ON r.tournament_id = t.id
    WHERE r.approved = 0
  `;

  db.all(query, [], (err, results) => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    if (!results.length) return res.redirect('/ranking/preview');

    const processNext = (i) => {
      if (i >= results.length) return res.redirect('/ranking/preview');
      const r = results[i];

      const pointsEarned = calculateResultPoints({
        placement: r.placement,
        wins: r.wins,
        participated: !!r.participated,
        tournamentType: r.tournament_type,
        isInternational: !!r.is_international,
        countriesParticipated: r.countries_participated || 0,
        federationApproved: !r.requires_approval || r.requires_approval === 0, // true αν ΔΕΝ απαιτεί έγκριση
      });

      db.run(
        `UPDATE results SET points_earned=?, approved=1 WHERE id=?`,
        [pointsEarned, r.id],
        (err1) => {
          if (err1) return processNext(i + 1);

          db.get(
            `SELECT total_points FROM athletes WHERE id=?`,
            [r.athlete_id],
            (err2, row) => {
              const oldTotal = row ? row.total_points || 0 : 0;
              const newTotal = oldTotal + pointsEarned;

              db.run(
                `UPDATE athletes SET total_points=?, last_updated=datetime('now') WHERE id=?`,
                [newTotal, r.athlete_id],
                (err3) => {
                  const seasonYear = r.t_date
                    ? new Date(r.t_date).getFullYear()
                    : new Date().getFullYear();

                  db.run(
                    `INSERT INTO points_history
                     (athlete_id, date, delta, total_after, source, description, season_year)
                     VALUES (?, datetime('now'), ?, ?, 'tournament', ?, ?)`,
                    [
                      r.athlete_id,
                      pointsEarned,
                      newTotal,
                      `Tournament #${r.tournament_id}`,
                      seasonYear,
                    ],
                    () => processNext(i + 1)
                  );
                }
              );
            }
          );
        }
      );
    };

    processNext(0);
  });
});

module.exports = router;