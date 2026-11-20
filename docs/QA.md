# Quorum Q&A cheat sheet

For the 5 minutes of judge questions. Short answers first. If you do not know, say so and say what the app
does show. Re-check any number with `node scripts/demo_numbers.mjs` (section numbers below refer to its output).

Homes, rooms and rents are SYNTHETIC. People are FICTIONAL. Timetables, streets and places are real.

## The methods in one breath each

**Connection Scan routing.** Every bus departure of the day is one row in a list sorted by time. We read the
list once, top to bottom, and keep the earliest time we can be at each stop. Arrive-by trips read it backward.
One pass prices a trip to every home at once, which is why 30 homes cost the same as one. Each stop keeps two
times, "got off a bus here" and "walked here", so the 60-second change time between buses is applied correctly.
Source: Dibbelt et al. 2017. Code: `engine/transit.js`.

**Generalized time.** A minute walking counts as 1.45 minutes and a minute waiting as 1.50, against 1.00 riding.
People dislike walking and waiting more than sitting on a bus: they are exposed to weather and to not knowing
when the bus comes. The two numbers come from one meta-analysis of European values of time (Wardman,
Chintakayala and de Jong 2016). They are the only multipliers we cite, and the Assumptions drawer can change
them live.

**Civil twilight darkness.** "Dark" means the sun is more than 6 degrees below the horizon, computed for Ann
Arbor with the NOAA solar equations. Dark minutes are walking or biking minutes outside daylight, plus waits over
10 minutes after dark. A lease runs fall and winter, so darkness is averaged over six dates, Sep 15 to Feb 15.
Dusk is 8:13 PM on Sep 15 and 5:35 PM on Dec 1. Research fixes the sign (people walk less after dark, Uttley and
Fotios 2017); the dollar size comes from the student's own picks.

**The particle posterior, and why each question teaches the most.** We hold 4,000 guesses of what the student
values: an hour of time, an hour walking in the dark, a stranded trip, a private bath, room size, daylight. Each
answer reweights the guesses by how well they predicted it. The next question is the pair of weeks where the
guesses disagree most about the answer while each guess is fairly sure of its own answer. That pair carries the
most information (BALD, Houlsby et al. 2011). We stop when a question would teach under 0.05 nats, when one home
is best with probability 0.8 on the most likely week, or at 6 picks.

**Expected regret vs probability of best.** For each draw of the student's values and each possible fall week,
regret is how many dollars a month a home is worse than the best home in that draw. Expected regret is the
average. P(best) only counts wins and ignores how badly a home loses the rest of the time, so a risky home can
look good on it. We sort by expected regret and show P(best) beside it (Rucker and Schwarzer 2015).

**Value of knowing the schedule.** How much better the choice would be, on average, if the student knew the
fall week before signing (expected value of perfect information), in dollars a month.

**Break-even.** Keep every other weight at its median and slide one, value of time, until the top two homes tie.
The app uses the posterior median as its one point estimate everywhere, the same number "What the picks say"
shows.

**Maximin envy-free split and the swap check.** First give rooms to people so the group's total value is as high
as possible. Then set rents so they add up to the house rent exactly, nobody would rather have someone else's
room at that room's rent, and the worst-off person is as well off as possible. That is one linear program,
solved by our own simplex code (Gal, Mash, Procaccia and Zick 2017, the method behind Spliddit). Each cell of the
**Swap check** grid (Your group, Details) is how many dollars a month the row person would lose by swapping into the column person's room. All cells
at zero or above means envy-free. A separate checker recomputes every cell before the "Nobody would swap" check shows.

**Private caps.** Each member types a cap only the solver sees. Caps are extra limits in the same LP (Procaccia,
Velez and Yu 2018). If no envy-free split fits every cap, Quorum finds the split with the smallest worst overrun,
and each member sees only their own gap: how much their cap would have to rise.

**Operator pricing.** 2,000 synthetic students, 200 groups per house, one envy-free split per group. Each room's
p10, p50 and p90 across those groups is its fair share. A renovation re-solves the same groups.

## Numbers and where they come from

