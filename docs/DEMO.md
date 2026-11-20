# Quorum demo script (4 min 20 s, then a 30 s buffer)

For Zeren and Ruibin. One laptop, one browser window on the projector. Ruibin is at the keyboard the whole
time. Zeren speaks steps 1 to 4. Ruibin says one line in step 3 and speaks steps 5 to 7.

Spoken words: 529 in total (only the lines that start with ">" under "Say"; per step 47, 111, 72, 37, 90, 66,
106). At about 130 words a minute that is 4 min 4 s of talking. Most clicks happen while someone talks; the
silent clicks (marked "silent") and the scrolls add about 18 s, so the plan is about 4:20. The 30 s buffer runs to 4:50, which
leaves 10 s before the 5:00 cut. Rehearse twice with a stopwatch.

Every number below comes from the engine and was checked in the built app at 1280x720 (Fri Nov 20 2026), with
pick 1 by hand, then **Answer the rest**. To re-check all of them in one command, from the repo folder:

```
node scripts/demo_numbers.mjs
```

It prints each number with the section it belongs to, in about 3 seconds, with no network. Section numbers in
"Numbers" lines below refer to its output. If a number on screen differs from this page, trust the screen and
say the screen's number.

All homes, rooms and rents are SYNTHETIC. All people are FICTIONAL. The sample calendar file is SYNTHETIC. Bus
timetables, streets and places are real. The top bar always shows the **Sample data** chip.

## Before you go on (5 minutes before the slot)

1. Start the app: in a terminal, from the repo folder (the one that holds `web/` and `engine/`),
   `node web/dist/serve.mjs`. It prints `http://localhost:4173`. No Node? `cd web/dist` then
   `python -m http.server 4173`.
2. Open http://localhost:4173 in Chrome or Edge. Wait until **Your top 3** shows three cards next to the map
   (a few seconds). Do not click anything on that page.
3. Click **Pitch** in the top bar. Press the **Home** key so slide 1 shows ("10 minutes from campus."). Leave
   the listing menu on the right at **Plymouth Rd apartment, 2 bed**.
4. Set browser zoom to 80% (Ctrl and minus) so the map and all three cards fit. Press F11 for full screen.
5. Close other tabs. Wi-Fi can be off: the app makes no network calls.
6. Keep this page and the printout of `node scripts/demo_numbers.mjs` on a phone or paper.

The top bar reads **You**, **Your group**, **Owners**, **How we know**, **Pitch**. Opening a tab always starts at
the top of the page. Use the Home and End keys to jump to the top or bottom of a page. How we know is for Q&A.

Rule for the clicks: leaving You and coming back resets Jordan's picks. Go Pitch, then You, then Your group, then
Owners, and do not go back to You.

## Timeline

| Time | Step | Speaker | Words |
|---|---|---|---|
| 0:00 to 0:25 | 1. The problem, Pitch slide 1 | Zeren | 47 |
| 0:25 to 1:20 | 2. Jordan's top 3, the Georgetown trip on the map, a calendar file | Zeren | 111 |
| 1:20 to 1:55 | 3. Picks, Details, the cheapest-rent baseline | Zeren, one line by Ruibin | 72 |
| 1:55 to 2:15 | 4. One sensitivity move | Zeren | 37 |
| 2:15 to 3:00 | 5. Your group: split, tour times, Priya's cap | Ruibin | 90 |
| 3:00 to 3:30 | 6. Owners: asking vs fair, the half bath | Ruibin | 66 |
| 3:30 to 4:20 | 7. Close: what we built, limits, pilot ask | Ruibin | 106 |
| 4:20 to 4:50 | buffer | | |

If step 5 has not started by 2:25, skip the step 6 half bath sentences. If rehearsals run long, drop the
calendar file (step 2, clicks 5 to 7 and its last three sentences, 30 words). Never cut step 7.

## 1. The problem (0:00 to 0:25), Zeren

Screen: **Pitch**, slide 1. One SYNTHETIC listing, Plymouth Rd apartment, 2 bed, on North Campus. Three campus
groups (Central, North, Medical), each with a walk bar and two bus bars (2:00 PM, 11:30 PM) on Tue Dec 1 2026.
The 11:30 PM bars sit on the gray "After dark" band. No clicks.

Say (Zeren):
> Listings say ten minutes from campus. Which campus, at what hour? One synthetic North Campus listing,
> live on real bus timetables. From North Campus: 11 minutes at 2 PM, 24 at 11:30 PM. From Central: 31
> to 39. And leases are signed before fall schedules are final.

Numbers (section 0): North Campus (Beyster) walk 15, bus 11 at 2:00 PM, 24 at 11:30 PM. Central Campus (UgLi)
walk 53, bus 31 and 39. Medical Campus walk 39, bus 23 and 39. Dark after 5:35 PM that day.

