# Data in Quorum

What each file in `web/public/data/` is, where it came from, when, under what license, and exactly what is
synthetic. Real: timetables, streets, places. Synthetic or fictional: homes, rents, rooms, personas, the
operator population.

## Real data

| Data | Source | Date or version | License or terms | Built by |
|---|---|---|---|---|
| TheRide bus timetable | AAATA (TheRide) GTFS, `data/raw/aaata/google_transit.zip`, publisher http://www.theride.org | feed version S1000304, service Nov 15 2026 to Jan 23 2027, downloaded Nov 19 2026 | "Transit scheduling, geographic, and real-time data provided by permission of AAATA/TheRide" (attribution shown in the app footer) | `pipeline/build_transit.py` |
| U-M bus timetable | U-M Logistics, Transportation and Parking GTFS, `data/raw/umich/google_transit.zip`, publisher https://ltp.umich.edu | feed version S1000100, service Aug 23 2026 to Jan 2 2027, downloaded Nov 19 2026 | "U-M bus schedules: University of Michigan Logistics, Transportation and Parking" (attribution shown in the app footer) | `pipeline/build_transit.py` |
| Street graphs (walk, bike) and `streets.geojson` | OpenStreetMap through osmnx (Overpass API), cached in `data/raw/osm/` | downloaded Nov 19 2026 | (c) OpenStreetMap contributors, ODbL 1.0 | `pipeline/build_walk.py` |
| `places.json` (31 places) | OpenStreetMap, Geofabrik Michigan extract `data/raw/osm/michigan-latest.osm.pbf` | extract timestamp 2026-11-19T21:22:20Z | (c) OpenStreetMap contributors, ODbL 1.0 | `pipeline/build_places.py` |

Modeled week: Mon Nov 30 to Sun Dec 6 2026, inside both feeds' service windows. The December timetable stands in
for the whole fall and winter term (stated on screen; see SYSTEM_DESIGN.md section 10 item 3).

### How places were located

Each place is a fixed OSM element id (way, relation or node) looked up in the local extract. The point is the
mean of the element's outline vertices, which lies inside or next to the building. `Main St at Liberty` is the
mean of the OSM nodes shared by the two streets. Each record's `source` field names the element.

Why ids and not a geocoder: on Nov 19 2026 Nominatim returned nothing for the Law Quad, the recreation building
and Mott, and the earlier build had matched "Main Street, Ann Arbor" to a point on the north side
(42.30098, -83.69780) and "Kroger, Ann Arbor" to the Maple Rd store. Public Overpass mirrors timed out or failed
TLS from the build machine. Fixed ids in a dated extract are exact and reproducible.

Every point is checked against a bounding box for its stated area (Central, North, Medical, Downtown, South,
East, Southwest); the build fails if one falls outside. Fixes over the earlier file:

- Added: Law Quad (Hutchins Hall, way 154203693), Hill Auditorium, Kerrytown Market (way 193502051), C.S. Mott
  Children's Hospital (way 300848288), Downtown Library (AADL), and the Central Campus recreation building.
- The old Central Campus Recreation Building site holds the Hadley Family Recreation and Well-Being Center in OSM
  (way 1357847242, 401 Washtenaw Ave). The place keeps the id `ccrb` and is labeled "Central Campus Rec (Hadley
  Center)".
- `mainst` moved from the north side to the Main and Liberty intersection downtown (42.27959, -83.74860).
- There is no Kroger on Packard in OSM. `kroger` is now the Plymouth Rd store (node 2352859060, North), the one
  closest to student housing on North Campus.
- G.G. Brown, EECS, Duderstadt, Moore and the Chemistry Building now come from their OSM elements. Their names
  in OSM contain non-breaking spaces, which is why text search missed them.

## Synthetic and fictional data

### homes.json: SYNTHETIC

30 homes made up for the demo: 15 houses and 15 apartments.

