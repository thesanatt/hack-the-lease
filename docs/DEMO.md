# Quorum demo script (4:30, then a 30 s buffer)

For Zeren and Ruibin. One laptop, one browser window on the projector. Ruibin is at the keyboard the whole
time. Zeren speaks steps 1 to 3. Ruibin speaks steps 4 to 7.

Spoken words: 505 in total (only the lines that start with ">" under "Say"; per step 51, 126, 58, 65, 65, 54,
86). Zeren says 235 and Ruibin 270. At about 130 words a minute that is 3 min 53 s of talking. Most clicks
happen while someone talks; the silent clicks (marked "silent") and the scrolls add about 35 s, so the plan is
about 4:30. The buffer runs to 5:00. Rehearse twice with a stopwatch.

**First cut if the rehearsal runs long: step 4 (Listings).** It is optional and saves about 35 s. Skip it by
going from step 3 straight to **You**; nothing later depends on it.

Every number below comes from the engine and was checked in the built app at 1280x720 and 1600x900 (Fri Nov 20
2026). To re-check all of them in one command, from the repo folder:

```
node scripts/demo_numbers.mjs
```

It prints each number with the section it belongs to, in about 5 seconds, with no network. Section numbers in
"Numbers" lines below refer to its output. If a number on screen differs from this page, trust the screen and
say the screen's number. One line is measured live and changes from run to run: the gray speed line on Next
semester (step 2). Always read it off the screen.

What is sample: the class catalog (course numbers are real; sections, times and rooms are made up), the two
plans, all homes, rooms and rents (SYNTHETIC), all people (FICTIONAL) and the seven posts behind **Try a sample
post** (made up; no real listing or person). Bus timetables, streets and places are real. The top bar always
shows the **Sample data** chip, Next semester shows **Sample catalog**, and each sample post card says
**Sample post**.

## Before you go on (5 minutes before the slot)

0. With good Wi-Fi you can skip step 1 and open https://quorum-a2.vercel.app instead (same app, hosted). Keep
   the local run ready as the fallback.
1. Start the app: in a terminal, from the repo folder (the one that holds `web/` and `engine/`),
   `node web/dist/serve.mjs`. It prints `http://localhost:4173`. No Node? `cd web/dist` then
   `python -m http.server 4173`.
2. Open http://localhost:4173 in Chrome or Edge. Wait until **Your top 3** shows three cards next to the map
   (a few seconds).
3. Warm up the Next semester tab, so it is instant on stage: click **Next semester**, wait for **$31 a month**,
   click **CS junior**, wait for **Under $1 a month**. Touch nothing else there.
4. Clear the Listings tab: click **Listings**. If any numbered post cards show (left over from a rehearsal),
   click **Clear pasted posts**. Wait until **How they compare for your week** lists three sample homes. Leave
   **Whose week** on **Jordan** and **Need it for** on **Fall 2027**.
5. Click **Pitch** in the top bar. Press the **Home** key so slide 1 shows ("10 minutes from campus."). Leave
   the listing menu on the right at **Plymouth Rd apartment, 2 bed**.
6. Set browser zoom to 80% (Ctrl and minus) so more of each page fits. Press F11 for full screen.
7. Close other tabs. Wi-Fi can be off: the app makes no network calls.
8. Keep this page and the printout of `node scripts/demo_numbers.mjs` on a phone or paper.

The top bar reads **You**, **Next semester**, **Listings**, **Your group**, **Owners**, **How we know**,
**Pitch**. Opening a tab always starts it fresh, at the top of the page: Next semester opens on the Nursing
junior with nothing settled, and Listings opens on Jordan and Fall 2027 (pasted posts stay until cleared). Use
the Home and End keys to jump to the top or bottom of a page. Owners and How we know are for Q&A.

Order of the clicks: Pitch, Next semester, Listings, You, Your group, then Pitch again. Do not go back to Next
semester or You: opening a tab again starts it over.

## Timeline

