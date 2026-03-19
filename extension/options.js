// options.js — StudySync settings page

const API_BASE = "https://studysync-tyz6.onrender.com";

function el(id) { return document.getElementById(id); }

function showStatus(msg, ok) {
  const s = el("authStatus");
  s.textContent  = msg;
  s.className    = `status-msg ${ok ? "ok" : "err"}`;
}

async function load() {
  return chrome.storage.sync.get(["accessToken", "email", "includeGeneral", "defaultTime", "icsUrl"]);
}

async function save(vals) {
  return chrome.storage.sync.set(vals);
}

async function apiPost(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function refreshIcsLink() {
  const { accessToken } = await load();
  if (!accessToken) return;
  try {
    const j = await fetch(`${API_BASE}/calendar/share-url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => (r.ok ? r.json() : null));

    if (j?.url) {
      await save({ icsUrl: j.url });
      renderIcsUrl(j.url);
    }
  } catch { /* not logged in yet */ }
}

function renderIcsUrl(url) {
  const display = el("icsDisplay");
  const copyBtn = el("btnCopyICS");
  if (url) {
    display.innerHTML = `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
    copyBtn.style.display = "inline-flex";
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyBtn.innerHTML = "📋 Copy"; }, 1800);
      } catch {
        prompt("Copy this URL:", url);
      }
    };
  } else {
    display.innerHTML = `<span class="ics-empty">Sign in to generate your calendar feed URL.</span>`;
    copyBtn.style.display = "none";
  }
}

function showLoggedIn(email) {
  el("loggedInView").style.display = "block";
  el("authForm").style.display     = "none";
  el("displayEmail").textContent   = email || "Signed in";
  el("authStatus").className       = "status-msg"; // hide status
}

function showLoggedOut() {
  el("loggedInView").style.display = "none";
  el("authForm").style.display     = "block";
  renderIcsUrl(null);
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Always pin API base
  await save({ apiBase: API_BASE });

  const st = await load();
  el("includeGeneral").checked = !!st.includeGeneral;
  el("defaultTime").value      = st.defaultTime || "23:59";

  if (st.accessToken) {
    showLoggedIn(st.email);
    if (st.icsUrl) renderIcsUrl(st.icsUrl);
    refreshIcsLink();
  }

  // ── Login ────────────────────────────────────────────────
  el("btnLogin").onclick = async () => {
    const email    = el("email").value.trim();
    const password = el("password").value;
    if (!email || !password) { showStatus("Enter your email and password.", false); return; }
    try {
      const j = await apiPost("/auth/login", { email, password });
      await save({ accessToken: j.access_token, email });
      showLoggedIn(email);
      showStatus("Logged in successfully.", true);
      refreshIcsLink();
    } catch (e) {
      showStatus("Login failed — check your email and password.", false);
    }
  };

  // ── Register ─────────────────────────────────────────────
  el("btnRegister").onclick = async () => {
    const email    = el("email").value.trim();
    const password = el("password").value;
    if (!email || !password) { showStatus("Enter an email and password.", false); return; }
    if (password.length < 6)  { showStatus("Password must be at least 6 characters.", false); return; }
    try {
      const j = await apiPost("/auth/register", { email, password });
      await save({ accessToken: j.access_token, email });
      showLoggedIn(email);
      showStatus("Account created! You're now signed in.", true);
      refreshIcsLink();
    } catch (e) {
      showStatus("Sign-up failed — this email may already be registered.", false);
    }
  };

  // ── Logout ───────────────────────────────────────────────
  el("btnLogout").onclick = async () => {
    await chrome.storage.sync.remove(["accessToken", "icsUrl", "lastSync"]);
    showLoggedOut();
    el("email").value    = "";
    el("password").value = "";
  };

  // ── Preferences ──────────────────────────────────────────
  el("includeGeneral").onchange = () => save({ includeGeneral: el("includeGeneral").checked });
  el("defaultTime").onchange    = () => save({ defaultTime: el("defaultTime").value });
});
