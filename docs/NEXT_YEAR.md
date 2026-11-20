# Next year: the price of not knowing (binding build contract)

> Screen wording, Fri Nov 20: the tab and every on-screen label now say "Next semester" (the hash stays `#next`
> and the code names stay `runNextYear` and friends). Why: the lease runs 12 months, but under Ann Arbor's 210 day
> rule a student signs around spring, when the coming Fall registration is close or done. What they truly do not
> know is the semester they have not registered for yet (usually Winter) and any job. Dollar figures still read
> "a month", meaning per month while that semester runs. The tab also shows one gray line under the map with the
> door-to-door trips routed and the time it took in this browser (`runNextYear` returns `routing`; see
> docs/LISTINGS.md part 2). The rest of this file keeps its original "next year" wording.

## The idea in one breath

A student signs a lease months before next year's class schedule exists. Quorum reads a class catalog (the
Registrar's section file, or a labeled sample shaped like it), builds a few hundred weeks the student could end up
with, runs each one door to door through every home on the real bus timetables, and answers three things:
1. What not knowing costs, in dollars a month (expected value of perfect information, EVPI).
2. The home that loses least across those weeks (lowest expected regret), with its range.
3. The one thing worth finding out before signing (expected value of partial perfect information, EVPPI, per
   unknown), and what happens when the student settles it.

It answers the case author's own example ("10 minutes from campus": which campus?) for a year that has not
happened yet. The math (expected regret, EVPI) already runs in Quorum on hand-typed possible weeks; this feature
draws the possible weeks from a catalog and adds EVPPI and "settle it".

## Data (all new files are SAMPLE and labeled)

- `web/public/data/catalog_sample.csv`: about 40 made-up sections in the column layout of the U-M Schedule of
  Classes CSV (as of past years; the real header is TO VERIFY):
  `Term,Session,Acad Group,Class Nbr,Subject,Catalog Nbr,Section,Course Title,Component,Codes,M,T,W,TH,F,S,SU,Start Date,End Date,Time,Location,Instructor,Units`.
  Day columns hold the day letter or are empty. Time uses the registrar's compact style, for example `10-1130AM`,
  `1130-1PM`, `4-530PM`, `6-9PM`, or `ARR`. Location is `<room> <building code>`, for example `1670 BBB`.
  Course numbers are real U-M courses; every section, time, room and instructor is made up. Instructor is
  `Sample`. Use only building codes that `engine/ics.js` already maps: BBB, EECS, GGBL, FMCRB, UGL, AH, CHEM,
  CCRB, UH, NIB, THL (add an alias there only if truly needed, and keep its tests green).
- `web/public/data/catalog_sample.meta.json`: `{ "label": "SAMPLE catalog: course numbers are real; sections,
  times and rooms are made up", "shape": "U-M Schedule of Classes CSV, past years", "term": "sample" }`.
- `web/public/data/plans_sample.json`: `{ "label": "SAMPLE plans, made up", "plans": [Plan, ...] }` with two
  plans: `cs` (a CS junior: EECS 482 lecture and lab, EECS 376 or similar, one elective from three, one Central
  Campus course; maybe a research lab job on North Campus, odds 0.4) and `nursing` (a nursing junior: courses at
  NIB, clinical at UH, one Central course; maybe a part-time job downtown). Each plan names a `personaId` whose
  walking limits and modes are used (jordan for cs; pick a fitting persona for nursing).
- The repo never ships a real Registrar file. A student's own file is read in the browser with FileReader and
  never uploaded.

Plan shape:
```
{ id, name, personaId,
  courses: [ { id, course: 'EECS 482', components: ['LEC', 'LAB'] } ],
  choices: [ { id, label: 'One upper-level elective', of: ['EECS 445', 'EECS 485', 'EECS 484'], components: ['LEC'] } ],
  maybes:  [ { id, label: 'Research lab job, North Campus', odds: 0.4, days: ['tue','thu'], place: 'fmcrb', start: '13:00', end: '17:00' } ],
  fixed:   [ { id, label, days, place, start, end } ] }
```

## Engine: `engine/catalog.js` (pure ES module, no DOM; loaded by the web adapter as `api.mod('catalog')`)

```
parseCatalogCSV(text, places) -> {
  columns,                      // which header names were used for each field
  sections: [ { key: 'EECS 482|LAB|011', course: 'EECS 482', title, section: '011', component: 'LAB',
                days: ['mon','wed'], start: '10:30', end: '12:00', location: '1670 BBB', place: 'beyster' | null } ],
  skipped: { arranged, noTime, noPlace }, unmatched: [locationString], warnings: [] }
```
- Header driven and case-insensitive. Subject may be a plain code (`EECS`) or a long name with the code in
  parentheses (`Electrical Engineering & Computer Sci (EECS)`). Course = `<code> <catalog number trimmed>`.
- Days: either flag columns M,T,W,TH,F,S,SU or one Days column (`MW`, `TuTh`, `TTH`, `MWF`).
- Time: `10-1130AM` is 10:00 to 11:30; the AM/PM suffix belongs to the end; pick the start meridiem that makes
  start < end with a length of at most 5 hours (`1130-1PM` = 11:30 to 13:00, `4-530PM` = 16:00 to 17:30,
  `6-9PM` = 18:00 to 21:00). Also accept `10:30AM - 12:00PM` and `1030AM-12PM`. `ARR` or `TBA` is skipped.
- Place via `matchPlace(location, places)` from `engine/ics.js`.

