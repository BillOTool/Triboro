#!/usr/bin/env python3
"""
Triboro Server
- Static file server for the public site
- Local-only authoring API: characters, events, generated posts
- Legacy /api/chat for the original game (kept for compatibility)
"""

import json
import os
import random
import re
import secrets
import time
import uuid
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
CHARS_DIR = os.path.join(DATA, "characters")
EVENTS_FILE = os.path.join(DATA, "events.json")
POSTS_FILE = os.path.join(DATA, "posts.json")
WORLD_FILE = os.path.join(DATA, "world.md")
SAMPLE_POSTS_FILE = os.path.join(DATA, "lore", "sample-posts.md")
SITE_FILE = os.path.join(DATA, "site.json")
RESIDENTS_FILE = os.path.join(DATA, "residents.json")
CHATS_FILE = os.path.join(DATA, "chats.json")
STORIES_FILE = os.path.join(DATA, "stories.json")
STORY_DOCS_DIR = os.path.join(DATA, "stories")  # one <story_id>.md per story's prose
QUEUE_STATE_FILE = os.path.join(DATA, "queue_state.json")

DAILY_MESSAGE_LIMIT = 50
HISTORY_TURNS_TO_SEND = 16  # how many recent messages to include in each Gemini call

# Queue cadence — drip a queued post into the public feed at this interval
# (when someone's polling). Each interval is randomized within ± JITTER.
QUEUE_CADENCE_SECONDS = 90
QUEUE_JITTER_SECONDS = 30

API_KEY = os.environ.get("GEMINI_API_KEY", "")
_key_file = os.path.join(ROOT, ".api-key")
if not API_KEY and os.path.exists(_key_file):
    with open(_key_file) as f:
        API_KEY = f.read().strip()
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


# ─── data helpers ─────────────────────────────────────────────────────────

def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)

def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

def parse_md(text):
    """Parse a markdown file with optional YAML-ish frontmatter."""
    meta, body = {}, text
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                v = v.strip().strip("'\"")
                meta[k.strip()] = v
        body = m.group(2)
    return meta, body

def char_id_from_filename(fname):
    return os.path.splitext(fname)[0]

def list_characters():
    out = []
    if not os.path.isdir(CHARS_DIR):
        return out
    for f in sorted(os.listdir(CHARS_DIR)):
        if not f.endswith(".md"):
            continue
        with open(os.path.join(CHARS_DIR, f)) as fh:
            meta, body = parse_md(fh.read())
        out.append({
            "id": char_id_from_filename(f),
            "meta": meta,
            "body": body,
        })
    return out

def get_character(cid):
    path = os.path.join(CHARS_DIR, f"{cid}.md")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        meta, body = parse_md(f.read())
    return {"id": cid, "meta": meta, "body": body, "raw": open(path).read()}

def save_character(cid, raw):
    path = os.path.join(CHARS_DIR, f"{cid}.md")
    with open(path, "w") as f:
        f.write(raw)


# ─── residents (auth) ────────────────────────────────────────────────────

def today_str():
    return time.strftime("%Y-%m-%d", time.gmtime())

def load_residents():
    return read_json(RESIDENTS_FILE, {"residents": []})

def save_residents(data):
    write_json(RESIDENTS_FILE, data)

def find_resident_by_token(token):
    if not token:
        return None
    for r in load_residents()["residents"]:
        if r.get("token") == token:
            return r
    return None

def update_resident(updated):
    data = load_residents()
    for i, r in enumerate(data["residents"]):
        if r["id"] == updated["id"]:
            data["residents"][i] = updated
            save_residents(data)
            return updated
    return None

def consume_rate_limit(resident):
    """Returns (ok, remaining). Mutates and persists resident."""
    today = today_str()
    if resident.get("rate_window") != today:
        resident["rate_window"] = today
        resident["rate_count"] = 0
    if resident["rate_count"] >= DAILY_MESSAGE_LIMIT:
        return False, 0
    resident["rate_count"] += 1
    update_resident(resident)
    return True, DAILY_MESSAGE_LIMIT - resident["rate_count"]

def public_resident(r):
    today = today_str()
    used = r.get("rate_count", 0) if r.get("rate_window") == today else 0
    return {
        "id": r["id"],
        "display_name": r["display_name"],
        "avatar": r.get("avatar", "👤"),
        "rate_remaining": max(0, DAILY_MESSAGE_LIMIT - used),
        "rate_limit": DAILY_MESSAGE_LIMIT,
    }


# ─── chats (per resident × character) ────────────────────────────────────

def chat_key(resident_id, character_id):
    return f"{resident_id}:{character_id}"

def get_chat_history(resident_id, character_id):
    return read_json(CHATS_FILE, {"chats": {}})["chats"].get(
        chat_key(resident_id, character_id), []
    )

def append_chat_messages(resident_id, character_id, messages):
    data = read_json(CHATS_FILE, {"chats": {}})
    key = chat_key(resident_id, character_id)
    history = data["chats"].get(key, [])
    history.extend(messages)
    data["chats"][key] = history
    write_json(CHATS_FILE, data)
    return history


# ─── queue + post lifecycle ──────────────────────────────────────────────

# Each post has a status:
#   draft     — admin's working copy, never shown
#   queued    — waiting in the drip queue, server publishes one at a time
#   published — visible in site.json
# `published: bool` is kept in sync with status=='published' for backward compat.

