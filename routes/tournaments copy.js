const { logAction } = require('../utils/logger');

const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

// Middleware
function ensureAuthenticated(req, res, next) {
    if (req.session.user) return next();
    req.flash('error_msg', 'Please log in first');
    res.redirect('/auth/login');
}

function ensureAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') return next();
    req.flash('error_msg', 'Access denied');
    res.redirect('/');
}

function ensureAdminOrCoach(req, res, next) {
    if (req.session.user && ['admin','coach'].includes(req.session.user.role)) return next();
    req.flash('error_msg', 'Access denied');
    res.redirect('/');
}

// -------------------------
// List tournaments
router.get('/', ensureAuthenticated, (req, res) => {
    db.all(`SELECT * FROM tournaments ORDER BY date DESC`, [], (err, rows) => {
        res.render('tournaments/list', { tournaments: rows });
    });
});

// Add tournament form
router.get('/add', ensureAdmin, (req, res) => {
    res.render('tournaments/add');
});

// Submit add tournament
router.post('/add', ensureAdmin, (req, res) => {
    const { name, date, location, type, difficulty_multiplier, is_international, requires_approval } = req.body;
    const stmt = `INSERT INTO tournaments 
        (name,date,location,type,difficulty_multiplier,is_international,requires_approval)
        VALUES (?,?,?,?,?,?,?)`;
    db.run(stmt, [name, date, location, type, difficulty_multiplier || 1, is_international || 0, requires_approval || 0], function(err){
        if(err) req.flash('error_msg', err.message);
        else req.flash('success_msg','Tournament added!');
        res.redirect('/tournaments');
    });
});

// Edit tournament form
router.get('/edit/:id', ensureAdmin, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM tournaments WHERE id=?`, [id], (err, tournament) => {
        if(err || !tournament){
            req.flash('error_msg','Tournament not found');
            return res.redirect('/tournaments');
        }
        res.render('tournaments/edit',{ tournament });
    });
});

// Submit edit tournament
router.post('/edit/:id', ensureAdmin, (req, res) => {
    const id = req.params.id;
    const { name, date, location, type, difficulty_multiplier, is_international, requires_approval } = req.body;
    const stmt = `UPDATE tournaments SET name=?, date=?, location=?, type=?, difficulty_multiplier=?, is_international=?, requires_approval=? WHERE id=?`;
    db.run(stmt, [name, date, location, type, difficulty_multiplier || 1, is_international || 0, requires_approval || 0, id], function(err){
        if(err) req.flash('error_msg', err.message);
        else req.flash('success_msg','Tournament updated!');
        res.redirect('/tournaments');
    });
});

// Delete tournament
router.post('/delete/:id', ensureAdmin, (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM tournaments WHERE id=?`, [id], function(err){
        if(err) req.flash('error_msg', err.message);
        else req.flash('success_msg','Tournament deleted');
        res.redirect('/tournaments');
    });
});

// Registration form
router.get('/:tournamentId/register', ensureAuthenticated, (req, res) => {
  const tournamentId = parseInt(req.params.tournamentId, 10);

  db.get(`SELECT * FROM tournaments WHERE id = ?`, [tournamentId], (err, tournament) => {
    if (err || !tournament) {
      req.flash('error_msg', 'Tournament not found');
      return res.redirect('/tournaments');
    }

    db.all(`
      SELECT a.id, a.full_name, a.birth_date, ac.min_age, ac.max_age
      FROM athletes a
      LEFT JOIN age_categories ac ON a.age_category_id = ac.id
      LEFT JOIN tournament_registrations tr 
        ON tr.athlete_id = a.id AND tr.tournament_id = ?
      WHERE tr.id IS NULL
      ORDER BY a.full_name
    `, [tournamentId], (err2, athletes) => {
      if (err2) {
        console.error(err2);
        req.flash('error_msg', 'Error loading athletes');
        return res.redirect('/tournaments');
      }

      const today = new Date();
      athletes.forEach(a => {
        const age = today.getFullYear() - new Date(a.birth_date).getFullYear();
        let status = 'red'; // default can't fight

        if (age >= a.min_age && age <= a.max_age) status = 'green'; // perfect fit
        else if (age >= a.min_age - 2 && age <= a.max_age + 2) status = 'yellow'; // 2 years margin

        a.status = status;
        a.age = age;
      });

      res.render('tournaments/register_multi', { tournament, athletes });
    });
  });
});

