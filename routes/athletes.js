// routes/athletes.js
const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(path.join(__dirname, "../db/karate_ranking.db"));

// 🔹 Helper: calculate age
function calculateAge(birthDate) {
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// 🔹 Helper: find correct category for given age
function getCorrectCategory(age, callback) {
  db.get(
    "SELECT * FROM age_categories WHERE min_age <= ? AND max_age >= ? LIMIT 1",
    [age, age],
    (err, row) => callback(err, row)
  );
}

// List all athletes
router.get('/', (req, res) => {
  const sql = `
    SELECT a.*, c.name as club_name, ac.name as age_category_name, wc.name as weight_category_name
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    ORDER BY a.full_name
  `;
  db.all(sql, [], (err, athletes) => {
    if (err) return console.error(err);
    // Pass searchQuery as empty string
    res.render('athletes/index', { athletes, searchQuery: '' });
  });
});

// Show Add Athlete form
router.get('/add', (req, res) => {
  db.all('SELECT * FROM age_categories ORDER BY min_age', (err, ageCategories) => {
    if (err) return console.error(err);
    db.all('SELECT * FROM weight_categories ORDER BY name', (err2, weightCategories) => {
      if (err2) return console.error(err2);
      db.all('SELECT * FROM clubs ORDER BY name', (err3, clubs) => {
        if (err3) return console.error(err3);
        res.render('athletes/add', { ageCategories, weightCategories, clubs });
      });
    });
  });
});

// Handle Add Athlete POST safely
router.post('/add', (req, res) => {
  let { full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id } = req.body;

  // Normalize gender to lowercase
  if (!gender) return res.status(400).send("Gender is required");
  gender = gender.toLowerCase();

  // Validate allowed gender values
  if (gender !== 'male' && gender !== 'female') {
    return res.status(400).send("Gender must be 'male' or 'female'");
  }

  // Validate required fields
  if (!full_name || !birth_date) {
    return res.status(400).send("Full name and birth date are required.");
  }

  // Convert foreign keys to integers or null
  const ageId = age_category_id ? parseInt(age_category_id) : null;
  const weightId = weight_category_id ? parseInt(weight_category_id) : null;
  const clubId = club_id ? parseInt(club_id) : null;
  total_points = total_points ? parseInt(total_points) : 0;

  // Helper function to check foreign key exists
  function checkFK(table, id, callback) {
    if (id === null) return callback(true); // allow null
    db.get(`SELECT id FROM ${table} WHERE id = ?`, [id], (err, row) => {
      if (err) return callback(false);
      callback(!!row);
    });
  }

  // Check age_category_id
  checkFK('age_categories', ageId, (ageOk) => {
    if (!ageOk) return res.status(400).send("Invalid age category ID.");

    // Check weight_category_id
    checkFK('weight_categories', weightId, (weightOk) => {
      if (!weightOk) return res.status(400).send("Invalid weight category ID.");

      // Check club_id
      checkFK('clubs', clubId, (clubOk) => {
        if (!clubOk) return res.status(400).send("Invalid club ID.");

        // All checks passed, safe to insert
        const sql = `
          INSERT INTO athletes 
            (full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(sql, [full_name, birth_date, gender, ageId, weightId, total_points, clubId], function(err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
              console.error("Constraint violation:", err.message);
              return res.status(400).send("Database constraint violation: check input values.");
            }
            console.error(err);
            return res.status(500).send("Database error.");
          }

          // Successfully added
          res.redirect('/athletes');
        });

      });
    });
  });

});

// Show Edit Athlete form
router.get('/edit/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM athletes WHERE id = ?', [id], (err, athlete) => {
    if (err || !athlete) return res.redirect('/athletes');

    db.all('SELECT * FROM age_categories ORDER BY min_age', (err2, ageCategories) => {
      if (err2) return console.error(err2);

      db.all('SELECT * FROM weight_categories ORDER BY name', (err3, weightCategories) => {
        if (err3) return console.error(err3);

        db.all('SELECT * FROM clubs ORDER BY name', (err4, clubs) => {
          if (err4) return console.error(err4);
          res.render('athletes/edit', { athlete, ageCategories, weightCategories, clubs });
        });
      });
    });
  });
});

// Handle Edit Athlete POST
router.post('/edit/:id', (req, res) => {
  const id = req.params.id;
  let { full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id } = req.body;

  // Normalize gender to lowercase
  gender = gender.toLowerCase();

  // TODO: Check if athlete changes age/weight category -> apply 50% or 25% points reduction
  const sql = `
    UPDATE athletes
    SET full_name = ?, birth_date = ?, gender = ?, age_category_id = ?, weight_category_id = ?, total_points = ?, club_id = ?
    WHERE id = ?
  `;

  db.run(sql, [full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id, id], function (err) {
    if (err) return console.error(err);
    res.redirect('/athletes');
  });
});

// Delete athlete
router.get('/delete/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM athletes WHERE id = ?', [id], (err) => {
    if (err) return console.error(err);
    res.redirect('/athletes');
  });
});

router.post('/delete/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM athletes WHERE id = ?', [id], (err) => {
    if (err) return console.error(err);
    res.redirect('/athletes');
  });
});

// Search athletes by name (GET /athletes/search?query=...)
router.get('/search', (req, res) => {
  const query = req.query.query || '';

  const sql = `
    SELECT a.*, c.name as club_name, ac.name as age_category_name, wc.name as weight_category_name
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    WHERE a.full_name LIKE ?
    ORDER BY a.full_name
  `;

  db.all(sql, [`%${query}%`], (err, athletes) => {
    if (err) {
      console.error(err);
      return res.redirect('/athletes');
    }

    res.render('athletes/index', { athletes, searchQuery: query });
  });
});


module.exports = router;