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

// ✅ Εμφάνιση σελίδας ελέγχου πόντων (με αναζήτηση)
router.get("/points-review", (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : "%";
    const rows = db
      .prepare(`
        SELECT *
        FROM points_review
        WHERE LOWER(full_name) LIKE ?
        ORDER BY full_name ASC
      `)
      .all(search);

    res.render("admin/points-review", { rows, search: req.query.search || "" });
  } catch (err) {
    console.error("Σφάλμα κατά την ανάκτηση δεδομένων:", err);
    res.status(500).send("Σφάλμα κατά την ανάκτηση δεδομένων.");
  }
});

// ✅ Ενημέρωση εγγραφής
router.post("/points-review/update", (req, res) => {
  const { athlete_id, total_after, season_year, description } = req.body;

  try {
    const last = db
      .prepare("SELECT id FROM points_history WHERE athlete_id = ? ORDER BY date DESC, id DESC LIMIT 1")
      .get(athlete_id);

    if (!last) return res.status(404).send("Δεν βρέθηκε ιστορικό για αυτόν τον αθλητή.");

    db.prepare("UPDATE points_history SET total_after = ?, season_year = ?, description = ? WHERE id = ?")
      .run(total_after, season_year, description, last.id);

    db.prepare("UPDATE athletes SET total_points = ? WHERE id = ?")
      .run(total_after, athlete_id);

    // 🔁 FIX: σωστό redirect με prefix /admin
    res.redirect("/points-review");
  } catch (err) {
    console.error("Σφάλμα κατά την αποθήκευση:", err);
    res.status(500).send("Σφάλμα κατά την αποθήκευση.");
  }
});

// ✅ Full Points Management View (όλα τα δεδομένα)
router.get("/points-manager", (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : "%";

    const sql = `
      SELECT 
        a.id AS athlete_id,
        a.full_name,
        ROUND(IFNULL(a.total_points, 0), 2) AS total_points,
        ROUND(SUM(r.points_earned), 2) AS earned_points,
        ROUND(IFNULL(yp.closing_points, 0), 2) AS closing_2024,
        ROUND(IFNULL(ph.total_after, 0), 2) AS history_total,
        ROUND((IFNULL(a.total_points, 0) - IFNULL(ph.total_after, 0)), 2) AS diff,
        IFNULL(ph.description, '') AS last_description
      FROM athletes a
      LEFT JOIN results r ON a.id = r.athlete_id
      LEFT JOIN yearly_points yp ON yp.athlete_id = a.id AND yp.year = 2024
      LEFT JOIN (
        SELECT athlete_id, total_after, description, MAX(date) AS max_date
        FROM points_history
        GROUP BY athlete_id
      ) ph ON ph.athlete_id = a.id
      WHERE LOWER(a.full_name) LIKE ?
      GROUP BY a.id
      ORDER BY a.full_name COLLATE NOCASE;
    `;

    const rows = db.prepare(sql).all(search);
    res.render("admin/points-manager", { rows, search: req.query.search || "" });
  } catch (err) {
    console.error("Σφάλμα ανάκτησης:", err);
    res.status(500).send("Σφάλμα κατά την ανάκτηση δεδομένων.");
  }
});

// ✅ Αποθήκευση ενημέρωσης (manual διορθώσεις)
// ✅ Full Points Management View (με 2024 closing & 2025 starting)
router.get("/points-manager", (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : "%";

    const sql = `
      SELECT 
        a.id AS athlete_id,
        a.full_name,
        ROUND(IFNULL(a.total_points, 0), 2) AS total_points,
        ROUND(SUM(r.points_earned), 2) AS earned_points,
        ROUND(IFNULL(y24.closing_points, 0), 2) AS closing_2024,
        ROUND(IFNULL(y25.starting_points, 0), 2) AS starting_2025,
        ROUND(IFNULL(ph.total_after, 0), 2) AS history_total,
        ROUND((IFNULL(a.total_points, 0) - IFNULL(ph.total_after, 0)), 2) AS diff,
        IFNULL(ph.description, '') AS last_description
      FROM athletes a
      LEFT JOIN results r ON a.id = r.athlete_id
      LEFT JOIN yearly_points y24 ON y24.athlete_id = a.id AND y24.year = 2024
      LEFT JOIN yearly_points y25 ON y25.athlete_id = a.id AND y25.year = 2025
      LEFT JOIN (
        SELECT athlete_id, total_after, description, MAX(date) AS max_date
        FROM points_history
        GROUP BY athlete_id
      ) ph ON ph.athlete_id = a.id
      WHERE LOWER(a.full_name) LIKE ?
      GROUP BY a.id
      ORDER BY a.full_name COLLATE NOCASE;
    `;

    const rows = db.prepare(sql).all(search);
    res.render("admin/points-manager", { rows, search: req.query.search || "" });
  } catch (err) {
    console.error("Σφάλμα ανάκτησης:", err);
    res.status(500).send("Σφάλμα κατά την ανάκτηση δεδομένων.");
  }
});

// ✅ Ενημέρωση — επιτρέπει αλλαγή σε total_points, closing_2024, starting_2025, description
router.post("/points-manager/update", (req, res) => {
  const { athlete_id, total_points, closing_2024, starting_2025, description } = req.body;

  try {
    // ενημέρωση total_points στον athletes
    db.prepare(`UPDATE athletes SET total_points = ? WHERE id = ?`)
      .run(total_points, athlete_id);

    // ενημέρωση / δημιουργία yearly_points για 2024 (closing)
    db.prepare(`
      INSERT INTO yearly_points (athlete_id, year, closing_points)
      VALUES (?, 2024, ?)
      ON CONFLICT(athlete_id, year) DO UPDATE SET closing_points = excluded.closing_points
    `).run(athlete_id, closing_2024);

    // ενημέρωση / δημιουργία yearly_points για 2025 (starting)
    db.prepare(`
      INSERT INTO yearly_points (athlete_id, year, starting_points)
      VALUES (?, 2025, ?)
      ON CONFLICT(athlete_id, year) DO UPDATE SET starting_points = excluded.starting_points
    `).run(athlete_id, starting_2025);

    // καταχώρηση ιστορικού αλλαγής
    db.prepare(`
      INSERT INTO points_history (athlete_id, date, points_before, points_after, description, season_year)
      VALUES (?, datetime('now'), 0, ?, ?, 2025)
    `).run(athlete_id, total_points, description || 'Manual correction');

    res.redirect("/points-manager");
  } catch (err) {
    console.error("Σφάλμα αποθήκευσης:", err);
    res.status(500).send("Σφάλμα κατά την αποθήκευση αλλαγών.");
  }
});


module.exports = router;
