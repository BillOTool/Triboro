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
        if self.path.startswith("/api/admin/"):
            return self.handle_admin_get()
        return super().do_GET()

    def do_POST(self):
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

    # legacy chat (kept for old game.js)
    def handle_chat(self):
        if not API_KEY:
            return self.send_json({"error": "No API key configured"}, 401)
        body = self._read_body()
        system_prompt = body.get("system", "")
        messages = body.get("messages", [])
        contents = [
            {"role": "user" if m["role"] == "user" else "model",
             "parts": [{"text": m["content"]}]}
            for m in messages
        ]
        payload = json.dumps({
            "contents": contents,
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {"maxOutputTokens": 350, "temperature": 0.9},
        }).encode()
        url = f"{GEMINI_URL}?key={API_KEY}"
        req = Request(url, data=payload, method="POST")
        req.add_header("Content-Type", "application/json")
        try:
            with urlopen(req) as resp:
                result = json.loads(resp.read())
                text = result["candidates"][0]["content"]["parts"][0]["text"]
                self.send_json({"text": text})
        except HTTPError as e:
            self.send_json({"error": e.read().decode() if hasattr(e, "read") else str(e)}, 500)
        except (URLError, KeyError, IndexError) as e:
            self.send_json({"error": str(e)}, 500)

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
