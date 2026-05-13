// ─── triboro public feed ───
// reads data/site.json, renders feed / people / events / profile / event-detail
// + resident auth (anonymous register, server-issued token) and DM-with-character

const ROOT = document.getElementById("root");
let SITE = null;
let CHARS_BY_ID = {};
let RESIDENT = null;  // { id, display_name, avatar, token, rate_remaining, rate_limit }

const TOKEN_KEY = "triboro_token";
const EPOCH_KEY = "triboro_epoch_at";
const VIEWER_ID_KEY = "triboro_viewer_id";

let _revealTimer = null;

// Chat endpoints live on a separate Cloudflare Worker in production. Local dev
// (python3 server.py) leaves TRIBORO_BACKEND undefined, so we fall back to
// same-origin and hit server.py directly. On GH Pages, index.html sets
// window.TRIBORO_BACKEND to the workers.dev URL.
const BACKEND = (typeof window !== "undefined" && window.TRIBORO_BACKEND) || "";

// ─── per-viewer time anchor + shuffle ──────────────────────────────────
// Each viewer's "Day 1 of Triboro" is the moment they first opened the page
// (or, if they registered, the moment their resident profile was created).
// Posts and events have a triboro_offset (seconds from a viewer's epoch);
// they only render once (now - epoch) >= offset. A separate viewer_id seeds
// a deterministic shuffle so two viewers with the same epoch still see the
// feed in different orders.

function nowSec() { return Math.floor(Date.now() / 1000); }

function viewerEpoch() {
  if (RESIDENT && RESIDENT.created) return RESIDENT.created;
  let v = parseInt(localStorage.getItem(EPOCH_KEY) || "0", 10);
  if (!v) {
    v = nowSec();
    localStorage.setItem(EPOCH_KEY, String(v));
  }
  return v;
}

function viewerId() {
  if (RESIDENT && RESIDENT.id) return RESIDENT.id;
  let v = localStorage.getItem(VIEWER_ID_KEY);
  if (!v) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    v = "anon_" + [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(VIEWER_ID_KEY, v);
  }
  return v;
}

function personalTime() { return nowSec() - viewerEpoch(); }

function isVisibleNow(item) {
  if (item && item.pinned) return true;  // pinned bypasses the time gate
  return personalTime() >= (item.triboro_offset || 0);
}

