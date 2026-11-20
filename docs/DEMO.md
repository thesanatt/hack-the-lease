# Quorum demo script, new student flow (about 4:40, then a 20 s buffer)

The app opens on **Home** (`#home`), a one-page pitch: hero, the problem, three steps, the proof, how we know.
The top bar reads **Home**, **My profile**, **Browse**, **Saved**, **Roommates**, then **Sample data** and a
**More** menu: **More > Next semester**, **More > How we know**, **More > Pitch**, **More > Assumptions**. The fair
rent split (`#group`) opens from Roommates ("Split the rent fairly"). The old You tab, the post paster and Owners
are off the bar but still open by link for Q&A: `#me`, `#listings`, `#operator`. The previous script is
`docs/DEMO_PREVIOUS.md`.

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
4. Warm up Next semester: **More > Next semester**, wait for **$31 a month**.
5. Only for the Send line in the tour step (needs the keys in the repo-root `.env`; without them there is no To
   field and no Send, and the panel works as before): on any Saved card click **Contact landlord**, type your
   own email in **To**, click **Close**. The tab keeps it, so To is filled on stage. Share the browser window
   only; To shows the address.
6. Click **Home** (or the Quorum wordmark) and scroll to the top. Zoom 80% (Ctrl and minus), F11 for full
   screen. Wait until Home's proof section shows **57% -> 82%** (it computes in a second or two).

Order of clicks: Home (scroll), Find my home, My profile, Browse, Saved, My profile, Saved, Roommates, More > Next
semester, More > Pitch.

## Timeline

| Time | Step | Screen |
|---|---|---|
| 0:00 to 0:30 | 1. The problem | Home: hero, then scroll to the problem |
| 0:30 to 1:15 | 2. Drop a resume | My profile |
| 1:15 to 1:25 | 3. Fit labels on every home | Browse |
| 1:25 to 2:15 | 4. Your best saved home, and why | Saved |
| 2:15 to 2:50 | 5. Change one thing, the ranking moves | My profile, then Saved |
| 2:50 to 3:10 | 5b. Who to live with | Roommates |
| 3:10 to 3:50 | 6. The price of not knowing next semester (cut first if long) | More > Next semester |
| 3:50 to 4:40 | 7. How we know, close | More > Pitch, Evidence slide |

## 1. The problem (Home, 0:00 to 0:30)

Screen: the hero, "BUILT FOR U-M STUDENTS", *Finding an apartment* **should be effortless**, yellow **Find my home
->**. Scroll once: "10 minutes from campus." Which campus? At 11 PM? **11 min** North at 2 PM vs **39 min**
Central at 11:30 PM (computed live, same as Pitch slide 1).

> Listings say ten minutes from campus. Which campus, at what hour? On the real bus timetables this North
> Campus listing is 11 minutes from North at 2 PM and 39 from Central at 11:30 at night.

Scroll back up (Home key) and click **Find my home ->**. If short on time, skip the rest of Home: its steps,
**57% -> 82%** and How we know repeat what the flow shows.

## 2. My profile: drop a resume (0:30 to 1:15)

Clicks: **Find my home** opens **My profile** (blank: "Add a file" and "Or write anything"). Click **Try a sample
student**. A strip at the top reads Add your week, See your fit, Book a tour.

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

## 3. Browse (1:15 to 1:25, a glance)

Clicks: **Browse**. Three cards across, nine a page, sorted **Best fit**. Broadway: **Great fit**, Includes "18
min to Beyster Building by bus", "A ride home for every late trip", "Less travel than most homes (9 h 2 min a
week)". The five saved homes show filled hearts.

> Every home is checked against her week: how long to class on the real buses, whether every late night has a
> ride home. Tap a heart to save. We saved five.

## 4. Saved (1:25 to 2:15)

Clicks: **Saved**. Headline: "For your week, **Broadway St house** is the best of your 5." Order: Broadway,
Catherine St, Georgetown Blvd, East Ann St, Church St. Card 1: yellow **Best for your week** badge, **Great fit**,
"Lower rent and quick trips. Watch out for walks home in the dark." Big **$923** a month, **9 h 2 min** a week
(clock icon), and a ring **57%** "best weeks" (card 1 only; the others show rank and fit label). The listing text is folded under **Details**. Click **Why this
rank?** on card 1: "Best of all 30 homes in **57%** of the 24 weeks your schedule could turn out to be."

> One sentence, two numbers per home. Why this rank opens the engine: Broadway wins in 57 percent of the 24
> weeks this schedule could turn out to be, routed door to door on the real TheRide and U-M timetables, about
> 18,700 trips in a fraction of a second.

(Say the trip count and time the gray line under the cards shows.)

## 5. Change one thing (2:15 to 2:50)

