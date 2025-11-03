// routes/admin.js
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../db/karate_ranking.db'), { verbose: null });

// ✅ List possible duplicates
router.get('/duplicates', (req, res) => {
  try {
    const sql = `
      SELECT 
        a1.id AS id1,
        a2.id AS id2,
        a1.full_name AS name1,
        a2.full_name AS name2,
        a1.birth_date AS birth1,
        a2.birth_date AS birth2,
        COALESCE(c1.name, '-') AS club1,
        COALESCE(c2.name, '-') AS club2,
        (SELECT COUNT(*) FROM results r1 WHERE r1.athlete_id = a1.id) AS tourn_count1,
        (SELECT COUNT(*) FROM results r2 WHERE r2.athlete_id = a2.id) AS tourn_count2,
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
    const duplicates = db.prepare(sql).all();
    res.render('duplicates', { duplicates });
  } catch (err) {
    console.error('Error loading duplicates:', err);
    res.status(500).send('Error loading duplicates: ' + err.message);
  }
});

// ⛑ helper — reassign all foreign-keyed rows from losing->keep
function reassignAllRefs(keepId, mergeId) {
  // results (FK: athlete_id)
  db.prepare(`UPDATE results SET athlete_id=? WHERE athlete_id=?`).run(keepId, mergeId);

  // points_history (FK: athlete_id) — if your table name differs, adjust here
  db.prepare(`UPDATE points_history SET athlete_id=? WHERE athlete_id=?`).run(keepId, mergeId);

  // yearly_points (FK: athlete_id)
  db.prepare(`UPDATE yearly_points SET athlete_id=? WHERE athlete_id=?`).run(keepId, mergeId);

  // category_changes (FK: athlete_id)
  try { db.prepare(`UPDATE category_changes SET athlete_id=? WHERE athlete_id=?`).run(keepId, mergeId); } catch {}

  // athlete_last_participation (FK: athlete_id)
  try { db.prepare(`UPDATE athlete_last_participation SET athlete_id=? WHERE athlete_id=?`).run(keepId, mergeId); } catch {}

  // penalties: if they reference athlete_id directly
  try { db.prepare(`UPDATE penalties SET athlete_id=? WHERE athlete_id=?`).run(keepId, mergeId); } catch {}
}

// ✅ Single merge (keepId keeps, mergeId is removed)
router.post('/duplicates/merge', (req, res) => {
  const { keepId, mergeId, mergeMode } = req.body;
  if (!keepId || !mergeId) return res.status(400).send('Missing IDs');

  try {
    const tx = db.transaction(() => {
      db.pragma('foreign_keys = ON');

      reassignAllRefs(keepId, mergeId);

      if (mergeMode === 'sum') {
        const k = db.prepare(`SELECT total_points FROM athletes WHERE id=?`).get(keepId);
        const m = db.prepare(`SELECT total_points FROM athletes WHERE id=?`).get(mergeId);
        const newPoints = (k?.total_points || 0) + (m?.total_points || 0);
        db.prepare(`UPDATE athletes SET total_points=? WHERE id=?`).run(newPoints, keepId);
      }

      // optional: track merges
      try {
        db.prepare(`CREATE TABLE IF NOT EXISTS athlete_merge_map (old_id INTEGER, new_id INTEGER)`).run();
        db.prepare(`INSERT INTO athlete_merge_map (old_id, new_id) VALUES (?, ?)`).run(mergeId, keepId);
      } catch {}

      db.prepare(`DELETE FROM athletes WHERE id=?`).run(mergeId);
    });
    tx();

    return res.redirect('/duplicates');
  } catch (err) {
    console.error('Merge error:', err);
    return res.status(500).send('Error merging athletes: ' + err.message);
  }
});

// ✅ Bulk merge (multiple pairs)
router.post('/duplicates/merge-multi', (req, res) => {
  let { pairs, mergeMode } = req.body;

  // normalize pairs to array
  if (!pairs || (Array.isArray(pairs) && pairs.length === 0)) {
    return res.redirect('/duplicates');
  }
  if (!Array.isArray(pairs)) pairs = [pairs];

  try {
    const tx = db.transaction(() => {
      db.pragma('foreign_keys = ON');

      pairs.forEach(pair => {
        // expected "keepId,mergeId"
        const [keepIdStr, mergeIdStr] = String(pair).split(',').map(s => s.trim());
        const keepId = Number(keepIdStr);
        const mergeId = Number(mergeIdStr);
        if (!keepId || !mergeId || keepId === mergeId) return;

        reassignAllRefs(keepId, mergeId);

        if (mergeMode === 'sum') {
          const k = db.prepare(`SELECT total_points FROM athletes WHERE id=?`).get(keepId);
          const m = db.prepare(`SELECT total_points FROM athletes WHERE id=?`).get(mergeId);
          const newPoints = (k?.total_points || 0) + (m?.total_points || 0);
          db.prepare(`UPDATE athletes SET total_points=? WHERE id=?`).run(newPoints, keepId);
        }

        try {
          db.prepare(`CREATE TABLE IF NOT EXISTS athlete_merge_map (old_id INTEGER, new_id INTEGER)`).run();
          db.prepare(`INSERT INTO athlete_merge_map (old_id, new_id) VALUES (?, ?)`).run(mergeId, keepId);
        } catch {}

        db.prepare(`DELETE FROM athletes WHERE id=?`).run(mergeId);
      });
    });
    tx();

    return res.redirect('/duplicates');
  } catch (err) {
    console.error('Multi-merge error:', err);
    return res.status(500).send('Error merging duplicates: ' + err.message);
  }
});

module.exports = router;