def migrate_post(p):
    if "status" not in p:
        p["status"] = "published" if p.get("published") else "draft"
    if p["status"] == "published" and "publish_at" not in p:
        p["publish_at"] = p.get("created", int(time.time()))
    p["published"] = (p["status"] == "published")
    # Per-viewer time anchor: how many seconds after a viewer's first visit this
    # post should appear. 0 = immediately visible on their day 1.
    if "triboro_offset" not in p:
        p["triboro_offset"] = 0
    return p

def normalize_posts(posts):
    return [migrate_post(p) for p in posts]

def migrate_event(e):
    # Same offset semantics as posts.
    if "triboro_offset" not in e:
        e["triboro_offset"] = 0
    return e

def normalize_events(events):
    return [migrate_event(e) for e in events]


# ─── stories ─────────────────────────────────────────────────────────────
# A story is just an ordered list of event_ids — a way to organize events
# into narrative threads. Events themselves are unchanged; an event can
# appear in multiple stories or none. Stories live in data/stories.json
# and don't ship to the public site bundle (yet — authoring tool only).

def read_stories():
    return read_json(STORIES_FILE, {"stories": []})

def write_stories(data):
    write_json(STORIES_FILE, data)

# A story may also carry the author's prose (the short story / longer doc it was
# written from). That lives as data/stories/<id>.md — same per-file .md pattern
# as characters — so long docs edit and diff cleanly. It seeds events + posts.
def story_doc_path(sid):
    return os.path.join(STORY_DOCS_DIR, f"{sid}.md")

def read_story_doc(sid):
    path = story_doc_path(sid)
    return open(path).read() if os.path.exists(path) else ""

def write_story_doc(sid, text):
    os.makedirs(STORY_DOCS_DIR, exist_ok=True)
    with open(story_doc_path(sid), "w") as f:
        f.write(text)

def delete_story_doc(sid):
    path = story_doc_path(sid)
    if os.path.exists(path):
        os.remove(path)

def find_story(stories, sid):
    for s in stories:
        if s["id"] == sid:
            return s
    return None

def publish_sort_key(p):
    return p.get("publish_at") or p.get("created") or 0

def get_queue_state():
    return read_json(QUEUE_STATE_FILE, {
        "cadence_seconds": QUEUE_CADENCE_SECONDS,
        "jitter_seconds": QUEUE_JITTER_SECONDS,
        "last_publish_at": 0,
        "next_due_at": 0,
    })

def save_queue_state(state):
    write_json(QUEUE_STATE_FILE, state)

def schedule_next_due(state, after=None):
    after = after if after is not None else int(time.time())
    cadence = state.get("cadence_seconds", QUEUE_CADENCE_SECONDS)
    jitter = state.get("jitter_seconds", QUEUE_JITTER_SECONDS)
    delta = cadence + random.randint(-jitter, jitter)
    state["next_due_at"] = after + max(10, delta)
    return state

def publish_due_posts(max_publish=1):
    """Tick: if cadence elapsed and queue not empty, publish the next post(s)."""
    state = get_queue_state()
    now = int(time.time())
    if now < state.get("next_due_at", 0):
        return []

    data = read_json(POSTS_FILE, {"posts": []})
    posts = normalize_posts(data["posts"])
    queued = [p for p in posts if p["status"] == "queued"]
    queued.sort(key=lambda p: (p.get("queue_order", p.get("created", 0)), p.get("created", 0)))
    if not queued:
        # Nothing to drip; don't reschedule yet — let next post land at "now + cadence"
        return []

    publishing = queued[:max_publish]
    for p in publishing:
        p["status"] = "published"
        p["published"] = True
        p["publish_at"] = now
        p.pop("queue_order", None)
    data["posts"] = posts
    write_json(POSTS_FILE, data)

    schedule_next_due(state, after=now)
    state["last_publish_at"] = now
    save_queue_state(state)
    build_site()
    return publishing

def next_queue_order():
    posts = normalize_posts(read_json(POSTS_FILE, {"posts": []})["posts"])
    used = [p.get("queue_order") for p in posts if p["status"] == "queued" and p.get("queue_order") is not None]
    return (max(used) + 1) if used else 1


# ─── public site bundle ──────────────────────────────────────────────────

PUBLIC_CHAR_KEYS = {"name", "handle", "floor", "avatar", "faction", "tags"}

def build_site():
    """Compile data/site.json — everything the public feed needs."""
    chars = []
    for c in list_characters():
        meta = {k: v for k, v in c["meta"].items() if k in PUBLIC_CHAR_KEYS}
        chars.append({"id": c["id"], **meta})

    events = normalize_events(read_json(EVENTS_FILE, {"events": []})["events"])
    all_posts = normalize_posts(read_json(POSTS_FILE, {"posts": []})["posts"])
    posts = [p for p in all_posts if p["status"] == "published"]
    posts.sort(key=lambda p: (0 if p.get("pinned") else 1, -publish_sort_key(p)))

    site = {
        "generated": int(time.time()),
        "characters": chars,
        "events": events,
        "posts": posts,
    }
    write_json(SITE_FILE, site)
    return site


# ─── Gemini ───────────────────────────────────────────────────────────────

