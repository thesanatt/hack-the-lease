// Operator fit and portfolio logic, plain JS (Node tests and browser). Every input is SYNTHETIC:
// the demand map comes from engine/operator.js demandMap over 2,000 synthetic student weeks routed on the
// real bus timetables and streets (scripts/build_operator.mjs), and room rents come from roomPricing.
// Nothing here invents a number; it only counts, sums and words what the engine returned.

export const CAMPUS_WORDS = { Central: 'Central Campus', North: 'North Campus', Medical: 'Medical Campus' };
export const CAMPUSES = ['Central', 'North', 'Medical'];
export const JOBS = ['none', 'downtown', 'campus'];
// Column order of the week grid: [lateStudy, gym].
export const EXTRAS = [[false, false], [true, false], [false, true], [true, true]];

// Same wording rule as engine/operator.js archetypeKey, kept here so the grid can be built for every cell.
export function keyOf(a) {
  const parts = [a.campus, a.job === 'none' ? 'no job' : `job ${a.job}`];
  if (a.lateStudy) parts.push('late study');
  if (a.gym) parts.push('gym');
  return parts.join(', ');
}

export function parseKey(key) {
  const parts = String(key).split(',').map((s) => s.trim());
  const job = parts[1] === 'no job' ? 'none' : (parts[1] || '').replace(/^job /, '');
  return { campus: parts[0], job, lateStudy: parts.includes('late study'), gym: parts.includes('gym') };
}

// "17:30" -> "5:30 pm", "07:00" -> "7 am"
export function clock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

// Plain words for the pieces of a synthetic week. A = engine POP_ASSUMPTIONS (times), optional.
export function jobWords(job, A) {
  if (job === 'none') return 'no job';
  const t = A?.jobTime ? ` ${clock(A.jobTime[0])} to ${clock(A.jobTime[1])}` : '';
  return job === 'downtown' ? `evening job downtown${t}` : `evening job on campus${t}`;
}
export function studyWords(A) {
  return A?.lateStudyTime ? `library until ${clock(A.lateStudyTime[1])}` : 'late library nights';
}
export function gymWords(A) {
  return A?.gymTime ? `gym at ${clock(A.gymTime[0])}` : 'early gym';
}

export function weekWords(a, A) {
  const parts = [`${CAMPUS_WORDS[a.campus] || a.campus} classes`];
  if (a.job !== 'none') parts.push(jobWords(a.job, A));
  if (a.lateStudy) parts.push(`${studyWords(A)} two nights`);
  if (a.gym) parts.push(gymWords(A));
  return parts.join(', ');
}

// Map: kind-of-week key -> homeId that is the most common first choice for that kind.
export function winnerByKind(demand) {
  const m = new Map();
  for (const h of demand?.homes || []) for (const k of h.wins || []) m.set(k, h.homeId);
  return m;
}