Fallback if the bars do not draw: go to You and say the same lines without the numbers.

## 2. Jordan's top 3, one trip, a calendar file (0:25 to 1:20), Zeren

Jordan is a fictional North Campus engineer with a late lab at the Duderstadt Center, Tue and Thu until 11:30 PM.
Jordan does not bike and walks at most 10 minutes alone after 10 PM.

Clicks:
1. Silent, 2 s: click **You** in the top bar. **Whose week** shows **Jordan** selected. **Your top 3** card 1
   reads **Broadway St house, 5 bed**, "Garden room, $923/mo with utilities": **$1,351/mo** cost to you,
   **4.4 h/wk** getting around, **2 /wk** late nights, and the line "Lower rent: **$178/mo** better than a typical
   home". The small
   week ribbon under the numbers is Jordan's week from that house.
2. On "the cheapest rent", press **End** once and scroll up a little to **Trade-offs**. Its sentence reads "The
   cheapest rent, rooms from $821, costs you $187 a month more than your top pick, once time and late nights
   count." The key under the chart names "Cheapest rent, from $821, Georgetown Blvd house, 5 bed".
3. Click the dot inside the black square in the chart (Georgetown). Press **Home**. The line just above the map
   key now reads "Georgetown Blvd house, 5 bed: Tue 23:30, bus 22".
4. On "Here is that trip", click **Play this trip** (top left of the map, "11:30 PM to 11:49 PM"). For about 7
   seconds a dot walks to the stop, rides bus 22 along its real route, then walks the dashed street path to
   Georgetown. It ends on "Arrived".
5. On "calendar file", press **End**, click **Import a calendar** (under **Your week**). Tick **Use my calendar
   to build my week**. Click **Use the sample week**.
6. The preview reads "7 weekly classes from the sample week" on a week grid. Below it, **EECS 482 discussion**,
   Fri 9:30 AM, "1013 Dow", waits with a **Pick a place** menu. Point at that row.
7. Click **Discard**, then **Close** (top right of the panel). Do not click **Replace my week** or **Add to my
   week**: either would change every number after this step.

Say (Zeren):
> Jordan is a fictional North Campus engineer. Lab until 11:30 PM twice a week, and at most 10 minutes
> walking alone at night. Quorum runs that week through all 30 homes. Top pick: Broadway, $178 a month
> lower rent than a typical home. Now the cheapest rent, Georgetown, rooms from $821. It costs Jordan
> $187 a month more. Twice a week, no way home within Jordan's limit. Here is that trip: one bus, then an 11 minute walk in the dark. A week can also come
> from a calendar file. After a consent box, it is read in this browser and never sent. Rooms it cannot
> match are flagged, not guessed.

Numbers (section 10, before any pick): Broadway $1,351/mo cost to you, $923/mo with utilities, 4.4 h/wk, 2 late
nights, "Lower rent: $178/mo better". Catherine St #2, "Less time getting around: $78/mo better". East Ann St #3,
"Bigger room: $47/mo better". Trade-offs: Georgetown, rooms from $821, $187/mo more cost to you. Section 1: Georgetown 19 min door to door, route 22 then an 11 min walk (longest stretch 10.8 min),
2 trips a week with no allowed ride; Broadway 18 min, routes 22 and 23, 3 min walks at each end. Section 8: the
sample file gives 7 entries, 1 skipped (the all-day "Fall study break"), 1 with no match ("1013 Dow").
"Cost to you" is rent and utilities plus what travel time, darkness and trips with no ride cost Jordan, less what
the room is worth to Jordan; hover the number for that sentence.

Fallback: if the chart click does nothing, click the Georgetown dot on the map itself (top right, north of
Duderstadt). If **Play this trip** does not move (reduced motion is on), it reads **Step through this trip**:
click it, then **Next step** three times. If the sample file does not load, skip clicks 5 to 7 and still say the
calendar lines.

## 3. Picks, Details and the baseline (1:20 to 1:55), Zeren and Ruibin

Clicks:
1. Scroll up to **Teach it what you care about**. Pick 1 shows **Third St house, 4 bed**, Front room, $925 a
   month, 7.8 hours a week, 2 "late nights with no ride", against **Washtenaw Ct apartment, 2 bed**, Bedroom 1,
   $1,415, 4.0 hours.
2. While Ruibin says the line, click **This one** under Washtenaw Ct.
3. Silent, 2 s: click **Answer the rest**. The dots fill and the line reads **Enough to rank**. Three rows show
   what was learned: "An hour of your time $15 an hour", "A trip with no ride $33 a trip", "A private bathroom
   $45 a month". Do not click **Ask one more**.