| Number | Value | Source |
|---|---|---|
| Router vs independent Python reference | 3,000 of 3,000 trips equal; 3,549,000 of 3,549,000 stop arrivals equal; Tue Dec 1 2026 | `web/public/data/evidence/router.json`, `pipeline/validate_router.py` |
| Router vs r5py (Conveyal R5) | 720 place-to-home trips; median difference 1.0 min; 87.5% within 2 min (604 of the 690 trips both reach) | `evidence/r5.json`, `docs/VALIDATION.md` |
| Fair-division LP | 2,000 of 2,000 random instances envy-free and checker-ok; published counterexamples F4 to F6 pass | `evidence/lp.json`, `scripts/lp_props.mjs` |
| Preference learning | 300 synthetic trials: smart questions beat random questions on regret in all 6 settings tested (latest run: $19.4 a month lower on the off-prior set) | `evidence/recovery.json`, `scripts/recovery.mjs` |
| Speed | Jordan's week over 30 homes about 21 to 35 ms; 24 weeks x 30 homes x 200 draws ranked in about 30 to 65 ms; a full recompute stays under 0.2 s | script sections 1 and 2 (the You tab does not show timings) |
| Jordan's late trip | Georgetown Blvd 19 min; its last walk is 10.8 min, over the 10 min cap on a single walk (13.5 min walking in all); Broadway St 18 min with 6.3 min walking | script section 1 |
| Pitch slide 1 | Plymouth Rd apartment (North Campus): from Beyster 11 min at 2 PM, 24 at 11:30 PM; from the UgLi 31 and 39; range 11 to 53 min | script section 0 |
| Jordan before any pick | Broadway St $38 regret, P(best) 71%; value of knowing $18/mo; break-even $75/h vs median $14.9/h | script section 2a |
| Your top 3, before any pick | Broadway St $1,351/mo cost to you, $923 rent, 4.4 h/wk, 2 late nights, "Lower rent: $178/mo better than a typical home"; Catherine St $1,414; East Ann St $1,470 | script section 10 |
| Jordan's ranking after 3 picks | Broadway St $36 regret, P(best) 74%; value of knowing $31/mo; break-even $75/h vs median $15.2/h | script section 2b |
| Filter baseline | Cheapest North Campus home, Georgetown Blvd ($821 from), ranks #8 of 30 for Jordan: $269 regret, $233/mo worse than Broadway; P(best) 9.4% | script section 2c |
| Lab moved to Central | Broadway falls #1 to #9; top three Lawrence St $52, Church St $54, Lincoln Ave $58 (spread $6); leader P(best) 28%; value of knowing $34/mo; top 3 cards $1,411 / $1,414 / $1,418 cost to you | script sections 3a and 10 |
| Group split, Broadway St, $4,150 | $773 / $883 / $859 / $779 / $854; 4 of 20 envy margins exactly $0; envy-free in 2% of value draws | script section 4 |
| Priya's cap move | $875 to $830 makes Broadway infeasible; group moves to Georgetown Blvd ($3,950); her private gap $25 | script section 4b |
| Owners asking vs fair | Church St house ($4,650), the house Owners opens on: 2 of 5 rooms priced off (Back room $12 over, Basement room $5 over); Back room asks $910 against a fair range of $859 to $898, so "$12 over"; 339 of 2,000 sample students pick it first | script section 5 |
| Owners half bath | Basement room +$32/mo typical fair rent at the same house rent (Attic -$6, Front -$6, Back $0, Parlor -$18); +$40/mo group value; slider at $30 gives +$17, at $120 gives +$65 | script section 5 |
| Next semester, Nursing junior (the tab opens here; pitch slide 2 too) | "$31 a month", plus or minus $11 (EVPI $31.19, one standard error $5.62); loses least Catherine St, Parlor room, $1,164 to $1,511/mo, best in 66% of 200 weeks; find out first: PNE 350 clinical section $23/mo, part-time job $22/mo, every other unknown $0 | script section 11a |
| Next semester, Nursing, clinical 104 settled | 45 of 200 weeks; "$23 a month", plus or minus $9; loses least Broadway St, Garden room, $1,184 to $1,624/mo, 62%; the job is now worth $22/mo. Settling 101 gives $2, 102 gives $5, 103 gives $11, with Catherine St first each time | script section 11b |
| Next semester, CS junior | "Under $1 a month" (EVPI $0.45); Catherine St, $1,447 to $1,719/mo, best in 96%; every unknown under $1. Lab job odds at 70%: still under $1 (EVPI $0.49), $1,444 to $1,711/mo, 96% | script sections 11a and 11c |
| Next semester, speed line (measured live; read the screen) | Nursing: 31,710 door-to-door trips (78 distinct weeks of the 200, times 30 homes) in 0.1 to 0.3 s in headless Chrome; CS: 109,080 trips (192 distinct weeks) in 0.3 to 0.4 s. Earlier node figures that count every one of the 200 weeks, repeats included: CS 113,790 trips in 0.99 s, Nursing 81,900 in 0.29 s (docs/LISTINGS.md) | script section 11, "speed line" rows (node timing) |
| Next semester, compute | Ranking and the bars about 0.25 s; settling only filters and re-ranks, under 0.1 s, and routes nothing new | script section 11 |
| Listings, demo posts for Jordan | Sample posts 1 and 2: Hill St near Church St $1,319/mo cost to you (summer only), Catherine St $1,284/mo (winter only, spot guessed along the street); best sample home Broadway St $1,351. Winter 2027: "Catherine St costs you $67 a month less than the best sample home." Fall 2027: "None of your pasted posts covers Fall 2027." | script sections 12 and 12b |
| Listings, parser on the 7 sample posts | Every post parsed (rent, dates, beds, utilities, furnished); 6 cards after the duplicate merges; one post with no street asks for a pin; about 25 ms for the first post (it builds the street index), then under 11 ms each in node | script section 12 |
| Tests | 129 engine tests pass (`node --test "test/*.test.mjs"`, 22 of them for the post reader), 36 view tests pass (`cd web && npm test`) | run Fri Nov 20 |