// Synthetic students per kind of week, from the rebuilt population (engine makePopulation, same seed).
export function countKinds(population) {
  const m = new Map();
  for (const s of population?.students || []) {
    const k = keyOf(s.archetype);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// The 9 x 4 grid: rows campus x job, columns late study x gym.
export function kindGrid(demand, counts) {
  const win = winnerByKind(demand);
  return CAMPUSES.flatMap((campus) => JOBS.map((job) => ({
    campus, job,
    cells: EXTRAS.map(([lateStudy, gym]) => {
      const a = { campus, job, lateStudy, gym };
      const key = keyOf(a);
      return { key, a, winner: win.get(key) || null, n: counts ? counts.get(key) || 0 : null };
    }),
  })));
}

const of = (k, n) => `${k} of ${n}`;

// Plain sentences on which kinds of week a home wins. Every count comes from the wins list.
export function winsSummary(wins, totalKinds = 36) {
  const W = (wins || []).map(parseKey);
  const n = W.length;
  if (!n) return [`It is not the most common first pick for any of the ${totalKinds} kinds of week.`];
  const out = [`It is the most common first pick for ${of(n, totalKinds)} kinds of week.`];
  const byCampus = CAMPUSES.map((c) => [c, W.filter((a) => a.campus === c).length]).filter(([, k]) => k);
  if (byCampus.length === 1) out.push(n === 1 ? `That one is a ${CAMPUS_WORDS[byCampus[0][0]]} week.` : `All ${n} are ${CAMPUS_WORDS[byCampus[0][0]]} weeks.`);
  else out.push(`${byCampus.sort((a, b) => b[1] - a[1]).map(([c, k]) => `${CAMPUS_WORDS[c]}: ${k}`).join('. ')}.`);
  if (n >= 3) {
    const feats = [
      ['have late library nights', W.filter((a) => a.lateStudy).length],
      ['have an evening job', W.filter((a) => a.job !== 'none').length],
      ['have an early gym session', W.filter((a) => a.gym).length],
    ];
    const strong = feats.filter(([, k]) => k === n || k === 0 || k / n >= 2 / 3 || k / n <= 1 / 3)
      .map(([w, k]) => (k === n ? `all ${w}` : k === 0 ? `none ${w.replace(/^have/, 'has')}` : `${of(k, n)} ${w}`));
    if (strong.length) {
      const s = strong.slice(0, 2).join('; ');
      out.push(`${s[0].toUpperCase()}${s.slice(1)}.`);
    }
  }
  return out;
}

// Rank of a home by first-choice share (1 = most often first). Ties share a rank.
export function firstRank(demand, homeId) {
  const hs = demand?.homes || [];
  const me = hs.find((h) => h.homeId === homeId);
  if (!me) return null;
  return { rank: 1 + hs.filter((h) => h.firstShare > me.firstShare).length, of: hs.length };
}

const NEAR = 10; // dollars a month; closer than this counts as about right (same rule as the room table)

// One portfolio row. rooms: the home's rooms (homes.json); typical: per-room typical fair rent (p50) in order.
export function portfolioRow({ home, typical, fit, students }) {
  const rooms = home.rooms || [];
  const askTotal = rooms.reduce((t, r) => t + (Number.isFinite(r.asking) ? r.asking : 0), 0);
  const ok = Array.isArray(typical) && typical.length === rooms.length && typical.every(Number.isFinite);
  const fairTotal = ok ? typical.reduce((t, x) => t + x, 0) : null;
  let worst = null, off = null;
  if (ok) {
    off = 0;
    rooms.forEach((r, j) => {
      if (!Number.isFinite(r.asking)) return;
      const d = r.asking - typical[j];
      off += Math.abs(d);
      if (!worst || Math.abs(d) > Math.abs(worst.d)) worst = { label: r.label, d, typical: typical[j], asking: r.asking };
    });
  }
  const n = students || 0;
  const firstN = fit ? Math.round(fit.firstShare * n) : null;
  return {
    homeId: home.id, name: home.name, short: String(home.name).split(',')[0], area: home.area, kind: home.kind,
    nRooms: rooms.length, rent: home.rent, askTotal, fairTotal, off, worst,
    firstShare: fit?.firstShare ?? null, top3Share: fit?.top3Share ?? null, firstN,
    fitPremium: fit?.fitPremium ?? null, wins: fit?.wins?.length ?? 0,
  };
}

// Short plain next step for one row, from its own numbers only.
export function actionFor(row, usd) {
  const notes = [];
  if (row.worst && Math.abs(row.worst.d) >= NEAR) {
    notes.push(row.worst.d > 0
      ? `Lower ${row.worst.label} by about ${usd(row.worst.d)} and raise the other rooms`
      : `Raise ${row.worst.label} by about ${usd(-row.worst.d)} and lower the other rooms`);
  }
  if (row.top3Share != null && row.top3Share < 0.01) notes.push('almost no synthetic week ranks it in the top 3');
  else if (row.firstShare === 0) notes.push('no synthetic week ranks it first');
  if (!notes.length) return 'Room prices are close to typical';
  const s = notes.join('; ');
  return s[0].toUpperCase() + s.slice(1);
}

export const SORTS = {
  off: { label: 'room gaps', fn: (a, b) => (b.off ?? -1) - (a.off ?? -1) },
  first: { label: 'first choice', fn: (a, b) => (b.firstShare ?? -1) - (a.firstShare ?? -1) },
  premium: { label: 'fit premium', fn: (a, b) => (b.fitPremium ?? -1) - (a.fitPremium ?? -1) },
  name: { label: 'name', fn: (a, b) => a.name.localeCompare(b.name) },
};
