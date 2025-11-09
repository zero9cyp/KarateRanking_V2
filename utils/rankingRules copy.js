// rankingRules.js
//
// This module encodes the federation rules for athlete ranking.
// All functions are pure. No DB calls, no req/res, no dates from system, etc.
// You feed it data, it gives you answers.

const RANKING_RULES = {
  // Tournament "types" and their multipliers.
  // You will map each real tournament in DB to one of these keys.
  multipliers: {
    NATIONAL_CHAMPIONSHIP: 1.0,     // Παγκύπριο Πρωτάθλημα
    NATIONAL_CUP: 0.75,             // Κύπελλο / Open Cyprus event
    INTERNATIONAL_OPEN: 1.25,       // International Open / AMKE / etc.
    PREMIER: 1.5,                   // high-prestige (if federation has this tier)
  },

  // Placement base points before multiplier.
  // Example values (we’ll adjust these using your PDF in a moment).
  placementPointsByPosition: {
    1: 30,
    2: 21,
    3: 15, // 3rd
    4: 10, // optional if you give 4th
  },

  // Points per individual match/win in kumite (if applicable).
  // If kata also awards per-round wins we can split later.
  pointsPerWin: 1,

  // Participation points just for stepping on the tatami (if rule exists).
  participationPoints: 1,

  // Max number of scoring events considered per season for final standing
  // (some federations take best X tournaments, not all).
  maxEventsCountedPerSeason: 6,

  // Senior decay % per year if athlete stops competing at senior
  seniorDecayPercentPerYear: 0.2, // 20% reduction per year

  // If athlete changes AGE CATEGORY (e.g. U14 -> U16)
  // how much of their old total "carries" upward.
  carryToNextAgePercent: 0.5, // 50%

  // If athlete changes WEIGHT CATEGORY in SAME age group,
  // usually either keep all or keep %.
  carryAcrossWeightsPercent: 1.0, // 100% keep unless rules say otherwise

  // Inactivity full reset rule:
  // e.g. "If athlete does NOT appear at National Championship for 12 months,
  // reset to zero."
  inactivityResetMonths: 12,
};

// -------------- BASIC HELPERS --------------

function getMultiplier(tournamentType) {
  return RANKING_RULES.multipliers[tournamentType] ?? 1.0;
}

function getPlacementBasePoints(place) {
  return RANKING_RULES.placementPointsByPosition[place] ?? 0;
}

// Points from result in ONE tournament category (kata or kumite)
function calcEventPoints({
  place,             // 1,2,3,4...
  wins,              // integer wins
  participated,      // boolean
  tournamentType,    // one of keys in multipliers
}) {
  const basePlacement = getPlacementBasePoints(place);
  const winPoints = (wins || 0) * RANKING_RULES.pointsPerWin;
  const participation = participated ? RANKING_RULES.participationPoints : 0;

  const subtotal = basePlacement + winPoints + participation;
  const factor = getMultiplier(tournamentType);

  const total = subtotal * factor;

  return {
    basePlacement,
    winPoints,
    participation,
    factor,
    eventTotal: total,
  };
}

// -------------- CARRY / REDUCTIONS --------------

// When athlete moves from U14 -> U16, etc.
function applyAgeCategoryCarry(prevPointsTotal) {
  return prevPointsTotal * RANKING_RULES.carryToNextAgePercent;
}

// When athlete moves weight inside same age (ex -57kg -> -63kg).
function applyWeightCategoryCarry(prevPointsTotal) {
  return prevPointsTotal * RANKING_RULES.carryAcrossWeightsPercent;
}

// Yearly decay for seniors not competing.
function applySeniorDecay(prevPointsTotal, inactiveYears) {
  // after each year: total = total * (1 - decay%)^years
  const keepFactor = Math.pow(
    1 - RANKING_RULES.seniorDecayPercentPerYear,
    inactiveYears
  );
  return prevPointsTotal * keepFactor;
}

// If athlete inactive (no appearance in Nat. Championship for > X months)
// then reset to 0.
function applyInactivityReset({
  lastNatChampDate, // Date
  nowDate,          // Date
  currentPoints,
}) {
  if (!lastNatChampDate) return 0; // never competed -> 0
  const msInMonth = 1000 * 60 * 60 * 24 * 30;
  const diffMonths =
    (nowDate - lastNatChampDate) / msInMonth;

  if (diffMonths > RANKING_RULES.inactivityResetMonths) {
    return 0;
  }
  return currentPoints;
}

// -------------- SEASON AGGREGATION --------------

