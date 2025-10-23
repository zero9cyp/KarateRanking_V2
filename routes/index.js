const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

router.get('/', ensureAuthenticated, (req, res) => {
  const currentUser = req.session.user;
  res.render('index', {
    currentUser,
    userRole: currentUser ? currentUser.role : null,
    success_msg: req.flash('success_msg') || [],
    error_msg: req.flash('error_msg') || []
  });
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
