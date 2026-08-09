# Triboro — to do

Standing backlog. Lives in the repo so it versions with the project.
Last updated 2026-08-08.

Status: **live and free** at https://billotool.github.io/Triboro/ — 180 posts,
149 characters, 21 events. Everything is pushed. DMs work for all 149
characters on Cloudflare Workers AI (Llama 3.3 70B), no API key, no card.

Running costs are still zero. The site is static files on Pages, so a visitor
triggers no model calls. The only runtime spend is DMs, on the free 10,000
neurons/day allocation — now ~139/day rather than ~180, because `world.md`
grew 38% today. Past that, visitors get the in-world "switchboard is
overloaded" line rather than an error.

---

## Session 2026-08-08 — the story draft

Six of Bill's short stories went in. Saved to `data/stories/` (gitignored,
now backed up — see below). From them: 15 new characters, 18 events and 146
posts, published deliberately in Claude's voice so the thing could be shown
around. **Bill edits into his own voice from here.**

Canon settled this session:

- **"Citizen Group", never "faction"**, in all prose. The `faction:`
  frontmatter key stays — it's structural (`PUBLIC_CHAR_KEYS`, `feed.js`).
- **Kirwin Foods holds the basements** (Bread Basket, Blind Fish hatcheries).
  **The League moved to Floor 60**, directly under sealed 61.
