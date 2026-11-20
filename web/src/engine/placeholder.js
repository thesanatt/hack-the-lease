// Used ONLY when web/public/data/homes.json or personas.json is missing (the data builder writes those).
// Six SAMPLE homes and one FICTIONAL persona so the shell can be checked before the data lands.
// The UI shows a PLACEHOLDER warning whenever these are in use.

const room = (id, label, sqft, bath, light, floor, asking) => ({ id, label, sqft, bath, light, floor, asking });

export const PLACEHOLDER_HOMES = {
  label: 'PLACEHOLDER SAMPLE homes (homes.json not built yet)',
  homes: [
    { id: 'p1', name: 'Packard St house', area: 'South Central', kind: 'house', lat: 42.2738, lon: -83.7395, rent: 3400, utilities: 220,
      rooms: [room('p1r1', 'Front room', 160, 'shared', 2, '1', 880), room('p1r2', 'Back room', 120, 'shared', 1, '1', 780),
        room('p1r3', 'Attic', 140, 'half', 1, 'attic', 820), room('p1r4', 'Basement', 130, 'shared', 0, 'basement', 700)] },
    { id: 'p2', name: 'Detroit St flat', area: 'Kerrytown', kind: 'apartment', lat: 42.2848, lon: -83.7466, rent: 2100, utilities: 140,
      rooms: [room('p2r1', 'Bedroom 1', 150, 'private', 2, '2', 1080), room('p2r2', 'Bedroom 2', 125, 'shared', 1, '2', 980)] },
    { id: 'p3', name: 'Plymouth Rd apartment', area: 'North Campus area', kind: 'apartment', lat: 42.3010, lon: -83.7230, rent: 1900, utilities: 120,
      rooms: [room('p3r1', 'Bedroom 1', 140, 'private', 1, '2', 990), room('p3r2', 'Bedroom 2', 130, 'shared', 1, '2', 910)] },
    { id: 'p4', name: 'Granger Ave house', area: 'Burns Park', kind: 'house', lat: 42.2668, lon: -83.7322, rent: 3200, utilities: 240,
      rooms: [room('p4r1', 'Front room', 170, 'half', 2, '2', 860), room('p4r2', 'Side room', 130, 'shared', 1, '2', 760),
        room('p4r3', 'Back room', 120, 'shared', 1, '1', 740), room('p4r4', 'Basement', 150, 'private', 0, 'basement', 740)] },
    { id: 'p5', name: 'Mulholland Ave house', area: 'Old West Side', kind: 'house', lat: 42.2790, lon: -83.7600, rent: 2600, utilities: 210,
      rooms: [room('p5r1', 'Front room', 180, 'shared', 2, '1', 900), room('p5r2', 'Upstairs', 140, 'shared', 1, '2', 850),
        room('p5r3', 'Small room', 110, 'shared', 1, '2', 850)] },
    { id: 'p6', name: 'Broadway St flat', area: 'Lower Town', kind: 'apartment', lat: 42.2885, lon: -83.7395, rent: 1750, utilities: 130,
      rooms: [room('p6r1', 'Bedroom 1', 135, 'shared', 1, '1', 900), room('p6r2', 'Bedroom 2', 135, 'shared', 1, '1', 850)] },
  ],
};

export const PLACEHOLDER_PERSONAS = {
  label: 'PLACEHOLDER FICTIONAL persona (personas.json not built yet)',
  personas: [
    { id: 'jordan', name: 'Jordan', program: 'Computer Engineering', color: '#b23a1c', cap: 950,
      modes: { bike: false, maxWalkMin: 25, lateHour: '22:00', maxLateWalkMin: 12 },
      theta: { vTime: 22, vDark: 18, vStrand: 30, wBath: 70, wSize: 6, wLight: 15 },
      week: [
        { id: 'e1', label: 'EECS lecture', days: ['mon', 'wed', 'fri'], place: 'eecs', start: '10:30', end: '12:00', p: 1, alt: [] },
        { id: 'e2', label: 'Math class', days: ['tue', 'thu'], place: 'angell', start: '09:00', end: '10:30', p: 1, alt: [] },
        { id: 'e3', label: 'Late lab', days: ['wed'], place: 'ggbrown', start: '19:00', end: '22:30', p: 0.8, alt: [{ place: 'chem', p: 0.3 }] },
        { id: 'e4', label: 'Study', days: ['tue', 'thu'], place: 'dude', start: '13:00', end: '18:00', p: 0.7, alt: [] },
        { id: 'e5', label: 'Gym', days: ['sat'], place: 'ncrb', start: '11:00', end: '12:30', p: 0.5, alt: [] },
      ] },
  ],
};
