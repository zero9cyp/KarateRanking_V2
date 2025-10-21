const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const DB_FILE = './db/karate_ranking.db';

// Delete existing DB (optional)
if (fs.existsSync(DB_FILE)) {
  fs.unlinkSync(DB_FILE);
  console.log('Old database deleted');
}

// Connect to DB
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Database created successfully');
  }
});

// SQL script to create tables and views
const sqlScript = `
BEGIN TRANSACTION;

-- Users and admin logs
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user', 'rules', 'superuser')),
    reset_token TEXT,
    reset_expires DATETIME,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id)
);

-- Clubs
CREATE TABLE IF NOT EXISTS clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Age categories
CREATE TABLE IF NOT EXISTS age_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    min_age INTEGER NOT NULL,
    max_age INTEGER NOT NULL,
    notes TEXT
);

-- Weight categories
CREATE TABLE IF NOT EXISTS weight_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    age_category_id INTEGER NOT NULL,
    gender TEXT CHECK(gender IN ('male','female')) NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (age_category_id) REFERENCES age_categories(id)
);

-- Athletes
CREATE TABLE IF NOT EXISTS athletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    gender TEXT CHECK(gender IN ('male','female')) NOT NULL,
    age_category_id INTEGER,
    weight_category_id INTEGER,
    club_id INTEGER,
    total_points INTEGER DEFAULT 0,
    last_updated DATETIME,
    FOREIGN KEY (age_category_id) REFERENCES age_categories(id),
    FOREIGN KEY (weight_category_id) REFERENCES weight_categories(id),
    FOREIGN KEY (club_id) REFERENCES clubs(id)
);

-- Track Last Participation
CREATE TABLE IF NOT EXISTS athlete_last_participation (
    athlete_id INTEGER PRIMARY KEY,
    last_national_participation DATETIME,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

-- Category Changes
CREATE TABLE IF NOT EXISTS category_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL,
    old_age_category_id INTEGER,
    new_age_category_id INTEGER,
    old_weight_category_id INTEGER,
    new_weight_category_id INTEGER,
    change_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id),
    FOREIGN KEY (old_age_category_id) REFERENCES age_categories(id),
    FOREIGN KEY (new_age_category_id) REFERENCES age_categories(id),
    FOREIGN KEY (old_weight_category_id) REFERENCES weight_categories(id),
    FOREIGN KEY (new_weight_category_id) REFERENCES weight_categories(id)
);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date DATETIME NOT NULL,
    location TEXT,
    type TEXT,
    difficulty_multiplier REAL DEFAULT 1,
    is_international INTEGER DEFAULT 0,
    requires_approval INTEGER DEFAULT 0,
    exclude_from_scoring INTEGER DEFAULT 0,
    min_countries INTEGER DEFAULT 3,
    min_age INTEGER,
    max_age INTEGER
);

-- Tournament Registrations
CREATE TABLE IF NOT EXISTS tournament_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    athlete_id INTEGER NOT NULL,
    approved INTEGER DEFAULT 0,
    override_allowed INTEGER DEFAULT 0,
    approved_by TEXT,
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, athlete_id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

-- Results
CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL,
    tournament_id INTEGER NOT NULL,
    age_category_id INTEGER,
    weight_category_id INTEGER,
    placement INTEGER,
    wins INTEGER DEFAULT 0,
    participated INTEGER DEFAULT 0,
    approved INTEGER DEFAULT 0,
    countries_participated INTEGER DEFAULT 1,
    points_earned INTEGER DEFAULT 0,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (age_category_id) REFERENCES age_categories(id),
    FOREIGN KEY (weight_category_id) REFERENCES weight_categories(id)
);

-- Points History
CREATE TABLE IF NOT EXISTS points_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    athlete_id INTEGER NOT NULL,
    date DATETIME NOT NULL,
    points INTEGER,
    reason TEXT,
    FOREIGN KEY (athlete_id) REFERENCES athletes(id)
);

-- Points Lookup Tables
CREATE TABLE IF NOT EXISTS win_points (
    wins INTEGER PRIMARY KEY,
    points INTEGER
);

CREATE TABLE IF NOT EXISTS placement_points (
    placement INTEGER PRIMARY KEY,
    points INTEGER
);

CREATE TABLE IF NOT EXISTS participation_points (
    participation_order INTEGER PRIMARY KEY,
    points INTEGER
);

-- Views
CREATE VIEW IF NOT EXISTS athlete_details AS
SELECT a.id, a.first_name || ' ' || a.last_name AS full_name, a.birth_date, a.gender,
       ac.name AS age_category, wc.name AS weight_category, a.total_points, c.name AS club_name
FROM athletes a
LEFT JOIN age_categories ac ON a.age_category_id = ac.id
LEFT JOIN weight_categories wc ON a.weight_category_id = wc.id
LEFT JOIN clubs c ON a.club_id = c.id;

CREATE VIEW IF NOT EXISTS points_history_details AS
SELECT ph.id, ph.athlete_id, a.first_name || ' ' || a.last_name AS full_name, ph.date, ph.points, ph.reason
FROM points_history ph
JOIN athletes a ON ph.athlete_id = a.id;

CREATE VIEW IF NOT EXISTS tournament_results AS
SELECT r.id, r.tournament_id, t.name AS tournament_name, t.date,
       r.athlete_id, a.first_name || ' ' || a.last_name AS athlete_name,
       r.age_category_id, ac.name AS age_category,
       r.weight_category_id, wc.name AS weight_category,
       r.placement, r.wins, r.participated, r.approved, r.points_earned
FROM results r
JOIN tournaments t ON r.tournament_id = t.id
JOIN athletes a ON r.athlete_id = a.id
LEFT JOIN age_categories ac ON r.age_category_id = ac.id
LEFT JOIN weight_categories wc ON r.weight_category_id = wc.id;

COMMIT;
`;

db.exec(sqlScript, (err) => {
  if (err) {
    console.error('Error creating tables', err.message);
  } else {
    console.log('All tables and views created successfully!');
  }
  db.close();
});