function hashSeed(s) {
  // FNV-1a 32-bit; good enough for shuffling.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleByViewer(items) {
  const vid = viewerId();
  return [...items]
    .map(it => ({ it, k: hashSeed(vid + ":" + (it.id || "")) }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.it);
}

// Newest-revealed first, with the per-viewer shuffle as a deterministic
// tiebreaker. Posts in the same generation batch typically share a
// triboro_offset (or are within seconds of each other after jitter), so the
// shuffle still gives two viewers different orders within a cluster.
function sortNewestFirst(items) {
  const vid = viewerId();
  return [...items].sort((a, b) => {
    const offA = a.triboro_offset || 0;
    const offB = b.triboro_offset || 0;
    if (offA !== offB) return offB - offA;
    const createdA = a.created || 0;
    const createdB = b.created || 0;
    if (createdA !== createdB) return createdB - createdA;
    return hashSeed(vid + ":" + (a.id || "")) - hashSeed(vid + ":" + (b.id || ""));
  });
}

function scheduleNextReveal() {
  if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
  if (!SITE) return;
  const pt = personalTime();
  const candidates = [];
  for (const p of SITE.posts || []) {
    if (p.pinned) continue;
    const off = p.triboro_offset || 0;
    if (off > pt) candidates.push(off);
  }
  for (const e of SITE.events || []) {
    const off = e.triboro_offset || 0;
    if (off > pt) candidates.push(off);
  }
  if (!candidates.length) return;
  candidates.sort((a, b) => a - b);
  const waitSec = Math.min(candidates[0] - pt, 6 * 3600);  // cap at 6h to survive clock skew
  _revealTimer = setTimeout(() => renderIfSafe(), Math.max(1000, waitSec * 1000));
}

// Poll site.json so newly-authored posts (and characters/events) show up while
// the page is open. Skips when a chat panel is mounted so we don't clobber a
// live conversation. Localhost polls fast (you're authoring in real-time);
// production polls every minute (GH Pages rebuild + CDN propagation cap it
// anyway).
const SITE_POLL_INTERVAL_MS =
  (typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
    ? 15_000
    : 60_000;
let _lastGenerated = null;

function renderIfSafe() {
  if (document.querySelector("#chat-panel")) return;
  render();
}

async function pollSite() {
  if (document.querySelector("#chat-panel")) return;
  try {
    await loadSite();
    if (SITE.generated !== _lastGenerated) {
      _lastGenerated = SITE.generated;
      render();
    }
  } catch {
    // network blip — try again next tick
  }
}

const AVATAR_CHOICES = ["👤","🐸","🦝","🦊","🦉","🐝","🐍","🦴","🪞","🕯️","📻","🧷","🧣","🧶"];

async function loadSite() {
  const r = await fetch("data/site.json?t=" + Date.now());
  if (!r.ok) throw new Error("site.json not found");
  SITE = await r.json();
  CHARS_BY_ID = Object.fromEntries(SITE.characters.map(c => [c.id, c]));
}

// ─── auth ───

function authHeaders() {
  const t = localStorage.getItem(TOKEN_KEY);
  return t ? { "Authorization": "Bearer " + t } : {};
}

function consumeRecoveryParam() {
  const url = new URL(location.href);
  const recover = url.searchParams.get("r");
  if (recover) {
    localStorage.setItem(TOKEN_KEY, recover);
    url.searchParams.delete("r");
    history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
}

async function loadResident() {
  if (!localStorage.getItem(TOKEN_KEY)) {
    RESIDENT = null;
    return;
  }
  try {
    const r = await fetch(BACKEND + "/api/me", { headers: authHeaders() });
    if (!r.ok) {
      localStorage.removeItem(TOKEN_KEY);
      RESIDENT = null;
      return;
    }
    const me = await r.json();
    RESIDENT = { ...me, token: localStorage.getItem(TOKEN_KEY) };
  } catch {
    RESIDENT = null;
  }
}

function recoveryUrl() {
  if (!RESIDENT) return "";
  const u = new URL(location.href);
  u.search = "?r=" + encodeURIComponent(RESIDENT.token);
  u.hash = "";
  return u.toString();
}

async function registerResident(name, avatar) {
  const r = await fetch(BACKEND + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: name, avatar }),
  });
  if (!r.ok) throw new Error((await r.json()).error || "register failed");
  const data = await r.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  RESIDENT = data;
  updateAuthChip();
  return data;
}

function signOut() {
  localStorage.removeItem(TOKEN_KEY);
  RESIDENT = null;
  updateAuthChip();
  render();
}

// ─── routing ───

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h) return { name: "feed" };
  const parts = h.split("/");
  if (parts[0] === "people") return { name: "people" };
  if (parts[0] === "events") return { name: "events" };
  if (parts[0] === "about") return { name: "about" };
  if (parts[0] === "c" && parts[1]) return { name: "character", id: parts[1] };
  if (parts[0] === "e" && parts[1]) return { name: "event", id: parts[1] };
  return { name: "feed" };
}

function highlightNav() {
  const r = parseRoute();
  document.querySelectorAll(".subnav a[data-route]").forEach(a => {
    const route = a.dataset.route;
    a.classList.toggle("active",
      (r.name === "feed" && route === "feed") ||
      (r.name === "people" && route === "people") ||
      (r.name === "events" && route === "events") ||
      (r.name === "about" && route === "about") ||
      (r.name === "character" && route === "people") ||
      (r.name === "event" && route === "events")
    );
  });
}