## Hard questions, short honest answers

**"The homes are fake."** Yes, labeled synthetic on every screen, which the case sheet allows. The timetables,
streets and places are real. The method takes any listing file.

**"Are the rents real?"** No. They were set by hand to look plausible for Ann Arbor. They are not from listings and
not market estimates.

**"Is this just Spliddit?"** The split uses the same published rule, and we say so. Spliddit asks people to type a
dollar value for every room. Quorum adds what Spliddit does not have: it picks the house, it learns values from
picks, it adds each person's real week on real bus timetables, it adds private caps with a private gap, and it
shows a checked certificate.

**"Where is the AI?"** The learning is the adaptive questions plus Bayesian inference over what the student values.
There is no LLM, on purpose: it has to run offline and every output must trace back to a number.

**"Why not an LLM to read my schedule or a listing?"** A pasted post is now read by plain rules
(`engine/listing.js`, see "Listings" below), not a model. A model could fit later as a fallback for posts the
rules miss. It would only fill the same fields, which the student sees and can edit, and it would not produce
any of the numbers.

**"Six clicks cannot learn six weights."** Agreed. It mostly learns the travel weights. The screen shows only the
three values the picks narrowed most, and the gray one is still mostly the starting guess. The recovery test shows
how much it learns.

**"What did the picks change? Broadway was first before them."** The leader stayed, and we say so. The room
changed from the Garden room to the Attic room. The 80% range for Jordan's value of time went from $5.3 to $40.5
an hour down to $6.9 to $25.3. The cost of a trip with no ride went from a median of $14 to $33. Value of
knowing the schedule went from $18 to $31 a month. In the recovery test, these questions give $19.4 a month
lower regret than random questions on the off-prior set.

**"The picks say Enough to rank, but Details says 74%. Which is it?"** Both, on different questions. The stop
rule checks Jordan's single most likely week, where Broadway is best with probability 1.00. Details shows 74%,
across all 24 possible weeks and 200 draws of Jordan's values.

**"Has a real student done the picks? Did you test with users?"** No. There has been no user testing and no
formal interviews. We have not timed a real person on the picks. In the demo, pick 1 is answered by hand and the
rest by Jordan's fictional values. You may speak from your own housing search, if it is true.

