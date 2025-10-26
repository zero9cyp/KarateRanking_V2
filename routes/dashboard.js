const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

const { ensureAuthenticated, ensureAdminOrCoach } = require('../middleware/auth');

// -----------------------------
// Dashboard main view
// -----------------------------
router.get('/', ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  db.all(`SELECT * FROM age_categories ORDER BY min_age ASC`, [], (err, ageCategories) => {
    if (err) {
      console.error(err);
      return res.render('dashboard', { ageCategories: [], athletes: [] });
    }
    res.render('dashboard', { ageCategories, athletes: [] });
  });
});

// -----------------------------
// Multi-age category API
// -----------------------------
router.get('/age-multiple/:ageCategoryIds', ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const ageIds = req.params.ageCategoryIds.split(',').map(id => id.trim());
  let params = [];
  let whereClause = '';

  if (!(ageIds.length === 1 && ageIds[0] === 'all')) {
    whereClause = 'WHERE a.age_category_id IN (' + ageIds.map(() => '?').join(',') + ')';
    params = ageIds;
  }

  // --- 1️⃣ Query athletes & their results
  const sqlAthletes = `
    SELECT 
      a.id AS athlete_id, 
      a.full_name, 
      a.total_points, 
      c.name AS club_name,
      wc.name AS weight_category,
      r.tournament_id, 
      t.name AS tournament_name, 
      t.date AS tournament_date,
      r.placement, 
      r.wins, 
      r.participated, 
      r.points_earned
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN results r ON a.id = r.athlete_id
    LEFT JOIN tournaments t ON r.tournament_id = t.id
    ${whereClause}
    ORDER BY a.full_name, t.date DESC
  `;

  // --- 2️⃣ Query all tournaments (so dashboard shows them even if empty)
  const sqlTournaments = `
    SELECT id, name, date 
    FROM tournaments 
    ORDER BY date DESC, name ASC
  `;

  db.all(sqlAthletes, params, (err, athleteRows) => {
    if (err) return res.json({ success: false, error: err.message });

    db.all(sqlTournaments, [], (err2, tournaments) => {
      if (err2) return res.json({ success: false, error: err2.message });

      // Build athlete + tournaments data
      const athletesMap = {};
      athleteRows.forEach(row => {
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

      // Response includes both: athlete data + all tournaments (for UI completeness)
      res.json({
        success: true,
        tournaments, // full list, even those with no results
        athletes: Object.values(athletesMap)
      });
    });
  });
});

module.exports = router;
