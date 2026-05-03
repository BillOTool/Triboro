#!/usr/bin/env python3
"""
Triboro Server
- Static file server for the public site
- Local-only authoring API: characters, events, generated posts
- Legacy /api/chat for the original game (kept for compatibility)
"""

import json
import os
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
SITE_FILE = os.path.join(DATA, "site.json")
RESIDENTS_FILE = os.path.join(DATA, "residents.json")
CHATS_FILE = os.path.join(DATA, "chats.json")

DAILY_MESSAGE_LIMIT = 50
HISTORY_TURNS_TO_SEND = 16  # how many recent messages to include in each Gemini call

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


# ─── public site bundle ──────────────────────────────────────────────────

PUBLIC_CHAR_KEYS = {"name", "handle", "floor", "avatar", "faction", "tags"}

def build_site():
    """Compile data/site.json — everything the public feed needs."""
    chars = []
    for c in list_characters():
        meta = {k: v for k, v in c["meta"].items() if k in PUBLIC_CHAR_KEYS}
        chars.append({"id": c["id"], **meta})

    events = read_json(EVENTS_FILE, {"events": []})["events"]
    all_posts = read_json(POSTS_FILE, {"posts": []})["posts"]
    posts = [p for p in all_posts if p.get("published")]

    posts.sort(key=lambda p: (0 if p.get("pinned") else 1, -p.get("created", 0)))

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


def generate_reactions(event, character_ids, n_per_character=1):
    """For a given event and selected characters, ask Gemini for in-character posts."""
    world = build_world_context()
    chars = [get_character(cid) for cid in character_ids if get_character(cid)]

    char_blocks = []
    for c in chars:
        char_blocks.append(
            f"## {c['meta'].get('name', c['id'])} ({c['meta'].get('handle', '')})\n"
            f"{c['body']}"
        )

    system = (
        "You are writing posts for ALMANAPP, the in-world social network of TRIBORO. "
        "You write in the voice of multiple characters, each with their own distinct personality. "
        "Posts are short — usually 1-3 sentences, sometimes a single line. Casual, in-character, "
        "no exposition, no fourth-wall breaks. Mundane treated as cosmic, weirdness treated as ordinary. "
        "Funny, dry, character-driven. Onion-style.\n\n"
        f"WORLD:\n{world}\n\n"
        "CHARACTERS:\n" + "\n\n".join(char_blocks)
    )

    user = (
        f"EVENT (just happened in Triboro):\n"
        f"{event['title']}\n{event.get('description', '')}\n\n"
        f"Write {n_per_character} short Almanapp post(s) per character reacting to this event, "
        "each one fully in their voice. The post should reflect their obsessions, their voice, "
        "and the event — but it should feel ambient, not announcement-y. Some characters might "
        "barely acknowledge the event and post about something tangential.\n\n"
        "Return ONLY a JSON array, no markdown, no code fences. Each item: "
        '{"character_id": "<id>", "text": "<the post>"}. '
        f"Use these character ids: {', '.join(character_ids)}."
    )
    raw = gemini_generate(system, user, max_tokens=2000)

    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    posts = json.loads(raw)

    now = int(time.time())
    out = []
    for p in posts:
        out.append({
            "id": uuid.uuid4().hex[:10],
            "character_id": p["character_id"],
            "text": p["text"],
            "event_id": event["id"],
            "created": now,
            "pinned": False,
            "published": False,
        })
    return out


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
            }
            data = read_json(POSTS_FILE, {"posts": []})
            data["posts"].insert(0, post)
            write_json(POSTS_FILE, data)
            build_site()
            return self.send_json(post)
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
                    write_json(POSTS_FILE, data)
                    build_site()
                    return self.send_json(post)
            return self.send_json({"error": "not found"}, 404)
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
            build_site()
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