**"Your recovery test is circular."** Partly, yes. It simulates answers from the same logit choice model the
posterior assumes, so it checks the inference and the question picker, not real people. Real students are the
next test. It also shows one weak spot: when the true cost of a dark walk sits far above our prior, the 80%
interval covers it only 8 to 9% of the time after 6 picks (81% when truths come from the prior). That is why the
picks section shows at most three learned values, the ones the picks narrowed most, and leaves the rest out.

**"On How we know and slide 5, your line goes up after the first question. Why?"** That chart shows the hardest
setting: students whose values sit far from our starting guess. One answer moves the estimate a long way, and for
these students it can overshoot, so after one question ours loses more than random pairs ($82 vs $62). From the
second question on it is ahead, and after six it loses $20 against $57. With typical students (one click away)
the line falls from the first question. We show the hard case on purpose.

**"How does a student enter their own week?"** In **Your week** on You: click **Edit**, then toggle an entry, change its days, times and
place, or add a job. Or import a calendar file or paste schedule lines (see below). Places are a fixed list of 31
real Ann Arbor places, not a free address box. We have not timed it.

**"Can you load a real listing now?"** Yes, one post at a time: paste it on the **Listings** tab. Quorum reads
it in the browser, maps it and ranks it next to the sample homes. The 30 sample homes themselves are still a
JSON file read when the app is built.

**"Why is the value of time $15.2 in one place and $15.8 in another?"** $15.2 is the median, $15.8 the mean. The
app now uses the median everywhere, so say about $15 an hour.

**"After the lab move, is Lawrence Street really first?"** Not in a way that matters. The top three are within $6
a month in expected regret and $7 in cost to you, and the leader is best in only 28% of draws. The honest reading: for Jordan the lab location now matters
more than which house.

**"Why does value of knowing go up after the picks?"** The picks raised the cost of a trip with no ride from a
median of $14 to $33, and those trips depend on whether the late lab happens. We think that is the main reason.
We have not isolated it.

**"Does this tell students to wait before signing?"** No. The ranking is computed over 24 possible fall weeks so
a student can sign early with a home that holds up across them. The $31 a month is the cost of not knowing, which
is why we rank this way. Details shows it as "$31/mo value of knowing your schedule first". If finding out costs
less than that, find out first: ask the department about the lab time, do not hold off on the lease.

**"How is this better than a rent and distance filter?"** The filter "cheapest home on North Campus" picks
Georgetown Blvd. For Jordan's real week Quorum ranks it 8th, $233 a month worse in expected regret than
Broadway. The 11 minute dark walk home twice a week is on screen. It is still best in 9% of draws, which is why
we sort by regret and not by chance of being best.

**"Which number is the cheapest rent gap, $187 or $233?"** Both are on screen, at different moments. Before
any pick, starting values over 24 possible weeks: Georgetown, rooms from $821, costs Jordan $187 a month more
than Broadway. Pitch slide 2 shows this same computation. After the picks the model knows Jordan's values,
and the gap grows to $233. "Cheapest rent" means the home with the cheapest room. Cost to you uses the room
Quorum picks for you in each home, so the real gap at the $821 room is at least this big.

**"Your rents are higher than the asking rents."** Every rent on the You tab and the slides includes the room's
equal share of utilities, and the cards say "with utilities". The Your group tab shows each person's share of
the house rent from the fair split, which is a different number.

**"Details says Georgetown comes first if its rent drops $X. Why not $233?"** Different questions. The
comes-first line holds the values at their medians on the most likely week. The $233 averages 24 possible weeks
and 200 value draws. Both use the same room for each home as the ranking.

**"Is the router right?"** It matched an independent reference router exactly on 3,000 trips. Against R5 it is
within 1 minute at the median. R5 differs by design: it waits at least 60 s before every boarding and allows
1,000 m transfers; ours allows 500 m.

**"Your Python reference router reads your own stops and footpaths. How independent is it?"** It checks the
search, not the inputs: it shares our preprocessed stops, footpaths and change times by design. The independent
check is r5py. R5 builds its own network from the raw GTFS zips and the OpenStreetMap file. On 720 trips the
median difference is 1.0 minute and 87.5% are within 2 minutes. 30 trips are reachable in Quorum but not in R5.

