const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

// Middleware για authentication
const { ensureAuthenticated, ensureAdminOrCoach } = require('../middleware/auth');

router.get('/', ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  db.all(`SELECT * FROM age_categories ORDER BY min_age ASC`, [], (err, ageCategories) => {
    if (err) {
      console.error(err);
      return res.render('dashboard', { ageCategories: [], athletes: [] });
    }
    res.render('dashboard', { ageCategories, athletes: [] });
  });
});

router.get('/age/:ageCategoryId', ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const ageCategoryId = req.params.ageCategoryId;

  const sql = `
    SELECT a.id AS athlete_id, a.full_name, a.total_points, c.name AS club_name,
           wc.name AS weight_category,
           r.tournament_id, t.name AS tournament_name, t.date AS tournament_date,
           r.placement, r.wins, r.participated, r.points_earned
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN results r ON a.id = r.athlete_id
    LEFT JOIN tournaments t ON r.tournament_id = t.id
    WHERE a.age_category_id = ?
    ORDER BY a.full_name, t.date DESC
  `;

  db.all(sql, [ageCategoryId], (err, rows) => {
    if (err) return res.json({ success: false, error: err.message });

    const athletesMap = {};
    rows.forEach(row => {
      if (!athletesMap[row.athlete_id]) {
        athletesMap[row.athlete_id] = {
          id: row.athlete_id,
          full_name: row.full_name,
          club_name: row.club_name,
          weight_category: row.weight_category,
          total_points: row.total_points,
          tournaments: []
        };
      }
      if (row.tournament_id) {
        athletesMap[row.athlete_id].tournaments.push({
          tournament_id: row.tournament_id,
          name: row.tournament_name,
          date: row.tournament_date,
          placement: row.placement,
          wins: row.wins,
          participated: row.participated,
          points_earned: row.points_earned
        });
      }
    });

    res.json({ success: true, athletes: Object.values(athletesMap) });
  });
});


module.exports = router;