const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

const db = new sqlite3.Database('./db/karate_ranking.db');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

db.serialize(() => {
  console.log("🔍 Scanning for duplicates by name...");

  db.all(`
    SELECT LOWER(TRIM(full_name)) AS name_lower, GROUP_CONCAT(id) AS ids
    FROM athletes
    GROUP BY name_lower
    HAVING COUNT(*) > 1
  `, [], async (err, duplicates) => {
    if (err) throw err;

    console.log(`\nFound ${duplicates.length} duplicate groups\n`);

    const actions = [];

    for (const group of duplicates) {
      const ids = group.ids.split(',').map(x => parseInt(x));
      if (ids.length < 2) continue;

      const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM athletes WHERE id IN (${ids.join(',')})`, [], (e, r) => e ? reject(e) : resolve(r));
      });

      const keep = rows.reduce((a, b) => (b.total_points > (a.total_points ?? 0) ? b : a), rows[0]);
      const keepId = keep.id;
      const removeIds = ids.filter(id => id !== keepId);

      if (removeIds.length === 0) continue;

      const genders = [...new Set(rows.map(r => r.gender))].join(',');
      const ages = [...new Set(rows.map(r => r.age_category_id))].join(',');

      actions.push({ name: keep.full_name, keepId, removeIds, genders, ages });
    }

    console.log("🧾 DRY RUN — upcoming merges:\n");
    actions.slice(0, 25).forEach(a => {
      console.log(`→ ${a.name} [keep ${a.keepId}] remove [${a.removeIds.join(', ')}] genders(${a.genders}) ages(${a.ages})`);
    });
    console.log(`\nTotal ${actions.length} merges found.`);

    rl.question('\nProceed with actual merge? (y/n): ', async (ans) => {
      if (ans.toLowerCase() !== 'y') {
        console.log("❌ Aborted. No changes made.");
        rl.close();
        db.close();
        return;
      }

      for (const a of actions) {
        try {
          console.log(`\n🧹 Merging ${a.name} → keeping ID ${a.keepId}`);
          await runAsync("BEGIN TRANSACTION");

          await runAsync(
            `UPDATE results SET athlete_id = ? WHERE athlete_id IN (${a.removeIds.join(',')})`,
            [a.keepId]
          );

          await runAsync(`DELETE FROM athletes WHERE id IN (${a.removeIds.join(',')})`);

          await runAsync("COMMIT");
          console.log(`✅ Cleaned ${a.name} (kept ${a.keepId})`);
        } catch (err) {
          console.error("❌ Error merging", a.name, ":", err.message);
          try { await runAsync("ROLLBACK"); } catch {}
        }
      }

      console.log("\n🏁 All merges complete!");
      rl.close();
      db.close();
    });
  });
});
