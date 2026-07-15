# Triboro Canon

The world bible for Triboro, imported from the botoole12 Drive design docs and
reconciled with what the running app already ships.

## What's here

| File | Role |
|---|---|
| [`complete-history.md`](complete-history.md) | **Master canon.** Setting, the Almanapp, media, arts & culture, all five factions, and the three-act story arc. When anything conflicts, this wins. |
| [`sample-posts.md`](sample-posts.md) | **House-voice library.** Curated canonical example posts by author type. The feed generator samples these as style exemplars (see `build_voice_context()` in `server.py`). |
| [`character-attributes.md`](character-attributes.md) | The hackable-profile field schema. |

## How canon maps to the running app

The app runs on a distilled layer, kept deliberately tight because it's injected
into every generation prompt:

- [`../world.md`](../world.md) — the compiled world context. Enriched from the
  master canon but kept short.
- [`../characters/`](../characters/) — one rich `.md` per NPC.
- `sample-posts.md` feeds the generators as voice reference.

## Reconciled drift (canon vs. what the app shipped)

- **League leadership** — Canon names **Doris Shemp** as League President.
  `world.md` had called Gus Pelletier the "informal leader." Both now coexist:
  Doris is the official President; Gus is the rank-and-file, shop-floor figure
  the player actually deals with.
- **Currency** — General currency is **credits**. Kirwin's brands its own store
  scrip **"Kredits."** (Canon used both loosely; this is the reconciliation.)

## Retired layer (do NOT use)

Earlier (circa 2023) design docs framed the world as **"Magothy townships"** —
*Southern/Upper Magothy Commonwealth, Chairwoman Higgins, a Sheriff's
department, a Renter's Association vs. Condo Board*. That framing was
**superseded** by the League-vs-Kirwin / Aurora canon above and should not be
reintroduced. Those Drive docs (`TRIBORO FACTIONS`, `TB ARTICLES & EVENTS`, and
parts of `Triboro headlines and official posts`) remain in Drive for archival
reference only. The full 581 KB **`Triboro Bible`** is the deep well for
missions and mechanics — mine it as needed, but `complete-history.md` is the
authority on world facts.
