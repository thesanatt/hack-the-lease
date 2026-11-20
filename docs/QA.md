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

**Break-even.** Keep every other weight at its estimate and slide one, value of time, until the top two homes tie.

**Maximin envy-free split and the envy matrix.** First give rooms to people so the group's total value is as high
as possible. Then set rents so they add up to the house rent exactly, nobody would rather have someone else's
room at that room's rent, and the worst-off person is as well off as possible. That is one linear program,
solved by our own simplex code (Gal, Mash, Procaccia and Zick 2017, the method behind Spliddit). Each envy matrix
cell is how many dollars a month the row person would lose by swapping into the column person's room. All cells
at zero or above means envy-free. A separate checker recomputes every cell before the matrix is shown.

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
| Speed | Jordan's week over 30 homes about 23 to 35 ms; 24 weeks x 30 homes x 200 draws ranked in about 30 to 40 ms | panel headers in the app; script sections 1 and 2 |
| Jordan's late trip | Georgetown Blvd 19 min with 13.5 min walking (over the 10 min cap); Broadway St 18 min with 6.3 min walking | script section 1 |
| Jordan's ranking after 3 picks | Broadway St $36 regret, P(best) 74%; value of knowing $31/mo; break-even $79/h vs estimate $15.8/h | script section 2b |
| Lab moved to Central | Lawrence St goes from 3rd to 1st, $52 regret; value of knowing $34/mo | script section 3a |
| Group split, Broadway St, $4,150 | $773 / $883 / $859 / $779 / $854 | script section 4 |
| Priya's cap move | $875 to $830 makes Broadway infeasible; group moves to Georgetown Blvd; her private gap $25 | script section 4b |
| Operator half bath | Basement room +$30/mo fair share; +$32/mo group headroom | script section 5 |
| Tests | 64 engine tests pass (`npm test`), 15 view tests pass (`cd web && npm test`) | run Fri Nov 20 |

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

**"Six clicks cannot learn six weights."** Agreed. It mostly learns the travel weights. The rest are tagged "mostly
prior" on screen. The recovery test shows how much it learns.

**"Is the router right?"** It matched an independent reference router exactly on 3,000 trips. Against R5 it is
within 1 minute at the median. R5 differs by design: it waits at least 60 s before every boarding and allows
1,000 m transfers; ours allows 500 m.

**"Probability of best is misleading."** Yes, so we sort by expected regret and show P(best) beside it.

**"December timetable, September lease."** The feeds cover the modeled week of Nov 30. We use it as the stand-in
for both terms and say so. Daylight is computed per date.

**"What about the winter term?"** Darkness is averaged over six dates from Sep 15 to Feb 15. Bus service is the
December timetable for both terms. Snow and ice are not modeled.

**"Envy-free by whose values?"** By each member's own values: demo values for the fictional group, learned values
for a real user.

**"The envy-free rate is 2%."** True, and the app shows it. In this house two room assignments give the group the
same total value, so some margins must be exactly $0. A small error in anyone's values breaks a tie by a few
dollars. We report it instead of hiding it.

**"Can a roommate game it?"** Every envy-free rule can be gamed by misreporting values (Gal et al. 2017, Procaccia
et al. 2018). We do not claim otherwise. Caps are private, so nobody can tune theirs to someone else's.

**"Why should a housing company pay?"** Hypothesis, not tested: an owner of irregular houses gets groups that
arrive already agreed on rooms and rent, a fair price per room, and the dollar effect of a renovation. We have no
customer interviews and no price.

**"Students ride free, why count transit?"** We count time, not fares.

**"At night there is FlexRide."** True, it is on demand and not in the timetable feeds. "No ride" counts carry that
caveat.

**"What data do you collect?"** A week, walking limits, an optional wage, a private cap. No demographics, no
location history. Caps never leave the solver.

**"What happens without wifi?"** It works. Everything, data included, is served from the laptop. The app makes no
network calls.

## Known limitations

- Walking speed is 1.3 m/s for everyone. No hills, snow or ice.
- Transfers between stops are capped at 500 m walking.
- No real-time delays. Schedules are taken as exact.
- The December timetable stands in for the whole lease.
- Picks from stated choices likely understate the value of time (Small 2012).
- The walk and wait multipliers come from European studies, not US ones.
- No street lighting data. "Dark" is about the sun, not lamps.
- The operator population is drawn independently from stated shares, with no joint survey data.
- "No pickup" or "no drop-off" flags in the middle of a trip are not modeled. Flags at a trip's first or last
  stop are (the reference check found that case on route 63 and the pipeline now handles it).
