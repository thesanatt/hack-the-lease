// Every constant the engine uses, with its source. docs/SYSTEM_DESIGN.md section 4 explains each one.
// Engine functions take an optional `cfg` (defaults to CONFIG); the UI Assumptions drawer edits a copy
// through withOverrides() and re-runs. "assumption" means a stated modeling choice, not data.

export const CONFIG = {
  // movement (assumptions)
  walkMs: 1.3,                 // walking speed, m/s
  bikeMs: 4.2,                 // biking speed, m/s (about 15 km/h)
  bikeOverheadS: 120,          // unlock, park and lock
  maxAccessM: 1300,            // longest walk to or from a stop
  searchM: 9000,               // Dijkstra radius per point
  changeDefaultS: 60,          // minimum time to change vehicles at a stop (TheRide transfers.txt overrides)
  horizonS: 3 * 3600,          // scan horizon per query

  // week rules (assumptions)
  homeBreakMin: 150,           // gap that triggers a trip home between entries
  homeBreakFitMin: 30,         // time at home that must fit in the gap

  // generalized time: minutes walking or waiting count more than minutes riding
  mWalk: 1.45,                 // Wardman, Chintakayala, de Jong 2016: urban walk 45% above in-vehicle time
  mWait: 1.50,                 // same source: urban wait 50% above in-vehicle time
  mBike: 1.0,                  // assumption
  slackWeight: 1.0,            // early-arrival slack counts as travel time (assumption)

  // darkness
  darkBikeFactor: 0.67,        // assumption, from the ratio of Uttley and Fotios 2017 effects (cyclists 38%, pedestrians 62%)
  longDarkWaitMin: 10,         // waits over 10 min after dark count as dark minutes (Fan, Guthrie, Levinson 2016)
  lat: 42.2808, lon: -83.7430, // Ann Arbor city center, for civil twilight (NOAA solar equations)
  // A Sept to Aug lease spans fall and winter terms. The December timetable is the proxy for both terms.
  termDates: [
    { date: '2026-09-15', w: 1 }, { date: '2026-10-15', w: 1 }, { date: '2026-11-15', w: 1 },
    { date: '2026-12-01', w: 1 }, { date: '2027-01-15', w: 1 }, { date: '2027-02-15', w: 1 },
  ],
  weeksPerMonth: 52 / 12,

  // preferences
  tau: 25,                     // logit scale, $/month (assumption; recovery test varies it)
  particles: 4000,
  essFrac: 0.5,                // resample when effective sample size < essFrac * particles
  jitterSd: 0.12,              // log-space jitter after resampling (assumption)
  picksMin: 3, picksMax: 6,
  stopIG: 0.05,                // stop when the best question teaches less than 0.05 nats
  stopPBest: 0.8,              // or when one home is best with 0.8 probability on the most likely week
  mostlyPriorRatio: 0.7,       // flag a weight whose 80% interval is still > 0.7 of the prior's

  // decisions under schedule uncertainty
  scenarios: 24,
  posteriorDraws: 200,
  dots: 50,                    // quantile dotplot (Fernandes et al. 2018)

  // fair division
  welfareTieTol: 1e-9,
  efTol: 1e-6,
  maxMembers: 6,
  efSamples: 100,              // posterior samples for the envy-free rate (Peters, Procaccia, Zhu 2022 used 100)
  compensateCommute: false,    // add each member's commute cost to the maximin objective only
  nonnegRents: true,

  // operator (synthetic population; independent draws from these shares, an assumption)
  operatorGroups: 200,
  population: 2000,
  marginals: {
    campus: { Central: 0.5, North: 0.3, Medical: 0.2 },
    job: { none: 0.6, downtown: 0.25, campus: 0.15 },
    lateStudy: 0.5,
    gym: 0.4,
  },
};

export function withOverrides(partial = {}, base = CONFIG) {
  const out = { ...base };
  for (const [k, v] of Object.entries(partial)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
      ? withOverrides(v, base[k])
      : v;
  }
  return out;
}
