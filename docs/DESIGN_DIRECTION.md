# Visual direction (binding for the redesign)

Owner feedback, Fri 00:05: "The front-facing UI is pure AI slop. Too much frontend info for users. Complete lack of
visuals." This document fixes that. It overrides older UI guidance where they differ.

## The goal

A student understands their best home in five seconds without reading a sentence. Visuals carry the meaning; words
only label them. Every detail is one click away, never on the default screen.

## Visual language: transit-map clarity

- Paper `#F7F5F0`, ink `#1A1A1A`, gray `#6B6B6B`, hairlines `#DEDAD2`. Plain white cards are fine.
- Bus routes always use their real GTFS colors. Walking is a dashed ink line. Time after dark is a navy band.
- Homes are colored by fit with one sequential scale (light sand for worst to deep green `#1F6F4A` for best). Never
  rainbow. Check contrast on paper.
- Members of a group have one fixed color each, used everywhere (chip, room, route, ribbon).
- Type: IBM Plex Sans for everything. IBM Plex Mono only inside dense number columns. Source Serif only for the
  wordmark and slide titles. Sizes 13, 15, 20, 28, 44. Big numbers, small labels. Two weights per screen.
- Lines and shapes: 1 px hairlines, 2 to 4 px route lines, 8 px radius on cards, no shadows beyond 1 px.

## Anti-slop checklist (every screen must pass)

1. No paragraph on a default screen. One short sentence at most under a heading.
2. No kicker lines, no "how to read this page" strips, no method names (CSA, BALD, LP, posterior) on default screens.
   Methods live in Evidence and in a "How we got this" disclosure.
3. At most three numbers per card, each with a unit.
4. One small "Sample data" chip in the top bar. Listing cards say "Sample listing" once in small gray text. No
   SYNTHETIC or FICTIONAL tags scattered through panels (Evidence and the pitch state it plainly).
5. Every section leads with a picture: map, week ribbon, chart, house diagram or grid. Text-only sections are not
   allowed on default screens.
6. One primary button per screen. Everything else is a quiet text button.
7. No uppercase micro-labels in every block, no numbered rail with subtitles, no badges on badges.
8. No emoji, gradients, glass, neon, glows, sparkles, or a centered hero with two buttons and three cards.
9. Short second-person copy: "Your best home", "Why", "Watch out", "Late nights", "This one", "Tour times".
10. Respect prefers-reduced-motion. Motion only when data changes, 150 to 250 ms.

## Navigation

Top bar: wordmark "Quorum", tabs `You`, `Your group`, `Owners`, `How we know`, `Pitch`, and the Sample data chip.
No left rail. Hash routes stay `#me`, `#group`, `#operator`, `#evidence`, `#pitch`.

## You (#me)

1. Hero, full width: the map (about 60%) with every home as a dot colored by fit, the top three labeled 1, 2, 3, and
   the selected home's week drawn as route-colored lines. Beside it (about 40%) "Your top 3": one card each with the
   home name, the room, three big numbers (all-in $/month, hours a week getting around, late nights with no ride or
   walking in the dark), a mini week ribbon and one "why" sentence. Card 1 is larger. A "Play this trip" control sits
   on the map.
2. Trade-offs: one scatter of every home, all-in $/month (x) against hours a week (y), dot color by fit, the top
   pick ringed, the cheapest home marked. One sentence: "The cheapest home costs you N hours a week."
3. Teach it what you care about: two big cards side by side, each a week ribbon plus three numbers, and a "This one"
   button under each. Progress dots, not text. After the picks, at most three small range bars of what it learned.
4. Your week: a week calendar grid (Mon to Sun, 7 AM to 1 AM) with entries as blocks colored by campus. "Edit" opens
   the existing editor. "Import a calendar" sits here.
5. What if: three chips above the trade-off chart (late lab on Central, September or December, change time).
6. Details (one disclosure under the top 3): expected regret, chance of being best, the 50-dot plots, the value of
   knowing the schedule, the break-even, the full ranking.

## Your group (#group)

1. Hero: a house diagram of the chosen house, floors stacked (attic, 2nd, 1st, basement), rooms as rectangles sized
   by square feet, each with the member's color chip, name and rent share. The total rent and a check mark with
   "Nobody would swap" sit above it.
2. Members: five color chips with a mini week ribbon each. Caps show as "private".
3. Houses compared: small multiples, one mini diagram per candidate house, marked "works for everyone" or "over
   someone's cap".
4. Two move buttons ("Lower a cap", "Add a late shift"); the result shows as the diagram changing and one sentence.
5. Tour times: a Mon to Fri by 9 AM to 7 PM grid with the slots that work for all five filled green, and "Copy
   message" next to the draft.
6. Details: the swap check as a heat grid (members by rooms, colored by dollar margin), the house ranking table.

## Owners (#operator)

1. The selected house as a diagram, each room with its fair rent range as a horizontal bar and the asking rent as a
   tick; mispriced rooms stand out.
2. Who it fits: one bar chart by kind of week.
3. Portfolio: small multiples of every house with one number each.
4. Renovation lever: before and after bars.

## How we know (#evidence)

Charts, not tables: the difference between our router and R5 as a histogram, the regret curves of adaptive versus
random questions, the fair-split test counts as big numbers. References in a disclosure.

## Pitch (#pitch)

Each slide is one visual and one sentence. Numbers stay live.