4. While Zeren talks, press **Home** and click **Details** (just under the map). Point at **74%** "chance
   Broadway St house, 5 bed is best". On "the cheapest rent", scroll to **Full ranking** and point at row 8,
   Georgetown Blvd, expected regret $269.

Say (Zeren):
> Next, Quorum learns what Jordan values.

Say (Ruibin, while clicking This one):
> Answering as Jordan: Washtenaw costs $490 more, but saves almost four hours a week and both no-ride nights.
> Jordan picks it.

Say (Zeren, after Answer the rest):
> Jordan's fictional values answer the rest. About fifteen dollars an hour for time. Broadway stays first, best
> in 74 percent of 24 possible weeks and 200 value draws. Picking the cheapest rent on North Campus gives
> Georgetown. Quorum ranks
> it 8th, $233 a month worse.

Numbers (section 2b): pick 1, Third St $925/mo, 466 min/wk door to door, 2 no-ride trips; Washtenaw Ct
$1,415/mo, 241 min/wk, 0 no-ride trips. The auto answer is also Washtenaw (demo values give Third St a 0% chance),
so every number after it is the same as a full auto run. After 3 picks: value of time median $15.2 (80% range
$6.9 to $25.3); #1 Broadway St, $903 rent, expected regret $36/mo, best in 74%; value of knowing the schedule
$31/mo. Break-even (in Details): Catherine St wins only above $75 an hour. Section 10 after the picks: card 1
$1,251/mo cost to you, Attic room, $903/mo with utilities, "Lower rent: $198/mo better"; card 3 is now Lawrence
St. The Trade-offs sentence now says Georgetown costs $233 a month more.
Numbers (section 2c): the filter picks Georgetown Blvd ($821 from); Quorum ranks it #8 of 30, expected regret
$269/mo against $36, so $233/mo worse; it is still best in 9.4% of draws.

Fallback if **Answer the rest** is grayed out or does nothing: skip the picks. Details shows the before-picks
numbers: Broadway best in 71%, $38 regret, $18 a month value of knowing; Georgetown #7, $187 a month worse. Say
those.

## 4. One sensitivity move (1:55 to 2:15), Zeren

Clicks:
1. Silent, 3 s: scroll down to **Trade-offs**. In its **What if** row click **Late lab on Central**. It turns
   dark. Press **Home**. **Your top 3** now reads **Lawrence St house, 5 bed** $1,411, **Church St house, 5 bed**
   $1,414, **Lincoln Ave house, 5 bed** $1,418. Details stays open below with a **Before** column.

Say (Zeren):
> One change: the lab moves to Central Campus. A new top three, Lawrence, Church and Lincoln, within seven
> dollars a month. Broadway falls to ninth. For Jordan, where the lab is now matters more than which house.

Numbers (section 10, central): Lawrence $1,411 cost to you, "A ride for every trip: $214/mo better"; Church St $1,414;
Lincoln Ave $1,418. Section 3a: by expected regret $52, $54, $58 (spread $6); Lawrence best in 28%; Broadway #9,
$186. Value of knowing $34/mo.

If a judge asks about the month chips (do not demo unless asked): **December** keeps Broadway first. Dusk is
5:35 PM on Dec 1 against 8:13 PM on Sep 15, so dark walking grows, but Broadway has the least dark walking of the
top two in every month (section 3b).

Fallback if the chip does nothing: say "if the lab moves to Central, Broadway falls to ninth and the top three
are within seven dollars" and move on.

## 5. Your group (2:15 to 3:00), Ruibin

Clicks:
1. Silent, 3 s: click **Your group** in the top bar. The left panel draws **Broadway St** as a house cut in
   floors, one room per member with their share: Sam $854 (attic), Priya $859 and Jordan $773 (2nd), Maya $883
   (1st), Leo $779 (basement). Top right: **$4,150/month**. Two green checks: **Nobody would swap**, **Under
   every cap**. **Members** on the right says "Caps are private".
2. On "tour it", scroll down to **Tour times**. Point at the grid: only Friday has green cells, "5 of 100
   half-hours work for all 5". Point at **Fri 5:00 PM**, then at **Copy message** and "Quorum sends nothing." (**See the message** opens the draft.)
   Do not click **Copy message** unless asked.
3. On "Priya lowers her cap", press **Home** and click **Lower a cap** once. Only once. Do not click **Add a late
   shift**.
4. The house redraws as **Georgetown Blvd**, $3,950, both checks green, and a line reads "Priya's lower cap
   rules out Broadway St. The group moves to Georgetown Blvd." Priya's row in **Members** opens "Only Priya sees
   this." Point at "Broadway St fits if your cap rises by $25."

