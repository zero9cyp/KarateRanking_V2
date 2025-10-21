// middleware/auth.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

// middleware functions
function ensureAuthenticated(req, res, next) {
  if (req.session?.user) return next();
  req.flash('error_msg', 'Please log in first');
  return res.redirect('/auth/login');
}

function ensureAdmin(req, res, next) {
  if (req.session?.user && ['admin','superuser'].includes(req.session.user.role)) return next();
  req.flash('error_msg', 'Access denied');
  return res.redirect('/');
}

function ensureSuperuserOrAdmin(req,res,next){
  if(req.session?.user && ['superuser','admin'].includes(req.session.user.role)) return next();
  req.flash('error_msg','Access denied');
  return res.redirect('/');
}

function ensureAdminOrCoach(req,res,next){
  if(req.session?.user && ['admin','coach'].includes(req.session.user.role)) return next();
  req.flash('error_msg','Access denied');
  return res.redirect('/');
}

// simple logAction helper (used across app)
function logAction(adminId, action, targetUserId = null) {
  const stmt = `INSERT INTO admin_logs (admin_id, action, target_user_id) VALUES (?,?,?)`;
  db.run(stmt, [adminId, action, targetUserId], () => {});
}



module.exports = {
  ensureAuthenticated,
  ensureAdmin,
  ensureSuperuserOrAdmin,
  ensureAdminOrCoach,
  logAction
};
