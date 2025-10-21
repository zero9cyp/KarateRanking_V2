const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');
const { logAction } = require('../utils/logger');

// Middleware
function ensureAdmin(req,res,next){
    if(req.session.user && ['admin','superuser'].includes(req.session.user.role)) return next();
    req.flash('error_msg','Access denied');
    res.redirect('/');
}

// List Age Categories
router.get('/', ensureAdmin, (req,res)=>{
    db.all(`SELECT * FROM age_categories ORDER BY min_age`, [], (err, categories)=>{
        res.render('ageCategories/index', { categories });
    });
});

// Add Age Category form
router.get('/add', ensureAdmin, (req,res)=>{
    res.render('ageCategories/add');
});

// Submit Add
router.post('/add', ensureAdmin, (req,res)=>{
    const { name, min_age, max_age, notes } = req.body;
    db.run(`INSERT INTO age_categories (name,min_age,max_age,notes) VALUES (?,?,?,?)`,
        [name,min_age,max_age,notes], function(err){
            if(err) req.flash('error_msg',err.message);
            else {
                logAction(req.session.user.id, 'Added age category', this.lastID);
                req.flash('success_msg','Age category added');
            }
            res.redirect('/ageCategories');
        });
});

// Edit Age Category form
router.get('/edit/:id', ensureAdmin, (req,res)=>{
    const id = req.params.id;
    db.get(`SELECT * FROM age_categories WHERE id=?`, [id], (err, category)=>{
        if(err || !category){
            req.flash('error_msg','Category not found');
            return res.redirect('/ageCategories');
        }
        res.render('ageCategories/edit', { category });
    });
});

// Submit Edit
router.post('/edit/:id', ensureAdmin, (req,res)=>{
    const id = req.params.id;
    const { name, min_age, max_age, notes } = req.body;
    db.run(`UPDATE age_categories SET name=?, min_age=?, max_age=?, notes=? WHERE id=?`,
        [name, min_age, max_age, notes, id], function(err){
            if(err) req.flash('error_msg',err.message);
            else {
                logAction(req.session.user.id, 'Edited age category', id);
                req.flash('success_msg','Age category updated');
            }
            res.redirect('/ageCategories');
        });
});

// Delete Age Category
router.get('/delete/:id', ensureAdmin, (req,res)=>{
    const id = req.params.id;
    db.run(`DELETE FROM age_categories WHERE id=?`, [id], function(err){
        if(err) req.flash('error_msg',err.message);
        else {
            logAction(req.session.user.id, 'Deleted age category', id);
            req.flash('success_msg','Age category deleted');
        }
        res.redirect('/ageCategories');
    });
});

module.exports = router;
