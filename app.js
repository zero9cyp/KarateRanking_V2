// app.js

// -------------------------------
// Load environment variables
// -------------------------------
require('dotenv').config(); // Must be first line

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const { ensureAuthenticated, ensureAdmin } = require('./middleware/auth');

const app = express();

// -------------------------------
// Safety check for SESSION_SECRET
// -------------------------------
if (!process.env.SESSION_SECRET) {
  throw new Error('❌ SESSION_SECRET is not set in your .env file');
}

// -------------------------------
// Body parsing middleware
// -------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -------------------------------
// Static files & views
// -------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout'); // default layout file in /views/layout.ejs

// -------------------------------
// Session middleware
// Must come before flash and routes
// -------------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET, // only from .env
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2 hours
  })
);

// -------------------------------
// Flash messages
// -------------------------------
app.use(flash());

// -------------------------------
// Global middleware for views
// Sets user and flash messages for all templates
// -------------------------------
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null; // logged-in user
  res.locals.user = req.session.user || null;       // alias for templates
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// Optional: import custom globals middleware if needed
// app.use(require('./middleware/globals'));

// -------------------------------
// ROUTES
// -------------------------------
const dashboardRouter = require('./routes/dashboard');
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/authRoutes');
const athletesRouter = require('./routes/athletes');
const tournamentsRouter = require('./routes/tournaments');
const clubsRouter = require('./routes/clubs');
const ageCategoriesRouter = require('./routes/ageCategories');
const weightCategoriesRouter = require('./routes/weightCategories');
const rankingRouter = require('./routes/ranking');
const logsRouter = require('./routes/logs');
const backupRouter = require('./routes/backup');
const restoreRouter = require('./routes/restore');
const computePointsRouter = require('./routes/computePoints');
const adminResultsRouter = require('./routes/adminResults');
const adminRoutes = require('./routes/admin');
const routeUsers =  require('./routes/users')
const routeEditor = require('./routes/editor')
const rankingV2 = require("./routes/rankingV2.js");
const athleteHistoryV2 = require("./routes/athleteHistoryV2.js");
const adminRecalculateV2 = require("./routes/adminRecalculateV2");
const routeAdminPanel =  require("./routes/adminPanelV2")
const pointsRoutes = require("./routes/points");
const adminRecalculateTotals = require('./routes/adminRecalculateTotals');
const adminRankingEditor = require("./routes/adminRankingEditor");
const rankingPublic = require("./routes/rankingPublic");
const apiWeights = require("./routes/apiWeights");
const adminResultsManager = require("./routes/adminResults");
const editorFull = require("./routes/editorFull");
// -------------------------------
// Home route
// -------------------------------
app.get('/', (req, res) => {
  // if (req.session.user) return res.redirect('/athletes');
  res.render('home', { title: 'Karate Ranking' });
});

// -------------------------------
// Public routes
// -------------------------------
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
// app.use('/ranking', rankingRouter); // ❌ Παλιά δημόσια κατάταξη
app.use('/ranking', rankingV2);       // ✅ Νέα κατάταξη για KUMITE & KATA
app.use('/index', ensureAuthenticated, indexRoutes);
app.use("/ranking-public", rankingPublic);
// -------------------------------
// Authenticated-only routes
// -------------------------------
app.use('/athletes', ensureAuthenticated, athletesRouter);
app.use('/tournaments', ensureAuthenticated, tournamentsRouter);
app.use('/clubs', ensureAuthenticated, clubsRouter);
app.use('/ageCategories', ensureAuthenticated, ageCategoriesRouter);
app.use('/weightCategories', ensureAuthenticated, weightCategoriesRouter);
app.use('/compute-points', ensureAuthenticated, computePointsRouter);
app.use('/', ensureAuthenticated, adminRoutes);
app.use("/points", pointsRoutes);
// -------------------------------
// Coach/Admin Dashboard
// -------------------------------
app.use('/dashboard', ensureAuthenticated, dashboardRouter);
app.get('/dashboard', (req, res) => {
  res.render('dashboard', { title: 'Dashboard', currentUser: req.session.user });
});

// -------------------------------
// Admin-only routes
// -------------------------------
app.use('/users', ensureAdmin, routeUsers);
app.use('/logs', ensureAdmin, logsRouter);
app.use('/backup', ensureAdmin, backupRouter);
app.use('/restore', ensureAdmin, restoreRouter);
app.use('/admin/results', ensureAdmin, adminResultsRouter);
app.use('/editor', ensureAdmin, routeEditor);
app.use("/ranking-v2", rankingV2);
app.use("/athlete", ensureAuthenticated, athleteHistoryV2);
app.use("/admin",ensureAuthenticated, routeAdminPanel);
app.use("/", ensureAuthenticated, adminRecalculateV2);
app.use('/admin/recalculate-totals', ensureAdmin, adminRecalculateTotals);
app.use("/admin/ranking-editor", ensureAdmin, adminRankingEditor);
app.use("/api", apiWeights);
app.use("/admin/results", ensureAdmin, adminResultsManager);
app.use("/editor-full", ensureAdmin, editorFull);

// -------------------------------
// 404 fallback
// -------------------------------
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

// -------------------------------
// Start server
// -------------------------------
const PORT = process.env.PORT;

app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
