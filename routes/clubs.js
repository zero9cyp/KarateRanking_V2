const { logAction } = require('../utils/logger');

const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

// Middleware
function ensureSuperuserOrAdmin(req,res,next){
    if(req.session.user && ['superuser','admin'].includes(req.session.user.role)) return next();
    req.flash('error_msg','Access denied');
    res.redirect('/');
}

// -------------------------
// List all clubs
router.get('/', ensureSuperuserOrAdmin, (req,res)=>{
    db.all(`SELECT * FROM clubs ORDER BY name`, [], (err, clubs)=>{
        res.render('clubs/index', { clubs });
    });
});

// Add club form
router.get('/add', ensureSuperuserOrAdmin, (req,res)=>{
    res.render('clubs/add');
});

// Submit add club
router.post('/add', ensureSuperuserOrAdmin, (req,res)=>{
    const { name } = req.body;
    db.run(`INSERT INTO clubs (name) VALUES (?)`, [name], function(err){
        if(err) req.flash('error_msg',err.message);
        else req.flash('success_msg','Club added');
        res.redirect('/clubs');
    });
});

// Edit club form
router.get('/edit/:id', ensureSuperuserOrAdmin, (req,res)=>{
    const id = req.params.id;
    db.get(`SELECT * FROM clubs WHERE id=?`, [id], (err, club)=>{
        if(err || !club){
            req.flash('error_msg','Club not found');
            return res.redirect('/clubs');
        }
        res.render('clubs/edit',{ club });
    });
});

// Submit edit club
router.post('/edit/:id', ensureSuperuserOrAdmin, (req,res)=>{
    const id = req.params.id;
    const { name } = req.body;
    db.run(`UPDATE clubs SET name=? WHERE id=?`, [name, id], function(err){
        if(err) req.flash('error_msg',err.message);
        else req.flash('success_msg','Club updated');
        res.redirect('/clubs');
    });
});

// Delete club
router.get('/delete/:id', ensureSuperuserOrAdmin, (req,res)=>{
    const id = req.params.id;
    db.run(`DELETE FROM clubs WHERE id=?`, [id], function(err){
        if(err) req.flash('error_msg',err.message);
        else req.flash('success_msg','Club deleted');
        res.redirect('/clubs');
    });
});

// List athletes in a club
// View athletes of a club
router.get('/:id/athletes', ensureSuperuserOrAdmin, (req, res) => {
    const clubId = req.params.id;

    // First, get the club name
    db.get('SELECT * FROM clubs WHERE id = ?', [clubId], (err, club) => {
        if (err || !club) {
            req.flash('error_msg', 'Club not found');
            return res.redirect('/clubs');
        }

        // Then get all athletes in that club
        db.all(`
            SELECT a.*, ac.name as age_category_name, wc.name as weight_category_name
            FROM athletes a
            LEFT JOIN age_categories ac ON a.age_category_id = ac.id
            LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
            WHERE a.club_id = ?
            ORDER BY a.full_name
        `, [clubId], (err2, athletes) => {
            if (err2) {
                console.error(err2);
                req.flash('error_msg', 'Error loading athletes');
                return res.redirect('/clubs');
            }

            res.render('clubs/athletes', { club, athletes });
        });
    });
});


// Transfer athlete form
router.get('/:clubId/athletes/:athleteId/transfer', ensureSuperuserOrAdmin, (req,res)=>{
    const { clubId, athleteId } = req.params;
    db.all(`SELECT * FROM clubs WHERE id!=?`, [clubId], (err, clubs)=>{
        db.get(`SELECT * FROM athletes WHERE id=?`, [athleteId], (err2, athlete)=>{
            res.render('clubs/transfer',{ athlete, clubs });
        });
    });
});

// Submit transfer
router.post('/:clubId/athletes/:athleteId/transfer', ensureSuperuserOrAdmin, (req,res)=>{
    const { clubId, athleteId } = req.params;
    const { newClubId } = req.body;

    db.run(`UPDATE athletes SET club_id=? WHERE id=?`, [newClubId, athleteId], function(err){
        if(err) req.flash('error_msg',err.message);
        else req.flash('success_msg','Athlete transferred successfully');
        res.redirect(`/clubs/${newClubId}/athletes`);
    });
});

module.exports = router;
