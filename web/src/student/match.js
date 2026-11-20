// What a home has and does not have, checked against what the student said in their profile.
// Every line comes from data: walk minutes on the OSM street graph (planner.walkSec), door-to-door trip
// times from the router (the ranking's week), and the room's size, bathroom and daylight in homes.json.
// Things the listings do not record (quiet, pets, parking) are listed as unknown, never guessed.
//
//   matchHome({ api, home, profile, item, medianWeekMin }) -> { yes: [Line], no: [Line], unknown: [string], asked, met }
//   Line = { key, text }   asked/met count only what the student asked for (not the always-on time line).
import { money, hoursText, fromPrice } from './rank.js';
import { checkRequirements } from './listing.js';

const NEAR_MIN = 15;         // "close to" means a walk of 15 minutes or less
const CLASS_MIN = 20;        // a class trip of 20 minutes or less door to door is short
const LATE = '21:00';

const ROOM_ANCHOR_KINDS = new Set(['class']);
const walkMin = (api, a, b) => { try { const s = api.planner.walkSec(a, b); return Number.isFinite(s) ? Math.round(s / 60) : null; } catch { return null; } };

// The place the student goes most (by days a week), preferring classes: "your classes at ...".
export function mainPlace(api, profile) {
  const { placeById } = api.data;
  const score = new Map();
  for (const e of profile?.entries || []) {
    const kind = placeById.get(e.place)?.kind;
    const w = e.days.length * (ROOM_ANCHOR_KINDS.has(kind) || /class|lecture|clinical|lab|seminar/i.test(e.label) ? 2 : 1);
    score.set(e.place, (score.get(e.place) || 0) + w);
  }
  const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? placeById.get(best[0]) : null;
}