| Time | Step | Speaker | Words |
|---|---|---|---|
| 0:00 to 0:25 | 1. The problem, Pitch slide 1 | Zeren | 51 |
| 0:25 to 1:30 | 2. Next semester: the price, the speed line, what to find out first, settle it | Zeren | 126 |
| 1:30 to 2:00 | 3. Next semester: the CS junior, sign now | Zeren | 58 |
| 2:00 to 2:35 | 4. Listings (optional, cut first): two sample posts, the comparison, the draft | Ruibin | 65 |
| 2:35 to 3:15 | 5. You: Jordan's top 3 and the Georgetown trip | Ruibin | 65 |
| 3:15 to 3:45 | 6. Your group: the split and Lower a cap | Ruibin | 54 |
| 3:45 to 4:30 | 7. Close on the Evidence slide | Ruibin | 86 |
| 4:30 to 5:00 | buffer | | |

On stage: if step 4 has not started by 2:10, skip it and click **You**. If step 5 has not started by 2:50, skip
**Play this trip** and its last sentence (step 5, click 4). Never cut step 7.

## 1. The problem (0:00 to 0:25), Zeren

Screen: **Pitch**, slide 1. One SYNTHETIC listing, Plymouth Rd apartment, 2 bed, on North Campus. Three campus
groups (Central, North, Medical), each with a walk bar and two bus bars (2:00 PM, 11:30 PM) on Tue Dec 1 2026.
The 11:30 PM bars sit on the gray "After dark" band. No clicks.

Say (Zeren):
> Listings say ten minutes from campus. Which campus, at what hour? One sample North Campus listing, on the
> real bus timetables: 11 minutes from North Campus at 2 PM, 24 at 11:30 PM, 31 to 39 from Central. And you
> sign the lease before you know where next semester's classes are.

Numbers (section 0): North Campus (Beyster) walk 15, bus 11 at 2:00 PM, 24 at 11:30 PM. Central Campus (UgLi)
walk 53, bus 31 and 39. Medical Campus walk 39, bus 23 and 39. Dark after 5:35 PM that day.

Fallback if the bars do not draw: say the same lines without the numbers and go on.

## 2. Next semester: the price of not knowing (0:25 to 1:30), Zeren

Why "semester": under Ann Arbor's 210 day rule a student signs around spring, when the coming Fall is close to
known. The unknown is the semester not yet registered for, plus any job. The lease is still 12 months, and the
dollar figures are per month.

The tab opens on the **Nursing junior**, a sample plan: NURS 372 and NURS 373 lectures, a PNE 350 clinical
section, one Central Campus course (PSYCH 111, SOC 100 or STATS 250), and maybe a part-time job downtown on
Monday and Wednesday evenings (50%). It uses Maya's walking limits (Maya is a fictional sample student).

Clicks:
1. Silent, 2 s: click **Next semester** in the top bar. The plan chip **Nursing junior** is dark. Left: **$31 a
   month**, "what not knowing next semester's schedule costs you", "plus or minus $11". Under it **Catherine St
   house, 4 bed**, Parlor room, "Loses least", **$1,164 to $1,511/mo** "across your possible weeks", **66%**
   "of them it is the best". Right: the map, homes shaded by fit, Catherine St numbered 1. Under the map, one
   small gray line, for example "31,710 door-to-door trips routed in 0.1 s, in this browser".
2. On "What should she find out", scroll down to **What to find out first**. Point at the top bar,
   **PNE 350 clinical section $23/mo**, then **Part-time job downtown $22/mo**. The line under the box reads
   "Find out your PNE 350 clinical section before you sign: it is worth $23 a month."
3. On "Say her clinical", click the chip **104, Medical Campus, Tue 2:00 PM** (the last chip under the clinical
   bar). A dark chip appears next to the heading: "PNE 350 clinical section: 104, Medical Campus, Tue 2:00 PM"
   with an x. The line under the box now reads "Find out about the part-time job downtown before you sign: it
   is worth $22 a month."
4. Press **Home**. The left side now reads **$23 a month**, "plus or minus $9", and **Broadway St house, 5
   bed**, Garden room, **$1,184 to $1,624/mo**, **62%**. On the map Broadway is now number 1.

The speed line is measured live in this browser, so its numbers are not fixed. Read the trip count and the
time off the screen, not off this page. With the warm-up above it shows the warm-up run: 31,710 trips for the
Nursing plan (78 distinct weeks of the 200 times 30 homes; repeated weeks count as zero) in 0.1 to 0.3 s. It
does not change when you settle the clinical.

