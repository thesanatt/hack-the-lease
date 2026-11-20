// The one utility model every part of the engine shares (prefs, decide, fair, operator).
// All money is dollars per month. A person is described by theta, six non-negative values.
//
//   travelCost(theta, travel) = vTime   * hoursPerMonth
//                             + vDark   * darkHoursPerMonth     (extra, on top of vTime)
//                             + vStrand * strandedPerMonth
//   roomValue(theta, room)    = wBath * bath + wSize * sizeUnits + wLight * light
//   utility(option)           = roomValue - rent - travelCost
//
// Priors are stated assumptions; picks dominate them after a few answers.

export const WEEKS_PER_MONTH = 52 / 12;

export const PARAMS = ['vTime', 'vDark', 'vStrand', 'wBath', 'wSize', 'wLight'];

export const PARAM_INFO = {
  vTime: { label: 'Value of travel time', unit: '$/hour', prior: { median: 15, sigma: 0.8 } },
  vDark: { label: 'Extra cost of walking after dark', unit: '$/hour', prior: { median: 10, sigma: 1.0 } },
  vStrand: { label: 'Cost of a trip with no ride home', unit: '$/trip', prior: { median: 15, sigma: 1.0 } },
  wBath: { label: 'Private bathroom', unit: '$/month', prior: { median: 60, sigma: 0.7 } },
  wSize: { label: 'Room size', unit: '$/month per 10 sq ft', prior: { median: 8, sigma: 0.7 } },
  wLight: { label: 'Daylight', unit: '$/month per window level', prior: { median: 20, sigma: 0.8 } },
};

// Prior: independent log-normals around the medians above.
export function samplePrior(r) {
  const theta = {};
  for (const k of PARAMS) {
    const { median, sigma } = PARAM_INFO[k].prior;
    theta[k] = median * Math.exp(sigma * r.normal());
  }
  return theta;
}

// week: output of week.evaluateWeek for one home (see CONTRACTS.md)
export function travelFeatures(week) {
  return {
    hoursPerMonth: (week.weeklyMin / 60) * WEEKS_PER_MONTH,
    darkHoursPerMonth: (week.darkWalkMin / 60) * WEEKS_PER_MONTH,
    strandedPerMonth: week.stranded.length * WEEKS_PER_MONTH,
  };
}

const BATH = { private: 1, half: 0.5, shared: 0 };

export function roomFeatures(room) {
  return { bath: BATH[room.bath] ?? 0, sizeUnits: (room.sqft - 120) / 10, light: room.light ?? 1 };
}

export function roomValue(theta, room) {
  const f = roomFeatures(room);
  return theta.wBath * f.bath + theta.wSize * f.sizeUnits + theta.wLight * f.light;
}

export function travelCost(theta, travel) {
  return theta.vTime * travel.hoursPerMonth + theta.vDark * travel.darkHoursPerMonth + theta.vStrand * travel.strandedPerMonth;
}

// option = { rent, travel: travelFeatures(...), room }
export function utility(theta, option) {
  return roomValue(theta, option.room) - option.rent - travelCost(theta, option.travel);
}

// Linear feature vector of an option, so prefs.js can work with dot products:
// utility = theta . phi(option) - rent
export function phi(option) {
  const f = roomFeatures(option.room);
  return {
    vTime: -option.travel.hoursPerMonth,
    vDark: -option.travel.darkHoursPerMonth,
    vStrand: -option.travel.strandedPerMonth,
    wBath: f.bath,
    wSize: f.sizeUnits,
    wLight: f.light,
  };
}
