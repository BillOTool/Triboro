const API = "/api/admin";

const state = {
  characters: [],
  events: [],
  posts: [],
  selectedChar: null,
};

// ─── tabs ───
document.querySelectorAll("nav button").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll("nav button").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("tab-" + b.dataset.tab).classList.add("active");
    if (b.dataset.tab === "world") loadWorld();
    if (b.dataset.tab === "posts") renderPosts();
    if (b.dataset.tab === "events") renderEvents();
  };
});

// ─── api helpers ───
async function api(path, opts = {}) {
  opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);
  const r = await fetch(API + path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

// ─── characters ───
async function loadCharacters() {
  const data = await api("/characters");
  state.characters = data.characters;
  renderCharPicker();
  renderCharsList();
}

function renderCharPicker() {
  const el = document.getElementById("char-picker");
  el.innerHTML = "";
  for (const c of state.characters) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" value="${c.id}" checked> ${c.meta.name || c.id}`;
    el.appendChild(label);
  }
}

function getSelectedCharIds() {
  return [...document.querySelectorAll("#char-picker input:checked")].map(x => x.value);
}

function renderCharsList() {
  const el = document.getElementById("chars-list");
  el.innerHTML = "";
  for (const c of state.characters) {
    const li = document.createElement("li");
    li.innerHTML = `<div>${c.meta.name || c.id}</div>
      <div class="meta">${c.meta.handle || ""} · floor ${c.meta.floor || "?"}</div>`;
    li.onclick = () => selectChar(c.id);
    el.appendChild(li);
  }
}

async function selectChar(cid) {
  const c = await api("/character/" + cid);
  state.selectedChar = c;
  document.getElementById("char-editor-title").textContent = c.meta.name || cid;
  document.getElementById("char-editor").value = c.raw;
}

document.getElementById("btn-save-char").onclick = async () => {
  if (!state.selectedChar) return;
  const status = document.getElementById("char-save-status");
  status.textContent = "saving...";
  status.className = "status";
  try {
    await api("/character/" + state.selectedChar.id, {
      method: "PUT",
      body: { raw: document.getElementById("char-editor").value },
    });
    status.textContent = "saved";
    status.className = "status ok";
    await loadCharacters();
  } catch (e) {
    status.textContent = "error: " + e.message;
    status.className = "status err";
  }
};

// ─── events ───
async function loadEvents() {
  const data = await api("/events");
  state.events = data.events;
}

function renderEvents() {
  const el = document.getElementById("events-list");
  el.innerHTML = "";
  for (const e of state.events) {
    const li = document.createElement("li");
    const date = new Date(e.created * 1000).toLocaleString();
    li.innerHTML = `<div><strong>${escapeHtml(e.title)}</strong></div>
      <div class="meta">${date} · id ${e.id}</div>`;
    li.onclick = () => generateForEvent(e.id);
    el.appendChild(li);
  }
}

document.getElementById("btn-add-event").onclick = async () => {
  await addEvent(false);
};
document.getElementById("btn-add-and-generate").onclick = async () => {
  await addEvent(true);
};

async function addEvent(thenGenerate) {
  const title = document.getElementById("event-title").value.trim();
  const description = document.getElementById("event-desc").value.trim();
  const status = document.getElementById("event-status");
  if (!title) { status.textContent = "title required"; status.className = "status err"; return; }
  status.textContent = "saving event..."; status.className = "status";
  try {
    const event = await api("/event", { method: "POST", body: { title, description } });
    document.getElementById("event-title").value = "";
    document.getElementById("event-desc").value = "";
    await loadEvents();
    renderEvents();
    if (thenGenerate) {
      await generateForEvent(event.id);
    } else {
      status.textContent = "saved"; status.className = "status ok";
    }
  } catch (e) {
    status.textContent = "error: " + e.message; status.className = "status err";
  }
}