Say (Zeren):
> So we price that. This is a sample nursing junior. Her clinical section, one course and maybe a job are
> still unknown. Quorum reads a class catalog, draws 200 weeks she could end up with, and routes each one
> through all 30 homes on the real buses. That is 31,710 door-to-door trips, routed in 0.1 seconds in this
> browser. Not knowing costs her $31 a month. The home that loses least is Catherine Street, best in 66
> percent of those weeks. What should she find out before signing? Her clinical section: knowing it is worth
> $23 a month. Say her clinical is the late shift, until 10:30 PM. Now the home that loses least is Broadway,
> and the job is the next thing to ask about.

(Say the trip count and the time the gray line shows. "0.1 seconds" above is only an example.)

Numbers (section 11a, Nursing, as the tab opens): EVPI $31.19, one standard error $5.62, so "plus or minus $11";
Catherine St, Parlor room, $1,164 to $1,511 (10th to 90th percentile), best in 65.5% of the 200 weeks. Bars:
clinical $22.51, job $22.47, every other unknown $0. Section 11b, clinical 104 settled (45 of 200 weeks): $23.29,
plus or minus $9; Broadway St, Garden room, $1,184 to $1,624, 62%; job $21.68. Sample section 104 meets Tue and Thu,
2:00 PM to 10:30 PM, at University Hospital. The other clinical chips: 101
gives $2 (72 weeks), 102 gives $5, 103 gives $11, and Catherine St stays first for all three. Speed line: node
prints its own timing on the "speed line" rows; the trip counts (31,710 Nursing, 109,080 CS) match the browser.

Fallback: if the hero stays gray for more than 5 seconds, say the numbers above. If you click the wrong chip,
click the x on the dark chip and click **104** again. If the gray speed line is missing, skip that sentence.

## 3. Next semester: the CS junior (1:30 to 2:00), Zeren

Clicks:
1. Press **Home** if needed, then click the plan chip **CS junior**. Settled chips clear. Left: **Under $1 a
   month**, and **Catherine St house, 4 bed**, Parlor room, **$1,447 to $1,719/mo**, **96%**.

Say (Zeren):
> Now a sample CS junior, with maybe a research lab job on North Campus. Here not knowing costs under a dollar
> a month. Catherine Street is best in 96 percent of the weeks, so the answer flips: sign now, nothing is worth
> finding out first. A student can load their own Registrar file. It never leaves the browser.

Numbers (section 11a, CS): EVPI $0.45; every unknown under $1 ("7 more, each under $1 a month"); the line reads
"Nothing left to find out is worth $1 a month: sign the home that loses least." Section 11c, lab job at 70%:
EVPI $0.49, Catherine St $1,444 to $1,711, best in 96%.

Do not click **Load my registrar file** or move the lab job slider on stage (at 70% it is still under $1).

## 4. Listings: paste a post (2:00 to 2:35), Ruibin. Optional: cut this step first

The tab opens on **Whose week: Jordan** and **Need it for: Fall 2027**, with an empty paste box. The two posts
come from **Try a sample post**: made-up posts in the style students write. Nothing is fetched from any site.

Clicks:
1. Silent, 2 s: click **Listings** in the top bar. The paste box reads "Paste a post from any group or site".
2. On "Jordan, a fictional student, pastes two posts": click **Try a sample post**, then **Add**. Card **1 Hill
   St near Church St** appears with chips **$780/mo**, **May 1 to Aug 15**, **1 of 4 beds**, **Furnished**,
   **Utilities included**, **Hill St at Church St**. Click **Try a sample post** again, then **Add**. Card **2
   Catherine St** appears: **$925/mo**, **Jan 1 to Apr 30**, **1 of 3 beds**, **Unfurnished**, **Plus
   utilities**, and a dashed chip **On Catherine St** (its spot is a guess along the street; "Drop a pin" would
   fix it). The map shows squares **1 Hill St** and **2 Catherine St**.
