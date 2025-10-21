const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

router.get('/', ensureAuthenticated, (req, res) => {
  const userRole = req.session.user.role;
  const currentUser = req.session.user; // ✅ Pass the logged-in user

  // Pass message as null by default
  res.render('index', { userRole, currentUser, message: null });
});

// routes/authRoutes.js (example)
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.redirect('/'); // fallback in case of error
    res.clearCookie('connect.sid'); // optional, clears session cookie
    res.redirect('/'); // <-- make sure this is a valid route, like your dashboard
  });
});


module.exports = router;
