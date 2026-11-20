# Quorum demo script, new student flow (about 4:30, then a 30 s buffer)

The top bar reads **Saved**, **My profile**, **Roommate profile**, **Browse**, **Next semester**, **Your group**.
Off the bar but open by link: the slides at `http://localhost:4173/#pitch`, the evidence page `#evidence`, and for
Q&A the old You tab `#me`, the post paster `#listings` and Owners `#operator`. Open the slides by typing the address. The previous script is `docs/DEMO_PREVIOUS.md`.

What is sample: the resume (a FICTIONAL student, Alex Rivera, labeled on the PDF; its class times are made
up), all homes, rooms and rents (SYNTHETIC). The "typical week" button uses a FICTIONAL sample week, and only
when the student clicks it. Bus timetables, streets and places are real.

Every number below was read off the built app at 1280x720 (Fri Nov 20 2026) with the same seeds the app uses.
The speed line under Saved is measured live; read it off the screen.

## Before you go on (5 minutes before the slot)

1. Start the app: `node web/dist/serve.mjs`, open http://localhost:4173. Wait for the top bar.
2. Reset: click **My profile**. If it is not blank, scroll down and click **Clear my profile** (this also brings back
   the sharing pop-up if someone clicked "don't ask again" in a rehearsal). Click **Saved**;
   if any homes show, click **Clear saved homes** at the bottom.
3. Pre-save the five homes (saves 15 s on stage): click **Browse**, then the heart on **Broadway St house**,
   **Catherine St house**, **East Ann St house**, **Church St house**, **Georgetown Blvd house**. Browse shows nine
   homes a page; East Ann is on page 2 (page tabs at the bottom). The button top right reads **Saved (5)**.
4. Warm up Next semester as in the previous script (click it, wait for **$31 a month**).
5. Go to http://localhost:4173/#pitch (type it; Pitch is off the top bar), press **Home** for slide 1. Zoom 80% (Ctrl and minus), F11 for full screen.

Order of clicks: Pitch, My profile, Browse, Saved, My profile, Saved, Next semester, Your group, Pitch.

## Timeline

| Time | Step | Screen |
|---|---|---|
| 0:00 to 0:25 | 1. The problem | Pitch slide 1 |
| 0:25 to 1:15 | 2. Drop a resume | My profile |
| 1:15 to 1:35 | 3. Fit labels on every home | Browse |
| 1:35 to 2:25 | 4. Your best saved home, and why | Saved |
| 2:25 to 3:00 | 5. Change one thing, the ranking moves | My profile, then Saved |
| 3:00 to 3:40 | 6. The price of not knowing next semester (cut first if long) | Next semester |
| 3:40 to 4:30 | 7. How we know, close | Pitch, Evidence slide |

## 1. The problem (Pitch slide 1)

> Listings say ten minutes from campus. Which campus, at what hour? On the real bus timetables this North
> Campus listing is 11 minutes from North at 2 PM and 39 from Central at 11:30 at night.

## 2. My profile: drop a resume (0:25 to 1:15)

Clicks: **My profile** (blank: "Add a file" and "Or write anything"). Click **Try a sample student**.

Screen: "Engineering or computer science student. Most of your week is on North Campus. You get around by bus
and on foot. No budget set." **Your week**, every row tagged **Yours**: EECS 281 Mon Wed 10:30 to 12 (EECS
Building), EECS 370 Tue Thu 9 to 10:30 and EECS 482 Mon Wed 3 to 4:30 (Beyster), Research Assistant Tue Thu 1 to
5 (Ford Robotics), Barista Sat 9 to 2 (Kerrytown), Late study Mon to Thu 8 to 11:30 PM (Duderstadt Center).
Right: "Dropped 1 email and 1 phone number."

> A student starts with what they already have: a resume, a class schedule, or a few sentences. This is a
> fictional student's resume. Quorum reads it in the browser, no AI and nothing uploaded. It found three
> classes, the research job at the Robotics building, the Saturday shift in Kerrytown and the late nights at
> the Dude, and it threw away the email and phone number. It never guesses: a class without a time waits for
> one instead of being made up.

## 3. Browse (1:15 to 1:35)

Clicks: **Browse**. Three cards across, nine a page, sorted **Best fit**. Broadway: **Great fit**, Includes "18
min to Beyster Building by bus", "A ride home for every late trip", "Less travel than most homes (9 h 2 min a
week)". The five saved homes show filled hearts.

> Every home is checked against her week: how long to class on the real buses, whether every late night has a
> ride home. Tap a heart to save. We saved five.

