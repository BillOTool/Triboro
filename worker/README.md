# Triboro chat Worker

Public-facing backend for character DMs on the Almanapp. The static site
(GitHub Pages) calls this Worker for the four chat endpoints; everything else
stays a flat file.

```
POST /api/register         → { token, id, display_name, avatar, rate_remaining }
GET  /api/me               → resident profile (Authorization: Bearer <token>)
POST /api/chat             → { reply, rate_remaining }
GET  /api/chat/<character> → { history: [...] }
```

## One-time setup

```bash
cd worker
npm install
npx wrangler login                                   # browser auth to Cloudflare
npx wrangler kv namespace create TRIBORO             # prints { id = "..." }
# paste the printed id into wrangler.toml under [[kv_namespaces]]
npx wrangler secret put GEMINI_API_KEY               # paste the key when prompted
npm run deploy                                       # bundles data, deploys
```

The Worker URL prints at the end of `deploy` —
something like `https://triboro-chat.<account>.workers.dev`. Save it; the
static site needs it (see "Wire the frontend" below).

## Iterating

- Edit world or characters in `../data/` as usual.
- `npm run deploy` re-bundles `src/data.js` from `../data/` and pushes.
- Or `npm run dev` to run the Worker locally on `http://localhost:8787` —
  works with the same KV namespace by default.

## Wire the frontend

After the first deploy, copy the Worker URL into the static site so the public
build talks to it:

```html
<!-- index.html, before feed.js -->
<script>window.TRIBORO_BACKEND = "https://triboro-chat.<account>.workers.dev";</script>
```

Local dev (running `python3 ../server.py`) leaves `TRIBORO_BACKEND` undefined,
so `feed.js` falls back to same-origin and hits `server.py` as before.

## Abuse guards (configurable in `wrangler.toml`)

- `CHAT_PER_IP_PER_HOUR` — sliding 1-hour bucket per source IP.
- `REGISTER_PER_IP_PER_DAY` — caps token farming.
- `GLOBAL_DAILY_CHAT_LIMIT` — global kill switch; resets at UTC midnight.
- `DAILY_MESSAGE_LIMIT` — per-resident, mirrors `server.py`.

To bump limits without redeploying code:
`npx wrangler deploy` after editing `wrangler.toml` is still needed (vars are
build-time bound). For runtime tunables we'd move them to KV later.

## Resetting

- Wipe the KV namespace: `npx wrangler kv namespace delete --binding TRIBORO`
  then recreate. Drops all residents and chat history.
- Rotate the Gemini key: `npx wrangler secret put GEMINI_API_KEY` again.