Say (Ruibin):
> Five fictional friends rent one house. Each sets a private rent cap. Quorum picks the house, gives everyone a
> room, and splits the rent so nobody would rather swap. Broadway: shares from $773 to $883, adding up to the
> rent exactly. A separate checker confirms nobody would swap. It also finds when all five can tour it: only
> Friday works. It drafts the note but never sends it. Priya lowers her cap. Broadway no longer fits, and the
> group moves to Georgetown. Only Priya sees why: she is $25 short.

Numbers (section 4): Broadway $4,150, split $773.44 / $883.44 / $859.24 / $779.44 / $854.44, sum $4,150.00. 4 of
20 swap margins are exactly $0 (Details, **Swap check**, "$0.00 smallest margin"); swap-free in 2% of value
draws. Section 9: 5 of 100 weekday half-hours work, all on Friday; Fri 5:00 pm (88 min of travel for the group)
and Fri 6:00 pm (89 min). Section 4b: Priya's cap $875 to $830; Broadway has no swap-free split under every cap;
Georgetown Blvd ($3,950) fits, checker passed; Priya's gap $25. Any cut of $25 or more does the same.

Fallback if the house does not draw within 3 seconds: say the numbers above. If the house stays on Broadway
after the click, click the **Georgetown Blvd** card in **Houses compared**. If you clicked **Lower a cap** twice,
click **Undo** and click it once.

## 6. Owners (3:00 to 3:30), Ruibin

Clicks:
1. Silent, 2 s: click **Owners** in the top bar. It opens on **Church St house**: **$4,650** a month, **2 of 5**
   rooms priced off. The house chart puts each room on its floor with a green fair range and an asking tick.
   The **Back room** row is red: "$12 over". The **Basement room** row is red too: "$5 over".
2. Scroll to **Add a half bath at Church St house**. Point at **+$32** "a month for Basement room", the bar chart
   (green Basement bar right of $0, gray bars left for the other rooms), and the slider "A private bath is worth
   $60/mo assumed". Do not drag it unless a judge asks.

Say (Ruibin):
> This view is for owners of irregular houses. Each room gets a fair rent range from 200 sample groups. Here
> the back room asks $12 above its range. A half bath in the basement raises that room's fair rent $32 a month
> and lowers the others, at the same house rent. That rests on our assumed bath value. With no build cost, we
> claim no payback.

Numbers (section 5): Church St, Back room asking $910, fair range $859 to $898 (typical $883), so "$12 over".
Half bath: Basement +$32/mo, Attic -$6, Front -$6, Back $0, Parlor -$18 at the same house rent; group value
+$40/mo (in **Numbers and how we got this**). Slider at $30: +$17 room share; at $120: +$65. **Who it fits**:
339 of 2,000 sample students pick Church St first, #2 of 30.

Fallback if the charts stay gray for more than 3 seconds: say the numbers above.

## 7. Close (3:30 to 4:20), Ruibin

Screen: stay on Owners, or point at the **Sample data** chip in the top bar.

Say (Ruibin):
> We built our own Connection Scan router on TheRide and U-M GTFS and OpenStreetMap, a particle
> filter that picks each question by information gain, and our own simplex LP for the envy-free split. React and
> MapLibre draw it. No LLM and no outside APIs at runtime. Checked against r5py: median difference 1
> minute. Limits: a December timetable stands in for the year, on-demand rides are not in the feeds, no hills or
> snow, picks are stated choices, and all homes and people are synthetic. Our pilot idea, a hypothesis: five
> irregular houses, one leasing season, then compare fair shares with which rooms sat empty. Thank you.

Numbers (section 6): r5py 1.1.7, 720 trips, 690 reachable in both, median difference 1.0 min, 87.5% within 2
min. Reference router: 3,000 of 3,000 trips equal.

## If something breaks

| Problem | Do this |
|---|---|
| Page blank or "The data did not load" | Close the tab. Restart `node web/dist/serve.mjs`. Open http://localhost:4173 again. |
| Port 4173 busy | `node web/dist/serve.mjs web/dist 4174`, then open http://localhost:4174 |
| No Node on the laptop | `cd web/dist` then `python -m http.server 4173` |
| A tab says "did not open" or "is not in this build" | Skip that step and say its numbers from this page |
| **Your top 3** shows empty gray cards for more than 5 seconds | Say step 2 from this page, then go on to **Your group** |
| The app is fine but slow | Keep talking; every compute is under 0.2 s once loaded |
| Nothing works | Present from this page and the script printout. Say plainly that the live app failed. |

The backup video is `docs/backup/quorum_demo_backup.mp4` (1280x720, captions, no sound). It walks the same path.