// Submit registration
router.post('/:tournamentId/register-multi', ensureAuthenticated, (req, res) => {
  const tournamentId = req.params.tournamentId;
  let athleteIds = req.body.athlete_ids;

  if (!athleteIds) {
    req.flash('error_msg', 'No athletes selected');
    return res.redirect(`/tournaments/${tournamentId}/register`);
  }

  // Ensure athleteIds is always an array
  if (!Array.isArray(athleteIds)) athleteIds = [athleteIds];

  db.serialize(() => { // serialize ensures safe sequential execution
    const stmt = db.prepare(`INSERT OR IGNORE INTO tournament_registrations (tournament_id, athlete_id) VALUES (?, ?)`);

    athleteIds.forEach(id => {
      stmt.run([tournamentId, id]);
    });

    stmt.finalize(err => {
      if (err) {
        console.error(err);
        req.flash('error_msg', 'Database error during registration');
      } else {
        req.flash('success_msg', 'Athletes registered successfully');
      }
      res.redirect(`/tournaments/${tournamentId}/register`);
    });
  });
});

// Approvals list
router.get('/:tournamentId/approvals', ensureAdminOrCoach, (req, res) => {
  const tournamentId = req.params.tournamentId;

  db.get(`SELECT * FROM tournaments WHERE id = ?`, [tournamentId], (err, tournament) => {
    if (err || !tournament) {
      req.flash('error_msg', 'Tournament not found');
      return res.redirect('/tournaments');
    }

    db.all(
      `SELECT r.id, r.athlete_id, a.full_name, r.approved
       FROM tournament_registrations r
       JOIN athletes a ON r.athlete_id = a.id
       WHERE r.tournament_id = ?`,
      [tournamentId],
      (err2, rows) => {
        if (err2) {
          console.error(err2);
          req.flash('error_msg', 'Database error loading approvals');
          return res.redirect('/tournaments');
        }

        res.render('tournaments/approvals', {
          tournament,
          registrations: rows || [] // 👈 always pass an array
        });
      }
    );
  });
});

// Approve athlete
router.post('/:tournamentId/approve/:athleteId', ensureAdminOrCoach, (req,res)=>{
    const { tournamentId, athleteId } = req.params;
    db.run(`UPDATE tournament_registrations SET approved=1 WHERE tournament_id=? AND athlete_id=?`, [tournamentId, athleteId], (err)=>{
        if(err) req.flash('error_msg', err.message);
        else req.flash('success_msg','Athlete approved');
        res.redirect(`/tournaments/${tournamentId}/approvals`);
    });
});

// Reject athlete
router.post('/:tournamentId/reject/:athleteId', ensureAdminOrCoach, (req,res)=>{
    const { tournamentId, athleteId } = req.params;
    db.run(`DELETE FROM tournament_registrations WHERE tournament_id=? AND athlete_id=?`, [tournamentId, athleteId], (err)=>{
        if(err) req.flash('error_msg', err.message);
        else req.flash('success_msg','Athlete rejected');
        res.redirect(`/tournaments/${tournamentId}/approvals`);
    });
});

// List athletes for override
// List athletes for override
// List athletes for override with color coding
router.get('/:tournamentId/registrations', ensureAdminOrCoach, (req, res) => {
    const tournamentId = req.params.tournamentId;

    db.get(`SELECT * FROM tournaments WHERE id = ?`, [tournamentId], (err, tournament) => {
        if (err || !tournament) {
            req.flash('error_msg', 'Tournament not found');
            return res.redirect('/tournaments');
        }

        db.all(`
            SELECT r.id, r.athlete_id, a.full_name, r.override_allowed, r.approved, a.birth_date, ac.min_age, ac.max_age
            FROM tournament_registrations r
            JOIN athletes a ON r.athlete_id = a.id
            LEFT JOIN age_categories ac ON a.age_category_id = ac.id
            WHERE r.tournament_id = ?
            ORDER BY a.full_name
        `, [tournamentId], (err2, rows) => {
            if (err2) {
                console.error(err2);
                req.flash('error_msg', 'Database error loading registrations');
                return res.redirect('/tournaments');
            }

            // Προσθήκη χρώματος ανάλογα με την κατάσταση
            const today = new Date();
            rows.forEach(a => {
                const age = today.getFullYear() - new Date(a.birth_date).getFullYear();
                a.age = age;
                if (a.override_allowed) a.status = 'green';
                else if (age >= a.min_age - 2 && age <= a.max_age + 2) a.status = 'yellow';
                else a.status = 'red';
            });

            res.render('tournaments/override', { tournament, registrations: rows || [] });
        });
    });
});