// Given a list of event results for 1 athlete for 1 season,
// return season total + breakdown
//
// results = [
//   {
//     tournamentId,
//     tournamentName,
//     tournamentType,
//     category: 'kumite' | 'kata',
//     place: 1|2|3|4|...,
//     wins: 4,
//     participated: true,
//     date: new Date('2024-03-10'),
//   },
//   ...
// ]
//
// We will later call this separately for kata and kumite
// if federation keeps separate rankings per discipline.
//
function calcSeasonRanking(results) {
  // 1. compute raw points for each event
  const scored = results.map(r => {
    const details = calcEventPoints({
      place: r.place,
      wins: r.wins,
      participated: r.participated,
      tournamentType: r.tournamentType,
    });

    return {
      ...r,
      ...details,
    };
  });

  // 2. sort events by eventTotal desc
  scored.sort((a, b) => b.eventTotal - a.eventTotal);

  // 3. take best N (rule: maxEventsCountedPerSeason)
  const best = scored.slice(0, RANKING_RULES.maxEventsCountedPerSeason);

  // 4. sum
  const totalPoints = best.reduce((sum, e) => sum + e.eventTotal, 0);

  return {
    totalPoints,
    bestEvents: best,
    droppedEvents: scored.slice(RANKING_RULES.maxEventsCountedPerSeason),
  };
}

// -------------- AUDIT HISTORY --------------
//
// Build a nice ledger for UI like:
// 2024-03-10  Cyprus Nationals  Kumite -57kg   +42 pts  (1st place, 4 wins, x1.0)
// 2024-07-02  AMKE Games        Kumite -57kg   +28 pts  (3rd place, 2 wins, x1.25)
// 2024-09-01  Age bump U14->U16 carry 50%:     -55 pts (old 110 -> keep 55)
// etc.
//
function buildAthletePointHistory({
  seasons, // { '2023': [results...], '2024': [results...] }
  transitions, // array of events that modify carry/decay/reset etc, in chrono order
  nowDate,
}) {
  const ledger = [];
  let runningTotal = 0;

  // 1. per season results
  const seasonKeys = Object.keys(seasons).sort();
  for (const year of seasonKeys) {
    const seasonCalc = calcSeasonRanking(seasons[year]);
    seasonCalc.bestEvents.forEach(ev => {
      ledger.push({
        date: ev.date,
        type: 'event',
        desc: `${ev.tournamentName} (${ev.category}) place ${ev.place}`,
        delta: ev.eventTotal,
        meta: {
          place: ev.place,
          wins: ev.wins,
          factor: ev.factor,
          tournamentType: ev.tournamentType,
          tournamentId: ev.tournamentId,
        },
      });
      runningTotal += ev.eventTotal;
    });

    // droppedEvents are not counted, but we still COULD log them if we want for UI.
  }

  // 2. transitions (age up, weight change, inactivity, senior decay, etc)
  // We assume each transition item looks like:
  // {
  //   date: new Date(),
  //   kind: 'AGE_UP' | 'WEIGHT_CHANGE' | 'SENIOR_DECAY' | 'INACTIVITY_RESET',
  //   payload: {...} // data needed
  // }
  const sortedTransitions = [...transitions].sort(
    (a, b) => a.date - b.date
  );

  for (const t of sortedTransitions) {
    if (t.kind === 'AGE_UP') {
      const carried = applyAgeCategoryCarry(runningTotal);
      const lost = runningTotal - carried;
      runningTotal = carried;
      ledger.push({
        date: t.date,
        type: 'adjustment',
        desc: `Age category change ${t.from} → ${t.to}, carry ${Math.round(
          RANKING_RULES.carryToNextAgePercent * 100
        )}%`,
        delta: -lost,
        meta: { from: t.from, to: t.to },
      });
    } else if (t.kind === 'WEIGHT_CHANGE') {
      const carried = applyWeightCategoryCarry(runningTotal);
      const lost = runningTotal - carried;
      runningTotal = carried;
      ledger.push({
        date: t.date,
        type: 'adjustment',
        desc: `Weight class change ${t.from} → ${t.to}`,
        delta: -lost,
        meta: { from: t.from, to: t.to },
      });
    } else if (t.kind === 'SENIOR_DECAY') {
      const decayed = applySeniorDecay(
        runningTotal,
        t.payload.inactiveYears
      );
      const lost = runningTotal - decayed;
      runningTotal = decayed;
      ledger.push({
        date: t.date,
        type: 'adjustment',
        desc: `Senior inactivity decay (${t.payload.inactiveYears}y)`,
        delta: -lost,
        meta: { inactiveYears: t.payload.inactiveYears },
      });
    } else if (t.kind === 'INACTIVITY_RESET') {
      const after = applyInactivityReset({
        lastNatChampDate: t.payload.lastNatChampDate,
        nowDate: t.payload.nowDate || nowDate,
        currentPoints: runningTotal,
      });
      const lost = runningTotal - after;
      runningTotal = after;
      ledger.push({
        date: t.date,
        type: 'adjustment',
        desc: `Inactivity reset (> ${RANKING_RULES.inactivityResetMonths} months no Nationals)`,
        delta: -lost,
        meta: {},
      });
    }
  }

  return {
    finalTotal: runningTotal,
    ledger: ledger.sort((a, b) => a.date - b.date),
  };
}

module.exports = {
  RANKING_RULES,
  getMultiplier,
  getPlacementBasePoints,
  calcEventPoints,
  calcSeasonRanking,
  applyAgeCategoryCarry,
  applyWeightCategoryCarry,
  applySeniorDecay,
  applyInactivityReset,
  buildAthletePointHistory,
};
