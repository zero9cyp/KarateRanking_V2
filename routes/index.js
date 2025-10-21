const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureAdmin, ensureAdminOrCoach } = require('../middleware/auth');

router.get('/', ensureAuthenticated, (req, res) => {
  const userRole = req.session.user.role;

  res.render('index', { userRole });
});

module.exports = router;