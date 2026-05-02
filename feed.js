// ─── triboro public feed ───
// reads data/site.json, renders feed / people / events / profile / event-detail

const ROOT = document.getElementById("root");
let SITE = null;
let CHARS_BY_ID = {};

async function loadSite() {
  const r = await fetch("data/site.json?t=" + Date.now());
  if (!r.ok) throw new Error("site.json not found");
  SITE = await r.json();
  CHARS_BY_ID = Object.fromEntries(SITE.characters.map(c => [c.id, c]));
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
  document.querySelectorAll(".subnav a").forEach(a => {
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
    </div>
    ${posts.length
      ? posts.map(p => postHtml(p, { hideName: false })).join("")
      : `<div class="empty">${esc(c.name)} hasn't posted yet.</div>`}`;
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
  try {
    await loadSite();
    render();
  } catch (e) {
    ROOT.innerHTML = `<div class="empty">Couldn't load <code>data/site.json</code>. Run the authoring server (<code>python3 server.py</code>) and publish at least one post.</div>`;
    console.error(e);
  }
})();