- Real: only the location. Each home sits on a vertex of a named OSM street with `highway=residential` (features
  with `k == "residential"` in `streets.geojson`), inside a box for its neighborhood: South Central, East
  University, Kerrytown, Old Fourth Ward, Medical Campus, North Campus, Burns Park, Old West Side, Lower Town.
  No two homes are closer than 90 m. Names give the street and the type, never a house number, for example
  "Broadway St house, 5 bed".
- Made up: the existence of each home, its rooms, sizes, bathrooms, daylight levels, floors, whole-house rent
  and utilities. Rents were set by hand to look plausible for Ann Arbor student housing near campus. They are
  not drawn from listings and are not market estimates.
- Per-room `asking` rents are not data either. They split the house rent by a simple rule at the prior medians
  in `engine/model.js` (private bath $60, half bath $30, $8 per 10 sq ft over 120, $20 per daylight level),
  scaled by 0.8 and rounded to $5, so the rooms sum to the house rent.
- Mix: 6 houses with exactly 5 rooms (h1 to h6) for the group of five; 9 irregular houses (`irregular: true`:
  attic and basement rooms, unequal sizes, five with a private-bath room); 6 regular houses; apartments with
  1 to 3 bedrooms.
- Extra fields beyond the contract: `irregular` (bool) and `street` (the OSM street name).

### personas.json: FICTIONAL

Ten made-up students. Each carries `label: "FICTIONAL persona..."`, a private cap, mode limits, a `theta` used only
to auto-answer demo picks (labeled "demo values" in the UI), and a week with `p` and `alt` per entry. Places
are real (ids in `places.json`); the people, schedules and values are invented. Week labels use real U-M course
numbers (EECS 445, NURS 372, FIN 300, THEORY 238 and so on) so a week reads like a real one; which sections, days
and times a persona has is made up. Labels are labels only: no number in the app reads them, except that the You
tab's late-lab finder prefers a label with "lab" in it (Jordan's is "EECS 482 project lab").

| id | Week | Group | Cap |
|---|---|---|---|
| jordan | North Campus engineer: Beyster and EECS Mon Wed Fri, project team Tue Thu, late lab at the Duderstadt Center Tue Thu 19:00 to 23:30 (p 0.8; alt: Shapiro Library on Central, p 0.3), no bike. Golden path. | yes | $1000 |
| maya | Nursing: University Hospital clinical Tue Thu from 06:30 (alt: Mott, p 0.4), classes at the School of Nursing, study at Taubman Library | yes | $980 |
| priya | Ross classes, shop job at Kerrytown Market Mon Wed Thu evenings and Saturday (alt: Main St at Liberty, p 0.3), bikes | yes | $875 (tight) |
| leo | LSA: Angell Hall and the Chemistry Building, Shapiro Library until 23:00 (alt: Hatcher), Intramural Sports Building gym, bikes | yes | $960 |
| sam | Music: Moore Building classes, rehearsals until 22:00 (alt: Hill Auditorium, p 0.3), Saturday practice, no bike | yes | $1000 |
| noor | Law, Central only: Law Quad classes, Hatcher Library (alt: Shapiro), early gym at the Central Campus rec center | no (Me mode) | $1500 |
| dev | Ross BBA junior: FIN 300, MKT 300 and TO 300 at Ross, ECON 401 at Angell Hall, coffee shop shifts at Kerrytown Market Mon Wed Fri to 21:00 (alt: Main St, p 0.3), Sunday case team at Ross, Saturday shift on Main St (p 0.6), no bike | no | $1100 |
| clara | Music, violin performance junior: THEORY 238 and MUSICOL 345 at the Moore Building, orchestra rehearsal Mon to Thu 19:00 to 22:00 (alt: Hill Auditorium, p 0.4), weekend practice rooms, no bike | no | $950 |
| amara | Biochemistry pre-med and research assistant: University Hospital shift Mon Wed Fri 06:00 to 10:00 (alt: Mott, p 0.3), CHEM 351 and CHEM 352 lab at the Chemistry Building, BIOLOGY 305 at Angell Hall, MCAT study at Taubman Library to 21:00 (p 0.7), no bike | no | $1050 |
| mateo | Mechanical engineering senior: research lab at G.G. Brown, undergrad research Tue Thu afternoons, late test runs at the Ford Robotics Building to 23:00 (p 0.5; alt: Duderstadt), Kroger on Saturday, bikes | no | $1300 |

