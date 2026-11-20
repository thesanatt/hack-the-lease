# Round 3: richer sample data, fit scores, Email it, student cards (binding contract)

Built on branch `round3`. The demo numbers in docs/DEMO.md must not move: every change below is additive or a
label change, and the dry run proves it.

## 1. Real course names and richer sample data
- `web/public/data/personas.json`: give every existing week entry a realistic label with real U-M course numbers
  that fit its place (for example North Campus EECS entries at Beyster or the EECS building become "EECS 445
  lecture", "EECS 370 discussion"; Jordan's late lab at the Duderstadt becomes "EECS 482 project lab"; the
  project team at the Ford Robotics building stays a project team with a real-sounding team name only if it is
  generic, like "Robotics project team"). Change labels only. Never change an existing entry's days, times,
  place, odds, alternatives, a persona's caps, values, modes or group membership: the demo numbers depend on them.
  The label "Late lab" is used by the You tab's late-lab finder (it prefers labels containing "lab"); keep "lab"
  in that label.
- Add 4 new personas after the existing ones, not in the group (group: false), each a clearly different student
  life with realistic weeks: a Ross BBA junior with a Kerrytown or downtown job, a School of Music student at the
  Moore building with evening rehearsals, a School of Public Health or medical-campus research assistant with early
  hospital hours, and a grad student in a mechanical engineering lab on North with a car or bike. Copy the field
  shape of the existing personas exactly (id, name, program, color, label, group, cap, modes, theta, week). Names
  are plain first names, labeled fictional like the others. Colors must not repeat the five group colors.
- `web/public/data/plans_sample.json` and `catalog_sample.csv`: append 3 plans (Ross BBA junior, Music
  performance junior, Mechanical engineering junior) and only the new courses' sections they need, using building
  codes engine/ics.js already maps (add aliases there only if a building is missing; keep its tests green). Do not
  add or change sections of courses the existing plans use. Keep plans[0] = cs and the default plan id nursing.
- `web/public/data/posts_sample.json`: append about 8 more varied posts (a whole-house lease, a studio near the
  hospital, a North Campus room, a short Winter sublet, a post with a price per person for a 5 bed, a post with
  only a cross street, one with odd formatting and emojis removed, a parking-included one). No names, phone
  numbers or emails. Keep the existing posts and their order: the demo uses the first two.

## 2. Fit scores on the Listings tab
For each pasted post and each sample home in the comparison, show four category fits and one overall score:
- Price, Getting around, Nights (dark walks and trips with no ride), Dates (does the lease cover the chosen
  semester). Each category is 0 to 100 from that category's dollars a month in the same utility model the app
  already uses (explain pieces: rent, time, dark, strand): 100 = the best among the compared places, 0 = the
  worst, linear in dollars. Dates is 100 when the post covers the chosen semester, 0 when it does not, 50 when a
  date is a guess.
- Overall "Fit NN/100" = the cost to you a month mapped the same way (100 = lowest cost to you among the compared
  places), and 0 when Dates is 0. Show it big on each card and in the table, with the four category bars small
  under it. A tooltip says in one sentence how it is computed. No other scoring scheme.
- Put the scoring logic in a pure module with tests.

## 3. Email it
Next to Copy on each draft, a quiet "Email it" button: a mailto: link with subject "Your post: <title>" and the
draft as the body. Quorum still sends nothing; the student's own mail app opens and they press Send. An optional
"Their email" field on the card fills the To line; it is kept only in this browser and never parsed from posts.

## 4. Deep links and printable student cards
- Deep links: `#me?who=<personaId>`, `#listings?who=<personaId>` and `#next?plan=<planId>` open those views on
  that persona or plan. App.jsx picks the view from the part before "?"; a tiny shared helper reads the query.
- `scripts/cards/make_cards.mjs` builds `docs/cards/student_cards.pdf` (and the HTML it prints from): one card per
  persona that is not Jordan, 4 cards per US Letter page, each with the fictional name, program, three lines of
  their week with real course names, the line "Fictional student, sample data", and a QR code to
  `https://quorum-a2.vercel.app/#me?who=<id>`. Use the `qrcode` npm package installed only in scripts/cards
  (its own package.json, like scripts/record) and Playwright from scripts/record to print the PDF. Plain, printable,
  black on white, Plex fonts if available.
- The You tab and the Listings tab must be usable at 390 px wide (a judge's phone): no horizontal scroll, the
  top 3 and the map readable.

## Rules
ASCII only, no em or en dashes, no hype. No real personal data. All sample data stays labeled. Keep every test
green, add tests for new logic, and leave `npm run build` passing. Do not commit, switch branches or push.