function render() {
  highlightNav();
  const r = parseRoute();
  if (!SITE) return;
  if (r.name === "feed") renderFeed();
  else if (r.name === "people") renderPeople();
  else if (r.name === "events") renderEvents();
  else if (r.name === "about") renderAbout();
  else if (r.name === "character") renderCharacter(r.id);
  else if (r.name === "event") renderEvent(r.id);
  commitSeenIds();
  scheduleNextReveal();
}

window.addEventListener("hashchange", render);

// ─── views ───

function renderFeed() {
  const visiblePosts = SITE.posts.filter(isVisibleNow);
  const visibleEventIds = new Set(SITE.events.filter(isVisibleNow).map(e => e.id));

  const pinned = visiblePosts.filter(p => p.pinned);
  const unpinned = sortNewestFirst(visiblePosts.filter(p => !p.pinned));

  const byEvent = {};
  for (const p of unpinned) {
    const eid = (p.event_id && visibleEventIds.has(p.event_id)) ? p.event_id : "_misc";
    (byEvent[eid] ??= []).push(p);
  }

  const eventOrder = SITE.events
    .filter(e => isVisibleNow(e) && byEvent[e.id])
    .sort((a, b) => (b.triboro_offset || 0) - (a.triboro_offset || 0) || b.created - a.created);

  let html = "";

  if (pinned.length) {
    html += `<div class="section-label">Pinned to the bulletin</div>`;
    for (const p of pinned) html += postHtml(p, { pinned: true });
  }

  if (eventOrder.length) {
    html += `<div class="section-label">Recent goings-on</div>`;
    for (const e of eventOrder) {
      html += eventBlockHtml(e, byEvent[e.id]);
    }
  }

  if (byEvent._misc) {
    html += `<div class="section-label">Loose chatter</div>`;
    for (const p of byEvent._misc) html += postHtml(p);
  }

  if (!pinned.length && !eventOrder.length && !byEvent._misc) {
    html = `<div class="empty">The bulletin is quiet today. Check back in a bit.</div>`;
  }

  ROOT.innerHTML = html;
}

function renderPeople() {
  const cards = SITE.characters.map(c => `
    <div class="person-card" onclick="location.hash='#/c/${c.id}'">
      <div class="avatar">${c.avatar || "👤"}</div>
      <div class="name">${esc(c.name || c.id)}</div>
      <div class="handle">${esc(c.handle || "")}</div>
      <div class="meta">${c.floor ? `Floor ${esc(c.floor)}` : ""}${c.faction && c.faction !== "none" ? ` · ${esc(c.faction)}` : ""}</div>
    </div>
  `).join("");
  ROOT.innerHTML = `
    <div class="section-label">Residents on Almanapp</div>
    <div class="people-grid">${cards}</div>`;
}

function renderEvents() {
  const visible = SITE.events
    .filter(isVisibleNow)
    .sort((a, b) => (b.triboro_offset || 0) - (a.triboro_offset || 0) || b.created - a.created);
  const items = visible.map(e => `
    <div class="event">
      <h2 class="event-headline"><a href="#/e/${e.id}">${esc(e.title)}</a></h2>
      ${e.description ? `<p class="event-dek">${esc(e.description)}</p>` : ""}
      <div class="event-meta">${formatDate(e.created)} · ${countPostsForEvent(e.id)} posts</div>
    </div>`).join("");
  ROOT.innerHTML = `
    <div class="section-label">Bulletin index</div>
    ${items || `<div class="empty">No events yet.</div>`}`;
}

