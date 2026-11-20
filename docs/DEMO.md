# Quorum demo script (4 min 15 s, 45 s buffer)

For Zeren and Ruibin. One laptop, one browser window on the projector. Ruibin is at the keyboard the whole
time. Zeren speaks from the start to the Group view. Ruibin speaks from the Group view to the end.

Every number below was produced by the engine and checked in the running app on Fri Nov 20 2026 (Node 22,
build served at http://localhost:4173). To re-check all of them in one command, from the repo folder:

```
node scripts/demo_numbers.mjs
```

It prints each number with the step it belongs to, in about 3 seconds, with no network. If a number on screen
differs from this page, trust the screen and the script, and say the screen's number.

All homes, rooms and rents are SYNTHETIC. All people are FICTIONAL. Bus timetables, streets and places are real.

## Before you go on (5 minutes before the slot)

1. Start the app: in a terminal, from the repo folder (the clone of hack-the-lease, which holds `web/` and `engine/`), `node web/dist/serve.mjs`. It prints
   `http://localhost:4173`. No Node? `cd web/dist` then `python -m http.server 4173`.
2. Open http://localhost:4173 in Chrome or Edge. Wait until the footer says "Loaded in ... ms" (a few seconds).
3. Stay on **Me**. Jordan is selected. Do not click any pick button yet.
4. Set browser zoom to 80% (Ctrl and minus) so tables fit. Press F11 for full screen.
5. Close other tabs. Wi-Fi can be off: the app makes no network calls.
6. Keep this page and the printout of `node scripts/demo_numbers.mjs` on a phone or paper.

The left rail reads Me, Group, Operator, Evidence, Pitch. Pitch holds the slides; this script does not use it.
Evidence is for Q&A.

Rule for the clicks: leaving the Me tab and coming back resets Jordan's picks. Do Me first, then Group, then
Operator, and do not go back.

## Timeline

| Time | Step | Speaker |
|---|---|---|
| 0:00 to 0:25 | 1. The problem | Zeren |
| 0:25 to 1:00 | 2. "10 minutes from what?" | Zeren |
| 1:00 to 1:50 | 3. Me mode: picks, ranking, value of knowing, break-even | Zeren |
| 1:50 to 2:20 | 4. One sensitivity move | Zeren |
| 2:20 to 3:15 | 5. Group: split, envy matrix, Priya's cap | Ruibin |
| 3:15 to 3:45 | 6. Operator: one house, the half bath | Ruibin |
| 3:45 to 4:15 | 7. Close: what is synthetic, the business | Ruibin |
| 4:15 to 5:00 | buffer | |

## 1. The problem (0:00 to 0:25), Zeren

Screen: the Me view, Jordan selected. No clicks.

Say:
"Students sign a lease months before they move in. In Ann Arbor a landlord can show next year's unit after 210 days
of the current lease, so for a September lease that is around March 30. The fall schedule is not final by then.
Listings say 'ten minutes from campus.' We asked: ten minutes from what, at what time, by what mode? Quorum runs
the week you will actually live through every home, on the real TheRide and U-M bus timetables."

Fallback if the app is still loading: say the same lines; the loading screen reads "Reading the timetables".

## 2. "10 minutes from what?" (0:25 to 1:00), Zeren

Jordan is a fictional North Campus engineer with a late lab at the Duderstadt Center, Tue and Thu until 11:30 PM.
Jordan does not bike and will walk at most 10 minutes alone after 10 PM.

Clicks:
1. Scroll to the **Homes** table. Click the row **Georgetown Blvd house, 5 bed** (North Campus).
2. The right panel shows "Tue leave at 23:30: Duderstadt Center to Georgetown Blvd house, 5 bed", with a red
   **OVER THE WALKING LIMIT** tag.
3. Click the row **Broadway St house, 5 bed** (Lower Town).

Say:
"This house is in the North Campus neighborhood. At 11:30 PM the trip home is 19 minutes: a 5-minute ride on
route 22, then an 11-minute walk in the dark. That is over Jordan's 10-minute limit, so Quorum counts it as a
trip with no allowed ride, twice a week. Now Broadway Street, in Lower Town toward downtown. About the same, 18 minutes, but it is two
buses, 22 then 23, and only 3 minutes on foot at each end. Same 'minutes from campus.' Very different night."

Numbers (script section 1): Georgetown 19 min, 13.5 min walking, longest stretch 10.8 min, 2 trips with no ride
per week. Broadway 18 min, 6.3 min walking, 0 trips with no ride.

Fallback if the trip panel does not change: click the hatched red bar on the Tue row of the week strip. If
nothing responds, say the numbers above and move on.

## 3. Me mode (1:00 to 1:50), Zeren

Clicks:
1. Scroll to **Which week would you rather live?** Point at the two weeks, A and B.
2. Click **Auto-answer until done**. The pill changes to **3 PICKS** and says one home is best with
   probability 1.00 on the most likely week.
3. Point at **What the picks say**: value of travel time about $15 an hour (80% range $6.90 to $25), and four
   weights tagged MOSTLY PRIOR.
4. Scroll to **Ranking**.

Say:
"Instead of asking Jordan to rate things one to five, we show two whole weeks with rent and room, and ask which
week Jordan would rather live. Each question is the one whose answer teaches the model the most. For the demo,
Jordan's fictional values answer. Three picks were enough. The model learned what Jordan's time is worth, and it
marks the weights it barely learned as mostly prior, instead of pretending.

The ranking runs 24 possible fall weeks against 200 draws of those values. Broadway Street is first. Expected
regret is $36 a month: on average, how much worse it is than the best home in that draw. It is the best home in
74% of draws.

Below: knowing your fall schedule before you sign is worth about $31 a month to Jordan. And the break-even:
Catherine Street would win only if Jordan's time were worth more than $79 an hour. Jordan's estimate is about
$16."

Numbers (script section 2b): #1 Broadway St house, Attic room $903/mo, expected regret $36, P(best) 74%;
#2 Catherine St house $106; #3 Lawrence St house $147. Value of knowing the schedule $31/mo. Break-even $79/h,
current estimate $15.8/h.

Fallback if **Auto-answer until done** is grayed out or does nothing: skip the picks. The ranking shows the
before-picks numbers: Broadway first, $38 regret, 71% P(best), $18 a month value of knowing, break-even $84 an
hour. Say those. If the ranking says "Computing the ranking" for more than 5 seconds, read the numbers from
this page.

## 4. One sensitivity move (1:50 to 2:20), Zeren

Clicks:
1. In the Ranking panel, after **What if**, click **Move late lab to Central**. The button now reads "Late lab
   moved to Central" and a **Before** column appears.

Say:
"One change. Jordan's lab moves from North Campus to the Shapiro Library on Central. Broadway drops out of the
top. Lawrence Street comes up from third to first, and its regret is $52. The value of knowing the schedule
goes up to $34 a month. The schedule moves the answer, which is why we rank over many possible weeks and not
one."

Numbers (script section 3a): #1 Lawrence St house "UP FROM 3", $52, P(best) 28%; #2 Church St house "UP FROM 5";
#3 Lincoln Ave house "UP FROM 15". Value of knowing $34/mo.

If a judge asks about the month toggle (do not demo it unless asked): under **Daylight**, **December** keeps
Broadway first ("same" in the Before column). Dusk is 5:35 PM on Dec 1 against 8:13 PM on Sep 15, so dark
walking grows, but Broadway has the least dark walking of the top two in every month. The darkness break-even
says Broadway wins at every value, so the order holds.

Fallback if the button does nothing: say "if the lab moves to Central, Lawrence Street goes from third to
first" and move on.

## 5. Group (2:20 to 3:15), Ruibin

Clicks:
1. Click **Group** in the left rail. Wait for the **House ranking** table (under a second).
2. Point at **The split**: Broadway St house, 5 bed, tag "fits every cap".
3. Point at the **Envy matrix**, tag "checker passed".
4. In **Two moves**, the first line reads "Lower [Priya]'s cap until Broadway St house, 5 bed has no split that
   fits every cap". Click **Lower the cap** once. Only once.
5. Priya's card opens "Priya's private view. Only Priya sees this."

Say:
"Now five fictional friends renting one house. Each has a private rent cap that nobody else sees. Quorum picks
the house, gives everyone a room, and splits the rent so nobody would rather swap rooms at those prices, then
makes the worst-off person as well off as possible. Broadway Street, $4,150: Jordan $773, Maya $883, Priya
$859, Leo $779, Sam $854. It adds to the rent exactly.

This matrix is the proof. Each cell is how many dollars a month that person would lose by taking someone else's
room. Every cell is zero or more, so nobody wants to swap. A separate checker recomputes it from scratch.

Now Priya's cap drops from $875 to $830. Broadway no longer has a split that fits every cap, and the group moves
to Georgetown Boulevard. Only Priya sees why: her cap would need to rise by $25. Nobody learns anyone else's
number."

Numbers (script section 4): split $773.44 / $883.44 / $859.24 / $779.44 / $854.44, sum $4,150.00. After the move:
top feasible house Georgetown Blvd house, 5 bed ($3,950); Priya's gap $25. Any cut of $25 or more to Priya's
cap does the same.

Fallback if the Group view shows "Waiting for week results": wait 3 seconds. If the split never appears, say the
split above. If you clicked **Lower the cap** twice, click **Reset to the original group** and click it once.

## 6. Operator (3:15 to 3:45), Ruibin

Clicks:
1. Click **Operator** in the left rail. The house is **South Forest Ave house, 6 bed**, $6,100.
2. Point at the room table (p10, p50, p90 and Asking).
3. Point at **Renovation lever**, "Add a half bath to one room", room **Basement room**: **+$30** and **+$32**.

Say:
"This is the view for a housing company with old, irregular houses: attic rooms, a basement room, one private
bath. We draw 200 groups from a synthetic population of 2,000 students and split the rent envy-free for each.
That gives each room a fair share with a range: the primary room with a private bath is about $1,161, the
basement room about $928. Then a question an owner actually has: add a half bath to the basement room. Its fair
share goes up $30 a month at the same house rent, and groups value the whole house $32 a month more. These are
preference-based rents from synthetic students, not market rents."

Numbers (script section 5): p50 Primary with bath $1,161, Attic $1,087, Front $994, Small $927, Parlor $1,002,
Basement $928. Half bath: +$30 room share, +$32 headroom.

Fallback if it says "Solving 200 groups..." for more than 3 seconds: say the numbers above.

## 7. Close (3:45 to 4:15), Ruibin

Screen: point at the **SAMPLE DATA** tag in the top bar.

Say:
"What is real: the TheRide and U-M timetables, the streets and the places. What is made up, and labeled on every
screen: the homes, the rents, the rooms and the people. The method takes any listing file.

The business, as a hypothesis we have not tested: students and groups use it free. Operators of one-of-a-kind
houses pay, because they get groups that arrive already agreed on rooms and rent, and they see demand room by
room. Everything runs offline in the browser. Thank you."

## If something breaks

| Problem | Do this |
|---|---|
| Page blank or "The data did not load" | Close the tab. Restart `node web/dist/serve.mjs`. Open http://localhost:4173 again. |
| Port 4173 busy | `node web/dist/serve.mjs web/dist 4174`, then open http://localhost:4174 |
| No Node on the laptop | `cd web/dist` then `python -m http.server 4173` |
| A view says "Not built yet" | Skip that step and say its numbers from this page |
| The app is fine but slow | Keep talking; every compute is under 0.2 s once loaded |
| Nothing works | Present from this page and the script printout. Say plainly that the live app failed. |
