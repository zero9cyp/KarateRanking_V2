// routes/backup.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ensureAdmin, logAction } = require('../middleware/auth');
const dbFile = path.join(__dirname, '../db/karate_ranking.db');
const backupDir = path.join(__dirname, '../db/backups'); // same as restore.js
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

// 🔹 Create a new backup with Greek name format
router.get('/', ensureAdmin, (req, res) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  // 👉 Format: αντιγραφο_21-10-2025_15-51.db
  const readableName = `αντιγραφο_${day}-${month}-${year}_${hours}-${minutes}.db`;
  const backupFile = path.join(backupDir, readableName);

  fs.copyFile(dbFile, backupFile, (err) => {
    if (err) {
      req.flash('error_msg', 'Η δημιουργία αντιγράφου απέτυχε: ' + err.message);
    } else {
      logAction(req.session.user.id, `Δημιουργήθηκε αντίγραφο: ${path.basename(backupFile)}`, null);
      req.flash('success_msg', 'Δημιουργήθηκε αντίγραφο: ' + path.basename(backupFile));
    }
    res.redirect('/backup/list');
  });
});

// 🔹 List backups
router.get('/list', ensureAdmin, (req, res) => {
  fs.readdir(backupDir, (err, files) => {
    if (err) files = [];
    const backups = files
      .filter(f => f.endsWith('.db'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(backupDir, f)).mtime.toLocaleString('el-GR')
      }))
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    res.render('backup/list', { backups });
  });
});

// 🔹 Restore from backup
router.post('/restore', ensureAdmin, (req, res) => {
  const { backupFile } = req.body;
  const filePath = path.join(backupDir, backupFile);

  if (!fs.existsSync(filePath)) {
    req.flash('error_msg', 'Το αρχείο αντιγράφου δεν βρέθηκε');
    return res.redirect('/backup/list');
  }

  fs.copyFile(filePath, dbFile, (err) => {
    if (err) req.flash('error_msg', 'Η επαναφορά απέτυχε: ' + err.message);
    else {
      logAction(req.session.user.id, `Επαναφορά από ${backupFile}`, null);
      req.flash('success_msg', 'Η βάση δεδομένων επαναφέρθηκε από: ' + backupFile);
    }
    res.redirect('/backup/list');
  });
});

// 🔹 Delete backup
router.post('/delete', ensureAdmin, (req, res) => {
  const { backupFile } = req.body;
  const filePath = path.join(backupDir, backupFile);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logAction(req.session.user.id, `Διαγράφηκε αντίγραφο ${backupFile}`, null);
    req.flash('success_msg', 'Το αντίγραφο διαγράφηκε επιτυχώς');
  } else {
    req.flash('error_msg', 'Το αντίγραφο δεν βρέθηκε');
  }

  res.redirect('/backup/list');
});

// Download a backup file
router.get("/download/:filename", (req, res) => {
  const fileName = req.params.filename;
  const filePath = path.join(__dirname, "../db/backups", fileName);

  if (!fs.existsSync(filePath)) {
    req.flash("error_msg", "Το αρχείο δεν βρέθηκε.");
    return res.redirect("/restore");
  }

  res.download(filePath, fileName, (err) => {
    if (err) {
      console.error("Download error:", err);
      req.flash("error_msg", "Σφάλμα κατά τη λήψη του αρχείου.");
      res.redirect("/restore");
    }
  });
});


module.exports = router;