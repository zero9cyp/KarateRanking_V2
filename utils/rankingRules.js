// utils/rankingRules.js
//
// ΕΝΟΠΟΙΗΜΕΝΟΙ ΚΑΝΟΝΕΣ σύμφωνα με τον ΟΔΗΓΟ (2018)
// ΟΛΟΙ οι υπολογισμοί περνούν από εδώ.

const PLACEMENT_POINTS = {
  1: 70,
  2: 50,
  3: 30,
  5: 20,
  7: 10,
  9: 5,
};

const WIN_POINTS = 8;      // 8/νίκη
const PARTICIPATION = 4;   // 4 συμμετοχή

// Χαρτογράφηση τύπου τουρνουά -> multiplier (σύμφωνα με πίνακα οδηγού)
const TOURNAMENT_MULTIPLIERS = {
  // Παγκύπριο
  NATIONAL_CHAMPIONSHIP: 1.0,

  // Μικρά κράτη Ευρώπης (Karate only)
  SMALL_STATES_KARATE: 1.5,

  // Βαλκανικά / Μεσογειακά / Youth League / Series A / Small States (all sports)
  BALKAN: 2.0,
  MEDITERRANEAN: 2.0,
  YOUTH_LEAGUE: 2.0,      // * κατόπιν απόφασης Ομοσπονδίας
  SERIES_A: 2.0,          // * κατόπιν απόφασης Ομοσπονδίας
  SMALL_STATES_ALL: 2.0,

  // Μεσογειακοί Αγώνες / Ευρωπαϊκά U21/Junior
  MEDITERRANEAN_GAMES: 3.0,
  EUROPEAN_U21_JUNIOR: 3.0,

  // Ευρωπαϊκό Ανδρών/Γυναικών / Premier League / European Games
  EUROPEAN_SENIORS: 4.0,
  PREMIER_LEAGUE: 4.0,    // * κατόπιν απόφασης Ομοσπονδίας
  EUROPEAN_GAMES: 4.0,    // * κατόπιν απόφασης Ομοσπονδίας

  // Παγκόσμια U21/Junior
  WORLD_U21_JUNIOR: 4.0,

  // Παγκόσμιο Ανδρών/Γυναικών
  WORLD_SENIORS: 5.0,
};

// Αν ένα τουρνουά απαιτεί έγκριση ομοσπονδίας (τα * στον οδηγό)
function requiresFederationApproval(type) {
  return ['YOUTH_LEAGUE','SERIES_A','PREMIER_LEAGUE','EUROPEAN_GAMES'].includes(type);
}

// Διεθνές eligibility: τουλάχιστον 3 χώρες + ≥1 νίκη
function internationalEligible({ isInternational, countriesParticipated, wins }) {
  if (!isInternational) return true; // Αν δεν είναι διεθνές, δεν ισχύει ο έλεγχος
  return (countriesParticipated >= 3) && (wins >= 1);
}

// Υπολογισμός πόντων ενός αποτελέσματος
function calculateResultPoints({
  placement, wins, participated,
  tournamentType, isInternational,
  countriesParticipated, federationApproved
}) {
  const basePlacement = PLACEMENT_POINTS[placement] || 0;
  const winsBonus = (wins || 0) * WIN_POINTS;
  const participation = participated ? PARTICIPATION : 0;

  // Multipliers
  const type = (tournamentType || 'NATIONAL_CHAMPIONSHIP').toUpperCase();
  const multiplier = TOURNAMENT_MULTIPLIERS[type] || 1.0;

  // Αν απαιτείται έγκριση ομοσπονδίας → πρέπει να έχει εγκριθεί
  if (requiresFederationApproval(type) && !federationApproved) {
    return 0;
  }

  // Αν είναι διεθνές → πρέπει να ισχύει eligibility (όχι boost· gate!)
  if (!internationalEligible({ isInternational, countriesParticipated, wins })) {
    return 0;
  }

  const raw = basePlacement + winsBonus + participation;
  return Math.round(raw * multiplier);
}

// Μείωση λόγω αλλαγής ηλικιακής: -50%
function carryOverAgeUp(total) {
  return Math.round(total * 0.5);
}

// Μείωση λόγω αλλαγής κιλών: -25%
function carryOverWeightChange(total) {
  return Math.round(total * 0.75);
}

// Ετήσια μείωση κατηγορίας Ανδρών/Γυναικών: -25%
function applySeniorYearlyReduction(total) {
  return Math.round(total * 0.75);
}

module.exports = {
  calculateResultPoints,
  carryOverAgeUp,
  carryOverWeightChange,
  applySeniorYearlyReduction,
  TOURNAMENT_MULTIPLIERS,
  requiresFederationApproval,
  internationalEligible,
  PLACEMENT_POINTS,
  WIN_POINTS,
  PARTICIPATION
};
