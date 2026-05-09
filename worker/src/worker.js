// Triboro chat backend — Cloudflare Worker.
//
// Mirrors the chat-related endpoints in ../server.py:
//   POST /api/register
//   GET  /api/me
//   POST /api/chat
//   GET  /api/chat/<character_id>
//
// World + characters are bundled at build time (see build-data.mjs).
// Residents, chat history, and rate-limit counters live in KV.
// GEMINI_API_KEY is a Worker secret — never returned to clients.

import { WORLD, CHARACTERS } from "./data.js";

const HISTORY_TURNS_TO_SEND = 16;
const MAX_USER_MESSAGE_CHARS = 800;
const MAX_DISPLAY_NAME_CHARS = 40;
const MAX_AVATAR_CHARS = 8;

// ─── helpers ─────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function randomId(byteLen) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLen));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  // 24 random bytes, base64url, no padding — matches secrets.token_urlsafe(24).
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function clientIP(request) {
  return request.headers.get("CF-Connecting-IP") || "0.0.0.0";
}

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null; // same-origin / non-browser; no CORS header needed
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(request, env) {
  const allow = originAllowed(request, env);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (allow) h["Access-Control-Allow-Origin"] = allow;
  return h;
}

function json(data, init = {}, request, env) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...corsHeaders(request, env),
    ...(init.headers || {}),
  };
  return new Response(JSON.stringify(data), { status: init.status || 200, headers });
}

function bearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

// ─── KV-backed rate limiters ─────────────────────────────────────────────

// Sliding-ish window: one bucket per UTC hour for chat, per UTC day for register.
// KV is eventually consistent (~60s), so a determined attacker could squeeze a
// little extra through during the propagation window. Acceptable at our scale.

async function bumpCounter(kv, key, ttlSeconds) {
  const cur = parseInt((await kv.get(key)) || "0", 10) || 0;
  const next = cur + 1;
  await kv.put(key, String(next), { expirationTtl: ttlSeconds });
  return next;
}

async function chatIpAllowed(env, ip) {
  const hour = Math.floor(Date.now() / 3_600_000); // UTC hour bucket
  const key = `ip:chat:${ip}:${hour}`;
  const limit = parseInt(env.CHAT_PER_IP_PER_HOUR || "20", 10);
  const count = await bumpCounter(env.TRIBORO, key, 3700);
  return { ok: count <= limit, count, limit };
}

async function registerIpAllowed(env, ip) {
  const day = todayUTC();
  const key = `ip:register:${ip}:${day}`;
  const limit = parseInt(env.REGISTER_PER_IP_PER_DAY || "5", 10);
  const count = await bumpCounter(env.TRIBORO, key, 86_500);
  return { ok: count <= limit, count, limit };
}

async function globalChatAllowed(env) {
  const day = todayUTC();
  const key = `global:chat:${day}`;
  const limit = parseInt(env.GLOBAL_DAILY_CHAT_LIMIT || "2000", 10);
  const count = await bumpCounter(env.TRIBORO, key, 86_500);
  return { ok: count <= limit, count, limit };
}

// ─── residents ───────────────────────────────────────────────────────────

async function residentByToken(env, token) {
  if (!token) return null;
  const id = await env.TRIBORO.get(`resident:by_token:${token}`);
  if (!id) return null;
  const raw = await env.TRIBORO.get(`resident:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveResident(env, r) {
  await env.TRIBORO.put(`resident:${r.id}`, JSON.stringify(r));
}

function publicResident(r, dailyLimit) {
  const today = todayUTC();
  const used = r.rate_window === today ? r.rate_count || 0 : 0;
  return {
    id: r.id,
    display_name: r.display_name,
    avatar: r.avatar || "👤",
    rate_remaining: Math.max(0, dailyLimit - used),
    rate_limit: dailyLimit,
  };
}

async function consumeResidentLimit(env, r) {
  const today = todayUTC();
  const limit = parseInt(env.DAILY_MESSAGE_LIMIT || "50", 10);
  if (r.rate_window !== today) {
    r.rate_window = today;
    r.rate_count = 0;
  }
  if ((r.rate_count || 0) >= limit) {
    return { ok: false, remaining: 0 };
  }
  r.rate_count = (r.rate_count || 0) + 1;
  await saveResident(env, r);
  return { ok: true, remaining: limit - r.rate_count };
}

// ─── chat history ────────────────────────────────────────────────────────

function chatKey(residentId, characterId) {
  return `chat:${residentId}:${characterId}`;
}

async function getHistory(env, residentId, characterId) {
  const raw = await env.TRIBORO.get(chatKey(residentId, characterId));
  return raw ? JSON.parse(raw) : [];
}

async function appendHistory(env, residentId, characterId, messages) {
  const history = await getHistory(env, residentId, characterId);
  history.push(...messages);
  // Keep history capped so a single chat can't blow up KV value size (25MB max,
  // but small values are cheaper and faster). Last 200 turns is plenty.
  const trimmed = history.slice(-200);
  await env.TRIBORO.put(chatKey(residentId, characterId), JSON.stringify(trimmed));
  return trimmed;
}

// ─── Gemini ──────────────────────────────────────────────────────────────

async function geminiChat(env, system, contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const payload = {
    contents,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { maxOutputTokens: 400, temperature: 0.95 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`gemini ${r.status}: ${body.slice(0, 500)}`);
  }
  const data = await r.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("gemini returned no text");
  return reply.trim();
}

function characterSystemPrompt(character, residentDisplayName) {
  const name = character.meta.name || character.id;
  const handle = character.meta.handle || "";
  return (
    `You are ${name} (${handle}), a resident of TRIBORO on the ` +
    `ALMANAPP private DM. You are messaging another resident named ` +
    `"${residentDisplayName}". Stay fully in character. Reply briefly — ` +
    `usually 1-3 sentences, sometimes a single line. Mundane treated as ` +
    `cosmic, weirdness treated as ordinary. Onion-style. Never break ` +
    `the fourth wall. Never mention being an AI or a model. If asked ` +
    `about the outside world, the cure, or anything you wouldn't know, ` +
    `react in-character (suspicion, dismissal, change of subject).\n\n` +
    `WORLD:\n${WORLD}\n\n` +
    `YOUR CHARACTER:\n${character.body}`
  );
}

