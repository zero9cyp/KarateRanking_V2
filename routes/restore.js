const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { ensureAdmin } = require('../middleware/auth');

const upload = multer({ dest: './uploads/' });

// Correct backup folder
const BACKUP_DIR = path.join(__dirname, '../db/backups');
const DB_FILE = path.join(__dirname, '../db/karate_ranking.db');

// Ensure backup folder exists
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// 🔹 List available backups
router.get('/', ensureAdmin, (req, res) => {
  let backups = [];

  try {
    if (fs.existsSync(BACKUP_DIR)) {
      backups = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.db'))
        .map(f => {
          const fullPath = path.join(BACKUP_DIR, f);
          return {
            name: f,
            time: fs.statSync(fullPath).mtime.toLocaleString('el-GR')
          };
        })
        .sort((a, b) => new Date(b.time) - new Date(a.time));
    }
  } catch (err) {
    console.error('Error reading backups:', err);
  }

  res.render('restore/index', { backups });
});

// 🔹 Upload & restore
router.post('/upload', ensureAdmin, upload.single('backupFile'), (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'Δεν επιλέχθηκε αρχείο.');
    return res.redirect('/restore');
  }

  const uploadedFile = req.file.path;

  fs.copyFile(uploadedFile, DB_FILE, err => {
    fs.unlinkSync(uploadedFile);

    if (err) {
      console.error('Restore failed:', err);
      req.flash('error_msg', 'Η επαναφορά απέτυχε.');
      return res.redirect('/restore');
    }

    req.flash('success_msg', 'Η βάση δεδομένων επαναφέρθηκε επιτυχώς!');
    res.redirect('/restore');
  });
});

// 🔹 Restore from existing backup
router.post('/select', ensureAdmin, (req, res) => {
  const { backupName } = req.body;
  const source = path.join(BACKUP_DIR, backupName);

  if (!fs.existsSync(source)) {
    req.flash('error_msg', 'Το αντίγραφο δεν βρέθηκε.');
    return res.redirect('/restore');
  }

  fs.copyFile(source, DB_FILE, err => {
    if (err) {
      console.error('Restore failed:', err);
      req.flash('error_msg', 'Η επαναφορά απέτυχε.');
      return res.redirect('/restore');
    }

    req.flash('success_msg', `Η βάση δεδομένων επαναφέρθηκε από: ${backupName}`);
    res.redirect('/restore');
  });
});

module.exports = router;