def gemini_generate(system_prompt, user_prompt, max_tokens=1500, temperature=1.0):
    if not API_KEY:
        raise RuntimeError("No API key")
    payload = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": temperature,
        }
    }).encode()
    url = f"{GEMINI_URL}?key={API_KEY}"
    req = Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    with urlopen(req) as resp:
        result = json.loads(resp.read())
    return result["candidates"][0]["content"]["parts"][0]["text"]


def build_world_context():
    if os.path.exists(WORLD_FILE):
        with open(WORLD_FILE) as f:
            return f.read()
    return ""


def _strip_fences(s):
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    return s


def gemini_json(system, user, max_tokens=4000, temperature=1.0):
    """Call Gemini and parse the reply as JSON, with one stricter retry.
    Most first-try failures are an unescaped quote or a stray trailing comma."""
    raw = _strip_fences(gemini_generate(system, user, max_tokens, temperature))
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        retry_user = user + (
            "\n\nIMPORTANT: Your previous response could not be parsed as JSON. "
            "Return ONLY valid JSON. No code fences. Do not include trailing "
            'commas. Escape every internal double-quote with \\".'
        )
        raw2 = _strip_fences(gemini_generate(system, retry_user, max_tokens, temperature))
        try:
            return json.loads(raw2)
        except json.JSONDecodeError as e2:
            preview = raw2[:400].replace("\n", " ")
            raise RuntimeError(f"Gemini returned non-JSON twice: {e2}. Raw preview: {preview!r}")


def character_context(character_ids):
    """Return (chars, blocks_text) — the resolved character objects and the
    markdown block describing each, shared by both generators."""
    chars = [get_character(cid) for cid in character_ids if get_character(cid)]
    blocks = [
        f"## {c['meta'].get('name', c['id'])} ({c['meta'].get('handle', '')})\n{c['body']}"
        for c in chars
    ]
    return chars, "\n\n".join(blocks)


LORE_POST_LIMIT = 20  # how many recent author-written posts feed back as canon

def build_lore_context(limit=LORE_POST_LIMIT):
    """The most recent posts the author wrote by hand (authored=True), formatted
    as canon other characters can react to. Returns "" if there are none."""
    authored = [p for p in read_json(POSTS_FILE, {"posts": []})["posts"] if p.get("authored")]
    if not authored:
        return ""
    authored.sort(key=lambda p: p.get("created", 0))
    lines = []
    for p in authored[-limit:]:
        c = get_character(p.get("character_id", ""))
        name = (c["meta"].get("name") if c else None) or p.get("character_id", "someone")
        lines.append(f"- {name}: {p.get('text', '').strip()}")
    return "\n".join(lines)

def lore_block():
    """A system-prompt section of recent author-written posts, or "" if none.
    Shared by both generators so hand-written posts become material for others."""
    lore = build_lore_context()
    if not lore:
        return ""
    return (
        "\n\nTHE FEED SO FAR (canon — recent posts other residents actually made on Almanapp. "
        "This is an ongoing conversation your characters are part of and have seen):\n" + lore
    )


VOICE_SAMPLES_PER_SECTION = 3  # how many exemplars to draw from each author type

def _parse_sample_posts():
    """Parse data/lore/sample-posts.md into {section_label: [post, ...]}.
    Sections are '## ' headers; posts are '- ' bullets under them."""
    if not os.path.exists(SAMPLE_POSTS_FILE):
        return {}
    sections = {}
    current = None
    with open(SAMPLE_POSTS_FILE) as f:
        for line in f:
            line = line.rstrip("\n")
            if line.startswith("## "):
                current = line[3:].strip()
                sections[current] = []
            elif line.startswith("- ") and current:
                sections[current].append(line[2:].strip())
    return {k: v for k, v in sections.items() if v}


def build_voice_context(per_section=VOICE_SAMPLES_PER_SECTION):
    """A rotating sample of canonical example posts, grouped by author type, so
    the generator matches Triboro's house voice. Returns "" if the file is gone."""
    sections = _parse_sample_posts()
    if not sections:
        return ""
    lines = []
    for label, posts in sections.items():
        picks = random.sample(posts, min(per_section, len(posts)))
        lines.append(f"[{label}]")
        lines.extend(f"- {p}" for p in picks)
        lines.append("")
    return "\n".join(lines).strip()


def voice_block():
    """A system-prompt section of house-voice exemplars, or "" if none. Shared by
    both generators so posts match the established Triboro tone and rhythm."""
    voice = build_voice_context()
    if not voice:
        return ""
    return (
        "\n\nHOUSE VOICE (canon example posts by author type — match their texture, "
        "rhythm, and deadpan. These are style reference ONLY; never copy them "
        "verbatim or reuse their specifics):\n" + voice
    )


