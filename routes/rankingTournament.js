const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../db/karate_ranking.db'));

/**
 * /ranking/tournament/:id
 * Προβολή κατάταξης για συγκεκριμένο τουρνουά με:
 * - Χωρισμό ανά Discipline (KATA / KUMITE / MIXED)
 * - Χωρισμό ανά Ηλικιακή κατηγορία & Κατηγορία βάρους
 * - Auto podium (🥇🥈🥉) + πλήρης πίνακας
 * - Εμφάνιση ΟΛΩΝ των αποτελεσμάτων (approved & μη)
 *   -> μπορείς να φιλτράρεις με ?approved=1 αν θες μόνο εγκεκριμένα
 */
router.get('/tournament/:id', (req, res) => {
  const tournamentId = parseInt(req.params.id, 10);
  const approvedOnly = req.query.approved === '1'; // προαιρετικό φίλτρο

  if (!tournamentId) return res.status(400).send('Λάθος τουρνουά.');

  const sqlTournament = `SELECT id, name, date, location, type, event_type FROM tournaments WHERE id=?`;
  const sqlResults = `
    SELECT 
      r.id AS result_id,
      r.tournament_id,
      r.event_type,
      r.age_category_id,
      r.weight_category_id,
      r.placement,
      r.wins,
      r.points_earned,
      r.season_year,
      r.approved,

      a.id AS athlete_id,
      a.full_name,
      a.gender,
      c.name AS club_name,

      ac.name AS age_category_name,
      ac.min_age AS age_min,
      ac.max_age AS age_max,

      wc.name AS weight_category_name
    FROM results r
    JOIN athletes a ON a.id = r.athlete_id
    LEFT JOIN clubs c ON c.id = a.club_id
    LEFT JOIN age_categories ac ON ac.id = r.age_category_id
    LEFT JOIN weight_categories wc ON wc.id = r.weight_category_id
    WHERE r.tournament_id = ?
    ${approvedOnly ? 'AND r.approved = 1' : ''}
    ORDER BY 
      COALESCE(r.event_type,'MIXED') ASC,
      ac.min_age ASC,
      wc.name COLLATE NOCASE ASC,
      CASE WHEN r.placement IS NULL OR r.placement=0 THEN 999 ELSE r.placement END ASC,
      a.full_name COLLATE NOCASE ASC
  `;

  db.get(sqlTournament, [tournamentId], (errT, tournament) => {
    if (errT) return res.status(500).send('DB error: ' + errT.message);
    if (!tournament) return res.status(404).send('Το τουρνουά δεν βρέθηκε.');

    db.all(sqlResults, [tournamentId], (errR, rows) => {
      if (errR) return res.status(500).send('DB error: ' + errR.message);

      // Ομαδοποίηση: Discipline -> Age -> Weight
      // key: `${discipline}||${ageName}||${weightName}`
      const groups = {};
      rows.forEach(r => {
        const discipline = (r.event_type || tournament.event_type || 'MIXED').toUpperCase();
        const ageName = r.age_category_name || '-';
        const weightName = r.weight_category_name || '-';

        const key = `${discipline}||${ageName}||${weightName}`;
        if (!groups[key]) {
          groups[key] = {
            discipline,
            ageName,
            weightName,
            items: []
          };
        }
        groups[key].items.push(r);
      });

      // Εύρεση podium (top 3) per group:
      const groupList = Object.values(groups).map(g => {
        // ταξινόμηση για podium: 1) placement (μη μηδενικό), 2) points desc
        const sorted = [...g.items].sort((a, b) => {
          const pa = (a.placement && a.placement > 0) ? a.placement : 999;
          const pb = (b.placement && b.placement > 0) ? b.placement : 999;
          if (pa !== pb) return pa - pb;
          // αν ισοβαθμία ή χωρίς placement -> με βάση points_earned desc
          return (b.points_earned || 0) - (a.points_earned || 0);
        });
        g.podium = sorted.slice(0, 3);
        return g;
      });

      res.render('ranking/ranking-tournament', {
        tournament,
        approvedOnly,
        groups: groupList
      });
    });
  });
});

module.exports = router;
