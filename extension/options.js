const el = id => document.getElementById(id);

async function save(values) {
  await chrome.storage.sync.set(values);
}

async function load() {
  return await chrome.storage.sync.get([
    "apiBase","accessToken","email","includeGeneral","defaultTime","icsUrl"
  ]);
}

async function api(base, path, method="GET", body=null, token=null) {
  const headers = {"Content-Type":"application/json"};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : null
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function setStatus(msg, ok=true){
  const s = el("status");
  s.textContent = msg; s.className = ok ? "ok":"err";
}

async function refreshIcsLink() {
  const {apiBase, accessToken} = await load();
  if (!apiBase || !accessToken) return;
  try{
    const j = await api(apiBase, "/calendar/share-url", "GET", null, accessToken);
    if (j && j.url) {
      el("icsLink").textContent = j.url;
      el("icsLink").href = j.url;
      await save({icsUrl: j.url});
    }
  }catch(e){ /* ignore until logged in */ }
}

document.addEventListener("DOMContentLoaded", async () => {
  const st = await load();
  el("apiBase").value = st.apiBase || "";
  el("email").value = st.email || "";
  el("includeGeneral").checked = !!st.includeGeneral;
  el("defaultTime").value = st.defaultTime || "23:59";
  if (st.icsUrl) { el("icsLink").textContent = st.icsUrl; el("icsLink").href = st.icsUrl; }

  el("btnRegister").onclick = async () => {
    try{
      const base = el("apiBase").value.trim();
      const email = el("email").value.trim();
      const password = el("password").value;
      const j = await api(base, "/auth/register", "POST", {email, password});
      await save({apiBase: base, email, accessToken: j.access_token});
      setStatus("Signed up ✔", true);
      refreshIcsLink();
    }catch(e){ setStatus(e.message, false); }
  };

  el("btnLogin").onclick = async () => {
    try{
      const base = el("apiBase").value.trim();
      const email = el("email").value.trim();
      const password = el("password").value;
      const j = await api(base, "/auth/login", "POST", {email, password});
      await save({apiBase: base, email, accessToken: j.access_token});
      setStatus("Logged in ✔", true);
      refreshIcsLink();
    }catch(e){ setStatus(e.message, false); }
  };

  el("btnTest").onclick = async () => {
    try{
      const {apiBase} = await load();
      const j = await api(apiBase, "/health");
      setStatus(`OK ${JSON.stringify(j)}`, true);
    }catch(e){ setStatus(e.message, false); }
  };

  el("includeGeneral").onchange = async () => save({includeGeneral: el("includeGeneral").checked});
  el("defaultTime").onchange = async () => save({defaultTime: el("defaultTime").value});
  el("apiBase").onchange = async () => save({apiBase: el("apiBase").value.trim()});
  el("email").onchange = async () => save({email: el("email").value.trim()});

  refreshIcsLink();
});