def generate_reactions(event, character_ids, n_per_character=1):
    """For a given event and selected characters, ask Gemini for in-character posts."""
    world = build_world_context()
    _, char_blocks = character_context(character_ids)

    system = (
        "You are writing posts for ALMANAPP, the in-world social network of TRIBORO. "
        "You write in the voice of multiple characters, each with their own distinct personality. "
        "Posts are short — usually 1-3 sentences, sometimes a single line. Casual, in-character, "
        "no exposition, no fourth-wall breaks. Mundane treated as cosmic, weirdness treated as ordinary. "
        "Funny, dry, character-driven. Onion-style.\n\n"
        f"WORLD:\n{world}\n\n"
        "CHARACTERS:\n" + char_blocks + voice_block() + lore_block()
    )

    user = (
        f"EVENT (just happened in Triboro):\n"
        f"{event['title']}\n{event.get('description', '')}\n\n"
        f"Write {n_per_character} short Almanapp post(s) per character reacting to this event, "
        "each one fully in their voice. The post should reflect their obsessions, their voice, "
        "and the event — but it should feel ambient, not announcement-y. Some characters might "
        "barely acknowledge the event and post about something tangential.\n\n"
        "Where it genuinely fits a character's voice, have them engage with THE FEED SO FAR — "
        "reply to, agree with, needle, worry about, or nurse a grudge over something another "
        "resident recently posted. Don't force it on every post; let it happen where it's natural.\n\n"
        "Return ONLY a JSON array, no markdown, no code fences. Each item: "
        '{"character_id": "<id>", "text": "<the post>"}. '
        f"Use these character ids: {', '.join(character_ids)}."
    )
    # Headroom: 10 posts × ~250 tokens each + JSON wrapper. 4000 keeps slack
    # so the response doesn't truncate mid-string.
    posts = gemini_json(system, user, max_tokens=4000)

    now = int(time.time())
    event_offset = int(event.get("triboro_offset") or 0)
    out = []
    for p in posts:
        # Each reaction lands a few minutes after its event in viewer-time, so
        # they cluster around the headline rather than all at the same instant.
        offset = event_offset + random.randint(60, 1800)
        out.append({
            "id": uuid.uuid4().hex[:10],
            "character_id": p["character_id"],
            "text": p["text"],
            "event_id": event["id"],
            "created": now,
            "pinned": False,
            "published": False,
            "triboro_offset": offset,
        })
    return out


def generate_from_story(story, doc_text, character_ids, n_events=3, n_per_character=1):
    """Read the author's prose for a story and derive draft material from it:
    up to n_events event headlines, plus in-character posts reacting to them.
    Returns (events, posts); posts are drafts already linked to the new events."""
    world = build_world_context()
    _, char_blocks = character_context(character_ids)

    system = (
        "You are the story editor for ALMANAPP, the in-world social network of TRIBORO. "
        "The author gives you a short story (or longer document) set inside Triboro — treat it as "
        "canon, things that actually happened. Turn it into (1) a few EVENT headlines: the concrete, "
        "public, observable happenings the writing implies, titled the way a resident would, and "
        "(2) short in-character POSTS reacting to those events. Posts are 1-3 sentences, casual, "
        "fully in voice, no exposition, no fourth-wall breaks. Mundane treated as cosmic, weirdness "
        "treated as ordinary. Funny, dry, character-driven. Onion-style.\n\n"
        f"WORLD:\n{world}\n\n"
        "CHARACTERS:\n" + char_blocks + voice_block() + lore_block()
    )

    user = (
        "AUTHOR'S WRITING (canon — everything below actually happened in Triboro):\n"
        f"{doc_text}\n\n"
        f"Derive up to {n_events} EVENT headline(s) from this writing — the concrete public happenings "
        "a resident would notice. Each event: a short `title` and a 1-2 sentence `description`. "
        "Order them as they occur in the writing.\n\n"
        f"Then write {n_per_character} short post(s) per character reacting to these events, each fully "
        "in that character's voice and obsessions. Tie each post to one event by its index. Some "
        "characters might react only obliquely, or to the mood rather than the facts.\n\n"
        "Return ONLY JSON, no markdown, no code fences, in exactly this shape:\n"
        '{"events": [{"title": "...", "description": "..."}], '
        '"posts": [{"character_id": "<id>", "event_index": 0, "text": "..."}]}\n'
        f"Use only these character ids: {', '.join(character_ids)}. "
        "event_index is the 0-based position of the event in the events array."
    )

    data = gemini_json(system, user, max_tokens=4000)
    raw_events = (data.get("events") or [])[:n_events]
    raw_posts = data.get("posts") or []

    now = int(time.time())
    events = []
    for e in raw_events:
        title = (e.get("title") or "").strip()
        if not title:
            continue
        events.append({
            "id": uuid.uuid4().hex[:10],
            "title": title,
            "description": (e.get("description") or "").strip(),
            "created": now,
            "triboro_offset": 0,
            "source_story_id": story["id"],
        })

    posts = []
    for p in raw_posts:
        cid = (p.get("character_id") or "").strip()
        text = (p.get("text") or "").strip()
        if not cid or not text or not get_character(cid):
            continue
        idx = p.get("event_index")
        if isinstance(idx, int) and 0 <= idx < len(events):
            event_id = events[idx]["id"]
        else:
            event_id = events[0]["id"] if events else None
        posts.append({
            "id": uuid.uuid4().hex[:10],
            "character_id": cid,
            "text": text,
            "event_id": event_id,
            "created": now,
            "status": "draft",
            "pinned": False,
            "published": False,
            "triboro_offset": 0,
            "source_story_id": story["id"],
        })
    return events, posts


