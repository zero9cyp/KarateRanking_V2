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

// =============================
// 🟢 List all athletes
// =============================
router.get('/', (req, res) => {
  const sql = `
    SELECT a.*, c.name as club_name, ac.name as age_category_name, wc.name as weight_category_name,
           t.id as tournament_id, t.name as tournament_name, t.date as tournament_date, 
           r.placement, r.wins, r.points_earned
    FROM athletes a
    LEFT JOIN clubs c ON a.club_id = c.id
    LEFT JOIN age_categories ac ON a.age_category_id = ac.id
    LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
    LEFT JOIN results r ON a.id = r.athlete_id
    LEFT JOIN tournaments t ON r.tournament_id = t.id
    ORDER BY a.full_name, t.date DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return console.error(err);

    const athletes = [];
    const map = {};
    rows.forEach(r => {
      if (!map[r.id]) {
        map[r.id] = { ...r, tournaments: [] };
        athletes.push(map[r.id]);
      }
      if (r.tournament_id) {
        map[r.id].tournaments.push({
          id: r.tournament_id,
          name: r.tournament_name,
          date: r.tournament_date,
          placement: r.placement,
          wins: r.wins,
          points_earned: r.points_earned
        });
      }
    });

    res.render('athletes/index', { athletes, searchQuery: '' });
  });
});

// =============================
// 🟢 Show Add Athlete form
// =============================
router.get('/add', (req, res) => {
  db.all('SELECT * FROM age_categories ORDER BY min_age', (err1, ageCategories) => {
    if (err1) return console.error(err1);

    db.all('SELECT * FROM weight_categories ORDER BY name', (err2, weightCategories) => {
      if (err2) return console.error(err2);

      db.all('SELECT * FROM clubs ORDER BY name', (err3, clubs) => {
        if (err3) return console.error(err3);

        res.render('athletes/add', { ageCategories, weightCategories, clubs });
      });
    });
  });
});

// =============================
// 🟢 Handle Add Athlete POST
// =============================
router.post('/add', (req, res) => {
  let { full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id } = req.body;

  if (!gender) return res.status(400).send("Gender is required");
  gender = gender.toLowerCase();

  if (gender !== 'male' && gender !== 'female') {
    return res.status(400).send("Gender must be 'male' or 'female'");
  }

  if (!full_name || !birth_date) {
    return res.status(400).send("Full name and birth date are required.");
  }

  const ageId = age_category_id ? parseInt(age_category_id) : null;
  const weightId = weight_category_id ? parseInt(weight_category_id) : null;
  const clubId = club_id ? parseInt(club_id) : null;
  total_points = total_points ? parseFloat(total_points) : 0;

  const sql = `
    INSERT INTO athletes 
      (full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [full_name, birth_date, gender, ageId, weightId, total_points, clubId], function (err) {
    if (err) {
      console.error("Error adding athlete:", err);
      return res.status(500).send("Database error.");
    }
    res.redirect('/athletes');
  });
});

// =============================
// 🟢 Edit Athlete
// =============================
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

router.post('/edit/:id', (req, res) => {
  const id = req.params.id;
  const { full_name, birth_date, gender, age_category_id, weight_category_id, total_points, club_id } = req.body;

  const sql = `
    UPDATE athletes
    SET full_name = ?, birth_date = ?, gender = ?, age_category_id = ?, weight_category_id = ?, total_points = ?, club_id = ?
    WHERE id = ?
  `;

  db.run(sql, [full_name, birth_date, gender.toLowerCase(), age_category_id, weight_category_id, total_points, club_id, id], (err) => {
    if (err) return console.error(err);
    res.redirect('/athletes');
  });
});

// =============================
// 🟢 Delete Athlete
// =============================
router.post('/delete/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM athletes WHERE id = ?', [id], (err) => {
    if (err) return console.error(err);
    res.redirect('/athletes');
  });
});

// =============================
// 🟢 Search Athletes
// =============================
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

router.get('/:id/tournaments', (req, res) => {
  const { id } = req.params;
  const sql = `
    SELECT t.id, t.name, t.date, r.placement, r.wins, r.points_earned
    FROM tournaments t
    JOIN results r ON t.id = r.tournament_id
    WHERE r.athlete_id = ?
    ORDER BY t.date DESC
  `;
  db.all(sql, [id], (err, tournaments) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    res.render('athletes/tournaments', { tournaments });
  });
});
// =============================
// 🟢 AJAX: Weight Categories by Age & Gender
// =============================
router.get("/weight-categories", (req, res) => {
  const { age_category_id, gender } = req.query;
  if (!age_category_id || !gender) return res.status(400).json({ error: "Missing parameters" });

  const sql = `
    SELECT id, name 
    FROM weight_categories 
    WHERE age_category_id = ? 
      AND LOWER(gender) = LOWER(?)
    ORDER BY name;
  `;

  db.all(sql, [age_category_id, gender], (err, rows) => {
    if (err) {
      console.error("DB error loading weight categories:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(rows);
  });
});

// Show form to move athlete to another club
router.get('/move/:id', (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM athletes WHERE id = ?', [id], (err, athlete) => {
    if (err || !athlete) return res.redirect('/athletes');

    db.all('SELECT * FROM clubs ORDER BY name', (err2, clubs) => {
      if (err2) return console.error(err2);

      res.render('athletes/move', { athlete, clubs });
    });
  });
});

// Handle moving athlete to another club
// Handle moving athlete to another club
router.post('/move/:id', (req, res) => {
  const id = req.params.id;
  const { club_id } = req.body;

  // Step 1: get current club_id (so we can return there)
  db.get('SELECT club_id FROM athletes WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.redirect('/clubs');

    const oldClubId = row.club_id;

    // Step 2: update the athlete’s club
    db.run('UPDATE athletes SET club_id = ? WHERE id = ?', [club_id, id], (err2) => {
      if (err2) return console.error(err2);

      // Step 3: redirect back to the old club's athlete list
      res.redirect(`/clubs/${oldClubId}/athletes`);
    });
  });
});

module.exports = router;
