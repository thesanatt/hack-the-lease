# Paste any post, and Next semester (binding build contract)

Three changes, built on branch `semester-listings`.

## 1. "Next year" becomes "Next semester"

The lease runs 12 months, but under Ann Arbor's 210 day rule a student signs around spring, when the coming Fall
registration is close or done. What they truly do not know is the semester they have not registered for (usually
Winter) and jobs. So the feature prices the unknown semester.
- Tab label "Next semester" (hash stays `#next` so nothing else breaks). Hero label: "what not knowing next
  semester's schedule costs you". Every other on-screen "next year" becomes "next semester" where it means the
  schedule. Dollar figures stay "a month" (per month while that semester runs).
- Pitch slide 2 keeps its title "You sign before your schedule exists." and uses semester wording elsewhere.
- docs/NEXT_YEAR.md gets a short note at the top saying the screen now says "next semester" and why.

## 2. Speed, measured live and shown once

The router is Connection Scan on the real timetables; one scan serves every home. Measured on this laptop in node:
sample CS plan, 200 weeks x 30 homes = 113,790 door-to-door trips in 0.99 s; Nursing, 81,900 trips in 0.29 s.
- `runNextYear` (web/src/views/next/compute.js) also returns `routing: { trips, ms }`: the number of door-to-door
  trips actually evaluated (every trip of every routed week for every home) and the wall time spent routing them.
  Count honestly: weeks served from the cache count as zero new trips and zero time; when everything came from
  the cache, show the numbers from the run that routed them.
- The Next semester tab shows one quiet line near the map: "113,790 door-to-door trips routed in 1.0 s, in this
  browser" with the live numbers. Gray, small, no method names.
- Pitch slide 4's Router stop shows the same live throughput when the Next semester computation has run, else the
  evidence figure it shows today.

## 3. "Paste any post" (new tab "Listings", hash `#listings`, after "Next semester")

Why: sublets and rooms are posted across Facebook groups, Reddit, email and group chats. Quorum does not collect
posts on its own (Facebook's terms forbid automated collection, groups are members only, and posts carry other
students' personal data). The student pastes a post they can already see; nothing leaves the browser.

### Engine: `engine/listing.js` (pure ES module, tested in `test/listing.test.mjs`)
```
parsePost(text, { streets, places }) -> {
  rent: number | null,            // dollars a month; "$850/mo", "850 per month", "$850 a month"; a total for a
                                  // whole unit with "for the whole 4br" is divided only if the post says per person
  utilities: 'included' | 'extra' | null,
  start: 'YYYY-MM-DD' | null, end: 'YYYY-MM-DD' | null,   // "May 1 - Aug 15", "May to August", "summer", "Winter
                                  // semester", "Jan-Apr"; assume the next occurrence after today, 2026-11-20
  term: 'summer' | 'fall' | 'winter' | 'year' | null,
  beds: number | null, bedsInUnit: number | null,          // "1 room in a 4 bed", "studio" = 0
  furnished: boolean | null,
  street: string | null, cross: string | null, number: string | null,  // "1234 S State St", "on Packard near Hill"
  location: { lat, lon, how: 'intersection' | 'street' | 'place' | null, note },
  contact: null,                  // never extracted or stored: no names, phone numbers, emails or profile links
  confidence: { [field]: 'found' | 'guessed' | 'missing' },
  fields: [ { key, value, from: 'the matched text span' } ] }
dedupeKey(listing) -> string      // street + number or cross + rent + start month, for merging the same post seen twice
draftMessage({ listing, facts, student }) -> string
```
- Street names match the `n` names in `web/public/data/streets/streets.geojson` (normalize St/Street, Ave/Avenue,
  S/South, case). With a cross street, place the listing at the two streets' nearest shared point (intersection).
  With only a street, use the street point nearest the campus centroid of the student's week and mark it
  'street' with a note to drop a pin. With a place name in places.json (for example "near the Union"), use it.
- `draftMessage` is a template, not a language model. It uses only: the post's dates, rent and street, the
  student's first name if they typed one (else no name), and the student's own facts computed by the app (for
  example "From your place my trip to University Hospital is 14 minutes by bus" and the first tour slot that
  works). Polite, under 90 words, plain. Quorum never sends it; there is a Copy button.

### Data: `web/public/data/posts_sample.json`
`{ "label": "SAMPLE posts, made up for the demo; not real listings or people", "posts": [ { id, text } ] }`, about
6 short posts in the style students write ("Subletting my room on Packard near Hill, May 1 to Aug 15, $780/mo
utilities included, furnished, 1 of 4 bed..."), covering: an intersection, a street only, a place name, a summer
sublet, a Winter-semester sublet, and one duplicate of another. No names, phone numbers or emails in them.

### View: `web/src/views/ListingsView.jsx` and `web/src/views/listings/*`
Visual first, per docs/DESIGN_DIRECTION.md.
1. "Whose week" chips like the You tab (persona), and a big paste box: "Paste a post from any group or site".
   Under it a quiet link "Try a sample post" that cycles through the sample posts. "Add" parses it.
2. Each added post becomes a card: the parsed fields as chips (rent, dates, beds, furnished, utilities), each
   marked found or guessed; any chip can be edited inline; a missing location asks "Drop a pin" and the next map
   click places it. Duplicates merge into one card that says "seen 2 times".
3. A map with the pasted listings (numbered, distinct marker style) and the sample homes faint for context.
4. "How they compare for your week": the pasted listings ranked with the 3 best sample homes, by cost to you a
   month for the chosen student's most likely week (same values as the You tab before any pick), with hours a
   week, late nights with no ride, and the rent. One sentence: "Best of your pasted posts: Packard near Hill,
   $X a month less than the next."
   A post whose dates do not cover the student's semester is shown with a note ("ends Aug 15: summer only").
5. "Reach out" on each card: the draft from `draftMessage`, editable, a Copy button, and the line "Quorum sends
   nothing."
6. Pasted posts stay in this browser (localStorage, wrapped in try/catch) and can be cleared. The top of the tab
   says once: "Paste posts you can see. Quorum does not collect posts on its own, and nothing leaves this browser."
To route pasted listings, add them as points to the router at runtime (see how `web/src/engine/index.js` calls
`planner.addPoint`; add a small `api.addPoint(id, lat, lon)` there if none exists) and evaluate the student's week
with `api.weekFor` for those ids.
For the pin drop, add an optional `onMapClick(lngLat)` prop to `web/src/components/MapView.jsx` (additive only).

## Rules
ASCII only, no em or en dashes, no hype words. No real personal data anywhere. Sample posts are labeled sample.
Keep every existing test green and add tests for the new engine module. `npm run build` must pass.
