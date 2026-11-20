# Quorum: instructions for Claude Code in this repo

Read docs/HANDOFF.md first (what the product is, flagship features, why, open work, permissions), then
docs/DEMO.md and docs/QA.md. The team presents at the Hack the Lease judging, Fri Nov 20 2026 from 5 PM.

## Ground rules
- main is the presentable build. Every push to main redeploys https://quorum-a2.vercel.app (vercel.json serves the
  committed web/dist, so rebuild and commit web/dist with your change). Do all new work on a branch.
  Merge to main only when the checks below pass, and never in the hour before the presentation.
- Checks before any merge: node --test "test/*.test.mjs"; cd web && npm test; cd web && npm run build (web/dist is
  committed and is what gets served); then follow docs/DEMO.md click by click on the built app
  (node web/dist/serve.mjs). node scripts/demo_numbers.mjs prints every number the demo script quotes; if a change
  moves one, update docs/DEMO.md and docs/QA.md in the same commit.
- Facts: never invent numbers or facts. All homes, rents, people, sample posts and the class catalog are sample
  data and must stay labeled as sample. Timetables, streets and campus places are real. Cite sources for any claim.
- Privacy: no scraping (Facebook or other sites), no profiling real people, nothing uploaded. Inputs come from the
  student, read in the browser.
- Writing on screen and in docs: ASCII only, no em or en dashes, plain short sentences, no hype words.
- Design rules: docs/DESIGN_DIRECTION.md (visual first, few numbers, no gradients or AI-looking styles).
- Architecture: engine/ is plain JS (router, week evaluation, preference learning, ranking, fair split, catalog,
  listing parser), loaded in the browser by web/src/engine/index.js; views in web/src/views/. Contracts:
  engine/CONTRACTS.md, docs/SYSTEM_DESIGN.md, docs/NEXT_YEAR.md, docs/LISTINGS.md, docs/ROUND3.md.
