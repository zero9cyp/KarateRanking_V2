// app.js
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const app = express();

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static + views
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);

app.set('layout', 'layout'); // default layout file in /views/layout.ejs

// Sessions + flash
app.use(session({
  secret: 'karate_secret_key_change_this',
  resave: false,
  saveUninitialized: true
}));
app.use(flash());

// Make flash & user available in views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.session.user || null;
  next();
});

// ROUTES - ensure these files exist under /routes or /middleware
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/authRoutes');           // router for /auth
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
const rankingRoutes = require('./routes/ranking');

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/athletes', athletesRouter);
app.use('/tournaments', tournamentsRouter);
app.use('/clubs', clubsRouter);
app.use('/ageCategories', ageCategoriesRouter);
app.use('/weightCategories', weightCategoriesRouter);
app.use('/ranking', rankingRouter);
app.use('/logs', logsRouter);
app.use('/backup', backupRouter);
app.use('/restore', restoreRouter);
app.use('/compute-points', computePointsRouter);
app.use('/ranking', rankingRoutes);

// Home route
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/auth/login');
  res.redirect('/athletes');
});

// Start
const PORT = process.env.PORT || 2025;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));