**"Probability of best is misleading."** Yes, so we sort by expected regret and show P(best) beside it.

**"December timetable, September lease."** The feeds cover the modeled week of Nov 30. We use it as the stand-in
for both terms and say so. Daylight is computed per date.

**"What about the winter term?"** Darkness is averaged over six dates from Sep 15 to Feb 15. Bus service is the
December timetable for both terms. Snow and ice are not modeled.

**"Envy-free by whose values?"** By each member's own values: demo values for the fictional group, learned values
for a real user.

**"Details says 2% stay swap-free. Does the split fail 98% of the time?"** No. The split shown is swap-free for
the values entered. The 2% is a stress test: if everyone's values were about 25% off, 2 of 100 random draws stay
swap-free. In this house two room assignments give the group the
same total value, so some margins must be exactly $0 (4 of 20 here). A small error in anyone's values breaks a
tie by a few dollars. We report it instead of hiding it.

**"Why does the group land on Broadway, then Georgetown?"** The rule makes the worst-off member as well off as
possible among houses with a split under every cap. Broadway's worst-off net cost is $1,871 a month. Church St
($1,726) and Lawrence St ($1,658) are lower, but no split there fits every cap. After Priya's cut, Georgetown is the only house that fits
every cap. Caps are hard limits. Georgetown is worse for Jordan: Jordan's net cost goes from $1,410 to $1,829 a
month.

**"Worst-off $1,871 a month, but rents are about $800?"** It is net cost, not rent: rent share plus utilities plus
commute time in dollars, minus what the room is worth to that person.

**"Priya paid $859, now Broadway shows $855 for her. Why?"** After the cut no envy-free split fits every cap, so
the Broadway split shown is the one with the smallest worst overrun. Priya's share there is $855.40, $25 over her
new cap.

**"Can a roommate game it?"** Every envy-free rule can be gamed by misreporting values (Gal et al. 2017, Procaccia
et al. 2018). We do not claim otherwise. Caps are private, so nobody can tune theirs to someone else's.

**"Why should a housing company pay?"** Hypothesis, not tested: an owner of irregular houses gets groups that
arrive already agreed on rooms and rent, a fair price per room, and the dollar effect of a renovation. We have no
customer interviews and no price.

**"Company or feature? Why wouldn't a listing site or Spliddit add this?"** We have no customer evidence, so we
claim no moat. What we have in hand: the group workflow with private caps, room-level prices for houses whose
rooms differ, and a real transit engine under both.

**"What would a pilot look like? What do you need from us?"** A hypothesis: five irregular houses for one leasing
season. You give the room features (size, bath, floor, light), the asking rents and the house rent, plus a few
picks from current residents. Groups use the Your group tab. Then we compare the fair shares with which rooms sat empty.
Ask them what tool they use today; do not guess.

**"Isn't the half bath number just your $60 bath assumption?"** Yes, today. A half bath counts as half of a
private bath, and the bath value is our assumption, shown on the slider. At $30 the half bath gives +$17, at $120
it gives +$65. With picks from a house's own residents it would be measured instead. What the engine adds is
turning those values into room rents a whole group accepts with nobody envying.

**"Why does Church St count 2 of 5 rooms priced off when the basement is only $5 over?"** Any asking rent outside
the room's fair range counts, so the count matches the chart. The back room is $12 over and the basement $5 over.
At $5 we would call it close, and the chart shows how close.

**"Is +$32 new revenue? What is the payback?"** No new revenue. At the same house rent the basement room's
typical fair rent rises $32 and the other rooms drop $30 in all. Typical (median) shares need not add up to the
rent exactly, which is why the bars net +$2. Groups value the house $40 a month more, about $475 a year. We have
no build cost data, so we make no payback claim.

**"Should this house rent for $4,650 at all?"** The view splits a fixed house rent. It does not set it. The +$40
group value is the only signal about the total.