`group: true` marks the five members of the demo group.

Priya's cap is the tight one. With the current engine (fair.js, Spliddit normalization, commute compensation off)
the group's top house is h3 (Broadway St house, 5 bed, Lower Town). Priya's envy-free share there is $859. The
lowest cap that keeps h3 feasible is $855. Her stated cap of $875 is feasible; a cut of $25 or more makes h3
infeasible. `scripts/check_data.mjs` re-checks this on every run (it cuts each cap by $50).

### Operator population: SYNTHETIC

Built by `engine/operator.js` and `scripts/build_operator.mjs` (decide builder) from the shares in
`engine/config.js` (`marginals`), drawn independently. Not described here beyond that.

### catalog_sample.csv and plans_sample.json: SAMPLE (Next year tab)

`catalog_sample.csv` has 76 rows (75 sections, plus one `ARR` row the parser skips). It uses the column layout of
the U-M Schedule of Classes CSV as published in past years. The real header has not been checked against a
current file. `catalog_sample.meta.json` carries the label shown on screen: "SAMPLE catalog: course numbers are
real; sections, times and rooms are made up".

- Real: course numbers and titles (EECS 281, 376, 445, 482, 484, 485, 499; ECON 101; PSYCH 111; SOC 100;
  STATS 250; NURS 370, 372, 373). Added Nov 20 for the three new plans: FIN 300, MKT 300, TO 300 (the Ross BBA
  floating core), ECON 401, EECS 183, EECS 314, THEORY 238, MUSICOL 345, ENS 344 (Campus Philharmonia/Symphony
  Orchestras), MECHENG 335, 350, 360, 382, 395. Numbers were checked against Ross, SMTD and College of Engineering
  pages on Nov 20 2026; the TO 300 title ("Operations Management") and the use of a LAB component for the ENS 344
  rehearsal were not checked. The nursing clinical is listed as `PNE 350`. The UMSN 2026-27 undergraduate
  handbook lists the Therapeutic Nursing Care II clinical as PNE 350 to 366, 5 credits. Building codes map to
  real places through `engine/ics.js` (BBB, EECS, GGBL, FMCRB, CHEM, AH, UGL, NIB, UH; Ross, Moore and Hill
  Auditorium match by name).
- Made up: every section number, day, time, room number, class number and component split, and the
  instructor (`Sample`). Start and end dates are left blank. Term is `SAMPLE`.
- How it is shaped: most EECS sections are on North Campus, with one Central option for some components. There
  are some evening sections, and the EECS 482 lab has five sections. ECON 101 is all Central. Nursing lectures
  are at NIB, and the clinical is at University Hospital (two early shifts, one Friday and Saturday, one
  evening). Times were spread out only so that a plan can usually be scheduled without clashes. No number
  was set to steer a result.

`plans_sample.json` ("SAMPLE plans, made up") holds five plans that `engine/catalog.js` draws weeks from:

