// routes/adminResults.js
const express = require('express');
const router = express.Router();
const { ensureAdmin } = require('../middleware/auth');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

// ---------------------------
// List all results
// ---------------------------
router.get('/', ensureAdmin, (req, res) => {
  const sql = `
    SELECT 
      r.id AS result_id,
      a.full_name,
      c.name AS club_name,
      ac.name AS age_category,
      wc.name AS weight_category,
      t.name AS tournament,
      r.placement,
      r.wins,
      r.points_earned
    FROM results r
    LEFT JOIN athletes a ON r.athlete_id = a.id
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON r.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON r.weight_category_id = wc.id
    LEFT JOIN tournaments t ON r.tournament_id = t.id
    ORDER BY t.name, a.full_name
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.render('admin/results', { results: rows });
  });
});

// ---------------------------
// Delete a result
// ---------------------------
router.post('/delete/:id', ensureAdmin, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM results WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).send(err.message);
    req.flash('success_msg', 'Result deleted successfully.');
    res.redirect('/admin/results');
  });
});

// ---------------------------
// Edit a result (GET form)
// ---------------------------
router.get('/edit/:id', ensureAdmin, (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT r.*, a.full_name, c.name AS club_name
    FROM results r
    LEFT JOIN athletes a ON r.athlete_id = a.id
    LEFT JOIN clubs c ON a.club_id = c.id
    WHERE r.id = ?
  `;
  db.get(sql, [id], (err, row) => {
    if (err) return res.status(500).send(err.message);
    if (!row) return res.status(404).send('Result not found.');
    res.render('admin/editResult', { result: row });
  });
});

// ---------------------------
// Edit a result (POST submit)
// ---------------------------
router.post('/edit/:id', ensureAdmin, (req, res) => {
  const id = req.params.id;
  const { placement, wins, points_earned } = req.body;

  db.run(
    'UPDATE results SET placement = ?, wins = ?, points_earned = ? WHERE id = ?',
    [placement || 0, wins || 0, points_earned || 0, id],
    function(err) {
      if (err) return res.status(500).send(err.message);
      req.flash('success_msg', 'Result updated successfully.');
      res.redirect('/admin/results');
    }
  );
});

// ---------------------------
// Delete all results with NULL tournament
// ---------------------------
// ---------------------------
// Bulk delete selected results
// ---------------------------
router.post('/delete-selected', ensureAdmin, (req, res) => {
  const selected = req.body.selected; // array of IDs

  if (!selected) {
    req.flash('error_msg', 'No results selected.');
    return res.redirect('/admin/results');
  }

  // Ensure selected is an array
  const ids = Array.isArray(selected) ? selected : [selected];

  const placeholders = ids.map(() => '?').join(',');
  const sql = `DELETE FROM results WHERE id IN (${placeholders})`;

  db.run(sql, ids, function(err) {
    if (err) return res.status(500).send(err.message);
    req.flash('success_msg', `Deleted ${this.changes} results successfully.`);
    res.redirect('/admin/results');
  });
});


module.exports = router;