// ─── route handlers ──────────────────────────────────────────────────────

async function handleRegister(request, env) {
  const ip = clientIP(request);
  const ipCheck = await registerIpAllowed(env, ip);
  if (!ipCheck.ok) {
    return json(
      { error: "Too many registrations from this address. Try again tomorrow." },
      { status: 429 }, request, env,
    );
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const display_name = String(body.display_name || "").trim().slice(0, MAX_DISPLAY_NAME_CHARS);
  let avatar = String(body.avatar || "👤").trim().slice(0, MAX_AVATAR_CHARS);
  if (!avatar) avatar = "👤";
  if (!display_name) {
    return json({ error: "display_name required" }, { status: 400 }, request, env);
  }

  const limit = parseInt(env.DAILY_MESSAGE_LIMIT || "50", 10);
  const resident = {
    id: "res_" + randomId(8),
    display_name,
    avatar,
    token: newToken(),
    created: nowSec(),
    rate_window: todayUTC(),
    rate_count: 0,
  };
  await env.TRIBORO.put(`resident:${resident.id}`, JSON.stringify(resident));
  await env.TRIBORO.put(`resident:by_token:${resident.token}`, resident.id);

  const out = publicResident(resident, limit);
  out.token = resident.token;
  return json(out, {}, request, env);
}

async function handleMe(request, env) {
  const r = await residentByToken(env, bearerToken(request));
  if (!r) return json({ error: "auth required" }, { status: 401 }, request, env);
  const limit = parseInt(env.DAILY_MESSAGE_LIMIT || "50", 10);
  return json(publicResident(r, limit), {}, request, env);
}

async function handleChatHistory(request, env, characterId) {
  const r = await residentByToken(env, bearerToken(request));
  if (!r) return json({ error: "auth required" }, { status: 401 }, request, env);
  const history = await getHistory(env, r.id, characterId);
  return json({ history }, {}, request, env);
}

async function handleChat(request, env) {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "Server not configured" }, { status: 500 }, request, env);
  }

  const r = await residentByToken(env, bearerToken(request));
  if (!r) return json({ error: "auth required" }, { status: 401 }, request, env);

  const ip = clientIP(request);
  const ipCheck = await chatIpAllowed(env, ip);
  if (!ipCheck.ok) {
    return json(
      { error: "Slow down. Try again later.", retry_after_seconds: 3600 },
      { status: 429 }, request, env,
    );
  }

  const globalCheck = await globalChatAllowed(env);
  if (!globalCheck.ok) {
    return json(
      { error: "Daily traffic ceiling reached. Try again tomorrow." },
      { status: 503 }, request, env,
    );
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const characterId = String(body.character_id || "").trim();
  const text = String(body.message || "").trim().slice(0, MAX_USER_MESSAGE_CHARS);
  if (!characterId || !text) {
    return json({ error: "character_id and message required" }, { status: 400 }, request, env);
  }
  const character = CHARACTERS[characterId];
  if (!character) {
    return json({ error: "no such resident" }, { status: 404 }, request, env);
  }

  const limitCheck = await consumeResidentLimit(env, r);
  if (!limitCheck.ok) {
    return json(
      { error: "Daily message limit reached. Come back tomorrow.", rate_remaining: 0 },
      { status: 429 }, request, env,
    );
  }

  const system = characterSystemPrompt({ id: characterId, ...character }, r.display_name);
  const history = await getHistory(env, r.id, characterId);
  const recent = history.slice(-HISTORY_TURNS_TO_SEND);
  const contents = recent.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));
  contents.push({ role: "user", parts: [{ text }] });

  let reply;
  try {
    reply = await geminiChat(env, system, contents);
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 502 }, request, env);
  }

  const now = nowSec();
  await appendHistory(env, r.id, characterId, [
    { role: "user", text, ts: now },
    { role: "char", text: reply, ts: now + 1 },
  ]);

  return json({ reply, rate_remaining: limitCheck.remaining }, {}, request, env);
}

// ─── dispatch ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/api/register") return handleRegister(request, env);
    if (request.method === "GET" && path === "/api/me") return handleMe(request, env);
    if (request.method === "POST" && path === "/api/chat") return handleChat(request, env);
    if (request.method === "GET" && path.startsWith("/api/chat/")) {
      const cid = decodeURIComponent(path.slice("/api/chat/".length));
      return handleChatHistory(request, env, cid);
    }

    if (path === "/" || path === "") {
      return json(
        { service: "triboro-chat", endpoints: ["/api/register", "/api/me", "/api/chat", "/api/chat/<id>"] },
        {}, request, env,
      );
    }
    return json({ error: "not found" }, { status: 404 }, request, env);
  },
};
