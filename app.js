// app.js
require('dotenv').config(); // <-- add this at the very top to use .env
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const { ensureAuthenticated, ensureAdmin } = require('./middleware/auth');

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
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mySuperSecretLocalDevKey',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 2 * 60 * 60 * 1000 } // optional: 2 hours
  })
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success_msg = req.flash('success_msg') || [];
  res.locals.error_msg = req.flash('error_msg') || [];
  next();
});


// Make currentUser & messages available globally
app.use(require('./middleware/globals'));

// Make flash & user available in views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.session.user || null;
  next();
});

// ROUTES
// const indexRoutes = require('./routes/index');
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
const computePointsRouter = require('./routes/computePoints')
app.use('/users', ensureAdmin, require('./routes/users'));

// ✅ Public routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/ranking', rankingRouter); // Public ranking view
app.use('/users', ensureAdmin, require('./routes/users'));

// ✅ Authenticated-only routes
app.use('/athletes', ensureAuthenticated, athletesRouter);
app.use('/tournaments', ensureAuthenticated, tournamentsRouter);
app.use('/clubs', ensureAuthenticated, clubsRouter);
app.use('/ageCategories', ensureAuthenticated, ageCategoriesRouter);
app.use('/weightCategories', ensureAuthenticated, weightCategoriesRouter);
app.use('/compute-points', ensureAuthenticated, computePointsRouter);

// ✅ Admin-only routes
app.use('/logs', ensureAdmin, logsRouter);
app.use('/backup', ensureAdmin, backupRouter);
app.use('/restore', ensureAdmin, restoreRouter);

// Home route
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/athletes');
  res.render('home', { title: 'Karate Ranking' });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page not found' });
});

// Start
const PORT = process.env.PORT || 2025;

app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