**"Is the 210 day rule right?"** Ann Arbor ORD-24-03, Sections 8:530 and 8:531, adopted 4 March 2024: no showing
or signing a new tenant until 210 days into the current lease. "About March 30 for a Sept 1 lease" is our
arithmetic. We did not read later amendments, if any. Source: SYSTEM_DESIGN.md, reference AnnArborORD24-03.

**"Students ride free, why count transit?"** We count time, not fares.

**"At night there is FlexRide."** True, it is on demand and not in the timetable feeds. "No ride" counts carry that
caveat.

**"What data do you collect?"** A week, walking limits, an optional wage, a private cap. No demographics, no
location history. Caps never leave the solver.

**"What happens without wifi?"** It works. Everything, data included, is served from the laptop. The app makes no
network calls.

**"Georgetown says $821 in the homes list but $921 in the ranking. Which is it?"** Both. $821 is the cheapest room
in that house ("from"). The ranking prices the room that is best for Jordan, which is the primary room with its own
bath at $921. The ranking always picks each student's best room at its asking rent.

## The new pieces, short answers

**"Where do the pros and cons come from (the one line on each top 3 card, and Why and Watch out in Details)?"** From the same utility the ranking uses
(`engine/explain.js` on top of `engine/model.js`). For each home we take its best room and the student's most
likely week, with every value at the median of what the picks say. That monthly value splits into seven dollar
pieces: rent, travel time, time outside after dark, trips with no way that fits, bathroom, size and daylight. The
pieces add up to the utility exactly; a test checks it for every home and persona. Each piece is compared with
the middle home, the per-piece median over all 30 homes. The biggest gains are "Why it fits", the biggest costs
are "Watch out for". Trip lines name a real trip from the timetable. The runner-up line is exact because utility
is linear in each value. Limit: the card uses one week at median values, while the ranking averages 24 weeks and
200 value draws. When they disagree, Details says so (section 7). Each top 3 card shows one of these pieces, never
the same kind as a card above it (section 10).

**"What does the calendar import read, and where does it go?"** Nothing is read until the student ticks the
consent box. Then it reads an .ics file or pasted lines in this browser, in `engine/ics.js`. It keeps only the
event title, weekday, start and end time, and location. All-day, cancelled and monthly events are skipped with a
reason. Locations are matched to our 31 places by name or common short codes such as BBB or NCRB. A location it
cannot match is flagged and never guessed. The student sees a preview and chooses Replace, Add or Discard. Nothing
is uploaded: the only server is the static file server on the laptop, and the app makes no network calls. The sample file is SYNTHETIC (section 8).

**"Why not take social media or a resume to know the student better?"** The case sheet
says to minimize personal data, use consent-based inputs and avoid demographic inference. A home choice needs the
week and a few trade-offs, not who someone is. So Quorum asks only for the week, walking limits, a private cap
and a few picks. It never asks for age, gender, race, religion or income, and it infers none of them.

**"Why no reviews from past residents?"** We have no lawful source for them in this data, and we will not invent
any. Every home here is SYNTHETIC; made-up reviews next to made-up homes would read as facts. With a landlord or
university partner that holds real, consented reviews, they could sit beside the notes, labeled with their source.

**"How are the tour times found? Does Quorum book or message anyone?"** `engine/tours.js` checks every weekday
half-hour from 9:00 to 19:00. A slot counts only if every member is free, can reach the house from where they just
were by walking, bike (only for those who bike) or the real buses within their walking limits, and can get to
their next entry on time. Slots are scored by group travel minutes plus a penalty for tight connections; different
days come first. For Broadway, 5 of 100 half-hours work, all on Friday (section 9). Quorum drafts a plain note with
the house, the group size and the times, and no names, rents or caps. It never sends anything ("Quorum sends nothing."); the group copies the note
and sends it themselves.

**"Why not just ask a chatbot?"** A chatbot can talk about bus routes, but it does not run the timetable. Quorum
routes every trip in the week, for every home, for each of 24 possible fall weeks, on the real TheRide and U-M
timetables and OpenStreetMap streets. The router matches an independent reference on 3,000 of 3,000 trips and
r5py within a median of 1 minute (section 6). The rent split is a linear program whose result a separate checker
verifies: nobody envies anyone, caps hold, and shares add up to the rent. It runs offline in milliseconds, and the
same inputs always give the same answer.

