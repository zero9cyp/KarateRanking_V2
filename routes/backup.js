// routes/backup.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ensureAdmin, logAction } = require('../middleware/auth');

const dbFile = path.join(__dirname, '../db/karate_ranking.db');
const backupDir = path.join(__dirname, '../db/backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

router.get('/', ensureAdmin, (req, res) => {
  const timestamp = new Date().toISOString().replace(/[-T:\.Z]/g, '');
  const backupFile = path.join(backupDir, `backup_${timestamp}.db`);
  fs.copyFile(dbFile, backupFile, (err) => {
    if (err) req.flash('error_msg', 'Backup failed: ' + err.message);
    else {
      logAction(req.session.user.id, `Created backup ${path.basename(backupFile)}`, null);
      req.flash('success_msg', 'Backup created: ' + path.basename(backupFile));
    }
    res.redirect('/backup/list');
  });
});

router.get('/list', ensureAdmin, (req, res) => {
  fs.readdir(backupDir, (err, files) => {
    if (err) files = [];
    res.render('backup/list', { backups: files });
  });
});

router.post('/restore', ensureAdmin, (req, res) => {
  const { backupFile } = req.body;
  const filePath = path.join(backupDir, backupFile);
  if (!fs.existsSync(filePath)) {
    req.flash('error_msg', 'Backup file does not exist');
    return res.redirect('/backup/list');
  }
  fs.copyFile(filePath, dbFile, (err) => {
    if (err) req.flash('error_msg', 'Restore failed: ' + err.message);
    else {
      logAction(req.session.user.id, `Restored DB from ${backupFile}`, null);
      req.flash('success_msg', 'Database restored from: ' + backupFile);
    }
    res.redirect('/backup/list');
  });
});

router.post('/delete', ensureAdmin, (req, res) => {
  const { backupFile } = req.body;
  const filePath = path.join(backupDir, backupFile);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logAction(req.session.user.id, `Deleted backup ${backupFile}`, null);
    req.flash('success_msg', 'Backup deleted');
  } else req.flash('error_msg', 'Backup not found');
  res.redirect('/backup/list');
});

module.exports = router;
