const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

// Middleware για authentication
const { ensureAuthenticated, ensureAdminOrCoach } = require('../middleware/auth');

router.get('/', ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const sql = `SELECT * FROM age_categories ORDER BY min_age ASC`;
  db.all(sql, [], (err, ageCategories) => {
    if (err) {
      console.error(err);
      req.flash('error_msg', 'Σφάλμα στη βάση δεδομένων');
      return res.render('dashboard', { ageCategories: [], athletes: [] });
    }
    res.render('dashboard', { ageCategories, athletes: [] });
  });
});

// API για να φέρει αθλητές ανά ηλικιακή κατηγορία
router.get('/age/:ageCategoryId', ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const ageCategoryId = req.params.ageCategoryId;

  const sql = `
    SELECT a.id, a.full_name, a.total_points, c.name AS club_name, wc.name AS weight_category,
           tr.tournament_name, tr.date AS tournament_date, tr.placement, tr.wins, tr.participated, tr.points_earned
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN tournament_results tr ON a.id = tr.athlete_id
    WHERE a.age_category_id = ?
    ORDER BY a.full_name, tr.date DESC
  `;

  db.all(sql, [ageCategoryId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.json({ success: false, error: 'Σφάλμα στη βάση δεδομένων' });
    }

    // Ομαδοποίηση ανά αθλητή
    const athletes = {};
    rows.forEach(r => {
      if (!athletes[r.id]) {
        athletes[r.id] = {
          id: r.id,
          full_name: r.full_name,
          club_name: r.club_name,
          weight_category: r.weight_category,
          total_points: r.total_points,
          tournaments: []
        };
      }
      if (r.tournament_name) {
        athletes[r.id].tournaments.push({
          name: r.tournament_name,
          date: r.tournament_date,
          placement: r.placement,
          wins: r.wins,
          participated: r.participated,
          points_earned: r.points_earned
        });
      }
    });

    res.json({ success: true, athletes: Object.values(athletes) });
  });
});

module.exports = router;