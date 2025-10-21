const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { ensureAdmin } = require('../middleware/auth');

const upload = multer({ dest: './uploads/' });
const BACKUP_DIR = path.join(__dirname, '../backups');

router.get('/', ensureAdmin, (req, res) => {
  // list existing backups
  let files = [];
  if (fs.existsSync(BACKUP_DIR)) {
    files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db'));
  }

  res.render('restore/index', { backups: files });
});

// upload & restore
router.post('/upload', ensureAdmin, upload.single('backupFile'), (req, res) => {
  if (!req.file) {
    req.flash('error_msg', 'No file uploaded');
    return res.redirect('/restore');
  }

  const uploadedFile = req.file.path;
  const dest = './db/karate_ranking.db';

  fs.copyFile(uploadedFile, dest, err => {
    fs.unlinkSync(uploadedFile);

    if (err) {
      req.flash('error_msg', 'Restore failed');
      return res.redirect('/restore');
    }

    req.flash('success_msg', 'Database restored successfully');
    res.redirect('/restore');
  });
});

// restore from existing backup
router.post('/select', ensureAdmin, (req, res) => {
  const selectedBackup = req.body.backupName;
  const source = path.join(BACKUP_DIR, selectedBackup);
  const dest = './db/karate_ranking.db';

  if (!fs.existsSync(source)) {
    req.flash('error_msg', 'Selected backup not found');
    return res.redirect('/restore');
  }

  fs.copyFile(source, dest, err => {
    if (err) {
      req.flash('error_msg', 'Restore failed');
      return res.redirect('/restore');
    }

    req.flash('success_msg', 'Database restored successfully');
    res.redirect('/restore');
  });
});

module.exports = router;
