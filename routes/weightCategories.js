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

// List Weight Categories
router.get('/', ensureAdmin, (req,res)=>{
    db.all(`SELECT wc.*, ac.name AS age_category_name 
            FROM weight_categories wc
            LEFT JOIN age_categories ac ON wc.age_category_id = ac.id
            ORDER BY ac.min_age, wc.name`, [], (err, categories)=>{
        res.render('weightCategories/index', { categories });
    });
});

// Add Weight Category form
router.get('/add', ensureAdmin, (req,res)=>{
    db.all(`SELECT * FROM age_categories`, [], (err, ageCategories)=>{
        res.render('weightCategories/add', { ageCategories });
    });
});

// Submit Add
router.post('/add', ensureAdmin, (req,res)=>{
    const { age_category_id, gender, name } = req.body;
    db.run(`INSERT INTO weight_categories (age_category_id, gender, name) VALUES (?,?,?)`,
        [age_category_id, gender, name], function(err){
            if(err) req.flash('error_msg', err.message);
            else {
                logAction(req.session.user.id, 'Added weight category', this.lastID);
                req.flash('success_msg','Weight category added');
            }
            res.redirect('/weightCategories');
        });
});

// Edit Weight Category form
router.get('/edit/:id', ensureAdmin, (req,res)=>{
    const id = req.params.id;
    db.get(`SELECT * FROM weight_categories WHERE id=?`, [id], (err, category)=>{
        if(err || !category){
            req.flash('error_msg','Category not found');
            return res.redirect('/weightCategories');
        }
        db.all(`SELECT * FROM age_categories`, [], (err, ageCategories)=>{
            res.render('weightCategories/edit', { category, ageCategories });
        });
    });
});

// Submit Edit
router.post('/edit/:id', ensureAdmin, (req,res)=>{
    const id = req.params.id;
    const { age_category_id, gender, name } = req.body;
    db.run(`UPDATE weight_categories SET age_category_id=?, gender=?, name=? WHERE id=?`,
        [age_category_id, gender, name, id], function(err){
            if(err) req.flash('error_msg',err.message);
            else {
                logAction(req.session.user.id, 'Edited weight category', id);
                req.flash('success_msg','Weight category updated');
            }
            res.redirect('/weightCategories');
        });
});

// Delete Weight Category
router.get('/delete/:id', ensureAdmin, (req,res)=>{
    const id = req.params.id;
    db.run(`DELETE FROM weight_categories WHERE id=?`, [id], function(err){
        if(err) req.flash('error_msg', err.message);
        else {
            logAction(req.session.user.id, 'Deleted weight category', id);
            req.flash('success_msg','Weight category deleted');
        }
        res.redirect('/weightCategories');
    });
});

// List athletes in weight category
router.get('/:id/athletes', ensureAdmin, (req,res)=>{
    const id = req.params.id;
    db.all(`SELECT a.*, ac.name AS age_category, wc.name AS weight_category 
            FROM athletes a
            LEFT JOIN age_categories ac ON a.age_category_id = ac.id
            LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
            WHERE a.weight_category_id=?`, [id], (err, athletes)=>{
        res.render('weightCategories/athletes', { athletes });
    });
});

module.exports = router;