function renderCharacter(id) {
  const c = CHARS_BY_ID[id];
  if (!c) { ROOT.innerHTML = `<div class="empty">No such resident.</div>`; return; }
  const posts = sortNewestFirst(SITE.posts.filter(p => p.character_id === id && isVisibleNow(p)));
  ROOT.innerHTML = `
    <a href="#/people" class="back-link">← All residents</a>
    <div class="profile-head">
      <div class="profile-avatar">${c.avatar || "👤"}</div>
      <div class="profile-name">${esc(c.name)}</div>
      <div class="profile-meta">${esc(c.handle || "")}${c.floor ? ` · Floor ${esc(c.floor)}` : ""}${c.faction && c.faction !== "none" ? ` · ${esc(c.faction)}` : ""}</div>
      <button class="message-btn" id="open-chat">Message ${esc(c.name)}</button>
    </div>
    <div id="chat-mount"></div>
    <div class="section-label">Posts by ${esc(c.name)}</div>
    ${posts.length
      ? posts.map(p => postHtml(p, { hideName: false })).join("")
      : `<div class="empty">${esc(c.name)} hasn't posted yet.</div>`}`;
  document.getElementById("open-chat").addEventListener("click", () => openChatFor(id));
}

function renderEvent(id) {
  const e = SITE.events.find(x => x.id === id);
  if (!e || !isVisibleNow(e)) { ROOT.innerHTML = `<div class="empty">No such event.</div>`; return; }
  const posts = sortNewestFirst(SITE.posts.filter(p => p.event_id === id && isVisibleNow(p)));
  ROOT.innerHTML = `
    <a href="#/events" class="back-link">← All events</a>
    <div class="event">
      <h2 class="event-headline">${esc(e.title)}</h2>
      ${e.description ? `<p class="event-dek">${esc(e.description)}</p>` : ""}
      <div class="event-meta">${formatDate(e.created)} · ${posts.length} reactions</div>
      ${posts.length
        ? posts.map(p => postHtml(p)).join("")
        : `<div class="empty">No reactions yet.</div>`}
    </div>`;
}

function renderAbout() {
  ROOT.innerHTML = `
    <div class="about-prose">
      <h2>About this place</h2>
      <p>Triboro is a 60+ floor apartment complex sealed off from the outside world for 73 years by toxic smog called <em>The Aurora</em>. About 6,000 people live inside. Society has evolved its own politics, economy, culture, and customs.</p>
      <p>Almanapp is the in-house social network. Residents post here. So does the building itself, in a way.</p>
      <p class="muted">A living fictional world by Bill O'Toole.</p>
    </div>`;
}

// ─── pieces ───

function eventBlockHtml(e, posts) {
  const list = posts.map(p => postHtml(p)).join("");
  let cls = "event";
  if (!_seenIds.has(e.id)) cls += " event-arriving";
  return `
    <div class="${cls}" data-event-id="${esc(e.id)}">
      <h2 class="event-headline"><a href="#/e/${e.id}">${esc(e.title)}</a></h2>
      ${e.description ? `<p class="event-dek">${esc(e.description)}</p>` : ""}
      <div class="event-meta">${formatDate(e.created)} · ${posts.length} reactions</div>
      ${list}
    </div>`;
}

// Tracks IDs visible on the previous render so we can mark new arrivals with
// an "arriving" class and animate them in via CSS.
const _seenIds = new Set();

function postHtml(p, opts = {}) {
  const c = CHARS_BY_ID[p.character_id] || {};
  let cls = opts.pinned ? "post pinned" : "post";
  if (!_seenIds.has(p.id)) cls += " post-arriving";
  return `
    <article class="${cls}" data-post-id="${esc(p.id)}">
      <div class="post-head">
        <span class="post-name"><a href="#/c/${p.character_id}">${esc(c.name || p.character_id)}</a></span>
        <span class="post-handle">${esc(c.handle || "")}</span>
        ${opts.pinned ? `<span class="pin-badge">pinned</span>` : ""}
        ${c.floor ? `<span class="post-floor">Floor ${esc(c.floor)}</span>` : ""}
      </div>
      <p class="post-text">${esc(p.text)}</p>
    </article>`;
}

function commitSeenIds() {
  if (!SITE) return;
  for (const p of SITE.posts || []) {
    if (isVisibleNow(p)) _seenIds.add(p.id);
  }
  for (const e of SITE.events || []) {
    if (isVisibleNow(e)) _seenIds.add(e.id);
  }
}