```
sampleNextYear({ plan, sections, k = 200, seed = 1, priority = 'normal', odds = {} }) -> {
  scenarios: [ { id, week: [ { id, label, days, place, start, end } ], attrs: { [factorId]: optionId }, weight } ],
  factors:   [ { id, label, kind: 'section' | 'choice' | 'maybe', options: [ { id, label, campus } ] } ],
  stats:     { k, conflictsUnresolved, missingCourses: [course] } }
```
- Scenario shape matches `week.sampleWeeks` output, so `api.weekFor(scenario, homeIds, opts)` works unchanged.
- Factors: one per course component that has two or more sections in the catalog (label like "EECS 482 lab
  section"), one per choice ("Which elective"), one per maybe ("Research lab job"). Option labels are plain:
  `"011, North Campus, Tue 4:30 PM"`, `"EECS 445"`, `"Yes"` / `"No"`. `campus` is the place's area.
- `odds` overrides a maybe's odds by id. `priority`: each section is independently full with probability
  early 0.05, normal 0.2, late 0.4; if every section of a component is full, one random section stays open.
- Draw open sections uniformly. If two meetings overlap on a day, redraw that scenario (up to 30 tries), then
  keep it and count `conflictsUnresolved`. Fixed entries are always present. Deterministic for a given seed
  (use `engine/rng.js`).

```
conditionScenarios(scenarios, settled) -> scenarios   // settled = { [factorId]: optionId }; keeps the matching ones
voi({ tensor, scenarios, factors, boot = 100, seed = 1 }) -> {
  evpi: { value, se },                                   // $/month; equals decide.evpi(tensor).evpi
  byFactor: [ { id, label, value, se } ],                 // EVPPI, sorted high to low
  homes: [ { homeId, meanCost, p10, p90, worst10, pBest } ] }
```
- `tensor` is `rank.tensor` from `decide.meRank`: `U` is a Float64Array with index `(m * K + s) * H + h`
  (m = value draw, s = scenario, h = home; `tensor.homeIds` or the homes order gives h). Let
  `Ubar[s][h]` = mean over m. EVPI = mean_s max_h Ubar - max_h mean_s Ubar.
  EVPPI(X) = sum over options x of P(x) * max_h mean_{s: X=x} Ubar - max_h mean_s Ubar, with P(x) the share of
  scenarios. Standard errors by bootstrap over scenarios. Per-scenario monthly cost of a home = -Ubar[s][h].
- Tests in `test/catalog.test.mjs`: parse the sample file (columns, times, places), the time rules above,
  sampler determinism and no unresolved conflicts on the sample plans, a hand-worked EVPI/EVPPI case (2 homes,
  4 scenarios), EVPPI <= EVPI, EVPPI = EVPI when one factor decides everything, EVPPI = 0 for an irrelevant factor.

## Web compute: `web/src/views/next/compute.js` (plain JS, importable by the pitch and by node scripts)

```
runNextYear(api, { plan, sections, k = 200, seed = 1, priority = 'normal', odds = {}, settled = {}, onProgress }) -> {
  plan, factors, scenarios, rank, voi, safest, homeById, stats, ms }
```
- Same values as the You tab before any pick: `prefs.createPosterior({ seed: 7, cfg })` and
  `prefs.draws(post, cfg.posteriorDraws, 3)`. Weeks with `api.weekFor(s, homeIds, { dates: cfg.termDates })`.
  Ranking with `decide.meRank`. VOI with `catalog.voi`. Yield to the browser between scenario batches and report
  progress. Cache scenarios and weeks by (plan, catalog, k, seed, priority, odds); settling only filters.

## View: `web/src/views/NextView.jsx` and `web/src/views/next/*` (tab "Next year", hash `#next`, after "You")

Visual first, following `docs/DESIGN_DIRECTION.md` (no paragraphs, at most three numbers per card, one primary
button, every section leads with a picture, Plex type, paper palette, no gradients).
1. Controls row: Plan (sample CS junior, sample Nursing junior, and "Your file" once loaded); "Load my registrar
   file" (quiet button, .csv, parsed locally, one line says how many sections and places matched); one chip with
   an odds slider per maybe ("Research lab job 40%"); Registration: Early / Normal / Late.
2. Hero: left, the big number "$NN a month" with the label "what not knowing next year's schedule costs you" and
   "plus or minus $N"; under it the home that loses least: name, room, "$A to $B a month across your possible
   weeks", "best in NN% of them". Right, the map (MapView): homes colored by expected regret, top 3 numbered.
3. "What to find out first": one horizontal bar per unknown (EVPPI, with its error), plain labels. Under each bar
   the options as chips; clicking one settles that unknown (filters the scenarios), the numbers and map update,
   and a "settled" chip with an x undoes it. One sentence under the chart, for example "Find out about the lab
   job before you sign: it is worth $27 a month."
4. "Your possible weeks": a dot strip per top-6 home (one dot per possible week's monthly cost, p10 to p90 band,
   the safest home highlighted), and a small stacked bar "Where your classes would be" (share of class hours by
   campus across the weeks).
5. Details (one disclosure): the method in plain words, k, seed, value draws, the full table (expected regret,
   worst 10%, best in), and the data label. With the sample loaded, the top bar of this tab says "Sample
   catalog" once.
Must stay responsive: progress bar while computing; no console errors.

## Pitch

A new slide 2, "You sign before your schedule exists.", with the live price, the top unknowns as bars and the
home that loses least, from `runNextYear` on the sample CS plan. Slide 4 gains a "Class catalog" stop. The deck
becomes 8 slides; notes updated.

## Rules

ASCII only, no em or en dashes, no hype words. Never invent facts: course numbers are real, all section data is
labeled sample. Do not touch files outside your ownership. Do not commit, switch branches or push. Keep the 98
engine and 27 web tests green, add tests for new logic, and leave `npm run build` passing.
