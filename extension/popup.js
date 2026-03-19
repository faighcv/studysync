// popup.js — StudySync popup UI

const API_BASE = "https://studysync-tyz6.onrender.com";

function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function el(id) { return document.getElementById(id); }

function showToast(msg, type = "info") {
  const t = el("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 2800);
}

// Returns { text, cls } for a due date ISO string
function relTime(isoStr) {
  const diff = new Date(isoStr) - Date.now();
  const h = diff / 3600000;
  const d = diff / 86400000;
  if (diff < 0)   return { text: "Overdue",      cls: "due-overdue" };
  if (h < 1)      return { text: "< 1 hr",       cls: "due-today"   };
  if (h < 6)      return { text: `${Math.ceil(h)}h left`, cls: "due-today" };
  if (h < 24)     return { text: "Today",         cls: "due-today"   };
  if (d < 2)      return { text: "Tomorrow",      cls: "due-soon"    };
  if (d < 7)      return { text: `${Math.ceil(d)}d left`, cls: "due-soon" };
  return { text: `${Math.ceil(d)} days`,           cls: "due-normal"  };
}

const KIND_EMOJI = {
  exam: "📋", quiz: "📝", lab: "🔬",
  project: "💡", discussion: "💬", assignment: "📚"
};

function kindEmoji(kind) { return KIND_EMOJI[kind] || "📌"; }

async function apiFetch(path, opts = {}) {
  const { accessToken } = await chrome.storage.sync.get(["accessToken"]);
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const r = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// ── Render: not logged in ────────────────────────────────────────────────
function renderAuthGate() {
  el("app").innerHTML = `
    <div class="auth-gate">
      <p>Sign in to start syncing your myCourses deadlines to your calendar.</p>
      <button class="btn btn-red btn-full" id="btnOpenOpts">Open Settings →</button>
    </div>
  `;
  el("btnOpenOpts").onclick = () => chrome.runtime.openOptionsPage();
}

// ── Render: main view ────────────────────────────────────────────────────
function renderMain(assignments, email, lastSync, onBrightspace) {
  const now     = Date.now();
  const upcoming = assignments
    .filter(a => a.due_at)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 20);

  const lastSyncLabel = lastSync
    ? `Last synced: ${relTime(lastSync).text.replace(" left", " ago").replace("Overdue", "a while ago")}`
    : "Never synced";

  let listHTML;
  if (upcoming.length === 0) {
    listHTML = `
      <div class="empty">
        <div class="empty-icon">🎉</div>
        <div class="empty-title">No upcoming deadlines found</div>
        <div class="empty-hint">
          Go to myCourses Calendar&nbsp;›&nbsp;List or<br>
          Assignments / Quizzes, then click <strong>Sync</strong>.
        </div>
      </div>
    `;
  } else {
    listHTML = upcoming.map(a => {
      const due    = relTime(a.due_at);
      const emoji  = kindEmoji(a.kind);
      const course = a.course ? `<div class="item-course">${esc(a.course)}</div>` : "";
      return `
        <div class="item">
          <div class="badge badge-${esc(a.kind)}">${emoji}</div>
          <div class="info">
            <div class="item-title">${esc(a.title)}</div>
            ${course}
          </div>
          <div class="due ${due.cls}">${due.text}</div>
        </div>
      `;
    }).join("");
  }

  const hint = !onBrightspace ? `
    <div class="hint-banner">
      Navigate to <strong>myCourses</strong> to sync new deadlines.
    </div>
  ` : "";

  el("app").innerHTML = `
    <div class="sync-bar">
      <span class="last-sync" id="syncLabel">${esc(lastSyncLabel)}</span>
      <button class="btn btn-red" id="btnSync" ${!onBrightspace ? "disabled title='Go to myCourses first'" : ""}>
        ↻ Sync
      </button>
    </div>
    ${hint}
    <div class="section-head">Upcoming Deadlines</div>
    <div class="list" id="assignList">${listHTML}</div>
    <div class="footer">
      <span class="footer-email">${esc(email)}</span>
      <div style="display:flex;gap:2px;">
        <button class="btn btn-ghost" id="btnICS" title="Copy your ICS calendar URL">📋 ICS</button>
        <button class="btn btn-ghost" id="btnSettings" title="Settings">⚙</button>
      </div>
    </div>
  `;

  el("btnSettings").onclick = () => chrome.runtime.openOptionsPage();

  el("btnICS").onclick = async () => {
    const st = await chrome.storage.sync.get(["icsUrl"]);
    if (st.icsUrl) {
      try {
        await navigator.clipboard.writeText(st.icsUrl);
        showToast("ICS URL copied to clipboard!", "success");
      } catch {
        showToast(st.icsUrl, "info");
      }
    } else {
      showToast("Open Settings to generate your ICS URL", "info");
    }
  };

  if (onBrightspace) {
    el("btnSync").onclick = () => doSync();
  }
}

// ── Sync logic ────────────────────────────────────────────────────────────
async function doSync() {
  const btn = el("btnSync");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Syncing…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("no tab");

    const prefs = await chrome.storage.sync.get(["defaultTime", "includeGeneral"]);
    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE", prefs });
    } catch {
      showToast("Please reload the myCourses page and try again", "error");
      return;
    }

    if (!resp?.ok || !resp.items?.length) {
      showToast("No deadlines found on this page — try Calendar › List", "info");
      return;
    }

    const { accessToken } = await chrome.storage.sync.get(["accessToken"]);
    const r = await fetch(`${API_BASE}/assignments/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(resp.items),
    });
    if (!r.ok) throw new Error(await r.text());
    const result = await r.json();

    const now = new Date().toISOString();
    await chrome.storage.sync.set({ lastSync: now });

    const { imported = 0, updated = 0 } = result.stats || {};
    const msg = imported > 0
      ? `Added ${imported} new deadline${imported > 1 ? "s" : ""}${updated ? `, updated ${updated}` : ""} ✓`
      : `All ${updated} deadlines up to date ✓`;
    showToast(msg, "success");

    el("syncLabel").textContent = "Just synced";

    // Refresh list
    const fresh = await apiFetch(`/assignments?from=${new Date().toISOString()}`);
    const { email } = await chrome.storage.sync.get(["email"]);
    renderMain(fresh, email || "", now, true);

  } catch (e) {
    console.error("[StudySync]", e);
    showToast("Sync failed — check your connection", "error");
  } finally {
    if (el("btnSync")) {
      el("btnSync").disabled = false;
      el("btnSync").innerHTML = "↻ Sync";
    }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  el("app").innerHTML = `<div class="loading"><span class="spinner"></span></div>`;

  const st = await chrome.storage.sync.get(["accessToken", "email", "lastSync"]);
  if (!st.accessToken) {
    renderAuthGate();
    return;
  }

  // Check if we're on a myCourses / Brightspace page
  let onBrightspace = false;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || "";
    onBrightspace = url.includes("mycourses2.mcgill.ca") || url.includes("brightspace.com");
  } catch { /* permission not granted yet */ }

  try {
    const from = new Date().toISOString();
    const assignments = await apiFetch(`/assignments?from=${from}`);
    renderMain(assignments, st.email || "", st.lastSync || null, onBrightspace);
  } catch {
    // Token likely expired
    renderAuthGate();
  }
}

init();