- **Floorships** (Bill's coinage, not "townships"): a block of floors with its
  own small government, ten stacked per side, East and West joined by **the
  bridge**, the building an 'h' from above. Most can't field candidates; a
  consolidation commission is dissolving them. The `lore/README.md`
  "retired layer" note was rewritten so this isn't mistaken for the old
  Magothy framing and reverted.
- **Everyone has guns**, unremarked.
- **Triboro**, never "Triborough".
- Aurora Cult's prime: **perks men**, the **Christofferson Brotherhood**, the
  **Aurora Conferences**.

Tooling added this session:

- **Events have a draft flag.** They used to ship unconditionally, so any
  placeholder headline went live on the next rebuild. `build_site()` now skips
  held events and any published post hanging off one; the admin has a
  DRAFT/PUBLIC toggle; CI fails if a draft reaches `site.json`.
- **Events are editable in the admin.** Posts always were; events weren't, so
  headlines could only be changed by hand-editing `events.json` — which is how
  that file got broken twice. Click `edit`, headline and description go
  editable, Cmd+Enter saves.
- **Preview / Live links** in the admin header.
- **The About page is gone.** Explaining the premise up front deflated it.
- **The feed reads like a feed**: avatar rows, relative timestamps, vote
  tallies (Security Branch posts are always downvoted — that was always canon
  and the site never showed it), a Message link that opens the real DM.
- **Reskinned as a cheap social platform** rather than a 1995 newspaper —
  which is what `world.md` always described: "run by three underfunded IT
  staff in their late 60s."
- **A fresh set of stories every visit.** Each page load deals 7 of the ~21
  events, reshuffles, and restarts the clock so posts arrive from "now".
  Nothing is generated — same corpus, re-dealt. Tune
  `FEED_EVENTS_PER_VISIT` in `feed.js`.

## Gotchas worth remembering

- **Don't hand-edit `posts.json` / `events.json` in an editor.** It broke twice
  today (an orphan `{`, an empty `{}`). Use the admin UI.
- **Deleting an event orphans its posts.** They stay published and render with
  no headline. 53 such posts are currently *unpublished*, not deleted, from
  seven events Bill cut.
- **The worker can 404 a character on the first request after a deploy** —
  edge propagation, not a stale bundle. Retry before redeploying.
  Chat auth is `Authorization: Bearer <token>`, not a body field.
- `server.py` routes OPTIONS/GET/POST/PUT/DELETE — **no PATCH**.
- **Viewer-time is real seconds since a viewer's first load.** Before today's
  recompression a first-time visitor saw 8 of 86 posts and waited 40 minutes
  for the rest. Check this before sharing the link anywhere.

## Next

- [ ] **Rewrite the event headlines.** They're still Claude's. Most visible
      text on the site. Admin → Events → `edit`.
- [ ] **Edit posts into your voice.** Saving an edit auto-marks it canon
      (`authored: true`). `build_lore_context()` feeds the last 20 canon posts
      into every future generation — the count is still **0**, so it's running
      on empty. About 20 good edits fills the window.
- [ ] The 7th story (six of seven arrived).
- [ ] Is glue an ordinary building-wide commodity (a `world.md` fact) or just
      what a certain kind of person does (character bodies)?
- [ ] The silver-yoyo event was deleted, so Ray's story has no event and his
      character body still points at a meet that doesn't exist. Restore,
      rewrite, or cut the thread.
- [ ] Decide about the 53 unpublished orphans: republish, re-point at another
      event, or delete.

## The Claude switch — deliberately not finished

Decided 2026-07-27: **the Anthropic key is not needed for a free, shareable
demo, so it is not being bought yet.** The three costs are separate and only
one is real.

- Public site: static files on Pages. Free forever, no model calls.
- Authoring: batch work on the laptop. Never runs for a visitor. Can be done
  by hand in a Claude Code session at no marginal cost — that is how the 60
  hand-written residents happened. The API key is only for firing off large
  unattended generations.
- DMs: the one genuine runtime cost, now covered by the Workers AI free tier.

Done 2026-07-27:

- [x] Worker deployed — all 134 characters answer DMs. Verified live against
      principals (Gus, Doris, Rita Cheng, Kirwin) and background residents
      (Bev Hollan, Bev Loomis, Nadine Coyle). Voice lands.
- [x] Moved off `llama-3.1-8b-instruct` (deprecated) to
      `llama-3.3-70b-instruct-fp8-fast`. See the table in `wrangler.toml`.
- [x] Register limit 5 → 20 per IP per day so friends on one wifi can all get in.

Still open, whenever the paid path is wanted:

- [ ] Personal API key at console.anthropic.com as **botoole12@gmail.com**
      (check the org switcher — not New Consensus) → `.anthropic-key`, then
      `python3 check_claude.py`. For DMs additionally:
      `npx wrangler secret put ANTHROPIC_API_KEY` + `CHAT_PROVIDER = "claude"`.
- [ ] Delete `.api-key`, revoke the old Gemini key at aistudio.google.com

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

## Where writing should go

The pipeline **samples, it does not train**. About 56 examples reach the model
per call no matter how much exists. So the buckets pay very differently, and
the two uncapped ones are not equally cheap.

| What you write | How much reaches the model | Worth it |
|---|---|---|
| `authored` canon posts | last 20 only (`LORE_POST_LIMIT`) | saturates at 20 |
| `sample-posts.md` | 3 per section (`VOICE_SAMPLES_PER_SECTION`) | diminishing past ~12/section |
| character `.md` bodies | entire body, uncapped | **best return** |
| `world.md` | entire file, uncapped | linear, but see cost below |

**`world.md` is in every prompt, for every character, on every DM.** At 4,294
chars it is already ~1,075 of the ~1,400-token DM prompt. Growing it to 40KB
would drop the free allocation from ~180 DMs/day to about 35. Keep it tight.
A character body only loads for that character, so it is the cheap one — be
generous there.

The buckets also teach different things. `world.md` and character bodies teach
**facts**; `sample-posts.md` and authored canon teach **voice and form**. Long
narrative prose in a character body fights the "reply in 1-3 sentences"
instruction and makes characters narrate.

`data/stories/<id>.md` is the **seed**, not a context bucket.
`generate_from_story()` derives events and drafts from it; the prose itself
does not persist. What persists is the posts you keep and mark canon.

So: distill a story, don't paste it. Building-wide fact → a line or two in
`world.md`. What one person saw or believes → that character's body. The
voice → posts you edit and mark `authored: true`.

Thin `sample-posts.md` sections, against a useful target of ~12: Community
Newsletter (6), LoT community high-loyalty (7), Aurora Cult official (7),
TB Alerts (7), LoT community low-loyalty (8).

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
- [ ] `GLOBAL_DAILY_CHAT_LIMIT = 2000` is no longer the binding constraint —
      the 10,000 neuron/day free allocation caps DMs at ~180 first. Harmless,
      but it stops meaning anything until the paid Claude path is switched on.
- [ ] CodePen won't host this — it's a multi-file site that fetches
      `site.json` and calls a cross-origin worker. The Pages URL is the share
      link. A single-file feed-only snapshot could be built as a portfolio
      piece if wanted.

## Ground rules

- Personal project. Never use the New Consensus account, key, or repos.
- `ANTHROPIC_API_KEY` is deliberately ignored by `server.py` — key comes from
  `.anthropic-key` or `TRIBORO_ANTHROPIC_KEY` only.
- Run `build_site()` and commit `data/site.json` before pushing, or the live
  feed goes stale.
- Never switch Pages to branch-serving — it would publish drafts and prose.
- Direction is world & characters, **not** missions.
