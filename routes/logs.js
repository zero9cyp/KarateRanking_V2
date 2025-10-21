// routes/logs.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');
const { Parser } = require('json2csv');
const { ensureAdmin } = require('../middleware/auth');

router.get('/', ensureAdmin, (req, res) => {
  db.all(`
    SELECT l.id, l.timestamp, u.username AS admin_name, l.action, tu.username AS target_user
    FROM admin_logs l
    LEFT JOIN users u ON l.admin_id = u.id
    LEFT JOIN users tu ON l.target_user_id = tu.id
    ORDER BY l.timestamp DESC
  `, [], (err, logs) => {
    if (err) logs = [];
    res.render('logs/index', { logs });
  });
});

router.get('/download', ensureAdmin, (req, res) => {
  db.all(`
    SELECT l.timestamp, u.username AS admin_name, l.action, tu.username AS target_user
    FROM admin_logs l
    LEFT JOIN users u ON l.admin_id = u.id
    LEFT JOIN users tu ON l.target_user_id = tu.id
    ORDER BY l.timestamp DESC
  `, [], (err, logs) => {
    if (err) return res.send('Error generating CSV');
    const fields = ['timestamp', 'admin_name', 'action', 'target_user'];
    const parser = new Parser({ fields });
    const csv = parser.parse(logs);
    res.header('Content-Type', 'text/csv');
    res.attachment('admin_logs.csv');
    res.send(csv);
  });
});

module.exports = router;