export function matchHome({ api, home, profile, item, medianWeekMin, anchor }) {
  const yes = [], no = [], unknown = [];
  let asked = 0, met = 0;
  const add = (ok, key, text, counts = true) => { (ok ? yes : no).push({ key, text }); if (counts) { asked++; if (ok) met++; } };
  if (!profile) return { yes, no, unknown, asked, met };
  const rooms = home.rooms || [];
  const short = (s) => String(s || '').replace(/\s*\(.*?\)\s*/g, '').trim();

  // 1. budget
  if (profile.budget) {
    const rent = item?.rent ?? fromPrice(home);
    add(rent <= profile.budget, 'budget', rent <= profile.budget
      ? `Within your ${money(profile.budget)} budget (${money(rent)}/mo)`
      : `${money(rent - profile.budget)} over your ${money(profile.budget)} budget`);
  }
  // 2. where they want to be
  for (const n of profile.near || []) {
    const m = walkMin(api, home.id, n.place);
    if (m == null) continue;
    add(m <= NEAR_MIN, `near-${n.place}`, m <= NEAR_MIN ? `${m} min walk to ${short(n.label)}` : `Not close to ${short(n.label)} (${m} min walk)`);
  }
  // 3. room size
  if (profile.minSqft) {
    const big = rooms.filter((r) => r.sqft >= profile.minSqft).sort((a, b) => b.sqft - a.sqft)[0];
    const maxSq = Math.max(...rooms.map((r) => r.sqft));
    add(!!big, 'size', big ? `${big.sqft} sq ft room (${big.label}), over your ${profile.minSqft}` : `Largest room is ${maxSq} sq ft, under your ${profile.minSqft}`);
  }
  const likes = new Set((profile.likes || []).map((l) => l.key));
  if (likes.has('size') && !profile.minSqft) {
    const maxSq = Math.max(...rooms.map((r) => r.sqft));
    add(maxSq >= 170, 'size', maxSq >= 170 ? `Big room: ${maxSq} sq ft` : `Rooms are ${maxSq} sq ft or smaller`);
  }
  // 4. bathroom and daylight
  if (likes.has('bath')) {
    const pr = rooms.find((r) => r.bath === 'private');
    add(!!pr, 'bath', pr ? `Private bathroom (${pr.label})` : 'No private bathroom');
  }
  if (likes.has('light')) {
    const br = rooms.find((r) => (r.light ?? 1) >= 2);
    add(!!br, 'light', br ? `Bright room with the most daylight (${br.label})` : 'No room with full daylight');
  }
  // 5. group or alone
  if (profile.groupSize) {
    add(rooms.length >= profile.groupSize, 'group', rooms.length >= profile.groupSize
      ? `Bedrooms for all ${profile.groupSize} of you` : `Only ${rooms.length} bedroom${rooms.length > 1 ? 's' : ''} for ${profile.groupSize} of you`);
  }
  if ((profile.notes || []).some((n) => n.key === 'alone')) {
    add(rooms.length === 1, 'alone', rooms.length === 1 ? 'A place to yourself' : `Shared ${home.kind} with ${rooms.length} bedrooms`);
  }
  // 6. trips, from the router
  const week = item?.week;
  if (week) {
    if (anchor) {
      const t = (week.trips || []).filter((x) => x.place === anchor.id && x.kind === 'arriveBy' && x.sec).sort((a, b) => a.sec - b.sec)[0];
      if (t) {
        const m = Math.round(t.sec / 60);
        const how = t.mode === 'transit' ? 'by bus' : t.mode === 'bike' ? 'by bike' : 'on foot';
        add(m <= CLASS_MIN, 'class', m <= CLASS_MIN ? `${m} min to ${short(anchor.label)} ${how}` : `${m} min to ${short(anchor.label)} ${how}, a long trip`, false);
      }
    }
    const late = (profile.entries || []).some((e) => e.end >= LATE) || likes.has('dark');
    if (late) {
      const n = week.stranded?.length || 0;
      add(n === 0, 'late', n === 0 ? 'A ride home for every late trip' : `${n} late trip${n > 1 ? 's' : ''} a week with no ride that fits`, likes.has('dark'));
    }
    if (medianWeekMin != null) {
      const ok = week.weeklyMin <= medianWeekMin;
      add(ok, 'time', ok ? `Less travel than most homes (${hoursText(week.weeklyMin)} a week)` : `More travel than most homes (${hoursText(week.weeklyMin)} a week)`, false);
    }
  }
  // 7. listing preferences, from the room data and the sample listing details
  const dd = api.data.detailsById?.get(home.id);
  for (const w of profile.wants || []) {
    const f = dd?.flags || {};
    switch (w.key) {
      case 'furnished': if (dd) add(f.furnished, w.key, f.furnished ? dd.furnished : 'Unfurnished'); else unknown.push('furniture'); break;
      case 'laundry': if (dd) add(f.laundryFree, w.key, dd.laundry); else unknown.push('laundry'); break;
      case 'ac': if (dd) { const has = !/no air/i.test(dd.heatCool); add(has, w.key, has ? dd.heatCool.split(', ').pop().replace(/^\w/, (c) => c.toUpperCase()) : 'No air conditioning'); } else unknown.push('air conditioning'); break;
      case 'dishwasher': if (dd) add(f.dishwasher, w.key, f.dishwasher ? 'Dishwasher' : 'No dishwasher'); else unknown.push('dishwasher'); break;
      case 'internet': if (dd) add(f.internet, w.key, dd.internet); else unknown.push('internet'); break;
      case 'outdoor': if (dd) { const has = !/^No /.test(dd.outdoor); add(has, w.key, has ? dd.outdoor : 'No outdoor space'); } else unknown.push('outdoor space'); break;
      case 'house': add(home.kind === 'house', w.key, home.kind === 'house' ? 'A house' : 'An apartment, not a house'); break;
      case 'apartment': add(home.kind === 'apartment', w.key, home.kind === 'apartment' ? 'An apartment' : 'A house, not an apartment'); break;
      case 'lease8': if (dd) { const ok8 = /^8 months/.test(dd.lease); add(ok8, w.key, ok8 ? 'School-year lease (8 months)' : `Lease is ${dd.lease.split(',')[0]}`); } else unknown.push('lease length'); break;
      case 'lease12': if (dd) { const ok12 = /^12 months/.test(dd.lease); add(ok12, w.key, ok12 ? '12-month lease' : `Lease is ${dd.lease.split(',')[0]}`); } else unknown.push('lease length'); break;
      case 'newer': if (dd) add(dd.built >= 1995, w.key, dd.built >= 1995 ? `Built in ${dd.built}` : `Older building (${dd.built})`); else unknown.push('building age'); break;
      case 'notBasement': { const rm = rooms.find((r) => r.id === item?.roomId) || rooms[0]; const base = rm?.floor === 'basement'; add(!base, w.key, base ? `Your best room (${rm.label}) is in the basement` : `Your best room is on the ${rm?.floor === 'attic' ? 'attic' : `${rm?.floor === '1' ? '1st' : rm?.floor === '2' ? '2nd' : rm?.floor} floor`}`); break; }
      case 'smokeFree': if (dd) add(true, w.key, 'Smoke-free'); break;
      case 'moveIn': if (dd) { const d0 = new Date(`${dd.available} 12:00`); const want = new Date(`${w.value}T12:00`); const ok = d0 <= want; add(ok, w.key, ok ? `Move-in ${dd.available.replace(/, \d{4}$/, '')}` : `Move-in ${dd.available.replace(/, \d{4}$/, '')}, after your date`); } else unknown.push('move-in date'); break;
      case 'classMin': {
        const t = anchor && week ? (week.trips || []).filter((x) => x.place === anchor.id && x.kind === 'arriveBy' && x.sec).sort((a, b) => a.sec - b.sec)[0] : null;
        if (t) { const m = Math.round(t.sec / 60); add(m <= w.value, w.key, m <= w.value ? `${m} min to ${short(anchor.label)}, within your ${w.value}` : `${m} min to ${short(anchor.label)}, over your ${w.value}`); }
        break;
      }
      default: break;
    }
  }

  // 8. wishes the local model wrote as field tests (student/listing.js)
  if (profile.reqs?.length) {
    const r = checkRequirements(api, home, item, profile.reqs);
    yes.push(...r.yes); no.push(...r.no); unknown.push(...r.unknown); asked += r.asked; met += r.met;
  }

  // 9. pets, parking, quiet: from the sample listing details when there are any, else listed as unknown
  const keys = new Set((profile.notes || []).map((n) => n.key));
  const d = api.data.detailsById?.get(home.id);
  if (keys.has('pet')) { if (d) add(d.flags.pets, 'pet', d.flags.pets ? d.pets : 'No pets allowed'); else unknown.push('pet rules'); }
  if (keys.has('car')) { if (d) add(d.flags.parking, 'car', d.flags.parking ? `Parking: ${d.parking}` : 'Street parking only'); else unknown.push('parking'); }
  if (keys.has('quiet')) { if (d) add(d.flags.quiet, 'quiet', d.flags.quiet ? d.street : d.street); else unknown.push('how quiet it is'); }
  return { yes, no, unknown, asked, met };
}
