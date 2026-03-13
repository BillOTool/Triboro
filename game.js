// ═══════════════════════════════════════════════════════════════
// TRIBORO — Game Engine (LLM-Powered NPCs)
// ═══════════════════════════════════════════════════════════════

const Game = {
  windows: {},
  conversations: {}, // handle -> [{role, content}]

  state: {
    booted: false,
    apiKeySet: false,
    missionActive: false,
    missionPhase: "none", // none, briefing, investigating, reporting, complete
    currentObjective: "",
    fakeProfileDeployed: false,
    fakeProfile: null,
    daleRevealedSecret: false,
    cluesFound: 0,
    windowCounter: 0,
    activeWindowId: null,
    dragState: null,
  },

  // ── Initialize ───────────────────────────────────────────────
  async init() {
    this.state.apiKeySet = true;
    this.startBoot();
  },

  // ── API Key Modal ────────────────────────────────────────────
  showApiKeyModal() {
    document.getElementById("api-key-modal").classList.add("visible");
    const input = document.getElementById("api-key-input");
    const btn = document.getElementById("api-key-submit");
    const error = document.getElementById("api-key-error");

    btn.addEventListener("click", async () => {
      const key = input.value.trim();
      if (!key) return;

      btn.textContent = "Validating...";
      btn.disabled = true;
      error.textContent = "";

      try {
        const resp = await fetch("/api/set-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        const data = await resp.json();
        if (data.ok) {
          this.state.apiKeySet = true;
          document.getElementById("api-key-modal").classList.remove("visible");
          this.startBoot();
        } else {
          error.textContent = "Invalid API key. Check and try again.";
          btn.textContent = "Connect";
          btn.disabled = false;
        }
      } catch (e) {
        error.textContent = "Connection error. Is the server running?";
        btn.textContent = "Connect";
        btn.disabled = false;
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn.click();
    });
  },

  // ── Boot Sequence ────────────────────────────────────────────
  startBoot() {
    const bootContent = document.querySelector(".boot-content");
    const lines = WORLD.bootMessages;
    let totalDelay = 500;

    lines.forEach((line, i) => {
      const div = document.createElement("div");
      div.className = "boot-line";
      div.textContent = `> ${line.text}`;
      if (i === lines.length - 1) {
        div.innerHTML = `> ${line.text} <span class="cursor"></span>`;
      }
      bootContent.appendChild(div);
      setTimeout(() => div.classList.add("visible"), totalDelay);
      totalDelay += line.delay;
    });

    setTimeout(() => {
      document.getElementById("boot-screen").classList.add("hidden");
      document.getElementById("desktop").classList.add("visible");
      document.getElementById("taskbar").classList.add("visible");
      this.state.booted = true;
      this.startClock();
      this.startAmbientNotifications();

      setTimeout(() => {
        this.openHackHub();
        // Benny reaches out
        setTimeout(() => {
          this.showNotification(
            '💬 New message from Benny: "Hey. You awake? Got something for you."',
            () => this.openChat("benny")
          );
        }, 4000);
      }, 800);
    }, totalDelay + 1000);
  },

  // ── Clock ────────────────────────────────────────────────────
  startClock() {
    const clockEl = document.querySelector(".taskbar-clock");
    const update = () => {
      const now = new Date();
      clockEl.textContent =
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0");
    };
    update();
    setInterval(update, 30000);
  },

  // ── Ambient Notifications ────────────────────────────────────
  startAmbientNotifications() {
    let index = 0;
    const show = () => {
      this.showNotification(
        WORLD.ambientNotifications[index % WORLD.ambientNotifications.length]
      );
      index++;
    };
    setTimeout(show, 20000);
    setInterval(show, 50000);
  },

  // ── Notifications ────────────────────────────────────────────
  showNotification(text, onClick) {
    const area = document.querySelector(".notification-area");
    const toast = document.createElement("div");
    toast.className = "notification-toast";
    toast.textContent = text;

    if (onClick) {
      toast.style.borderColor = "var(--accent-amber)";
      toast.style.cursor = "pointer";
      toast.addEventListener("click", () => {
        toast.classList.add("dismissing");
        setTimeout(() => toast.remove(), 300);
        onClick();
      });
    }

    area.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add("dismissing");
        setTimeout(() => toast.remove(), 300);
      }
    }, onClick ? 15000 : 6000);
  },

  // ═══════════════════════════════════════════════════════════════
  // WINDOW MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  createWindow(id, title, icon, content, options = {}) {
    if (this.windows[id]) {
      const existing = this.windows[id].element;
      if (existing.classList.contains("minimized")) {
        existing.classList.remove("minimized");
      }
      this.focusWindow(id);
      return this.windows[id];
    }

    const width = options.width || 480;
    const height = options.height || 420;
    const desktop = document.getElementById("desktop");
    const desktopRect = desktop.getBoundingClientRect();

    const offset = (this.state.windowCounter % 5) * 30;
    const left = Math.min(100 + offset, desktopRect.width - width - 20);
    const top = Math.min(60 + offset, desktopRect.height - height - 20);

    const win = document.createElement("div");
    win.className = "window";
    win.id = `window-${id}`;
    win.style.width = width + "px";
    win.style.height = height + "px";
    win.style.left = left + "px";
    win.style.top = top + "px";

    win.innerHTML = `
      <div class="window-header" data-window-id="${id}">
        <div class="window-dots">
          <div class="window-dot dot-close" data-action="close" data-window-id="${id}"></div>
          <div class="window-dot dot-minimize" data-action="minimize" data-window-id="${id}"></div>
          <div class="window-dot dot-maximize" data-action="maximize" data-window-id="${id}"></div>
        </div>
        <div class="window-title"><span class="title-icon">${icon}</span>${title}</div>
      </div>
      <div class="window-body" id="window-body-${id}">
        ${content}
      </div>
    `;

    desktop.appendChild(win);
    requestAnimationFrame(() => win.classList.add("open"));

    this.windows[id] = { element: win, title, icon };
    this.state.windowCounter++;

    win.addEventListener("mousedown", () => this.focusWindow(id));

    win.querySelectorAll(".window-dot").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = dot.dataset.action;
        const wid = dot.dataset.windowId;
        if (action === "close") this.closeWindow(wid);
        else if (action === "minimize") this.minimizeWindow(wid);
      });
    });

    const header = win.querySelector(".window-header");
    header.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("window-dot")) return;
      this.startDrag(id, e);
    });

    this.addTaskbarButton(id, icon, title);
    this.focusWindow(id);
    return this.windows[id];
  },

  focusWindow(id) {
    Object.keys(this.windows).forEach((wid) => {
      this.windows[wid].element.classList.remove("active");
    });
    if (this.windows[id]) {
      this.windows[id].element.classList.add("active");
      this.state.activeWindowId = id;
      document.querySelectorAll(".taskbar-btn[data-window-id]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.windowId === id);
      });
    }
  },

  closeWindow(id) {
    const win = this.windows[id];
    if (!win) return;
    win.element.classList.remove("open");
    setTimeout(() => {
      win.element.remove();
      delete this.windows[id];
    }, 200);
    const btn = document.querySelector(`.taskbar-btn[data-window-id="${id}"]`);
    if (btn) btn.remove();
  },

  minimizeWindow(id) {
    if (this.windows[id]) this.windows[id].element.classList.add("minimized");
  },

  startDrag(id, e) {
    const win = this.windows[id].element;
    const rect = win.getBoundingClientRect();
    this.state.dragState = {
      windowId: id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    const onMove = (e) => {
      if (!this.state.dragState) return;
      win.style.left = Math.max(0, e.clientX - this.state.dragState.offsetX) + "px";
      win.style.top = Math.max(0, e.clientY - this.state.dragState.offsetY) + "px";
    };
    const onUp = () => {
      this.state.dragState = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  },

  addTaskbarButton(id, icon, title) {
    const taskbar = document.getElementById("taskbar");
    const spacer = taskbar.querySelector(".taskbar-spacer");
    const btn = document.createElement("button");
    btn.className = "taskbar-btn";
    btn.dataset.windowId = id;
    btn.innerHTML = `<span class="btn-icon">${icon}</span>${title}`;
    btn.addEventListener("click", () => {
      const win = this.windows[id];
      if (!win) return;
      if (win.element.classList.contains("minimized")) {
        win.element.classList.remove("minimized");
        this.focusWindow(id);
      } else if (this.state.activeWindowId === id) {
        this.minimizeWindow(id);
      } else {
        this.focusWindow(id);
      }
    });
    taskbar.insertBefore(btn, spacer);
  },

  // ═══════════════════════════════════════════════════════════════
  // LLM CHAT SYSTEM
  // ═══════════════════════════════════════════════════════════════

  openChat(characterKey) {
    const char = CHARACTERS[characterKey];
    if (!char) return;

    const windowId = `chat-${characterKey}`;

    // Initialize conversation if new
    if (!this.conversations[char.handle]) {
      this.conversations[char.handle] = [];
    }

    const content = `
      <div class="chat-messages" id="chat-messages-${characterKey}"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input-field" id="chat-input-${characterKey}"
               placeholder="Type a message..." spellcheck="false" autocomplete="off">
        <button class="chat-send-btn" id="chat-send-${characterKey}">Send</button>
      </div>
    `;

    this.createWindow(windowId, char.name, char.avatar, content, {
      width: 440,
      height: 480,
    });

    const messagesEl = document.getElementById(`chat-messages-${characterKey}`);
    const inputEl = document.getElementById(`chat-input-${characterKey}`);
    const sendBtn = document.getElementById(`chat-send-${characterKey}`);

    // Render existing conversation
    const history = this.conversations[char.handle];
    history.forEach((msg) => {
      this.renderChatBubble(messagesEl, msg.role === "assistant" ? char.name : "You", msg.content, msg.role === "assistant" ? "npc" : "player");
    });

    // If no conversation yet, NPC sends greeting
    if (history.length === 0) {
      setTimeout(() => {
        this.showTyping(messagesEl);
        setTimeout(() => {
          this.hideTyping(messagesEl);
          history.push({ role: "assistant", content: char.greeting });
          this.renderChatBubble(messagesEl, char.name, char.greeting, "npc");
          this.scrollToBottom(messagesEl);
        }, 800 + Math.random() * 600);
      }, 300);
    }

    // Send handler
    const send = () => {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = "";
      this.sendPlayerMessage(characterKey, text);
    };

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
    sendBtn.addEventListener("click", send);

    setTimeout(() => inputEl.focus(), 300);

    // Mission state: if opening Benny for first time, set briefing phase
    if (characterKey === "benny" && this.state.missionPhase === "none") {
      this.state.missionPhase = "briefing";
    }
  },

  async sendPlayerMessage(characterKey, text) {
    const char = CHARACTERS[characterKey];
    if (!char) return;

    const messagesEl = document.getElementById(`chat-messages-${characterKey}`);
    const inputEl = document.getElementById(`chat-input-${characterKey}`);
    if (!messagesEl) return;

    // Show player message
    this.conversations[char.handle].push({ role: "user", content: text });
    this.renderChatBubble(messagesEl, "You", text, "player");
    this.scrollToBottom(messagesEl);

    // Disable input while waiting
    if (inputEl) inputEl.disabled = true;
    const sendBtn = document.getElementById(`chat-send-${characterKey}`);
    if (sendBtn) sendBtn.disabled = true;

    // Show typing
    this.showTyping(messagesEl);

    try {
      const systemPrompt = char.getSystemPrompt(this.state);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: systemPrompt,
          messages: this.conversations[char.handle],
        }),
      });

      const data = await response.json();
      this.hideTyping(messagesEl);

      if (data.error) {
        this.renderChatBubble(messagesEl, "System", "Connection error. Try again.", "system");
      } else {
        const npcText = data.text;
        this.conversations[char.handle].push({ role: "assistant", content: npcText });
        this.renderChatBubble(messagesEl, char.name, npcText, "npc");

        // Check for game state changes
        this.checkGameState(characterKey, text, npcText);
      }
    } catch (e) {
      this.hideTyping(messagesEl);
      this.renderChatBubble(messagesEl, "System", "Network error. Is the server running?", "system");
    }

    // Re-enable input
    if (inputEl) {
      inputEl.disabled = false;
      inputEl.focus();
    }
    if (sendBtn) sendBtn.disabled = false;
    this.scrollToBottom(messagesEl);
  },

  renderChatBubble(container, name, text, type) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${type}`;
    if (type === "npc" || type === "system") {
      bubble.innerHTML = `<div class="speaker-name">${name}</div>${this.escapeHtml(text)}`;
    } else {
      bubble.textContent = text;
    }
    container.appendChild(bubble);
  },

  showTyping(container) {
    const typing = document.createElement("div");
    typing.className = "chat-typing";
    typing.id = "typing-indicator";
    typing.innerHTML =
      '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    container.appendChild(typing);
    this.scrollToBottom(container);
  },

  hideTyping(container) {
    const typing = container.querySelector(".chat-typing");
    if (typing) typing.remove();
  },

  scrollToBottom(el) {
    const body = el.closest(".window-body");
    if (body) setTimeout(() => (body.scrollTop = body.scrollHeight), 50);
  },

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  // ═══════════════════════════════════════════════════════════════
  // GAME STATE & MISSION TRACKING
  // ═══════════════════════════════════════════════════════════════

  checkGameState(characterKey, playerMsg, npcResponse) {
    const lower = (playerMsg + " " + npcResponse).toLowerCase();

    // Detect mission acceptance from Benny
    if (characterKey === "benny" && this.state.missionPhase === "briefing") {
      const acceptSignals = ["dale", "voss", "@dalevoss", "i'll take", "i'll do it", "accept", "deal", "200 credits", "investigate", "on it", "sure", "got it", "let's do"];
      if (acceptSignals.some((s) => lower.includes(s))) {
        if (!this.state.missionActive) {
          this.state.missionActive = true;
          this.state.missionPhase = "investigating";
          this.showMissionOverlay();
        }
      }
    }

    // Detect Dale revealing his secret
    if (characterKey === "dale_voss" && !this.state.daleRevealedSecret) {
      const secretSignals = ["music box", "anniversary", "carved", "carving", "surprise gift", "song she loved", "mechanisms", "salvage", "floor 8"];
      const found = secretSignals.filter((s) => lower.includes(s));
      if (found.length >= 2) {
        this.state.daleRevealedSecret = true;
        this.state.missionPhase = "reporting";
        this.updateObjective("Report your findings to Benny.");
        this.terminalLog(
          "\n[HACK HUB] Intelligence gathered. You now know Dale's secret. Report back to Benny.",
          "warn-text"
        );
        setTimeout(() => {
          this.showNotification(
            '💬 Benny: "You find anything yet?"',
            () => this.openChat("benny")
          );
        }, 3000);
      } else if (found.length >= 1 && this.state.cluesFound === 0) {
        this.state.cluesFound = 1;
        this.updateObjective("Keep talking to Dale. You're getting closer.");
        this.terminalLog(
          "\n[HACK HUB] Picking up clues. Keep digging.",
          "info-text"
        );
      }
    }

    // Detect Benny receiving report
    if (characterKey === "benny" && this.state.missionPhase === "reporting") {
      const reportSignals = ["music box", "anniversary", "not cheating", "building", "gift", "surprise", "workshop", "floor 33", "couldn't find", "he is cheating", "seeing someone"];
      const found = reportSignals.filter((s) => lower.includes(s));
      if (found.length >= 1) {
        // Check if Benny seems to be wrapping up (his response contains pay/credits language)
        const closingSignals = ["credits", "transferred", "pay", "job done", "nice work", "more work", "keep your head", "next time", "walk away"];
        if (closingSignals.some((s) => npcResponse.toLowerCase().includes(s))) {
          this.state.missionPhase = "complete";
          this.showEndingAfterDelay(npcResponse);
        }
      }
    }
  },

  showMissionOverlay() {
    const overlay = document.getElementById("mission-overlay");
    document.getElementById("mission-title").textContent = WORLD.mission1.title;
    document.getElementById("mission-briefing-text").textContent = WORLD.mission1.briefing;
    overlay.classList.add("visible");

    document.getElementById("mission-accept-btn").onclick = () => {
      overlay.classList.remove("visible");
      this.updateObjective(
        "Investigate Dale Voss. Check his profile on Almanapp, or message him."
      );
      this.terminalLog(
        '\n[JOB ACCEPTED] "The Suspicious Wife"\nClient: Marla Voss | Pay: 200 credits\nObjective: Find out what Dale Voss is hiding.',
        "warn-text"
      );
      this.terminalLog(
        "\nTip: Open Almanapp and find @DaleVoss. Use the Spoof Kit if you want a fake identity.",
        "info-text"
      );
    };
  },

  showEndingAfterDelay(bennyResponse) {
    setTimeout(() => {
      document.getElementById("objective-banner").classList.remove("visible");

      const overlay = document.getElementById("ending-overlay");

      // Determine ending type from Benny's response
      let narration = "";
      const resp = bennyResponse.toLowerCase();
      if (resp.includes("sweet") || resp.includes("music box") || resp.includes("nothing to worry")) {
        narration = 'You told the truth. Somewhere on Floor 27, a woman stops worrying. In two weeks, she\'ll hear a song she thought she\'d never hear again.\n\nMission complete. +200 credits.\nTrust with Benny: Increased.';
      } else if (resp.includes("blow up") || resp.includes("cheating") || resp.includes("your call")) {
        narration = "You played it your way. The consequences will ripple through Floor 27 in ways you may never see.\n\nMission complete.\nTrust with Benny: He'll remember how you operate.";
      } else {
        narration = "The job is done. Benny pays you, and life in Triboro goes on. But every choice leaves a mark — on your reputation, on the people involved, and on the kind of person you're becoming in this place.\n\nMission complete.";
      }

      document.getElementById("ending-text").textContent = narration;
      overlay.classList.add("visible");

      document.getElementById("ending-continue-btn").onclick = () => {
        overlay.classList.remove("visible");
        this.terminalLog("\n═══════════════════════════════════════", "narrator-text");
        this.terminalLog("End of Demo: The Suspicious Wife", "narrator-text");
        this.terminalLog("═══════════════════════════════════════", "narrator-text");
        this.terminalLog("\nThank you for playing the Triboro demo.", "narrator-text");
        this.terminalLog("The full game features deeper social engineering,", "narrator-text");
        this.terminalLog("faction politics, elections, and a conspiracy", "narrator-text");
        this.terminalLog("that reaches every floor of the complex.", "narrator-text");
        this.terminalLog("\nEvery NPC remembers. Every choice matters.", "narrator-text");
        this.terminalLog("Stay tuned. The Aurora is watching.", "narrator-text");
      };
    }, 2000);
  },

  updateObjective(text) {
    this.state.currentObjective = text;
    const banner = document.getElementById("objective-banner");
    document.getElementById("objective-text").textContent = text;
    banner.classList.add("visible");
  },

  // ═══════════════════════════════════════════════════════════════
  // HACK HUB (Terminal)
  // ═══════════════════════════════════════════════════════════════

  openHackHub() {
    const content = `
      <div class="terminal-content" id="terminal-output">${WORLD.hackHubWelcome}</div>
      <div class="terminal-input-line">
        <span class="terminal-prompt">tenant@hackhub:~$</span>
        <input type="text" class="terminal-input" id="terminal-input" spellcheck="false" autocomplete="off">
      </div>
    `;

    this.createWindow("hackhub", "Hack Hub", "💻", content, { width: 560, height: 400 });

    const input = document.getElementById("terminal-input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.processTerminalCommand(input.value.trim());
          input.value = "";
        }
      });
      setTimeout(() => input.focus(), 300);
    }
  },

  processTerminalCommand(cmd) {
    const output = document.getElementById("terminal-output");
    if (!output) return;

    output.textContent += `\ntenant@hackhub:~$ ${cmd}\n`;
    const lower = cmd.toLowerCase();

    if (WORLD.terminalCommands[lower]) {
      output.textContent += WORLD.terminalCommands[lower];
    } else if (lower === "jobs") {
      if (!this.state.missionActive) {
        output.innerHTML +=
          '<span class="info-text">\nAvailable Jobs:\n  [1] "The Suspicious Wife" — Client: Marla Voss — 200 credits\n      Talk to Benny to accept.</span>';
      } else if (this.state.missionPhase !== "complete") {
        output.innerHTML += `<span class="info-text">\nActive Job:\n  [1] "The Suspicious Wife" — IN PROGRESS\n      Objective: ${this.state.currentObjective}</span>`;
      } else {
        output.innerHTML += '<span class="info-text">\nNo active jobs. Check back with Benny later.</span>';
      }
    } else if (lower === "almanapp") {
      this.openAlmanapp();
    } else if (lower === "news") {
      this.openNews();
    } else if (lower === "clear") {
      output.textContent = "";
    } else if (lower === "") {
      // empty
    } else {
      output.innerHTML += `<span class="error-text">Unknown command: ${cmd}\nType 'help' for available commands.</span>`;
    }

    const body = output.closest(".window-body");
    if (body) body.scrollTop = body.scrollHeight;
  },

  terminalLog(text, className = "system-text") {
    const output = document.getElementById("terminal-output");
    if (!output) return;
    output.innerHTML += `\n<span class="${className}">${text}</span>`;
    const body = output.closest(".window-body");
    if (body) body.scrollTop = body.scrollHeight;
  },

  // ═══════════════════════════════════════════════════════════════
  // ALMANAPP
  // ═══════════════════════════════════════════════════════════════

  openAlmanapp() {
    const postsHtml = WORLD.almanappPosts.map((p) => this.renderPost(p)).join("");

    const content = `
      <div class="almanapp-header">
        <span class="almanapp-logo">🌐</span>
        <span class="almanapp-title">ALMANAPP</span>
        <span class="almanapp-subtitle">Triboro Social Network</span>
      </div>
      <div class="almanapp-tabs">
        <button class="almanapp-tab active" data-tab="feed">Feed</button>
        <button class="almanapp-tab" data-tab="people">People</button>
      </div>
      <div id="almanapp-content">${postsHtml}</div>
    `;

    this.createWindow("almanapp", "Almanapp", "🌐", content, { width: 440, height: 520 });

    setTimeout(() => {
      this.setupProfileClicks();

      // People tab
      document.querySelectorAll(".almanapp-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          document.querySelectorAll(".almanapp-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          if (tab.dataset.tab === "people") this.showPeopleList();
          else this.showAlmanappFeed();
        });
      });
    }, 100);
  },

  showPeopleList() {
    const contentEl = document.getElementById("almanapp-content");
    if (!contentEl) return;

    const peopleHtml = Object.keys(CHARACTERS)
      .map((key) => {
        const c = CHARACTERS[key];
        return `
        <div class="social-post" style="cursor:pointer" data-char-handle="${c.handle}">
          <div class="social-post-header">
            <div class="social-avatar">${c.avatar}</div>
            <div class="social-author">
              <div class="social-author-name" data-handle="${c.handle}">${c.name}</div>
              <div class="social-author-handle">${c.handle}</div>
            </div>
            <button class="profile-btn primary" style="font-size:11px; padding:4px 12px;"
                    onclick="event.stopPropagation(); Game.openChat('${key}')">💬 Message</button>
          </div>
        </div>`;
      })
      .join("");

    contentEl.innerHTML = `<div class="fade-in">${peopleHtml}</div>`;
    this.setupProfileClicks();
  },

  renderPost(post) {
    return `
      <div class="social-post">
        <div class="social-post-header">
          <div class="social-avatar">${post.avatar}</div>
          <div class="social-author">
            <div class="social-author-name" data-handle="${post.handle}">${post.author}</div>
            <div class="social-author-handle">${post.handle}</div>
          </div>
          <div class="social-time">${post.time}</div>
        </div>
        <div class="social-post-body">${post.text}</div>
        <div class="social-post-footer">
          <span>❤️ ${post.likes}</span>
          <span>💬 ${post.comments}</span>
          <span>🔄 Share</span>
        </div>
      </div>
    `;
  },

  setupProfileClicks() {
    document.querySelectorAll(".social-author-name").forEach((el) => {
      el.addEventListener("click", () => this.viewProfile(el.dataset.handle));
    });
  },

  viewProfile(handle) {
    const profileKey = Object.keys(WORLD.profiles).find(
      (k) => WORLD.profiles[k].handle === handle
    );
    // Also check CHARACTERS
    const charKey = getCharacterKey(handle);

    const p = profileKey ? WORLD.profiles[profileKey] : null;
    const c = charKey ? CHARACTERS[charKey] : null;

    if (!p && !c) return;

    const contentEl = document.getElementById("almanapp-content");
    if (!contentEl) return;

    const name = p ? p.name : c.name;
    const avatar = p ? p.avatar : c.avatar;
    const bio = p ? p.bio : "";
    const pHandle = p ? p.handle : c.handle;

    const userPosts = WORLD.almanappPosts
      .filter((post) => post.handle === handle)
      .map((post) => this.renderPost(post))
      .join("");

    const messageBtn = charKey
      ? `<button class="profile-btn primary" onclick="Game.openChat('${charKey}')">💬 Message</button>`
      : "";

    contentEl.innerHTML = `
      <div class="profile-view fade-in">
        <button class="profile-back-btn" onclick="Game.showAlmanappFeed()">← Back to Feed</button>
        <div class="profile-banner"></div>
        <div class="profile-avatar-large">${avatar}</div>
        <div class="profile-name">${name}</div>
        <div class="profile-handle">${pHandle}</div>
        ${bio ? `<div class="profile-bio">${bio}</div>` : ""}
        ${p ? `
        <div class="profile-stats">
          <div class="profile-stat"><div class="profile-stat-num">${p.posts}</div><div class="profile-stat-label">Posts</div></div>
          <div class="profile-stat"><div class="profile-stat-num">${p.followers}</div><div class="profile-stat-label">Followers</div></div>
          <div class="profile-stat"><div class="profile-stat-num">${p.following}</div><div class="profile-stat-label">Following</div></div>
        </div>
        <div class="profile-detail">📍 Floor ${p.floor} · Joined ${p.joined}</div>
        <div class="profile-detail">🏷️ ${p.faction}</div>` : ""}
        <div class="profile-actions">
          <button class="profile-btn">Follow</button>
          ${messageBtn}
        </div>
        <div style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 16px;">
          ${userPosts || '<p style="color: var(--text-muted); font-size: 13px;">No recent posts.</p>'}
        </div>
      </div>
    `;

    this.setupProfileClicks();
  },

  showAlmanappFeed() {
    const contentEl = document.getElementById("almanapp-content");
    if (!contentEl) return;
    contentEl.innerHTML = WORLD.almanappPosts.map((p) => this.renderPost(p)).join("");
    this.setupProfileClicks();
  },

  // ═══════════════════════════════════════════════════════════════
  // TB NEWS
  // ═══════════════════════════════════════════════════════════════

  openNews() {
    const articlesHtml = WORLD.newsArticles
      .map(
        (a, i) => `
      <div class="news-article" data-news-index="${i}">
        <div class="news-article-source">${a.source}</div>
        <div class="news-article-headline">${a.headline}</div>
        <div class="news-article-time">${a.time}</div>
      </div>`
      )
      .join("");

    const content = `
      <div class="news-header">
        <span class="news-logo">📺</span>
        <span class="news-title">TB NEWS</span>
      </div>
      <div id="news-content">${articlesHtml}</div>
    `;

    this.createWindow("news", "TB News", "📺", content, { width: 480, height: 480 });
    setTimeout(() => this.setupNewsClicks(), 100);
  },

  setupNewsClicks() {
    document.querySelectorAll(".news-article").forEach((el) => {
      el.addEventListener("click", () => {
        this.viewNewsArticle(parseInt(el.dataset.newsIndex));
      });
    });
  },

  viewNewsArticle(index) {
    const article = WORLD.newsArticles[index];
    if (!article) return;
    const contentEl = document.getElementById("news-content");
    if (!contentEl) return;
    contentEl.innerHTML = `
      <div class="fade-in">
        <button class="news-back-btn" onclick="Game.showNewsList()">← Back to Headlines</button>
        <div class="news-article-source">${article.source}</div>
        <div class="news-article-headline" style="font-size: 20px; margin-bottom: 8px;">${article.headline}</div>
        <div class="news-article-time" style="margin-bottom: 16px;">${article.time}</div>
        <div class="news-article-body">${article.body}</div>
      </div>
    `;
  },

  showNewsList() {
    const contentEl = document.getElementById("news-content");
    if (!contentEl) return;
    contentEl.innerHTML = WORLD.newsArticles
      .map(
        (a, i) => `
      <div class="news-article" data-news-index="${i}">
        <div class="news-article-source">${a.source}</div>
        <div class="news-article-headline">${a.headline}</div>
        <div class="news-article-time">${a.time}</div>
      </div>`
      )
      .join("");
    this.setupNewsClicks();
  },

  // ═══════════════════════════════════════════════════════════════
  // SPOOF KIT
  // ═══════════════════════════════════════════════════════════════

  openSpoofKit() {
    if (this.state.fakeProfileDeployed) {
      this.showNotification("Fake profile active: " + this.state.fakeProfile.name);
      return;
    }

    const optionsHtml = WORLD.fakeProfiles
      .map(
        (fp, i) => `
      <div class="spoof-option" data-profile-index="${i}">
        <div class="spoof-avatar">🎭</div>
        <div class="spoof-info">
          <div class="spoof-name">${fp.name}</div>
          <div class="spoof-handle">${fp.handle}</div>
          <div class="spoof-bio">${fp.bio}</div>
        </div>
      </div>`
      )
      .join("");

    const content = `
      <div class="spoof-header">
        <div class="spoof-title">SPOOF KIT</div>
        <div class="spoof-subtitle">Deploy a fake Almanapp identity</div>
      </div>
      <div class="spoof-options">${optionsHtml}</div>
      <button class="spoof-deploy-btn" id="spoof-deploy" disabled>SELECT A PROFILE</button>
    `;

    this.createWindow("spoofkit", "Spoof Kit", "🎭", content, { width: 380, height: 400 });

    setTimeout(() => {
      let selected = null;
      document.querySelectorAll(".spoof-option").forEach((el) => {
        el.addEventListener("click", () => {
          document.querySelectorAll(".spoof-option").forEach((o) => o.classList.remove("selected"));
          el.classList.add("selected");
          selected = parseInt(el.dataset.profileIndex);
          const btn = document.getElementById("spoof-deploy");
          btn.disabled = false;
          btn.textContent = `DEPLOY ${WORLD.fakeProfiles[selected].name.toUpperCase()}`;
        });
      });
      document.getElementById("spoof-deploy").addEventListener("click", () => {
        if (selected === null) return;
        this.deployFakeProfile(selected);
      });
    }, 100);
  },

  deployFakeProfile(index) {
    const fp = WORLD.fakeProfiles[index];
    this.state.fakeProfileDeployed = true;
    this.state.fakeProfile = fp;
    this.closeWindow("spoofkit");
    this.terminalLog(`\n[SPOOF KIT] Identity deployed: ${fp.name} (${fp.handle})`, "info-text");
    this.showNotification(`🎭 Fake profile active: ${fp.name}`);
    if (this.state.missionPhase === "investigating") {
      this.updateObjective("Message Dale Voss on Almanapp using your fake identity.");
    }
  },
};

// ── Desktop Icon Handlers ────────────────────────────────────
function openApp(appName) {
  switch (appName) {
    case "hackhub": Game.openHackHub(); break;
    case "almanapp": Game.openAlmanapp(); break;
    case "news": Game.openNews(); break;
    case "spoofkit": Game.openSpoofKit(); break;
  }
}

// ── Start ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => Game.init());