Clicks: **My profile**. In **Tell Quorum** type: `Budget $950 a month. I don't like walking home alone at night.`
Click **Add** (**Do it** when the local AI is on; then check the list of changes it shows: a budget and a short
late walk). A pop-up asks "You're sharing this with Quorum": click **Yes, this time** and say "it asks before it reads
anything, and nothing is uploaded". The summary now ends "Budget $950 a month." and **Walking home late** switches to **Short**.
Click **Saved**.

Screen: Broadway still 1st, now "A ride for every trip and lower rent." **Georgetown Blvd** moves to 2nd.
Catherine St (**$33 over budget**), East Ann St (**$165 over budget**) and Church St (**$75 over budget**) drop
below it. Broadway's ring and **Why this rank?** now read **82%** and "No trip in your week breaks your walking limits.
The middle home has 4 trips like that." Each of the other four saved homes has 4 such trips.

> Now she adds two sentences: a budget, and she does not like walking home alone at night. Three homes go over
> budget and drop. Broadway goes from 57 to 82 percent: with the shorter walking limit, it is the only saved
> home where no late night leaves her without a ride.

Optional, if time allows (adds about 20 s): in **Tell Quorum** also type `I want to live close to downtown, in a
room over 150 square feet.` and open **Browse**. It sorts by **Most matches**, and each card says "Has N of M
things you asked for" with **Includes** and **Does not include**. The Saved ranking does not change: location
and room size are checked on the cards, not priced.

Optional (about 25 s): on Saved card 1 click **Schedule a tour**. My profile opens with **Tour Broadway St
house**: best times Monday Nov 23, Wednesday Dec 2 and Friday Dec 4, all 2:00 PM (no tours over U-M Thanksgiving
break, Wed Nov 25 to Sun Nov 29; those days roll to the next week), and every open half hour in blue on **My
calendar**. Click **1**: "Leave EECS Building at 1:37 PM, bus CS then WS, there at 1:56 PM. Then bus 65 to Beyster
Building, there at 2:59 PM." Click **Book this time**. Click **Back to Saved**: card 1 shows **Tour Monday, Nov 23,
2:00 PM**. Click **Contact landlord**: **To** (filled before you went on), **Subject** "Your listing: Broadway St
house", and the drafted message ending "Could I tour it on Monday, Nov 23 at 2:00 PM? Another time works too."
Click **Send**: the button reads **Sent** with a check mark. If it shows an error instead, click **Open in my mail app**.

> She can tour it Monday at 2, between classes: the planner checked the buses there and back to her 3 PM
> lecture. One click books it and drafts the message to the landlord. Nothing is sent until she presses Send.

Optional (about 25 s): **Roommate profile**, type `make my calendar public to other users` and **Do it** (or tick
the switches). Back on **Saved**, card 1, **Others interested**: fictional sample students who like Broadway, ranked by
a match score (budget, night owl or early bird, campus, homes in common), each opening to their roommate profile.
**Rank with local AI** has the model re-order them with a reason each.

## 5b. Roommates (2:50 to 3:10)

Clicks: **Roommates**. **Your matches**, chip **Broadway St house** (gold): "5 other students like this home",
ranked by compatibility. **1 Clara**, **100% match** ("Similar budgets ($950)"), then Leo 78%, Maya 58%, Mateo 57%,
Noor 30%. All are FICTIONAL sample students (labeled on screen). Optional: **View profile** on Clara shows the
score parts (30/30 budgets, 30/30 night owls, 20/20 North Campus, 20/20 4 saved homes in common).

> Who else wants this house, and who would she get along with. Same budget, same hours. Nothing is shared
> until she switches it on. Found your people? One click to split the rent fairly.

Do not click **Split the rent fairly ->** on stage (it opens Your group); go on to step 6.

## 6. Next semester (3:10 to 3:50), cut first if long

Clicks: **More > Next semester**.

As in `docs/DEMO_PREVIOUS.md` step 2, short version: **$31 a month** for the sample nursing junior, the clinical
section is worth **$23 a month** to find out first; CS junior **under $1**: sign now.

## 7. Close (3:50 to 4:40)

**More > Pitch**, **End**, Left arrow twice (Evidence slide). Same words as `docs/DEMO_PREVIOUS.md` step 7.

## If something breaks

| Problem | Do this |
|---|---|
| Try a sample student does nothing for 3 s | Paste into **Or write anything**: `I study Computer Science. Research assistant at the Ford Robotics Building Tue and Thu 1pm to 5pm, $18/hr. Barista in Kerrytown Saturdays 9am-2pm. Study late at the Duderstadt Center most nights 8pm to 11:30pm.` then **Add to my profile** (no classes, so the numbers differ from this page) |
| Saved shows "Ranking them for your week..." for over 5 s | Keep talking; read step 4 numbers from this page |
| Map is blank or says it needs WebGL | Go on; every number is in the cards |
| Send shows an error | Click **Open in my mail app**: the same message opens in the mail app, then go on |
| Wrong homes saved | Bottom of Saved: **Clear saved homes**, then heart the five in Browse |
