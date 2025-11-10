const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const router = express.Router();

const db = new Database(path.join(__dirname, "../db/karate_ranking.db"));

router.get("/weights", (req, res) => {
  const ageId = parseInt(req.query.age_id);
  if (!ageId) return res.json([]);
  const weights = db.prepare("SELECT id, name FROM weight_categories WHERE age_category_id = ? ORDER BY name ASC").all(ageId);
  res.json(weights);
});

module.exports = router;
