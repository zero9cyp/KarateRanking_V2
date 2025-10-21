const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/karate_ranking.db');

function logAction(adminId, action, targetUserId=null) {
    const stmt = `INSERT INTO admin_logs (admin_id, action, target_user_id) VALUES (?,?,?)`;
    db.run(stmt, [adminId, action, targetUserId]);
}

module.exports = { logAction };
