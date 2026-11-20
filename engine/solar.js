// Sunrise, sunset and civil twilight for Ann Arbor from the NOAA solar position equations
// (NOAA Global Monitoring Laboratory solar calculator, after Meeus, Astronomical Algorithms).
// All results are seconds after local midnight in Ann Arbor clock time (Eastern, with US daylight time).

import { CONFIG } from './config.js';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const Z_SUN = 90.833;   // apparent sunrise or sunset: refraction plus the solar disc
const Z_CIVIL = 96;     // civil twilight: sun 6 degrees below the horizon

function parseDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) throw new Error(`bad date: ${dateStr}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// Day of week (0 = Sunday) of a civil date.
function weekday(y, mo, d) { return new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); }

// n-th Sunday (1-based) of a month.
function nthSunday(y, mo, n) {
  const first = weekday(y, mo, 1);
  return 1 + ((7 - first) % 7) + 7 * (n - 1);
}

// US rule since 2007: daylight time from the second Sunday of March to the first Sunday of November.
// For this lease: EDT before Nov 1 2026, EST from Nov 1 2026, EDT again from Mar 14 2027.
// The switch happens at 02:00; a whole civil date is assigned the offset in force at noon.
export function utcOffsetHours(dateStr) {
  const [y, mo, d] = parseDate(dateStr);
  const start = nthSunday(y, 3, 2), end = nthSunday(y, 11, 1);
  const k = mo * 100 + d;
  const dst = k >= 300 + start && k < 1100 + end;
  return dst ? -4 : -5;
}

function julianCentury(jd) { return (jd - 2451545) / 36525; }

function sunParams(T) {
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const obliq0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = obliq0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD));
  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eqTime = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr)); // minutes
  return { decl, eqTime };
}

// Minutes after 00:00 UTC of the given date when the sun crosses `zenith` (rising if sign = -1, setting if +1).
function eventUtcMin(y, mo, d, lat, lon, zenith, sign) {
  const jd0 = Date.UTC(y, mo - 1, d) / 86400000 + 2440587.5;
  let tMin = 720 - 4 * lon; // first guess: local solar noon
  for (let it = 0; it < 3; it++) {
    const { decl, eqTime } = sunParams(julianCentury(jd0 + tMin / 1440));
    const cosH = Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (cosH > 1 || cosH < -1) return NaN; // no such event (polar day or night); never happens at 42 N
    const H = Math.acos(cosH) * DEG;
    tMin = 720 - 4 * lon - eqTime + sign * 4 * H;
  }
  return tMin;
}

function localSec(dateStr, zenith, sign, cfg) {
  const [y, mo, d] = parseDate(dateStr);
  const utcMin = eventUtcMin(y, mo, d, cfg.lat, cfg.lon, zenith, sign);
  return Math.round((utcMin + 60 * utcOffsetHours(dateStr)) * 60);
}

export const sunrise = (dateStr, cfg = CONFIG) => localSec(dateStr, Z_SUN, -1, cfg);
export const sunset = (dateStr, cfg = CONFIG) => localSec(dateStr, Z_SUN, +1, cfg);
export const dawn = (dateStr, cfg = CONFIG) => localSec(dateStr, Z_CIVIL, -1, cfg);   // civil dawn
export const dusk = (dateStr, cfg = CONFIG) => localSec(dateStr, Z_CIVIL, +1, cfg);   // civil dusk

// "HH:MM" for display and tests.
export function clock(sec) {
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