// ─── chat ───

async function openChatFor(charId) {
  if (!RESIDENT) {
    const ok = await openRegisterModal();
    if (!ok) return;
  }
  const mount = document.getElementById("chat-mount");
  if (!mount) return;
  const c = CHARS_BY_ID[charId];
  mount.innerHTML = `
    <div class="chat-panel" id="chat-panel">
      <div class="chat-head">
        <div class="chat-head-l">
          <span class="chat-avatar">${c.avatar || "👤"}</span>
          <div>
            <div class="chat-with">${esc(c.name)}</div>
            <div class="chat-subtle">private DM · ${RESIDENT.rate_remaining} of ${RESIDENT.rate_limit} messages left today</div>
          </div>
        </div>
        <button class="chat-close" id="chat-close" title="Close">×</button>
      </div>
      <div class="chat-body" id="chat-body">
        <div class="chat-loading">Loading conversation…</div>
      </div>
      <form class="chat-form" id="chat-form">
        <input class="chat-input" id="chat-input" type="text" maxlength="500"
               placeholder="Message ${esc(c.name)}…" autocomplete="off" />
        <button class="chat-send" type="submit">Send</button>
      </form>
    </div>`;
  document.getElementById("chat-close").onclick = () => { mount.innerHTML = ""; };
  document.getElementById("chat-form").onsubmit = (e) => {
    e.preventDefault();
    sendChatMessage(charId);
  };
  document.getElementById("chat-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("chat-input").focus();

  // load history
  try {
    const r = await fetch(BACKEND + "/api/chat/" + encodeURIComponent(charId), { headers: authHeaders() });
    const data = await r.json();
    renderChatHistory(data.history || []);
  } catch {
    renderChatHistory([]);
  }
}

function renderChatHistory(history) {
  const body = document.getElementById("chat-body");
  if (!body) return;
  if (!history.length) {
    body.innerHTML = `<div class="chat-empty">No messages yet. Say something.</div>`;
    return;
  }
  body.innerHTML = history.map(m => chatBubbleHtml(m)).join("");
  body.scrollTop = body.scrollHeight;
}

function chatBubbleHtml(m) {
  const cls = m.role === "user" ? "you" : "them";
  return `<div class="chat-msg ${cls}"><p>${esc(m.text)}</p></div>`;
}

async function sendChatMessage(charId) {
  const input = document.getElementById("chat-input");
  const body = document.getElementById("chat-body");
  if (!input || !body) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.disabled = true;

  // optimistic append
  if (body.querySelector(".chat-empty")) body.innerHTML = "";
  body.insertAdjacentHTML("beforeend", chatBubbleHtml({ role: "user", text }));
  body.insertAdjacentHTML("beforeend", `<div class="chat-msg them pending"><p>…</p></div>`);
  body.scrollTop = body.scrollHeight;

  try {
    const r = await fetch(BACKEND + "/api/chat", {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ character_id: charId, message: text }),
    });
    const data = await r.json();
    body.querySelector(".chat-msg.them.pending")?.remove();
    if (!r.ok) {
      body.insertAdjacentHTML("beforeend",
        `<div class="chat-msg system"><p>${esc(data.error || "Something went wrong.")}</p></div>`);
    } else {
      body.insertAdjacentHTML("beforeend", chatBubbleHtml({ role: "char", text: data.reply }));
      if (typeof data.rate_remaining === "number") {
        RESIDENT.rate_remaining = data.rate_remaining;
        const sub = document.querySelector(".chat-subtle");
        if (sub) sub.textContent = `private DM · ${RESIDENT.rate_remaining} of ${RESIDENT.rate_limit} messages left today`;
      }
    }
  } catch (e) {
    body.querySelector(".chat-msg.them.pending")?.remove();
    body.insertAdjacentHTML("beforeend",
      `<div class="chat-msg system"><p>Network error.</p></div>`);
  } finally {
    body.scrollTop = body.scrollHeight;
    input.disabled = false;
    input.focus();
  }
}