async function generateForEvent(eventId) {
  const status = document.getElementById("event-status");
  const charIds = getSelectedCharIds();
  if (charIds.length === 0) { status.textContent = "pick at least one character"; status.className = "status err"; return; }
  const n = parseInt(document.getElementById("n-per-char").value, 10) || 1;
  status.textContent = `generating ${charIds.length * n} posts...`; status.className = "status";
  try {
    const r = await api("/generate", {
      method: "POST",
      body: { event_id: eventId, character_ids: charIds, n_per_character: n },
    });
    status.textContent = `generated ${r.posts.length} posts → check Posts tab`; status.className = "status ok";
    await loadPosts();
  } catch (e) {
    status.textContent = "error: " + e.message; status.className = "status err";
  }
}

// ─── posts ───
async function loadPosts() {
  const data = await api("/posts");
  state.posts = data.posts;
}

function renderPosts() {
  const el = document.getElementById("posts-list");
  const onlyUnpub = document.getElementById("filter-unpublished").checked;
  const onlyPinned = document.getElementById("filter-pinned").checked;
  el.innerHTML = "";
  let visible = state.posts;
  if (onlyUnpub) visible = visible.filter(p => !p.published);
  if (onlyPinned) visible = visible.filter(p => p.pinned);
  for (const p of visible) {
    const c = state.characters.find(x => x.id === p.character_id);
    const handle = c ? (c.meta.handle || c.meta.name) : p.character_id;
    const li = document.createElement("li");
    if (p.pinned) li.classList.add("pinned");
    if (!p.published) li.classList.add("unpublished");
    li.innerHTML = `
      <div class="post-head">
        <span class="post-handle">${escapeHtml(handle)}</span>
        <span>
          ${p.pinned ? '<span class="pinned-tag">📌 PINNED</span>' : ""}
          ${p.published ? '<span class="published-tag">● published</span>' : ""}
        </span>
      </div>
      <div class="post-text" data-id="${p.id}">${escapeHtml(p.text)}</div>
      <div class="post-actions">
        <button data-act="edit" data-id="${p.id}">edit</button>
        <button data-act="pin" data-id="${p.id}">${p.pinned ? "unpin" : "pin"}</button>
        <button data-act="publish" data-id="${p.id}">${p.published ? "unpublish" : "publish"}</button>
        <button data-act="delete" data-id="${p.id}" class="danger">delete</button>
      </div>`;
    el.appendChild(li);
  }
  el.onclick = handlePostAction;
}

async function handlePostAction(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  if (act === "delete") {
    if (!confirm("delete this post?")) return;
    await api("/post/" + id, { method: "DELETE" });
  } else if (act === "pin") {
    await api("/post/" + id, { method: "PUT", body: { pinned: !post.pinned } });
  } else if (act === "publish") {
    await api("/post/" + id, { method: "PUT", body: { published: !post.published } });
  } else if (act === "edit") {
    const div = document.querySelector(`.post-text[data-id="${id}"]`);
    div.contentEditable = "true";
    div.focus();
    div.onblur = async () => {
      div.contentEditable = "false";
      const text = div.innerText.trim();
      if (text !== post.text) {
        await api("/post/" + id, { method: "PUT", body: { text } });
        await loadPosts(); renderPosts();
      }
    };
    return;
  }
  await loadPosts(); renderPosts();
}

document.getElementById("filter-unpublished").onchange = renderPosts;
document.getElementById("filter-pinned").onchange = renderPosts;

document.getElementById("btn-publish-all").onclick = async () => {
  const onlyUnpub = document.getElementById("filter-unpublished").checked;
  const onlyPinned = document.getElementById("filter-pinned").checked;
  let visible = state.posts;
  if (onlyUnpub) visible = visible.filter(p => !p.published);
  if (onlyPinned) visible = visible.filter(p => p.pinned);
  for (const p of visible) {
    if (!p.published) await api("/post/" + p.id, { method: "PUT", body: { published: true } });
  }
  await loadPosts(); renderPosts();
};

// ─── world ───
async function loadWorld() {
  const data = await api("/world");
  document.getElementById("world-text").textContent = data.text;
}

// ─── util ───
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ─── boot ───
(async () => {
  await loadCharacters();
  await loadEvents();
  await loadPosts();
  renderEvents();
})();
