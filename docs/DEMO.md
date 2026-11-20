# Quorum demo script (4 min 15 s, then a 30 s buffer)

For Zeren and Ruibin. One laptop, one browser window on the projector. Ruibin is at the keyboard the whole
time. Zeren speaks steps 1 to 4. Ruibin says one line in step 3 and speaks steps 5 to 7.

Spoken words: 517 in total (only the lines that start with ">" under "Say": 49, 59, 104, 51, 82, 66, 106). At
about 130 words a minute that is 3 min 59 s of talking. Most clicks happen while someone talks; the few silent
clicks (marked "silent" below) add about 14 s, so the plan is about 4:15. The 30 s buffer runs to 4:45, which leaves
15 s before the 5:00 cut. Rehearse twice with a stopwatch.

Every number below comes from the engine and was checked in the running app (build served at
http://localhost:4173, Thu Nov 19 2026, late evening), including pick 1 by hand then Auto-answer. To re-check all of them in one command, from the repo folder:

```
node scripts/demo_numbers.mjs
```

It prints each number with the section it belongs to, in about 3 seconds, with no network. Section numbers in
"Numbers" lines below refer to its output. If a number on screen differs from this page, trust the screen and
say the screen's number.

All homes, rooms and rents are SYNTHETIC. All people are FICTIONAL. Bus timetables, streets and places are real.

## Before you go on (5 minutes before the slot)

1. Start the app: in a terminal, from the repo folder (the one that holds `web/` and `engine/`),
   `node web/dist/serve.mjs`. It prints `http://localhost:4173`. No Node? `cd web/dist` then
   `python -m http.server 4173`.
2. Open http://localhost:4173 in Chrome or Edge. Wait until the **Homes** table and a trip panel appear on **Me**
   (a few seconds). Do not click any pick button.
3. Click **Pitch** in the left rail. Press the **Home** key so slide 1 shows ("10 minutes from campus.").
4. Set browser zoom to 80% (Ctrl and minus) so tables fit. Press F11 for full screen.
5. Close other tabs. Wi-Fi can be off: the app makes no network calls.
6. Keep this page and the printout of `node scripts/demo_numbers.mjs` on a phone or paper.

The left rail reads Me, Group, Operator, Evidence, Pitch, and it stays on screen when you scroll. Opening a tab
always starts at the top of the page. Me and Group have a **Jump to** row at the top that stays on screen: use it
instead of scrolling. Evidence is for
Q&A.

Rule for the clicks: leaving Me and coming back resets Jordan's picks. Go Pitch, then Me, then Group, then
Operator, and do not go back to Me.

## Timeline

| Time | Step | Speaker | Words |
|---|---|---|---|
| 0:00 to 0:25 | 1. The problem, Pitch slide 1 | Zeren | 49 |
| 0:25 to 0:55 | 2. "10 minutes from what?" on Me | Zeren | 59 |
| 0:55 to 1:45 | 3. Picks, ranking, the filter baseline | Zeren, one line by Ruibin | 104 |
| 1:45 to 2:10 | 4. One sensitivity move | Zeren | 51 |
| 2:10 to 2:50 | 5. Group: split, certificate, Priya's cap | Ruibin | 82 |
| 2:50 to 3:25 | 6. Operator: asking vs fair, the half bath | Ruibin | 66 |
| 3:25 to 4:15 | 7. Close: what we built, limits, pilot ask | Ruibin | 106 |
| 4:15 to 4:45 | buffer | | |

If step 5 has not started by 2:20, skip the step 4 last sentence and the step 6 half bath sentences. Never cut step 7.

## 1. The problem (0:00 to 0:25), Zeren

Screen: **Pitch**, slide 1. The table shows one SYNTHETIC listing, Plymouth Rd apartment, 2 bed, on North
Campus, with minutes home from three campus buildings on Tue Dec 1 2026. No clicks.

Say (Zeren):
> Listings say ten minutes from campus. Which campus, at what hour? Computed live for one synthetic North
> Campus listing on real bus timetables. From North Campus: 11 minutes at 2 PM, 24 at
> 11:30 PM. From Central: 31 to 39. And leases are signed before fall schedules are final.

Numbers (section 0): North Campus (Beyster) walk 15, bus 11 at 2:00 PM, 24 at 11:30 PM. Central Campus (UgLi)
walk 53, bus 31 and 39. Medical Campus walk 39, bus 23 and 39. Dusk that day 5:35 PM. The slide also shows the
ORD-24-03 line (sign next year's tenant 210 days into the lease); let it sit on screen, do not read it.

Fallback if the slide says "The router did not return a result": go to Me and say the same lines without the
numbers.

## 2. "10 minutes from what?" (0:25 to 0:55), Zeren

Jordan is a fictional North Campus engineer with a late lab at the Duderstadt Center, Tue and Thu until 11:30 PM.
Jordan does not bike and walks at most 10 minutes alone after 10 PM.

Clicks:
1. Silent, 2 s: click **Me** in the left rail. Jordan is selected.
2. Silent, 2 s: in the **Jump to** row click **Homes**, then next to "Sort by" click **Rent**. Row 1 is **Georgetown Blvd house, 5 bed**
   ($821 from), row 2 is **Broadway St house, 5 bed** ($853 from). No scrolling inside the table.
3. On "The two cheapest homes", click the Georgetown row. The trip panel shows "Tue leave at 23:30: Duderstadt Center to Georgetown Blvd
   house, 5 bed" with a red **OVER THE WALKING LIMIT** tag. Scroll the page a little so the walk legs show.
4. On "Broadway", click the Broadway row.

Say (Zeren):
> Jordan, a fictional North Campus engineer, has a lab until 11:30 PM twice a week, and walks at most 10
> minutes alone at night. The two cheapest homes. Georgetown: one bus, then an 11 minute walk in the dark. Over
> Jordan's limit, so it counts as no ride. Broadway: 18 minutes, two buses, 3 minutes on foot each end.

Numbers (section 1): Georgetown 19 min door to door, route 22 then an 11 min walk (longest stretch 10.8 min),
2 trips a week with no allowed ride. Broadway 18 min, routes 22 and 23, 3 min walks at each end, 0 trips with
no ride.

Fallback if the trip panel does not change: click the hatched red bar on the Tue row of the week strip. If
nothing responds, say the numbers above and move on.

## 3. Picks, ranking and the filter baseline (0:55 to 1:45), Zeren and Ruibin

Clicks:
1. In the **Jump to** row click **Picks** (**Which week would you rather live?**). Pick 1 shows Week A, **Third St house, 4 bed**, Front room,
   $925/mo, and Week B, **Washtenaw Ct apartment, 2 bed**, Bedroom 1, $1,415/mo.
2. While Ruibin says the line, click **Week B**.
3. Silent, 2 s: click **Auto-answer until done**. The pill reads **3 picks** and the line says "Broadway St house, 5 bed is
   best on your most likely week (1.00). Across all 24 possible weeks: 74%." The next question folds behind
   **Ask another question (optional)**. Do not click it.
4. Point at **What the picks say**: value of travel time about $15 an hour.
5. While Zeren talks, click **Ranking** in the **Jump to** row. Point at row 1, Broadway. On "A plain filter", point at row 8,
   Georgetown.
6. Scroll a little to **Value of knowing your schedule**: $31/mo.

Say (Zeren):
> Next, Quorum learns what Jordan values.

Say (Ruibin, while clicking Week B):
> I'll answer the first as Jordan. Week B costs $490 more, but saves almost four hours a week and both nights
> with no ride. Jordan picks B.

Say (Zeren, after Auto-answer until done):
> Jordan's fictional values answer the rest. On Jordan's most likely week Broadway is settled, so it stops
> asking. Across all 24 possible weeks, Broadway is best 74 percent of the time. Jordan's time comes out at
> about $15 an hour. Knowing the schedule before signing is worth $31 a month. A plain filter, cheapest
> on North Campus, picks Georgetown. Quorum ranks it 8th for Jordan, on average $233 a month worse.

Numbers (section 2b): pick 1, Week A Third St $925/mo, 466 min/wk door to door, 2 no-ride trips; Week B
Washtenaw Ct $1,415/mo, 241 min/wk, 0 no-ride trips. The auto answer is also B (demo values give A a 0% chance),
so every number after it is the same as a full auto run. After 3 picks: value of travel time median $15.2 (80%
range $6.9 to $25.3); #1 Broadway St house, Attic room $903/mo, expected regret $36/mo, best in 74%; #2 Catherine
St $106; #3 Lawrence St $147. Value of knowing the schedule $31/mo. Break-even: Catherine St wins only above
$75 an hour, current estimate $15.2.
Numbers (section 2c): the filter picks Georgetown Blvd ($821 from); Quorum ranks it #8 of 30, expected regret
$269/mo against $36, so $233/mo worse; it is still best in 9.4% of draws.

Fallback if **Auto-answer until done** is grayed out or does nothing: skip the picks. The ranking shows the
before-picks numbers: Broadway first, $38 regret, best in 71%, $18 a month value of knowing; Georgetown #7, $187
a month worse. Say those. If the ranking says "Computing the ranking" for more than 5 seconds, read the numbers
from this page.

## 4. One sensitivity move (1:45 to 2:10), Zeren

Clicks:
1. Silent, 3 s: click **Ranking** in the **Jump to** row, then in its **What if** row click **Move late lab to Central**. The button now reads
   "Late lab moved to Central" and a **Before** column appears. Broadway shows a red "down from 1" tag.
2. Optional, no words: point at the late lab row in **Your week**. The button only changes that row's place,
   which a student can edit by hand. Do not edit it live.

Say (Zeren):
> One change: the lab moves to Central Campus. Broadway falls from first to ninth. The top three are within $6
> a month, and the leader wins only 28 percent of the time. For Jordan, the lab location now
> matters more than the house. Knowing the schedule is worth $34 a month.

Numbers (section 3a): #1 Lawrence St house "up from 3", $52, best in 28%; #2 Church St "up from 5", $54; #3
Lincoln Ave "up from 15", $58. Spread $6/mo. Broadway #9, $186. Value of knowing $34/mo.

If a judge asks about the month toggle (do not demo it unless asked): under **Daylight**, **December** keeps
Broadway first. Dusk is 5:35 PM on Dec 1 against 8:13 PM on Sep 15, so dark walking grows, but Broadway has the
least dark walking of the top two in every month (section 3b).

Fallback if the button does nothing: say "if the lab moves to Central, Broadway falls to ninth and the top three
are within $6" and move on.

## 5. Group (2:10 to 2:50), Ruibin

Clicks:
1. Silent, 3 s: click **Group** in the left rail. It opens at the top. Click **House ranking** in the **Jump to** row
   and wait for the table (under a second).
2. Point at **The split**: Broadway St house, 5 bed, tag "fits every cap".
3. Point at the **Envy matrix**, tag "checker passed", and the zero cells.
4. On "Priya lowers her cap", click **Two moves** in the **Jump to** row, then click **Lower the cap** once. Only once.
   The **Add the shift** button below it is a quiet underlined button now; do not click it.
5. The split panel switches by itself to **Georgetown Blvd house, 5 bed**, "fits every cap", and a line says the
   group moves to Georgetown. Priya's card opens "Priya's private view. Only Priya sees this." Point at her gap.

Say (Ruibin):
> Five fictional friends rent one house. Each sets a private rent cap. Quorum picks the house, assigns rooms, and
> splits the rent so nobody would rather swap. Broadway: shares from $773 to $883, and it adds up to the rent
> exactly. A separate checker confirms nobody envies anyone. Some margins are exactly zero, so small value errors
> can tip them. Priya lowers her cap. Broadway no longer fits, and the group moves to Georgetown. Only
> Priya sees why: she is $25 short.

Numbers (section 4): Broadway $4,150, split $773.44 / $883.44 / $859.24 / $779.44 / $854.44, sum $4,150.00. 4 of
20 envy margins are exactly $0; envy-free in 2.0% of value draws. Section 4b: Priya's cap $875 to $830; Broadway
has no split under every cap; Georgetown Blvd ($3,950) fits, checker passed; Priya's gap $25. Any cut of $25 or
more does the same.

Fallback if the Group view shows "Waiting for week results": wait 3 seconds. If the split never appears, say the
numbers above. If the split panel stays on Broadway after the click, click the Georgetown row in **House
ranking**. If you clicked **Lower the cap** twice, click **Reset to the original group** and click it once.

## 6. Operator (2:50 to 3:25), Ruibin

Clicks:
1. Silent, 2 s: click **Operator** in the left rail. The house is **South Forest Ave house, 6 bed**, $6,100.
2. Point at the callout **Asking rent against typical fair rent**: primary room priced too low, basement too
   high.
3. Point at the half bath lever, room **Basement room**: **+$30** and **+$32**. Then point at the slider
   **Private bathroom, typical value**, $60. Do not drag it unless a judge asks.

Say (Ruibin):
> This view is for owners who buy and upgrade irregular houses. Here the primary room asks $61 under its
> fair share, and the basement $37 over. A half bath in the basement moves $30 a month to it from the other
> rooms, and groups value the house $32 more. That follows our assumed bath value on this slider. With no build
> cost, we claim no payback.

Numbers (section 5): typical fair rent Primary with bath $1,161 (asking $1,100), Basement $928 (asking $965),
Attic $1,087 (asking $1,045, $42 low), Small $927 (asking $960, $33 high). Half bath: +$30/mo room share at the
same house rent, +$32/mo group value. Slider at $30: +$15 and +$19. Slider at $120: +$57 and +$69.

Fallback if it says "Solving 200 groups..." for more than 3 seconds: say the numbers above.

## 7. Close (3:25 to 4:15), Ruibin

Screen: stay on Operator, or point at the **SAMPLE DATA** tag in the top bar.

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
| A view says "Not built yet" | Skip that step and say its numbers from this page |
| The app is fine but slow | Keep talking; every compute is under 0.2 s once loaded |
| Nothing works | Present from this page and the script printout. Say plainly that the live app failed. |
