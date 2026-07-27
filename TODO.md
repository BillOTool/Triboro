# Triboro — to do

Standing backlog. Lives in the repo so it versions with the project.
Last updated 2026-07-26.

Status: **live** at https://billotool.github.io/Triboro/ — 88 posts, 134
characters, 11 events. Two commits are local and unpushed (`b193151`,
`3e664e5`).

---

## Decide first

- [x] ~~`data/stories/` in a public repo~~ — gitignored 2026-07-26. Source
      prose stays local. Nothing had been committed, so no history to scrub.
      `data/stories.json` (titles/index) is still tracked.
- [ ] **Back up `data/stories/` somewhere.** It's now outside git, so it has no
      version history and dies with the disk. Not iCloud — that corrupted this
      repo once. External disk or a local Time Machine target.
- [ ] Rewrite the flooding headline in your own voice. Currently *"Water
      reaches six floors; Council issues 'Notice of Dampness'"* — my
      placeholder, not yours. It's the top headline on the live site.
- [ ] Three duplicate post pairs on that event (Marla, Sister Maren, Tommy each
      say their beat twice). Cut one of each, or leave them. Unpublish rather
      than delete — reversible.

## Tomorrow — finish the Claude switch

- [ ] Personal API key at console.anthropic.com as **botoole12@gmail.com**
      (check the org switcher — not New Consensus) → `.anthropic-key`
- [ ] `python3 check_claude.py` — 3 live calls, prints cost, writes nothing
- [ ] `cd worker && npx wrangler secret put ANTHROPIC_API_KEY && npm run deploy`
      — this deploy also ships the 5→134 character fix
- [ ] Test a DM to a background resident on the live site (the one thing not
      yet verified end to end)
- [ ] Set a spend alert in the console
- [ ] Delete `.api-key`, revoke the old Gemini key at aistudio.google.com
- [ ] Push `b193151` + `3e664e5`

## The main work — prime the voice ratchet

`build_lore_context()` feeds `authored:true` posts into every generation as
house voice. 88 posts, 0 marked canon, so it's running on empty. The
promotion path only started working in `b193151`.

- [ ] Write one Story in prose, in your voice
- [ ] Generate events + drafts from it
- [ ] **Edit the 3-4 posts that matter** — saving an edit now auto-promotes to
      canon, or use the ✍︎ canon button
- [ ] Publish on the existing cadence scheduler
- [ ] Repeat weekly. Drafts should need less editing each round.
- [ ] Re-check `lore_block()` is non-empty after the first pass

## Backlog

- [ ] Developer-render "NOW LEASING" hero — glossy off-plan CGI aesthetic,
      "847 PPM of pure exclusivity". Needs a bespoke fictional render;
      reference images can't ship (copyright, model releases, trademarks).
- [ ] "Have other characters reply to THIS post" button — guaranteed responses
      instead of engage-where-natural
- [ ] Floors browsing view
- [ ] DM-driven feed personalization
- [ ] More canon figures: Kirwin Harvest Board member, Aurora Cult pastor,
      more Babbages

## Housekeeping

- [ ] README below "How to run" still describes the pre-pivot mission/desktop
      game (`game.js`, `content.js`, missions/). Flagged as stale, not rewritten.
- [ ] `render.yaml` is vestigial now the site is on Pages — delete or keep as
      a fallback host?
- [ ] Delete the stale iCloud copy at
      `~/Library/Mobile Documents/.../Desktop/Triboro-Demo`
- [ ] `data/posts.json` has 3 posts with `status: null` (neither draft nor
      published) — legacy shape, harmless, could normalize

## Ground rules

- Personal project. Never use the New Consensus account, key, or repos.
- `ANTHROPIC_API_KEY` is deliberately ignored by `server.py` — key comes from
  `.anthropic-key` or `TRIBORO_ANTHROPIC_KEY` only.
- Run `build_site()` and commit `data/site.json` before pushing, or the live
  feed goes stale.
- Never switch Pages to branch-serving — it would publish drafts and prose.
- Direction is world & characters, **not** missions.
