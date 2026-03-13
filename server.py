#!/usr/bin/env python3
"""
Triboro Game Server
Serves static files and proxies NPC conversations through the Gemini API (free tier).
"""

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Load key from .api-key file if it exists (not tracked by git)
_key_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".api-key")
if not API_KEY and os.path.exists(_key_file):
    with open(_key_file) as f:
        API_KEY = f.read().strip()
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


class GameHandler(SimpleHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/chat":
            self.handle_chat()
        elif self.path == "/api/set-key":
            self.handle_set_key()
        elif self.path == "/api/check-key":
            self.handle_check_key()
        else:
            self.send_error(404)

    def handle_check_key(self):
        self.send_json({"has_key": bool(API_KEY)})

    def handle_set_key(self):
        global API_KEY
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        API_KEY = body.get("key", "").strip()

        if API_KEY:
            # Quick validation — list models
            test_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
            req = Request(test_url, method="GET")
            try:
                with urlopen(req) as resp:
                    resp.read()
                self.send_json({"ok": True})
            except (URLError, HTTPError) as e:
                API_KEY = ""
                error_msg = ""
                if hasattr(e, "read"):
                    error_msg = e.read().decode()
                else:
                    error_msg = str(e)
                self.send_json({"ok": False, "error": error_msg}, 400)
        else:
            self.send_json({"ok": False, "error": "No key provided"}, 400)

    def handle_chat(self):
        if not API_KEY:
            self.send_json({"error": "No API key configured"}, 401)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))

        system_prompt = body.get("system", "")
        messages = body.get("messages", [])

        # Convert from Anthropic-style messages to Gemini format
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg["content"]}]
            })

        payload = json.dumps({
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "maxOutputTokens": 350,
                "temperature": 0.9,
            }
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
            error_body = e.read().decode() if hasattr(e, "read") else str(e)
            self.send_json({"error": error_body}, 500)
        except (URLError, KeyError, IndexError) as e:
            self.send_json({"error": str(e)}, 500)

    def send_json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        path = args[0] if args else ""
        if "/api/" in str(path):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"\n  TRIBORO Game Server")
    print(f"  http://localhost:{port}\n")
    if API_KEY:
        print(f"  API key: loaded")
    else:
        print(f"  API key: not set — set GEMINI_API_KEY env var or create .api-key file")
    print()
    HTTPServer(("0.0.0.0", port), GameHandler).serve_forever()