| id | Persona (walking limits) | Courses | Choice | Maybe |
|---|---|---|---|---|
| cs | jordan | EECS 482 lecture and lab, EECS 376 lecture and discussion, ECON 101 lecture and discussion | one of EECS 445, 485, 484 | research lab job, Ford Robotics Building, Tue Thu 13:00 to 17:00, odds 0.4 |
| nursing | maya | NURS 372, NURS 373, PNE 350 clinical | one of PSYCH 111, SOC 100, STATS 250 | part-time job, Kerrytown Market, Mon Wed 18:30 to 21:30, odds 0.5 |
| ross | dev | FIN 300, MKT 300, TO 300 lectures, all at Ross | one of ECON 401, EECS 183, PSYCH 111 | restaurant job on Main St, Tue Thu Sat 17:00 to 23:30, odds 0.5 |
| music | clara | THEORY 238, MUSICOL 345 lecture and discussion, ENS 344 rehearsal (Hill Auditorium Mon Wed or Moore Tue Thu, 19:00 to 22:00) | one of PSYCH 111, SOC 100, STATS 250 | evening job at Trader Joe's on Washtenaw, Mon Wed 17:00 to 21:00, odds 0.5 |
| mecheng | mateo | MECHENG 350 lecture and lab, MECHENG 360 lecture and discussion, MECHENG 382, MECHENG 395 lab, all on North | one of MECHENG 335, EECS 314, ECON 101 | tutoring job at Shapiro Library, Tue Thu 20:00 to 23:00, odds 0.5 |

The three new plans reuse the existing PSYCH 111, SOC 100, STATS 250 and ECON 101 sections and add none to them;
the cs and nursing plans and their numbers are unchanged. On the tab (k 200, seed 1): Ross BBA junior $35 a
month, Church St house loses least (65%), the Main St job is worth $22; Music performance junior $73 a month,
Catherine St house (45%), the Trader Joe's evening job is worth $73 and the ENS 344 section $30; Mechanical
engineering junior $16 a month, Georgetown Blvd house (61%), the UgLi tutoring job is worth $12.

The odds and the share of full sections (early 5%, normal 20%, late 40%) are assumptions, not data. The repo
never ships a real Registrar file. A student's own file is read in the browser and never uploaded.

## Sample posts for the Listings tab

`web/public/data/posts_sample.json` ("SAMPLE posts, made up for the demo; not real listings or people") holds 15
short posts written in the style students use in sublet groups. Every post is made up: there is no real listing,
landlord or student behind any of them, and none carries a name, phone number, email or link. Street names were
chosen from the `n` names in `streets/streets.geojson` so that `engine/listing.js` can place them; the street data
leaves many central blocks unnamed (Packard Street, for one, has no named segment), so the samples use pairs that
meet in that file. They cover: an intersection (Hill St near Church), a street only (Catherine St), a place name
(the Michigan Union), a summer sublet, a Winter semester sublet, a whole-house total split per person, a post with
no location (it asks for a pin), and one reworded duplicate of the first post (merged as "seen 2 times"). Posts 8 to 15, added Nov 20: a
whole-house lease (Lincoln Ave, 6 bed, house total split per person, so it reads $950/mo), a studio near the hospital (Glen Ave), a North Campus room
(Baits Dr), a short Winter sublet (East Ann St, Jan 6 to Feb 28), a 5 bed priced per person (Lawrence St), a
cross street only (Geddes and Observatory), an all-caps post with slashes (S Division St; emojis were left out
so the file stays ASCII) and a room with parking included (Broadway St). The demo uses posts 1 and 2 only.
A pasted post that names a street the file lacks ("on Packard near Hill") keeps that name as the street. It is
never swapped for the cross street. The point is a guess on the cross street near the student's week, and the
card asks for a pin. Oakland, Tappan, Monroe, Benjamin and East University are also missing from the file.

Posts a student pastes stay in their browser (localStorage) with emails, phone numbers, links, handles and
self-introductions removed. Quorum never collects posts on its own.

## What we do not have

No real listings, rents, room sizes or occupancy. No student data of any kind. No street lighting data and no
crime data. No live or real-time bus data: the timetables are scheduled service only.

## Rebuild and check

```
python pipeline/build_places.py     # about 60 s, reads the local Michigan extract, no network
python pipeline/build_homes.py      # under 1 s, reads streets.geojson
node scripts/check_data.mjs         # about 2 s: schema, labels, ASCII, every persona week from every home, group caps
```
