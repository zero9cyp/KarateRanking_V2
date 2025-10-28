const express = require("express");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db/karate_ranking.db");
const { ensureAuthenticated, ensureAdminOrCoach } = require("../middleware/auth");

// ===============================
// 1️⃣ Overview
// ===============================// ===============================
// Generate Starting Points for 2025
// ===============================
router.get("/overview", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const sql = `
    SELECT
      a.id AS athlete_id,
      a.full_name AS athlete_name,
      a.closing_points_2024 AS closing_2024,
      a.starting_points_2025 AS starting_2025,
      (
        a.starting_points_2025 +
        COALESCE((
          SELECT SUM(r.points_earned)
          FROM results r
          WHERE r.athlete_id = a.id
            AND r.season_year = 2025
        ), 0)
      ) AS current_total
    FROM athletes a
    ORDER BY a.full_name ASC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.send("Error: " + err.message);
    res.render("points_overview", { rows });
  });
});

// ===============================
// 2️⃣ Closing points (generate snapshot for 2024)
// ===============================
// ===============================
// Generate Closing Snapshot (2024)
// ===============================
router.post("/closing/generate", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const year = 2024;

  db.all("SELECT id, total_points FROM athletes", [], (err, rows) => {
    if (err) return res.send(err.message);

    const stmt = db.prepare(`
      INSERT INTO yearly_points (athlete_id, year, closing_points)
      VALUES (?, ?, ?)
      ON CONFLICT(athlete_id, year)
      DO UPDATE SET closing_points = excluded.closing_points
    `);

    rows.forEach(r => {
      stmt.run(r.id, year, r.total_points);
    });

    stmt.finalize(err2 => {
      if (err2) return res.send("Error finalizing insert: " + err2.message);
      res.redirect("/points/overview");
    });
  });
});

// ===============================
// 3️⃣ Set starting points for 2025 from 2024 closing
// ===============================
router.post("/closing/generate", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const year = 2024;

  db.all("SELECT id, total_points FROM athletes", [], (err, rows) => {
    if (err) return res.send(err.message);

    const stmt = db.prepare(`
      INSERT INTO yearly_points (athlete_id, year, closing_points)
      VALUES (?, ?, ?)
      ON CONFLICT(athlete_id, year)
      DO UPDATE SET closing_points = excluded.closing_points
    `);

    rows.forEach(r => {
      stmt.run(r.id, year, r.total_points);
    });

    stmt.finalize(err2 => {
      if (err2) return res.send("Error finalizing insert: " + err2.message);
      console.log(`✅ Snapshot for ${rows.length} athletes saved.`);
      res.redirect("/points/overview");
    });
  });
});

// Save year-end snapshot for 2024
// Expected body: [{ athlete_id, raw_total_2024, adjusted_total_2024 }, ...]
router.post("/closing/save", ensureAuthenticated, ensureAdminOrCoach, express.json(), (req, res) => {
  const year = 2024;
  const rows = req.body; // array from client

  const stmt = db.prepare(`
    INSERT INTO yearly_points (athlete_id, year, closing_raw_points, closing_points)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(athlete_id, year)
    DO UPDATE SET
      closing_raw_points = excluded.closing_raw_points,
      closing_points = excluded.closing_points
  `);

  rows.forEach(r => {
    stmt.run(
      r.athlete_id,
      year,
      r.raw_total_2024 ?? 0,
      r.adjusted_total_2024 ?? 0
    );
  });

  stmt.finalize(err => {
    if (err) return res.status(500).send("DB error: " + err.message);
    res.redirect("/points/overview");
  });
});

router.post("/starting/generate", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const prevYear = 2024;
  const newYear = 2025;

  db.all(
    `SELECT athlete_id, closing_points
     FROM yearly_points
     WHERE year = ?`,
    [prevYear],
    (err, rows) => {
      if (err) return res.send("Error reading previous year: " + err.message);
      if (!rows.length) return res.send("⚠️ No closing snapshot for 2024 yet.");

      const stmt = db.prepare(`
        INSERT INTO yearly_points (athlete_id, year, starting_points)
        VALUES (?, ?, ?)
        ON CONFLICT(athlete_id, year)
        DO UPDATE SET
          starting_points = excluded.starting_points
      `);

      rows.forEach(r => {
        // r.closing_points is AFTER penalty,
        // this becomes the baseline for new season
        const carry = r.closing_points ?? 0;
        stmt.run(r.athlete_id, newYear, carry);
      });

      stmt.finalize(err2 => {
        if (err2) return res.send("Error saving starting points: " + err2.message);
        console.log(`✅ 2025 starting points generated from adjusted 2024 closings.`);
        res.redirect("/points/overview");
      });
    }
  );
});

// ===============================
// 4️⃣ Points history for one athlete
// ===============================
router.get("/history/:athleteId", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const athleteId = req.params.athleteId;
  db.all(
    "SELECT * FROM points_history WHERE athlete_id = ? ORDER BY date DESC",
    [athleteId],
    (err, history) => {
      if (err) return res.send("DB error: " + err.message);
      db.get("SELECT full_name FROM athletes WHERE id = ?", [athleteId], (err2, athlete) => {
        res.render("points_history", { history, athlete });
      });
    }
  );
});

// ===============================
// 5️⃣ Add manual entry to history
// ===============================
router.post("/history/add", ensureAuthenticated, ensureAdminOrCoach, (req, res) => {
  const { athlete_id, points, reason } = req.body;
  db.run(
    "INSERT INTO points_history (athlete_id, date, points, reason) VALUES (?, datetime('now'), ?, ?)",
    [athlete_id, points, reason],
    (err) => {
      if (err) return res.send("Error: " + err.message);
      db.run("UPDATE athletes SET total_points = total_points + ? WHERE id = ?", [points, athlete_id]);
      res.redirect("/points/history/" + athlete_id);
    }
  );
});

module.exports = router;