// ─── modals ───

function openRegisterModal() {
  return new Promise(resolve => {
    let chosenAvatar = "👤";
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `
      <div class="modal-card">
        <div class="modal-eyebrow">Almanapp · resident registration</div>
        <h3>Sign in to message residents</h3>
        <p class="modal-lede">Reading the bulletin is open to all of Triboro. To DM a resident, the network needs a name to attach to your messages.</p>
        <label class="modal-label">Your display name
          <input type="text" id="reg-name" maxlength="40" autocomplete="off" placeholder="e.g. Hank from 38" />
        </label>
        <label class="modal-label">Pick an avatar
          <div class="avatar-row" id="avatar-row">
            ${AVATAR_CHOICES.map((e, i) => `<button type="button" class="avatar-choice${i===0?" sel":""}" data-e="${e}">${e}</button>`).join("")}
          </div>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" id="reg-cancel">Not now</button>
          <button type="button" class="btn-primary" id="reg-go">Register</button>
        </div>
        <p class="modal-fineprint">No password. No email. Your "keycard" lives in this browser — bookmark it from the chip in the corner if you want to come back on another device.</p>
      </div>`;
    document.body.appendChild(wrap);
    const close = (val) => { wrap.remove(); resolve(val); };
    wrap.addEventListener("click", e => { if (e.target === wrap) close(false); });
    wrap.querySelector("#reg-cancel").onclick = () => close(false);
    wrap.querySelectorAll(".avatar-choice").forEach(b => {
      b.onclick = () => {
        wrap.querySelectorAll(".avatar-choice").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel");
        chosenAvatar = b.dataset.e;
      };
    });
    const nameInput = wrap.querySelector("#reg-name");
    nameInput.focus();
    nameInput.addEventListener("keydown", e => {
      if (e.key === "Enter") wrap.querySelector("#reg-go").click();
    });
    wrap.querySelector("#reg-go").onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      try {
        await registerResident(name, chosenAvatar);
        close(true);
      } catch (e) {
        alert("Couldn't register: " + e.message);
      }
    };
  });
}

function openKeycardModal() {
  if (!RESIDENT) { openRegisterModal(); return; }
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  const url = recoveryUrl();
  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-eyebrow">Almanapp · resident keycard</div>
      <h3>${esc(RESIDENT.avatar)} ${esc(RESIDENT.display_name)}</h3>
      <p class="modal-lede">This URL is your keycard. Open it on any browser to sign back in as you. Anyone with the link can use your account, so keep it private.</p>
      <div class="keycard-url">
        <input type="text" id="kc-url" readonly value="${esc(url)}" />
        <button class="btn-primary" id="kc-copy">Copy</button>
      </div>
      <p class="modal-fineprint">Messages today: ${RESIDENT.rate_limit - RESIDENT.rate_remaining} / ${RESIDENT.rate_limit}</p>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" id="kc-signout">Sign out of this browser</button>
        <button type="button" class="btn-primary" id="kc-close">Done</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
  wrap.querySelector("#kc-close").onclick = close;
  wrap.querySelector("#kc-copy").onclick = async () => {
    const inp = wrap.querySelector("#kc-url");
    inp.select();
    try {
      await navigator.clipboard.writeText(inp.value);
      wrap.querySelector("#kc-copy").textContent = "Copied";
    } catch {
      document.execCommand("copy");
    }
  };
  wrap.querySelector("#kc-signout").onclick = () => { close(); signOut(); };
}

// ─── auth chip in subnav ───

function updateAuthChip() {
  const chip = document.getElementById("auth-chip");
  if (!chip) return;
  if (RESIDENT) {
    chip.innerHTML = `<span class="chip-avatar">${esc(RESIDENT.avatar)}</span><span class="chip-name">${esc(RESIDENT.display_name)}</span>`;
    chip.title = "Your resident keycard";
    chip.onclick = openKeycardModal;
  } else {
    chip.innerHTML = `<span class="chip-name">Sign in</span>`;
    chip.title = "Register a resident profile to DM characters";
    chip.onclick = openRegisterModal;
  }
}

