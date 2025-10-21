const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

/**
 * Compute points for all unapproved results
 */
function computePoints(callback) {
    // Step 1: Get all unapproved results
    const resultsQuery = `
        SELECT r.id, r.athlete_id, r.tournament_id, r.age_category_id, r.weight_category_id, 
               r.placement, r.wins, r.participated, r.countries_participated, 
               t.difficulty_multiplier, t.is_international
        FROM results r
        JOIN tournaments t ON r.tournament_id = t.id
        WHERE r.approved=0
    `;

    db.all(resultsQuery, [], (err, results) => {
        if (err) return callback(err);

        results.forEach(result => {
            let totalPoints = 0;

            // Participation points (4 per tournament)
            if(result.participated) totalPoints += 4;

            // Placement points (Cyprus rules)
            switch(result.placement){
                case 1: totalPoints += 70; break;
                case 2: totalPoints += 50; break;
                case 3: totalPoints += 30; break;
                case 5: totalPoints += 20; break;
                case 7: totalPoints += 10; break;
                case 9: totalPoints += 5; break;
            }

            // Win points (each win = 8 points)
            if(result.wins) totalPoints += result.wins * 8;

            // International bonus: at least 3 countries AND at least 1 win
            if(result.is_international && result.countries_participated >=3 && result.wins >=1){
                totalPoints *= 1.2; // 20% bonus for international tournaments
            }

            // Difficulty multiplier
            if(result.difficulty_multiplier && result.difficulty_multiplier > 1){
                totalPoints *= result.difficulty_multiplier;
            }

            // Round total points
            totalPoints = Math.round(totalPoints);

            // Update result table
            db.run(`UPDATE results SET points_earned=?, approved=1 WHERE id=?`, [totalPoints, result.id]);

            // Update athlete total points
            db.get(`SELECT total_points FROM athletes WHERE id=?`, [result.athlete_id], (err2, row)=>{
                let newTotal = (row.total_points || 0) + totalPoints;
                db.run(`UPDATE athletes SET total_points=? WHERE id=?`, [newTotal, result.athlete_id]);

                // Log in points_history
                db.run(`INSERT INTO points_history (athlete_id, date, points, reason) VALUES (?,?,?,?)`,
                    [result.athlete_id, new Date().toISOString(), totalPoints, `Tournament ID ${result.tournament_id}`]);
            });
        });

        callback(null, { message: 'Points computation completed' });
    });
}

module.exports = { computePoints };