// Apply override
router.post('/:tournamentId/override/:athleteId', ensureAdminOrCoach, (req,res)=>{
    const { tournamentId, athleteId } = req.params;
    db.run(`UPDATE tournament_registrations SET override_allowed=1 WHERE tournament_id=? AND athlete_id=?`, [tournamentId, athleteId], (err)=>{
        if(err) req.flash('error_msg', err.message);
        else req.flash('success_msg','Override applied');
        res.redirect(`/tournaments/${tournamentId}/registrations`);
    });
});


// Apply override
router.post('/:tournamentId/override/:athleteId', ensureAdminOrCoach, (req,res)=>{
    const { tournamentId, athleteId } = req.params;
    db.run(`UPDATE tournament_registrations SET override_allowed=1 WHERE tournament_id=? AND athlete_id=?`, [tournamentId, athleteId], (err)=>{
        if(err) req.flash('error_msg', err.message);
        else req.flash('success_msg','Override applied');
        res.redirect(`/tournaments/${tournamentId}/registrations`);
    });
});

// 🟩 View participants (approved athletes)
// 🟩 View participants (approved athletes)
router.get('/:tournamentId/participants', ensureAuthenticated, (req, res) => {
  const tournamentId = req.params.tournamentId;

  db.get(`SELECT * FROM tournaments WHERE id = ?`, [tournamentId], (err, tournament) => {
    if (err || !tournament) {
      req.flash('error_msg', 'Tournament not found');
      return res.redirect('/tournaments');
    }

    const sql = `
      SELECT r.id AS registration_id, a.full_name, a.gender, ac.name AS age_category,
             wc.name AS weight_category, c.name AS club_name
      FROM tournament_registrations r
      JOIN athletes a ON r.athlete_id = a.id
      LEFT JOIN age_categories ac ON a.age_category_id = ac.id
      LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
      LEFT JOIN clubs c ON a.club_id = c.id
      WHERE r.tournament_id = ? AND r.approved = 1
      ORDER BY a.gender, a.full_name
    `;

    db.all(sql, [tournamentId], (err2, participants) => {
      if (err2) {
        console.error(err2);
        req.flash('error_msg', 'Error loading participants');
        return res.redirect('/tournaments');
      }

      res.render('tournaments/participants', { tournament, participants });
    });
  });
});

// Delete a participant from a tournament
router.post('/:tournamentId/participants/delete/:participantId', ensureAdminOrCoach, (req, res) => {
  const { tournamentId, participantId } = req.params;
  const sql = `DELETE FROM tournament_registrations WHERE id = ? AND tournament_id = ?`;
  db.run(sql, [participantId, tournamentId], function(err) {
    if (err) {
      console.error(err);
      req.flash('error_msg', 'Error deleting participant');
    } else {
      req.flash('success_msg', 'Participant deleted successfully');
    }
    res.redirect(`/tournaments/${tournamentId}/participants`);
  });
});

// Delete multiple participants from a tournament
router.post('/:tournamentId/participants/delete-multi', ensureAdminOrCoach, (req, res) => {
  const { tournamentId } = req.params;
  let registrationIds = req.body.registration_ids;

  if (!registrationIds) {
    req.flash('error_msg', 'No participants selected');
    return res.redirect(`/tournaments/${tournamentId}/participants`);
  }

  if (!Array.isArray(registrationIds)) registrationIds = [registrationIds];

  const placeholders = registrationIds.map(() => '?').join(',');
  const sql = `DELETE FROM tournament_registrations WHERE id IN (${placeholders}) AND tournament_id = ?`;

  db.run(sql, [...registrationIds, tournamentId], function(err) {
    if (err) {
      console.error(err);
      req.flash('error_msg', 'Error deleting participants');
    } else {
      req.flash('success_msg', 'Selected participants deleted successfully');
    }
    res.redirect(`/tournaments/${tournamentId}/participants`);
  });
});


module.exports = router;
