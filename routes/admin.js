// routes/admin.js
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../db/karate_ranking.db'));

// 🧩 Detect possible duplicate athletes by name
router.get('/duplicates', (req, res) => {
  try {
    const query = `
      SELECT 
        a1.id AS id1,
        a2.id AS id2,
        a1.full_name AS name1,
        a2.full_name AS name2,
        a1.birth_date AS birth1,
        a2.birth_date AS birth2,
        COALESCE(c1.name, '-') AS club1,
        COALESCE(c2.name, '-') AS club2,
        -- counts of tournaments per athlete
        (SELECT COUNT(*) FROM results r1 WHERE r1.athlete_id = a1.id) AS tourn_count1,
        (SELECT COUNT(*) FROM results r2 WHERE r2.athlete_id = a2.id) AS tourn_count2,
        -- total points (in athletes table)
        IFNULL(a1.total_points, 0) AS total_points1,
        IFNULL(a2.total_points, 0) AS total_points2
      FROM athletes a1
      JOIN athletes a2 
        ON a1.id < a2.id
        AND (
          LOWER(a1.full_name) = LOWER(a2.full_name)
          OR REPLACE(LOWER(a1.full_name), ' ', '') = REPLACE(LOWER(a2.full_name), ' ', '')
        )
      LEFT JOIN clubs c1 ON c1.id = a1.club_id
      LEFT JOIN clubs c2 ON c2.id = a2.club_id
      ORDER BY a1.full_name;
    `;

    const duplicates = db.prepare(query).all();
    res.render('duplicates', { duplicates });
  } catch (err) {
    console.error('Error loading duplicates:', err.message);
    res.status(500).send('Error loading duplicates: ' + err.message);
  }
});

// 🧩 Merge two athlete records
router.post('/duplicates/merge', (req, res) => {
  const { keepId, mergeId } = req.body;
  if (!keepId || !mergeId) {
    return res.status(400).send('Missing IDs');
  }

  try {
    const mergeTx = db.transaction(() => {
      // Update results to point to the "kept" athlete
      db.prepare('UPDATE results SET athlete_id=? WHERE athlete_id=?').run(keepId, mergeId);

      // Delete the duplicate athlete
      db.prepare('DELETE FROM athletes WHERE id=?').run(mergeId);
    });

    mergeTx();
    res.redirect('/duplicates');
  } catch (err) {
    console.error('Merge error:', err);
    res.status(500).send('Error merging athletes.');
  }
});

router.post('/duplicates/merge-multi', (req, res) => {
  const { pairs, mergeMode } = req.body;
  if (!pairs || pairs.length === 0) {
    return res.redirect('/duplicates');
  }

  try {
    const mergeTx = db.transaction(() => {
      pairs.forEach(pair => {
        const [keepId, mergeId] = pair.split(',').map(Number);
        if (!keepId || !mergeId) return;

        // Move results
        db.prepare('UPDATE results SET athlete_id=? WHERE athlete_id=?').run(keepId, mergeId);

        if (mergeMode === 'sum') {
          const keep = db.prepare('SELECT total_points FROM athletes WHERE id=?').get(keepId);
          const merge = db.prepare('SELECT total_points FROM athletes WHERE id=?').get(mergeId);
          const newPoints = (keep?.total_points || 0) + (merge?.total_points || 0);
          db.prepare('UPDATE athletes SET total_points=? WHERE id=?').run(newPoints, keepId);
        }

        // Delete duplicate
        db.prepare('DELETE FROM athletes WHERE id=?').run(mergeId);
      });
    });

    mergeTx();
    res.redirect('/duplicates');
  } catch (err) {
    console.error('Multi-merge error:', err);
    res.status(500).send('Error merging duplicates.');
  }
});


module.exports = router;
