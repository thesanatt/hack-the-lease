# Final pass: plain words first (binding contract)

Feedback from the presenters: too many numbers. A nervous first-year must be able to open Quorum, understand the
answer in five seconds, and know what to click next, without reading numbers. Numbers stay one click away for
judges' questions. This is the last pass before the freeze.

## The rule for every tab
1. Answer first, in words. The top of each tab says the answer as one short sentence a student would say to a
   friend, for example: "Live at Broadway St. Your trips are short and you never walk home in the dark."
   "Find out your clinical section before you sign." "Your best find is the Catherine St room, but it ends in
   April." Generated from the same numbers the tab already computes; never invented.
2. At most one number per card on the default screen, the one that decides (for a home: Fit out of 100, or cost
   to you a month where Fit does not exist yet). Everything else (ranges, percentages, plus or minus, hours,
   counts, timings) moves behind a switch.
3. A "Show the numbers" switch in the top bar, off by default, remembered in this browser (localStorage in
   try/catch). Off: the simple view. On: today's full view, unchanged. Implement as a class on the app root
   (`simple`) and mark secondary elements in each view with a shared class (`num-detail`) so they hide in simple
   mode; do not delete or rewrite the detailed view.
4. One obvious next step per tab, as the single primary button or link at the bottom of the answer, for example
   "What if your schedule changes?" (to Next semester), "Found a post? Paste it" (to Listings), "Living with
   friends?" (to Your group). Plain verbs.
5. Words a nervous student understands: "cost to you" stays; "expected regret", "percentile", "EVPI", "standard
   error", "p10" never appear in simple mode. Charts keep their pictures; their axis numbers may stay, their
   captions become plain sentences.

## Per tab (simple mode)
- You: the answer sentence, the map, the top 3 cards (name, room, one number, one plain reason), the trade-off chart's
  one sentence, the picks (two cards with "This one"), the week calendar. Hide the ribbons' small numbers, the
  three-number rows, Details.
- Next semester: the answer sentence ("Not knowing your schedule costs you about $31 a month. Find out your
  clinical section first."), the safe home, the map, and the "What to find out first" bars with their chips. Hide
  plus or minus, ranges, percentages, the speed line, possible-weeks dot strips (show them in numbers mode).
- Listings: the paste box, cards with Fit NN/100 and one plain line, the draft and Email it. The comparison table
  shows place, Fit and the one-line note; other columns in numbers mode.
- Your group: the house drawing with each person's room and rent (rents are the answer here), "Nobody would swap"
  and "Under every cap", the moves, tour times as slots. Hide margins and counts.
- Owners, How we know, Pitch: unchanged (they are for judges).

## Done means
The demo script (docs/DEMO.md) still works click by click in simple mode, which is the default, and its quoted
numbers are only ones still visible in simple mode or it tells the presenter to flip the switch. Every test stays
green; build passes; screenshots at 1280x720 and 390x844 show the simple view is calm and clear.