## Next semester: the price of not knowing

The tab was called "Next year" until Fri Nov 20. The method is the same; only the words changed.

**"Why next semester, not next year?"** The lease runs 12 months, but Ann Arbor's 210 day rule (below) means a
student signs around spring. Our reasoning: by then the coming Fall is close to known, because Fall registration
is close or done. What the student truly does not know is the semester they have not registered for yet,
usually Winter, plus any job. So the tab prices that semester. Dollar figures are per month while that semester
runs. We have not checked U-M's registration calendar against a source, so do not quote a date.

**"Is the speed number real?"** Yes. The gray line under the map is measured live, in the browser on this
laptop, when the weeks are routed. It counts every door-to-door trip of every week it actually routed, for
every home, and the wall time spent. Repeated weeks come from a cache and count as zero, so the Nursing plan
shows 31,710 trips (78 distinct weeks of the 200, times 30 homes), and the time is 0.1 to 0.3 s in headless
Chrome. If every week came from the cache, it shows the run that routed them. The router is Connection Scan on
the real timetables: one scan of the day's departures serves every home at once. Earlier node figures that count
all 200 weeks, repeats included, on the sample plans: 113,790 trips in 0.99 s (CS) and 81,900 in 0.29 s
(Nursing). The time depends on the laptop, so read the screen.

**"Where does the catalog come from? Why a sample?"** The U-M Registrar posts each term's Schedule of Classes as a
CSV (for example FA2026.csv on ro.umich.edu). When we fetched it, the file redirected to the U-M login, so we
could not ship it or pull it live. So the repo ships a SAMPLE catalog in the same column layout: the course
numbers are real, and every section, time and room is made up. The column header is from past years and is not
checked against a current file. A signed-in student downloads the file and clicks **Load my registrar file**. It
is read in the browser and never uploaded.

**"Do past sections predict next semester?"** Not exactly, and we have not measured how well. Sections, times and
rooms change. The assumption is that next semester's mix of sections looks like the latest file. The student loads
the newest file once it posts, and the numbers update.

**"Students choose their sections. Why draw them at random?"** The model draws open sections at random, with
some full as at normal registration (each section full 20% of the time; 5% for Early, 40% for Late). That is a
fair guess for a student who cannot pick yet. A student who will pick sections near home faces a smaller price
than we show. To model that, settle the sections you know you will take: click their chips.

**"How is the price computed, in plain words?"** We draw 200 weeks the student could end up with. Each week is
routed door to door through all 30 homes on the real timetables and priced in dollars a month, as on the You tab:
rent, time, walking in the dark and trips with no ride, at the same starting values as the You tab before any
pick. If you knew your week, you would pick the best home for that week. You do not, so you pick the one that is
best on average: the home that loses least. The price is how much worse that home does, on average, than the best
home for each week. It is the expected value of perfect information, in dollars a month.

**"And 'What to find out first'?"** The same idea for one unknown at a time. Suppose you learned only your
clinical section. For each answer you would pick the best home for the weeks with that section. The bar is how
much that saves on average (expected value of partial perfect information). No bar can be worth more than the
price. A bar at $0 means the answer does not change which home you should sign. Clicking a chip keeps only the
weeks with that answer and runs the ranking again.

**"What are the error bars?"** The plus or minus and the thin line under each bar are about two standard
errors. We resample the 200 weeks 100 times and recompute. They show the noise from drawing 200 weeks, not doubt
about the catalog or the odds. Nursing: $31 plus or minus $11, so the price is clearly above zero, about $20 to
$42. The clinical and the job bars ($23 and $22) overlap, so call them a tie.

**"When do students sign, and when is the schedule known?"** Ann Arbor ORD-24-03 (adopted 4 March 2024) bars
showing or signing a new tenant until 210 days into the current lease. For a Sept 1 lease that is about March 30
(our arithmetic). Student press reports many students sign earlier, through pre-lease deals (Michigan Daily, 2023
and 2024, in our research notes). We have not checked U-M's registration
dates for next fall against a source, so do not quote a date. The point stands either way: the lease covers two
terms, and the second term's schedule comes months after signing.