# ─── HTTP handler ─────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    def end_headers(self):
        # Dev tool: never serve stale assets. Browsers still revalidate (304-able).
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def _bearer_token(self):
        h = self.headers.get("Authorization", "")
        return h[7:].strip() if h.startswith("Bearer ") else None

    def _require_resident(self):
        r = find_resident_by_token(self._bearer_token())
        if not r:
            self.send_json({"error": "auth required"}, 401)
            return None
        return r

    def send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # routing
    def do_GET(self):
        if self.path == "/api/me":
            return self.handle_me()
        if self.path.startswith("/api/chat/"):
            return self.handle_chat_history()
        if self.path.startswith("/api/admin/"):
            return self.handle_admin_get()
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/register":
            return self.handle_register()
        if self.path == "/api/chat":
            return self.handle_chat()
        if self.path == "/api/set-key":
            return self.handle_set_key()
        if self.path == "/api/check-key":
            return self.send_json({"has_key": bool(API_KEY)})
        if self.path.startswith("/api/admin/"):
            return self.handle_admin_post()
        self.send_error(404)

    def do_PUT(self):
        if self.path.startswith("/api/admin/"):
            return self.handle_admin_put()
        self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/admin/"):
            return self.handle_admin_delete()
        self.send_error(404)

    # admin: GET
    def handle_admin_get(self):
        p = self.path
        if p == "/api/admin/world":
            return self.send_json({"text": open(WORLD_FILE).read() if os.path.exists(WORLD_FILE) else ""})
        if p == "/api/admin/characters":
            return self.send_json({"characters": list_characters()})
        if p.startswith("/api/admin/character/"):
            cid = p.rsplit("/", 1)[-1]
            c = get_character(cid)
            return self.send_json(c) if c else self.send_json({"error": "not found"}, 404)
        if p == "/api/admin/events":
            return self.send_json(read_json(EVENTS_FILE, {"events": []}))
        if p == "/api/admin/posts":
            return self.send_json(read_json(POSTS_FILE, {"posts": []}))
        if p == "/api/admin/stories":
            data = read_stories()
            for s in data["stories"]:
                s["has_doc"] = bool(read_story_doc(s["id"]).strip())
            return self.send_json(data)
        if p.startswith("/api/admin/story/"):
            sid = p.rsplit("/", 1)[-1]
            story = find_story(read_stories()["stories"], sid)
            if not story:
                return self.send_json({"error": "not found"}, 404)
            return self.send_json({**story, "doc": read_story_doc(sid)})
        self.send_json({"error": "not found"}, 404)

    # admin: POST
    def handle_admin_post(self):
        p = self.path
        body = self._read_body()
        if p == "/api/admin/event":
            data = read_json(EVENTS_FILE, {"events": []})
            event = {
                "id": uuid.uuid4().hex[:10],
                "title": body.get("title", "").strip(),
                "description": body.get("description", "").strip(),
                "created": int(time.time()),
                "triboro_offset": int(body.get("triboro_offset") or 0),
            }
            if not event["title"]:
                return self.send_json({"error": "title required"}, 400)
            data["events"].insert(0, event)
            write_json(EVENTS_FILE, data)
            build_site()
            return self.send_json(event)
        if p == "/api/admin/post":
            char_id = (body.get("character_id") or "").strip()
            text = (body.get("text") or "").strip()
            if not char_id or not text:
                return self.send_json({"error": "character_id and text required"}, 400)
            if not get_character(char_id):
                return self.send_json({"error": "no such character"}, 404)
            event_id = body.get("event_id") or None
            if event_id:
                events = read_json(EVENTS_FILE, {"events": []})["events"]
                if not any(e["id"] == event_id for e in events):
                    return self.send_json({"error": "no such event"}, 404)
            post = {
                "id": uuid.uuid4().hex[:10],
                "character_id": char_id,
                "text": text,
                "event_id": event_id,
                "created": int(time.time()),
                "pinned": bool(body.get("pinned")),
                "published": bool(body.get("published")),
                "triboro_offset": int(body.get("triboro_offset") or 0),
                "authored": True,  # hand-written → becomes lore other characters can react to
            }
            data = read_json(POSTS_FILE, {"posts": []})
            data["posts"].insert(0, post)
            write_json(POSTS_FILE, data)
            build_site()
            return self.send_json(post)
        if p.startswith("/api/admin/story/") and p.endswith("/generate"):
            sid = p[len("/api/admin/story/"):-len("/generate")]
            sdata = read_stories()
            story = find_story(sdata["stories"], sid)
            if not story:
                return self.send_json({"error": "story not found"}, 404)
            doc = read_story_doc(sid)
            if not doc.strip():
                return self.send_json({"error": "this story has no writing yet"}, 400)
            char_ids = body.get("character_ids", [])
            if not char_ids:
                return self.send_json({"error": "no characters selected"}, 400)
            n_events = max(1, min(3, int(body.get("n_events", 3))))
            n_per = max(1, min(3, int(body.get("n_per_character", 1))))
            try:
                new_events, new_posts = generate_from_story(story, doc, char_ids, n_events, n_per)
            except Exception as e:
                return self.send_json({"error": str(e)}, 500)
            # Events go live in the bundle (same as the Events tab); posts are drafts.
            edata = read_json(EVENTS_FILE, {"events": []})
            edata["events"] = new_events + edata["events"]
            write_json(EVENTS_FILE, edata)
            # Thread the new events onto this story, in order.
            story["event_ids"] = list(story.get("event_ids", [])) + [e["id"] for e in new_events]
            write_stories(sdata)
            pdata = read_json(POSTS_FILE, {"posts": []})
            pdata["posts"] = new_posts + pdata["posts"]
            write_json(POSTS_FILE, pdata)
            build_site()
            return self.send_json({"events": new_events, "posts": new_posts})
        if p == "/api/admin/story":
            title = (body.get("title") or "").strip()
            if not title:
                return self.send_json({"error": "title required"}, 400)
            description = (body.get("description") or "").strip()
            event_ids = body.get("event_ids") or []
            if not isinstance(event_ids, list):
                return self.send_json({"error": "event_ids must be a list"}, 400)
            data = read_stories()
            story = {
                "id": uuid.uuid4().hex[:10],
                "title": title,
                "description": description,
                "event_ids": [str(x) for x in event_ids],
                "created": int(time.time()),
            }
            data["stories"].insert(0, story)
            write_stories(data)
            return self.send_json(story)
        if p == "/api/admin/character":
            cid = (body.get("id") or "").strip().lower()
            if not re.match(r"^[a-z0-9][a-z0-9_]{1,40}$", cid):
                return self.send_json({"error": "id must be lowercase letters/numbers/underscores, 2-41 chars"}, 400)
            if os.path.exists(os.path.join(CHARS_DIR, f"{cid}.md")):
                return self.send_json({"error": "character id already exists"}, 409)
            raw = (body.get("raw") or "").strip()
            if not raw:
                return self.send_json({"error": "raw markdown required"}, 400)
            os.makedirs(CHARS_DIR, exist_ok=True)
            save_character(cid, raw)
            build_site()
            return self.send_json(get_character(cid))
        if p == "/api/admin/schedule":
            # Lay out events and their reactions across viewer-time. Body:
            #   scope:                  "unpublished" | "all" | "published" | list of ids
            #   event_interval_seconds: gap between consecutive event headlines
            #   post_interval_seconds:  gap between reactions inside the same event
            #   interval_seconds:       fallback if either of the two above is missing
            #   start_offset:           where in viewer-time the window begins (default 0)
            #   jitter:                 ±10% random nudge so things don't land on round numbers
            #   auto_publish:           flip targeted posts to status=published
            #
            # Older events get earlier offsets (older=reaches the viewer first);
            # newer events get later offsets (= they sort on top of the feed).
            # Reactions overlap because event N+1 typically lands while event
            # N is still trickling out reactions — exactly the chat-stream feel.
            scope = body.get("scope", "unpublished")
            interval = body.get("interval_seconds")
            event_interval = body.get("event_interval_seconds", interval)
            post_interval = body.get("post_interval_seconds", interval)
            start = max(0, int(body.get("start_offset") or 0))
            jitter = bool(body.get("jitter", True))
            auto_publish = bool(body.get("auto_publish", False))

            if event_interval is None or post_interval is None:
                return self.send_json({"error": "interval_seconds (or both event/post interval) required"}, 400)
            ev_int = max(1, int(event_interval))
            ps_int = max(1, int(post_interval))

            # Optional ordered list of event_ids — when present, only those
            # events (in that order) are touched. This is how a Story tells
            # the scheduler to lay its events out narratively.
            ordered_event_ids = body.get("event_ids")
            if ordered_event_ids is not None and not isinstance(ordered_event_ids, list):
                return self.send_json({"error": "event_ids must be a list"}, 400)

            data = read_json(POSTS_FILE, {"posts": []})
            posts = normalize_posts(data["posts"])
            evdata = read_json(EVENTS_FILE, {"events": []})
            events = normalize_events(evdata["events"])

            # Decide which events to lay out, and in what order.
            if ordered_event_ids:
                events_in_play = []
                for eid in ordered_event_ids:
                    ev = next((e for e in events if e["id"] == eid), None)
                    if ev:
                        events_in_play.append(ev)
                if not events_in_play:
                    return self.send_json({"error": "no events matched event_ids"}, 400)
                limit_to_event_ids = {e["id"] for e in events_in_play}
            else:
                events_in_play = sorted(events, key=lambda e: e.get("created", 0))
                limit_to_event_ids = None  # touch posts in any event

            if isinstance(scope, list):
                target_ids = set(scope)
            elif scope == "all":
                target_ids = {p["id"] for p in posts}
            elif scope == "published":
                target_ids = {p["id"] for p in posts if p["status"] == "published"}
            else:  # "unpublished" / default
                target_ids = {p["id"] for p in posts if p["status"] != "published"}

            if limit_to_event_ids is not None:
                target_ids = {
                    pid for pid in target_ids
                    if any(p["id"] == pid and p.get("event_id") in limit_to_event_ids for p in posts)
                }

            if not target_ids and not events_in_play:
                return self.send_json({"error": "no posts matched scope"}, 400)

            def _jit(step):
                return random.uniform(-step * 0.1, step * 0.1) if jitter else 0

            now_ts = int(time.time())

            # Layout step 1: events on their own cadence, in the chosen order.
            event_offset_map = {}
            for i, ev in enumerate(events_in_play):
                base = start + i * ev_int + _jit(ev_int)
                ev["triboro_offset"] = max(0, int(base))
                event_offset_map[ev["id"]] = ev["triboro_offset"]

            # Layout step 2: reactions on their own cadence, anchored to their
            # event's offset. Posts not in target keep their old offset.
            scheduled = 0
            for ev in events_in_play:
                ev_posts = sorted(
                    [p for p in posts if p.get("event_id") == ev["id"]],
                    key=lambda p: p.get("created", 0),
                )
                base = event_offset_map[ev["id"]]
                for j, post in enumerate(ev_posts):
                    if post["id"] not in target_ids:
                        continue
                    offset = base + j * ps_int + _jit(ps_int)
                    # Reactions never appear before their parent event.
                    post["triboro_offset"] = max(base, int(offset))
                    if auto_publish:
                        post["status"] = "published"
                        post["published"] = True
                        post.setdefault("publish_at", now_ts)
                    scheduled += 1

            # Loose chatter (no event) lands after the last event in
            # viewer-time. Skipped entirely when scheduling a story.
            if limit_to_event_ids is None:
                loose = sorted(
                    [p for p in posts if not p.get("event_id")],
                    key=lambda p: p.get("created", 0),
                )
                loose_base = (max(event_offset_map.values()) + ev_int) if event_offset_map else start
                for j, post in enumerate(loose):
                    if post["id"] not in target_ids:
                        continue
                    offset = loose_base + j * ps_int + _jit(ps_int)
                    post["triboro_offset"] = max(0, int(offset))
                    if auto_publish:
                        post["status"] = "published"
                        post["published"] = True
                        post.setdefault("publish_at", now_ts)
                    scheduled += 1

            evdata["events"] = events
            write_json(EVENTS_FILE, evdata)
            data["posts"] = posts
            write_json(POSTS_FILE, data)
            build_site()
            return self.send_json({
                "scheduled": scheduled,
                "event_interval_seconds": ev_int,
                "post_interval_seconds": ps_int,
                "start_offset": start,
            })
        if p == "/api/admin/generate":
            event_id = body.get("event_id")
            char_ids = body.get("character_ids", [])
            n = int(body.get("n_per_character", 1))
            events = read_json(EVENTS_FILE, {"events": []})["events"]
            event = next((e for e in events if e["id"] == event_id), None)
            if not event:
                return self.send_json({"error": "event not found"}, 404)
            if not char_ids:
                return self.send_json({"error": "no characters selected"}, 400)
            try:
                new_posts = generate_reactions(event, char_ids, n)
            except Exception as e:
                return self.send_json({"error": str(e)}, 500)
            data = read_json(POSTS_FILE, {"posts": []})
            data["posts"] = new_posts + data["posts"]
            write_json(POSTS_FILE, data)
            build_site()
            return self.send_json({"posts": new_posts})
        self.send_json({"error": "not found"}, 404)

    # admin: PUT
    def handle_admin_put(self):
        p = self.path
        body = self._read_body()
        if p.startswith("/api/admin/character/"):
            cid = p.rsplit("/", 1)[-1]
            raw = body.get("raw", "")
            if not raw.strip():
                return self.send_json({"error": "empty"}, 400)
            save_character(cid, raw)
            build_site()
            return self.send_json(get_character(cid))
        if p.startswith("/api/admin/post/"):
            pid = p.rsplit("/", 1)[-1]
            data = read_json(POSTS_FILE, {"posts": []})
            for post in data["posts"]:
                if post["id"] == pid:
                    if "text" in body:
                        post["text"] = body["text"]
                    if "pinned" in body:
                        post["pinned"] = bool(body["pinned"])
                    if "published" in body:
                        post["published"] = bool(body["published"])
                    if "triboro_offset" in body:
                        post["triboro_offset"] = int(body["triboro_offset"] or 0)
                    write_json(POSTS_FILE, data)
                    build_site()
                    return self.send_json(post)
            return self.send_json({"error": "not found"}, 404)
        if p.startswith("/api/admin/event/"):
            eid = p.rsplit("/", 1)[-1]
            data = read_json(EVENTS_FILE, {"events": []})
            for event in data["events"]:
                if event["id"] == eid:
                    if "title" in body:
                        event["title"] = body["title"]
                    if "description" in body:
                        event["description"] = body["description"]
                    if "triboro_offset" in body:
                        event["triboro_offset"] = int(body["triboro_offset"] or 0)
                    write_json(EVENTS_FILE, data)
                    build_site()
                    return self.send_json(event)
            return self.send_json({"error": "not found"}, 404)
        if p.startswith("/api/admin/story/"):
            sid = p.rsplit("/", 1)[-1]
            data = read_stories()
            story = find_story(data["stories"], sid)
            if not story:
                return self.send_json({"error": "not found"}, 404)
            if "title" in body:
                t = (body["title"] or "").strip()
                if not t:
                    return self.send_json({"error": "title required"}, 400)
                story["title"] = t
            if "description" in body:
                story["description"] = (body["description"] or "").strip()
            if "event_ids" in body:
                eids = body["event_ids"]
                if not isinstance(eids, list):
                    return self.send_json({"error": "event_ids must be a list"}, 400)
                story["event_ids"] = [str(x) for x in eids]
            if "doc" in body:
                write_story_doc(sid, body["doc"] or "")
            write_stories(data)
            return self.send_json({**story, "doc": read_story_doc(sid)})
        self.send_json({"error": "not found"}, 404)

    # admin: DELETE
    def handle_admin_delete(self):
        p = self.path
        if p.startswith("/api/admin/post/"):
            pid = p.rsplit("/", 1)[-1]
            data = read_json(POSTS_FILE, {"posts": []})
            data["posts"] = [x for x in data["posts"] if x["id"] != pid]
            write_json(POSTS_FILE, data)
            build_site()
            return self.send_json({"ok": True})
        if p.startswith("/api/admin/event/"):
            eid = p.rsplit("/", 1)[-1]
            data = read_json(EVENTS_FILE, {"events": []})
            data["events"] = [x for x in data["events"] if x["id"] != eid]
            write_json(EVENTS_FILE, data)
            # Drop the deleted event from any story that references it.
            sd = read_stories()
            changed = False
            for s in sd["stories"]:
                if eid in s.get("event_ids", []):
                    s["event_ids"] = [x for x in s["event_ids"] if x != eid]
                    changed = True
            if changed:
                write_stories(sd)
            build_site()
            return self.send_json({"ok": True})
        if p.startswith("/api/admin/story/"):
            sid = p.rsplit("/", 1)[-1]
            data = read_stories()
            data["stories"] = [s for s in data["stories"] if s["id"] != sid]
            write_stories(data)
            delete_story_doc(sid)
            return self.send_json({"ok": True})
        self.send_json({"error": "not found"}, 404)

    # ─── resident auth ───
    def handle_register(self):
        body = self._read_body()
        name = (body.get("display_name") or "").strip()[:40]
        avatar = (body.get("avatar") or "👤").strip()[:8] or "👤"
        if not name:
            return self.send_json({"error": "display_name required"}, 400)
        resident = {
            "id": "res_" + secrets.token_hex(8),
            "display_name": name,
            "avatar": avatar,
            "token": secrets.token_urlsafe(24),
            "created": int(time.time()),
            "rate_window": today_str(),
            "rate_count": 0,
        }
        data = load_residents()
        data["residents"].append(resident)
        save_residents(data)
        out = public_resident(resident)
        out["token"] = resident["token"]
        return self.send_json(out)

    def handle_me(self):
        r = self._require_resident()
        if not r:
            return
        return self.send_json(public_resident(r))

    def handle_chat_history(self):
        # GET /api/chat/<character_id>
        r = self._require_resident()
        if not r:
            return
        cid = self.path.rsplit("/", 1)[-1]
        return self.send_json({"history": get_chat_history(r["id"], cid)})

    # ─── chat with a character ───
    def handle_chat(self):
        if not API_KEY:
            return self.send_json({"error": "No API key configured"}, 500)
        r = self._require_resident()
        if not r:
            return
        body = self._read_body()
        cid = (body.get("character_id") or "").strip()
        text = (body.get("message") or "").strip()[:1000]
        if not cid or not text:
            return self.send_json({"error": "character_id and message required"}, 400)
        char = get_character(cid)
        if not char:
            return self.send_json({"error": "no such resident"}, 404)

        ok, remaining = consume_rate_limit(r)
        if not ok:
            return self.send_json(
                {"error": "Daily message limit reached. Come back tomorrow.",
                 "rate_remaining": 0}, 429)

        world = build_world_context()
        char_name = char["meta"].get("name", cid)
        char_handle = char["meta"].get("handle", "")
        system = (
            f"You are {char_name} ({char_handle}), a resident of TRIBORO on the "
            f"ALMANAPP private DM. You are messaging another resident named "
            f"\"{r['display_name']}\". Stay fully in character. Reply briefly — "
            f"usually 1-3 sentences, sometimes a single line. Mundane treated as "
            f"cosmic, weirdness treated as ordinary. Onion-style. Never break "
            f"the fourth wall. Never mention being an AI or a model. If asked "
            f"about the outside world, the cure, or anything you wouldn't know, "
            f"react in-character (suspicion, dismissal, change of subject).\n\n"
            f"WORLD:\n{world}\n\n"
            f"YOUR CHARACTER:\n{char['body']}"
        )

        history = get_chat_history(r["id"], cid)
        recent = history[-HISTORY_TURNS_TO_SEND:]
        contents = [
            {"role": "user" if m["role"] == "user" else "model",
             "parts": [{"text": m["text"]}]}
            for m in recent
        ]
        contents.append({"role": "user", "parts": [{"text": text}]})

        payload = json.dumps({
            "contents": contents,
            "systemInstruction": {"parts": [{"text": system}]},
            "generationConfig": {"maxOutputTokens": 400, "temperature": 0.95},
        }).encode()
        url = f"{GEMINI_URL}?key={API_KEY}"
        req = Request(url, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        try:
            with urlopen(req) as resp:
                result = json.loads(resp.read())
            reply = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        except HTTPError as e:
            err = e.read().decode() if hasattr(e, "read") else str(e)
            return self.send_json({"error": err}, 502)
        except (URLError, KeyError, IndexError) as e:
            return self.send_json({"error": str(e)}, 502)

        now = int(time.time())
        append_chat_messages(r["id"], cid, [
            {"role": "user", "text": text, "ts": now},
            {"role": "char", "text": reply, "ts": now + 1},
        ])
        return self.send_json({"reply": reply, "rate_remaining": remaining})

    def handle_set_key(self):
        global API_KEY
        body = self._read_body()
        API_KEY = body.get("key", "").strip()
        if not API_KEY:
            return self.send_json({"ok": False, "error": "No key provided"}, 400)
        try:
            with urlopen(Request(f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}")) as r:
                r.read()
            self.send_json({"ok": True})
        except (URLError, HTTPError) as e:
            API_KEY = ""
            self.send_json({"ok": False, "error": str(e)}, 400)

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    os.chdir(ROOT)
    print(f"\n  TRIBORO Server  http://localhost:{port}")
    print(f"  admin           http://localhost:{port}/admin/")
    print(f"  api key:        {'loaded' if API_KEY else 'NOT SET'}\n")
    build_site()
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