3. On "It drafts a first message": click **Reach out** on card 2. The draft reads "Hi, I saw your post about
   the room on Catherine Street. Is it still open for Jan 1 to Apr 30 at $925 a month? I am a U-M student.
   Could I see it on Monday at 5:00 PM? Another time works too. Thanks!" Under it: **Copy** and "Quorum sends
   nothing."
4. On "For winter": click **Winter 2027** (top, next to Fall 2027), then press **End**. **How they compare for
   your week** reads "Catherine St costs you $67 a month less than the best sample home." Rows: **2 Catherine
   St $1,284/mo**, **1 Hill St near Church St $1,319/mo** "starts May 1: summer only" (grayed), then the sample
   homes Broadway St $1,351, Catherine St house $1,414, East Ann St $1,470.

Say (Ruibin):
> Sublets get posted in Facebook groups and group chats, and Quorum does not scrape them. Jordan, a fictional
> student, pastes two posts. Quorum reads the rent, dates and street, maps each one and routes Jordan's week
> from there. It drafts a first message to copy. Quorum sends nothing. For winter, the Catherine Street sublet
> costs Jordan $67 a month less than the best sample home.

Numbers (section 12, each sample post parsed; 12b, the two demo posts ranked for Jordan): Fall 2027 reads "None
of your pasted posts covers Fall 2027."; Winter 2027 reads the $67 sentence; the draft is printed in full. The
cost to you is the You tab's number, averaged over the weeks Jordan's schedule could turn out to be.

Fallback: if a card or the table does not show within 3 seconds, skip the rest of this step and click **You**.
If **Try a sample post** fills the box with a different post (it cycles through seven), click it until the box
starts with "Subletting my room on Hill St" (first) or "Winter semester sublet on Catherine St" (second). If a
card says "seen 2 times", you added the same post twice: go on, the numbers above still hold.

## 5. You: Jordan's top 3 and one trip (2:35 to 3:15), Ruibin

Jordan is a fictional North Campus engineer with a late lab at the Duderstadt Center, Tue and Thu until 11:30 PM.
Jordan does not bike and walks at most 10 minutes alone after 10 PM.

Clicks:
1. Silent, 2 s: click **You** in the top bar. **Your top 3** card 1 reads **Broadway St house, 5 bed**,
   "Garden room, $923/mo with utilities": **$1,351/mo** cost to you, **4.4 h/wk** getting around, **2 /wk**
   late nights, and "Lower rent: **$178/mo** better than a typical home".
2. On "the cheapest rent", press **End** once and scroll up a little to **Trade-offs**. Its sentence reads "The
   cheapest rent, rooms from $821, costs you $187 a month more than your top pick, once time and late nights
   count." The key under the chart names "Cheapest rent, from $821, Georgetown Blvd house, 5 bed".
3. Click the dot inside the black square in the chart (Georgetown). Press **Home**. The line just above the map
   key now reads "Georgetown Blvd house, 5 bed: Tue 23:30, bus 22".
4. On "Here is that trip", click **Play this trip** (top left of the map, "11:30 PM to 11:49 PM"). For about 7
   seconds a dot walks to the stop, rides bus 22 along its real route, then walks the dashed street path to
   Georgetown. It ends on "Arrived".

Say (Ruibin):
> Once the week is known, the You tab ranks every home for it. Jordan is a fictional North Campus engineer
> with a lab until 11:30 PM twice a week. Top pick: Broadway, $1,351 a month once time and late nights count.
> The cheapest rent, Georgetown, costs Jordan $187 a month more. Here is that trip: one bus, then an 11 minute
> walk in the dark.

Numbers (section 10, before any pick): Broadway $1,351/mo cost to you, $923/mo with utilities, 4.4 h/wk, 2 late
nights, "Lower rent: $178/mo better". Catherine St #2 $1,414, East Ann St #3 $1,470. Section 1: Georgetown 19 min
door to door, route 22 then an 11 min walk (longest stretch 10.8 min), 2 trips a week with no allowed ride.

Fallback: if the chart click does nothing, click the Georgetown dot on the map itself (top right, north of
Duderstadt). If **Play this trip** does not move (reduced motion is on), it reads **Step through this trip**:
click it, then **Next step** three times.

