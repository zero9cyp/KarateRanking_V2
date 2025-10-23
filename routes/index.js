const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const currentUser = req.session.user;
  res.render('index', {
    currentUser,
    userRole: currentUser ? currentUser.role : null,
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg')
  });
});

module.exports = router;