// ─── util ───

function countPostsForEvent(eid) {
  return SITE.posts.filter(p => p.event_id === eid && isVisibleNow(p)).length;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function setMastDate() {
  const d = new Date();
  const datestr = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  document.getElementById("mast-date").textContent = `VOL. LXXIII · ${datestr}`;
}

// Hit counter — looks like a 90s odometer but is actually deterministic per
// viewer (epoch-derived seed) plus a localStorage tally for return visits.
// The number drifts upward across sessions to feel alive without needing a
// real backend.
function setHitCounter() {
  const el = document.getElementById("hit-counter");
  if (!el) return;
  const HIT_KEY = "triboro_hit_count";
  const FOUNDING = 0x2bdfac0;  // arbitrary base so the counter reads "0274..."
  let stored = parseInt(localStorage.getItem(HIT_KEY) || "0", 10);
  if (!stored) {
    // Seed with something believable: hash of the viewer id mod 80,000
    const seed = (hashSeed(viewerId()) % 80000) + 200000;
    stored = seed;
  }
  stored += 1;
  localStorage.setItem(HIT_KEY, String(stored));
  const total = FOUNDING + stored;
  el.textContent = String(total).padStart(7, "0");
}

function setLastUpdated() {
  const el = document.getElementById("last-updated");
  if (!el) return;
  const s = Math.max(0, personalTime());
  const days = Math.floor(s / 86400);
  el.textContent = `Triboro Day ${days + 1}`;
}

// "TRIBORO DAY 2 · 03:14" — your personal time anchor, updated every 30s.
function setMastDay() {
  const el = document.getElementById("mast-day");
  if (!el) return;
  const s = Math.max(0, personalTime());
  const days = Math.floor(s / 86400);
  const rem = s - days * 86400;
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem - h * 3600) / 60);
  el.textContent = `TRIBORO DAY ${days + 1} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function resetView(ev) {
  if (ev) ev.preventDefault();
  const note = RESIDENT
    ? "Restart Triboro from Day 1? This signs you out (your resident profile and DM history stay on the server — your recovery URL still works) and gives you a fresh anonymous timeline."
    : "Restart Triboro from Day 1? Your personal timeline resets so you'll re-experience posts as they drip in.";
  if (!confirm(note)) return;
  localStorage.removeItem(EPOCH_KEY);
  localStorage.removeItem(TOKEN_KEY);  // for registered viewers, clear so epoch falls back to a fresh anon
  // Keep viewer_id so the per-viewer shuffle stays stable across resets.
  location.reload();
}

// ─── boot ───

(async () => {
  setMastDate();
  consumeRecoveryParam();
  await loadResident();
  updateAuthChip();
  setMastDay();
  setInterval(setMastDay, 30_000);
  setHitCounter();
  setLastUpdated();
  setInterval(setLastUpdated, 60_000);
  document.getElementById("reset-view")?.addEventListener("click", resetView);
  document.getElementById("webring-random")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!SITE || !SITE.characters || !SITE.characters.length) return;
    const c = SITE.characters[Math.floor(Math.random() * SITE.characters.length)];
    location.hash = "#/c/" + c.id;
  });
  try {
    await loadSite();
    _lastGenerated = SITE.generated;
    // Pre-populate seenIds so the very first paint doesn't animate the entire
    // visible feed at once. Animations should signal NEW arrivals — not "the
    // page just loaded." From this point on, anything that crosses into
    // viewer-time gets the slide-in treatment.
    commitSeenIds();
    render();
    setInterval(pollSite, SITE_POLL_INTERVAL_MS);
  } catch (e) {
    ROOT.innerHTML = `<div class="empty">Couldn't load <code>data/site.json</code>. Run the authoring server (<code>python3 server.py</code>) and publish at least one post.</div>`;
    console.error(e);
  }
})();
