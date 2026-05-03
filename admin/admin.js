const API = "/api/admin";

const state = {
  characters: [],
  events: [],
  posts: [],
  selectedChar: null,
  isNewChar: false,
};

const NEW_CHAR_TEMPLATE = `---
name: First Last
handle: '@FirstLast'
floor: 0
avatar: 👤
faction: none
tags: []
---

# First Last

(One-paragraph sketch: age, where they live in Triboro, what they do, what they're known for.)

## Voice

(How they talk. Tics. Length of posts. Slang. Tone.)

## Obsessions

- (a thing)
- (another thing)
- (a third thing)

## Will not talk about

- (something they dodge)

## Recent history

- (something happening to them right now)
`;

// ─── tabs ───
document.querySelectorAll("nav button").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll("nav button").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("tab-" + b.dataset.tab).classList.add("active");
    if (b.dataset.tab === "world") loadWorld();
    if (b.dataset.tab === "posts") { renderPosts(); refreshNewPostPickers(); }
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
  state.isNewChar = false;
  document.getElementById("char-editor-title").textContent = c.meta.name || cid;
  document.getElementById("char-editor").value = c.raw;
  document.getElementById("char-id-row").style.display = "none";
}

document.getElementById("btn-new-char").onclick = () => {
  state.selectedChar = null;
  state.isNewChar = true;
  document.getElementById("char-editor-title").textContent = "New character";
  document.getElementById("char-editor").value = NEW_CHAR_TEMPLATE;
  document.getElementById("char-id-row").style.display = "";
  document.getElementById("char-id-input").value = "";
  document.getElementById("char-id-input").focus();
  document.getElementById("char-save-status").textContent = "";
};

