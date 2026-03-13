# TRIBORO

A narrative puzzle game set inside a massive apartment complex sealed off from the outside world for 73 years. You play a hacker-for-hire on Triboro's social network, taking jobs that require social engineering, investigation, and moral choices — all through freeform conversation with AI-powered NPCs.

## How to run

1. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Save it in a file called `.api-key` in the project root (one line, just the key)
3. Run:

```bash
cd Triboro-Demo
python3 server.py
```

4. Open **http://localhost:8080**

The game uses Google Gemini 2.5 Flash (free tier) to power NPC conversations.

## Project structure

```
Triboro-Demo/
├── index.html        # Page structure and overlays
├── style.css         # All visual styling (desktop UI, windows, chat)
├── server.py         # Python server — serves files + proxies Gemini API
├── game.js           # Game engine — windows, chat system, state tracking
├── characters.js     # NPC system prompts and personality definitions
├── content.js        # World data — social posts, news articles, profiles
├── art/              # All artwork and visual assets
│   ├── backgrounds/  # Desktop wallpapers, scene art
│   ├── characters/   # NPC avatars and portraits
│   ├── icons/        # Desktop app icons
│   └── ui/           # UI elements, decorative pieces
└── missions/         # Mission scripts and ideas
```

## Who works on what

### Story & Content (Bill)
- **characters.js** — Add/edit NPC personalities, backstories, and what they know
- **content.js** — Almanapp posts, news articles, world flavor text
- **missions/** — New mission ideas and scripts

### Art & Visuals (Artist)
- **art/** — All visual assets go here (see art/README.md for specs)
- **style.css** — Visual tweaks, colors, layout adjustments

### Shared (discuss before changing)
- **game.js** — Core game logic, window management, state tracking
- **index.html** — Page structure
- **server.py** — Server config

## The world

Triboro is a 60+ floor apartment complex housing ~6,000 people. The Aurora — a toxic smog — sealed the building off from the outside world 73 years ago. No living resident has ever been outside. Society has its own politics, economy, culture, factions, and media. You navigate all of it through a simulated desktop environment.

### Factions
- **League of Trades** — Blue-collar union. Plumbers, electricians, mechanics. They keep the building running.
- **Kirwin Foods** — Corporate food monopoly. Three generations of control. Pushing for more power.
- **Security Branch** — Building police. Mostly incompetent bureaucrats.
- **Aurora Cult** — Declining religious group. Believes the smog is a spiritual trial.
- **Triboro Council** — Weak elected government. Election coming up.

### Key NPCs (currently implemented)
- **Benny** — Your middleman. Assigns jobs. Cagey, streetwise, dark humor.
- **Dale Voss** — Target of Mission 1. Friendly builder with a secret.
- **Marla Voss** — Dale's wife. Worried he's cheating. She hired you.
- **Gus Pelletier** — League of Trades veteran. Gruff, principled.
- **Rita Cheng** — Observant resident. Notices everything. Lost her cat.
- **Sister Maren** — Aurora Cult member. Serene, intense.
- **Tommy Bao** — Young resident. Sardonic, funny. Works at Kirwin cafeteria.
- **Anonymous (@truth_speaker_tb)** — Conspiracy poster. Paranoid but not wrong about everything.
