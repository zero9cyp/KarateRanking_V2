const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { ensureAdmin } = require('../middleware/auth');

const saltRounds = 10;

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');


// Προστασία όλων των routes με ensureAdmin middleware
router.use(ensureAdmin);

// Εμφάνιση όλων των χρηστών με πεδίο isActive
router.get('/', (req, res) => {
   db.all('SELECT id, username, role, isActive FROM users', [], (err, users) => {
    if (err) {
      req.session.error = 'Σφάλμα βάσης.';
      return res.redirect('/');
    }
    res.render('users/index', { users });
  });
});

// Εμφάνιση φόρμας προσθήκης χρήστη
router.get('/add', (req, res) => {
  res.render('users/add', { error: null });
});

// Επεξεργασία προσθήκης χρήστη (POST)
router.post('/add', async (req, res) => {

  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.render('users/add', { error: 'Συμπλήρωσε όλα τα πεδία.' });
  }

  try {
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) return res.render('users/add', { error: 'Σφάλμα βάσης.' });
      if (user) return res.render('users/add', { error: 'Το όνομα χρήστη υπάρχει ήδη.' });

      const hash = await bcrypt.hash(password, saltRounds);

      db.run(
        'INSERT INTO users (username, password, role, isActive) VALUES (?, ?, ?, ?)',
        [username, hash, role, 1], // Νέος χρήστης ενεργός από προεπιλογή
        (err) => {
          if (err) return res.render('users/add', { error: 'Σφάλμα κατά την εγγραφή.' });

          req.session.success = 'Ο χρήστης προστέθηκε με επιτυχία.';
          res.redirect('/users');
        }
      );
    });
  } catch (err) {
    console.error(err);
    res.render('users/add', { error: 'Σφάλμα server.' });
  }
});

// Εμφάνιση φόρμας επεξεργασίας ρόλου χρήστη
router.get('/edit/:id', (req, res) => {
  const userId = req.params.id;

  db.get('SELECT id, username, role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      req.session.error = 'Ο χρήστης δεν βρέθηκε.';
      return res.redirect('/users');
    }
    res.render('users/edit', { user, error: null });
  });
});

// Επεξεργασία ρόλου χρήστη (POST)
router.post('/edit/:id', (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  if (!role) {
    return res.render('users/edit', { user: { id: userId }, error: 'Επιλέξτε ρόλο.' });
  }

  db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], (err) => {
    if (err) {
      return res.render('users/edit', { user: { id: userId }, error: 'Σφάλμα βάσης.' });
    }
    req.session.success = 'Ο ρόλος χρήστη ενημερώθηκε.';
    res.redirect('/users');
  });
});

// Διαγραφή χρήστη (POST)
router.post('/delete/:id', (req, res) => {
  const userId = req.params.id;

  if (req.session.user.id == userId) {
    req.session.error = 'Δεν μπορείτε να διαγράψετε τον εαυτό σας.';
    return res.redirect('/users');
  }

  db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
    if (err) {
      req.session.error = 'Σφάλμα βάσης.';
    } else {
      req.session.success = 'Ο χρήστης διαγράφηκε.';
    }
    res.redirect('/users');
  });
});

// Εμφάνιση φόρμας επαναφοράς κωδικού (γενική)
router.get('/reset-password', (req, res) => {
  res.render('users/reset-password');
});

// Επεξεργασία επαναφοράς κωδικού (γενική)
router.post('/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;

  if (!username || !newPassword) {
    req.session.error = 'Συμπλήρωσε όλα τα πεδία.';
    return res.redirect('/users/reset-password');
  }

  const hashed = await bcrypt.hash(newPassword, saltRounds);

  db.run(
    'UPDATE users SET password = ? WHERE username = ?',
    [hashed, username],
    function (err) {
      if (err) {
        console.error(err);
        req.session.error = 'Σφάλμα κατά την ενημέρωση.';
      } else if (this.changes === 0) {
        req.session.error = 'Δεν βρέθηκε χρήστης.';
      } else {
        req.session.success = 'Ο κωδικός άλλαξε επιτυχώς.';
      }
      res.redirect('/users/reset-password');
    }
  );
});

// Εμφάνιση φόρμας επαναφοράς κωδικού για συγκεκριμένο χρήστη (by ID)
router.get('/reset-password/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT id, username FROM users WHERE id = ?', [id], (err, user) => {
    if (err || !user) {
      req.session.error = 'Ο χρήστης δεν βρέθηκε.';
      return res.redirect('/users');
    }

    res.render('users/reset-password-id', { user });
  });
});

// Επεξεργασία επαναφοράς κωδικού για συγκεκριμένο χρήστη (by ID)
router.post('/reset-password/:id', async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    req.session.error = 'Ο κωδικός δεν μπορεί να είναι κενός.';
    return res.redirect(`/users/reset-password/${id}`);
  }

  try {
    const hash = await bcrypt.hash(newPassword, saltRounds);

    db.run('UPDATE users SET password = ? WHERE id = ?', [hash, id], function (err) {
      if (err) {
        console.error(err);
        req.session.error = 'Σφάλμα κατά την ενημέρωση.';
        return res.redirect(`/users/reset-password/${id}`);
      }

      req.session.success = 'Ο κωδικός άλλαξε επιτυχώς.';
      res.redirect('/users');
    });
  } catch (e) {
    console.error(e);
    req.session.error = 'Σφάλμα στον server.';
    res.redirect(`/users/reset-password/${id}`);
  }
});

// Λίστα χρηστών που περιμένουν έγκριση (isActive = 0)
router.get('/pending-approvals', (req, res) => {

  db.all('SELECT id, username, role FROM users WHERE isActive = 0', [], (err, users) => {
    if (err) {
      req.session.error = 'Σφάλμα στη βάση δεδομένων.';
      return res.redirect('/users');
    }
    res.render('users/pending-approvals', { users });
  });
});

// Έγκριση χρήστη (set isActive = 1)
router.post('/approve/:id', (req, res) => {
  const userId = req.params.id;

  db.run('UPDATE users SET isActive = 1 WHERE id = ?', [userId], (err) => {
    if (err) {
      req.session.error = 'Σφάλμα κατά την έγκριση χρήστη.';
    } else {
      req.session.success = 'Ο χρήστης εγκρίθηκε με επιτυχία.';
    }
    res.redirect('/users/pending-approvals');
  });
});

// Ενεργοποίηση χρήστη
router.post('/activate/:id', (req, res) => {
  const userId = req.params.id;

  db.run('UPDATE users SET isActive = 1 WHERE id = ?', [userId], (err) => {
    if (err) {
      req.session.error = 'Σφάλμα κατά την ενεργοποίηση χρήστη.';
    } else {
      req.session.success = 'Ο χρήστης ενεργοποιήθηκε.';
    }
    res.redirect('/users');
  });
});

// Απενεργοποίηση χρήστη
router.post('/deactivate/:id', (req, res) => {
  const userId = req.params.id;

  db.run('UPDATE users SET isActive = 0 WHERE id = ?', [userId], (err) => {
    if (err) {
      req.session.error = 'Σφάλμα κατά την απενεργοποίηση χρήστη.';
    } else {
      req.session.success = 'Ο χρήστης απενεργοποιήθηκε.';
    }
    res.redirect('/users');
  });
});

module.exports = router;