document.getElementById("btn-save-char").onclick = async () => {
  const status = document.getElementById("char-save-status");
  const raw = document.getElementById("char-editor").value;
  status.className = "status";
  if (state.isNewChar) {
    const id = document.getElementById("char-id-input").value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_]{1,40}$/.test(id)) {
      status.textContent = "id must be lowercase letters/numbers/underscores"; status.className = "status err"; return;
    }
    status.textContent = "creating...";
    try {
      await api("/character", { method: "POST", body: { id, raw } });
      status.textContent = "created"; status.className = "status ok";
      state.isNewChar = false;
      document.getElementById("char-id-row").style.display = "none";
      await loadCharacters();
      await selectChar(id);
    } catch (e) {
      status.textContent = "error: " + e.message; status.className = "status err";
    }
    return;
  }
  if (!state.selectedChar) return;
  status.textContent = "saving...";
  try {
    await api("/character/" + state.selectedChar.id, {
      method: "PUT",
      body: { raw },
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
      <div class="meta">${date} · id ${e.id}</div>
      <div class="post-actions">
        <button type="button" data-act="regen" data-id="${e.id}">Generate reactions</button>
        <button type="button" data-act="delete-event" data-id="${e.id}" class="danger">Delete</button>
      </div>`;
    el.appendChild(li);
  }
  el.onclick = handleEventAction;
}

async function handleEventAction(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.act === "regen") {
    const charIds = getSelectedCharIds();
    if (charIds.length === 0) { alert("Pick at least one character (left column) before generating."); return; }
    if (!confirm(`Generate fresh reactions from ${charIds.length} character(s)? This calls the LLM.`)) return;
    await generateForEvent(id);
  } else if (btn.dataset.act === "delete-event") {
    if (!confirm("Delete this event? Posts attached to it stay (they'll show as loose chatter).")) return;
    try {
      await api("/event/" + id, { method: "DELETE" });
      await loadEvents(); renderEvents(); refreshNewPostPickers();
    } catch (e) { alert("Couldn't delete: " + e.message); }
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
  if (!visible.length) {
    const total = state.posts.length;
    const li = document.createElement("li");
    li.className = "empty-filter";
    li.textContent = total === 0
      ? "No posts yet. Write one above, or generate reactions from an event."
      : "No posts match this filter.";
    el.appendChild(li);
    return;
  }
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
    if (div.classList.contains("editing")) return; // already editing
    div.contentEditable = "true";
    div.classList.add("editing");
    div.focus();
    // place cursor at end
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(div);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);

    const hint = document.createElement("div");
    hint.className = "edit-hint";
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    hint.textContent = `${isMac ? "⌘" : "Ctrl"}+Enter to save · Esc to cancel · click away saves too`;
    div.parentNode.insertBefore(hint, div.nextSibling);

    let committed = false;
    const cleanup = () => {
      div.contentEditable = "false";
      div.classList.remove("editing");
      div.onkeydown = null;
      div.onblur = null;
      hint.remove();
    };
    const save = async () => {
      if (committed) return;
      committed = true;
      const text = div.innerText.trim();
      cleanup();
      if (text && text !== post.text) {
        await api("/post/" + id, { method: "PUT", body: { text } });
        await loadPosts(); renderPosts();
      } else if (!text) {
        // empty text on save — restore original
        div.innerText = post.text;
      }
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      div.innerText = post.text;
      cleanup();
    };
    div.onkeydown = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };
    div.onblur = save;
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

// ─── new post (manual) ───

function refreshNewPostPickers() {
  const charSel = document.getElementById("new-post-char");
  const evSel = document.getElementById("new-post-event");
  if (!charSel || !evSel) return;
  const prevChar = charSel.value;
  charSel.innerHTML = state.characters.map(c =>
    `<option value="${c.id}">${escapeHtml(c.meta.name || c.id)}${c.meta.handle ? " · " + escapeHtml(c.meta.handle) : ""}</option>`
  ).join("");
  if (prevChar) charSel.value = prevChar;
  const prevEv = evSel.value;
  evSel.innerHTML = `<option value="">— no event (loose chatter) —</option>` +
    state.events.map(e => `<option value="${e.id}">${escapeHtml(truncate(e.title, 60))}</option>`).join("");
  if (prevEv) evSel.value = prevEv;
  const status = document.getElementById("new-post-status");
  if (status) { status.textContent = ""; status.className = "status"; }
}

function truncate(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// quick-create character (inline from Posts tab)

function setQuickCharVisible(v) {
  document.getElementById("quick-char-form").style.display = v ? "" : "none";
  document.getElementById("btn-toggle-quick-char").textContent = v ? "× Cancel new" : "+ New character";
  if (v) {
    document.getElementById("qc-status").textContent = "";
    document.getElementById("qc-id").focus();
  }
}

document.getElementById("btn-toggle-quick-char").onclick = () => {
  const open = document.getElementById("quick-char-form").style.display === "none";
  setQuickCharVisible(open);
};
document.getElementById("btn-qc-cancel").onclick = () => setQuickCharVisible(false);

function slugifyId(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

document.getElementById("qc-name").addEventListener("input", () => {
  const idEl = document.getElementById("qc-id");
  if (!idEl.dataset.touched) {
    idEl.value = slugifyId(document.getElementById("qc-name").value);
  }
});
document.getElementById("qc-id").addEventListener("input", (e) => {
  e.target.dataset.touched = "1";
});

document.getElementById("btn-qc-create").onclick = async () => {
  const status = document.getElementById("qc-status");
  status.className = "status";
  const id = document.getElementById("qc-id").value.trim().toLowerCase();
  const name = document.getElementById("qc-name").value.trim();
  const handle = document.getElementById("qc-handle").value.trim();
  const floor = document.getElementById("qc-floor").value.trim();
  const avatar = document.getElementById("qc-avatar").value.trim() || "👤";
  const sketch = document.getElementById("qc-sketch").value.trim();

  if (!/^[a-z0-9][a-z0-9_]{1,40}$/.test(id)) {
    status.textContent = "id must be lowercase letters/numbers/underscores"; status.className = "status err"; return;
  }
  if (!name) { status.textContent = "name required"; status.className = "status err"; return; }

  const fmHandle = handle || ("@" + name.replace(/\s+/g, ""));
  const raw =
`---
name: ${name}
handle: '${fmHandle}'
floor: ${floor || 0}
avatar: ${avatar}
faction: none
tags: []
---

# ${name}

${sketch || "(One-paragraph sketch.)"}

## Voice

(How they talk.)

## Obsessions

- (a thing)

## Will not talk about

- (something they dodge)

## Recent history

- (something happening to them right now)
`;

  status.textContent = "creating...";
  try {
    await api("/character", { method: "POST", body: { id, raw } });
    await loadCharacters();
    refreshNewPostPickers();
    document.getElementById("new-post-char").value = id;
    // reset quick form
    ["qc-id","qc-name","qc-handle","qc-floor","qc-avatar","qc-sketch"].forEach(x => document.getElementById(x).value = "");
    delete document.getElementById("qc-id").dataset.touched;
    setQuickCharVisible(false);
    const ps = document.getElementById("new-post-status");
    ps.textContent = `created "${name}" — selected for this post`;
    ps.className = "status ok";
  } catch (e) {
    status.textContent = "error: " + e.message; status.className = "status err";
  }
};

document.getElementById("btn-add-post").onclick = async () => {
  const btn = document.getElementById("btn-add-post");
  if (btn.disabled) return;
  const status = document.getElementById("new-post-status");
  const character_id = document.getElementById("new-post-char").value;
  const event_id = document.getElementById("new-post-event").value || null;
  const text = document.getElementById("new-post-text").value.trim();
  const pinned = document.getElementById("new-post-pinned").checked;
  const published = document.getElementById("new-post-published").checked;
  if (!character_id) { status.textContent = "pick a character"; status.className = "status err"; return; }
  if (!text) { status.textContent = "write something"; status.className = "status err"; return; }
  status.textContent = "saving..."; status.className = "status";
  btn.disabled = true;
  try {
    await api("/post", { method: "POST", body: { character_id, event_id, text, pinned, published } });
    document.getElementById("new-post-text").value = "";
    document.getElementById("new-post-pinned").checked = false;
    status.textContent = "saved"; status.className = "status ok";
    await loadPosts(); renderPosts();
  } catch (e) {
    status.textContent = "error: " + e.message; status.className = "status err";
  } finally {
    btn.disabled = false;
  }
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
  refreshNewPostPickers();
})();
