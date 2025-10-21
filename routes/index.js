const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

router.get('/', ensureAuthenticated, (req, res) => {
  const userRole = req.session.user.role;
  const currentUser = req.session.user; // ✅ Pass the logged-in user

  // Pass message as null by default
  res.render('index', { userRole, currentUser, message: null });
});

module.exports = router;
