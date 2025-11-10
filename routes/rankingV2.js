const express = require("express");
const router = express.Router();
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../db/karate_ranking.db"));

// -----------------
// Default general ranking (if you want to keep it)
// -----------------
router.get("/", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM ranking_kumite ORDER BY total_points DESC;").all();
    res.render("ranking-v2", { title: "General Ranking", rows });
  } catch (err) {
    console.error("Error loading general ranking:", err);
    res.status(500).send("Σφάλμα φόρτωσης κατάταξης");
  }
});

// 🥋 Kumite Ranking
router.get("/kumite", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM ranking_kumite ORDER BY total_points DESC;").all();
    res.render("ranking-v2", { title: "Kumite Ranking", rows });
  } catch (err) {
    console.error("Error loading Kumite ranking:", err);
    res.status(500).send("Σφάλμα φόρτωσης κατάταξης KUMITE");
  }
});

// 🧘 Kata Ranking
router.get("/kata", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM ranking_kata ORDER BY total_points DESC;").all();
    res.render("ranking-v2", { title: "Kata Ranking", rows });
  } catch (err) {
    console.error("Error loading Kata ranking:", err);
    res.status(500).send("Σφάλμα φόρτωσης κατάταξης KATA");
  }
});

module.exports = router;
