const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../db/karate_ranking.db'));

// GET /ranking
router.get('/', (req, res) => {
  // Extract filters from query
  const filters = {
    gender: req.query.gender || '',
    age_category_id: req.query.age_category_id || '',
    weight_category_id: req.query.weight_category_id || '',
    club_id: req.query.club_id || ''
  };

  // Base SQL
  let sql = `
    SELECT a.*, c.name AS club_name, ac.name AS age_category_name, wc.name AS weight_category_name
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    WHERE 1=1
  `;
  const params = [];

  // Apply filters
  if (filters.gender) { sql += ' AND a.gender = ?'; params.push(filters.gender); }
  if (filters.age_category_id) { sql += ' AND a.age_category_id = ?'; params.push(filters.age_category_id); }
  if (filters.weight_category_id) { sql += ' AND a.weight_category_id = ?'; params.push(filters.weight_category_id); }
  if (filters.club_id) { sql += ' AND a.club_id = ?'; params.push(filters.club_id); }

  sql += ' ORDER BY a.total_points DESC';

  db.all(sql, params, (err, athletes) => {
    if (err) return console.error(err);

    // Fetch filter dropdown data
    db.all('SELECT * FROM age_categories ORDER BY min_age', (err1, ageCategories) => {
      db.all('SELECT * FROM weight_categories ORDER BY name', (err2, weightCategories) => {
        db.all('SELECT * FROM clubs ORDER BY name', (err3, clubs) => {
          res.render('ranking/index', {
            athletes,
            filters,
            ageCategories,
            weightCategories,
            clubs
          });
        });
      });
    });
  });
});

// Preview ranking for a given year
router.get('/preview/:year', (req, res) => {
  const year = parseInt(req.params.year);

  const sql = `
    SELECT a.*, c.name AS club_name, ac.name AS age_category_name, wc.name AS weight_category_name
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    ORDER BY a.total_points DESC
  `;

  db.all(sql, [], (err, athletes) => {
    if (err) return console.error(err);

    // Build the "preview" object
    const preview = athletes.map(a => {
      return {
        full_name: a.full_name,
        totalPoints: a.total_points || 0,
        lastYearPoints: Math.floor(a.total_points * 0.5), // example previous year
        thisYearPoints: a.total_points, // this year
        warnings: [], // populate later if needed
        tournamentDetails: [] // populate from tournaments table if available
      };
    });

    res.render('ranking/preview', {
      year,
      preview,
      currentUser: req.user || null // if using authentication
    });
  });
});


module.exports = router;
