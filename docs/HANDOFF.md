# Handoff: what Quorum is, why it is built this way, and how to keep going

For Zeren, Ruibin, and the Claude Code session either of you runs in this repo. Read this file first, then
docs/DEMO.md (the 5 minute script) and docs/QA.md (judge questions).

## The state at handoff (Fri Nov 20 2026, 4:30 PM)

- The final demo build is the branch `final-pitch` (pull request "Final demo build" into main, not merged).
  main is the earlier build deployed at https://quorum-a2.vercel.app (no sign-in).
- Top bar: Home, My profile, Browse, Saved, Roommates; Next semester, How we know, Pitch and Assumptions are under
  More. Night theme (ink, cream, gold) from web/src/styles/tokens.css.
- 144 engine tests and 53 web tests pass. A scripted run follows docs/DEMO.md click by click and matched every
  quoted number at 1280x720 with 80% zoom.
- Send (tour email through Resend) appears only when RESEND_API_KEY is set in the repo-root .env; otherwise the
  landlord panel is Copy and Open in my email, and nothing is sent. Robin's local assistant (Ollama) is optional.
- The backup video (docs/backup/quorum_demo_backup.mp4, 3:01) shows the 10:50 AM flow. It does not show the Fit
  scores or the newer sample students.
- Printable student cards for the judges: docs/cards/student_cards.pdf (QR codes open the live site as that student).

## The problem we chose

The case sheet asks for a tool that helps a student decide where to live from their own needs. Its author gave the
example "10 minutes from campus": which campus, which way, at what hour? We took that literally. A home is only good
or bad against a specific week: which buildings, at what times, after dark, with what walking limit. And the student
signs months before part of that week is known.

## Flagship features, and why each one

1. Next semester: the price of not knowing (tab "Next semester", pitch slide 2).
   What: reads a class catalog, draws 200 weeks the student could get next semester, routes each through every
   home, and shows what not knowing costs in dollars a month, the home that loses least, and what to find out first.
   Clicking an answer settles that unknown and the numbers move.
   Why: every listing site assumes you know your week. Nobody does at signing. Under Ann Arbor's 210 day rule you
   sign around spring, so the unknown is the semester you have not registered for, plus jobs. This is the one idea
   two independent voting panels in our ideation both ranked first, out of about 195 ideas.
   Special: value of information math (EVPI and EVPPI) from decision analysis, fed by a registrar-shaped catalog and
   a real timetable router. A chatbot has neither the catalog nor the timetables, and cannot route 200 weeks
   through 30 homes. The sample CS plan prices under $1: there the honest answer is "sign now". That contrast is the
   sensitivity demo the rubric asks for.
   Honest limits: the catalog is a sample (real course numbers, made-up sections), because the Registrar's file sits
   behind a U-M login. A student's own file loads in the browser and never leaves it.

2. Our own transit router on the real TheRide and U-M timetables (powers every tab).
   What: Connection Scan Algorithm, door to door, walking and biking on OpenStreetMap streets, darkness by date,
   "no way home" detection under a walking limit.
   Why: most teams will call a maps API, one trip per request. One scan of ours answers every home at once, so we
   can route every trip of 200 possible weeks: about 110,000 door-to-door trips in about a second, offline. The tab
   shows the live count.
   Special: checked against an independent router (3,000 of 3,000 trips equal) and against R5 (88% within 2 min).

3. Cost to you: the cheapest rent is not the cheapest home (tab "You", slide 1).
   What: rent plus what time, dark walks and nights with no ride cost this student, minus what the room is worth.
   Why: rent alone picks Georgetown; for Jordan it costs $187 a month more than Broadway once the week is counted.
   "Play this trip" animates the late trip home on the map.

4. Listings: paste any post (tab "Listings").
   What: paste a sublet post from any group or site; it reads rent, dates, beds, furnished, utilities and the
   street, places it on the map, scores Fit out of 100 (price, getting around, nights, dates), and writes a
   reach-out draft with the student's real trip time. Copy, or Email it (opens the student's own mail app).
   Why: sublets are scattered across Facebook groups and chats. We do not scrape them: Facebook's terms forbid
   automated collection, the groups are members-only, and posts carry other students' personal data. The student
   pastes what they can already see. Nothing is sent unless the student presses Send.

5. Your group: a split nobody would swap (tab "Your group").
   What: one house, one room each, rents set so no one would trade rooms, under each person's private cap.
   "Lower a cap" moves the group to another house without revealing whose cap it was. Tour times finds slots all
   five can make on the real buses.
   Why: the hard part of a group lease is money and honesty. The method is published envy-free rent division.

6. Learned values (inside "You"): "Which week would you rather live?" Each question is the one that teaches the
   model the most (adaptive Bayesian questions), so a few clicks learn what the student's time is worth.

Owners and How we know are for judges' questions: per-room fair rent for owners, and the validation charts.

## How we decided (the thought process)

- Rubric first: technical execution 35, student value 30, decision quality and evidence 20, experience 15. So:
  real data where it exists, our own engines where a chatbot cannot follow, every number traceable, and every
  sample labeled sample.
- Decisions over browsing: every screen ends in "live here" or "find this out first", not a list of listings.
- Honesty as a feature: we show uncertainty (ranges, "under $1", "summer only") instead of hiding it.
- No language model in the ranking or any number: everything is computed and explainable; nothing invents facts.
  The reach-out draft is a template on purpose. The only model is Robin's optional local assistant (Ollama on the
  laptop), which proposes profile edits for the student to accept and can re-order roommate matches.
- Privacy: no scraping, no profiling, nothing uploaded. Calendar files and registrar files are read in the browser.
- We rejected, with reasons: scraping Facebook (terms, privacy), profiling judges from LinkedIn (consent; replaced by
  fictional student cards), auto-sending email (replaced by Email it), fetching listing links (terms, blocked in the
  browser; replaced by paste).

## Open work, in priority order

1. Simple mode (docs/SIMPLE.md): answer first in plain words, at most one number per card, a "Show the numbers"
   switch. The team asked for this; it is specified, not built.
2. Re-record the backup video for the current flow: cd scripts/record && npm install && npx playwright install
   chromium && node record.mjs (needs web/dist built first).
3. Zeren's tour booking agent: done (Book this time -> drafted email -> Send, on final-pitch).

## How to work on it safely

- Run: node web/dist/serve.mjs, then open the address it prints. Dev: cd web && npm install && npm run dev.
- Before any merge to main: node --test "test/*.test.mjs"; cd web && npm test; npm run build; then click through
  docs/DEMO.md on the built app. node scripts/demo_numbers.mjs prints every number the script quotes.
- Never push untested work to main before the presentation. Use a branch.
- Deploy: see "Permissions" below.

## Permissions

- GitHub: both of you are invited to thesanatt/hack-the-lease with write access. Accept the email invite.
- Vercel: quorum-a2.vercel.app is on Sanat's personal (Hobby) Vercel account, which cannot add members. It stays as
  the frozen demo build; the student-card QR codes point to it. If you change the app and want it hosted, deploy
  your own copy from your own free Vercel account: npx vercel login, then from the repo folder
  npx vercel deploy web/dist --prod. That gives you a new URL; the cards keep pointing to the frozen one.
- No API keys, accounts or paid services are needed: the app runs fully offline in the browser.