**"The CS junior shows under $1. Is that a bug?"** No. For that plan one home, Catherine St, is best in 96% of the
possible weeks, so nothing is worth finding out first: sign it. That is a useful answer too. In the Nursing plan the
clinical section and the job change which home is best, so its price is $31.

**"Is the PNE 350 clinical real?"** The course number is. The UMSN 2026-27 undergraduate handbook lists the
Therapeutic Nursing Care II clinical as PNE 350 to 366, 5 credits (docs/DATA.md). The four sample sections,
their times and University Hospital as the place are made up.

## Listings: paste any post

**"Why not scrape Facebook groups?"** Three reasons. Facebook's terms forbid automated collection. Most housing
groups are members only. And the posts carry other students' names and contact details, which we should not
collect. So the student pastes a post they can already see. Quorum reads it in the browser, strips emails, phone
numbers, links and handles before saving it, and nothing leaves the browser. Pasted posts stay in that browser
until **Clear pasted posts**.

**"How good is the parser?"** Good on the 7 sample posts, and not measured on real ones. It is rules, not a
model: rent ("$850/mo", "850 per month", a whole-house total split per person), dates ("May 1 - Aug 15", "Jan to
Apr", "summer"), beds, furnished, utilities, and the street, cross street or campus place. Every field shows as
a chip, marked found or guessed, and the student can edit any of them. Among what our own review found and we
fixed before the demo: the Listings costs did not match the You tab; now both average over the same possible
weeks. "On Packard near Hill" was placed as Hill St, because Packard is not in our streets file; now it keeps
Packard as the street, puts a guessed point on Hill and asks for a pin. The "best of your posts" sentence could
name a post that does not cover the chosen semester; now it cannot. The draft stated guessed dates and a guessed
trip as facts; now it uses dates only when the post gave them, and the trip only for a street corner or a pin.
Known limits: a post with only a street name is placed on that street nearest the student's week (a dashed
chip), and the cost moves with the pin, by $29 a month in one test. Years are assumed to be the next time that
month comes after Nov 20 2026.

**"Why no AI for the draft?"** The draft is a template. It is predictable, works offline and never invents a
fact: it uses only the post's rent, dates and street, the student's first name if typed, and facts Quorum
computed (the trip time from that spot, the first tour slot that fits the week). It stays under 90 words, and
Quorum never sends it; there is a Copy button. A local model could polish the wording later, on the same facts.

**"Is the $67 real?"** It is the same "cost to you" as the You tab, for Jordan's week, on sample post 2 against
the best sample home. The post is made up, and its spot is a guess along Catherine St, so it shows how the
comparison works, not a real price.

## Known limitations

- Walking speed is 1.3 m/s for everyone. No hills, snow or ice.
- Transfers between stops are capped at 500 m walking.
- No real-time delays. Schedules are taken as exact.
- The December timetable stands in for the whole lease.
- Picks from stated choices likely understate the value of time (Small 2012).
- The walk and wait multipliers come from European studies, not US ones.
- No street lighting data. "Dark" is about the sun, not lamps.
- The operator population is drawn independently from stated shares, with no joint survey data.
- No user testing yet. The recovery test uses simulated answers.
- Places come from a fixed list of 31. The sample homes load from a build-time file.
- Pasted posts are read by rules tested on 7 made-up posts and the unit tests, never on real posts. The streets
  file lacks some names (Packard, Oakland, Tappan, Monroe, Benjamin, East University), so those posts need a pin.
- A pasted post is one room with neutral features (120 sq ft, shared bath, average light), and utilities marked
  extra are not added to its rent.
- The calendar import keeps weekly patterns only: it ignores EXDATE and UNTIL, and reads every-other-week as weekly.
- Tour times use each member's most likely week only, and each trip is checked on the December timetable.
- "No pickup" or "no drop-off" flags in the middle of a trip are not modeled. Flags at a trip's first or last
  stop are (the reference check found that case on route 63 and the pipeline now handles it).
