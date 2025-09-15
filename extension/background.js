// Set default API base when the extension is installed (so users never type it)
chrome.runtime.onInstalled.addListener(async () => {
  const st = await chrome.storage.sync.get(["apiBase"]);
  if (!st.apiBase) {
    await chrome.storage.sync.set({ apiBase: "https://studysync-tyz6.onrender.com" });
  }
});

function notify(msg) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title: "StudySync",
    message: msg
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  // Ask the content script to scrape, then we push the results
  try {
    const prefs = await chrome.storage.sync.get(["defaultTime", "includeGeneral"]);
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE", prefs });
    if (!resp || !resp.ok) {
      notify("No dated items found on this page.\nOpen Calendar → List (or Assignments/Quizzes) and click again.");
      return;
    }
    const items = resp.items || [];
    if (items.length === 0) {
      notify("No dated items found here.");
      return;
    }
    const st = await chrome.storage.sync.get(["apiBase", "accessToken"]);
    if (!st.apiBase || !st.accessToken) {
      notify("Please open Options and Sign up / Login first.");
      return;
    }
    const r = await fetch(`${st.apiBase}/assignments/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${st.accessToken}`
      },
      body: JSON.stringify(items)
    });
    if (!r.ok) throw new Error(await r.text());
    notify(`Synced ${items.length} item(s) ✅`);
  } catch (e) {
    notify("Open Assignments/Quizzes/Calendar (List) in Brightspace and click the icon again.");
  }
});
