# Student cards

`student_cards.pdf` is the printout for the judges: one card per fictional student (every persona except
Jordan), 4 cards per US Letter page, cut on the dashed lines. Each QR code opens
`https://quorum-a2.vercel.app/#me?who=<id>`, the You tab on that student's week. All students are fictional
and all data is sample data.

Rebuild after personas.json changes:

    cd scripts/record && npm install && npx playwright install chromium
    cd ../cards && npm install && node make_cards.mjs

`node make_cards.mjs --base http://localhost:4173/` makes cards that point at a local build instead.
Print at 100% scale (not "fit to page").