## 6. Your group (3:15 to 3:45), Ruibin

Clicks:
1. Silent, 3 s: click **Your group** in the top bar. The left panel draws **Broadway St** as a house cut in
   floors, one room per member with their share: Sam $854 (attic), Priya $859 and Jordan $773 (2nd), Maya $883
   (1st), Leo $779 (basement). Top right: **$4,150/month**. Two green checks: **Nobody would swap**, **Under
   every cap**. **Members** on the right says "Caps are private".
2. On "Priya lowers her cap", click **Lower a cap** once. Only once. Do not click **Add a late shift**.
3. The house redraws as **Georgetown Blvd**, $3,950, both checks green, and a line reads "Priya's lower cap
   rules out Broadway St. The group moves to Georgetown Blvd." Priya's row in **Members** opens "Only Priya sees
   this." Point at "Broadway St fits if your cap rises by $25."

Say (Ruibin):
> Five fictional friends rent one house. Each sets a private rent cap. Quorum gives everyone a room and splits
> the $4,150 rent so nobody would rather swap: shares from $773 to $883. Priya lowers her cap. Broadway no
> longer fits, and the group moves to Georgetown. Only Priya sees why: she is $25 short.

Numbers (section 4): Broadway $4,150, split $773.44 / $883.44 / $859.24 / $779.44 / $854.44, sum $4,150.00.
Section 4b: Priya's cap $875 to $830; Broadway has no swap-free split under every cap; Georgetown Blvd ($3,950)
fits, checker passed; Priya's gap $25.

Fallback if the house does not draw within 3 seconds: say the numbers above. If the house stays on Broadway
after the click, click the **Georgetown Blvd** card in **Houses compared**. If you clicked **Lower a cap** twice,
click **Undo** and click it once.

## 7. Close on the Evidence slide (3:45 to 4:30), Ruibin

Clicks:
1. Silent, 3 s: click **Pitch** in the top bar. It opens on slide 1. Press **End**, then the Left arrow twice.
   Slide 6 reads "Each model checked against something independent.": **3,000 of 3,000** trips equal to a
   separate router, **$19 a month** less lost to the wrong home than random questions, **2,000 of 2,000**
   random houses split with nobody wanting to swap.

Say (Ruibin):
> How we know it works. Our own bus router runs on TheRide and U-M timetables and OpenStreetMap. It matches
> a separately written router on 3,000 of 3,000 trips, and r5py within a median of one minute. The rent split
> is our own linear program: 2,000 of 2,000 random houses split with nobody wanting to swap. Limits: the
> catalog, homes and people are samples, and one December timetable stands in for the year. Our ask: one real
> section file, one real house, one leasing season. Thank you.

Numbers (section 6): r5py 1.1.7, 720 trips, 690 reachable in both, median difference 1.0 min, 87.5% within 2
min. Reference router: 3,000 of 3,000 trips equal. LP: 2,000 of 2,000 random instances envy-free. Recovery:
$19.4 a month lower regret than random pairs on the off-prior set.

## If something breaks

| Problem | Do this |
|---|---|
| Page blank or "The data did not load" | Close the tab. Restart `node web/dist/serve.mjs`. Open http://localhost:4173 again. |
| Port 4173 busy | `node web/dist/serve.mjs web/dist 4174`, then open http://localhost:4174 |
| No Node on the laptop | `cd web/dist` then `python -m http.server 4173` |
| A tab says "did not open" or "is not in this build" | Skip that step and say its numbers from this page |
| Next semester shows a gray card with "Routing week ..." | Keep talking; it fills in a second or two. Over 5 seconds: say step 2 from this page |
| Listings shows old post cards on stage | Click **Clear pasted posts**, then do step 4 as written, or skip step 4 |
| Listings says "Loading street names" for more than 3 seconds | Skip step 4 and click **You** |
| **Your top 3** shows empty gray cards for more than 5 seconds | Say step 5 from this page, then go on to **Your group** |
| Nothing works | Present from this page and the script printout. Say plainly that the live app failed. |

The backup video is `docs/backup/quorum_demo_backup.mp4` (1280x720, captions, no sound). It walks the same path,
Listings step included.
