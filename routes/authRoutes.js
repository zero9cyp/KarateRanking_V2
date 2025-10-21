// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./db/karate_ranking.db');
const { logAction } = require('../middleware/auth');

// Login form
router.get('/login', (req, res) => res.render('auth/login'));

// Login submit
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user) {
      req.flash('error_msg', 'Invalid credentials');
      return res.redirect('/auth/login');
    }
    bcrypt.compare(password, user.password, (err, match) => {
      if (match) {
        req.session.user = { id: user.id, username: user.username, role: user.role };
        logAction(user.id, 'User logged in', null);
        return res.redirect('/');
      }
      req.flash('error_msg', 'Invalid credentials');
      return res.redirect('/auth/login');
    });
  });
});

// Logout
router.get('/logout', (req, res) => {
  if (req.session.user) {
    logAction(req.session.user.id, 'User logged out', null);
    req.session.destroy(() => res.redirect('/auth/login'));
  } else res.redirect('/auth/login');
});

// Register form
router.get('/register', (req, res) => res.render('auth/register'));

// Register submit
router.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    req.flash('error_msg', 'All fields required');
    return res.redirect('/auth/register');
  }
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      req.flash('error_msg', 'Error creating user');
      return res.redirect('/auth/register');
    }
    db.run(`INSERT INTO users (username, password, role, is_active) VALUES (?,?,?,1)`,
      [username, hash, role], function (dbErr) {
        if (dbErr) {
          req.flash('error_msg', 'Username already exists or DB error');
          return res.redirect('/auth/register');
        }
        logAction(this.lastID, 'User registered', null);
        req.flash('success_msg', 'User registered. Please login.');
        return res.redirect('/auth/login');
      });
  });
});

// router.get('/logout', (req, res) => {
//   req.session.destroy(err => {
//     if (err) console.log(err);
//     res.redirect('/login');
//   });
// });
// routes/authRoutes.js (example)
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.redirect('/'); // fallback in case of error
    res.clearCookie('connect.sid'); // optional, clears session cookie
    res.redirect('/'); // <-- make sure this is a valid route, like your dashboard
  });
});

module.exports = router;