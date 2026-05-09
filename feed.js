// ─── triboro public feed ───
// reads data/site.json, renders feed / people / events / profile / event-detail
// + resident auth (anonymous register, server-issued token) and DM-with-character

const ROOT = document.getElementById("root");
let SITE = null;
let CHARS_BY_ID = {};
let RESIDENT = null;  // { id, display_name, avatar, token, rate_remaining, rate_limit }

const TOKEN_KEY = "triboro_token";

// Chat endpoints live on a separate Cloudflare Worker in production. Local dev
// (python3 server.py) leaves TRIBORO_BACKEND undefined, so we fall back to
// same-origin and hit server.py directly. On GH Pages, index.html sets
// window.TRIBORO_BACKEND to the workers.dev URL.
const BACKEND = (typeof window !== "undefined" && window.TRIBORO_BACKEND) || "";

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
  if (r.name === "feed") return renderFeed();
  if (r.name === "people") return renderPeople();
  if (r.name === "events") return renderEvents();
  if (r.name === "about") return renderAbout();
  if (r.name === "character") return renderCharacter(r.id);
  if (r.name === "event") return renderEvent(r.id);
}

window.addEventListener("hashchange", render);

// ─── views ───

function renderFeed() {
  const pinned = SITE.posts.filter(p => p.pinned);
  const byEvent = {};
  for (const p of SITE.posts) {
    if (p.pinned) continue;
    const eid = p.event_id || "_misc";
    (byEvent[eid] ??= []).push(p);
  }
  const eventOrder = SITE.events
    .filter(e => byEvent[e.id])
    .sort((a, b) => b.created - a.created);

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
    html = `<div class="empty">The bulletin is quiet today.</div>`;
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
  const items = SITE.events.map(e => `
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
  const posts = SITE.posts.filter(p => p.character_id === id);
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
  if (!e) { ROOT.innerHTML = `<div class="empty">No such event.</div>`; return; }
  const posts = SITE.posts.filter(p => p.event_id === id);
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
  return `
    <div class="event">
      <h2 class="event-headline"><a href="#/e/${e.id}">${esc(e.title)}</a></h2>
      ${e.description ? `<p class="event-dek">${esc(e.description)}</p>` : ""}
      <div class="event-meta">${formatDate(e.created)} · ${posts.length} reactions</div>
      ${list}
    </div>`;
}

function postHtml(p, opts = {}) {
  const c = CHARS_BY_ID[p.character_id] || {};
  const cls = opts.pinned ? "post pinned" : "post";
  return `
    <article class="${cls}">
      <div class="post-head">
        <span class="post-name"><a href="#/c/${p.character_id}">${esc(c.name || p.character_id)}</a></span>
        <span class="post-handle">${esc(c.handle || "")}</span>
        ${opts.pinned ? `<span class="pin-badge">pinned</span>` : ""}
        ${c.floor ? `<span class="post-floor">Floor ${esc(c.floor)}</span>` : ""}
      </div>
      <p class="post-text">${esc(p.text)}</p>
    </article>`;
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
  return SITE.posts.filter(p => p.event_id === eid).length;
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

// ─── boot ───

(async () => {
  setMastDate();
  consumeRecoveryParam();
  await loadResident();
  updateAuthChip();
  try {
    await loadSite();
    render();
  } catch (e) {
    ROOT.innerHTML = `<div class="empty">Couldn't load <code>data/site.json</code>. Run the authoring server (<code>python3 server.py</code>) and publish at least one post.</div>`;
    console.error(e);
  }
})();