## 4. Saved (1:35 to 2:25)

Clicks: **Saved**. Headline: "For your week, **Broadway St house** is the best of your 5." Order: Broadway,
Catherine St, Georgetown Blvd, East Ann St, Church St. Card 1: **Great fit**, "Lower rent and quick trips.
Watch out for walks home in the dark." **$923** a month, **9 h 2 min** a week getting around. Click **Why this
rank?** on card 1: "Best of all 30 homes in **57%** of the 24 weeks your schedule could turn out to be."

> One sentence, two numbers per home. Why this rank opens the engine: Broadway wins in 57 percent of the 24
> weeks this schedule could turn out to be, routed door to door on the real TheRide and U-M timetables, about
> 18,700 trips in a fraction of a second.

(Say the trip count and time the gray line under the cards shows.)

## 5. Change one thing (2:25 to 3:00)

Clicks: **My profile**. In **Tell Quorum** type: `Budget $950 a month. I don't like walking home alone at night.`
Click **Add** (**Do it** when the local AI is on; then check the list of changes it shows: a budget and a short
late walk). A pop-up asks "You're sharing this with Quorum": click **Yes, this time** and say "it asks before it reads
anything, and nothing is uploaded". The summary now ends "Budget $950 a month." and **Walking home late** switches to **Short**.
Click **Saved**.

Screen: Broadway still 1st, now "A ride for every trip and lower rent." **Georgetown Blvd** moves to 2nd.
Catherine St (**$33 over budget**), East Ann St (**$165 over budget**) and Church St (**$75 over budget**) drop
below it. Broadway's **Why this rank?** now reads **82%** and "No trip in your week breaks your walking limits.
The middle home has 4 trips like that." Each of the other four saved homes has 4 such trips.

> Now she adds two sentences: a budget, and she does not like walking home alone at night. Three homes go over
> budget and drop. Broadway goes from 57 to 82 percent: with the shorter walking limit, it is the only saved
> home where no late night leaves her without a ride.

Optional, if time allows (adds about 20 s): in **Tell Quorum** also type `I want to live close to downtown, in a
room over 150 square feet.` and open **Browse**. It sorts by **Most matches**, and each card says "Has N of M
things you asked for" with **Includes** and **Does not include**. The Saved ranking does not change: location
and room size are checked on the cards, not priced.

Optional (about 25 s): on Saved card 1 click **Schedule a tour**. My profile opens with **Tour Broadway St
house**: best times Monday Nov 23, Wednesday Nov 25 and Friday Dec 4, all 2:00 PM, and every open half hour in
green on **My calendar**. Click **1**: "Leave EECS Building at 1:37 PM, bus CS then WS, there at 1:56 PM. Then bus
65 to Beyster Building, there at 2:59 PM." Click **Book this time**. Back on Saved, **Contact landlord** shows the
drafted message with the tour time.

> She can tour it Monday at 2, between classes: the planner checked the buses there and back to her 3 PM
> lecture. One click books it and drafts the message to the landlord. Quorum sends nothing.

Optional (about 25 s): **Roommate profile**, type `make my calendar public to other users` and **Do it** (or tick
the switches). Back on **Saved**, card 1, **Others interested**: fictional sample students who like Broadway, ranked by
a match score (budget, night owl or early bird, campus, homes in common), each opening to their roommate profile.
**Rank with local AI** has the model re-order them with a reason each.

## 6. Next semester (3:00 to 3:40), cut first if long

As in `docs/DEMO_PREVIOUS.md` step 2, short version: **$31 a month** for the sample nursing junior, the clinical
section is worth **$23 a month** to find out first; CS junior **under $1**: sign now.

## 7. Close (3:40 to 4:30)

Type `#pitch` at the end of the address, **End**, Left arrow twice (Evidence slide). Same words as `docs/DEMO_PREVIOUS.md` step 7.

## If something breaks

| Problem | Do this |
|---|---|
| Try a sample student does nothing for 3 s | Paste into **Or write anything**: `I study Computer Science. Research assistant at the Ford Robotics Building Tue and Thu 1pm to 5pm, $18/hr. Barista in Kerrytown Saturdays 9am-2pm. Study late at the Duderstadt Center most nights 8pm to 11:30pm.` then **Add to my profile** (no classes, so the numbers differ from this page) |
| Saved shows "Ranking them for your week..." for over 5 s | Keep talking; read step 4 numbers from this page |
| Map is blank or says it needs WebGL | Go on; every number is in the cards |
| Wrong homes saved | Bottom of Saved: **Clear saved homes**, then heart the five in Browse |
