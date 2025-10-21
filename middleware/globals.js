// middleware/globals.js
module.exports = (req, res, next) => {
  // Make the logged-in user available in all EJS templates
  res.locals.currentUser = req.session?.user || null;

  // Make flash messages available globally
  res.locals.success_msg = req.flash('success_msg') || null;
  res.locals.error_msg = req.flash('error_msg') || null;
  res.locals.error = req.flash('error') || null;

  next();
};
